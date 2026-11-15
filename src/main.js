// Bloom Rush — boot, game loop, camera, goal hints and wiring between modules.
import * as THREE from 'three';
import * as CFG from './config.js';
import { load, save, clear } from './save.js';

const { CAMERA, FARMS, FLOWERS, WORLD, PADS, computeStats } = CFG;
const STEP = 1 / 60;
const MAX_STEPS = 40;

// ------------------------------------------------------------------ renderer
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // r187 removed PCFSoftShadowMap (it falls back to PCF with a warning)

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fdcff);
const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);

function resize() {
  const w = window.innerWidth || 1, h = window.innerHeight || 1;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const aspect = w / h;
  const view = aspect < 1 ? CAMERA.viewPortrait : CAMERA.viewLandscape;
  camera.top = view / 2;
  camera.bottom = -view / 2;
  camera.left = (-view * aspect) / 2;
  camera.right = (view * aspect) / 2;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// ------------------------------------------------------------------ G
function createEvents() {
  const map = new Map();
  return {
    on(name, fn) { if (!map.has(name)) map.set(name, []); map.get(name).push(fn); },
    off(name, fn) { const a = map.get(name); if (!a) return; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
    emit(name, payload) {
      const a = map.get(name);
      if (!a || !a.length) return;
      const list = a.slice();
      for (let i = 0; i < list.length; i++) {
        try { list[i](payload); } catch (err) { console.error(`[bloomrush] '${name}' handler failed:`, err); }
      }
    },
  };
}

const G = {
  THREE, scene, camera, renderer,
  cfg: CFG,
  state: load(),
  stats: null,
  time: 0,
  timeScale: 1,
  events: createEvents(),
  addMoney(n) { if (!(n > 0)) return; G.state.money += n; G.state.earned += n; },
  spend(n) { if (!(n > 0)) return; G.state.money = Math.max(0, G.state.money - n); },
  audio: null, fx: null, world: null, fields: null, shops: null, player: null, workers: null, pads: null, hud: null, input: null,
};
G.stats = computeStats(G.state.done);
window.__game = G;

const params = new URLSearchParams(location.search);
if (params.has('speed')) {
  const s = parseFloat(params.get('speed'));
  if (s > 0 && Number.isFinite(s)) G.timeScale = s;
}

// ------------------------------------------------------------------ fallbacks
const noop = () => {};
const FALLBACK = {
  audio: () => ({ play: noop, haptic: noop, setMuted: noop, muted: false }),
  fx: () => ({
    shakeOffset: new THREE.Vector3(), update: noop, burst: noop, confetti: noop, ring: noop, popText: noop,
    fly(o) { if (o && o.onDone) { try { o.onDone(); } catch (e) { console.error(e); } } },
    pop: noop, popIn: noop, shake: noop,
  }),
  input: () => ({ x: 0, y: 0, active: false, override: null, update() { const o = this.override; if (o) { this.x = o.x; this.y = o.y; } } }),
  hud: () => ({ update: noop, setGoal: noop, toast: noop, showWin: noop }),
  world: () => {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(-10, 20, -6);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7ccf5a }));
    scene.add(ground);
    return { update: noop };
  },
  fields: () => ({ get: () => null, update: noop }),
  shops: () => ({ get: () => null, update: noop }),
  player: () => {
    const group = new THREE.Group();
    return { pos: new THREE.Vector3(G.state.player.x, 0, G.state.player.z), vel: new THREE.Vector3(), speed01: 0, group, stack: null, update: noop };
  },
  workers: () => ({ update: noop }),
  pads: () => ({ update: noop, next: () => null, visible: () => [] }),
};

// Modules are imported dynamically so one missing or broken file degrades the game instead of killing it.
const LOADERS = {
  audio: () => import('./audio.js').then((m) => m.createAudio),
  fx: () => import('./fx.js').then((m) => m.createFx),
  input: () => import('./input.js').then((m) => m.createInput),
  hud: () => import('./hud.js').then((m) => m.createHud),
  world: () => import('./world.js').then((m) => m.createWorld),
  fields: () => import('./field.js').then((m) => m.createFields),
  shops: () => import('./shop.js').then((m) => m.createShops),
  player: () => import('./player.js').then((m) => m.createPlayer),
  workers: () => import('./workers.js').then((m) => m.createWorkers),
  pads: () => import('./pads.js').then((m) => m.createPads),
};
const ORDER = ['audio', 'fx', 'input', 'hud', 'world', 'fields', 'shops', 'player', 'workers', 'pads'];
const UPDATE_ORDER = ['input', 'player', 'fields', 'shops', 'workers', 'pads', 'world', 'fx', 'hud'];

