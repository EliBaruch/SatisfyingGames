// Shared building blocks for the station types pile, converter, trough, shelf, checkout
// and cashpile (docs/STATIONS.md). Not a station type itself.
//
//   createStore(G, opts)        counted, visible stock of item kinds laid out in a grid of stacks
//                               (pile stock, machine input bay / output, shelf display)
//   pickupCap(store, zone, o)   the standard pickup capability on top of a store
//   receiveCap(store, o)        accepts / room / target / expect / give on top of a store
//   createCashPile(G, pile, o)  a cash pile (bills, flying bills, the `cash` capability, deposit)
//   zoneMarker(G, zone, text)   ground decal marking a zone (hidden until shown)
//   placeholder(G, parts)       a merged code-built prop mesh (hidden until shown)
//
// Everything here is allocation-free per step once built.
import * as THREE from 'three';
import { getItem } from '../registry.js';
import { itemGeometry, itemMaterial } from '../items.js';
import { meshOf } from '../geom.js';
import { makeDropDecal, makeCashDecal } from '../decals.js';

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const asList = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);
export function hash(i, s) {
  const x = Math.sin(i * 91.7 + s * 47.3) * 24634.6345;
  return (x - Math.floor(x)) * 2 - 1;
}
export function popScale(u) { return 0.4 + 0.6 * u + Math.sin(u * Math.PI) * 0.45; }
export function angLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
/** Zone {x, z, r} from a def value ({x,z,r} or [x, z, r]) with defaults. */
export function zoneOf(v, fx, fz, fr) {
  if (Array.isArray(v)) return { x: v[0], z: v[1], r: v[2] ?? fr };
  if (v && typeof v === 'object') return { x: v.x ?? fx, z: v.z ?? fz, r: v.r ?? fr };
  return { x: fx, z: fz, r: fr };
}
export function ptOf(v, fx, fz) {
  if (Array.isArray(v)) return { x: v[0], z: v[1] };
  if (v && typeof v === 'object') return { x: v.x ?? fx, z: v.z ?? fz, yaw: v.yaw };
  return { x: fx, z: fz };
}
/** Squared-distance zone test. */
export function inZone(zone, x, z) {
  const dx = x - zone.x, dz = z - zone.z;
  return dx * dx + dz * dz <= zone.r * zone.r;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const POP_TIME = 0.22;

// ------------------------------------------------------------------ store
/**
 * A stock of items (any registered kinds, mixed) drawn as a grid of stacks.
 * opts = {
 *   kinds: ['egg'],          // accepted kinds (required, all registered)
 *   capacity: 40,            // max items (infinite: always shows `capacity` and never runs out)
 *   kindCap: { egg: 20 } | n // optional per-kind cap (number = same for all)
 *   infinite: false,
 *   layout: { x, z, y: 0, yaw: 0, cols: 3, rows: 2, dx, dz, layerH, layers: [y0, y1, ...], maxDrawn }
 *     slot i: layer = floor(i / (cols*rows)), cell = i % (cols*rows), col = cell % cols, row = cell / cols
 *     dx/dz default to the widest footprint + 0.06; layerH defaults to the tallest step;
 *     `layers` (absolute heights above y) overrides layerH (shelf levels); items past the
 *     last listed layer, or past maxDrawn, are counted but not drawn.
 * }
 */
export function createStore(G, o) {
  const kinds = o.kinds.slice();
  const its = kinds.map((k) => {
    const it = getItem(k);
    if (!it) throw new Error(`unknown item kind '${k}'`);
    return it;
  });
  const capacity = Math.max(1, o.capacity | 0);
  const infinite = !!o.infinite;
  const L = { x: 0, z: 0, y: 0, yaw: 0, cols: 3, rows: 2, ...(o.layout || {}) };
  let maxW = 0, maxD = 0, maxStep = 0;
  for (const it of its) { maxW = Math.max(maxW, it.footprint.w); maxD = Math.max(maxD, it.footprint.d); maxStep = Math.max(maxStep, it.step); }
  const cols = Math.max(1, L.cols | 0), rows = Math.max(1, L.rows | 0);
  const dx = L.dx ?? maxW + 0.06, dz = L.dz ?? maxD + 0.06;
  const layerH = L.layerH ?? maxStep;
  const perLayer = cols * rows;
  const layerList = Array.isArray(L.layers) ? L.layers : null;
  const drawCap = layerList ? perLayer * layerList.length : Infinity;
  const maxDrawn = Math.max(1, Math.min(capacity, L.maxDrawn ?? 96, drawCap));
  const cosY = Math.cos(L.yaw), sinY = Math.sin(L.yaw);
  const kindIndex = {};
  kinds.forEach((k, i) => { kindIndex[k] = i; });
  const kindCap = {};
  for (const k of kinds) kindCap[k] = typeof o.kindCap === 'number' ? o.kindCap : (o.kindCap && isNum(o.kindCap[k]) ? o.kindCap[k] : capacity);

  // state (numbers on objects / typed arrays: no per-step allocation)
  const slots = new Array(capacity).fill(null);   // kind per slot, bottom -> top
  const cnt = {}, pend = {};
  for (const k of kinds) { cnt[k] = 0; pend[k] = 0; }
  const S = { n: 0, pending: 0, dirty: true, anim: false };
  const popAge = new Float32Array(maxDrawn).fill(1);

  // meshes, one InstancedMesh per kind
  const meshes = its.map((it) => {
    const m = new THREE.InstancedMesh(itemGeometry(it), itemMaterial(it), maxDrawn);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.receiveShadow = false;
    m.count = 0;
    m.visible = false;
    const h = (layerList ? layerList[layerList.length - 1] : Math.ceil(maxDrawn / perLayer) * layerH) + 1;
    const rad = Math.hypot(cols * dx, rows * dz) / 2 + h / 2 + 0.5;
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(L.x, (L.y || 0) + h / 2, L.z), rad);
    G.scene.add(m);
    return m;
  });

  function slotLocal(i, out) {
    const layer = (i / perLayer) | 0;
    const cell = i - layer * perLayer;
    const c = cell % cols, r = (cell / cols) | 0;
    const lx = (c - (cols - 1) / 2) * dx + hash(i, 1) * 0.02;
    const lz = (r - (rows - 1) / 2) * dz + hash(i, 2) * 0.02;
    const y = layerList ? layerList[Math.min(layer, layerList.length - 1)] : layer * layerH;
    out.x = L.x + lx * cosY + lz * sinY;
    out.z = L.z - lx * sinY + lz * cosY;
    out.y = (L.y || 0) + y;
    return out;
  }

  const store = {
    kinds, capacity, infinite, layout: L, meshes, maxDrawn,
    get count() { return infinite ? capacity : S.n; },
    get pending() { return S.pending; },
    countOf(kind) { return infinite ? (kind in cnt ? capacity : 0) : (cnt[kind] || 0); },
    accepts(kind) { return kind in kindIndex; },
    /** room for one more `kind` (null: any kind) counting items in flight */
    roomFor(kind) {
      if (infinite) return 0;
      const total = capacity - S.n - S.pending;
      if (kind == null) return Math.max(0, total);
      if (!(kind in kindIndex)) return 0;
      return Math.max(0, Math.min(total, kindCap[kind] - cnt[kind] - pend[kind]));
    },
    room() { return infinite ? 0 : Math.max(0, capacity - S.n - S.pending); },
    has(pred) {
      if (infinite) { for (let i = 0; i < kinds.length; i++) if (!pred || pred(kinds[i])) return true; return false; }
      for (let i = S.n - 1; i >= 0; i--) if (!pred || pred(slots[i])) return true;
      return false;
    },
    /** Add one item (no flight). Returns false if there is no room. */
    add(kind) {
      if (infinite || !(kind in kindIndex)) return false;
      if (S.n >= capacity || cnt[kind] >= kindCap[kind]) return false;
      if (S.n < maxDrawn) popAge[S.n] = 0;
      slots[S.n++] = kind;
      cnt[kind]++;
      S.dirty = true;
      return true;
    },
    /** Remove and return the topmost item whose kind satisfies pred (null = any). */
    remove(pred) {
      if (infinite) {
        for (let i = 0; i < kinds.length; i++) if (!pred || pred(kinds[i])) return kinds[i];
        return null;
      }
      for (let i = S.n - 1; i >= 0; i--) {
        const k = slots[i];
        if (pred && !pred(k)) continue;
        for (let j = i; j < S.n - 1; j++) { slots[j] = slots[j + 1]; if (j + 1 < maxDrawn) popAge[j] = popAge[j + 1]; }
        S.n--;
        slots[S.n] = null;
        cnt[k]--;
        S.dirty = true;
        return k;
      }
      return null;
    },
    /** Remove the topmost item of exactly `kind`. */
    removeKind(kind) {
      if (infinite) return kind in kindIndex ? kind : null;
      for (let i = S.n - 1; i >= 0; i--) {
        if (slots[i] !== kind) continue;
        for (let j = i; j < S.n - 1; j++) { slots[j] = slots[j + 1]; if (j + 1 < maxDrawn) popAge[j] = popAge[j + 1]; }
        S.n--;
        slots[S.n] = null;
        cnt[kind]--;
        S.dirty = true;
        return kind;
      }
      return null;
    },
    /** World position of slot i (bottom of the item). */
    slotWorld(i, out) { return slotLocal(Math.max(0, Math.min(i, maxDrawn - 1)), out); },
    /** Where the top item sits (for items leaving the store). */
    topWorld(out) {
      const i = Math.min(Math.max(0, store.count - 1), maxDrawn - 1);
      slotLocal(i, out);
      out.y += layerH * 0.6;
      return out;
    },
    /** Where the next arriving item should fly to. */
    nextWorld(out) { return slotLocal(Math.min(S.n + S.pending, maxDrawn - 1), out); },
    expect(kind) { if (kind in pend) { pend[kind]++; S.pending++; } },
    /** An item arrived (after expect, or directly). Returns false if it did not fit (lost). */
    give(kind) {
      if (kind in pend && pend[kind] > 0) { pend[kind]--; S.pending--; }
      return store.add(kind);
    },
    /** { kind: count } including items in flight toward the store. */
    serialize() {
      const out = {};
      for (const k of kinds) { const n = cnt[k] + pend[k]; if (n > 0) out[k] = n; }
      return out;
    },
    /** Restore from { kind: count } (or a plain number when there is one kind). Validates. */
    restore(d) {
      store.clear();
      if (infinite || d == null) return;
      if (isNum(d) && kinds.length === 1) d = { [kinds[0]]: d };
      if (typeof d !== 'object') return;
      // interleave kinds so a mixed pile looks mixed
      const want = {};
      let left = 0;
      for (const k of kinds) { const n = isNum(d[k]) && d[k] > 0 ? Math.floor(d[k]) : 0; want[k] = n; left += n; }
      let guard = capacity * 2 + 8;
      while (left > 0 && guard-- > 0) {
        for (const k of kinds) if (want[k] > 0) { want[k]--; left--; if (!store.add(k)) want[k] = 0; }
      }
      for (let i = 0; i < maxDrawn; i++) popAge[i] = 1;
    },
    clear() {
      for (let i = 0; i < S.n; i++) slots[i] = null;
      S.n = 0; S.pending = 0;
      for (const k of kinds) { cnt[k] = 0; pend[k] = 0; }
      S.dirty = true;
    },
    setVisible(v) { for (const m of meshes) m.visible = v; },
    /** Kind of slot i (bottom = 0), or null. */
    kindAt(i) { return infinite ? kinds[i % kinds.length] : slots[i] || null; },
    update(dt) {
      if (!S.dirty && !S.anim) return;
      S.dirty = false;
      S.anim = false;
      for (let t = 0; t < meshes.length; t++) meshes[t].count = 0;
      const n = Math.min(store.count, maxDrawn);
      for (let i = 0; i < n; i++) {
        const k = infinite ? kinds[i % kinds.length] : slots[i];
        const m = meshes[kindIndex[k]];
        let s = 1;
        if (popAge[i] < 1) {
          popAge[i] = Math.min(1, popAge[i] + dt / POP_TIME);
          s = popScale(popAge[i]);
          if (popAge[i] < 1) S.anim = true;
        }
        slotLocal(i, _p);
        _q.setFromAxisAngle(UP, L.yaw + hash(i, 3) * 0.06);
        _s.set(s, s, s);
        _m.compose(_p, _q, _s);
        m.setMatrixAt(m.count++, _m);
      }
      for (let t = 0; t < meshes.length; t++) meshes[t].instanceMatrix.needsUpdate = true;
    },
  };
  return store;
}

