// Station type 'pile': a stock of items the player and workers pick up from (delivery
// dock, feed silo, any storage). Capabilities: pickup zone; optional drop zone. It can
// also receive items from a machine (`receive`). Full schema: docs/STATIONS.md.
//
// def = {
//   id, type: 'pile', name, open, x, z,
//   items: ['milk', 'bread'] | item: 'feed',   // kinds it holds
//   capacity: 40,                              // max items
//   kindCap: 14 | { milk: 14 },                // per-kind cap (default capacity / kinds when a mixed supply feeds it)
//   start: 12 | { milk: 4, bread: 4 },         // starting stock (first boot only; then the save)
//   infinite: false,                           // true: never runs out (a silo); take() always succeeds
//   supply: { every: 6, amount: 6, item | items | mix: { milk: 2, bread: 1 }, first: 1, stagger: 0.08 },
//           rateStat: 'oreRate' (optional G.stats key multiplying how fast deliveries come)
//   layout: { x, z, y, yaw, cols, rows, dx, dz, layerH, maxDrawn },   // default: centred on x, z
//   pallet: true,                              // code-built pallet under the stock (placeholder)
//   zone: { x, z, r: 1.6 },                    // pickup zone (default: in front of the stock)
//   dropZone: null | { x, z, r },              // optional: players/workers may drop accepted kinds here
//   workerSpot, interval, action: 'pickup',
//   markers: true, label: 'TAKE',              // ground decal on the zone(s)
//   idleHint: true,                            // false: never the idle "Pick up {name}!" hint (e.g. a silo)
// }
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { Parts } from '../geom.js';
import { createStore, pickupCap, receiveCap, zoneOf, ptOf, isNum, asList, zoneMarker, placeholder, showAll } from './kit.js';

/** Build the kind list of a pile-like def: items | item | supply kinds. */
export function pileKinds(def) {
  const set = [];
  const add = (k) => { if (k && set.indexOf(k) < 0) set.push(k); };
  for (const k of asList(def.items)) add(k);
  add(def.item);
  const s = def.supply;
  if (s) { for (const k of asList(s.items)) add(k); add(s.item); if (s.mix) for (const k of Object.keys(s.mix)) add(k); }
  return set;
}

