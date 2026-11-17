// Boot: pick the world, load its definition, scene and extra modules, build the engine,
// run the fixed-step loop. See docs/ENGINE.md for the boot sequence and the G object.
import * as THREE from 'three';
import { GAME, STEP, MAX_STEPS } from './engine/config.js';
import { WORLDS, worldInfo, isUnlocked, nextWorld } from './engine/worlds.js';
import { registerItem } from './engine/registry.js';
import './engine/items.js';
import './engine/pad-effects.js';
import { loadSave, writeSave, clearSave, sanitizeLevel } from './engine/save.js';
import { computeStats } from './engine/stats.js';
import { createEvents } from './engine/events.js';
import { createView } from './engine/view.js';
import { createLights } from './engine/lights.js';
import { preload } from './engine/art/assets.js';
import { createBlobShadows } from './engine/art/shadows.js';
import { applyWorldLooks, charactersFor, preloadCharacters, bindBlobs } from './engine/chars.js';
import { createStations } from './engine/stations/index.js';
import { createPads } from './engine/pads.js';
import { createPlayer } from './engine/player.js';
import { createWorkers } from './engine/workers/index.js';
import { createHints } from './engine/hints.js';
import { createLevel } from './engine/level.js';
import { createReveal } from './engine/reveal.js';

const params = new URLSearchParams(location.search);
const save = loadSave();

// ------------------------------------------------------------------ world
// ?world=<id> wins over the save's level, if that world is unlocked for this save (else the
// save's level if unlocked, else the first world). Dev and tests: ?world=<id>&unlock=1 skips the
// unlock check; ?worldUrl=<same-origin url of a world.js> loads a world from anywhere (it does not
// change the saved level).
async function importWorld(url) {
  const mod = await import(url.href);
  const def = mod && mod.default;
  if (!def || typeof def !== 'object' || !def.id) throw new Error(`${url.href} has no default-exported world definition`);
  for (const spec of def.modules || []) await import(new URL(spec, url).href);
  let sceneMod = null;
  if (def.scene === false) return { def, sceneMod, url };     // no scenery: bare ground
  try {
    sceneMod = await import(new URL(def.scene || './scene.js', url).href);
  } catch (err) {
    console.error(`[boot] scene for world '${def.id}' failed to load; using a bare ground:`, err);
  }
  return { def, sceneMod, url };
}

async function resolveWorld() {
  const devUrl = params.get('worldUrl');
  if (devUrl) {
    try {
      const u = new URL(devUrl, location.href);
      if (u.origin !== location.origin) throw new Error('worldUrl must be same-origin');
      return { ...(await importWorld(u)), dev: true };
    } catch (err) {
      console.error('[boot] worldUrl failed, falling back:', err);
    }
  }
  let id = params.get('world') || save.level || GAME.defaultWorld;
  if (!worldInfo(id)) {
    console.error(`[boot] unknown world '${id}', falling back to '${GAME.defaultWorld}'`);
    id = GAME.defaultWorld;
  }
  if (params.get('unlock') !== '1' && !isUnlocked(id, save.meta)) {
    const lvl = save.level;
    const to = worldInfo(lvl) && isUnlocked(lvl, save.meta) ? lvl : GAME.defaultWorld;
    console.warn(`[boot] world '${id}' is locked for this save; opening '${to}' (dev: add &unlock=1)`);
    id = to;
  }
  try {
    return await importWorld(new URL(`./worlds/${id}/world.js`, import.meta.url));
  } catch (err) {
    if (id === GAME.defaultWorld) throw err;
    console.error(`[boot] world '${id}' failed to load, falling back to '${GAME.defaultWorld}':`, err);
    return importWorld(new URL(`./worlds/${GAME.defaultWorld}/world.js`, import.meta.url));
  }
}

/** Fill defaults and normalise positions so every module sees one shape. */
function normaliseWorld(def) {
  const P = (p) => (Array.isArray(p) ? { x: p[0], z: p[1] } : p);
  def.stations = def.stations || [];
  def.pads = (def.pads || []).map((p) => ({ requires: [], big: false, ...p, pos: P(p.pos || p.at) }));
  def.items = def.items || [];
  def.player = { ...(def.player || {}) };
  if (def.player.start) def.player.start = P(def.player.start);
  def.bounds = def.bounds || { minX: -30, maxX: 30, minZ: -30, maxZ: 30 };
  def.name = def.name || (worldInfo(def.id) || {}).name || def.id;
  return def;
}

