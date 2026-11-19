// Ironwall Keep: the sixth world. A lone knight holds a walled keep against raiders that come in waves
// across the field to the north. Every raider that falls pays a bounty into the war chest by the gate;
// raiders that reach the wall bash it and steal from the chest. The knight fights with a sword, then
// builds war engines that need ammunition carried to them, and each stage brings a heavier weapon
// and a heavier enemy:
//   archer towers (arrows: logs at the fletcher) -> crossbow towers (bolts: logs + iron at the forge)
//   -> fire arrows -> ballistae (spears: the spear works, they skewer whole lines) -> catapults
//   (quarry stones, splash) -> flaming pitch -> the great trebuchet (boulders from the mason) -> the Citadel.
// Raiders, then shieldbearers, brutes, black knights and battering rams.
// Everything here is data; scene.js dresses it, models.js builds the models.
import {
  makeLogGeometry, makeArrowsGeometry, makeOreGeometry, makeBoltsGeometry, makeSpearGeometry, makeStoneGeometry, makeBoulderGeometry,
  makeOakGeometry, makeOakStumpGeometry, makeVeinGeometry, makeRubbleGeometry, makeQuarryRockGeometry, makeGravelGeometry,
  makeRaiderGeometry, makeShieldGeometry, makeBruteGeometry, makeKnightGeometry, makeRamGeometry,
  makeArcherTower, makeCrossbowTower, makeBallista, makeCatapult, makeTrebuchet,
  shotArrow, shotBolt, shotSpear, shotStone, shotBoulder,
  SIZES, OAK_HEIGHT, VEIN_HEIGHT, QUARRY_HEIGHT, RAIDER_HEIGHT, SHIELD_HEIGHT, BRUTE_HEIGHT, KNIGHT_HEIGHT, RAM_HEIGHT,
} from './models.js';

// ------------------------------------------------------------------ layout ---
// The camera looks from (-x, -z): +z runs up and to the right on screen. The keep is a walled yard;
// its great wall faces north (+z) over the battlefield, with the gatehouse in the middle. The woods lie
// beyond the west gap, the iron mine beyond the east gap, the quarry beyond the south gap; the Citadel
// rises south-west of the keep.
const YARD = { minX: -19, maxX: 19, minZ: -13, maxZ: 10 };
const WALL_Z = 10;
const LAY = {
  ground: { minX: -80, maxX: 80, minZ: -70, maxZ: 90 },
  yard: YARD,
  wallZ: WALL_Z,
  gate: [-2, 2],                       // the gatehouse opening in the north wall
  gaps: { west: [-2.5, 3.5], east: [-2.5, 3.5], south: [4, 9.5] },
  field: { minX: -18, maxX: 18, minZ: WALL_Z + 0.5, maxZ: 44 },
  woods: { minX: -36, maxX: -23, minZ: -9, maxZ: 11 },
  mine: { minX: 23, maxX: 33, minZ: -8, maxZ: 9 },
  quarry: { minX: 1, maxX: 15, minZ: -31, maxZ: -18 },
  citadel: { x: -12, z: -23, w: 10, d: 10 },
  worldGate: { x: 6.5, z: -16.2 },
  chest: { x: 0, z: 5.2 },
};
const TOWER_Z = 8.1, AMMO_Z = 5.3;
// wall slots, west to east
const SLOT = { w4: -17, w3: -13, w2: -9, w1: -5, e1: 5, e2: 9, e3: 13, e4: 17 };

const sq = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const hire = (role, from, to, extra) => ({ type: 'hire', role, from, to, ...extra });
const stat = (s, op) => ({ type: 'stat', stat: s, ...op });
const open = (...stations) => ({ type: 'open', stations });
const multi = (...effects) => ({ type: 'multi', effects });
const raid = (n) => stat('raid', { max: n });
const stage = (n) => ({ type: 'stage', stage: n });

