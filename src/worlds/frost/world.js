// Frostpine Camp: the winter world. Alone in a snowy clearing with an axe.
//   pine grove (chop) -> logs ; tusker herd (hunt, they take a few hits) -> meat
//   trading post (villagers queue from the trail) ; cook fire (2 meat + 1 log -> 1 roast, worth far more)
//   a palisade goes up around the camp; woodcutters, hunters and carriers join; watchtowers shoot the
//   herd and fill the larder; whirling axes fell whole stands at once; the elder herd in the high snow;
//   the Great Beacon lights the valley.
// Everything here is data; scene.js dresses it, models.js builds the models.
import {
  makeLogGeometry, makeMeatGeometry, makeRoastGeometry, makePineGeometry, makeStumpGeometry, makeTuskerGeometry,
  makeWatchtower, SIZES, PINE_HEIGHT, TUSKER_HEIGHT,
} from './models.js';

// ------------------------------------------------------------------ layout ---
// The camera looks from (-x, -z): +x and +z are "up" the screen. The camp is a square yard. The trading
// post is in its east wall (+x, the far side: villagers queue outside, facing the camera), the grove
// lies beyond the north side (+z), the hunting ground beyond the west gate (-x), the high snow to the
// north-west, the beacon rises beyond the north-east corner, and the world gate is outside the south gate.
const CAMP = { minX: -8, maxX: 10, minZ: -8, maxZ: 10 };
const LAY = {
  ground: { minX: -70, maxX: 80, minZ: -70, maxZ: 80 },
  camp: CAMP,
  // openings in the palisade, as [from, to] along each wall
  gates: { north: [-5, 7], west: [-3, 7], south: [-5, 0], east: [-2.2, 2.2] },
  grove: { minX: -7, maxX: 9.5, minZ: 13, maxZ: 24 },
  hunt: { minX: -29, maxX: -14, minZ: -6, maxZ: 10 },
  high: { minX: -30, maxX: -14, minZ: 15, maxZ: 29 },
  towers: [{ x: -8.7, z: -4.3 }, { x: -8.7, z: 8.3 }],
  trail: [{ x: 42, z: 24 }, { x: 20, z: 0 }],
  beacon: { x: 18, z: 12.5, w: 11, d: 11 },     // behind the camp (up the screen), so it towers over it without hiding it
  gate: { x: -2.5, z: -15.5 },
};
const POST = {
  counter: { x: 10, z: 0, yaw: 0, ...SIZES.counter },           // customers on the +x side (outside the wall)
  dropZone: { x: 7.4, z: 0, r: 1.7 },
  cashPile: { x: 7.2, z: -4.5, r: 1.5 },
};
const FIRE = { x: 0, z: 2.5 };
const LARDER = { x: -5.4, z: -5.6 };

const sq = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const hire = (role, from, to, extra) => ({ type: 'hire', role, from, to, ...extra });
const stat = (s, op) => ({ type: 'stat', stat: s, ...op });
const multi = (...effects) => ({ type: 'multi', effects });

// pad slots: a bought pad disappears, so the same spot serves several pads in turn
const S = {
  mid: [0, -2.4], south: [3.5, -5.4], south2: [0.2, -5.4], post: [5.4, 5.7], north: [-1.8, 7.3], north2: [1.8, 7.3],
  out: [-10.7, 2], tower1: [-5.6, -1.5], tower2: [-5.4, 6.6], high: [-10.7, 12.4], beacon: [13, 6.6], gate: [-2.5, -11.2],
};

