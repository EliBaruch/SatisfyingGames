// Bloom Rush — all tunable data lives here.
// Pure data and pure helpers only: no THREE import, no DOM access.
// World units: 1 unit ≈ 1 metre. Y is up, the ground is the XZ plane at y = 0.

export const GAME = {
  name: 'Bloom Rush',
  saveKey: 'bloomrush.save.v1',
  muteKey: 'bloomrush.muted',
  saveVersion: 1,
};

// ---------------------------------------------------------------- flowers ---
// Index in this array is the "flower type index" used everywhere.
export const FLOWERS = [
  { id: 'rose',      name: 'Roses',      price: 4,  petal: 0xff4d7d, petalDark: 0xd92a5c, center: 0xffd166, wrap: 0xffe3ec, ribbon: 0xffffff },
  { id: 'tulip',     name: 'Tulips',     price: 10, petal: 0x9b5cff, petalDark: 0x6f35d9, center: 0xffe066, wrap: 0xeee3ff, ribbon: 0xffffff },
  { id: 'sunflower', name: 'Sunflowers', price: 25, petal: 0xffcc1a, petalDark: 0xf29a00, center: 0x6b3e12, wrap: 0xfff4cf, ribbon: 0xff7a59 },
  { id: 'orchid',    name: 'Orchids',    price: 60, petal: 0x2ec4ff, petalDark: 0x1486d6, center: 0xfff3b0, wrap: 0xdff6ff, ribbon: 0xff4d7d },
];

// ------------------------------------------------------------------ sizes ---
// Shared dimensions so that models, stacks and shops agree.
export const SIZES = {
  flowerHeight: 0.95,                              // growing flower, origin at ground
  bouquet: { len: 0.95, h: 0.26, d: 0.42 },        // lies on its side along X, origin bottom-centre
  bouquetStep: 0.235,                              // vertical distance between stacked bouquets
  bill: { len: 0.62, h: 0.1, d: 0.34 },            // bundle of cash, origin bottom-centre
  billStep: 0.1,
  counter: { len: 3.4, depth: 1.2, h: 1.0 },       // long axis = Z, customer side = local +X
  character: { h: 1.7 },
};

// ----------------------------------------------------------------- tuning ---
export const PLAYER = {
  speed: 6.5,            // units / second (before upgrades)
  capacity: 25,          // bouquets carried (before upgrades)
  cutRadius: 1.25,       // flowers within this distance of the player are cut
  radius: 0.45,
  start: { x: 2.5, z: 5.5 },
  unloadInterval: 0.035, // seconds between bouquets when unloading at SELL
  perColumn: 40,         // bouquets per stack column on the player's back
};

export const FIELD = {
  regrow: 6,             // seconds until a cut flower is back (before upgrades)
  regrowJitter: 1.5,     // random extra seconds
  growTime: 0.45,        // pop-in animation length
};

export const SHOP = {
  queueSlots: 6,
  customerSpeed: 5.5,
  // How fast bouquets leave the counter. "self" = player standing in the SELL
  // zone and no cashier hired yet; "cashier" = cashier hired (always serving).
  serve: {
    self:    { interval: 0.30, batch: 3 },
    cashier: { interval: 0.25, batch: 5 },
  },
  maxVisibleStock: 160,  // cap on bouquets drawn on a counter
  stockPerColumn: 20,
  maxVisibleBills: 72,   // cap on bill bundles drawn on a cash pile
  collectTime: 0.6,      // a cash pile empties into the player in about this long
};

export const WORKER = {
  cutter:  { speed: 4.2, capacity: 10, cutRadius: 0.95, unloadInterval: 0.06 },
  tractor: { speed: 5.0, capacity: 60, cutRadius: 1.7,  unloadInterval: 0.02 },
};

export const PAD = {
  radius: 1.3,           // player within this distance pays into the pad
  size: 2.4,             // drawn square size
  payTime: 1.1,          // an affordable pad fills in about this many seconds
};

export const CAMERA = {
  // Orthographic isometric camera. With this offset:
  //   screen-right = world (-x, +z) / √2      screen-up = world (+x, +z) / √2
  offset: { x: -14, y: 18, z: -14 },
  viewPortrait: 23.5,      // vertical world units visible when aspect < 1
  viewLandscape: 17,     // vertical world units visible when aspect >= 1
  lerp: 6,
};

export const WORLD = {
  bounds: { minX: -15, maxX: 53, minZ: -18, maxZ: 66 },  // player is clamped to this
  ground: { minX: -60, maxX: 100, minZ: -70, maxZ: 110 },
  road: { minX: 13, maxX: 25, minZ: -40, maxZ: 52 },      // customers walk here
  crossRoad: { minX: -13, maxX: 51, minZ: 13, maxZ: 25 }, // between the farm rows
  greenhouse: { x: 19, z: 60, w: 10, d: 8 },              // final build site
  customerSpawnZ: -32,
};