// ---------------------------------------------------------------- engines ---
const ENGINE = {
  bow: {
    model: makeArcherTower, ammo: 'arrows', ammoCap: 8, shotsPer: 10, every: 0.7, rateStat: 'bowRate',
    range: 14.5, damage: 1.5, damageStat: 'bowDamage', volley: 1, volleyStat: 'archers', pool: 14,
    shot: { geometry: shotArrow, speed: 24, arc: 0.14, fireStat: 'fireArrows', sound: 'bow' },
    footprint: { w: 2.6, d: 2.6 }, label: 'ARROWS', hint: 'Bring arrows to the archers!',
  },
  xbow: {
    model: makeCrossbowTower, ammo: 'bolts', ammoCap: 10, shotsPer: 8, every: 0.8, rateStat: 'xbowRate',
    range: 17, damage: 3, damageStat: 'xbowDamage', pool: 6,
    shot: { geometry: shotBolt, speed: 34, arc: 0.05, fireStat: 'fireArrows', sound: 'crossbow' },
    footprint: { w: 2.5, d: 2.5 }, label: 'BOLTS', hint: 'Bring bolts to the crossbows!',
  },
  ballista: {
    model: makeBallista, ammo: 'spear', ammoCap: 6, shotsPer: 5, every: 2.3, rateStat: 'craft',
    range: 21, damage: 9, damageStat: 'spearDamage', pool: 4,
    shot: { geometry: shotSpear, speed: 30, arc: 0.02, pierce: true, fireStat: 'fireArrows', sound: 'ballista' },
    footprint: { w: 3, d: 3 }, label: 'SPEARS', hint: 'Bring spears to the ballista!',
  },
  catapult: {
    model: makeCatapult, ammo: 'stone', ammoCap: 8, shotsPer: 3, every: 3.4, rateStat: 'catRate',
    range: 27, minRange: 7, damage: 16, pool: 4,
    shot: { geometry: shotStone, speed: 15, arc: 0.42, splash: 2.6, spin: 7, fireStat: 'stoneFire', shake: 0.12, sound: 'catapult', impact: 'boom', dust: true },
    footprint: { w: 2.4, d: 3.2 }, label: 'STONES', hint: 'Bring stones to the catapult!',
  },
  treb: {
    model: makeTrebuchet, ammo: 'boulder', ammoCap: 5, shotsPer: 3, every: 5.5, rateStat: 'trebRate',
    range: 36, minRange: 10, damage: 70, pool: 3,
    shot: { geometry: shotBoulder, speed: 14, arc: 0.55, splash: 4.4, spin: 3, fireStat: 'stoneFire', shake: 0.5, sound: 'catapult', impact: 'boom', dust: true },
    footprint: { w: 4, d: 6.6 }, label: 'BOULDERS', hint: 'Bring boulders to the trebuchet!',
  },
};
const engine = (id, kind, x, z, zone, extra) => ({
  id, type: 'battery', name: ENGINE[kind].label, open: false, foes: 'raid', x, z, ...ENGINE[kind],
  dropZone: { x: zone[0], z: zone[1], r: 1.25 }, ...(extra || {}),
});
const wallEngine = (id, kind, slot, extra) => engine(id, kind, slot, TOWER_Z, [slot, AMMO_Z], extra);
const CATS = [{ x: -5.6, z: 0.2 }, { x: 5.6, z: 0.2 }];
const TREB = { x: -4.6, z: -7.6 };

// --------------------------------------------------------------- workshops ---
// a workshop: input zone on one side, output zone on the other, both 3.9 from its centre along x
function workshop(id, name, x, z, recipe, side, labels, hints, extra) {
  const ix = x + side * 3.9, ox = x - side * 3.9;
  return {
    id, type: 'converter', name, open: false, x, z, recipe, batch: 2, speedStat: 'craft', inputCap: 24,
    machine: { w: 2.9, d: 2.5, h: 2.6, yaw: 0 },
    dropZone: { x: ix, z, r: 1.25 }, workerSpot: { x: ix, z },
    input: { layout: { x: x + side * 2.2, z, cols: 1, rows: 3 } },
    output: { capacity: 24, zone: { x: ox, z, r: 1.25 }, layout: { x: x - side * 2.2, z, cols: 1, rows: 3 } },
    labels, hints, placeholder: false, markers: false, ...(extra || {}),
  };
}

// pad slots: a bought pad disappears, so the same spot serves several pads in turn
const S = {
  c1: [-2.4, 1.6], c2: [2.4, 1.6], c3: [-2.4, -2.2], c4: [2.4, -2.2], c5: [0, -5],
  woods: [-16.6, 0.5], mine: [16.6, 0.5], quarry: [6.8, -10.6],
  fletch: [-12.5, 0.5], forge: [12.5, 0.5], spears: [12.5, -5.5], mason: [-12.5, -5.5],
  bow1: [SLOT.w1, AMMO_Z], bow2: [SLOT.e1, AMMO_Z], bow3: [SLOT.w2, AMMO_Z], bow4: [SLOT.w4, AMMO_Z],
  xbow1: [SLOT.e2, AMMO_Z], xbow2: [SLOT.w3, AMMO_Z], bal1: [SLOT.e3, AMMO_Z], bal2: [SLOT.e4, AMMO_Z],
  cat1: [CATS[0].x, -3.0], cat2: [CATS[1].x, -3.0], treb: [-0.8, -7.6], citadel: [-6.2, -15.6],
};
const AMMO_ZONE = (k) => ({ x: S[k][0], z: S[k][1] });

