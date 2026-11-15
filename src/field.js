// Bloom Rush — flower beds: instanced flowers, cutting, regrowth, wind sway.
import * as THREE from 'three';
import { FARMS, FLOWERS, FIELD, SIZES, flowerPos } from './config.js';
import { makeFlowerGeometry, makeStubGeometry, getSharedMaterial } from './models.js';

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

let swayMat = null;
const swayTime = { value: 0 };
function getSwayMaterial() {
  if (swayMat) return swayMat;
  swayMat = getSharedMaterial().clone();
  swayMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwayTime = swayTime;
    shader.vertexShader = 'uniform float uSwayTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
      {
        vec3 ip = instanceMatrix[3].xyz;
        float hgt = clamp(position.y / ${SIZES.flowerHeight.toFixed(3)}, 0.0, 1.2);
        float w = sin(uSwayTime * 1.9 + ip.x * 0.55 + ip.z * 0.35) * 0.7 + sin(uSwayTime * 3.3 + ip.z * 0.9) * 0.3;
        transformed.x += w * 0.075 * hgt * hgt;
        transformed.z += w * 0.04 * hgt * hgt;
      }
#endif`,
    );
  };
  swayMat.customProgramCacheKey = () => 'bloomrush-flower-sway';
  return swayMat;
}

export function createFields(G) {
  const fields = [];
  for (let f = 0; f < FARMS.length; f++) fields.push(makeField(G, f));

  G.events.on('unlock', ({ effect } = {}) => {
    if (effect && effect.type === 'farm' && fields[effect.farm]) fields[effect.farm].activate(true);
  });

  return {
    get(i) { return fields[i] || null; },
    all: fields,
    update(dt) {
      swayTime.value = G.time;
      for (let i = 0; i < fields.length; i++) fields[i].update(dt);
    },
  };
}

