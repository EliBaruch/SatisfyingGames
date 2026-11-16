// Station type 'source': a grid of plants (or anything) that is harvested by walking
// through it and regrows. Capability: harvest area. Port of the original field.js.
//
// def = {
//   id, type: 'source', name, item: 'rose',          // item kind produced
//   grid: { x0, z0, dx, dz, cols, rows },            // cell (c, r) at (x0 + c*dx, z0 + r*dz); dx/dz may be negative
//   plant: () => BufferGeometry,                      // growing model, origin at the ground
//   stub:  () => BufferGeometry,                      // optional: shown while regrowing
//   stubAligned: false,                               // true: stubs keep the grid's orientation and size (tiles)
//   plantHeight: 0.95,                                // for the wind sway shader
//   sway: true,                                       // wind sway (vertex shader, free)
//   regrowStat: 'regrow',                             // G.stats key holding regrow seconds
//   regrowJitter: 1.5, growTime: 0.45,
//   regrowRate: (G, station) => 1,                    // optional live multiplier on regrow speed
//                                                     // (e.g. 2 while a feed trough is full); called every step
//   burst: [0xff4d7d, ...],                           // particle colours on harvest
//   action: 'swing',                                  // animation the harvester plays
//   home: {x, z}, park: {x, z},                       // where hired walkers / vehicles start
//   open: true,                                       // active from the start
// }
import * as THREE from 'three';
import { registerStationType } from '../registry.js';
import { getSharedMaterial } from '../geom.js';

