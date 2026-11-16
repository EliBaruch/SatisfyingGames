// Station type 'belt': a conveyor. Items ride along a path from one station to another, one
// after the other, and queue up visibly when the far end has no room. Not built in: a world lists
// '../../engine/stations/belt.js' in its `modules`. See docs/STATIONS.md.
//
// def = {
//   id, type: 'belt', name, open,
//   path: [[x, z], [x, z], ...],     // REQUIRED: the centre line, start -> end (2+ points)
//   kinds: ['cell'],                 // REQUIRED: item kinds it may carry
//   to: 'stationId',                 // REQUIRED: receiver; its `receive` (pile) or `drop` (machine input, shelf) gets the items
//   from: 'stationId',               // optional: pull items from this station's pickup zone (a hopper, a
//                                    //   machine's output pile). Without it the belt is fed through its own
//                                    //   `receive`: a converter with `outputTo: '<this belt>'`.
//   speed: 2.4,                      // world units per second
//   speedStat: 'beltSpeed',          // optional G.stats key multiplying the speed
//   gap: 0.75,                       // distance between items (capacity = floor(length / gap) + 1)
//   interval: 0,                     // min seconds between pulls from `from` (0 = as fast as the gap allows)
//   y: 0.62,                         // height of the belt surface
//   width: 0.95,
//   overhead: false,                 // true: a high belt on posts the player walks under (no blockers)
//   placeholder: true,               // code-built belt body (frame, running rubber, legs); false: the scene draws it
//   blockers: true | false | [...],  // default: the belt body (floor belts only)
// }
// Capability: `receive` { accepts, room, roomFor, target, expect, give } (no zones: the player does not
// use a belt directly). Readable: running (items are moving), count, capacity, fill, length, delivered,
// pointAt(s, out) (world position at distance s), meshes.{ body, top }.
// Save: { items: [kind, ...] } front first; items in flight toward the belt are counted.
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { itemGeometry, itemMaterial } from '../items.js';
import { Parts, meshOf } from '../geom.js';
import { litMaterial } from '../art/material.js';
import { canvasTex } from '../decals.js';
import { showAll } from './kit.js';

let _rubber = null;
function rubberTexture() {
  if (_rubber) return _rubber;
  _rubber = canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#3a404a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#4b525e'; ctx.fillRect(0, 6, w, h - 12);
    // chevrons pointing along +u (the travel direction)
    ctx.strokeStyle = '#6a7380'; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const x0 of [14, 78]) { ctx.beginPath(); ctx.moveTo(x0, 16); ctx.lineTo(x0 + 22, h / 2); ctx.lineTo(x0, h - 16); ctx.stroke(); }
    ctx.fillStyle = '#2c313a'; ctx.fillRect(0, 0, w, 5); ctx.fillRect(0, h - 5, w, 5);
  }, { repeat: true });
  return _rubber;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

