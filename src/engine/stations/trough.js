// Station type 'trough': a consumable booster. Feed dropped into it fills it; it drains
// over time; while it is not empty the `source` stations it boosts regrow faster (through
// the source type's `regrowRate` hook). Empty = base rate, never zero. Capability: drop
// zone. Full schema: docs/STATIONS.md.
//
// def = {
//   id, type: 'trough', name, open, x, z,
//   item: 'feed' | items: [...],   // accepted kinds
//   capacity: 20,                  // units (one item = `unitsPerItem` units, default 1)
//   start: 0,                      // starting units (first boot)
//   drain: 0.25,                   // units per second while draining
//   drainIdle: false,              // false: drains only while a boosted source is regrowing
//   boosts: [{ station: 'nests', multiplier: 2, stat: 'feedBoost' }],   // stat (optional) multiplies the multiplier
//   dropZone: { x, z, r }, workerSpot,
//   trough: { len: 3, depth: 0.9, h: 0.6, yaw: 0 },   // placeholder size (also the blocker)
//   color: 0xe0b44c, placeholder: true, markers: true, label: 'FEED', blockers,
// }
// The boosted source must call `troughBoost` from its regrowRate. The trough installs it
// automatically when the source is listed AFTER the trough in world.stations; otherwise
// write `regrowRate: troughBoost` (import { troughBoost } from this file) on the source.
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { Parts } from '../geom.js';
import { zoneOf, ptOf, isNum, asList, zoneMarker, placeholder, showAll } from './kit.js';

// per-G registry: source id -> [{ trough, multiplier, stat }]
const boostMaps = new WeakMap();
function boostMap(G) {
  let m = boostMaps.get(G);
  if (!m) { m = new Map(); boostMaps.set(G, m); }
  return m;
}

/**
 * The regrowRate hook for a boosted source: product of the multipliers of every trough
 * that boosts it and is not empty (1 when none). Allocation-free.
 */
export function troughBoost(G, station) {
  const list = boostMap(G).get(station.id);
  if (!list) return 1;
  let k = 1;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.trough.active && b.trough.amount > 0) k *= b.multiplier * (b.stat ? (G.stats[b.stat] || 1) : 1);
  }
  return k;
}
troughBoost.__trough = true;