const loaded = await resolveWorld();
const def = normaliseWorld(loaded.def);
for (const it of def.items) registerItem(it);
if (!loaded.dev) save.level = def.id;
// how many pads each visited world has, so the world select can show how far along it is
if (!loaded.dev) {
  const totals = save.meta.padTotals && typeof save.meta.padTotals === 'object' ? save.meta.padTotals : (save.meta.padTotals = {});
  totals[def.id] = def.pads.filter((p) => p.cost > 0).length;
}

// ------------------------------------------------------------------ G
const view = createView(document.getElementById('game'), def.camera);
const G = {
  THREE,
  scene: view.scene, camera: view.camera, renderer: view.renderer, view,
  world: def,
  worldId: def.id,
  worlds: WORLDS,
  worldInfo, isUnlocked, nextWorld,
  save,
  meta: save.meta,
  state: sanitizeLevel(def, save.levels[def.id]),
  stats: null,
  time: 0,
  timeScale: 1,
  events: createEvents(),
  addMoney(n) { if (!(n > 0)) return; G.state.money += n; G.state.earned += n; save.meta.totalEarned += n; },
  spend(n) { if (!(n > 0)) return; G.state.money = Math.max(0, G.state.money - n); },
  audio: null, fx: null, input: null, hud: null, lights: null, stations: null, pads: null,
  scenery: null, player: null, workers: null, hints: null, level: null, reveal: null, thrills: null, progress: null,
};
save.levels[def.id] = G.state;
G.stats = computeStats(def, G.state.done, save.meta);
window.__game = G;
if (params.has('speed')) {
  const s = parseFloat(params.get('speed'));
  if (s > 0 && Number.isFinite(s)) G.timeScale = s;
}

/** Recompute G.stats and bring stations, workers and the player in line (after a purchase or a perk). */
G.refresh = (live) => {
  G.stats = computeStats(def, G.state.done, save.meta);
  if (G.progress) G.progress.applyStats(G.stats);   // the player level's price bonus
  if (G.thrills) G.thrills.applyStats();     // perks, boosts and fever lie over the pad stats
  if (G.stations) G.stations.sync(live);
  if (G.workers && G.workers.sync) G.workers.sync(live);
  if (G.player && G.player.sync) G.player.sync();
};

// ------------------------------------------------------------------ modules
// Optional modules are imported dynamically: one broken file degrades the game instead of killing it.
const noop = () => {};
const FALLBACK = {
  audio: () => ({ play: noop, haptic: noop, setMuted: noop, muted: false }),
  fx: () => ({
    shakeOffset: new THREE.Vector3(), update: noop, burst: noop, confetti: noop, ring: noop, popText: noop,
    fly(o) { if (o && o.onDone) { try { o.onDone(o.data, o.kind); } catch (e) { console.error(e); } } },
    pop: noop, popIn: noop, shake: noop,
  }),
  input: () => ({ x: 0, y: 0, active: false, override: null, update() { const o = this.override; if (o) { this.x = o.x; this.y = o.y; } } }),
  hud: () => ({ update: noop, setGoal: noop, toast: noop, showWin: noop, hideWin: noop }),
};
const LOADERS = {
  audio: () => import('./engine/audio.js').then((m) => m.createAudio),
  fx: () => import('./engine/fx.js').then((m) => m.createFx),
  input: () => import('./engine/input.js').then((m) => m.createInput),
  hud: () => import('./engine/hud.js').then((m) => m.createHud),
};
G.failed = [];
async function loadModule(name) {
  let mod = null;
  try { mod = (await LOADERS[name]())(G); } catch (err) { console.error(`[boot] module '${name}' failed:`, err); }
  if (!mod) { G.failed.push(name); mod = FALLBACK[name](); }
  G[name] = mod;
}
// fx builds its flying-item pools from item geometry, which may come from pack models, so it is
// created after the assets are loaded (below). Until then G.fx is the no-op fallback.
G.fx = FALLBACK.fx();
for (const name of Object.keys(LOADERS)) if (name !== 'fx') await loadModule(name);
if (G.audio && G.audio.setWorld) G.audio.setWorld(def.id);

