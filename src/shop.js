// Bloom Rush — counters (stock), customers (queue + serving) and cash piles.
import * as THREE from 'three';
import { FARMS, SHOP, SIZES, bouquetPrice } from './config.js';
import { makeCharacter, animateCharacter, randomCustomerLook, makeBillGeometry, getSharedMaterial } from './models.js';
import { bouquetGeo } from './stack.js';

const STOCK_COL_Z = [-1.25, -0.75, -0.25, 0.25];   // counter-local z of the stock columns
const PILE_COLS = 3, PILE_ROWS = 4;
const POOL = 14;
const EXTRA_LINE = 3;               // customers queued beyond the marked queue slots
const LEAVE_TIME = 0.65;            // walk away this long, then shrink
const LOD_SHOW = 27;                // customers further than this from the player are not drawn
const LOD_SHADOW = 19;              // ... and further than this cast no shadow
const SHRINK_TIME = 0.22;
const SPAWN_TIME = 0.25;
const POP_TIME = 0.25;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const HELD_Q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0.8, 0.6).normalize());

let billGeo = null;
function getBillGeo() { return billGeo || (billGeo = makeBillGeometry()); }

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

export function createShops(G) {
  const shops = FARMS.map((farm, i) => makeShop(G, farm, i));
  G.events.on('unlock', ({ effect } = {}) => {
    if (effect && effect.type === 'farm' && shops[effect.farm]) shops[effect.farm].activate(true);
  });
  return {
    get(i) { return shops[i] || null; },
    all: shops,
    update(dt) { for (let i = 0; i < shops.length; i++) shops[i].update(dt); },
  };
}