const GROWN = 0, CUT = 1, GROWING = 2;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _burstPos = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function elasticOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -9 * t) * Math.sin((t * 8 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

// one sway material per plant height, all sharing one time uniform
const swayMats = new Map();
const swayTime = { value: 0 };
function getSwayMaterial(height) {
  const key = height.toFixed(3);
  let mat = swayMats.get(key);
  if (mat) return mat;
  const base = getSharedMaterial();
  mat = base.clone();
  mat.shadowSide = base.shadowSide;
  const look = base.onBeforeCompile;                 // the art kit's look (wrap diffuse, grade, rim)
  mat.onBeforeCompile = (shader, renderer) => {
    if (look) look(shader, renderer);
    shader.uniforms.uSwayTime = swayTime;
    shader.vertexShader = 'uniform float uSwayTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
      {
        vec3 ip = instanceMatrix[3].xyz;
        float hgt = clamp(position.y / ${key}, 0.0, 1.2);
        float w = sin(uSwayTime * 1.9 + ip.x * 0.55 + ip.z * 0.35) * 0.7 + sin(uSwayTime * 3.3 + ip.z * 0.9) * 0.3;
        transformed.x += w * 0.075 * hgt * hgt;
        transformed.z += w * 0.04 * hgt * hgt;
      }
#endif`,
    );
  };
  mat.customProgramCacheKey = () => 'engine-sway-look-' + key;
  swayMats.set(key, mat);
  return mat;
}

function createSource(G, def) {
  const g = def.grid;
  const cols = g.cols | 0, rows = g.rows | 0;
  const N = cols * rows;
  const kind = def.item;
  const regrowStat = def.regrowStat || 'regrow';
  const jitter = def.regrowJitter ?? 1.5;
  const growTime = def.growTime ?? 0.45;
  const plantH = def.plantHeight || 1;
  const rateFn = typeof def.regrowRate === 'function' ? def.regrowRate : null;

  const xs = new Float32Array(N), zs = new Float32Array(N);
  const yaw = new Float32Array(N), scl = new Float32Array(N);
  const state = new Uint8Array(N);
  const timer = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const c = i % cols, r = (i / cols) | 0;
    xs[i] = g.x0 + c * g.dx;
    zs[i] = g.z0 + r * g.dz;
    yaw[i] = Math.random() * Math.PI * 2;
    scl[i] = 0.88 + Math.random() * 0.24;
  }
  const xa = g.x0, xb = g.x0 + (cols - 1) * g.dx, za = g.z0, zb = g.z0 + (rows - 1) * g.dz;
  const bounds = { minX: Math.min(xa, xb), maxX: Math.max(xa, xb), minZ: Math.min(za, zb), maxZ: Math.max(za, zb) };
  const spacing = Math.min(Math.abs(g.dx), Math.abs(g.dz));

  const plantGeo = typeof def.plant === 'function' ? def.plant() : def.plant;
  const flowers = new THREE.InstancedMesh(plantGeo, def.sway === false ? getSharedMaterial() : getSwayMaterial(plantH), N);
  flowers.castShadow = true;
  const stubGeo = def.stub ? (typeof def.stub === 'function' ? def.stub() : def.stub) : null;
  const stubs = stubGeo ? new THREE.InstancedMesh(stubGeo, getSharedMaterial(), N) : null;
  // fixed bounds covering the whole bed so off-screen beds are culled
  const bedSphere = new THREE.Sphere(
    new THREE.Vector3((bounds.minX + bounds.maxX) / 2, plantH / 2, (bounds.minZ + bounds.maxZ) / 2),
    Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 1.5,
  );
  flowers.boundingSphere = bedSphere;
  flowers.visible = false;
  G.scene.add(flowers);
  if (stubs) { stubs.boundingSphere = bedSphere.clone(); stubs.visible = false; G.scene.add(stubs); }

  function setFlower(i, s) {
    if (s <= 0.001) { flowers.setMatrixAt(i, ZERO); return; }
    _p.set(xs[i], 0, zs[i]);
    _q.setFromAxisAngle(_up, yaw[i]);
    const k = s * scl[i];
    _s.set(k, k, k);
    _m.compose(_p, _q, _s);
    flowers.setMatrixAt(i, _m);
  }
  function setStub(i, on) {
    if (!stubs) return;
    if (!on) { stubs.setMatrixAt(i, ZERO); return; }
    _p.set(xs[i], 0, zs[i]);
    if (def.stubAligned) { _q.identity(); _s.set(1, 1, 1); }     // grid-aligned stubs (tiles that join up)
    else { _q.setFromAxisAngle(_up, yaw[i]); _s.set(scl[i], scl[i], scl[i]); }
    _m.compose(_p, _q, _s);
    stubs.setMatrixAt(i, _m);
  }

  let pending = 0; // cells not GROWN
  let flowersDirty = false, stubsDirty = false;
  const burstOpts = { colors: def.burst || [0xffffff], count: 3, speed: 3.2, size: 0.12, life: 0.55, up: 3.2 };

  for (let i = 0; i < N; i++) { setStub(i, false); setFlower(i, 1); state[i] = GROWN; }
  flowers.instanceMatrix.needsUpdate = true;
  if (stubs) stubs.instanceMatrix.needsUpdate = true;

  // grid lookups: column/row ranges overlapping [x-r, x+r] x [z-r, z+r]
  const R = { c0: 0, c1: -1, r0: 0, r1: -1 };
  function range(x, z, radius) {
    let ca = (x - radius - g.x0) / g.dx, cb = (x + radius - g.x0) / g.dx;
    if (ca > cb) { const t = ca; ca = cb; cb = t; }
    let ra = (z - radius - g.z0) / g.dz, rb = (z + radius - g.z0) / g.dz;
    if (ra > rb) { const t = ra; ra = rb; rb = t; }
    R.c0 = Math.max(0, Math.ceil(ca)); R.c1 = Math.min(cols - 1, Math.floor(cb));
    R.r0 = Math.max(0, Math.ceil(ra)); R.r1 = Math.min(rows - 1, Math.floor(rb));
    return R.c0 <= R.c1 && R.r0 <= R.r1;
  }

  const harvest = {
    kind,
    bounds,
    spacing,
    total: N,
    available: N,
    action: def.action || 'swing',
    /**
     * Harvest up to `max` grown cells within `radius` of (x, z). For each one calls
     * onItem(kind, x, z, data). Returns the number harvested. Allocation-free.
     */
    harvestAt(x, z, radius, max, onItem, data) {
      if (!station.active || max <= 0 || harvest.available === 0) return 0;
      if (x < bounds.minX - radius || x > bounds.maxX + radius || z < bounds.minZ - radius || z > bounds.maxZ + radius) return 0;
      if (!range(x, z, radius)) return 0;
      const r2 = radius * radius;
      let n = 0;
      const fx = G.fx;
      for (let r = R.r0; r <= R.r1; r++) {
        for (let c = R.c0; c <= R.c1; c++) {
          const i = r * cols + c;
          if (state[i] !== GROWN) continue;
          const dx = xs[i] - x, dz = zs[i] - z;
          if (dx * dx + dz * dz > r2) continue;
          state[i] = CUT;
          timer[i] = (G.stats[regrowStat] || 6) + Math.random() * jitter;
          pending++;
          harvest.available--;
          setFlower(i, 0);
          setStub(i, true);
          flowersDirty = stubsDirty = true;
          if (fx && fx.burst) {
            _burstPos.set(xs[i], plantH * 0.68, zs[i]);
            burstOpts.count = 3 + ((Math.random() * 3) | 0);
            fx.burst(_burstPos, burstOpts);
          }
          n++;
          if (onItem) onItem(kind, xs[i], zs[i], data);
          if (n >= max) return n;
        }
      }
      return n;
    },
    /** True if a grown cell lies within `radius` of (x, z). */
    hasNear(x, z, radius) {
      if (!station.active || harvest.available === 0) return false;
      if (!range(x, z, radius)) return false;
      const r2 = radius * radius;
      for (let r = R.r0; r <= R.r1; r++) {
        for (let c = R.c0; c <= R.c1; c++) {
          const i = r * cols + c;
          if (state[i] !== GROWN) continue;
          const dx = xs[i] - x, dz = zs[i] - z;
          if (dx * dx + dz * dz <= r2) return true;
        }
      }
      return false;
    },
    /** Nearest grown cell to (x, z) written into out {x, z}; false if none. */
    nearest(x, z, out) {
      if (!station.active || harvest.available === 0) return false;
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (state[i] !== GROWN) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return false;
      out.x = xs[best]; out.z = zs[best];
      return true;
    },
  };

  const station = {
    pos: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    name: def.name,
    active: false,
    harvest,
    home: def.home || null,
    park: def.park || null,
    meshes: { flowers, stubs },
    activate(live) {
      flowers.visible = true;
      if (stubs) stubs.visible = true;
      if (live) {
        // staggered wave starting from the last column
        for (let i = 0; i < N; i++) {
          const col = i % cols, row = (i / cols) | 0;
          state[i] = GROWING;
          timer[i] = -((cols - 1 - col) * 0.05 + Math.abs(row - (rows - 1) / 2) * 0.035) - 0.25;
          setFlower(i, 0);
          setStub(i, false);
        }
        pending = N;
        harvest.available = 0;
        flowersDirty = stubsDirty = true;
      }
    },
    update(dt) {
      if (!station.active) return;
      swayTime.value = G.time;
      if (pending === 0) return;
      const rate = rateFn ? rateFn(G, station) : 1;
      for (let i = 0; i < N; i++) {
        const st = state[i];
        if (st === GROWN) continue;
        if (st === CUT) {
          timer[i] -= dt * rate;
          if (timer[i] <= 0) {
            state[i] = GROWING;
            timer[i] = 0;
            setStub(i, false);
            stubsDirty = true;
          }
          continue;
        }
        // GROWING (timer < 0 = waiting in a staggered wave)
        timer[i] += dt;
        if (timer[i] < 0) continue;
        const u = timer[i] / growTime;
        if (u >= 1) {
          state[i] = GROWN;
          pending--;
          harvest.available++;
          setFlower(i, 1);
        } else {
          setFlower(i, elasticOut(u));
        }
        flowersDirty = true;
      }
      if (flowersDirty) { flowers.instanceMatrix.needsUpdate = true; flowersDirty = false; }
      if (stubsDirty && stubs) { stubs.instanceMatrix.needsUpdate = true; stubsDirty = false; }
    },
  };
  return station;
}

registerStationType('source', { create: createSource, describe: 'grid that regrows; harvest area' });
