# Bloom Rush engine

How the multi-world engine works and how to build a world or a new mechanic on it.
Read this together with `BRIEF.md` (conventions) and `docs/ART.md` (models and materials).
The flower farm (`src/worlds/flower/`) is the worked example throughout.

## 1. Layout

```
index.html, styles.css        page, HUD markup, overlays (import map: "three", "addons")
src/main.js                   boot: pick world, load it, build the engine, run the loop
src/autoplay.js               test bot (?autoplay), plays through station capabilities (harvest, pickup, drop, serve, cash)
src/engine/
  config.js                   engine defaults (player, shop, workers, pads, camera, perk, hint texts), fmtMoney
  registry.js                 registerItem / registerStationType / registerWorkerRole / registerPadEffect
  worlds.js                   the list of worlds: id, name, order, unlockedBy
  save.js                     save v2, v1 migration, per-world sanitising
  stats.js                    computeStats: world + bought pads + perks -> G.stats
  pad-effects.js              built-in pad effects: open, hire, stat, win, travel
  pads.js                     purchase pads (drawing, paying, onDone hooks)
  items.js                    built-in item 'cash', itemGeometry / itemMaterial / itemValue
  stack.js                    carried tower of items (any registered kinds, mixed)
  transfer.js                 flyToStack / flyToDrop / inZone: allocation-free item moves
  player.js                   movement + generic loop over station capabilities
  stations/index.js           G.stations (built-ins: source.js, shop.js; pile, converter, trough, shelf,
                              checkout, cashpile; opt-in: belt, carline, solid, herd: see docs/STATIONS.md)
  workers/index.js            G.workers (built-ins: hauler.js (+ hauler-multi.js), harvester.js, cashier.js, vendor.js)
  hints.js, level.js, lights.js, view.js, hud.js, input.js, fx.js, audio.js, events.js
  thrills/                    events, fever, stars and perks on top of the core loop (section 13)
  geom.js                     re-exports Parts / mergeParts / meshOf / getSharedMaterial from the art kit; geo, rng
  decals.js                   scene helpers: SELL / cash zone decals (art kit zones), signs, canvas textures
  chars.js                    characters and vehicles for the engine and worlds: art-kit characters, looks,
                              hats, blob shadows, LOD, default tractor (see section 10)
  art/                        art kit (owned by the art-kit agent, see docs/ART.md)
src/worlds/<id>/world.js      world definition (data, default export)
src/worlds/<id>/scene.js      export createScene(G): scenery and per-station furniture
src/worlds/<id>/models.js     the world's model factories
```

## 2. Boot sequence and the G object

`main.js`, in order:

1. `loadSave()` (v2, else migrated v1, else fresh).
2. World id = `?world=<id>`, else `save.level`, else `'flower'`. A world that is not unlocked for this
   save (`isUnlocked(id, save.meta)`) falls back to `save.level` if that is unlocked, else `flower`;
   the dev override `?world=<id>&unlock=1` skips the check. Ids not in `worlds.js`, or worlds whose
   folder fails to import, fall back to `flower` with a `console.error` (never a page error).
3. `import('./worlds/<id>/world.js')`, then every entry of `def.modules` (relative to world.js), then
   `scene.js` (or `def.scene`; `scene: false` = no scenery, bare ground).
3b. Assets: `def.looks` is merged into `LOOKS`; the art kit preloads `def.assets` (model ids like
   `'farmbuildings/Barn'`) and every character model the world's looks need (player, hauler, cashier,
   customers). Progress is `G.loading` (0..1) and the `G.events` `'loading'` event; the title overlay's
   "tap" line shows `LOADING n%` meanwhile. A missing model never blocks boot (placeholder box + one warning),
   and neither does a stalled one: each preload is raced against a 12 s timeout, after which the game
   starts with the placeholder and the art kit swaps the model in if it arrives later.
4. Normalise the def (`pads[].at` -> `pads[].pos {x,z}`), `registerItem()` each `def.items` entry.
5. Build `G`; `G.state = sanitizeLevel(def, save.levels[id])`; `G.stats = computeStats(...)`.
6. Create, in this order: audio (`audio.setWorld(id)`), fx, input, hud -> blob shadows (`G.blobs`) -> lights -> **stations** (+ `sync`) -> **pads** ->
   **scene** (`createScene(G)`) -> **player** -> **workers** (+ `sync`) -> hints -> level.
7. Save once, start the loop, emit `'ready'`; `?autoplay` imports the bot.

| G field | what | available from |
|---|---|---|
| `THREE, scene, camera, renderer` | three.js objects (orthographic iso camera) | start |
| `view` | `glideTo(x, z, dur)` camera glide | start |
| `world`, `worldId` | the normalised definition, its id | start |
| `worlds, worldInfo(id), isUnlocked(id, meta), nextWorld(id)` | world list helpers | start |
| `save`, `meta` | whole save object, `save.meta` | start |
| `state` | this world's level state (money, done, paid, ...) | start |
| `stats` | derived stats (section 7) - replaced, never mutated, on refresh | start |
| `time`, `timeScale` | sim seconds; sim speed (`?speed=`) | start |
| `events` | bus: `on(name, fn)`, `off`, `emit` | start |
| `addMoney(n)`, `spend(n)` | the only way to change money | start |
| `audio, fx, input, hud` | always present (no-op fallbacks if a module failed) | before stations |
| `lights` | `{ hemi, sun, fill, follow(x, z) }` (art kit lights; `view.frame` calls `follow` every frame) | before stations |
| `blobs` | art-kit blob shadows: `attach(obj, r)`, `detach`; updated by `view.frame` (characters attach automatically) | before stations |
| `stations` | `get(id)`, `list`, `onOpen(id, fn)`, `activationOrder` | **in createScene** |
| `pads` | `get(id)`, `next()`, `remaining(pad)`, `visible()`, `onDone(id, fn)` | **in createScene** |
| `scenery` | what createScene returned | after scene |
| `player` | `pos, vel, stack, speed01, dropStation, pickupStation, action` | after scene (use lazily) |
| `workers` | `list` | after player |
| `hints` | `current {kind, text, x, z, target}`, `compute()` | after workers |
| `thrills` | events, fever, perks (section 13); `null` with `?nothrills` or `world.thrills.off` | before player |
| `refresh(live)`, `saveNow()`, `travel(id)`, `replay(id)`, `step(dt)` | see sections 7, 9, 11 | ready |

