// Harvest Rush levels: where every item of the carpet lies, the pick-ups and the obstacles, generated
// from a seed (world id + level number) for a field of a given size, so a level is always the same on
// the same screen shape. The carpet is laid in three passes that reject anything closer than MIN_GAP
// to an item already down: crop rows in tilted patches, spirals, then drifts that fill what is left.
//
//   buildLevel(worldId, n, W, H) -> level
//     level.n, time, W, H            the level number, its clock (s) and the field size (a across, b up)
//     level.count                    items on the field
//     level.a / b / yaw              Float32Array(count): position (0,0 = the middle) and heading
//     level.picks                    [{ type, a, b }]            WIDER | MAGNET | DOUBLE | TIME
//     level.bales                    [{ a, b, r, yaw }]          solid: steer around
//     level.mud                      [{ a, b, r }]               slows
//     level.t                        [t1, t2, t3] counts that fill truck 1, 2 and 3 (= the stars)
//     level.start                    { a, b } where the hero begins (the bottom left corner)
//
// The typed arrays are owned by this module and reused by the next build: nothing here is per step.
import { rng } from '../geom.js';

export const LEVELS = 3;
export const WIDER = 0, MAGNET = 1, DOUBLE = 2, TIME = 3;
export const ITEM_CAP = 2000;
export const MIN_GAP = 0.47;
/** area in square units, items, seconds, pick-ups, bales, mud patches */
export const PLAN = {
  1: { area: 780, items: 1300, time: 30, picks: [WIDER, DOUBLE, MAGNET, TIME], bales: 0, mud: 0 },
  2: { area: 900, items: 1650, time: 35, picks: [DOUBLE, WIDER, TIME, MAGNET, WIDER], bales: 5, mud: 2 },
  3: { area: 1020, items: 2000, time: 40, picks: [WIDER, MAGNET, DOUBLE, TIME, DOUBLE, MAGNET], bales: 8, mud: 3 },
};
/** share of `items` (the count with no multiplier at all) that fills each truck */
export const STARS = [0.4, 1.15, 2.05];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function nice(n) {
  const p = n >= 1000 ? 50 : n >= 200 ? 10 : 5;
  return Math.max(p, Math.round(n / p) * p);
}

const A = new Float32Array(ITEM_CAP), B = new Float32Array(ITEM_CAP), YAW = new Float32Array(ITEM_CAP);
let grid = new Int16Array(0);
let last = null, lastKey = '';

/** the field's size for a level: its area is fixed, its shape follows the screen (ratio = W / H) */
export function fieldSize(n, ratio) {
  const cfg = PLAN[clamp(n | 0, 1, LEVELS)];
  const W = Math.round(Math.sqrt(cfg.area * ratio) * 2) / 2;
  return { W, H: Math.round((cfg.area / W) * 2) / 2 };
}

