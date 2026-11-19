// Wheatwhistle Junction: the sixth world. A farm that grows into a town around its railway.
//   wheat field (scythe sweeps) -> market stall ; windmill (3 wheat -> 1 flour) ; bakery (2 flour -> 1
//   bread, worth far more) ; farmhands, a combine harvester, a bakery truck ; cows fed from a wheat
//   trough give milk, the creamery turns it into cheese ; a pumpkin patch ; a railway with a goods
//   platform: the freight train comes on a schedule, every wagon wants its own goods and a full train
//   pays a bonus ; cottages, a town square and a clock tower go up ; the Harvest Fair opens.
// Everything here is data; scene.js dresses it, models.js builds the models.
//
// Layout (the camera looks from (-x, -z): +x is up-left and +z up-right on screen; tall things stand
// on the +x / +z side of what they serve). Everything hangs off one street that runs along z:
//
//      z 23  ======== railway (the train runs toward -x) ========[crossing]
//      z 20  [ goods platform + station house            ]         |
//      z 12  WINDMILL  out>|      |<in  BAKERY  (truck yard)       | road
//      z  0  WHEAT FIELD   |street|  STALL  queue  (town square)   | x 22
//      z-11  PUMPKINS      |      |<out CREAMERY  trough, PADDOCK  |
//            x -12 .. 0     1.4-5.2    6 .. 19
import {
  makeWheatGeometry, makeFlourGeometry, makeBreadGeometry, makeMilkGeometry, makeCheeseGeometry, makePumpkinGeometry,
  makeWheatPlant, makeWheatStub, makePumpkinPlant, makePumpkinStub, makeMilkCanPlant, makeMilkStub,
  makeCombine, makeBakeryTruck, makeTrain, SIZES, WHEAT_HEIGHT,
} from './models.js';

// ------------------------------------------------------------------ layout ---
const RAIL_Z = 23, ROAD_X = 22.3;
const LAY = {
  ground: { minX: -70, maxX: 84, minZ: -70, maxZ: 84 },
  street: { minX: 1.4, maxX: 5.2 },
  wheat: { x0: -12.5, z0: -5.5, dx: 1.0, dz: 1.0, cols: 14, rows: 12 },
  pumpkins: { x0: -11.2, z0: -16.6, dx: 1.55, dz: 1.55, cols: 8, rows: 5 },
  milk: { x0: 13.2, z0: -17.4, dx: 2.4, dz: 2.3, cols: 3, rows: 4 },
  paddock: { minX: 11.6, maxX: 19.2, minZ: -18.8, maxZ: -7.2 },
  railZ: RAIL_Z, roadX: ROAD_X,
  deck: { minX: -10, maxX: 14, minZ: 19.5, maxZ: 21.9, h: 0.34 },
  stationHouse: { x: 10.6, z: 20.75 }, clock: { x: 13.6, z: 20.7 },
  truck: { stop: { x: 12.8, z: 8.4 } },
  square: { minX: 10.4, maxX: 19.4, minZ: -5.2, maxZ: 4.4 }, fountain: { x: 15.4, z: 2.5 },
  fair: { x: 13.5, z: 30, w: 13, d: 11 },
  gate: { x: 3.3, z: -20.6 },
};
const MILL = { x: -5.5, z: 13.0 }, BAKERY = { x: 10.4, z: 12.6 }, CREAMERY = { x: 8.6, z: -10.4 };
const STALL = {
  counter: { x: 9.5, z: 0, yaw: 0, ...SIZES.counter },             // customers on the +x side
  dropZone: { x: 6.9, z: 0, r: 1.7 },
  cashPile: { x: 6.9, z: -4.3, r: 1.5 },
};
const PLATFORM = { x: 3.2, z: 20.7 };

const sq = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const hire = (role, from, to, extra) => ({ type: 'hire', role, from, to, ...extra });
const stat = (s, op) => ({ type: 'stat', stat: s, ...op });
const multi = (...effects) => ({ type: 'multi', effects });
const open = (...stations) => ({ type: 'open', stations });
const stage = (n) => ({ type: 'stage', stage: n });

