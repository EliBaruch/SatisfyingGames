// Gate Run levels: what lies on the runway, generated from a seed (world id + level number), so a
// level is the same every time it is played. Pure data, no THREE and no DOM.
//
// Coordinates: `s` is the distance along the runway in world units. Sideways positions are fractions
// of the lane's half width (-1 = the left edge on screen, +1 = the right edge), so a level does not
// depend on how wide the lane is drawn on this screen.
//
//   buildLevel(worldId, n) -> {
//     n, length, v0, v1, start,                 // level number, finish line, speed at start / end, items at start
//     pickN, pickS, pickF                       // pickups, sorted by s (Float32Array)
//     gates: [{ s, a, b }]                      // a = the left gate, b = the right one: { op, v, text, gain }
//     hazards: [{ s, f, hw, type, w, ph }]      // type: 0 barrier, 1 puddle, 2 spinner; hw = half width (fraction)
//     max, t2, t3, steps                        // best possible count, star thresholds, bonus steps x2..x5
//   }
import { rng } from '../geom.js';

export const ADD = 0, MUL = 1, SUB = 2, DIV = 3;
export const BARRIER = 0, PUDDLE = 1, SPINNER = 2;
export const LEVELS = 3;
/** the runway is laid in chunks: it starts BACK before the start line and ends AFTER the finish line */
export const CHUNK = 12, BACK = 17, AFTER = 7;

export function applyOp(count, op, v) {
  if (op === ADD) return count + v;
  if (op === MUL) return count * v;
  if (op === SUB) return count > v ? count - v : 0;
  return Math.ceil(count / v);
}

const TEXT = ['+', 'x', '-', '÷'];
const option = (op, v) => ({ op, v, text: TEXT[op] + v, gain: op === ADD || op === MUL });

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const r5 = (v) => Math.max(5, Math.round(v / 5) * 5);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// What each level is made of. `gates` and `hazards` are dealt out in this order along the runway.
const PLAN = {
  1: { v0: 8.8, v1: 10.2, start: 5,
    gates: ['add2', 'addmul', 'goodbad', 'add2'],
    hazards: ['barrier', 'puddle', 'barrier'] },
  2: { v0: 9.4, v1: 11.2, start: 5,
    gates: ['add2', 'addmul', 'goodbad', 'subsub', 'mulhalf', 'add2'],
    hazards: ['barrier', 'puddle', 'spinner', 'gap', 'puddle', 'barrier', 'spinner'] },
  3: { v0: 10, v1: 12.2, start: 5,
    gates: ['add2', 'addmul', 'goodbad', 'subsub', 'mulhalf', 'add2', 'addhalf', 'trap'],
    hazards: ['barrier', 'spinner', 'gap', 'puddle', 'barrier', 'spinner', 'gap', 'puddle', 'spinner', 'barrier', 'gap'] },
};

// Gate pairs, sized from the count a good player has by then (e): [better, worse].
const GATES = {
  add2(e) { const big = r5(clamp(e * 0.4, 15, 120)); return [option(ADD, big), option(ADD, r5(big * 0.5))]; },
  addmul(e) { return [option(MUL, 2), option(ADD, r5(Math.max(10, e * 0.45)))]; },
  goodbad(e) { return [option(ADD, r5(Math.max(12, e * 0.25))), option(SUB, r5(Math.max(8, e * 0.15)))]; },
  subsub(e) { const a = r5(Math.max(5, e * 0.1)); return [option(SUB, a), option(SUB, r5(a * 2.5))]; },
  mulhalf() { return [option(MUL, 2), option(DIV, 2)]; },
  addhalf(e) { return [option(ADD, r5(Math.max(15, e * 0.18))), option(DIV, 2)]; },
  trap(e) { return [option(ADD, r5(e * 1.2 + 5)), option(MUL, 2)]; },       // the plain number beats the multiplier
};

