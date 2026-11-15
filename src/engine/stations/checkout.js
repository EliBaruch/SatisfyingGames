// Station type 'checkout' and the shopper population (grocery customer flow).
//
// Shoppers enter along `shoppers.entrance`, visit 1-3 shelves that have stock (walk to the
// shelf's browse point, take 1-N items into a basket, short pause), queue at the checkout
// with the shortest line, pay, and leave along the checkout's `exit` then `shoppers.exit`.
// Several checkouts share one population; shelves and checkouts opened later by pads join
// automatically. Serving: while the player stands in the checkout's zone or a cashier is
// hired (G.stats.staff[id].cashier, like 'shop'). The payment is the summed base value of
// the basket x G.stats.priceMult, landing on the checkout's cash pile.
// Capabilities: cash pile, `serve` (zone + waiting count, for hints and bots).
// Full schema: docs/STATIONS.md.
//
// def = {
//   id, type: 'checkout', name, open,
//   counter: { x, z, yaw: 0, len: 2.6, depth: 1.0, h: 0.95 },   // local +X = customer side
//   zone: { x, z, r: 1.4 },          // stand here to serve (default: behind the counter)
//   cashPile: { x, z, r: 1.4 }, bundle: 15,   // money per drawn bill bundle
//   queue: [{x, z}, ...],            // queue[0] is served; the line extends past the last point
//   queueIn: [{x, z}, ...],          // optional waypoints walked before joining the line
//   exit: [{x, z}, ...],             // optional waypoints after paying (then shoppers.exit)
//   cashierSpot: { x, z, yaw },      // where a hired cashier stands
//   staffRole: 'cashier',
//   serve: { self: { interval: 0.35, perItem: 0.12 }, staffed: { interval: 0.25, perItem: 0.08 } },
//   shoppers: { ... },               // population config (see SHOPPERS below); merged over world.shoppers
//   placeholder: true, markers: true, label: 'SERVE', blockers,
// }
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { Parts, getSharedMaterial } from '../geom.js';
import { itemValue } from '../items.js';
import { makeCharacter, animateCharacter, randomCustomerLook } from '../chars.js';
import { createCashPile, zoneOf, ptOf, isNum, angLerp, popScale, zoneMarker, placeholder, showAll } from './kit.js';

export const SHOPPERS = {
  count: 8,              // population while one checkout is open
  perCheckout: 4,        // + this many per additional open checkout
  countStat: 'shoppers', // + G.stats[countStat] (pads can add shoppers)
  max: 40,               // hard cap
  speed: 3.6,            // walk speed (units/s)
  shelves: [1, 3],       // shelves visited per trip (min, max)
  items: [1, 3],         // items taken per shelf visit (min, max)
  takeInterval: 0.25,    // seconds per item taken at a shelf
  pause: 0.35,           // seconds lingering after taking
  basket: 12,            // basket capacity
  spawnEvery: 0.45,      // seconds between arrivals while below the population
  entrance: null,        // [{x, z}, ...] required: first point = where shoppers appear
  exit: null,            // [{x, z}, ...] required: last point = where they vanish
  lodShow: 27,           // not drawn further than this from the player
  lodShadow: 0,          // real (shadow-map) shadows within this distance; 0 = never (they have blob shadows)
};

const OFF = 0, ENTER = 1, WALK = 2, BROWSE = 3, QUEUE = 4, LEAVE = 5;
const SPAWN_TIME = 0.25, SHRINK_TIME = 0.25;
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const BASKET = { x: -0.42, y: 0.42, z: 0.06 };   // character-local basket position
const rint = (a) => (Array.isArray(a) ? a[0] + Math.floor(Math.random() * (a[1] - a[0] + 1)) : a | 0);

// ------------------------------------------------------------------ population
const pops = new WeakMap();
function population(G) {
  let P = pops.get(G);
  if (P) return P;
  P = {
    cfg: { ...SHOPPERS, ...(G.world.shoppers || {}) },
    pool: [], shelves: null, checkouts: [], built: false, lastT: -1,
    T: { spawnT: 0.2, lodT: 0, alive: 0, spawned: 0, left: 0, boot: 1 },
    restoreBaskets: null,
    basketMesh: null, fillMesh: null,
  };
  pops.set(G, P);
  return P;
}