// ------------------------------------------------------------------ farms ---
// Four identical plots (26 x 26) in a 2 x 2 grid around a road cross.
// Farms with flip = -1 are mirrored in X so every counter faces the central road.
const FARM_DEFS = [
  { ox: 0,  oz: 0,  flip: 1,  flower: 0 },
  { ox: 38, oz: 0,  flip: -1, flower: 1 },
  { ox: 0,  oz: 38, flip: 1,  flower: 2 },
  { ox: 38, oz: 38, flip: -1, flower: 3 },
];

const BED = { cols: 11, rows: 13, spacing: 1.1, lx0: -11.5, lz0: -6.6 };

function buildFarm(def, idx) {
  const { ox, oz, flip, flower } = def;
  const L = (lx, lz) => ({ x: ox + flip * lx, z: oz + lz });
  const bedXa = ox + flip * BED.lx0;
  const bedXb = ox + flip * (BED.lx0 + (BED.cols - 1) * BED.spacing);
  const laneIn = flip > 0 ? 17.5 : 20.5;
  const laneOut = flip > 0 ? 15.5 : 22.5;
  const queue = [];
  for (let i = 0; i < SHOP.queueSlots; i++) queue.push(L(7.6 + i * 1.0, 0));
  return {
    idx,
    flower,                                   // flower type index
    flip,                                     // +1 or -1
    origin: { x: ox, z: oz },
    plot: { minX: ox - 13, maxX: ox + 13, minZ: oz - 13, maxZ: oz + 13 },
    bed: {
      cols: BED.cols, rows: BED.rows, spacing: BED.spacing, count: BED.cols * BED.rows,
      minX: Math.min(bedXa, bedXb), maxX: Math.max(bedXa, bedXb),
      minZ: oz + BED.lz0, maxZ: oz + BED.lz0 + (BED.rows - 1) * BED.spacing,
    },
    // Counter: long axis along Z. Customers stand on the `dir` side in X.
    counter: { ...L(6.2, 0), dir: flip },
    sellZone: { ...L(3.2, 0), r: 1.7 },       // player unloads / serves here
    cashPile: { ...L(6.2, 4.0), r: 1.5 },     // sales money lands here
    cashierPos: { ...L(5.1, 0.9), faceX: flip },
    workerDrop: L(3.0, -2.5),                 // cutters unload standing here
    tractorDrop: L(1.4, -4.6),                // tractor unloads standing here
    workerHome: L(1.5, 9.5),                  // where hired cutters appear
    tractorPark: L(-9.5, -9.6),
    queue,                                    // queue[0] is the customer being served
    customerIn: [                             // waypoints from spawn to the queue
      { x: laneIn, z: WORLD.customerSpawnZ },
      { x: laneIn, z: oz },
    ],
    customerOut: [                            // waypoints from the counter to despawn
      L(8.4, -1.9),
      { x: laneOut, z: oz - 1.9 },
      { x: laneOut, z: WORLD.customerSpawnZ },
    ],
  };
}

export const FARMS = FARM_DEFS.map(buildFarm);

/** World position of flower `i` (0 .. bed.count-1) in farm `farmIdx`. Row-major: i = row * cols + col. */
export function flowerPos(farmIdx, i, out = {}) {
  const def = FARM_DEFS[farmIdx];
  const col = i % BED.cols;
  const row = (i / BED.cols) | 0;
  out.x = def.ox + def.flip * (BED.lx0 + col * BED.spacing);
  out.z = def.oz + BED.lz0 + row * BED.spacing;
  return out;
}

