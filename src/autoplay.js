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

  function walkInput(tx, tz, arrive) {
    const p = pl().pos;
    const fd = Math.hypot(tx - p.x, tz - p.z);
    if (fd < arrive) return { x: 0, y: 0, d: fd };
    const wp = waypoint(p.x, p.z, tx, tz);
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
      if (!st.has(s.drop.accepts)) continue;
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
  let nextSample = SAMPLE_EVERY;
  let lastEarned = state.earned;

  function choose() {
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

    // 4. harvest in the most valuable area that has something grown
    const order = harvestByValue();
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
        if (carried() > 0 && pl().stack.has(s.drop.accepts)) return true;
        // emptied; without a cashier keep standing until the counter is sold out
        const staff = G.stats.staff[s.id];
        if (!(staff && staff.cashier) && s.stock > 0 && simT - act.since < 90 && inZone(act)) return true;
        return false;
      }
      case 'cash': {
        if (act.st.cash.amount >= 1 && (!act.arrivedAt || simT - act.arrivedAt < 1.5)) return true;
        return false;
      }
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
    if (stillValid()) {
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

  // ------------------------------------------------------------ hook
  function tick() {
    if (!G.player || !G.player.stack || !G.stations) return;
    simT += STEP;
    steps++;
    if (ap.hold) { G.input.override = { x: 0, y: 0 }; return; } // set by the playtest runner for screenshots
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
