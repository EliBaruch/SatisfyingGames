# Stations and roles for the chicken farm and the grocery store

This document covers the station types `pile`, `converter`, `trough`, `shelf`, `checkout` (with
its shopper population) and `cashpile`. It also covers the list bindings of the `hauler` role and
the `vendor` role. Read it together with `docs/ENGINE.md`, which describes the station interface,
capabilities, items, pads and the world definition.

Everything below is configured from the world definition. The types are built in
(`src/engine/stations/index.js` and `src/engine/workers/index.js` import them), so a world does
not need a `modules` entry for them.

Two complete world fragments that have been tested end to end are in `dev/stations/chicken/world.js`
and `dev/stations/grocery/world.js`. Section 9 explains them.

Conventions used throughout:

- Positions are `{x, z}`. Zones are `{x, z, r}`; `[x, z, r]` also works.
- `yaw` rotates a piece of furniture about Y. Local +X maps to world `(cos yaw, -sin yaw)` and local
  +Z maps to world `(sin yaw, cos yaw)`; this is the same as the shop counter.
- The camera looks from (-x, -z). Anything that has a "front" (the shelf face, the checkout's
  customer side) should face -x or -z, or the player sees its back. For example, a shelf along X
  with `yaw: Math.PI / 2` faces -z.
- Every station draws code-built placeholder furniture and ground decals by default. This keeps
  it readable with no scene at all. If your scene supplies the real furniture, set
  `placeholder: false`. If your scene draws the zone decals, set `markers: false`. Placeholder
  meshes are hidden until the station opens and are listed in `station.meshes`.
- Blockers come from the furniture size. Set `blockers: false` to turn them off, or give
  `blockers: [...]` to set them yourself. Shoppers and workers ignore blockers; only the player
  collides with them.
- Nothing allocates per step in steady state, and every timer runs on `dt` only, so `G.timeScale`
  and `G.step` work.

---

## 1. `pile`: a stock you pick up from

Use it for the delivery dock, the feed silo and storage.

```js
{ id: 'dock', type: 'pile', name: 'DOCK', open: true, x: -10, z: -7,
  items: ['milk', 'bread'] | item: 'feed',   // kinds it holds (supply kinds are added automatically)
  capacity: 40,                              // max items
  kindCap: undefined,                        // per-kind cap; default ceil(capacity / kinds) when a mixed supply
                                             //   feeds it (so one kind never blocks the others), else capacity
  start: 12 | { milk: 4, bread: 4 },         // starting stock (a number is spread over the kinds); the save wins
  infinite: false,                           // true: never runs out, always drawn full (a silo)
  supply: { every: 4, amount: 9,             // every 4 s, 9 items arrive one by one
            mix: { milk: 1, bread: 1, fruit: 1 } | items: [...] | item: 'x',   // kinds cycled in this ratio
            first: 1, stagger: 0.06 },       // first batch after `first` s; seconds between items of a batch
  layout: { x, z, y: 0, yaw: 0, cols: 3, rows: 2, dx, dz, layerH, maxDrawn: 96 },  // default: centred on x, z
  pallet: true,                              // code-built pallet under the stock
  zone: { x, z, r: 1.6 },                    // pickup zone (default: centred on x, z)
  interval: 0,                               // seconds per item for the player (0 = engine default 0.06)
  dropZone: null,                            // optional drop zone: players and workers may store accepted kinds
  workerSpot, label: 'TAKE', dropLabel: 'DROP', markers: true, placeholder: true,
  idleHint: true,                            // false: never the idle "Pick up {name}!" hint (use it for a silo)
  hint: 'Grab crates at the dock!' }
```

How the layout works: slot `i` is in layer `floor(i / (cols * rows))`, and within a layer the
slots fill a `cols × rows` grid. `dx` and `dz` default to the widest item footprint plus 0.06.
`layerH` defaults to the tallest item `step`. Items past `maxDrawn` are counted but not drawn.

**Capabilities**

- `pickup`. The fields are `zone`, `available`, `take(accept)` (the topmost item that `accept`
  takes), `has(pred)`, `count(kind)`, `from(out)`, `interval`, `action` and `idleHint`.
- `receive`. The fields are `accepts`, `room()`, `roomFor(kind)`, `target(out)`, `expect(kind)` and
  `give(kind)`. This is the same hand-over contract as a drop zone, but without a zone. A machine
  with `outputTo` uses it.
- `drop`, only when `dropZone` is set. It has the same fields as `receive`, plus `zone`,
  `workerSpot` and `face`.

**What a scene can use:** `pos`, `count`, `fill` (0..1), `supplyProgress` (0..1 until the next
batch), `delivered` (items that arrived by supply), `store` (`layout`, `count`, `countOf(kind)`,
`meshes`) and `meshes.{pallet, markers}`. The event `'pile:supply' { station, stationId, n }`
fires when a batch starts to arrive. Use it to drive a truck or a door. The payload object is
reused, so copy what you need.

**Save:** `{ n: { kind: count }, t: supplyTimer, q: itemsStillArriving }`. Items flying toward it
are counted.

