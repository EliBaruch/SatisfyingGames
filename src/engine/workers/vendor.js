// Worker role 'vendor': a vehicle that arrives on a schedule, loads up to N items from a
// station's pickup zone, pays their value onto a cash pile, and drives off. The chicken
// world's delivery truck. Full schema: docs/STATIONS.md.
//
// hire effect: { type: 'hire', role: 'vendor', from: 'packer', to: 'truck-cash', options: {...} }
//   from   station with a pickup zone (e.g. a converter's output, a pile)
//   to     station with cash.deposit(amount, from) (a 'cashpile' or a 'checkout')
// options (engine defaults < world.workers.vendor < effect.options):
//   path: { in: [{x,z}, ...], stop: {x, z}, out: [{x,z}, ...] }   required: drives in[0] -> ... -> stop,
//          loads, then stop -> out[...]; hidden before in[0] and after the last out point
//   kinds: ['carton'] | null       what it buys (default: anything the pickup has)
//   capacity: 12                   items per visit
//   every: 25                      seconds between visits (counted while away)
//   first: 8                       seconds before the first visit
//   minStock: 1                    wait (re-check every 2 s) until the pickup has this many wanted items
//   patience: 3                    seconds parked without loading before it leaves
//   loadInterval: 0.12, speed: 7, turn: 3.2 (rad/s)
//   priceMult: 1                   x item value x G.stats.priceMult
//   model: (color) => Object3D     vehicle factory (faces +Z; userData.bedAnchor optional);
//                                  default chars.makeTruck if it exists, else a code-built truck
//   bed: { x: 0, y: 1.1, z: -0.9 } where the load sits if the model has no bedAnchor
// Pays per item as it is loaded (money is never lost on a reload); a bill flies to the pile
// for each item. Emits 'vendor' { worker, phase: 'arrive' | 'leave', loaded, amount } and one
// 'sale' { station, stationId, amount, items } per visit.
import * as THREE from 'three';
import * as chars from '../chars.js';
import { registerWorkerRole } from '../registry.js';
import { Parts, meshOf } from '../geom.js';
import { itemValue } from '../items.js';
import { createStack } from '../stack.js';
import { flyToStack } from '../transfer.js';
import { wrapAngle, roleConfig, playAt, soundOpts, pt } from './common.js';

const DEFAULTS = { capacity: 12, every: 25, first: 8, minStock: 1, patience: 3, loadInterval: 0.12, speed: 7, turn: 3.2, priceMult: 1, kinds: null };

export function makePlaceholderTruck(color = 0x2f8fd8) {
  const g = new THREE.Group();
  const p = new Parts();
  p.box(0x3a3f4d, 1.5, 0.25, 3.6, [0, 0.55, 0]);
  p.box(color, 1.6, 1.15, 1.2, [0, 1.15, 1.15]);            // cab
  p.box(0xbfe6ff, 1.4, 0.45, 0.06, [0, 1.45, 1.76]);        // windscreen
  p.box(0xf4f4f4, 1.7, 0.12, 2.3, [0, 0.72, -0.65]);         // flat bed
  p.box(color, 0.08, 0.35, 2.3, [0.82, 0.95, -0.65]);
  p.box(color, 0.08, 0.35, 2.3, [-0.82, 0.95, -0.65]);
  p.box(color, 1.7, 0.35, 0.08, [0, 0.95, -1.78]);
  for (const sx of [-1, 1]) for (const sz of [1.15, -1.0]) p.cyl(0x22252e, 0.38, 0.38, 0.3, [sx * 0.78, 0.38, sz], [0, 0, Math.PI / 2], 12);
  for (const sx of [-1, 1]) p.sph(0xfff2a0, 0.12, [sx * 0.55, 0.95, 1.77], [1, 1, 0.5]);
  g.add(meshOf(p.merged()));
  const bed = new THREE.Object3D();
  bed.position.set(0, 0.8, -0.65);
  g.add(bed);
  g.userData.bedAnchor = bed;
  g.userData.wheels = [];
  return g;
}

