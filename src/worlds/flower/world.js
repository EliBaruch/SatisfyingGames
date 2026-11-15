// Flower Farm: the first world. Three plots (roses, tulips, sunflowers) around a road
// cross, each a 'source' bed and a 'shop' counter; the fourth quadrant holds the Grand
// Greenhouse finale. Everything here is data; the helpers below only compute mirrored
// plot-local positions. Scenery is in scene.js, models in models.js.
import { FLOWERS, SIZES, makeBouquetGeometry, makeFlowerGeometry, makeStubGeometry } from './models.js';

// ------------------------------------------------------------------ layout
const ROAD = { minX: 13, maxX: 25, minZ: -40, maxZ: 52 };        // customers walk here
const CROSS = { minX: -13, maxX: 51, minZ: 13, maxZ: 25 };       // between the plot rows
const SPAWN_Z = -32;                                             // customers appear here
const GREENHOUSE = { x: 38, z: 40, w: 10, d: 8 };
const GATE = { x: 19, z: 48 };                                   // travel gate, north end of the road
const BED = { cols: 11, rows: 13, spacing: 1.1, lx0: -11.5, lz0: -6.6 };

// Plots are 26 x 26. flip = -1 mirrors a plot in X so every counter faces the road.
const PLOTS = [
  { key: 'roses', item: 'rose', ox: 0, oz: 0, flip: 1, name: 'ROSE FARM', sign: null, open: true },
  { key: 'tulips', item: 'tulip', ox: 38, oz: 0, flip: -1, name: 'TULIP FARM', sign: [26.4, -7.5] },
  { key: 'sunflowers', item: 'sunflower', ox: 0, oz: 38, flip: 1, name: 'SUNFLOWER FARM', sign: [-4.5, 26.4] },
];
const plot = (key) => PLOTS.find((p) => p.key === key);
/** plot-local (lx, lz) -> world {x, z}; lx is mirrored with the plot */
const L = (p, lx, lz) => ({ x: p.ox + p.flip * lx, z: p.oz + lz });
const at = (key, lx, lz) => { const p = L(plot(key), lx, lz); return [p.x, p.z]; };

function bedStation(p) {
  return {
    id: p.key, type: 'source', name: FLOWERS.find((f) => f.id === p.item).name, item: p.item, open: !!p.open,
    grid: { x0: p.ox + p.flip * BED.lx0, z0: p.oz + BED.lz0, dx: p.flip * BED.spacing, dz: BED.spacing, cols: BED.cols, rows: BED.rows },
    plant: () => makeFlowerGeometry(p.item),
    stub: makeStubGeometry,
    plantHeight: SIZES.flowerHeight,
    burst: (({ petal, petalDark, center }) => [petal, petalDark, petal, center])(FLOWERS.find((f) => f.id === p.item)),
    action: 'swing',
    home: L(p, 1.5, 9.5),       // hired cutters appear here
    park: L(p, -9.5, -9.6),     // the tractor waits here
  };
}

function shopStation(p) {
  const laneIn = p.flip > 0 ? 17.5 : 20.5, laneOut = p.flip > 0 ? 15.5 : 22.5;
  const queue = [];
  for (let i = 0; i < 6; i++) queue.push(L(p, 7.6 + i * 1.0, 0));
  return {
    id: 'shop-' + p.key, type: 'shop', name: 'SELL', open: !!p.open,
    accepts: ['rose', 'tulip', 'sunflower'],   // any bouquet sells anywhere, at its own price
    display: p.item,
    counter: { ...L(p, 6.2, 0), yaw: p.flip > 0 ? 0 : Math.PI, ...SIZES.counter },
    dropZone: { ...L(p, 3.2, 0), r: 1.7 },
    cashPile: { ...L(p, 6.2, 4.0), r: 1.5 },
    cashierSpot: L(p, 5.1, 0.9),
    workerSpot: L(p, 3.0, -2.5),
    vehicleSpot: L(p, 1.4, -4.6),
    queue,
    customerIn: [{ x: laneIn, z: SPAWN_Z }, { x: laneIn, z: p.oz }],
    customerOut: [L(p, 8.4, -1.9), { x: laneOut, z: p.oz - 1.9 }, { x: laneOut, z: SPAWN_Z }],
    hint: 'Bring flowers to SELL',
  };
}

