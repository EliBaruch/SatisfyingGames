# Art kit (`src/engine/art/`)

Shared art foundation for the three worlds: CC0 model packs (Kenney, Quaternius) loaded and lit
in the game's look, animated characters, code-built modelling helpers, common props, blob shadows.
Everything draws with **one lit material family** so pack models, merged code-built geometry and
canvas ground textures look like they belong together.

```js
import { preload, getModel, getGeometry, getMesh, getSharedMaterial,
         LIGHTING, configureRenderer, createLights,
         preloadCharacters, makeCharacter, animateCharacter, LOOKS,
         Parts, createBlobShadows, makeCounter, makeZone, makeGround, tree } from '../engine/art/index.js';
```
(`index.js` re-exports every module below; importing the individual files works too.)

| file | what |
|---|---|
| `material.js` | the look (`getSharedMaterial`, `toLit`, `litMaterial`, gloss variants), `LIGHTING` preset, `configureRenderer`, `createLights` |
| `assets.js` | GLB loading and cache: `preload`, `getModel`, `getGeometry`, `getMesh`, `listLoaded`, `measure` |
| `shadows.js` | pooled blob contact shadows |
| `character.js` | animated Mini Characters, same API as the old code-built ones |
| `human.js` | human-proportioned characters (second rig, reached through `character.js`) |
| `parts.js` | `Parts` / `mergeParts` modelling helpers (rounded box, capsule, lathe, baked AO, `Parts.model`) |
| `props.js` | cash bundle, coin, counter, ground zone decal, ground textures, scenery kit |
| `bake.js` | low-level geometry merge + AO bake used by the above |

Dev gallery: `http://localhost:8100/dev/art-kit/index.html?view=<name>` (git-ignored). Views: `compare` (before/after),
`characters` (`&t=0.6` animation time, `&only=<row>`), `allchars`, `shop`, `farm`, `stack`, `vehicles`, `props`,
`ground`, `scenery`, `blobs` (on/off), `perf` (40 characters), `sheet&ids=a/b,c/d` (any models). Flags: `&zoom=<world units
visible vertically>`, `&cx=&cz=` focus, `&look.gamma=0.6&look.sat=1.2&look.wrap=.4&look.rim=.15&look.gain=1`, `&light.hemi=&light.sun=&light.fill=`.

---

## 1. Renderer and lights (do this first)

```js
import { configureRenderer, createLights, LIGHTING } from '../engine/art/index.js';

configureRenderer(renderer);                 // sRGB output, no tone mapping, PCFShadowMap, shadows on
scene.background = new THREE.Color(LIGHTING.background);
const lights = createLights(scene);          // hemisphere + sun (shadowed) + camera-side fill
// every rendered frame, before render():
lights.follow(player.x, player.z);           // shadow box follows the player, snapped to shadow texels (no shimmer)
```

`createLights(parent, { variant, shadow, shadows })`: `variant: LIGHTING.indoor` for the grocery interior (warmer, flatter),
`shadow: { extent: 12, mapSize: 1024 }` to override any shadow setting, `shadows: false` for none. Returns
`{ group, hemi, sun, fill, follow(x, z), setShadows(on) }`.

### `LIGHTING` (recommended values)

| light | value |
|---|---|
| background | `0x9fdcff` |
| hemisphere | sky `0xf1f8ff`, ground `0xdcebb4`, intensity **1.8** |
| sun (shadowed) | colour `0xfff3dc`, intensity **1.3**, direction to the sun `(9, 22, -8)` (shadows fall toward screen-right), placed 40 from its target |
| fill (no shadow) | colour `0xffe9f2`, intensity **0.7**, from `(-14, 12, -10)` (the camera side) |
| sun shadow | `mapSize 2048`, box half-size **17** (covers a portrait view around the player), near 1, far 90, `bias -0.0004`, `normalBias 0.035`, `radius 3.2`, `intensity 0.8` |
| reference grass | `LIGHTING.ground.grass = 0x58a948` (textured), `grassSolid = 0x4c9f3e` (flat plane) |

Light intensities here are physical-ish: a face needs about pi of total irradiance to show its full albedo; hemi + sun + fill
add up to ~3.1 on an upward face, ~2.2 on a camera-facing wall, and ~1.8 (hemisphere only) inside a shadow, so shadows are a
soft tinted 60 % rather than black. Shadow notes for r187: `PCFShadowMap` is the only soft mode (`PCFSoftShadowMap` is gone);
it takes 5 rotated taps and `shadow.radius` is the blur radius in shadow-map texels. 2048 over a 34-unit box is 1.7 cm/texel,
which keeps contact shadows clean on phones; do not enlarge the box (the shadow pass draws everything inside it).
All materials set `shadowSide = BackSide`, so lit faces never self-shadow (no acne, no peter-panning, no `bias` fiddling);
thin double-sided cards (grass) cast no shadow, which is fine.

### The look (what the material does)

`MeshLambertMaterial` patched with `onBeforeCompile` (same program for every variant: vertex colours, palette texture, flat
colour, ground canvas):
- **wrap-around diffuse** for sun and fill (`wrap = 0.42`): faces turned from the light fall off softly instead of going flat dark;
- **albedo grade** in linear space: saturation 1.18, exponent 0.62 (lifts mid-tones: the pack thumbnails are rendered "light and pastel"),
  gain 1.0. **Colours you write in code (`Parts`, `litMaterial({ color })`, ground colours) are pre-grade**: they come out lighter and
  slightly more saturated than the hex you typed, which is why colours ported from the old game look brighter;
- **soft rim** from the view-space normal (`rim = 0.16`), an even glow on silhouettes (the camera is orthographic);
- no specular, no environment map, no extra textures: about 20 ALU ops per pixel.

`LOOK` exports the live uniforms: `LOOK.gamma.value = 0.7` changes every material at once (gallery: `&look.gamma=0.7`).

```js
getSharedMaterial()                  // vertex-colour lit material, ONE instance for all merged/instanced geometry (drop-in for the old one)
toLit(packMaterial, { double })      // convert a pack material (palette texture / flat colour) -> lit, cached per texture+colour
litMaterial({ color, map, transparent, opacity, side, ... })   // a new lit material with any Lambert parameters (glass, decals, custom colours)
```
Do not use `MeshBasicMaterial` for solid objects (no shading) or any other Three material for scenery: it will not match.

---

## 2. Loading models (`assets.js`)

Model id = `<kit>/<name>` = the file `assets/<kit>/<name>.glb` (see the table at the end). Paths resolve relative to the module, so
the page location does not matter.