`window.__game === G`.

## 3. World definition (`world.js`)

```js
export default {
  id: 'flower', name: 'Flower Farm',          // id = folder name = save key
  modules: ['../../engine/stations/pile.js'], // extra modules (registrations) loaded before anything is built
  scene: './scene.js',                         // default; false = none
  assets: ['farmbuildings/Barn', 'nature-kit/tree_oak'],   // pack models to preload (docs/ART.md section 11 lists ids)
  looks: { player: { model: 'male-b', tool: 'scythe', hat: 'straw' }, hauler: 'cutter', cashier: 'cashier',
           customers: ['female-a', 'male-d'] },   // see section 10; every entry optional
  lighting: { variant: 'outdoor',               // all optional, see engine/lights.js: 'outdoor' | 'indoor' (art kit LIGHTING),
    background: 0x9fdcff,                       // background, hemi / sun / fill overrides in the art kit's format,
    tint: 0xffe6c0, tintAmount: 0.2 },          // shadow: { extent, mapSize }, shadows: false, tint toward a colour
  camera: { viewPortrait: 23.5, viewLandscape: 17 },   // optional overrides of engine CAMERA
  bounds: { minX: -15, maxX: 53, minZ: -18, maxZ: 54 },  // player is clamped to this
  player: { start: { x: 2.5, z: 5.5 }, speed: 6.5, capacity: 25, harvestRadius: 1.25, look: 'player' },
  stats: { regrow: 6 },                        // world-specific base stats, readable as G.stats.regrow
  items: [ { id: 'rose', name: 'Roses', value: 4, geometry: () => makeBouquetGeometry('rose'),
             step: 0.235, footprint: { w: 0.95, d: 0.42 } }, ... ],          // section 5
  stations: [ { id: 'roses', type: 'source', open: true, ... }, ... ],      // section 4
  workers: { hauler: { look: 'cutter', speed: 4.2, capacity: 10 }, harvester: { colors: [...] } },
  pads: [ { id: 'cashier0', label: 'CASHIER', cost: 60, at: [6, -4.3], requires: [],
            effect: { type: 'hire', role: 'cashier', to: 'shop-roses' },
            big: false, toast: 'CASHIER HIRED!', focus: {x, z}, priceText: 'GO' }, ... ],
  hints: { harvest: 'Cut the {name}!', drop: 'Bring flowers to SELL', cash: 'Grab your cash!',
           buy: 'Buy: {label}', pickup: 'Pick up {name}!', travel: 'Next: the Chicken Farm!' },
  finale: { pad: 'greenhouse', focus: { x: 38, z: 40, w: 10, d: 8 }, next: 'chicken',
            perk: { speedMul: 1.08, capacityAdd: 10 } },      // perk optional (engine default)
  layout: { ... },                             // free-form scene-only data; the engine ignores it
  migrateV1(old) { ... },                      // flower only: v1 save -> level state
};
```

Optional top-level keys used by the factory world (`src/worlds/factory/world.js`), all opt-in:

| key | what |
|---|---|
| `camera: { type: 'perspective', fov: 30, zoom, fog: { color, start, end } }` | a narrow-angle perspective camera along the same direction as the orthographic one (the input mapping does not change). `viewPortrait` / `viewLandscape` are the world units visible vertically at the focus point. `G.view.setZoom(z, seconds)` eases a zoom factor on the view size (both camera types); `G.view.zoom`, `G.view.viewSize` read it. `fog` distances are measured from the focus point outward. |
| `hires: [{ id, role, from, to, options }]` | helpers that exist from the start, without a pad (a van that buys from day one). Folded like a bought `hire` pad whose id is `id`. |
| `hud: { stages: [names], stageStat: 'stage', rates: [{ label, total(G), show(G), color }] }` | a stage bar (`G.stats[stageStat]` of `stages.length`) and production chips showing each `total`'s rate per minute. |
| `cars: { models, colors, scale, primer, max }` | the vehicle pool of the `line` / `lot` stations (docs/STATIONS.md). |
| `autoplay: { chain: true }` | the test bot delivers what it carries before gathering more and feeds the newest stations first (worlds whose production is a chain). |
| `player.perColumn` | items per column of the carried stack (the human rig carries one tall column in front: set it high). |
| `stats.harvestRadius` | the player's reach as a stat (wins over `player.harvestRadius`), so a `stat` pad can raise it (the frost world's axes). |

Rules: string ids everywhere; positions are `{x, z}` (pads may use `at: [x, z]`); a world starts
with zero money; pads form a chain through `requires` (a pad shows once all of them are bought).
`world.js` may import its own `models.js` for geometry factories, and may compute positions with
small helpers (the flower world mirrors plot-local coordinates with `L(plot, lx, lz)`).

Flower world summary: 3 plots, each `source` (`roses`) + `shop` (`shop-roses`); pads `cashier0`
-> cutters -> upgrades -> `tractor0` -> `farm1` (`open` tulips) -> ... -> `greenhouse` (`win`) ->
`travel` (free, appears after the win). Bot time to win: about 6:10.

## 4. Stations

A station is created by its registered type from a def entry and has this interface:

