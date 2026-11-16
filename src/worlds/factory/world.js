// Volt Works: the fourth world. A battery-and-car factory that starts as one person in a garage and
// grows, pad by pad, into an automated gigafactory. Everything here is data; scenery is in scene.js,
// models in models.js. Layout notes: the camera looks from (-x, -z), so tall walls stand on the +x
// and +z sides and the road runs along the -z edge.
import { makeScrapGeometry, makeCellGeometry, makePackGeometry, makeScrapHeapGeometry, makeSweptGeometry, SCRAP, CELL, PACK, itemGloss, makeVan } from './models.js';

// ------------------------------------------------------------------ layout
const ROAD_Z = -10.5;
const YARD = { x0: -15.5, z0: -4, dx: 1.5, dz: 1.5, cols: 8, rows: 9 };
const GARAGE = { minX: -2, maxX: 14, minZ: -7, maxZ: 9 };

const pad = (id, label, cost, at, requires, effect, extra) => ({ id, label, cost, at, requires, effect, ...extra });

const BLUE = 0x2f7fe0, NAVY = 0x25324a;

export default {
  id: 'factory',
  name: 'Volt Works',

  camera: { type: 'perspective', fov: 30, viewPortrait: 17, viewLandscape: 13.5, fog: { color: 0xcfe6f5, start: 30, end: 150 } },
  lighting: { background: 0xcfe6f5, shadow: { extent: 20, mapSize: 2048 } },

  assets: [
    'car-kit/van', 'car-kit/truck', 'car-kit/delivery',
    'factory-kit/machine', 'factory-kit/machine-window', 'factory-kit/hopper-round', 'factory-kit/conveyor-stripe',
  ],

  looks: {
    player: { model: 'animatedmen/Male_Casual', colors: { Shirt: 0xff7a1a, Pants: NAVY, Socks: 0x3a2f2a }, hat: 'hardhat' },
    hauler: { model: 'animatedwomen/Female_Casual', colors: { Shirt: BLUE, Pants: BLUE, Socks: 0x2a2f3a }, hat: 'hardhat-white' },
    helper2: { model: 'animatedmen/Male_LongSleeve', colors: { Shirt: BLUE, Pants: BLUE, Socks: 0x2a2f3a }, hat: 'hardhat-white' },
    customers: ['hauler'],
  },

  bounds: { minX: -19, maxX: 15, minZ: -8.5, maxZ: 11 },

  player: { start: { x: -2.5, z: 0.5 }, speed: 6.6, capacity: 12, harvestRadius: 1.35, look: 'player', perColumn: 400 },

  stats: { regrow: 7, cellSpeed: 1, benchSpeed: 1 },

  items: [
    { id: 'scrap', name: 'Scrap', value: 0, geometry: makeScrapGeometry, step: SCRAP.step, footprint: { w: SCRAP.w, d: SCRAP.d }, material: itemGloss },
    { id: 'cell', name: 'Cells', value: 5, geometry: makeCellGeometry, step: CELL.step, footprint: { w: CELL.w, d: CELL.d }, material: itemGloss },
    { id: 'pack', name: 'Battery Packs', value: 22, geometry: makePackGeometry, step: PACK.step, footprint: { w: PACK.w, d: PACK.d }, material: itemGloss },
  ],

  stations: [
    { id: 'yard', type: 'source', name: 'Scrap', item: 'scrap', open: true, grid: YARD,
      plant: makeScrapHeapGeometry, stub: makeSweptGeometry, sway: false, plantHeight: 0.6, regrowJitter: 2.5, growTime: 0.5,
      burst: [0xb7653a, 0x8d949e, 0xc9d0d8], action: 'swing', home: { x: -5, z: 2 }, sound: 'crate' },
    { id: 'cellmaker', type: 'converter', name: 'CELL MAKER', open: true, x: 1.5, z: 5.0,
      recipe: { in: { scrap: 2 }, out: { cell: 1 }, time: 0.55 }, batch: 1, speedStat: 'cellSpeed', inputCap: 24,
      machine: { w: 2.6, d: 2.2, h: 2.0, yaw: 0 }, dropZone: { x: -1.7, z: 5.0, r: 1.4 }, workerSpot: { x: -1.9, z: 3.9 },
      output: { capacity: 24, zone: { x: 4.7, z: 5.0, r: 1.35 } },
      labels: { input: 'SCRAP', output: 'CELLS' }, placeholder: true,
      hints: { drop: 'Feed scrap to the cell maker!', pickup: 'Grab the cells!' } },
    { id: 'bench', type: 'converter', name: 'PACK BENCH', open: true, x: 10.6, z: 5.0,
      recipe: { in: { cell: 3 }, out: { pack: 1 }, time: 1.3 }, batch: 1, speedStat: 'benchSpeed', inputCap: 18,
      machine: { w: 2.4, d: 2.0, h: 1.1, yaw: 0 }, dropZone: { x: 7.7, z: 5.0, r: 1.35 }, workerSpot: { x: 7.7, z: 3.9 },
      output: { capacity: 18, zone: { x: 10.6, z: 1.8, r: 1.35 }, layout: { x: 10.6, z: 3.4, cols: 3, rows: 1 } },
      labels: { input: 'CELLS', output: 'PACKS' }, placeholder: true,
      hints: { drop: 'Build packs at the bench!', pickup: 'Grab the battery packs!' } },
    { id: 'ship', type: 'pile', name: 'SHIPPING', open: true, x: 10.6, z: -4.6, item: 'pack', capacity: 40, start: 0,
      layout: { x: 10.6, z: -5.2, cols: 3, rows: 2 }, zone: { x: 13.2, z: -6.6, r: 0.6 }, dropZone: { x: 10.6, z: -2.2, r: 1.35 },
      idleHint: false, markers: false, hint: 'Ship the packs!' },
    { id: 'cash', type: 'cashpile', name: 'CASH', open: true, cashPile: { x: 5.6, z: -4.6, r: 1.4 }, bundle: 12 },
  ],

  // helpers that are there from the start (no pad): the van that buys the packs
  hires: [
    { id: 'van0', role: 'vendor', from: 'ship', to: 'cash', options: { capacity: 6, every: 9, first: 4, kinds: ['pack'], model: makeVan,
      path: { in: [{ x: 44, z: ROAD_Z }, { x: 18, z: ROAD_Z }], stop: { x: 10.6, z: ROAD_Z + 0.6 }, out: [{ x: 2, z: ROAD_Z }, { x: -34, z: ROAD_Z }] } } },
  ],

  workers: {
    hauler: { look: 'hauler', speed: 4.6, capacity: 8 },
  },

  pads: [
    pad('stack1', 'BIG STACK', 25, [1.5, -2.6], [], { type: 'stat', stat: 'capacity', max: 18 }),
    pad('helper1', 'HELPER', 60, [1.5, 0.9], ['stack1'], { type: 'hire', role: 'hauler', from: ['yard'], to: ['cellmaker'] }, { toast: 'FIRST EMPLOYEE!' }),
    pad('bench1', 'FASTER BENCH', 110, [5.2, 0.9], ['helper1'], { type: 'stat', stat: 'benchSpeed', mul: 1.5 }),
    pad('helper2', 'HELPER', 160, [1.5, -2.6], ['bench1'], { type: 'hire', role: 'hauler', from: ['cellmaker'], to: ['bench'], options: { look: 'helper2' } }, { toast: 'SECOND EMPLOYEE!' }),
    pad('giga', 'GIGAFACTORY', 400, [5.2, 0.9], ['helper2'], { type: 'win' }, { big: true, toast: 'GIGAFACTORY!' }),
    pad('travel', 'WORLD SELECT', 0, [1.5, 0.9], ['giga'], { type: 'travel', world: 'flower' }, { priceText: 'GO' }),
  ],

  hints: {
    harvest: 'Sweep up the scrap!',
    pickup: 'Pick up {name}!',
    drop: 'Bring it to {name}',
    cash: 'Grab your cash!',
    buy: 'Buy: {label}',
    travel: 'Back to the Flower Farm!',
  },

  finale: { pad: 'giga', focus: { x: 6, z: 1, w: 14, d: 12 } },

  layout: { roadZ: ROAD_Z, yard: YARD, garage: GARAGE },
};
