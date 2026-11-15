// Fresh Corner Market: the third world. An indoor grocery store: crates arrive at the back dock,
// the player (and later stockers) restock department shelves, shoppers fill baskets and queue at
// checkouts, cash piles up. Departments (bakery, dairy, drinks) open as big unlocks; the finale
// is the Mega Mart grand opening. Everything here is data; scenery is in scene.js, models in models.js.
import { CRATE, ASSETS, makeCrateGeometry } from './models.js';

// ------------------------------------------------------------------ layout
// Floor x -9..21, z -8..14. Back walls (tall) on +x and +z. Street doors on the -z side.
const STORE = { minX: -9, maxX: 21, minZ: -8, maxZ: 14 };
const SHELF_Z = 12, AISLE_Z = 9.4;
const SHELF_X = { produce: 15.4, produce2: 11.0, bread: 6.6, milk: 2.2, drinks: -2.2 };
const DOCK_X = 18.7;
const DOCK_Z = { produce: 7.8, bread: 4.2, milk: 0.6, drinks: -3.0 };
const DOOR_IN = 13.5, DOOR_OUT = 10.6;
const CO = { co1: 6.5, co2: -0.5 };   // checkout counter centres (x); counters run along x at z = 3.2

const dock = (key, id, name, open, start, extra = {}) => ({
  id, type: 'pile', name, open, x: DOCK_X, z: DOCK_Z[key], capacity: 30, start,
  item: key,
  supply: { item: key, every: 3, amount: 6, first: 2, stagger: 0.12 },
  layout: { x: DOCK_X, z: DOCK_Z[key], y: 0.17, yaw: Math.PI / 2, cols: 2, rows: 3, dx: 0.8, dz: 0.56 },
  zone: { x: DOCK_X - 2.3, z: DOCK_Z[key], r: 1.5 },
  pallet: false, placeholder: false, markers: false, label: 'CRATES',
  hint: 'Grab the crates!',
  ...extra,
});

const shelf = (key, id, name, item, open, start) => ({
  id, type: 'shelf', name, open, item, start,
  shelf: { x: SHELF_X[key], z: SHELF_Z, yaw: Math.PI / 2, len: 3.6, depth: 1.3, h: 1.5, levels: 3 },
  approach: [{ x: SHELF_X[key], z: AISLE_Z }],
  browse: { x: SHELF_X[key], z: SHELF_Z - 1.45, spread: 2.4 },
  placeholder: false, markers: false, label: 'STOCK',
  hint: 'Stock the shelves!',
});

const checkout = (id, x0, open) => ({
  id, type: 'checkout', name: 'CHECKOUT', open,
  counter: { x: x0, z: 3.2, yaw: Math.PI / 2, len: 2.7, depth: 1.0, h: 0.95 },
  zone: { x: x0, z: 4.9, r: 1.4 },
  cashPile: { x: x0 + 3.0, z: 4.2, r: 1.4 },
  bundle: 15,
  queue: [0, 1, 2, 3, 4, 5].map((i) => ({ x: x0, z: 1.5 - i * 0.95 })),
  queueIn: [{ x: x0 - 2.4, z: AISLE_Z }, { x: x0 - 2.4, z: 1.5 }],
  exit: [{ x: x0 + 2.7, z: 1.0 }, { x: x0 + 2.7, z: -6.2 }, { x: DOOR_OUT, z: -8 }],
  cashierSpot: { x: x0 + 0.5, z: 4.1, yaw: Math.PI },
  placeholder: false, markers: false, label: 'SERVE',
});

const pad = (id, label, cost, at, requires, effect, extra) => ({ id, label, cost, at, requires, effect, ...extra });
const ALL_SHELVES = ['shelf-produce', 'shelf-produce2', 'shelf-bread', 'shelf-milk', 'shelf-drinks'];