// Pads for one plot: cashier, cutters, upgrades, tractor (plot-local positions).
const CASHIER = [6.0, -4.3], CUT_A = [-2.5, 9.4], CUT_B = [-6.0, 9.4], CUT_C = [-9.5, 9.4];
const UP_1 = [2.6, 7.6], UP_2 = [2.6, -8.2], TRACTOR = [-5.5, -9.6];
const hire = (role, key) => ({ type: 'hire', role, from: role === 'cashier' ? null : key, to: 'shop-' + key });
const pad = (id, label, cost, key, local, requires, effect, extra) => ({ id, label, cost, at: at(key, ...local), requires, effect, ...extra });

// ------------------------------------------------------------------ definition
export default {
  id: 'flower',
  name: 'Flower Farm',

  lighting: {
    background: 0x6fbf4b,
    hemi: { sky: 0xe8f6ff, ground: 0x8fc46a, intensity: 1.3 },
    sun: { color: 0xfff1d6, intensity: 1.95, dir: [9, 22, -8], mapSize: 1536, extent: 19 },
    fill: { color: 0xffe6f0, intensity: 0.55, pos: [-14, 12, -10] },
  },

  bounds: { minX: -15, maxX: 53, minZ: -18, maxZ: 54 },   // the player is clamped to this

  player: { start: { x: 2.5, z: 5.5 }, speed: 6.5, capacity: 25, harvestRadius: 1.25, look: 'player' },

  stats: { regrow: 6 },   // world-specific base stats (seconds for a cut flower to come back)

  items: FLOWERS.slice(0, 3).map((f) => ({
    id: f.id, name: f.name, value: f.price,
    geometry: () => makeBouquetGeometry(f.id),
    step: SIZES.bouquetStep,
    footprint: { w: SIZES.bouquet.len, d: SIZES.bouquet.d },
  })),

  stations: PLOTS.flatMap((p) => [bedStation(p), shopStation(p)]),

  workers: {
    hauler: { look: 'cutter', speed: 4.2, capacity: 10, harvestRadius: 0.95, unloadInterval: 0.06 },
    harvester: { speed: 5.0, capacity: 60, harvestRadius: 1.7, unloadInterval: 0.02, colors: [0xe53935, 0x1e88e5, 0xfb8c00] },
  },

  pads: [
    // ---- roses
    pad('cashier0', 'CASHIER', 60, 'roses', CASHIER, [], hire('cashier', 'roses')),
    pad('cutter0a', 'HIRE CUTTER', 80, 'roses', CUT_A, ['cashier0'], hire('hauler', 'roses'), { toast: 'CUTTER HIRED!' }),
    pad('cutter0b', 'HIRE CUTTER', 120, 'roses', CUT_B, ['cutter0a'], hire('hauler', 'roses'), { toast: 'CUTTER HIRED!' }),
    pad('cutter0c', 'HIRE CUTTER', 180, 'roses', CUT_C, ['cutter0b'], hire('hauler', 'roses'), { toast: 'CUTTER HIRED!' }),
    pad('capacity1', 'BIGGER STACK', 300, 'roses', UP_1, ['cutter0c'], { type: 'stat', stat: 'capacity', max: 50 }),
    pad('speed1', 'RUN FASTER', 350, 'roses', UP_2, ['capacity1'], { type: 'stat', stat: 'speed', mul: 1.25 }),
    pad('tractor0', 'TRACTOR', 600, 'roses', TRACTOR, ['speed1'], hire('harvester', 'roses'), { big: true, toast: 'TRACTOR UNLOCKED!' }),
    { id: 'farm1', label: 'TULIP FARM', cost: 1200, at: [27.5, 6.5], requires: ['tractor0'], effect: { type: 'open', stations: ['tulips', 'shop-tulips'] }, big: true },

    // ---- tulips
    pad('cashier1', 'CASHIER', 400, 'tulips', CASHIER, ['farm1'], hire('cashier', 'tulips')),
    pad('cutter1a', 'HIRE CUTTER', 500, 'tulips', CUT_A, ['cashier1'], hire('hauler', 'tulips'), { toast: 'CUTTER HIRED!' }),
    pad('cutter1b', 'HIRE CUTTER', 700, 'tulips', CUT_B, ['cutter1a'], hire('hauler', 'tulips'), { toast: 'CUTTER HIRED!' }),
    pad('capacity2', 'HUGE STACK', 1300, 'tulips', UP_1, ['cutter1b'], { type: 'stat', stat: 'capacity', max: 80 }),
    pad('tractor1', 'TRACTOR', 1800, 'tulips', TRACTOR, ['capacity2'], hire('harvester', 'tulips'), { big: true, toast: 'TRACTOR UNLOCKED!' }),
    { id: 'farm2', label: 'SUNFLOWER FARM', cost: 3200, at: [6.5, 27.5], requires: ['tractor1'], effect: { type: 'open', stations: ['sunflowers', 'shop-sunflowers'] }, big: true },

    // ---- sunflowers
    pad('cashier2', 'CASHIER', 1200, 'sunflowers', CASHIER, ['farm2'], hire('cashier', 'sunflowers')),
    pad('cutter2a', 'HIRE CUTTER', 1600, 'sunflowers', CUT_A, ['cashier2'], hire('hauler', 'sunflowers'), { toast: 'CUTTER HIRED!' }),
    pad('cutter2b', 'HIRE CUTTER', 2200, 'sunflowers', CUT_B, ['cutter2a'], hire('hauler', 'sunflowers'), { toast: 'CUTTER HIRED!' }),
    pad('speed2', 'TURBO BOOTS', 2800, 'sunflowers', UP_1, ['cutter2b'], { type: 'stat', stat: 'speed', mul: 1.2 }),
    pad('tractor2', 'TRACTOR', 4000, 'sunflowers', TRACTOR, ['speed2'], hire('harvester', 'sunflowers'), { big: true, toast: 'TRACTOR UNLOCKED!' }),
    pad('price1', 'GIFT WRAP +50%', 5000, 'sunflowers', UP_2, ['tractor2'], { type: 'stat', stat: 'priceMult', mul: 1.5 }),

    // ---- finale and the way on
    { id: 'greenhouse', label: 'GRAND GREENHOUSE', cost: 12000, at: [GREENHOUSE.x, 31.5], requires: ['price1'], effect: { type: 'win' }, big: true, toast: 'GRAND GREENHOUSE!' },
    { id: 'travel', label: 'NEXT WORLD', cost: 0, at: [GATE.x, GATE.z], requires: ['greenhouse'], effect: { type: 'travel', world: 'chicken' }, priceText: 'GO' },
  ],

  hints: {
    harvest: 'Cut the {name}!',
    drop: 'Bring flowers to SELL',
    cash: 'Grab your cash!',
    buy: 'Buy: {label}',
    travel: 'Next: the Chicken Farm!',
  },

  finale: {
    pad: 'greenhouse',
    focus: GREENHOUSE,            // camera glide + confetti storm area
    next: 'chicken',
    // perk: { speedMul: 1.08, capacityAdd: 10 }   // engine default
  },

  // Scene-only data (read by scene.js; the engine ignores it).
  layout: {
    road: ROAD, cross: CROSS, ground: { minX: -60, maxX: 100, minZ: -70, maxZ: 100 },
    greenhouse: GREENHOUSE, gate: GATE,
    plots: PLOTS.map((p) => ({
      key: p.key, item: p.item, name: p.name, flip: p.flip, origin: { x: p.ox, z: p.oz },
      rect: { minX: p.ox - 13, maxX: p.ox + 13, minZ: p.oz - 13, maxZ: p.oz + 13 },
      sign: p.sign ? { x: p.sign[0], z: p.sign[1] } : null,
      source: p.key, shop: 'shop-' + p.key,
      color: FLOWERS.find((f) => f.id === p.item).petal,
    })),
  },

  // Converts the single-world v1 save (bloomrush.save.v1) into this world's level state.
  migrateV1(old) {
    const KINDS = ['rose', 'tulip', 'sunflower', 'orchid'];
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
    const stock = Array.isArray(old.stock) ? old.stock : [];
    const cash = Array.isArray(old.cash) ? old.cash : [];
    const stations = {};
    PLOTS.forEach((p, i) => {
      stations['shop-' + p.key] = { stock: Math.floor(num(stock[i])), value: Math.floor(num(stock[i])) * FLOWERS[i].price, cash: num(cash[i]) };
    });
    return {
      // the orchid farm is gone: its counter cash goes to the wallet
      money: num(old.money) + num(cash[3]),
      earned: num(old.earned),
      playTime: num(old.playTime),
      won: old.won === true,
      done: old.done || {},
      paid: old.paid || {},
      player: old.player,
      carried: (Array.isArray(old.carried) ? old.carried : []).map((i) => KINDS[i]).filter((k) => k && k !== 'orchid'),
      stations,
    };
  },
};
