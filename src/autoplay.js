// Autoplay bot. Plays like a competent human through G.input.override only, using the
// same station capabilities as the player (harvest areas, drop zones, cash piles, pads).
// Driven by simulation steps (wraps G.input.update, which runs once per fixed step).
import { getItem } from './engine/registry.js';

const STEP = 1 / 60;
const DECIDE_EVERY = 15;      // steps between decisions (~4 per sim-second)
const REACTION = 0.25;        // sim seconds of standing still before changing action
const SAMPLE_EVERY = 15;      // sim seconds
const S2 = Math.SQRT1_2;
const PAD_RADIUS = 1.3;

export function startAutoplay(G) {
  const state = G.state;
  const ap = (window.__autoplay = { log: [], done: false, stuck: false, action: 'init' });
  const stations = G.stations.list;

  function push(entry) {
    ap.log.push(entry);
    console.log('[autoplay] ' + JSON.stringify(entry));
  }
  const T1 = () => Math.round(state.playTime * 10) / 10;

  // ------------------------------------------------------------ logging
  G.events.on('unlock', ({ pad } = {}) => {
    if (!pad) return;
    push({ t: T1(), event: 'unlock', id: pad.id, label: pad.label, cost: pad.cost, money: Math.floor(state.money) });
  });
  G.events.on('win', () => {
    push({ t: T1(), event: 'win' });
    ap.done = true;
  });

  // ------------------------------------------------------------ helpers
  const pl = () => G.player;
  const carried = () => { const s = pl().stack; return s.count + s.incoming; };
  const active = (cap) => stations.filter((s) => s.active && s[cap]);

  function remainingCost(pad) { return G.pads.remaining(pad); }
  function nextPad() { return G.pads && G.pads.next ? G.pads.next() : null; }

  // ---- station blockers are solid: route around them with corner waypoints
  const M = 0.9;  // player radius + margin
  function boxes() {
    const out = [];
    for (const s of stations) {
      if (!s.active || !s.blockers) continue;
      for (const o of s.blockers) out.push(o.r !== undefined ? { x: o.x, z: o.z, hx: o.r + M, hz: o.r + M } : { x: o.x, z: o.z, hx: o.hx + M, hz: o.hz + M });
    }
    return out;
  }
  function segHitsRect(ax, az, bx, bz, c) {
    // slab test against the slightly shrunk rect
    const hx = c.hx - 0.5, hz = c.hz - 0.5;
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dz = bz - az;
    const ps = [-dx, dx, -dz, dz];
    const qs = [ax - (c.x - hx), (c.x + hx) - ax, az - (c.z - hz), (c.z + hz) - az];
    for (let i = 0; i < 4; i++) {
      if (ps[i] === 0) { if (qs[i] < 0) return false; continue; }
      const r = qs[i] / ps[i];
      if (ps[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
    }
    return t0 <= t1;
  }
  function waypoint(px, pz, tx, tz) {
    for (const c of boxes()) {
      if (!segHitsRect(px, pz, tx, tz, c)) continue;
      let best = null, bd = Infinity;
      const cs = [];
      for (let i = 0; i < 4; i++) cs.push({ x: c.x + (i & 1 ? c.hx : -c.hx), z: c.z + (i & 2 ? c.hz : -c.hz) });
      for (let i = 0; i < 4; i++) {
        const A = cs[i];
        if (segHitsRect(px, pz, A.x, A.z, c)) continue;
        if (!segHitsRect(A.x, A.z, tx, tz, c)) {
          const d = Math.hypot(A.x - px, A.z - pz) + Math.hypot(tx - A.x, tz - A.z);
          if (d < bd) { bd = d; best = A; }
        }
        for (let j = 0; j < 4; j++) {
          if (j === i) continue;
          const B = cs[j];
          if (segHitsRect(A.x, A.z, B.x, B.z, c) || segHitsRect(B.x, B.z, tx, tz, c)) continue;
          const d = Math.hypot(A.x - px, A.z - pz) + Math.hypot(B.x - A.x, B.z - A.z) + Math.hypot(tx - B.x, tz - B.z);
          if (d < bd) { bd = d; best = A; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  // ---- chain worlds have long rows of machines and belts: find the way on a grid (A*, 0.6 m cells)
  const NAV = { cell: 0.6, w: 0, h: 0, x0: 0, z0: 0, blocked: null, n: -1, g: null, from: null, open: null, stamp: null, tick: 0, path: [], key: '', at: 0 };
  function navBuild() {
    const b = G.world.bounds, c = NAV.cell;
    NAV.x0 = b.minX - 1; NAV.z0 = b.minZ - 1;
    NAV.w = Math.ceil((b.maxX - b.minX + 2) / c); NAV.h = Math.ceil((b.maxZ - b.minZ + 2) / c);
    const N = NAV.w * NAV.h;
    NAV.blocked = new Uint8Array(N); NAV.g = new Float32Array(N); NAV.from = new Int32Array(N); NAV.stamp = new Int32Array(N);
    const R = 0.62;   // player radius + a margin
    for (let j = 0; j < NAV.h; j++) for (let i = 0; i < NAV.w; i++) {
      const x = NAV.x0 + (i + 0.5) * c, z = NAV.z0 + (j + 0.5) * c;
      let hit = x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ;
      for (let s = 0; s < stations.length && !hit; s++) {
        const st = stations[s];
        if (!st.active || !st.blockers) continue;
        for (const o of st.blockers) {
          if (o.r !== undefined) { if (Math.hypot(x - o.x, z - o.z) < o.r + R) { hit = true; break; } }
          else if (Math.abs(x - o.x) < o.hx + R && Math.abs(z - o.z) < o.hz + R) { hit = true; break; }
        }
      }
      NAV.blocked[j * NAV.w + i] = hit ? 1 : 0;
    }
    NAV.n = G.stations.activationOrder.length;
    NAV.bx = b.maxX; NAV.bz = b.maxZ;
  }
  const navCell = (x, z) => { const i = Math.max(0, Math.min(NAV.w - 1, Math.floor((x - NAV.x0) / NAV.cell))), j = Math.max(0, Math.min(NAV.h - 1, Math.floor((z - NAV.z0) / NAV.cell))); return j * NAV.w + i; };
  function navFree(idx) {
    // nearest free cell to idx (ring search)
    if (!NAV.blocked[idx]) return idx;
    const ci = idx % NAV.w, cj = (idx / NAV.w) | 0;
    for (let r = 1; r < 14; r++) {
      let best = -1, bd = Infinity;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h || NAV.blocked[j * NAV.w + i]) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = j * NAV.w + i; }
      }
      if (best >= 0) return best;
    }
    return idx;
  }
  function navClear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (NAV.cell * 0.5)));
    for (let k = 0; k <= n; k++) if (NAV.blocked[navCell(ax + (bx - ax) * k / n, az + (bz - az) * k / n)]) return false;
    return true;
  }
  /** next point to walk to on the way to (tx, tz), or null to go straight */
  function navNext(px, pz, tx, tz) {
    const b = G.world.bounds;
    if (NAV.n !== G.stations.activationOrder.length || NAV.bx !== b.maxX || NAV.bz !== b.maxZ) navBuild();
    if (navClear(px, pz, tx, tz)) return null;
    const key = Math.round(tx * 2) + ',' + Math.round(tz * 2);
    if (key !== NAV.key || simT - NAV.at > 0.7 || !NAV.path.length) {
      NAV.key = key; NAV.at = simT; NAV.path.length = 0;
      const W = NAV.w, start = navFree(navCell(px, pz)), goal = navFree(navCell(tx, tz));
      const tick = ++NAV.tick, open = [start];
      NAV.g[start] = 0; NAV.from[start] = -1; NAV.stamp[start] = tick;
      const gi = goal % W, gj = (goal / W) | 0;
      const hOf = (c) => Math.hypot((c % W) - gi, ((c / W) | 0) - gj);
      let found = false, guard = 20000;
      while (open.length && guard-- > 0) {
        let bi = 0, bf = Infinity;
        for (let k = 0; k < open.length; k++) { const f = NAV.g[open[k]] + hOf(open[k]); if (f < bf) { bf = f; bi = k; } }
        const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
        if (cur === goal) { found = true; break; }
        const ci = cur % W, cj = (cur / W) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= W || j >= NAV.h) continue;
          const nb = j * W + i;
          if (NAV.blocked[nb]) continue;
          if (di && dj && (NAV.blocked[cj * W + i] || NAV.blocked[j * W + ci])) continue;   // no corner cutting
          const ng = NAV.g[cur] + (di && dj ? 1.414 : 1);
          if (NAV.stamp[nb] === tick && ng >= NAV.g[nb]) continue;
          const fresh = NAV.stamp[nb] !== tick;
          NAV.g[nb] = ng; NAV.from[nb] = cur; NAV.stamp[nb] = tick;
          if (fresh) open.push(nb); else if (open.indexOf(nb) < 0) open.push(nb);
        }
      }
      if (found) for (let c = goal; c >= 0 && c !== start; c = NAV.from[c]) NAV.path.push(c);
    }
    // walk to the furthest path cell that is in a straight clear line from here
    const P = NAV.path;
    for (let k = 0; k < P.length; k++) {
      const x = NAV.x0 + ((P[k] % NAV.w) + 0.5) * NAV.cell, z = NAV.z0 + (((P[k] / NAV.w) | 0) + 0.5) * NAV.cell;
      if (navClear(px, pz, x, z)) return { x, z };
    }
    if (P.length) { const c = P[P.length - 1]; return { x: NAV.x0 + ((c % NAV.w) + 0.5) * NAV.cell, z: NAV.z0 + (((c / NAV.w) | 0) + 0.5) * NAV.cell }; }
    return null;
  }

  function walkInput(tx, tz, arrive) {
    const p = pl().pos;
    const fd = Math.hypot(tx - p.x, tz - p.z);
    if (fd < arrive) return { x: 0, y: 0, d: fd };
    const wp = CHAIN ? navNext(p.x, p.z, tx, tz) : waypoint(p.x, p.z, tx, tz);
    let gx = tx, gz = tz, m0 = 1.5;
    if (wp) { gx = wp.x; gz = wp.z; m0 = 20; }
    const dx = gx - p.x, dz = gz - p.z;
    const d = Math.hypot(dx, dz) || 1e-6;
    const m = Math.min(1, d * m0);
    return { x: ((-dx + dz) * S2 / d) * m, y: ((dx + dz) * S2 / d) * m, d: fd };
  }

  function lowHere() {
    // is the harvest area we are working nearly empty?
    const p = pl().pos;
    for (const s of active('harvest')) {
      const b = s.harvest.bounds;
      if (p.x > b.minX - 4 && p.x < b.maxX + 4 && p.z > b.minZ - 4 && p.z < b.maxZ + 4) {
        if (s.harvest.available < s.harvest.total * 0.15) return true;
      }
    }
    return false;
  }

  function anyGrown() {
    for (const s of active('harvest')) if (s.harvest.available > 0) return true;
    return false;
  }

  // nearest drop zone that accepts something we carry
  function dropTarget() {
    const p = pl().pos;
    const st = pl().stack;
    let best = null, bd = Infinity;
    for (const s of active('drop')) {
      if (!st.has(s.drop.accepts) || s.drop.room() <= 0) continue;
      const z = s.drop.zone;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // harvest stations ordered by item value, most valuable first
  function harvestByValue() {
    return active('harvest').sort((a, b) => ((getItem(b.harvest.kind) || {}).value || 0) - ((getItem(a.harvest.kind) || {}).value || 0));
  }
  const tmp = { x: 0, z: 0 };

  // ------------------------------------------------------------ state machine
  // act = { kind, key, x, z, arrive, farm, padId, since }
  let act = null;
  let pendingAct = null;
  let pauseLeft = 0;
  let steps = 0;
  let simT = 0;
  let thrillSince = -1, thrillId = '';
  let nextSample = SAMPLE_EVERY;
  let lastEarned = state.earned;

  // ---- chained production (world.autoplay = { chain: true }): scrap -> cells -> packs -> ...
  // Deliver what is carried before gathering more, and prefer picking up the most processed goods.
  const CHAIN = !!(G.world.autoplay && G.world.autoplay.chain);
  const roomOf = (d, kind) => (d.drop.roomFor ? d.drop.roomFor(kind) : d.drop.room());
  // newer stations matter more: a station's priority is its place in the order the stations opened
  const prio = (s) => { const i = G.stations.activationOrder.indexOf(s.id); return i < 0 ? 0 : i; };
  const kindsCarried = () => { const seen = {}; const it = pl().stack.items; for (let i = 0; i < it.length; i++) seen[it[i]] = (seen[it[i]] || 0) + 1; return seen; };
  /** how many carried items station d would take right now */
  function deliverable(d, carriedKinds) {
    let n = 0;
    for (const k in carriedKinds) {
      if (!d.drop.accepts(k)) continue;
      const r = roomOf(d, k);
      if (r > 0) n += Math.min(r, carriedKinds[k]);
    }
    return n;
  }
  function chainDrop() {
    // the drop zone that takes the most of what is carried; the newer station on a tie, then the nearest
    const p = pl().pos, ck = kindsCarried();
    let best = null, bs = -Infinity;
    for (const s of active('drop')) {
      const n = deliverable(s, ck);
      if (n <= 0) continue;
      const z = s.drop.zone, d = Math.hypot(z.x - p.x, z.z - p.z);
      const score = n * 2 + prio(s) * 0.5 - d * 0.15;
      if (score > bs) { best = s; bs = score; }
    }
    return best;
  }
  function chainPickup(minAvail) {
    // a pickup holding goods some other open drop zone has room for: feed the newest station first, then the nearest
    const p = pl().pos;
    let best = null, bs = -Infinity;
    for (const s of active('pickup')) {
      const pk = s.pickup;
      if (!(pk.available >= minAvail)) continue;
      let val = -1;
      for (const d of active('drop')) {
        if (d === s) continue;
        for (const it of G.world.items) {
          if (!d.drop.accepts(it.id) || !(pk.count ? pk.count(it.id) > 0 : pk.has && pk.has((k) => k === it.id))) continue;
          if (roomOf(d, it.id) <= 0) continue;
          val = Math.max(val, prio(d));
        }
      }
      if (val < 0) continue;
      const z = pk.zone;
      const score = val * 3 + Math.min(pk.available, G.stats.capacity) * 0.3 - Math.hypot(z.x - p.x, z.z - p.z) * 0.5;
      if (score > bs) { bs = score; best = s; }
    }
    if (!best) return null;
    const z = best.pickup.zone;
    return { kind: 'pickup', key: 'pickup:' + best.id, x: z.x, z: z.z, arrive: Math.min(0.6, z.r * 0.5), st: best };
  }
  function chooseChain() {
    const p = pl().pos;
    const money = state.money;
    const np = nextPad();
    const rem = np ? remainingCost(np) : Infinity;
    if (np && money >= rem) return { kind: 'buy', key: 'buy:' + np.id, x: np.pos.x, z: np.pos.z, arrive: 0.25, padId: np.id };
    const cap = G.stats.capacity, c = carried();
    // cash worth a detour
    const missing = np ? Math.max(0, rem - money) : Infinity;
    let bestS = null, bestScore = -1;
    for (const s of active('cash')) {
      const cash = s.cash.amount;
      if (cash < 5 || !(cash >= 0.2 * missing || !np)) continue;
      const pile = s.cash.pile;
      const score = cash / (5 + Math.hypot(pile.x - p.x, pile.z - p.z));
      if (score > bestScore) { bestScore = score; bestS = s; }
    }
    if (bestS) { const pile = bestS.cash.pile; return { kind: 'cash', key: 'cash:' + bestS.id, x: pile.x, z: pile.z, arrive: 0.6, st: bestS }; }
    // carrying: deliver, unless still filling up in a harvest area
    if (c > 0) {
      const s = chainDrop();
      const filling = c < cap - 0.5 && anyGrown() && act && act.kind === 'cut';
      if (s && !filling) { const z = s.drop.zone; return { kind: 'sell', key: 'sell:' + s.id, x: z.x, z: z.z, arrive: 0.5, st: s }; }
    }
    if (c < cap - 0.5) {
      const pk = chainPickup(c > 0 ? 3 : 1);
      if (pk) return pk;
      for (const s of harvestByValue()) {
        if (s.harvest.nearest(p.x, p.z, tmp)) return { kind: 'cut', key: 'cut:' + s.id, x: tmp.x, z: tmp.z, arrive: 0.15, st: s };
      }
    }
    if (c > 0) { const s = chainDrop(); if (s) { const z = s.drop.zone; return { kind: 'sell', key: 'sell:' + s.id, x: z.x, z: z.z, arrive: 0.5, st: s }; } }
    return null;
  }

  // an event that wants the player somewhere (prize gates, the pig): engine/thrills
  function thrillTarget() {
    const t = G.thrills && G.thrills.target ? G.thrills.target() : null;
    if (!t) { thrillSince = -1; return null; }
    if (thrillSince < 0 || thrillId !== t.id) { thrillSince = simT; thrillId = t.id; }
    if (simT - thrillSince > 14) return null;            // out of reach: carry on with the job
    return { kind: 'thrill', key: 'thrill:' + t.id, x: t.x, z: t.z, arrive: 0.2 };
  }

  function choose() {
    if (CHAIN) return chooseChain();
    const p = pl().pos;
    const money = state.money;
    const np = nextPad();
    const rem = np ? remainingCost(np) : Infinity;

    // 1. affordable pad
    if (np && money >= rem) {
      return { kind: 'buy', key: 'buy:' + np.id, x: np.pos.x, z: np.pos.z, arrive: 0.25, padId: np.id };
    }

    const cap = G.stats.capacity;
    const c = carried();

    // 2. sell
    if (c > 0 && (c >= cap - 0.5 || (c >= cap * 0.6 && lowHere()) || (!anyGrown() && c >= 1))) {
      const s = dropTarget();
      if (s) {
        const z = s.drop.zone;
        return { kind: 'sell', key: 'sell:' + s.id, x: z.x, z: z.z, arrive: 0.5, st: s };
      }
    }

    // 3. cash piles
    const missing = np ? Math.max(0, rem - money) : Infinity;
    let bestS = null, bestScore = -1;
    for (const s of active('cash')) {
      const cash = s.cash.amount;
      if (cash < 1) continue;
      const enough = cash >= 0.25 * missing || cash >= missing || (!np);
      if (!(enough && cash >= 5)) continue;
      const pile = s.cash.pile;
      const score = cash / (5 + Math.hypot(pile.x - p.x, pile.z - p.z));
      if (score > bestScore) { bestScore = score; bestS = s; }
    }
    if (bestS) {
      const pile = bestS.cash.pile;
      return { kind: 'cash', key: 'cash:' + bestS.id, x: pile.x, z: pile.z, arrive: 0.6, st: bestS };
    }

    // 3b. pickup zones (piles, machine outputs) and serve zones (checkouts), see docs/STATIONS.md
    const order = harvestByValue();
    let grown = false;
    for (const s of order) if (s.harvest.available > 0) { grown = true; break; }
    const pk = pickupTarget(grown ? Math.min(6, Math.ceil(cap * 0.5)) : 1, true);
    if (pk) return pk;
    for (const s of active('serve')) {
      const sv = s.serve;
      if (sv.staffed || sv.waiting < 2) continue;
      return { kind: 'serve', key: 'serve:' + s.id, x: sv.zone.x, z: sv.zone.z, arrive: 0.4, st: s };
    }
    const pk2 = pickupTarget(grown ? Math.min(6, Math.ceil(cap * 0.5)) : 1, false);
    if (pk2) return pk2;

    // 4. harvest in the most valuable area that has something grown
    for (const s of order) {
      if (s.harvest.nearest(p.x, p.z, tmp)) return { kind: 'cut', key: 'cut:' + s.id, x: tmp.x, z: tmp.z, arrive: 0.15, st: s };
    }
    if (!order.length) return null;
    // nothing grown anywhere: wait at the edge of the best area (or just stay if close)
    const s = order[0];
    const b = s.harvest.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const inside = p.x > b.minX - 1 && p.x < b.maxX + 1 && p.z > b.minZ - 1 && p.z < b.maxZ + 1;
    if (inside) return { kind: 'wait', key: 'wait:' + s.id, x: p.x, z: p.z, arrive: 99, st: s };
    return { kind: 'cut', key: 'cutwalk:' + s.id, x: cx, z: cz, arrive: 0.5, st: s };
  }

  // a pickup zone worth visiting: has >= minAvail items some other open drop zone takes now.
  // urgent: only for drop zones with a high `need` (an empty shelf or trough)
  function pickupTarget(minAvail, urgent) {
    if (carried() >= G.stats.capacity) return null;
    for (const s of active('pickup')) {
      const pk = s.pickup;
      if (!(pk.available >= minAvail) || (pk.idleHint === false && !urgent)) continue;
      let wanted = false;
      for (const d of active('drop')) {
        if (d === s || d.drop.room() <= 0) continue;
        if (urgent && !(d.drop.need >= 0.75)) continue;
        if (pk.has ? pk.has(d.drop.accepts) : true) { wanted = true; break; }
      }
      if (!wanted) continue;
      const z = pk.zone;
      return { kind: 'pickup', key: 'pickup:' + s.id, x: z.x, z: z.z, arrive: Math.min(0.6, z.r * 0.5), st: s };
    }
    return null;
  }

  // is the current action still worth continuing? (finish before switching)
  function stillValid() {
    if (!act) return false;
    switch (act.kind) {
      case 'buy': {
        if (state.done[act.padId]) return false;
        const pad = G.pads.get(act.padId);
        return pad && (state.money >= remainingCost(pad) || (state.paid[act.padId] || 0) > 0 && state.money > 0 && inside(pad.pos, PAD_RADIUS));
      }
      case 'sell': {
        const s = act.st;
        if (CHAIN) return carried() > 0 && deliverable(s, kindsCarried()) > 0;
        if (carried() > 0 && pl().stack.has(s.drop.accepts) && s.drop.room() > 0) return true;
        // emptied; without a cashier keep standing until the counter is sold out
        const staff = G.stats.staff[s.id];
        if (s.cash && !(staff && staff.cashier) && s.stock > 0 && simT - act.since < 90 && inZone(act)) return true;
        return false;
      }
      case 'cash': {
        if (act.st.cash.amount >= 1 && (!act.arrivedAt || simT - act.arrivedAt < 1.5)) return true;
        return false;
      }
      case 'pickup': {
        const pk = act.st.pickup;
        // the player only takes what open drop zones still have room for: once nothing more
        // arrives for a moment, move on instead of waiting out the 4 s
        const c = carried();
        if (act.lastCarried !== c) { act.lastCarried = c; act.lastGain = simT; }
        if (act.arrivedAt && simT - Math.max(act.arrivedAt, act.lastGain) > 0.6) return false;
        return pl().stack.room > 0 && pk.available > 0 && (!act.arrivedAt || simT - act.arrivedAt < 4);
      }
      case 'serve': {
        const sv = act.st.serve;
        return !sv.staffed && sv.waiting > 0 && simT - act.since < 15;
      }
      case 'thrill':
      case 'cut':
      case 'wait':
        return false; // always re-evaluated
    }
    return false;
  }
  function inside(pos, r) {
    const p = pl().pos;
    return Math.hypot(p.x - pos.x, p.z - pos.z) <= r;
  }
  function inZone(a) {
    const p = pl().pos;
    return Math.hypot(p.x - a.x, p.z - a.z) <= 1.7;
  }

  function decide() {
    let cand;
    const th = thrillTarget();
    if (th) {
      cand = th;   // a prize gate or the pig comes first, like for a player
    } else if (stillValid()) {
      cand = null; // keep
    } else {
      cand = choose();
    }
    if (!cand) return;
    if (act && cand.key === act.key) {
      // same action: refresh target (e.g. nearest flower moves)
      act.x = cand.x; act.z = cand.z; pendingAct = null;
      return;
    }
    // cut→cut across a changing target within the same farm is the same action (keys equal), handled above
    if (act && act.kind === 'cut' && cand.kind === 'cut' && act.st === cand.st) {
      act.x = cand.x; act.z = cand.z; pendingAct = null;
      return;
    }
    // change of action: reaction pause (a pause already running is not restarted)
    cand.since = simT;
    if (pendingAct) { pendingAct = cand; return; }
    pendingAct = cand;
    pauseLeft = act ? REACTION : 0.0;
    if (!act) { act = cand; pendingAct = null; }
    else { ap.action = cand.kind; }
  }

  // stuck detection
  let wPos = null, wT = 0, wWalking = true, stuckCount = 0, nudgeLeft = 0, nudgeDir = 1;

  function drive() {
    const out = { x: 0, y: 0 };
    const p = pl().pos;
    if (pendingAct) {
      pauseLeft -= STEP;
      wWalking = false;
      if (pauseLeft <= 0) { act = pendingAct; pendingAct = null; }
      return out;
    }
    if (!act) return out;
    ap.action = act.kind;
    if (act.kind === 'wait') { wWalking = false; return out; }
    const w = walkInput(act.x, act.z, act.arrive);
    if (w.d < act.arrive) {
      if (act.arrivedAt === undefined) act.arrivedAt = simT;
      wWalking = false;
      return out;
    }
    if (w.d < 1.2) wWalking = false; // short hops are not "walking" for stuck purposes
    if (nudgeLeft > 0) {
      nudgeLeft -= STEP;
      // sideways nudge: rotate the heading by 90 degrees
      const nx = -w.y * nudgeDir, ny = w.x * nudgeDir;
      return { x: nx, y: ny };
    }
    out.x = w.x; out.y = w.y;
    return out;
  }

  function stuckCheck() {
    if (!wPos) { wPos = { x: pl().pos.x, z: pl().pos.z }; wT = simT; wWalking = true; return; }
    if (simT - wT >= 8) {
      const p = pl().pos;
      const moved = Math.hypot(p.x - wPos.x, p.z - wPos.z);
      if (wWalking && act && !pendingAct && moved < 0.5) {
        stuckCount++;
        push({ t: T1(), event: 'stuck', action: act.kind, pos: [+p.x.toFixed(1), +p.z.toFixed(1)], target: [+act.x.toFixed(1), +act.z.toFixed(1)] });
        nudgeLeft = 0.7; nudgeDir = stuckCount % 2 ? 1 : -1;
        if (stuckCount >= 5) ap.stuck = true;
      } else if (moved >= 0.5) { stuckCount = 0; }
      wPos = { x: p.x, z: p.z }; wT = simT; wWalking = true;
    }
  }

  // ------------------------------------------------------------ gate run (engine/run)
  // The bot steers a run with G.run.botSteer(), presses CONTINUE on the result card, and starts each
  // level once when it unlocks, so a full playthrough exercises the mode. ap.noRuns = true stops the starting.
  const runTried = {};
  G.events.on('run:done', (e) => push({ t: T1(), event: 'run', level: e.level, stars: e.stars, count: e.count, cash: e.cash }));
  function runBot() {
    const R = G.run;
    if (!R) return false;
    if (R.active) {
      if (G.modes && G.modes.result) G.modes.pressContinue();
      G.input.override = { x: R.botSteer(), y: 0 };
      wPos = null;                              // the world stood still meanwhile: that is not being stuck
      return true;
    }
    if (steps % 90 === 0 && !ap.noRuns && !(G.reveal && G.reveal.active) && !(G.stats.won && !state.won)) {
      for (const l of R.levels()) {
        if (!l.unlocked || runTried[l.n]) continue;
        if (state.won && G.hud && G.hud.hideWin) G.hud.hideWin();
        if (R.start(l.n)) runTried[l.n] = true;
        break;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ hook
  function tick() {
    if (!G.player || !G.player.stack || !G.stations) return;
    simT += STEP;
    steps++;
    if (ap.hold) { G.input.override = { x: 0, y: 0 }; return; } // set by the playtest runner for screenshots
    if (runBot()) return;
    if (steps % DECIDE_EVERY === 1) decide();
    stuckCheck();
    G.input.override = drive();

    if (simT >= nextSample) {
      nextSample += SAMPLE_EVERY;
      const earned = state.earned;
      push({
        t: T1(), event: 'sample', money: Math.floor(state.money), earned: Math.floor(earned),
        incomePerSec: Math.round(((earned - lastEarned) / SAMPLE_EVERY) * 10) / 10,
        carried: carried(), action: act ? act.kind : 'none',
      });
      lastEarned = earned;
    }
  }

  const orig = G.input.update;
  G.input.update = function () {
    try { tick(); } catch (err) { console.error('[autoplay] tick failed', err); }
    return orig.apply(this, arguments);
  };
  G.input.override = { x: 0, y: 0 };
}
