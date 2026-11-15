// Station type 'shop': a counter that holds stock, a queue of customers who buy it, and
// a cash pile where the sales money lands. Capabilities: drop zone + cash pile.
// Port of the original shop.js. Each item keeps its own value wherever it is sold
// (stockValue is the summed base value of everything on the counter).
//
// def = {
//   id, type: 'shop', name, open,
//   accepts: ['rose', 'tulip'] | '*',            // kinds players/workers may drop here ('*' = any but cash)
//   display: 'rose',                              // kind drawn on the counter and in customers' hands
//   counter: { x, z, yaw, len: 3.4, depth: 1.2, h: 1.0 },  // local +X = customer side, long axis local Z
//   dropZone: { x, z, r },                        // stand here to unload (and to serve, until a cashier is hired)
//   cashPile: { x, z, r },                        // sales money lands here
//   queue: [{x, z}, ...],                         // queue[0] is served; extra customers line up beyond the last two
//   customerIn: [{x, z}, ...],                    // the last point is where new customers appear / join the line
//   customerOut: [{x, z}, ...],                   // walk-off path after buying
//   cashierSpot: { x, z }, workerSpot: { x, z }, vehicleSpot: { x, z },   // where staff stand
//   stockColumns: [-1.25, -0.75, -0.25, 0.25],    // counter-local z of the stock columns
//   serve: { self: { interval, batch }, staffed: { interval, batch } },  // optional overrides
//   staffRole: 'cashier',                         // hire role that makes it serve on its own
// }
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { SHOP } from '../config.js';
import { CASH } from '../art/props.js';
import { itemGeometry, itemMaterial, itemValue } from '../items.js';
import { makeCharacter, animateCharacter, randomCustomerLook, onScreen } from '../chars.js';

const PILE_COLS = 3, PILE_ROWS = 4;
const LEAVE_TIME = 0.65;            // walk away this long, then shrink
const LOD_SHOW = 27;                // customers further than this from the player are not drawn
const LOD_SHADOW = 19;              // ... and further than this cast no shadow
const LOD_ANIM = 21;                // ... and further than this are not animated (frozen pose)
const SHRINK_TIME = 0.22;
const SPAWN_TIME = 0.25;
const POP_TIME = 0.25;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HELD_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.8, 0.6).normalize());