// ------------------------------------------------------------------ assets
// world.assets = ['kit/model', ...] plus the character models the world's looks use. A missing model
// never blocks boot (the art kit logs one warning and shows a placeholder). Progress: G.events
// 'loading' (0..1), also shown on the title overlay's "tap" line.
applyWorldLooks(def);
const PRELOAD_TIMEOUT = 12000;
async function loadAssets() {
  const ids = [...new Set(def.assets || [])];
  const chars = charactersFor(def);
  const total = ids.length + chars.length;
  let done = 0;
  const tap = document.querySelector('#start .tap');
  const tapText = tap ? tap.textContent : '';
  const report = () => {
    const v = total ? done / total : 1;
    G.loading = v;
    G.events.emit('loading', v);
    if (tap) tap.textContent = v < 1 ? `LOADING ${Math.round(v * 100)}%` : tapText;
  };
  // a stalled request must not hold the title on LOADING: after PRELOAD_TIMEOUT the game starts
  // with the art kit's placeholder, which is swapped for the model if it arrives later
  const track = (p, what) => {
    let timer = 0;
    const timeout = new Promise((res) => {
      timer = setTimeout(() => { console.warn(`[boot] ${what} still loading after ${PRELOAD_TIMEOUT / 1000} s; starting with a placeholder`); res(); }, PRELOAD_TIMEOUT);
    });
    return Promise.race([Promise.resolve(p).catch((e) => console.warn('[boot] asset group failed:', e)), timeout])
      .then(() => { clearTimeout(timer); done++; report(); });
  };
  report();
  await Promise.all([
    ...ids.map((id) => track(preload(id), id)),
    ...chars.map((m) => track(preloadCharacters([m]), 'character ' + m)),
  ]);
  G.loading = 1;
}
await loadAssets();
await loadModule('fx');

view.bind(G);
G.blobs = createBlobShadows(G.scene, { max: 128 });
bindBlobs(G.blobs);
G.lights = createLights(G);
G.stations = createStations(G);
G.stations.sync(false);
G.pads = createPads(G);
try {
  G.scenery = loaded.sceneMod && loaded.sceneMod.createScene ? loaded.sceneMod.createScene(G) : null;
} catch (err) { console.error(`[boot] createScene for '${def.id}' failed:`, err); }
if (!G.scenery) {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7ccf5a }));
  ground.receiveShadow = true;
  G.scene.add(ground);
  G.scenery = { update: noop };
}
// progress (engine/progress): the player level and the standing mission. Before thrills, so the
// level's price bonus is part of the base that thrills lays its boosts over.
if (!params.has('noprogress')) {
  try {
    const { createProgress } = await import('./engine/progress/index.js');
    G.progress = createProgress(G);
  } catch (err) { console.error('[boot] progress failed:', err); G.failed.push('progress'); G.progress = null; }
}
// thrills (engine/thrills): events, fever, perks. Built before the player so its perks count for the
// saved stack; optional like the other extras (a failure leaves the plain game).
if (!params.has('nothrills') && !(def.thrills && def.thrills.off)) {
  try {
    const { createThrills } = await import('./engine/thrills/index.js');
    G.thrills = createThrills(G);
    if (G.hud && G.hud.refreshTitle) G.hud.refreshTitle();     // the title lists this world's perks
  } catch (err) { console.error('[boot] thrills failed:', err); G.failed.push('thrills'); G.thrills = null; }
}
G.player = createPlayer(G);
G.workers = createWorkers(G);
G.workers.sync(false);
G.hints = createHints(G);

// ------------------------------------------------------------------ saving
let noSave = false;
function saveNow() {
  if (noSave) return;
  const pl = G.player;
  if (pl && pl.pos) G.state.player = { x: +pl.pos.x.toFixed(3), z: +pl.pos.z.toFixed(3) };
  if (pl && pl.stack) G.state.carried = pl.stack.snapshot ? pl.stack.snapshot() : pl.stack.items.slice();
  G.state.stations = G.stations.serialize({});
  if (G.workers && G.workers.serialize) G.state.workers = G.workers.serialize({});
  save.levels[def.id] = G.state;
  writeSave(save);
}
G.saveNow = saveNow;

