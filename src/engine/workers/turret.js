// Worker role 'turret': a tower that shoots the creatures of a `herd` station. What they drop
// flies to another station (a pile's `receive`, or any drop zone), so a hauler can carry it on.
// Not built in: list '../../engine/workers/turret.js' in the world's `modules`.
//
//   { type: 'hire', role: 'turret', from: 'herdId', to: 'pileId', spot: { x, z }, options: { ... } }
//
// Options (world.workers.turret < effect.options):
//   every: 0.9          seconds between shots
//   range: 13           how far it reaches from its spot
//   damage: 2           damage per shot (x G.stats[damageStat] when damageStat is set)
//   damageStat: null
//   model: () => Object3D    the tower; userData.head (Object3D that turns to the target) and
//                            userData.muzzle ({ x, y, z } in the head's frame) are optional
//   bolt: 0xfff2c0      colour of the shot
import * as THREE from 'three';
import { registerWorkerRole } from '../registry.js';
import { roleConfig, pt, turnToward } from './common.js';

const DEFAULTS = { every: 0.9, range: 13, damage: 2, damageStat: null, bolt: 0xfff2c0, height: 3.2 };

function placeholderTower(h) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, h, 8), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
  post.position.y = h / 2;
  const head = new THREE.Group();
  head.position.y = h + 0.2;
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 1.4), new THREE.MeshLambertMaterial({ color: 0x4a3a2a }));
  head.add(bow);
  g.add(post, head);
  g.userData.head = head;
  return g;
}

function createTurret(G, hire, team, live) {
  const cfg = { ...DEFAULTS, ...roleConfig(G, 'turret', hire) };
  const A = G.stations.get(hire.from);
  const B = G.stations.get(hire.to);
  if (!A || !A.creatures) { console.error(`[turret] '${hire.from}' is not a herd station`); return null; }
  const recv = B ? B.receive || B.drop : null;
  if (!recv) { console.error(`[turret] '${hire.to}' cannot receive items`); return null; }
  const e = hire.effect || {};
  const spot = pt(e.spot || A.pos);

  const group = typeof cfg.model === 'function' ? cfg.model() : placeholderTower(cfg.height);
  group.position.set(spot.x, 0, spot.z);
  G.scene.add(group);
  if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
  const head = group.userData.head || null;
  const headBase = head ? head.position.clone() : null;
  const mz = group.userData.muzzle || { x: 0, y: 0, z: 0.7 };

  // the shot: one thin box stretched from the muzzle toward the target
  const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1), new THREE.MeshBasicMaterial({ color: cfg.bolt }));
  bolt.visible = false;
  bolt.frustumCulled = false;
  G.scene.add(bolt);

  const from = new THREE.Vector3(), to = new THREE.Vector3(), tmp = new THREE.Vector3();
  const lootFrom = new THREE.Vector3();
  const recvTarget = (out) => recv.target(out);
  const land = (data, kind) => { recv.give(kind); };
  const flyOpts = { kind: '', from: lootFrom, to: recvTarget, dur: 0.5, arc: 2.6, delay: 0, onDone: land, data: null };
  let lootN = 0;
  const onItem = (kind, x, z) => {
    recv.expect(kind);
    w.loot++;
    if (G.fx && G.fx.fly) {
      lootFrom.set(x, 0.5, z);
      flyOpts.kind = kind; flyOpts.delay = lootN * 0.05; flyOpts.dur = 0.45 + Math.random() * 0.15;
      lootN++;
      G.fx.fly(flyOpts);
    } else recv.give(kind);
  };

  const T = { cool: 0.4 + team.length * 0.23, flight: 0, target: -1, yaw: 0, kick: 0 };
  const w = {
    group, shots: 0, loot: 0,
    update(dt) {
      if (T.kick > 0) T.kick = Math.max(0, T.kick - dt * 6);
      if (head) { head.rotation.y = T.yaw; head.position.copy(headBase); head.translateZ(-T.kick * 0.18); }
      // a shot in the air
      if (T.flight > 0) {
        T.flight -= dt;
        if (T.target >= 0 && A.creatures.alive(T.target)) A.creatures.pos(T.target, to);
        const u = 1 - Math.max(0, T.flight) / 0.12;
        tmp.lerpVectors(from, to, u);
        bolt.position.copy(tmp);
        bolt.lookAt(to);
        if (T.flight <= 0) {
          bolt.visible = false;
          if (T.target >= 0) {
            lootN = 0;
            const room = recv.room();
            const dmg = cfg.damage * (cfg.damageStat ? (G.stats[cfg.damageStat] || 1) : 1);
            A.creatures.strike(T.target, dmg, room, onItem, null);
          }
          T.target = -1;
        }
        return;
      }
      T.cool -= dt;
      if (T.cool > 0 || !A.active || !B.active) return;
      if (recv.room() <= 0) { T.cool = 0.5; return; }       // nowhere to put the loot: hold fire
      const i = A.creatures.nearest(spot.x, spot.z, cfg.range);
      if (i < 0) { T.cool = 0.25; return; }
      A.creatures.pos(i, to);
      T.yaw = turnToward(T.yaw, Math.atan2(to.x - spot.x, to.z - spot.z), Math.PI);
      if (head) { head.rotation.y = T.yaw; head.position.copy(headBase); head.updateWorldMatrix(true, false); from.set(mz.x, mz.y, mz.z).applyMatrix4(head.matrixWorld); }
      else from.set(spot.x, cfg.height, spot.z);
      T.target = i; T.flight = 0.12; T.cool = cfg.every; T.kick = 1;
      bolt.scale.z = 1.1;
      bolt.position.copy(from);
      bolt.visible = true;
      w.shots++;
    },
  };
  return w;
}

registerWorkerRole('turret', {
  create: createTurret,
  toast: 'TOWER BUILT!',
  focus: (G, e) => (e.spot ? pt(e.spot) : null),
});