```js
await preload(['mini-shop/shelf-bags', 'food-kit/egg', 'car-kit/tractor']);   // parallel, never rejects
const shelf = getModel('mini-shop/shelf-bags');          // Group, lit, shadows on, origin = ground centre, kit-default scale
shelf.position.set(4, 0, -2);  scene.add(shelf);
const big = getModel('farmbuildings/Barn', { height: 5 });           // size by height / width / depth
const fit = getModel('mini-shop/freezer', { fit: [1.8, null, 0.9] }); // uniform scale to fit a box (null = don't care)
const geo = getGeometry('food-kit/egg', { height: 0.34 });            // one merged vertex-colour BufferGeometry
const eggs = new THREE.InstancedMesh(geo, getSharedMaterial(), 400);  // -> 1 draw call for 400 eggs
```

**`preload(ids)`** returns a promise of the ids that failed to load (normally `[]`). A missing/misspelled file logs one
`[art] model "x" could not be loaded` warning and everything keeps working: `getModel`/`getGeometry` return a pink placeholder
box, which is swapped for the real model in place if it later loads. Calling `getModel` before `preload` also works the same way (one warning).
`preloadGroups('chicken')` preloads a whole manifest group (dev convenience).

**Sizing options** (`getModel`, `getGeometry`, `getMesh`):

| option | meaning |
|---|---|
| *(none)* | natural size x `KIT_SCALE[kit]` so that all kits agree (see section 8) |
| `height` / `width` / `depth` | scale uniformly so that extent equals this (Y / X / Z) |
| `fit: [x, y, z]` or `fit: n` | uniform scale to fit inside the box; `null` entries are ignored |
| `scale` | extra multiplier (applied on top of any of the above, default 1) |
| `natural: true` | skip the kit scale: authored size |
| `rotY` | yaw in radians baked into the model's frame |
| `origin` | `'bottom'` (default: x/z centre, base on y = 0), `'center'`, `'top'`, `'back'` (base edge at z = 0), `'pivot'` (authored origin) |
| `shadow` / `receive` | `false` to turn casting / receiving off |
| `ao` (getGeometry/getMesh) | `true` or `{ ground, groundH, down }`: bake darkening at the base and under overhangs |

**`getModel(id, opts)`** returns a fresh `Group` you own (position/rotate/scale it freely; inside is one holder carrying the normalisation).
Static models are flattened to one mesh per material (usually 1-2 draw calls; the pack ships shelves as 9 separate meshes, we merge them), and all
instances share geometry and materials. Skinned/animated models are cloned with `SkeletonUtils.clone` (shared geometry, own skeleton): the group has
`userData.instance` (clone root = the AnimationMixer root) and `userData.clips`.

**`getGeometry(id, opts)`** flattens the model into one **non-indexed** geometry with `position`, `normal`, `color`: node transforms applied, the
palette texture sampled at every vertex UV (bilinear, KHR_texture_transform, multiple materials, flat base colours and vertex colours all handled),
sized and re-origined like `getModel`. Use it with `getSharedMaterial()` and `InstancedMesh` for anything numerous: stack items, field items, flying items,
cash. It is cached per id+options and **shared: never mutate or dispose it**. `geometry.userData.size` is the final size (Vector3). Translucent (glass) parts are skipped.
Texture detail finer than a vertex is lost (fine for the palette-textured kits; the hand-painted Quaternius `cutemonsters` textures would look muddy: not used).

**`getMesh(id, opts)`** = `new Mesh(getGeometry(...), getSharedMaterial())` with shadows set: the cheapest way to place static props (1 draw call, no texture).

Other: `isReady(id)`, `getClips(id)`, `info(id)` -> `{ triangles, size, skinned, clips, scale, drawCalls }`, `listLoaded()` -> `[{ id, state, ... }]`,
`measure(object3d)` -> `{ triangles, meshes, drawCalls }` (instances counted), `renderStats(renderer)`, `KIT_SCALE`, `recolor`.

Palette fixes: the Nature Kit's flat colours are pastel teal / peach; for a green meadow we rotate teal to leaf green, peach wood to tan and peach rock to warm
grey at load (`recolor` in `assets.js`). Other kits are untouched.

---

## 3. Characters (`character.js`)

Drop-in for the old code-built characters: same names, same signatures.

```js
await preloadCharacters();                       // models used by LOOKS + the customer pool (about 0.7 MB). preloadCharacters(['male-b']) or ('all') also work
const hero = makeCharacter(LOOKS.player);        // feet at origin, faces +Z, ~1.65 tall
scene.add(hero);
animateCharacter(hero, dt, { moving: true, speed: 1, carrying: false, action: null });   // once per fixed step
hero.userData.hands.right.add(item);             // anchors follow the hand bones (children use WORLD units)
```

- `look = { model, tool, scale }`. `model`: `'alien' 'female-a'..'female-f' 'knight' 'male-a'..'male-g' 'raider' 'robot' 'soldier' 'worker' 'zombie' 'employee'`
  (or a full id). `tool`: `null | 'scythe' | 'bucket' | 'basket'` (attached to the right hand). `scale`: 1 = 1.65 tall; heads/hair/hats add up to 0.3.
  **The pack's characters cannot be recoloured** (every model has its own painted palette), so variety comes from the 21 models.
- `LOOKS`: `player` (male-b, scythe), `cutter` (male-a, scythe), `cashier` / `employee` (employee), `farmer` (male-e, bucket), `collector` (female-b, basket),
  `stocker` (worker, hard hat). Add your own: `LOOKS.baker = { model: 'female-d', tool: null, scale: 1 }`. `randomCustomerLook()` picks one of 11 shopper models with 0.94-1.04 size variation.
- `animateCharacter(char, dt, { moving, speed = 1, carrying = false, action = null })`: idle / walk / sprint cycles blended by `moving` and `speed`
  (`speed` is relative to the normal run: 1 = sprint cycle, below ~0.6 = walk cycle, timescale follows it), `carrying` blends both arms to the pack's
  `holding-both` pose (arms out in front; stack on `userData.front`, or `userData.back`), `action: 'swing'` is a looping harvest sweep of the right arm with a torso twist
  (procedural, works while running), `action: 'wave'` raises the right arm. All transitions crossfade. No allocation per call.
- `userData`: `hands.left/right` (anchors at the hands; frame is "level": +Y up, +Z forward when the arm hangs in the idle pose), `back`, `front`, `head` (anchors),
  `tool`, `lod`.
