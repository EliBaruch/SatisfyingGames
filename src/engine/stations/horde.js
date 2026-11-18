// Station type 'horde': raiders that march in waves across a battlefield toward a wall, bash it,
// steal from a cash pile while they stand there, and pay a bounty onto that pile when they fall.
// A thief bashes a few times, grabs coins and runs. Several kinds of foe share one station (one instanced mesh per kind). The keep world uses it with
// the 'battery' station type (towers that shoot them). Not built in: list
// '../../engine/stations/horde.js' in the world's `modules`.
//
// def = {
//   id, type: 'horde', name, open,
//   area: { minX, maxX, minZ, maxZ },   // the battlefield (lanes run across x; foes march toward -z)
//   wallZ: 11.4,                        // the line they stop at to bash the wall
//   spawnZ: 40,                         // where they appear (a little scatter beyond it)
//   kinds: [{ id, hp, bounty, speed, radius, height, scale: [a, b], pool, model: () => BufferGeometry,
//             bash: 1.4 (seconds between blows), blows: 3 (then it grabs `steal` from the cash station and runs
//             back the way it came; kill it before it escapes to win the coins back), burst: [colours] }],
//   waves: [null, { every: 9, mix: { raider: 3 } }, ...],   // indexed by G.stats[levelStat]; null = quiet
//   levelStat: 'raid',
//   hpStat: null,                       // optional G.stats key multiplying every foe's health
//   cash: 'chest',                      // a station with deposit() and cash (bounty goes there, thieves take from it)
//   melee: { damageStat: 'heroDamage', swingTime: 0.32 },   // the player strikes whatever is within reach
//   alert: { count: 3, text: 'Raiders at the wall!' },     // the goal hint when this many bash the wall
//   home: { x, z }, hint,
// }
//
// Capabilities: a harvest area (so the hints and the test bot send the player to fight: it never
// hands out items, the bounty flies to the cash station instead) and `alert` ({ active, x, z, r,
// text, nearest(x, z, out) }) read by the hints and the bot.
//
// For towers: station.foes = {
//   total, alive(i), pos(i, out), vz(i), height(i),
//   pick(x, z, range, minRange, skip, nSkip) -> index | -1   (the living foe in range nearest the wall)
//   strike(i, damage, burn) / splash(x, z, r, damage, burn) / near(x, z, r, hitMask) -> index | -1
// }
// Events: 'horde:kill' { station, stationId, kind, x, z, bounty } and 'horde:wave' { station, stationId, level, n }
// (payloads reused). Nothing is saved: a reload starts with an empty field and the next wave on its way.
import * as THREE from 'three';
import { registerStationType } from '../registry.js';
import { getSharedMaterial } from '../geom.js';

