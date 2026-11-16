// HUD for the thrills: fever bar, star slots, boost chips, the rush-order card, a tip line and
// an edge pointer toward an event that is off screen. DOM only; text is rewritten only when it
// changes. Every method is safe to call when the page has no HUD (tests, broken markup).
import * as THREE from 'three';

const STAR_PATH = 'M12 2.2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.4l-6.1 3.4 1.4-6.8L2.2 9.3l6.9-.8z';
const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8c4.6 3.9 7.2 7.6 7.2 12a7.2 7.2 0 0 1-14.4 0c0-2.7 1.2-4.9 3-6.6.5 1.9 1.4 2.9 2.4 3.2C9.7 7.300 10.300 4.300 12 1.800z" fill="#ff7a1a" stroke="#7a2400" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="12" cy="16.2" rx="3.1" ry="4.300" fill="#ffe14d"/></svg>';
const BOLT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 1.500L4.500 13.500h5.300L8.300 22.500l9.700-12.500h-5.500z" fill="#ffe14d" stroke="#7a5200" stroke-width="1.5" stroke-linejoin="round"/></svg>';
const CLOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8.5" fill="#fff" stroke="#1d2b1f" stroke-width="2.2"/><path d="M12 8.300v5l3.200 2M9.500 2.500h5" fill="none" stroke="#1d2b1f" stroke-width="2.2" stroke-linecap="round"/></svg>';

const mmss = (s) => { s = Math.max(0, Math.ceil(s)); const m = (s / 60) | 0, r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; };

