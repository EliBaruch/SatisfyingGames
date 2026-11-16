# Bloom Rush

A mobile-first idle arcade tycoon in five worlds. Run around, gather goods,
stack them on your back, sell them, collect the cash and spend it on pads that
hire workers, buy vehicles, add upgrades and open new areas. Finish a world to
unlock the next one and carry a small perk with you.

1. **Flower Farm**: cut roses, tulips and sunflowers and build the Grand Greenhouse.
2. **Chicken Farm**: collect eggs, pack them into cartons, keep the troughs fed
   and sell to the delivery truck.
3. **Grocery Store**: stock the shelves from the loading docks and serve the
   shoppers at the checkouts.
4. **Volt Works**: start alone in a garage sweeping up scrap and building battery
   packs by hand, hire a crew, add conveyor lines and a car assembly line, and
   automate it into a gigafactory.
5. **Frostpine Camp**: alone in a snowy clearing with an axe. Chop pines, hunt the woolly tuskers,
   sell to the villagers at the trading post, raise a palisade, roast meat over the cook fire, hire
   woodcutters, hunters and carriers, build watchtowers that hunt for you, and light the Great Beacon.

## How to play

- Drag anywhere to run (a joystick appears under your finger). On desktop use
  WASD or the arrow keys.
- Walk through fields and nests to harvest; stand in a pickup zone to take
  items; stand in a drop zone to hand them in.
- Walk over cash piles to collect the money, then stand on price pads to buy.
- The arrow and the goal line at the top always show the next useful step.
- Progress is saved in your browser, per world. The world button opens the
  world select; the reset button clears all progress.

## Run locally

It is plain ES modules with no build step. Serve the folder with any static
server, for example:

```sh
python3 -m http.server 8100
```

Then open http://localhost:8100/ in a browser.

Debug flags (add to the URL):

- `?world=<id>` opens a world (`flower`, `chicken`, `grocery`, `factory`, `frost`) if your save has
  unlocked it; add `&unlock=1` to open it anyway (development and tests).
- `?worldUrl=<same-origin path to a world.js>` loads a world under development.
- `?autoplay` runs a test bot that plays the game.
- `?speed=N` runs the simulation N times faster.
- `?noreveal` turns off the cinematics that play on big purchases.

`node tools/playtest.js --world=<id>` plays a world to the end headlessly with
Playwright and prints the unlock timeline.

## Layout

```
index.html, styles.css   page, HUD markup and styles
src/main.js              boot: picks the world, loads it, builds the engine, runs the loop
src/autoplay.js          the test bot (?autoplay)
src/engine/              the shared engine (docs/ENGINE.md)
  config.js, worlds.js     tuning defaults; the list of worlds and how they unlock
  save.js                  save format, sanitising, v1 migration
  player.js, stack.js      the player and the item tower on its back
  pads.js, pad-effects.js  purchase pads and what they do
  stations/                station types: source, shop, pile, converter, trough, shelf,
                           checkout, cashpile; opt-in: belt, line, lot, solid, herd (docs/STATIONS.md)
  workers/                 worker roles: hauler, harvester, cashier, vendor; opt-in: operator, turret
  hud.js, hints.js         HUD, title and win cards; the goal arrow and line
  fx.js, audio.js          particles, flying items, popups; synthesized sound
  art/                     model loading and caching, shared materials, characters
src/worlds/<id>/         one folder per world: world.js (stations, pads, economy),
                         scene.js (scenery), models.js (world-specific props)
assets/                  3D models (GLB) by kit, with manifest.json and LICENSES.md
docs/                    ENGINE.md, STATIONS.md, ART.md
tools/                   playtest runner, asset fetcher
vendor/                  Three.js and fonts
```

## Credits

- Rendering: [Three.js](https://threejs.org/), MIT License (`vendor/THREE-LICENSE`).
- 3D models: [Kenney](https://kenney.nl) and [Quaternius](https://quaternius.com),
  CC0 1.0 (`assets/LICENSES.md`).
- Font: Fredoka, SIL Open Font License 1.1 (`vendor/fonts/`).
