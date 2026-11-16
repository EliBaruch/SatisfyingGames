// Station types 'line' and 'lot': a moving assembly line that builds vehicles, and the lot
// where finished vehicles park until they are sold. Not built in: a world lists
// '../../engine/stations/carline.js' in its `modules`. See docs/STATIONS.md.
//
// Vehicles are never items: nobody carries one. They are drawn by a shared pool of instanced
// meshes (one per model and paint colour), configured by the world:
//
//   world.cars = { models: ['car-kit/sedan', 'car-kit/suv'], colors: [0xe4474f, ...], scale: 1.35, primer: 0xcfd4da, max: 48 }
//
// ---- 'line'
// def = {
//   id, type: 'line', name, open,
//   recipe: { in: { panel: 3, pack: 2, wheel: 4 }, time: 14 },   // parts per vehicle; seconds from one end to the other
//   speedStat: 'lineSpeed',          // optional G.stats key multiplying the speed
//   path: { from: {x, z}, to: {x, z} },   // REQUIRED: the straight track
//   stages: 4,                       // stations along the track; stage k is at (k + 0.5) / stages
//   show: { primer: 0, paint: 1, wheels: 3 },   // the stage at which the body appears / is painted / gets wheels
//   inputCap: 4,                     // input bay capacity in vehicles' worth of parts
//   dropZone: { x, z, r }, workerSpot, vehicleSpot,   // where parts are delivered
//   bay: { layout: {...} },          // input bay layout (kit.createStore)
//   lot: 'lotId',                    // REQUIRED: the 'lot' station finished vehicles drive to
//   models: [0, 1],                  // indices into world.cars.models this line builds (default: all)
//   label: 'PARTS', placeholder: true, markers: true, blockers,
// }
// Parts are consumed when a vehicle starts. Capabilities: `drop` (and the same as `receive`, so belts
// can feed it). Readable: running, blocked (the lot is full), count (vehicles on the line), made,
// stagePos(k, out), track { from, to, yaw, length }. Events: 'line:start' { station, stationId },
// 'line:stage' { station, stationId, stage, x, z } as a vehicle reaches a stage, 'line:done'.
// Save: { in: { kind: n }, cars: [[u, model, colour, stage], ...], made }.
//
// ---- 'lot'
// def = {
//   id, type: 'lot', name, open,
//   slots: [{ x, z, yaw }, ...] | grid: { x0, z0, dx, dz, cols, rows, yaw },   // parking places
//   exit: [{x, z}, ...],             // REQUIRED: the way out; a vehicle vanishes at the last point
//   cash: 'cashpileId',              // REQUIRED: station with cash.deposit
//   value: 600,                      // money per vehicle (x G.stats.priceMult)
//   sellEvery: 6, first: 3,          // seconds between sales while vehicles are parked
//   rateStat: 'carDemand',           // optional G.stats key multiplying the sales rate
//   speed: 6,
// }
// Readable: count, parked, sold, revenue, park { room(), accept(model, colour, x, z, yaw) }.
// Events: 'sale' { station, stationId, amount, items: 1 }.
// Save: { cars: [[model, colour, slot], ...], t, sold }.
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { Parts, meshOf } from '../geom.js';
import { getGeometry } from '../art/assets.js';
import { getGlossMaterial } from '../art/material.js';
import { fmtMoney } from '../config.js';
import { createStore, receiveCap, zoneOf, ptOf, isNum, zoneMarker, showAll, angLerp } from './kit.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _hsl = { h: 0, s: 0, l: 0 }, _c = new THREE.Color(), _t = new THREE.Color(), _th = { h: 0, s: 0, l: 0 };

