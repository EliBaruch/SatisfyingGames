// Volt Works: the fourth world. A battery-and-car factory that starts as one person in a garage and
// grows, pad by pad, into an automated gigafactory. Everything here is data; scenery is in scene.js,
// models in models.js.
//
// Layout (world axes; the camera looks from (-x, -z), so +x is up-left and +z up-right on screen, tall
// walls stand on the +x / +z sides and the road runs along the -z edge):
//
//    z 37 +---------------------------------------+-----------+
//         |  CAR HALL (stage 4)  line z = 30      |  CAR LOT  |
//      21 +----------------+----------------------+ (outside) |
//         |  WORKSHOP ext. |  AUTO LINE (stage 3) |           |
//       9 +  (stage 2)     |  ore > cells > packs |           |
//         |  GARAGE (1)    |  belt down to truck  |           |
//      -7 +----------------+----------------------+-----------+
//          x -2          14                      36          52     road at z = -10.5
//    scrap yard: x -17..-4, z -5..9 (outside, on the camera side)
import {
  makeScrapGeometry, makeCellGeometry, makePackGeometry, makeSteelGeometry, makePanelGeometry, makeWheelGeometry,
  makeScrapHeapGeometry, makeSweptGeometry, SCRAP, CELL, PACK, STEEL, PANEL, WHEEL, itemGloss,
  makeVan, makeTruck, makeDelivery, makeSweeper, makeAgv,
} from './models.js';

// ------------------------------------------------------------------ layout
const ROAD_Z = -10.5, STOP_Z = -9.7;
const YARD = { x0: -15.5, z0: -4, dx: 1.5, dz: 1.5, cols: 8, rows: 9 };
// floor rectangles added by each stage, and the outer walls while that stage is the latest
const FLOORS = [
  null,
  { minX: -2, maxX: 14, minZ: -7, maxZ: 9 },      // 1 garage
  { minX: -2, maxX: 14, minZ: 9, maxZ: 21 },      // 2 workshop extension
  { minX: 14, maxX: 36, minZ: -7, maxZ: 21 },     // 3 auto line hall
  { minX: -2, maxX: 36, minZ: 21, maxZ: 37 },     // 4 car hall
];
const HALL = [null, { maxX: 14, maxZ: 9 }, { maxX: 14, maxZ: 21 }, { maxX: 36, maxZ: 21 }, { maxX: 36, maxZ: 37 }, { maxX: 36, maxZ: 37 }];
const BOUNDS = [
  null,
  { minX: -19, maxX: 13.2, minZ: -8.3, maxZ: 10.6 },
  { minX: -19, maxX: 13.2, minZ: -8.3, maxZ: 20.2 },
  { minX: -19, maxX: 35.2, minZ: -8.3, maxZ: 20.2 },
  { minX: -19, maxX: 35.2, minZ: -8.3, maxZ: 36.2 },
  { minX: -19, maxX: 35.2, minZ: -8.3, maxZ: 36.2 },
];
const ZOOM = [1, 1, 1.14, 1.32, 1.55, 1.8];
const LINE = { from: { x: 7.5, z: 30 }, to: { x: 30.5, z: 30 } };
const LOT = { x0: 40.5, z0: 23.5, dx: 4.6, dz: 3.4, cols: 2, rows: 4, yaw: Math.PI };

const BLUE = 0x2f7fe0, NAVY = 0x25324a, GREEN = 0x2fa866, GREY = 0x7b8796;
// crew members cast no shadow-map shadow (blob shadows only): there are many of them
const worker = (model, shirt, pants, hat, shadow = false) => ({ model, colors: { Shirt: shirt, Pants: pants, Socks: 0x2a2f3a }, hat, shadow });

// a truck's road path for a stop at x (they drive in from +x and leave toward -x)
const road = (x, z = STOP_Z) => ({ in: [{ x: x + 24, z: ROAD_Z }, { x: x + 8, z: ROAD_Z }], stop: { x, z }, out: [{ x: x - 8, z: ROAD_Z }, { x: x - 24, z: ROAD_Z }] });

const pad = (id, label, cost, at, requires, effect, extra) => ({ id, label, cost, at, requires, effect, ...extra });
const stat = (s, op) => ({ type: 'stat', stat: s, ...op });
const hire = (role, from, to, extra) => ({ type: 'hire', role, from, to, ...extra });
const multi = (...effects) => ({ type: 'multi', effects });

// pad spots per area
const S1 = [[1.5, -2.6], [1.5, 0.9], [5.2, 0.9]];
const S2 = [[1.5, 9.0], [4.6, 9.0], [12.4, 8.6]];
const S3 = [[18.6, 0], [22.2, 0], [25.8, 0], [29.4, 0]];
const S4 = [[18, 24.6], [21.6, 24.6], [25.2, 24.6], [28.8, 24.6]];