const REVEAL = {
  bow1: { title: 'ARCHER TOWER', sub: 'Keep it stocked with arrows', zoom: 0.85, run: 2.0, shots: [{ at: [SLOT.w1, 9], show: ['*'], hold: 1.0 }] },
  fletcher: { title: 'THE FLETCHER', sub: 'Chop oaks, make arrows', zoom: 0.95, run: 1.2, shots: [{ at: [-12.5, 0.5], show: ['fletcher'], hold: 0.9 }, { at: [-28, 1], show: ['oaks'], hold: 0.9 }] },
  xbow1: { title: 'CROSSBOW TOWER', sub: 'Bolts hit hard and far', zoom: 0.9, run: 2.0, shots: [{ at: [SLOT.e2, 9], show: ['*'], hold: 1.0 }] },
  fire: { title: 'FIRE ARROWS', sub: 'Every arrow and bolt burns', zoom: 1.0, run: 3.0, shots: [{ at: [0, 15], show: ['*'], hold: 0.6 }] },
  ballista1: { title: 'BALLISTA', sub: 'One spear, a whole line', zoom: 0.9, run: 2.6, shots: [{ at: [SLOT.e3, 10], show: ['*'], hold: 1.0 }] },
  cat1: { title: 'CATAPULT', sub: 'Stones crush whole packs', zoom: 0.95, run: 3.4, shots: [{ at: [CATS[0].x, 2], show: ['*'], hold: 1.0 }] },
  treb: { title: 'THE GREAT TREBUCHET', sub: 'Nothing survives a boulder', zoom: 1.15, run: 6.0, shots: [{ at: [TREB.x, -6], show: ['*'], hold: 1.2 }] },
  mine: { title: 'IRON MINE', sub: 'Iron for bolts and spears', zoom: 0.95, run: 0.8, shots: [{ at: [27, 0], show: ['*'], hold: 1.0 }] },
  quarry: { title: 'THE QUARRY', sub: 'Stones for the catapults', zoom: 0.95, run: 0.8, shots: [{ at: [8, -24], show: ['*'], hold: 1.0 }] },
};

