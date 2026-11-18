// Raid levels: where the gaps in the fence are, where the helper pads stand and when every pest
// comes out of which burrow, generated from a seed (world id + level number), so a level is the
// same every time it is played. Pure data, no THREE and no DOM.
//
// Angles are radians round the yard (x = cos, z = sin). The fence has SEGS segments; a gap is
// GAP_SEGS of them left out.
//
//   buildRaid(worldId, n) -> {
//     n, total,                                 // level number, items on the stockpile
//     gaps: [{ seg, a }],                       // first missing fence segment, centre angle
//     pads: [{ a, cost }],                      // helper pads round the pile
//     waves, waveAt: [t],                       // number of waves, when each starts (seconds)
//     speed,                                    // a pest's pace, units per second
//     spawnN, spawnT, spawnGap, spawnHp,        // every pest, sorted by time (typed arrays) ...
//     spawnF, spawnA, spawnV, spawnWave,        // ... where in the gap (-1..1), where at the pile (rad), pace factor, wave
//     big: { at, gap, hp, steal },              // the big one of the last wave
//   }
import { rng } from '../geom.js';

export const LEVELS = 3;
export const SEGS = 28, GAP_SEGS = 2, MAX_GAPS = 4;
export const PAD_COST = [8, 15, 25, 40];
export const LEAD = 2.2;                 // seconds before the first wave

// What each level is made of: pests per wave, seconds between wave starts, how long a wave pours in,
// the share of two- and three-bop pests in the last wave (it grows from nothing over the waves).
const PLAN = {
  1: { gaps: 2, total: 40, waves: [16, 24, 34, 46], every: 10.5, burst: 6.2, speed: 2.9, tough: 0.22, tougher: 0.03, big: { hp: 14, steal: 7 } },
  2: { gaps: 3, total: 48, waves: [20, 30, 42, 56, 70], every: 9.6, burst: 6.0, speed: 3.2, tough: 0.32, tougher: 0.1, big: { hp: 18, steal: 9 } },
  3: { gaps: 4, total: 56, waves: [24, 38, 54, 72, 90], every: 9.0, burst: 5.8, speed: 3.5, tough: 0.4, tougher: 0.15, big: { hp: 22, steal: 11 } },
};

function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const TAU = Math.PI * 2;
const angDist = (a, b) => { const d = Math.abs(a - b) % TAU; return d > Math.PI ? TAU - d : d; };

export function buildRaid(worldId, n) {
  n = Math.max(1, Math.min(LEVELS, Math.floor(n) || 1));
  const plan = PLAN[n];
  const rnd = rng(hashStr(`${worldId}:raid:${n}`));

  // ---- gaps: spread round the yard, a segment or so off the even spacing
  const gaps = [];
  const first = Math.floor(rnd() * SEGS);
  for (let i = 0; i < plan.gaps; i++) {
    const seg = (first + Math.round((i * SEGS) / plan.gaps + (rnd() - 0.5) * 2)) % SEGS;
    gaps.push({ seg, a: ((seg + GAP_SEGS / 2) / SEGS) * TAU });
  }

  // ---- pads: four round the pile, turned as far from the gaps (the pests' paths) as possible
  let bestPhi = 0, bestD = -1;
  for (let k = 0; k < 12; k++) {
    const phi = (k / 12) * (TAU / 4);
    let d = Infinity;
    for (let p = 0; p < 4; p++) for (const g of gaps) d = Math.min(d, angDist(phi + (p * TAU) / 4, g.a));
    if (d > bestD) { bestD = d; bestPhi = phi; }
  }
  const pads = [];
  const turn = Math.floor(rnd() * 4);
  for (let p = 0; p < PAD_COST.length; p++) pads.push({ a: (bestPhi + (((p + turn) % 4) * TAU) / 4) % TAU, cost: PAD_COST[p] });

  // ---- the pests: they come in little packs, each pack out of one burrow
  const W = plan.waves.length;
  const waveAt = [];
  const list = [];
  for (let w = 0; w < W; w++) {
    const at = LEAD + w * plan.every;
    waveAt.push(at);
    const count = plan.waves[w], late = W > 1 ? w / (W - 1) : 1;
    let gap = Math.floor(rnd() * plan.gaps), left = 0;
    for (let i = 0; i < count; i++) {
      if (left <= 0) { gap = (gap + 1 + Math.floor(rnd() * Math.max(1, plan.gaps - 1))) % plan.gaps; left = 3 + Math.floor(rnd() * 4); }
      left--;
      const r = rnd();
      const hp = r < plan.tougher * late ? 3 : r < (plan.tougher + plan.tough) * late ? 2 : 1;
      list.push({
        t: at + 0.3 + plan.burst * Math.pow(i / count, 0.9) + rnd() * 0.25,
        gap, hp, w,
        f: rnd() * 2 - 1,
        a: (rnd() * 2 - 1) * 0.9,
        v: 0.86 + rnd() * 0.3,
      });
    }
  }
  list.sort((p, q) => p.t - q.t);
  const N = list.length;
  const spawnT = new Float32Array(N), spawnF = new Float32Array(N), spawnA = new Float32Array(N), spawnV = new Float32Array(N);
  const spawnGap = new Uint8Array(N), spawnHp = new Uint8Array(N), spawnWave = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const p = list[i];
    spawnT[i] = p.t; spawnF[i] = p.f; spawnA[i] = p.a; spawnV[i] = p.v;
    spawnGap[i] = p.gap; spawnHp[i] = p.hp; spawnWave[i] = p.w;
  }

  return {
    n, total: plan.total, gaps, pads,
    waves: W, waveAt, speed: plan.speed,
    spawnN: N, spawnT, spawnGap, spawnHp, spawnF, spawnA, spawnV, spawnWave,
    big: { at: waveAt[W - 1] + 2.6, gap: Math.floor(rnd() * plan.gaps), hp: plan.big.hp, steal: plan.big.steal },
  };
}
