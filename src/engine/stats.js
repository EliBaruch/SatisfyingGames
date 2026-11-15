// G.stats: everything derived from the world definition, the bought pads and the perks.
// Recomputed (never mutated in place) at boot, after every purchase and after a win.
import { PLAYER } from './config.js';
import { getPadEffect } from './registry.js';

/**
 * stats = {
 *   capacity, speed, priceMult,      // player carry capacity / run speed / sale multiplier
 *   ...world.stats                   // world-specific base stats, e.g. regrow: 6
 *   open:  { stationId: true }       // stations that are active
 *   hires: [ { role, from, to, pad, n, effect } ]   // in purchase-list order
 *   staff: { stationId: { role: count } }          // hires keyed by `to` (or `from`)
 *   won:   boolean                   // the world's win pad is bought
 *   perks: { speedMul, capacityAdd } // totals applied from finished worlds
 * }
 */
export function computeStats(def, done, meta) {
  const P = { ...PLAYER, ...(def.player || {}) };
  const s = {
    capacity: P.capacity,
    speed: P.speed,
    priceMult: 1,
    ...(def.stats || {}),
    open: {},
    hires: [],
    staff: {},
    won: false,
    perks: { speedMul: 1, capacityAdd: 0 },
  };
  for (const st of def.stations || []) if (st.open) s.open[st.id] = true;
  for (const pad of def.pads || []) {
    if (!done[pad.id] || !pad.effect) continue;
    const h = getPadEffect(pad.effect.type);
    if (!h) { console.warn(`[stats] unknown pad effect '${pad.effect.type}' on pad '${pad.id}'`); continue; }
    if (h.fold) h.fold(s, pad.effect, pad, def);
  }
  // permanent perks from finished worlds: applied after the pads, so 'set'/'max'
  // capacity upgrades keep their perk bonus
  if (meta && meta.perks) {
    for (const k of Object.keys(meta.perks)) {
      const p = meta.perks[k];
      s.perks.speedMul *= p.speedMul || 1;
      s.perks.capacityAdd += p.capacityAdd || 0;
    }
  }
  s.speed *= s.perks.speedMul;
  s.capacity += s.perks.capacityAdd;
  return s;
}

/** Apply one numeric stat op: { stat, set | add | mul | min | max }. */
export function applyStatOp(s, e) {
  const k = e.stat;
  if (!k) return;
  let v = typeof s[k] === 'number' ? s[k] : 0;
  if (typeof e.set === 'number') v = e.set;
  if (typeof e.add === 'number') v += e.add;
  if (typeof e.mul === 'number') v *= e.mul;
  if (typeof e.max === 'number') v = Math.max(v, e.max);   // "at least"
  if (typeof e.min === 'number') v = Math.min(v, e.min);   // "at most"
  s[k] = v;
}