const factories = await Promise.all(ORDER.map((name) => LOADERS[name]().catch((err) => {
  console.error(`[bloomrush] FAILED TO LOAD module '${name}':`, err);
  return null;
})));
G.failed = [];
ORDER.forEach((name, i) => {
  const create = factories[i];
  let mod = null;
  if (typeof create === 'function') {
    try { mod = create(G); } catch (err) { console.error(`[bloomrush] FAILED TO CREATE module '${name}':`, err); }
  } else if (factories[i] !== null) {
    console.error(`[bloomrush] module '${name}' has no create function`);
  }
  if (!mod) { G.failed.push(name); mod = FALLBACK[name](); }
  G[name] = mod;
});

// ------------------------------------------------------------------ hint arrow
const arrow = new THREE.Group();
{
  const mat = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x6b4a00 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.95, 4), mat);
  cone.rotation.x = Math.PI;
  cone.rotation.y = Math.PI / 4;
  cone.position.y = 0.48;
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.42), mat);
  shaft.position.y = 1.3;
  shaft.rotation.y = Math.PI / 4;
  cone.castShadow = shaft.castShadow = true;
  arrow.add(cone, shaft);
  arrow.visible = false;
  scene.add(arrow);
}
const pointer = new THREE.Group();
{
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.55);
  shape.lineTo(0.42, -0.1);
  shape.lineTo(0.16, -0.02);
  shape.lineTo(0, -0.28);
  shape.lineTo(-0.16, -0.02);
  shape.lineTo(-0.42, -0.1);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2); // shape +y -> world -z
  geo.rotateY(Math.PI);      // tip -> world +z
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 4;
  pointer.add(m);
  pointer.visible = false;
  scene.add(pointer);
}
const hint = { text: '', has: false, x: 0, z: 0, h: 0, t: 0, nearR: 2 };

function newestFarm() {
  let n = 0;
  for (let i = 0; i < FARMS.length; i++) if (G.stats.farms[i]) n = i;
  return n;
}

function setHint(text, x, z, nearR = 2) {
  hint.text = text; hint.has = true; hint.x = x; hint.z = z; hint.nearR = nearR;
}

