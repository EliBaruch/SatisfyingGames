// HUD: money counter, goal line, toast, win screen, start overlay, mute and reset buttons.
// Hooks for UI work (title screen, world cards, win card): see docs/ENGINE.md "HUD hooks".
// Every DOM element is optional except #money/#money-value/#goal/#toast; missing ones are skipped.
import { fmtMoney } from './config.js';

const ROLL_TIME = 0.4;     // seconds for the counter to reach its target
const POP_COOLDOWN = 0.12; // min seconds between pops
const TOAST_MS = 1800;

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const moneyEl = $('money');
  const moneyValue = $('money-value');
  const goalEl = $('goal');
  const toastEl = $('toast');
  const startEl = $('start');
  const winEl = $('win');
  const winTime = $('win-time');
  const winEarned = $('win-earned');
  const winKeep = $('win-keep');
  const winNext = $('win-next');          // optional "next world" button
  const winNextName = $('win-next-name'); // optional label for the next world's name
  const muteBtn = $('btn-mute');
  const resetBtn = $('btn-reset');
  const iconOn = muteBtn ? muteBtn.querySelector('.icon-on') : null;
  const iconOff = muteBtn ? muteBtn.querySelector('.icon-off') : null;

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
  }

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
    toastEl.textContent = String(text);
    clearTimeout(toastTimer);
    toastEl.classList.remove('show');
    void toastEl.offsetWidth; // restart the bounce-in
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), TOAST_MS);
  }

  // ---- win screen
  // info: { time, earned, next: { id, name } | null }. If the page has #win-next it is
  // shown when there is a next world and travels there on click.
  let nextId = null;
  function showWin({ time, earned, next = null } = {}) {
    if (!winEl) return;
    if (winTime) winTime.textContent = formatTime(time);
    if (winEarned) winEarned.textContent = fmtMoney(earned || 0);
    nextId = next && next.id ? next.id : null;
    if (winNext) winNext.hidden = !nextId;
    if (winNextName) winNextName.textContent = next && next.name ? next.name : '';
    winEl.classList.add('show');
    winEl.setAttribute('aria-hidden', 'false');
    G.events.emit('hud:win-shown', { time, earned, next });
  }
  function hideWin() {
    if (!winEl) return;
    winEl.classList.remove('show');
    winEl.setAttribute('aria-hidden', 'true');
  }

  if (winKeep) winKeep.addEventListener('click', hideWin);
  if (winNext) winNext.addEventListener('click', () => { if (nextId && G.travel) G.travel(nextId); });

  // ---- start overlay: first pointerdown anywhere dismisses it
  function dismissStart() {
    if (startEl) startEl.classList.remove('show');
    window.removeEventListener('pointerdown', dismissStart);
  }
  window.addEventListener('pointerdown', dismissStart);

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

  return { update, setGoal, toast, showWin, hideWin };
}
