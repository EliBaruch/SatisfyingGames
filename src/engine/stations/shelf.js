// Station type 'shelf': retail stock that shoppers take from (see checkout.js). The player
// or a stocker restocks it at its drop zone. Capability: drop zone. Full schema:
// docs/STATIONS.md.
//
// def = {
//   id, type: 'shelf', name, open,
//   item: 'milk' | items: ['milk', 'juice'],   // accepted kinds
//   shelf: { x, z, yaw: 0, len: 3.0, depth: 0.8, h: 1.7, levels: 3 },   // local +X = front (shoppers, restocking)
//   capacity: cols x rows x levels x stack,   // default from the layout
//   stack: 1,                       // items stacked per slot on each level
//   start: 0 | { milk: 6 },         // first boot only
//   low: 0.3,                       // fill at or below this (and > 0) = 'low'
//   dropZone: { x, z, r: 1.3 },     // default: in front of the shelf, toward one end
//   workerSpot,
//   browse: { x, z, spread },       // where shoppers stand (default: in front); spread = width they spread over
//   approach: [{x, z}, ...],        // optional waypoints shoppers walk before the browse point (and back out)
//   placeholder: true, markers: true, label: 'STOCK', blockers,
// }
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { Parts } from '../geom.js';
import { createStore, receiveCap, zoneOf, ptOf, isNum, asList, zoneMarker, placeholder, showAll } from './kit.js';

const STATES = ['empty', 'low', 'ok', 'full'];
const STATE_COLORS = [0xff4040, 0xffb020, 0x4cd964, 0x4cd964];

