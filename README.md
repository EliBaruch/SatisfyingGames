# Bloom Rush

A mobile-first idle arcade tycoon in seven worlds. Run around, gather goods,
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
6. **Wheatwhistle Junction**: alone in a golden wheat field with a scythe. Sell at the market stall, raise a
   windmill and a bakery, hire farmhands and a combine harvester, feed the cows and make cheese, grow
   pumpkins, then build a station on the old railway: the freight train comes on a schedule, every wagon
   wants its own goods and a full train pays a bonus. A town grows round the tracks and the Harvest Fair opens.
7. **Ironwall Keep**: a lone knight holds a walled keep against raiders that come in waves. Every raider
   that falls pays a bounty into the war chest; raiders that reach the wall grab coins and run. Build
   archer towers and keep them stocked with arrows from the fletcher, then crossbows (bolts from the
   forge), fire arrows, ballistae that skewer whole lines, catapults throwing quarry stones, flaming
   pitch and finally the great trebuchet, while shieldbearers, brutes, black knights and battering rams
   join the waves. Crown it with the Citadel. The longest world: about 20-25 minutes.

On top of that loop the game keeps throwing things at you: a fever meter that doubles your sales
when you keep busy, lucky drops with a choice of prizes, rush orders against the clock, coin trails,
a golden piggy bank to chase, flash sales, and perk gates where you pick one of two permanent perks
(three stars buy a choice), and a VIP to escort. You have a player level that carries across every
world, a mission to work on at all times, trophies to earn, and a bonus waiting when you come back.
Finished worlds can be played again to beat your best time.
Every world also has three Gate Run bonus levels (the flag button, bottom right): run up a floating runway,
steer through the better gate, stack your goods absurdly high and cash the tower in on the scale.
The same sheet lists three Raid levels: defend a pallet of your goods from waves of cute pests and buy scarecrow helpers with the coins they drop (`src/engine/raid/`, `?noraid` turns them off, `node tools/raidtest.js` checks them).
And three Harvest Rush levels: a fenced field carpeted with the world's goods, a plough, a clock and three trucks to fill (`?norush` turns them off; `node tools/rushtest.js` checks them).

## How to play

- Drag anywhere to run (a joystick appears under your finger). On desktop use
  WASD or the arrow keys.
- Walk through fields and nests to harvest; stand in a pickup zone to take
  items; stand in a drop zone to hand them in.
- Walk over cash piles to collect the money, then stand on price pads to buy.
- The arrow and the goal line at the top always show the next useful step.
- Prizes and perks are chosen by running through a gate. Nothing ever takes money or progress away:
  an event you ignore just leaves.
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

- `?world=<id>` opens a world (`flower`, `chicken`, `grocery`, `factory`, `frost`, `town`, `keep`) if your save has
  unlocked it; add `&unlock=1` to open it anyway (development and tests).
- `?worldUrl=<same-origin path to a world.js>` loads a world under development.
- `?autoplay` runs a test bot that plays the game.
- `?speed=N` runs the simulation N times faster.
- `?noreveal` turns off the cinematics that play on big purchases.
- `?nothrills` turns off the events, fever and perks (the plain loop); `?noprogress` turns off the
  player level, missions and trophies.
- `?norun` turns off the Gate Run bonus levels, `?nomodes` the whole mini-mode host.

`node tools/playtest.js --world=<id>` plays a world to the end headlessly with
Playwright and prints the unlock timeline. `node tools/runtest.js` plays the Gate Run
levels in every world and checks them.

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
                           checkout, cashpile; opt-in: belt, line, lot, solid, herd, depot, horde, battery (docs/STATIONS.md)
  workers/                 worker roles: hauler, harvester, cashier, vendor; opt-in: operator, turret, train
  thrills/                 fever, lucky drops, rush orders, coin trails, the piggy bank, flash sales,
                           stars and perk gates (docs/ENGINE.md section 13)
  progress/                the player level and XP, missions, trophies, the welcome-back bonus
                           (docs/ENGINE.md section 14)
  modes/, run/             mini-mode host (bonus levels away from the world) and the Gate Run
                           (docs/ENGINE.md section 15); their styles are in styles/run.css
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