```js
{
  id, type, def, name,          // set by the container (def = the world entry)
  pos: { x, z },                // used by hints, camera glides, scenes
  active: false,                // set true by the container right after activate()
  activate(live) {},            // show meshes; live=true means "just bought": animate in
  update(dt) {},                // called every step even when inactive: return early if !this.active
  serialize() {}, restore(d) {},// optional: saved under levels.<world>.stations.<id>; restore()
                                // runs before activate() and must validate its input
  blockers: [{ x, z, hx, hz } | { x, z, r }],  // optional solid boxes / circles (only while active)
  // capabilities, all optional:
  harvest, pickup, drop, cash,
}
```

Capabilities (the player, workers, hints and the bot use only these):

| capability | fields | player behaviour |
|---|---|---|
| **harvest** area | `kind, bounds {minX..maxZ}, spacing, total, available, action`, `harvestAt(x, z, r, max, onItem(kind, x, z, data), data) -> n`, `hasNear(x, z, r)`, `nearest(x, z, out) -> bool` | walking through harvests within `player.harvestRadius`; MAX popup when full |
| **pickup** zone | `zone {x, z, r}`, `take(accept|null) -> kind|null`, `from(out: Vector3) -> out`, optional `interval`, `action`, `available`, `accepts(kind)`, `backRoom(kind)`, `expectBack(kind)`, `giveBack(kind)` | standing in the zone takes one item per `pickupInterval` while there is room, and only kinds that some other open drop zone still has room for beyond what the player already carries of that kind (a shop's room is unlimited; feed is taken only as the troughs need it). Surplus of a kind the zone holds (carried beyond what the open drop zones can take) is handed back while standing there; items no open drop zone accepts, no pickup holds and no harvest area grows are dropped |
| **drop** zone | `zone {x, z, r}`, `accepts(kind) -> bool`, `room() -> n`, `target(out) -> out`, `expect(kind)`, `give(kind)`, optional `face {x,z}`, `workerSpot`, `vehicleSpot`, `sound` | standing in the zone unloads the topmost accepted items (a full stack in ~1.3 s) |
| **cash** pile | `pile {x, z, r}`, `amount`, `take(max) -> n`, optional `top(out)`, `bundleValue()` | walking over it vacuums the cash in ~0.6 s with flying bills and a +$ popup |

Contract for item hand-over: the giver pops the item, calls `drop.expect(kind)` at launch and
`drop.give(kind)` on landing (`transfer.flyToDrop` does both). Items in flight toward a drop zone
must be counted in its `serialize()` (the shop saves `pending` as stock). Items flying toward a
stack are counted per kind in `stack.inbound`; `stack.snapshot()` (carried + inbound) is what the
player and workers save.
`accepts` must be a pre-built function (it is called every step); same for `onItem` callbacks.

### Built-in `source` (harvest area)

Grid that regrows: `item`, `grid {x0, z0, dx, dz, cols, rows}` (dx/dz may be negative),
`plant()`/`stub()` geometry factories, `plantHeight`, `sway`, `regrowStat` (`'regrow'` -> G.stats),
`regrowJitter`, `growTime`, `regrowRate(G, station) -> multiplier` (e.g. feed trough), `burst`
colours, `action` (`'swing'`), `home` (where hired walkers appear), `park` (vehicle park), `sound`.

### Built-in `shop` (drop zone + cash pile)

Counter with stock, a customer queue and a cash pile: `accepts` (`[...]` or `'*'`), `display`
(kind drawn on the counter / in hands), `counter {x, z, yaw, len, depth, h}` (local +X = customer
side), `dropZone`, `cashPile`, `queue [{x,z}]` (queue[0] is served), `customerIn` (last point =
where customers join), `customerOut`, `cashierSpot`, `workerSpot`, `vehicleSpot`, `stockColumns`,
`serve {self, staffed}`, `staffRole` (default `'cashier'`). It serves while the player stands in
its drop zone, or always once `G.stats.staff[id].cashier` is set. Each item keeps its own value
(`stock` + `value` are saved). Emits `'sale' { station, stationId, amount }` (payload object is
reused: read it, do not keep it).

### Adding a station type (complete example: `pile`)

`src/engine/stations/pile.js` (or any file; this exact code runs in `dev/engine-core/pileworld/`):

```js
import * as THREE from 'three';
import { registerStationType, getItem } from '../registry.js';
import { itemGeometry, itemMaterial } from '../items.js';

registerStationType('pile', {
  create(G, def) {
    const it = getItem(def.item);
    const max = def.max ?? 24, refill = def.refill ?? 2;      // items, items per second
    const T = { count: def.start ?? max, acc: 0 };            // numbers on an object: no per-step allocation
    let dirty = true;
    const mesh = new THREE.InstancedMesh(itemGeometry(it), itemMaterial(it), max);   // one draw call
    mesh.castShadow = true;
    mesh.visible = false;
    G.scene.add(mesh);
    const m = new THREE.Matrix4(), tmp = new THREE.Vector3();
    const slot = (i, out) => out.set(def.x + ((i % 4) % 2 - 0.5), ((i / 4) | 0) * it.step, def.z + (((i % 4) / 2 | 0) - 0.5) * 0.6);
    const station = {
      pos: { x: def.x, z: def.z },
      pickup: {
        zone: { x: def.x, z: def.z, r: def.r ?? 1.8 },
        get available() { return T.count; },
        take(accept) {                                         // accept: null (player) or drop.accepts (hauler)
          if (T.count <= 0 || (accept && !accept(def.item))) return null;
          T.count--; dirty = true;
          return def.item;
        },
        from(out) { return slot(Math.max(0, T.count), out).setY(out.y + 0.3); },
      },
      activate() { mesh.visible = true; },
      update(dt) {
        if (!station.active) return;
        if (T.count < max) { T.acc += refill * dt; while (T.acc >= 1 && T.count < max) { T.acc -= 1; T.count++; dirty = true; } }
        if (!dirty) return;
        dirty = false;
        for (let i = 0; i < T.count; i++) mesh.setMatrixAt(i, m.makeTranslation(slot(i, tmp)));
        mesh.count = T.count;
        mesh.instanceMatrix.needsUpdate = true;
      },
      serialize() { return { count: T.count }; },
      restore(d) { if (d && Number.isFinite(d.count)) T.count = Math.max(0, Math.min(max, d.count | 0)); },
    };
    return station;
  },
});
```

Use it from a world - no engine file changes:

```js
export default {
  id: 'grocery', modules: ['../../engine/stations/pile.js'],   // path relative to this world.js
  items: [{ id: 'crate', name: 'Crates', value: 7, geometry: makeCrate, step: 0.5, footprint: { w: 0.8, d: 0.6 } }],
  stations: [
    { id: 'dock', type: 'pile', item: 'crate', x: -6, z: -4, max: 24, refill: 3, open: true },
    { id: 'stand', type: 'shop', accepts: ['crate'], display: 'crate', open: true, ... },
  ],
  pads: [{ id: 'porter', label: 'HIRE PORTER', cost: 20, at: [0, 6],
           effect: { type: 'hire', role: 'hauler', from: 'dock', to: 'stand' } }],
  hints: { pickup: 'Grab crates at the {name}!' },
};
```

What then happens: the player standing in the dock zone fills his stack, the hint switches to the
shop when he carries enough, unloading at the shop's drop zone sells the crates; the `porter`
hauler walks to the dock (pickup mode: `take(stand.drop.accepts)`), carries a stack to the shop's
`workerSpot` and unloads; `{ count }` is saved under `levels.grocery.stations.dock`. A scene adds
the dock's furniture with `G.stations.onOpen('dock', live => ...)` reading `G.stations.get('dock').def`.

## 5. Items, the stack, flying items

`registerItem({ id, name, value, geometry, material?, step, footprint {w, d}, flyScale })`.
World items are registered from `def.items` at boot; `'cash'` (money bundle) is built in.
Geometry: origin at the bottom centre, lying in the XZ plane, long axis X; vertex colours are
expected by the shared material unless `material` is given. Resolve with `itemGeometry(kind)`,
`itemMaterial(kind)`, `itemValue(kind)` (`engine/items.js`).

`createStack(G, { parent, offset, capacity, perColumn, sway, billboard, billboardOffset })`:
`push(kind) -> bool`, `pop() -> kind|null`, `popWhere(pred) -> kind|null` (topmost match),
`countWhere(pred)`, `has(pred)`, `topWorld(out)` (where the next item lands), `setCapacity(n)`,
`update(dt, speed01)`, `items` (kinds, bottom -> top), `count`, `room` (capacity - count -
`incoming`), `incoming` (items in flight toward it), `onLand(kind)` (optional hook).
One InstancedMesh per kind present; mixed kinds stack with their own `step`.

`G.fx.fly({ kind, from, to, dur, arc, delay, onDone, data })`: one pooled InstancedMesh per kind.
`from` is copied; `to` is `{x,y,z}` (copied) or `function(out, data) -> out` (re-evaluated each
step); `onDone(data, kind)` on landing. Reuse your options object and pre-built functions.
Prefer `transfer.js`: `flyToStack(G, stack, kind, x, y, z, delay)` and
`flyToDrop(G, stack, station, kind, delay)` (after popping).

## 6. Worker roles

`G.stats.hires` (from `hire` pads) are spawned by `G.workers.sync()` through the registered role:

| role | hire effect | does |
|---|---|---|
| `hauler` | `{ role: 'hauler', from, to, home?, spot?, options? }` | `from` harvest area: harvests in its own band (haulers on one station split it); else `from` pickup zone: takes items `to` accepts. Carries a stack to `to.drop.workerSpot`, unloads. `from` / `to` may be **lists** of station ids: then it picks the source with what a target has room for and the target with the most room (docs/STATIONS.md). |
| `harvester` | `{ role: 'harvester', from, to, park?, spot?, color?, options? }` | vehicle driving lanes over `from.harvest.bounds`, unloads at `to.drop.vehicleSpot`. Model: `world.workers.harvester.model(color)` else `chars.makeTractor`. |
| `cashier` | `{ role: 'cashier', to, spot? }` | decorative, stands at `to.staffSpot`, waves on that shop's sales; the shop serves on its own. |
| `vendor` | `{ role: 'vendor', from, to, options: { path, capacity, every, ... } }` | vehicle that arrives on a schedule, buys up to N items from `from`'s pickup zone and pays onto `to`'s cash pile (docs/STATIONS.md). |

Config merge: `engine/config.js WORKERS[role]` < `world.workers[role]` < `effect.options`.

Saving: a role may give its worker `serialize() -> data` and `restore(data)`. `G.workers.serialize()`
stores them under `levels.<world>.workers.<hirePadId>` and each is restored right after that pad's
worker is created at boot. The built-in carrying roles save `{ items: stack.snapshot(), x, z, ... }`:
haulers resume delivering, a harvester drives to its drop spot, a vendor resumes its visit (its load
is already paid for).

Adding a role, in its own file listed in a world's `modules`:

```js
import { registerWorkerRole } from '../registry.js';     // path from src/engine/workers/
import { makeCharacter, animateCharacter, LOOKS } from '../chars.js';
registerWorkerRole('sweeper', {
  toast: 'SWEEPER HIRED!',
  focus: (G, effect) => G.stations.get(effect.to).pos,     // optional camera target
  create(G, hire, team, live) {        // hire = { role, from, to, pad, n, effect }; team includes this worker
    const char = makeCharacter(LOOKS.cutter); G.scene.add(char);
    if (live) G.fx.popIn(char);
    const anim = { moving: false, speed: 1, carrying: false, action: null };
    return { update(dt) { /* move, then */ animateCharacter(char, dt, anim); } };
  },
});
```

## 7. Pads, effects and stats

`G.stats` = `computeStats(def, state.done, meta)`: `capacity, speed, priceMult`, everything in
`def.stats`, `open {stationId}`, `hires [...]`, `staff {stationId: {role: n}}`, `won`, `perks`.
Built-in effects:

| effect | fields | folds into stats |
|---|---|---|
| `open` | `stations: [ids]` | `open[id] = true` (stations with `open: true` start open) |
| `hire` | `role, from, to, ...` | `hires.push(...)`, `staff[to or from][role]++` |
| `stat` | `stat, set | add | mul | max | min` (or `ops: [...]`) | e.g. `{ stat: 'capacity', max: 50 }`, `{ stat: 'speed', mul: 1.25 }`, `{ stat: 'regrow', min: 4 }`, `{ stat: 'priceMult', mul: 1.5 }` |
| `stage` | `stage: n` | `stats.stage = max(stats.stage, n)`: the world grew a stage; scenes react in `G.pads.onDone(padId, fn)` |
| `multi` | `effects: [effect, ...]` | folds and applies each sub-effect (open + hire + stat in one pad). A second or later hire in the list is recorded under `'<padId>:<index>'` |
| `win` | - | `won = true`; live: emits `'win'` |
| `worlds` | - | repeatable: opens the world select (the last world's gate, where there is no next world) |
| `travel` | `world` (default: next world) | repeatable: never marked done; live: `G.travel(world)` |

Perks are applied after the pads: `speed *= product(speedMul)`, `capacity += sum(capacityAdd)`.
`G.thrills.applyStats()` then lays this world's gate perks, timed boosts and fever over the result
(`speed`, `capacity`, `priceMult`, and `workerSpeed`, `reach`, `magnet`: section 13).
After a purchase: `state.done[id] = true` -> `G.refresh(true)` (stats, then `stations.sync`,
`workers.sync`, `player.sync`) -> `'unlock' { pad, effect }` -> `onDone` hooks -> `effect.apply`.
Free pads (`cost: 0`, drawn with `priceText`, default "GO") and pads that appear under the player
only trigger after the player has stepped off them once.

Adding an effect:

```js
import { registerPadEffect } from '../../engine/registry.js';
registerPadEffect('feedBoost', {
  fold(stats, e) { stats.feedRate = (stats.feedRate || 1) * e.mul; },    // pure
  apply(G, e, pad) { /* optional live side effect */ },
  focus: (G, e) => G.stations.get('trough').pos, toast: () => 'FEED BOOST!', sound: 'unlock',
});
```

### Reveals: making a big purchase feel big

A pad with `reveal` gets a short cinematic when it is bought (`src/engine/reveal.js`): play stops, the HUD
fades, letterbox bars and a title card slide in, the camera travels to the new thing, it builds in while
the player watches, the world runs for a moment so it can be seen working, and the camera returns. A tap
skips it. `?noreveal` turns reveals off.

```js
reveal: true,                                 // one shot at pad.focus: everything the pad brings pops in there
reveal: {
  title, sub,                                 // title card (title defaults to pad.toast / label)
  zoom: 0.85,                                 // factor on the current zoom (< 1 = closer)
  run: 1.3,                                   // seconds the world runs at the end, camera still there
  shots: [
    { at: [x, z], show: ['stationId', 'scene'], hold: 0.9, zoom },   // go there, pop those in, wait
    { belt: 'beltId', dur: 2.2, show: [...], hold: 0.4 },            // pan along a belt while it is laid down
  ],
}
```

`show` takes station ids (everything the station and its scenery pop in when it opens), `'scene'` (pop-ins
from pad hooks, e.g. a new hall), `'*'` (all that is left) and `'pads'` (the next price pads; they always
come last, when the camera is back). Anything no shot shows appears when the reveal ends.

How it works: `G.pads` calls `G.reveal.begin(pad)` before it applies the purchase and `start(pad)` after.
In between, `G.fx.popIn(obj)` and `G.fx.defer(fn)` record their calls with `G.fx.owner` (set by
`G.stations` around each activation) instead of running them. So scenery only has to appear through
`popIn`, or wrap other live changes in `G.fx.defer(() => ...)`, to take part. During a reveal the main
loop runs only pads, scenery, fx and hud (frozen), then stations and workers too (the "run" phase); the
player has no control until it ends. `G.view.setCine({x, z}, zoom)` is the camera override it uses.
The clock is the simulation's, so tests that call `G.step` directly play reveals at the same pace.

## 8. Hints

Every 0.25 s (`engine/hints.js`): (1) carrying >= 60% of capacity (or full, or the harvest area
you stand in is < 15% grown) and some active drop zone accepts a carried item -> that zone
(preferring the one that takes the topmost item); (2) the cheapest visible pad is affordable ->
the pad; (3) a station with a `serve` capability (checkout) that is unstaffed with >= 2 waiting ->
its serve zone; (4) a cash pile holds >= 20 or >= 25% of what is missing -> the richest pile;
(5) an open drop zone whose `drop.need` >= 0.75 (empty shelf / trough) -> it if carrying what it
accepts, else a pickup that has such items; (6) the most recently opened harvest station or
non-empty pickup (pickups with `idleHint: false` are skipped). Drop zones with `room() <= 0` are
never a goal. After the win: the first free pad (travel gate).
Text: station `def.hints[kind]`, then `def.hint` (except for cash), else `world.hints[kind]`, else engine
`HINTS`; `{name}` = station name (item name, lower case, for harvest), `{label}` = pad label.

## 9. Save format, migration, level flow

Key `bloomrush.save.v2`:

```js
{ v: 2, level: 'flower',
  meta: { perks: { flower: { speedMul: 1.08, capacityAdd: 10 } }, totalEarned, playTime, finished: { flower: true },
          best: { flower: 512 } },                       // fastest win per world, seconds of play
  levels: { flower: { money, earned, playTime, won, done: {padId: true}, paid: {padId: n},
                      player: {x, z}, carried: ['rose', ...], stations: { 'shop-roses': { stock, value, cash } },
                      workers: { cutter0a: { items: ['rose', ...], x, z, face } },
                      thrills: { stars, perks: { sprint: 2 }, pending, next, fever, feverLeft, turbo, crew,
                                 seed, count, won, tips } } } }
```

Only the current world's level is sanitised (unknown pads, stations and item kinds dropped,
numbers validated, position clamped to bounds); other worlds and unknown top-level / meta keys are
kept as they are. A v1 save (`bloomrush.save.v1`) becomes `levels.flower.$v1` and is converted
by `flower.migrateV1` on the flower world's first load (pads whose `requires` are not all bought are
dropped and refunded; `price1` moved after `tractor2` in v2); the v1 key is deleted after the first v2
write. Saving: every 2 s, on hide/pagehide, after every unlock (`G.saveNow()`).

