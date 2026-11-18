// The Harvest Rush HUD (DOM): the clock (red and pulsing in the last seconds), the big count, the
// combo with its meter, a chip per running pick-up, a leave button, the banner, and during the
// tally three truck chips that fill. Text and styles are only written when they change.
// Styled by styles/rush.css.
import { WIDER, MAGNET, DOUBLE, TIME } from './level.js';

const LEAVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.500" r="8" fill="none" stroke="#fff" stroke-width="2.600"/>'
  + '<path d="M12 9v4.500l3 2M9.500 2.500h5M12 2.500v3" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TRUCK = '<svg viewBox="0 0 40 24" aria-hidden="true"><rect x="1.500" y="5" width="23" height="12" rx="2.500" fill="currentColor"/>'
  + '<path d="M24.500 8.500h7l5.500 5v3.500h-12.500z" fill="currentColor"/><path d="M27 10.500h4l3 2.700h-7z" fill="#1c1446" opacity=".55"/>'
  + '<circle cx="9.500" cy="18.500" r="3.700" fill="#1c1446" stroke="#fff" stroke-width="1.600"/><circle cx="29.500" cy="18.500" r="3.700" fill="#1c1446" stroke="#fff" stroke-width="1.600"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.500l4.500 4.500L19 7.500" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHIP = {
  [WIDER]: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16M8 7.500L3.500 12 8 16.500M16 7.500l4.500 4.500-4.500 4.500" fill="none" stroke="#fff" stroke-width="2.800" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  [MAGNET]: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.500 19v-7.500a5.500 5.500 0 0 1 11 0V19" fill="none" stroke="#fff" stroke-width="4.200"/><path d="M4.400 16h4.200M15.400 16h4.200" stroke="#7a1512" stroke-width="1.800"/></svg>',
  [DOUBLE]: '<b>x2</b>',
  [TIME]: '<b>+5</b>',
};
const NAMES = { [WIDER]: 'wider', [MAGNET]: 'magnet', [DOUBLE]: 'double', [TIME]: 'time' };