// [id, label, cost, slot, effect, extra]
const CHAIN = [
  // ---- I. the gate: a sword and a bow
  ['bow1', 'ARCHER TOWER', 20, S.bow1, open('bow1'), { big: true, toast: 'ARCHERS ON THE WALL!', focus: { x: SLOT.w1, z: 8 }, reveal: REVEAL.bow1 }],
  ['fletcher', 'FLETCHER', 40, S.fletch, open('fletcher', 'oaks'), { big: true, toast: 'FLETCHER!', focus: { x: -12.5, z: 0.5 }, reveal: REVEAL.fletcher }],
  ['sword1', 'SHARP SWORD', 85, S.c1, stat('heroDamage', { max: 2 }), { toast: 'SHARPER SWORD!' }],
  ['bow2', 'ARCHER TOWER', 120, S.bow2, multi(open('bow2'), raid(2)), { big: true, toast: 'SECOND TOWER!', focus: { x: SLOT.e1, z: 8 } }],
  ['pack1', 'BIGGER PACK', 150, S.c2, stat('capacity', { max: 30 }), { toast: 'BIGGER PACK!' }],
  ['archer1', '+1 ARCHER', 180, S.c3, stat('archers', { add: 1 }), { toast: 'MORE ARCHERS!' }],
  ['cutter1', 'WOODCUTTER', 220, S.woods, hire('hauler', ['oaks'], ['fletcher'], { options: { look: 'cutter' } }), { toast: 'WOODCUTTER HIRED!' }],
  ['runner1', 'QUARTERMASTER', 260, S.c4, hire('hauler', ['fletcher'], ['bow1', 'bow2', 'bow3', 'bow4'], { home: { x: -6, z: 2 }, options: { look: 'runner', capacity: 10 } }), { toast: 'QUARTERMASTER HIRED!' }],
  ['bow3', 'ARCHER TOWER', 320, S.bow3, multi(open('bow3'), raid(3)), { big: true, toast: 'THIRD TOWER!', focus: { x: SLOT.w2, z: 8 } }],
  // ---- II. iron: crossbows
  ['mine', 'IRON MINE', 400, S.mine, multi(open('veins'), stage(2)), { big: true, toast: 'IRON MINE!', focus: { x: 27, z: 0 }, reveal: REVEAL.mine }],
  ['forge', 'FORGE', 480, S.forge, open('forge'), { big: true, toast: 'THE FORGE!', focus: { x: 12.5, z: 0.5 } }],
  ['xbow1', 'CROSSBOW TOWER', 560, S.xbow1, multi(open('xbow1'), raid(4)), { big: true, toast: 'CROSSBOWS!', focus: { x: SLOT.e2, z: 8 }, reveal: REVEAL.xbow1 }],
  ['miner1', 'MINER', 520, S.mine, hire('hauler', ['veins'], ['forge'], { options: { look: 'miner' } }), { toast: 'MINER HIRED!' }],
  ['boots', 'SWIFT BOOTS', 600, S.c1, stat('speed', { mul: 1.2 }), { toast: 'SWIFT BOOTS!' }],
  ['runner2', 'BOLT RUNNER', 660, S.c2, hire('hauler', ['forge'], ['xbow1', 'xbow2'], { home: { x: 6, z: 2 }, options: { look: 'runner', capacity: 10 } }), { toast: 'BOLT RUNNER HIRED!' }],
  ['xbow2', 'CROSSBOW TOWER', 760, S.xbow2, open('xbow2'), { big: true, toast: 'SECOND CROSSBOW!', focus: { x: SLOT.w3, z: 8 } }],
  ['steel', 'STEEL ARROWHEADS', 820, S.c3, multi(stat('bowDamage', { mul: 2 }), stat('xbowDamage', { mul: 1.5 })), { toast: 'STEEL ARROWHEADS!' }],
  ['cutter2', 'WOODCUTTER', 880, S.woods, hire('hauler', ['oaks'], ['forge', 'fletcher'], { options: { look: 'cutter' } }), { toast: 'WOODCUTTER HIRED!' }],
  // ---- III. fire
  ['fire', 'FIRE ARROWS', 1100, S.c5, multi(stat('fireArrows', { set: 1 }), raid(5), stage(3)), { big: true, toast: 'FIRE ARROWS!', focus: { x: 0, z: 14 }, reveal: REVEAL.fire }],
  ['archer2', '+1 ARCHER', 1000, S.c4, stat('archers', { add: 1 }), { toast: 'MORE ARCHERS!' }],
  ['sword2', 'GREATSWORD', 1250, S.c1, multi(stat('heroDamage', { max: 4 }), stat('harvestRadius', { max: 2.3 })), { toast: 'GREATSWORD!' }],
  ['pack2', 'HUGE PACK', 1350, S.c2, stat('capacity', { max: 45 }), { toast: 'HUGE PACK!' }],
  ['xrate', 'REPEATING CROSSBOWS', 1500, S.c3, stat('xbowRate', { mul: 1.6 }), { toast: 'REPEATING CROSSBOWS!' }],
  ['bow4', 'ARCHER TOWER', 1650, S.bow4, open('bow4'), { big: true, toast: 'FOURTH TOWER!', focus: { x: SLOT.w4, z: 8 } }],
  // ---- IV. ballistae
  ['spears', 'SPEAR WORKS', 1900, S.spears, multi(open('spearworks'), raid(6), stage(4)), { big: true, toast: 'SPEAR WORKS!', focus: { x: 12.5, z: -5.5 } }],
  ['ballista1', 'BALLISTA', 2200, S.bal1, open('ballista1'), { big: true, toast: 'BALLISTA!', focus: { x: SLOT.e3, z: 8 }, reveal: REVEAL.ballista1 }],
  ['miner2', 'MINER', 2050, S.mine, hire('hauler', ['veins'], ['spearworks', 'forge'], { options: { look: 'miner' } }), { toast: 'MINER HIRED!' }],
  ['runner3', 'SPEAR RUNNER', 2350, S.c4, hire('hauler', ['spearworks'], ['ballista1', 'ballista2'], { home: { x: 9, z: -2 }, options: { look: 'runner', capacity: 8 } }), { toast: 'SPEAR RUNNER HIRED!' }],
  ['ballista2', 'BALLISTA', 2650, S.bal2, open('ballista2'), { big: true, toast: 'SECOND BALLISTA!', focus: { x: SLOT.e4, z: 8 } }],
  ['craft', 'MASTER CRAFTSMEN', 2900, S.c1, stat('craft', { mul: 1.5 }), { toast: 'FASTER WORKSHOPS!' }],
  ['bounty1', 'WAR BOUNTY +25%', 3100, S.c2, stat('priceMult', { mul: 1.25 }), { toast: 'BIGGER BOUNTIES!' }],
  // ---- V. catapults
  ['quarry', 'THE QUARRY', 3500, S.quarry, multi(open('rocks'), raid(7), stage(5)), { big: true, toast: 'THE QUARRY!', focus: { x: 8, z: -24 }, reveal: REVEAL.quarry }],
  ['cat1', 'CATAPULT', 3900, S.cat1, open('cat1'), { big: true, toast: 'CATAPULT!', focus: { x: CATS[0].x, z: 1 }, reveal: REVEAL.cat1 }],
  ['quarry1', 'QUARRYMAN', 3700, S.quarry, hire('hauler', ['rocks'], ['cat1', 'cat2'], { options: { look: 'miner' } }), { toast: 'QUARRYMAN HIRED!' }],
  ['cat2', 'CATAPULT', 4500, S.cat2, open('cat2'), { big: true, toast: 'SECOND CATAPULT!', focus: { x: CATS[1].x, z: 1 } }],
  ['pitch', 'FLAMING PITCH', 5000, S.c3, stat('stoneFire', { set: 1 }), { big: true, toast: 'FLAMING STONES!', focus: { x: 0, z: 18 } }],
  ['sword3', 'FLAME BLADE', 5300, S.c4, multi(stat('heroDamage', { max: 9 }), stat('harvestRadius', { max: 3 }), stat('flameBlade', { set: 1 })), { big: true, toast: 'FLAME BLADE!' }],
  ['archer3', '+1 ARCHER', 5600, S.c1, stat('archers', { add: 1 }), { toast: 'MORE ARCHERS!' }],
  ['cutter3', 'WOODCUTTER', 5900, S.woods, hire('hauler', ['oaks'], ['spearworks', 'fletcher', 'forge'], { options: { look: 'cutter' } }), { toast: 'WOODCUTTER HIRED!' }],
  // ---- VI. the great trebuchet
  ['mason', 'MASON', 6400, S.mason, multi(open('mason'), raid(8), stage(6)), { big: true, toast: 'THE MASON!', focus: { x: -12.5, z: -5.5 } }],
  ['treb', 'GREAT TREBUCHET', 7600, S.treb, open('treb'), { big: true, toast: 'THE GREAT TREBUCHET!', focus: { x: TREB.x, z: TREB.z }, reveal: REVEAL.treb }],
  ['quarry2', 'QUARRYMAN', 7000, S.quarry, hire('hauler', ['rocks'], ['mason', 'cat1', 'cat2'], { options: { look: 'miner' } }), { toast: 'QUARRYMAN HIRED!' }],
  ['runner4', 'BOULDER CARRIER', 7300, S.c2, hire('hauler', ['mason'], ['treb'], { home: { x: -9, z: -9 }, options: { look: 'runner', capacity: 6 } }), { toast: 'BOULDER CARRIER HIRED!' }],
  ['bounty2', 'WAR BOUNTY +50%', 8600, S.c3, multi(stat('priceMult', { mul: 1.5 }), raid(9)), { toast: 'BIGGER BOUNTIES!' }],
  ['counter', 'HEAVY COUNTERWEIGHTS', 9400, S.c4, multi(stat('trebRate', { mul: 1.5 }), stat('catRate', { mul: 1.4 })), { toast: 'FASTER SIEGE ENGINES!' }],
  // ---- finale
  ['citadel', 'THE CITADEL', 15000, S.citadel, { type: 'win' }, { big: true, toast: 'THE CITADEL STANDS!' }],
];
// prices are written relative to each other; PRICE sets the pace of the whole world (tuned with the test
// bot to about 18-19 minutes with the thrills on, which is 20-25 for a person)
const PRICE = 0.95;
const nice = (v) => (v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 10) * 10 : Math.round(v / 50) * 50);
const pads = CHAIN.map(([id, label, cost, at, effect, extra], i) => ({
  id, label, cost: i < 2 ? cost : nice(cost * PRICE), at, requires: i ? [CHAIN[i - 1][0]] : [], effect, ...(extra || {}),
}));
pads.push({ id: 'travel', label: 'WORLD SELECT', cost: 0, at: [LAY.worldGate.x, LAY.worldGate.z + 2.6], requires: ['citadel'], effect: { type: 'worlds' }, priceText: 'GO' });