function makeShop(G, farm, f) {
  const S = G.state;
  const dir = farm.counter.dir;
  const cx = farm.counter.x, cz = farm.counter.z;
  const type = farm.flower;
  const topY = SIZES.counter.h;
  const maxStock = SHOP.maxVisibleStock;
  const perCol = SHOP.stockPerColumn;
  const step = SIZES.bouquetStep;

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
    slotX[i] = cx + dir * lx;
    slotZ[i] = cz + dir * lz;
    slotY[i] = topY + row * step;
    slotYaw[i] = (dir > 0 ? 0 : Math.PI) + hash(i, 3) * 0.1;
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
  const maxBills = SHOP.maxVisibleBills;
  const pileX = new Float32Array(maxBills), pileY = new Float32Array(maxBills), pileZ = new Float32Array(maxBills);
  const pileYaw = new Float32Array(maxBills);
  const perLayer = PILE_COLS * PILE_ROWS;
  for (let i = 0; i < maxBills; i++) {
    const layer = (i / perLayer) | 0;
    const j = i - layer * perLayer;
    const c = j % PILE_COLS, r = (j / PILE_COLS) | 0;
    pileX[i] = farm.cashPile.x + (c - (PILE_COLS - 1) / 2) * 0.72 + hash(i, 4) * 0.03;
    pileZ[i] = farm.cashPile.z + (r - (PILE_ROWS - 1) / 2) * 0.42 + hash(i, 5) * 0.03;
    pileY[i] = layer * SIZES.billStep;
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
  const maxLine = SHOP.queueSlots + EXTRA_LINE;
  const laneX = farm.customerIn[farm.customerIn.length - 1].x;
  const laneZ = farm.customerIn[farm.customerIn.length - 1].z;
  // per-step timers live on an object (closure doubles would allocate a heap number per write)
  const T = { spawnT: 0.5, serveT: 1.5, lodT: 0.5 };
  let lodShow = true, lodShadow = true;

  function slotPos(i, out) {
    if (i < farm.queue.length) { out.x = farm.queue[i].x; out.z = farm.queue[i].z; return out; }
    const q0 = farm.queue[0], q1 = farm.queue[1];
    out.x = q0.x + (q1.x - q0.x) * i;
    out.z = q0.z + (q1.z - q0.z) * i;
    return out;
  }
  const tmpSlot = { x: 0, z: 0 };

  function makeCustomer() {
    const char = makeCharacter(randomCustomerLook());
    const base = char.scale.x || 1;
    const bq = new THREE.Mesh(bouquetGeo(type), getSharedMaterial());
    bq.castShadow = true;
    bq.position.set(0, 0.95, 0.38);
    bq.quaternion.copy(HELD_Q);
    bq.visible = false;
    char.add(bq);
    char.visible = false;
    G.scene.add(char);
    const c = {
      char, bq, base,
      state: 0,          // 0 off, 1 in line, 2 leaving
      phase: 0,          // line: 0 walking to the lane point, 1 to the slot
      x: 0, z: 0, yaw: 0, spd: 0,
      wp: 0, t: 0, life: 0,
      gotBouquet: null,
    };
    c.gotBouquet = () => {
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
    c.yaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    if (!instant) c.yaw = 0;
    c.bq.visible = false;
    c.char.visible = true;
    c.char.position.set(x, 0, z);
    c.char.rotation.y = c.yaw;
    c.char.scale.setScalar(instant ? c.base : 0.001);
    line.push(c);
    return c;
  }

  function moveToward(c, tx, tz, speed, dt) {
    const dx = tx - c.x, dz = tz - c.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) { c.spd = 0; return 0; }
    const stepLen = Math.min(d, speed * dt);
    c.x += (dx / d) * stepLen;
    c.z += (dz / d) * stepLen;
    c.spd = stepLen / dt;
    if (d > 0.05) c.yaw = angLerp(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 14));
    return d - stepLen;
  }

  // ---------------------------------------------------------------- shop api
  const shop = {
    farmIdx: f,
    active: false,
    get stock() { return S.stock[f]; },
    set stock(v) { S.stock[f] = v; stockDirty = true; },
    get cash() { return S.cash[f]; },
    dropTarget, deposit, takeCash, pileTop, bundleValue, activate, update,
    get lineLength() { return line.length; },
    sold: 0,
  };

  function dropTarget(out) {
    const i = Math.min(S.stock[f], maxStock - 1);
    return out.set(slotX[i], slotY[i] + 0.05, slotZ[i]);
  }

  function deposit(typeIdx, n = 1) {
    S.stock[f] += n;
    stockDirty = true;
  }

  function bundleValue() {
    return Math.max(1, bouquetPrice(type, G.stats) * 1.5);
  }

  function pileTop(out) {
    const i = Math.max(0, pileShown - 1);
    return out.set(pileX[i], pileY[i] + SIZES.billStep, pileZ[i]);
  }

  function takeCash(max) {
    const n = Math.max(0, Math.min(S.cash[f], max));
    S.cash[f] -= n;
    pileDirty = true;
    return n;
  }

  function onBillLanded() {
    if (flightHead !== flightTail) {
      flightSum -= flightAmt[flightHead];
      flightHead = (flightHead + 1) & 127;
      if (flightSum < 0.5) flightSum = Math.max(0, flightSum);
    }
    pileDirty = true;
  }

  function activate(live) {
    if (shop.active) return;
    shop.active = true;
    stockMesh = new THREE.InstancedMesh(bouquetGeo(type), getSharedMaterial(), maxStock);
    stockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stockMesh.castShadow = true;
    stockMesh.count = 0;
    stockMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, topY + 5, cz), 7);
    for (let i = 0; i < maxStock; i++) writeStockSlot(i, 1);
    G.scene.add(stockMesh);

    pileMesh = new THREE.InstancedMesh(getBillGeo(), getSharedMaterial(), maxBills);
    pileMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    pileMesh.castShadow = true;
    pileMesh.count = 0;
    pileMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(farm.cashPile.x, 0.5, farm.cashPile.z), 2.2);
    for (let i = 0; i < maxBills; i++) writePileSlot(i, 1);
    G.scene.add(pileMesh);

    for (let i = 0; i < POOL; i++) pool.push(makeCustomer());
    // pre-fill the queue so there is never a wait
    for (let i = 0; i < maxLine; i++) {
      slotPos(i, tmpSlot);
      const c = spawn(tmpSlot.x, tmpSlot.z, 1, !live);
      if (c && live) c.t = -i * 0.06 - 0.4; // staggered pop-in after the farm appears
    }
    stockShown = 0; pileShown = 0;
    stockDirty = pileDirty = true;
  }

  // ----------------------------------------------------------------- serving
  const fromV = new THREE.Vector3();
  const toV = new THREE.Vector3();
  const pileFn = (o) => pileTop(o);

  function sell(c) {
    const cashier = !!G.stats.cashier[f];
    const cfg = cashier ? SHOP.serve.cashier : SHOP.serve.self;
    const n = Math.min(cfg.batch, S.stock[f]);
    if (n <= 0) return;
    const visBefore = Math.min(S.stock[f], maxStock);
    S.stock[f] -= n;
    stockDirty = true;
    shop.sold += n;
    const amount = n * bouquetPrice(type, G.stats);
    S.cash[f] += amount;
    const fx = G.fx;
    // bouquets fly to the customer
    if (fx && fx.fly) {
      const flyers = Math.min(n, 3);
      if (c) toV.set(c.x, 1.1, c.z); else { slotPos(0, tmpSlot); toV.set(tmpSlot.x, 1.1, tmpSlot.z); }
      for (let k = 0; k < flyers; k++) {
        const si = Math.max(0, visBefore - 1 - k);
        fromV.set(slotX[si], slotY[si] + 0.1, slotZ[si]);
        fx.fly({ kind: 'bouquet', type, from: fromV, to: toV, dur: 0.22 + k * 0.04, arc: 0.9, onDone: k === 0 && c ? c.gotBouquet : null });
      }
      // money flies to the pile
      if (((flightTail + 1) & 127) !== flightHead) {
        flightAmt[flightTail] = amount;
        flightTail = (flightTail + 1) & 127;
        flightSum += amount;
        fromV.set(cx + dir * 0.2, topY + 0.3, cz + dir * 0.9);
        fx.fly({ kind: 'bill', from: fromV, to: pileFn, dur: 0.38, arc: 1.3, onDone: onBillLanded });
      }
    } else if (c) {
      c.bq.visible = true;
    }
    if (G.audio && G.audio.play) G.audio.play('sell', { pos: farm.counter });
    G.events.emit('sale', { farmIdx: f, amount });
  }

  function serveFront(dt) {
    const cashier = !!G.stats.cashier[f];
    const cfg = cashier ? SHOP.serve.cashier : SHOP.serve.self;
    const pl = G.player && G.player.pos;
    let playerIn = false;
    if (pl) {
      const dx = pl.x - farm.sellZone.x, dz = pl.z - farm.sellZone.z;
      playerIn = dx * dx + dz * dz <= farm.sellZone.r * farm.sellZone.r;
    }
    const can = S.stock[f] > 0 && (playerIn || cashier);
    if (!can) { if (T.serveT > cfg.interval) T.serveT = cfg.interval; return; }
    T.serveT += dt;
    let guard = 8;
    while (T.serveT >= cfg.interval && S.stock[f] > 0 && guard-- > 0) {
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
      slotPos(4, tmpSlot);
      const d = Math.hypot(G.player.pos.x - tmpSlot.x, G.player.pos.z - tmpSlot.z);
      lodShow = d < LOD_SHOW;
      const sh = d < LOD_SHADOW;
      if (sh !== lodShadow) {
        lodShadow = sh;
        for (let i = 0; i < pool.length; i++) pool[i].char.traverse((o) => { if (o.isMesh) o.castShadow = sh; });
      }
    }
    const speed = SHOP.customerSpeed;
    const faceCounter = dir > 0 ? -Math.PI / 2 : Math.PI / 2;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (c.state === 0) continue;
      c.t += dt;
      let moving = false;
      let scale = 1;
      if (c.t < 0) { c.char.visible = false; continue; }
      c.char.visible = lodShow;
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
        const out = farm.customerOut;
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
      if (!lodShow) continue;
      c.char.position.set(c.x, 0, c.z);
      c.char.rotation.y = c.yaw;
      c.char.scale.setScalar(Math.max(0.001, scale * c.base));
      animateCharacter(c.char, dt, { moving, speed: Math.max(0.6, c.spd / speed), carrying: false, action: null });
    }
  }

  function updateMeshes(dt) {
    // stock
    const want = Math.min(S.stock[f], maxStock);
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
    // cash pile
    if (pileDirty || pileAnimating) {
      pileDirty = false;
      const shownCash = Math.max(0, S.cash[f] - flightSum);
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
    if (!shop.active) return;
    serveFront(dt);
    updateCustomers(dt);
    updateMeshes(dt);
  }

  if (G.stats.farms[f]) activate(false);
  return shop;
}