// ------------------------------------------------------------- vehicle pool
/** A copy of a vertex-colour body geometry with its paint (the dominant saturated hue) replaced by `color`. */
function repaint(geo, color) {
  const g = geo.clone();
  const src = geo.attributes.color, n = src.count;
  // find the paint: the most common clearly coloured hue (10 degree bins)
  const bins = new Float32Array(36);
  for (let i = 0; i < n; i++) {
    _c.setRGB(src.getX(i), src.getY(i), src.getZ(i)).getHSL(_hsl);
    if (_hsl.s > 0.3 && _hsl.l > 0.08 && _hsl.l < 0.9) bins[Math.min(35, (_hsl.h * 36) | 0)]++;
  }
  let best = 0;
  for (let i = 1; i < 36; i++) if (bins[i] > bins[best]) best = i;
  if (bins[best] === 0) return g;
  const hue = (best + 0.5) / 36;
  let lsum = 0, ln = 0;
  for (let i = 0; i < n; i++) {
    _c.setRGB(src.getX(i), src.getY(i), src.getZ(i)).getHSL(_hsl);
    let dh = Math.abs(_hsl.h - hue); if (dh > 0.5) dh = 1 - dh;
    if (_hsl.s > 0.3 && dh < 0.07) { lsum += _hsl.l; ln++; }
  }
  const lref = ln ? lsum / ln : 0.5;
  _t.set(color).getHSL(_th);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _c.setRGB(src.getX(i), src.getY(i), src.getZ(i)).getHSL(_hsl);
    let dh = Math.abs(_hsl.h - hue); if (dh > 0.5) dh = 1 - dh;
    if (_hsl.s > 0.3 && dh < 0.07) _c.setHSL(_th.h, _th.s, Math.max(0, Math.min(1, _th.l * (_hsl.l / lref))));
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const BODY = { key: 'body', test: (p) => !/wheel/i.test(p) };
const WHEELS = { key: 'wheels', test: (p) => /wheel/i.test(p) };
export const CAR_LOOK = { PRIMER: 0, PAINTED: 1, FULL: 2 };

/** The world's shared vehicle renderer (created on first use). draw() is valid for the current step only. */
export function carPool(G) {
  if (G.__carPool) return G.__carPool;
  const cfg = { models: ['car-kit/sedan'], colors: [0xe4474f], scale: 1.35, primer: 0xcfd4da, max: 48, gloss: 0.6, ...(G.world.cars || {}) };
  const mat = getGlossMaterial(cfg.gloss, 70);
  const max = cfg.max;
  const mk = (geo, cast = true) => {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = cast; m.receiveShadow = false;
    m.frustumCulled = false;
    m.count = 0; m.visible = false;
    G.scene.add(m);
    return m;
  };
  const models = cfg.models.map((id) => {
    const body = getGeometry(id, { scale: cfg.scale, nodes: BODY });
    const wheels = getGeometry(id, { scale: cfg.scale, nodes: WHEELS });
    return {
      id,
      size: getGeometry(id, { scale: cfg.scale }).userData.size,
      primer: mk(repaint(body, cfg.primer)),
      paints: cfg.colors.map((c) => mk(repaint(body, c))),
      wheels: mk(wheels, false),
    };
  });
  const all = [];
  for (const m of models) { all.push(m.primer, m.wheels); for (const p of m.paints) all.push(p); }
  let stamp = -1;
  function put(mesh, x, y, z, yaw, s) {
    if (mesh.count >= max) return;
    _p.set(x, y, z); _q.setFromAxisAngle(UP, yaw); _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(mesh.count++, _m);
    mesh.visible = true;
    mesh.instanceMatrix.needsUpdate = true;
  }
  const pool = {
    models, colors: cfg.colors, cfg,
    /** call once per step before drawing; the first caller of a step clears the previous frame */
    begin() {
      if (stamp === G.time) return;
      stamp = G.time;
      for (let i = 0; i < all.length; i++) { all[i].count = 0; all[i].visible = false; }
    },
    /** look: CAR_LOOK.PRIMER (bare body) | PAINTED (body in its colour) | FULL (with wheels) */
    draw(model, color, look, x, y, z, yaw, s = 1) {
      const M = models[model % models.length];
      put(look === CAR_LOOK.PRIMER ? M.primer : M.paints[color % M.paints.length], x, y, z, yaw, s);
      if (look === CAR_LOOK.FULL) put(M.wheels, x, y, z, yaw, s);
    },
    /** length of a model along its own Z (for spacing) */
    lengthOf(model) { return models[model % models.length].size.z; },
  };
  G.__carPool = pool;
  return pool;
}

// --------------------------------------------------------------------- line
const MAXC = 10;
function createLine(G, def) {
  const R = def.recipe || {};
  const inKinds = Object.keys(R.in || {});
  if (!inKinds.length) throw new Error(`line '${def.id}': recipe.in required`);
  for (const k of inKinds) if (!getItem(k)) throw new Error(`line '${def.id}': item '${k}' is not registered`);
  const inN = inKinds.map((k) => Math.max(1, R.in[k] | 0));
  const time = R.time > 0 ? R.time : 14;
  const P = def.path || {};
  const A = ptOf(P.from, 0, 0), B = ptOf(P.to, 10, 0);
  const length = Math.hypot(B.x - A.x, B.z - A.z);
  const yaw = Math.atan2(B.x - A.x, B.z - A.z);
  const stages = Math.max(1, def.stages | 0 || 4);
  const SH = { primer: 0, paint: 1, wheels: stages - 1, ...(def.show || {}) };
  const minGap = (1 / stages) * 0.98;
  const pos = { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
  const dropZone = zoneOf(def.dropZone, A.x - 2.5, A.z, 1.6);

  // input bay
  const buf = Math.max(1, def.inputCap | 0 || 4);
  let cap = 0;
  const kindCap = {};
  inKinds.forEach((k, i) => { kindCap[k] = inN[i] * buf; cap += inN[i] * buf; });
  const bayL = { x: (dropZone.x + A.x) / 2, z: (dropZone.z + A.z) / 2, yaw: 0, cols: inKinds.length, rows: 2, ...((def.bay && def.bay.layout) || {}) };
  const store = createStore(G, { kinds: inKinds, capacity: cap, kindCap, layout: bayL });
  store.layout.y = store.layout.y || 0.08;

  // vehicles on the line: index 0 = nearest the end
  const U = new Float32Array(MAXC), MDL = new Uint8Array(MAXC), COL = new Uint8Array(MAXC), STG = new Int8Array(MAXC), BNC = new Float32Array(MAXC);
  const T = { n: 0, made: 0, running: false, blocked: false, next: 0 };
  const allowed = Array.isArray(def.models) && def.models.length ? def.models : null;

  // visuals: the track
  let body = null;
  const skidGeo = (() => {
    const p = new Parts();
    p.box(0xf2b632, 2.5, 0.16, 4.3, [0, 0.32, 0]);
    p.box(0x3d4450, 2.1, 0.1, 3.9, [0, 0.42, 0]);
    for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) p.box(0x596270, 0.5, 0.42, 0.5, [sx * 0.7, 0.63, sz]);
    return p.merged();
  })();
  const skids = new THREE.InstancedMesh(skidGeo, getGlossMaterial(0.3, 30), MAXC);
  skids.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skids.castShadow = true; skids.count = 0; skids.visible = false; skids.frustumCulled = false;
  G.scene.add(skids);
  if (def.placeholder !== false) {
    const p = new Parts();
    const W = 3.2;
    p.box(0x4a525e, W, 0.24, length + 3, [0, 0.12, 0]);                       // bed
    for (const sx of [-1, 1]) p.box(0xf2b632, 0.16, 0.3, length + 3, [sx * (W / 2 + 0.06), 0.15, 0]);   // yellow edges
    for (let z = -length / 2 - 1; z <= length / 2 + 1; z += 0.9) p.box(0x7b8594, W - 0.5, 0.05, 0.22, [0, 0.25, z]);   // rollers
    body = meshOf(p.merged({ ao: { ground: 0.2, groundH: 0.3, noBoxes: true } }), { receive: true });
    body.position.set(pos.x, 0, pos.z);
    body.rotation.y = yaw;
    body.visible = false;
    G.scene.add(body);
  }
  const markers = def.markers === false ? [] : [zoneMarker(G, dropZone, def.label || 'PARTS')];
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  const blockers = def.blockers === false ? null : Array.isArray(def.blockers) ? def.blockers
    : [{ x: pos.x, z: pos.z, hx: (c * 3.4 + s * (length + 3)) / 2, hz: (s * 3.4 + c * (length + 3)) / 2 }];

  const pool = carPool(G);
  const ev = { station: null, stationId: def.id, stage: 0, x: 0, z: 0, model: 0, color: 0 };
  const tmp = new THREE.Vector3();
  const head = new THREE.Vector3(A.x, 1.2, A.z);
  const inFly = { kind: '', from: tmp, to: head, dur: 0.4, arc: 1.5, delay: 0, onDone: null };
  const sparkOpts = { colors: [0xfff2a0, 0xffc233, 0xffffff], count: 10, speed: 4.5, size: 0.07, life: 0.45, gravity: 9, up: 3 };
  let lot = null;

  function canStart() {
    if (T.n >= Math.min(MAXC, stages + 1)) return false;
    if (T.n > 0 && U[T.n - 1] < minGap) return false;
    for (let i = 0; i < inKinds.length; i++) if (store.countOf(inKinds[i]) < inN[i]) return false;
    return true;
  }
  function start() {
    let shown = 0;
    for (let i = 0; i < inKinds.length; i++) {
      for (let j = 0; j < inN[i]; j++) {
        store.topWorld(tmp);
        store.removeKind(inKinds[i]);
        if (G.fx && G.fx.fly && shown < 7) { inFly.kind = inKinds[i]; inFly.delay = shown * 0.05; G.fx.fly(inFly); shown++; }
      }
    }
    const i = T.n++;
    U[i] = 0; STG[i] = -1; BNC[i] = 0;
    const list = allowed || pool.models.map((_, k) => k);
    MDL[i] = list[T.next % list.length];
    COL[i] = (T.next * 7 + (T.next >> 2)) % pool.colors.length;
    T.next++;
    ev.station = station;
    G.events.emit('line:start', ev);
  }
  function posOf(u, out) { out.x = A.x + (B.x - A.x) * u; out.z = A.z + (B.z - A.z) * u; return out; }
  const P2 = { x: 0, z: 0 };

  const recv = receiveCap(store);
  const dropCap = {
    zone: dropZone, face: pos,
    workerSpot: ptOf(def.workerSpot, dropZone.x, dropZone.z),
    vehicleSpot: def.vehicleSpot ? ptOf(def.vehicleSpot) : null,
    ...recv,
    get fill() { return (store.count + store.pending) / cap; },
  };
  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    blockers,
    input: store,
    drop: dropCap,
    receive: recv,
    track: { from: A, to: B, yaw, length },
    stages,
    get running() { return T.running; },
    get blocked() { return T.blocked; },
    get count() { return T.n; },
    get made() { return T.made; },
    /** world position of stage k (0-based) */
    stagePos(k, out) { return posOf((k + 0.5) / stages, out); },
    meshes: { body, skids, markers },
    activate(live) {
      store.setVisible(true);
      showAll(G, [body], live);
      showAll(G, markers, false);
    },
    update(dt) {
      if (!station.active) return;
      if (!lot) lot = G.stations.get(def.lot);
      const sp = ((def.speedStat ? (G.stats[def.speedStat] || 1) : 1) * dt) / time;
      let moved = false;
      T.blocked = false;
      for (let i = 0; i < T.n; i++) {
        const lim = i === 0 ? 1 : U[i - 1] - minGap;
        const nu = U[i] + sp < lim ? U[i] + sp : lim;
        if (nu > U[i] + 1e-7) { U[i] = nu; moved = true; }
        // stage reached?
        const k = Math.min(stages - 1, Math.floor(U[i] * stages - 0.5 + 1e-6));
        if (k > STG[i] && U[i] >= (k + 0.5) / stages - 1e-6) {
          STG[i] = k; BNC[i] = 1;
          posOf(U[i], P2);
          ev.station = station; ev.stage = k; ev.x = P2.x; ev.z = P2.z; ev.model = MDL[i]; ev.color = COL[i];
          G.events.emit('line:stage', ev);
          if (G.fx && G.fx.burst) { tmp.set(P2.x, 1.3, P2.z); G.fx.burst(tmp, sparkOpts); }
          if (G.audio && G.audio.play) G.audio.play(k === SH.paint ? 'feed' : k === SH.primer ? 'weld' : 'servo', snd);
        }
        if (BNC[i] > 0) BNC[i] = Math.max(0, BNC[i] - dt * 3.2);
      }
      // the front vehicle leaves for the lot
      if (T.n > 0 && U[0] >= 1 - 1e-6) {
        if (lot && lot.active && lot.park && lot.park.room() > 0) {
          lot.park.accept(MDL[0], COL[0], B.x, B.z, yaw);
          for (let i = 1; i < T.n; i++) { U[i - 1] = U[i]; MDL[i - 1] = MDL[i]; COL[i - 1] = COL[i]; STG[i - 1] = STG[i]; BNC[i - 1] = BNC[i]; }
          T.n--; T.made++;
          moved = true;
          ev.station = station;
          G.events.emit('line:done', ev);
          if (G.audio && G.audio.play) G.audio.play('car', snd);
        } else T.blocked = true;
      }
      if (canStart()) { start(); moved = true; }
      T.running = moved;
      store.update(dt);

      // draw
      pool.begin();
      skids.count = 0;
      for (let i = 0; i < T.n; i++) {
        posOf(U[i], P2);
        const k = STG[i];
        const b = BNC[i] > 0 ? 1 + Math.sin(BNC[i] * Math.PI) * 0.1 : 1;
        if (k >= SH.primer) {
          const look = k >= SH.wheels ? 2 : k >= SH.paint ? 1 : 0;
          pool.draw(MDL[i], COL[i], look, P2.x, look === 2 ? 0.26 : 0.84, P2.z, yaw, b);
        }
        if (k < SH.wheels) {
          _p.set(P2.x, 0, P2.z); _q.setFromAxisAngle(UP, yaw); _s.set(1, 1, 1);
          _m.compose(_p, _q, _s);
          skids.setMatrixAt(skids.count++, _m);
        }
      }
      skids.visible = skids.count > 0;
      skids.instanceMatrix.needsUpdate = true;
    },
    serialize() {
      const cars = [];
      for (let i = 0; i < T.n; i++) cars.push([Math.round(U[i] * 1000) / 1000, MDL[i], COL[i], STG[i]]);
      return { in: store.serialize(), cars, made: T.made, next: T.next };
    },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      store.restore(d.in);
      T.n = 0;
      if (Array.isArray(d.cars)) {
        for (const car of d.cars) {
          if (!Array.isArray(car) || T.n >= MAXC || !isNum(car[0])) continue;
          const i = T.n++;
          U[i] = Math.max(0, Math.min(1, car[0])); MDL[i] = (car[1] | 0) % pool.models.length; COL[i] = (car[2] | 0) % pool.colors.length;
          STG[i] = Math.max(-1, Math.min(stages - 1, car[3] | 0)); BNC[i] = 0;
        }
      }
      if (isNum(d.made)) T.made = Math.max(0, d.made | 0);
      if (isNum(d.next)) T.next = Math.max(0, d.next | 0);
    },
  };
  const snd = { pos, volume: 0.45 };
  return station;
}