// ---------------------------------------------------------------- the walls ---
// solid runs between the openings; the engines and workshops add their own blockers
function wallBlockers() {
  const Y = YARD, out = [], T = 0.5;
  const run = (a, b, fixed, alongX) => {
    if (b - a < 0.2) return;
    out.push(alongX ? { x: (a + b) / 2, z: fixed, hx: (b - a) / 2, hz: T } : { x: fixed, z: (a + b) / 2, hx: T, hz: (b - a) / 2 });
  };
  const g = LAY.gate, gp = LAY.gaps;
  run(Y.minX - 0.5, g[0], WALL_Z, true); run(g[1], Y.maxX + 0.5, WALL_Z, true);   // the gatehouse towers stand on these runs
  run(Y.minX, gp.south[0], Y.minZ, true); run(gp.south[1], Y.maxX, Y.minZ, true);
  run(Y.minZ, gp.west[0], Y.minX, false); run(gp.west[1], WALL_Z, Y.minX, false);
  run(Y.minZ, gp.east[0], Y.maxX, false); run(gp.east[1], WALL_Z, Y.maxX, false);
  return out;
}

const FOES = [
  { id: 'raider', hp: 3, bounty: 6, speed: 1.6, radius: 0.45, height: RAIDER_HEIGHT, scale: [0.9, 1.08], pool: 42, bash: 1.4, steal: 3,
    model: makeRaiderGeometry, burst: [0xffffff, 0x8fbf5a, 0x8c3b2e] },
  { id: 'shield', hp: 12, bounty: 20, speed: 1.25, radius: 0.6, height: SHIELD_HEIGHT, scale: [0.95, 1.08], pool: 30, bash: 1.5, steal: 10,
    model: makeShieldGeometry, burst: [0xffffff, 0x9aa3b2, 0x9e2a2a] },
  { id: 'brute', hp: 50, bounty: 70, speed: 0.95, radius: 0.9, height: BRUTE_HEIGHT, scale: [1, 1.15], pool: 16, bash: 2.0, steal: 35,
    model: makeBruteGeometry, burst: [0xffffff, 0x9a8f6a, 0x6f4a2c] },
  { id: 'knight', hp: 28, bounty: 45, speed: 2.4, radius: 0.5, height: KNIGHT_HEIGHT, scale: [0.95, 1.05], pool: 22, bash: 1.1, steal: 25,
    model: makeKnightGeometry, burst: [0xffffff, 0x5c6675, 0xd23c3c] },
  { id: 'ram', hp: 260, bounty: 300, speed: 0.65, radius: 1.3, height: RAM_HEIGHT, scale: [1, 1], pool: 5, bash: 2.5, steal: 150, blows: 4,
    model: makeRamGeometry, burst: [0xffffff, 0x8a5a32, 0x5b6270] },
];
// raid level -> wave; a stage pad raises the level. Income if every foe falls: about 3, 5, 11, 20, 35, 67,
// 94, 136, 188 a second (before the bounty upgrades)
const WAVES = [
  null,
  { every: 6, mix: { raider: 3 } },
  { every: 7, mix: { raider: 6 } },
  { every: 8, mix: { raider: 8, shield: 2 } },
  { every: 8, mix: { raider: 10, shield: 5 } },
  { every: 9, mix: { raider: 10, shield: 6, brute: 2 } },
  { every: 9, mix: { raider: 12, shield: 7, brute: 3, knight: 4 } },
  { every: 10, mix: { raider: 12, shield: 8, brute: 5, knight: 8 } },
  { every: 10, mix: { raider: 14, shield: 10, brute: 6, knight: 8, ram: 1 } },
  { every: 10, mix: { raider: 16, shield: 12, brute: 7, knight: 10, ram: 2 } },
];