function computeHint() {
  const hud = G.hud;
  if (G.state.won || G.stats.won) { hint.has = false; hint.text = ''; hud.setGoal(''); return; }
  const pl = G.player;
  const st = pl && pl.stack;
  const carried = st ? st.count + st.incoming : 0;
  const cap = st ? st.capacity : 1;
  const pads = G.pads;
  const nextPad = pads && pads.next ? pads.next() : null;
  const money = G.state.money;

  // is the bed the player works nearly empty?
  let bedLow = false;
  if (G.fields && pl) {
    for (let f = 0; f < FARMS.length; f++) {
      const fl = G.fields.get(f);
      if (!fl || !fl.active) continue;
      const b = fl.bounds;
      if (pl.pos.x > b.minX - 4 && pl.pos.x < b.maxX + 4 && pl.pos.z > b.minZ - 4 && pl.pos.z < b.maxZ + 4) {
        if (fl.grownCount < fl.total * 0.15) bedLow = true;
      }
    }
  }
  if (carried > 0 && (carried >= cap * 0.6 || bedLow || (st && st.room <= 0))) {
    let farmIdx = -1;
    if (st && st.items.length) {
      const t = st.items[st.items.length - 1];
      farmIdx = FARMS.findIndex((fm) => fm.flower === t && G.stats.farms[fm.idx]);
    }
    if (farmIdx < 0) {
      let bd = Infinity;
      for (let f = 0; f < FARMS.length; f++) {
        if (!G.stats.farms[f]) continue;
        const d = Math.hypot(FARMS[f].sellZone.x - pl.pos.x, FARMS[f].sellZone.z - pl.pos.z);
        if (d < bd) { bd = d; farmIdx = f; }
      }
    }
    const z = FARMS[Math.max(0, farmIdx)].sellZone;
    setHint('Bring flowers to SELL', z.x, z.z, z.r);
  } else if (nextPad && money >= nextPad.cost - (G.state.paid[nextPad.id] || 0)) {
    setHint('Buy: ' + nextPad.label, nextPad.pos.x, nextPad.pos.z, CFG.PAD.radius);
  } else {
    let best = -1, bestCash = 0;
    for (let f = 0; f < FARMS.length; f++) {
      const c = G.state.cash[f] || 0;
      if (G.stats.farms[f] && c > bestCash) { bestCash = c; best = f; }
    }
    const need = nextPad ? nextPad.cost - (G.state.paid[nextPad.id] || 0) - money : Infinity;
    if (best >= 0 && (bestCash >= 20 || bestCash >= need * 0.25)) {
      const p = FARMS[best].cashPile;
      setHint('Grab your cash!', p.x, p.z, p.r + 0.6);
    } else {
      const f = newestFarm();
      const b = FARMS[f].bed;
      setHint(`Cut the ${FLOWERS[FARMS[f].flower].name.toLowerCase()}!`, (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2,
        Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 1);
      // inside the bed: no arrow needed
      if (pl && pl.pos.x > b.minX - 1 && pl.pos.x < b.maxX + 1 && pl.pos.z > b.minZ - 1 && pl.pos.z < b.maxZ + 1) hint.nearR = 1e9;
    }
  }
  hud.setGoal(hint.text);
}

function updateHintVisuals(realDt) {
  hint.t += realDt;
  const pl = G.player;
  if (!hint.has || !pl) { arrow.visible = false; pointer.visible = false; return; }
  const dx = hint.x - pl.pos.x, dz = hint.z - pl.pos.z;
  const d = Math.hypot(dx, dz);
  const near = d < hint.nearR;
  arrow.visible = !near;
  if (arrow.visible) {
    const bob = Math.abs(Math.sin(hint.t * 4.2));
    arrow.position.set(hint.x, 2.2 + bob * 0.7, hint.z);
    arrow.rotation.y = hint.t * 1.6;
    const sq = 1 + (1 - bob) * 0.12;
    arrow.scale.set(sq, 2 - sq, sq);
  }
  pointer.visible = !near && d > 7;
  if (pointer.visible) {
    const ux = dx / d, uz = dz / d;
    const r = 1.9 + Math.sin(hint.t * 6) * 0.15;
    pointer.position.set(pl.pos.x + ux * r, 0.09, pl.pos.z + uz * r);
    pointer.rotation.y = Math.atan2(ux, uz);
  }
}

// ------------------------------------------------------------------ events
const TOAST = {
  cashier: () => 'CASHIER HIRED!',
  cutter: () => 'CUTTER HIRED!',
  tractor: () => 'TRACTOR UNLOCKED!',
  farm: (p) => p.label + ' OPEN!',
  win: () => 'GRAND GREENHOUSE!',
};
const glide = { t: 0, dur: 0, x: 0, z: 0 };

G.events.on('unlock', ({ pad, effect } = {}) => {
  if (!pad) return;
  const type = effect && effect.type;
  const text = TOAST[type] ? TOAST[type](pad) : pad.label + '!';
  G.hud.toast(text);
  const hire = type === 'cashier' || type === 'cutter';
  G.audio.play(hire ? 'hire' : pad.big ? 'bigUnlock' : 'unlock');
  const p = { x: pad.pos.x, y: 0.2, z: pad.pos.z };
  G.fx.confetti(p, pad.big ? 110 : 60);
  G.fx.ring(p, { color: 0xffe14d, radius: pad.big ? 4.5 : 3, life: 0.7 });
  if (pad.big) G.fx.shake(0.35, 0.35);
  // glide the camera to a far-away new thing
  let tx = pad.pos.x, tz = pad.pos.z;
  if (type === 'farm') { tx = FARMS[effect.farm].origin.x; tz = FARMS[effect.farm].origin.z; }
  else if (type === 'tractor') { tx = FARMS[effect.farm].tractorPark.x; tz = FARMS[effect.farm].tractorPark.z; }
  else if (type === 'win') { tx = WORLD.greenhouse.x; tz = WORLD.greenhouse.z; }
  if (pad.big && G.player && Math.hypot(tx - G.player.pos.x, tz - G.player.pos.z) > 10) {
    glide.t = 0; glide.dur = 1.6; glide.x = tx; glide.z = tz;
  }
  saveNow();
});

G.events.on('win', () => {
  G.state.won = true;
  hint.has = false;
  G.hud.setGoal('');
  G.audio.play('win');
  const gh = WORLD.greenhouse;
  let n = 0;
  const storm = setInterval(() => {
    for (let k = 0; k < 3; k++) {
      G.fx.confetti({ x: gh.x + (Math.random() - 0.5) * gh.w, y: 0.5, z: gh.z + (Math.random() - 0.5) * gh.d }, 70);
    }
    if (++n >= 8) clearInterval(storm);
  }, 280);
  setTimeout(() => G.hud.showWin({ time: G.state.playTime, earned: G.state.earned }), 2500);
  saveNow();
});

// ------------------------------------------------------------------ saving
let noSave = false;
function saveNow() {
  if (noSave) return;
  const pl = G.player;
  if (pl && pl.pos) G.state.player = { x: +pl.pos.x.toFixed(3), z: +pl.pos.z.toFixed(3) };
  if (pl && pl.stack) G.state.carried = pl.stack.items.slice();
  save(G.state);
}
G.saveNow = saveNow;
setInterval(saveNow, 2000);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);
G.events.on('reset', () => {
  noSave = true;
  clear();
  location.reload();
});