function createVendor(G, hire, team, live) {
  const cfg = { ...DEFAULTS, ...roleConfig(G, 'vendor', hire) };
  const A = G.stations.get(hire.from);
  const B = G.stations.get(hire.to);
  if (!A || !A.pickup) { console.error(`[vendor] '${hire.from}' has no pickup zone`); return null; }
  if (!B || !(B.cash && B.cash.deposit)) { console.error(`[vendor] '${hire.to}' has no cash pile with deposit() (use a 'cashpile' or 'checkout' station)`); return null; }
  const path = cfg.path || {};
  const pin = (path.in || []).map((p) => pt(p));
  const pout = (path.out || []).map((p) => pt(p));
  const stop = pt(path.stop || A.pickup.zone);
  if (!pin.length || !pout.length) { console.error('[vendor] options.path { in, stop, out } required'); return null; }
  const kinds = cfg.kinds ? (Array.isArray(cfg.kinds) ? cfg.kinds : [cfg.kinds]) : null;
  const wantKind = kinds ? (k) => kinds.indexOf(k) >= 0 : (k) => k !== 'cash';

  const group = (cfg.model || chars.makeTruck || makePlaceholderTruck)(cfg.color);
  const ud = group.userData || {};
  let anchor = ud.bedAnchor;
  if (!anchor) {
    anchor = new THREE.Object3D();
    const b = cfg.bed || { x: 0, y: 1.1, z: -0.9 };
    anchor.position.set(b.x, b.y, b.z);
    group.add(anchor);
  }
  if (!cfg.model && !chars.makeTruck && chars.addBlob) chars.addBlob(group, { rx: 1.0, rz: 2.0, yaw: true });
  const stack = createStack(G, { parent: anchor, offset: { x: 0, y: 0, z: 0 }, capacity: cfg.capacity, perColumn: 6, sway: false, columnGap: 0.5 });
  group.visible = false;
  G.scene.add(group);

  const v = {
    group, stack,
    state: 'away', t: cfg.first, x: pin[0].x, z: pin[0].z, h: 0, spd: 0, wi: 0,
    loadT: 0, idle: 0, loaded: 0, amount: 0,
    visits: 0, totalItems: 0, totalPaid: 0,
    snd: soundOpts(), sndT: 0,
    update,
  };
  const ev = { worker: v, phase: '', loaded: 0, amount: 0 };
  const sale = { station: B, stationId: hire.to, amount: 0, items: 0 };
  const from3 = new THREE.Vector3();
  const billFrom = new THREE.Vector3();

  function wantedAvailable() {
    const pk = A.pickup;
    if (!A.active || !(pk.available > 0)) return 0;
    if (pk.count && kinds) { let n = 0; for (let i = 0; i < kinds.length; i++) n += pk.count(kinds[i]); return n; }
    return pk.has && !pk.has(wantKind) ? 0 : pk.available;
  }

  /** Drive toward (tx, tz); true when within tol. */
  function drive(tx, tz, tol, dt, slow) {
    const dx = tx - v.x, dz = tz - v.z;
    const d = Math.hypot(dx, dz);
    if (d < tol) return true;
    const err = wrapAngle(Math.atan2(dx, dz) - v.h);
    const mt = cfg.turn * dt;
    v.h += Math.abs(err) <= mt ? err : (err > 0 ? mt : -mt);
    let target = cfg.speed * (1 - 0.6 * Math.min(1, Math.abs(err) / 1.2));
    if (slow) target = Math.min(target, 0.8 + d * 1.5);
    const acc = 9 * dt;
    const dv = target - v.spd;
    v.spd += dv > acc ? acc : dv < -2 * acc ? -2 * acc : dv;
    const step = Math.min(v.spd * dt, d);
    v.x += Math.sin(v.h) * step; v.z += Math.cos(v.h) * step;
    return false;
  }

  function update(dt) {
    switch (v.state) {
      case 'away':
        v.t -= dt;
        if (v.t <= 0) {
          if (wantedAvailable() >= cfg.minStock) {
            v.state = 'in'; v.wi = 1; v.x = pin[0].x; v.z = pin[0].z;
            const nx = pin.length > 1 ? pin[1] : stop;
            v.h = Math.atan2(nx.x - v.x, nx.z - v.z); v.spd = cfg.speed;
            group.visible = true;
            ev.phase = 'arrive'; ev.loaded = 0; ev.amount = 0;
            G.events.emit('vendor', ev);
          } else v.t = 2;
        }
        break;
      case 'in': {
        const last = v.wi >= pin.length;
        const p = last ? stop : pin[v.wi];
        if (drive(p.x, p.z, last ? 0.3 : 1.2, dt, last)) {
          if (last) { v.state = 'load'; v.spd = 0; v.loadT = 0; v.idle = 0; v.loaded = 0; v.amount = 0; } else v.wi++;
        }
        break;
      }
      case 'load': {
        v.spd = 0;
        v.loadT += dt;
        let took = false;
        while (v.loadT >= cfg.loadInterval && v.loaded < cfg.capacity) {
          v.loadT -= cfg.loadInterval;
          if (!A.active) break;
          const k = A.pickup.take(wantKind);
          if (k === null || k === undefined) break;
          A.pickup.from(from3);
          flyToStack(G, stack, k, from3.x, from3.y, from3.z, 0);
          const amt = Math.round(itemValue(k) * cfg.priceMult * (G.stats.priceMult || 1) * 100) / 100;
          billFrom.set(v.x, 2.2, v.z);
          B.cash.deposit(amt, billFrom);
          v.loaded++; v.amount += amt; v.totalItems++; v.totalPaid += amt;
          took = true;
        }
        if (v.loadT > cfg.loadInterval) v.loadT = cfg.loadInterval;
        if (took) v.idle = 0; else v.idle += dt;
        if (v.loaded >= cfg.capacity || (v.idle > cfg.patience) || (v.loaded > 0 && v.idle > 0.6)) {
          if (stack.incoming > 0) break;
          v.state = 'out'; v.wi = 0; v.visits++;
          if (v.loaded > 0) {
            sale.amount = v.amount; sale.items = v.loaded;
            G.events.emit('sale', sale);
            if (G.audio && G.audio.play) G.audio.play('sell', v.snd);
          }
          ev.phase = 'leave'; ev.loaded = v.loaded; ev.amount = v.amount;
          G.events.emit('vendor', ev);
        }
        break;
      }
      case 'out': {
        const p = pout[v.wi];
        if (drive(p.x, p.z, 1.2, dt, false)) {
          v.wi++;
          if (v.wi >= pout.length) {
            v.state = 'away'; v.t = cfg.every; group.visible = false;
            stack.clear(); v.spd = 0;
          }
        }
        break;
      }
    }
    v.sndT -= dt;
    if (v.spd > 0.5 && v.sndT <= 0 && group.visible) { v.sndT = 0.6; playAt(G, 'tractor', v.x, v.z, 0.2, v.snd); }
    group.position.set(v.x, 0, v.z);
    group.rotation.y = v.h;
    if (group.visible) stack.update(dt, 0);
  }

  return v;
}

registerWorkerRole('vendor', {
  create: createVendor,
  toast: 'TRUCK HIRED!',
  focus(G, e) {
    const o = (e && e.options) || {};
    const w = (G.world.workers && G.world.workers.vendor) || {};
    const p = (o.path && o.path.stop) || (w.path && w.path.stop);
    return p ? pt(p) : null;
  },
});
