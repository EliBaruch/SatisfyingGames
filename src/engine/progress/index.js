// Progress: a player level that carries across every world, and a standing mission in the world
// being played.
//
//   level     XP comes from playing (deliveries, purchases, events, stars, gate runs, winning a
//             world). Each level pays a cash bonus and raises sale prices by 1% everywhere, for
//             good (meta.xp; capped at LEVEL_CAP_BONUS levels of bonus). A badge with an XP ring
//             sits in the top-left corner.
//   mission   one untimed goal at a time ("Buy: TRACTOR", "Deliver 60 Roses", "Collect $400",
//             "Finish 2 events", "Earn 2 stars", "Hand in 3 full loads", "Finish a gate run"),
//             shown on a card under the goal line. Finishing it pays XP and a little cash, and the
//             next one follows. Rush orders (engine/thrills) share the card's place while they run.
//
//   welcome   coming back to a world after a few minutes away pays what the crew "earned" meanwhile
//             (a quarter of the recent income for the time away, capped at about two upgrades),
//             once the player starts moving again.
//
// State: meta.xp (all worlds) and levels.<world>.mission. Off with ?noprogress.
// Events it listens to: 'p:deliver', 'p:cash', 'unlock', 'thrill' { kind }, 'run:done', 'win'.
import { fmtMoney } from '../config.js';
import { getItem } from '../registry.js';

const LEVEL_CAP_BONUS = 40;          // levels that still raise prices
const PRICE_PER_LEVEL = 0.01;
const XP = { deliver: 0.25, pad: 12, bigPad: 40, order: 25, pig: 25, coins: 20, escort: 25, drop: 8, deal: 8, perk: 20, fever: 10, load: 3, star: 6, runStar: 30, run: 15, win: 250 };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** XP needed to go from `level` to the next one. */
export function xpNeed(level) { return Math.round(50 + 35 * Math.pow(Math.max(0, level - 1), 1.3)); }
/** { level, into, need } for a total XP. */
export function levelOf(xp) {
  let level = 1, left = Math.max(0, xp || 0);
  for (;;) {
    const need = xpNeed(level);
    if (left < need || level >= 999) return { level, into: left, need };
    left -= need; level++;
  }
}

const STAR = 'M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8L2.2 9.3l6.9-.8z';
const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V3.500" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M6 4.500h11.500l-2.700 4 2.700 4H6z" fill="#ffd23f" stroke="#7a5200" stroke-width="1.400" stroke-linejoin="round"/></svg>';

