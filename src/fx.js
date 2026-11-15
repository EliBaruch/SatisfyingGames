// Bloom Rush — juice: particles, rings, floating text, flying items, tweens, shake.
// Everything is pooled; all motion advances only inside fx.update(dt).
import * as THREE from 'three';
import { makeBouquetGeometry, makeBillGeometry, getSharedMaterial } from './models.js';

const PARTICLE_CAP = 900;
const RING_POOL = 24;
const TEXT_POOL = 32;
const TEXT_CACHE_CAP = 40;
const FLY_CAP = 256;
const BOUQUET_TYPES = 4;

const CONFETTI_COLORS = [0xff4d7d, 0xffd166, 0x2ec4ff, 0x9b5cff, 0x5be37d, 0xff8a3d, 0xffffff];

const rand = Math.random;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
function easeOutBack(t, s = 2.2) {
  const u = t - 1;
  return 1 + (s + 1) * u * u * u + s * u * u;
}
function easeElasticOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function createFx(G) {
  const scene = G.scene;
  const shakeOffset = new THREE.Vector3();

  // shared temporaries (no per-frame allocation)
  const tmpColor = new THREE.Color();
  const tmpEuler = new THREE.Euler();
  const tmpQuat = new THREE.Quaternion();
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpMat = new THREE.Matrix4();
  const tmpTo = new THREE.Vector3();
  const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

  // ===================================================================== particles
  const pGeo = new THREE.CircleGeometry(0.5, 6);
  const pMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_CAP);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  pMesh.count = 0;
  pMesh.renderOrder = 5;
  for (let i = 0; i < PARTICLE_CAP; i++) {
    pMesh.setMatrixAt(i, zeroMat);
    pMesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
  }
  pMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  scene.add(pMesh);

  const P = {
    alive: new Uint8Array(PARTICLE_CAP),
    x: new Float32Array(PARTICLE_CAP), y: new Float32Array(PARTICLE_CAP), z: new Float32Array(PARTICLE_CAP),
    vx: new Float32Array(PARTICLE_CAP), vy: new Float32Array(PARTICLE_CAP), vz: new Float32Array(PARTICLE_CAP),
    rx: new Float32Array(PARTICLE_CAP), ry: new Float32Array(PARTICLE_CAP), rz: new Float32Array(PARTICLE_CAP),
    wx: new Float32Array(PARTICLE_CAP), wy: new Float32Array(PARTICLE_CAP), wz: new Float32Array(PARTICLE_CAP),
    age: new Float32Array(PARTICLE_CAP), life: new Float32Array(PARTICLE_CAP),
    size: new Float32Array(PARTICLE_CAP), aspect: new Float32Array(PARTICLE_CAP),
    drag: new Float32Array(PARTICLE_CAP), fdrag: new Float32Array(PARTICLE_CAP),
    grav: new Float32Array(PARTICLE_CAP), sway: new Float32Array(PARTICLE_CAP),
    phase: new Float32Array(PARTICLE_CAP),
  };
  let pCursor = 0;
  let pHigh = 0; // highest alive index + 1 (upper bound)
  let colorDirty = false;

  function spawnParticle(x, y, z, vx, vy, vz, life, size, aspect, drag, fdrag, grav, sway, hex) {
    const i = pCursor;
    pCursor = (pCursor + 1) % PARTICLE_CAP;
    P.alive[i] = 1;
    P.x[i] = x; P.y[i] = y; P.z[i] = z;
    P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.rx[i] = rand() * 6.283; P.ry[i] = rand() * 6.283; P.rz[i] = rand() * 6.283;
    const spin = 5 + rand() * 9;
    P.wx[i] = (rand() - 0.5) * 2 * spin;
    P.wy[i] = (rand() - 0.5) * 2 * spin;
    P.wz[i] = (rand() - 0.5) * 2 * spin;
    P.age[i] = 0; P.life[i] = life;
    P.size[i] = size; P.aspect[i] = aspect;
    P.drag[i] = drag; P.fdrag[i] = fdrag; P.grav[i] = grav; P.sway[i] = sway;
    P.phase[i] = rand() * 6.283;
    pMesh.setColorAt(i, tmpColor.setHex(hex));
    colorDirty = true;
    if (i + 1 > pHigh) pHigh = i + 1;
  }

  function burst(pos, o = {}) {
    const {
      color = 0xffffff, colors, count = 8, speed = 4, size = 0.14, life = 0.6, gravity = 12, up = 3,
    } = o;
    const n = Math.min(count, PARTICLE_CAP);
    for (let k = 0; k < n; k++) {
      const a = rand() * 6.283;
      const hs = speed * (0.35 + 0.65 * rand());
      const hex = colors && colors.length ? colors[(rand() * colors.length) | 0] : color;
      const drag = 1.4 + rand() * 1.8;
      spawnParticle(
        pos.x + (rand() - 0.5) * 0.3, pos.y + 0.1 + rand() * 0.3, pos.z + (rand() - 0.5) * 0.3,
        Math.cos(a) * hs, up * (0.6 + 0.8 * rand()) + rand() * speed * 0.35, Math.sin(a) * hs,
        life * (0.75 + 0.5 * rand()), size * 2.4 * (0.75 + 0.5 * rand()), 0.6 + rand() * 0.2,
        drag, drag, gravity * 0.55, 3 + rand() * 4, hex,
      );
    }
  }

  function confetti(pos, count = 60) {
    const n = Math.min(count, PARTICLE_CAP);
    const g = 16;
    for (let k = 0; k < n; k++) {
      const a = rand() * 6.283;
      const hs = 1.5 + rand() * 5.5;
      const h = 6 + rand() * 3;
      spawnParticle(
        pos.x, pos.y + 0.4, pos.z,
        Math.cos(a) * hs, Math.sqrt(2 * g * h), Math.sin(a) * hs,
        2.7 + rand() * 0.8, 0.34 + rand() * 0.2, 0.55 + rand() * 0.2,
        0.5 + rand() * 0.4, 2.6 + rand() * 1.2, g, 1.5 + rand() * 2.5,
        CONFETTI_COLORS[(rand() * CONFETTI_COLORS.length) | 0],
      );
    }
  }

  function updateParticles(dt) {
    if (pHigh === 0) return;
    let high = 0;
    const exp = Math.exp;
    for (let i = 0; i < pHigh; i++) {
      if (!P.alive[i]) continue;
      const age = (P.age[i] += dt);
      const life = P.life[i];
      if (age >= life) {
        P.alive[i] = 0;
        pMesh.setMatrixAt(i, zeroMat);
        continue;
      }
      high = i + 1;
      let vx = P.vx[i], vy = P.vy[i], vz = P.vz[i];
      const dh = exp(-P.drag[i] * dt);
      vx *= dh; vz *= dh;
      vy -= P.grav[i] * dt;
      if (vy < 0) vy *= exp(-P.fdrag[i] * dt);
      const sw = P.sway[i];
      if (sw > 0) {
        const ph = P.phase[i];
        vx += Math.cos(age * 9 + ph) * sw * dt;
        vz += Math.sin(age * 11 + ph) * sw * dt;
      }
      let y = P.y[i] + vy * dt;
      if (y < 0.03) { // landed: skid and settle
        y = 0.03; vy = 0; vx *= 0.8; vz *= 0.8;
        P.wx[i] *= 0.9; P.wy[i] *= 0.9; P.wz[i] *= 0.9;
      }
      P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
      P.x[i] += vx * dt; P.y[i] = y; P.z[i] += vz * dt;
      P.rx[i] += P.wx[i] * dt; P.ry[i] += P.wy[i] * dt; P.rz[i] += P.wz[i] * dt;

      const u = age / life;
      let s = P.size[i];
      if (u > 0.5) { const w = (u - 0.5) * 2; s *= 1 - w * w * (3 - 2 * w); }
      if (age < 0.05) s *= age * 20;
      tmpPos.set(P.x[i], y, P.z[i]);
      tmpQuat.setFromEuler(tmpEuler.set(P.rx[i], P.ry[i], P.rz[i]));
      tmpScale.set(s, s * P.aspect[i], s);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      pMesh.setMatrixAt(i, tmpMat);
    }
    pHigh = high > 0 ? Math.max(high, 0) : 0;
    // keep the full ring range drawable if the cursor wrapped: count = pHigh only covers alive slots
    pMesh.count = pHigh;
    pMesh.instanceMatrix.needsUpdate = true;
    if (colorDirty) { pMesh.instanceColor.needsUpdate = true; colorDirty = false; }
  }
  // after spawn, make sure the new particles are drawn even before the next update
  function syncParticleCount() { if (pMesh.count < pHigh) pMesh.count = pHigh; }

  // ========================================================================== rings
  const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const ringBaseMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
  const rings = [];
  for (let i = 0; i < RING_POOL; i++) {
    const m = new THREE.Mesh(ringGeo, ringBaseMat.clone());
    m.visible = false;
    m.renderOrder = 3;
    m.frustumCulled = false;
    m.userData.age = 0; m.userData.life = 1; m.userData.radius = 1; m.userData.on = false;
    scene.add(m);
    rings.push(m);
  }
  let ringCursor = 0;

  function ring(pos, { color = 0xffffff, radius = 2, life = 0.5 } = {}) {
    const m = rings[ringCursor];
    ringCursor = (ringCursor + 1) % RING_POOL;
    m.position.set(pos.x, 0.06, pos.z);
    m.material.color.setHex(color);
    m.material.opacity = 0.9;
    m.userData.age = 0; m.userData.life = Math.max(0.05, life); m.userData.radius = radius; m.userData.on = true;
    m.scale.setScalar(0.2 * radius);
    m.visible = true;
  }

  function updateRings(dt) {
    for (let i = 0; i < RING_POOL; i++) {
      const m = rings[i];
      const d = m.userData;
      if (!d.on) continue;
      d.age += dt;
      const u = d.age / d.life;
      if (u >= 1) { d.on = false; m.visible = false; continue; }
      m.scale.setScalar(d.radius * (0.2 + 0.8 * easeOutCubic(u)));
      m.material.opacity = 0.9 * Math.pow(1 - u, 1.4);
    }
  }

  // ====================================================================== pop text
  const textCache = new Map(); // key -> { tex, w, h }
  function hexToCss(c) {
    return typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
  }
  const FONT_PX = 64;
  const FONT = `900 ${FONT_PX}px "Arial Rounded MT Bold", "Nunito", "Baloo 2", "Varela Round", system-ui, "Segoe UI", sans-serif`;
  function getTextTexture(text, colorCss) {
    const key = text + '|' + colorCss;
    let e = textCache.get(key);
    if (e) { textCache.delete(key); textCache.set(key, e); return e; } // LRU refresh
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = FONT;
    const pad = 20;
    const tw = Math.ceil(ctx.measureText(text).width);
    cv.width = tw + pad * 2;
    cv.height = FONT_PX + pad * 2;
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const cx = cv.width / 2, cy = cv.height / 2 + 2;
    ctx.lineWidth = 15;
    ctx.strokeStyle = '#2b1740';
    ctx.strokeText(text, cx, cy);
    ctx.fillStyle = colorCss;
    ctx.fillText(text, cx, cy);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    e = { tex, aspect: cv.width / cv.height, key };
    textCache.set(key, e);
    if (textCache.size > TEXT_CACHE_CAP) {
      const oldest = textCache.keys().next().value;
      textCache.get(oldest).tex.dispose(); // if still on screen three.js simply re-uploads it
      textCache.delete(oldest);
    }
    return e;
  }

  // placeholder map so swapping maps later never needs a shader recompile
  const blankCv = document.createElement('canvas');
  blankCv.width = blankCv.height = 2;
  const blankTex = new THREE.CanvasTexture(blankCv);
  blankTex.colorSpace = THREE.SRGBColorSpace;
  const sprites = [];
  for (let i = 0; i < TEXT_POOL; i++) {
    const mat = new THREE.SpriteMaterial({ map: blankTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
    const s = new THREE.Sprite(mat);
    s.visible = false;
    s.renderOrder = 1000;
    s.frustumCulled = false;
    Object.assign(s.userData, { on: false, age: 0, life: 1, baseY: 0, h: 1, w: 1, key: '' });
    scene.add(s);
    sprites.push(s);
  }
  let spriteCursor = 0;
  // 1 world unit of em-height ~ 0.72 cap-height; sprite canvas = FONT_PX + 2*pad
  const TEXT_UNITS_PER_PX = 1.1 / (FONT_PX * 0.72);

  function popText(pos, text, { color = '#fff', size = 1, life = 0.9 } = {}) {
    text = String(text);
    const css = hexToCss(color);
    const e = getTextTexture(text, css);
    const s = sprites[spriteCursor];
    spriteCursor = (spriteCursor + 1) % TEXT_POOL;
    const d = s.userData;
    s.material.map = e.tex;
    const h = e.tex.image.height * TEXT_UNITS_PER_PX * size;
    d.on = true; d.age = 0; d.life = Math.max(0.1, life);
    d.baseY = pos.y + 0.6; d.h = h; d.w = h * e.aspect; d.key = e.key;
    s.position.set(pos.x, d.baseY, pos.z);
    s.scale.set(0.001, 0.001, 1);
    s.material.opacity = 1;
    s.visible = true;
  }

  function updateText(dt) {
    for (let i = 0; i < TEXT_POOL; i++) {
      const s = sprites[i];
      const d = s.userData;
      if (!d.on) continue;
      d.age += dt;
      const u = d.age / d.life;
      if (u >= 1) { d.on = false; s.visible = false; continue; }
      const k = easeOutBack(clamp01(d.age / 0.2), 2.6);
      s.scale.set(d.w * k, d.h * k, 1);
      s.position.y = d.baseY + 1.6 * easeOutCubic(u);
      s.material.opacity = u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
    }
  }

  // ========================================================================= fly
  const sharedMat = getSharedMaterial();
  function makeFlyPool(geometry) {
    const mesh = new THREE.InstancedMesh(geometry, sharedMat, FLY_CAP);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    const free = new Int16Array(FLY_CAP);
    for (let i = 0; i < FLY_CAP; i++) free[i] = FLY_CAP - 1 - i;
    return {
      mesh, free, freeN: FLY_CAP, active: 0,
      on: new Uint8Array(FLY_CAP),
      delay: new Float32Array(FLY_CAP), t: new Float32Array(FLY_CAP), dur: new Float32Array(FLY_CAP),
      arc: new Float32Array(FLY_CAP), roll: new Float32Array(FLY_CAP), yaw: new Float32Array(FLY_CAP),
      fx: new Float32Array(FLY_CAP), fy: new Float32Array(FLY_CAP), fz: new Float32Array(FLY_CAP),
      tx: new Float32Array(FLY_CAP), ty: new Float32Array(FLY_CAP), tz: new Float32Array(FLY_CAP),
      toFn: new Array(FLY_CAP).fill(null), onDone: new Array(FLY_CAP).fill(null),
    };
  }
  const flyPools = [];
  for (let i = 0; i < BOUQUET_TYPES; i++) flyPools.push(makeFlyPool(makeBouquetGeometry(i)));
  flyPools.push(makeFlyPool(makeBillGeometry()));
  const BILL_POOL = BOUQUET_TYPES;

  function safeCall(fn) {
    try { fn(); } catch (err) { console.error(err); }
  }

  function fly({ kind = 'bouquet', type = 0, from, to, dur = 0.32, arc = 1.6, delay = 0, onDone } = {}) {
    const pool = kind === 'bill' ? flyPools[BILL_POOL] : flyPools[Math.max(0, Math.min(BOUQUET_TYPES - 1, type | 0))];
    if (pool.freeN === 0 || !from || !to) { if (onDone) safeCall(onDone); return; }
    const i = pool.free[--pool.freeN];
    pool.on[i] = 1; pool.active++;
    pool.delay[i] = delay; pool.t[i] = 0; pool.dur[i] = Math.max(0.02, dur); pool.arc[i] = arc;
    pool.roll[i] = (rand() < 0.5 ? -1 : 1) * 6.283 * (kind === 'bill' ? 1 : 1);
    pool.yaw[i] = 0;
    pool.fx[i] = from.x; pool.fy[i] = from.y; pool.fz[i] = from.z;
    if (typeof to === 'function') {
      pool.toFn[i] = to;
      pool.tx[i] = from.x; pool.ty[i] = from.y; pool.tz[i] = from.z;
    } else {
      pool.toFn[i] = null;
      pool.tx[i] = to.x; pool.ty[i] = to.y; pool.tz[i] = to.z;
    }
    pool.onDone[i] = onDone || null;
  }

  function updateFlyPool(pool, dt) {
    if (pool.active === 0) { if (pool.mesh.count !== 0) pool.mesh.count = 0; return; }
    let j = 0;
    for (let i = 0; i < FLY_CAP; i++) {
      if (!pool.on[i]) continue;
      if (pool.delay[i] > 0) { // waiting: invisible
        pool.delay[i] -= dt;
        if (pool.delay[i] > 0) continue;
        pool.t[i] = 0;
        pool.delay[i] = 0;
      }
      let t = pool.t[i] + dt / pool.dur[i];
      pool.t[i] = t;
      const fn = pool.toFn[i];
      if (fn) {
        const v = fn(tmpTo) || tmpTo;
        pool.tx[i] = v.x; pool.ty[i] = v.y; pool.tz[i] = v.z;
      }
      if (t >= 1) {
        const cb = pool.onDone[i];
        pool.on[i] = 0; pool.active--; pool.toFn[i] = null; pool.onDone[i] = null;
        pool.free[pool.freeN++] = i;
        if (cb) safeCall(cb);
        continue;
      }
      if (t < 0) t = 0;
      const e = easeOutQuad(t);
      const fx0 = pool.fx[i], fy0 = pool.fy[i], fz0 = pool.fz[i];
      const dx = pool.tx[i] - fx0, dz = pool.tz[i] - fz0;
      if (dx * dx + dz * dz > 1e-6) pool.yaw[i] = Math.atan2(-dz, dx);
      tmpPos.set(
        fx0 + dx * e,
        fy0 + (pool.ty[i] - fy0) * e + pool.arc[i] * 4 * e * (1 - e),
        fz0 + dz * e,
      );
      let s = 0.6 + 0.4 * easeOutCubic(clamp01(t / 0.6));
      if (t > 0.85) s *= 1 + 0.16 * Math.sin(((t - 0.85) / 0.15) * Math.PI);
      tmpEuler.set(pool.roll[i] * e, pool.yaw[i], 0, 'YXZ');
      tmpQuat.setFromEuler(tmpEuler);
      tmpScale.set(s, s, s);
      tmpMat.compose(tmpPos, tmpQuat, tmpScale);
      pool.mesh.setMatrixAt(j++, tmpMat);
    }
    pool.mesh.count = j;
    pool.mesh.instanceMatrix.needsUpdate = true;
  }

  // ======================================================================== tweens
  const tweens = [];
  const tweenFree = [];

  function baseScale(obj) {
    let b = obj.userData.fxBase;
    if (!b) {
      b = obj.userData.fxBase = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };
      if (Math.abs(b.x) + Math.abs(b.y) + Math.abs(b.z) < 1e-4) { b.x = b.y = b.z = 1; }
    }
    return b;
  }

  function startTween(obj, kind, dur, delay, amt) {
    const old = obj.userData.fxTween;
    let tw = old;
    if (!tw) {
      tw = tweenFree.pop() || {};
      tweens.push(tw);
    } else if (old.kind === 2) obj.visible = true;
    tw.obj = obj; tw.kind = kind; tw.t = 0; tw.dur = Math.max(0.02, dur); tw.delay = delay; tw.amt = amt;
    obj.userData.fxTween = tw;
    return tw;
  }

  function pop(obj, { scale = 1.25, dur = 0.28 } = {}) {
    if (!obj) return;
    const b = baseScale(obj);
    obj.scale.set(b.x, b.y, b.z);
    startTween(obj, 1, dur, 0, scale - 1);
  }

  function popIn(obj, { dur = 0.5, delay = 0 } = {}) {
    if (!obj) return;
    baseScale(obj);
    obj.scale.set(0, 0, 0);
    startTween(obj, 2, dur, delay, 0);
    obj.visible = !(delay > 0);
  }

  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const obj = tw.obj;
      const b = obj.userData.fxBase;
      let done = false;
      if (tw.delay > 0) {
        tw.delay -= dt;
        if (tw.delay > 0) continue;
        tw.t = 0; tw.delay = 0;
        if (tw.kind === 2) obj.visible = true;
      }
      tw.t += dt / tw.dur;
      const u = tw.t;
      if (u >= 1) {
        obj.scale.set(b.x, b.y, b.z);
        done = true;
      } else if (tw.kind === 1) {
        const a = Math.sin(u * Math.PI * 1.6) * Math.pow(1 - u, 1.2);
        obj.scale.set(b.x * (1 - tw.amt * 0.55 * a), b.y * (1 + tw.amt * a), b.z * (1 - tw.amt * 0.55 * a));
      } else {
        const k = easeElasticOut(u);
        obj.scale.set(b.x * k, b.y * k, b.z * k);
      }
      if (done) {
        obj.userData.fxTween = null;
        tw.obj = null;
        tweens[i] = tweens[tweens.length - 1];
        tweens.pop();
        tweenFree.push(tw);
      }
    }
  }

  // ======================================================================== shake
  let shAmp = 0, shDur = 0.001, shT = 1;
  function shake(amount = 0.3, dur = 0.25) {
    const cur = shT < shDur ? shAmp * Math.pow(1 - shT / shDur, 2) : 0;
    if (amount >= cur) { shAmp = amount; shDur = Math.max(0.02, dur); shT = 0; }
  }
  function updateShake(dt) {
    if (shT >= shDur) {
      if (shakeOffset.x !== 0 || shakeOffset.y !== 0 || shakeOffset.z !== 0) shakeOffset.set(0, 0, 0);
      return;
    }
    shT += dt;
    if (shT >= shDur) { shakeOffset.set(0, 0, 0); return; }
    const a = shAmp * Math.pow(1 - shT / shDur, 2);
    shakeOffset.set((rand() - 0.5) * 2 * a, (rand() - 0.5) * a, (rand() - 0.5) * 2 * a);
  }

  // ======================================================================= update
  function update(dt) {
    updateParticles(dt);
    updateRings(dt);
    updateText(dt);
    for (let i = 0; i < flyPools.length; i++) updateFlyPool(flyPools[i], dt);
    updateTweens(dt);
    updateShake(dt);
  }

  const fx = {
    shakeOffset,
    update,
    burst(pos, o) { burst(pos, o); syncParticleCount(); },
    confetti(pos, n) { confetti(pos, n); syncParticleCount(); },
    ring, popText, fly, pop, popIn, shake,
    /** Debug/testing counters. */
    stats() {
      let flying = 0;
      for (const p of flyPools) flying += p.active;
      let particles = 0;
      for (let i = 0; i < PARTICLE_CAP; i++) particles += P.alive[i];
      let texts = 0;
      for (const s of sprites) texts += s.userData.on ? 1 : 0;
      let rg = 0;
      for (const r of rings) rg += r.userData.on ? 1 : 0;
      return { flying, particles, texts, rings: rg, tweens: tweens.length, textCache: textCache.size, particleCap: PARTICLE_CAP, flyCap: FLY_CAP };
    },
  };
  return fx;
}