**Hints:** a pile is the idle hint ("Pick up {name}!") when it was the station opened most
recently, has stock, and `idleHint` is not false. It is also the "fetch" hint for a drop zone with
a high need (section 7).

## 2. `converter`: a machine

Items go in, other items come out, over time. Use it for the egg packer.

```js
{ id: 'packer', type: 'converter', name: 'PACKER', open: true, x: 4, z: -2,   // the machine
  recipe: { in: { egg: 6 }, out: { carton: 1 }, time: 1.5 },   // several in/out kinds allowed
  batch: 1,                    // max recipes per cycle (needs the input and the output room)
  speedStat: 'packSpeed',      // optional: G.stats[speedStat] multiplies speed (put packSpeed: 1 in world.stats)
  inputCap: 36,                // input bay capacity (default 6 x the recipe's input)
  dropZone: { x, z, r: 1.6 },  // default: 2.2 left of the machine (world -x)
  workerSpot, vehicleSpot,
  input: { layout: {...} },    // bay layout (default: between the drop zone and the machine, 3 x 2 stacks)
  machine: { w: 2.2, d: 1.8, h: 1.6, yaw: 0 },   // placeholder size, also the blocker
  output: { capacity: 30, zone: { x, z, r: 1.6 }, layout: {...}, interval, idleHint },  // built-in output pile
  outputTo: 'stationId',       // instead: hand products to that station's `receive` (pile) or `drop`
  labels: { input: 'EGGS', output: 'CARTONS' }, placeholder: true, markers: true, blockers,
  hints: { drop: 'Bring eggs to the packer!', pickup: 'Grab the cartons!' } }   // per-goal texts (section 7)
```

**Behaviour:** when the bay holds a full recipe and the output has room, a cycle starts. The
inputs are consumed at once and up to 8 of them fly from the bay into the machine (`machine.mouth`).
`progress` then runs from 0 to 1 over `time / speed`. At the end the products fly from
`machine.spout` to the output pile, or to the `outputTo` station. They count as that station's
pending items while in flight. If the output is full, the machine waits: `blocked` becomes true
and the placeholder lamp turns red.

**Value:** item values are fixed per kind. To make cartons worth 3× the eggs that went in, give
`carton.value = 3 × 6 × egg.value`. The test world uses egg 1 and carton 18.

**Capabilities**

- `drop` is the input. It has `zone`, `accepts` (the recipe inputs), `room()`, `target`, `expect`,
  `give` and `workerSpot`. It also has `fill` (0..1). It has no `need`, so it never takes over the
  hints.
- `pickup` is the output. It is present only without `outputTo`.

**What a scene can use:**

- State: `progress` (0..1), `running`, `blocked`, `inputCount`, `outputCount`, `cycles`.
- Totals: `stats.{consumed, produced, inCount, outCount}`.
- Positions: `machine {x, z, w, d, h, yaw, mouth, spout}`.
- Parts: `input` and `output` (stores with `layout`), `meshes.{body, light, bar, markers}`.
- Events: `'convert:start' { station, stationId, batch, cycles }` and `'convert' { station,
  stationId, batch, cycles }`, the second after each cycle. The payloads are reused.

Animate a conveyor while `running`, and bounce the packer on `'convert'`.

**Save:** `{ in: {kind: n}, out: {kind: n}, p: progress | -1, b: batch }`. A cycle that was
running resumes, and its inputs are already consumed. Items in flight are counted on the side they
fly to.

## 3. `trough`: a consumable booster

Use it for hen feed.

```js
{ id: 'trough', type: 'trough', name: 'TROUGH', x: -3.5, z: 3.5,
  item: 'feed' | items: [...],
  capacity: 12,                // units; one item = unitsPerItem units (default 1)
  start: 0, drain: 0.2,        // units per second
  drainIdle: false,            // false: drains only while a boosted source is regrowing (hens eat while laying)
  boosts: [{ station: 'nests', multiplier: 2, stat: 'feedBoost' }],   // `stat` (optional) multiplies the multiplier
  dropZone: { x, z, r: 1.5 },  // default: in front (local -X side)
  workerSpot,
  trough: { len: 3, depth: 0.9, h: 0.6, yaw: 0 },   // placeholder size, also the blocker
  urgent: 0.75,                // need (1 - level) at which it becomes a hint goal; > 1 never
  color: 0xe0b44c, label: 'FEED', placeholder: true, markers: true, hint: 'Fill the trough!' }
```

**The boost** goes through the `source` type's `regrowRate` hook. While `amount > 0`, each boosted
source regrows `multiplier` times faster. When the trough is empty, the rate is 1, never 0.
Several troughs on one source multiply.

**Ordering matters:**

- If the trough comes **before** the boosted sources in `world.stations`, it installs the hook
  itself. Any existing `regrowRate` is kept and multiplied.