Level flow: buying the `win` pad -> `'win'` -> `meta.finished[id] = true`, perk stored and applied
at once (`G.refresh`), confetti storm over `finale.focus`, and after 2.5 s the win card:
`hud.showWin({ time, earned, next: { id, name } | null })` + `'level:won'`. `state.won` is only
saved once the card is shown, so a reload mid-celebration shows the card on the next boot.
The `travel` pad appears (it `requires` the win pad). `G.travel(id)` saves, sets `save.level`
and reloads with `?world=<id>`. Switching worlds always reloads; nothing is torn down. `'reset'`
clears the save and reloads the bare path (so it lands in the first world).

Replays: `G.replay(id)` drops that world's level state and reloads into it; `meta` (finished flags, perks from
finished worlds, best times) stays. The title's world cards show an AGAIN button on finished worlds and the best
time; the win card shows the best time on a replay and what happened on the way.

## 10. Scene, characters, HUD hooks

`createScene(G)` must add the ground and static scenery (merge into few meshes, use
`getSharedMaterial()` or the art kit's material), and per-station furniture. Lights come from the
engine. Return `{ update(dt) }` (or anything with `update`). Furniture pattern:

```js
for (const plot of G.world.layout.plots) {
  const shop = G.stations.get(plot.shop);                   // def + pos available before activation
  const counter = makeCounter(plot.color);
  counter.position.set(shop.def.counter.x, 0, shop.def.counter.z); counter.rotation.y = shop.def.counter.yaw;
  counter.visible = false; root.add(counter);
  G.stations.onOpen(plot.shop, (live) => { counter.visible = true; if (live) G.fx.popIn(counter); });
}
G.pads.onDone('greenhouse', (live) => showGreenhouse(live));  // live=false at boot if already bought
```

Events: `'open' {station, live}`, `'unlock' {pad, effect, repeat?}`, `'sale' {station, stationId, amount}`,
`'win' {world}`, `'level:won' {world, next}`, `'hud:win-shown' {time, earned, next}`, `'ready'`, `'reset'`,
and what the player does: `'p:take' {kind}` (an item harvested or picked up), `'p:deliver' {kind, station}`
(an item handed in to a drop zone), `'p:cash' {amount}` (money taken from a pile). Those three payloads are reused.
Helpers for scenes: `engine/decals.js` (`makeDropDecal('SELL')`, `makeCashDecal()` return art-kit zone meshes
(put them at y 0.04), `signTexture`, `canvasTex`, `makeDecal`, `flatPlane`), `engine/geom.js` (`Parts`, `rng`);
everything else (ground textures, scenery, counters, packs) comes from the art kit, docs/ART.md.

Two character rigs sit behind `chars.js`. The Kenney Mini Characters (above and below) are the default. A look whose
`model` is `animatedmen/<Name>` or `animatedwomen/<Name>` gets the human rig (`art/human.js`, docs/ART.md section 3b):
about 1.9 tall, one draw call, `colors: { Shirt, Pants, Hair, Skin, Socks }` recolour its slots, hats `'hardhat' |
'hardhat-white' | 'hardhat-orange'`, extra actions `'work'` and a bent-forward `'swing'`, and the stack is carried in
the hands in front (`userData.carry` tells the player and haulers where). A look may also be `{ make: () => Object3D }`:
a rigid vehicle that does a character's job (the factory's AGV hauler); it sets `userData.carry` and `userData.blob`.