export function createProgress(G) {
  const meta = G.save.meta;
  meta.xp = isNum(meta.xp) && meta.xp > 0 ? meta.xp : 0;
  let L = levelOf(meta.xp);

  // ------------------------------------------------------------------ stats
  /** sale prices rise 1% per level, in every world (called right after computeStats) */
  function applyStats(stats) {
    stats.priceMult *= 1 + PRICE_PER_LEVEL * Math.min(LEVEL_CAP_BONUS, L.level - 1);
  }
  applyStats(G.stats);

  // ------------------------------------------------------------------ DOM
  const doc = typeof document !== 'undefined' ? document : null;
  const hud = doc && doc.getElementById('hud');
  const goal = doc && doc.getElementById('goal');
  let badge = null, ring = null, num = null, card = null, cardFill = null, cardText = null, cardPay = null, banner = null, bannerTitle = null, bannerSub = null;
  const C = 2 * Math.PI * 19;
  if (hud) {
    badge = doc.createElement('div');
    badge.className = 'lvl-badge';
    badge.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21.500" fill="#1d3a6e" stroke="#fff" stroke-width="2.500"/><circle cx="24" cy="24" r="19" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="4"/><circle class="lvl-ring" cx="24" cy="24" r="19" fill="none" stroke="#ffd23f" stroke-width="4" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 24 24)"/></svg><b></b><span>LEVEL</span>`;
    ring = badge.querySelector('.lvl-ring');
    num = badge.querySelector('b');
    hud.append(badge);

    card = doc.createElement('div');
    card.className = 'mission-card';
    card.hidden = true;
    card.innerHTML = `<i class="mc-fill"></i><span class="mc-icon">${FLAG}</span><span class="mc-text"></span><span class="mc-pay"></span>`;
    cardFill = card.querySelector('.mc-fill');
    cardText = card.querySelector('.mc-text');
    cardPay = card.querySelector('.mc-pay');
    // after the goal line and after the rush-order card if it is there (CSS hides this card while an order shows)
    const order = doc.querySelector('.thrill-order');
    (order || goal || hud).after(card);

    banner = doc.createElement('div');
    banner.className = 'lvl-banner';
    banner.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="#ffd23f" stroke="#7a5200" stroke-width="1.200" stroke-linejoin="round"/></svg><div><b></b><span></span></div>`;
    bannerTitle = banner.querySelector('b');
    bannerSub = banner.querySelector('span');
    hud.append(banner);
  }
  let ringShown = -1, numShown = -1;
  function drawBadge(pop) {
    if (!badge) return;
    if (L.level !== numShown) { numShown = L.level; num.textContent = String(L.level); }
    const f = Math.round(Math.min(1, L.into / L.need) * 100);
    if (f !== ringShown) { ringShown = f; ring.style.strokeDashoffset = (C * (1 - f / 100)).toFixed(1); }
    if (pop) { badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
  }
  drawBadge(false);
  let bannerTimer = 0;
  const toastEl = doc && doc.getElementById('toast');
  function showBanner(title, sub, tries = 0) {
    if (!banner) return;
    // one big card at a time: wait for a toast that is on screen (presentation only)
    if (toastEl && toastEl.classList.contains('show') && tries < 4) { clearTimeout(bannerTimer); bannerTimer = setTimeout(() => showBanner(title, sub, tries + 1), 700); return; }
    bannerTitle.textContent = title;
    bannerSub.textContent = sub;
    clearTimeout(bannerTimer);
    banner.classList.remove('show');
    void banner.offsetWidth;
    banner.classList.add('show');
    bannerTimer = setTimeout(() => banner.classList.remove('show'), 2600);
  }

  // ------------------------------------------------------------------ rewards
  function unit() {
    if (G.thrills && G.thrills.unit) return G.thrills.unit();
    let c = Infinity;
    const vis = G.pads && G.pads.visible ? G.pads.visible() : null;
    if (vis) for (let i = 0; i < vis.length; i++) if (vis[i].cost > 0 && vis[i].cost < c) c = vis[i].cost;
    return Math.max(15, c === Infinity ? 100 : c * 0.2);
  }
  function nice(n) {
    if (!(n > 0)) return 1;
    const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
    return Math.max(1, Math.round(n / p) * p);
  }
  function payCash(amount, label) {
    amount = Math.max(1, Math.round(amount));
    if (G.thrills && G.thrills.pay) G.thrills.pay(amount, G.player ? G.player.pos : null, label);
    else G.addMoney(amount);
    return amount;
  }

  // ------------------------------------------------------------------ XP and levels
  let dirtyBadge = false, pendingLevels = 0;
  function addXp(n) {
    if (!(n > 0)) return;
    meta.xp += n;
    L.into += n;
    while (L.into >= L.need) { L.into -= L.need; L.level++; L.need = xpNeed(L.level); pendingLevels++; }
    dirtyBadge = true;
  }
  function levelUp() {
    // paid out in update(), outside whatever event handler earned the XP
    const n = pendingLevels;
    pendingLevels = 0;
    const cash = payCash(nice(unit() * (0.8 + 0.4 * n)), 'LEVEL UP');
    const bonus = L.level - 1 <= LEVEL_CAP_BONUS;
    showBanner('LEVEL ' + L.level + '!', '+$' + fmtMoney(cash) + (bonus ? '  ·  prices +' + Math.round(PRICE_PER_LEVEL * 100 * n) + '% for good' : ''));
    if (G.audio && G.audio.play) G.audio.play('perk');
    if (G.fx && G.player) { G.fx.confetti({ x: G.player.pos.x, y: 0.4, z: G.player.pos.z }, 90); G.fx.ring(G.player.pos, { color: 0xffd23f, radius: 4.5, life: 0.7 }); }
    if (G.refresh) G.refresh(true);       // the price bonus applies at once
    drawBadge(true);
    if (G.saveNow) G.saveNow();
  }

  // ------------------------------------------------------------------ missions
  // { type, kind, pad, need, have, xp, cash, n }: n = missions finished in this world so far
  const M = { on: false, type: '', kind: '', pad: '', name: '', need: 1, have: 0, xp: 30, cash: 0, n: 0, wait: 2, doneT: 0, shown: -1 };
  const recent = new Map(), recentKinds = [];
  (function restore() {
    const m = G.state.mission;
    if (!m || typeof m !== 'object') return;
    M.n = isNum(m.n) && m.n > 0 ? Math.floor(m.n) : 0;
    if (typeof m.type !== 'string' || !isNum(m.need) || !(m.need > 0)) return;
    if (m.type === 'buy' && !(G.pads && G.pads.get(m.pad) && !G.state.done[m.pad])) return;
    if (m.type === 'deliver' && !getItem(m.kind)) return;
    M.on = true; M.type = m.type; M.kind = m.kind || ''; M.pad = m.pad || ''; M.need = m.need;
    M.have = isNum(m.have) && m.have > 0 ? Math.min(m.need, m.have) : 0;
    M.xp = isNum(m.xp) ? Math.max(5, Math.min(200, m.xp)) : 30; M.cash = isNum(m.cash) && m.cash > 0 ? m.cash : 0;
    M.name = describe();
  }());
  function persist() {
    G.state.mission = M.on
      ? { type: M.type, kind: M.kind, pad: M.pad, need: M.need, have: Math.round(M.have * 100) / 100, xp: M.xp, cash: M.cash, n: M.n }
      : { n: M.n };
  }

  function describe() {
    switch (M.type) {
      case 'buy': { const p = G.pads && G.pads.get(M.pad); return 'Buy: ' + (p ? p.label : 'the next upgrade'); }
      case 'deliver': { const it = getItem(M.kind); return 'Deliver ' + (it ? it.name : 'goods'); }
      case 'cash': return 'Collect cash';
      case 'event': return M.need > 1 ? 'Finish events' : 'Finish an event';
      case 'fever': return 'Start a fever';
      case 'star': return 'Earn stars';
      case 'load': return 'Hand in full loads';
      case 'run': return 'Finish a gate run';
    }
    return '';
  }
  const thrillsOn = () => !!(G.thrills && G.thrills.started);
  function cheapestPad() {
    return G.pads && G.pads.next ? G.pads.next() : null;
  }
  function pickKind() {
    let best = null, bv = 2;
    for (let i = 0; i < recentKinds.length; i++) { const v = recent.get(recentKinds[i]); if (v > bv) { bv = v; best = recentKinds[i]; } }
    return best;
  }
  // the order missions come in; anything that cannot be asked right now is skipped
  const CYCLE = ['buy', 'deliver', 'cash', 'event', 'buy', 'load', 'star', 'deliver', 'run', 'fever'];
  function make(type) {
    const cap = G.stats.capacity;
    switch (type) {
      case 'buy': { const p = cheapestPad(); if (!p) return false; M.pad = p.id; M.need = 1; return true; }
      case 'deliver': { const k = pickKind(); if (!k) return false; M.kind = k; M.need = Math.max(10, Math.round(cap * (2.5 + (M.n % 3)) / 5) * 5); return true; }
      case 'cash': { M.need = nice(unit() * (3 + (M.n % 3))); return G.state.earned > 0; }
      case 'event': if (!thrillsOn()) return false; M.need = 2; return true;
      case 'fever': if (!thrillsOn()) return false; M.need = 1; return true;
      case 'star': if (!thrillsOn()) return false; M.need = 2; return true;
      case 'load': if (!thrillsOn() || cap < 8) return false; M.need = 3; return true;
      case 'run': if (!(G.run && G.run.next && G.run.next())) return false; M.need = 1; return true;
    }
    return false;
  }
  function next() {
    for (let i = 0; i < CYCLE.length; i++) {
      const type = CYCLE[(M.n + i) % CYCLE.length];
      M.kind = ''; M.pad = '';
      if (!make(type)) continue;
      M.on = true; M.type = type; M.have = 0; M.shown = -1;
      M.xp = Math.min(90, 30 + 4 * M.n);
      M.cash = nice(unit() * 0.5);
      M.name = describe();
      persist();
      draw(true);
      return true;
    }
    return false;
  }
  function label() {
    if (M.type === 'buy' || M.need === 1) return M.name;
    if (M.type === 'cash') return `${M.name}  $${fmtMoney(Math.min(M.have, M.need))} / $${fmtMoney(M.need)}`;
    return `${M.name}  ${Math.min(Math.floor(M.have), M.need)} / ${M.need}`;
  }
  function draw(fresh) {
    if (!card) return;
    if (!M.on) { card.hidden = true; return; }
    const shown = M.type === 'cash' ? Math.floor(M.have) : Math.floor(M.have);
    if (shown !== M.shown || fresh) {
      M.shown = shown;
      cardText.textContent = label();
      let f = Math.min(1, M.have / M.need);
      if (M.type === 'buy') { const p = G.pads.get(M.pad); f = p && p.cost > 0 ? Math.min(1, (G.state.paid[p.id] || 0) / p.cost) : 0; }
      cardFill.style.width = Math.round(f * 100) + '%';
    }
    if (fresh) {
      cardPay.textContent = '+' + M.xp + ' XP';
      card.classList.remove('done');
      card.hidden = false;
      card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    }
  }
  function complete() {
    M.on = false; M.n++;
    addXp(M.xp);
    if (M.cash > 0) payCash(M.cash, 'MISSION');
    if (G.audio && G.audio.play) G.audio.play('orderDone');
    if (card) { cardText.textContent = 'MISSION DONE!'; cardFill.style.width = '100%'; card.classList.add('done'); }
    M.doneT = 1.6; M.wait = 2.2;
    persist();
  }
  function bump(type, n, kind) {
    if (!M.on || M.type !== type) return;
    if (type === 'deliver' && kind !== M.kind) return;
    M.have += n;
  }

  // ------------------------------------------------------------------ events
  G.events.on('p:deliver', (e) => {
    addXp(XP.deliver);
    const v = recent.get(e.kind);
    if (v === undefined) { recent.set(e.kind, 1); recentKinds.push(e.kind); } else recent.set(e.kind, v + 1);
    bump('deliver', 1, e.kind);
  });
  G.events.on('p:cash', (e) => bump('cash', e.amount));
  G.events.on('unlock', (e) => {
    if (!e || !e.pad || e.repeat) return;
    addXp(e.pad.big ? XP.bigPad : XP.pad);
    if (M.on && M.type === 'buy' && e.pad.id === M.pad) M.have = M.need;
  });
  // from engine/thrills: { kind: 'order' | 'pig' | 'coins' | 'drop' | 'deal' | 'perk' | 'fever' | 'load' | 'star' }
  G.events.on('thrill', (e) => {
    if (!e) return;
    addXp(XP[e.kind] || 0);
    if (e.kind === 'order' || e.kind === 'pig' || e.kind === 'coins' || e.kind === 'escort') bump('event', 1);
    else if (e.kind === 'fever') bump('fever', 1);
    else if (e.kind === 'star') bump('star', 1);
    else if (e.kind === 'load') bump('load', 1);
  });
  G.events.on('run:done', (e) => {
    addXp(XP.run + XP.runStar * Math.max(0, (e && e.newStars) | 0));
    bump('run', 1);
  });
  G.events.on('win', () => addXp(XP.win));

  // ------------------------------------------------------------------ welcome back
  // Read at boot, before the first save stamps the time again. Wall-clock time: it is about the real
  // world, not the simulation.
  let awaySeconds = 0;
  {
    const seen = G.state.seenAt;
    if (isNum(seen) && seen > 0) awaySeconds = Math.max(0, (Date.now() - seen) / 1000);
  }
  function crewSize() {
    const h = G.stats.hires;
    let n = 0;
    if (h) for (let i = 0; i < h.length; i++) if (h[i].role !== 'cashier') n++;
    return n;
  }
  function welcomeBack() {
    const away = awaySeconds;
    awaySeconds = 0;
    const rate = G.thrills && G.thrills.state ? G.thrills.state.rate || 0 : 0;
    if (away < 180 || !(rate > 0) || crewSize() === 0 || G.stats.won) return;
    const cash = nice(Math.min(rate * Math.min(away, 4 * 3600) * 0.25, unit() * 10));
    if (!(cash >= 5)) return;
    payCash(cash, 'CREW EARNED');
    const mins = Math.round(away / 60);
    const span = mins >= 120 ? Math.round(mins / 60) + ' h' : mins + ' min';
    showBanner('WELCOME BACK!', 'Your crew earned $' + fmtMoney(cash) + ' in ' + span);
    if (G.audio && G.audio.play) G.audio.play('orderDone');
  }

  // ------------------------------------------------------------------ update
  let slow = 0, decayT = 0;
  function update(dt) {
    if (awaySeconds > 0 && G.player && G.player.speed01 > 0.2) welcomeBack();
    if (pendingLevels > 0) levelUp();
    slow += dt;
    if (slow >= 0.2) {
      slow = 0;
      if (dirtyBadge) { dirtyBadge = false; drawBadge(false); }
      if (M.on) {
        // a bought pad that was the mission (e.g. restored from an older save) cannot hang
        if (M.type === 'buy' && (G.state.done[M.pad] || !G.pads.get(M.pad))) M.have = M.need;
        if (M.have >= M.need) complete(); else draw(false);
      }
    }
    decayT += dt;
    if (decayT >= 10) { decayT = 0; for (let i = 0; i < recentKinds.length; i++) recent.set(recentKinds[i], recent.get(recentKinds[i]) * 0.7); persist(); }
    if (M.doneT > 0) { M.doneT -= dt; if (M.doneT <= 0 && card) card.hidden = true; }
    if (!M.on) {
      M.wait -= dt;
      if (M.wait <= 0 && M.doneT <= 0) { if (!next()) M.wait = 5; }
    }
  }
  if (M.on) draw(true);

  return {
    update, applyStats, addXp,
    get level() { return L.level; },
    get xp() { return meta.xp; },
    get mission() { return M.on ? { type: M.type, text: label(), have: M.have, need: M.need } : null; },
    /** sale-price bonus from the player level, as a factor */
    get priceBonus() { return 1 + PRICE_PER_LEVEL * Math.min(LEVEL_CAP_BONUS, L.level - 1); },
  };
}
