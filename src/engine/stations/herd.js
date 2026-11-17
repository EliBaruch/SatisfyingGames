// Station type 'herd': creatures that roam an area, take several hits to bring down and then
// drop items. Capability: harvest area, so the player, haulers, hints and the test bot hunt it the
// same way they pick a field. Not built in: list '../../engine/stations/herd.js' in the world's
// `modules`.
//
// def = {
//   id, type: 'herd', name, item: 'meat', open,
//   area: { minX, maxX, minZ, maxZ },   // where the creatures roam (also the harvest bounds)
//   count: 10,                          // creatures alive at once
//   hp: 3, drops: 3,                    // hits to bring one down (at damage 1); items it drops
//   radius: 0.6,                        // body radius: a hit lands within reach + radius
//   damageStat: 'damage',               // G.stats key: damage per swing (default 1)
//   swingTime: 0.32,                    // seconds per swing; damage is applied smoothly at damage / swingTime
//   speed: 1.3, chase: 2.6, aggro: 6,   // wander speed; speed toward the player once within `aggro` (0 = never)
//   regrowStat: 'herdRegrow',           // G.stats key: seconds until a creature is replaced
//   regrowJitter: 2,
//   spawn: [{ x, z }, ...],             // where replacements walk in from (default: a random edge point)
//   model: () => BufferGeometry,        // faces +Z, origin on the ground (vertex colours, shared material)
//   height: 1.2,                        // top of the model: the health bar floats above it
//   scale: [0.9, 1.15],                 // random size range
//   burst: [0xffffff, ...],             // particle colours when hit
//   home: { x, z },                     // where hired hunters appear
// }
//
// Damage is continuous: every harvestAt() call (one per simulation step and caller) takes
// damage x STEP / swingTime from each creature in reach, so any number of callers can hunt the
// same herd without per-caller timers. `data.hit` is set on the caller's data object when
// something was struck (the player uses it to keep swinging between kills).
//
// For towers and other ranged roles: station.creatures = { nearest(x, z, range) -> index | -1,
// pos(index, out) -> out, strike(index, damage, max, onItem, data) -> items dropped }.
import * as THREE from 'three';
import { registerStationType } from '../registry.js';
import { getSharedMaterial } from '../geom.js';
import { STEP } from '../config.js';

