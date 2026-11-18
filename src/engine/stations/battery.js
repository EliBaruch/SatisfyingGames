// Station type 'battery': a war engine (archer tower, crossbow tower, ballista, catapult, trebuchet)
// that shoots the foes of a 'horde' station, but only while it has ammunition. Ammunition is an
// item carried to its drop zone (by the player, haulers or a belt); each item is worth `shotsPer`
// shots. The kills pay their bounty through the horde. Not built in: list
// '../../engine/stations/battery.js' (and horde.js) in the world's `modules`.
//
// def = {
//   id, type: 'battery', name, open, x, z,
//   model: () => Object3D,          // userData: head (turns to the target), muzzle {x,y,z} (in the head's frame),
//                                   //   arm (Object3D swung about X when firing), crew [Object3D] (shown by volley),
//                                   //   recoil (how far the head kicks back, default 0.18)
//   yaw: 0,                         // the model's resting yaw (+Z faces the field)
//   foes: 'raid',                   // the horde station
//   ammo: 'arrows', ammoCap: 8, shotsPer: 6, start: 0,
//   every: 1, rateStat: null,       // seconds per shot (divided by G.stats[rateStat])
//   range: 14, minRange: 0,
//   damage: 1, damageStat: null,    // x G.stats[damageStat]
//   volley: 1, volleyStat: null,    // shots per salvo (at different foes), + G.stats[volleyStat]
//   shot: {
//     geometry: () => BufferGeometry,   // long axis +Z, centred
//     speed: 28, arc: 0.1,              // world units per second; apex height as a fraction of the distance
//     splash: 0,                        // > 0: damages everything within this radius where it lands
//     pierce: false,                    // true: flies on through the field, hitting every foe it passes
//     spin: 0,                          // tumbling (stones)
//     fireStat: null,                   // G.stats key: > 0 sets them alight (burning damage, flame trail)
//     shake: 0, sound: 'bow', impact: null,   // camera shake on landing; launch / landing sounds
//     dust: false,                      // a dust cloud and ring where it lands
//     scale: 1,
//   },
//   pool: 12,                       // projectiles in the air at once
//   dropZone: { x, z, r }, workerSpot, store: { layout: { x, z, cols, rows, yaw } },
//   footprint: { w, d },            // blocker size (default 2.2 x 2.2); blockers: false / [...]
//   label: 'ARROWS', markers: true, urgent: 0.7, hint,
// }
//
// Capabilities: drop (accepts the ammo item; `need` rises as it empties, so the hints send the
// player with ammunition when a tower runs low). Readable: ammo (items), shots (in hand), firing,
// kills. Event 'battery:fire' { station, stationId, x, z } (payload reused). Saved: { n, s }.
import * as THREE from 'three';
import { registerStationType } from '../registry.js';
import { getSharedMaterial } from '../geom.js';
import { createStore, zoneOf, zoneMarker, showAll, isNum } from './kit.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _look = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const Z = new THREE.Vector3(0, 0, 1);

function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