function createTrough(G, def) {
  const kinds = asList(def.items).concat(def.item ? [def.item] : []);
  if (!kinds.length) throw new Error(`trough '${def.id}': item required`);
  for (const k of kinds) if (!getItem(k)) throw new Error(`trough '${def.id}': item '${k}' is not registered`);
  const accepts = (kind) => kinds.indexOf(kind) >= 0;
  const capacity = Math.max(1, def.capacity ?? 20);
  const unit = def.unitsPerItem > 0 ? def.unitsPerItem : 1;
  const drain = def.drain ?? 0.25;
  const D = { len: 3, depth: 0.9, h: 0.6, yaw: 0, ...(def.trough || {}) };
  const x = def.x, z = def.z;
  const pos = { x, z };
  const cosY = Math.cos(D.yaw), sinY = Math.sin(D.yaw);
  const dropZone = zoneOf(def.dropZone, x - (D.depth / 2 + 1.4) * cosY, z + (D.depth / 2 + 1.4) * sinY, 1.5);
  const S = { amount: isNum(def.start) ? Math.max(0, Math.min(capacity, def.start)) : 0, pending: 0, boosting: false, fed: 0 };

  // boosts: register, and install the hook on sources listed after this trough
  const boosts = asList(def.boosts).map((b) => ({ id: b.station, trough: null, multiplier: b.multiplier ?? 2, stat: b.stat || null }));
  const defs = G.world.stations || [];
  const myIndex = defs.indexOf(def);
  for (const b of boosts) {
    const idx = defs.findIndex((d) => d.id === b.id);
    if (idx < 0) { console.warn(`[trough] '${def.id}' boosts unknown station '${b.id}'`); continue; }
    const sd = defs[idx];
    const fn = sd.regrowRate;
    if (!(fn && fn.__trough)) {
      if (idx > myIndex) {
        const wrapped = typeof fn === 'function' ? (g, st) => fn(g, st) * troughBoost(g, st) : troughBoost;
        wrapped.__trough = true;
        sd.regrowRate = wrapped;
      } else {
        console.warn(`[trough] '${def.id}': source '${b.id}' is created before the trough; give it regrowRate: troughBoost (see docs/STATIONS.md)`);
      }
    }
  }
  const sources = [];   // resolved lazily

  // visuals: a box trough with a feed slab whose height follows the level
  let body = null, fill = null;
  const fillH = D.h * 0.75;
  if (def.placeholder !== false) {
    const p = new Parts();
    const wall = 0.1;
    p.box(0x9c6b3e, D.depth, 0.1, D.len, [0, 0.12, 0]);
    p.box(0xb98048, wall, D.h, D.len, [D.depth / 2 - wall / 2, D.h / 2, 0]);
    p.box(0xb98048, wall, D.h, D.len, [-D.depth / 2 + wall / 2, D.h / 2, 0]);
    p.box(0xb98048, D.depth, D.h, wall, [0, D.h / 2, D.len / 2 - wall / 2]);
    p.box(0xb98048, D.depth, D.h, wall, [0, D.h / 2, -D.len / 2 + wall / 2]);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) p.box(0x7a4f2a, 0.12, 0.2, 0.12, [sx * (D.depth / 2 - 0.08), 0.06, sz * (D.len / 2 - 0.08)]);
    body = placeholder(G, p, x, z, D.yaw);
    const fc = def.color ?? 0xe0b44c;
    fill = new THREE.Mesh(new THREE.BoxGeometry(D.depth - 0.22, 1, D.len - 0.22).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: fc }));
    fill.position.y = 0.17;
    fill.scale.y = 0.001;
    fill.receiveShadow = true;
    body.add(fill);
  }
  const markers = def.markers === false ? [] : [zoneMarker(G, dropZone, def.label || 'FEED')];
  const hx = (Math.abs(cosY) * D.depth + Math.abs(sinY) * D.len) / 2, hz = (Math.abs(sinY) * D.depth + Math.abs(cosY) * D.len) / 2;
  const blockers = def.blockers === false ? null : Array.isArray(def.blockers) ? def.blockers : [{ x, z, hx, hz }];

  const ev = { station: null, stationId: def.id, boosting: false, level: 0 };
  const station = {
    pos,
    name: def.name || def.id,
    active: false,
    blockers,
    /** current units */
    get amount() { return S.amount; },
    /** 0..1 */
    get level() { return S.amount / capacity; },
    get boosting() { return S.boosting; },
    get fed() { return S.fed; },
    capacity,
    drop: {
      zone: dropZone,
      face: pos,
      workerSpot: ptOf(def.workerSpot, dropZone.x, dropZone.z),
      accepts,
      room() { return Math.max(0, Math.floor((capacity - S.amount) / unit + 1e-6) - S.pending); },
      target(out) { return out.set(x, 0.2 + fillH * Math.min(1, S.amount / capacity) + 0.1, z); },
      expect() { S.pending++; },
      give() {
        if (S.pending > 0) S.pending--;
        S.amount = Math.min(capacity, S.amount + unit);
        S.fed++;
      },
      /** need at or above this makes it an urgent hint goal (def.urgent; > 1 disables) */
      urgent: def.urgent ?? 0.75,
      /** 0..1: how badly it wants feed */
      get need() { return 1 - Math.min(1, (S.amount + S.pending * unit) / capacity); },
    },
    meshes: { body, fill, markers },
    activate(live) {
      showAll(G, [body], live);
      showAll(G, markers, false);
    },
    update(dt) {
      if (!station.active) return;
      if (sources.length < boosts.length && G.stations) {
        sources.length = 0;
        for (const b of boosts) { const st = G.stations.get(b.id); if (st) sources.push(st); }
      }
      if (S.amount > 0 && drain > 0) {
        let draining = !!def.drainIdle;
        if (!draining) {
          for (let i = 0; i < sources.length; i++) {
            const st = sources[i];
            if (st.active && st.harvest && st.harvest.available < st.harvest.total) { draining = true; break; }
          }
        }
        if (draining) S.amount = Math.max(0, S.amount - drain * dt);
      }
      const on = S.amount > 0;
      if (on !== S.boosting) {
        S.boosting = on;
        ev.station = station; ev.boosting = on; ev.level = S.amount / capacity;
        G.events.emit('trough', ev);
      }
      if (fill) fill.scale.y = Math.max(0.001, fillH * Math.min(1, S.amount / capacity));
    },
    serialize() { return { amount: Math.round((S.amount + S.pending * unit) * 100) / 100 }; },
    restore(d) {
      if (d && isNum(d.amount)) S.amount = Math.max(0, Math.min(capacity, d.amount));
    },
  };
  const bm = boostMap(G);
  for (const b of boosts) {
    b.trough = station;
    if (!bm.has(b.id)) bm.set(b.id, []);
    bm.get(b.id).push(b);
  }
  return station;
}

registerStationType('trough', { create: createTrough, describe: 'consumable booster: drop zone; boosts sources while not empty' });
