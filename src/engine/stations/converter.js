// Station type 'converter': a machine. Items dropped into its input bay are consumed by
// a recipe over time and turned into other items, which land on its own output pile
// (with a pickup zone) or in another station (`outputTo`). Capabilities: drop zone
// (input) and, with the built-in output, pickup zone. Full schema: docs/STATIONS.md.
//
// def = {
//   id, type: 'converter', name, open, x, z,                 // x, z = the machine
//   recipe: { in: { egg: 6 }, out: { carton: 1 }, time: 2.0 },
//   batch: 1,                     // max recipes per cycle (when enough input and room)
//   speedStat: 'packSpeed',       // optional G.stats key multiplying the speed (default 1)
//   inputCap: 36,                 // input bay capacity (items)
//   dropZone: { x, z, r: 1.6 }, workerSpot, vehicleSpot,
//   input:  { layout: {...} },    // bay layout (default: between the drop zone and the machine)
//   machine: { w: 2.2, d: 1.8, h: 1.6, yaw: 0 },   // placeholder size (also the blocker)
//   output: { capacity: 30, layout: {...}, zone: { x, z, r } , label },  // built-in output pile
//   outputTo: 'stationId',        // instead: hand products to that station's receive / drop
//   manual: true,                 // false: fed only by a belt or another machine: no drop zone for the
//                                 //   player and haulers (the input is exposed as `receive` instead)
//   placeholder: true, markers: true, labels: { input: 'EGGS', output: 'TAKE' },
//   blockers: true | false | [...],
// }
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { Parts } from '../geom.js';
import { createStore, pickupCap, receiveCap, zoneOf, ptOf, isNum, zoneMarker, placeholder, showAll } from './kit.js';