function hash(i, s) {
  const x = Math.sin(i * 91.7 + s * 47.3) * 24634.6345;
  return (x - Math.floor(x)) * 2 - 1;
}
function angLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
function popScale(u) { return 0.4 + 0.6 * u + Math.sin(u * Math.PI) * 0.45; }
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function createShop(G, def) {
  const C = { len: 3.4, depth: 1.2, h: 1.0, yaw: 0, ...def.counter };
  const cx = C.x, cz = C.z, topY = C.h;
  const cosY = Math.cos(C.yaw), sinY = Math.sin(C.yaw);
  // counter-local (lx, lz) -> world
  const wx = (lx, lz) => cx + lx * cosY + lz * sinY;
  const wz = (lx, lz) => cz - lx * sinY + lz * cosY;
  const faceCounter = Math.atan2(-cosY, sinY);   // customers look toward local -X
  const serveCfg = { self: { ...SHOP.serve.self, ...(def.serve && def.serve.self) }, staffed: { ...SHOP.serve.staffed, ...(def.serve && def.serve.staffed) } };
  const staffRole = def.staffRole || 'cashier';
  const display = def.display || (Array.isArray(def.accepts) ? def.accepts[0] : null);
  const displayIt = getItem(display);
  if (!displayIt) throw new Error(`shop '${def.id}': display item '${display}' is not registered`);
  const acceptSet = def.accepts === '*' ? null : new Set(def.accepts || [display]);
  const accepts = (kind) => kind !== 'cash' && (acceptSet ? acceptSet.has(kind) : !!getItem(kind));
  const step = displayIt.step;
  const maxStock = SHOP.maxVisibleStock;
  const perCol = SHOP.stockPerColumn;
  const STOCK_COL_Z = def.stockColumns || [-1.25, -0.75, -0.25, 0.25];
  const queue = def.queue;
  const maxLine = queue.length + (def.extraLine ?? SHOP.extraLine);
  const speed = def.customerSpeed || SHOP.customerSpeed;

  // persistent state
  let stock = 0, stockValue = 0, cash = 0;
  let pending = 0, pendingValue = 0;   // items flying toward the counter (saved as stock)

  // ------------------------------------------------------------- stock mesh
  const slotX = new Float32Array(maxStock), slotY = new Float32Array(maxStock), slotZ = new Float32Array(maxStock);
  const slotYaw = new Float32Array(maxStock);
  const nCols = STOCK_COL_Z.length;
  for (let i = 0; i < maxStock; i++) {
    const layer = (i / (perCol * nCols)) | 0;             // after all columns are full, keep growing upward
    const j = i - layer * perCol * nCols;
    const col = (j / perCol) | 0;
    const row = j - col * perCol + layer * perCol;
    const lx = hash(i, 1) * 0.03, lz = STOCK_COL_Z[col] + hash(i, 2) * 0.025;
    slotX[i] = wx(lx, lz);
    slotZ[i] = wz(lx, lz);
    slotY[i] = topY + row * step;
    slotYaw[i] = C.yaw + hash(i, 3) * 0.1;
  }
  let stockMesh = null;
  const stockPop = new Float32Array(maxStock).fill(1);
  let stockShown = 0;
  let stockDirty = true;
  let stockAnimating = false;

  function writeStockSlot(i, s) {
    _p.set(slotX[i], slotY[i], slotZ[i]);
    _q.setFromAxisAngle(UP, slotYaw[i]);
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    stockMesh.setMatrixAt(i, _m);
  }

  // ---------------------------------------------------------------- cash pile
  const pile = def.cashPile;
  const maxBills = SHOP.maxVisibleBills;
  const pileX = new Float32Array(maxBills), pileY = new Float32Array(maxBills), pileZ = new Float32Array(maxBills);
  const pileYaw = new Float32Array(maxBills);
  const perLayer = PILE_COLS * PILE_ROWS;
  for (let i = 0; i < maxBills; i++) {
    const layer = (i / perLayer) | 0;
    const j = i - layer * perLayer;
    const c = j % PILE_COLS, r = (j / PILE_COLS) | 0;
    pileX[i] = pile.x + (c - (PILE_COLS - 1) / 2) * 0.72 + hash(i, 4) * 0.03;
    pileZ[i] = pile.z + (r - (PILE_ROWS - 1) / 2) * 0.42 + hash(i, 5) * 0.03;
    pileY[i] = layer * CASH.h;
    pileYaw[i] = hash(i, 6) * 0.09;
  }
  let pileMesh = null;
  const pilePop = new Float32Array(maxBills).fill(1);
  let pileShown = 0;
  let pileDirty = true;
  let pileAnimating = false;
  // cash still flying from the counter to the pile (FIFO, so arrivals match sales)
  const flightAmt = new Float64Array(128);
  let flightHead = 0, flightTail = 0, flightSum = 0;

  function writePileSlot(i, s) {
    _p.set(pileX[i], pileY[i], pileZ[i]);
    _q.setFromAxisAngle(UP, pileYaw[i]);
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    pileMesh.setMatrixAt(i, _m);
  }

  // ---------------------------------------------------------------- customers
  const pool = [];
  const line = [];
  const lane = def.customerIn[def.customerIn.length - 1];
  const laneX = lane.x, laneZ = lane.z;
  // per-step timers live on an object (closure doubles would allocate a heap number per write)
  const T = { spawnT: 0.5, serveT: 1.5, lodT: 0.5, visT: 0 };
  let lodShow = true, lodShadow = true, lodAnim = false;

  function slotPos(i, out) {
    if (i < queue.length) { out.x = queue[i].x; out.z = queue[i].z; return out; }
    const q0 = queue[0], q1 = queue[1] || queue[0];
    out.x = q0.x + (q1.x - q0.x) * i;
    out.z = q0.z + (q1.z - q0.z) * i;
    return out;
  }
  const tmpSlot = { x: 0, z: 0 };

  function makeCustomer() {
    const char = makeCharacter(randomCustomerLook());
    const base = char.scale.x || 1;
    const bq = new THREE.Mesh(itemGeometry(displayIt), itemMaterial(displayIt));
    bq.castShadow = true;
    // held in both arms: parented to the character's chest anchor (follows the torso bone)
    bq.position.set(0, -0.02, 0.1);
    bq.quaternion.copy(HELD_Q);
    bq.visible = false;
    (char.userData.front || char).add(bq);
    char.visible = false;
    G.scene.add(char);
    const c = {
      char, bq, base, vis: true,
      state: 0,          // 0 off, 1 in line, 2 leaving
      phase: 0,          // line: 0 walking to the lane point, 1 to the slot
      x: 0, z: 0, yaw: 0, spd: 0,
      wp: 0, t: 0, life: 0,
      gotItem: null,
      anim: { moving: false, speed: 1, carrying: false, action: null },
    };
    c.gotItem = () => {
      if (c.state !== 2) return;
      c.bq.visible = true;
      if (G.fx && G.fx.pop) G.fx.pop(c.bq, { scale: 1.4, dur: 0.25 });
    };
    return c;
  }

  function spawn(x, z, phase, instant) {
    let c = null;
    for (let i = 0; i < pool.length; i++) if (pool[i].state === 0) { c = pool[i]; break; }
    if (!c) return null;
    c.state = 1; c.phase = phase; c.x = x; c.z = z; c.t = instant ? SPAWN_TIME : 0; c.life = 0; c.spd = 0;
    c.yaw = instant ? faceCounter : 0;
    c.bq.visible = false;
    c.char.visible = true;
    c.char.position.set(x, 0, z);
    c.char.rotation.y = c.yaw;
    c.char.scale.setScalar(instant ? c.base : 0.001);
    line.push(c);
    return c;
  }

  function moveToward(c, tx, tz, spd, dt) {
    const dx = tx - c.x, dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) { c.spd = 0; return 0; }
    const stepLen = Math.min(d, spd * dt);
    c.x += (dx / d) * stepLen;
    c.z += (dz / d) * stepLen;
    c.spd = stepLen / dt;
    if (d > 0.05) c.yaw = angLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14));
    return d - stepLen;
  }

  // ------------------------------------------------------------ capabilities
  const counterPos = { x: cx, z: cz };
  const drop = {
    zone: def.dropZone,
    accepts,
    face: counterPos,
    workerSpot: def.workerSpot || null,
    vehicleSpot: def.vehicleSpot || null,
    room() { return Infinity; },
    /** Where an item handed in now should fly to (the next free stock slot). */
    target(out) {
      const i = Math.min(stock + pending, maxStock - 1);
      return out.set(slotX[i], slotY[i] + 0.05, slotZ[i]);
    },
    /** An item of `kind` was launched toward the counter (counts as stock in saves). */
    expect(kind) { pending++; pendingValue += itemValue(kind); },
    /** An item of `kind` arrived (call expect first if it flew). */
    give(kind) {
      const v = itemValue(kind);
      stock++;
      stockValue += v;
      if (pending > 0) { pending--; pendingValue = Math.max(0, pendingValue - v); }
      stockDirty = true;
    },
  };

  function bundleValue() { return Math.max(1, displayIt.value * G.stats.priceMult * 1.5); }
  function pileTop(out) {
    const i = Math.max(0, pileShown - 1);
    return out.set(pileX[i], pileY[i] + CASH.h, pileZ[i]);
  }
  const cashCap = {
    pile,
    get amount() { return cash; },
    take(max) {
      const n = Math.max(0, Math.min(cash, max));
      cash -= n;
      pileDirty = true;
      return n;
    },
    top: pileTop,
    bundleValue,
  };

  const hw = Math.abs(cosY) * C.depth / 2 + Math.abs(sinY) * C.len / 2;
  const hl = Math.abs(sinY) * C.depth / 2 + Math.abs(cosY) * C.len / 2;

  const station = {
    pos: counterPos,
    name: def.name || 'SELL',
    active: false,
    drop,
    cash: cashCap,
    blockers: [{ x: cx, z: cz, hx: hw, hz: hl }],
    counter: C,
    // where a hired cashier stands, facing the customers
    staffSpot: def.cashierSpot ? { x: def.cashierSpot.x, z: def.cashierSpot.z, yaw: C.yaw + Math.PI / 2 } : null,
    get stock() { return stock; },
    get lineLength() { return line.length; },
    sold: 0,
    get pending() { return pending; },
    activate, update,
    serialize() {
      // items still flying to the counter are saved as stock
      return { stock: stock + pending, value: Math.round((stockValue + pendingValue) * 100) / 100, cash: Math.round(cash * 100) / 100 };
    },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      stock = isNum(d.stock) && d.stock > 0 ? Math.floor(d.stock) : 0;
      stockValue = isNum(d.value) && d.value >= 0 ? d.value : stock * displayIt.value;
      if (stock === 0) stockValue = 0;
      cash = isNum(d.cash) && d.cash > 0 ? d.cash : 0;
      stockDirty = pileDirty = true;
    },
  };

  function onBillLanded() {
    if (flightHead !== flightTail) {
      flightSum -= flightAmt[flightHead];
      flightHead = (flightHead + 1) & 127;
      if (flightSum < 0.5) flightSum = Math.max(0, flightSum);
    }
    pileDirty = true;
  }

  function activate(live) {
    stockMesh = new THREE.InstancedMesh(itemGeometry(displayIt), itemMaterial(displayIt), maxStock);
    stockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stockMesh.castShadow = false;   // up to 160 bouquets: a real shadow would double the cost; the stack is shaded by baked AO
    stockMesh.count = 0;
    stockMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, topY + 5, cz), 7);
    for (let i = 0; i < maxStock; i++) writeStockSlot(i, 1);
    G.scene.add(stockMesh);

    pileMesh = new THREE.InstancedMesh(itemGeometry('cash'), itemMaterial('cash'), maxBills);
    pileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pileMesh.castShadow = false;   // 40 chunky bundles: the baked AO grounds them, a real shadow would double the cost
    pileMesh.count = 0;
    pileMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(pile.x, 0.5, pile.z), 2.2);
    for (let i = 0; i < maxBills; i++) writePileSlot(i, 1);
    G.scene.add(pileMesh);

    const nPool = def.customerPool || SHOP.customerPool;
    for (let i = 0; i < nPool; i++) pool.push(makeCustomer());
    // pre-fill the queue so there is never a wait
    for (let i = 0; i < maxLine; i++) {
      slotPos(i, tmpSlot);
      const c = spawn(tmpSlot.x, tmpSlot.z, 1, !live);
      if (c && live) c.t = -i * 0.06 - 0.4; // staggered pop-in after the shop appears
    }
    stockShown = 0; pileShown = 0;
    stockDirty = pileDirty = true;
  }

  // ----------------------------------------------------------------- serving
  const fromV = new THREE.Vector3();
  const toV = new THREE.Vector3();
  const pileFn = (o) => pileTop(o);
  const flyOpts = { kind: display, from: fromV, to: toV, dur: 0.22, arc: 0.9, onDone: null };
  const billOpts = { kind: 'cash', from: fromV, to: pileFn, dur: 0.38, arc: 1.3, onDone: onBillLanded };
  const sale = { station: station, stationId: def.id, amount: 0 };   // reused 'sale' payload
  const soundOpts = { pos: counterPos };

  function staffed() {
    const s = G.stats.staff[def.id];
    return !!(s && s[staffRole]);
  }

  function sell(c) {
    const cfg = staffed() ? serveCfg.staffed : serveCfg.self;
    const n = Math.min(cfg.batch, stock);
    if (n <= 0) return;
    const visBefore = Math.min(stock, maxStock);
    const each = stockValue > 0 ? stockValue / stock : displayIt.value;
    stock -= n;
    stockValue = stock > 0 ? Math.max(0, stockValue - n * each) : 0;
    stockDirty = true;
    station.sold += n;
    const amount = Math.max(1, Math.round(n * each * G.stats.priceMult));
    cash += amount;
    const fx = G.fx;
    if (fx && fx.fly) {
      // items fly to the customer
      const flyers = Math.min(n, 3);
      if (c) toV.set(c.x, 1.1, c.z); else { slotPos(0, tmpSlot); toV.set(tmpSlot.x, 1.1, tmpSlot.z); }
      for (let k = 0; k < flyers; k++) {
        const si = Math.max(0, visBefore - 1 - k);
        fromV.set(slotX[si], slotY[si] + 0.1, slotZ[si]);
        flyOpts.dur = 0.22 + k * 0.04;
        flyOpts.onDone = k === 0 && c ? c.gotItem : null;
        fx.fly(flyOpts);
      }
      // money flies to the pile
      if (((flightTail + 1) & 127) !== flightHead) {
        flightAmt[flightTail] = amount;
        flightTail = (flightTail + 1) & 127;
        flightSum += amount;
        fromV.set(wx(0.2, 0.9), topY + 0.3, wz(0.2, 0.9));
        fx.fly(billOpts);
      }
    } else if (c) {
      c.bq.visible = true;
    }
    if (G.audio && G.audio.play) G.audio.play('sell', soundOpts);
    sale.amount = amount;
    G.events.emit('sale', sale);
  }

  function serveFront(dt) {
    const isStaffed = staffed();
    const cfg = isStaffed ? serveCfg.staffed : serveCfg.self;
    const pl = G.player && G.player.pos;
    let playerIn = false;
    if (pl) {
      const z = def.dropZone;
      const dx = pl.x - z.x, dz = pl.z - z.z;
      playerIn = dx * dx + dz * dz <= z.r * z.r;
    }
    const can = stock > 0 && (playerIn || isStaffed);
    if (!can) { if (T.serveT > cfg.interval) T.serveT = cfg.interval; return; }
    T.serveT += dt;
    let guard = 8;
    while (T.serveT >= cfg.interval && stock > 0 && guard-- > 0) {
      const front = line.length ? line[0] : null;
      let ok = T.serveT >= cfg.interval * 2;
      if (front) {
        slotPos(0, tmpSlot);
        const d = Math.hypot(front.x - tmpSlot.x, front.z - tmpSlot.z);
        if (d < 1.3 && front.t >= SPAWN_TIME * 0.5) ok = true;
      }
      if (!ok) break;
      T.serveT -= cfg.interval;
      if (T.serveT > cfg.interval) T.serveT = cfg.interval; // never bank more than one late sale
      if (front) {
        line.shift();
        front.state = 2; front.wp = 0; front.life = 0;
      }
      sell(front);
    }
  }

  // ------------------------------------------------------------------ update
  function updateCustomers(dt) {
    // keep the line full
    if (line.length < maxLine) {
      T.spawnT -= dt;
      if (T.spawnT <= 0) {
        const c = spawn(laneX, laneZ - 0.8 - Math.random() * 0.6, 0, false);
        T.spawnT = c ? 0.04 + Math.random() * 0.1 : 0.1;
      }
    } else T.spawnT = Math.min(T.spawnT, 0.05);

    T.lodT -= dt;
    if (T.lodT <= 0 && G.player) {
      T.lodT = 0.3;
      slotPos(Math.min(4, maxLine - 1), tmpSlot);
      const d = Math.hypot(G.player.pos.x - tmpSlot.x, G.player.pos.z - tmpSlot.z);
      lodShow = d < LOD_SHOW;
      lodAnim = d > LOD_ANIM;
      const sh = d < LOD_SHADOW;
      if (sh !== lodShadow) {
        lodShadow = sh;
        for (let i = 0; i < pool.length; i++) pool[i].char.traverse((o) => { if (o.isMesh) o.castShadow = sh; });
      }
    }
    // customers outside the view are not drawn at all (skinned meshes are never frustum-culled)
    if (T.visT <= 0) {
      T.visT = 0.15;
      for (let i = 0; i < pool.length; i++) { const c = pool[i]; c.vis = lodShow && onScreen(G, c.x, 0.9, c.z); }
    }
    T.visT -= dt;
    const out = def.customerOut;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (c.state === 0) continue;
      c.t += dt;
      let moving = false;
      let scale = 1;
      if (c.t < 0) { c.char.visible = false; continue; }
      c.char.visible = c.vis;
      if (c.t < SPAWN_TIME) scale = popScale(c.t / SPAWN_TIME);
      if (c.state === 1) {
        const idx = line.indexOf(c);
        if (c.phase === 0) {
          const rem = moveToward(c, laneX, laneZ, speed, dt);
          moving = true;
          if (rem < 0.3) c.phase = 1;
          // if the slot is already closer than the lane point, go straight there
          slotPos(idx, tmpSlot);
          if (Math.abs(tmpSlot.x - c.x) < Math.abs(laneX - c.x) - 0.5 && Math.abs(laneZ - c.z) < 0.6) c.phase = 1;
        } else {
          slotPos(idx, tmpSlot);
          const rem = moveToward(c, tmpSlot.x, tmpSlot.z, speed * (idx === 0 ? 1.15 : 1), dt);
          moving = c.spd > 0.2;
          if (rem < 0.05) c.yaw = angLerp(c.yaw, faceCounter, Math.min(1, dt * 12));
        }
      } else if (c.state === 2) {
        c.life += dt;
        if (c.wp < out.length) {
          const rem = moveToward(c, out[c.wp].x, out[c.wp].z, speed, dt);
          if (rem < 0.2) c.wp++;
        }
        moving = true;
        if (c.life > LEAVE_TIME) {
          const u = (c.life - LEAVE_TIME) / SHRINK_TIME;
          if (u >= 1) {
            c.state = 0; c.char.visible = false; c.bq.visible = false;
            continue;
          }
          scale = 1 - u * u;
        }
      }
      if (!c.vis) continue;
      c.char.position.set(c.x, 0, c.z);
      c.char.rotation.y = c.yaw;
      c.char.scale.setScalar(Math.max(0.001, scale * c.base));
      const an = c.anim;
      an.moving = moving; an.speed = Math.max(0.6, c.spd / speed);
      an.carrying = c.bq.visible;
      c.char.userData.lod = lodAnim;
      animateCharacter(c.char, dt, an);
    }
  }

  function updateMeshes(dt) {
    const want = Math.min(stock, maxStock);
    if (stockDirty || stockAnimating) {
      stockDirty = false;
      if (want > stockShown) for (let i = stockShown; i < want; i++) stockPop[i] = 0;
      stockShown = want;
      stockMesh.count = want;
      stockAnimating = false;
      const from = Math.max(0, want - 10);
      let changed = false;
      for (let i = from; i < want; i++) {
        if (stockPop[i] < 1) {
          stockPop[i] = Math.min(1, stockPop[i] + dt / POP_TIME);
          writeStockSlot(i, popScale(stockPop[i]));
          changed = true;
          if (stockPop[i] < 1) stockAnimating = true;
        }
      }
      if (changed) stockMesh.instanceMatrix.needsUpdate = true;
    }
    if (pileDirty || pileAnimating) {
      pileDirty = false;
      const shownCash = Math.max(0, cash - flightSum);
      const pw = Math.max(0, Math.min(maxBills, Math.ceil(shownCash / bundleValue() - 1e-6)));
      if (pw > pileShown) for (let i = pileShown; i < pw; i++) pilePop[i] = 0;
      pileShown = pw;
      pileMesh.count = pw;
      pileAnimating = false;
      let changed = false;
      for (let i = Math.max(0, pw - 16); i < pw; i++) {
        if (pilePop[i] < 1) {
          pilePop[i] = Math.min(1, pilePop[i] + dt / POP_TIME);
          writePileSlot(i, popScale(pilePop[i]));
          changed = true;
          if (pilePop[i] < 1) pileAnimating = true;
        }
      }
      if (changed) pileMesh.instanceMatrix.needsUpdate = true;
    }
  }

  function update(dt) {
    if (!station.active) return;
    serveFront(dt);
    updateCustomers(dt);
    updateMeshes(dt);
  }

  return station;
}

registerStationType('shop', { create: createShop, describe: 'counter + customer queue + cash pile; drop zone and cash pile' });