export function buildLevel(worldId, n, W, H) {
  n = clamp(n | 0, 1, LEVELS);
  const key = worldId + ':' + n + ':' + W + ':' + H;
  if (last && key === lastKey) return last;
  const cfg = PLAN[n];
  const rnd = rng(hashStr(String(worldId) + ':harvest-rush:' + n));
  const hw = W / 2, hh = H / 2, edge = 0.75;
  const start = { a: -hw + 2.4, b: -hh + 2.2 };
  const far = (x, y, list, d) => { for (const o of list) if (Math.hypot(o.a - x, o.b - y) < d + (o.r || 0)) return false; return true; };

  // ---- obstacles and pick-ups first: the carpet is laid around them
  const bales = [], mud = [], picks = [];
  let guard = 0;
  while (bales.length < cfg.bales && guard++ < 400) {
    const a = (rnd() - 0.5) * (W - 7), b = (rnd() - 0.5) * (H - 7);
    if (Math.hypot(a - start.a, b - start.b) < 6 || !far(a, b, bales, 5)) continue;
    bales.push({ a, b, r: 1.0, yaw: (rnd() - 0.5) * 0.9 });
  }
  guard = 0;
  while (mud.length < cfg.mud && guard++ < 400) {
    const r = 2.1 + rnd() * 0.8;
    const a = (rnd() - 0.5) * (W - 2 * r - 2), b = (rnd() - 0.5) * (H - 2 * r - 4);
    if (Math.hypot(a - start.a, b - start.b) < 8 || !far(a, b, mud, 4) || !far(a, b, bales, 1.6 + r)) continue;
    mud.push({ a, b, r });
  }
  // pick-ups: one per cell of a coarse grid along the long side, so they are spread over the field
  const np = cfg.picks.length, long = H >= W;
  for (let i = 0; i < np; i++) {
    let a = 0, b = 0;
    for (let k = 0; k < 30; k++) {
      const u = (i + 0.25 + rnd() * 0.5) / np, v = 0.18 + rnd() * 0.64;
      a = long ? (v - 0.5) * W : (u - 0.5) * W;
      b = long ? (u - 0.5) * H : (v - 0.5) * H;
      if (far(a, b, bales, 2.2) && far(a, b, mud, 1.2) && Math.hypot(a - start.a, b - start.b) > 5) break;
    }
    picks.push({ type: cfg.picks[i], a, b });
  }

  // ---- the carpet
  const gw = Math.ceil(W / MIN_GAP) + 2, gh = Math.ceil(H / MIN_GAP) + 2;
  if (grid.length < gw * gh) grid = new Int16Array(gw * gh);
  grid.fill(0, 0, gw * gh);
  let count = 0;
  const target = Math.min(ITEM_CAP, cfg.items);
  function put(a, b, yaw) {
    if (count >= target) return false;
    if (a < -hw + edge || a > hw - edge || b < -hh + edge || b > hh - edge) return false;
    for (const o of bales) if ((o.a - a) * (o.a - a) + (o.b - b) * (o.b - b) < (o.r + 0.55) * (o.r + 0.55)) return false;
    const cx = Math.floor((a + hw) / MIN_GAP) + 1, cy = Math.floor((b + hh) / MIN_GAP) + 1;
    for (let j = cy - 1; j <= cy + 1; j++) for (let i = cx - 1; i <= cx + 1; i++) {
      const k = grid[j * gw + i];
      if (k && (A[k - 1] - a) * (A[k - 1] - a) + (B[k - 1] - b) * (B[k - 1] - b) < MIN_GAP * MIN_GAP) return false;
    }
    // a mud patch stays visible: only a few items lie on it
    for (const o of mud) if ((o.a - a) * (o.a - a) + (o.b - b) * (o.b - b) < o.r * o.r * 0.8 && rnd() < 0.72) return false;
    A[count] = a; B[count] = b; YAW[count] = yaw;
    grid[cy * gw + cx] = ++count;
    return true;
  }
  // rows: tilted patches of crop rows
  const tilts = [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4, 0.32, -0.32 + Math.PI / 2];
  for (let p = 0; p < 4 + n && count < target * 0.46; p++) {
    const ca = (rnd() - 0.5) * (W - 4), cb = (rnd() - 0.5) * (H - 6);
    const len = 7 + rnd() * 6, wid = 5 + rnd() * 4, th = tilts[(rnd() * tilts.length) | 0];
    const c = Math.cos(th), s = Math.sin(th);
    for (let v = -wid / 2; v <= wid / 2; v += 0.86) {
      for (let u = -len / 2; u <= len / 2; u += 0.56) {
        const x = u + (rnd() - 0.5) * 0.1, y = v + (rnd() - 0.5) * 0.08;
        put(ca + x * c - y * s, cb + x * s + y * c, th + (rnd() - 0.5) * 0.25 + (rnd() < 0.5 ? Math.PI : 0));
      }
    }
  }
  // swirls: three-armed spirals
  for (let p = 0; p < 2 + n && count < target * 0.74; p++) {
    const ca = (rnd() - 0.5) * (W - 8), cb = (rnd() - 0.5) * (H - 9);
    const R = 3.6 + rnd() * 2.6, arms = 3, turn = rnd() < 0.5 ? 1 : -1, ph = rnd() * 6.283;
    for (let k = 0; k < arms; k++) {
      let r = 0.7, th = ph + (k * 6.283) / arms;
      while (r < R) {
        put(ca + Math.cos(th) * r, cb + Math.sin(th) * r, th + turn * 1.15 + (rnd() - 0.5) * 0.2);
        th += (turn * 0.56) / r;
        r += (0.56 / r) * ((arms * 0.9) / 6.283);
      }
    }
  }
  // drifts: soft heaps, then anything that still fits
  guard = 0;
  while (count < target && guard++ < 260) {
    const ca = (rnd() - 0.5) * (W - 2), cb = (rnd() - 0.5) * (H - 2), sg = 1.3 + rnd() * 2.2;
    const tries = 50 + ((rnd() * 70) | 0);
    for (let k = 0; k < tries && count < target; k++) {
      const r = sg * Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)), th = rnd() * 6.283;
      put(ca + Math.cos(th) * r, cb + Math.sin(th) * r, rnd() * 6.283);
    }
  }
  guard = 0;
  while (count < target && guard++ < 60000) put((rnd() - 0.5) * W, (rnd() - 0.5) * H, rnd() * 6.283);

  last = {
    n, time: cfg.time, W, H, count,
    a: A, b: B, yaw: YAW,
    picks, bales, mud, start,
    t: [nice(count * STARS[0]), nice(count * STARS[1]), nice(count * STARS[2])],
  };
  lastKey = key;
  return last;
}