- If it comes after them, write the hook on the source yourself:

  ```js
  import { troughBoost } from '../../engine/stations/trough.js';
  ... { id: 'nests', type: 'source', regrowRate: troughBoost, ... }
  ```

  You can also combine it: `regrowRate: (G, st) => troughBoost(G, st) * myRate`. The trough logs
  a warning when the order is wrong.

**Capability:** `drop`, with `need` = 1 - fill (counting what is in flight).

**What a scene can use:** `level` (0..1), `amount`, `capacity`, `boosting`, `fed` (items received)
and `meshes.{body, fill, markers}`. The fill is a slab whose height follows `level`. The event
`'trough' { station, stationId, boosting, level }` fires when it becomes non-empty or empty. Show
or hide happy hens with it.

**Save:** `{ amount }`, including feed in flight.

## 4. `shelf`: retail stock that shoppers take from

```js
{ id: 'shelf-milk', type: 'shelf', name: 'MILK', open: true,
  item: 'milk' | items: ['milk', 'juice'],
  shelf: { x: -6, z: 2, yaw: Math.PI / 2, len: 3.2, depth: 0.8, h: 1.7, levels: 3 },   // local +X = front
  capacity: undefined,         // default cols x rows x levels x stack (cols along len, rows 1-2 along depth)
  stack: 1,                    // items stacked per slot on each level
  start: 6 | { milk: 6 },
  low: 0.3,                    // fill at or below this (and above 0) counts as 'low'
  urgent: 0.75,                // need (1 - fill) at which it becomes a hint goal; > 1 never
  dropZone: { x, z, r: 1.3 },  // default: 1.2 in front of the face, toward one end
  workerSpot,
  browse: { x, z, spread },    // where shoppers stand (default 0.75 in front, near the middle); spread
                               //   = width they spread over along the shelf (default 0.6 x len)
  approach: [{ x, z }, ...],   // optional waypoints shoppers walk before the browse point, and back out after
  label: 'STOCK', placeholder: true, markers: true, blockers, hint: 'Restock the milk!' }
```

**Capability:** `drop`, with `room()` limited to the shelf capacity and `need` = 1 - fill. The
player and the stockers unload only what fits.

**What shoppers use:** `browse {x, z, spread, ax, az, face}`, `approach`, `stock` and `takeOne()`.

**What a scene can use:**

