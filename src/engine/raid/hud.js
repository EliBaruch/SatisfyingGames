// The raid's own HUD (DOM): a leave button, the stockpile bar, the coin count, the wave indicator
// with one pip per wave, the WAVE banner and a red flash when an item is carried off.
// Text and styles are only written when they change. Styled by styles/raid.css.
const LEAVE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.500 6.500l11 11M17.500 6.500l-11 11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
const CRATE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="15" rx="3" fill="#fff"/>'
  + '<path d="M3.500 10h17M3.500 15h17M9 5.500v14M15 5.500v14" fill="none" stroke="#2b2440" stroke-width="1.600" opacity=".55"/></svg>';
const COIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#b97800"/><circle cx="12" cy="11" r="8.500" fill="#ffc928"/>'
  + '<circle cx="12" cy="11" r="5.200" fill="#ffe58a"/></svg>';
export const SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.500l8 2.800v6.200c0 5-3.300 8.600-8 10-4.700-1.400-8-5-8-10V5.300z" fill="#fff"/>'
  + '<path d="M12 5.300l5.300 1.900v4.300c0 3.500-2.100 6-5.300 7.200z" fill="#3a2a55" opacity=".85"/></svg>';

export function createRaidHud(G, on) {
  const doc = typeof document !== 'undefined' ? document : null;
  const noop = () => {};
  if (!doc || !doc.body) return { show: noop, pile: noop, coins: noop, wave: noop, banner: noop, flash: noop };
  const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  const hud = el('div', 'raid-hud');
  const top = el('div', 'raid-top');
  const leave = el('button', 'raid-leave', LEAVE);
  leave.type = 'button';
  leave.setAttribute('aria-label', 'Leave the raid');
  leave.addEventListener('click', () => on.leave());
  const pile = el('div', 'raid-pile');
  const pileIcon = el('span', 'raid-pile-icon', CRATE);
  const bar = el('div', 'raid-bar');
  const fill = el('i', 'raid-bar-fill');
  const barText = el('b');
  bar.append(fill, barText);
  pile.append(pileIcon, bar);
  const coins = el('div', 'raid-coins', COIN);
  const coinText = el('b');
  coinText.textContent = '0';
  coins.append(coinText);
  top.append(leave, pile, coins);
  const wave = el('div', 'raid-wave');
  const waveText = el('b');
  const pips = el('span', 'raid-pips');
  wave.append(waveText, pips);
  hud.append(top, wave);

  const banner = el('div', 'raid-banner');
  const bannerText = el('b');
  const bannerSub = el('span');
  banner.append(bannerText, bannerSub);
  const flash = el('div', 'raid-flash');
  doc.body.append(flash, hud, banner);

  let pShown = -1, tShown = -1, cShown = -1, wShown = -1, wTotal = -1, bShown = '';
  return {
    show(v) { hud.classList.toggle('on', !!v); },
    /** items on the pile, of how many */
    pile(left, total, pop) {
      const key = left * 1000 + total;
      if (key === pShown) return;
      pShown = key;
      const f = total > 0 ? left / total : 0;
      fill.style.width = Math.round(f * 1000) / 10 + '%';
      barText.textContent = left + ' / ' + total;
      const tone = f >= 0.8 ? 'good' : f >= 0.45 ? 'ok' : 'low';
      if (tone !== tShown) { tShown = tone; pile.dataset.tone = tone; }
      if (!pop) return;
      pile.classList.remove('hit');
      void pile.offsetWidth;
      pile.classList.add('hit');
    },
    coins(n, pop) {
      if (n === cShown) return;
      const up = n > cShown;
      cShown = n;
      coinText.textContent = String(n);
      if (!pop || !up) return;
      coins.classList.remove('up');
      void coins.offsetWidth;
      coins.classList.add('up');
    },
    /** wave w (1-based; 0 = not yet) of total */
    wave(w, total) {
      if (total !== wTotal) {
        wTotal = total; wShown = -1;
        pips.textContent = '';
        for (let i = 0; i < total; i++) pips.append(el('i'));
      }
      if (w === wShown) return;
      wShown = w;
      waveText.textContent = w > 0 ? 'WAVE ' + w + ' / ' + total : 'GET READY';
      for (let i = 0; i < pips.children.length; i++) pips.children[i].className = i < w - 1 ? 'done' : i === w - 1 ? 'on' : '';
    },
    /** a big word in the middle of the screen with a small line under it ('' hides it) */
    banner(text, sub, tone) {
      const key = text + '|' + (sub || '');
      if (key === bShown) return;
      bShown = key;
      if (!text) { banner.classList.remove('on'); return; }
      bannerText.textContent = text;
      bannerSub.textContent = sub || '';
      banner.dataset.tone = tone || '';
      banner.classList.remove('on');
      void banner.offsetWidth;
      banner.classList.add('on');
    },
    flash(kind) {
      flash.className = 'raid-flash';
      void flash.offsetWidth;
      flash.className = 'raid-flash ' + kind;
    },
  };
}