function createShelf(G, def) {
  const kinds = asList(def.items).concat(def.item && asList(def.items).indexOf(def.item) < 0 ? [def.item] : []);
  if (!kinds.length) throw new Error(`shelf '${def.id}': item required`);
  for (const k of kinds) if (!getItem(k)) throw new Error(`shelf '${def.id}': item '${k}' is not registered`);
  const U = { yaw: 0, len: 3.0, depth: 0.8, h: 1.7, levels: 3, ...(def.shelf || {}) };
  if (!isNum(U.x)) { U.x = def.x ?? 0; U.z = def.z ?? 0; }
  const cosY = Math.cos(U.yaw), sinY = Math.sin(U.yaw);
  const wx = (lx, lz) => U.x + lx * cosY + lz * sinY;
  const wz = (lx, lz) => U.z - lx * sinY + lz * cosY;
  let maxW = 0, maxD = 0, maxStep = 0;
  for (const k of kinds) { const it = getItem(k); maxW = Math.max(maxW, it.footprint.w); maxD = Math.max(maxD, it.footprint.d); maxStep = Math.max(maxStep, it.step); }
  const cols = Math.max(1, Math.floor((U.len - 0.2) / (maxW + 0.06)));
  const rows = Math.max(1, Math.min(2, Math.floor((U.depth - 0.1) / (maxD + 0.06))));
  const stackN = Math.max(1, def.stack | 0 || 1);
  const levelGap = U.h / U.levels;
  const layers = [];
  for (let l = 0; l < U.levels; l++) for (let j = 0; j < stackN; j++) layers.push(0.1 + l * levelGap + 0.05 + j * maxStep);
  const capacity = Math.max(1, (def.capacity ?? cols * rows * layers.length) | 0);
  const store = createStore(G, {
    kinds, capacity,
    // store local X (item long axis) runs along the shelf length
    layout: { x: U.x, z: U.z, y: 0, yaw: U.yaw + Math.PI / 2, cols, rows, dx: (U.len - 0.2) / cols, dz: (U.depth - 0.1) / rows, layers, maxDrawn: Math.min(capacity, cols * rows * layers.length) },
  });
  const pos = { x: U.x, z: U.z };
  const front = U.depth / 2;
  const dropZone = zoneOf(def.dropZone, wx(front + 1.2, -U.len * 0.25), wz(front + 1.2, -U.len * 0.25), 1.3);
  const bp = ptOf(def.browse, wx(front + 0.75, U.len * 0.1), wz(front + 0.75, U.len * 0.1));
  const browse = {
    x: bp.x, z: bp.z,
    spread: (def.browse && def.browse.spread) ?? U.len * 0.6,
    ax: sinY, az: cosY,                       // unit vector along the shelf length (local +Z)
    face: Math.atan2(U.x - wx(front + 0.75, 0), U.z - wz(front + 0.75, 0)),   // yaw that looks at the shelf
  };
  const approach = Array.isArray(def.approach) && def.approach.length ? def.approach.map((p) => ptOf(p)) : null;
  const S = { state: -1, taken: 0, restocked: 0 };
  const lowAt = def.low ?? 0.3;

  // visuals
  let body = null, lamp = null;
  if (def.placeholder !== false) {
    const p = new Parts();
    const t = 0.06;
    p.box(0xe9edf2, U.depth, U.h + 0.1, t, [0, (U.h + 0.1) / 2, U.len / 2 - t / 2]);
    p.box(0xe9edf2, U.depth, U.h + 0.1, t, [0, (U.h + 0.1) / 2, -U.len / 2 + t / 2]);
    p.box(0xcfd6de, t, U.h + 0.1, U.len, [-U.depth / 2 + t / 2, (U.h + 0.1) / 2, 0]);
    for (let l = 0; l < U.levels; l++) p.box(0xf6f8fa, U.depth, 0.05, U.len, [0, 0.1 + l * levelGap + 0.025, 0]);
    p.box(0x8a96a3, U.depth, 0.1, U.len, [0, 0.05, 0]);
    body = placeholder(G, p, U.x, U.z, U.yaw);
    lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x4cd964 }));
    lamp.position.set(front - 0.04, U.h + 0.22, 0);
    body.add(lamp);
  }
  const markers = def.markers === false ? [] : [zoneMarker(G, dropZone, def.label || 'STOCK')];
  const hx = (Math.abs(cosY) * U.depth + Math.abs(sinY) * U.len) / 2, hz = (Math.abs(sinY) * U.depth + Math.abs(cosY) * U.len) / 2;
  const blockers = def.blockers === false ? null : Array.isArray(def.blockers) ? def.blockers : [{ x: U.x, z: U.z, hx, hz }];

  const ev = { station: null, stationId: def.id, state: '' };
  const recv = receiveCap(store, { onGive: () => { S.restocked++; } });
  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    blockers,
    store,
    capacity,
    shelf: U,
    drop: {
      zone: dropZone,
      face: pos,
      workerSpot: ptOf(def.workerSpot, dropZone.x, dropZone.z),
      ...recv,
      /** need at or above this makes it an urgent hint goal (def.urgent; > 1 disables) */
      urgent: def.urgent ?? 0.75,
      /** 0..1: how badly it wants stock (1 = empty) */
      get need() { return 1 - Math.min(1, (store.count + store.pending) / capacity); },
    },
    /** what shoppers use */
    browse,
    approach,
    get stock() { return store.count; },
    get fill() { return store.count / capacity; },
    /** 'empty' | 'low' | 'ok' | 'full' */
    get state() { return STATES[Math.max(0, S.state)]; },
    get taken() { return S.taken; },
    get restocked() { return S.restocked; },
    /** A shopper takes one item: returns its kind, or null when empty. */
    takeOne() {
      const k = store.remove(null);
      if (k !== null) S.taken++;
      return k;
    },
    /** World position of the topmost item (for flying it into a basket). */
    topWorld(out) { return store.topWorld(out); },
    meshes: { body, lamp, markers },
    activate(live) {
      store.setVisible(true);
      showAll(G, [body], live);
      showAll(G, markers, false);
    },
    update(dt) {
      if (!station.active) return;
      store.update(dt);
      const f = store.count / capacity;
      const st = store.count === 0 ? 0 : f <= lowAt ? 1 : f >= 0.999 ? 3 : 2;
      if (st !== S.state) {
        S.state = st;
        if (lamp) lamp.material.color.setHex(STATE_COLORS[st]);
        ev.station = station; ev.state = STATES[st];
        G.events.emit('shelf', ev);
      }
    },
    serialize() { return { n: store.serialize() }; },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      store.restore(d.n);
    },
  };
  if (def.start != null) {
    if (isNum(def.start)) {
      const each = {};
      for (let i = 0; i < kinds.length; i++) each[kinds[i]] = Math.floor(def.start / kinds.length) + (i < def.start % kinds.length ? 1 : 0);
      store.restore(each);
    } else store.restore(def.start);
  }
  return station;
}

registerStationType('shelf', { create: createShelf, describe: 'retail stock shoppers take from; drop zone for restocking' });