Characters: only through `src/engine/chars.js` (`makeCharacter(look)`, `animateCharacter(char, dt,
{ moving, speed, carrying, action })`, `LOOKS`, `randomCustomerLook()`, `makeTractor()`, `lodCharacter(G, char)`,
`onScreen(G, x, y, z)`, `addBlob(obj, r)`). They are the art kit's animated pack characters (docs/ART.md section 3):
feet at the origin, faces +Z, ~1.65 tall; actions `'swing' | 'wave'` (`'pickup'` is ignored); `char.userData.hands.left /
.right`, `.front`, `.back`, `.head` are anchors for held items. A look is `{ model, tool: null | 'scythe' | 'axe' | 'bucket' |
'basket', scale, hat?: 'straw' | 'cap' | 'fur' }`, a `LOOKS` key, or a model name (`'female-b'`). `world.looks` overrides
`LOOKS.player` / `hauler` / `cashier` (any extra key becomes a named look) and `looks.customers` (list of looks or
model names) narrows the customer pool. `makeCharacter` attaches a blob shadow automatically. Skinned meshes are never
frustum-culled: workers call `lodCharacter` (hidden + not animated outside the view), shop customers are hidden when
off-screen, and a hidden vehicle skips drawing its stack. Do not touch character internals.

The harvester vehicle comes from `world.workers.harvester.model(color)`, else `chars.makeTractor()` (the pack tractor,
colour ignored). Its Object3D carries `userData { wheels: [], blade, bedAnchor, bob, blobLength, blobOffset }`; the
pack tractor has no separate wheels, so the role bounces it (`bob`) instead of spinning wheels.