// pad slots: a bought pad disappears, so the same spot serves several pads in turn
const S = {
  yard: [3.3, 3.6], yardS: [3.3, -3.6], oven: [3.3, 6.6], field: [-3.0, 7.9], mill: [-8.0, 8.4],
  north: [0.6, 14.4], station: [10.8, 17.0], dairy: [14.0, -5.4], south: [3.3, -7.4], patch: [-5.5, -7.6],
  town: [15.0, 14.8], clock: [15.0, 14.8], gate: [3.3, -16.6],
};

// the freight train: in from the east over the level crossing, out to the west
const TRAIN = {
  model: makeTrain, countStat: 'wagons', rateStat: 'trainRate', priceStat: 'trainPrice',
  every: 26, first: 2, dwell: 11, loadInterval: 0.08, speed: 11, accel: 5, lead: 4.35, spacing: 4.3,
  priceMult: 1.5, bonus: 0.3,
  wagons: [{ kinds: ['bread'], capacity: 16 }, { kinds: ['cheese'], capacity: 12 }, { kinds: ['pumpkin'], capacity: 12 }],
  path: { in: [{ x: 66, z: RAIL_Z }], stop: { x: -7.2, z: RAIL_Z }, out: [{ x: -62, z: RAIL_Z }] },
};
// the bakery truck: up the road from the south, round the bakery yard and back
const TRUCK = {
  model: makeBakeryTruck, kinds: ['bread'], capacity: 14, every: 16, first: 3, loadInterval: 0.09, speed: 8, patience: 2,
  path: {
    in: [{ x: ROAD_X, z: -40 }, { x: ROAD_X, z: 2.6 }, { x: 19.2, z: 7.6 }], stop: LAY.truck.stop,
    out: [{ x: 9.7, z: 8.0 }, { x: 8.7, z: 6.4 }, { x: 10.6, z: 5.3 }, { x: 18.4, z: 5.5 }, { x: ROAD_X, z: 1.0 }, { x: ROAD_X, z: -40 }],
  },
};

const REVEAL = {
  mill: { title: 'THE WINDMILL', sub: 'Three sheaves make a sack of flour', zoom: 0.9, run: 1.6, shots: [{ at: [-5.5, 11.5], show: ['*'], hold: 1.2 }] },
  bakery: { title: 'THE BAKERY', sub: 'Flour becomes bread: worth far more', zoom: 0.85, run: 1.6, shots: [{ at: [9, 11], show: ['*'], hold: 1.2 }] },
  combine: { title: 'COMBINE HARVESTER', sub: 'It reaps the whole field for the mill', zoom: 1.0, run: 2.4, shots: [{ at: [-9, 5], show: ['*'], hold: 0.9 }] },
  truck: { title: 'BAKERY TRUCK', sub: 'It buys bread straight from the oven', zoom: 0.9, run: 3.4, shots: [{ at: [13, 8], show: ['*'], hold: 0.6 }] },
  dairy: { title: 'THE DAIRY', sub: 'Feed the cows wheat: they give milk three times as fast', zoom: 0.95, run: 1.2, shots: [{ at: [14.5, -12], show: ['*'], hold: 1.4 }] },
  creamery: { title: 'THE CREAMERY', sub: 'Milk becomes wheels of cheese', zoom: 0.85, run: 1.4, shots: [{ at: [8, -11.5], show: ['*'], hold: 1.2 }] },
  patch: { title: 'PUMPKIN PATCH', sub: 'Fat pumpkins: the train will want them', zoom: 0.95, run: 1.0, shots: [{ at: [-5.5, -13], show: ['*'], hold: 1.3 }] },
  junction: { title: 'THE RAILWAY', sub: 'Load the platform: a full train pays a bonus', zoom: 1.05, run: 5.2,
    shots: [{ at: [7, 20.5], show: ['scene'], hold: 0.9, zoom: 1.5 }, { at: [1.5, 20.5], show: ['*'], hold: 0.8, zoom: 1.4 }] },
  town: { title: 'A TOWN IS BORN', sub: 'Townsfolk pay better for good food', zoom: 1.25, run: 1.0, shots: [{ at: [16, 22], show: ['*'], hold: 1.8 }] },
  square: { title: 'TOWN SQUARE', sub: 'A fountain, lamps and a busier market', zoom: 0.95, run: 1.0, shots: [{ at: [14.5, 0], show: ['*'], hold: 1.5 }] },
  clock: { title: 'CLOCK TOWER', sub: 'The trains now run on time: more of them', zoom: 1.05, run: 1.2, shots: [{ at: [12, 19], show: ['*'], hold: 1.5 }] },
};

