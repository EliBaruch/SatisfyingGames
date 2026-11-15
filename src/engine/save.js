// Save v2 (localStorage). Never throws.
//
// {
//   v: 2,
//   level: 'flower',                       // world to open on the next plain boot
//   meta: { perks: { <worldId>: { speedMul, capacityAdd } }, totalEarned, playTime,
//           finished: { <worldId>: true }, ...unknown keys kept },
//   levels: { <worldId>: LevelState },     // each world keeps its own progress
//   ...unknown top-level keys are kept as they are
// }
// LevelState = { money, earned, playTime, won, done: {padId: true}, paid: {padId: n},
//                player: {x, z}, carried: [itemId...], stations: {stationId: any} }
//
// Only the level of the world being played is sanitised (against its definition);
// other worlds' levels are kept untouched until they are loaded.
// A v1 save (key bloomrush.save.v1, the single-world game) is wrapped as
// levels.flower = { $v1: <old save> } and converted by the flower world's
// `migrateV1(old)` the first time that world loads. The v1 key is removed after the
// first successful v2 write.
import { GAME } from './config.js';
import { getItem } from './registry.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const nonNeg = (v) => (isNum(v) && v > 0 ? v : 0);

export function defaultMeta() {
  return { perks: {}, totalEarned: 0, playTime: 0, finished: {} };
}

export function defaultSave() {
  return { v: GAME.saveVersion, level: GAME.defaultWorld, meta: defaultMeta(), levels: {} };
}

function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function sanitizeMeta(m) {
  const out = { ...(isObj(m) ? m : {}) };       // unknown keys survive
  out.totalEarned = nonNeg(out.totalEarned);
  out.playTime = nonNeg(out.playTime);
  const fin = {};
  if (isObj(out.finished)) for (const k of Object.keys(out.finished)) if (out.finished[k] === true) fin[k] = true;
  out.finished = fin;
  const perks = {};
  if (isObj(out.perks)) {
    for (const k of Object.keys(out.perks)) {
      const p = out.perks[k];
      if (!isObj(p)) continue;
      perks[k] = {
        speedMul: isNum(p.speedMul) && p.speedMul > 0 && p.speedMul < 10 ? p.speedMul : 1,
        capacityAdd: isNum(p.capacityAdd) && p.capacityAdd >= 0 && p.capacityAdd < 1000 ? Math.floor(p.capacityAdd) : 0,
      };
    }
  }
  out.perks = perks;
  return out;
}

/** Wrap a v1 save into a fresh v2 save. */
export function migrateV1(v1) {
  const s = defaultSave();
  s.level = 'flower';
  s.meta.totalEarned = nonNeg(v1.earned);
  s.meta.playTime = nonNeg(v1.playTime);
  s.levels.flower = { $v1: v1 };
  return s;
}

/** Load the whole save (v2, else migrated v1, else fresh). Never throws. */
export function loadSave() {
  try {
    const saved = readKey(GAME.saveKey);
    if (isObj(saved) && saved.v === GAME.saveVersion) {
      const s = { ...saved };                    // unknown top-level keys survive
      s.level = typeof s.level === 'string' && s.level ? s.level : GAME.defaultWorld;
      s.meta = sanitizeMeta(s.meta);
      s.levels = isObj(s.levels) ? s.levels : {};
      return s;
    }
    const v1 = readKey(GAME.legacySaveKey);
    if (isObj(v1) && v1.v === 1) return migrateV1(v1);
  } catch (e) { /* fall through */ }
  return defaultSave();
}

/** A fresh level state for a world definition. */
export function freshLevel(def) {
  const st = (def.player && def.player.start) || { x: 0, z: 0 };
  return {
    money: 0, earned: 0, playTime: 0, won: false,
    done: {}, paid: {},
    player: { x: st.x, z: st.z },
    carried: [],
    stations: {},
  };
}

/**
 * Sanitise one level against its world definition. Item kinds must be registered
 * first (carried items of unknown kinds are dropped). Unknown keys are kept.
 */
export function sanitizeLevel(def, raw) {
  const s = freshLevel(def);
  if (isObj(raw) && isObj(raw.$v1)) {
    if (typeof def.migrateV1 === 'function') {
      try { raw = def.migrateV1(raw.$v1); } catch (e) { console.error('[save] v1 migration failed:', e); raw = null; }
    } else raw = null;
  }
  if (!isObj(raw)) return s;
  for (const k of Object.keys(raw)) if (!(k in s) && k !== '$v1') s[k] = raw[k];
  s.money = nonNeg(raw.money);
  s.earned = nonNeg(raw.earned);
  s.playTime = nonNeg(raw.playTime);
  s.won = raw.won === true;
  const padIds = new Set((def.pads || []).map((p) => p.id));
  if (isObj(raw.done)) for (const id of Object.keys(raw.done)) if (padIds.has(id) && raw.done[id] === true) s.done[id] = true;
  if (isObj(raw.paid)) {
    for (const id of Object.keys(raw.paid)) {
      if (padIds.has(id) && !s.done[id] && isNum(raw.paid[id]) && raw.paid[id] > 0) s.paid[id] = raw.paid[id];
    }
  }
  if (isObj(raw.player) && isNum(raw.player.x) && isNum(raw.player.z)) {
    const b = def.bounds;
    let { x, z } = raw.player;
    if (b) { x = Math.min(b.maxX, Math.max(b.minX, x)); z = Math.min(b.maxZ, Math.max(b.minZ, z)); }
    s.player = { x, z };
  }
  if (Array.isArray(raw.carried)) {
    s.carried = raw.carried.filter((k) => typeof k === 'string' && k !== 'cash' && getItem(k)).slice(0, 2000);
  }
  if (isObj(raw.stations)) {
    const ids = new Set((def.stations || []).map((d) => d.id));
    for (const id of Object.keys(raw.stations)) if (ids.has(id) && raw.stations[id] != null) s.stations[id] = raw.stations[id];
  }
  return s;
}

/** Write the whole save. Returns true on success. Never throws. */
export function writeSave(save) {
  try {
    localStorage.setItem(GAME.saveKey, JSON.stringify({ ...save, v: GAME.saveVersion }));
    try { if (localStorage.getItem(GAME.legacySaveKey) !== null) localStorage.removeItem(GAME.legacySaveKey); } catch (e) { /* ignore */ }
    return true;
  } catch (e) {
    return false; // storage full or blocked
  }
}

/** Remove all progress (every world). Never throws. */
export function clearSave() {
  try { localStorage.removeItem(GAME.saveKey); } catch (e) { /* ignore */ }
  try { localStorage.removeItem(GAME.legacySaveKey); } catch (e) { /* ignore */ }
}