function createBelt(G, def) {
  const pts = (def.path || []).map((p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : { x: p.x, z: p.z }));
  if (pts.length < 2) throw new Error(`belt '${def.id}': path needs at least 2 points`);
  const kinds = (def.kinds || []).slice();
  if (!kinds.length) throw new Error(`belt '${def.id}': kinds required`);
  const its = kinds.map((k) => { const it = getItem(k); if (!it) throw new Error(`belt '${def.id}': item '${k}' is not registered`); return it; });
  const kindIndex = {};
  kinds.forEach((k, i) => { kindIndex[k] = i; });

  // ---- path
  const segLen = [], cum = [0], yaws = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x, dz = pts[i + 1].z - pts[i].z;
    const l = Math.hypot(dx, dz);
    segLen.push(l); cum.push(cum[i] + l); yaws.push(Math.atan2(dx, dz));
  }
  const length = cum[cum.length - 1];
  const gap = def.gap > 0 ? def.gap : 0.75;
  const capacity = Math.max(1, Math.floor(length / gap) + 1);
  const baseY = def.overhead ? (def.y ?? 2.9) : (def.y ?? 0.62);
  const width = def.width || 0.95;
  const speed = def.speed > 0 ? def.speed : 2.4;
  const interval = def.interval > 0 ? def.interval : 0;

  function pointAt(s, out) {
    s = s < 0 ? 0 : s > length ? length : s;
    let i = 0;
    while (i < segLen.length - 1 && s > cum[i + 1]) i++;
    const u = segLen[i] > 0 ? (s - cum[i]) / segLen[i] : 0;
    out.x = pts[i].x + (pts[i + 1].x - pts[i].x) * u;
    out.z = pts[i].z + (pts[i + 1].z - pts[i].z) * u;
    out.y = baseY;
    out.w = yaws[i];     // heading, read by the caller right after
    return out;
  }

  // ---- state: FIFO, index 0 = the item nearest the end
  const S = new Float32Array(capacity + 2);
  const K = new Uint8Array(capacity + 2);
  const T = { n: 0, pending: 0, pullT: 0, running: false, delivered: 0, dirty: true, scroll: 0 };

  // ---- items: one InstancedMesh per kind
  const meshes = its.map((it) => {
    const m = new THREE.InstancedMesh(itemGeometry(it), itemMaterial(it), capacity + 2);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = false;        // dozens of items low on a belt: not worth a shadow pass
    m.count = 0;
    m.visible = false;
    let cx = 0, cz = 0;
    for (const p of pts) { cx += p.x; cz += p.z; }
    m.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx / pts.length, baseY, cz / pts.length), length / 2 + 2);
    G.scene.add(m);
    return m;
  });

  // ---- the belt body
  let body = null, top = null, topTex = null;
  if (def.placeholder !== false) {
    const p = new Parts();
    const FR = 0x8f9bab, DARK = 0x4a525e, LEG = 0x6d7887, POST = 0xf2b632;
    for (let i = 0; i < segLen.length; i++) {
      const l = segLen[i], mx = (pts[i].x + pts[i + 1].x) / 2, mz = (pts[i].z + pts[i + 1].z) / 2, yaw = yaws[i];
      const rot = [0, yaw, 0];
      p.box(DARK, width + 0.02, 0.14, l + (i < segLen.length - 1 ? width * 0.5 : 0), [mx, baseY - 0.09, mz], rot);       // bed
      for (const sd of [-1, 1]) {
        const ox = Math.cos(yaw) * sd * (width / 2 + 0.05), oz = -Math.sin(yaw) * sd * (width / 2 + 0.05);
        p.box(FR, 0.1, 0.24, l + 0.06, [mx + ox, baseY - 0.02, mz + oz], rot);                                          // side rails
      }
      // legs / posts
      const every = def.overhead ? 4.5 : 2.2;
      const nLeg = Math.max(2, Math.round(l / every) + 1);
      for (let k = 0; k < nLeg; k++) {
        const u = nLeg === 1 ? 0.5 : k / (nLeg - 1);
        const x = pts[i].x + (pts[i + 1].x - pts[i].x) * u, z = pts[i].z + (pts[i + 1].z - pts[i].z) * u;
        if (def.overhead) {
          p.box(POST, 0.22, baseY - 0.16, 0.22, [x, (baseY - 0.16) / 2, z], rot);
          p.box(DARK, width + 0.5, 0.12, 0.3, [x, baseY - 0.2, z], rot);
        } else {
          for (const sd of [-1, 1]) {
            const ox = Math.cos(yaw) * sd * (width / 2 - 0.04), oz = -Math.sin(yaw) * sd * (width / 2 - 0.04);
            p.box(LEG, 0.1, baseY - 0.14, 0.1, [x + ox, (baseY - 0.14) / 2, z + oz], rot);
          }
        }
      }
    }
    // end rollers
    for (const e of [0, pts.length - 1]) {
      const yaw = yaws[Math.min(e, yaws.length - 1)];
      p.cyl(0xc9d0d8, 0.1, 0.1, width + 0.04, [pts[e].x, baseY - 0.08, pts[e].z], [0, yaw, Math.PI / 2], 10);
    }
    body = meshOf(p.merged({ ao: def.overhead ? false : { ground: 0.18, groundH: 0.4, noBoxes: true } }), { receive: false });
    body.visible = false;
    G.scene.add(body);

    // running rubber: one ribbon with u = distance along the belt, v across
    const pos = [], uv = [], idx = [];
    const tile = 1.1;
    for (let i = 0; i < segLen.length; i++) {
      const yaw = yaws[i], c = Math.cos(yaw), s = Math.sin(yaw);
      const hx = c * (width / 2 - 0.02), hz = -s * (width / 2 - 0.02);
      const ext = i < segLen.length - 1 ? width * 0.25 : 0;   // tuck under the next segment at corners
      const ax = pts[i].x, az = pts[i].z, bx = pts[i + 1].x + s * ext, bz = pts[i + 1].z + c * ext;
      const b0 = pos.length / 3;
      pos.push(ax - hx, baseY - 0.015 + i * 0.001, az - hz, ax + hx, baseY - 0.015 + i * 0.001, az + hz, bx - hx, baseY - 0.015 + i * 0.001, bz - hz, bx + hx, baseY - 0.015 + i * 0.001, bz + hz);
      uv.push(cum[i] / tile, 0, cum[i] / tile, 1, (cum[i + 1] + ext) / tile, 0, (cum[i + 1] + ext) / tile, 1);
      idx.push(b0, b0 + 1, b0 + 2, b0 + 2, b0 + 1, b0 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    topTex = rubberTexture().clone(); topTex.needsUpdate = true;
    top = new THREE.Mesh(g, litMaterial({ map: topTex }));
    top.receiveShadow = true;
    top.visible = false;
    G.scene.add(top);
  }

  // ---- blockers: the body of a floor belt (axis-aligned boxes around each segment)
  let blockers = null;
  if (def.blockers !== false && !def.overhead) {
    if (Array.isArray(def.blockers)) blockers = def.blockers;
    else {
      blockers = [];
      for (let i = 0; i < segLen.length; i++) {
        const a = pts[i], b = pts[i + 1];
        blockers.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, hx: Math.abs(b.x - a.x) / 2 + width / 2 - 0.1, hz: Math.abs(b.z - a.z) / 2 + width / 2 - 0.1 });
      }
    }
  }

  // ---- hand-over
  let src = null, dst = null;
  const station = (id) => (id && G.stations ? G.stations.get(id) : null);
  const recvOf = (st) => (st ? st.receive || st.drop || null : null);
  const roomIn = (r, kind) => (r.roomFor ? r.roomFor(kind) : r.room());
  const wantKind = (kind) => {
    if (!(kind in kindIndex)) return false;
    const r = recvOf(dst);
    return !!r && r.accepts(kind);
  };

  function push(kind) {
    if (T.n >= capacity + 1) return false;
    S[T.n] = 0; K[T.n] = kindIndex[kind]; T.n++;
    T.dirty = true;
    return true;
  }

  const startV = new THREE.Vector3(pts[0].x, baseY + 0.05, pts[0].z);
  const receive = {
    accepts: (kind) => kind in kindIndex,
    room() { return Math.max(0, capacity - T.n - T.pending); },
    roomFor(kind) { return kind in kindIndex ? Math.max(0, capacity - T.n - T.pending) : 0; },
    target(out) { return out.copy(startV); },
    expect() { T.pending++; },
    give(kind) { if (T.pending > 0) T.pending--; if (kind in kindIndex) push(kind); },
  };

  const pt4 = { x: 0, y: 0, z: 0, w: 0 };
  const st = {
    pos: { x: (pts[0].x + pts[pts.length - 1].x) / 2, z: (pts[0].z + pts[pts.length - 1].z) / 2 },
    name: def.name || def.id,
    active: false,
    blockers,
    receive,
    length, capacity,
    get running() { return T.running; },
    get count() { return T.n; },
    get fill() { return T.n / capacity; },
    get delivered() { return T.delivered; },
    pointAt,
    meshes: { body, top, items: meshes },
    activate(live) {
      for (const m of meshes) m.visible = true;
      showAll(G, [body], live);
      if (top) top.visible = true;
    },
    update(dt) {
      if (!st.active) return;
      if (!dst) dst = station(def.to);
      if (def.from && !src) src = station(def.from);
      const sp = speed * (def.speedStat ? (G.stats[def.speedStat] || 1) : 1);
      const step = sp * dt;
      let moved = false;
      // advance, front first; each item stops behind the one in front
      for (let i = 0; i < T.n; i++) {
        const lim = i === 0 ? length : S[i - 1] - gap;
        const ns = S[i] + step < lim ? S[i] + step : lim;
        if (ns > S[i] + 1e-6) { S[i] = ns; moved = true; }
      }
      // deliver the front item when the receiver takes it
      if (T.n > 0 && S[0] >= length - 1e-3) {
        const r = recvOf(dst);
        const kind = kinds[K[0]];
        if (r && dst.active && r.accepts(kind) && roomIn(r, kind) > 0) {
          r.expect(kind); r.give(kind);
          for (let i = 1; i < T.n; i++) { S[i - 1] = S[i]; K[i - 1] = K[i]; }
          T.n--; T.delivered++;
          moved = true;
        }
      }
      // pull from the source
      if (src) {
        T.pullT += dt;
        if (T.pullT >= interval && src.active && src.pickup && T.n < capacity && (T.n === 0 || S[T.n - 1] >= gap)) {
          const kind = src.pickup.take(wantKind);
          if (kind !== null && kind !== undefined) { push(kind); T.pullT = 0; moved = true; }
        }
        if (T.pullT > interval + 1) T.pullT = interval + 1;
      }
      T.running = moved;
      if (moved && topTex) { T.scroll += step / 1.1; if (T.scroll > 64) T.scroll -= 64; topTex.offset.x = -T.scroll; }
      if (!moved && !T.dirty) return;
      T.dirty = false;
      for (let k = 0; k < meshes.length; k++) meshes[k].count = 0;
      for (let i = 0; i < T.n; i++) {
        pointAt(S[i], pt4);
        const m = meshes[K[i]];
        _p.set(pt4.x, pt4.y, pt4.z);
        _q.setFromAxisAngle(UP, pt4.w + Math.PI / 2);
        _m.compose(_p, _q, _s);
        m.setMatrixAt(m.count++, _m);
      }
      for (let k = 0; k < meshes.length; k++) meshes[k].instanceMatrix.needsUpdate = true;
    },
    serialize() {
      const items = [];
      for (let i = 0; i < T.n; i++) items.push(kinds[K[i]]);
      for (let i = 0; i < T.pending && items.length < capacity + 1; i++) items.push(kinds[0]);
      return { items };
    },
    restore(d) {
      if (!d || !Array.isArray(d.items)) return;
      T.n = 0;
      for (const k of d.items) {
        if (!(k in kindIndex) || T.n >= capacity) continue;
        S[T.n] = Math.max(0, length - T.n * gap); K[T.n] = kindIndex[k]; T.n++;
      }
      T.dirty = true;
    },
  };
  return st;
}

registerStationType('belt', { create: createBelt, describe: 'conveyor: carries items along a path from one station to another; queues up when the end is full' });
