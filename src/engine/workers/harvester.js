// Worker role 'harvester': a vehicle that drives lanes over station A's harvest area,
// harvesting with a front bar, and unloads into station B's drop zone when full or at
// the end of a pass. Today's tractor.
//
// hire effect: { type: 'hire', role: 'harvester', from: 'roses', to: 'shop-roses',
//                park?: {x,z}, spot?: {x,z}, color?: 0xe53935, options?: {...} }
// The vehicle model comes from world.workers.harvester.model (a function(color) ->
// Object3D following the makeTractor contract in chars.js), else chars.makeTractor.
import { registerWorkerRole } from '../registry.js';
import { makeTractor, addBlob, onScreen } from '../chars.js';
import { createStack } from '../stack.js';
import { flyToStack, flyToDrop } from '../transfer.js';
import { wrapAngle, roleConfig, playAt, soundOpts, pt } from './common.js';

const TURN = 2.5;        // steering, rad/s
const REACH = 1.6;       // harvest bar distance in front of the vehicle

function createHarvester(G, hire, team, live) {
  const cfg = roleConfig(G, 'harvester', hire);
  const A = G.stations.get(hire.from);
  const B = G.stations.get(hire.to);
  if (!A || !A.harvest || !B || !B.drop) { console.error(`[harvester] needs a harvest station and a drop station: ${hire.from} -> ${hire.to}`); return null; }
  const H = A.harvest;
  const e = hire.effect || {};
  const bed = H.bounds;
  const drop = pt(e.spot || B.drop.vehicleSpot || B.drop.zone);
  const park = pt(e.park || A.park || { x: bed.minX - 2, z: bed.minZ - 2 });
  const accepts = B.drop.accepts;

  const colors = cfg.colors || [0xe53935];
  const color = e.color ?? colors[G.workers ? G.workers.list.filter((x) => x.role === 'harvester').length % colors.length : 0];
  const group = (cfg.model || makeTractor)(color);
  const ud = group.userData || {};
  addBlob(group, { rx: 1.1, rz: ud.blobLength || 1.7, oz: ud.blobOffset ?? -0.3, yaw: true });
  const stack = createStack(G, {
    parent: ud.bedAnchor || group, offset: { x: 0, y: 0, z: 0 },
    capacity: cfg.capacity, perColumn: 12, sway: false,
  });

  // lanes along Z, stepping in X; ordered from the side far from the drop to the near side
  const width = bed.maxX - bed.minX;
  const n = Math.max(1, Math.ceil(width / (2 * cfg.harvestRadius * 0.9)));
  const lx = [];
  for (let i = 0; i < n; i++) lx.push(bed.minX + (i + 0.5) * width / n);
  if (drop.x < (bed.minX + bed.maxX) / 2) lx.reverse();

  const t = {
    group, stack, lx, n,
    wheels: ud.wheels || [], blade: ud.blade || null,
    x: park.x, z: park.z, h: 0, bob: ud.bob || 0, bobPhase: 0, spd: 0, bladeW: 0, dist: 0,
    state: 'wait', wait: 0, pass: -1, passDone: false,
    px: new Float32Array(n * 3 + 4), pz: new Float32Array(n * 3 + 4), pt: new Float32Array(n * 3 + 4),
    pi: 0, pc: 0, bestD: Infinity, stage: 0, vx: 0, vz: 0, rx: 0, rz: 0,
    unloadT: 0, sndT: 0, snd: soundOpts(),
    update,
  };
  group.position.set(t.x, 0, t.z);
  group.rotation.y = t.h;
  G.scene.add(group);
  if (live && G.fx && G.fx.popIn) G.fx.popIn(group);

  const onHarvest = (kind, x, z) => {
    flyToStack(G, stack, kind, x, 0.5, z, 0);
    playAt(G, 'cut', x, z, 0.35, t.snd);
  };

  function buildPath() {
    const reverse = t.pass % 2 === 1;
    let atMin = t.z < (bed.minZ + bed.maxZ) / 2;
    let c = 0;
    for (let li = 0; li < t.n; li++) {
      const k = reverse ? t.n - 1 - li : li;
      const x = t.lx[k];
      const zS = atMin ? bed.minZ - 1.5 : bed.maxZ + 1.5;
      const zE = atMin ? bed.maxZ + 1.5 : bed.minZ - 1.5;
      t.px[c] = x; t.pz[c] = zS; t.pt[c] = 0.5; c++;
      t.px[c] = x; t.pz[c] = zE; t.pt[c] = 0.9; c++;
      if (li < t.n - 1) {
        const xn = t.lx[reverse ? t.n - 2 - li : li + 1];
        t.px[c] = (x + xn) * 0.5; t.pz[c] = zE + (atMin ? 1.8 : -1.8); t.pt[c] = 0.9; c++;
      }
      atMin = !atMin;
    }
    t.pc = c; t.pi = 0; t.bestD = Infinity;
  }

  function startPass() {
    t.pass++;
    t.passDone = false;
    buildPath();
    t.state = 'drive';
  }

  function startDrop() {
    t.rx = t.x; t.rz = t.z;                 // where to resume afterwards
    t.stage = 0; t.bestD = Infinity;
    const side = t.z > drop.z ? 1 : -1;
    t.vx = drop.x; t.vz = drop.z + side * 3.4;
    if (Math.abs(t.z - drop.z) < 3.4 && Math.abs(t.x - drop.x) < 3) t.stage = 1;
    t.state = 'toDrop';
  }

  /** Steer towards (tx,tz). Returns true when the waypoint is reached. */
  function steer(tx, tz, tol, dt, stopAtEnd) {
    const dx = tx - t.x, dz = tz - t.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < tol) return true;
    if (d < t.bestD) t.bestD = d;
    else if (t.bestD < tol * 2.5 && d > t.bestD + 0.25) return true;   // passed it / orbiting
    const err = wrapAngle(Math.atan2(dx, dz) - t.h);
    const maxTurn = TURN * dt;
    t.h += Math.abs(err) <= maxTurn ? err : (err > 0 ? maxTurn : -maxTurn);
    let target = cfg.speed * (1 - 0.45 * Math.min(1, Math.abs(err) / 0.9));
    if (stopAtEnd) target = Math.min(target, 0.8 + d * 1.4);
    const acc = 10 * dt;
    const dv = target - t.spd;
    t.spd += dv > acc ? acc : (dv < -2 * acc ? -2 * acc : dv);
    const step = t.spd * dt;
    t.x += Math.sin(t.h) * step;
    t.z += Math.cos(t.h) * step;
    t.dist += step;
    return false;
  }

  function update(dt) {
    t.dist = 0;
    let driving = false;
    switch (t.state) {
      case 'wait': {
        t.spd = Math.max(0, t.spd - 12 * dt);
        t.wait -= dt;
        if (t.wait <= 0) {
          if (A.active && H.available >= 10) startPass();
          else t.wait = 1.0;
        }
        break;
      }
      case 'drive': {
        driving = true;
        if (t.pi >= t.pc) {
          if (stack.count + stack.incoming > 0) { t.passDone = true; startDrop(); }
          else { t.state = 'wait'; t.wait = 0; }
        } else if (steer(t.px[t.pi], t.pz[t.pi], t.pt[t.pi], dt, false)) {
          t.pi++; t.bestD = Infinity;
        }
        break;
      }
      case 'toDrop': {
        driving = true;
        const stop = t.stage === 1;
        const tx = stop ? drop.x : t.vx, tz = stop ? drop.z : t.vz;
        if (steer(tx, tz, stop ? 0.35 : 1.0, dt, stop)) {
          t.bestD = Infinity;
          if (stop) { t.state = 'unload'; t.unloadT = cfg.unloadInterval; t.spd = 0; }
          else t.stage = 1;
        }
        break;
      }
      case 'unload': {
        t.spd = 0;
        t.unloadT += dt;
        let guard = 4;
        while (t.unloadT >= cfg.unloadInterval && stack.count > 0 && guard-- > 0) {
          t.unloadT -= cfg.unloadInterval;
          if (!B.active || B.drop.room() <= 0) { t.unloadT = 0; break; }
          const kind = stack.popWhere(accepts);
          if (kind === null) { stack.pop(); continue; }
          flyToDrop(G, stack, B, kind, 0);
        }
        if (stack.count === 0 && stack.incoming === 0) {
          if (t.passDone) { t.state = 'wait'; t.wait = 0; }
          else { t.state = 'rejoin'; t.bestD = Infinity; }
        }
        break;
      }
      case 'rejoin': {
        driving = true;
        if (steer(t.rx, t.rz, 0.7, dt, false)) { t.state = 'drive'; t.bestD = Infinity; }
        break;
      }
    }

    // harvesting with the front bar, blade and sound
    let inBed = false;
    if (driving) {
      const fxp = t.x + Math.sin(t.h) * REACH, fzp = t.z + Math.cos(t.h) * REACH;
      const R = cfg.harvestRadius;
      inBed = fxp > bed.minX - R && fxp < bed.maxX + R && fzp > bed.minZ - R && fzp < bed.maxZ + R;
      if (inBed && stack.room > 0) H.harvestAt(fxp, fzp, R, stack.room, onHarvest, null);
      if ((t.state === 'drive' || t.state === 'rejoin') && stack.room <= 0) { t.passDone = t.state === 'drive' && t.pi >= t.pc; startDrop(); }
    }

    // visuals
    t.bladeW += ((inBed ? 22 : 0) - t.bladeW) * Math.min(1, 6 * dt);
    if (t.blade) t.blade.rotation.x += t.bladeW * dt;
    if (t.dist > 0) {
      const spin = t.dist / 0.45;
      for (let i = 0; i < t.wheels.length; i++) t.wheels[i].rotation.x += spin;
    }
    t.sndT -= dt;
    if (t.spd > 0.5 && t.sndT <= 0) {
      t.sndT = 0.5;
      playAt(G, 'tractor', t.x, t.z, 0.25, t.snd);
    }
    // pack tractors have no separate wheels: a little bounce while moving instead
    t.bobPhase += t.dist * 5;
    group.position.set(t.x, t.bob * Math.abs(Math.sin(t.bobPhase)) * Math.min(1, t.spd), t.z);
    group.rotation.y = t.h;
    group.visible = onScreen(G, t.x, 1, t.z, 1.7);   // the stack's meshes are never frustum-culled
    stack.update(dt, Math.min(1, t.spd / cfg.speed));
  }

  return t;
}

registerWorkerRole('harvester', {
  create: createHarvester,
  toast: 'VEHICLE UNLOCKED!',
  focus(G, e) {
    const A = G.stations.get(e.from);
    const p = e.park || (A && A.park) || (A && A.pos);
    return p ? pt(p) : null;
  },
});
