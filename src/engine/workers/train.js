// Worker role 'train' (opt-in: list '../../engine/workers/train.js' in a world's `modules`).
// A freight train on rails: a locomotive pulling wagons that arrives on a schedule, waits at a
// platform, loads goods from a station's pickup zone into its wagons (every wagon fills visibly and
// may want its own kinds), pays for each item as it is loaded, pays a bonus when it leaves full, and
// steams off. Like the 'vendor' role, but a consist that follows a polyline and has several loads.
//
// hire effect: { type: 'hire', role: 'train', from: 'platform', to: 'traincash', options: {...} }
//   from   a 'depot' station (stations/depot.js: a platform pile only vehicles load from), or any
//          station with a pickup zone
//   to     station with cash.deposit(amount, from) (a 'cashpile')
// options (world.workers.train < effect.options):
//   path: { in: [{x,z}, ...], stop: {x, z}, out: [{x,z}, ...] }   REQUIRED. The rails: the locomotive
//          appears at in[0], stops with its middle at `stop` and leaves along `out`.
//   wagons: [{ kinds: ['bread'], capacity: 16 }, ...]   one entry per wagon behind the locomotive
//          (kinds: what that wagon takes; omitted = anything the pickup holds)
//   countStat: 'wagons'      optional G.stats key: how many of the wagons are coupled (a pad adds one)
//   every: 40, first: 6      seconds between visits (counted while away); before the first one
//   rateStat: 'trainRate'    optional G.stats key that makes the trains come that much more often
//   dwell: 12                seconds it waits at the platform at most (it leaves at once when full)
//   loadInterval: 0.09       seconds per item
//   speed: 10, accel: 5      cruising speed; acceleration and braking
//   lead: 3.2, spacing: 4.3  distance from the locomotive's middle to the first wagon's; between wagons
//   priceMult: 1.5           x item value x G.stats.priceMult
//   priceStat: 'trainPrice'  optional G.stats key multiplying the price again
//   bonus: 0.25              extra share of the visit's pay when every wagon left full
//   model: () => ({ loco: Object3D, wagons: [Object3D, ...] })   REQUIRED. Everything faces +Z with its
//          origin on the rails. loco.userData: { wheels: [Object3D] (spun about X), wheelR, funnel: {x,y,z} };
//          wagon.userData.bedAnchor: Object3D where the load starts (columns go toward -Z)
//   perColumn: 4, columnGap: 0.6   how the load is stacked on a wagon
//   sounds: { whistle: 'whistle', chuff: 'chuff' }
// Pays per item as it is loaded (nothing is lost on a reload). Emits 'train' { worker, phase:
// 'arrive' | 'stop' | 'full' | 'leave', loaded, amount, bonus } (payload reused) and one 'sale'
// { station, stationId, amount, items } per visit.
// Readable: state ('away' | 'in' | 'load' | 'out'), t (seconds to the next arrival while away),
// dwellLeft, loaded, capacity, wagons [{ stack, capacity, kinds, group }], visits, totalItems, totalPaid.
import * as THREE from 'three';
import { registerWorkerRole } from '../registry.js';
import { itemValue } from '../items.js';
import { createStack } from '../stack.js';
import { flyToStack } from '../transfer.js';
import { onScreen } from '../chars.js';
import { roleConfig, playAt, soundOpts, pt, num, r3, refill } from './common.js';

const DEFAULTS = {
  every: 40, first: 6, dwell: 12, loadInterval: 0.09, speed: 10, accel: 5, lead: 3.2, spacing: 4.3,
  priceMult: 1.5, bonus: 0.25, perColumn: 4, columnGap: 0.6,
};