export function createRushHud(G, on) {
  const doc = typeof document !== 'undefined' ? document : null;
  const noop = () => {};
  if (!doc || !doc.body) return { show: noop, clock: noop, count: noop, combo: noop, chip: noop, banner: noop, tally: noop, truck: noop, tick: noop, flash: noop, label: noop };
  const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  const hud = el('div', 'rush-hud');
  const top = el('div', 'rush-top');
  const leave = el('button', 'rush-leave', LEAVE);
  leave.type = 'button';
  leave.setAttribute('aria-label', 'Leave the rush');
  leave.addEventListener('click', () => on.leave());
  const clock = el('div', 'rush-clock', CLOCK);
  const clockText = el('b');
  clockText.textContent = '0';
  clock.append(clockText);
  const combo = el('div', 'rush-combo');
  const comboText = el('b');
  comboText.textContent = 'x1';
  const comboBar = el('i');
  const comboFill = el('u');
  comboBar.append(comboFill);
  combo.append(comboText, comboBar);
  top.append(leave, clock, combo);

  const count = el('div', 'rush-count');
  const countText = el('b');
  countText.textContent = '0';
  const countLabel = el('span');
  count.append(countText, countLabel);

  const chips = el('div', 'rush-chips');
  const chipEls = [], chipFills = [], chipShown = [];
  for (const t of [WIDER, MAGNET, DOUBLE]) {
    const c = el('div', 'rush-chip is-' + NAMES[t], CHIP[t]);
    const bar = el('i'), fill = el('u');
    bar.append(fill);
    c.append(bar);
    chips.append(c);
    chipEls[t] = c; chipFills[t] = fill; chipShown[t] = 0;
  }
  const trucks = el('div', 'rush-trucks');
  const truckEls = [], truckFills = [], truckShown = [];
  for (let k = 0; k < 3; k++) {
    const t = el('div', 'rush-truck', TRUCK + '<em>' + CHECK + '</em>');
    const bar = el('i'), fill = el('u');
    bar.append(fill);
    t.append(bar);
    trucks.append(t);
    truckEls.push(t); truckFills.push(fill); truckShown.push(-1);
  }
  hud.append(top, count, chips, trucks);

  const banner = el('div', 'rush-banner');
  const flash = el('div', 'rush-flash');
  doc.body.append(flash, hud, banner);

  let secShown = -1, cShown = -1, multShown = 1, fracShown = -1, bShown = '', low = false, tallyOn = false;
  return {
    show(v) { hud.classList.toggle('on', !!v); if (!v) { flash.className = 'rush-flash'; } },
    /** what the count counts ('ROSES') */
    label(text) { countLabel.textContent = text; },
    /** whole seconds left; red from 5 down */
    clock(sec) {
      if (sec === secShown) return;
      secShown = sec;
      clockText.textContent = String(sec);
      const l = sec <= 5;
      if (l !== low) { low = l; clock.classList.toggle('low', l); }
    },
    /** one beat of the last seconds: the clock jumps, the screen edge glows */
    tick() {
      clock.classList.remove('beat');
      void clock.offsetWidth;
      clock.classList.add('beat');
      flash.className = 'rush-flash';
      void flash.offsetWidth;
      flash.className = 'rush-flash low';
    },
    flash(kind) {
      flash.className = 'rush-flash';
      void flash.offsetWidth;
      flash.className = 'rush-flash ' + kind;
    },
    count(n, pop) {
      if (n === cShown) return;
      cShown = n;
      countText.textContent = String(n);
      if (!pop) return;
      count.classList.remove('up');
      void count.offsetWidth;
      count.classList.add('up');
    },
    /** mult 1..3, frac 0..1 toward the next step (1 = full) */
    combo(mult, frac) {
      if (mult !== multShown) {
        const up = mult > multShown;
        multShown = mult;
        comboText.textContent = 'x' + mult;
        combo.dataset.m = String(mult);
        if (up) { combo.classList.remove('up'); void combo.offsetWidth; combo.classList.add('up'); }
      }
      const f = Math.round((frac < 0 ? 0 : frac > 1 ? 1 : frac) * 25);
      if (f !== fracShown) { fracShown = f; comboFill.style.width = f * 4 + '%'; }
    },
    /** a running pick-up: frac 0..1 of its time left (0 hides the chip) */
    chip(type, frac) {
      const fill = chipFills[type];
      if (!fill) return;
      const f = frac <= 0 ? 0 : Math.max(1, Math.round(frac * 25));
      if (f === chipShown[type]) return;
      if ((f > 0) !== (chipShown[type] > 0)) chipEls[type].classList.toggle('on', f > 0);
      chipShown[type] = f;
      fill.style.width = f * 4 + '%';
    },
    /** a big word in the middle of the screen ('' hides it); kind tints it */
    banner(text, kind) {
      if (text === bShown) return;
      bShown = text;
      if (!text) { banner.classList.remove('on'); return; }
      banner.textContent = text;
      banner.dataset.kind = kind || '';
      banner.classList.remove('on');
      void banner.offsetWidth;
      banner.classList.add('on');
    },
    /** the trucks are being loaded: the clock, the combo and the chips go, the truck chips come */
    tally(v) {
      if (v === tallyOn) return;
      tallyOn = v;
      hud.classList.toggle('tally', v);
      if (v) for (let k = 0; k < 3; k++) { truckShown[k] = -1; truckEls[k].classList.remove('done'); truckFills[k].style.width = '0%'; }
    },
    /** truck k: frac 0..1 loaded, done = it has left */
    truck(k, frac, done) {
      const f = done ? 26 : Math.round((frac < 0 ? 0 : frac > 1 ? 1 : frac) * 25);
      if (f === truckShown[k]) return;
      truckShown[k] = f;
      truckFills[k].style.width = Math.min(100, f * 4) + '%';
      if (done) truckEls[k].classList.add('done');
    },
  };
}