const REVEAL = {
  camp: { title: 'THE CAMP', sub: 'Walls against the cold', zoom: 1.12, run: 0.8, shots: [{ at: [1, 1], show: ['*'], hold: 1.3 }] },
  hunt: { title: 'HUNTING GROUND', sub: 'Tuskers give meat', zoom: 0.95, run: 1.6, shots: [{ at: [-20, 2], show: ['tuskers', 'scene'], hold: 1.0 }] },
  fire: { title: 'COOK FIRE', sub: 'Meat and logs make roasts', zoom: 0.8, run: 1.2, shots: [{ at: [0, 2.5], show: ['fire', 'scene'], hold: 1.1 }] },
  tower1: { title: 'WATCHTOWER', sub: 'It hunts for you', zoom: 0.9, run: 2.2, shots: [{ at: [-9, -3], show: ['*'], hold: 0.9 }] },
  high: { title: 'THE HIGH SNOW', sub: 'Elder tuskers: more meat', zoom: 1.0, run: 1.6, shots: [{ at: [-22, 22], show: ['elders', 'scene'], hold: 1.0 }] },
};

const CHAIN = [
  // ---- alone in the snow: logs for the villagers
  ['camp', 'BUILD CAMP', 30, S.mid, multi({ type: 'stage', stage: 2 }, { type: 'open', stations: ['walls'] }), { big: true, toast: 'THE CAMP STANDS!', focus: { x: 1, z: 1 }, reveal: REVEAL.camp }],
  ['hunt', 'HUNTING GROUND', 70, S.out, { type: 'open', stations: ['tuskers'] }, { big: true, toast: 'TUSKERS!', focus: { x: -20, z: 2 }, reveal: REVEAL.hunt }],
  ['trader', 'TRADER', 110, S.post, hire('cashier', null, 'post'), { toast: 'TRADER HIRED!' }],
  ['axe1', 'SHARP AXE', 180, S.south, multi(stat('damage', { set: 2 }), stat('harvestRadius', { max: 1.9 })), { toast: 'SHARPER AXE!' }],
  ['cutter1', 'WOODCUTTER', 240, S.north, hire('hauler', ['pines'], ['post', 'fire'], { options: { look: 'cutter' } }), { toast: 'WOODCUTTER HIRED!' }],
  ['pack1', 'BIGGER PACK', 320, S.south2, stat('capacity', { max: 35 })],
  // ---- the cook fire: raw goods become roasts
  ['fire', 'COOK FIRE', 650, S.mid, multi({ type: 'open', stations: ['fire'] }, { type: 'stage', stage: 3 }), { big: true, toast: 'COOK FIRE!', focus: FIRE, reveal: REVEAL.fire }],
  ['hunter1', 'HUNTER', 500, S.out, hire('hauler', ['tuskers'], ['fire'], { options: { look: 'hunter', harvestRadius: 1.2 } }), { toast: 'HUNTER HIRED!' }],
  ['carrier1', 'CARRIER', 560, S.post, hire('hauler', ['fire'], ['post'], { home: { x: 5.2, z: 5.2 }, options: { look: 'carrier', capacity: 14 } }), { toast: 'CARRIER HIRED!' }],
  ['boots1', 'FUR BOOTS', 620, S.south, stat('speed', { mul: 1.2 })],
  ['price1', 'SMOKED +25%', 820, S.south2, stat('priceMult', { mul: 1.25 })],
  // ---- defences that hunt for you
  ['tower1', 'WATCHTOWER', 1100, S.tower1, multi({ type: 'open', stations: ['larder'] }, hire('turret', 'tuskers', 'larder', { spot: LAY.towers[0] }), { type: 'stage', stage: 4 }), { big: true, toast: 'WATCHTOWER!', focus: { x: -9, z: -3 }, reveal: REVEAL.tower1 }],
  ['porter1', 'PORTER', 800, S.south2, hire('hauler', ['larder'], ['fire'], { home: { x: -2.6, z: -3.2 }, options: { look: 'porter', capacity: 14 } }), { toast: 'PORTER HIRED!' }],
  ['whirl', 'WHIRLING AXES', 1300, S.south, multi(stat('damage', { set: 4 }), stat('harvestRadius', { max: 3.1 }), stat('whirl', { set: 1 })), { big: true, toast: 'WHIRLING AXES!' }],
  ['cook2', 'HOTTER FIRE', 1450, S.mid, stat('cookSpeed', { mul: 1.5 })],
  ['pack2', 'HUGE PACK', 1600, S.north2, stat('capacity', { max: 55 })],
  // ---- the high snow
  ['high', 'THE HIGH SNOW', 2400, S.high, multi({ type: 'open', stations: ['elders'] }, { type: 'stage', stage: 5 }), { big: true, toast: 'ELDER TUSKERS!', focus: { x: -22, z: 22 }, reveal: REVEAL.high }],
  ['hunter2', 'ELDER HUNTER', 1900, S.high, hire('hauler', ['elders'], ['fire'], { options: { look: 'hunter', harvestRadius: 1.2, capacity: 16 } }), { toast: 'HUNTER HIRED!' }],
  ['tower2', 'WATCHTOWER', 2300, S.tower2, hire('turret', 'elders', 'larder', { spot: LAY.towers[1], options: { range: 19, damage: 5 } }), { big: true, toast: 'SECOND TOWER!', focus: { x: -9, z: 8 } }],
  ['cutter2', 'WOODCUTTER', 2000, S.north, hire('hauler', ['pines'], ['fire'], { options: { look: 'cutter' } }), { toast: 'WOODCUTTER HIRED!' }],
  ['cook3', 'ROARING FIRE', 2700, S.mid, stat('cookSpeed', { mul: 1.5 })],
  ['price2', 'FEAST PRICES +50%', 3300, S.south2, stat('priceMult', { mul: 1.5 })],
  ['carrier2', 'CARRIER', 2900, S.post, hire('hauler', ['fire'], ['post'], { home: { x: 5.2, z: 5.2 }, options: { look: 'carrier', capacity: 14 } }), { toast: 'CARRIER HIRED!' }],
  // ---- finale
  ['beacon', 'THE GREAT BEACON', 6500, S.beacon, { type: 'win' }, { big: true, toast: 'THE GREAT BEACON!' }],
];
const pads = CHAIN.map(([id, label, cost, at, effect, extra], i) => ({ id, label, cost, at, requires: i ? [CHAIN[i - 1][0]] : [], effect, ...(extra || {}) }));
pads.push({ id: 'travel', label: 'WORLD SELECT', cost: 0, at: S.gate, requires: ['beacon'], effect: { type: 'worlds' }, priceText: 'GO' });