Purchase pads are drawn by `pads.js` (rounded dark glass square, glowing cyan-white dashed outline, label, banknote +
price, rising green fill with a bright waterline, pulse when affordable). Money is the art kit's chunky bundle at a
lower triangle count (`items.js`).

How to build a world scene (checklist): list `assets` and `looks` in world.js; in `createScene(G)` add a ground
(`makeGround('grass'|'tile'|..., w, d)`), merge static scenery into a few chunk meshes (`Parts.model(id, opts)` merges pack
models; `meshOf(parts.merged({ ao }))`), use `makeZone` / `makeDropDecal` for markings, counters from `makeCounter`, show
station furniture in `G.stations.onOpen(id, fn)` and pad results in `G.pads.onDone(id, fn)`; build every model for a
station item as an item geometry (bottom-centre origin, long axis X) and keep it under ~300 triangles; `addBlob` for
animals and vehicles; keep shadows off for large merged hedges / small ground clutter (`meshOf(g, { cast: false })`).

HUD hooks for UI work: `G.hud.showWin({time, earned, next})` shows `#win` and, if the page has
`#win-next` (+ optional `#win-next-name`), shows it when `next` is set and travels on click;
`G.hud.hideWin()`; title/world cards can use `G.worlds`, `G.isUnlocked(id, G.meta)`,
`G.meta.finished`, `G.travel(id)` (the current world is `G.worldId`); `'reset'` clears all worlds.

