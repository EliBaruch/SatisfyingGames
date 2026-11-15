// Sunny Egg Ranch: the chicken world. A farmyard beside a country road.
//   hen pen A (nests) -> egg packer (6 eggs -> 1 carton worth 3x) -> farm stand (customers from the road)
//   silo -> trough (hens lay twice as fast while it holds feed); the golden coop (premium eggs, its own
//   packer); a delivery truck that buys cartons straight from the packer; the Giant Golden Egg monument.
// Everything here is data; scene.js dresses it, models.js builds the items.
import { makeEggTrayGeometry, makeCartonGeometry, makeFeedSackGeometry, makeNestWithEgg, makeEmptyNest, makeDeliveryTruck, SIZES } from './models.js';

// ------------------------------------------------------------------ layout ---
const LAY = {
  ground: { minX: -64, maxX: 100, minZ: -60, maxZ: 100 },
  penA: { minX: -6.5, maxX: 10, minZ: 5.5, maxZ: 22 },          // hen pen with the starting nests
  penB: { minX: -6.5, maxX: 10, minZ: 31, maxZ: 47 },           // the golden coop's pen
  road: { minX: 24.5, maxX: 34, minZ: -50, maxZ: 100 },         // runs along z
  monument: { x: 40, z: 42, w: 11, d: 11 },                      // finale site (east of the road)
  gate: { x: 29, z: 70 },                                        // travel gate at the far end of the road
  stand: { x: 17, z: 11 },
};
const STAND = {
  counter: { x: 17, z: 11, yaw: 0, ...SIZES.counter },
  dropZone: { x: 14.3, z: 11, r: 1.7 },
  cashPile: { x: 17, z: 15.6, r: 1.5 },
};

const sq = (n, f) => Array.from({ length: n }, (_, i) => f(i));

