// HUD: money counter, goal line, toast, win card, title overlay (world cards, loading state,
// perks line) and the mute, reset and world-select buttons.
// The title overlay has two modes: 'start' (first screen, any tap outside a card plays) and
// 'picker' (opened from the game with #btn-worlds: the sim is paused, RESUME closes it).
// Hooks used by the engine: G.hud.showWin({time, earned, next}), G.hud.hideWin(),
// G.hud.openWorlds(); G.worlds, G.meta.finished / .perks, G.travel(id), G.loading.
// Every DOM element is optional except #money/#money-value/#goal/#toast; missing ones are skipped.
import { fmtMoney, PERK } from './config.js';

const ROLL_TIME = 0.4;     // seconds for the counter to reach its target
const POP_COOLDOWN = 0.12; // min seconds between pops
const TOAST_MS = 1800;

// Icons: inline SVG, no emoji. Keyed by world id; a generic sparkle for unknown worlds.
const ICON_VB = '0 0 48 48';
const ICON = {
  flower: '<g fill="#fff"><circle cx="24" cy="12.5" r="8.5"/><circle cx="35.5" cy="21" r="8.5"/>'
    + '<circle cx="31.5" cy="34" r="8.5"/><circle cx="16.5" cy="34" r="8.5"/><circle cx="12.5" cy="21" r="8.5"/></g>'
    + '<circle cx="24" cy="23.5" r="6.5" fill="#ffd166"/><path d="M24 40v6" stroke="#1d7a31" stroke-width="3.5" stroke-linecap="round"/>',
  chicken: '<path d="M24 6c7.5 0 13.5 12.5 13.5 22.5a13.5 13.5 0 0 1-27 0C10.5 18.5 16.5 6 24 6z" fill="#fffaf0" stroke="#b5803a" stroke-width="2.5"/>'
    + '<path d="M17.5 19.5c1.2-2.5 2.8-4.5 4.5-5.2" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>',
  grocery: '<path d="M9 21h30l-3.5 17.5a2.5 2.5 0 0 1-2.5 2H15a2.5 2.5 0 0 1-2.5-2z" fill="#d9913f" stroke="#7a4a17" stroke-width="2.5" stroke-linejoin="round"/>'
    + '<path d="M15 21c0-10 18-10 18 0" fill="none" stroke="#7a4a17" stroke-width="3" stroke-linecap="round"/>'
    + '<circle cx="19" cy="17" r="4.5" fill="#ff4d4d"/><circle cx="29" cy="16" r="4.5" fill="#ffb020"/>'
    + '<path d="M16 28v8M24 28v8M32 28v8" stroke="#7a4a17" stroke-width="2" opacity=".5"/>',
  factory: '<path d="M6 41V23l9 6v-6l9 6V13h8v28z" fill="#fff"/><path d="M34 41V9h7v32z" fill="#dfeaff"/>'
    + '<rect x="10" y="33" width="5" height="5" rx="1" fill="#2f7fe0"/><rect x="19" y="33" width="5" height="5" rx="1" fill="#2f7fe0"/>'
    + '<path d="M29.5 16l-6 9h4.5l-2 8 7-10h-4.5z" fill="#ffd23f" stroke="#b5803a" stroke-width="1.2" stroke-linejoin="round"/>',
  frost: '<path d="M24 5l11 15h-6l9 12H10l9-12h-6z" fill="#fff"/><rect x="21.5" y="32" width="5" height="9" rx="1.5" fill="#8a5a2a"/>'
    + '<path d="M24 5l5 7c-3 1.5-7 1.5-10 0z" fill="#dff6ff"/><circle cx="38" cy="10" r="2" fill="#fff"/><circle cx="9" cy="14" r="1.6" fill="#fff"/>'
    + '<circle cx="40" cy="24" r="1.4" fill="#fff"/>',
  generic: '<path d="M24 8l4 12 12 4-12 4-4 12-4-12-12-4 12-4z" fill="#fff"/>',
};
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10.5" rx="3" fill="currentColor"/>'
  + '<path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const REPLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'
  + '<path d="M4.5 4.5v4h4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2fb14a"/>'
  + '<path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** "+8% speed, +10 stack" for one perk object (or a sum of them); '' when it gives nothing. */