## 11. Testing

- `?world=<id>` play a world if this save has unlocked it; `?world=<id>&unlock=1` play it anyway (dev
  and tests: a fresh save only has `flower` unlocked); `?worldUrl=/dev/<you>/x/world.js` load a world from anywhere on the
  same origin (does not change `save.level`); `?speed=N` sim speed; `?autoplay` bot; `?nothrills` the plain game
  without section 13 (for comparing timings).
- `node tools/playtest.js [--world=flower] [--shots=DIR] [--until=padId]` (adds `&unlock=1`) plays a world to the win
  headlessly (page-driven: `G.timeScale = 0` and `G.step(1/60)` in batches) and prints the unlock
  timeline, gaps over 60 s, stuck events and errors.
- Step the sim yourself: `const G = window.__game; G.timeScale = 0; for (let i = 0; i < 600; i++) G.step(1 / 60);`
  Drive the player with `G.input.override = { x, y }` (screen space, y up; see section 12).
- Seed a save before the page boots (Playwright):

```js
await page.addInitScript(() => {
  if (sessionStorage.getItem('seeded')) return;                    // only on the first load
  sessionStorage.setItem('seeded', '1');
  localStorage.setItem('bloomrush.save.v2', JSON.stringify({ v: 2, level: 'flower', meta: {},
    levels: { flower: { money: 5000, done: { cashier0: true, cutter0a: true }, player: { x: 2, z: 5 } } } }));
});
```

- Useful reads: `G.stations.get('shop-roses').serialize()`, `G.hints.current`, `G.renderer.info.render`,
  `G.fx.stats()`, `G.failed` (modules that fell back).

## 12. Gotchas

- **Camera mapping**: camera at player + (-14, 18, -14). Screen-right = world (-x, +z), screen-up =
  world (+x, +z). Joystick to world: `wx = (-ix + iy) / sqrt2`, `wz = (ix + iy) / sqrt2`; world to
  joystick: `x = (-dx + dz) / sqrt2`, `y = (dx + dz) / sqrt2`. Faces that should be read must point
  to -x/-z (signs use `rotation.y = -0.75 * PI`, ground decals texture-up toward (+x, +z)).
- **Mirrored layouts**: mirror with a sign on local X and pass `yaw: PI` to the shop counter; a
  source grid takes negative `dx`. Do not mirror geometry with negative scale (normals flip).
- **Fixed step**: `update(dt)` uses only `dt` (no `Date.now`, `performance.now`, timers) so `?speed`
  and `G.step` stay deterministic; `setTimeout` is fine only for pure presentation (the win storm).
  Steps can run 40 at a time per frame.
- **No per-step allocation**: keep option objects, callbacks and vectors in closures; numbers that
  change every step live on objects or typed arrays; no `map/filter/forEach/slice/[...]/{...}` or
  string building in `update`. `fx.fly` options are copied, so one reusable object per call site.
- **Performance budget**: ~150 draw calls and 250k triangles per view including the shadow pass.
  Merge static scenery (`Parts` -> one mesh), use InstancedMesh for anything repeated, set
  `boundingSphere`s on big instanced meshes so they cull. Flower world with every plot unlocked and every
  worker hired: ~110 calls / ~245k triangles near a plot, ~50 calls / ~135k at the crossroads (measure with
  `G.renderer.info.render`). Costs: characters (1 call and ~800 triangles each per pass), flower beds (143 plants
  x ~130 triangles x 2 passes), bouquet stacks (~230 triangles each).
- Pads sit 3 cm above the ground (`PAD.lift`); keep ground dressing under 6 cm where pads go.
- `station.update` runs while inactive; return early. `restore()` runs before `activate()`.
- The `'sale'` payload object is reused; copy what you need.
- No emoji in canvas or DOM text.
- **World bounds that grow**: the player keeps a reference to `world.bounds`, so a scene may widen it live
  (`Object.assign(G.world.bounds, bigger)`). Declare the largest bounds in the definition (saved positions are clamped
  to it at boot) and narrow it in `createScene`.

## 13. Thrills: events, fever, stars and perks

`src/engine/thrills/` adds surprises, short goals and choices on top of the collect-sell-buy loop. It is one
optional module (`G.thrills`, created before the player, updated after the pads, frozen during reveals) and it
works in every world because it only uses station capabilities, pads and `G.stats`. Nothing in it can take
anything from the player and nothing opens a dialog: every choice is made by walking.