function buildMeshes(G, P) {
  const n = P.cfg.max;
  const b = new Parts();
  b.box(0xd8423a, 0.42, 0.05, 0.3, [0, 0.025, 0]);
  b.box(0xe8524a, 0.42, 0.2, 0.03, [0, 0.12, 0.135]);
  b.box(0xe8524a, 0.42, 0.2, 0.03, [0, 0.12, -0.135]);
  b.box(0xe8524a, 0.03, 0.2, 0.3, [0.2, 0.12, 0]);
  b.box(0xe8524a, 0.03, 0.2, 0.3, [-0.2, 0.12, 0]);
  b.box(0x3a3a44, 0.03, 0.03, 0.32, [0, 0.36, 0]);
  b.box(0x3a3a44, 0.03, 0.15, 0.03, [0, 0.28, 0.15]);
  b.box(0x3a3a44, 0.03, 0.15, 0.03, [0, 0.28, -0.15]);
  P.basketMesh = new THREE.InstancedMesh(b.merged(), getSharedMaterial(), n);
  // the basket's contents: a box scaled by fill, two low-poly fruits on top (52 triangles)
  const f = new Parts();
  f.box(0xffe08a, 0.36, 1, 0.24, [0, 0.5, 0]);
  f.ico(0x9be36a, 0.08, [0.1, 1.0, 0.04]);
  f.ico(0xff8a5c, 0.08, [-0.08, 1.0, -0.03]);
  P.fillMesh = new THREE.InstancedMesh(f.merged(), getSharedMaterial(), n);
  for (const m of [P.basketMesh, P.fillMesh]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = P.cfg.lodShadow > 0;
    m.count = 0;
    G.scene.add(m);
  }
}

function makeShopper(G, P, id) {
  const char = makeCharacter(randomCustomerLook());
  const meshes = [];
  char.traverse((o) => { if (o.isMesh) meshes.push(o); });
  char.visible = false;
  const shadow = P.cfg.lodShadow > 0;
  if (!shadow) for (const m of meshes) m.castShadow = false;
  G.scene.add(char);
  const cap = P.cfg.basket;
  return {
    id, char, meshes, base: char.scale.x || 1, shadow,
    state: OFF, x: 0, z: 0, yaw: 0, spd: 0, t: 0, life: 0, hidden: false,
    legA: null, legB: null, legC: null, leg: 0, i: 0, fx: 0, fz: 0,
    shelf: null, visits: 0, want: 0, got: 0, takeT: 0, pauseT: 0, visited: 0,
    basket: new Array(cap).fill(null), bn: 0, bvalue: 0, scanned: 0,
    co: null, wait: 0, moved: 0,
    anim: { moving: false, speed: 1, carrying: false, action: null },
  };
}

// --- routing: leg A (reversed), leg B, leg C, then the final point
function routeTarget(s, out) {
  for (;;) {
    if (s.leg === 0) {
      if (s.legA && s.i < s.legA.length) { const p = s.legA[s.legA.length - 1 - s.i]; out.x = p.x; out.z = p.z; return false; }
      s.leg = 1; s.i = 0;
    } else if (s.leg === 1) {
      if (s.legB && s.i < s.legB.length) { const p = s.legB[s.i]; out.x = p.x; out.z = p.z; return false; }
      s.leg = 2; s.i = 0;
    } else if (s.leg === 2) {
      if (s.legC && s.i < s.legC.length) { const p = s.legC[s.i]; out.x = p.x; out.z = p.z; return false; }
      s.leg = 3; s.i = 0;
    } else { out.x = s.fx; out.z = s.fz; return true; }
  }
}
function setRoute(s, a, b, c, fx, fz) {
  s.legA = a; s.legB = b; s.legC = c; s.leg = 0; s.i = 0; s.fx = fx; s.fz = fz;
}
function moveToward(s, tx, tz, spd, dt) {
  const dx = tx - s.x, dz = tz - s.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) { s.spd = 0; return 0; }
  const step = Math.min(d, spd * dt);
  s.x += (dx / d) * step; s.z += (dz / d) * step;
  s.spd = step / dt;
  s.moved += step;
  if (d > 0.05) s.yaw = angLerp(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 12));
  return d - step;
}
const tgt = { x: 0, z: 0 };
/** Walk the route; true once the final point is reached. */
function follow(s, spd, dt) {
  const fin = routeTarget(s, tgt);
  const rem = moveToward(s, tgt.x, tgt.z, spd, dt);
  if (!fin) { if (rem < 0.35) s.i++; return false; }
  return rem < 0.04;
}

