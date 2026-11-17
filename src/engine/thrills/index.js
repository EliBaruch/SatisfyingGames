// Thrills: the layer of surprises, short goals and choices on top of the collect-sell-buy loop.
// It works in every world because it only uses station capabilities, pads and G.stats.
//
//   fever        a meter that fills while the player works; when full, sales pay double and
//                everyone runs faster for a few seconds
//   lucky drop   a crate parachutes in and opens into two gates: run through the prize you want
//   rush order   deliver N of something (or collect cash) before the clock runs out
//   coin rush    a trail of coins: grab them all before they fade
//   piggy bank   a golden pig runs away; catch it
//   flash sale   two gates with price tags: buy a perk or a boost with the money in hand, or pass
//   VIP escort   someone special waves from a little way off: touch them and lead them to the flag
//   stars        orders, coin trails, pigs, some gates and every big purchase give a star; three
//                stars open the perk gates, where one of two permanent perks for this world is
//                picked (perks.js)
//   full load    handing in a full stack in one go pays a tip
//
// Nothing here can take anything away from the player, and nothing opens a dialog: every choice
// is made by walking. One event runs at a time (the director below), and only while the player
// is actually playing. Rewards scale with the cheapest price pad and the recent income.
//
// State: levels.<world>.thrills (see loadState). Off with ?nothrills or world.thrills = { off: true };
// world.thrills may also override anything in TUNE.
import * as THREE from 'three';
import { fmtMoney } from '../config.js';
import { itemValue } from '../items.js';
import { createSpots } from './spots.js';
import { createGates } from './gates.js';
import { createThrillUi } from './ui.js';
import { perkTotals, freshTotals, sanitizePerks, offerPerks, perkById, perkLine } from './perks.js';
import { createDrop } from './drop.js';
import { createOrders } from './orders.js';
import { createPiggy } from './piggy.js';
import { createCoins } from './coins.js';
import { createDeal } from './deal.js';
import { createEscort } from './escort.js';
import { createSwoosh } from './swoosh.js';