// ------------------------------------------------------------ capabilities
/**
 * Standard pickup capability on a store. `o.onTake(kind)` is called after each take.
 * take(accept): topmost item `accept` accepts (null = any); has(pred); count(kind);
 * accepts(kind): the store holds this kind. Handing an item back: backRoom(kind) (Infinity for an
 * infinite store, which just absorbs it), expectBack(kind) when it starts flying, giveBack(kind)
 * when it lands (counted in saves while in flight, like any arriving item).
 */
export function pickupCap(store, zone, o = {}) {
  return {
    zone,
    interval: o.interval || 0,
    action: o.action || 'pickup',
    idleHint: o.idleHint !== false,
    get available() { return store.count; },
    take(accept) {
      const k = store.remove(accept || null);
      if (k !== null && o.onTake) o.onTake(k);
      return k;
    },
    has(pred) { return store.has(pred || null); },
    count(kind) { return store.countOf(kind); },
    accepts(kind) { return store.accepts(kind); },
    backRoom(kind) { return store.infinite ? (store.accepts(kind) ? Infinity : 0) : store.roomFor(kind); },
    expectBack(kind) { if (!store.infinite) store.expect(kind); },
    giveBack(kind) { return store.infinite ? store.accepts(kind) : store.give(kind); },
    from(out) { return store.topWorld(out); },
  };
}