// ------------------------------------------------------------------ loop
const errCount = {};
function step(dt) {
  G.time += dt;
  G.state.playTime += dt;
  for (let i = 0; i < UPDATE_ORDER.length; i++) {
    const name = UPDATE_ORDER[i];
    const m = G[name];
    if (!m || !m.update) continue;
    try {
      m.update(dt);
    } catch (err) {
      errCount[name] = (errCount[name] || 0) + 1;
      if (errCount[name] <= 3) console.error(`[bloomrush] ${name}.update failed:`, err);
    }
  }
}

const focus = new THREE.Vector3();
const camTarget = new THREE.Vector3();
if (G.player) focus.set(G.player.pos.x, 0, G.player.pos.z);
const OFF = new THREE.Vector3(CAMERA.offset.x, CAMERA.offset.y, CAMERA.offset.z);

function updateCamera(realDt) {
  const pl = G.player;
  camTarget.set(pl.pos.x, 0, pl.pos.z);
  if (glide.dur > 0) {
    glide.t += realDt;
    const u = glide.t / glide.dur;
    if (u >= 1) glide.dur = 0;
    else {
      const w = u < 0.3 ? u / 0.3 : u > 0.7 ? (1 - u) / 0.3 : 1;
      const e = w * w * (3 - 2 * w);
      camTarget.x += (glide.x - camTarget.x) * e;
      camTarget.z += (glide.z - camTarget.z) * e;
    }
  }
  const k = 1 - Math.exp(-(glide.dur > 0 ? 4 : CAMERA.lerp) * realDt);
  focus.x += (camTarget.x - focus.x) * k;
  focus.z += (camTarget.z - focus.z) * k;
  const sh = G.fx.shakeOffset;
  camera.position.set(focus.x + OFF.x, OFF.y, focus.z + OFF.z);
  if (sh) camera.position.add(sh);
  camera.lookAt(focus.x + (sh ? sh.x : 0), sh ? sh.y : 0, focus.z + (sh ? sh.z : 0));
}

let last = performance.now();
let acc = 0;
let hintT = 0;
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
  hintT -= realDt;
  if (hintT <= 0) {
    hintT = 0.25;
    try { computeHint(); } catch (err) { console.error('[bloomrush] hint failed:', err); }
  }
  updateHintVisuals(realDt);
  updateCamera(realDt);
  renderer.render(scene, camera);
  G.frames++;
}
G.step = step;
requestAnimationFrame((t) => { last = t; frame(t); });

// ------------------------------------------------------------------ autoplay
if (params.has('autoplay')) {
  import('./autoplay.js')
    .then((m) => { if (m && typeof m.startAutoplay === 'function') m.startAutoplay(G); })
    .catch((err) => console.error('[bloomrush] autoplay unavailable:', err));
}
