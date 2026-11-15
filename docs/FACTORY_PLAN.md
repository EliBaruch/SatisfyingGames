# World 4: the Gigafactory — plan

## Context

Bloom Rush has three worlds (Flower Farm → Chicken Farm → Grocery Store) on a shared vanilla-JS + Three.js r187 engine. A parallel session is finalising those. The next stage is a fourth world that is deliberately a level up: a factory that starts with the player working alone at a bench and grows, pad by pad, into an automated battery-and-car gigafactory. Same play feel as the flower and grocery worlds (walk, carry, drop, pay into pads, hire help, frequent small wins), but with taller human-proportioned characters, a much bigger space and better lighting.

Decisions already made with the owner: next world in the same game and save file; product is batteries first, then cars; same walk-carry-manage loop; build starts by scheduled task at 04:00 Israel time on 16 November 2026, on a branch.

Nothing is built now. This plan is the brief for the scheduled run.

**Update, evening of 15 November.** The parallel session has finished: the finished game is on `claude/clever-allen-0k86le` (the repository's default branch, commit `cabd414`) and live at https://bloom-rush-game.netlify.app (Netlify project `bloom-rush-game`, deployed by upload, not linked to git). The owner has given permission for the scheduled run to push, merge and deploy once its checks pass. See "Release" below.

## What the research settled

| Question | Answer | Why |
|---|---|---|
| Engine | Stay on Three.js r187 with `WebGLRenderer` (already vendored, already the latest release) | WebGPURenderer is still reported 2x+ slower on many-mesh scenes; Babylon/PlayCanvas would mean a rewrite |
| Characters | Quaternius **Animated Men / Animated Women** packs (CC0): realistic proportions, ~1.9k tris (or ~8k "Smooth" variants), clips Idle / Walk / Run / Clapping / Sitting / Standing / Punch. Plus Quaternius **Animated Robot** (3.2k tris, Walking / Running / Wave / ThumbsUp) for the automation phase | Verified present in the Hugging Face mirror the repo's `tools/fetch-assets.mjs` already downloads from |
| Better characters later | Quaternius Universal Base Characters + Universal Animation Library are the nicer pick, but itch.io / quaternius.com are blocked from this environment | The rig adapter below makes them a drop-in swap if the owner allows that host or adds the zip |
| Factory art | Kenney Factory Kit (143 pieces: conveyors, robot arms, pistons, cranes, catwalks, pipes, hoppers, scanners, structure walls), City Kit Industrial (buildings, chimneys, tanks, containers, solar panels), Car Kit (sedan, suv, truck-flat, delivery, wheels, car parts), all CC0 and in the mirror | Only 20 factory-kit and 7 car-kit pieces are in the repo today |
| Missing art | No CC0 stamping press, paint booth or AGV exists | Build them in code with the existing `Parts` helpers + Kenney pistons/structure pieces |
| Look upgrade | Tone mapping + image-based lighting (`RoomEnvironment`) + PBR metal/paint material, larger camera-following shadow, distance fog, optional bloom on capable devices only | Biggest visual jump per GPU cost; post-processing is the expensive part on phones so it is gated |
| Extra libraries | Only three.js example modules (`RoomEnvironment`, `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass`, `BufferGeometryUtils`), bundled into `vendor/three-addons.min.js`; `gltf-transform` at build time only | npm registry is reachable. No physics, pathfinding, tween, particle or audio library is needed: the engine's own `fx.js`, synth `audio.js` and a hand-authored lane graph cover it |
| Mixamo / Synty / Ready Player Me | Not used | Mixamo and Synty forbid redistributing raw files in a public repo; Ready Player Me shut down in January 2026 |

Known unknowns the build must check first (I have only seen thumbnails and metadata): the Quaternius rig's bone names, whether its materials can be tinted per part, and how the low-poly vs Smooth variants look in-engine.

## Visual reference from the owner

The owner sent three videos as the look and feel to aim for:
- https://www.youtube.com/shorts/lJUrHtyG028 and https://www.youtube.com/shorts/vXVBPdqyzjg — Township's walk-and-carry mini-games (ids `lJUrHtyG028`, `vXVBPdqyzjg`).
- https://www.youtube.com/watch?v=4C-xDg2_LOs — a "Tiles Survive!" ad game about skimming spilled oil off the sea and selling it as fuel cans (id `4C-xDg2_LOs`).

Still frames can be re-fetched for reference from `https://i.ytimg.com/vi/<id>/<name>.jpg`: `oar1`, `oar2`, `oar3`, `maxresdefault` for the two Shorts; `maxres1`, `maxres2`, `maxres3`, `maxresdefault` for the third. `www.youtube.com` and `i.ytimg.com` are allowed in the environment. Look at them before the look test. They are another studio's art: use them as a style target only, do not commit them to the repo and do not copy its characters, logo or specific models.

What the frames show, and what to carry over to the factory:

| In the reference | In the factory world |
|---|---|
| Player is tall and slim (about 6-7 heads), in overalls, and fills roughly a sixth of the screen height | Prefer the Quaternius "Smooth" variants for the player; perspective camera set closer than the current worlds at the start, pulling back as the factory grows |
| Ground is richly textured: grass with tufts and pebbles, dirt pens with a raised stone curb, soft contact shadows | No flat single-colour floors. Canvas-generated detail textures (sealed concrete with scuffs, painted lane lines, hazard stripes, asphalt, grass outside), raised curbs around work areas, baked AO and blob shadows |
| Vehicles are chunky, rounded and glossy | Glossy PBR paint with the environment map on vans, trucks, AGVs and finished cars |
| Each truck has an order bubble above it (item icon and count) | Order bubbles above vans, trucks and the car carrier showing what they want and how many |
| Work zones are dashed cyan outlines; a big 3D arrow bobs over the next place to go; cash sits on green pad decals | Restyle zone markers, the hint arrow and cash pads to this language for the factory |
| Very tall carried stacks that sway; a crowd of customers queuing; a "SELL" pad at a counter | Keep tall swaying stacks; trucks queue on the road as demand grows |
| Warm, saturated colour with soft shadows | Warm key light, tone mapping tuned for saturation, soft shadow radius |

From the third video (oil clean-up), which is a flatter, simpler low-poly style and the closest to what the free model packs can reach:

| In the reference | In the factory world |
|---|---|
| The raw material is gathered by sweeping over it: the boat wipes black oil off the sea and the clean blue water is revealed behind it | Stage 1 starts with a sweep-to-collect raw material outside the garage (a scrap and ore yard) using the existing `source` station, so the first minute is tactile. A sweeper vehicle on the existing `harvester` role automates it later. The cleared ground should look visibly different from the uncleared ground |
| "MAX" pops over the player when the load is full, "+1" pops per unit collected | Same pops through `fx.popText` |
| Two counters in the HUD: cash and the product | Cash plus the current product count (packs, later cars) |
| Upgrade pad drawn on the floor with its price on it and a yellow arrow bobbing above | Matches the existing pads; make the arrow larger and brighter |
| Cash lies loose on the concrete where it was earned; fuel cans are stacked in neat blocks; rusty trucks on the road each show an order bubble | Loose cash scatter at the sales point, neat product blocks at shipping, order bubbles on trucks |

Expect a clear step up from the current worlds, not a match for a studio's hand-made art: the models are free low-poly packs, so the gain comes from proportions, camera, lighting, textured surfaces and gloss.

## Game design

Working name **Volt Works** (`id: 'factory'`, unlocked by finishing `grocery`). No real brands.

Loop is unchanged: goal line always shows the next pad, pads cost seconds-to-a-minute early on, every purchase adds something visible. About 60 pads, 30-40 minutes to the finale, in five stages. Each stage gate is a big pad that extends the building, pulls the camera back a notch and plays a build-in animation.

| Stage | What the player sees | New mechanics |
|---|---|---|
| 1. Garage | Sweep up scrap and ore in the yard, carry it to the one bench in a small garage, carry finished battery packs to the van, grab cash | Existing `source`, `converter`, `vendor`, `cashpile`. Pads: bigger stack, faster bench, first worker, second worker, second bench |
| 2. Workshop | Walls move out. A cell machine makes cells from raw material; two pack benches; delivery truck replaces the van | Chained converters; operators (workers who stand at a machine and speed it up) |
| 3. First line | First conveyor belt carries packs to shipping, so a hauler is freed. Robot arm loads the truck | New `belt` station; robot-arm prop driven by station events |
| 4. Car line | A second hall opens. Steel becomes body panels in a press, bodies get painted, and a moving line assembles body + battery pack + wheels into a car that drives off to the lot. Car carrier pays big | New `line` station (staged assembly on a moving skid), `lot` + carrier; cars are never hand-carried |
| 5. Automation → Gigafactory | AGVs replace human haulers, robot arms take over line stages, overhead belts feed the line, a second and third car line, solar roof, parade of finished cars at the finale | New `agv` worker role; `stage` pad effect; finale `win` pad |

Small-win devices on top of the pad chain: cash arcs and number pops as today; a production-rate chip (packs/min, cars/min) that visibly climbs; a stage progress bar (Garage → Workshop → Line → Plant → Gigafactory); timed bonus "rush order" trucks that pay extra if filled before they leave. Money runs into millions, so `fmtMoney` gains B and T.

Out of scope for this build (follow-ups): offline earnings, prestige / second site, restyling the three older worlds.

## Engine work

All additions are opt-in per world, so the three existing worlds render and play exactly as before and merging with the parallel session's work stays simple.

**Characters: rig adapter.** `src/engine/art/character.js` hard-codes the Kenney rig (`BONES`, `HAND_X`, clip names `idle`/`walk`/`sprint`/`holding-both`, track names, `KIT_SCALE`, `CHARACTER_HEIGHT`). Add `src/engine/art/rigs.js` with one descriptor per kit: bone-name map, clip-name map, world scale, hand/back/head anchor offsets, carry pose, stack offset, blob radius. `makeCharacter` / `animateCharacter` read the descriptor; `kenney-mini` is the default so nothing else changes. The public contract in `src/engine/chars.js` (`makeCharacter`, `animateCharacter`, `userData.{hands,back,front,head,lod}`) stays as is. Carried-stack offsets in `player.js`, `workers/hauler.js`, `workers/hauler-multi.js` come from the rig instead of the literal `{0, 0.55, -0.42}`. Factory looks: coverall tint, code-built hard hat and hi-vis vest via the existing `hat` mechanism in `chars.js`.

**Graphics tier 2.** New world field `graphics: { tier: 2, ... }`, read in `src/engine/view.js` and `src/engine/art/material.js`:
- `configureRenderer` gets tone mapping and exposure for tier 2 only.
- New `src/engine/art/material2.js`: `pbrMaterial()` (MeshStandard + PMREM `RoomEnvironment`) for machines, floors, cars; `toLit` stays for the old worlds.
- `createLights` already takes `shadow: {extent, mapSize}` per world; the factory uses a larger extent sized to the camera view, and static machines are receive-only.
- Scene fog matched to the hall background.
- Bloom (welding, screens, glowing cells) through `EffectComposer`, enabled only when the adaptive-quality check in `view.js` shows headroom; off by default on phones.
- Rebuild `vendor/three-addons.min.js` from `three@0.187.0` with the extra modules listed above.

**Camera.** `view.js` gains `camera.type: 'perspective'` (narrow FOV, same isometric direction so `player.js` input mapping is untouched) and `setZoom(level, dur)`; the `stage` pad effect drives it. Orthographic remains the default.

**New station types** (registered through `registerStationType`, composed from `createStore` / `pickupCap` / `receiveCap` in `src/engine/stations/kit.js`, following `pile.js` and `converter.js`):
- `belt` — polyline path, one InstancedMesh item lane, takes from a station's output and delivers to another's `receive`, speed stat, backs up visibly when the target is full.
- `line` — N stages on a moving skid; each stage has a recipe fed through a normal `drop` zone (so the player, haulers, belts and AGVs can all feed it); the car advances when a stage completes; output goes to a `lot`.
- `lot` — parked finished cars + a carrier on the existing `vendor` schedule that pays onto a `cashpile`.

**Workers.** `operator` role (stands at a station, raises its speed stat, plays the work animation); `agv` role (the `hauler-multi` planner with a rigid instanced vehicle body instead of a skinned character). Optional `world.nav` lane graph (hand-placed nodes, A*) used by haulers and AGVs so they follow aisles instead of the current straight-line seek; worlds without `nav` keep today's behaviour.

**Scale limits to lift.** Blob shadow cap 128 → sized from the world (`src/main.js`); human workers capped around 25-30 on screen, with growth beyond that coming from rigid robots, AGVs and belts, which are instanced and cheap; `lodCharacter` already hides off-screen characters.

**Pad effect `stage`.** Registered with `registerPadEffect`: reveals a scenery group with a drop-in animation, widens `bounds`, sets camera zoom, advances the HUD stage bar, switches the music layer.

**HUD / audio / save.** `hud.js` + `styles.css`: factory card icon and colour, rate chip, stage bar. `audio.js`: a factory music variation and sounds (press, weld, belt hum, servo, horn) in the existing synth. `save.js`: belts and lines serialise counts, not per-item state. `engine/worlds.js`: add the world; grocery's `travel` pad and `finale.next` point to `factory`.

**New world files.** `src/worlds/factory/world.js` (data, in the style of `src/worlds/grocery/world.js` with its `dock` / `pad` helper pattern), `scene.js` (halls, yard, road, build-in groups), `models.js` (battery cell, pack, body panel, wheel, press, paint booth, AGV built with `Parts`).

**Assets.** Extend `assets/manifest.json` with a `factory` group and `KITS` in `tools/fetch-assets.mjs` (`animatedmen`, `animatedwomen`, `animatedrobot`, `city-kit-industrial`, more `factory-kit` and `car-kit`); the script regenerates `assets/LICENSES.md`. Budget about 5 MB for the factory group, loaded only for this world.

**Docs.** Update `docs/ENGINE.md`, `docs/STATIONS.md`, `docs/ART.md`, `README.md` for the new pieces.

## Build order for the scheduled run

Each phase ends with a commit pushed to the branch, so a partial night still leaves something playable.

1. **Sync.** Fetch origin and merge `origin/claude/clever-allen-0k86le` (the finished game) into `claude/cool-bell-lrnnw1` before anything else. Run the three existing playtests once to record the baseline.
2. **Probe and look test.** Download the factory asset group; dump the Quaternius rig (bones, clips, materials); render the player and a worker next to a Kenney character and a machine in a test scene; pick low-poly vs Smooth from screenshots.
3. **Rig adapter + tier-2 graphics + camera**, proven on a bare factory floor with the new player walking and carrying.
4. **Stage 1-2 playable** using only existing station types, with autoplay reaching the workshop gate.
5. **`belt`, operators, robot arm** → stage 3.
6. **`line`, `lot`, carrier** → stage 4.
7. **`agv`, lane graph, `stage` effect, hall expansions** → stage 5 and the finale.
8. **Pacing and polish**: pad costs tuned from the autoplay timeline, HUD chips, music, sounds, effects, world-select card, docs.

## Verification

- `python3 -m http.server 8100`, open `?world=factory&unlock=1`.
- `node tools/playtest.js --world=factory` (extend `src/autoplay.js` for the new station types): must reach the win pad; use the unlock timeline to check no gap between pads exceeds about 90 s early and about 3 min late.
- Playwright screenshots (Chromium is preinstalled) at each stage gate, portrait and landscape, reviewed by eye for the look.
- Performance at the finale with 4x CPU throttling: `renderer.info` under about 200 draw calls and 400k triangles in view, frame time under 24 ms at the stepped-down pixel ratio, bloom auto-disabled when it is not.
- Regression: `tools/playtest.js` for `flower`, `chicken`, `grocery` still reaches the win, and screenshots of those worlds are unchanged.
- Save round trip: reload mid-stage 3 and mid-stage 5 and confirm belts, lines, workers and stage restore.

## Release (owner-approved: push, merge, deploy)

The run works on `claude/cool-bell-lrnnw1` and pushes there after every phase. It merges and deploys only when all of these gates pass:

1. `tools/playtest.js --world=factory` reaches the win pad.
2. `tools/playtest.js` for `flower`, `chicken` and `grocery` still reaches the win, and their screenshots match the baseline taken in phase 1.
3. No console errors on load of any world; save round trip works; the finale meets the performance budget above.
4. The factory screenshots have been looked at and the world is presentable at every stage.

When the gates pass:

1. **Merge.** Merge any new commits from `origin/claude/clever-allen-0k86le` into the factory branch, rerun gates 1-3, then fast-forward `claude/clever-allen-0k86le` (the default branch) to the factory branch and push. No pull request.
2. **Deploy.** Upload that commit to the Netlify project `bloom-rush-game` (site id `854c80d9-26b0-4c2b-8f9f-9f1278f50979`) as production, using the Netlify deploy tool.
3. **Check live.** Load https://bloom-rush-game.netlify.app in Playwright: the title screen, one old world and `?world=factory&unlock=1` all start without errors.
4. **Rollback.** The production deploy before this work is `6afa2b95cda6ba208e9da816`. If the live check fails, say so in the report and restore that deploy (republish it in Netlify's deploy list, or redeploy commit `cabd414`).

If the gates do not pass by the end of the run, nothing is merged or deployed. The work stays on `claude/cool-bell-lrnnw1` and the report says which gate failed and why. A world that is playable but not finished is not released half-done.

## After approval of this update (tonight, before 04:00)

1. Update `docs/FACTORY_PLAN.md` on `claude/cool-bell-lrnnw1` with this version and push.
2. Update the existing one-time scheduled task "Build the factory world" (04:00 Israel time, 16 November) so its instructions include the merge and deploy steps and gates above in place of the old "do not merge or deploy" limits.
3. The run ends with a report: phases done, gate results, whether it merged and deployed, the live URL, screenshots of each stage, and what is left.