function perkText(p) {
  if (!p) return '';
  const parts = [];
  const pct = Math.round(((p.speedMul || 1) - 1) * 100);
  if (pct > 0) parts.push(`+${pct}% speed`);
  if (p.capacityAdd > 0) parts.push(`+${p.capacityAdd} stack`);
  return parts.join(', ');
}

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const moneyEl = $('money');
  const moneyValue = $('money-value');
  const goalEl = $('goal');
  const toastEl = $('toast');
  const startEl = $('start');
  const tapBtn = startEl ? startEl.querySelector('.tap') : null;
  const cardsEl = $('worlds');
  const perksEl = $('perks');
  const worldPerksEl = $('world-perks');
  const winEl = $('win');
  const winTime = $('win-time');
  const winEarned = $('win-earned');
  const winKeep = $('win-keep');
  const winNext = $('win-next');          // "NEXT: <name>" primary button
  const winNextName = $('win-next-name');
  const winPicker = $('win-picker');      // "WORLD SELECT" when there is no next world
  const winTitle = $('win-title');
  const winWorld = $('win-world');
  const winPerk = $('win-perk');
  const winPerkRow = $('win-perk-row');
  const winBest = $('win-best');
  const winBestRow = $('win-best-row');
  const winRun = $('win-run');
  const winRunRow = $('win-run-row');
  const worldsBtn = $('btn-worlds');
  const muteBtn = $('btn-mute');
  const resetBtn = $('btn-reset');
  const iconOn = muteBtn ? muteBtn.querySelector('.icon-on') : null;
  const iconOff = muteBtn ? muteBtn.querySelector('.icon-off') : null;

  const worlds = () => (Array.isArray(G.worlds) ? G.worlds : []);
  const finishedMap = () => (G.meta && G.meta.finished) || {};
  const perksMap = () => (G.meta && G.meta.perks) || {};
  const bestMap = () => (G.meta && G.meta.best) || {};

  // ---- money counter
  let target = G.state.money;
  let lastTarget = target;
  let shown = target;
  let rollFrom = target;
  let rollT = ROLL_TIME;
  let popCooldown = 0;
  let shownText = fmtMoney(shown);
  let lastShown = shown;
  moneyValue.textContent = shownText;

  function pop() {
    if (popCooldown > 0) return;
    popCooldown = POP_COOLDOWN;
    moneyEl.classList.remove('pop');
    void moneyEl.offsetWidth; // restart the CSS animation
    moneyEl.classList.add('pop');
  }

  moneyEl.addEventListener('animationend', () => moneyEl.classList.remove('pop'));

  function update(dt) {
    target = G.state.money;
    if (target !== lastTarget) {
      if (target > lastTarget) pop();
      rollFrom = shown;
      rollT = 0;
      lastTarget = target;
    }
    if (popCooldown > 0) popCooldown = Math.max(0, popCooldown - dt);

    if (shown !== target) {
      if (Math.abs(target - shown) < 1) {
        shown = target;
      } else {
        rollT += dt;
        const t = Math.min(1, rollT / ROLL_TIME);
        const eased = 1 - Math.pow(1 - t, 3);
        shown = rollFrom + (target - rollFrom) * eased;
        if (t >= 1) shown = target;
      }
    }

    if (shown !== lastShown) {           // format only when the number moved
      lastShown = shown;
      const text = fmtMoney(shown);
      if (text !== shownText) {
        shownText = text;
        moneyValue.textContent = text;
      }
    }
    if (worldHud) worldHud(dt);
  }

  // ---- optional world HUD: a stage bar and production-rate chips (world.hud)
  //   world.hud = { stages: ['GARAGE', ...], stageStat: 'stage',
  //                 rates: [{ label: 'PACKS', total: (G) => n so far, show: (G) => bool, color }] }
  // The stage bar shows G.stats[stageStat] (1-based) of stages.length; a chip shows its total's rate per minute.
  let worldHud = null;
  (function setupWorldHud() {
    const W = G.world.hud;
    const top = $('topbar');
    if (!W || !top) return;
    const row = document.createElement('div');
    row.className = 'whud';
    let bar = null, pips = [], name = null, stageShown = -1;
    if (Array.isArray(W.stages) && W.stages.length) {
      bar = document.createElement('div');
      bar.className = 'whud-stage';
      const dots = document.createElement('span');
      dots.className = 'whud-pips';
      pips = W.stages.map(() => { const d = document.createElement('i'); dots.append(d); return d; });
      name = document.createElement('span');
      name.className = 'whud-name';
      bar.append(dots, name);
      row.append(bar);
    }
    const chips = (W.rates || []).map((r) => {
      const el = document.createElement('div');
      el.className = 'whud-chip';
      if (r.color) el.style.setProperty('--chip', r.color);
      const v = document.createElement('b');
      v.textContent = '0';
      const l = document.createElement('span');
      l.textContent = r.label + ' / MIN';
      el.append(v, l);
      el.hidden = true;
      row.append(el);
      return { r, el, v, hist: new Float64Array(16), hi: 0, n: 0, t: 0, text: '0', on: false };
    });
    top.append(row);
    const WINDOW = 15;                    // seconds the rate is averaged over (15 samples, one per second)
    worldHud = (dt) => {
      if (bar) {
        const s = Math.max(1, Math.min(W.stages.length, (G.stats && G.stats[W.stageStat || 'stage']) | 0 || 1));
        if (s !== stageShown) {
          const first = stageShown < 0;
          stageShown = s;
          pips.forEach((d, i) => d.classList.toggle('on', i < s));
          name.textContent = W.stages[s - 1];
          if (!first) { bar.classList.remove('pop'); void bar.offsetWidth; bar.classList.add('pop'); }
        }
      }
      for (const c of chips) {
        const on = !c.r.show || !!c.r.show(G);
        if (on !== c.on) { c.on = on; c.el.hidden = !on; }
        if (!on) continue;
        c.t += dt;
        if (c.t < 1) continue;
        c.t -= 1;
        const total = +c.r.total(G) || 0;
        c.hist[c.hi] = total; c.hi = (c.hi + 1) % WINDOW; if (c.n < WINDOW) c.n++;
        const oldest = c.hist[c.n < WINDOW ? 0 : c.hi];
        const span = Math.max(1, c.n - 1);
        const text = String(Math.max(0, Math.round(((total - oldest) / span) * 60)));
        if (text !== c.text) { c.text = text; c.v.textContent = text; }
      }
    };
  }());

  // ---- goal line
  let goalText = goalEl.textContent;
  let goalTimer = 0;

  function setGoal(text) {
    text = text == null ? '' : String(text);
    if (text === goalText) return;
    goalText = text;
    clearTimeout(goalTimer);
    if (!goalEl.textContent) {
      // nothing on screen yet: show immediately
      goalEl.textContent = text;
      goalEl.classList.remove('fade');
      return;
    }
    goalEl.classList.add('fade');
    goalTimer = setTimeout(() => {
      goalEl.textContent = text;
      goalEl.classList.remove('fade');
    }, 180);
  }

  // ---- toast
  let toastTimer = 0;

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = String(text);
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    void toastEl.offsetWidth; // restart the bounce-in
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), TOAST_MS);
  }

  // ---- perks and world names
  function nameOf(id) {
    const w = worlds().find((x) => x.id === id);
    return w && w.name ? w.name : String(id);
  }

  /** Perks earned so far: product of speedMul, sum of capacityAdd, over the finished worlds. */
  function perkSummary() {
    const fin = finishedMap();
    const perks = perksMap();
    let mul = 1;
    let add = 0;
    let any = false;
    for (const w of worlds()) {
      if (!fin[w.id]) continue;
      any = true;
      const p = perks[w.id] || PERK || {};
      mul *= p.speedMul || 1;
      add += p.capacityAdd || 0;
    }
    return any ? perkText({ speedMul: mul, capacityAdd: add }) : '';
  }

  function renderPerks() {
    if (!perksEl) return;
    const s = perkSummary();
    perksEl.textContent = s ? `Perks: ${s}` : '';
    perksEl.hidden = !s;
    // the perks picked at the perk gates in the world being played (engine/thrills)
    if (worldPerksEl) {
      const mine = G.thrills && G.thrills.perkLines ? G.thrills.perkLines() : [];
      worldPerksEl.textContent = mine.length ? `This world: ${mine.join(', ')}` : '';
      worldPerksEl.hidden = !mine.length;
    }
  }

  // ---- world cards
  function renderCards() {
    if (!cardsEl) return;
    const fin = finishedMap();
    cardsEl.textContent = '';
    for (const w of worlds()) {
      const done = !!fin[w.id];
      const open = !w.unlockedBy || !!fin[w.unlockedBy];
      const isCur = w.id === G.worldId;
      let state;
      const best = bestMap()[w.id];
      if (done) state = best > 0 ? `Done, best ${formatTime(best)}` : 'Done';
      else if (isCur) state = 'Playing now';
      else if (open) state = 'Tap to play';
      else state = `Finish ${nameOf(w.unlockedBy)} to unlock`;

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'world-card'
        + (isCur ? ' is-current' : '')
        + (done ? ' is-finished' : '')
        + (open ? '' : ' is-locked');
      card.dataset.world = w.id;
      card.setAttribute('aria-disabled', String(!open));
      card.setAttribute('aria-label', `${w.name}, ${state}`);

      const icon = document.createElement('span');
      icon.className = 'wc-icon';
      icon.innerHTML = `<svg viewBox="${ICON_VB}" aria-hidden="true">${ICON[w.id] || ICON.generic}</svg>`;

      const text = document.createElement('span');
      text.className = 'wc-text';
      const name = document.createElement('span');
      name.className = 'wc-name';
      name.textContent = w.name;
      const st = document.createElement('span');
      st.className = 'wc-state';
      st.textContent = state;
      text.append(name, st);

      const mark = document.createElement('span');
      mark.className = 'wc-mark';
      if (done) mark.innerHTML = CHECK_SVG;
      else if (!open) mark.innerHTML = LOCK_SVG;

      card.append(icon, text, mark);
      if (done) {
        // a finished world can be played again from the start (new events, new perk picks, a time to beat)
        const row = document.createElement('div');
        row.className = 'world-row';
        const again = document.createElement('button');
        again.type = 'button';
        again.className = 'wc-replay';
        again.dataset.replay = w.id;
        again.setAttribute('aria-label', `Play ${w.name} again from the start`);
        again.innerHTML = REPLAY_SVG + '<span>AGAIN</span>';
        row.append(card, again);
        cardsEl.append(row);
      } else cardsEl.append(card);
    }
  }

  // ---- title overlay: mode, loading state, open / play
  let mode = 'start';        // 'start' | 'picker'
  let pausedScale = null;    // G.timeScale saved while the picker is open
  const ready = () => typeof G.loading !== 'number' || G.loading >= 1;

  /** The play button: "LOADING n%" (disabled) until the assets are in, then TAP TO PLAY / RESUME. */
  function renderTap() {
    if (!tapBtn) return;
    const loading = !ready();
    const pct = Math.round(Math.min(1, Math.max(0, G.loading || 0)) * 100);
    const text = loading ? `LOADING ${pct}%` : (mode === 'picker' ? 'RESUME' : 'TAP TO PLAY');
    if (tapBtn.textContent !== text) tapBtn.textContent = text;
    tapBtn.classList.toggle('loading', loading);
    tapBtn.setAttribute('aria-disabled', String(loading));
  }

  function showTitle(nextMode) {
    if (!startEl) return;
    mode = nextMode;
    startEl.dataset.mode = mode;
    startEl.classList.add('show');
    startEl.setAttribute('aria-hidden', 'false');
    renderCards();
    renderPerks();
    renderTap();
  }

  /** Close the title overlay and start / resume play. Ignored while loading. */
  function play() {
    if (!startEl || !startEl.classList.contains('show') || !ready()) return;
    startEl.classList.remove('show');
    startEl.setAttribute('aria-hidden', 'true');
    mode = 'start';
    if (pausedScale !== null) {
      G.timeScale = pausedScale;
      pausedScale = null;
    }
  }

  /** Open the world picker over the game. Pauses the sim; nothing is reset. */
  function openWorlds() {
    if (!startEl || startEl.classList.contains('show') || !ready()) return;
    hideWin();
    if (pausedScale === null && typeof G.timeScale === 'number') {
      pausedScale = G.timeScale;
      G.timeScale = 0;
    }
    showTitle('picker');
  }

  // A tap on the title overlay (outside a card or the button) starts the game on the first screen.
  // Pointer events here never reach the canvas, so they cannot move the player.
  if (startEl) {
    startEl.addEventListener('pointerdown', (e) => {
      if (mode !== 'start') return;
      const t = e.target;
      if (t && t.closest && t.closest('.world-card, .wc-replay, .tap')) return; // those handle their own click
      play();
    });
  }
  if (tapBtn) tapBtn.addEventListener('click', play);
  if (cardsEl) {
    cardsEl.addEventListener('click', (e) => {
      const again = e.target && e.target.closest ? e.target.closest('.wc-replay') : null;
      if (again) {
        if (!ready() || typeof G.replay !== 'function') return;
        const id = again.dataset.replay;
        if (id && window.confirm(`Start ${nameOf(id)} again from the beginning?\nYour perks from finished worlds and your best time stay.`)) G.replay(id);
        return;
      }
      const card = e.target && e.target.closest ? e.target.closest('.world-card') : null;
      if (!card || card.classList.contains('is-locked') || !ready()) return;
      const id = card.dataset.world;
      if (!id) return;
      if (id === G.worldId) { play(); return; }
      if (typeof G.travel === 'function') G.travel(id);
    });
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'picker') play(); });

  if (G.events && typeof G.events.on === 'function') G.events.on('loading', renderTap);
  renderCards();
  renderPerks();
  renderTap();

  if (worldsBtn) worldsBtn.addEventListener('click', openWorlds);

  // ---- win screen
  // info: { time, earned, next: { id, name } | null }.
  let nextId = null;
  let winSub = null;
  function winSubtitle() {
    if (winSub || !winTitle || !winTitle.parentNode) return winSub;
    winSub = document.createElement('p');
    winSub.id = 'win-subtitle';
    winSub.className = 'win-subtitle';
    winSub.style.cssText = 'margin:-10px 0 14px;font-size:16px;font-weight:600;color:#7a6a4a;';
    winSub.hidden = true;
    winTitle.after(winSub);
    return winSub;
  }
  function showWin(info) {
    if (!winEl) return;
    const { time, earned, next = null, best = 0, newBest = false } = info || {};
    const hasNext = !!(next && next.id);
    nextId = hasNext ? next.id : null;

    // the registry name (as on the world cards and buttons); the world's own name, if it has
    // one, as a subtitle under the title
    const listed = worlds().some((x) => x.id === G.worldId);
    const regName = listed ? nameOf(G.worldId) : (G.world && G.world.name) || String(G.worldId);
    const ownName = G.world && G.world.name && G.world.name !== regName ? G.world.name : '';
    if (winWorld) winWorld.textContent = regName;
    if (winTitle) winTitle.textContent = hasNext ? 'WORLD COMPLETE!' : 'ALL WORLDS COMPLETE!';
    const sub = winSubtitle();
    if (sub) { sub.textContent = ownName; sub.hidden = !ownName; }
    if (winTime) winTime.textContent = formatTime(time);
    if (winEarned) winEarned.textContent = fmtMoney(earned || 0);

    const perkObj = perksMap()[G.worldId]
      || (G.world && G.world.finale && G.world.finale.perk)
      || PERK;
    const perk = perkText(perkObj);
    if (winPerk) winPerk.textContent = perk;
    if (winPerkRow) winPerkRow.hidden = !perk;

    if (winBestRow) {
      winBestRow.hidden = !(best > 0);
      if (winBest) winBest.textContent = best > 0 ? formatTime(best) + (newBest ? '  NEW BEST!' : '') : '';
    }
    // what happened on the way (engine/thrills)
    if (winRunRow) {
      const ts = G.thrills && G.thrills.state ? G.thrills.state : null;
      const parts = [];
      if (ts) {
        const c = ts.count || {}, w = ts.won || {};       // perks picked; orders filled, pigs caught (not just seen)
        if (c.perk > 0) parts.push(`${c.perk} perk${c.perk > 1 ? 's' : ''}`);
        if (w.order > 0) parts.push(`${w.order} rush order${w.order > 1 ? 's' : ''}`);
        if (w.pig > 0) parts.push(`${w.pig} pigg${w.pig > 1 ? 'ies' : 'y'}`);
        if (c.jackpot > 0) parts.push(`${c.jackpot} jackpot${c.jackpot > 1 ? 's' : ''}`);
      }
      winRunRow.hidden = !parts.length;
      if (winRun) winRun.textContent = parts.join(', ');
    }

    if (winNext) winNext.hidden = !hasNext;
    if (winNextName) winNextName.textContent = hasNext ? (next.name || nameOf(next.id)) : '';
    if (winPicker) winPicker.hidden = hasNext;

    winEl.classList.add('show');
    winEl.setAttribute('aria-hidden', 'false');
    if (G.events && G.events.emit) G.events.emit('hud:win-shown', { time, earned, next });
  }
  function hideWin() {
    if (!winEl) return;
    winEl.classList.remove('show');
    winEl.setAttribute('aria-hidden', 'true');
  }

  if (winKeep) winKeep.addEventListener('click', hideWin);
  if (winNext) winNext.addEventListener('click', () => { if (nextId && typeof G.travel === 'function') G.travel(nextId); });
  if (winPicker) winPicker.addEventListener('click', () => { hideWin(); openWorlds(); });

  // ---- mute
  function refreshMute() {
    if (!muteBtn) return;
    const muted = !!(G.audio && G.audio.muted);
    iconOn.hidden = muted;
    iconOff.hidden = !muted;
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    muteBtn.setAttribute('aria-pressed', String(muted));
  }

  if (muteBtn) muteBtn.addEventListener('click', () => {
    if (!G.audio || typeof G.audio.setMuted !== 'function') return;
    G.audio.setMuted(!G.audio.muted);
    refreshMute();
  });
  refreshMute();

  // ---- reset
  if (resetBtn) resetBtn.addEventListener('click', () => {
    if (window.confirm('Reset all progress?')) G.events.emit('reset', {});
  });

  return { update, setGoal, toast, showWin, hideWin, openWorlds, /** redraw the title's cards and perk lines */ refreshTitle() { renderCards(); renderPerks(); } };
}