// ------------------------------------------------------------------ update
function popUpdate(G, P, dt) {
  const cfg = P.cfg;
  if (!P.built) {
    P.built = true;
    P.shelves = G.stations.list.filter((st) => st.type === 'shelf');
    buildMeshes(G, P);
  }
  const C = P.checkouts;
  let openCo = 0;
  for (let i = 0; i < C.length; i++) if (C[i].active) openCo++;
  const target = Math.min(cfg.max, Math.max(0, cfg.count + cfg.perCheckout * Math.max(0, openCo - 1) + (cfg.countStat ? (G.stats[cfg.countStat] || 0) : 0)));
  const shelves = P.shelves;
  let stocked = 0;
  for (let i = 0; i < shelves.length; i++) if (shelves[i].active && shelves[i].stock > 0) stocked++;

  // restored baskets: shoppers who were in the store when the game was saved
  if (P.restoreBaskets) {
    const list = P.restoreBaskets;
    P.restoreBaskets = null;
    for (let i = 0; i < list.length; i++) {
      const s = spawn(G, P, true);
      if (!s) break;
      const ks = list[i];
      for (let j = 0; j < ks.length && s.bn < s.basket.length; j++) { s.basket[s.bn++] = ks[j]; s.bvalue += itemValue(ks[j]); }
      const e = cfg.entrance;
      s.x = e[e.length - 1].x + (Math.random() - 0.5); s.z = e[e.length - 1].z + (Math.random() - 0.5);
      toCheckout(G, P, s);
    }
  }

  // arrivals
  if (P.T.alive < target) {
    P.T.spawnT -= dt;
    if (P.T.spawnT <= 0) {
      spawn(G, P, false);
      const every = cfg.spawnEvery * (stocked ? 1 : 4) * (P.T.boot > 0 ? 0.35 : 1);
      P.T.spawnT = every * (0.7 + Math.random() * 0.6);
    }
  } else {
    P.T.boot = 0;
    if (P.T.spawnT < 0.05) P.T.spawnT = 0.05;
  }

  // LOD
  P.T.lodT -= dt;
  const doLod = P.T.lodT <= 0 && G.player;
  if (doLod) P.T.lodT = 0.3;
  const pl = G.player && G.player.pos;

  const pool = P.pool;
  const bm = P.basketMesh, fm = P.fillMesh;
  let nb = 0;
  for (let k = 0; k < pool.length; k++) {
    const s = pool[k];
    if (s.state === OFF) continue;
    s.t += dt;
    let scale = s.t < SPAWN_TIME ? popScale(s.t / SPAWN_TIME) : 1;
    const spd = cfg.speed;
    s.spd = 0;
    switch (s.state) {
      case ENTER:
        if (follow(s, spd, dt)) pickShelf(G, P, s);
        break;
      case WALK:
        if (follow(s, spd, dt)) { s.state = BROWSE; s.takeT = 0; s.pauseT = -1; }
        break;
      case BROWSE: browse(G, P, s, dt); break;
      case QUEUE: {
        const co = s.co;
        const idx = co.line.indexOf(s);
        if (s.leg < 3) { routeTarget(s, tgt); if (s.leg < 3) { const rem = moveToward(s, tgt.x, tgt.z, spd, dt); if (rem < 0.35) s.i++; break; } }
        co.slotPos(idx, tgt);
        const rem = moveToward(s, tgt.x, tgt.z, spd * (idx === 0 ? 1.15 : 1), dt);
        if (rem < 0.05) s.yaw = angLerp(s.yaw, co.faceYaw, Math.min(1, dt * 10));
        break;
      }
      case LEAVE: {
        s.life += dt;
        const done = follow(s, spd, dt);
        if (done) {
          s.wait += dt;
          scale = Math.max(0, 1 - s.wait / SHRINK_TIME);
          if (s.wait >= SHRINK_TIME) { s.state = OFF; s.char.visible = false; s.char.userData.lod = true; P.T.alive--; P.T.left++; continue; }
        }
        break;
      }
    }
    if (doLod && pl) {
      const dx = pl.x - s.x, dz = pl.z - s.z, d2 = dx * dx + dz * dz;
      s.hidden = d2 > cfg.lodShow * cfg.lodShow;
      const sh = d2 < cfg.lodShadow * cfg.lodShadow;
      if (sh !== s.shadow) { s.shadow = sh; for (let i = 0; i < s.meshes.length; i++) s.meshes[i].castShadow = sh; }
      s.char.userData.lod = s.hidden;
    }
    s.char.visible = !s.hidden;
    if (s.hidden) continue;
    const sc = Math.max(0.001, scale * s.base);
    s.char.position.set(s.x, 0, s.z);
    s.char.rotation.y = s.yaw;
    s.char.scale.setScalar(sc);
    const an = s.anim;
    an.moving = s.spd > 0.2;
    an.speed = Math.max(0.6, s.spd / spd);
    animateCharacter(s.char, dt, an);
    // basket hanging from the right hand (character-local -X), visible from the camera
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
    _p.set(s.x + (BASKET.x * c + BASKET.z * sn) * sc, BASKET.y * sc, s.z + (-BASKET.x * sn + BASKET.z * c) * sc);
    _q.setFromAxisAngle(UP, s.yaw);
    _s.set(sc, sc, sc);
    _m.compose(_p, _q, _s);
    bm.setMatrixAt(nb, _m);
    const left = s.bn - s.scanned;
    if (left > 0) {
      _p.y += 0.05 * sc;
      _s.set(sc, Math.min(0.24, 0.035 * left) * sc, sc);
      _m.compose(_p, _q, _s);
      fm.setMatrixAt(nb, _m);
    } else fm.setMatrixAt(nb, ZERO);
    nb++;
  }
  bm.count = nb; fm.count = nb;
  bm.instanceMatrix.needsUpdate = true;
  fm.instanceMatrix.needsUpdate = true;
}