function createConverter(G, def) {
  const R = def.recipe || {};
  const inKinds = Object.keys(R.in || {}), outKinds = Object.keys(R.out || {});
  if (!inKinds.length || !outKinds.length) throw new Error(`converter '${def.id}': recipe needs in and out`);
  for (const k of inKinds.concat(outKinds)) if (!getItem(k)) throw new Error(`converter '${def.id}': item '${k}' is not registered`);
  const inN = inKinds.map((k) => Math.max(1, R.in[k] | 0));
  const outN = outKinds.map((k) => Math.max(1, R.out[k] | 0));
  let inSum = 0, outSum = 0;
  for (const n of inN) inSum += n;
  for (const n of outN) outSum += n;
  const time = R.time > 0 ? R.time : 2;
  const maxBatch = Math.max(1, def.batch | 0 || 1);
  const M = { w: 2.2, d: 1.8, h: 1.6, yaw: 0, ...(def.machine || {}) };
  const mx = def.x, mz = def.z;
  const pos = { x: mx, z: mz };
  const dropZone = zoneOf(def.dropZone, mx - M.w / 2 - 2.2, mz, 1.6);

  // input bay: between the drop zone and the machine
  const inputCap = Math.max(inSum, (def.inputCap ?? inSum * 6) | 0);
  const kindCap = {};
  inKinds.forEach((k, i) => { kindCap[k] = Math.max(inN[i], Math.ceil(inputCap * inN[i] / inSum)); });
  const inLayout = { x: (dropZone.x + mx) / 2, z: (dropZone.z + mz) / 2, yaw: M.yaw, cols: 3, rows: 2, ...((def.input && def.input.layout) || {}) };
  const inStore = createStore(G, { kinds: inKinds, capacity: inputCap, kindCap, layout: inLayout });
  inStore.layout.y = inStore.layout.y || 0.08;

  // output: own pile or another station
  let outStore = null, outZone = null, outTarget = null;
  const O = def.output || {};
  if (!def.outputTo) {
    outZone = zoneOf(O.zone, mx + M.w / 2 + 2.2, mz, 1.6);
    const outLayout = { x: (outZone.x + mx) / 2, z: (outZone.z + mz) / 2, yaw: M.yaw, cols: 3, rows: 2, ...(O.layout || {}) };
    outStore = createStore(G, { kinds: outKinds, capacity: Math.max(outSum, (O.capacity ?? 30) | 0), layout: outLayout });
    outStore.layout.y = outStore.layout.y || 0.08;
  }
  function target() {
    if (outStore) return null;
    if (!outTarget) {
      const st = G.stations && G.stations.get(def.outputTo);
      if (st) outTarget = st;
    }
    return outTarget;
  }
  const recvOf = (st) => (st ? st.receive || st.drop || null : null);
  function outRoom() {
    if (outStore) return outStore.room();
    const st = target();
    const r = recvOf(st);
    if (!st || !st.active || !r) return 0;
    return r.room();
  }

  // state
  const S = { running: false, prog: 0, batch: 0, blocked: false, cycles: 0, inCount: 0, outCount: 0 };
  const consumed = {}, produced = {};
  for (const k of inKinds) consumed[k] = 0;
  for (const k of outKinds) produced[k] = 0;

  // visuals
  let body = null, light = null, bar = null;
  const mouth = new THREE.Vector3(mx, M.h + 0.2, mz);
  const spout = new THREE.Vector3(mx, M.h * 0.6, mz);
  if (def.placeholder !== false) {
    const p = new Parts();
    p.box(0x8fa3b8, M.w, M.h * 0.8, M.d, [0, M.h * 0.4, 0]);
    p.box(0x6c7f94, M.w + 0.12, 0.12, M.d + 0.12, [0, M.h * 0.8, 0]);
    p.box(0xdfe7ef, M.w * 0.5, M.h * 0.25, M.d * 0.6, [0, M.h * 0.8 + M.h * 0.12, 0]);   // hopper
    p.box(0x3b4656, M.w + 0.3, 0.1, 0.6, [0, 0.45, M.d / 2 + 0.25]);                   // belt lip
    body = placeholder(G, p, mx, mz, M.yaw);
    light = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0x555555 }));
    light.position.set(0, M.h + 0.2, 0);
    body.add(light);
    bar = new THREE.Mesh(new THREE.BoxGeometry(M.w * 0.8, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0x4cd964 }));
    bar.position.set(0, M.h * 0.55, -M.d / 2 - 0.04);
    bar.scale.x = 0.001;
    body.add(bar);
  }
  const labels = def.labels || {};
  const manual = def.manual !== false;
  const markers = def.markers === false || !manual ? [] : [zoneMarker(G, dropZone, labels.input || 'DROP')];
  if (outZone && def.markers !== false) markers.push(zoneMarker(G, outZone, labels.output || 'TAKE'));

  // blockers: the machine body
  const c = Math.abs(Math.cos(M.yaw)), s = Math.abs(Math.sin(M.yaw));
  const blockers = def.blockers === false ? null : Array.isArray(def.blockers) ? def.blockers
    : [{ x: mx, z: mz, hx: (c * M.w + s * M.d) / 2, hz: (s * M.w + c * M.d) / 2 }];

  // flying items
  const tmp = new THREE.Vector3();
  const inFly = { kind: '', from: tmp, to: mouth, dur: 0.35, arc: 1.2, delay: 0, onDone: null };
  const landOut = (data, kind) => {
    if (outStore) outStore.give(kind);
    else { const r = recvOf(target()); if (r) r.give(kind); }
  };
  const outTo = (out) => {
    if (outStore) return outStore.nextWorld(out).setY(out.y + 0.05);
    const r = recvOf(target());
    return r ? r.target(out) : out.set(mx, 0.5, mz);
  };
  const outFly = { kind: '', from: spout, to: outTo, dur: 0.4, arc: 1.3, delay: 0, onDone: landOut };
  const ev = { station: null, stationId: def.id, cycles: 0, batch: 0 };

  function canStart() {
    let b = maxBatch;
    for (let i = 0; i < inKinds.length; i++) b = Math.min(b, Math.floor(inStore.countOf(inKinds[i]) / inN[i]));
    if (b <= 0) return 0;
    b = Math.min(b, Math.floor(outRoom() / outSum));
    return b;
  }
  function start(b) {
    S.running = true; S.prog = 0; S.batch = b;
    let shown = 0;
    for (let i = 0; i < inKinds.length; i++) {
      const k = inKinds[i];
      for (let j = 0; j < inN[i] * b; j++) {
        inStore.topWorld(tmp);
        inStore.removeKind(k);
        consumed[k]++;
        S.inCount++;
        if (G.fx && G.fx.fly && shown < 8) {
          inFly.kind = k; inFly.delay = shown * 0.04; inFly.dur = 0.3 + Math.random() * 0.1;
          G.fx.fly(inFly);
          shown++;
        }
      }
    }
    ev.station = station; ev.batch = b;
    G.events.emit('convert:start', ev);
  }
  function finish() {
    const b = S.batch;
    const r = outStore ? null : recvOf(target());
    let k2 = 0;
    for (let i = 0; i < outKinds.length; i++) {
      const k = outKinds[i];
      for (let j = 0; j < outN[i] * b; j++) {
        produced[k]++;
        S.outCount++;
        if (outStore) outStore.expect(k); else if (r) r.expect(k);
        if (G.fx && G.fx.fly) {
          outFly.kind = k; outFly.delay = k2 * 0.06;
          G.fx.fly(outFly);
        } else landOut(null, k);
        k2++;
      }
    }
    S.running = false; S.prog = 0; S.batch = 0;
    S.cycles++;
    ev.station = station; ev.cycles = S.cycles; ev.batch = b;
    if (G.audio && G.audio.play) G.audio.play('stack', soundOpts);
    G.events.emit('convert', ev);
  }
  const soundOpts = { pos, volume: 0.5 };

  const recv = receiveCap(inStore);
  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    blockers,
    input: inStore,
    output: outStore,
    machine: { x: mx, z: mz, w: M.w, d: M.d, h: M.h, yaw: M.yaw, mouth, spout },
    drop: manual ? {
      zone: dropZone,
      face: pos,
      workerSpot: ptOf(def.workerSpot, dropZone.x, dropZone.z),
      vehicleSpot: def.vehicleSpot ? ptOf(def.vehicleSpot) : null,
      ...recv,
      /** 0..1 fill of the input bay (no `need`: a machine never drives the urgent-need hint) */
      get fill() { return (inStore.count + inStore.pending) / inputCap; },
    } : null,
    receive: manual ? undefined : recv,
    pickup: outStore ? pickupCap(outStore, outZone, { interval: O.interval, action: O.action, idleHint: O.idleHint }) : null,
    /** 0..1 progress of the running cycle */
    get progress() { return S.running ? Math.min(1, S.prog) : 0; },
    get running() { return S.running; },
    /** recipes in the running cycle (inputs already consumed, outputs not yet made) */
    get batch() { return S.batch; },
    /** input ready but the output is full */
    get blocked() { return S.blocked; },
    get inputCount() { return inStore.count; },
    get outputCount() { return outStore ? outStore.count : 0; },
    get cycles() { return S.cycles; },
    stats: { consumed, produced, get inCount() { return S.inCount; }, get outCount() { return S.outCount; } },
    meshes: { body, light, bar, markers },
    activate(live) {
      inStore.setVisible(true);
      if (outStore) outStore.setVisible(true);
      showAll(G, [body], live);
      showAll(G, markers, false);
    },
    update(dt) {
      if (!station.active) return;
      if (S.running) {
        const sp = def.speedStat ? (G.stats[def.speedStat] || 1) : 1;
        S.prog += (dt * sp) / time;
        if (S.prog >= 1) finish();
      }
      if (!S.running) {
        const b = canStart();
        S.blocked = b === 0 && outRoom() < outSum && inStore.count >= inSum;
        if (b > 0) start(b);
      }
      inStore.update(dt);
      if (outStore) outStore.update(dt);
      if (light) light.material.color.setHex(S.running ? 0x4cd964 : S.blocked ? 0xff4d4d : 0x555555);
      if (bar) bar.scale.x = S.running ? Math.max(0.001, Math.min(1, S.prog)) : 0.001;
    },
    serialize() {
      const d = { in: inStore.serialize(), p: S.running ? Math.round(S.prog * 1000) / 1000 : -1, b: S.batch };
      if (outStore) d.out = outStore.serialize();
      return d;
    },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      inStore.restore(d.in);
      if (outStore) outStore.restore(d.out);
      if (isNum(d.p) && d.p >= 0 && isNum(d.b) && d.b >= 1) {
        S.running = true; S.prog = Math.min(0.999, d.p); S.batch = Math.min(maxBatch, d.b | 0);
      }
    },
  };
  return station;
}

registerStationType('converter', { create: createConverter, describe: 'machine: recipe in -> out over time; drop zone (input) + pickup zone (output)' });
