// Bloom Rush - worker AI: cutters, cashiers and tractors.
// All logic advances only inside update(dt); no timers, no wall-clock time.
import * as THREE from 'three';
import { makeCharacter, animateCharacter, LOOKS, makeTractor } from './models.js';
import { createStack } from './stack.js';
import { FARMS, WORKER } from './config.js';

const TAU = Math.PI * 2;
const TURN_RATE = 12;            // cutter turning, rad/s
const TRACTOR_TURN = 2.5;        // tractor steering, rad/s
const ARRIVE = 0.15;
const TRACTOR_COLORS = [0xe53935, 0x1e88e5, 0xfb8c00, 0x8e24aa];

function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
function turnToward(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  return Math.abs(d) <= maxStep ? cur + d : cur + (d > 0 ? maxStep : -maxStep);
}

export function createWorkers(G) {
  const CUT = WORKER.cutter;
  const TR = WORKER.tractor;
  const cutters = FARMS.map(() => []);
  const cashiers = FARMS.map(() => null);
  const tractors = FARMS.map(() => null);
  const tmpV = new THREE.Vector3();

  const fieldOf = (f) => (G.fields && G.fields.get ? G.fields.get(f) : null) || null;
  const shopOf = (f) => (G.shops && G.shops.get ? G.shops.get(f) : null) || null;

  // ------------------------------------------------------------ shared bits ---
  function playAt(name, x, z, volume, pos) {
    const a = G.audio;
    if (!a || !a.play) return;
    pos.x = x; pos.z = z;
    a.play(name, { pos, volume });
  }

  /** Fly one bouquet from the stack top to the shop counter and deposit it. */
  function sendToShop(f, stack, pos) {
    const shop = shopOf(f);
    if (!shop) return false;
    const type = stack.pop();
    if (type < 0) return false;
    const fx = G.fx;
    const farm = FARMS[f];
    if (fx && fx.fly) {
      stack.topWorld(tmpV);
      fx.fly({
        kind: 'bouquet', type,
        from: { x: tmpV.x, y: tmpV.y, z: tmpV.z },
        to: (o) => shop.dropTarget(o),
        dur: 0.3,
        onDone: () => {
          shop.deposit(type);
          playAt('drop', farm.counter.x, farm.counter.z, 0.2, pos);
        },
      });
    } else {
      shop.deposit(type);
    }
    return true;
  }

  /** Spawn one flying bouquet from the ground onto a stack. */
  function harvestToStack(stack, type, x, z) {
    stack.incoming++;
    const done = () => { stack.incoming--; stack.push(type); };
    const fx = G.fx;
    if (fx && fx.fly) {
      fx.fly({
        kind: 'bouquet', type,
        from: { x, y: 0.5, z },
        to: stack.toWorldFn,
        dur: 0.3,
        onDone: done,
      });
    } else done();
  }

  // ================================================================ cutters ===
  function addCutter(f, live) {
    const farm = FARMS[f];
    const list = cutters[f];
    const k = list.length;
    const group = makeCharacter(LOOKS.cutter);
    const stack = createStack(G, {
      parent: group, offset: { x: 0, y: 0.55, z: -0.42 }, billboard: true,
      capacity: CUT.capacity, perColumn: 40,
    });
    stack.toWorldFn = (o) => stack.topWorld(o);
    const w = {
      f, farm, group, stack,
      x: farm.workerHome.x + ((k % 3) - 1) * 0.9,
      z: farm.workerHome.z + ((k / 3) | 0) * 0.9,
      face: farm.flip > 0 ? 0 : 0, dirX: -farm.flip, dirZ: 0, spd: 0,
      state: 'seek', wait: 0, tx: 0, tz: 0, stuck: 0, unloadT: 0,
      pos: { x: 0, z: 0 },
      anim: { moving: false, speed: 1, carrying: false, action: null },
    };
    w.face = Math.atan2(w.dirX, w.dirZ);
    group.position.set(w.x, 0, w.z);
    group.rotation.y = w.face;
    G.scene.add(group);
    list.push(w);
    if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
  }

  function walk(w, tx, tz, dt) {
    const dx = tx - w.x, dz = tz - w.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= ARRIVE) { w.spd = 0; return d; }
    const inv = 1 / d;
    w.dirX = dx * inv; w.dirZ = dz * inv;
    w.face = turnToward(w.face, Math.atan2(dx, dz), TURN_RATE * dt);
    const step = Math.min(CUT.speed * dt, d);
    w.x += w.dirX * step; w.z += w.dirZ * step;
    w.spd = step / dt;
    return d - step;
  }

  function setTarget(w, c) { w.tx = c.x; w.tz = c.z; w.stuck = 0; }

  function bandOf(w, out) {
    const b = w.farm.bed;
    const n = Math.max(1, cutters[w.f].length);
    const k = Math.min(cutters[w.f].indexOf(w), n - 1);
    const H = b.maxZ - b.minZ;
    out.lo = b.minZ + (k / n) * H - 0.05;
    out.hi = b.minZ + ((k + 1) / n) * H + 0.05;
    return out;
  }
  const band = { lo: 0, hi: 0 };

  function pickBand(w, field) {
    const b = w.farm.bed;
    bandOf(w, band);
    const bz = (band.lo + band.hi) * 0.5;
    const w4 = (b.maxX - b.minX) * 0.25;
    let best = null, bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const sx = i === 0 ? Math.min(b.maxX, Math.max(b.minX, w.x))
        : b.minX + w4 * i;     // i = 1..3 -> quarter points
      const c = field.nearestGrown(sx, bz);
      if (!c || c.z < band.lo || c.z > band.hi) continue;
      const dx = c.x - w.x, dz = c.z - w.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (!best) best = field.nearestGrown(w.x, w.z);
    if (!best) return false;
    setTarget(w, best);
    return true;
  }

  function pickAhead(w, field) {
    const sp = w.farm.bed.spacing;
    const ax = w.x + w.dirX * sp, az = w.z + w.dirZ * sp;
    const c = field.nearestGrown(ax, az);
    if (c) {
      const dx = c.x - ax, dz = c.z - az;
      if (dx * dx + dz * dz < sp * sp * 1.7) { setTarget(w, c); return true; }
    }
    return pickBand(w, field);
  }

  function updateCutter(w, dt) {
    const field = fieldOf(w.f);
    const stack = w.stack;
    const farm = w.farm;
    const a = w.anim;
    let action = null, carrying = false;
    w.spd = 0;

    if (w.state === 'seek') {
      if (w.wait > 0) {
        w.wait -= dt;
        // idle near the bed edge on the counter side, within own band
        const b = farm.bed;
        bandOf(w, band);
        walk(w, farm.flip > 0 ? b.maxX + 1.0 : b.minX - 1.0, (band.lo + band.hi) * 0.5, dt);
      } else if (stack.room <= 0) {
        w.state = 'deliver';
      } else if (field && field.active && pickBand(w, field)) {
        w.state = 'cut';
      } else if (stack.count + stack.incoming > 0) {
        w.state = 'deliver';
      } else {
        w.wait = 0.3;
      }
    }

    if (w.state === 'cut') {
      const rem = walk(w, w.tx, w.tz, dt);
      action = 'swing';
      if (field && stack.room > 0) {
        const cut = field.cutAt(w.x, w.z, CUT.cutRadius, stack.room);
        if (cut && cut.length) {
          const type = field.type;
          for (let i = 0; i < cut.length; i++) {
            const c = cut[i];
            harvestToStack(stack, type, c.x, c.z);
            playAt('cut', c.x, c.z, 0.35, w.pos);
          }
        }
      }
      if (stack.room <= 0) {
        w.state = 'deliver';
      } else {
        w.stuck += dt;
        const dx = w.tx - w.x, dz = w.tz - w.z;
        const r = CUT.cutRadius * 0.9;
        if (rem <= ARRIVE || dx * dx + dz * dz < r * r || w.stuck > 3) {
          if (!(field && field.active && pickAhead(w, field))) {
            w.state = stack.count + stack.incoming > 0 ? 'deliver' : 'seek';
            w.wait = w.state === 'seek' ? 0.3 : 0;
          }
        }
      }
    }

    if (w.state === 'deliver') {
      carrying = true;
      const rem = walk(w, farm.workerDrop.x, farm.workerDrop.z, dt);
      if (rem <= ARRIVE) { w.state = 'unload'; w.unloadT = CUT.unloadInterval; }
    }

    if (w.state === 'unload') {
      carrying = true;
      w.face = turnToward(w.face, Math.atan2(farm.counter.x - w.x, farm.counter.z - w.z), TURN_RATE * dt);
      w.unloadT += dt;
      while (w.unloadT >= CUT.unloadInterval && stack.count > 0) {
        w.unloadT -= CUT.unloadInterval;
        if (!sendToShop(w.f, stack, w.pos)) break;
      }
      if (stack.count === 0) {
        if (stack.incoming === 0) { w.state = 'seek'; w.wait = 0; }
      } else if (!shopOf(w.f)) {
        w.unloadT = 0;
      }
    }

    a.moving = w.spd > 0.1;
    a.speed = 1;
    a.carrying = carrying;
    a.action = action;
    animateCharacter(w.group, dt, a);
    w.group.position.set(w.x, 0, w.z);
    w.group.rotation.y = w.face;
    stack.update(dt, Math.min(1, w.spd / CUT.speed));
  }

  // ================================================================ cashier ===
  function addCashier(f, live) {
    const farm = FARMS[f];
    const group = makeCharacter(LOOKS.cashier);
    group.position.set(farm.cashierPos.x, 0, farm.cashierPos.z);
    group.rotation.y = farm.cashierPos.faceX > 0 ? Math.PI / 2 : -Math.PI / 2;
    G.scene.add(group);
    cashiers[f] = { group, wave: 0, cool: 0, anim: { moving: false, speed: 1, carrying: false, action: null } };
    if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
  }

  function updateCashier(c, dt) {
    if (c.wave > 0) c.wave -= dt;
    if (c.cool > 0) c.cool -= dt;
    c.anim.action = c.wave > 0 ? 'wave' : null;
    animateCharacter(c.group, dt, c.anim);
  }

  // ================================================================ tractor ===
  function addTractor(f, live) {
    const farm = FARMS[f];
    const bed = farm.bed;
    const group = makeTractor(TRACTOR_COLORS[f % TRACTOR_COLORS.length]);
    const ud = group.userData || {};
    const stack = createStack(G, {
      parent: ud.bedAnchor || group, offset: { x: 0, y: 0, z: 0 },
      capacity: TR.capacity, perColumn: 12, sway: false,
    });
    stack.toWorldFn = (o) => stack.topWorld(o);

    // lanes along Z, stepping in X; ordered from the side far from the drop to the near side
    const width = bed.maxX - bed.minX;
    const n = Math.max(1, Math.ceil(width / (2 * TR.cutRadius * 0.9)));
    const lx = [];
    for (let i = 0; i < n; i++) lx.push(bed.minX + (i + 0.5) * width / n);
    if (farm.tractorDrop.x < (bed.minX + bed.maxX) / 2) lx.reverse();

    const t = {
      f, farm, group, stack, lx, n,
      wheels: ud.wheels || [], blade: ud.blade || null,
      x: farm.tractorPark.x, z: farm.tractorPark.z, h: 0, spd: 0, bladeW: 0,
      state: 'wait', wait: 0, pass: -1, passDone: false,
      px: new Float32Array(n * 3 + 4), pz: new Float32Array(n * 3 + 4), pt: new Float32Array(n * 3 + 4),
      pi: 0, pc: 0, bestD: Infinity, stage: 0, vx: 0, vz: 0, rx: 0, rz: 0,
      unloadT: 0, sndT: 0, pos: { x: 0, z: 0 },
    };
    group.position.set(t.x, 0, t.z);
    group.rotation.y = t.h;
    G.scene.add(group);
    tractors[f] = t;
    if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
  }

  function buildPath(t) {
    const bed = t.farm.bed;
    const reverse = t.pass % 2 === 1;
    let atMin = t.z < (bed.minZ + bed.maxZ) / 2;
    let c = 0;
    const put = (x, z, tol) => { t.px[c] = x; t.pz[c] = z; t.pt[c] = tol; c++; };
    for (let li = 0; li < t.n; li++) {
      const k = reverse ? t.n - 1 - li : li;
      const x = t.lx[k];
      const zS = atMin ? bed.minZ - 1.5 : bed.maxZ + 1.5;
      const zE = atMin ? bed.maxZ + 1.5 : bed.minZ - 1.5;
      put(x, zS, 0.5);
      put(x, zE, 0.9);
      if (li < t.n - 1) {
        const xn = t.lx[reverse ? t.n - 2 - li : li + 1];
        put((x + xn) * 0.5, zE + (atMin ? 1.8 : -1.8), 0.9);
      }
      atMin = !atMin;
    }
    t.pc = c; t.pi = 0; t.bestD = Infinity;
  }

  function startPass(t) {
    t.pass++;
    t.passDone = false;
    buildPath(t);
    t.state = 'drive';
  }

  function startDrop(t) {
    const drop = t.farm.tractorDrop;
    t.rx = t.x; t.rz = t.z;                 // where to resume afterwards
    t.stage = 0; t.bestD = Infinity;
    const side = t.z > drop.z ? 1 : -1;
    t.vx = drop.x; t.vz = drop.z + side * 3.4;
    if (Math.abs(t.z - drop.z) < 3.4 && Math.abs(t.x - drop.x) < 3) t.stage = 1;
    t.state = 'toDrop';
  }

  /** Steer towards (tx,tz). Returns true when the waypoint is reached. */
  function steer(t, tx, tz, tol, dt, stopAtEnd) {
    const dx = tx - t.x, dz = tz - t.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < tol) return true;
    if (d < t.bestD) t.bestD = d;
    else if (t.bestD < tol * 2.5 && d > t.bestD + 0.25) return true;   // passed it / orbiting
    const err = wrapAngle(Math.atan2(dx, dz) - t.h);
    const maxTurn = TRACTOR_TURN * dt;
    t.h += Math.abs(err) <= maxTurn ? err : (err > 0 ? maxTurn : -maxTurn);
    let target = TR.speed * (1 - 0.45 * Math.min(1, Math.abs(err) / 0.9));
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

  function updateTractor(t, dt) {
    const field = fieldOf(t.f);
    const farm = t.farm;
    const bed = farm.bed;
    const stack = t.stack;
    const drop = farm.tractorDrop;
    t.dist = 0;
    let driving = false;

    switch (t.state) {
      case 'wait': {
        t.spd = Math.max(0, t.spd - 12 * dt);
        t.wait -= dt;
        if (t.wait <= 0) {
          if (field && field.active && field.grownCount >= 10) startPass(t);
          else t.wait = 1.0;
        }
        break;
      }
      case 'drive': {
        driving = true;
        if (t.pi >= t.pc) {
          if (stack.count + stack.incoming > 0) { t.passDone = true; startDrop(t); }
          else { t.state = 'wait'; t.wait = 0; }
        } else if (steer(t, t.px[t.pi], t.pz[t.pi], t.pt[t.pi], dt, false)) {
          t.pi++; t.bestD = Infinity;
        }
        break;
      }
      case 'toDrop': {
        driving = true;
        const stop = t.stage === 1;
        const tx = stop ? drop.x : t.vx, tz = stop ? drop.z : t.vz;
        if (steer(t, tx, tz, stop ? 0.35 : 1.0, dt, stop)) {
          t.bestD = Infinity;
          if (stop) { t.state = 'unload'; t.unloadT = TR.unloadInterval; t.spd = 0; }
          else t.stage = 1;
        }
        break;
      }
      case 'unload': {
        t.spd = 0;
        t.unloadT += dt;
        let guard = 4;
        while (t.unloadT >= TR.unloadInterval && stack.count > 0 && guard-- > 0) {
          t.unloadT -= TR.unloadInterval;
          if (!sendToShop(t.f, stack, t.pos)) break;
        }
        if (stack.count === 0 && stack.incoming === 0) {
          if (t.passDone) { t.state = 'wait'; t.wait = 0; }
          else { t.state = 'rejoin'; t.bestD = Infinity; }
        }
        break;
      }
      case 'rejoin': {
        driving = true;
        if (steer(t, t.rx, t.rz, 0.7, dt, false)) { t.state = 'drive'; t.bestD = Infinity; }
        break;
      }
    }

    // cutting with the front bar, blade and sound
    let inBed = false;
    if (driving) {
      const fxp = t.x + Math.sin(t.h) * 1.6, fzp = t.z + Math.cos(t.h) * 1.6;
      const R = TR.cutRadius;
      inBed = fxp > bed.minX - R && fxp < bed.maxX + R && fzp > bed.minZ - R && fzp < bed.maxZ + R;
      if (inBed && field && stack.room > 0) {
        const cut = field.cutAt(fxp, fzp, R, stack.room);
        if (cut && cut.length) {
          const type = field.type;
          for (let i = 0; i < cut.length; i++) {
            const c = cut[i];
            harvestToStack(stack, type, c.x, c.z);
            playAt('cut', c.x, c.z, 0.35, t.pos);
          }
        }
      }
      if ((t.state === 'drive' || t.state === 'rejoin') && stack.room <= 0) { t.passDone = t.state === 'drive' && t.pi >= t.pc; startDrop(t); }
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
      playAt('tractor', t.x, t.z, 0.25, t.pos);
    }
    t.group.position.set(t.x, 0, t.z);
    t.group.rotation.y = t.h;
    stack.update(dt, Math.min(1, t.spd / TR.speed));
  }

  // ================================================================== sync ====
  function syncAll(live) {
    const s = G.stats;
    if (!s) return;
    for (let f = 0; f < FARMS.length; f++) {
      while (cutters[f].length < (s.cutters[f] || 0)) addCutter(f, live);
      if (s.cashier[f] && !cashiers[f]) addCashier(f, live);
      if (s.tractor[f] && !tractors[f]) addTractor(f, live);
    }
  }
  syncAll(false);

  G.events.on('unlock', () => syncAll(true));
  G.events.on('sale', (e) => {
    const c = e && cashiers[e.farmIdx];
    if (c && c.cool <= 0) { c.wave = 0.6; c.cool = 1.4; }
  });

  return {
    update(dt) {
      for (let f = 0; f < FARMS.length; f++) {
        const list = cutters[f];
        for (let i = 0; i < list.length; i++) updateCutter(list[i], dt);
        if (cashiers[f]) updateCashier(cashiers[f], dt);
        if (tractors[f]) updateTractor(tractors[f], dt);
      }
    },
  };
}