function createBattery(G, def) {
  const X = def.x, Zc = def.z;
  const shot = { speed: 28, arc: 0.1, splash: 0, pierce: false, spin: 0, fireStat: null, shake: 0, sound: 'bow', impact: null, dust: false, scale: 1, ...(def.shot || {}) };
  const cap = Math.max(1, def.ammoCap | 0 || 8);
  const shotsPer = Math.max(1, def.shotsPer | 0 || 6);
  const zone = zoneOf(def.dropZone, X, Zc - 2.6, 1.3);

  // ---- the ammunition rack at the foot of the engine
  const store = createStore(G, {
    kinds: [def.ammo], capacity: cap,
    layout: { x: zone.x, z: zone.z, cols: 2, rows: 2, ...((def.store && def.store.layout) || {}) },
  });
  const markers = def.markers === false ? [] : [zoneMarker(G, zone, def.label || 'AMMO')];

  // ---- the engine itself
  const group = typeof def.model === 'function' ? def.model() : new THREE.Group();
  group.name = 'engine:' + def.id;
  group.position.set(X, 0, Zc);
  group.rotation.y = def.yaw || 0;
  group.visible = false;
  G.scene.add(group);
  const ud = group.userData || {};
  const head = ud.head || null;
  const headBase = head ? head.position.clone() : null;
  const headYaw0 = head ? head.rotation.y : 0;
  const arm = ud.arm || null;
  const armRest = arm ? arm.rotation.x : 0;
  const crew = ud.crew || [];
  const mz = ud.muzzle || { x: 0, y: 2, z: 0.6 };
  const recoil = ud.recoil ?? 0.18;

  // ---- projectiles: one instanced mesh
  const POOL = Math.max(2, def.pool | 0 || 12);
  const geo = typeof shot.geometry === 'function' ? shot.geometry() : new THREE.BoxGeometry(0.06, 0.06, 0.9);
  const pm = new THREE.InstancedMesh(geo, getSharedMaterial(), POOL);
  pm.name = 'shots:' + def.id;
  pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pm.frustumCulled = false;
  pm.castShadow = true;
  for (let i = 0; i < POOL; i++) { pm.setMatrixAt(i, ZERO); pm.setColorAt(i, new THREE.Color(1, 1, 1)); }
  pm.instanceColor.setUsage(THREE.DynamicDrawUsage);
  pm.visible = false;
  G.scene.add(pm);
  const fx = new Float32Array(POOL), fy = new Float32Array(POOL), fz = new Float32Array(POOL);
  const tx = new Float32Array(POOL), ty = new Float32Array(POOL), tz = new Float32Array(POOL);
  const pt = new Float32Array(POOL), pdur = new Float32Array(POOL), parc = new Float32Array(POOL);
  const ptarget = new Int32Array(POOL).fill(-1), pfire = new Uint8Array(POOL), pdmg = new Float32Array(POOL);
  const used = new Uint8Array(POOL);
  let hitMask = null;   // pierce: which foes each projectile already struck (made once the horde is known)

  const T = { cool: 1, shots: 0, kick: 0, swing: 0, yaw: 0, fireAcc: 0, firing: 0 };
  const skip = new Int32Array(8);
  const fireEv = { station: null, stationId: def.id, x: X, z: Zc };
  const sound = { pos: { x: X, z: Zc }, volume: 0.55 };
  const trail = { colors: [0xffc233, 0xff7a2a, 0xfff1a8], count: 1, speed: 0.4, size: 0.12, life: 0.3, up: 0.8 };
  const sparks = { colors: [0xffffff, 0xe8e0d0], count: 4, speed: 2.5, size: 0.1, life: 0.3, up: 2 };
  const fireSparks = { colors: [0xffc233, 0xff7a2a, 0xfff1a8], count: 7, speed: 3, size: 0.15, life: 0.45, up: 2.6 };
  const dust = { colors: [0xcdb89a, 0xa89272, 0xe8dcc4, 0x8e7b62], count: 18, speed: 5, size: 0.3, life: 0.8, up: 3.5 };
  const fireDust = { colors: [0xffc233, 0xff7a2a, 0xfff1a8, 0x6b4a2a], count: 22, speed: 5.5, size: 0.3, life: 0.8, up: 4 };
  const ringOpts = { color: 0xfff1d0, radius: 2, life: 0.45 };
  let trailT = 0;

  const foesStation = () => { const s = G.stations.get(def.foes); return s && s.active && s.foes ? s : null; };
  const stat = (k, d) => (k ? (isNum(G.stats[k]) ? G.stats[k] : d) : d);

  function launch(F, i, fire) {
    let k = -1;
    for (let p = 0; p < POOL; p++) if (!used[p]) { k = p; break; }
    if (k < 0) return false;
    // from the muzzle
    if (head) { head.updateWorldMatrix(true, false); _v.set(mz.x, mz.y, mz.z).applyMatrix4(head.matrixWorld); }
    else if (arm) { arm.updateWorldMatrix(true, false); _v.set(mz.x, mz.y, mz.z).applyMatrix4(arm.matrixWorld); }
    else _v.set(X, mz.y, Zc);
    F.foes.pos(i, _w);
    const d0 = Math.hypot(_w.x - _v.x, _w.z - _v.z);
    let dur = Math.max(0.12, d0 / shot.speed);
    // lead the target: it keeps marching while the shot is in the air
    _w.z += F.foes.vz(i) * dur;
    if (shot.pierce) {
      // fly on past it to the far edge of the range, low over the ground
      const dx = _w.x - _v.x, dz = _w.z - _v.z, d = Math.hypot(dx, dz) || 1;
      const reach = Math.max(d + 4, (def.range || 14) + 4);
      _w.set(_v.x + dx / d * reach, 0.6, _v.z + dz / d * reach);
      dur = reach / shot.speed;
    } else if (shot.splash > 0) _w.y = 0.1;
    fx[k] = _v.x; fy[k] = _v.y; fz[k] = _v.z;
    tx[k] = _w.x; ty[k] = _w.y; tz[k] = _w.z;
    pt[k] = 0; pdur[k] = dur; parc[k] = shot.arc * Math.hypot(_w.x - _v.x, _w.z - _v.z);
    ptarget[k] = i; pfire[k] = fire ? 1 : 0;
    pdmg[k] = (def.damage || 1) * stat(def.damageStat, 1);
    used[k] = 1;
    if (hitMask) hitMask[k].fill(0);
    pm.setColorAt(k, fire ? _c3.setRGB(1.7, 0.9, 0.45) : _c3.setRGB(1, 1, 1));
    pm.instanceColor.needsUpdate = true;
    return true;
  }
  const _c3 = new THREE.Color();

  function land(F, k) {
    used[k] = 0;
    pm.setMatrixAt(k, ZERO);
    const fire = pfire[k] === 1;
    const burnFor = fire ? 2.5 : 0;
    const dmg = pdmg[k] * (fire ? 1.5 : 1);
    _v.set(tx[k], Math.max(0.2, ty[k]), tz[k]);
    if (shot.splash > 0) {
      F.foes.splash(tx[k], tz[k], shot.splash, dmg, burnFor);
      if (G.fx) {
        _v.y = 0.3;
        if (G.fx.burst) G.fx.burst(_v, fire ? fireDust : dust);
        if (shot.dust && G.fx.ring) { ringOpts.radius = shot.splash * 1.2; G.fx.ring(_v, ringOpts); }
        if (shot.shake && G.fx.shake && G.player) {
          const d = Math.hypot(G.player.pos.x - tx[k], G.player.pos.z - tz[k]);
          if (d < 26) G.fx.shake(shot.shake * (1 - d / 30), 0.25);
        }
      }
      if (shot.impact && G.audio && G.audio.play) { sound.pos.x = tx[k]; sound.pos.z = tz[k]; G.audio.play(shot.impact, sound); }
      return;
    }
    if (shot.pierce) return;   // its hits happened in flight
    let i = ptarget[k];
    if (i < 0 || !F.foes.alive(i)) i = F.foes.near(tx[k], tz[k], 1.0, null);
    if (i >= 0) {
      F.foes.strike(i, dmg, burnFor);
      if (G.fx && G.fx.burst) G.fx.burst(_v, fire ? fireSparks : sparks);
    }
  }

  function drawShots(F, dt) {
    let any = false;
    for (let k = 0; k < POOL; k++) {
      if (!used[k]) continue;
      any = true;
      pt[k] += dt;
      const u = Math.min(1, pt[k] / pdur[k]);
      // the target moves: home in a little (not for lobbed or piercing shots)
      if (!shot.pierce && shot.splash <= 0 && ptarget[k] >= 0 && F.foes.alive(ptarget[k])) {
        F.foes.pos(ptarget[k], _w);
        const kk = Math.min(1, dt * 6);
        tx[k] += (_w.x - tx[k]) * kk; ty[k] += (_w.y - ty[k]) * kk; tz[k] += (_w.z - tz[k]) * kk;
      }
      const y0 = fy[k] + (ty[k] - fy[k]) * u + parc[k] * 4 * u * (1 - u);
      const x0 = fx[k] + (tx[k] - fx[k]) * u, z0 = fz[k] + (tz[k] - fz[k]) * u;
      // heading: the derivative of the path
      const vx = tx[k] - fx[k], vz = tz[k] - fz[k];
      const vy = (ty[k] - fy[k]) + parc[k] * 4 * (1 - 2 * u);
      _v.set(x0, y0, z0);
      _w.set(vx, vy, vz).normalize();
      if (shot.spin) _q.setFromAxisAngle(_s.set(-_w.z, 0, _w.x).normalize(), pt[k] * shot.spin);
      else _q.setFromUnitVectors(Z, _w);
      _s.set(shot.scale, shot.scale, shot.scale);
      pm.setMatrixAt(k, _m.compose(_v, _q, _s));
      if (pfire[k] && trailT <= 0 && G.fx && G.fx.burst) G.fx.burst(_v, trail);
      if (shot.pierce && hitMask) {
        // skewer what it passes
        let i = F.foes.near(x0, z0, 0.55, hitMask[k]);
        while (i >= 0) {
          hitMask[k][i] = 1;
          F.foes.strike(i, pdmg[k] * (pfire[k] ? 1.5 : 1), pfire[k] ? 2.5 : 0);
          if (G.fx && G.fx.burst) { _w.set(x0, 0.9, z0); G.fx.burst(_w, pfire[k] ? fireSparks : sparks); }
          i = F.foes.near(x0, z0, 0.55, hitMask[k]);
        }
      }
      if (u >= 1) land(F, k);
    }
    if (any) pm.instanceMatrix.needsUpdate = true;
    pm.visible = any;     // no draw call while nothing is in the air
  }

  const drop = {
    zone,
    accepts: (kind) => kind === def.ammo,
    room() { return store.room(); },
    roomFor(kind) { return kind === def.ammo ? store.room() : 0; },
    target(out) { return store.nextWorld(out).setY(out.y + 0.05); },
    expect(kind) { store.expect(kind); },
    give(kind) { store.give(kind); },
    workerSpot: def.workerSpot || { x: zone.x, z: zone.z },
    get need() { return 1 - (store.count + store.pending + (T.shots > 0 ? 0.5 : 0)) / cap; },
    urgent: def.urgent ?? 0.7,
    sound: 'drop',
  };

  const fp = def.footprint || { w: 2.2, d: 2.2 };
  const station = {
    pos: { x: X, z: Zc },
    name: def.name || def.id,
    active: false,
    drop,
    group,
    store,
    blockers: def.blockers === false ? [] : (def.blockers || [{ x: X, z: Zc, hx: fp.w / 2, hz: fp.d / 2 }]),
    meshes: { group, markers, shots: pm },
    get ammo() { return store.count; },
    get shots() { return T.shots + store.count * shotsPer; },
    get firing() { return T.firing > 0; },
    kills: 0,
    activate(live) {
      group.visible = true; pm.visible = true;
      store.setVisible(true);
      showAll(G, markers, live);
      if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
      if (live && isNum(def.start) && store.count === 0) for (let i = 0; i < def.start; i++) store.add(def.ammo);
    },
    update(dt) {
      if (!station.active) return;
      store.update(dt);
      const F = foesStation();
      if (F && !hitMask && shot.pierce) { hitMask = []; for (let k = 0; k < POOL; k++) hitMask.push(new Uint8Array(F.foes.total)); }
      trailT -= dt;
      if (F) drawShots(F, dt);
      if (trailT <= 0) trailT = 0.05;
      if (T.firing > 0) T.firing -= dt;
      // recoil and the throwing arm
      if (T.kick > 0) T.kick = Math.max(0, T.kick - dt * 5);
      if (head) { head.rotation.y = T.yaw; head.position.copy(headBase); head.translateZ(-T.kick * recoil); }
      if (arm) {
        if (T.swing > 0) {
          T.swing = Math.max(0, T.swing - dt);
          const every = (def.every || 1) / stat(def.rateStat, 1);
          // fast throw, then a slow wind back
          const p = 1 - T.swing / Math.max(0.3, every * 0.9);
          const s = p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82;
          arm.rotation.x = armRest - s * (ud.throwAngle || 1.9);
        } else arm.rotation.x = armRest;
      }
      for (let c = 0; c < crew.length; c++) crew[c].visible = c < (def.volley || 1) + (def.volleyStat ? (G.stats[def.volleyStat] | 0) : 0);
      // ---- shooting
      T.cool -= dt;
      if (T.cool > 0 || !F) return;
      if (T.shots <= 0) {
        if (store.count <= 0) { T.cool = 0.3; return; }
        store.remove(null);
        T.shots = shotsPer;
      }
      const first = F.foes.pick(X, Zc, def.range || 14, def.minRange || 0, skip, 0);
      if (first < 0) { T.cool = 0.2; return; }
      const volley = Math.min(8, Math.max(1, (def.volley || 1) + (def.volleyStat ? (G.stats[def.volleyStat] | 0) : 0)));
      const fire = shot.fireStat ? (G.stats[shot.fireStat] || 0) > 0 : false;
      // turn to the first target
      F.foes.pos(first, _w);
      const want = Math.atan2(_w.x - X, _w.z - Zc) - (def.yaw || 0);
      T.yaw = headYaw0 + wrap(want - headYaw0);
      if (head) { head.rotation.y = T.yaw; head.position.copy(headBase); }
      let n = 0, i = first;
      while (i >= 0 && n < volley) {
        if (!launch(F, i, fire)) break;
        skip[n++] = i;
        if (n >= volley) break;
        i = F.foes.pick(X, Zc, def.range || 14, def.minRange || 0, skip, n);
      }
      // a salvo at one target when there are fewer foes than bows
      while (n > 0 && n < volley && launch(F, first, fire)) n++;
      T.shots -= 1;
      T.cool = (def.every || 1) / stat(def.rateStat, 1);
      T.kick = 1; T.swing = T.cool * 0.9; T.firing = 1.5;
      if (G.audio && G.audio.play && shot.sound) G.audio.play(shot.sound, sound);
      fireEv.station = station;
      G.events.emit('battery:fire', fireEv);
    },
    serialize() { const n = store.serialize()[def.ammo] || 0; return { n, s: T.shots }; },
    restore(d) {
      if (!d) return;
      if (isNum(d.n)) store.restore({ [def.ammo]: Math.max(0, Math.min(cap, d.n | 0)) });
      if (isNum(d.s)) T.shots = Math.max(0, Math.min(shotsPer, d.s | 0));
    },
  };
  return station;
}

registerStationType('battery', { create: createBattery, describe: 'a war engine that shoots a horde while it has ammunition; drop zone for the ammo' });