// ------------------------------------------------------------------- pads ---
// Purchase pads, bought by standing on them. A pad is visible once every pad in
// `requires` is done. `at: [farmIdx, lx, lz]` is farm-local (mirrored with the
// farm); `abs: [x, z]` is a world position.
//
// effect.type:
//   'cashier'  { farm }          cashier serves customers at that farm forever
//   'cutter'   { farm }          +1 worker who cuts and delivers flowers
//   'tractor'  { farm }          tractor that mows the bed and hauls to the counter
//   'farm'     { farm }          opens a new farm
//   'capacity' { value }         player carry capacity becomes `value`
//   'speed'    { mult }          player run speed multiplier (cumulative)
//   'price'    { mult }          all flower prices multiplied (cumulative)
//   'regrow'   { seconds }       flower regrow time becomes `seconds`
//   'win'      {}                builds the Grand Greenhouse
const PAD_DEFS = [
  // ---- Farm 0: roses ------------------------------------------------------
  { id: 'cashier0',  label: 'CASHIER',       cost: 60,     at: [0, 6.0, -4.3],   requires: [],            effect: { type: 'cashier', farm: 0 } },
  { id: 'cutter0a',  label: 'HIRE CUTTER',   cost: 80,     at: [0, -2.5, 9.4],   requires: ['cashier0'],  effect: { type: 'cutter', farm: 0 } },
  { id: 'cutter0b',  label: 'HIRE CUTTER',   cost: 120,    at: [0, -6.0, 9.4],   requires: ['cutter0a'],  effect: { type: 'cutter', farm: 0 } },
  { id: 'cutter0c',  label: 'HIRE CUTTER',   cost: 180,    at: [0, -9.5, 9.4],   requires: ['cutter0b'],  effect: { type: 'cutter', farm: 0 } },
  { id: 'capacity1', label: 'BIGGER STACK',  cost: 300,    at: [0, 2.6, 7.6],    requires: ['cutter0c'],  effect: { type: 'capacity', value: 50 } },
  { id: 'speed1',    label: 'RUN FASTER',    cost: 350,    at: [0, 2.6, -8.2],   requires: ['capacity1'], effect: { type: 'speed', mult: 1.25 } },
  { id: 'tractor0',  label: 'TRACTOR',       cost: 600,    at: [0, -5.5, -9.6],  requires: ['speed1'],    effect: { type: 'tractor', farm: 0 }, big: true },
  { id: 'farm1',     label: 'TULIP FARM',    cost: 1200,   abs: [27.5, 6.5],     requires: ['tractor0'],  effect: { type: 'farm', farm: 1 }, big: true },

  // ---- Farm 1: tulips -----------------------------------------------------
  { id: 'cashier1',  label: 'CASHIER',       cost: 400,    at: [1, 6.0, -4.3],   requires: ['farm1'],     effect: { type: 'cashier', farm: 1 } },
  { id: 'cutter1a',  label: 'HIRE CUTTER',   cost: 500,    at: [1, -2.5, 9.4],   requires: ['cashier1'],  effect: { type: 'cutter', farm: 1 } },
  { id: 'cutter1b',  label: 'HIRE CUTTER',   cost: 700,    at: [1, -6.0, 9.4],   requires: ['cutter1a'],  effect: { type: 'cutter', farm: 1 } },
  { id: 'cutter1c',  label: 'HIRE CUTTER',   cost: 900,    at: [1, -9.5, 9.4],   requires: ['cutter1b'],  effect: { type: 'cutter', farm: 1 } },
  { id: 'capacity2', label: 'HUGE STACK',    cost: 2000,   at: [1, 2.6, 7.6],    requires: ['cutter1c'],  effect: { type: 'capacity', value: 80 } },
  { id: 'tractor1',  label: 'TRACTOR',       cost: 2500,   at: [1, -5.5, -9.6],  requires: ['capacity2'], effect: { type: 'tractor', farm: 1 }, big: true },
  { id: 'price1',    label: 'GIFT WRAP +50%', cost: 3000,  at: [1, 2.6, -8.2],   requires: ['tractor1'],  effect: { type: 'price', mult: 1.5 } },
  { id: 'farm2',     label: 'SUNFLOWER FARM', cost: 6500,  abs: [6.5, 27.5],     requires: ['price1'],    effect: { type: 'farm', farm: 2 }, big: true },

  // ---- Farm 2: sunflowers -------------------------------------------------
  { id: 'cashier2',  label: 'CASHIER',       cost: 2000,   at: [2, 6.0, -4.3],   requires: ['farm2'],     effect: { type: 'cashier', farm: 2 } },
  { id: 'cutter2a',  label: 'HIRE CUTTER',   cost: 2500,   at: [2, -2.5, 9.4],   requires: ['cashier2'],  effect: { type: 'cutter', farm: 2 } },
  { id: 'cutter2b',  label: 'HIRE CUTTER',   cost: 3500,   at: [2, -6.0, 9.4],   requires: ['cutter2a'],  effect: { type: 'cutter', farm: 2 } },
  { id: 'cutter2c',  label: 'HIRE CUTTER',   cost: 4500,   at: [2, -9.5, 9.4],   requires: ['cutter2b'],  effect: { type: 'cutter', farm: 2 } },
  { id: 'speed2',    label: 'TURBO BOOTS',   cost: 6500,   at: [2, 2.6, 7.6],    requires: ['cutter2c'],  effect: { type: 'speed', mult: 1.2 } },
  { id: 'tractor2',  label: 'TRACTOR',       cost: 10000,  at: [2, -5.5, -9.6],  requires: ['speed2'],    effect: { type: 'tractor', farm: 2 }, big: true },
  { id: 'regrow1',   label: 'SUPER SOIL',    cost: 12000,  at: [2, 2.6, -8.2],   requires: ['tractor2'],  effect: { type: 'regrow', seconds: 4 } },
  { id: 'farm3',     label: 'ORCHID FARM',   cost: 28000,  abs: [27.5, 31.5],    requires: ['regrow1'],   effect: { type: 'farm', farm: 3 }, big: true },

  // ---- Farm 3: orchids ----------------------------------------------------
  { id: 'cashier3',  label: 'CASHIER',       cost: 8000,  at: [3, 6.0, -4.3],   requires: ['farm3'],     effect: { type: 'cashier', farm: 3 } },
  { id: 'cutter3a',  label: 'HIRE CUTTER',   cost: 10000,  at: [3, -2.5, 9.4],   requires: ['cashier3'],  effect: { type: 'cutter', farm: 3 } },
  { id: 'cutter3b',  label: 'HIRE CUTTER',   cost: 13000,  at: [3, -6.0, 9.4],   requires: ['cutter3a'],  effect: { type: 'cutter', farm: 3 } },
  { id: 'cutter3c',  label: 'HIRE CUTTER',   cost: 16000,  at: [3, -9.5, 9.4],   requires: ['cutter3b'],  effect: { type: 'cutter', farm: 3 } },
  { id: 'capacity3', label: 'MEGA STACK',    cost: 24000,  at: [3, 2.6, 7.6],    requires: ['cutter3c'],  effect: { type: 'capacity', value: 120 } },
  { id: 'tractor3',  label: 'TRACTOR',       cost: 40000,  at: [3, -5.5, -9.6],  requires: ['capacity3'], effect: { type: 'tractor', farm: 3 }, big: true },
  { id: 'price2',    label: 'GOLD RIBBON x2', cost: 60000, at: [3, 2.6, -8.2],   requires: ['tractor3'],  effect: { type: 'price', mult: 2 } },

  // ---- Finale ---------------------------------------------------------------
  { id: 'greenhouse', label: 'GRAND GREENHOUSE', cost: 200000, abs: [19, 53], requires: ['price2'], effect: { type: 'win' }, big: true },
];