- **Cost control**: set `char.userData.lod = true` for characters that are far off-screen: animation is skipped entirely. Otherwise the mixer is evaluated at most about
  once per rendered frame (10 ms wall-clock throttle, `ANIM.minInterval`) using the accumulated dt, however many 1/60 s steps ran, so `G.timeScale = 8` costs the same as 1.
  (Animation is purely visual; the throttle does not touch simulation state.) Body and head are merged into one skinned mesh at load: **1 draw call per character per pass**.
- If a model was not preloaded you get a placeholder box and `animateCharacter` is a no-op.

Measured (headless Chromium, software GL, 390x844 @2x, 40 animated characters in a 17-unit view with the sun shadow):
| | |
|---|---|
| draw calls (incl. shadow pass, ground) | **108** |
| triangles (incl. shadow pass) | **~70 k** (about 870 per character per pass) |
| `animateCharacter` CPU, 40 characters, mixer evaluated on every call | 0.77 ms / frame (1 step per frame) |
| same with the throttle, 1 step per frame | 0.61 ms / frame (headless frames take > 10 ms so the throttle barely skips; on a 60 fps phone it evaluates once per frame too) |
| same with the throttle, `timeScale` 4 (4 steps per frame) | 0.62 ms / frame (4 steps cost the same as 1; without it ~3 ms) |
| same, all flagged `lod` | 0.015 ms / frame |

Budget: **<= 25 animated characters in view** (50 draw calls, ~45 k tris with shadows) leaves room for the world; 40 is possible but uses most of the draw-call budget; flag far ones `lod`.

---

## 3b. Human-proportioned characters (`human.js`)

A second rig for worlds that want taller, realistic figures (the factory). Reached through the same
`makeCharacter` / `animateCharacter`: a look whose `model` is `animatedmen/<Name>` or `animatedwomen/<Name>`
(Quaternius Animated Men / Women, CC0) uses it.

```js
looks: { player: { model: 'animatedmen/Male_Casual', colors: { Shirt: 0xff7a1a, Pants: 0x25324a }, hat: 'hardhat', scale: 1, wide: 1.1 } }
```

- About 7 heads tall, **1.9 at scale 1** (`HUMAN_HEIGHT`), slim; `wide` thickens x/z a little so it reads from the camera.
- Models: `Male_Casual`, `Male_Shirt`, `Male_LongSleeve`, `Female_Casual`, `Female_TankTop`, `Female_Alternative`
  (1.8-2.8 k triangles; `Smooth_*` variants are 7-8 k and look the same at game distance). 31 bones.
- **One draw call each**: the pack ships one mesh per material slot (`Skin`, `Eyes`, `Hair`, `Shirt`, `Pants`, `Socks`,
  `HairBase`), all flat colours; they are baked into one vertex-colour skinned geometry per palette, so `colors`
  recolours any slot (overalls, uniforms) at no cost. Geometry is shared by every character with the same model and palette.
- Clips used: `*_Idle`, `*_Walk`, `*_Run`, blended by `moving` / `speed` like the mini characters.
- Poses are procedural on top of the clips: arm bones are aimed in character space. `carrying` holds both forearms
  level in front; `action: 'wave'`; `'work'` (both hands busy at a bench); `'swing'` (bent forward, reaching down:
  sweeping, picking).
- The stack is carried **in the hands, in front**, and turns with the body: `userData.carry = { offset, billboard: false }`
  is read by the player and the list-binding hauler. Set `world.player.perColumn` high so it stays one column.
- Anchors `userData.head` (top of the skull), `.hands`, `.front`, `.back` are level frames in world units. Hats
  `'hardhat' | 'hardhat-white' | 'hardhat-orange' | 'hardhat-blue'` are baked into the body's own skinned geometry
  (bound to the head bone), so a helmeted crew costs no extra draw calls.
- `shadow: false` on a look: no shadow-map shadow, blob shadow only (use it for crews).
- Cost: about 2 k triangles and one draw call per pass; keep 25-30 in view like the mini characters.

### Gloss (`material.js`)

`litMaterial({ gloss: 0.5, shine: 60, ... })`, `getGlossMaterial(gloss, shine)` (vertex colours, cached) and
`toLit(src, { gloss })` give the same look with a sun highlight and a cheap studio reflection (sky, a bright horizon
band, floor, picked by the reflected view ray): paint, metal, plastic. It is a separate program; the default
materials are unchanged. `LOOK.envSky / envHorizon / envGround` are the reflected colours.

### Parts of a model (`assets.js`)