// the chain: [id, label, cost, spot, effect, extra]; each pad requires the one before it.
// The order follows the bottleneck: every pad lifts whatever is holding income back at that point.
const VAN = { capacity: 12, every: 1, first: 1, kinds: ['pack'] };
const CHAIN = [
  // ---- stage 1: the garage
  ['stack1', 'BIG STACK', 55, S1[0], stat('capacity', { max: 20 })],
  ['helper1', 'HELPER', 80, S1[1], hire('hauler', ['yard'], ['cellmaker']), { toast: 'FIRST EMPLOYEE!' }],
  ['boots1', 'FAST BOOTS', 310, S1[2], stat('speed', { mul: 1.15 })],
  ['helper2', 'HELPER', 380, S1[0], hire('hauler', ['cellmaker'], ['bench'], { options: { look: 'helperB' } }), { toast: 'SECOND EMPLOYEE!' }],
  ['bench1', 'FASTER BENCH', 450, S1[1], stat('benchSpeed', { mul: 1.5 })],
  ['helper3', 'HELPER', 510, S1[2], hire('hauler', ['bench'], ['ship'], { options: { look: 'helperC' } })],
  ['cells1', 'FAST CELLS', 580, S1[0], stat('cellSpeed', { mul: 1.6 })],
  ['price1', 'QUALITY +25%', 650, S1[1], stat('priceMult', { mul: 1.25 })],
  ['workshop', 'WORKSHOP', 1200, S1[2], multi({ type: 'stage', stage: 2 }, { type: 'open', stations: ['cellmaker2', 'bench2'] }), { big: true, toast: 'WORKSHOP OPEN!', focus: { x: 6, z: 13 } }],
  // ---- stage 2: the workshop
  ['van2', 'SECOND VAN', 540, S2[0], hire('vendor', 'ship', 'cash', { options: { ...VAN, model: makeVan, path: road(7.4) } })],
  ['helper4', 'HELPER', 650, S2[1], hire('hauler', ['yard'], ['cellmaker2', 'cellmaker'])],
  ['helper5', 'HELPER', 1200, S2[2], hire('hauler', ['cellmaker2', 'cellmaker'], ['bench2', 'bench'], { options: { look: 'helperB' } })],
  ['stack2', 'HUGE STACK', 1300, S2[0], stat('capacity', { max: 32 })],
  ['helper6', 'HELPER', 1400, S2[1], hire('hauler', ['bench2', 'bench'], ['ship'], { options: { look: 'helperC' } })],
  ['truck1', 'BIG TRUCK', 1400, S2[2], hire('vendor', 'ship', 'cash', { options: { ...VAN, capacity: 24, model: makeDelivery, path: road(11.6, -11.6) } }), { toast: 'DELIVERY TRUCK!' }],
  ['sweeper', 'SWEEPER', 1600, S2[0], hire('harvester', 'yard', 'cellmaker2'), { big: true, toast: 'SWEEPER TRUCK!' }],
  ['crew1', 'BENCH CREW', 2400, S2[1], multi(
    hire('operator', null, 'bench', { spot: { x: 10.6, z: 6.7 }, options: { look: 'operator' } }),
    hire('operator', null, 'bench2', { spot: { x: 10.6, z: 14.7 }, options: { look: 'operatorB' } }),
    stat('benchSpeed', { mul: 1.5 })), { toast: 'BENCH CREW HIRED!' }],
  ['price2', 'BRAND +30%', 2700, S2[2], stat('priceMult', { mul: 1.3 })],
  ['autoline', 'AUTO LINE', 4700, S2[1], multi({ type: 'stage', stage: 3 },
    { type: 'open', stations: ['oredock', 'belt-a', 'cell3', 'belt-b', 'packer3', 'belt-c', 'ship2', 'cash2', 'solid3'] },
    hire('vendor', 'ship2', 'cash2', { options: { ...VAN, first: 6, model: makeDelivery, path: road(34.0) } })),
    { big: true, toast: 'FIRST ASSEMBLY LINE!', focus: { x: 24, z: 12 } }],
  // ---- stage 3: the auto line
  ['auto1', 'TURBO LINE', 2800, S3[0], stat('autoSpeed', { mul: 1.6 })],
  ['ore1', 'MORE ORE', 3400, S3[1], stat('oreRate', { mul: 1.6 })],
  ['truck3', 'TRUCK BAY 2', 4100, S3[2], hire('vendor', 'ship2', 'cash2', { options: { ...VAN, capacity: 20, model: makeTruck, path: road(30.0, -11.6) } }), { toast: 'SECOND TRUCK BAY!' }],
  ['belts1', 'FAST BELTS', 4600, S3[3], multi(stat('beltSpeed', { mul: 1.6 }), stat('autoSpeed', { mul: 1.3 }))],
  ['boots2', 'ROCKET BOOTS', 5300, S3[0], stat('speed', { mul: 1.15 })],
  ['stack3', 'GIANT STACK', 5800, S3[1], stat('capacity', { max: 48 })],
  ['price3', 'PREMIUM +35%', 6700, S3[2], stat('priceMult', { mul: 1.35 })],
  ['carhall', 'CAR HALL', 12000, S3[3], multi({ type: 'stage', stage: 4 },
    { type: 'open', stations: ['steeldock', 'press', 'wheeldock', 'line1', 'lot1', 'cash3', 'solid4'] }),
    { big: true, toast: 'CAR HALL OPEN!', focus: { x: 12, z: 30 } }],
  // ---- stage 4: cars
  ['crew2', 'PRESS CREW', 5400, S4[0], multi(hire('hauler', ['steeldock'], ['press'], { options: { look: 'helperB' } }),
    hire('operator', null, 'press', { spot: { x: 7.5, z: 32.6 }, options: { look: 'operator' } })), { toast: 'PRESS CREW HIRED!' }],
  ['crew3', 'PANEL CREW', 5800, S4[1], hire('hauler', ['press'], ['line1'], { options: { look: 'helperC' } }), { toast: 'PANEL CREW HIRED!' }],
  ['crew4', 'WHEEL CREW', 8300, S4[2], hire('hauler', ['wheeldock'], ['line1']), { toast: 'WHEEL CREW HIRED!' }],
  ['packbelt', 'PACK BELT', 9900, S4[3], { type: 'open', stations: ['belt-p'] }, { big: true, toast: 'OVERHEAD PACK BELT!', focus: { x: 6, z: 32 } }],
  ['line1', 'FASTER LINE', 15000, S4[0], stat('lineSpeed', { mul: 1.4 })],
  ['press1', 'FAST PRESS', 24000, S4[1], stat('pressSpeed', { mul: 1.6 })],
  ['dealers', 'DEALERS', 28000, S4[2], stat('carDemand', { mul: 1.6 })],
  ['price4', 'LUXURY +40%', 31000, S4[3], stat('priceMult', { mul: 1.4 })],
  ['auto', 'AUTOMATION', 65000, S4[1], { type: 'stage', stage: 5 }, { big: true, toast: 'ROBOTS ARRIVE!', focus: { x: 18, z: 30 } }],
  // ---- stage 5: automation
  ['agv1', 'AGV', 26000, S4[0], hire('hauler', ['press', 'wheeldock'], ['line1'], { options: { look: 'agv', speed: 7.5, capacity: 24 } }), { toast: 'AGV ONLINE!' }],
  ['welders', 'ROBOT WELDERS', 30000, S4[2], stat('lineSpeed', { mul: 1.5 }), { big: true, toast: 'ROBOT WELDERS!', focus: { x: 12, z: 30 } }],
  ['agv2', 'AGV', 40000, S4[3], hire('hauler', ['steeldock'], ['press'], { options: { look: 'agv', speed: 7.5, capacity: 24 } }), { toast: 'AGV ONLINE!' }],
  ['press2', 'MEGA PRESS', 46000, S4[0], multi(stat('pressSpeed', { mul: 1.6 }), stat('steelRate', { mul: 1.8 }), stat('wheelRate', { mul: 1.8 }))],
  ['paint', 'PAINT SHOP', 52000, S4[1], stat('priceMult', { mul: 1.4 }), { big: true, toast: 'PAINT SHOP!', focus: { x: 15, z: 30 } }],
  ['carriers', 'CAR CARRIERS', 76000, S4[2], stat('carDemand', { mul: 2 })],
  ['line2', 'HYPER LINE', 80000, S4[3], multi(stat('lineSpeed', { mul: 1.5 }), hire('hauler', ['press', 'wheeldock', 'steeldock'], ['line1', 'press'], { options: { look: 'agv', speed: 7.5, capacity: 24 } }))],
  ['autoline2', 'AUTO LINE 2', 110000, S4[0], { type: 'open', stations: ['oredock2', 'belt-a2', 'cell4', 'belt-b2', 'packer4', 'belt-c2', 'solid5'] }, { big: true, toast: 'SECOND AUTO LINE!', focus: { x: 25, z: 8 } }],
  ['solar', 'SOLAR ROOF', 120000, S4[1], stat('priceMult', { mul: 1.3 }), { big: true, toast: 'SOLAR ROOF!', focus: { x: 17, z: 30 } }],
  ['giga', 'GIGAFACTORY', 270000, S4[2], { type: 'win' }, { big: true, toast: 'GIGAFACTORY!' }],
];
const pads = CHAIN.map(([id, label, cost, at, effect, extra], i) => pad(id, label, cost, at, i ? [CHAIN[i - 1][0]] : [], effect, extra));
pads.push(pad('travel', 'WORLD SELECT', 0, S4[1], ['giga'], { type: 'worlds' }, { priceText: 'GO' }));

