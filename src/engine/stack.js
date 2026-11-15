// A swaying tower of items carried on a character's back (or a vehicle bed).
// Items are registered item-kind ids (strings); a stack may mix kinds. Each kind present
// gets one InstancedMesh (created lazily), so a stack costs one draw call per kind.
import * as THREE from 'three';
import { getItem } from './registry.js';
import { itemGeometry, itemMaterial } from './items.js';

// deterministic per-index jitter in [-1, 1]
function hash(i, s) {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const POP_TIME = 0.22;
const SPRING_K = 70;
const SPRING_C = 5.5;
const ACC_GAIN = 0.0016;
const RUN_LEAN = 0.016;    // curvature (1/units) when running at full speed
const MAX_CURV = 0.03;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * opts:
 *   parent           Object3D the stack hangs from (default G.scene)
 *   offset           {x,y,z} local offset of the stack root on the parent
 *   capacity         max items (stack.setCapacity changes it)
 *   perColumn        items per column before a new column starts behind (default 40)
 *   sway             spring sway (default true)
 *   billboard        keep a fixed camera-facing orientation and sit on the far side of
 *                    the carrier, so the carrier is never hidden by its own load
 *   billboardOffset  distance of the tower from the carrier in billboard mode (0.5)
 *   columnGap        distance between columns (default: deepest item footprint + 0.05)
 */
export function createStack(G, opts = {}) {
  const parent = opts.parent || G.scene;
  const off = opts.offset || { x: 0, y: 0, z: 0 };
  const perColumn = Math.max(1, opts.perColumn || 40);
  const swayOn = opts.sway !== false;
  const billboard = !!opts.billboard;
  const BILL_YAW = -Math.PI * 0.75;
  const BILL_OFF = opts.billboardOffset ?? 0.5;
  let colGap = opts.columnGap || 0;

  const root = new THREE.Object3D();
  root.position.set(off.x || 0, off.y || 0, off.z || 0);
  parent.add(root);

  const meshes = [];        // per item index, lazily
  let meshCap = 0;
  const items = [];         // kind ids, bottom -> top
  let popAge = new Float32Array(16);
  let ys = new Float32Array(16);    // height of each slot inside its column
  let layoutDirty = true;

  // spring state in a typed array (closure doubles would allocate a heap number per write)
  const K = new Float64Array(9); // cx, cz, vx, vz, px, pz, pvx, pvz, idleT
  K[8] = Math.random() * 10;
  let hasPrev = false;
  let dirty = true;
  let settled = false;
  let popLo = 0; // lowest index that may still be popping in

  const stack = {
    capacity: Math.max(0, opts.capacity | 0),
    /** items flying toward this stack (they count against room) */
    incoming: 0,
    /** { kind: n } of the items in `incoming` (kept by transfer.flyToStack) */
    inbound: {},
    items,
    root,
    get count() { return items.length; },
    get room() { return Math.max(0, this.capacity - items.length - this.incoming); },
    push, pop, popWhere, countWhere, has, topWorld, setCapacity, clear, update, dispose, snapshot,
  };

  function neededCap() { return Math.max(8, stack.capacity, items.length + 1); }
  function setupMesh(m) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    m.count = 0;
    root.add(m);
  }
  function makeMesh(it) {
    const m = new THREE.InstancedMesh(itemGeometry(it), itemMaterial(it), meshCap);
    m.userData.kind = it.id;
    setupMesh(m);
    return m;
  }
  function ensureMesh(it) {
    if (meshCap < neededCap()) rebuildMeshes(neededCap());
    if (!meshes[it.index]) {
      meshes[it.index] = makeMesh(it);
      const d = it.footprint.d + 0.05;
      if (!opts.columnGap && d > colGap) colGap = d;
    }
  }
  function rebuildMeshes(cap) {
    meshCap = cap;
    for (let t = 0; t < meshes.length; t++) {
      const old = meshes[t];
      if (!old) continue;
      root.remove(old);
      old.dispose();
      meshes[t] = null;
      const it = getItem(old.userData.kind);
      if (it) meshes[t] = makeMesh(it);
    }
    if (popAge.length < cap + 1) {
      const n = new Float32Array(cap + 8);
      n.set(popAge);
      popAge = n;
      ys = new Float32Array(cap + 8);
      layoutDirty = true;
    }
    dirty = true;
  }

  /** Add one item of `kind` on top. Returns false if full or the kind is unknown. */
  function push(kind) {
    const it = getItem(kind);
    if (!it) { console.warn(`[stack] unknown item kind '${kind}'`); return false; }
    if (items.length >= stack.capacity) return false;
    ensureMesh(it);
    if (popAge.length <= items.length + 1) rebuildMeshes(items.length + 8);
    const n = items.length;
    popAge[n] = 0;
    // incremental layout: the new slot sits on top of the previous one in its column
    if (!layoutDirty) ys[n] = n % perColumn === 0 ? 0 : ys[n - 1] + getItem(items[n - 1]).step;
    items.push(it.id);
    dirty = true;
    return true;
  }

  /** Remove and return the top item's kind, or null if empty. */
  function pop() {
    if (!items.length) return null;
    dirty = true;
    return items.pop();
  }

  /** Remove and return the topmost item whose kind satisfies pred(kind), or null. */
  function popWhere(pred) {
    for (let i = items.length - 1; i >= 0; i--) {
      const k = items[i];
      if (!pred(k)) continue;
      const n = items.length;
      for (let j = i; j < n - 1; j++) { items[j] = items[j + 1]; popAge[j] = popAge[j + 1]; }
      items.length = n - 1;
      if (i < n - 1) layoutDirty = true;
      dirty = true;
      return k;
    }
    return null;
  }

  /** Number of carried items whose kind satisfies pred(kind). */
  function countWhere(pred) {
    let c = 0;
    for (let i = 0; i < items.length; i++) if (pred(items[i])) c++;
    return c;
  }
  /** True if any carried item satisfies pred(kind). */
  function has(pred) {
    for (let i = items.length - 1; i >= 0; i--) if (pred(items[i])) return true;
    return false;
  }

  function clear() { items.length = 0; dirty = true; }

  /** Carried items plus the ones still flying in (for saves: nothing in the air is lost). */
  function snapshot() {
    const out = items.slice();
    const ib = stack.inbound;
    for (const k in ib) for (let i = 0; i < ib[k]; i++) out.push(k);
    return out;
  }

  function setCapacity(n) {
    stack.capacity = Math.max(0, n | 0);
    if (meshCap && meshCap < neededCap()) rebuildMeshes(neededCap());
  }

  function relayout() {
    layoutDirty = false;
    for (let i = 0; i < items.length; i++) ys[i] = i % perColumn === 0 ? 0 : ys[i - 1] + getItem(items[i - 1]).step;
  }

  function slotH(i) {
    if (i < items.length) return ys[i];
    if (i % perColumn === 0 || i === 0) return 0;
    return ys[i - 1] + getItem(items[i - 1]).step;
  }

  // local position of slot i (including bend); hh = height used for the bend
  function slotLocal(i, out) {
    const col = (i / perColumn) | 0;
    const h = slotH(i);
    const hh = h + 0.12;
    const cx = K[0], cz = K[1];
    out.set(
      hash(i, 1) * 0.025 + cx * hh * hh,
      h,
      -col * (colGap || 0.47) + hash(i, 2) * 0.02 + cz * hh * hh,
    );
    return out;
  }

  /** World position of the next free slot (where an arriving item should fly to). */
  function topWorld(out) {
    if (layoutDirty) relayout();
    slotLocal(items.length, out);
    root.updateWorldMatrix(true, false);
    return out.applyMatrix4(root.matrixWorld);
  }

  function writeMatrices() {
    if (layoutDirty) relayout();
    for (let t = 0; t < meshes.length; t++) if (meshes[t]) meshes[t].count = 0;
    let popping = false;
    const cx = K[0], cz = K[1];
    for (let i = 0; i < items.length; i++) {
      const it = getItem(items[i]);
      const m = meshes[it.index];
      if (!m) continue;
      slotLocal(i, _p);
      const hh = ys[i] + it.step * 0.5;
      _e.set(Math.atan(2 * cz * hh), hash(i, 3) * 0.12, -Math.atan(2 * cx * hh));
      _q.setFromEuler(_e);
      let s = 1;
      const a = popAge[i];
      if (a < POP_TIME) {
        const u = a / POP_TIME;
        s = 0.55 + 0.45 * u + Math.sin(u * Math.PI) * 0.35;
        popping = true;
      }
      _s.set(s, s, s);
      _m.compose(_p, _q, _s);
      m.setMatrixAt(m.count++, _m);
    }
    for (let t = 0; t < meshes.length; t++) if (meshes[t]) meshes[t].instanceMatrix.needsUpdate = true;
    return popping;
  }

  /** Advance pop-in, billboard and sway. speed01 = carrier speed / max speed. */
  function update(dt, speed01 = 0) {
    if (dt <= 0) return;
    const n = items.length;
    let anyPop = false;
    // age every item that is still popping in (a restored save adds many at once)
    if (popLo > n) popLo = n;
    for (let i = popLo; i < n; i++) {
      if (popAge[i] < POP_TIME) { popAge[i] += dt; anyPop = true; }
    }
    while (popLo < n && popAge[popLo] >= POP_TIME) popLo++;

    if (billboard) {
      const yaw = parent.rotation.y;
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      const o = BILL_OFF * Math.SQRT1_2;       // world offset (+x, +z): away from the camera
      root.position.x = o * c - o * sn;
      root.position.z = o * sn + o * c;
      root.rotation.y = BILL_YAW - yaw;
    }

    if (swayOn) {
      let cx = K[0], cz = K[1], vx = K[2], vz = K[3], px = K[4], pz = K[5], pvx = K[6], pvz = K[7];
      root.updateWorldMatrix(true, false);
      const e = root.matrixWorld.elements;
      const wx = e[12], wz = e[14];
      let ax = 0, az = 0;
      if (hasPrev) {
        let nvx = (wx - px) / dt, nvz = (wz - pz) / dt;
        if (nvx * nvx + nvz * nvz > 900) { nvx = 0; nvz = 0; } // teleport
        ax = (nvx - pvx) / dt; az = (nvz - pvz) / dt;
        pvx = nvx; pvz = nvz;
      }
      px = wx; pz = wz; hasPrev = true;
      const al = Math.hypot(ax, az);
      if (al > 120) { ax *= 120 / al; az *= 120 / al; }
      const sx = Math.hypot(e[0], e[2]) || 1;
      const sz = Math.hypot(e[8], e[10]) || 1;
      const lax = (ax * e[0] + az * e[2]) / sx;
      const laz = (ax * e[8] + az * e[10]) / sz;
      const lvz = (pvx * e[8] + pvz * e[10]) / sz;
      const lvx = (pvx * e[0] + pvz * e[2]) / sx;
      const sp = Math.hypot(lvx, lvz) || 1;
      const lean = RUN_LEAN * Math.min(1, speed01);
      const tx = -lean * lvx / sp, tz = -lean * lvz / sp;
      const fx = -SPRING_K * (cx - tx) - SPRING_C * vx - lax * ACC_GAIN * SPRING_K * 0.1;
      const fz = -SPRING_K * (cz - tz) - SPRING_C * vz - laz * ACC_GAIN * SPRING_K * 0.1;
      vx += fx * dt; vz += fz * dt;
      cx += vx * dt; cz += vz * dt;
      // keep the top displacement reasonable for very tall towers
      if (layoutDirty) relayout();
      const top = Math.min(n, perColumn) - 1;
      const H = Math.max(1, top >= 0 ? ys[top] + 0.24 : 0);
      const lim = Math.min(MAX_CURV, 0.32 / H);
      if (cx > lim) { cx = lim; vx = 0; } else if (cx < -lim) { cx = -lim; vx = 0; }
      if (cz > lim) { cz = lim; vz = 0; } else if (cz < -lim) { cz = -lim; vz = 0; }
      // subtle idle sway: a cheap rigid rock of the whole tower
      const idleT = (K[8] += dt);
      root.rotation.z = Math.sin(idleT * 1.7) * 0.012;
      root.rotation.x = Math.sin(idleT * 1.3 + 1) * 0.01;
      K[0] = cx; K[1] = cz; K[2] = vx; K[3] = vz; K[4] = px; K[5] = pz; K[6] = pvx; K[7] = pvz;
      const moving = Math.abs(vx) + Math.abs(vz) > 1e-4 || Math.abs(cx - tx) + Math.abs(cz - tz) > 1e-5;
      if (moving) { settled = false; dirty = true; } else if (!settled) { settled = true; dirty = true; }
    }

    if (dirty || anyPop) {
      dirty = false;
      if (writeMatrices()) dirty = true;
    }
  }

  function dispose() {
    for (let t = 0; t < meshes.length; t++) {
      if (!meshes[t]) continue;
      root.remove(meshes[t]);
      meshes[t].dispose();
      meshes[t] = null;
    }
    if (root.parent) root.parent.remove(root);
    items.length = 0;
  }

  return stack;
}