/** accepts / room / target / expect / give on a store (the hand-over contract of a drop zone). */
export function receiveCap(store, o = {}) {
  const accepts = o.accepts || ((kind) => store.accepts(kind));
  return {
    accepts,
    room() { return store.room(); },
    roomFor(kind) { return store.roomFor(kind); },
    target(out) { return store.nextWorld(out).setY(out.y + 0.05); },
    expect(kind) { store.expect(kind); },
    give(kind) { store.give(kind); if (o.onGive) o.onGive(kind); },
  };
}

// --------------------------------------------------------------- cash pile
const PILE_COLS = 3, PILE_ROWS = 4;
/**
 * A cash pile at pileDef {x, z, r}. opts.bundle: money per drawn bill bundle (number or
 * function, default 12 x priceMult). Returns { cash (capability), deposit(amount, from?),
 * activate(), update(dt), get amount, set amount }.
 * deposit(amount, from): adds money at once; with `from` (a Vector3-like) a bill flies from
 * there to the pile and the pile grows when it lands.
 */
export function createCashPile(G, pileDef, opts = {}) {
  const pile = { x: pileDef.x, z: pileDef.z, r: pileDef.r ?? 1.5 };
  const cashIt = getItem('cash');
  const BILL = { step: cashIt ? cashIt.step : 0.12 };
  const maxBills = Math.min(84, opts.maxBills || 84);   // 7 layers of 12, like the shop's own pile
  const px = new Float32Array(maxBills), py = new Float32Array(maxBills), pz = new Float32Array(maxBills), pyaw = new Float32Array(maxBills);
  const per = PILE_COLS * PILE_ROWS;
  for (let i = 0; i < maxBills; i++) {
    const layer = (i / per) | 0, j = i - layer * per;
    const c = j % PILE_COLS, r = (j / PILE_COLS) | 0;
    px[i] = pile.x + (c - (PILE_COLS - 1) / 2) * 0.72 + hash(i, 4) * 0.03;
    pz[i] = pile.z + (r - (PILE_ROWS - 1) / 2) * 0.42 + hash(i, 5) * 0.03;
    py[i] = layer * BILL.step;
    pyaw[i] = hash(i, 6) * 0.09;
  }
  const pop = new Float32Array(maxBills).fill(1);
  const S = { cash: 0, shown: 0, dirty: true, anim: false, flightSum: 0, head: 0, tail: 0 };
  const flight = new Float64Array(128);
  let mesh = null;
  const bundleFn = typeof opts.bundle === 'function' ? opts.bundle : null;
  const bundleValue = () => Math.max(1, bundleFn ? bundleFn() : (opts.bundle ?? 12) * (G.stats.priceMult || 1));

  function write(i, s) {
    _p.set(px[i], py[i], pz[i]);
    _q.setFromAxisAngle(UP, pyaw[i]);
    _s.set(s, s, s);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
  }
  function top(out) {
    const i = Math.max(0, S.shown - 1);
    return out.set(px[i], py[i] + BILL.step, pz[i]);
  }
  const onLand = () => {
    if (S.head !== S.tail) {
      S.flightSum -= flight[S.head];
      S.head = (S.head + 1) & 127;
      if (S.flightSum < 0.01) S.flightSum = Math.max(0, S.flightSum);
    }
    S.dirty = true;
  };
  const fromV = new THREE.Vector3();
  const billOpts = { kind: 'cash', from: fromV, to: (o) => top(o), dur: 0.42, arc: 1.4, onDone: onLand };

  const cash = {
    pile,
    get amount() { return S.cash; },
    take(max) {
      const n = Math.max(0, Math.min(S.cash, max));
      S.cash -= n;
      if (S.cash < 1e-9) S.cash = 0;
      S.dirty = true;
      return n;
    },
    top,
    bundleValue,
    deposit,
  };
  function deposit(amount, from) {
    if (!(amount > 0)) return;
    S.cash += amount;
    S.dirty = true;
    if (from && G.fx && G.fx.fly && ((S.tail + 1) & 127) !== S.head) {
      flight[S.tail] = amount;
      S.tail = (S.tail + 1) & 127;
      S.flightSum += amount;
      fromV.set(from.x, from.y ?? 1, from.z);
      billOpts.dur = 0.38 + Math.random() * 0.1;
      G.fx.fly(billOpts);
    }
  }
  return {
    cash,
    deposit,
    get amount() { return S.cash; },
    set amount(v) { S.cash = isNum(v) && v > 0 ? v : 0; S.dirty = true; },
    activate() {
      if (mesh) { mesh.visible = true; return; }
      mesh = new THREE.InstancedMesh(itemGeometry('cash'), itemMaterial('cash'), maxBills);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = false;     // flat bills on the ground: a shadow pass per pile is not worth it
      mesh.count = 0;
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(pile.x, 0.6, pile.z), 2.4);
      for (let i = 0; i < maxBills; i++) write(i, 1);
      G.scene.add(mesh);
      S.dirty = true;
    },
    update(dt) {
      if (!mesh || (!S.dirty && !S.anim)) return;
      S.dirty = false;
      const shownCash = Math.max(0, S.cash - S.flightSum);
      const want = Math.max(0, Math.min(maxBills, Math.ceil(shownCash / bundleValue() - 1e-6)));
      if (want > S.shown) for (let i = S.shown; i < want; i++) pop[i] = 0;
      S.shown = want;
      mesh.count = want;
      S.anim = false;
      let changed = false;
      for (let i = Math.max(0, want - 16); i < want; i++) {
        if (pop[i] < 1) {
          pop[i] = Math.min(1, pop[i] + dt / 0.25);
          write(i, popScale(pop[i]));
          changed = true;
          if (pop[i] < 1) S.anim = true;
        }
      }
      if (changed) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// ----------------------------------------------------------------- visuals
/** Ground decal over a zone (dashed square with text), hidden until `.visible = true`. */
export function zoneMarker(G, zone, text, cash = false) {
  const size = Math.max(1.6, zone.r * 2);
  const d = cash ? makeCashDecal(size) : makeDropDecal(text || '', size);
  d.position.x = zone.x;
  d.position.z = zone.z;
  d.visible = false;
  G.scene.add(d);
  return d;
}

/** A Parts collection merged into one shadow-casting mesh, hidden until shown. */
export function placeholder(G, parts, x = 0, z = 0, yaw = 0) {
  const m = meshOf(parts.merged(), { receive: true });
  m.position.set(x, 0, z);
  m.rotation.y = yaw;
  m.visible = false;
  G.scene.add(m);
  return m;
}

/** Show a list of objects (skips nulls); `live` pops them in. */
export function showAll(G, list, live) {
  for (const o of list) {
    if (!o) continue;
    o.visible = true;
    if (live && G.fx && G.fx.popIn) G.fx.popIn(o);
  }
}