export function createPile(G, def) {
  const kinds = pileKinds(def);
  if (!kinds.length) throw new Error(`pile '${def.id}': no item kinds (items / item / supply)`);
  for (const k of kinds) if (!getItem(k)) throw new Error(`pile '${def.id}': item '${k}' is not registered`);
  const capacity = Math.max(1, (def.capacity ?? 40) | 0);
  const supply = def.supply || null;
  // per-kind cap: a mixed supply must never fill the pile with one kind and starve the others
  let kindCap = def.kindCap;
  if (kindCap == null && supply && kinds.length > 1) kindCap = Math.ceil(capacity / kinds.length);
  const L = { x: def.x, z: def.z, cols: 3, rows: 2, ...(def.layout || {}) };
  const store = createStore(G, { kinds, capacity, kindCap, infinite: !!def.infinite, layout: L });
  const pos = { x: def.x, z: def.z };
  const zone = zoneOf(def.zone, def.x, def.z, 1.6);
  const dropZone = def.dropZone ? zoneOf(def.dropZone, def.x, def.z, 1.6) : null;

  // supply: kinds cycled from the mix table
  const mixKinds = [], mixN = [];
  if (supply) {
    if (supply.mix) for (const k of Object.keys(supply.mix)) { mixKinds.push(k); mixN.push(Math.max(1, supply.mix[k] | 0)); }
    else for (const k of (supply.items ? asList(supply.items) : [supply.item || kinds[0]])) { mixKinds.push(k); mixN.push(1); }
  }
  const T = { t: supply ? (supply.every ?? 6) - (supply.first ?? 1) : 0, queue: 0, qT: 0, mi: 0, mj: 0, delivered: 0 };

  // visuals
  const palletW = (store.layout.cols) * ((L.dx ?? (getItem(kinds[0]).footprint.w + 0.06))) + 0.3;
  const palletD = (store.layout.rows) * ((L.dz ?? (getItem(kinds[0]).footprint.d + 0.06))) + 0.3;
  let pallet = null;
  if (def.pallet !== false && def.placeholder !== false) {
    const p = new Parts();
    p.box(0xb0794a, palletW, 0.06, palletD, [0, 0.03, 0]);
    pallet = placeholder(G, p, L.x, L.z, L.yaw || 0);
  }
  if (pallet && !(L.y > 0)) store.layout.y = 0.08;
  const markers = def.markers === false ? [] : [zoneMarker(G, zone, def.label || 'TAKE')];
  if (dropZone && def.markers !== false) markers.push(zoneMarker(G, dropZone, def.dropLabel || 'DROP'));

  const ev = { station: null, stationId: def.id, n: 0 };
  const recv = receiveCap(store);
  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    store,
    pickup: pickupCap(store, zone, { interval: def.interval, action: def.action, idleHint: def.idleHint }),
    receive: recv,
    drop: dropZone ? { zone: dropZone, workerSpot: ptOf(def.workerSpot, dropZone.x, dropZone.z), face: pos, ...recv } : null,
    workerSpot: ptOf(def.workerSpot, zone.x, zone.z),
    /** 0..1 until the next supply batch (0 when there is no supply) */
    get supplyProgress() { return supply ? Math.min(1, T.t / (supply.every ?? 6)) : 0; },
    get count() { return store.count; },
    get fill() { return store.count / capacity; },
    get delivered() { return T.delivered; },
    meshes: { pallet, markers },
    activate(live) {
      store.setVisible(true);
      showAll(G, [pallet], live);
      showAll(G, markers, false);
    },
    update(dt) {
      if (!station.active) return;
      if (supply && !store.infinite) {
        const every = supply.every ?? 6;
        T.t += supply.rateStat ? dt * (G.stats[supply.rateStat] || 1) : dt;   // rateStat: a G.stats key that speeds deliveries up
        if (T.t >= every) {
          T.t -= every;
          if (T.t > every) T.t = 0;
          T.queue += supply.amount ?? 6;
          ev.station = station;
          ev.n = supply.amount ?? 6;
          G.events.emit('pile:supply', ev);
        }
        if (T.queue > 0) {
          T.qT += dt;
          const st = supply.stagger ?? 0.06;
          let guard = 64;
          while (T.queue > 0 && (st <= 0 || T.qT >= st) && guard-- > 0) {
            T.qT -= st;
            T.queue--;
            // next kind from the mix that still fits
            for (let tries = 0; tries < mixKinds.length; tries++) {
              const k = mixKinds[T.mi];
              T.mj++;
              if (T.mj >= mixN[T.mi]) { T.mj = 0; T.mi = (T.mi + 1) % mixKinds.length; }
              if (store.add(k)) { T.delivered++; break; }
            }
          }
          if (T.queue <= 0) T.qT = 0;
        }
      }
      store.update(dt);
    },
    serialize() { return { n: store.serialize(), t: Math.round(T.t * 100) / 100, q: T.queue }; },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      store.restore(d.n);
      if (supply && isNum(d.t)) T.t = Math.max(0, Math.min(supply.every ?? 6, d.t));
      if (isNum(d.q) && d.q > 0) T.queue = Math.min(capacity, d.q | 0);
    },
  };
  // starting stock (restore(), which runs after create when there is a save, replaces it)
  if (def.start != null) {
    const s = isNum(def.start) ? (kinds.length === 1 ? { [kinds[0]]: def.start } : null) : def.start;
    if (isNum(def.start) && kinds.length > 1) {
      // spread a number over the kinds
      const each = {};
      for (let i = 0; i < kinds.length; i++) each[kinds[i]] = Math.floor(def.start / kinds.length) + (i < def.start % kinds.length ? 1 : 0);
      store.restore(each);
    } else if (s) store.restore(s);
  }
  return station;
}

registerStationType('pile', { create: createPile, describe: 'stock of items with optional timed supply; pickup zone (+ optional drop zone)' });