function makeField(G, farmIdx) {
  const farm = FARMS[farmIdx];
  const bed = farm.bed;
  const N = bed.count;
  const type = farm.flower;
  const F = FLOWERS[type];
  const petals = [F.petal, F.petalDark, F.petal, F.center];

  const xs = new Float32Array(N), zs = new Float32Array(N);
  const yaw = new Float32Array(N), scl = new Float32Array(N);
  const state = new Uint8Array(N);
  const timer = new Float32Array(N);
  const tmp = {};
  for (let i = 0; i < N; i++) {
    flowerPos(farmIdx, i, tmp);
    xs[i] = tmp.x; zs[i] = tmp.z;
    yaw[i] = Math.random() * Math.PI * 2;
    scl[i] = 0.88 + Math.random() * 0.24;
  }
  // grid mapping: col = (x - x0) / colStep, row = (z - z0) / sp
  const x0 = xs[0];
  const colStep = farm.flip * bed.spacing;
  const z0 = bed.minZ;
  const sp = bed.spacing;

  const flowers = new THREE.InstancedMesh(makeFlowerGeometry(type), getSwayMaterial(), N);
  flowers.castShadow = true;
  const stubs = new THREE.InstancedMesh(makeStubGeometry(), getSharedMaterial(), N);
  // fixed bounds covering the whole bed so off-screen beds are culled (instances never leave the bed)
  const bedSphere = new THREE.Sphere(
    new THREE.Vector3((bed.minX + bed.maxX) / 2, SIZES.flowerHeight / 2, (bed.minZ + bed.maxZ) / 2),
    Math.hypot(bed.maxX - bed.minX, bed.maxZ - bed.minZ) / 2 + 1.5,
  );
  flowers.boundingSphere = bedSphere;
  stubs.boundingSphere = bedSphere.clone();
  G.scene.add(flowers);
  G.scene.add(stubs);

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
    if (!on) { stubs.setMatrixAt(i, ZERO); return; }
    _p.set(xs[i], 0, zs[i]);
    _q.setFromAxisAngle(_up, yaw[i]);
    _s.set(scl[i], scl[i], scl[i]);
    _m.compose(_p, _q, _s);
    stubs.setMatrixAt(i, _m);
  }

  let pending = 0; // flowers not GROWN
  let flowersDirty = false, stubsDirty = false;

  const field = {
    farmIdx,
    type,
    active: false,
    total: N,
    grownCount: 0,
    bounds: bed,
    flowers, stubs,
    cutAt, nearestGrown, hasGrownNear, activate, update,
  };

  // initial: all grown (instantly) if active
  for (let i = 0; i < N; i++) { setStub(i, false); setFlower(i, 1); state[i] = GROWN; }
  field.grownCount = N;
  flowers.instanceMatrix.needsUpdate = true;
  stubs.instanceMatrix.needsUpdate = true;

  function activate(live) {
    if (field.active) return;
    field.active = true;
    flowers.visible = true;
    stubs.visible = true;
    if (live) {
      // staggered wave starting from the corner nearest the counter
      for (let i = 0; i < N; i++) {
        const col = i % bed.cols, row = (i / bed.cols) | 0;
        state[i] = GROWING;
        timer[i] = -((bed.cols - 1 - col) * 0.05 + Math.abs(row - (bed.rows - 1) / 2) * 0.035) - 0.25;
        setFlower(i, 0);
        setStub(i, false);
      }
      pending = N;
      field.grownCount = 0;
      flowersDirty = stubsDirty = true;
    }
  }

  if (G.stats.farms[farmIdx]) activate(false);
  else { flowers.visible = false; stubs.visible = false; }

  const EMPTY = [];

  function cutAt(x, z, radius, max = Infinity) {
    EMPTY.length = 0;
    if (!field.active || max <= 0 || field.grownCount === 0) return EMPTY;
    if (x < bed.minX - radius || x > bed.maxX + radius || z < bed.minZ - radius || z > bed.maxZ + radius) return EMPTY;
    let ca = (x - radius - x0) / colStep, cb = (x + radius - x0) / colStep;
    if (ca > cb) { const t = ca; ca = cb; cb = t; }
    const c0 = Math.max(0, Math.ceil(ca)), c1 = Math.min(bed.cols - 1, Math.floor(cb));
    const r0 = Math.max(0, Math.ceil((z - radius - z0) / sp)), r1 = Math.min(bed.rows - 1, Math.floor((z + radius - z0) / sp));
    if (c0 > c1 || r0 > r1) return EMPTY;
    const r2 = radius * radius;
    let out = null;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * bed.cols + c;
        if (state[i] !== GROWN) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        if (dx * dx + dz * dz > r2) continue;
        // cut it
        state[i] = CUT;
        timer[i] = G.stats.regrow + Math.random() * FIELD.regrowJitter;
        pending++;
        field.grownCount--;
        setFlower(i, 0);
        setStub(i, true);
        flowersDirty = stubsDirty = true;
        if (G.fx && G.fx.burst) {
          _burstPos.set(xs[i], 0.65, zs[i]);
          G.fx.burst(_burstPos, { colors: petals, count: 3 + ((Math.random() * 3) | 0), speed: 3.2, size: 0.12, life: 0.55, up: 3.2 });
        }
        if (!out) out = [];
        out.push({ x: xs[i], z: zs[i] });
        if (out.length >= max) return out;
      }
    }
    return out || EMPTY;
  }

  function hasGrownNear(x, z, radius) {
    if (!field.active || field.grownCount === 0) return false;
    let ca = (x - radius - x0) / colStep, cb = (x + radius - x0) / colStep;
    if (ca > cb) { const t = ca; ca = cb; cb = t; }
    const c0 = Math.max(0, Math.ceil(ca)), c1 = Math.min(bed.cols - 1, Math.floor(cb));
    const r0 = Math.max(0, Math.ceil((z - radius - z0) / sp)), r1 = Math.min(bed.rows - 1, Math.floor((z + radius - z0) / sp));
    const r2 = radius * radius;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * bed.cols + c;
        if (state[i] !== GROWN) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        if (dx * dx + dz * dz <= r2) return true;
      }
    }
    return false;
  }

  function nearestGrown(x, z) {
    if (!field.active || field.grownCount === 0) return null;
    let best = -1, bd = Infinity;
    for (let i = 0; i < N; i++) {
      if (state[i] !== GROWN) continue;
      const dx = xs[i] - x, dz = zs[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : { x: xs[best], z: zs[best] };
  }

  function update(dt) {
    if (!field.active || pending === 0) return;
    const grow = FIELD.growTime;
    for (let i = 0; i < N; i++) {
      const st = state[i];
      if (st === GROWN) continue;
      if (st === CUT) {
        timer[i] -= dt;
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
      const u = timer[i] / grow;
      if (u >= 1) {
        state[i] = GROWN;
        pending--;
        field.grownCount++;
        setFlower(i, 1);
      } else {
        setFlower(i, elasticOut(u));
      }
      flowersDirty = true;
    }
    if (flowersDirty) { flowers.instanceMatrix.needsUpdate = true; flowersDirty = false; }
    if (stubsDirty) { stubs.instanceMatrix.needsUpdate = true; stubsDirty = false; }
  }

  return field;
}