function createTrain(G, hire, team, live) {
  const cfg = { ...DEFAULTS, ...roleConfig(G, 'train', hire) };
  const A = G.stations.get(hire.from);
  const B = G.stations.get(hire.to);
  const PK = A && (A.freight || A.pickup);     // a 'depot' keeps its stock for vehicles only (`freight`)
  if (!PK) { console.error(`[train] '${hire.from}' has no stock to load (a 'depot', or any station with a pickup zone)`); return null; }
  if (!B || !(B.cash && B.cash.deposit)) { console.error(`[train] '${hire.to}' has no cash pile with deposit() (use a 'cashpile' station)`); return null; }
  const path = cfg.path || {};
  if (!path.in || !path.in.length || !path.out || !path.out.length || !path.stop) { console.error('[train] options.path { in, stop, out } required'); return null; }
  if (typeof cfg.model !== 'function') { console.error('[train] options.model required'); return null; }

  // ---- the rails: one polyline, distances along it
  const P = path.in.map(pt).concat([pt(path.stop)], path.out.map(pt));
  const cum = [0];
  for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z));
  const total = cum[cum.length - 1];
  const sStop = cum[path.in.length];
  /** position and heading at distance s (extended straight past both ends) */
  const at = { x: 0, z: 0, h: 0 };
  function pointAt(s) {
    let i = 1;
    while (i < P.length - 1 && cum[i] < s) i++;
    const a = P[i - 1], b = P[i];
    const len = cum[i] - cum[i - 1] || 1;
    const u = (s - cum[i - 1]) / len;
    at.x = a.x + (b.x - a.x) * u; at.z = a.z + (b.z - a.z) * u;
    at.h = Math.atan2(b.x - a.x, b.z - a.z);
    return at;
  }

  // ---- the consist
  const built = cfg.model(cfg);
  const group = new THREE.Group();
  group.name = 'train';
  const loco = built.loco;
  group.add(loco);
  const lud = loco.userData || {};
  const wdefs = Array.isArray(cfg.wagons) && cfg.wagons.length ? cfg.wagons : [{ capacity: 16 }];
  const wagons = [];
  for (let i = 0; i < wdefs.length; i++) {
    const g = built.wagons[i % built.wagons.length];
    if (!g) break;
    const d = wdefs[i];
    const kinds = d.kinds ? (Array.isArray(d.kinds) ? d.kinds : [d.kinds]) : null;
    const anchor = (g.userData && g.userData.bedAnchor) || g;
    const stack = createStack(G, { parent: anchor, offset: { x: 0, y: 0, z: 0 }, capacity: Math.max(1, d.capacity | 0 || 16), perColumn: d.perColumn || cfg.perColumn, columnGap: d.columnGap || cfg.columnGap, sway: false });
    g.visible = false;
    group.add(g);
    wagons.push({ group: g, stack, kinds, capacity: stack.capacity, offset: cfg.lead + i * cfg.spacing, on: false });
  }
  group.visible = false;
  G.scene.add(group);

  const rate = () => (cfg.rateStat ? (G.stats[cfg.rateStat] || 1) : 1);
  const coupled = () => Math.max(1, Math.min(wagons.length, cfg.countStat ? (G.stats[cfg.countStat] | 0) || wagons.length : wagons.length));
  const trainLen = () => cfg.lead + (coupled() - 1) * cfg.spacing + cfg.spacing * 0.6;
  const SND = cfg.sounds || {};
  const sndWhistle = SND.whistle || 'whistle', sndChuff = SND.chuff || 'chuff';

  const t = {
    group, loco, wagons,
    state: 'away', t: cfg.first, s: 0, v: 0, dwellT: 0, loadT: 0, idle: 0, n: 0,
    loaded: 0, amount: 0, bonus: 0, full: false, leaveT: 0,
    visits: 0, totalItems: 0, totalPaid: 0, chuffD: 0,
    snd: soundOpts(),
    /** items the coupled wagons hold when all are full */
    get capacity() { let c = 0; for (let i = 0; i < t.n; i++) c += wagons[i].capacity; return c; },
    /** seconds left at the platform (0 unless loading) */
    get dwellLeft() { return t.state === 'load' ? Math.max(0, cfg.dwell - t.dwellT) : 0; },
    every: cfg.every,
    update,
    serialize() {
      return {
        state: t.state, t: r3(t.t), s: r3(t.s), dwell: r3(t.dwellT), loaded: t.loaded, amount: Math.round(t.amount * 100) / 100,
        visits: t.visits, n: t.n, loads: wagons.map((w) => w.stack.snapshot()),
      };
    },
    restore(d) {
      if (!d || typeof d !== 'object') return;
      t.t = Math.max(0, num(d.t, t.t));
      t.visits = Math.max(0, num(d.visits, 0) | 0);
      const st = ['away', 'in', 'load', 'out'].indexOf(d.state) >= 0 ? d.state : 'away';
      if (st === 'away') return;
      t.state = st;
      t.s = Math.max(0, Math.min(total + 60, num(d.s, 0)));
      if (st === 'load') t.s = sStop;
      t.v = st === 'out' ? cfg.speed * 0.5 : 0;
      t.dwellT = Math.max(0, num(d.dwell, 0));
      t.loaded = Math.max(0, num(d.loaded, 0) | 0);
      t.amount = Math.max(0, num(d.amount, 0));
      t.n = Math.max(1, Math.min(wagons.length, num(d.n, coupled()) | 0));
      if (Array.isArray(d.loads)) for (let i = 0; i < wagons.length; i++) refill(wagons[i].stack, d.loads[i]);
      t.full = allFull();
      couple(false);
      place();
    },
  };
  const ev = { worker: t, phase: '', loaded: 0, amount: 0, bonus: 0 };
  const sale = { station: B, stationId: hire.to, amount: 0, items: 0 };
  const from3 = new THREE.Vector3(), billFrom = new THREE.Vector3(), puffAt = new THREE.Vector3();
  const PUFF = { colors: [0xffffff, 0xf2efe8, 0xdedad2], count: 2, speed: 0.7, size: 0.5, life: 1.1, gravity: -3.5, up: 2.2 };
  const emit = (phase) => { ev.phase = phase; ev.loaded = t.loaded; ev.amount = t.amount; ev.bonus = t.bonus; G.events.emit('train', ev); };

  /** show the coupled wagons (a newly bought one pops in if the train is in view) */
  function couple(pop) {
    const n = t.state === 'away' ? coupled() : Math.max(t.n, coupled());
    for (let i = 0; i < wagons.length; i++) {
      const w = wagons[i], on = i < n;
      if (on && !w.on && pop && G.fx && G.fx.popIn) { w.group.visible = true; G.fx.popIn(w.group); }
      w.on = on;
    }
    t.n = n;
  }
  function allFull() {
    for (let i = 0; i < t.n; i++) { const st = wagons[i].stack; if (st.count + st.incoming < wagons[i].capacity) return false; }
    return t.n > 0;
  }
  /** the wagon that takes `kind` and has room, or null */
  function wagonFor(kind) {
    for (let i = 0; i < t.n; i++) {
      const w = wagons[i];
      if (w.kinds && w.kinds.indexOf(kind) < 0) continue;
      if (w.stack.count + w.stack.incoming < w.capacity) return w;
    }
    return null;
  }
  const wanted = (kind) => kind !== 'cash' && wagonFor(kind) !== null;

  function place() {
    const vis = t.state !== 'away';
    group.visible = vis;
    if (!vis) return;
    const p = pointAt(t.s);
    loco.position.set(p.x, 0, p.z); loco.rotation.y = p.h;
    loco.visible = onScreen(G, p.x, 1.5, p.z, 1.7);
    for (let i = 0; i < wagons.length; i++) {
      const w = wagons[i];
      if (!w.on) { w.group.visible = false; continue; }
      const q = pointAt(t.s - w.offset);
      w.group.position.set(q.x, 0, q.z); w.group.rotation.y = q.h;
      const tw = w.group.userData.fxTween;                       // a wagon popping in keeps its own visibility
      if (!tw) w.group.visible = onScreen(G, q.x, 1.5, q.z, 1.7);   // (its load's meshes are never frustum-culled)
    }
  }

  function move(dt) {
    const d = t.v * dt;
    t.s += d;
    const wheels = lud.wheels;
    if (wheels) { const a = d / (lud.wheelR || 0.5); for (let i = 0; i < wheels.length; i++) wheels[i].rotation.x += a; }
    t.chuffD += d;
    if (t.chuffD > 1.5) {
      t.chuffD = 0;
      const p = pointAt(t.s);
      if (loco.visible) {
        playAt(G, sndChuff, p.x, p.z, 0.3, t.snd);
        if (G.fx && G.fx.burst && lud.funnel) {
          const f = lud.funnel, c = Math.cos(p.h), sn = Math.sin(p.h);
          puffAt.set(p.x + f.x * c + f.z * sn, f.y, p.z - f.x * sn + f.z * c);
          G.fx.burst(puffAt, PUFF);
        }
      }
    }
  }

  function update(dt) {
    switch (t.state) {
      case 'away':
        t.t -= dt * rate();
        if (t.t <= 0) {
          if (A.active) {
            t.state = 'in'; t.s = 0; t.v = cfg.speed; t.loaded = 0; t.amount = 0; t.bonus = 0; t.full = false; t.chuffD = 0;
            for (let i = 0; i < wagons.length; i++) wagons[i].stack.clear();
            couple(false);
            const p = pointAt(0);
            playAt(G, sndWhistle, p.x, p.z, 0.8, t.snd);
            emit('arrive');
          } else t.t = 2;
        }
        break;
      case 'in': {
        const left = sStop - t.s;
        const brake = Math.sqrt(Math.max(0, 2 * cfg.accel * left)) + 0.35;
        t.v = Math.min(cfg.speed, brake);
        if (left <= 0.03) {
          t.s = sStop; t.v = 0; t.state = 'load'; t.dwellT = 0; t.loadT = 0; t.idle = 0; t.leaveT = 0;
          emit('stop');
        } else { if (t.v * dt > left) t.v = left / dt; move(dt); }
        break;
      }
      case 'load': {
        couple(true);
        t.dwellT += dt;
        t.loadT += dt;
        let guard = 6;
        while (t.loadT >= cfg.loadInterval && guard-- > 0) {
          t.loadT -= cfg.loadInterval;
          if (!A.active) break;
          const k = PK.take(wanted);
          if (k === null || k === undefined) break;
          const w = wagonFor(k);
          if (!w) break;
          PK.from(from3);
          flyToStack(G, w.stack, k, from3.x, from3.y, from3.z, 0);
          const amt = Math.round(itemValue(k) * cfg.priceMult * (G.stats.priceMult || 1) * (cfg.priceStat ? (G.stats[cfg.priceStat] || 1) : 1) * 100) / 100;
          billFrom.set(w.group.position.x, 2.2, w.group.position.z);
          B.cash.deposit(amt, billFrom);
          t.loaded++; t.amount += amt; t.totalItems++; t.totalPaid += amt;
        }
        if (t.loadT > cfg.loadInterval) t.loadT = cfg.loadInterval;
        if (!t.full && allFull()) {
          t.full = true;
          if (cfg.bonus > 0 && t.amount > 0) {
            t.bonus = Math.round(t.amount * cfg.bonus);
            billFrom.set(loco.position.x, 2.6, loco.position.z);
            B.cash.deposit(t.bonus, billFrom);
            t.totalPaid += t.bonus;
          }
          emit('full');
        }
        if (t.full || t.dwellT >= cfg.dwell) {
          let flying = 0;
          for (let i = 0; i < t.n; i++) flying += wagons[i].stack.incoming;
          t.leaveT += dt;
          if (flying === 0 && t.leaveT > (t.full ? 0.9 : 0.2)) {
            t.state = 'out'; t.v = 0; t.visits++;
            if (t.loaded > 0) {
              sale.amount = t.amount + t.bonus; sale.items = t.loaded;
              G.events.emit('sale', sale);
              if (G.audio && G.audio.play) G.audio.play('sell', t.snd);
            }
            playAt(G, sndWhistle, loco.position.x, loco.position.z, 0.8, t.snd);
            emit('leave');
          }
        }
        break;
      }
      case 'out':
        t.v = Math.min(cfg.speed, t.v + cfg.accel * dt);
        move(dt);
        if (t.s - trainLen() > total) {
          t.state = 'away'; t.t = cfg.every; t.v = 0;
          for (let i = 0; i < wagons.length; i++) wagons[i].stack.clear();
        }
        break;
    }
    place();
    if (group.visible) for (let i = 0; i < wagons.length; i++) if (wagons[i].on && wagons[i].group.visible) wagons[i].stack.update(dt, 0);
  }

  couple(false);
  place();
  return t;
}

registerWorkerRole('train', {
  create: createTrain,
  toast: 'THE TRAIN IS COMING!',
  focus(G, e) {
    const o = (e && e.options) || {};
    const w = (G.world.workers && G.world.workers.train) || {};
    const p = (o.path && o.path.stop) || (w.path && w.path.stop);
    return p ? pt(p) : null;
  },
});