`getGeometry(id, { ..., nodes: { key: 'body', test: (path) => !/wheel/.test(path) } })` bakes only the meshes whose
node path passes the test; sizing still uses the whole model, so separate pieces line up (a car body and its
wheels; a robot arm's base and its upper arm). `nodePosition(id, name, opts)` gives a node's position in the same
frame (a pivot).

## 4. Blob contact shadows (`shadows.js`)

```js
const blobs = createBlobShadows(scene, { max: 96 });
blobs.attach(hero, 0.55);                                  // circle, radius 0.55
blobs.attach(tractor, { rx: 1.0, rz: 1.8, yaw: true });    // ellipse turning with the object (yaw from its +Z axis)
blobs.attach(flyingItem, { rx: 0.3, lift: true });         // shrinks and fades with height
blobs.update();                                            // once per rendered frame
blobs.detach(customer);
```
One `InstancedMesh` (1 draw call), a soft radial-gradient quad at y = 0.03 per attached object, `depthWrite: false`. Cost: one matrix compose per object per frame; hidden
objects (any invisible ancestor) are skipped. `setEnabled(false)`, `setOpacity(v)` (default 0.34), `clear()`. Use radius ~ 0.35 x the object's footprint width. Blobs complement the real
shadow: keep them under characters, workers, animals and fragile props; skip them under things with a big real shadow footprint (buildings).

---

## 5. Code-built models (`parts.js`)

```js
const b = new Parts();
b.rbox(0xc98a4b, 1.2, 0.8, 3.4, 0.08, [0, 0.4, 0]);      // rounded box: color, w, h, d, radius, pos, rot, scl, seg
b.sph(0xffffff, 0.3, [0, 1, 0]);                         // smooth sphere (18x12 default)
b.cyl(0x58e0c4, 0.5, 0.5, 0.2, [0, 0.1, 0]);             // smooth cylinder (20 segments)
b.rcyl(0x58e0c4, 0.5, 0.2, 0.04, [0, 0.1, 0]);           // cylinder with rounded edges: radius, height, bevel
b.capsule(0xff8fb0, 0.2, 0.5, [0, 0.45, 0]);             // radius, straight length
b.lathe(0xffc233, [[0, 0], [0.3, 0], [0.2, 0.5], [0, 0.6]], [0, 0, 0]);   // profile [[radius, y]...]
b.torus(color, R, r, pos, rot, scl, arc); b.cone(...); b.box(...); b.ico(...); b.oct(...);   // box/ico/oct stay sharp/faceted on purpose
b.model('food-kit/egg', { pos: [0, 0.2, 0], height: 0.3, tint: 0xffffff });   // merge a pack model (preload it first)
const geo = b.merged({ ao: true });                      // ONE non-indexed geometry (position, normal, color)
scene.add(meshOf(geo, { receive: true }));               // Mesh + getSharedMaterial + shadows
```
Signatures of `add / box / sph / cyl / cone / ico / oct` are identical to the old `Parts` in `src/models.js`, so old model code ports unchanged (it just gets
smooth normals and higher default segment counts). Pass lower segment counts (`sph(color, r, pos, scl, rot, 10, 7)`, `cyl(..., 8)`) for things you instance hundreds of times.
`mergeParts(parts, opts)` is the same merge as a function. `roundedBoxGeometry(w, h, d, r, seg)` gives the raw geometry (`seg` 1 = 108 tris, 2 = 300).

`merged({ ao })` bakes ambient occlusion into the vertex colours: darker toward the ground (`ground` 0.22 over `groundH` 0.35), under overhangs (`down`), and where one part's
surface faces another part closely (`boxK`, `range`: crevices where a lid meets a body). `ao: true` uses the defaults; `ao: { noBoxes: true }` skips the part-to-part pass.
Keep `ao` on for big static pieces (counters, machines, monuments) and off for things already shaded by the pack.

---

## 6. Props (`props.js`)

| helper | |
|---|---|
| `makeCashBundleGeometry({ len, h, d })` | chunky banded green bundle with a paper band and a printed top note. Origin bottom-centre, default **0.62 x 0.16 x 0.38**; `CASH` exports the numbers, **stack step = `CASH.h` (0.16)**. Use with `InstancedMesh` + `getSharedMaterial()` |
| `makeCoinGeometry({ r, h })` | gold coin lying flat, r 0.2, h 0.055, origin bottom-centre |
| `makeCounter({ len = 3.4, depth = 1.2, h = 1.0, accent, wood, top, register })` | rounded shop counter Group, long axis Z, customer side +X, optional cash register at the +Z end |
| `makeZone({ w, d, label, sub, color, fill, subColor })` | ground decal Mesh: rounded rectangle, glowing cyan-white dashed outline, bold outlined label. **Reads upright from the game camera** (text "up" -> world +x,+z). Unlit, y = 0.04, `userData.setLabel(label, sub)`, `userData.setActive(on)`. `px` = canvas pixels per unit (170) |
| `groundTexture(kind, { color, size, seed })` / `makeGround(kind, w, d, { color, tile })` | tileable canvas textures `'grass' 'wood' 'tile' 'paving' 'soil'`; `makeGround` returns a lit plane centred on the origin that receives shadows (default colours in `LIGHTING.ground`; **colours are pre-grade**) |
| `tree({ kind, height })` | `round oak fat small pine` (Nature Kit, recoloured leaf green) and `forest tall` (Mini Forest, pastel sage); default height 4.2 |
| `bush({ kind, width })` | `plain large detailed`, width 1.4 |
| `rock({ kind, width })` | `large big small pebble tall`, width 1.6 |
| `fence(len, { style, h })` | along +X from x = 0 to `len`, ground level, one merged mesh; `simple` or `planks`, height 1.0 |
| `flowerPot({ flower, size })` | pot + bloom, ~0.8 tall |
| `SCENERY_IDS` | the model ids the scenery helpers need: `preload(SCENERY_IDS)` first |

Scenery helpers return a ready `Mesh` (one draw call, shared geometry and material); position them yourself. They are all in the `common` manifest group (plus `fence_simple`, `fence_planks`).

---

## 7. Adding models

1. Find the model in the kit metadata (`id` like `food-kit/egg`, `farmbuildings/Silo`; browse `https://huggingface.co/datasets/codepawl/kenney-glb` / `quaternius-glb`, thumbnails in `thumbs/`).
2. Add `{ "source": "kenney", "id": "food-kit/egg" }` (or `"quaternius"`) to the right group (`common`, `flower`, `chicken`, `grocery`) in `assets/manifest.json`. Optional `"as": "newname"` renames the file.
3. Run **`node tools/fetch-assets.mjs`** from the repo root (optionally `flower common` to limit groups, `--force` to re-download, `--engine` for the larger un-compressed tier).
   It uses `curl -L` (works through the sandbox proxy); if curl is missing it falls back to Node fetch, which needs `NODE_USE_ENV_PROXY=1 node tools/fetch-assets.mjs` behind the proxy.
   Existing files are skipped, every download is checked for the `glTF` magic, sizes are printed, and `assets/LICENSES.md` is rewritten.
4. Commit the new `assets/<kit>/<name>.glb` files and the updated manifest + `LICENSES.md`.

Web-tier files use meshopt compression, WebP textures and `KHR_mesh_quantization`; `GLTFLoader` + `MeshoptDecoder` from the `addons` import map entry handle them.
Budget: under ~3 MB of assets per world. Current: 143 models, 2.26 MiB (2.37 MB) total; `common` 1.41 MB (21 characters = 1.3 MB of that), `flower` +0.12, `chicken` +0.50, `grocery` +0.35 MB, so every world loads under 2 MB.

---

## 8. Scale and size reference

World units: 1 unit = 1 m, Y up, character about 1.65.

| category | recommended size (x, y, z) | how |
|---|---|---|
| character | 1.55-1.7 body (hair and hats up to 1.95) | `makeCharacter` (kit scale 2.3 on the 0.67-0.72 models) |
| shelf (`mini-shop/shelf-bags/boxes`) | 1.9 x **2.1** x 1.7 | default (x2.4) |
| shelf end cap | 1.9 x 2.5 x 1.0 | default |
| freezer (low) / standing freezers | 1.9 x 0.8 x 1.4 / 2.4 x 2.2 x 1.15 | default |
| cash register unit | 2.2 x 1.4 x 2.0 | default |
| display tables (fruit, bread, cans) | 1.4 x 1.2 x 1.4 | default |
| shopping cart / basket / hand truck | 0.84 x 0.93 x 1.28 / 0.84 x 0.6 x 0.84 / 0.9 x 1.3 x 0.88 | default |
| counter (code-built) | 1.2 deep x **1.0 high** x 3.4 long | `makeCounter()` |
| food as scenery / shelf stock | egg 0.4 high, carton 1.4 high, loaf 1.4 long | default (x2.4) |
| food as stack item | egg 0.3-0.36 high, carton 0.4-0.5 high, bread 0.5 wide, cash bundle 0.62 x 0.16 x 0.38 | `getGeometry(id, { height })` (bread: `width`) |
| tractor | 1.7 wide x 2.1 high x **2.9 long** | default (x1.3) |
| delivery truck / van / pickup | 1.95 x 2.1 x **4.2** / 1.95 x 1.75 x 3.6 / 1.95 x 1.7 x 3.8 | default (x1.3) |
| factory parts (conveyor tile, machine, hopper) | tile 1.5 x 0.6 x 1.5, machine 1.8 x 1.95 x 2.25, hopper 1.7 x 1.5 x 1.7 | default (x1.5) |
| farm buildings (Quaternius) | barn 4.25 x 3.3 x 4.5, silo 2.0 x **5.0** x 1.9, open barn 3.2 x 2.6 x 3.4, windmill 3.6 x 6.2 | default (x0.55); the coop (1.3 x 1.0 x 1.2) is small: use `scale: 1.5` |
| animals (`cube-pets`) | chick 0.9 wide x 0.67 high, cow / pig ~0.65 | default (x0.42) |
| trees | 3.5-5 high | `tree({ height })` |
| bushes / rocks / pots | 0.7-1.4 wide | `bush()` / `rock()` / `flowerPot()` |
| fences | 1.0 high | `fence(len)` |

`KIT_SCALE` (exported from `assets.js`): `mini-characters 2.3`, `mini-shop 2.4`, `mini-forest 2.4`, `food-kit 2.4`, `nature-kit 2.4`, `cube-pets 0.42`, `car-kit 1.3`, `factory-kit 1.5`,
`farmbuildings 0.55`, `ultimatecrops 2.4`, `simplenature 0.55`. The "default size" column below already includes it.

Kenney models face +Z with their origin at the base centre; Quaternius buildings face +Z too. The camera looks from (-14, 18, -14): a model with `rotY = -3 * Math.PI / 4` turns its +Z face to the camera;
a long object (fence, conveyor) runs along the screen-right axis with `rotY = -3 * Math.PI / 4` (its +X axis -> world (-1, 0, +1)/sqrt 2) and along screen-up with `rotY = -Math.PI / 4`.

---

## 9. Performance guidance

- Budget per view: ~150 draw calls, ~250 k triangles including the shadow pass (every shadow caster is drawn twice).
- **Draw calls come from distinct meshes, not triangles.** Merge: use `getMesh` / `Parts.merged` for static scenery, `InstancedMesh` for repeated things (all with `getSharedMaterial()`, so they also share one program).
- `getModel` is for things that need their own transform tree, animation clips, or a pack texture (characters, animals, doors); use `getMesh` for the rest.
- Numerous things (stack items, field crops, eggs, cash, flying items): `getGeometry` + `InstancedMesh` with the shared material. 30-high stacks of the stack-view items are 1 draw call each (egg 44 tris x 30...).
- Triangle costs: character ~800 (x2 with shadow), shelf 700-1100, truck 2.0-2.5 k, barn 2.9 k, tractor 2.0 k, tree 100-400, egg 44, carton 94, bread 116, loaf 116.
- Turn off `castShadow` on small, low or far things (`getModel(id, { shadow: false })`, `mesh.castShadow = false`): items below ankle height rarely need a real shadow once a blob is there.
- Textures: palette atlases are 512 px; each character model has its own palette (~1 MB of GPU memory per distinct character model). Preload only the characters a world uses.
- `lights.follow(x, z)` once per frame; do not move the sun target otherwise. The shadow map re-renders every frame (autoUpdate); for a static indoor scene you can set `renderer.shadowMap.autoUpdate = false` and `needsUpdate = true` when something static changes.

---

## 10. Known limits

- Pack characters cannot be recoloured; 21 distinct models only. A few are not shopper-like (zombie, robot, alien, knight, raider, soldier, pirate `male-g`, police `male-c`): excluded from `randomCustomerLook`.
- `getGeometry` samples colour per vertex: the palette kits are fine, painted textures (Quaternius `cutemonsters`, `farmanimal`) lose their detail and look muddy even with `getModel`; avoid them (`farmanimal` and `cutemonsters` are not in the manifest).
- Transparent materials: `getGeometry` skips panes below 35 % opacity; `getModel` keeps `transparent` but sorting is the usual Three sorting. Use `litMaterial({ transparent: true, opacity })` for custom glass.
- Single-sided: pack materials are converted to front-faces only. Card-like plants (`grass*`, `flower_*`, flags...) are kept double-sided by name pattern (`DOUBLE_SIDED` in `assets.js`); for anything else that shows holes use `getModel(id, { material: toLit(src, { double: true }) })`... or tell the art-kit owner.
- Skinned characters have no LOD mesh and no instancing: they are the draw-call budget (1 per character per pass).
- The carry pose is the pack's `holding-both` (arms forward). Procedural poses (`swing`, `wave`) rotate the right arm only; an item held in the right hand while waving moves with it.
- Blob shadows are flat discs on y = 0: they do not follow slopes; the world is flat.
- Zone decals are unlit canvas textures (blurry if scaled up much beyond `px`); redraws (`setLabel`) allocate a canvas upload, so call them when text changes, not per frame.
- Ground textures are 256 px canvases that repeat every 3-6 units: use `makeGround(kind, w, d, { tile })` to change density.
- No teardown: models, materials and textures live for the page (a world switch reloads the page).
- Headless tests: `performance.now()` is used only for the animation throttle (`ANIM.minInterval`; set 0 to evaluate every call deterministically).

---

## 11. Available models
Natural size is as authored (x, y, z). "default size" is after the kit scale (what `getModel(id)` gives). Worlds: `all` = common group (every world), `flo` / `chi` / `gro`.

#### Mini Characters (Kenney) - `mini-characters` - default scale x2.3

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `character-alien` | 926 | 0.767 x 0.698 x 0.34 | 1.76 x 1.6 x 0.78 | all | skinned, 32 clips |
| `character-female-a` | 924 | 1.099 x 0.776 x 0.5 | 2.53 x 1.78 x 1.15 | all | skinned, 32 clips |
| `character-female-b` | 790 | 0.767 x 0.723 x 0.419 | 1.76 x 1.66 x 0.96 | all | skinned, 32 clips |
| `character-female-c` | 780 | 0.767 x 0.776 x 0.5 | 1.76 x 1.78 x 1.15 | all | skinned, 32 clips |
| `character-female-d` | 845 | 0.767 x 0.776 x 0.5 | 1.76 x 1.78 x 1.15 | all | skinned, 32 clips |
| `character-female-e` | 804 | 0.767 x 0.716 x 0.527 | 1.76 x 1.65 x 1.21 | all | skinned, 32 clips |
| `character-female-f` | 836 | 0.767 x 0.671 x 0.441 | 1.76 x 1.54 x 1.01 | all | skinned, 32 clips |
| `character-knight` | 780 | 0.767 x 0.814 x 0.485 | 1.76 x 1.87 x 1.12 | all | skinned, 32 clips |
| `character-male-a` | 771 | 0.767 x 0.671 x 0.34 | 1.76 x 1.54 x 0.78 | all | skinned, 32 clips |
| `character-male-b` | 686 | 0.767 x 0.661 x 0.389 | 1.76 x 1.52 x 0.9 | all | skinned, 32 clips |
| `character-male-c` | 837 | 0.767 x 0.793 x 0.461 | 1.76 x 1.82 x 1.06 | all | skinned, 32 clips |
| `character-male-d` | 759 | 0.767 x 0.722 x 0.34 | 1.76 x 1.66 x 0.78 | all | skinned, 32 clips |
| `character-male-e` | 758 | 0.767 x 0.676 x 0.342 | 1.76 x 1.55 x 0.79 | all | skinned, 32 clips |
| `character-male-f` | 749 | 0.767 x 0.671 x 0.34 | 1.76 x 1.54 x 0.78 | all | skinned, 32 clips |
| `character-male-g` | 877 | 0.767 x 0.671 x 0.399 | 1.76 x 1.54 x 0.92 | all | skinned, 32 clips |
| `character-raider` | 880 | 0.767 x 0.716 x 0.527 | 1.76 x 1.65 x 1.21 | all | skinned, 32 clips |
| `character-robot` | 870 | 0.768 x 0.845 x 0.322 | 1.77 x 1.94 x 0.74 | all | skinned, 32 clips |
| `character-soldier` | 947 | 0.767 x 0.755 x 0.592 | 1.76 x 1.74 x 1.36 | all | skinned, 32 clips |
| `character-worker` | 893 | 0.767 x 0.824 x 0.464 | 1.76 x 1.9 x 1.07 | all | skinned, 32 clips |
| `character-zombie` | 703 | 0.767 x 0.671 x 0.34 | 1.76 x 1.54 x 0.78 | all | skinned, 32 clips |

#### Mini Shop (Kenney) - `mini-shop` - default scale x2.4

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `character-employee` | 794 | 0.767 x 0.723 x 0.419 | 1.84 x 1.74 x 1 | all | skinned, 32 clips |
| `display-flowers` | 1712 | 0.8 x 0.632 x 0.8 | 1.92 x 1.52 x 1.92 | flo |  |
| `shelf-bags` | 1116 | 0.8 x 0.863 x 0.7 | 1.92 x 2.07 x 1.68 | gro |  |
| `shelf-boxes` | 724 | 0.8 x 0.85 x 0.7 | 1.92 x 2.04 x 1.68 | gro |  |
| `shelf-end` | 492 | 0.8 x 1.05 x 0.4 | 1.92 x 2.52 x 0.96 | gro |  |
| `display-bread` | 462 | 0.7 x 0.5 x 0.6 | 1.68 x 1.2 x 1.44 | gro |  |
| `display-cans` | 1228 | 0.8 x 0.9 x 0.8 | 1.92 x 2.16 x 1.92 | gro |  |
| `display-fruit` | 650 | 0.6 x 0.516 x 0.6 | 1.44 x 1.24 x 1.44 | gro |  |
| `freezer` | 172 | 0.8 x 0.338 x 0.6 | 1.92 x 0.81 x 1.44 | gro |  |
| `freezers-standing` | 196 | 1 x 0.9 x 0.48 | 2.4 x 2.16 x 1.15 | gro |  |
| `cash-register` | 340 | 0.9 x 0.591 x 0.85 | 2.16 x 1.42 x 2.04 | gro |  |
| `shopping-basket` | 296 | 0.35 x 0.25 x 0.35 | 0.84 x 0.6 x 0.84 | gro |  |
| `shopping-cart` | 480 | 0.35 x 0.386 x 0.533 | 0.84 x 0.93 x 1.28 | gro |  |
| `hand-truck` | 334 | 0.373 x 0.547 x 0.368 | 0.9 x 1.31 x 0.88 | gro |  |
| `floor` | 2 | 1 x 0 x 1 | 2.4 x 0 x 2.4 | gro |  |
| `floor-wood` | 2 | 1 x 0 x 1 | 2.4 x 0 x 2.4 | gro |  |
| `wall` | 50 | 1 x 1 x 0.6 | 2.4 x 2.4 x 1.44 | gro |  |
| `wall-corner` | 110 | 0.8 x 1 x 0.8 | 1.92 x 2.4 x 1.92 | gro |  |
| `wall-window` | 228 | 1 x 1 x 0.6 | 2.4 x 2.4 x 1.44 | gro |  |
| `column` | 198 | 0.726 x 1 x 0.726 | 1.74 x 2.4 x 1.74 | gro |  |

#### Mini Forest (Kenney) - `mini-forest` - default scale x2.4

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `tree` | 182 | 0.927 x 1.684 x 0.883 | 2.23 x 4.04 x 2.12 | all |  |
| `tree-high` | 266 | 0.927 x 2.284 x 0.883 | 2.23 x 5.48 x 2.12 | all |  |
| `stones` | 236 | 0.904 x 0.454 x 0.852 | 2.17 x 1.09 x 2.05 | all |  |
| `fence` | 330 | 1.096 x 0.4 x 0.246 | 2.63 x 0.96 x 0.59 | flo |  |
| `patch-grass` | 295 | 1 x 0.171 x 1 | 2.4 x 0.41 x 2.4 | flo |  |
| `patch-dirt` | 108 | 1 x 0.1 x 1 | 2.4 x 0.24 x 2.4 | chi |  |

#### Food Kit (Kenney) - `food-kit` - default scale x2.4

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `egg` | 44 | 0.116 x 0.165 x 0.134 | 0.28 x 0.4 x 0.32 | all |  |
| `carton` | 94 | 0.23 x 0.591 x 0.23 | 0.55 x 1.42 x 0.55 | all |  |
| `bread` | 116 | 0.442 x 0.04 x 0.366 | 1.06 x 0.1 x 0.88 | all |  |
| `apple` | 136 | 0.196 x 0.191 x 0.196 | 0.47 x 0.46 x 0.47 | all |  |
| `orange` | 120 | 0.17 x 0.167 x 0.17 | 0.41 x 0.4 x 0.41 | all |  |
| `egg-cup` | 84 | 0.158 x 0.15 x 0.183 | 0.38 x 0.36 x 0.44 | chi |  |
| `bag` | 46 | 0.22 x 0.6 x 0.412 | 0.53 x 1.44 x 0.99 | chi |  |
| `barrel` | 308 | 0.76 x 0.679 x 0.679 | 1.82 x 1.63 x 1.63 | chi |  |
| `bottle-oil` | 96 | 0.14 x 0.622 x 0.14 | 0.34 x 1.49 x 0.34 | chi |  |
| `corn` | 128 | 0.343 x 0.316 x 0.3 | 0.82 x 0.76 x 0.72 | chi |  |
| `loaf` | 116 | 0.58 x 0.442 x 0.366 | 1.39 x 1.06 x 0.88 | gro |  |
| `loaf-baguette` | 122 | 0.83 x 0.25 x 0.25 | 1.99 x 0.6 x 0.6 | gro |  |
| `croissant` | 162 | 0.346 x 0.194 x 0.478 | 0.83 x 0.46 x 1.15 | gro |  |
| `pear` | 136 | 0.196 x 0.271 x 0.196 | 0.47 x 0.65 x 0.47 | gro |  |
| `broccoli` | 220 | 0.375 x 0.422 x 0.375 | 0.9 x 1.01 x 0.9 | gro |  |
| `paprika` | 132 | 0.168 x 0.199 x 0.168 | 0.4 x 0.48 x 0.4 | gro |  |
| `soda-can` | 164 | 0.225 x 0.351 x 0.225 | 0.54 x 0.84 x 0.54 | gro |  |
| `can` | 156 | 0.3 x 0.32 x 0.3 | 0.72 x 0.77 x 0.72 | gro |  |
| `carton-small` | 74 | 0.23 x 0.391 x 0.23 | 0.55 x 0.94 x 0.55 | gro |  |
| `donut` | 108 | 0.245 x 0.089 x 0.283 | 0.59 x 0.21 x 0.68 | gro |  |
| `cheese` | 576 | 0.68 x 0.22 x 0.68 | 1.63 x 0.53 x 1.63 | gro |  |

#### Cube Pets (Kenney) - `cube-pets` - default scale x0.42

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `animal-chick` | 490 | 2.196 x 1.594 x 1.35 | 0.92 x 0.67 x 0.57 | chi | clips: static, idle, walk |
| `animal-cow` | 578 | 1.539 x 1.612 x 1.46 | 0.65 x 0.68 x 0.61 | chi | clips: static, idle, walk |
| `animal-pig` | 424 | 1.25 x 1.584 x 1.46 | 0.53 x 0.67 x 0.61 | chi | clips: static, idle, walk |

#### Car Kit (Kenney) - `car-kit` - default scale x1.3

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `tractor` | 2044 | 1.342 x 1.602 x 2.202 | 1.74 x 2.08 x 2.86 | chi |  |
| `delivery` | 2476 | 1.5 x 1.65 x 3.25 | 1.95 x 2.14 x 4.22 | chi |  |
| `truck` | 2082 | 1.5 x 1.3 x 2.95 | 1.95 x 1.69 x 3.83 | chi |  |
| `wheel-tractor-back` | 428 | 0.538 x 0.875 x 0.875 | 0.7 x 1.14 x 1.14 | chi |  |
| `box` | 124 | 0.715 x 0.715 x 0.715 | 0.93 x 0.93 x 0.93 | chi |  |
| `van` | 2082 | 1.5 x 1.35 x 2.75 | 1.95 x 1.75 x 3.58 | gro |  |
| `delivery-flat` | 2574 | 1.5 x 1.35 x 3.25 | 1.95 x 1.75 x 4.22 | gro |  |

#### Factory Kit (Kenney) - `factory-kit` - default scale x1.5

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `conveyor` | 196 | 1 x 0.4 x 1 | 1.5 x 0.6 x 1.5 | chi |  |
| `conveyor-long` | 196 | 2 x 0.4 x 1 | 3 x 0.6 x 1.5 | chi |  |
| `conveyor-sides` | 228 | 1 x 0.4 x 1 | 1.5 x 0.6 x 1.5 | chi |  |
| `conveyor-corner` | 234 | 1 x 0.45 x 1 | 1.5 x 0.67 x 1.5 | chi |  |
| `hopper-round` | 144 | 1.118 x 1 x 1.118 | 1.68 x 1.5 x 1.68 | chi |  |
| `machine` | 268 | 1.2 x 1.3 x 1.5 | 1.8 x 1.95 x 2.25 | chi |  |
| `machine-window` | 428 | 1.2 x 1.29 x 1.5 | 1.8 x 1.93 x 2.25 | chi |  |
| `pipe-large` | 248 | 1 x 1 x 1 | 1.5 x 1.5 x 1.5 | chi |  |
| `pipe-large-curve` | 332 | 1.502 x 1 x 1.246 | 2.25 x 1.5 x 1.87 | chi |  |
| `screen-small` | 126 | 0.6 x 0.991 x 0.499 | 0.9 x 1.49 x 0.75 | chi |  |
| `box-large` | 70 | 1.1 x 0.55 x 1 | 1.65 x 0.83 x 1.5 | chi |  |
| `box-small` | 70 | 0.595 x 0.55 x 0.5 | 0.89 x 0.83 x 0.75 | chi |  |
| `button-floor-round` | 92 | 0.5 x 0.15 x 0.5 | 0.75 x 0.22 x 0.75 | chi | clips: toggle-on, toggle-off, toggle |
| `indicator-special-arrow` | 15 | 1 x 0 x 1 | 1.5 x 0 x 1.5 | chi |  |
| `box-wide` | 70 | 0.595 x 0.55 x 1 | 0.89 x 0.83 x 1.5 | gro |  |
| `box-long` | 70 | 1.1 x 0.55 x 0.5 | 1.65 x 0.83 x 0.75 | gro |  |
| `conveyor-stripe` | 244 | 1 x 0.4 x 1 | 1.5 x 0.6 x 1.5 | gro |  |
| `screen-wide` | 144 | 1.2 x 0.991 x 0.488 | 1.8 x 1.49 x 0.73 | gro |  |
| `indicator-special-area` | 18 | 1 x 0 x 1 | 1.5 x 0 x 1.5 | gro |  |
| `door-wide-open` | 16 | 1.8 x 0.78 x 0.3 | 2.7 x 1.17 x 0.45 | gro |  |

#### Nature Kit (Kenney) - `nature-kit` - default scale x2.4

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `tree_default` | 114 | 0.755 x 1.708 x 0.654 | 1.81 x 4.1 x 1.57 | all |  |
| `tree_oak` | 196 | 0.641 x 1.226 x 0.74 | 1.54 x 2.94 x 1.78 | all |  |
| `tree_fat` | 50 | 0.755 x 1.15 x 0.654 | 1.81 x 2.76 x 1.57 | all |  |
| `tree_small` | 62 | 0.355 x 1.11 x 0.41 | 0.85 x 2.66 x 0.98 | all |  |
| `tree_pineTallA` | 78 | 0.386 x 1.53 x 0.392 | 0.93 x 3.67 x 0.94 | all |  |
| `plant_bush` | 32 | 0.396 x 0.244 x 0.396 | 0.95 x 0.59 x 0.95 | all |  |
| `plant_bushLarge` | 60 | 0.374 x 0.243 x 0.336 | 0.9 x 0.58 x 0.81 | all |  |
| `plant_bushDetailed` | 104 | 0.603 x 0.36 x 0.603 | 1.45 x 0.86 x 1.45 | all |  |
| `fence_simple` | 64 | 1 x 0.345 x 0.07 | 2.4 x 0.83 x 0.17 | all,flo,chi |  |
| `fence_planks` | 96 | 1 x 0.345 x 0.096 | 2.4 x 0.83 x 0.23 | all,flo |  |
| `flower_purpleA` | 76 | 0.159 x 0.242 x 0.181 | 0.38 x 0.58 x 0.43 | all |  |
| `flower_redA` | 76 | 0.159 x 0.292 x 0.181 | 0.38 x 0.7 x 0.43 | all |  |
| `flower_yellowA` | 76 | 0.159 x 0.192 x 0.181 | 0.38 x 0.46 x 0.43 | all |  |
| `grass` | 132 | 0.381 x 0.254 x 0.392 | 0.91 x 0.61 x 0.94 | all |  |
| `rock_largeA` | 80 | 0.785 x 0.26 x 1.015 | 1.88 x 0.62 x 2.44 | all |  |
| `rock_largeD` | 80 | 1.069 x 0.568 x 1.03 | 2.57 x 1.36 x 2.47 | all |  |
| `rock_smallA` | 16 | 0.361 x 0.191 x 0.361 | 0.87 x 0.46 x 0.87 | all |  |
| `rock_smallD` | 32 | 0.426 x 0.231 x 0.369 | 1.02 x 0.55 x 0.88 | all |  |
| `rock_tallA` | 136 | 0.983 x 0.996 x 0.683 | 2.36 x 2.39 x 1.64 | all |  |
| `pot_large` | 68 | 0.564 x 0.2 x 0.488 | 1.35 x 0.48 x 1.17 | all |  |
| `pot_small` | 72 | 0.323 x 0.268 x 0.28 | 0.78 x 0.64 x 0.67 | all |  |
| `fence_gate` | 524 | 1 x 0.345 x 0.07 | 2.4 x 0.83 x 0.17 | flo |  |
| `log_stack` | 184 | 0.425 x 0.346 x 0.71 | 1.02 x 0.83 x 1.7 | flo |  |
| `crops_dirtRow` | 44 | 1 x 0.05 x 0.62 | 2.4 x 0.12 x 1.49 | flo |  |
| `tree_thin` | 228 | 0.68 x 1.49 x 0.617 | 1.63 x 3.58 x 1.48 | flo |  |
| `tree_oak_fall` | 196 | 0.641 x 1.226 x 0.74 | 1.54 x 2.94 x 1.78 | flo |  |
| `crops_wheatStageA` | 720 | 0.54 x 0.335 x 0.447 | 1.3 x 0.8 x 1.07 | chi |  |
| `crops_cornStageD` | 300 | 0.442 x 1.25 x 0.442 | 1.06 x 3 x 1.06 | chi |  |
| `crops_dirtDoubleRow` | 88 | 1 x 0.05 x 0.938 | 2.4 x 0.12 x 2.25 | chi |  |
| `path_stone` | 136 | 1 x 0.05 x 0.577 | 2.4 x 0.12 x 1.38 | chi |  |

#### Farm Buildings (Quaternius) - `farmbuildings` - default scale x0.55

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `ChickenCoop` | 948 | 2.407 x 1.851 x 2.154 | 1.32 x 1.02 x 1.18 | chi |  |
| `Silo` | 1592 | 3.668 x 9.069 x 3.51 | 2.02 x 4.99 x 1.93 | chi |  |
| `Barn` | 2910 | 7.727 x 6.008 x 8.222 | 4.25 x 3.3 x 4.52 | chi |  |
| `OpenBarn` | 1612 | 5.744 x 4.744 x 6.182 | 3.16 x 2.61 x 3.4 | chi |  |
| `Fence` | 188 | 5.89 x 1.097 x 0.165 | 3.24 x 0.6 x 0.09 | chi |  |
| `Fence2` | 324 | 5.89 x 1.173 x 0.165 | 3.24 x 0.65 x 0.09 | chi |  |
| `Windmill` | 1440 | 6.508 x 11.196 x 1.897 | 3.58 x 6.16 x 1.04 | chi |  |

#### Ultimate Crops (Quaternius) - `ultimatecrops` - default scale x2.4

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `Flower_2` | 42 | 0.084 x 0.412 x 0.05 | 0.2 x 0.99 x 0.12 | flo |  |
| `Flower_3` | 152 | 0.194 x 0.507 x 0.199 | 0.47 x 1.22 x 0.48 | flo |  |
| `Flower_4` | 230 | 0.292 x 0.821 x 0.293 | 0.7 x 1.97 x 0.7 | flo |  |
| `Flowers_Crop` | 134 | 0.292 x 0.116 x 0.293 | 0.7 x 0.28 x 0.7 | flo |  |
| `Flowers_Harvested` | 100 | 0.193 x 0.715 x 0.067 | 0.46 x 1.72 x 0.16 | flo |  |
| `Grass_3` | 112 | 0.374 x 0.795 x 0.282 | 0.9 x 1.91 x 0.68 | flo |  |
| `BushBerries_3` | 164 | 1.275 x 0.744 x 1.108 | 3.06 x 1.79 x 2.66 | flo |  |

#### Simple Nature (Quaternius) - `simplenature` - default scale x0.55

| id | tris | natural size (x,y,z) | default size | worlds | notes |
|---|---|---|---|---|---|
| `Bush1` | 86 | 1.074 x 1.491 x 1.074 | 0.59 x 0.82 x 0.59 | flo |  |
| `Tree1` | 390 | 2.067 x 4.099 x 2.988 | 1.14 x 2.25 x 1.64 | flo |  |
