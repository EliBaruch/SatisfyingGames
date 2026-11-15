// Shared bits for worker roles: angles, role config merging, positional sounds.
import { WORKERS } from '../config.js';

export const TAU = Math.PI * 2;
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export function turnToward(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  return Math.abs(d) <= maxStep ? cur + d : cur + (d > 0 ? maxStep : -maxStep);
}

/** Engine defaults < world.workers[role] < hire effect `options`. */
export function roleConfig(G, role, hire) {
  const w = (G.world.workers && G.world.workers[role]) || {};
  const o = (hire && hire.effect && hire.effect.options) || {};
  return { ...(WORKERS[role] || {}), ...w, ...o };
}

/** Play a positional sound without allocating: `pos` is a reusable {x, z, ...} owned by the caller. */
export function playAt(G, name, x, z, volume, opts) {
  const a = G.audio;
  if (!a || !a.play) return;
  opts.pos.x = x; opts.pos.z = z; opts.volume = volume;
  a.play(name, opts);
}
export function soundOpts() { return { pos: { x: 0, z: 0 }, volume: 1 }; }

/** Point of a zone or spot: accepts {x, z} or [x, z]. */
export function pt(p) { return Array.isArray(p) ? { x: p[0], z: p[1] } : p; }

// ---- saving (docs/ENGINE.md "Saving"): each carrying role has serialize() / restore(d)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** A number from a save, or `fallback`. */
export function num(v, fallback) { return isNum(v) ? v : fallback; }
/** Round to 3 decimals for the save. */
export const r3 = (v) => Math.round(v * 1000) / 1000;
/** Put saved item kinds back on a stack (no flight); returns how many fit. */
export function refill(stack, items) {
  let n = 0;
  if (!Array.isArray(items)) return 0;
  for (let i = 0; i < items.length; i++) if (typeof items[i] === 'string' && stack.push(items[i])) n++;
  return n;
}