export function createThrillUi(G) {
  const doc = typeof document !== 'undefined' ? document : null;
  const hud = doc && doc.getElementById('hud');
  const topbar = doc && doc.getElementById('topbar');
  const money = doc && doc.getElementById('money');
  const goal = doc && doc.getElementById('goal');
  const noop = () => {};
  if (!hud || !topbar || !money) {
    return { setFever: noop, setStars: noop, starPop: noop, setBoost: noop, order: noop, orderProgress: noop, orderEnd: noop, tip: noop, point: noop, frame: noop, show: noop };
  }
  const el = (tag, cls, html) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  // ---- row under the money: fever bar + star slots
  const row = el('div', 'thrill-row');
  row.hidden = true;
  const fever = el('div', 'thrill-fever');
  const feverIcon = el('span', 'tf-icon', FLAME);
  const feverTrack = el('span', 'tf-track');
  const feverFill = el('i', 'tf-fill');
  const feverText = el('b', 'tf-text');
  feverTrack.append(feverFill, feverText);
  fever.append(feverIcon, feverTrack);
  const stars = el('div', 'thrill-stars');
  const starEls = [];
  for (let i = 0; i < 3; i++) { const s = el('span', 'ts', `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`); stars.append(s); starEls.push(s); }
  row.append(fever, stars);
  money.after(row);

  // ---- boost chips (timed boosts that are running)
  const boosts = el('div', 'thrill-boosts');
  row.after(boosts);
  const chips = new Map();   // id -> { el, text, shown }

  // ---- rush order card
  const order = el('div', 'thrill-order');
  order.hidden = true;
  const orderFill = el('i', 'to-fill');
  const orderIcon = el('span', 'to-icon', CLOCK);
  const orderText = el('span', 'to-text');
  const orderTime = el('b', 'to-time');
  const orderPay = el('span', 'to-pay');
  order.append(orderFill, orderIcon, orderText, orderTime, orderPay);
  (goal || row).after(order);

  // ---- tip line
  const tipEl = el('div', 'thrill-tip');
  tipEl.hidden = true;
  order.after(tipEl);

  // ---- edge pointer + fever glow
  const pointer = el('div', 'thrill-pointer', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l9 12h-5.500v8h-7v-8H3z" fill="#ffd23f" stroke="#7a5200" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  pointer.hidden = true;
  hud.append(pointer);
  const glow = el('div', 'thrill-glow');
  doc.body.append(glow);

  // ------------------------------------------------------------------ fever
  let fW = -1, fOn = null, fTxt = '';
  function setFever(frac, active, left) {
    const w = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    if (w !== fW) { fW = w; feverFill.style.width = w + '%'; }
    if (active !== fOn) {
      fOn = active;
      fever.classList.toggle('on', !!active);
      doc.body.classList.toggle('fever', !!active);
    }
    const t = active ? 'FEVER x2  ' + Math.ceil(left) : (w >= 100 ? 'FEVER!' : '');
    if (t !== fTxt) { fTxt = t; feverText.textContent = t; }
  }

  // ------------------------------------------------------------------ stars
  let starN = -1;
  function setStars(n) {
    if (n === starN) return;
    starN = n;
    for (let i = 0; i < starEls.length; i++) starEls[i].classList.toggle('on', i < n);
  }
  function starPop() {
    stars.classList.remove('pop');
    void stars.offsetWidth;
    stars.classList.add('pop');
  }

  // ------------------------------------------------------------------ boosts
  function setBoost(id, label, left) {
    let c = chips.get(id);
    if (!(left > 0)) {
      if (c && c.shown) { c.shown = false; c.el.hidden = true; }
      return;
    }
    if (!c) {
      c = { el: el('div', 'thrill-chip', BOLT), text: el('b'), shown: false, s: -1 };
      c.el.append(c.text);
      c.el.dataset.boost = id;
      boosts.append(c.el);
      chips.set(id, c);
    }
    const s = Math.ceil(left);
    if (s !== c.s) { c.s = s; c.text.textContent = label + ' ' + s; }
    if (!c.shown) { c.shown = true; c.el.hidden = false; }
  }

  // ------------------------------------------------------------------ order
  let oW = -1, oT = '', oLate = null, orderTimer = 0;
  function showOrder(text, pay) {
    clearTimeout(orderTimer);
    orderText.textContent = text;
    orderPay.textContent = pay;
    order.classList.remove('done', 'gone', 'late');
    oW = -1; oT = ''; oLate = null;
    order.hidden = false;
    order.classList.remove('in');
    void order.offsetWidth;
    order.classList.add('in');
  }
  function orderProgress(frac, left, late, text) {
    const w = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    if (w !== oW) { oW = w; orderFill.style.width = w + '%'; }
    const t = mmss(left);
    if (t !== oT) { oT = t; orderTime.textContent = t; }
    if (late !== oLate) { oLate = late; order.classList.toggle('late', !!late); }
    if (text && orderText.textContent !== text) orderText.textContent = text;
  }
  function orderEnd(done, text) {
    clearTimeout(orderTimer);
    if (text) orderText.textContent = text;
    order.classList.toggle('done', !!done);
    order.classList.toggle('gone', !done);
    if (done) { orderFill.style.width = '100%'; oW = 100; }
    orderTimer = setTimeout(() => { order.hidden = true; }, done ? 1900 : 1100);
  }

  // ------------------------------------------------------------------ tip
  let tipTimer = 0;
  function tip(text, seconds = 4) {
    clearTimeout(tipTimer);
    if (!text) { tipEl.hidden = true; return; }
    tipEl.textContent = text;
    tipEl.hidden = false;
    tipEl.classList.remove('in');
    void tipEl.offsetWidth;
    tipEl.classList.add('in');
    tipTimer = setTimeout(() => { tipEl.hidden = true; }, seconds * 1000);
  }

  // ------------------------------------------------------------------ pointer
  // Shown at the screen edge when the target (world x, z) is out of view.
  const P = { on: false, x: 0, z: 0 };
  const v = new THREE.Vector3();
  let pShown = false;
  function point(x, z, on) { P.on = !!on; P.x = x; P.z = z; }
  function frame() {
    let show = false;
    if (P.on && G.camera) {
      v.set(P.x, 1.2, P.z).project(G.camera);
      const out = Math.abs(v.x) > 0.92 || v.y > 0.72 || v.y < -0.9;
      if (out) {
        show = true;
        const W = window.innerWidth || 1, H = window.innerHeight || 1;
        // direction from the screen centre, clamped to an inset box
        let dx = v.x, dy = v.y;
        const m = Math.max(Math.abs(dx) / 0.84, dy > 0 ? dy / 0.62 : -dy / 0.8, 1e-6);
        dx /= m; dy /= m;
        const sx = (dx * 0.5 + 0.5) * W, sy = (-dy * 0.5 + 0.5) * H;
        const ang = Math.atan2(dx * W, dy * H);    // 0 = up
        pointer.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) rotate(${ang.toFixed(3)}rad)`;
      }
    }
    if (show !== pShown) { pShown = show; pointer.hidden = !show; }
  }

  return {
    setFever, setStars, starPop, setBoost, order: showOrder, orderProgress, orderEnd, tip, point, frame,
    /** the fever bar and stars stay hidden until the first thrill has been seen */
    show(on) { if (row.hidden === !!on) row.hidden = !on; },
  };
}
