// Bloom Rush — a swaying tower of bouquets carried on a character's back (or a tractor bed).
import * as THREE from 'three';
import { SIZES, FLOWERS } from './config.js';
import { makeBouquetGeometry, getSharedMaterial } from './models.js';

const geoCache = [];
function bouquetGeo(type) {
  if (!geoCache[type]) geoCache[type] = makeBouquetGeometry(type);
  return geoCache[type];
}

// deterministic per-index jitter in [-1, 1]
function hash(i, s) {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const STEP = SIZES.bouquetStep;
const COL_GAP = SIZES.bouquet.d + 0.05;
const POP_TIME = 0.22;
const SPRING_K = 70;
const SPRING_C = 5.5;
const ACC_GAIN = 0.0016;
const RUN_LEAN = 0.010;    // curvature (1/units) when running at full speed
const MAX_CURV = 0.03;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _w = new THREE.Vector3();

export function createStack(G, opts = {}) {
  const parent = opts.parent || G.scene;
  const off = opts.offset || { x: 0, y: 0, z: 0 };
  const perColumn = Math.max(1, opts.perColumn || 40);
  const swayOn = opts.sway !== false;

  const root = new THREE.Object3D();
  root.position.set(off.x || 0, off.y || 0, off.z || 0);
  parent.add(root);

  const meshes = [];        // per flower type, lazily
  let meshCap = 0;
  const items = [];
  let popAge = new Float32Array(16);

  // spring state: curvature in root-local x and z (1 / units)
  let cx = 0, cz = 0, vx = 0, vz = 0;
  let px = 0, pz = 0, pvx = 0, pvz = 0, hasPrev = false;
  let idleT = Math.random() * 10;
  let dirty = true;
  let settled = false;

  const stack = {
    capacity: Math.max(0, opts.capacity | 0),
    incoming: 0,
    items,
    root,
    get count() { return items.length; },
    get room() { return Math.max(0, this.capacity - items.length - this.incoming); },
    push, pop, topWorld, setCapacity, clear, update, dispose,
  };

  function ensureMesh(type) {
    let m = meshes[type];
    if (m && meshCap >= neededCap()) return m;
    if (meshCap < neededCap()) rebuildMeshes(neededCap());
    m = meshes[type];
    if (!m) {
      m = new THREE.InstancedMesh(bouquetGeo(type), getSharedMaterial(), meshCap);
      setupMesh(m);
      meshes[type] = m;
    }
    return m;
  }
  function neededCap() { return Math.max(8, stack.capacity, items.length + 1); }
  function setupMesh(m) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = true;
    m.count = 0;
    root.add(m);
  }
  function rebuildMeshes(cap) {
    meshCap = cap;
    for (let t = 0; t < meshes.length; t++) {
      const old = meshes[t];
      if (!old) continue;
      root.remove(old);
      old.dispose();
      const m = new THREE.InstancedMesh(bouquetGeo(t), getSharedMaterial(), meshCap);
      setupMesh(m);
      meshes[t] = m;
    }
    if (popAge.length < cap) {
      const n = new Float32Array(cap);
      n.set(popAge);
      popAge = n;
    }
    dirty = true;
  }

  function push(type) {
    type = type | 0;
    if (type < 0 || type >= FLOWERS.length) type = 0;
    if (items.length >= stack.capacity) return false;
    ensureMesh(type);
    if (popAge.length <= items.length) rebuildMeshes(items.length + 8);
    popAge[items.length] = 0;
    items.push(type);
    dirty = true;
    return true;
  }

  function pop() {
    if (!items.length) return -1;
    dirty = true;
    return items.pop();
  }

  function clear() { items.length = 0; dirty = true; }

  function setCapacity(n) {
    stack.capacity = Math.max(0, n | 0);
    if (meshCap && meshCap < neededCap()) rebuildMeshes(neededCap());
  }

  // local position of slot i (including bend)
  function slotLocal(i, out) {
    const col = (i / perColumn) | 0;
    const row = i - col * perColumn;
    const h = row * STEP;
    const hh = h + STEP * 0.5;
    out.set(
      hash(i, 1) * 0.025 + cx * hh * hh,
      h,
      -col * COL_GAP + hash(i, 2) * 0.02 + cz * hh * hh,
    );
    return out;
  }

  function topWorld(out) {
    slotLocal(items.length, out);
    root.updateWorldMatrix(true, false);
    return out.applyMatrix4(root.matrixWorld);
  }

  function writeMatrices() {
    for (let t = 0; t < meshes.length; t++) if (meshes[t]) meshes[t].count = 0;
    let popping = false;
    for (let i = 0; i < items.length; i++) {
      const m = meshes[items[i]];
      if (!m) continue;
      slotLocal(i, _p);
      const col = (i / perColumn) | 0;
      const hh = (i - col * perColumn) * STEP + STEP * 0.5;
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

  function update(dt, speed01 = 0) {
    if (dt <= 0) return;
    // pop ages
    const n = items.length;
    let anyPop = false;
    for (let i = Math.max(0, n - 12); i < n; i++) {
      if (popAge[i] < POP_TIME) { popAge[i] += dt; anyPop = true; }
    }

    if (swayOn) {
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
      // world accel -> root-local axes
      const sx = Math.hypot(e[0], e[2]) || 1;
      const sz = Math.hypot(e[8], e[10]) || 1;
      const lax = (ax * e[0] + az * e[2]) / sx;
      const laz = (ax * e[8] + az * e[10]) / sz;
      // speed in local forward (for lean back when running)
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
      const H = Math.max(1, Math.min(n, perColumn) * STEP);
      const lim = Math.min(MAX_CURV, 0.32 / H);
      if (cx > lim) { cx = lim; vx = 0; } else if (cx < -lim) { cx = -lim; vx = 0; }
      if (cz > lim) { cz = lim; vz = 0; } else if (cz < -lim) { cz = -lim; vz = 0; }
      // subtle idle sway: a cheap rigid rock of the whole tower
      idleT += dt;
      root.rotation.z = Math.sin(idleT * 1.7) * 0.012;
      root.rotation.x = Math.sin(idleT * 1.3 + 1) * 0.01;
      const moving = Math.abs(vx) + Math.abs(vz) > 1e-4 || Math.abs(cx - tx) + Math.abs(cz - tz) > 1e-5;
      if (moving) { settled = false; dirty = true; } else if (!settled) { settled = true; dirty = true; }
    }

    if ((dirty || anyPop) && n + 1 > 0) {
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
