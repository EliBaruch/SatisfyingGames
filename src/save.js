// Local save (localStorage). Never throws.
import { GAME, PADS, FLOWERS, defaultState } from './config.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const PAD_IDS = new Set(PADS.map((p) => p.id));

/** Returns a valid state: the saved values merged over defaultState(), or defaultState() on any problem. */
export function load() {
  try {
    const raw = localStorage.getItem(GAME.saveKey);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw);
    if (!isObj(saved) || saved.v !== GAME.saveVersion) return defaultState();

    const s = defaultState();
    if (isNum(saved.money)) s.money = Math.max(0, saved.money);
    if (isNum(saved.earned)) s.earned = Math.max(0, saved.earned);
    if (isNum(saved.playTime)) s.playTime = Math.max(0, saved.playTime);
    if (typeof saved.won === 'boolean') s.won = saved.won;

    if (isObj(saved.done)) {
      for (const id of Object.keys(saved.done)) {
        if (PAD_IDS.has(id) && saved.done[id] === true) s.done[id] = true;
      }
    }
    if (isObj(saved.paid)) {
      for (const id of Object.keys(saved.paid)) {
        if (PAD_IDS.has(id) && isNum(saved.paid[id]) && saved.paid[id] >= 0) s.paid[id] = saved.paid[id];
      }
    }
    if (isObj(saved.player) && isNum(saved.player.x) && isNum(saved.player.z)) {
      s.player = { x: saved.player.x, z: saved.player.z };
    }
    if (Array.isArray(saved.carried)) {
      s.carried = saved.carried.filter((t) => Number.isInteger(t) && t >= 0 && t < FLOWERS.length);
    }
    for (const key of ['stock', 'cash']) {
      if (!Array.isArray(saved[key])) continue;
      for (let i = 0; i < 4; i++) {
        const v = saved[key][i];
        s[key][i] = isNum(v) && v > 0 ? v : 0;
      }
    }
    return s;
  } catch (e) {
    return defaultState();
  }
}

/** Writes the state as JSON. Never throws. */
export function save(state) {
  try {
    localStorage.setItem(GAME.saveKey, JSON.stringify({ ...state, v: GAME.saveVersion }));
  } catch (e) {
    /* storage full or blocked: ignore */
  }
}

/** Removes the save. Never throws. */
export function clear() {
  try {
    localStorage.removeItem(GAME.saveKey);
  } catch (e) {
    /* ignore */
  }
}
