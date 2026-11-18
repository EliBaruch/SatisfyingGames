// DOM for the mini-mode host (engine/modes): the curtain that covers camera cuts, the round HUD
// button that opens the bonus-level sheet, the sheet itself (one section per level type) and the
// result card. Built from JS; styled by styles/run.css. Every method is safe without a document.
import { fmtMoney } from '../config.js';

const STAR_PATH = 'M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8L2.2 9.3l6.9-.8z';
const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v18.500" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>'
  + '<path d="M6 4.300c3.600-1.700 6.300 1.600 12.500-.300v9.200c-6.200 1.900-8.900-1.400-12.500.300z" fill="#fff"/>'
  + '<path d="M6 4.300c1.500-.700 2.800-.550 4.100-.150v4.500c-1.300-.400-2.600-.550-4.100.150zM10.100 8.650c1.400.450 2.800 1.100 4.300 1.300v4.600c-1.500-.200-2.900-.850-4.300-1.300zM14.400 5.350c1.300.150 2.600.050 4.100-.400v4.600c-1.500.450-2.800.550-4.100.400z" fill="#3a2a55"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10.500" rx="3" fill="currentColor"/>'
  + '<path d="M8.500 11V8a3.500 3.500 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2.600" stroke-linecap="round"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round"/></svg>';
const BILL = '<svg viewBox="0 0 48 32" aria-hidden="true"><rect x="1" y="3" width="46" height="26" rx="5" fill="#2e9e44" stroke="#17602a" stroke-width="2"/>'
  + '<rect x="5" y="7" width="38" height="18" rx="3" fill="#5fd06d"/><circle cx="24" cy="16" r="6.500" fill="#c8f7c9" stroke="#2e9e44" stroke-width="2"/></svg>';

export const ICONS = { star: STAR, flag: FLAG, lock: LOCK, bill: BILL };