const item = (id, name, value, geometry, D) => ({ id, name, value, geometry, step: D.step, footprint: { w: D.w, d: D.d }, material: itemGloss });

export default {
  id: 'factory',
  name: 'Volt Works',
  modules: ['../../engine/stations/belt.js', '../../engine/stations/carline.js', '../../engine/stations/solid.js', '../../engine/workers/operator.js'],

  camera: { type: 'perspective', fov: 30, viewPortrait: 16.5, viewLandscape: 13.5, fog: { color: 0xcfe6f5, start: 34, end: 170 } },
  lighting: { background: 0xcfe6f5, shadow: { extent: 24, mapSize: 2048 } },

  assets: [
    'car-kit/van', 'car-kit/truck', 'car-kit/delivery', 'car-kit/truck-flat', 'car-kit/tractor-shovel', 'car-kit/sedan', 'car-kit/suv', 'car-kit/hatchback-sports',
    'car-kit/cone', 'car-kit/wheel-default', 'car-kit/debris-tire',
    'factory-kit/machine', 'factory-kit/machine-window', 'factory-kit/machine-window-bar', 'factory-kit/machine-fortified', 'factory-kit/machine-bed',
    'factory-kit/hopper-round', 'factory-kit/hopper-high-round', 'factory-kit/hopper-square', 'factory-kit/robot-arm-a', 'factory-kit/robot-arm-b',
    'factory-kit/pipe-large', 'factory-kit/pipe-large-long', 'factory-kit/pipe-large-bend', 'factory-kit/pipe-large-valve',
    'factory-kit/screen-small', 'factory-kit/screen-wide', 'factory-kit/screen-hanging-wide', 'factory-kit/screen-panel-wide',
    'factory-kit/scanner-high', 'factory-kit/scanner-low', 'factory-kit/crane', 'factory-kit/crane-magnet',
    'factory-kit/catwalk-straight', 'factory-kit/catwalk-stairs', 'factory-kit/cog-a', 'factory-kit/cog-b',
    'factory-kit/box-large', 'factory-kit/box-small', 'factory-kit/box-wide', 'factory-kit/box-long', 'factory-kit/warning-orange', 'factory-kit/warning-traffic', 'factory-kit/cone',
    'city-kit-industrial/building-a', 'city-kit-industrial/building-c', 'city-kit-industrial/building-e', 'city-kit-industrial/building-h', 'city-kit-industrial/building-l',
    'city-kit-industrial/chimney-large', 'city-kit-industrial/chimney-medium', 'city-kit-industrial/detail-tank-large', 'city-kit-industrial/detail-tank',
    'city-kit-industrial/shipping-container-a', 'city-kit-industrial/shipping-container-b', 'city-kit-industrial/shipping-container-c',
    'city-kit-industrial/solar-panel-landscape-group', 'city-kit-industrial/water-tower', 'city-kit-industrial/windmill',
    'nature-kit/tree_default', 'nature-kit/tree_oak', 'nature-kit/plant_bush', 'nature-kit/plant_bushDetailed', 'nature-kit/rock_smallA', 'nature-kit/rock_largeA',
  ],

  looks: {
    player: worker('animatedmen/Male_Casual', 0xff7a1a, NAVY, 'hardhat', true),
    hauler: worker('animatedwomen/Female_Casual', BLUE, BLUE, 'hardhat-white'),
    helperB: worker('animatedmen/Male_LongSleeve', BLUE, BLUE, 'hardhat-white'),
    helperC: worker('animatedwomen/Female_TankTop', BLUE, NAVY, 'hardhat-white'),
    operator: worker('animatedmen/Male_Shirt', GREEN, GREY, 'hardhat-orange'),
    operatorB: worker('animatedwomen/Female_Alternative', GREEN, GREY, 'hardhat-orange'),
    agv: { make: makeAgv },
    customers: ['hauler'],
  },

  cars: { models: ['car-kit/sedan', 'car-kit/suv', 'car-kit/hatchback-sports'], colors: [0xe4474f, 0x2f8df0, 0xf2b632, 0xf4f6f8], scale: 1.35, max: 40 },

  // the largest bounds: saved positions stay valid; scene.js narrows them to the stage reached
  bounds: { ...BOUNDS[5] },

  player: { start: { x: -2.6, z: 0.5 }, speed: 6.6, capacity: 12, harvestRadius: 1.35, look: 'player', perColumn: 400 },

  stats: { regrow: 7, cellSpeed: 1, benchSpeed: 1, beltSpeed: 1, oreRate: 1, autoSpeed: 1, pressSpeed: 1, lineSpeed: 1, carDemand: 1, steelRate: 1, wheelRate: 1, stage: 1 },

  items: [
    item('scrap', 'Scrap', 0, makeScrapGeometry, SCRAP),
    item('cell', 'Cells', 4, makeCellGeometry, CELL),
    item('pack', 'Battery Packs', 20, makePackGeometry, PACK),
    item('steel', 'Steel', 0, makeSteelGeometry, STEEL),
    item('panel', 'Panels', 30, makePanelGeometry, PANEL),
    item('wheel', 'Wheels', 0, makeWheelGeometry, WHEEL),
  ],

  stations: [
    // ---------------------------------------------------------------- stage 1
    { id: 'yard', type: 'source', name: 'Scrap', item: 'scrap', open: true, grid: YARD,
      plant: makeScrapHeapGeometry, stub: makeSweptGeometry, stubAligned: true, sway: false, plantHeight: 0.6, regrowJitter: 2.5, growTime: 0.5,
      burst: [0xb7653a, 0x8d949e, 0xc9d0d8], action: 'swing', home: { x: -5, z: 2 }, park: { x: -6.5, z: 12.5 }, sound: 'crate' },
    { id: 'cellmaker', type: 'converter', name: 'CELL MAKER', open: true, x: 1.5, z: 5.0,
      recipe: { in: { scrap: 1 }, out: { cell: 1 }, time: 0.4 }, speedStat: 'cellSpeed', inputCap: 24,
      machine: { w: 2.6, d: 2.2, h: 2.2, yaw: 0 }, dropZone: { x: -1.7, z: 5.0, r: 1.35 }, workerSpot: { x: -2.0, z: 3.9 },
      input: { layout: { x: -0.5, z: 5.0, cols: 2, rows: 2 } },
      output: { capacity: 24, zone: { x: 4.7, z: 5.0, r: 1.35 }, layout: { x: 3.4, z: 5.0, cols: 2, rows: 2 } },
      labels: { input: 'SCRAP', output: 'CELLS' }, placeholder: false,
      hints: { drop: 'Feed scrap to the cell maker!', pickup: 'Grab the cells!' } },
    { id: 'bench', type: 'converter', name: 'PACK BENCH', open: true, x: 10.6, z: 5.0,
      recipe: { in: { cell: 2 }, out: { pack: 1 }, time: 1.0 }, speedStat: 'benchSpeed', inputCap: 18,
      machine: { w: 2.4, d: 2.0, h: 1.15, yaw: 0 }, dropZone: { x: 7.7, z: 5.0, r: 1.35 }, workerSpot: { x: 7.7, z: 3.8 },
      input: { layout: { x: 8.9, z: 5.0, cols: 2, rows: 2 } },
      output: { capacity: 18, zone: { x: 10.6, z: 1.8, r: 1.35 }, layout: { x: 10.6, z: 3.3, cols: 3, rows: 1 } },
      labels: { input: 'CELLS', output: 'PACKS' }, placeholder: false,
      hints: { drop: 'Build packs at the bench!', pickup: 'Grab the battery packs!' } },
    { id: 'ship', type: 'pile', name: 'SHIPPING', open: true, x: 10.6, z: -5.2, item: 'pack', capacity: 48, start: 0,
      layout: { x: 10.6, z: -5.3, cols: 3, rows: 2 }, zone: { x: 13.1, z: -6.9, r: 0.55 }, dropZone: { x: 10.6, z: -2.2, r: 1.35 }, workerSpot: { x: 9.0, z: -2.2 },
      idleHint: false, markers: false, pallet: false, hint: 'Ship the packs!' },
    { id: 'cash', type: 'cashpile', name: 'CASH', open: true, cashPile: { x: 5.6, z: -4.6, r: 1.4 }, bundle: 12 },

    // ---------------------------------------------------------------- stage 2
    { id: 'cellmaker2', type: 'converter', name: 'CELL MAKER', open: false, x: 1.5, z: 13.0,
      recipe: { in: { scrap: 1 }, out: { cell: 1 }, time: 0.4 }, speedStat: 'cellSpeed', inputCap: 30,
      machine: { w: 2.6, d: 2.2, h: 2.2, yaw: 0 }, dropZone: { x: -1.7, z: 13.0, r: 1.35 }, workerSpot: { x: -2.0, z: 11.9 }, vehicleSpot: { x: -5.2, z: 13.0 },
      input: { layout: { x: -0.5, z: 13.0, cols: 2, rows: 2 } },
      output: { capacity: 24, zone: { x: 4.7, z: 13.0, r: 1.35 }, layout: { x: 3.4, z: 13.0, cols: 2, rows: 2 } },
      labels: { input: 'SCRAP', output: 'CELLS' }, placeholder: false,
      hints: { drop: 'Feed scrap to the cell maker!', pickup: 'Grab the cells!' } },
    { id: 'bench2', type: 'converter', name: 'PACK BENCH', open: false, x: 10.6, z: 13.0,
      recipe: { in: { cell: 2 }, out: { pack: 1 }, time: 1.0 }, speedStat: 'benchSpeed', inputCap: 18,
      machine: { w: 2.4, d: 2.0, h: 1.15, yaw: 0 }, dropZone: { x: 7.7, z: 13.0, r: 1.35 }, workerSpot: { x: 7.7, z: 11.8 },
      input: { layout: { x: 8.9, z: 13.0, cols: 2, rows: 2 } },
      output: { capacity: 18, zone: { x: 7.7, z: 10.1, r: 1.3 }, layout: { x: 9.6, z: 10.9, cols: 3, rows: 1 } },
      labels: { input: 'CELLS', output: 'PACKS' }, placeholder: false,
      hints: { drop: 'Build packs at the bench!', pickup: 'Grab the battery packs!' } },

    // ---------------------------------------------------------------- stage 3: the auto line
    // ore > belt > cell robot > belt > pack robot > belt along the +x wall down to the truck bay
    { id: 'oredock', type: 'pile', name: 'ORE DOCK', open: false, x: 17.6, z: 16.5, item: 'scrap', capacity: 40, start: 16,
      supply: { item: 'scrap', every: 3, amount: 9, first: 1, stagger: 0.08, rateStat: 'oreRate' },
      layout: { x: 17.6, z: 16.5, cols: 3, rows: 3 }, zone: { x: 17.6, z: 13.4, r: 0.5 }, idleHint: false, markers: false, pallet: false },
    { id: 'belt-a', type: 'belt', name: 'BELT', open: false, path: [[19.4, 16.5], [22.4, 16.5]], kinds: ['scrap'], from: 'oredock', to: 'cell3', speed: 2.6, speedStat: 'beltSpeed', gap: 0.62 },
    { id: 'cell3', type: 'converter', name: 'CELL ROBOT', open: false, x: 24.3, z: 16.5,
      recipe: { in: { scrap: 1 }, out: { cell: 1 }, time: 0.5 }, batch: 2, speedStat: 'autoSpeed', inputCap: 12,
      machine: { w: 2.8, d: 2.4, h: 2.4, yaw: 0 }, dropZone: { x: 24.3, z: 19.2, r: 0.6 }, input: { layout: { x: 24.3, z: 16.5, y: 0.6, cols: 1, rows: 1, maxDrawn: 1 } },
      outputTo: 'belt-b', manual: false, placeholder: false, markers: false },
    { id: 'belt-b', type: 'belt', name: 'BELT', open: false, path: [[26.0, 16.5], [28.8, 16.5]], kinds: ['cell'], to: 'packer3', speed: 2.6, speedStat: 'beltSpeed', gap: 0.5 },
    { id: 'packer3', type: 'converter', name: 'PACK ROBOT', open: false, x: 30.7, z: 16.5,
      recipe: { in: { cell: 2 }, out: { pack: 1 }, time: 0.8 }, batch: 1, speedStat: 'autoSpeed', inputCap: 12,
      machine: { w: 2.8, d: 2.4, h: 2.4, yaw: 0 }, dropZone: { x: 30.7, z: 19.2, r: 0.6 }, input: { layout: { x: 30.7, z: 16.5, y: 0.6, cols: 1, rows: 1, maxDrawn: 1 } },
      outputTo: 'belt-c', manual: false, placeholder: false, markers: false },
    { id: 'belt-c', type: 'belt', name: 'BELT', open: false, path: [[32.4, 16.5], [34.5, 16.5], [34.5, -2.9]], kinds: ['pack'], to: 'ship2', speed: 2.6, speedStat: 'beltSpeed', gap: 0.95 },
    { id: 'ship2', type: 'pile', name: 'SHIPPING 2', open: false, x: 34.5, z: -4.4, item: 'pack', capacity: 60, start: 0,
      layout: { x: 34.3, z: -4.4, cols: 2, rows: 2 }, zone: { x: 31.6, z: -4.6, r: 1.2 }, label: 'PACKS', idleHint: false, pallet: false,
      hint: 'Battery packs are stacked at shipping!' },
    { id: 'cash2', type: 'cashpile', name: 'CASH', open: false, cashPile: { x: 26.4, z: -4.6, r: 1.4 }, bundle: 60 },
    { id: 'solid3', type: 'solid', open: false, blockers: [{ x: 17.6, z: 16.6, hx: 1.7, hz: 1.8 }, { x: 32.2, z: -6.6, r: 0.5 }] },
    // the second auto line (stage 5), parallel to the first
    { id: 'oredock2', type: 'pile', name: 'ORE DOCK', open: false, x: 17.6, z: 8.2, item: 'scrap', capacity: 40, start: 16,
      supply: { item: 'scrap', every: 3, amount: 9, first: 1, stagger: 0.08, rateStat: 'oreRate' },
      layout: { x: 17.6, z: 8.2, cols: 3, rows: 3 }, zone: { x: 17.6, z: 5.2, r: 0.5 }, idleHint: false, markers: false, pallet: false },
    { id: 'belt-a2', type: 'belt', name: 'BELT', open: false, path: [[19.4, 8.2], [22.4, 8.2]], kinds: ['scrap'], from: 'oredock2', to: 'cell4', speed: 2.6, speedStat: 'beltSpeed', gap: 0.62 },
    { id: 'cell4', type: 'converter', name: 'CELL ROBOT', open: false, x: 24.3, z: 8.2,
      recipe: { in: { scrap: 1 }, out: { cell: 1 }, time: 0.5 }, batch: 2, speedStat: 'autoSpeed', inputCap: 12,
      machine: { w: 2.8, d: 2.4, h: 2.4, yaw: 0 }, dropZone: { x: 24.3, z: 10.8, r: 0.5 }, input: { layout: { x: 24.3, z: 8.2, y: 0.6, cols: 1, rows: 1, maxDrawn: 1 } },
      outputTo: 'belt-b2', manual: false, placeholder: false, markers: false },
    { id: 'belt-b2', type: 'belt', name: 'BELT', open: false, path: [[26.0, 8.2], [28.8, 8.2]], kinds: ['cell'], to: 'packer4', speed: 2.6, speedStat: 'beltSpeed', gap: 0.5 },
    { id: 'packer4', type: 'converter', name: 'PACK ROBOT', open: false, x: 30.7, z: 8.2,
      recipe: { in: { cell: 2 }, out: { pack: 1 }, time: 0.8 }, batch: 1, speedStat: 'autoSpeed', inputCap: 12,
      machine: { w: 2.8, d: 2.4, h: 2.4, yaw: 0 }, dropZone: { x: 30.7, z: 10.8, r: 0.5 }, input: { layout: { x: 30.7, z: 8.2, y: 0.6, cols: 1, rows: 1, maxDrawn: 1 } },
      outputTo: 'belt-c2', manual: false, placeholder: false, markers: false },
    { id: 'belt-c2', type: 'belt', name: 'BELT', open: false, path: [[32.4, 8.2], [33.4, 8.2], [33.4, -2.9]], kinds: ['pack'], to: 'ship2', speed: 2.6, speedStat: 'beltSpeed', gap: 0.95 },
    { id: 'solid5', type: 'solid', open: false, blockers: [{ x: 17.6, z: 8.3, hx: 1.7, hz: 1.8 }] },

    // ---------------------------------------------------------------- stage 4: cars
    { id: 'steeldock', type: 'pile', name: 'STEEL DOCK', open: false, x: 13.6, z: 35.0, item: 'steel', capacity: 36, start: 12,
      supply: { item: 'steel', every: 3, amount: 8, first: 1, stagger: 0.1, rateStat: 'steelRate' },
      layout: { x: 13.6, z: 35.2, cols: 3, rows: 2 }, zone: { x: 13.6, z: 32.8, r: 1.25 }, label: 'STEEL', pallet: false, hint: 'Grab steel coils!' },
    { id: 'press', type: 'converter', name: 'PRESS', open: false, x: 7.5, z: 34.6,
      recipe: { in: { steel: 2 }, out: { panel: 1 }, time: 1.65 }, speedStat: 'pressSpeed', inputCap: 16,
      machine: { w: 2.8, d: 2.4, h: 3.0, yaw: 0 }, dropZone: { x: 10.6, z: 34.2, r: 1.25 }, workerSpot: { x: 10.6, z: 33.2 },
      input: { layout: { x: 9.5, z: 35.6, cols: 2, rows: 1 } },
      output: { capacity: 18, zone: { x: 4.2, z: 34.2, r: 1.25 }, layout: { x: 5.3, z: 35.6, cols: 2, rows: 1 } },
      labels: { input: 'STEEL', output: 'PANELS' }, placeholder: false,
      hints: { drop: 'Feed steel to the press!', pickup: 'Grab the body panels!' } },
    { id: 'wheeldock', type: 'pile', name: 'WHEELS', open: false, x: 0.4, z: 25.0, item: 'wheel', capacity: 40, start: 16,
      supply: { item: 'wheel', every: 3, amount: 8, first: 1, stagger: 0.1, rateStat: 'wheelRate' },
      layout: { x: 0.2, z: 24.6, cols: 2, rows: 3 }, zone: { x: 2.6, z: 25.8, r: 1.2 }, label: 'WHEELS', pallet: false, hint: 'Grab wheels!' },
    { id: 'line1', type: 'line', name: 'CAR LINE', open: false,
      recipe: { in: { panel: 2, pack: 2, wheel: 4 }, time: 16 }, speedStat: 'lineSpeed', path: LINE, stages: 4, show: { primer: 0, paint: 1, wheels: 3 },
      inputCap: 3, dropZone: { x: 0.7, z: 30.0, r: 1.6 }, workerSpot: { x: 0.7, z: 31.3 },
      bay: { layout: { x: 3.7, z: 30.0, cols: 3, rows: 2 } }, lot: 'lot1', label: 'PARTS', placeholder: true,
      hint: 'Bring panels, packs and wheels to the car line!' },
    { id: 'lot1', type: 'lot', name: 'CAR LOT', open: false, grid: LOT, cash: 'cash3', value: 700, sellEvery: 2.2, first: 3, rateStat: 'carDemand', speed: 7,
      exit: [{ x: 51.5, z: 30 }, { x: 51.5, z: ROAD_Z }, { x: 90, z: ROAD_Z }] },
    { id: 'solid4', type: 'solid', open: false, blockers: [{ x: 13.6, z: 35.5, hx: 1.8, hz: 0.9 }, { x: 0.1, z: 24.6, hx: 1.0, hz: 1.5 }] },
    { id: 'cash3', type: 'cashpile', name: 'CASH', open: false, cashPile: { x: 32.6, z: 24.6, r: 1.5 }, bundle: 700 },
    { id: 'belt-p', type: 'belt', name: 'PACK BELT', open: false, overhead: true, y: 3.0,
      path: [[34.5, -5.9], [35.35, -5.9], [35.35, 36.25], [0.5, 36.25], [0.5, 31.3], [2.4, 31.3]], kinds: ['pack'], from: 'ship2', to: 'line1', speed: 3.2, speedStat: 'beltSpeed', gap: 1.1 },
  ],

  // helpers that are there from the start (no pad): the van that buys the packs
  hires: [
    { id: 'van0', role: 'vendor', from: 'ship', to: 'cash', options: { ...VAN, first: 3, model: makeVan, path: road(11.6) } },
  ],

  workers: {
    hauler: { look: 'hauler', speed: 5.2, capacity: 12 },
    harvester: { model: makeSweeper, speed: 5.5, capacity: 40, harvestRadius: 1.7 },
    operator: { look: 'operator' },
    vendor: { speed: 9, loadInterval: 0.07, patience: 2 },
  },

  pads,

  hints: {
    harvest: 'Sweep up the scrap!',
    pickup: 'Pick up {name}!',
    drop: 'Bring it to {name}',
    cash: 'Grab your cash!',
    buy: 'Buy: {label}',
    travel: 'Back to the Flower Farm!',
  },

  finale: { pad: 'giga', focus: { x: 17, z: 15, w: 34, d: 40 } },

  // the test bot delivers what it carries before gathering more (production is a chain here)
  autoplay: { chain: true },

  // stage bar and production counters (engine/hud.js)
  hud: {
    stages: ['GARAGE', 'WORKSHOP', 'ASSEMBLY LINE', 'CAR PLANT', 'GIGAFACTORY'], stageStat: 'stage',
    rates: [
      { label: 'PACKS', color: '#7fe9ff', total: (G) => { let n = 0; const l = G.workers ? G.workers.list : []; for (let i = 0; i < l.length; i++) if (l[i].role === 'vendor') n += l[i].totalItems || 0; return n; } },
      { label: 'CARS', color: '#ffd23f', show: (G) => !!(G.stations.get('lot1') || {}).active, total: (G) => (G.stations.get('lot1') || {}).sold || 0 },
    ],
  },

  layout: { roadZ: ROAD_Z, yard: YARD, floors: FLOORS, hall: HALL, bounds: BOUNDS, zoom: ZOOM, line: LINE, lot: LOT },
};