export const PADS = PAD_DEFS.map((p) => {
  let pos;
  if (p.at) {
    const d = FARM_DEFS[p.at[0]];
    pos = { x: d.ox + d.flip * p.at[1], z: d.oz + p.at[2] };
  } else {
    pos = { x: p.abs[0], z: p.abs[1] };
  }
  return { id: p.id, label: p.label, cost: p.cost, pos, requires: p.requires, effect: p.effect, big: !!p.big };
});

// ------------------------------------------------------------------ state ---
/** Fresh save state. Everything in here must be JSON-serialisable. */
export function defaultState() {
  return {
    v: GAME.saveVersion,
    money: 0,
    earned: 0,                 // lifetime earnings
    playTime: 0,               // simulated seconds played
    won: false,
    done: {},                  // padId -> true once bought
    paid: {},                  // padId -> amount paid so far (partially paid pads)
    player: { x: PLAYER.start.x, z: PLAYER.start.z },
    carried: [],               // flower type index of each carried bouquet, bottom -> top
    stock: [0, 0, 0, 0],       // bouquets on each farm's counter
    cash: [0, 0, 0, 0],        // uncollected money on each farm's cash pile
  };
}

/**
 * Everything the game derives from which pads are bought.
 * Recomputed (as G.stats) at boot and after every purchase.
 */
export function computeStats(done) {
  const s = {
    capacity: PLAYER.capacity,
    speed: PLAYER.speed,
    priceMult: 1,
    regrow: FIELD.regrow,
    farms: [true, false, false, false],   // unlocked farms
    cashier: [false, false, false, false],
    cutters: [0, 0, 0, 0],
    tractor: [false, false, false, false],
    won: false,
  };
  for (const pad of PADS) {
    if (!done[pad.id]) continue;
    const e = pad.effect;
    switch (e.type) {
      case 'cashier': s.cashier[e.farm] = true; break;
      case 'cutter': s.cutters[e.farm] += 1; break;
      case 'tractor': s.tractor[e.farm] = true; break;
      case 'farm': s.farms[e.farm] = true; break;
      case 'capacity': s.capacity = Math.max(s.capacity, e.value); break;
      case 'speed': s.speed *= e.mult; break;
      case 'price': s.priceMult *= e.mult; break;
      case 'regrow': s.regrow = Math.min(s.regrow, e.seconds); break;
      case 'win': s.won = true; break;
    }
  }
  return s;
}

/** Sale price of one bouquet of the given flower type under the given stats. */
export function bouquetPrice(typeIdx, stats) {
  return Math.round(FLOWERS[typeIdx].price * stats.priceMult);
}

/** 950 -> "950", 1500 -> "1.5K", 400000 -> "400K", 1250000 -> "1.25M" */
export function fmtMoney(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = [['M', 1e6], ['K', 1e3]];
  for (const [u, v] of units) {
    if (n >= v) {
      const x = n / v;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return (s.includes('.') ? s.replace(/\.?0+$/, '') : s) + u;
    }
  }
  return String(n);
}
