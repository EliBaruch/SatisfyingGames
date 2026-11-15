// HUD: money counter, goal line, toast, win screen, start overlay, mute and reset buttons.
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
  const muteBtn = $('btn-mute');
  const resetBtn = $('btn-reset');
  const iconOn = muteBtn.querySelector('.icon-on');
  const iconOff = muteBtn.querySelector('.icon-off');

  // ---- money counter
  let target = G.state.money;
  let lastTarget = target;
  let shown = target;
  let rollFrom = target;
  let rollT = ROLL_TIME;
  let popCooldown = 0;
  let shownText = fmtMoney(shown);
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

    const text = fmtMoney(shown);
    if (text !== shownText) {
      shownText = text;
      moneyValue.textContent = text;
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
  function showWin({ time, earned } = {}) {
    winTime.textContent = formatTime(time);
    winEarned.textContent = fmtMoney(earned || 0);
    winEl.classList.add('show');
    winEl.setAttribute('aria-hidden', 'false');
  }

  winKeep.addEventListener('click', () => {
    winEl.classList.remove('show');
    winEl.setAttribute('aria-hidden', 'true');
  });

  // ---- start overlay: first pointerdown anywhere dismisses it
  function dismissStart() {
    startEl.classList.remove('show');
    window.removeEventListener('pointerdown', dismissStart);
  }
  window.addEventListener('pointerdown', dismissStart);

  // ---- mute
  function refreshMute() {
    const muted = !!(G.audio && G.audio.muted);
    iconOn.hidden = muted;
    iconOff.hidden = !muted;
    muteBtn.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
    muteBtn.setAttribute('aria-pressed', String(muted));
  }

  muteBtn.addEventListener('click', () => {
    if (!G.audio || typeof G.audio.setMuted !== 'function') return;
    G.audio.setMuted(!G.audio.muted);
    refreshMute();
  });
  refreshMute();

  // ---- reset
  resetBtn.addEventListener('click', () => {
    if (window.confirm('Reset all progress?')) G.events.emit('reset', {});
  });

  return { update, setGoal, toast, showWin };
}