/** Save, then reload into world `id` (each world keeps its own progress). */
// Leaving for another world: a curtain closes, the page reloads into that world, and the next boot
// skips the title and opens with the world's name instead (engine/hud.js, mode 'intro').
function leaveTo(id) {
  const url = new URL(location.href);
  url.searchParams.set('world', id);
  url.searchParams.delete('worldUrl');
  try { sessionStorage.setItem('bloomrush.intro', '1'); } catch (e) { /* ignore */ }
  document.body.classList.add('leaving');
  setTimeout(() => { location.href = url.href; }, 320);       // presentation only: lets the curtain close
}

G.travel = (id) => {
  if (G.audio && G.audio.play) G.audio.play('travel');
  saveNow();
  if (worldInfo(id)) save.level = id;
  writeSave(save);
  noSave = true;
  leaveTo(id);
};
/** Start world `id` again from nothing (its level state is dropped; perks from finished worlds and best times stay). */
G.replay = (id) => {
  if (!worldInfo(id)) return;
  if (id !== def.id) saveNow();
  noSave = true;
  delete save.levels[id];
  save.level = id;
  writeSave(save);
  leaveTo(id);
};
setInterval(saveNow, 2000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);
G.events.on('win', () => { if (G.audio && G.audio.play) G.audio.play('perk'); });
G.events.on('reset', () => {
  noSave = true;
  clearSave();
  location.href = location.pathname;   // bare path: a fresh save starts in the first world
});

G.level = createLevel(G);
G.reveal = createReveal(G);                     // cinematics for pads with `reveal`
if (params.has('noreveal')) G.noReveal = true;
saveNow();   // persists a migrated / sanitised save right away

// ------------------------------------------------------------------ loop
const UPDATE_ORDER = ['input', 'player', 'stations', 'workers', 'pads', 'thrills', 'progress', 'scenery', 'fx', 'hud'];
// during a reveal (engine/reveal.js): first everything stands still while the new thing builds in,
// then the world runs again without the player until the camera is back
const CINE_FROZEN = ['pads', 'scenery', 'fx', 'hud'];
const CINE_RUN = ['stations', 'workers', 'pads', 'scenery', 'fx', 'hud'];
const errCount = {};
function step(dt) {
  G.time += dt;
  let order = UPDATE_ORDER;
  if (G.reveal) {
    try { G.reveal.update(dt); } catch (err) { console.error('[loop] reveal.update failed:', err); try { G.reveal.skip(); } catch (e) { /* ignore */ } }
    if (G.reveal.active) order = G.reveal.frozen ? CINE_FROZEN : CINE_RUN;
  }
  if (order !== CINE_FROZEN) { G.state.playTime += dt; save.meta.playTime += dt; }
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    const m = G[name];
    if (!m || !m.update) continue;
    try {
      m.update(dt);
    } catch (err) {
      errCount[name] = (errCount[name] || 0) + 1;
      if (errCount[name] <= 3) console.error(`[loop] ${name}.update failed:`, err);
    }
  }
}
G.step = step;

let last = performance.now();
let acc = 0;
G.frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let realDt = (now - last) / 1000;
  last = now;
  if (!(realDt > 0)) realDt = 0;
  if (realDt > 0.1) realDt = 0.1;
  if (!document.hidden) {
    acc += realDt * G.timeScale;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { step(STEP); acc -= STEP; n++; }
    if (n >= MAX_STEPS) acc = 0;
  }
  G.hints.frame(realDt);
  if (G.thrills) G.thrills.frame(realDt);
  view.frame(realDt);
  G.frames++;
}
requestAnimationFrame((t) => { last = t; frame(t); });
G.events.emit('ready', G);

// ------------------------------------------------------------------ autoplay
if (params.has('autoplay')) {
  import('./autoplay.js')
    .then((m) => { if (m && typeof m.startAutoplay === 'function') m.startAutoplay(G); })
    .catch((err) => console.error('[autoplay] unavailable:', err));
}