function spawn(G, P, instant) {
  const cfg = P.cfg;
  let s = null;
  for (let i = 0; i < P.pool.length; i++) if (P.pool[i].state === OFF) { s = P.pool[i]; break; }
  if (!s) {
    if (P.pool.length >= cfg.max) return null;
    s = makeShopper(G, P, P.pool.length);
    P.pool.push(s);
  }
  const e = cfg.entrance;
  s.state = ENTER; s.t = instant ? SPAWN_TIME : 0; s.life = 0; s.wait = 0;
  s.x = e[0].x + (Math.random() - 0.5) * 0.6; s.z = e[0].z + (Math.random() - 0.5) * 0.6;
  s.yaw = 0; s.spd = 0;
  s.shelf = null; s.visits = rint(cfg.shelves); s.visited = 0; s.got = 0; s.want = 0;
  for (let i = 0; i < s.bn; i++) s.basket[i] = null;
  s.bn = 0; s.bvalue = 0; s.scanned = 0; s.co = null;
  s.hidden = false; s.char.userData.lod = false;
  setRoute(s, null, e, null, e[e.length - 1].x, e[e.length - 1].z);
  s.i = 1;   // already at entrance[0]
  s.char.visible = true;
  s.char.position.set(s.x, 0, s.z);
  P.T.alive++; P.T.spawned++;
  return s;
}

