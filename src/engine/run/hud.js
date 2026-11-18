// The Gate Run's own HUD (DOM): a slim progress bar to the finish, the carried count, a leave
// button, the READY / GO banner, speed streaks at the screen edges and a flash on hits.
// Text and styles are only written when they change. Styled by styles/run.css.
const STACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="15.500" width="18" height="5" rx="2.500" fill="#fff"/>'
  + '<rect x="4.500" y="9.500" width="15" height="5" rx="2.500" fill="#fff" opacity=".85"/><rect x="6" y="3.500" width="12" height="5" rx="2.500" fill="#fff" opacity=".7"/></svg>';
const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v18" fill="none" stroke="#fff" stroke-width="2.800" stroke-linecap="round"/>'
  + '<path d="M7 4.500h11l-2.800 3.700 2.800 3.800H7z" fill="#fff"/></svg>';
const LEAVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';

export function createRunHud(G, on) {
  const doc = typeof document !== 'undefined' ? document : null;
  const noop = () => {};
  if (!doc || !doc.body) return { show: noop, progress: noop, count: noop, banner: noop, speed: noop, flash: noop };
  const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  const hud = el('div', 'run-hud');
  const top = el('div', 'run-top');
  const leave = el('button', 'run-leave', LEAVE);
  leave.type = 'button';
  leave.setAttribute('aria-label', 'Leave the run');
  leave.addEventListener('click', () => on.leave());
  const bar = el('div', 'run-bar');
  const fill = el('i', 'run-bar-fill');
  const dot = el('span', 'run-bar-dot');
  const flag = el('span', 'run-bar-flag', FLAG);
  bar.append(fill, dot, flag);
  const count = el('div', 'run-count', STACK);
  const countText = el('b');
  countText.textContent = '0';
  count.append(countText);
  top.append(leave, bar, count);
  hud.append(top);

  const banner = el('div', 'run-banner');
  const speed = el('div', 'run-speed');
  for (let i = 0; i < 12; i++) speed.append(el('i'));
  const flash = el('div', 'run-flash');
  doc.body.append(speed, flash, hud, banner);

  let pShown = -1, cShown = -1, sShown = -1, bShown = '';
  return {
    /** the bar, the count and the streaks (the banner is separate: banner('') hides it) */
    show(v) { hud.classList.toggle('on', !!v); if (!v) { speed.dataset.k = '0'; sShown = 0; } },
    /** 0..1 along the runway */
    progress(frac) {
      const p = Math.round((frac < 0 ? 0 : frac > 1 ? 1 : frac) * 200);
      if (p === pShown) return;
      pShown = p;
      const pct = p / 2 + '%';
      fill.style.width = pct;
      dot.style.left = pct;
    },
    /** pop = play the bump animation (gates and hits; not every single pickup) */
    count(n, pop) {
      if (n === cShown) return;
      const up = n > cShown;
      cShown = n;
      countText.textContent = String(n);
      if (!pop) return;
      count.classList.remove('up', 'down');
      void count.offsetWidth;
      count.classList.add(up ? 'up' : 'down');
    },
    /** a big word in the middle of the screen ('' hides it) */
    banner(text) {
      if (text === bShown) return;
      bShown = text;
      if (!text) { banner.classList.remove('on'); return; }
      banner.textContent = text;
      banner.classList.remove('on');
      void banner.offsetWidth;
      banner.classList.add('on');
    },
    /** edge streaks: 0 off, 1 running, 2 a burst after a good gate */
    speed(k) { if (k !== sShown) { sShown = k; speed.dataset.k = String(k); } },
    flash(kind) {
      flash.className = 'run-flash';
      void flash.offsetWidth;
      flash.className = 'run-flash ' + kind;
    },
  };
}