// the palisade: solid wall runs between the gate openings (boxes for the 'walls' station)
function wallBlockers() {
  const C = CAMP, G = LAY.gates, T = 0.32, out = [];
  const run = (a, b, fixed, alongX) => {
    if (b - a < 0.2) return;
    out.push(alongX ? { x: (a + b) / 2, z: fixed, hx: (b - a) / 2, hz: T } : { x: fixed, z: (a + b) / 2, hx: T, hz: (b - a) / 2 });
  };
  run(C.minX, G.north[0], C.maxZ, true); run(G.north[1], C.maxX, C.maxZ, true);
  run(C.minX, G.south[0], C.minZ, true); run(G.south[1], C.maxX, C.minZ, true);
  run(C.minZ, G.east[0], C.maxX, false); run(G.east[1], C.maxZ, C.maxX, false);
  run(C.minZ, G.west[0], C.minX, false); run(G.west[1], C.maxZ, C.minX, false);
  return out;
}

export default {
  id: 'frost', name: 'Frostpine Camp',
  modules: ['../../engine/stations/herd.js', '../../engine/stations/solid.js', '../../engine/workers/turret.js'],
  assets: ['nature-kit/rock_largeA', 'nature-kit/rock_tallA', 'nature-kit/rock_smallA', 'nature-kit/log_stack'],
  looks: {
    player: { model: 'male-d', tool: 'axe', hat: 'fur' },
    hauler: { model: 'male-e', tool: 'axe', hat: 'fur' },
    cutter: { model: 'male-e', tool: 'axe', hat: 'fur' },
    hunter: { model: 'female-d', tool: 'axe', hat: 'fur' },
    carrier: { model: 'male-a', tool: null, hat: 'fur' },
    porter: { model: 'female-b', tool: null, hat: 'fur' },
    cashier: { model: 'employee', tool: null, hat: 'fur' },
    customers: ['female-a', 'female-c', 'female-e', 'male-b', 'male-f', 'female-f'].map((model) => ({ model, hat: 'fur' })),
  },
  lighting: {
    variant: 'outdoor', background: 0xdcebf7,
    hemi: { sky: 0xf4f9ff, ground: 0xc4d8f0, intensity: 1.7 },
    sun: { color: 0xfff1dc, intensity: 1.2 },
    fill: { color: 0xe4eeff, intensity: 0.65 },
  },
  bounds: { minX: -32, maxX: 15.5, minZ: -19, maxZ: 31 },
  player: { start: { x: 1.5, z: 6.5 }, speed: 6.6, capacity: 20, harvestRadius: 1.4, look: 'player' },

  // regrow: seconds for a pine to grow back; herdRegrow / elderRegrow: until a tusker is replaced;
  // damage: per swing; harvestRadius: reach (an upgrade pad raises it); whirl: 1 once the axes circle
  stats: { stage: 1, regrow: 10, herdRegrow: 7, elderRegrow: 11, damage: 1, harvestRadius: 1.4, whirl: 0, cookSpeed: 1 },

  items: [
    { id: 'log', name: 'Logs', value: 3, geometry: makeLogGeometry, step: SIZES.logStep, footprint: { w: SIZES.log.len, d: SIZES.log.d } },
    { id: 'meat', name: 'Meat', value: 10, geometry: makeMeatGeometry, step: SIZES.meatStep, footprint: { w: SIZES.meat.len, d: SIZES.meat.d } },
    // roast = 2 meat + 1 log (23) x 2.6
    { id: 'roast', name: 'Roasts', value: 60, geometry: makeRoastGeometry, step: SIZES.roastStep, footprint: { w: SIZES.roast.len, d: SIZES.roast.d } },
  ],

  stations: [
    // ---- the pine grove (60 pines, scattered)
    { id: 'pines', type: 'source', name: 'Logs', item: 'log', open: true,
      grid: { x0: -6.4, z0: 13.6, dx: 1.72, dz: 1.9, cols: 10, rows: 6, jitter: 0.5 },
      plant: makePineGeometry, stub: makeStumpGeometry, sway: true, plantHeight: PINE_HEIGHT, regrowJitter: 3, growTime: 0.6,
      burst: [0xffffff, 0xe6f2ff, 0x46a088], action: 'swing', home: { x: 1, z: 11.6 }, hint: 'Chop the pines!' },

    // ---- the herds
    { id: 'tuskers', type: 'herd', name: 'Meat', item: 'meat', open: false,
      area: LAY.hunt, count: 10, hp: 3, drops: 3, radius: 0.62, height: TUSKER_HEIGHT, scale: [0.9, 1.1],
      speed: 1.2, chase: 2.4, aggro: 6.5, regrowStat: 'herdRegrow', regrowJitter: 2.5,
      spawn: [{ x: -31, z: -4 }, { x: -31, z: 3 }, { x: -31, z: 9 }], model: () => makeTuskerGeometry(false),
      burst: [0xffffff, 0xe6f2ff, 0xc49a72], home: { x: -12, z: 2 }, hint: 'Hunt the tuskers!' },
    { id: 'elders', type: 'herd', name: 'Meat', item: 'meat', open: false,
      area: LAY.high, count: 7, hp: 14, drops: 7, radius: 0.9, height: TUSKER_HEIGHT, scale: [1.45, 1.7],
      speed: 1.0, chase: 2.0, aggro: 7, regrowStat: 'elderRegrow', regrowJitter: 3,
      spawn: [{ x: -32, z: 18 }, { x: -32, z: 26 }, { x: -22, z: 31 }], model: () => makeTuskerGeometry(true),
      burst: [0xffffff, 0xa9d8ee, 0x9fb0c4], home: { x: -12, z: 14 }, hint: 'Hunt the elder tuskers!' },

    // ---- the cook fire: 2 meat + 1 log -> 1 roast
    { id: 'fire', type: 'converter', name: 'COOK FIRE', open: false, x: FIRE.x, z: FIRE.z,
      recipe: { in: { meat: 2, log: 1 }, out: { roast: 1 }, time: 2.0 }, batch: 2, speedStat: 'cookSpeed', inputCap: 48,
      machine: { w: 2.8, d: 3.4, h: 1.9, yaw: 0 },
      dropZone: { x: -4.9, z: 2.5, r: 1.6 }, workerSpot: { x: -4.9, z: 2.5 },
      input: { layout: { x: -3.0, z: 2.5, cols: 2, rows: 3 } },
      output: { capacity: 30, zone: { x: 4.9, z: 2.5, r: 1.5 }, layout: { x: 3.2, z: 2.5, cols: 2, rows: 3 } },
      labels: { input: 'COOK', output: 'ROASTS' }, hints: { drop: 'Bring meat and logs to the fire!', pickup: 'Grab the roasts!' },
      placeholder: false, markers: false },

    // ---- the larder: what the towers bring down lands here
    { id: 'larder', type: 'pile', name: 'LARDER', item: 'meat', open: false, x: LARDER.x, z: LARDER.z, capacity: 40, start: 0,
      layout: { x: LARDER.x, z: LARDER.z + 0.15, y: 0.14, cols: 3, rows: 3 }, pallet: false,
      zone: { x: -3.1, z: -5.3, r: 1.5 }, label: 'MEAT', hint: 'Take the meat to the fire!', placeholder: false, markers: false },

    // ---- the trading post (villagers walk in along the trail)
    { id: 'post', type: 'shop', name: 'SELL', open: true, accepts: ['log', 'meat', 'roast'], display: 'log', extraLine: 2,
      counter: POST.counter, dropZone: POST.dropZone, cashPile: POST.cashPile,
      queue: sq(6, (i) => ({ x: 11.6 + i * 1.0, z: 0 })),
      customerIn: [LAY.trail[0], LAY.trail[1]],
      customerOut: [{ x: 11.6, z: -2.7 }, { x: 20, z: -5 }, { x: 42, z: -26 }],
      cashierSpot: { x: 10.2, z: 1.6 }, workerSpot: { x: 7.4, z: -2.3 },
      hint: 'Sell at the trading post!' },

    // ---- the forest around the play areas: scene.js adds a circle for every tree and boulder it plants there
    { id: 'forest', type: 'solid', name: 'FOREST', open: true, blockers: [{ x: LAY.beacon.x, z: LAY.beacon.z, r: 4.5 }] },
    // ---- the palisade (appears with the camp; scene.js adds the tent and woodpiles)
    { id: 'walls', type: 'solid', name: 'PALISADE', open: false, blockers: wallBlockers() },
  ],

  workers: {
    hauler: { look: 'cutter', speed: 4.6, capacity: 12, harvestRadius: 1.15 },
    cashier: { look: 'cashier' },
    turret: { every: 0.85, range: 15, damage: 2.5, model: makeWatchtower, bolt: 0xfff4dc },
  },

  pads,

  hints: {
    harvest: 'Chop the pines!',
    pickup: 'Pick up {name}!',
    drop: 'Sell at the trading post!',
    cash: 'Grab your coin!',
    buy: 'Buy: {label}',
    travel: 'Visit your other worlds!',
  },

  finale: { pad: 'beacon', focus: LAY.beacon },

  // the test bot delivers what it carries before gathering more, and finds its way round the walls
  autoplay: { chain: true },

  hud: { stages: ['CLEARING', 'CAMP', 'COOK FIRE', 'WATCHTOWERS', 'HIGH SNOW'], stageStat: 'stage' },

  layout: LAY,
};