export default {
  id: 'grocery',
  name: 'Grocery Store',

  lighting: { variant: 'indoor' },

  assets: [
    ...ASSETS,
    'mini-shop/shelf-bags', 'mini-shop/shelf-boxes', 'mini-shop/shelf-end', 'mini-shop/display-bread', 'mini-shop/display-cans',
    'mini-shop/display-fruit', 'mini-shop/freezer', 'mini-shop/freezers-standing', 'mini-shop/cash-register',
    'mini-shop/shopping-basket', 'mini-shop/shopping-cart', 'mini-shop/hand-truck', 'mini-shop/wall-window', 'mini-shop/column',
    'car-kit/van', 'car-kit/delivery-flat', 'factory-kit/conveyor-stripe', 'factory-kit/box-wide', 'factory-kit/box-long',
    'factory-kit/screen-wide', 'food-kit/loaf', 'food-kit/cheese', 'food-kit/donut', 'food-kit/broccoli', 'food-kit/can',
    'nature-kit/plant_bushDetailed', 'nature-kit/pot_large', 'nature-kit/tree_oak', 'nature-kit/tree_default', 'nature-kit/tree_fat',
  ],

  looks: {
    player: { model: 'male-d', tool: null, scale: 1 },
    hauler: 'stocker',
    cashier: 'employee',
    customers: ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-e', 'male-f'],
  },

  bounds: { minX: STORE.minX + 0.6, maxX: STORE.maxX - 0.6, minZ: STORE.minZ - 0.5, maxZ: STORE.maxZ - 0.8 },

  player: { start: { x: 13.5, z: 6.6 }, speed: 6.2, capacity: 14, harvestRadius: 1.25, look: 'player' },

  stats: { shoppers: 0 },

  items: [
    { id: 'produce', name: 'Produce', value: 6, geometry: () => makeCrateGeometry('produce'), step: CRATE.step, footprint: { w: CRATE.w, d: CRATE.d } },
    { id: 'bread', name: 'Bread', value: 10, geometry: () => makeCrateGeometry('bread'), step: CRATE.step, footprint: { w: CRATE.w, d: CRATE.d } },
    { id: 'milk', name: 'Milk', value: 16, geometry: () => makeCrateGeometry('milk'), step: CRATE.step, footprint: { w: CRATE.w, d: CRATE.d } },
    { id: 'drinks', name: 'Drinks', value: 24, geometry: () => makeCrateGeometry('drinks'), step: CRATE.step, footprint: { w: CRATE.w, d: CRATE.d } },
  ],

  shoppers: {
    count: 8, perCheckout: 6, speed: 4.4, shelves: [1, 3], items: [3, 5], takeInterval: 0.2, pause: 0.3, basket: 12, max: 30,
    spawnEvery: 0.6,
    entrance: [{ x: DOOR_IN, z: -13 }, { x: DOOR_IN, z: -9 }, { x: DOOR_IN, z: AISLE_Z }],
    exit: [{ x: DOOR_OUT, z: -9.5 }, { x: DOOR_OUT, z: -15 }],
  },

  stations: [
    dock('produce', 'dock-produce', 'DOCK', true, 12),
    dock('bread', 'dock-bread', 'BAKERY DOCK', false, 8),
    dock('milk', 'dock-milk', 'DAIRY DOCK', false, 8),
    dock('drinks', 'dock-drinks', 'DRINKS DOCK', false, 8),
    shelf('produce', 'shelf-produce', 'PRODUCE', 'produce', true, 0),
    shelf('produce2', 'shelf-produce2', 'PRODUCE', 'produce', false, 0),
    shelf('bread', 'shelf-bread', 'BREAD', 'bread', false, 0),
    shelf('milk', 'shelf-milk', 'MILK', 'milk', false, 0),
    shelf('drinks', 'shelf-drinks', 'DRINKS', 'drinks', false, 0),
    checkout('co1', CO.co1, true),
    checkout('co2', CO.co2, false),
  ],

  workers: {
    hauler: { look: 'hauler', speed: 4.4, capacity: 10 },
    cashier: { look: 'cashier' },
  },

  pads: [
    pad('cashier1', 'CASHIER', 30, [10.5, 7.0], [], { type: 'hire', role: 'cashier', to: 'co1' }),
    pad('stack1', 'BIGGER STACK', 60, [7.5, 7.0], ['cashier1'], { type: 'stat', stat: 'capacity', max: 24 }),
    pad('stocker1', 'STOCKER', 100, [4.5, 7.0], ['stack1'], { type: 'hire', role: 'hauler', from: ['dock-produce'], to: ['shelf-produce', 'shelf-produce2'] }),
    pad('run1', 'RUN FASTER', 150, [1.5, 7.0], ['stocker1'], { type: 'stat', stat: 'speed', mul: 1.2 }),

    pad('shoppers1', 'MORE SHOPPERS', 200, [-1.5, 7.0], ['run1'], { type: 'stat', stat: 'shoppers', add: 4 }),
    pad('bakery', 'BAKERY', 450, [-4.5, 7.0], ['shoppers1'], { type: 'open', stations: ['dock-bread', 'shelf-bread'] }, { big: true, toast: 'BAKERY OPEN!' }),
    pad('stocker2', 'STOCKER', 250, [-6.5, 3.5], ['bakery'], { type: 'hire', role: 'hauler', from: ['dock-produce', 'dock-bread'], to: ['shelf-produce', 'shelf-produce2', 'shelf-bread'] }),
    pad('produce2', 'FRUIT STAND', 250, [-6.5, 0.5], ['stocker2'], { type: 'open', stations: ['shelf-produce2'] }),
    pad('price1', 'SALE SIGNS +25%', 300, [-6.5, -2.5], ['produce2'], { type: 'stat', stat: 'priceMult', mul: 1.25 }),
    pad('stack2', 'HUGE STACK', 350, [-6.5, -5.5], ['price1'], { type: 'stat', stat: 'capacity', max: 36 }),
    pad('co2', 'CHECKOUT 2', 450, [-3.5, -5.5], ['stack2'], { type: 'open', stations: ['co2'] }, { big: true }),
    pad('cashier2', 'CASHIER', 350, [-0.5, -5.5], ['co2'], { type: 'hire', role: 'cashier', to: 'co2' }),

    pad('dairy', 'DAIRY', 800, [2.5, -5.5], ['cashier2'], { type: 'open', stations: ['dock-milk', 'shelf-milk'] }, { big: true, toast: 'DAIRY OPEN!' }),
    pad('stocker3', 'STOCKER', 600, [5.5, -5.5], ['dairy'], { type: 'hire', role: 'hauler', from: ['dock-produce', 'dock-bread', 'dock-milk'], to: ALL_SHELVES }),
    pad('shoppers2', 'MORE SHOPPERS', 800, [8.5, -5.5], ['stocker3'], { type: 'stat', stat: 'shoppers', add: 5 }),
    pad('speed2', 'TURBO SHOES', 800, [8.5, -3.0], ['shoppers2'], { type: 'stat', stat: 'speed', mul: 1.2 }),
    pad('price2', 'LOYALTY CARDS +30%', 1100, [8.5, -0.5], ['speed2'], { type: 'stat', stat: 'priceMult', mul: 1.3 }),
    pad('stack3', 'GIANT STACK', 900, [11.5, -0.5], ['price2'], { type: 'stat', stat: 'capacity', max: 50 }),

    pad('drinks', 'DRINKS', 2000, [11.5, -3.0], ['stack3'], { type: 'open', stations: ['dock-drinks', 'shelf-drinks'] }, { big: true, toast: 'DRINKS OPEN!' }),
    pad('stocker4', 'STOCKER', 1400, [14.5, -3.0], ['drinks'], { type: 'hire', role: 'hauler', from: ['dock-produce', 'dock-bread', 'dock-milk', 'dock-drinks'], to: ALL_SHELVES }),
    pad('shoppers3', 'MORE SHOPPERS', 1600, [14.5, -0.5], ['stocker4'], { type: 'stat', stat: 'shoppers', add: 6 }),
    pad('stocker5', 'STOCKER', 1800, [14.5, 2.0], ['shoppers3'], { type: 'hire', role: 'hauler', from: ['dock-produce', 'dock-bread', 'dock-milk', 'dock-drinks'], to: ALL_SHELVES }),
    pad('price3', 'PREMIUM BRANDS +40%', 2400, [11.5, 2.0], ['stocker5'], { type: 'stat', stat: 'priceMult', mul: 1.4 }),

    pad('megamart', 'MEGA MART', 5000, [3.5, -6.0], ['price3'], { type: 'win' }, { big: true, toast: 'GRAND OPENING!' }),
    pad('travel', 'NEXT WORLD', 0, [-3.5, -6.0], ['megamart'], { type: 'travel', world: 'flower' }, { priceText: 'GO' }),
  ],

  hints: {
    pickup: 'Grab the crates!',
    drop: 'Stock the shelves!',
    serve: 'Serve the customers!',
    cash: 'Grab your cash!',
    buy: 'Buy: {label}',
    travel: 'Back to the Flower Farm!',
  },

  finale: {
    pad: 'megamart',
    focus: { x: 6, z: -3, w: 16, d: 10 },
    next: 'flower',
  },

  layout: {
    store: STORE, shelfZ: SHELF_Z, aisleZ: AISLE_Z, shelfX: SHELF_X, dockX: DOCK_X, dockZ: DOCK_Z,
    doorIn: DOOR_IN, doorOut: DOOR_OUT, co: CO,
    departments: [
      { key: 'produce', shelf: 'shelf-produce', dock: 'dock-produce', label: 'FRESH PRODUCE', color: '#3dbb5a' },
      { key: 'produce2', shelf: 'shelf-produce2', dock: null, label: 'FRUIT STAND', color: '#3dbb5a' },
      { key: 'bread', shelf: 'shelf-bread', dock: 'dock-bread', label: 'BAKERY', color: '#e0903a' },
      { key: 'milk', shelf: 'shelf-milk', dock: 'dock-milk', label: 'DAIRY', color: '#3fa3e8' },
      { key: 'drinks', shelf: 'shelf-drinks', dock: 'dock-drinks', label: 'DRINKS', color: '#ec4f7a' },
    ],
  },
};