const HAND = { options: { look: 'farmhand' } };
const CHAIN = [
  // ---- stage 1: alone in the field with a scythe
  ['keeper', 'STALL KEEPER', 25, S.yard, hire('cashier', null, 'stall'), { toast: 'STALL KEEPER HIRED!' }],
  ['scythe', 'SHARP SCYTHE', 55, S.yardS, stat('harvestRadius', { max: 2.1 }), { toast: 'A WIDER SWEEP!' }],
  ['sack1', 'BIG SACK', 90, S.yard, stat('capacity', { max: 32 })],
  ['hand1', 'FARMHAND', 140, S.field, hire('hauler', ['wheat'], ['mill', 'stall'], HAND), { toast: 'FARMHAND HIRED!' }],
  ['mill', 'WINDMILL', 280, S.mill, multi(open('mill'), stage(2)), { big: true, toast: 'THE WINDMILL TURNS!', focus: MILL, reveal: REVEAL.mill }],
  // ---- stage 2: the farm
  ['sacker', 'MILL HAND', 170, S.field, hire('hauler', ['mill'], ['bakery', 'stall'], { options: { look: 'miller' } }), { toast: 'MILL HAND HIRED!' }],
  ['boots', 'STURDY BOOTS', 230, S.yard, stat('speed', { mul: 1.15 })],
  ['bakery', 'BAKERY', 420, S.oven, open('bakery'), { big: true, toast: 'FRESH BREAD!', focus: BAKERY, reveal: REVEAL.bakery }],
  ['baker', 'BAKER\'S BOY', 360, S.oven, hire('hauler', ['bakery'], ['stall'], { options: { look: 'baker', capacity: 8 } }), { toast: 'BAKER\'S BOY HIRED!' }],
  ['hand2', 'FARMHAND', 500, S.field, hire('hauler', ['wheat'], ['mill', 'stall'], HAND), { toast: 'FARMHAND HIRED!' }],
  ['combine', 'COMBINE HARVESTER', 850, S.mill, hire('harvester', 'wheat', 'mill'), { big: true, toast: 'COMBINE HARVESTER!', focus: { x: -9, z: 5 }, reveal: REVEAL.combine }],
  ['mill2', 'BIG MILLSTONES', 700, S.field, stat('millSpeed', { mul: 1.6 })],
  ['truck', 'BAKERY TRUCK', 1200, S.oven, multi(open('truckcash'), hire('vendor', 'bakery', 'truckcash')), { big: true, toast: 'BAKERY TRUCK!', focus: LAY.truck.stop, reveal: REVEAL.truck }],
  ['oven', 'BIGGER OVEN', 1500, S.oven, stat('bakeSpeed', { mul: 1.6 })],
  // ---- stage 3: the dairy
  ['dairy', 'THE DAIRY', 1800, S.dairy, multi(open('trough', 'milk', 'paddock'), stage(3)), { big: true, toast: 'COWS!', focus: { x: 14.5, z: -12 }, reveal: REVEAL.dairy }],
  ['feeder', 'STABLE HAND', 900, S.dairy, hire('hauler', ['wheat'], ['trough'], { options: { look: 'stablehand', minRoom: 6, capacity: 10 } }), { toast: 'STABLE HAND HIRED!' }],
  ['creamery', 'CREAMERY', 1500, S.south, open('creamery'), { big: true, toast: 'CHEESE!', focus: CREAMERY, reveal: REVEAL.creamery }],
  ['maid', 'DAIRYMAID', 1000, S.dairy, hire('hauler', ['milk'], ['creamery', 'stall'], { home: { x: 12.4, z: -9.6 }, options: { look: 'maid', action: 'pickup' } }), { toast: 'DAIRYMAID HIRED!' }],
  ['monger', 'CHEESEMONGER', 1100, S.south, hire('hauler', ['creamery'], ['stall'], { home: { x: 3.4, z: -8.6 }, options: { look: 'monger' } }), { toast: 'CHEESEMONGER HIRED!' }],
  ['patch', 'PUMPKIN PATCH', 2200, S.patch, open('pumpkins'), { big: true, toast: 'PUMPKINS!', focus: { x: -5.5, z: -13 }, reveal: REVEAL.patch }],
  ['picker', 'PUMPKIN PICKER', 1600, S.patch, hire('hauler', ['pumpkins'], ['platform', 'stall'], { options: { look: 'picker', action: 'pickup' } }), { toast: 'PICKER HIRED!' }],
  ['sack2', 'HUGE SACK', 2000, S.yardS, stat('capacity', { max: 55 })],
  ['churns', 'BIG CHURNS', 2400, S.south, stat('creamSpeed', { mul: 1.6 })],
  // ---- stage 4: the junction
  ['junction', 'THE RAILWAY', 4200, S.north, multi(open('platform', 'traincash'), hire('train', 'platform', 'traincash'), stage(4)),
    { big: true, toast: 'THE TRAIN IS COMING!', focus: { x: 3.2, z: 20 }, reveal: REVEAL.junction }],
  ['porter1', 'STATION PORTER', 2400, S.station, hire('hauler', ['bakery', 'creamery'], ['platform'], { home: { x: 6.0, z: 15.2 }, options: { look: 'porter', capacity: 14 } }), { toast: 'PORTER HIRED!' }],
  ['wagon3', 'THIRD WAGON', 2800, S.north, stat('wagons', { set: 3 }), { toast: 'A PUMPKIN WAGON!' }],
  ['porter2', 'STATION PORTER', 3000, S.station, hire('hauler', ['creamery', 'bakery'], ['platform'], { home: { x: 6.4, z: 15.4 }, options: { look: 'porter', capacity: 14 } }), { toast: 'PORTER HIRED!' }],
  ['brand', 'FARM BRAND +30%', 3600, S.yard, stat('priceMult', { mul: 1.3 })],
  // ---- stage 5: the town
  ['town', 'FOUND THE TOWN', 6000, S.town, multi(stage(5), stat('priceMult', { mul: 1.25 })), { big: true, toast: 'A TOWN IS BORN!', focus: { x: 16, z: 22 }, reveal: REVEAL.town }],
  ['square', 'TOWN SQUARE', 4800, S.dairy, multi(open('square'), stat('priceMult', { mul: 1.2 })), { big: true, toast: 'TOWN SQUARE!', focus: { x: 14.5, z: 0 }, reveal: REVEAL.square }],
  ['clock', 'CLOCK TOWER', 6000, S.clock, stat('trainRate', { mul: 1.6 }), { big: true, toast: 'CLOCK TOWER!', focus: { x: 12, z: 19 }, reveal: REVEAL.clock }],
  ['express', 'EXPRESS FREIGHT +50%', 6000, S.north, stat('trainPrice', { mul: 1.5 }), { toast: 'EXPRESS FREIGHT!' }],
  // ---- finale
  ['fair', 'THE HARVEST FAIR', 11000, S.station, { type: 'win' }, { big: true, toast: 'THE HARVEST FAIR!' }],
];
const pads = CHAIN.map(([id, label, cost, at, effect, extra], i) => ({ id, label, cost, at, requires: i ? [CHAIN[i - 1][0]] : [], effect, ...(extra || {}) }));
pads.push({ id: 'travel', label: 'NEXT WORLD', cost: 0, at: S.gate, requires: ['fair'], effect: { type: 'travel', world: 'keep' }, priceText: 'GO' });

