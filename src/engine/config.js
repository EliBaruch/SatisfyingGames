// Engine-wide defaults. Pure data and pure helpers: no THREE import, no DOM access.
// A world definition can override most of these (see docs/ENGINE.md, "World definition").
// World units: 1 unit ~ 1 metre. Y is up, the ground is the XZ plane at y = 0.

export const GAME = {
  name: 'Bloom Rush',
  saveKey: 'bloomrush.save.v2',
  legacySaveKey: 'bloomrush.save.v1',
  muteKey: 'bloomrush.muted',
  saveVersion: 2,
  defaultWorld: 'flower',
};

export const STEP = 1 / 60;       // fixed simulation step
export const MAX_STEPS = 40;      // per rendered frame

// Player defaults (world.player overrides any of these).
export const PLAYER = {
  speed: 6.5,            // units / second (before upgrades and perks)
  capacity: 25,          // items carried (before upgrades and perks)
  harvestRadius: 1.25,   // harvest-area items within this distance are picked up
  radius: 0.45,          // collision radius against station blockers
  start: { x: 0, z: 0 },
  unloadInterval: 0.035, // seconds between items when unloading into a drop zone
  unloadTime: 1.3,       // a full stack empties in about this long (batching)
  pickupInterval: 0.06,  // seconds between items taken from a pickup zone
  perColumn: 40,         // items per stack column on the player's back
  look: 'player',        // key into LOOKS (chars.js) or a look object
};

// Built-in shop serving / pile defaults (a shop station def can override).
export const SHOP = {
  queueSlots: 6,
  extraLine: 3,          // customers queued beyond the marked queue slots
  customerSpeed: 5.5,
  customerPool: 14,
  serve: {
    self: { interval: 0.30, batch: 3 },     // player standing in the drop zone, no cashier
    staffed: { interval: 0.25, batch: 5 },  // a cashier is hired for this shop
  },
  maxVisibleStock: 120,
  stockPerColumn: 20,
  maxVisibleBills: 36,
  collectTime: 0.6,      // a cash pile empties into the player in about this long
};

// Worker role defaults (world.workers.<role> overrides).
export const WORKERS = {
  hauler: { speed: 4.2, capacity: 10, harvestRadius: 0.95, unloadInterval: 0.06, pickupInterval: 0.08, look: 'cutter', action: 'swing' },
  harvester: { speed: 5.0, capacity: 60, harvestRadius: 1.7, unloadInterval: 0.02, colors: [0xe53935, 0x1e88e5, 0xfb8c00, 0x8e24aa] },
  cashier: { look: 'cashier' },
};

export const PAD = {
  radius: 1.3,           // player within this distance pays into the pad
  size: 2.4,             // drawn square size
  payTime: 1.1,          // an affordable pad fills in about this many seconds
  lift: 0.03,            // pads are drawn this far above the ground (clears paving and decals)
};

export const CAMERA = {
  // Orthographic isometric camera. With this offset:
  //   screen-right = world (-x, +z) / sqrt2      screen-up = world (+x, +z) / sqrt2
  offset: { x: -14, y: 18, z: -14 },
  viewPortrait: 23.5,    // vertical world units visible when aspect < 1
  viewLandscape: 17,     // vertical world units visible when aspect >= 1
  lerp: 6,
};

// Permanent perk for finishing a world (world.finale.perk overrides).
export const PERK = { speedMul: 1.08, capacityAdd: 10 };

// Default hint texts ({name}, {label} are substituted). world.hints overrides.
export const HINTS = {
  harvest: 'Collect the {name}!',
  pickup: 'Pick up {name}!',
  drop: 'Bring it to {name}',
  cash: 'Grab your cash!',
  buy: 'Buy: {label}',
};

/** 950 -> "950", 1500 -> "1.5K", 400000 -> "400K", 1250000 -> "1.25M", 3.2e9 -> "3.2B", 5e12 -> "5T" */
export function fmtMoney(n) {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  const units = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];
  for (const [u, v] of units) {
    if (n >= v) {
      const x = n / v;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return (s.includes('.') ? s.replace(/\.?0+$/, '') : s) + u;
    }
  }
  return String(n);
}
