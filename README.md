# Bloom Rush

A mobile-first idle arcade tycoon. Run a farmer through flower beds, cut the
blooms, stack them on your back, sell them at the counter, and grow your flower
empire from one farm to four, all the way to the Grand Greenhouse.

## How to play

- Drag anywhere to run (a joystick appears under your finger). On desktop use
  WASD or the arrow keys.
- Walk through the flower beds to cut flowers. They fly onto your stack.
- Drop your stack at the SELL zone. Customers buy them and cash piles up.
- Walk over the cash to collect it, then stand on price pads to buy cashiers,
  workers, a tractor, upgrades and new farms.
- Build the Grand Greenhouse to win. Progress is saved in your browser.

## Run locally

```sh
python3 -m http.server
```

Then open http://localhost:8000/ in a browser.

Debug flags (add to the URL):

- `?autoplay` runs a test bot that plays the game.
- `?speed=N` runs the simulation N times faster.

## Files

```
index.html         page, HUD markup, start and win overlays
styles.css         HUD and overlay styles
netlify.toml       static hosting and cache headers
vendor/            vendored Three.js (MIT)
src/config.js      all tuning data, economy, layout and save state shape
src/input.js       pointer joystick and keyboard input
src/hud.js         money counter, goal line, toast, win screen, buttons
src/save.js        load, save and clear of local progress
src/main.js        boot, game loop and wiring
src/models.js      procedural low-poly meshes
src/world.js       ground, roads, plots, decor and lights
src/fx.js          particles, flying items, pops and camera shake
src/audio.js       synthesized WebAudio sound effects and music
src/stack.js       the bouquet tower on a character's back
src/field.js       flower beds, cutting and regrowth
src/shop.js        counters, customers and cash piles
src/player.js      the farmer
src/workers.js     hired cutters, cashiers and tractors
src/pads.js        purchase pads
```

## Credits

3D rendering uses [Three.js](https://threejs.org/) (MIT License), vendored in
`vendor/`. See `vendor/THREE-LICENSE`.