function pickShelf(G, P, s) {
  const sh = P.shelves;
  let n = 0;
  if (s.visits > 0) for (let i = 0; i < sh.length; i++) if (sh[i].active && sh[i].stock > 0 && !(s.visited & (1 << (i % 30)))) n++;
  const prev = s.shelf;
  if (n === 0) {
    if (s.bn > 0) toCheckout(G, P, s); else leave(G, P, s, prev ? prev.approach : null, null);
    return;
  }
  let r = (Math.random() * n) | 0;
  let pick = null, pi = 0;
  for (let i = 0; i < sh.length; i++) {
    if (!(sh[i].active && sh[i].stock > 0 && !(s.visited & (1 << (i % 30))))) continue;
    if (r-- === 0) { pick = sh[i]; pi = i; break; }
  }
  s.visited |= 1 << (pi % 30);
  s.shelf = pick;
  s.want = Math.max(1, rint(P.cfg.items));
  s.got = 0;
  const b = pick.browse;
  const off = (Math.random() - 0.5) * b.spread;
  setRoute(s, prev ? prev.approach : null, pick.approach, null, b.x + b.ax * off, b.z + b.az * off);
  s.state = WALK;
}

const flyFrom = new THREE.Vector3();
const basketTo = (out, s) => {
  const c = Math.cos(s.yaw), sn = Math.sin(s.yaw);
  return out.set(s.x + BASKET.x * c + BASKET.z * sn, BASKET.y + 0.3, s.z - BASKET.x * sn + BASKET.z * c);
};
const itemFly = { kind: '', from: flyFrom, to: basketTo, dur: 0.3, arc: 0.9, delay: 0, onDone: null, data: null };

function browse(G, P, s, dt) {
  const sh = s.shelf;
  s.yaw = angLerp(s.yaw, sh.browse.face, Math.min(1, dt * 10));
  if (s.pauseT >= 0) {
    s.pauseT -= dt;
    if (s.pauseT < 0) { s.visits--; pickShelf(G, P, s); }
    return;
  }
  s.takeT += dt;
  while (s.takeT >= P.cfg.takeInterval) {
    s.takeT -= P.cfg.takeInterval;
    if (s.got >= s.want || s.bn >= s.basket.length || !sh.active) { s.pauseT = P.cfg.pause; return; }
    if (sh.stock <= 0) {
      if (s.got === 0) { pickShelf(G, P, s); return; }   // empty on arrival: try another shelf, no pause
      s.pauseT = P.cfg.pause * 0.5;
      return;
    }
    sh.topWorld(flyFrom);
    const k = sh.takeOne();
    if (k === null) continue;
    s.basket[s.bn++] = k;
    s.bvalue += itemValue(k);
    s.got++;
    if (G.fx && G.fx.fly && !s.hidden) { itemFly.kind = k; itemFly.data = s; G.fx.fly(itemFly); }
  }
}

function toCheckout(G, P, s) {
  const C = P.checkouts;
  let best = null, bl = Infinity;
  for (let i = 0; i < C.length; i++) {
    const co = C[i];
    if (!co.active) continue;
    const l = co.line.length;
    if (l < bl) { bl = l; best = co; }
  }
  if (!best) { leave(G, P, s, s.shelf ? s.shelf.approach : null, null); return; }
  s.co = best;
  best.line.push(s);
  setRoute(s, s.shelf ? s.shelf.approach : null, best.def.queueIn || null, null, 0, 0);
  s.state = QUEUE;
}

function leave(G, P, s, rev, mid) {
  const ex = P.cfg.exit;
  setRoute(s, rev, mid, ex, ex[ex.length - 1].x, ex[ex.length - 1].z);
  s.state = LEAVE; s.life = 0; s.wait = 0; s.co = null;
}