export function buildLevel(worldId, n) {
  n = clamp(n | 0, 1, LEVELS);
  const cfg = PLAN[n];
  const rnd = rng(hashStr(String(worldId) + ':gate-run:' + n));
  const pick = (list) => list[(rnd() * list.length) | 0];
  const ps = [], pf = [];
  const gates = [], hazards = [];
  const seg = [0];                 // pickups a perfect run takes before each gate (and after the last)
  let s = 15, est = cfg.start;

  const put = (at, f) => { ps.push(at); pf.push(clamp(f, -0.92, 0.92)); };
  const count = (k) => { seg[seg.length - 1] += k; est += k; };

  // ---- pickup patterns: each returns how far along the runway it reaches
  const PATTERNS = {
    line() {
      const f = pick([-0.62, 0, 0.62]), k = 6 + ((rnd() * 3) | 0);
      for (let i = 0; i < k; i++) put(s + i * 1.5, f);
      count(k);
      return k * 1.5;
    },
    wave() {
      const k = 9 + ((rnd() * 3) | 0), ph = rnd() < 0.5 ? 0 : Math.PI;
      for (let i = 0; i < k; i++) put(s + i * 1.45, 0.68 * Math.sin(i * 0.6 + ph));
      count(k);
      return k * 1.45;
    },
    slant() {
      const dir = rnd() < 0.5 ? 1 : -1, k = 8;
      for (let i = 0; i < k; i++) put(s + i * 1.5, dir * (-0.7 + (1.4 * i) / (k - 1)));
      count(k);
      return k * 1.5;
    },
    twin() {                       // two rows: only one of them can be taken
      const k = 6;
      for (let i = 0; i < k; i++) { put(s + i * 1.5, -0.64); put(s + i * 1.5, 0.64); }
      count(k);
      return k * 1.5;
    },
    zig() {
      const k = 10, dir = rnd() < 0.5 ? 1 : -1;
      for (let i = 0; i < k; i++) { const u = i / (k - 1); put(s + i * 1.45, dir * 0.66 * (1 - 4 * Math.abs(u - 0.5))); }
      count(k);
      return k * 1.45;
    },
  };
  const NAMES = n === 1 ? ['line', 'wave', 'slant', 'line'] : ['line', 'wave', 'slant', 'twin', 'zig'];
  let lastPattern = '';
  function pickups() {
    let name = pick(NAMES);
    if (name === lastPattern) name = NAMES[(NAMES.indexOf(name) + 1) % NAMES.length];
    lastPattern = name;
    s += PATTERNS[name]() + 1.5;
  }

  function gate(kind) {
    s += 6;                        // room to change sides after the last pickup
    const pair = GATES[kind](est);
    const swap = rnd() < 0.5;
    gates.push({ s, a: swap ? pair[1] : pair[0], b: swap ? pair[0] : pair[1] });
    est = Math.max(applyOp(est, pair[0].op, pair[0].v), applyOp(est, pair[1].op, pair[1].v));
    seg.push(0);
    s += 5.5;
  }

  /** a short row of pickups past a hazard on its free side: shows the way and pays for taking it */
  function guide(at, f, k = 5) {
    for (let i = 0; i < k; i++) put(at - 3 + i * 1.5, f);
    count(k);
  }
  function hazard(kind) {
    s += 5.5;
    if (kind === 'barrier') {
      const f = pick([-0.46, 0.46, 0]);
      hazards.push({ s, f, hw: 0.33, type: BARRIER, w: 0, ph: 0 });
      guide(s, f > 0.1 ? -0.62 : f < -0.1 ? 0.62 : pick([-0.86, 0.86]));
    } else if (kind === 'gap') {         // a wall across the lane with one opening
      const g = pick([-0.5, 0, 0.5]), open = 0.32;
      const lo = g - open, hi = g + open;
      if (lo > -0.98) hazards.push({ s, f: (-1 + lo) / 2, hw: (lo + 1) / 2, type: BARRIER, w: 0, ph: 0 });
      if (hi < 0.98) hazards.push({ s, f: (hi + 1) / 2, hw: (1 - hi) / 2, type: BARRIER, w: 0, ph: 0 });
      guide(s, g * 1.16, 6);
    } else if (kind === 'puddle') {
      const f = pick([-0.42, 0, 0.42]);
      hazards.push({ s, f, hw: 0.36, type: PUDDLE, w: 0, ph: 0 });
      guide(s, f > 0.1 ? -0.7 : f < -0.1 ? 0.7 : pick([-0.86, 0.86]), 4);
    } else {                             // spinner: a bar turning about a post in the middle of the lane
      hazards.push({ s, f: 0, hw: 0.55, type: SPINNER, w: (rnd() < 0.5 ? -1 : 1) * (2.1 + rnd() * 0.5), ph: rnd() * 6.283 });
      guide(s, pick([-0.95, 0.95]), 5);
    }
    s += 4.5;
  }

  // ---- lay it out: pickups, a gate, pickups, the hazards that are due, ...
  let hi = 0;
  for (let gi = 0; gi < cfg.gates.length; gi++) {
    pickups();
    gate(cfg.gates[gi]);
    const due = Math.round(((gi + 1) * cfg.hazards.length) / cfg.gates.length);
    let first = true;
    while (hi < due) {
      if (first) pickups(); else s += 2.5;
      first = false;
      hazard(cfg.hazards[hi++]);
    }
  }
  // the home straight: one last row down the middle
  s += 2;
  for (let i = 0; i < 8; i++) put(s + i * 1.4, 0);
  count(8);
  s += 8 * 1.4 + 9;
  const length = Math.ceil(s / CHUNK) * CHUNK;       // BACK + AFTER is a whole number of chunks too

  // ---- the best possible count: every pickup, the better gate every time, no hazard touched
  function best(k, c) {
    c += seg[k];
    if (k >= gates.length) return c;
    const g = gates[k];
    return Math.max(best(k + 1, applyOp(c, g.a.op, g.a.v)), best(k + 1, applyOp(c, g.b.op, g.b.v)));
  }
  const max = Math.max(10, best(0, cfg.start));

  // pickups sorted by s (guides are laid after the hazard that follows a pattern)
  const order = ps.map((_, i) => i).sort((a, b) => ps[a] - ps[b]);
  const pickS = new Float32Array(order.length), pickF = new Float32Array(order.length);
  for (let i = 0; i < order.length; i++) { pickS[i] = ps[order[i]]; pickF[i] = pf[order[i]]; }

  return {
    n, length, v0: cfg.v0, v1: cfg.v1, start: cfg.start,
    pickN: order.length, pickS, pickF,
    gates, hazards,
    max,
    t2: Math.round(max * 0.42), t3: Math.round(max * 0.8),
    // the bonus meter at the finish: x2 .. x5 are reached at these counts (x5 = three stars)
    steps: [Math.round(max * 0.2), Math.round(max * 0.42), Math.round(max * 0.62), Math.round(max * 0.8)],
  };
}