const item = (id, name, value, geometry, size, step) => ({ id, name, value, geometry, step, footprint: { w: size.len, d: size.d } });

export default {
  id: 'town', name: 'Wheatwhistle Junction',
  modules: ['../../engine/stations/solid.js', '../../engine/stations/depot.js', '../../engine/workers/train.js'],
  assets: [
    'farmbuildings/Barn', 'farmbuildings/Silo', 'cube-pets/animal-cow', 'car-kit/delivery-flat',
    'nature-kit/tree_default', 'nature-kit/tree_oak', 'nature-kit/tree_fat', 'nature-kit/tree_small', 'nature-kit/tree_oak_fall', 'nature-kit/tree_thin',
    'nature-kit/plant_bush', 'nature-kit/plant_bushLarge', 'nature-kit/plant_bushDetailed',
    'nature-kit/flower_redA', 'nature-kit/flower_yellowA', 'nature-kit/flower_purpleA', 'nature-kit/grass',
    'nature-kit/rock_largeA', 'nature-kit/rock_smallA', 'nature-kit/rock_smallD',
  ],
  looks: {
    player: { model: 'male-e', tool: 'scythe', hat: 'straw' },
    hauler: { model: 'male-a', tool: 'scythe', hat: 'straw' },
    farmhand: { model: 'male-a', tool: 'scythe', hat: 'straw' },
    miller: { model: 'male-f', tool: null, hat: 'cap' },
    baker: { model: 'employee', tool: null },
    stablehand: { model: 'male-d', tool: 'bucket', hat: 'straw' },
    maid: { model: 'female-b', tool: 'bucket' },
    monger: { model: 'female-d', tool: null },
    picker: { model: 'female-e', tool: 'basket', hat: 'straw' },
    porter: { model: 'worker', tool: null },
    cashier: { model: 'female-c', tool: null },
    customers: ['female-a', 'female-f', 'male-b', 'male-c', 'female-e', 'male-d', 'female-d', 'male-f'],
  },
  // golden hour: a low warm sun, long soft shadows
  lighting: {
    variant: 'outdoor', background: 0xffe3b0,
    hemi: { sky: 0xfff6e6, ground: 0xe4dcb8, intensity: 1.75 },
    sun: { color: 0xffe9c6, intensity: 1.4, dir: [11, 15, -8] },
    fill: { color: 0xffd9c4, intensity: 0.6 },
  },
  bounds: { minX: -19.6, maxX: 19.7, minZ: -19.4, maxZ: 19.0 },
  player: { start: { x: 4.4, z: 0.7 }, speed: 6.6, capacity: 20, harvestRadius: 1.5, look: 'player' },

  // regrow: seconds for wheat to grow back; pumpkinRegrow, milkRegrow likewise (the trough makes the
  // cows three times as fast); harvestRadius: the scythe's sweep; wagons: coupled wagons;
  // trainRate / trainPrice: how often the train comes and how well it pays
  stats: { stage: 1, regrow: 8, pumpkinRegrow: 12, milkRegrow: 15, harvestRadius: 1.5, millSpeed: 1, bakeSpeed: 1, creamSpeed: 1, wagons: 2, trainRate: 1, trainPrice: 1 },

  items: [
    item('wheat', 'Wheat', 2, makeWheatGeometry, SIZES.wheat, SIZES.wheatStep),
    // flour = 3 wheat (6) x 1.7 ; bread = 2 flour (20) x 1.8: six sheaves (12) become a 36 tray
    item('flour', 'Flour', 10, makeFlourGeometry, SIZES.flour, SIZES.flourStep),
    item('bread', 'Bread', 36, makeBreadGeometry, SIZES.bread, SIZES.breadStep),
    item('milk', 'Milk', 14, makeMilkGeometry, SIZES.milk, SIZES.milkStep),
    // cheese = 2 milk (28) x 2
    item('cheese', 'Cheese', 56, makeCheeseGeometry, SIZES.cheese, SIZES.cheeseStep),
    item('pumpkin', 'Pumpkins', 24, makePumpkinGeometry, SIZES.pumpkin, SIZES.pumpkinStep),
  ],

  stations: [
    // the trough comes before the paddock it feeds (it installs the regrow hook on it)
    { id: 'trough', type: 'trough', name: 'TROUGH', item: 'wheat', open: false, x: 15.4, z: -8.0, capacity: 16, start: 0, drain: 0.22, urgent: 0.8,
      boosts: [{ station: 'milk', multiplier: 3 }], trough: { len: 4.4, depth: 0.95, h: 0.7, yaw: Math.PI / 2 },
      dropZone: { x: 11.7, z: -8.0, r: 1.3 }, workerSpot: { x: 11.4, z: -6.9 }, hint: 'Feed the cows wheat!',
      placeholder: false, markers: false },

    // ---- the fields
    { id: 'wheat', type: 'source', name: 'Wheat', item: 'wheat', open: true, grid: LAY.wheat,
      plant: makeWheatPlant, stub: makeWheatStub, sway: true, plantHeight: WHEAT_HEIGHT, regrowJitter: 2.5, growTime: 0.5,
      burst: [0xffdc72, 0xf0bd3e, 0xfff4c8], action: 'swing', home: { x: 1.6, z: 3.4 }, park: { x: -15.2, z: 8.6 }, hint: 'Reap the wheat!' },
    { id: 'pumpkins', type: 'source', name: 'Pumpkins', item: 'pumpkin', open: false, regrowStat: 'pumpkinRegrow', grid: LAY.pumpkins,
      plant: makePumpkinPlant, stub: makePumpkinStub, sway: false, plantHeight: 0.6, regrowJitter: 3, growTime: 0.6,
      burst: [0xf2891c, 0xffa53a, 0x58a23c], action: 'pickup', home: { x: 0.8, z: -8.4 }, hint: 'Pick the pumpkins!' },
    { id: 'milk', type: 'source', name: 'Milk', item: 'milk', open: false, regrowStat: 'milkRegrow', grid: LAY.milk,
      plant: makeMilkCanPlant, stub: makeMilkStub, sway: false, plantHeight: 0.75, regrowJitter: 2, growTime: 0.5,
      burst: [0xffffff, 0xcdd6de, 0x4a8fd9], action: 'pickup', home: { x: 12.4, z: -9.6 }, hint: 'Collect the milk!' },

    // ---- the little factories: wheat in on the far side, goods out on the street side
    { id: 'mill', type: 'converter', name: 'WINDMILL', open: false, x: MILL.x, z: MILL.z,
      recipe: { in: { wheat: 3 }, out: { flour: 1 }, time: 1.0 }, batch: 2, speedStat: 'millSpeed', inputCap: 60,
      machine: { w: 3.7, d: 3.7, h: 5, yaw: 0 },
      dropZone: { x: -10.7, z: 12.2, r: 1.5 }, workerSpot: { x: -10.7, z: 11.0 }, vehicleSpot: { x: -11.2, z: 8.9 },
      input: { layout: { x: -8.55, z: 12.7, cols: 2, rows: 2 } },
      output: { capacity: 24, zone: { x: -0.5, z: 10.4, r: 1.4 }, layout: { x: -2.5, z: 10.9, cols: 2, rows: 2 } },
      labels: { input: 'WHEAT', output: 'FLOUR' }, hints: { drop: 'Bring wheat to the windmill!', pickup: 'Grab the flour!' },
      placeholder: false, markers: false },
    { id: 'bakery', type: 'converter', name: 'BAKERY', open: false, x: BAKERY.x, z: BAKERY.z,
      recipe: { in: { flour: 2 }, out: { bread: 1 }, time: 2.0 }, batch: 2, speedStat: 'bakeSpeed', inputCap: 24,
      machine: { w: 3.7, d: 3.7, h: 3.5, yaw: 0 },
      dropZone: { x: 5.6, z: 12.1, r: 1.4 }, workerSpot: { x: 5.2, z: 12.6 },
      input: { layout: { x: 7.45, z: 12.6, cols: 2, rows: 2 } },
      output: { capacity: 24, zone: { x: 5.8, z: 8.8, r: 1.4 }, layout: { x: 8.4, z: 9.55, cols: 3, rows: 1 } },
      labels: { input: 'FLOUR', output: 'BREAD' }, hints: { drop: 'Bring flour to the bakery!', pickup: 'Grab the bread!' },
      placeholder: false, markers: false },
    { id: 'creamery', type: 'converter', name: 'CREAMERY', open: false, x: CREAMERY.x, z: CREAMERY.z,
      recipe: { in: { milk: 2 }, out: { cheese: 1 }, time: 2.2 }, batch: 2, speedStat: 'creamSpeed', inputCap: 20,
      machine: { w: 3.5, d: 3.5, h: 3.3, yaw: 0 },
      dropZone: { x: 9.1, z: -15.5, r: 1.4 }, workerSpot: { x: 10.8, z: -14.6 },
      input: { layout: { x: 9.1, z: -13.3, cols: 3, rows: 1 } },
      output: { capacity: 20, zone: { x: 3.9, z: -10.9, r: 1.4 }, layout: { x: 5.95, z: -10.9, cols: 1, rows: 3 } },
      labels: { input: 'MILK', output: 'CHEESE' }, hints: { drop: 'Bring milk to the creamery!', pickup: 'Grab the cheese!' },
      placeholder: false, markers: false },

    // ---- the market stall (townsfolk queue toward the station road)
    { id: 'stall', type: 'shop', name: 'SELL', open: true, accepts: ['wheat', 'flour', 'bread', 'milk', 'cheese', 'pumpkin'], display: 'wheat', extraLine: 2,
      counter: STALL.counter, dropZone: STALL.dropZone, cashPile: STALL.cashPile,
      queue: sq(5, (i) => ({ x: 11.1 + i * 1.0, z: 0 })),
      customerIn: [{ x: 19.3, z: -12 }, { x: 18.3, z: 0.2 }],
      customerOut: [{ x: 11.1, z: -2.6 }, { x: 18.2, z: -3.2 }, { x: 19.4, z: -12 }],
      cashierSpot: { x: 8.4, z: 1.25 }, workerSpot: { x: 5.5, z: 0.5 },
      hint: 'Sell at the market stall!' },
    { id: 'truckcash', type: 'cashpile', name: 'TRUCK CASH', open: false, cashPile: { x: 14.6, z: 11.0, r: 1.3 }, bundle: 30 },

    // ---- the junction: goods wait on the platform for the train
    { id: 'platform', type: 'depot', name: 'PLATFORM', open: false, x: PLATFORM.x, z: PLATFORM.z, items: ['bread', 'cheese', 'pumpkin'],
      capacity: 54, kindCap: { bread: 22, cheese: 16, pumpkin: 16 }, start: 0,
      layout: { x: PLATFORM.x, z: PLATFORM.z, y: LAY.deck.h + 0.02, cols: 8, rows: 2 },
      dropZone: { x: 3.2, z: 17.3, r: 1.6 }, workerSpot: { x: 3.2, z: 16.5 },
      pallet: false, placeholder: false, markers: false, hint: 'Load the platform for the train!' },
    { id: 'traincash', type: 'cashpile', name: 'TRAIN CASH', open: false, cashPile: { x: 8.0, z: 17.3, r: 1.4 }, bundle: 80 },

    // ---- things in the way: scene.js adds a circle for every tree, bale and building it stands inside the bounds
    { id: 'scenery', type: 'solid', name: 'SCENERY', open: true, blockers: [] },
    { id: 'paddock', type: 'solid', name: 'PADDOCK', open: false, blockers: [] },
    { id: 'square', type: 'solid', name: 'TOWN SQUARE', open: false, blockers: [{ x: LAY.fountain.x, z: LAY.fountain.z, r: 1.5 }] },
  ],

  workers: {
    hauler: { look: 'farmhand', speed: 4.7, capacity: 12, harvestRadius: 1.2 },
    harvester: { model: makeCombine, speed: 6.2, capacity: 60, harvestRadius: 2.1, unloadInterval: 0.025 },
    cashier: { look: 'cashier' },
    vendor: TRUCK,
    train: TRAIN,
  },

  pads,

  hints: {
    harvest: 'Reap the {name}!',
    pickup: 'Pick up {name}!',
    drop: 'Sell at the market stall!',
    cash: 'Grab your cash!',
    buy: 'Buy: {label}',
    travel: 'Next: Ironwall Keep!',
  },

  finale: { pad: 'fair', focus: LAY.fair, next: 'keep', perk: { speedMul: 1.08, capacityAdd: 10 } },

  // the test bot delivers what it carries before gathering more (production is a chain here)
  autoplay: { chain: true },

  hud: {
    stages: ['FIELD', 'FARM', 'DAIRY', 'JUNCTION', 'TOWN'], stageStat: 'stage',
    rates: [
      { label: 'BREAD', color: '#ffd27a', show: (G) => !!(G.stations.get('bakery') || {}).active, total: (G) => { const s = G.stations.get('bakery'); return s ? s.stats.outCount : 0; } },
      { label: 'FREIGHT', color: '#8fe3c8', show: (G) => !!(G.stations.get('platform') || {}).active,
        total: (G) => { const l = G.workers ? G.workers.list : []; for (let i = 0; i < l.length; i++) if (l[i].role === 'train') return l[i].totalItems || 0; return 0; } },
    ],
  },

  layout: { ...LAY, mill: MILL, bakery: BAKERY, creamery: CREAMERY, platform: PLATFORM, slots: S },
};