// ------------------------------------------------------------------ checkout
function createCheckout(G, def) {
  const P = population(G);
  if (def.shoppers) Object.assign(P.cfg, def.shoppers);
  const cfg = P.cfg;
  if (!Array.isArray(cfg.entrance) || !cfg.entrance.length || !Array.isArray(cfg.exit) || !cfg.exit.length) {
    throw new Error(`checkout '${def.id}': shoppers.entrance and shoppers.exit paths are required (on the checkout def or world.shoppers)`);
  }
  if (!Array.isArray(def.queue) || !def.queue.length) throw new Error(`checkout '${def.id}': queue points required`);
  const Cn = { len: 2.6, depth: 1.0, h: 0.95, yaw: 0, ...(def.counter || {}) };
  const cx = Cn.x, cz = Cn.z;
  const cosY = Math.cos(Cn.yaw), sinY = Math.sin(Cn.yaw);
  const wx = (lx, lz) => cx + lx * cosY + lz * sinY;
  const wz = (lx, lz) => cz - lx * sinY + lz * cosY;
  const zone = zoneOf(def.zone, wx(-Cn.depth / 2 - 1.1, 0), wz(-Cn.depth / 2 - 1.1, 0), 1.4);
  const pileDef = zoneOf(def.cashPile, wx(-Cn.depth / 2 - 1.2, Cn.len / 2 + 1.8), wz(-Cn.depth / 2 - 1.2, Cn.len / 2 + 1.8), 1.4);
  const cashPile = createCashPile(G, pileDef, { bundle: def.bundle ?? 15 });
  const serveCfg = {
    self: { interval: 0.35, perItem: 0.12, ...(def.serve && def.serve.self) },
    staffed: { interval: 0.25, perItem: 0.08, ...(def.serve && def.serve.staffed) },
  };
  const staffRole = def.staffRole || 'cashier';
  const queue = def.queue.map((p) => ptOf(p));
  const q0 = queue[0];
  const faceYaw = Math.atan2(cx - q0.x, cz - q0.z) || 0;
  const scan = new THREE.Vector3(wx(0, 0), Cn.h + 0.1, wz(0, 0));
  const pos = { x: cx, z: cz };

  let body = null;
  if (def.placeholder !== false) {
    const p = new Parts();
    p.box(0x5f7ea6, Cn.depth, Cn.h - 0.08, Cn.len, [0, (Cn.h - 0.08) / 2, 0]);
    p.box(0xeef2f6, Cn.depth + 0.08, 0.08, Cn.len + 0.08, [0, Cn.h - 0.04, 0]);
    p.box(0x2b2f38, Cn.depth * 0.5, 0.02, Cn.len * 0.7, [Cn.depth * 0.1, Cn.h + 0.01, -Cn.len * 0.1]);   // belt
    p.box(0x30343e, 0.32, 0.3, 0.36, [-Cn.depth * 0.25, Cn.h + 0.15, Cn.len * 0.36]);                  // register
    p.box(0x8be0ff, 0.04, 0.2, 0.3, [-Cn.depth * 0.25 + 0.16, Cn.h + 0.38, Cn.len * 0.36]);
    body = placeholder(G, p, cx, cz, Cn.yaw);
  }
  const markers = def.markers === false ? [] : [zoneMarker(G, zone, def.label || 'SERVE'), zoneMarker(G, pileDef, null, true)];
  const hx = (Math.abs(cosY) * Cn.depth + Math.abs(sinY) * Cn.len) / 2, hz = (Math.abs(sinY) * Cn.depth + Math.abs(cosY) * Cn.len) / 2;
  const blockers = def.blockers === false ? null : Array.isArray(def.blockers) ? def.blockers : [{ x: cx, z: cz, hx, hz }];

  const T = { scanT: 0 };
  const line = [];
  const n = queue.length;
  function slotPos(i, out) {
    if (i < n) { out.x = queue[i].x; out.z = queue[i].z; return out; }
    const a = queue[n - 1], b = n > 1 ? queue[n - 2] : { x: a.x - 1, z: a.z };
    const k = i - n + 1;
    out.x = a.x + (a.x - b.x) * k; out.z = a.z + (a.z - b.z) * k;
    return out;
  }
  function staffed() { const s = G.stats.staff[def.id]; return !!(s && s[staffRole]); }
  function playerIn() {
    const pl = G.player && G.player.pos;
    if (!pl) return false;
    const dx = pl.x - zone.x, dz = pl.z - zone.z;
    return dx * dx + dz * dz <= zone.r * zone.r;
  }
  function frontReady() {
    const f = line.length ? line[0] : null;
    if (!f || f.state !== QUEUE || f.leg < 3) return null;
    const dx = f.x - q0.x, dz = f.z - q0.z;
    return dx * dx + dz * dz < 0.36 ? f : null;
  }

  const sale = { station: null, stationId: def.id, amount: 0, items: 0 };
  const soundOpts = { pos };
  const fromV = new THREE.Vector3();
  const scanFly = { kind: '', from: fromV, to: scan, dur: 0.22, arc: 0.6, delay: 0, onDone: null };
  const S = { sold: 0, served: 0, revenue: 0 };

  function pay(f) {
    const amount = Math.round(f.bvalue * (G.stats.priceMult || 1) * 100) / 100;
    fromV.set(scan.x, scan.y + 0.2, scan.z);
    cashPile.deposit(amount, fromV);
    S.sold += f.bn; S.served++; S.revenue += amount;
    sale.station = station; sale.amount = amount; sale.items = f.bn;
    if (G.audio && G.audio.play) G.audio.play('sell', soundOpts);
    G.events.emit('sale', sale);
    line.shift();
    for (let i = 0; i < f.bn; i++) f.basket[i] = null;
    f.bn = 0; f.bvalue = 0; f.scanned = 0;
    leave(G, P, f, null, def.exit || null);
  }

  function serve(dt) {
    const f = frontReady();
    const can = f && (staffed() || playerIn());
    if (!can) { if (!f) T.scanT = 0; return; }
    const cfgS = staffed() ? serveCfg.staffed : serveCfg.self;
    T.scanT += dt;
    let guard = 64;
    while (f.scanned < f.bn && T.scanT >= cfgS.perItem && guard-- > 0) {
      T.scanT -= cfgS.perItem;
      const k = f.basket[f.scanned++];
      if (G.fx && G.fx.fly && !f.hidden) { basketTo(fromV, f); scanFly.kind = k; G.fx.fly(scanFly); }
    }
    if (f.scanned >= f.bn && T.scanT >= cfgS.interval) {
      T.scanT -= cfgS.interval;
      if (T.scanT > cfgS.interval) T.scanT = 0;
      pay(f);
    }
  }

  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    def,
    blockers,
    counter: Cn,
    line,
    slotPos,
    faceYaw,
    cash: cashPile.cash,
    staffSpot: def.cashierSpot ? { x: def.cashierSpot.x, z: def.cashierSpot.z, yaw: def.cashierSpot.yaw ?? (Cn.yaw + Math.PI / 2) } : { x: zone.x, z: zone.z, yaw: Cn.yaw + Math.PI / 2 },
    serve: {
      zone,
      /** shoppers in line (any distance) */
      get waiting() { return line.length; },
      get staffed() { return staffed(); },
    },
    get sold() { return S.sold; },
    get served() { return S.served; },
    get revenue() { return S.revenue; },
    get lineLength() { return line.length; },
    /** the shopper population shared by every checkout */
    get shoppers() { return P; },
    meshes: { body, markers },
    activate(live) {
      cashPile.activate();
      showAll(G, [body], live);
      showAll(G, markers, false);
    },
    update(dt) {
      if (!station.active) return;
      if (P.lastT !== G.time) { P.lastT = G.time; popUpdate(G, P, dt); }
      serve(dt);
      cashPile.update(dt);
    },
    serialize() {
      const d = { cash: Math.round(cashPile.amount * 100) / 100 };
      // the first checkout also saves every unpaid basket (those shoppers come back on load)
      if (P.checkouts[0] === station) {
        const b = [];
        for (const s of P.pool) {
          if (s.state === OFF || s.bn === 0) continue;
          b.push(s.basket.slice(0, s.bn));
        }
        if (P.restoreBaskets) for (const r of P.restoreBaskets) b.push(r.slice());   // not spawned yet
        if (b.length) d.baskets = b;
      }
      return d;
    },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      cashPile.amount = isNum(d.cash) && d.cash > 0 ? d.cash : 0;
      if (Array.isArray(d.baskets)) {
        const out = [];
        for (const b of d.baskets) {
          if (!Array.isArray(b)) continue;
          const ks = b.filter((k) => typeof k === 'string' && k !== 'cash' && getItem(k)).slice(0, cfg.basket);
          if (ks.length) out.push(ks);
        }
        if (out.length) P.restoreBaskets = out.slice(0, cfg.max);
      }
    },
  };
  P.checkouts.push(station);
  return station;
}

registerStationType('checkout', { create: createCheckout, describe: 'checkout + shared shopper population; cash pile + serve zone' });