export const TUNE = {
  firstAt: 45,            // seconds of play in a world before the first event
  firstPads: 1,           // ... and this many pads bought
  gap: [32, 52],          // seconds between the end of one event and the next
  events: { drop: 4, order: 4, coins: 3, pig: 2, deal: 2, escort: 2 },   // how often each is picked (0 = never)
  starsPerPerk: 3,
  // fever
  feverFill: 62,          // seconds of steady work to fill the meter
  feverTime: 12,
  feverPrice: 2,
  feverSpeed: 1.2,
  feverCrew: 1.3,
  // boosts from gates
  turboTime: 25, turboSpeed: 1.45,
  crewTime: 25, crewSpeed: 1.8,
  // rewards, in units of unit(): max(floor, share of the cheapest pad, seconds of income)
  unitFloor: 15, unitPad: 0.2, unitIncome: 12,
  dropCash: 1, jackpot: 5, orderPay: 1.5, pigPay: 2,
  fullLoadTip: 0.12, fullLoadAt: 0.9,
  dropTtl: 20,
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function loadState(raw) {
  const s = isObj(raw) ? raw : {};
  const count = isObj(s.count) ? s.count : {};
  const won = isObj(s.won) ? s.won : {};
  return {
    v: 1,
    seed: isNum(s.seed) ? s.seed | 0 : (Math.random() * 0x7fffffff) | 0,
    stars: isNum(s.stars) && s.stars > 0 ? Math.min(99, Math.floor(s.stars)) : 0,
    perks: sanitizePerks(s.perks),
    pending: Array.isArray(s.pending) ? s.pending.filter((id) => typeof id === 'string' && perkById(id)).slice(0, 2) : null,
    next: isNum(s.next) ? Math.max(0, Math.min(600, s.next)) : -1,
    fever: isNum(s.fever) ? Math.max(0, Math.min(1, s.fever)) : 0,
    last: typeof s.last === 'string' ? s.last : '',
    rate: isNum(s.rate) && s.rate > 0 ? Math.min(1e9, s.rate) : 0,
    turbo: isNum(s.turbo) ? Math.max(0, Math.min(120, s.turbo)) : 0,          // seconds of boost / fever left
    crew: isNum(s.crew) ? Math.max(0, Math.min(120, s.crew)) : 0,
    feverLeft: isNum(s.feverLeft) ? Math.max(0, Math.min(60, s.feverLeft)) : 0,
    won: { order: won.order | 0, pig: won.pig | 0, coins: won.coins | 0, escort: won.escort | 0 },   // events finished (count = started)
    tips: isObj(s.tips) ? s.tips : {},
    count: {
      drop: count.drop | 0, order: count.order | 0, pig: count.pig | 0, coins: count.coins | 0, deal: count.deal | 0, escort: count.escort | 0,
      jackpot: count.jackpot | 0, perk: count.perk | 0, fever: count.fever | 0, load: count.load | 0,
    },
  };
}

export function createThrills(G) {
  const W = isObj(G.world.thrills) ? G.world.thrills : {};
  const T = { ...TUNE, ...W, events: { ...TUNE.events, ...(W.events || {}) } };
  const st = (G.state.thrills = loadState(G.state.thrills));
  const ui = createThrillUi(G);
  const spots = createSpots(G);
  const gates = createGates(G);
  const totals = perkTotals(st.perks, freshTotals());

  // deterministic stream kept in the save: the same save plays out the same way
  function rnd() {
    let t = (st.seed = (st.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // ------------------------------------------------------------------ stats overlay
  // G.stats is rebuilt from the pads; perks, boosts and fever are laid over it here.
  const base = { speed: 1, capacity: 1, priceMult: 1 };
  const B = { turbo: st.turbo, crew: st.crew };            // seconds left
  const F = { on: st.feverLeft > 0, left: st.feverLeft, charge: st.feverLeft > 0 ? 1 : st.fever, idle: 99, trail: 0, saleT: 0 };
  function write() {
    const s = G.stats;
    s.speed = base.speed * totals.speed * (B.turbo > 0 ? T.turboSpeed : F.on ? T.feverSpeed : 1);      // boosts do not stack
    s.capacity = Math.max(1, Math.round(base.capacity * totals.capacity));
    s.priceMult = base.priceMult * totals.price * (F.on ? T.feverPrice : 1);
    s.workerSpeed = totals.crew * (B.crew > 0 ? T.crewSpeed : F.on ? T.feverCrew : 1);
    s.reach = totals.reach;
    s.magnet = totals.magnet;
  }
  /** Called right after G.stats is recomputed (boot, purchases, perks from finished worlds). */
  function applyStats() {
    const s = G.stats;
    base.speed = s.speed; base.capacity = s.capacity; base.priceMult = s.priceMult;
    write();
  }
  applyStats();

  // ------------------------------------------------------------------ money
  // Bonus money is kept out of the income estimate, so rewards do not feed on themselves.
  const M = { bonus: 0, lastEarned: G.state.earned, rate: st.rate, t: 0, maxCost: 0 };
  const _p = new THREE.Vector3(), _from = new THREE.Vector3();
  const chest = (o) => (G.player ? o.set(G.player.pos.x, 1.2, G.player.pos.z) : o);
  const billOpts = { kind: 'cash', from: _from, to: chest, dur: 0.4, arc: 2.2, delay: 0, onDone: null };
  const payText = { color: '#ffe14d', size: 0.95, life: 1.4, maxW: 0.6 };
  const smallText = { color: '#ffe14d', size: 0.42, life: 0.8, maxW: 0.3 };
  /** Give bonus money. from {x, z}: bills fly from there to the player. */
  function pay(amount, from, label, small, quiet) {
    amount = Math.max(1, Math.round(amount));
    G.addMoney(amount);
    M.bonus += amount;
    const pl = G.player;
    if (!pl || !G.fx || quiet) return amount;
    if (from) {
      const n = small ? 3 : 10;
      for (let i = 0; i < n; i++) {
        _from.set(from.x + (Math.random() - 0.5) * 0.8, 0.8 + Math.random() * 0.8, from.z + (Math.random() - 0.5) * 0.8);
        billOpts.delay = i * 0.045;
        billOpts.dur = 0.36 + Math.random() * 0.12;
        G.fx.fly(billOpts);
      }
    }
    _p.set(pl.pos.x, small ? 3.1 : 2.9, pl.pos.z);
    G.fx.popText(_p, (label ? label + ' ' : '') + '+$' + fmtMoney(amount), small ? smallText : payText);
    return amount;
  }
  /** The reward unit: grows with the world so a prize always matters. */
  function unit() {
    let c = Infinity;
    const vis = G.pads && G.pads.visible ? G.pads.visible() : null;
    if (vis) for (let i = 0; i < vis.length; i++) if (vis[i].cost > 0 && vis[i].cost < c) c = vis[i].cost;
    if (c === Infinity) c = M.maxCost * 0.5;
    return Math.max(T.unitFloor, c * T.unitPad, M.rate * T.unitIncome);
  }
  /** Round to two significant digits (240, 1.3K, 18K). */
  function nice(n) {
    if (!(n > 0)) return 1;
    const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
    return Math.max(1, Math.round(n / p) * p);
  }
  for (const pad of G.world.pads || []) if (G.state.done[pad.id] && pad.cost > M.maxCost) M.maxCost = pad.cost;

  // ------------------------------------------------------------------ small helpers
  const play = (name, opts) => { if (G.audio && G.audio.play) G.audio.play(name, opts); };
  const toast = (text) => { if (G.hud && G.hud.toast) G.hud.toast(text); };
  /** A one-line explanation, shown the first two times a thing happens in a world. */
  function tip(key, text, seconds) {
    const n = st.tips[key] | 0;
    if (n >= 2) return;
    st.tips[key] = n + 1;
    ui.tip(text, seconds || 5);
  }
  // told to whoever keeps score (engine/progress): 'thrill' { kind }; the payload is reused
  const noteEv = { kind: '' };
  function note(kind) { noteEv.kind = kind; G.events.emit('thrill', noteEv); }
  const starText = { color: '#ffd23f', size: 0.8, life: 1.2, maxW: 0.5 };
  function addStar(n, x, z) {
    st.stars += n;
    note('star');
    ui.setStars(Math.min(T.starsPerPerk, st.stars));
    ui.starPop();
    play('star');
    if (G.fx && G.player) {
      _p.set(x ?? G.player.pos.x, 3.5, z ?? G.player.pos.z);
      G.fx.popText(_p, '+1 STAR', starText);
    }
    if (st.stars >= T.starsPerPerk) tip('stars', 'Three stars: perk gates are coming!', 4);
  }
  /** gates are sized for the default view; a closer camera (the factory's early stages) gets smaller ones */
  const gateScale = () => Math.max(0.6, Math.min(1.1, spots.viewScale()));
  function hasCrew() {
    const h = G.stats.hires;
    if (h) for (let i = 0; i < h.length; i++) if (h[i].role !== 'cashier' && h[i].role !== 'vendor') return true;
    return false;
  }
  function hasHarvest() {
    const l = G.stations.list;
    for (let i = 0; i < l.length; i++) if (l[i].active && l[i].harvest) return true;
    return false;
  }

  // ------------------------------------------------------------------ boosts
  function boost(id, seconds) {
    if (!(id in B)) return;
    const was = B[id] > 0;
    B[id] = Math.max(B[id], seconds);
    if (!was) write();
  }
  function updateBoosts(dt) {
    if (B.turbo > 0) { B.turbo -= dt; if (B.turbo <= 0) { B.turbo = 0; write(); } ui.setBoost('turbo', 'TURBO', B.turbo); }
    if (B.crew > 0) { B.crew -= dt; if (B.crew <= 0) { B.crew = 0; write(); } ui.setBoost('crew', 'CREW RUSH', B.crew); }
  }

  // ------------------------------------------------------------------ fever
  const TRAIL = { colors: [0xffe14d, 0xff9a2a, 0xffffff], count: 2, speed: 1.6, size: 0.12, life: 0.5, gravity: 2, up: 2.2 };
  const START_BURST = { colors: [0xffe14d, 0xff7a1a, 0xffffff], count: 40, speed: 7, size: 0.18, life: 0.8, gravity: 8, up: 5 };
  const x2Text = { color: '#ffb02e', size: 0.7, life: 0.8, maxW: 0.3 };
  const fever = {
    get on() { return F.on; },
    get charge() { return F.charge; },
    /** work the player just did; w = how much of the meter it is worth on top of the steady fill */
    work(w) { F.idle = 0; if (!F.on && w > 0) F.charge = Math.min(1, F.charge + w); },
    start() {
      if (F.on) { const full = T.feverTime + totals.feverTime; F.left = Math.min(full * 2, F.left + full); return; }
      F.on = true;
      F.left = T.feverTime + totals.feverTime;
      F.charge = 1;
      st.count.fever++;
      note('fever');
      write();
      toast('FEVER! SALES x2');
      tip('fever', 'Fever: everything sells for double. Sell now!', 5);
      play('fever');
      const pl = G.player;
      if (pl && G.fx) {
        _p.set(pl.pos.x, 0.6, pl.pos.z);
        G.fx.burst(_p, START_BURST);
        G.fx.ring(_p, { color: 0xffb02e, radius: 5, life: 0.7 });
        G.fx.shake(0.2, 0.25);
      }
    },
  };
  function endFever() {
    F.on = false; F.left = 0; F.charge = 0;
    write();
    play('feverEnd');
  }
  function updateFever(dt) {
    if (F.on) {
      F.left -= dt;
      F.trail -= dt;
      F.saleT -= dt;
      const pl = G.player;
      if (pl && F.trail <= 0 && G.fx) {
        F.trail = 0.06;
        _p.set(pl.pos.x - pl.vel.x * 0.05, 0.1, pl.pos.z - pl.vel.z * 0.05);
        G.fx.burst(_p, TRAIL);
      }
      if (F.left <= 0) endFever();
      ui.setFever(F.on ? Math.min(1, F.left / (T.feverTime + totals.feverTime)) : 0, F.on, F.left);
      return;
    }
    F.idle += dt;
    if (D.started) {
      if (F.idle < 2.5) F.charge += (dt / T.feverFill) * totals.feverFill;
      else if (F.idle > 9) F.charge = Math.max(0, F.charge - dt / 50);
      if (F.charge >= 1) { fever.start(); return; }
    }
    ui.setFever(F.charge, false, 0);
  }
  G.events.on('sale', (e) => {
    if (!F.on || F.saleT > 0 || !e || !e.station || !G.fx) return;
    F.saleT = 0.45;
    const s = e.station, c = s.cash ? s.cash.pile : s.pos;
    _p.set(c.x, 1.6, c.z);
    G.fx.popText(_p, 'x2', x2Text);
  });

  // ------------------------------------------------------------------ what the player does
  // Reported by engine/player.js: 'p:take' { kind }, 'p:deliver' { kind, station }, 'p:cash' { amount }.
  const L = { n: 0, value: 0, gap: 0 };       // the load being handed in
  G.events.on('p:take', () => fever.work(0));
  G.events.on('p:deliver', (e) => {
    fever.work(0);
    L.n++; L.value += itemValue(e.kind); L.gap = 0;
    orders.onDeliver(e.kind);
  });
  G.events.on('p:cash', (e) => { fever.work(0); orders.onCash(e.amount); });
  const loadText = { color: '#ffe14d', size: 0.74, life: 1.2, maxW: 0.62 };
  function updateLoad(dt) {
    if (L.n <= 0) return;
    L.gap += dt;
    if (L.gap < 0.7) return;
    if (D.started && L.n >= Math.max(8, G.stats.capacity * T.fullLoadAt)) {
      const tipAmt = Math.max(1, Math.round(L.value * base.priceMult * totals.price * T.fullLoadTip));
      G.addMoney(tipAmt);
      M.bonus += tipAmt;
      st.count.load++;
      note('load');
      fever.work(0.07);
      play('tip');
      const pl = G.player;
      if (pl && G.fx) {
        _p.set(pl.pos.x, 2.6, pl.pos.z);
        G.fx.popText(_p, 'FULL LOAD +$' + fmtMoney(tipAmt), loadText);
        _p.y = 0.2;
        G.fx.ring(_p, { color: 0xffe14d, radius: 2.4, life: 0.45 });
      }
      tip('load', 'Full stack in one go: bonus tip!', 4);
    }
    L.n = 0; L.value = 0;
  }

  // ------------------------------------------------------------------ events and the director
  const K = {
    G, T, st, ui, spots, gates, rnd, unit, nice, pay, addStar, boost, fever, totals, toast, tip, play, hasCrew, hasHarvest, gateScale,
    grantPerk,
    get rate() { return M.rate; },
    /** an order filled, a pig caught, a coin trail cleared */
    won(name) { st.won[name] = (st.won[name] | 0) + 1; note(name); },
    note,
  };
  const drop = createDrop(K);
  const orders = createOrders(K);
  const piggy = createPiggy(K);
  const coins = createCoins(K);
  const deal = createDeal(K);
  const escort = createEscort(K);
  const swoosh = createSwoosh(G);
  const EVENTS = { drop, order: orders, coins, pig: piggy, deal, escort };

  let doneCount = 0;
  for (const id in G.state.done) if (G.state.done[id]) doneCount++;
  const D = {
    started: false,
    next: st.next >= 0 ? st.next : 6,
    cur: null, curName: '',
    lastMove: 99,          // seconds since the player last moved (nothing starts on the title screen)
    perkWait: 0, perkFar: 0, perkFails: 0,
    saveT: 0,
  };
  G.events.on('unlock', (e) => {
    if (!e || !e.pad || e.repeat) return;
    doneCount++;
    if (e.pad.cost > M.maxCost) M.maxCost = e.pad.cost;
    // a purchase has its own moment (toast, camera glide): nothing else starts on top of it
    D.perkWait = Math.max(D.perkWait, e.pad.big ? 6 : 3);
    D.next = Math.max(D.next, e.pad.big ? 6 : 3);
    // every big purchase is a step toward the next perk choice
    if (e.pad.big && e.pad.effect && e.pad.effect.type !== 'win') addStar(1, e.pad.pos.x, e.pad.pos.z);
  });

  function gap() { return (T.gap[0] + rnd() * (T.gap[1] - T.gap[0])) / totals.luck; }

  function pickEvent() {
    // the first two are fixed so each kind is met in a sensible order: a drop, then an order
    const seen = st.count.drop + st.count.order + st.count.pig + st.count.coins + st.count.deal + st.count.escort;
    if (seen === 0 && T.events.drop > 0) return 'drop';
    if (st.count.order === 0 && seen >= 1 && T.events.order > 0) return 'order';
    let total = 0;
    for (const k in EVENTS) total += k === st.last ? T.events[k] * 0.35 : T.events[k];
    if (!(total > 0)) return null;
    let r = rnd() * total;
    for (const k in EVENTS) {
      r -= k === st.last ? T.events[k] * 0.35 : T.events[k];
      if (r <= 0) return k;
    }
    return 'drop';
  }

  function startEvent(name) {
    const ev = EVENTS[name];
    if (!ev || !ev.start()) return false;
    D.cur = ev; D.curName = name;
    D.next = gap();           // saved from now on, so a reload during the event does not skip the wait
    st.last = name;
    st.count[name]++;
    ui.show(true);
    return true;
  }

  // ---- perk gates: three stars buy a choice of two perks
  const perkSpot = { x: 0, z: 0 };
  let perkOpen = false;
  function openPerkGates() {
    if (!st.pending || !st.pending.length) {
      const offer = offerPerks(st.perks, { crew: hasCrew(), harvest: hasHarvest() }, rnd, 2);
      if (!offer.length) {
        // every perk is maxed: the stars turn into cash
        st.stars -= T.starsPerPerk;
        ui.setStars(Math.min(T.starsPerPerk, st.stars));
        pay(nice(unit() * 2), G.player && G.player.pos, 'STAR BONUS');
        return true;
      }
      st.pending = offer.map((p) => p.id);
    }
    const gs = gateScale();
    if (!spots.find(perkSpot, rnd, { half: 2.9 * gs, minD: 4.5 })) return false;
    const options = st.pending.map((id) => { const p = perkById(id); return { color: p.color, title: p.title, sub: p.sub, icon: p.icon, id }; });
    gates.open({ x: perkSpot.x, z: perkSpot.z, ttl: 0, scale: gs, options, onPick: takePerk });
    perkOpen = true;
    D.perkFar = 0;
    toast('PICK A PERK!');
    tip('perk', 'Run through the perk you want. It lasts for this whole world.', 6);
    play('order');
    ui.show(true);
    return true;
  }
  /** Add one stack of a perk (from the perk gates or bought at a flash sale). */
  function grantPerk(id) {
    const p = perkById(id);
    if (!p) return;
    st.perks[p.id] = Math.min(p.max, (st.perks[p.id] | 0) + 1);
    st.count.perk++;
    note('perk');
    perkTotals(st.perks, totals);
    write();
    if (G.player && G.player.sync) G.player.sync();
    // an offer made earlier may no longer be valid (maxed, or the other half of a trade-off)
    if (st.pending && !perkOpen) st.pending = null;
    toast(perkLine(p) + '!');
    play('perk');
    if (G.fx) G.fx.shake(0.2, 0.25);
    if (G.saveNow) G.saveNow();
  }
  function takePerk(i, o) {
    perkOpen = false;
    st.pending = null;
    if (!perkById(o.id)) return;
    st.stars = Math.max(0, st.stars - T.starsPerPerk);
    ui.setStars(Math.min(T.starsPerPerk, st.stars));
    grantPerk(o.id);
    D.next = Math.max(D.next, 12);
  }
  function updatePerkGates(dt) {
    if (!perkOpen) return;
    if (!gates.waiting) { if (!gates.active) perkOpen = false; return; }
    // the player wandered off: bring the gates along
    const pl = G.player;
    if (pl && Math.hypot(pl.pos.x - gates.x, pl.pos.z - gates.z) > 17) {
      D.perkFar += dt;
      if (D.perkFar > 5) { gates.close(); perkOpen = false; D.perkWait = 0.5; }
    } else D.perkFar = 0;
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    // income estimate, once a second
    M.t += dt;
    if (M.t >= 1) {
      M.t -= 1;
      const e = G.state.earned - M.bonus;
      M.rate += ((e - M.lastEarned) - M.rate) * 0.022;      // about 45 s: cash arrives in lumps
      if (M.rate < 0) M.rate = 0;
      M.lastEarned = e;
      st.next = D.next;
      st.rate = Math.round(M.rate * 100) / 100;        // recent income per second (the welcome-back bonus uses it)
      st.fever = F.on ? 0 : F.charge;
      st.feverLeft = F.on ? F.left : 0;
      st.turbo = B.turbo; st.crew = B.crew;
    }
    const pl = G.player;
    if (pl) D.lastMove = pl.speed01 > 0.15 ? 0 : D.lastMove + dt;

    if (!D.started && G.state.playTime >= T.firstAt && doneCount >= T.firstPads) {
      D.started = true;
      ui.show(true);
    }
    swoosh.update(dt);
    updateBoosts(dt);
    updateFever(dt);
    updateLoad(dt);
    gates.update(dt);
    updatePerkGates(dt);
    orders.tick(dt);

    if (D.cur) {
      D.cur.update(dt);
      if (!D.cur.active) { D.cur = null; D.curName = ''; D.next = gap(); }
    } else if (D.started && D.lastMove < 8) {
      const wantPerk = (st.stars >= T.starsPerPerk || (st.pending && st.pending.length)) && !perkOpen && !gates.active;
      if (wantPerk && D.perkFails < 3) {
        D.perkWait -= dt;
        if (D.perkWait <= 0) {
          if (openPerkGates()) D.perkFails = 0;
          else { D.perkWait = 3; D.perkFails++; }          // no room here: after a few tries the events go on
        }
      } else if (!perkOpen) {
        D.next -= dt;
        if (D.next <= 0) {
          const name = pickEvent();
          if (!name || !startEvent(name)) D.next = 8;      // no room right now: try again shortly
          D.perkFails = 0;                                  // and the perk gates get another go after it
        }
      }
    }
    // the edge pointer follows whatever can be walked to
    const tg = target();
    if (tg) ui.point(tg.x, tg.z, true); else ui.point(0, 0, false);
  }

  const TG = { id: '', x: 0, z: 0 };
  /** Where the current event wants the player (null if nowhere): gates or the pig. Used by the test bot. */
  function target() {
    if (gates.waiting) {
      // which gate the bot takes: stable for one set, varies between sets
      const i = gates.count > 1 ? (st.count.drop + st.count.perk) % gates.count : 0;
      gates.at(i, TG);
      TG.id = 'gate' + i;
      return TG;
    }
    if (D.cur === piggy && piggy.position(TG)) { TG.id = 'pig'; return TG; }
    if (D.cur === coins && coins.position(TG)) { TG.id = 'coins'; return TG; }
    if (D.cur === escort && escort.position(TG)) { TG.id = 'escort'; return TG; }
    return null;
  }

  ui.setStars(Math.min(T.starsPerPerk, st.stars));
  ui.setFever(F.charge, false, 0);
  if (st.count.drop + st.count.order + st.count.pig + st.count.coins + st.count.deal + st.count.escort > 0) { D.started = true; ui.show(true); }

  return {
    update,
    /** once per rendered frame */
    frame(realDt) { ui.frame(realDt); },
    applyStats,
    target,
    state: st,
    tune: T,
    fever, gates, boost, addStar, pay, unit,
    /** the perks owned in this world, as text lines */
    perkLines() {
      const out = [];
      for (const id of Object.keys(st.perks)) { const p = perkById(id); if (p) out.push(perkLine(p) + (st.perks[id] > 1 ? ' x' + st.perks[id] : '')); }
      return out;
    },
    /** start an event now ('drop' | 'order' | 'coins' | 'pig' | 'deal' | 'perk' | 'fever'); for tests and the console */
    trigger(name) {
      D.started = true;
      ui.show(true);
      if (name === 'perk') { if (D.cur || gates.active) return false; if (st.stars < T.starsPerPerk) st.stars = T.starsPerPerk; return openPerkGates(); }
      if (name === 'fever') { fever.start(); return true; }
      if (D.cur) return false;
      return startEvent(name);
    },
    get current() { return D.curName; },
    get started() { return D.started; },
    get income() { return M.rate; },
  };
}