export default {
  id: 'keep', name: 'Ironwall Keep',
  modules: ['../../engine/stations/horde.js', '../../engine/stations/battery.js', '../../engine/stations/solid.js'],
  assets: ['nature-kit/rock_largeA', 'nature-kit/rock_tallA', 'nature-kit/rock_smallA'],
  looks: {
    player: { model: 'knight', tool: 'sword' },
    hauler: { model: 'male-e', tool: 'axe', hat: 'cap' },
    cutter: { model: 'male-e', tool: 'axe', hat: 'cap' },
    miner: { model: 'worker', tool: 'axe' },
    runner: { model: 'soldier', tool: null },
    cashier: { model: 'employee', tool: null },
  },
  lighting: {
    variant: 'outdoor', background: 0xa8d8f0,
    hemi: { sky: 0xeaf6ff, ground: 0xb7c98a, intensity: 1.6 },
    sun: { color: 0xfff0d6, intensity: 1.25 },
    fill: { color: 0xe8f0ff, intensity: 0.6 },
  },
  camera: { viewPortrait: 28, viewLandscape: 20 },
  bounds: { minX: -37, maxX: 34, minZ: -32, maxZ: 44 },
  player: { start: { x: 0, z: 2.5 }, speed: 6.6, capacity: 20, harvestRadius: 1.5, look: 'player' },

  // raid: wave level; heroDamage / harvestRadius: the knight's blade; archers: extra bows per tower;
  // *Damage / *Rate: engine upgrades; fireArrows / stoneFire: 1 once lit; craft: workshop speed
  stats: {
    stage: 1, raid: 1, regrow: 7, heroDamage: 1, harvestRadius: 1.5, archers: 0, bowDamage: 1, bowRate: 1, xbowDamage: 1, xbowRate: 1,
    spearDamage: 1, oreRegrow: 9, stoneRegrow: 9, fireArrows: 0, stoneFire: 0, catRate: 1, trebRate: 1, craft: 1, flameBlade: 0,
  },

  items: [
    { id: 'log', name: 'Logs', value: 3, geometry: makeLogGeometry, step: SIZES.logStep, footprint: { w: SIZES.log.len, d: SIZES.log.d } },
    { id: 'arrows', name: 'Arrows', value: 4, geometry: makeArrowsGeometry, step: SIZES.arrowsStep, footprint: { w: SIZES.arrows.len, d: SIZES.arrows.d } },
    { id: 'ore', name: 'Iron ore', value: 4, geometry: makeOreGeometry, step: SIZES.oreStep, footprint: { w: SIZES.ore.len, d: SIZES.ore.d } },
    { id: 'bolts', name: 'Bolts', value: 6, geometry: makeBoltsGeometry, step: SIZES.boltsStep, footprint: { w: SIZES.bolts.len, d: SIZES.bolts.d } },
    { id: 'spear', name: 'Spears', value: 10, geometry: makeSpearGeometry, step: SIZES.spearStep, footprint: { w: SIZES.spear.len, d: SIZES.spear.d } },
    { id: 'stone', name: 'Stones', value: 5, geometry: makeStoneGeometry, step: SIZES.stoneStep, footprint: { w: SIZES.stone.len, d: SIZES.stone.d } },
    { id: 'boulder', name: 'Boulders', value: 15, geometry: makeBoulderGeometry, step: SIZES.boulderStep, footprint: { w: SIZES.boulder.len, d: SIZES.boulder.d } },
  ],

  stations: [
    // ---- the raiders
    { id: 'raid', type: 'horde', name: 'RAIDERS', open: true, area: LAY.field, wallZ: WALL_Z + 0.55, spawnZ: 41,
      kinds: FOES, waves: WAVES, levelStat: 'raid', cash: 'chest',
      melee: { damageStat: 'heroDamage', swingTime: 0.32 },
      alert: { count: 3, text: 'Raiders at the wall! Fight!' }, home: { x: 0, z: 13 }, hint: 'Fight the raiders!' },
    // ---- the war chest by the gate: every bounty lands here
    { id: 'chest', type: 'cashpile', name: 'WAR CHEST', open: true, cashPile: { x: LAY.chest.x, z: LAY.chest.z, r: 1.45 }, bundle: 6, markers: false },

    // ---- harvests
    { id: 'oaks', type: 'source', name: 'Logs', item: 'log', open: false,
      grid: { x0: -34.8, z0: -7.6, dx: 1.9, dz: 2.0, cols: 7, rows: 9, jitter: 0.45 },
      plant: makeOakGeometry, stub: makeOakStumpGeometry, sway: true, plantHeight: OAK_HEIGHT, regrowJitter: 3, growTime: 0.6,
      burst: [0x6fbb4a, 0x4f9a3a, 0xd9a96c], action: 'swing', home: { x: -20, z: 0.5 }, hint: 'Chop the oaks!' },
    { id: 'veins', type: 'source', name: 'Iron ore', item: 'ore', open: false,
      grid: { x0: 24.2, z0: -6.8, dx: 2.0, dz: 2.1, cols: 5, rows: 8, jitter: 0.35 },
      plant: makeVeinGeometry, stub: makeRubbleGeometry, sway: false, plantHeight: VEIN_HEIGHT, regrowStat: 'oreRegrow', regrowJitter: 3, growTime: 0.5,
      burst: [0x6b5a50, 0xc0703a, 0x9aa3b2], action: 'swing', home: { x: 20, z: 0.5 }, hint: 'Mine the iron!' },
    { id: 'rocks', type: 'source', name: 'Stones', item: 'stone', open: false,
      grid: { x0: 2.4, z0: -29.8, dx: 2.0, dz: 2.0, cols: 7, rows: 6, jitter: 0.3 },
      plant: makeQuarryRockGeometry, stub: makeGravelGeometry, sway: false, plantHeight: QUARRY_HEIGHT, regrowStat: 'stoneRegrow', regrowJitter: 3, growTime: 0.5,
      burst: [0xe2dccf, 0xc9c1b2, 0x9c9384], action: 'swing', home: { x: 6.8, z: -15 }, hint: 'Quarry the stone!' },

    // ---- workshops (inputs face the gap their goods come through)
    workshop('fletcher', 'FLETCHER', -12.5, 0.5, { in: { log: 1 }, out: { arrows: 2 }, time: 1.0 }, -1,
      { input: 'LOGS', output: 'ARROWS' }, { drop: 'Bring logs to the fletcher!', pickup: 'Grab the arrows!' }),
    workshop('forge', 'FORGE', 12.5, 0.5, { in: { log: 1, ore: 1 }, out: { bolts: 2 }, time: 1.4 }, 1,
      { input: 'LOGS + IRON', output: 'BOLTS' }, { drop: 'Bring logs and iron to the forge!', pickup: 'Grab the bolts!' }),
    workshop('spearworks', 'SPEAR WORKS', 12.5, -5.5, { in: { log: 2, ore: 1 }, out: { spear: 1 }, time: 1.8 }, 1,
      { input: 'LOGS + IRON', output: 'SPEARS' }, { drop: 'Bring logs and iron to the spear works!', pickup: 'Grab the spears!' }),
    workshop('mason', 'MASON', -12.5, -5.5, { in: { stone: 3 }, out: { boulder: 1 }, time: 2.2 }, 1,
      { input: 'STONES', output: 'BOULDERS' }, { drop: 'Bring stones to the mason!', pickup: 'Grab the boulders!' }),

    // ---- war engines
    wallEngine('bow1', 'bow', SLOT.w1, { start: 5 }), wallEngine('bow2', 'bow', SLOT.e1), wallEngine('bow3', 'bow', SLOT.w2), wallEngine('bow4', 'bow', SLOT.w4),
    wallEngine('xbow1', 'xbow', SLOT.e2), wallEngine('xbow2', 'xbow', SLOT.w3),
    wallEngine('ballista1', 'ballista', SLOT.e3), wallEngine('ballista2', 'ballista', SLOT.e4),
    engine('cat1', 'catapult', CATS[0].x, CATS[0].z, S.cat1), engine('cat2', 'catapult', CATS[1].x, CATS[1].z, S.cat2),
    engine('treb', 'treb', TREB.x, TREB.z, S.treb, { blockers: [{ x: TREB.x, z: TREB.z, hx: 2.0, hz: 3.4 }] }),

    // ---- the walls, and the scenery outside that blocks the player (scene.js adds trees and rocks)
    { id: 'walls', type: 'solid', name: 'WALLS', open: true, blockers: wallBlockers() },
    { id: 'forest', type: 'solid', name: 'FOREST', open: true, blockers: [] },
  ],

  workers: {
    hauler: { look: 'cutter', speed: 4.7, capacity: 12, harvestRadius: 1.2 },
  },

  pads,

  hints: {
    harvest: 'Fight the raiders!',
    pickup: 'Pick up {name}!',
    drop: 'Bring it to the {name}!',
    cash: 'Empty the war chest!',
    buy: 'Buy: {label}',
    travel: 'Visit your other worlds!',
  },

  finale: { pad: 'citadel', focus: { x: LAY.citadel.x, z: LAY.citadel.z, w: 12, d: 12 } },

  autoplay: { chain: true },

  hud: { stages: ['THE GATE', 'CROSSBOWS', 'FIRE ARROWS', 'BALLISTAE', 'CATAPULTS', 'TREBUCHET'], stageStat: 'stage' },

  layout: { ...LAY, slots: SLOT, towerZ: TOWER_Z, ammoZ: AMMO_Z, cats: CATS, treb: TREB, ammoZone: AMMO_ZONE },
};