const DEAD = 0, ENTER = 1, WALK = 2, BASH = 3, FLEE = 4;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _right = new THREE.Vector3();
const _c = new THREE.Color();
const _b = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function createHorde(G, def) {
  const A = def.area;
  const KINDS = def.kinds;
  const NK = KINDS.length;
  const kindIndex = {};
  KINDS.forEach((k, i) => { kindIndex[k.id] = i; });
  // global foe slots, kind by kind
  const base = new Int32Array(NK + 1);
  for (let k = 0; k < NK; k++) base[k + 1] = base[k] + Math.max(1, KINDS[k].pool | 0 || 12);
  const N = base[NK];
  const kindOf = new Uint8Array(N), local = new Int32Array(N);
  for (let k = 0; k < NK; k++) for (let i = base[k]; i < base[k + 1]; i++) { kindOf[i] = k; local[i] = i - base[k]; }

  const xs = new Float32Array(N), zs = new Float32Array(N), lane = new Float32Array(N), yaw = new Float32Array(N);
  const kx = new Float32Array(N), kz = new Float32Array(N);
  const hp = new Float32Array(N), maxHp = new Float32Array(N), scl = new Float32Array(N), phase = new Float32Array(N);
  const flash = new Float32Array(N), burn = new Float32Array(N), burnDps = new Float32Array(N);
  const grow = new Float32Array(N), bashT = new Float32Array(N), blow = new Float32Array(N);
  const blows = new Uint8Array(N), loot = new Float32Array(N);
  const state = new Uint8Array(N);

  const wallZ = def.wallZ;
  const spawnZ = def.spawnZ ?? A.maxZ;
  const levelStat = def.levelStat || 'raid';
  const swingTime = (def.melee && def.melee.swingTime) || 0.32;
  const meleeStat = (def.melee && def.melee.damageStat) || 'heroDamage';
  const alertCount = (def.alert && def.alert.count) || 3;

  // ------------------------------------------------------------------ meshes
  const meshes = KINDS.map((k, ki) => {
    const geo = typeof k.model === 'function' ? k.model() : k.model;
    const n = base[ki + 1] - base[ki];
    const m = new THREE.InstancedMesh(geo, getSharedMaterial(), n);
    m.name = 'horde:' + k.id;
    m.castShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.visible = false;
    for (let i = 0; i < n; i++) { m.setMatrixAt(i, ZERO); m.setColorAt(i, _c.setRGB(1, 1, 1)); }
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    G.scene.add(m);
    return m;
  });
  const barGeo = new THREE.PlaneGeometry(1, 1);
  const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ depthTest: false, transparent: true }), N * 2);
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bars.frustumCulled = false;
  bars.renderOrder = 6;
  bars.visible = false;
  for (let i = 0; i < N; i++) {
    bars.setMatrixAt(i * 2, ZERO); bars.setMatrixAt(i * 2 + 1, ZERO);
    bars.setColorAt(i * 2, _c.setRGB(0.08, 0.1, 0.14)); bars.setColorAt(i * 2 + 1, _c.setRGB(1, 0.32, 0.26));
  }
  G.scene.add(bars);

  const rand = Math.random;
  const hpMul = () => (def.hpStat ? (G.stats[def.hpStat] || 1) : 1);
  let aliveN = 0, bashN = 0;
  const tally = { spawned: 0, kills: 0, bounty: 0, stolen: 0, escaped: 0, recovered: 0 };
  const bursts = KINDS.map((k) => ({ colors: k.burst || [0xffffff, 0xd9c3a0], count: 3, speed: 3, size: 0.12, life: 0.4, up: 2.4 }));
  const deaths = KINDS.map((k) => ({ colors: k.burst || [0xffffff, 0xd9c3a0], count: 14, speed: 4.6, size: 0.17, life: 0.6, up: 3.6 }));
  const fireBurst = { colors: [0xffc233, 0xff7a2a, 0xfff1a8], count: 1, speed: 1.2, size: 0.13, life: 0.35, up: 2.2 };
  const dustBurst = { colors: [0xcdb89a, 0xa89272, 0xe8dcc4], count: 5, speed: 2.2, size: 0.2, life: 0.55, up: 1.6 };

  function spawn(ki) {
    // a free slot of this kind
    let i = -1;
    for (let j = base[ki]; j < base[ki + 1]; j++) if (state[j] === DEAD && grow[j] <= 0) { i = j; break; }
    if (i < 0) return false;
    const k = KINDS[ki];
    const r = k.radius || 0.5;
    lane[i] = A.minX + r + rand() * (A.maxX - A.minX - r * 2);
    xs[i] = lane[i] + (rand() - 0.5) * 3;
    zs[i] = spawnZ + rand() * 3;
    yaw[i] = Math.PI;
    scl[i] = (k.scale ? k.scale[0] + rand() * (k.scale[1] - k.scale[0]) : 1);
    phase[i] = rand() * 6.283;
    maxHp[i] = (k.hp || 3) * hpMul();
    hp[i] = maxHp[i];
    kx[i] = kz[i] = 0; flash[i] = 0; burn[i] = 0; burnDps[i] = 0; blow[i] = 0; blows[i] = 0; loot[i] = 0;
    bashT[i] = (k.bash || 1.4) * (0.5 + rand() * 0.5);
    grow[i] = 0;
    state[i] = ENTER;
    aliveN++;
    tally.spawned++;
    harvest.available = aliveN;
    return true;
  }

  // --------------------------------------------------------------- waves
  const Q = new Uint8Array(256);
  const waveCnt = new Uint8Array(NK);
  const W = { t: 2.5, qHead: 0, qTail: 0, qT: 0, level: 0, waves: 0 };
  const waveEv = { station: null, stationId: def.id, level: 0, n: 0 };
  function queueWave(level) {
    const wv = def.waves[level];
    if (!wv) return;
    let n = 0;
    // interleave the kinds so a wave arrives mixed: tougher foes toward the back
    let left = true;
    const cnt = waveCnt;
    cnt.fill(0);
    for (const id in wv.mix) { const ki = kindIndex[id]; if (ki !== undefined) cnt[ki] = wv.mix[id] | 0; }
    while (left) {
      left = false;
      for (let k = 0; k < NK; k++) {
        if (cnt[k] <= 0) continue;
        cnt[k]--; left = true;
        if (((W.qTail + 1) & 255) === W.qHead) break;
        Q[W.qTail] = k; W.qTail = (W.qTail + 1) & 255; n++;
      }
    }
    W.waves++;
    waveEv.station = station; waveEv.level = level; waveEv.n = n;
    G.events.emit('horde:wave', waveEv);
  }

  // ------------------------------------------------------------- damage
  const cash = () => { const s = def.cash ? G.stations.get(def.cash) : null; return s && s.active ? s : null; };
  const killEv = { station: null, stationId: def.id, kind: '', x: 0, z: 0, bounty: 0 };
  const coinFrom = new THREE.Vector3();
  function kill(i) {
    const ki = kindOf[i], k = KINDS[ki];
    state[i] = DEAD;
    grow[i] = 1;
    aliveN--;
    harvest.available = aliveN;
    const bounty = (k.bounty || 1) * (G.stats.priceMult || 1) + loot[i];
    tally.kills++; tally.bounty += bounty; tally.recovered += loot[i];
    loot[i] = 0;
    const c = cash();
    if (c) { coinFrom.set(xs[i], (k.height || 1.2) * 0.6 * scl[i], zs[i]); c.deposit(bounty, coinFrom); }
    else G.addMoney(bounty);
    if (G.fx) {
      _b.set(xs[i], (k.height || 1.2) * 0.5, zs[i]);
      if (G.fx.burst) G.fx.burst(_b, deaths[ki]);
      if (bounty >= 15 && G.fx.popText) { _b.y += 1.2; G.fx.popText(_b, '+$' + Math.round(bounty), popOpts); }
    }
    killEv.station = station; killEv.kind = k.id; killEv.x = xs[i]; killEv.z = zs[i]; killEv.bounty = bounty;
    G.events.emit('horde:kill', killEv);
  }
  const popOpts = { color: '#ffe066', size: 0.8, life: 0.8 };
  function hurt(i, dmg, fromX, fromZ, push) {
    if (state[i] === DEAD) return;
    hp[i] -= dmg;
    if (flash[i] <= 0) {
      flash[i] = 0.12;
      if (push > 0) {
        const dx = xs[i] - fromX, dz = zs[i] - fromZ;
        const d = Math.hypot(dx, dz) || 1;
        const heavy = 1 / Math.max(1, (KINDS[kindOf[i]].hp || 3) / 12);
        kx[i] += (dx / d) * push * heavy; kz[i] += (dz / d) * push * heavy;
      }
      if (G.fx && G.fx.burst) { _b.set(xs[i], (KINDS[kindOf[i]].height || 1.2) * 0.6, zs[i]); G.fx.burst(_b, bursts[kindOf[i]]); }
    }
    if (hp[i] <= 0) kill(i);
  }
  const live = (i) => state[i] === WALK || state[i] === BASH || state[i] === FLEE || (state[i] === ENTER && grow[i] > 0.6);

  const foes = {
    total: N,
    alive(i) { return state[i] !== DEAD; },
    pos(i, out) { return out.set(xs[i], (KINDS[kindOf[i]].height || 1.2) * 0.55 * scl[i], zs[i]); },
    /** z speed (negative while marching) */
    vz(i) { return state[i] === WALK ? -(KINDS[kindOf[i]].speed || 1.2) : state[i] === FLEE ? (KINDS[kindOf[i]].speed || 1.2) * 1.3 : 0; },
    height(i) { return (KINDS[kindOf[i]].height || 1.2) * scl[i]; },
    /** the living foe within range of (x, z) nearest the wall (skip: indices already chosen) */
    pick(x, z, range, minRange, skip, nSkip) {
      if (!station.active || aliveN === 0) return -1;
      let best = -1, bs = Infinity;
      const r2 = range * range, m2 = (minRange || 0) * (minRange || 0);
      for (let i = 0; i < N; i++) {
        if (!live(i)) continue;
        const dx = xs[i] - x, dz = zs[i] - z, d2 = dx * dx + dz * dz;
        if (d2 > r2 || d2 < m2) continue;
        let taken = false;
        for (let s = 0; s < nSkip; s++) if (skip[s] === i) { taken = true; break; }
        if (taken) continue;
        const score = zs[i] + d2 * 0.004 - (KINDS[kindOf[i]].hp || 3) * 0.002;
        if (score < bs) { bs = score; best = i; }
      }
      return best;
    },
    strike(i, dmg, burnFor) {
      if (state[i] === DEAD) return;
      if (burnFor > 0) { burn[i] = Math.max(burn[i], burnFor); burnDps[i] = Math.max(burnDps[i], dmg * 0.5); }
      hurt(i, dmg, xs[i], zs[i] - 1, 1.6);
    },
    /** damage every foe within r of (x, z); returns how many were hit */
    splash(x, z, r, dmg, burnFor) {
      let n = 0;
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD) continue;
        const kr = (KINDS[kindOf[i]].radius || 0.5) * scl[i];
        const dx = xs[i] - x, dz = zs[i] - z;
        if (dx * dx + dz * dz > (r + kr) * (r + kr)) continue;
        if (burnFor > 0) { burn[i] = Math.max(burn[i], burnFor); burnDps[i] = Math.max(burnDps[i], dmg * 0.25); }
        hurt(i, dmg, x, z, 5);
        n++;
      }
      return n;
    },
    /** the nearest living foe within r of (x, z) that hitMask[i] is not set for, or -1 */
    near(x, z, r, hitMask) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD || (hitMask && hitMask[i])) continue;
        const kr = (KINDS[kindOf[i]].radius || 0.5) * scl[i];
        const dx = xs[i] - x, dz = zs[i] - z, d2 = dx * dx + dz * dz;
        if (d2 > (r + kr) * (r + kr) || d2 >= bd) continue;
        bd = d2; best = i;
      }
      return best;
    },
  };

  // -------------------------------------------------- the player's blade
  const harvest = {
    kind: def.item || 'cash',
    bounds: { minX: A.minX, maxX: A.maxX, minZ: wallZ - 1, maxZ: A.maxZ },
    spacing: 1,
    total: N,
    available: 0,
    action: 'swing',
    fight: true,      // yields no items: the test bot fights here only when nothing worth gathering is left
    // the blade is swung in update(); this only tells the player to play the swing
    harvestAt(x, z, radius, max, onItem, data) {
      if (data && harvest.hasNear(x, z, radius)) data.hit = true;
      return 0;
    },
    hasNear(x, z, radius) {
      if (!station.active || aliveN === 0) return false;
      for (let i = 0; i < N; i++) {
        if (!live(i)) continue;
        const r = radius + (KINDS[kindOf[i]].radius || 0.5) * scl[i];
        const dx = xs[i] - x, dz = zs[i] - z;
        if (dx * dx + dz * dz <= r * r) return true;
      }
      return false;
    },
    nearest(x, z, out) {
      if (!station.active || aliveN === 0) return false;
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (!live(i)) continue;
        const dx = xs[i] - x, dz = zs[i] - z, d = dx * dx + dz * dz + (zs[i] - wallZ) * 2;   // the ones at the wall first
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return false;
      out.x = xs[best]; out.z = zs[best];
      return true;
    },
  };
  const alert = {
    active: false, x: 0, z: wallZ, r: 3, text: (def.alert && def.alert.text) || 'Raiders at the wall!',
    nearest(x, z, out) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (state[i] !== BASH) continue;
        const dx = xs[i] - x, dz = zs[i] - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return false;
      out.x = xs[best]; out.z = zs[best] + 0.4;
      return true;
    },
  };

  // ------------------------------------------------------------- drawing
  const BAR_W = 0.95, BAR_H = 0.13;
  function draw(dt) {
    const cq = G.camera.quaternion;
    _right.set(1, 0, 0).applyQuaternion(cq);
    let anyBar = false;
    for (let i = 0; i < N; i++) {
      const ki = kindOf[i], k = KINDS[ki], m = meshes[ki], li = local[i];
      if (state[i] === DEAD) {
        if (grow[i] > 0) {
          grow[i] = Math.max(0, grow[i] - dt * 6);
          if (grow[i] <= 0) m.setMatrixAt(li, ZERO);
          else {
            // topple backward and sink
            const g = grow[i];
            _p.set(xs[i], -(1 - g) * 0.3, zs[i]);
            _s.set(scl[i] * (0.6 + g * 0.4), scl[i] * g, scl[i] * (0.6 + g * 0.4));
            m.setMatrixAt(li, _m.compose(_p, _q.setFromEuler(_e.set(-(1 - g) * 1.3, yaw[i], 0)), _s));
          }
        }
        bars.setMatrixAt(i * 2, ZERO); bars.setMatrixAt(i * 2 + 1, ZERO);
        continue;
      }
      const moving = state[i] === WALK || state[i] === FLEE;
      const t = G.time * (state[i] === FLEE ? 12 : moving ? 9 : 5) + phase[i];
      const hop = moving ? Math.abs(Math.sin(t)) * 0.08 : 0;
      const hit = flash[i] > 0 ? flash[i] / 0.12 : 0;
      const g = state[i] === ENTER ? Math.min(1, grow[i]) : 1;
      const sc = scl[i] * (0.3 + 0.7 * g);
      // a blow at the wall: lean in and spring back
      const lean = state[i] === BASH ? Math.sin(Math.min(1, blow[i]) * Math.PI) * 0.45 : 0;
      _p.set(xs[i], hop * sc, zs[i]);
      _q.setFromEuler(_e.set(lean - hit * 0.25, yaw[i], moving ? Math.sin(t) * 0.07 : 0));
      _s.set(sc * (1 + hit * 0.12), sc * (1 - hit * 0.14), sc * (1 + hit * 0.12));
      m.setMatrixAt(li, _m.compose(_p, _q, _s));
      if (state[i] === FLEE && loot[i] > 0 && burn[i] <= 0) {
        const f = 1 + hit * 0.9 + Math.sin(G.time * 12 + phase[i]) * 0.12;
        m.setColorAt(li, _c.setRGB(1.35 * f, 1.15 * f, 0.45 * f));
      } else if (burn[i] > 0) {
        const f = 0.75 + Math.sin(G.time * 30 + phase[i]) * 0.25;
        m.setColorAt(li, _c.setRGB(1.6 + hit, 0.75 * f + hit, 0.35 + hit));
      } else {
        const f = 1 + hit * 0.9;
        m.setColorAt(li, _c.setRGB(f, f, f));
      }
      const frac = Math.max(0, hp[i] / maxHp[i]);
      if (frac < 0.999) {
        anyBar = true;
        const y = ((k.height || 1.2) + 0.35) * sc;
        const bw = BAR_W * Math.min(2, 0.8 + (k.radius || 0.5) * 0.6);
        _p.set(xs[i], y, zs[i]); _s.set(bw + 0.06, BAR_H + 0.06, 1);
        bars.setMatrixAt(i * 2, _m.compose(_p, cq, _s));
        const w = bw * frac;
        _p.set(xs[i] - _right.x * (bw - w) * 0.5, y - _right.y * (bw - w) * 0.5, zs[i] - _right.z * (bw - w) * 0.5);
        _s.set(w, BAR_H, 1);
        bars.setMatrixAt(i * 2 + 1, _m.compose(_p, cq, _s));
      } else {
        bars.setMatrixAt(i * 2, ZERO); bars.setMatrixAt(i * 2 + 1, ZERO);
      }
    }
    // draw only up to the highest slot in use (slots are taken lowest first)
    for (let k = 0; k < NK; k++) {
      let top = 0;
      for (let i = base[k + 1] - 1; i >= base[k]; i--) if (state[i] !== DEAD || grow[i] > 0) { top = i - base[k] + 1; break; }
      meshes[k].count = top;
      meshes[k].instanceMatrix.needsUpdate = true; meshes[k].instanceColor.needsUpdate = true;
    }
    bars.instanceMatrix.needsUpdate = true;
    if (anyBar) bars.instanceColor.needsUpdate = true;
  }

  // -------------------------------------------------------------- update
  const thiefTo = new THREE.Vector3(), thiefFrom = new THREE.Vector3();
  const stealOpts = { kind: 'cash', from: thiefFrom, to: thiefTo, dur: 0.5, arc: 2.2 };
  const minusOpts = { color: '#ff6a5a', size: 0.75, life: 0.7 };
  const sound = { pos: { x: 0, z: 0 }, volume: 0.6 };
  let fireT = 0;
  const station = {
    pos: { x: (A.minX + A.maxX) / 2, z: (wallZ + spawnZ) / 2 },
    name: def.name,
    active: false,
    harvest,
    alert,
    foes,
    home: def.home || null,
    meshes: { foes: meshes, bars },
    /** running totals: spawned, kills, bounty (incl. recovered loot), stolen, escaped, recovered */
    tally,
    get alive() { return aliveN; },
    get bashing() { return bashN; },
    get waves() { return W.waves; },
    /** seconds until the next wave starts */
    get nextWave() { return W.t; },
    activate() {
      for (const m of meshes) m.visible = true;
      bars.visible = true;
      draw(0);
    },
    update(dt) {
      if (!station.active) return;
      // ---- waves
      const level = Math.max(0, Math.min(def.waves.length - 1, G.stats[levelStat] | 0));
      W.level = level;
      const wv = def.waves[level];
      if (wv) {
        W.t -= dt;
        if (W.t <= 0) { W.t = wv.every || 10; queueWave(level); }
      }
      if (W.qHead !== W.qTail) {
        W.qT -= dt;
        if (W.qT <= 0) { W.qT = 0.22; spawn(Q[W.qHead]); W.qHead = (W.qHead + 1) & 255; }
      }
      // ---- the player's blade
      const pl = G.player;
      const R = G.stats.harvestRadius || 1.4;
      const pdmg = (G.stats[meleeStat] || 1) * dt / swingTime;
      const px = pl ? pl.pos.x : 1e9, pz = pl ? pl.pos.z : 1e9;
      const near = px > A.minX - R - 2 && px < A.maxX + R + 2 && pz > wallZ - R - 2 && pz < A.maxZ + R;
      // ---- move
      const c = cash();
      bashN = 0;
      let bx = 0, bz = 0;
      fireT -= dt;
      const fireTick = fireT <= 0;
      if (fireTick) fireT = 0.12;
      for (let i = 0; i < N; i++) {
        const st = state[i];
        if (st === DEAD) continue;
        const k = KINDS[kindOf[i]];
        const r = (k.radius || 0.5) * scl[i];
        if (st === ENTER) {
          grow[i] += dt * 2.2;
          if (grow[i] >= 1) { grow[i] = 1; state[i] = WALK; }
        }
        if (flash[i] > 0) flash[i] -= dt;
        if (burn[i] > 0) {
          burn[i] -= dt;
          hp[i] -= burnDps[i] * dt;
          if (fireTick && G.fx && G.fx.burst) { _b.set(xs[i] + (rand() - 0.5) * 0.4, (k.height || 1.2) * 0.7 * scl[i], zs[i]); G.fx.burst(_b, fireBurst); }
          if (hp[i] <= 0) { kill(i); continue; }
        }
        if (state[i] === WALK || state[i] === ENTER) {
          const sp = (k.speed || 1.2) * (state[i] === ENTER ? 0.5 : 1);
          zs[i] -= sp * dt;
          xs[i] += (lane[i] - xs[i]) * Math.min(1, dt * 0.6);
          yaw[i] = Math.PI + (lane[i] - xs[i]) * 0.08;
          if (zs[i] <= wallZ + r) { zs[i] = wallZ + r; if (state[i] === WALK) { state[i] = BASH; bashT[i] = (k.bash || 1.4) * 0.6; } }
        } else if (st === FLEE) {
          zs[i] += (k.speed || 1.2) * 1.3 * dt;
          yaw[i] = 0;
          if (zs[i] >= spawnZ + 2) {
            // escaped with the loot
            state[i] = DEAD; grow[i] = 1; loot[i] = 0;
            tally.escaped++;
            aliveN--; harvest.available = aliveN;
            continue;
          }
        } else if (st === BASH) {
          yaw[i] = Math.PI;
          if (zs[i] > wallZ + r + 0.4) state[i] = WALK;    // knocked back: march in again
          bashT[i] -= dt;
          if (blow[i] > 0) blow[i] = Math.max(0, blow[i] - dt * 2.2);
          if (bashT[i] <= 0) {
            bashT[i] = k.bash || 1.4;
            blow[i] = 1;
            if (G.fx && G.fx.burst) { _b.set(xs[i], 0.9, wallZ - 0.1); G.fx.burst(_b, dustBurst); }
            if (G.audio && G.audio.play) { sound.pos.x = xs[i]; sound.pos.z = wallZ; G.audio.play('thud', sound); }
            blows[i]++;
            if (blows[i] >= (k.blows || 3)) {
              // a thief: grab from the war chest and run
              const take = (k.steal || 1) * (G.stats.priceMult || 1);
              if (c && c.cash.amount >= 1 && take > 0) {
                const got = c.cash.take(take);
                loot[i] = got;
                tally.stolen += got;
                if (got > 0 && G.fx) {
                  c.cash.top(thiefFrom);
                  thiefTo.set(xs[i], 1.2, zs[i]);
                  if (G.fx.fly) G.fx.fly(stealOpts);
                  if (G.fx.popText) { thiefFrom.y += 1; G.fx.popText(thiefFrom, '-$' + Math.max(1, Math.round(got)), minusOpts); }
                }
              }
              state[i] = FLEE;
              blow[i] = 0;
              continue;
            }
          }
          bashN++; bx += xs[i]; bz += zs[i];
        }
        // knock-back
        if (kx[i] !== 0 || kz[i] !== 0) {
          xs[i] += kx[i] * dt; zs[i] += kz[i] * dt;
          const kk = Math.exp(-8 * dt);
          kx[i] *= kk; kz[i] *= kk;
          if (kx[i] * kx[i] + kz[i] * kz[i] < 0.01) { kx[i] = 0; kz[i] = 0; }
        }
        // the hero's blade
        if (near && live(i)) {
          const rr = R + r, dx = xs[i] - px, dz = zs[i] - pz;
          if (dx * dx + dz * dz <= rr * rr) hurt(i, pdmg, px, pz, 2.4);
        }
      }
      // keep them apart, inside the field and out of the wall
      for (let i = 0; i < N; i++) {
        if (state[i] === DEAD) continue;
        const ri = (KINDS[kindOf[i]].radius || 0.5) * scl[i];
        for (let j = i + 1; j < N; j++) {
          if (state[j] === DEAD) continue;
          const dx = xs[j] - xs[i], dz = zs[j] - zs[i];
          const min = (ri + (KINDS[kindOf[j]].radius || 0.5) * scl[j]) * 0.85;
          const d2 = dx * dx + dz * dz;
          if (d2 >= min * min || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const ux = dx / d, uz = dz / d;
          xs[i] -= ux * push; zs[i] -= uz * push; xs[j] += ux * push; zs[j] += uz * push;
        }
        if (xs[i] < A.minX) xs[i] = A.minX; else if (xs[i] > A.maxX) xs[i] = A.maxX;
        if (zs[i] < wallZ + ri) zs[i] = wallZ + ri; else if (zs[i] > spawnZ + 4.5) zs[i] = spawnZ + 4.5;
      }
      alert.active = bashN >= alertCount;
      if (bashN > 0) { alert.x = bx / bashN; alert.z = bz / bashN + 0.6; alert.r = 2.5; }
      draw(dt);
    },
  };
  return station;
}

registerStationType('horde', { create: createHorde, describe: 'waves of foes that march on a wall, bash it, steal and pay a bounty; harvest area + alert' });