const ALIVE = 0, DEAD = 1, ENTER = 2;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _right = new THREE.Vector3();
const _c = new THREE.Color();
const _burst = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function elasticOut(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -9 * t) * Math.sin((t * 8 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

function createHerd(G, def) {
  const A = def.area;
  const N = Math.max(1, def.count | 0 || 8);
  const kind = def.item;
  const HP = def.hp > 0 ? def.hp : 3;
  const DROPS = Math.max(1, def.drops | 0 || 1);
  const RAD = def.radius > 0 ? def.radius : 0.6;
  const swingTime = def.swingTime > 0 ? def.swingTime : 0.32;
  const damageStat = def.damageStat || 'damage';
  const regrowStat = def.regrowStat || 'herdRegrow';
  const jitter = def.regrowJitter ?? 2;
  const SPEED = def.speed ?? 1.3, CHASE = def.chase ?? 2.6, AGGRO = def.aggro ?? 6;
  const height = def.height || 1.2;
  const sMin = (def.scale && def.scale[0]) || 0.9, sMax = (def.scale && def.scale[1]) || 1.15;
  const spawnPts = Array.isArray(def.spawn) && def.spawn.length ? def.spawn : null;
  const bounds = { minX: A.minX, maxX: A.maxX, minZ: A.minZ, maxZ: A.maxZ };

  const xs = new Float32Array(N), zs = new Float32Array(N), yaw = new Float32Array(N);
  const tx = new Float32Array(N), tz = new Float32Array(N), think = new Float32Array(N);
  const kx = new Float32Array(N), kz = new Float32Array(N);          // knock-back velocity
  const hp = new Float32Array(N), scl = new Float32Array(N), phase = new Float32Array(N);
  const timer = new Float32Array(N), flash = new Float32Array(N), grow = new Float32Array(N);
  const state = new Uint8Array(N);

  const geo = typeof def.model === 'function' ? def.model() : def.model;
  const mesh = new THREE.InstancedMesh(geo, getSharedMaterial(), N);
  mesh.castShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.visible = false;
  for (let i = 0; i < N; i++) { mesh.setMatrixAt(i, ZERO); mesh.setColorAt(i, _c.setRGB(1, 1, 1)); }
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  G.scene.add(mesh);

  // health bars: two flat quads per creature (dark back, coloured fill), turned to the camera
  const barGeo = new THREE.PlaneGeometry(1, 1);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), N * 2);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  bars.renderOrder = 6;
  bars.visible = false;
  for (let i = 0; i < N; i++) {
    bars.setMatrixAt(i * 2, ZERO); bars.setMatrixAt(i * 2 + 1, ZERO);
    bars.setColorAt(i * 2, _c.setRGB(0.08, 0.1, 0.14)); bars.setColorAt(i * 2 + 1, _c.setRGB(0.3, 0.95, 0.42));
  }
  G.scene.add(bars);
  const BAR_W = 0.95, BAR_H = 0.13;

  const rand = Math.random;
  function pickSpot(i) {
    tx[i] = A.minX + RAD + rand() * (A.maxX - A.minX - RAD * 2);
    tz[i] = A.minZ + RAD + rand() * (A.maxZ - A.minZ - RAD * 2);
    think[i] = 2 + rand() * 4;
  }
  function place(i, entering) {
    if (entering) {
      if (spawnPts) {
        const s = spawnPts[(rand() * spawnPts.length) | 0];
        xs[i] = s.x + (rand() - 0.5) * 1.5; zs[i] = s.z + (rand() - 0.5) * 1.5;
      } else {
        // a point on a random edge of the area
        const side = (rand() * 4) | 0, u = rand();
        xs[i] = side === 0 ? A.minX : side === 1 ? A.maxX : A.minX + u * (A.maxX - A.minX);
        zs[i] = side === 2 ? A.minZ : side === 3 ? A.maxZ : A.minZ + u * (A.maxZ - A.minZ);
      }
    } else {
      xs[i] = A.minX + RAD + rand() * (A.maxX - A.minX - RAD * 2);
      zs[i] = A.minZ + RAD + rand() * (A.maxZ - A.minZ - RAD * 2);
    }
    yaw[i] = rand() * Math.PI * 2;
    scl[i] = sMin + rand() * (sMax - sMin);
    phase[i] = rand() * 6.283;
    hp[i] = HP; kx[i] = kz[i] = 0; flash[i] = 0;
    state[i] = entering ? ENTER : ALIVE;
    grow[i] = entering ? 0 : 1;
    pickSpot(i);
  }
  for (let i = 0; i < N; i++) place(i, false);

  const burstOpts = { colors: def.burst || [0xffffff, 0xe8eef6], count: 3, speed: 3, size: 0.12, life: 0.45, up: 2.6 };
  const dieOpts = { colors: def.burst || [0xffffff, 0xe8eef6], count: 12, speed: 4.2, size: 0.16, life: 0.6, up: 3.4 };
  const killEv = { station: null, stationId: def.id, x: 0, z: 0 };
  let alive = N;

  function kill(i, max, onItem, data) {
    state[i] = DEAD;
    timer[i] = (G.stats[regrowStat] || 8) + rand() * jitter;
    alive--;
    harvest.available = alive;
    const n = Math.min(DROPS, max);
    if (onItem) for (let k = 0; k < n; k++) onItem(kind, xs[i] + (rand() - 0.5) * 0.5, zs[i] + (rand() - 0.5) * 0.5, data);
    if (G.fx && G.fx.burst) { _burst.set(xs[i], height * 0.5, zs[i]); G.fx.burst(_burst, dieOpts); }
    killEv.station = station; killEv.x = xs[i]; killEv.z = zs[i];
    G.events.emit('herd:kill', killEv);
    return n;
  }
  /** Take `dmg` from creature i, pushed away from (fromX, fromZ). Returns items dropped (0 unless it died). */
  function hurt(i, dmg, fromX, fromZ, max, onItem, data) {
    hp[i] -= dmg;
    if (flash[i] <= 0) {
      flash[i] = 0.14;
      const dx = xs[i] - fromX, dz = zs[i] - fromZ;
      const d = Math.hypot(dx, dz) || 1;
      kx[i] += (dx / d) * 2.6; kz[i] += (dz / d) * 2.6;
      if (G.fx && G.fx.burst) { _burst.set(xs[i], height * 0.6, zs[i]); G.fx.burst(_burst, burstOpts); }
    }
    return hp[i] <= 0 ? kill(i, max, onItem, data) : 0;
  }

  const harvest = {
    kind,
    bounds,
    spacing: RAD * 2,
    total: N,
    available: N,
    action: def.action || 'swing',
    harvestAt(x, z, radius, max, onItem, data) {
      if (!station.active || max <= 0 || alive === 0) return 0;
      const reach = radius + RAD;
      if (x < A.minX - reach - 2 || x > A.maxX + reach + 2 || z < A.minZ - reach - 2 || z > A.maxZ + reach + 2) return 0;
      const dmg = (G.stats[damageStat] || 1) * STEP / swingTime;
      const r2 = reach * reach;
      let n = 0;
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        if (dx * dx + dz * dz > r2) continue;
        if (data) data.hit = true;
        n += hurt(i, dmg, x, z, max - n, onItem, data);
        if (n >= max) break;
      }
      return n;
    },
    hasNear(x, z, radius) {
      if (!station.active || alive === 0) return false;
      const r = radius + RAD, r2 = r * r;
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        if (dx * dx + dz * dz <= r2) return true;
      }
      return false;
    },
    nearest(x, z, out) {
      if (!station.active || alive === 0) return false;
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return false;
      out.x = xs[best]; out.z = zs[best];
      return true;
    },
  };

  const creatures = {
    count: N,
    /** index of the nearest living creature within `range` of (x, z), or -1 */
    nearest(x, z, range) {
      if (!station.active) return -1;
      let best = -1, bd = range * range;
      for (let i = 0; i < N; i++) {
        if (state[i] !== ALIVE) continue;
        const dx = xs[i] - x, dz = zs[i] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
    alive(i) { return state[i] === ALIVE; },
    pos(i, out) { return out.set(xs[i], height * 0.55 * scl[i], zs[i]); },
    /** hit creature i for `damage`; if it dies, up to `max` items go to onItem(kind, x, z, data) */
    strike(i, damage, max, onItem, data) {
      if (state[i] === DEAD) return 0;
      flash[i] = 0;
      return hurt(i, damage, xs[i], zs[i] - 1, max, onItem, data);
    },
  };

  function draw(dt) {
    const cq = G.camera.quaternion;
    _right.set(1, 0, 0).applyQuaternion(cq);
    let anyBar = false;
    for (let i = 0; i < N; i++) {
      if (state[i] === DEAD) {
        // shrink away quickly after the kill
        if (grow[i] > 0) {
          grow[i] = Math.max(0, grow[i] - dt * 7);
          if (grow[i] <= 0) mesh.setMatrixAt(i, ZERO);
          else {
            _p.set(xs[i], 0, zs[i]);
            const k = scl[i] * grow[i]; _s.set(k * 1.15, k * 0.6, k * 1.15);
            mesh.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e.set(0, yaw[i], 0)), _s));
          }
        }
        bars.setMatrixAt(i * 2, ZERO); bars.setMatrixAt(i * 2 + 1, ZERO);
        continue;
      }
      // body: a small hop while walking, a squash when hit
      const hop = Math.abs(Math.sin(G.time * 7 + phase[i])) * 0.07;
      const hit = flash[i] > 0 ? flash[i] / 0.14 : 0;
      const g = state[i] === ENTER ? elasticOut(grow[i]) : 1;
      const k = scl[i] * g;
      _p.set(xs[i], hop * k, zs[i]);
      _q.setFromEuler(_e.set(-hit * 0.22, yaw[i], Math.sin(G.time * 7 + phase[i]) * 0.05));
      _s.set(k * (1 + hit * 0.12), k * (1 - hit * 0.14), k * (1 + hit * 0.12));
      mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      const f = 1 + hit * 0.9;
      mesh.setColorAt(i, _c.setRGB(f, f, f));
      // health bar (only once it has been hurt)
      const frac = Math.max(0, hp[i] / HP);
      if (frac < 0.999) {
        anyBar = true;
        const y = (height + 0.35) * k;
        _p.set(xs[i], y, zs[i]); _s.set(BAR_W + 0.06, BAR_H + 0.06, 1);
        bars.setMatrixAt(i * 2, _m.compose(_p, cq, _s));
        const w = BAR_W * frac;
        _p.set(xs[i] - _right.x * (BAR_W - w) * 0.5, y - _right.y * (BAR_W - w) * 0.5, zs[i] - _right.z * (BAR_W - w) * 0.5);
        _s.set(w, BAR_H, 1);
        bars.setMatrixAt(i * 2 + 1, _m.compose(_p, cq, _s));
        bars.setColorAt(i * 2 + 1, frac > 0.5 ? _c.setRGB(0.3, 0.95, 0.42) : frac > 0.25 ? _c.setRGB(1, 0.8, 0.2) : _c.setRGB(1, 0.3, 0.25));
      } else {
        bars.setMatrixAt(i * 2, ZERO); bars.setMatrixAt(i * 2 + 1, ZERO);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    bars.instanceMatrix.needsUpdate = true;
    if (anyBar) bars.instanceColor.needsUpdate = true;
  }

  const station = {
    pos: { x: (A.minX + A.maxX) / 2, z: (A.minZ + A.maxZ) / 2 },
    name: def.name,
    active: false,
    harvest,
    creatures,
    home: def.home || null,
    meshes: { creatures: mesh, bars },
    get alive() { return alive; },
    activate(live) {
      mesh.visible = true; bars.visible = true;
      if (live) {
        // the herd wanders in, one after another
        for (let i = 0; i < N; i++) { place(i, true); grow[i] = -i * 0.12; }
      }
      draw(0);
    },
    update(dt) {
      if (!station.active) return;
      const pl = G.player;
      const px = pl ? pl.pos.x : 1e9, pz = pl ? pl.pos.z : 1e9;
      const playerNear = AGGRO > 0 && px > A.minX - 3 && px < A.maxX + 3 && pz > A.minZ - 3 && pz < A.maxZ + 3;
      for (let i = 0; i < N; i++) {
        const st = state[i];
        if (st === DEAD) {
          timer[i] -= dt;
          if (timer[i] <= 0 && grow[i] <= 0) { place(i, true); alive++; harvest.available = alive; }
          continue;
        }
        if (st === ENTER) {
          grow[i] += dt * 1.8;
          if (grow[i] >= 1) { grow[i] = 1; state[i] = ALIVE; }
          if (grow[i] < 0) continue;
        }
        if (flash[i] > 0) flash[i] -= dt;
        // where to: toward the player when it is close, else a wander point
        let gx = tx[i], gz = tz[i], sp = SPEED;
        if (playerNear) {
          const dx = px - xs[i], dz = pz - zs[i];
          const d2 = dx * dx + dz * dz;
          if (d2 < AGGRO * AGGRO) { gx = px; gz = pz; sp = d2 > (RAD + 0.5) * (RAD + 0.5) ? CHASE : 0; }
        }
        if (sp === SPEED) { think[i] -= dt; if (think[i] <= 0) pickSpot(i); }
        const dx = gx - xs[i], dz = gz - zs[i];
        const d = Math.hypot(dx, dz);
        if (d > 0.25 && sp > 0) {
          xs[i] += (dx / d) * sp * dt; zs[i] += (dz / d) * sp * dt;
          // turn toward the heading
          let da = Math.atan2(dx, dz) - yaw[i];
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          yaw[i] += da * Math.min(1, dt * 7);
        } else if (sp === SPEED && d <= 0.25) { think[i] = Math.min(think[i], 0.6 + rand()); }
        // knock-back
        if (kx[i] !== 0 || kz[i] !== 0) {
          xs[i] += kx[i] * dt; zs[i] += kz[i] * dt;
          const k = Math.exp(-9 * dt);
          kx[i] *= k; kz[i] *= k;
          if (kx[i] * kx[i] + kz[i] * kz[i] < 0.01) { kx[i] = 0; kz[i] = 0; }
        }
      }
      // keep them apart, and inside the area
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD) continue;
        for (let j = i + 1; j < N; j++) {
          if (state[j] === DEAD) continue;
          const dx = xs[j] - xs[i], dz = zs[j] - zs[i];
          const min = RAD * (scl[i] + scl[j]) * 0.9;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const ux = dx / d, uz = dz / d;
          xs[i] -= ux * push; zs[i] -= uz * push; xs[j] += ux * push; zs[j] += uz * push;
        }
        if (state[i] === ALIVE) {
          if (xs[i] < A.minX) xs[i] = A.minX; else if (xs[i] > A.maxX) xs[i] = A.maxX;
          if (zs[i] < A.minZ) zs[i] = A.minZ; else if (zs[i] > A.maxZ) zs[i] = A.maxZ;
        }
      }
      draw(dt);
    },
  };
  return station;
}

registerStationType('herd', { create: createHerd, describe: 'roaming creatures with health that drop items; harvest area' });