export function createModesUi(G, on) {
  const doc = typeof document !== 'undefined' ? document : null;
  const noop = () => {};
  if (!doc || !doc.body) {
    return { curtain: noop, setMode: noop, button: noop, bubble: noop, sheet: noop, sheetOpen: false, result: noop, resultStar: noop, resultLine: noop, resultHide: noop };
  }
  const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  // ---- curtain: a full-screen fade in the sky colour, closed while the camera cuts
  const curtain = el('div', 'mode-curtain');
  try { curtain.style.setProperty('--mode-sky', '#' + G.scene.background.getHexString()); } catch (e) { /* default colour */ }
  doc.body.append(curtain);

  // ---- entry button (bottom right) and the "new level" bubble
  const btn = el('button', 'mode-btn', FLAG + '<i class="mode-badge"></i>');
  btn.type = 'button';
  btn.hidden = true;
  btn.setAttribute('aria-label', 'Bonus levels');
  const bubble = el('div', 'mode-bubble');
  bubble.hidden = true;
  doc.body.append(btn, bubble);
  btn.addEventListener('click', () => on.open());
  let bubbleTimer = 0;

  // ---- level sheet
  const sheet = el('div', 'mode-sheet');
  sheet.setAttribute('aria-hidden', 'true');
  const card = el('div', 'mode-sheet-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Bonus levels');
  const close = el('button', 'mode-close', CLOSE);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  const head = el('h2', 'mode-sheet-title');
  head.textContent = 'BONUS LEVELS';
  const secs = el('div', 'mode-sections');
  card.append(close, head, secs);
  sheet.append(card);
  doc.body.append(sheet);
  let sheetOpen = false;
  close.addEventListener('click', () => on.close());
  sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) on.close(); });
  secs.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('.mode-tile') : null;
    if (!t || t.classList.contains('is-locked')) return;
    on.pick(t.dataset.type, +t.dataset.n);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen) on.close(); });

  function renderSheet(sections) {
    secs.textContent = '';
    for (const sec of sections) {
      const box = el('section', 'mode-sec');
      const hd = el('header', 'mode-sec-head');
      const ic = el('span', 'mode-sec-icon', sec.icon || FLAG);
      const tx = el('div', 'mode-sec-text');
      const b = el('b'); b.textContent = sec.title || sec.type;
      tx.append(b);
      if (sec.sub) { const s = el('span'); s.textContent = sec.sub; tx.append(s); }
      hd.append(ic, tx);
      const tiles = el('div', 'mode-tiles');
      let next = -1;
      for (const l of sec.list) if (l.unlocked && l.stars < 3 && next < 0) next = l.n;
      for (const l of sec.list) {
        const t = el('button', 'mode-tile' + (l.unlocked ? '' : ' is-locked') + (l.n === next ? ' is-next' : '') + (l.isNew ? ' is-new' : ''));
        t.type = 'button';
        t.dataset.type = sec.type;
        t.dataset.n = l.n;
        t.setAttribute('aria-disabled', String(!l.unlocked));
        const num = el('span', 'mt-num');
        num.textContent = String(l.n);
        const stars = el('span', 'mt-stars');
        for (let i = 0; i < 3; i++) stars.append(el('i', i < l.stars ? 'on' : '', STAR));
        const foot = el('span', 'mt-foot');
        if (!l.unlocked) { foot.innerHTML = LOCK; const s = el('span'); s.textContent = l.need || 'Locked'; foot.append(s); }
        else if (l.best > 0) foot.textContent = 'BEST ' + fmtMoney(l.best);
        else foot.textContent = 'NEW';
        t.setAttribute('aria-label', `Level ${l.n}, ${l.unlocked ? (l.stars + ' of 3 stars') : 'locked: ' + (l.need || '')}`);
        t.append(num, stars, foot);
        if (l.n === next) { const p = el('span', 'mt-play'); p.textContent = 'PLAY'; t.append(p); }
        tiles.append(t);
      }
      box.append(hd, tiles);
      secs.append(box);
    }
  }

  // ---- result card
  const result = el('div', 'mode-result');
  result.setAttribute('aria-hidden', 'true');
  const rc = el('div', 'mode-result-card');
  rc.setAttribute('role', 'dialog');
  const rKicker = el('p', 'mode-kicker');
  const rTitle = el('h2', 'mode-result-title');
  const rStars = el('div', 'mode-stars');
  const starEls = [];
  for (let i = 0; i < 3; i++) { const s = el('span', 'ms', STAR); rStars.append(s); starEls.push(s); }
  const rBest = el('p', 'mode-newbest');
  rBest.textContent = 'NEW BEST!';
  const rLines = el('dl', 'mode-lines');
  const rCash = el('div', 'mode-cash', BILL + '<b></b>');
  const rCashText = rCash.querySelector('b');
  const rNote = el('p', 'mode-note');
  const rActions = el('div', 'mode-actions');
  const bRetry = el('button', 'mode-retry');
  bRetry.type = 'button';
  const bGo = el('button', 'mode-continue');
  bGo.type = 'button';
  rActions.append(bRetry, bGo);
  rc.append(rKicker, rTitle, rStars, rBest, rLines, rCash, rNote, rActions);
  result.append(rc);
  doc.body.append(result);
  bRetry.addEventListener('click', () => on.retry());
  bGo.addEventListener('click', () => on.resume());
  const lineEls = [];

  return {
    curtain(closed) { curtain.classList.toggle('on', !!closed); },
    /** the world HUD hides behind this body class while a mode runs */
    setMode(inMode) { doc.body.classList.toggle('in-mode', !!inMode); },
    /** state: '' (hidden) | 'locked' | 'open' | 'new' */
    button(state) {
      btn.hidden = !state;
      btn.dataset.state = state || '';
    },
    bubble(text) {
      clearTimeout(bubbleTimer);
      if (!text) { bubble.hidden = true; return; }
      bubble.textContent = text;
      bubble.hidden = false;
      bubble.classList.remove('in');
      void bubble.offsetWidth;
      bubble.classList.add('in');
      bubbleTimer = setTimeout(() => { bubble.hidden = true; }, 4200);     // presentation only
    },
    sheet(sections) {
      sheetOpen = !!sections;
      if (sections) renderSheet(sections);
      sheet.classList.toggle('show', sheetOpen);
      sheet.setAttribute('aria-hidden', String(!sheetOpen));
    },
    get sheetOpen() { return sheetOpen; },
    /** o: { kicker, title, stars (0-3, -1 = no star row), lines: [{ label, text }], cash, note, newBest, retry, resume } */
    result(o) {
      rKicker.textContent = o.kicker || '';
      rKicker.hidden = !o.kicker;
      rTitle.textContent = o.title || '';
      rStars.hidden = !(o.stars >= 0);
      for (const s of starEls) s.classList.remove('on');
      rBest.hidden = !o.newBest;
      rLines.textContent = '';
      lineEls.length = 0;
      for (const l of o.lines || []) {
        const row = el('div', 'mode-line' + (l.accent ? ' is-accent' : ''));
        const dt = el('dt'); dt.textContent = l.label;
        const dd = el('dd'); dd.textContent = l.text;
        row.append(dt, dd);
        rLines.append(row);
        lineEls.push(dd);
      }
      rCash.hidden = !(o.cash > 0);
      rCashText.textContent = o.cash > 0 ? '+' + fmtMoney(o.cash) : '';
      rNote.textContent = o.note || '';
      rNote.hidden = !o.note;
      bRetry.textContent = o.retry || 'RETRY';
      bRetry.hidden = o.retry === false;
      bGo.textContent = o.resume || 'CONTINUE';
      result.classList.add('show');
      result.setAttribute('aria-hidden', 'false');
    },
    resultStar(i) { if (starEls[i]) starEls[i].classList.add('on'); },
    resultLine(i, text) { if (lineEls[i]) lineEls[i].textContent = text; },
    resultHide() { result.classList.remove('show'); result.setAttribute('aria-hidden', 'true'); },
  };
}
