// Perks: permanent bonuses for the world being played, chosen two at a time at the perk gates
// (three stars buy a choice). Kept per world in levels.<world>.thrills.perks = { id: stacks }.
//
// A perk multiplies or adds to the totals below; engine/thrills/index.js lays the totals over
// G.stats after every recompute. Several perks trade one thing for another, so a choice is a
// choice of how to play, not just of which number goes up.
//
//   speed, capacity, price, crew   multipliers on run speed, stack size, sale prices, crew speed
//   reach                          multiplier on the harvest radius
//   magnet                         metres added to the reach of cash piles
//   feverTime                      seconds added to a fever
//   feverFill, luck, orderPay      multipliers on the fever fill rate, event frequency and
//                                  jackpot odds, rush-order pay

export const PERKS = [
  { id: 'sprint', title: '+10%', sub: 'RUN SPEED', icon: 'bolt', color: 0x2e9bff, max: 4, mul: { speed: 1.10 } },
  { id: 'load', title: '+25%', sub: 'BIGGER STACK', color: 0xff8a3d, max: 4, mul: { capacity: 1.25 } },
  { id: 'haggle', title: '+10%', sub: 'SALE PRICES', icon: 'cash', color: 0x35c46a, max: 5, mul: { price: 1.10 } },
  { id: 'crew', title: '+15%', sub: 'CREW SPEED', color: 0x9b5cff, max: 4, mul: { crew: 1.15 }, needs: 'crew' },
  { id: 'reach', title: '+20%', sub: 'WIDER REACH', color: 0x19c2c2, max: 3, mul: { reach: 1.20 }, needs: 'harvest' },
  { id: 'magnet', title: 'MAGNET', sub: 'CASH FLIES\nTO YOU', icon: 'cash', color: 0xe04f6c, max: 2, add: { magnet: 2.6 } },
  { id: 'feverTime', title: '+4s', sub: 'LONGER FEVER', icon: 'flame', color: 0xff5a2a, max: 3, add: { feverTime: 4 } },
  { id: 'feverFill', title: '+30%', sub: 'FEVER FILLS\nFASTER', icon: 'flame', color: 0xff7a1a, max: 3, mul: { feverFill: 1.30 } },
  { id: 'luck', title: 'LUCKY', sub: 'MORE DROPS\nBIGGER JACKPOTS', icon: 'star', color: 0xf0b400, max: 3, mul: { luck: 1.25 } },
  { id: 'orderPay', title: '+35%', sub: 'RUSH ORDER PAY', color: 0x3f8cff, max: 3, mul: { orderPay: 1.35 } },
  // trade-offs: one of each pair at most
  { id: 'mule', title: 'PACK MULE', sub: '+60% STACK\n-8% SPEED', color: 0xb5651d, max: 1, mul: { capacity: 1.6, speed: 0.92 }, not: 'feet' },
  { id: 'feet', title: 'LIGHT FEET', sub: '+22% SPEED\n-15% STACK', icon: 'bolt', color: 0x00a8e8, max: 1, mul: { speed: 1.22, capacity: 0.85 }, not: 'mule' },
  { id: 'boss', title: 'BIG BOSS', sub: '+40% CREW SPEED\n-6% YOUR SPEED', color: 0x7a4bd6, max: 1, mul: { crew: 1.4, speed: 0.94 }, needs: 'crew', not: 'solo' },
  { id: 'solo', title: 'HANDS ON', sub: '+18% PRICES\n-10% CREW SPEED', icon: 'cash', color: 0x2fae7a, max: 1, mul: { price: 1.18, crew: 0.9 }, needs: 'crew', not: 'boss' },
];
const BY_ID = new Map(PERKS.map((p) => [p.id, p]));
export const perkById = (id) => BY_ID.get(id) || null;

export function freshTotals() {
  return { speed: 1, capacity: 1, price: 1, crew: 1, reach: 1, magnet: 0, feverTime: 0, feverFill: 1, luck: 1, orderPay: 1 };
}

/** Fold the owned perks { id: stacks } into `out` (reset first). */
export function perkTotals(owned, out) {
  Object.assign(out, freshTotals());
  for (const id of Object.keys(owned || {})) {
    const p = BY_ID.get(id);
    const n = Math.min(p ? p.max : 0, owned[id] | 0);
    if (!p || n <= 0) continue;
    for (let i = 0; i < n; i++) {
      if (p.mul) for (const k of Object.keys(p.mul)) out[k] *= p.mul[k];
      if (p.add) for (const k of Object.keys(p.add)) out[k] += p.add[k];
    }
  }
  return out;
}

/** Keep only known perks with a valid stack count. */
export function sanitizePerks(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const id of Object.keys(raw)) {
      const p = BY_ID.get(id), n = raw[id] | 0;
      if (p && n > 0) out[id] = Math.min(p.max, n);
    }
  }
  return out;
}

/**
 * Two different perks the player can still take. `has` = { crew: bool, harvest: bool } says what
 * the world offers right now. Returns [] when everything is maxed out.
 */
export function offerPerks(owned, has, rnd, n = 2) {
  const pool = PERKS.filter((p) => (owned[p.id] | 0) < p.max && (!p.needs || has[p.needs]) && !(p.not && owned[p.not] > 0));
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.min(pool.length - 1, Math.floor(rnd() * pool.length));
    const p = pool.splice(i, 1)[0];
    // never offer both halves of a trade-off pair side by side: the pick would lock the other out anyway
    if (p.not && out.some((q) => q.id === p.not)) continue;
    out.push(p);
  }
  return out;
}

/** "RUN SPEED +10%" style line for toasts. */
export function perkLine(p) {
  const sub = String(p.sub || '').split('\n')[0];
  return /^[+\-]?\d/.test(p.title) ? `${sub} ${p.title}` : p.title;
}