// ---------------------------------------------------------------------- lot
const IN = 0, PARKED = 1, OUT = 2;
function createLot(G, def) {
  let slots = Array.isArray(def.slots) ? def.slots.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw || 0 })) : null;
  if (!slots && def.grid) {
    const g = def.grid;
    slots = [];
    for (let r = 0; r < (g.rows | 0 || 1); r++) for (let c2 = 0; c2 < (g.cols | 0 || 1); c2++) slots.push({ x: g.x0 + c2 * g.dx, z: g.z0 + r * g.dz, yaw: g.yaw || 0 });
  }
  if (!slots || !slots.length) throw new Error(`lot '${def.id}': slots or grid required`);
  const exit = (def.exit || []).map((p) => ptOf(p, 0, 0));
  if (!exit.length) throw new Error(`lot '${def.id}': exit path required`);
  const N = slots.length, MAX = N + 12;
  const X = new Float32Array(MAX), Zs = new Float32Array(MAX), H = new Float32Array(MAX), SPD = new Float32Array(MAX);
  const ST = new Uint8Array(MAX), MDL = new Uint8Array(MAX), COL = new Uint8Array(MAX), SLOT = new Int16Array(MAX), WI = new Uint8Array(MAX), AGE = new Float32Array(MAX);
  const taken = new Uint8Array(N);
  const T = { n: 0, t: def.first ?? 3, sold: 0, revenue: 0 };
  const speed = def.speed || 6;
  const every = def.sellEvery > 0 ? def.sellEvery : 6;
  const value = def.value > 0 ? def.value : 100;
  const pos = { x: slots[(N / 2) | 0].x, z: slots[(N / 2) | 0].z };
  const pool = carPool(G);
  let cash = null;
  const ev = { station: null, stationId: def.id, amount: 0, items: 1 };
  const from3 = new THREE.Vector3(), textPos = new THREE.Vector3();
  const textOpts = { color: '#7dff8a', size: 0.9, life: 1.1, maxW: 0.5 };
  const snd = { pos, volume: 0.6 };

  function freeSlot() { for (let i = 0; i < N; i++) if (!taken[i]) return i; return -1; }
  function remove(i) {
    const l = T.n - 1;
    if (i !== l) { X[i] = X[l]; Zs[i] = Zs[l]; H[i] = H[l]; SPD[i] = SPD[l]; ST[i] = ST[l]; MDL[i] = MDL[l]; COL[i] = COL[l]; SLOT[i] = SLOT[l]; WI[i] = WI[l]; AGE[i] = AGE[l]; }
    T.n--;
  }
  /** steer vehicle i toward (tx, tz); true when it is there */
  function drive(i, tx, tz, tol, dt, slow) {
    const dx = tx - X[i], dz = tz - Zs[i];
    const d = Math.hypot(dx, dz);
    if (d < tol) return true;
    H[i] = angLerp(H[i], Math.atan2(dx, dz), Math.min(1, 5 * dt));
    let target = speed;
    if (slow) target = Math.min(target, 1 + d * 1.6);
    SPD[i] += Math.max(-18 * dt, Math.min(8 * dt, target - SPD[i]));
    const step = Math.min(SPD[i] * dt, d);
    // move along the heading while it is roughly right, else straight (never orbit a close target)
    const err = Math.abs(angLerp(0, Math.atan2(dx, dz) - H[i], 1));
    if (err < 0.9 && d > 1.2) { X[i] += Math.sin(H[i]) * step; Zs[i] += Math.cos(H[i]) * step; } else { X[i] += (dx / d) * step; Zs[i] += (dz / d) * step; }
    return false;
  }

  const park = {
    room() { let n = 0; for (let i = 0; i < N; i++) if (!taken[i]) n++; return n; },
    accept(model, color, x, z, yaw) {
      const s = freeSlot();
      if (s < 0 || T.n >= MAX) return false;
      taken[s] = 1;
      const i = T.n++;
      X[i] = x; Zs[i] = z; H[i] = yaw; SPD[i] = 2; ST[i] = IN; MDL[i] = model; COL[i] = color; SLOT[i] = s; WI[i] = 0; AGE[i] = 0;
      return true;
    },
  };

  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    park,
    slots,
    get count() { return T.n; },
    get parked() { let n = 0; for (let i = 0; i < T.n; i++) if (ST[i] === PARKED) n++; return n; },
    get sold() { return T.sold; },
    get revenue() { return T.revenue; },
    activate() {},
    update(dt) {
      if (!station.active) return;
      if (!cash) { const c = G.stations.get(def.cash); cash = c && c.cash && c.cash.deposit ? c : null; }
      // sales
      const rate = def.rateStat ? (G.stats[def.rateStat] || 1) : 1;
      T.t -= dt * rate;
      if (T.t <= 0) {
        let pick = -1, oldest = -1;
        for (let i = 0; i < T.n; i++) if (ST[i] === PARKED && AGE[i] > oldest) { oldest = AGE[i]; pick = i; }
        if (pick >= 0) {
          T.t = every;
          ST[pick] = OUT; WI[pick] = 0; taken[SLOT[pick]] = 0; SLOT[pick] = -1;
          const amount = Math.round(value * (G.stats.priceMult || 1));
          T.sold++; T.revenue += amount;
          if (cash) { from3.set(X[pick], 1.8, Zs[pick]); cash.cash.deposit(amount, from3); } else G.addMoney(amount);
          if (G.fx && G.fx.popText) { textPos.set(X[pick], 2.6, Zs[pick]); G.fx.popText(textPos, '+$' + fmtMoney(amount), textOpts); }
          if (G.audio && G.audio.play) G.audio.play('sell', snd);
          ev.station = station; ev.amount = amount;
          G.events.emit('sale', ev);
        } else T.t = 0.5;
      }
      // movement
      for (let i = T.n - 1; i >= 0; i--) {
        AGE[i] += dt;
        if (ST[i] === IN) {
          const s = slots[SLOT[i]];
          if (drive(i, s.x, s.z, 0.25, dt, true)) { ST[i] = PARKED; X[i] = s.x; Zs[i] = s.z; SPD[i] = 0; AGE[i] = 0; }
        } else if (ST[i] === PARKED) {
          H[i] = angLerp(H[i], slots[SLOT[i]].yaw, Math.min(1, 4 * dt));
        } else {
          const p = exit[WI[i]];
          if (drive(i, p.x, p.z, 1.2, dt, false)) { WI[i]++; if (WI[i] >= exit.length) remove(i); }
        }
      }
      pool.begin();
      for (let i = 0; i < T.n; i++) pool.draw(MDL[i], COL[i], 2, X[i], 0, Zs[i], H[i], 1);
    },
    serialize() {
      const cars = [];
      for (let i = 0; i < T.n; i++) if (ST[i] !== OUT) cars.push([MDL[i], COL[i], SLOT[i]]);
      return { cars, t: Math.round(T.t * 100) / 100, sold: T.sold };
    },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      T.n = 0; taken.fill(0);
      if (Array.isArray(d.cars)) {
        for (const car of d.cars) {
          if (!Array.isArray(car)) continue;
          let s = car[2] | 0;
          if (!(s >= 0 && s < N) || taken[s]) s = freeSlot();
          if (s < 0) break;
          taken[s] = 1;
          const i = T.n++;
          X[i] = slots[s].x; Zs[i] = slots[s].z; H[i] = slots[s].yaw; SPD[i] = 0; ST[i] = PARKED;
          MDL[i] = (car[0] | 0) % pool.models.length; COL[i] = (car[1] | 0) % pool.colors.length; SLOT[i] = s; WI[i] = 0; AGE[i] = i;
        }
      }
      if (isNum(d.t)) T.t = Math.max(0, Math.min(every, d.t));
      if (isNum(d.sold)) T.sold = Math.max(0, d.sold | 0);
    },
  };
  return station;
}

registerStationType('line', { create: createLine, describe: 'moving assembly line: parts in, vehicles out to a lot' });
registerStationType('lot', { create: createLot, describe: 'parking lot: vehicles arrive from a line and are sold for cash' });