- `state`: `'empty' | 'low' | 'ok' | 'full'`.
- `fill`, `stock`, `capacity`, `taken` (by shoppers), `restocked` (items delivered).
- `shelf` (the unit's dimensions), `store.layout`, and `meshes.{body, lamp, markers}`. The lamp is
  a small light on the top that shows red, amber or green.
- The event `'shelf' { station, stationId, state }` fires when the state changes.

**Save:** `{ n: {kind: count} }`.

## 5. `checkout` and shoppers

This is the grocery store's customer flow.

```js
{ id: 'co1', type: 'checkout', name: 'CHECKOUT', open: true,
  counter: { x: 7, z: -5, yaw: Math.PI / 2, len: 2.6, depth: 1.0, h: 0.95 },  // local +X = customer side
  zone: { x, z, r: 1.4 },          // serve zone; default 1.1 behind the counter (local -X)
  cashPile: { x, z, r: 1.4 }, bundle: 15,   // money per drawn bill bundle (x priceMult)
  queue: [{x, z}, ...],            // queue[0] is served; the line continues past the last point in the
                                   //   direction of the last two points
  queueIn: [{x, z}],               // waypoints walked before joining the line (route around counters)
  exit: [{x, z}, ...],             // waypoints after paying (then shoppers.exit)
  cashierSpot: { x, z, yaw },      // where a hired cashier stands (default: the serve zone)
  staffRole: 'cashier',
  serve: { self: { interval: 0.35, perItem: 0.12 }, staffed: { interval: 0.25, perItem: 0.08 } },
  shoppers: { ... },               // population config, merged over world.shoppers (see below)
  label: 'SERVE', placeholder: true, markers: true, blockers }
```

**Shopper population.** There is one population per world, shared by every checkout. Its config
comes from the engine defaults, then `world.shoppers` (a top-level key), then each checkout's
`shoppers` in definition order.

```js
shoppers: {
  entrance: [{x, z}, ...],   // REQUIRED. First point: where shoppers appear. Then walked in order.
  exit: [{x, z}, ...],       // REQUIRED. Last point: where they vanish (shrink away).
  count: 8,                  // population while one checkout is open
  perCheckout: 4,            // + this many per extra open checkout
  countStat: 'shoppers',     // + G.stats.shoppers (a pad { type: 'stat', stat: 'shoppers', add: 8 })
  max: 40,                   // hard cap (also the size of the basket instanced meshes)
  speed: 3.6,                // walk speed
  shelves: [1, 3],           // shelves visited per trip (min, max)
  items: [1, 3],             // items taken per shelf visit (min, max)
  takeInterval: 0.25, pause: 0.35, basket: 12,
  spawnEvery: 0.45,          // seconds between arrivals while below the population (x4 when every shelf is empty)
  lodShow: 27, lodShadow: 0  // hidden beyond; real shadows only within lodShadow (0 = never: blob shadows only)
}
```

**A shopper's trip:**

1. Walk the `entrance`.
2. Pick a random open shelf that has stock and has not been visited on this trip. Walk the shelf's
   `approach`, then go to a point spread along its browse line.
3. Take items one by one into the basket. A shelf that is empty on arrival is skipped at once.
   Pause, then choose the next shelf.
4. When the shelves to visit are done, or nothing is in stock, a shopper with items joins the
   **shortest line** among the open checkouts. The route is: back out of the shelf's `approach`,
   then `queueIn`, then the line slot. A shopper with an empty basket leaves.
5. After paying, walk `exit`, then `shoppers.exit`, and vanish.

The checkout serves the front shopper (queue[0], arrived) while the player stands in `zone`, or
always once `G.stats.staff[id].cashier` exists (a cashier hire, the same rule as `shop`). Each
item takes `perItem` seconds and flies from the basket onto the counter. `interval` seconds later
the shopper pays.

Payment = Σ base value of the basket × `G.stats.priceMult`, rounded to cents. It is deposited on
the cash pile with a flying bill, the `'sell'` sound and the event `'sale' { station, stationId,
amount, items }`. The payload is reused.

**Joining later.** Shelves and checkouts that are opened later (`open` pads) join automatically:
the population grows by `perCheckout`, and new shoppers use the new shelves.

**Characters.** Shoppers come from `makeCharacter(randomCustomerLook())`; set `world.looks.customers`
to narrow the pool. They are pooled and grow on demand up to `max`, and are never destroyed. Each
carries a red basket placeholder on its right side whose fill shows the items. All baskets use 2
instanced draw calls in total. Shoppers far from the player are hidden with `userData.lod = true`
and lose their shadow. By default (`lodShadow: 0`) shoppers and baskets cast no shadow-map
shadow at all; they have blob shadows.

**Capabilities**

- `cash`. It has `pile`, `amount`, `take`, `top`, `bundleValue`, and `deposit(amount, from)` (the
  vendor can pay onto a checkout).
- `serve`. It has `zone`, `waiting` (line length) and `staffed`. The hints and the bot use it.

**What a scene can use:**

- `line` (shoppers in order), `lineLength`, `slotPos(i, out)`, `faceYaw`, `counter`, `staffSpot`.
- Totals: `sold` (items), `served` (shoppers), `revenue`.
- `shoppers`, which is the population: `pool`, `cfg`, and `T.{alive, spawned, left}`.
- `meshes.{body, markers}` and the `'sale'` event.

**Save:**

- Each checkout saves `{ cash }`.
- The first checkout also saves `baskets: [[kind...], ...]`. These are the unpaid baskets of every
  shopper in the store. On load those shoppers come back near the entrance with their baskets and
  queue to pay, so a reload never loses goods or money.

**Throughput**, measured in `dev/stations/test-rates.js` with plenty of stock and staffed checkouts:

| setting | items sold / s | shoppers / s | items / shopper |
|---|---|---|---|
| test-world data (`count 10, perCheckout 6, items [2,4], speed 3.8`), 1 checkout | 3.3 | 0.57 | 5.9 |
| same, 2 checkouts (+8 shoppers from a pad) | 8.2 | 1.42 | 5.8 |
| late-game data (`count 20, perCheckout 14, items [2,5], shelves [2,3], speed 4.2`), 1 checkout | 8.6 (checkout-bound, line of about 7) | 0.97 | 8.9 |
| late-game data, 2 checkouts | **15.3** | 1.78 | 8.6 |

How to estimate it:

- One staffed checkout manages at most `items / (interval + perItem × items)` items per second.
  With the defaults and 8 items per basket that is about 9 per second.
- Shopper supply is about `population / tripTime × items per shopper`. A trip is about 12 s on the
  test layout.
- To raise throughput, increase `count`, `perCheckout` or `items`, or add a `shoppers` stat pad.

## 6. `cashpile`: a standalone cash pile

```js
{ id: 'truckcash', type: 'cashpile', name: 'TRUCK CASH', open: true, cashPile: { x: 4, z: -8.5, r: 1.4 }, bundle: 15 }
```

It provides the `cash` capability with `deposit(amount, from)`. Something else pays onto it,
usually the vendor truck. The player collects it like any other pile. **Save:** `{ cash }`.
Like every pile made with `kit.createCashPile` (checkouts too), it draws at most 36 bill bundles and
casts no shadow.

## 7. Hints

Some changes to `engine/hints.js` let these stations drive the goal line. The rules, in order:

1. **Carrying.** When the player carries ≥ 60% of capacity, the hint points to a drop zone that
   accepts a carried item. Drop zones with `room() <= 0` (a full shelf or trough) are now skipped.
2. **Buy.** An affordable pad.
3. **Serve (new).** A station with `serve` that is not staffed and has `waiting >= serve.hintAt`
   (default 2) points to its serve zone. The text comes from `world.hints.serve`, default
   "Serve the shoppers!".
4. **Cash.** A cash pile.
5. **Need (new).** The open drop zone with the highest `drop.need`, if it is at least
   `drop.urgent` (default 0.75). Shelves and troughs have `need`; machines do not.
   - If the player carries something it accepts, the hint is that drop zone.
   - Otherwise it is a pickup that `has()` such items, with the pile's own `hint`. This is how an
     empty trough says "Grab feed at the silo!" even though the silo has `idleHint: false`.
6. **Idle.** The newest harvest area or pickup. Pickups that are empty or have `idleHint === false`
   are now skipped. An empty machine output never steals the hint from the nests, and an infinite
   silo never becomes the permanent goal.

A station's text can be set two ways:

- `hint: 'text'` applies to every rule (except cash).
- `hints: { drop, pickup, serve, harvest }` sets a text per goal kind and wins over `hint`. Use it
  on a converter: `hints: { drop: 'Bring eggs to the packer!', pickup: 'Grab the cartons!' }`.

`{name}` is the station name. When the trough or shelf hint is too pushy, raise its `urgent`; a
value above 1 turns it off.

## 8. Workers

### `hauler` with list bindings

```js
effect: { type: 'hire', role: 'hauler', from: ['dock'], to: ['shelf-milk', 'shelf-bread', 'shelf-fruit'] }
effect: { type: 'hire', role: 'hauler', from: ['nests-a', 'nests-b'], to: ['packer'] }
effect: { type: 'hire', role: 'hauler', from: ['silo'], to: ['trough'], options: { minRoom: 4 } }
```

When `from` or `to` is an array, the hauler plans each trip like this:

- **Source.** It picks a source (harvest area or pickup) that has something a target still has
  room for. It scores sources by available stock and distance.
- **Collecting.** It collects only what the targets can take. The room count already includes
  what it carries.
- **Delivering.** It delivers to the target with the most room that accepts a carried item, then
  continues with the rest.
- **Topping up.** With room left, it tops up from another source.
- **Waiting.** When every target is full, it waits, standing still, until room appears.

Multiple haulers on the same harvest source split it into bands, as before.

`options.minRoom` (default 1) sets the room a target needs before a trip starts. Raise it to get
fuller, rarer trips; for example, a feeder with `minRoom: 4` fills the trough four units at a time.

Each list hauler counts `delivered` and `collected`, which you can read on `G.workers.list[i]`.
Use them to measure its rate.

**A single-string `from`/`to` keeps the original behaviour exactly** (the flower cutters). Use
`to: ['x']` to get the room-aware behaviour with one target. A hire with lists records its staff
under the joined key, for example `G.stats.staff['shelf-milk,shelf-bread']`. Do not rely on it.

**Measured rates** (hauler speed 4.2, capacity 10 to 12, layouts as in the test worlds):

| worker | rate |
|---|---|
| stocker, dock → 3 shelves (dock always full, about 8 to 10 units each way) | **1.5 items/s** per stocker; 2.84/s for two |
| collector, nests (20 cells, regrow 5 s, no feed) → packer | 2.33 eggs/s, limited by the nests (4 eggs/s max) |
| collector, nests always grown → packer | **2.9 eggs/s** per collector |
| two collectors, nests with feed ×2 (8 eggs/s max) | 4.95 eggs/s |
| converter `6 egg → 1 carton, 1.5 s, batch 2` with the input always full | 1.30 cartons/s = **7.8 eggs/s** (its maximum is batch × out / time = 1.33) |
| vendor truck `capacity 10, every 20` competing with a porter for the output | 19 cartons in 300 s; alone it takes up to capacity / (every + drive time) |

### `vendor`: a delivery truck that buys

```js
effect: { type: 'hire', role: 'vendor', from: 'packer', to: 'truckcash', options: { ... } }
workers: { vendor: {
  path: { in: [{x,z}, ...], stop: {x, z}, out: [{x,z}, ...] },   // REQUIRED
  kinds: ['carton'],      // what it buys (default: anything the pickup has)
  capacity: 12,           // items per visit
  every: 25, first: 8,    // seconds between visits (counted while away); before the first one
  minStock: 1,            // stays away (re-checks every 2 s) until the pickup has this many
  patience: 3,            // seconds parked with nothing to load before leaving
  loadInterval: 0.12, speed: 7, turn: 3.2, priceMult: 1,
  model: (color) => Object3D,   // faces +Z; userData.bedAnchor is where the load sits
  bed: { x: 0, y: 1.1, z: -0.9 },   // load position when the model has no bedAnchor
} }
```

`from` is any station with a pickup zone. `to` is any station with `cash.deposit`: a `cashpile`,
or a `checkout`. The **`shop` type has no deposit**, so put a `cashpile` next to the truck stop.

**A visit:**

1. The truck appears at `in[0]`, drives through `in`, and stops at `stop`.
2. It loads items one by one. They fly from the pickup onto its bed.
3. **Each item is paid as it is loaded**: value × `priceMult` × `G.stats.priceMult`, with a bill
   flying to the pile. Money is never lost on a reload.
4. It leaves when full, when nothing has come for 0.6 s after loading something, or after
   `patience` with nothing loaded.
5. It drives through `out` and vanishes.

**Model.** It uses `options.model`, else `chars.makeTruck` if the art kit adds one, else a
code-built placeholder truck (`makePlaceholderTruck` in `workers/vendor.js`).

**Events:** `'vendor' { worker, phase: 'arrive' | 'leave', loaded, amount }`, and one `'sale'
{ station, stationId, amount, items }` per visit. **Readable fields:** `state` (`'away' | 'in' |
'load' | 'out'`), `visits`, `totalItems`, `totalPaid` and `group`.

### `cashier`

The existing `cashier` role works with checkouts: `{ type: 'hire', role: 'cashier', to: 'co1' }`.
It stands at `cashierSpot` and waves on that checkout's sales.

## 9. Worked examples

These are the throwaway test worlds, trimmed. They were played end to end with exact item and
money accounting, a five-minute high-speed run, a reload, and the autoplay bot (section 10).

### Chicken farm

Here is how the world flows:

- **Eggs to cartons:** nests (`source`) → packer (`converter`, 6 eggs → 1 carton worth 3× the
  eggs).
- **Selling:** cartons go to the farm stand (`shop`) and to the vendor truck, which pays onto a
  `cashpile`.
- **Feed:** silo (`pile`, infinite) → trough → nests regrow 2× faster.

```js
import { troughBoost } from '../../engine/stations/trough.js';   // only if the trough is listed AFTER the nests
export default {
  id: 'chicken', name: 'Chicken Farm',
  stats: { regrow: 5, packSpeed: 1 },
  items: [
    { id: 'egg', name: 'Eggs', value: 1, geometry: makeEgg, step: 0.4, footprint: { w: 0.4, d: 0.4 } },
    { id: 'carton', name: 'Cartons', value: 18, geometry: makeCarton, step: 0.28, footprint: { w: 0.62, d: 0.36 } },
    { id: 'feed', name: 'Feed', value: 0, geometry: makeFeedSack, step: 0.3, footprint: { w: 0.6, d: 0.4 } },
  ],
  stations: [
    // listed before the nests: it installs the boost hook on them itself
    { id: 'trough', type: 'trough', name: 'TROUGH', item: 'feed', x: -3.5, z: 3.5, capacity: 12, drain: 0.2,
      trough: { len: 3, depth: 0.9, h: 0.6, yaw: Math.PI / 2 }, boosts: [{ station: 'nests', multiplier: 2 }], hint: 'Fill the trough!' },
    { id: 'nests', type: 'source', name: 'Eggs', item: 'egg', open: true, grid: { x0: -6, z0: -4, dx: 1.2, dz: 1.2, cols: 5, rows: 4 },
      plant: makeNestWithEgg, stub: makeEmptyNest, sway: false, plantHeight: 0.4, action: 'pickup', home: { x: -3.5, z: -6 } },
    { id: 'silo', type: 'pile', name: 'SILO', item: 'feed', infinite: true, capacity: 12, x: -9, z: 6,
      idleHint: false, label: 'FEED', hint: 'Grab feed at the silo!' },
    { id: 'packer', type: 'converter', name: 'PACKER', open: true, x: 4, z: -2,
      recipe: { in: { egg: 6 }, out: { carton: 1 }, time: 1.5 }, batch: 2, speedStat: 'packSpeed', inputCap: 36,
      output: { capacity: 24 }, labels: { input: 'EGGS', output: 'CARTONS' },
      hints: { drop: 'Bring eggs to the packer!', pickup: 'Grab the cartons!' } },
    { id: 'stand', type: 'shop', name: 'SELL', open: true, accepts: ['carton'], display: 'carton',
      counter: { x: 10, z: 6, yaw: 0, len: 3.4, depth: 1.2, h: 1.0 }, dropZone: { x: 7.4, z: 6, r: 1.6 }, cashPile: { x: 10, z: 10, r: 1.5 },
      queue: [0, 1, 2, 3, 4, 5].map((i) => ({ x: 11.2 + i, z: 6 })),
      customerIn: [{ x: 17, z: -8 }, { x: 17, z: 6 }], customerOut: [{ x: 12, z: 3.5 }, { x: 17, z: -8 }],
      cashierSpot: { x: 9, z: 7 }, workerSpot: { x: 7.4, z: 3.8 } },
    { id: 'truckcash', type: 'cashpile', name: 'TRUCK CASH', open: true, cashPile: { x: 4, z: -8.5, r: 1.4 } },
  ],
  workers: {
    hauler: { speed: 4.2, capacity: 12 },
    vendor: { capacity: 10, every: 20, first: 4, kinds: ['carton'],
      path: { in: [{ x: 18, z: -13 }, { x: 12, z: -6 }], stop: { x: 9, z: -4.5 }, out: [{ x: 2, z: -12 }, { x: -14, z: -13.5 }] } },
  },
  pads: [
    { id: 'collector', label: 'EGG COLLECTOR', cost: 60, at: [-1, -9],
      effect: { type: 'hire', role: 'hauler', from: ['nests'], to: ['packer'] } },
    { id: 'feedarea', label: 'FEED SILO', cost: 150, at: [-4, -9], requires: ['collector'], big: true,
      effect: { type: 'open', stations: ['silo', 'trough'] } },
    { id: 'feeder', label: 'FEEDER', cost: 200, at: [-7, -9], requires: ['feedarea'],
      effect: { type: 'hire', role: 'hauler', from: ['silo'], to: ['trough'], options: { minRoom: 4 } } },
    { id: 'porter', label: 'CARTON PORTER', cost: 250, at: [-10, -9], requires: ['feeder'],
      effect: { type: 'hire', role: 'hauler', from: ['packer'], to: ['stand'] } },
    { id: 'cashier', label: 'CASHIER', cost: 300, at: [-1, -12], requires: ['porter'],
      effect: { type: 'hire', role: 'cashier', to: 'stand' } },
    { id: 'truck', label: 'DELIVERY TRUCK', cost: 800, at: [-4, -12], requires: ['cashier'], big: true,
      effect: { type: 'hire', role: 'vendor', from: 'packer', to: 'truckcash' } },
    { id: 'packfast', label: 'FASTER PACKER', cost: 900, at: [-7, -12], requires: ['truck'],
      effect: { type: 'stat', stat: 'packSpeed', mul: 1.5 } },
    { id: 'collector2', label: 'EGG COLLECTOR', cost: 1000, at: [-10, -12], requires: ['packfast'],
      effect: { type: 'hire', role: 'hauler', from: ['nests'], to: ['packer'] } },   // list more nest beds here as they open
  ],
  hints: { harvest: 'Collect the {name}!', pickup: 'Pick up {name}!', drop: 'Bring it to {name}' },
};
```

A scene dresses it from the station state:

```js
const packer = G.stations.get('packer');
G.stations.onOpen('packer', (live) => { machine.visible = true; if (live) G.fx.popIn(machine); });
G.events.on('convert', (e) => { if (e.stationId === 'packer') G.fx.pop(machine); });
// in scene.update(dt): belt.material.map.offset.x += packer.running ? dt : 0;
// trough: G.stations.get('trough').level; event 'trough' { boosting } toggles hen animations
```

### Grocery store

Here is how the world flows: the dock (`pile`, delivering three crate kinds every 4 s) feeds three
shelves; shoppers buy from the shelves and pay at two checkouts; stockers keep the shelves filled
and cashiers ring up the shoppers.

```js
// checkout counters along x, customers on the -z side (facing the camera); the line goes toward -z
const co = (id, x0, open) => ({
  id, type: 'checkout', name: 'CHECKOUT', open,
  counter: { x: x0, z: -5, yaw: Math.PI / 2, len: 2.6, depth: 1.0, h: 0.95 },
  queue: [0, 1, 2, 3, 4, 5].map((i) => ({ x: x0, z: -6.3 - i * 0.95 })),
  queueIn: [{ x: x0 - 2, z: -6.8 }],                         // go round the counter end
  exit: [{ x: x0 + 1.8, z: -6.3 }, { x: x0 + 1.8, z: -12 }],
  cashierSpot: { x: x0 + 0.5, z: -4.2, yaw: Math.PI },
});
// shelves along x at z = 2, face toward -z (the camera)
const shelf = (id, item, x, open) => ({ id, type: 'shelf', name: item.toUpperCase(), item, open,
  shelf: { x, z: 2, yaw: Math.PI / 2, len: 3.2, depth: 0.8, h: 1.7, levels: 3 }, start: 6 });

export default {
  id: 'grocery', name: 'Grocery Store',
  stats: { shoppers: 0 },
  items: [
    { id: 'milk', name: 'Milk', value: 4, geometry: makeMilkCrate, step: 0.4, footprint: { w: 0.6, d: 0.42 } },
    { id: 'bread', name: 'Bread', value: 3, geometry: makeBreadCrate, step: 0.4, footprint: { w: 0.6, d: 0.42 } },
    { id: 'fruit', name: 'Fruit', value: 5, geometry: makeFruitCrate, step: 0.4, footprint: { w: 0.6, d: 0.42 } },
  ],
  shoppers: {
    count: 10, perCheckout: 6, speed: 3.8, shelves: [1, 3], items: [2, 4], takeInterval: 0.2, pause: 0.3, basket: 12,
    entrance: [{ x: -3, z: -13 }, { x: -3, z: -2 }], exit: [{ x: 18, z: -13 }],
  },
  stations: [
    { id: 'dock', type: 'pile', name: 'DOCK', open: true, x: -10, z: -7, capacity: 45, start: 12,
      supply: { mix: { milk: 1, bread: 1, fruit: 1 }, amount: 9, every: 4 }, layout: { cols: 3, rows: 3 },
      zone: { x: -7.4, z: -7, r: 1.6 } },
    shelf('shelf-milk', 'milk', -6, true),
    shelf('shelf-bread', 'bread', -1.5, true),
    shelf('shelf-fruit', 'fruit', 3, false),
    co('co1', 7, true),
    co('co2', 13, false),
  ],
  workers: { hauler: { speed: 4.2, capacity: 10 } },
  pads: [
    { id: 'fruit', label: 'FRUIT SHELF', cost: 50, at: [-4, 7], effect: { type: 'open', stations: ['shelf-fruit'] } },
    { id: 'stocker', label: 'STOCKER', cost: 120, at: [-7, 7], requires: ['fruit'],
      effect: { type: 'hire', role: 'hauler', from: ['dock'], to: ['shelf-milk', 'shelf-bread', 'shelf-fruit'] } },
    { id: 'cashier1', label: 'CASHIER', cost: 200, at: [-10, 7], requires: ['stocker'],
      effect: { type: 'hire', role: 'cashier', to: 'co1' } },
    { id: 'co2', label: 'CHECKOUT 2', cost: 500, at: [-4, 10], requires: ['cashier1'], big: true,
      effect: { type: 'open', stations: ['co2'] } },
    { id: 'cashier2', label: 'CASHIER', cost: 600, at: [-7, 10], requires: ['co2'],
      effect: { type: 'hire', role: 'cashier', to: 'co2' } },
    { id: 'stocker2', label: 'STOCKER', cost: 700, at: [-10, 10], requires: ['cashier2'],
      effect: { type: 'hire', role: 'hauler', from: ['dock'], to: ['shelf-milk', 'shelf-bread', 'shelf-fruit'] } },
    { id: 'ads', label: 'MORE SHOPPERS', cost: 900, at: [-13, 10], requires: ['stocker2'],
      effect: { type: 'stat', stat: 'shoppers', add: 8 } },
    { id: 'price1', label: 'PREMIUM BRANDS +50%', cost: 1000, at: [-13, 7], requires: ['ads'],
      effect: { type: 'stat', stat: 'priceMult', mul: 1.5 } },
  ],
  hints: { pickup: 'Grab crates at the {name}!', drop: 'Restock the {name} shelf', serve: 'Ring up the shoppers!' },
};
```

Pad effects used across the two examples:

- `open` adds a shelf, checkout, trough or silo.
- `hire` adds a `hauler` (lists), `cashier` (to a checkout or shop) or `vendor`.
- `stat` raises `shoppers` (population), `packSpeed` (a converter's `speedStat`), `priceMult`,
  `capacity`, `speed` or `regrow`.

There is no stat for a pile's supply rate today. To have more deliveries, open a second dock with
an `open` pad, or ask for a `supplyStat`.

**Tuning to 6 to 8 minutes.** The test layouts are compact. Distances in a real world are longer,
which lowers the worker rates in section 8 roughly in proportion to the round trip.

In the grocery, income is set by the smallest of these three:

- dock supply (`amount / every` items/s);
- stocker capacity (about 1.5 items/s each);
- checkout throughput (section 5).

The test world is limited by its dock (2.25 items/s). Raise `supply.amount` or open a second dock
late in the level to reach 12 items/s.

In the chicken farm:

- **Egg supply** is `cells / regrow × boost`.
- **Collectors** move about 2.9 eggs/s each when the nests are always full.
- **The packer** handles `batch × outN / time` recipes per second.

## 10. Testing a world

`node tools/playtest.js --url=http://localhost:8100/?worldUrl=/dev/<you>/world.js` (or `--world=<id>`, which adds the `&unlock=1` dev override)
now plays these worlds too. The bot (`src/autoplay.js`) does the following:

- picks up at pickup zones whose items an open drop zone takes, urgent ones first;
- stands in unstaffed serve zones while shoppers wait;
- skips full drop zones.

The throwaway tests in `dev/stations/` are worth copying:

- `test-chicken.js` and `test-grocery.js` drive the player with `G.input.override` and check exact
  accounting, worker movement, a five-minute run and a reload.
- `test-rates.js` measures the rates in this document.
- `shots.js` takes screenshots.

## 11. Known limits

- **Workers do not save what they carry.** This is an engine-wide limit that the flower world
  shares: a reload drops the items in workers' stacks. Station stock, items in flight toward a
  station, unpaid shopper baskets and vendor payments are all saved.
- **Shoppers walk straight lines between waypoints and do not avoid obstacles.** Give shelves an
  `approach`, and give checkouts `queueIn` and `exit`, so routes clear the furniture. Shoppers
  overlap a little when many browse the same shelf.
- **Do not overlap zones.** A pile with both `zone` and `dropZone` must keep them apart, or the
  player would drop and take at the same time. The same applies to a converter's input and output
  zones.
- **Shelf size.** A shelf's drawn capacity is limited to its slots (`cols × rows × levels ×
  stack`). A larger `capacity` holds more than it shows.
- **Shoppers per checkout line.** A long line extends straight past the last queue point. Leave
  room, or raise `perCheckout` only together with more checkouts.
- **The vendor needs a deposit.** It pays only onto stations with `cash.deposit` (`cashpile`,
  `checkout`); the `shop` type has none.