| thing | what happens | file |
|---|---|---|
| fever | a HUD meter fills while the player works (takes, deliveries, cash) and drains when idle; full = 12 s of double sale prices and faster running for the player and the crew | `index.js` |
| lucky drop | a crate parachutes in near the player and opens into two prize gates (cash or a mystery against a boost, a star or a mystery); run through one | `drop.js` |
| rush order | "40 / 60 Roses" or "Collect $400" with a clock; on time = full pay and a star, late = half pay, then it leaves | `orders.js` |
| coin rush | a winding trail of coins; all of them before they fade = bonus and a star | `coins.js` |
| piggy bank | a golden pig runs from the player, drops coins while chased and tires; catching it pays well and gives a star | `piggy.js` |
| flash sale | two gates with price tags (a perk outright, or a star / boost); buy one with the money in hand or walk past | `deal.js` |
| stars and perks | orders, coin trails, pigs, star gates and every `big` pad give a star; three stars open the perk gates: one of two permanent perks for this world (`perks.js`: speed, stack, prices, crew speed, reach, cash magnet, fever, luck, order pay, and trade-offs such as PACK MULE) | `index.js`, `perks.js` |
| full load | handing in at least 90% of a full stack in one go pays a 12% tip | `index.js` |

Shared pieces: `gates.js` (the two arches; `gates.open({ x, z, ttl, scale, options, onPick, onExpire, canPick })`),
`spots.js` (a free spot in view that the player can walk to in a straight line: not in a blocker, zone or pad),
`ui.js` (fever bar, star slots, boost chips, order card, tip line, edge pointer), `util.js` (`mergeGroup`).

The director (`index.js`) runs one event at a time: the first after `firstAt` seconds of play and one bought pad,
then one every `gap` seconds, picked by the `events` weights (the kind that just ran is less likely). It only counts
down while the player is moving, so nothing starts on the title screen or for an idle player. An event that finds
no room (a small or crowded hall) is retried a few seconds later. Rewards are multiples of `unit()` = the largest of
a floor, 20% of the cheapest visible pad and 12 s of recent income (bonus money is kept out of that income, so
rewards do not feed on themselves). Randomness comes from a seeded stream kept in the save.

Stats: after every `computeStats`, `applyStats()` remembers the pad-and-perk base and writes
`speed`, `capacity`, `priceMult` (base x gate perks x boosts x fever) plus `workerSpeed` (read by the hauler and
harvester roles), `reach` (harvest radius factor) and `magnet` (metres added to cash-pile reach, both read by the
player). Timed speed boosts do not stack: the faster one counts.

Tuning lives in `TUNE` (`index.js`); a world overrides any of it with `thrills: { gap: [40, 60], events: { pig: 0 } }`
or turns the layer off with `thrills: { off: true }`. State is `levels.<world>.thrills`; it is validated on load.
Running boosts and a running fever are saved with their time left; an event in progress is not (it simply ends),
and the wait for the next one starts when an event starts, so a reload cannot skip it.

Testing: `G.thrills.trigger('drop' | 'order' | 'coins' | 'pig' | 'deal' | 'perk' | 'fever')` starts one now;
`G.thrills.state` (stars, perks, counts), `G.thrills.target()` (where the current event wants the player; the test
bot walks there), `G.thrills.tune` (live values). The bot takes gates, coins and pigs like a player would.

## 14. Progress: player level, missions, trophies, welcome back

`src/engine/progress/` (`G.progress`, created before thrills, updated after it; off with `?noprogress`).

- **Level.** `meta.xp` is one total for every world. XP comes from the player's deliveries, purchases, thrill
  events, stars, gate runs and wins (`XP` table in `index.js`). `levelOf(xp)` gives the level; each level pays a
  cash bonus and raises sale prices by 1% in every world, for good (the first 40 levels). `applyStats(stats)` runs
  right after `computeStats` and before the thrills overlay, so the bonus is part of the base. HUD: a badge with
  an XP ring in the top-left corner and a banner on level-up.
- **Mission.** One untimed goal at a time, on a card under the goal line (`levels.<world>.mission`): buy the next
  pad, deliver N of something, collect cash, finish events, earn stars, hand in full loads, start a fever, finish a
  gate run. The order is the `CYCLE` list; anything that cannot be asked right now is skipped. Finishing one pays
  XP and a little cash. A rush order takes the card's place while it runs (one task card at a time).
- **Trophies** (`trophies.js`): long-term goals counted in `meta.counts` and stored in `meta.trophies`; the
  list opens from the TROPHIES chip on the title. Earning one shows a banner and pays XP. Trophies an old save
  already deserves are granted quietly at boot.
- **Welcome back.** `levels.<world>.seenAt` is stamped on every save. Coming back after 3 minutes or more to a
  world with a crew pays a quarter of the recent income (`thrills.state.rate`) for the time away, capped at four
  hours and at ten reward units, once the player moves.

Thrills report what happened with one event, `'thrill' { kind }` (`order`, `pig`, `coins`, `escort`, `drop`,
`deal`, `perk`, `fever`, `load`, `star`, `jackpot`; the payload is reused). Gate runs report `'run:done'`.

Title and HUD (`hud.js`, `styles/title.css`, `styles/hud.css`): the title is the live world behind blurred glass
with a snap carousel of world cards (art in `assets/ui/world-<id>.jpg`, made with a screenshot of the world; a
gradient shows if the file is missing), each with a state line and a progress bar (`meta.padTotals[id]` is
recorded when a world loads). `G.travel` / `G.replay` close a curtain, and the next boot opens in mode `intro`:
no title, the world's number and name over a loading bar, then play starts by itself. Cash picked up flies as
bills to the money counter.