export default {
  id: 'chicken', name: 'Sunny Egg Ranch',
  assets: [
    'farmbuildings/Barn', 'farmbuildings/Silo', 'farmbuildings/OpenBarn', 'farmbuildings/Windmill', 'farmbuildings/ChickenCoop',
    'cube-pets/animal-chick', 'cube-pets/animal-cow', 'cube-pets/animal-pig', 'car-kit/tractor', 'car-kit/truck',
    'nature-kit/tree_default', 'nature-kit/tree_oak', 'nature-kit/tree_fat', 'nature-kit/tree_small', 'nature-kit/tree_pineTallA',
    'nature-kit/plant_bush', 'nature-kit/plant_bushLarge', 'nature-kit/plant_bushDetailed', 'nature-kit/flower_redA', 'nature-kit/flower_yellowA',
    'nature-kit/flower_purpleA', 'nature-kit/grass', 'nature-kit/rock_largeA', 'nature-kit/rock_smallA', 'nature-kit/rock_smallD', 'nature-kit/rock_tallA',
    'nature-kit/fence_simple', 'nature-kit/crops_wheatStageA', 'nature-kit/crops_cornStageD', 'nature-kit/path_stone',
    'factory-kit/box-small', 'factory-kit/box-large', 'mini-forest/stones',
  ],
  looks: {
    player: { model: 'male-f', tool: 'basket', hat: 'straw' },
    hauler: { model: 'female-b', tool: 'basket' },
    collector: { model: 'female-b', tool: 'basket' },
    goldhand: { model: 'female-d', tool: 'basket' },
    feeder: { model: 'male-e', tool: 'bucket' },
    porter: { model: 'worker', tool: null },
    cashier: 'employee',
    customers: ['female-a', 'female-c', 'female-e', 'male-a', 'male-d', 'male-b', 'female-f', 'male-e'],
  },
  lighting: { variant: 'outdoor', background: 0x9fdcff },
  bounds: { minX: -22, maxX: 52, minZ: -14, maxZ: 62 },
  player: { start: { x: 11, z: 9.5 }, speed: 6.5, capacity: 25, harvestRadius: 1.3, look: 'player' },

  // regrow = seconds for a nest to lay again; regrowB for the golden nests
  stats: { regrow: 7, regrowB: 11, packSpeed: 1, packSpeedB: 1 },

  items: [
    { id: 'egg', name: 'Eggs', value: 5, geometry: () => makeEggTrayGeometry(false), step: SIZES.eggStep, footprint: { w: SIZES.eggTray.len, d: SIZES.eggTray.d } },
    { id: 'goldegg', name: 'Golden eggs', value: 14, geometry: () => makeEggTrayGeometry(true), step: SIZES.eggStep, footprint: { w: SIZES.eggTray.len, d: SIZES.eggTray.d } },
    // carton = 3x the eggs that went in: 6 x 5 x 3 = 90 ; golden: 4 x 14 x 3 = 168
    { id: 'carton', name: 'Cartons', value: 90, geometry: () => makeCartonGeometry(false), step: SIZES.cartonStep, footprint: { w: SIZES.carton.len, d: SIZES.carton.d } },
    { id: 'goldcarton', name: 'Gold cartons', value: 168, geometry: () => makeCartonGeometry(true), step: SIZES.cartonStep, footprint: { w: SIZES.carton.len, d: SIZES.carton.d } },
    { id: 'feed', name: 'Feed', value: 0, geometry: makeFeedSackGeometry, step: SIZES.sackStep, footprint: { w: SIZES.sack.len, d: SIZES.sack.d } },
  ],

  stations: [
    // troughs come before the nests they boost (they install the regrow hook on them)
    { id: 'trough', type: 'trough', name: 'TROUGH', item: 'feed', x: 2.0, z: 17.2, capacity: 10, start: 0, drain: 0.22, urgent: 0.7,
      boosts: [{ station: 'nests', multiplier: 2 }], trough: { len: 3.2, depth: 1.0, h: 0.6, yaw: 0 },
      dropZone: { x: 2.0, z: 14.9, r: 1.4 }, workerSpot: { x: 2.0, z: 14.9 }, hint: 'Fill the trough!',
      placeholder: false, markers: false },
    { id: 'trough2', type: 'trough', name: 'GOLD TROUGH', item: 'feed', x: 2.0, z: 41.0, capacity: 10, start: 0, drain: 0.22, urgent: 0.7,
      boosts: [{ station: 'nestsB', multiplier: 2 }], trough: { len: 3.2, depth: 1.0, h: 0.6, yaw: 0 },
      dropZone: { x: 2.0, z: 38.7, r: 1.4 }, workerSpot: { x: 2.0, z: 38.7 }, hint: 'Fill the gold trough!',
      placeholder: false, markers: false },

    // ---- coop A: the starting nests (24)
    { id: 'nests', type: 'source', name: 'Eggs', item: 'egg', open: true,
      grid: { x0: -2.6, z0: 9.0, dx: 1.3, dz: 1.3, cols: 6, rows: 4 },
      plant: () => makeNestWithEgg(false), stub: makeEmptyNest, sway: false, plantHeight: 0.45, regrowJitter: 2.0,
      burst: [0xfff1dc, 0xffe08a, 0xffffff], action: 'pickup', home: { x: 5, z: 7.2 } },
    // ---- coop B: golden nests (16)
    { id: 'nestsB', type: 'source', name: 'Golden eggs', item: 'goldegg', open: false, regrowStat: 'regrowB',
      grid: { x0: -2.6, z0: 34.5, dx: 1.3, dz: 1.3, cols: 6, rows: 3 },
      plant: () => makeNestWithEgg(true), stub: makeEmptyNest, sway: false, plantHeight: 0.45, regrowJitter: 2.0,
      burst: [0xffc42e, 0xffe58a, 0xffffff], action: 'pickup', home: { x: 5, z: 32.2 } },

    { id: 'silo', type: 'pile', name: 'SILO', item: 'feed', open: false, infinite: true, capacity: 12, x: -3.5, z: 20.5,
      zone: { x: -3.5, z: 17.6, r: 1.6 }, idleHint: false, label: 'FEED', hint: 'Grab feed at the silo!',
      placeholder: false, markers: false, interval: 0.1 },

    // ---- the egg packers (6 eggs -> 1 carton; 4 golden eggs -> 1 gold carton)
    { id: 'packer', type: 'converter', name: 'PACKER', open: false, x: 17, z: 2,
      recipe: { in: { egg: 6 }, out: { carton: 1 }, time: 2.2 }, batch: 2, speedStat: 'packSpeed', inputCap: 36,
      machine: { w: 2.6, d: 2.2, h: 2.2, yaw: 0 },
      dropZone: { x: 12.6, z: 2, r: 1.7 }, workerSpot: { x: 12.6, z: 2 },
      output: { capacity: 24, zone: { x: 21.4, z: 2, r: 1.7 }, layout: { x: 21.4, z: 2, cols: 3, rows: 2 } },
      input: { layout: { x: 14.6, z: 2, cols: 3, rows: 2 } },
      labels: { input: 'EGGS', output: 'CARTONS' }, hints: { drop: 'Pack the eggs!', pickup: 'Grab the cartons!' },
      placeholder: false, markers: false },
    { id: 'packer2', type: 'converter', name: 'GOLD PACKER', open: false, x: 17, z: 36,
      recipe: { in: { goldegg: 4 }, out: { goldcarton: 1 }, time: 2.2 }, batch: 2, speedStat: 'packSpeedB', inputCap: 24,
      machine: { w: 2.6, d: 2.2, h: 2.2, yaw: 0 },
      dropZone: { x: 12.6, z: 36, r: 1.7 }, workerSpot: { x: 12.6, z: 36 },
      output: { capacity: 20, zone: { x: 21.4, z: 36, r: 1.7 }, layout: { x: 21.4, z: 36, cols: 3, rows: 2 } },
      input: { layout: { x: 14.6, z: 36, cols: 3, rows: 2 } },
      labels: { input: 'GOLD EGGS', output: 'CARTONS' }, hints: { drop: 'Pack the golden eggs!', pickup: 'Grab the gold cartons!' },
      placeholder: false, markers: false },

    // ---- the farm stand (customers walk in from the road)
    { id: 'stand', type: 'shop', name: 'SELL', open: true, accepts: ['egg', 'carton', 'goldcarton'], display: 'egg', extraLine: 1,
      counter: STAND.counter, dropZone: STAND.dropZone, cashPile: STAND.cashPile,
      queue: sq(6, (i) => ({ x: 18.5 + i * 1.0, z: 11 })),
      customerIn: [{ x: 31.5, z: -30 }, { x: 31.5, z: 11 }],
      customerOut: [{ x: 18.5, z: 8.4 }, { x: 28, z: 8.4 }, { x: 31.5, z: 6 }, { x: 31.5, z: -30 }],
      cashierSpot: { x: 17.2, z: 12.6 }, workerSpot: { x: 14.3, z: 8.7 }, vehicleSpot: { x: 14.3, z: 8.7 },
      hint: 'Sell at the farm stand!' },
    { id: 'truckcash', type: 'cashpile', name: 'TRUCK CASH', open: true, cashPile: { x: 23.4, z: -3.6, r: 1.5 }, bundle: 20 },
  ],

  workers: {
    hauler: { look: 'collector', speed: 4.4, capacity: 12, harvestRadius: 1.0 },
    vendor: {
      model: makeDeliveryTruck, kinds: ['carton'], capacity: 12, every: 22, first: 5, loadInterval: 0.1, speed: 7,
      path: { in: [{ x: 27.6, z: -34 }, { x: 27.6, z: -8 }], stop: { x: 27.6, z: 2 }, out: [{ x: 27.6, z: 22 }, { x: 27.6, z: 60 }] },
    },
  },

  pads: [
    // ---- the first minutes: sell eggs, hire collectors
    { id: 'cashier', label: 'CASHIER', cost: 30, at: [13.8, 6.4], effect: { type: 'hire', role: 'cashier', to: 'stand' }, toast: 'CASHIER HIRED!' },
    { id: 'col1', label: 'EGG COLLECTOR', cost: 60, at: [8.5, 3.8], requires: ['cashier'],
      effect: { type: 'hire', role: 'hauler', from: ['nests'], to: ['stand', 'packer'] }, toast: 'COLLECTOR HIRED!' },
    { id: 'cap1', label: 'BIGGER STACK', cost: 100, at: [4.5, 3.8], requires: ['col1'], effect: { type: 'stat', stat: 'capacity', max: 40 } },
    { id: 'speed1', label: 'RUN FASTER', cost: 140, at: [0.5, 3.8], requires: ['cap1'], effect: { type: 'stat', stat: 'speed', mul: 1.2 } },
    { id: 'col2', label: 'EGG COLLECTOR', cost: 200, at: [-3.5, 3.8], requires: ['speed1'],
      effect: { type: 'hire', role: 'hauler', from: ['nests'], to: ['stand', 'packer'] }, toast: 'COLLECTOR HIRED!' },

    // ---- the machine
    { id: 'packer', label: 'EGG PACKER', cost: 520, at: [16.5, -2.6], requires: ['col2'], big: true,
      effect: { type: 'open', stations: ['packer'] }, toast: 'EGG PACKER!', focus: { x: 17, z: 2 } },
    { id: 'porter', label: 'CARTON PORTER', cost: 300, at: [24.2, 6.4], requires: ['packer'],
      effect: { type: 'hire', role: 'hauler', from: ['packer'], to: ['stand'], options: { look: 'porter', capacity: 12 } }, toast: 'PORTER HIRED!' },
    { id: 'price1', label: 'FARM FRESH +25%', cost: 400, at: [20.2, 6.4], requires: ['porter'], effect: { type: 'stat', stat: 'priceMult', mul: 1.25 } },

    // ---- feed: silo + trough, then a feeder
    { id: 'feedarea', label: 'FEED SILO', cost: 500, at: [-3.5, 14.6], requires: ['price1'], big: true,
      effect: { type: 'open', stations: ['silo', 'trough'] }, toast: 'FEED SILO!', focus: { x: 0, z: 18 } },
    { id: 'feeder', label: 'FEEDER', cost: 450, at: [-1.0, 7.2], requires: ['feedarea'],
      effect: { type: 'hire', role: 'hauler', from: ['silo'], to: ['trough', 'trough2'], options: { look: 'feeder', minRoom: 4, capacity: 8 } }, toast: 'FEEDER HIRED!' },
    { id: 'col3', label: 'EGG COLLECTOR', cost: 600, at: [-3.5, 0.5], requires: ['feeder'],
      effect: { type: 'hire', role: 'hauler', from: ['nests'], to: ['packer'] }, toast: 'COLLECTOR HIRED!' },
    { id: 'pack1', label: 'FASTER PACKER', cost: 700, at: [0.5, 0.5], requires: ['col3'], effect: { type: 'stat', stat: 'packSpeed', mul: 1.4 } },
    { id: 'cap2', label: 'HUGE STACK', cost: 800, at: [4.5, 0.5], requires: ['pack1'], effect: { type: 'stat', stat: 'capacity', max: 60 } },

    // ---- expansion: the golden coop
    { id: 'goldcoop', label: 'GOLDEN COOP', cost: 1600, at: [11.5, 30.0], requires: ['cap2'], big: true,
      effect: { type: 'open', stations: ['nestsB', 'packer2', 'trough2'] }, toast: 'GOLDEN COOP!', focus: { x: 5, z: 38 } },
    { id: 'goldcol', label: 'GOLD COLLECTOR', cost: 900, at: [9.6, 28.0], requires: ['goldcoop'],
      effect: { type: 'hire', role: 'hauler', from: ['nestsB'], to: ['packer2'], options: { look: 'goldhand' } }, toast: 'COLLECTOR HIRED!' },
    { id: 'goldporter', label: 'GOLD PORTER', cost: 1100, at: [21.4, 31.0], requires: ['goldcol'],
      effect: { type: 'hire', role: 'hauler', from: ['packer2'], to: ['stand'], options: { look: 'porter', capacity: 12 } }, toast: 'PORTER HIRED!' },
    { id: 'speed2', label: 'TURBO BOOTS', cost: 1300, at: [16.5, 28.0], requires: ['goldporter'], effect: { type: 'stat', stat: 'speed', mul: 1.2 } },
    { id: 'goldcol2', label: 'GOLD COLLECTOR', cost: 1400, at: [5.5, 28.0], requires: ['speed2'],
      effect: { type: 'hire', role: 'hauler', from: ['nestsB'], to: ['packer2'], options: { look: 'goldhand' } }, toast: 'COLLECTOR HIRED!' },
    { id: 'price2', label: 'GOLD LABEL +50%', cost: 2200, at: [1.5, 28.0], requires: ['goldcol2'], effect: { type: 'stat', stat: 'priceMult', mul: 1.5 } },

    // ---- the truck
    { id: 'truck', label: 'DELIVERY TRUCK', cost: 3000, at: [26.2, -3.8], requires: ['price2'], big: true,
      effect: { type: 'hire', role: 'vendor', from: 'packer', to: 'truckcash' }, toast: 'DELIVERY TRUCK!', focus: { x: 26, z: 0 } },
    { id: 'pack2', label: 'TURBO PACKER', cost: 3500, at: [12.5, -3.2], requires: ['truck'], effect: { type: 'stat', stat: 'packSpeed', mul: 1.5 } },
    { id: 'col4', label: 'EGG COLLECTOR', cost: 4000, at: [8.5, -3.2], requires: ['pack2'],
      effect: { type: 'hire', role: 'hauler', from: ['nests'], to: ['packer'] }, toast: 'COLLECTOR HIRED!' },
    { id: 'cap3', label: 'MEGA STACK', cost: 4200, at: [4.5, -3.2], requires: ['col4'], effect: { type: 'stat', stat: 'capacity', max: 90 } },

    // ---- finale and the way on
    { id: 'monument', label: 'GIANT GOLDEN EGG', cost: 8000, at: [40, 35.2], requires: ['cap3'], big: true,
      effect: { type: 'win' }, toast: 'GIANT GOLDEN EGG!' },
    { id: 'travel', label: 'NEXT WORLD', cost: 0, at: [29, 66.5], requires: ['monument'], effect: { type: 'travel', world: 'grocery' }, priceText: 'GO' },
  ],

  hints: {
    harvest: 'Collect the {name}!',
    pickup: 'Pick up {name}!',
    drop: 'Sell at the farm stand!',
    cash: 'Grab your cash!',
    buy: 'Buy: {label}',
    travel: 'Next: the Grocery Store!',
  },

  finale: { pad: 'monument', focus: { x: 40, z: 42, w: 11, d: 11 }, next: 'grocery' },

  layout: LAY,
};
