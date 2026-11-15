// Bloom Rush — autoplay bot. Plays like a competent human through G.input.override only.
// Driven by simulation steps (wraps G.input.update, which runs once per fixed step).

const STEP = 1 / 60;
const DECIDE_EVERY = 15;      // steps between decisions (~4 per sim-second)
const REACTION = 0.25;        // sim seconds of standing still before changing action
const SAMPLE_EVERY = 15;      // sim seconds
const S2 = Math.SQRT1_2;

export function startAutoplay(G) {
  const { FARMS, FLOWERS, PADS, PLAYER, PAD } = G.cfg;
  const state = G.state;
  const ap = (window.__autoplay = { log: [], done: false, stuck: false, action: 'init' });

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
  const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);

  function remainingCost(pad) { return pad.cost - (state.paid[pad.id] || 0); }

  function nextPad() { return G.pads && G.pads.next ? G.pads.next() : null; }

  function walkInput(tx, tz, arrive) {
    const p = pl().pos;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < arrive) return { x: 0, y: 0, d };
    const m = Math.min(1, d * 1.5);
    return { x: ((-dx + dz) * S2 / d) * m, y: ((dx + dz) * S2 / d) * m, d };
  }

  function bedLowHere() {
    // is the bed we are working nearly empty?
    const p = pl().pos;
    for (let f = 0; f < FARMS.length; f++) {
      const fl = G.fields.get(f);
      if (!fl || !fl.active) continue;
      const b = fl.bounds;
      if (p.x > b.minX - 4 && p.x < b.maxX + 4 && p.z > b.minZ - 4 && p.z < b.maxZ + 4) {
        if (fl.grownCount < fl.total * 0.15) return true;
      }
    }
    return false;
  }

  function anyGrown() {
    for (let f = 0; f < FARMS.length; f++) {
      const fl = G.fields.get(f);
      if (fl && fl.active && fl.grownCount > 0) return true;
    }
    return false;
  }

  function sellFarmIdx() {
    const p = pl().pos;
    let best = -1, bd = Infinity;
    for (let f = 0; f < FARMS.length; f++) {
      if (!G.stats.farms[f]) continue;
      const z = FARMS[f].sellZone;
      const d = Math.hypot(z.x - p.x, z.z - p.z);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }

  // farms ordered by flower price, most valuable first
  function farmsByValue() {
    const list = [];
    for (let f = 0; f < FARMS.length; f++) if (G.stats.farms[f]) list.push(f);
    list.sort((a, b) => FLOWERS[FARMS[b].flower].price - FLOWERS[FARMS[a].flower].price);
    return list;
  }

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
    if (c > 0 && (c >= cap - 0.5 || (c >= cap * 0.6 && bedLowHere()) || (!anyGrown() && c >= 1))) {
      const f = sellFarmIdx();
      const z = FARMS[f].sellZone;
      return { kind: 'sell', key: 'sell:' + f, x: z.x, z: z.z, arrive: 0.5, farm: f };
    }

    // 3. cash piles
    const missing = np ? Math.max(0, rem - money) : Infinity;
    let bestF = -1, bestScore = -1;
    for (let f = 0; f < FARMS.length; f++) {
      if (!G.stats.farms[f]) continue;
      const sh = G.shops.get(f);
      if (!sh || !sh.active) continue;
      const cash = sh.cash;
      if (cash < 1) continue;
      const enough = cash >= 0.25 * missing || cash >= missing || (!np);
      const worth = enough && cash >= 5;
      if (!worth) continue;
      const pile = FARMS[f].cashPile;
      const score = cash / (5 + Math.hypot(pile.x - p.x, pile.z - p.z));
      if (score > bestScore) { bestScore = score; bestF = f; }
    }
    if (bestF >= 0) {
      const pile = FARMS[bestF].cashPile;
      return { kind: 'cash', key: 'cash:' + bestF, x: pile.x, z: pile.z, arrive: 0.6, farm: bestF };
    }

    // 4. cut flowers in the most valuable farm that has something grown
    const order = farmsByValue();
    for (const f of order) {
      const fl = G.fields.get(f);
      if (!fl || !fl.active) continue;
      const g = fl.nearestGrown(p.x, p.z);
      if (g) return { kind: 'cut', key: 'cut:' + f, x: g.x, z: g.z, arrive: 0.15, farm: f };
    }
    // nothing grown anywhere: wait at the edge of the best bed (or just stay if close)
    const f = order[0];
    const b = FARMS[f].bed;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const inside = p.x > b.minX - 1 && p.x < b.maxX + 1 && p.z > b.minZ - 1 && p.z < b.maxZ + 1;
    if (inside) return { kind: 'wait', key: 'wait:' + f, x: p.x, z: p.z, arrive: 99, farm: f };
    return { kind: 'cut', key: 'cutwalk:' + f, x: cx, z: cz, arrive: 0.5, farm: f };
  }

  // is the current action still worth continuing? (finish before switching)
  function stillValid() {
    if (!act) return false;
    const np = nextPad();
    switch (act.kind) {
      case 'buy': {
        if (state.done[act.padId]) return false;
        const pad = PADS.find((q) => q.id === act.padId);
        return pad && (state.money >= remainingCost(pad) || (state.paid[act.padId] || 0) > 0 && state.money > 0 && inside(pad.pos, PAD.radius));
      }
      case 'sell': {
        const sh = G.shops.get(act.farm);
        const c = carried();
        if (c > 0) return true;
        // emptied; without cashier keep standing until the counter is sold out
        if (!G.stats.cashier[act.farm] && sh.stock > 0 && simT - act.since < 90 && inZone(act)) return true;
        return false;
      }
      case 'cash': {
        const sh = G.shops.get(act.farm);
        if (sh.cash >= 1 && (!act.arrivedAt || simT - act.arrivedAt < 1.5)) return true;
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
      act.x = cand.x; act.z = cand.z;
      return;
    }
    // cut→cut across a changing target within the same farm is the same action (keys equal), handled above
    if (act && act.kind === 'cut' && cand.kind === 'cut' && act.farm === cand.farm) {
      act.x = cand.x; act.z = cand.z;
      return;
    }
    // change of action: reaction pause
    cand.since = simT;
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
    if (!G.player || !G.player.stack || !G.shops || !G.fields) return;
    simT += STEP;
    steps++;
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
