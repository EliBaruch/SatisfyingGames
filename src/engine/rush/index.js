// Harvest Rush: bonus levels where a fenced field is carpeted with the world's item and the hero
// ploughs through it against the clock. Everything inside the sweep circle hops up and flies into
// the cart that trails behind; when the clock runs out the cart is emptied into three trucks, and
// every truck that fills is a star.
//
//   G.rush.levels() -> [{ n, unlocked, stars, best, isNew, need }]
//   G.rush.start(n) -> bool        start level n (false: locked, busy, or it could not be built)
//   G.rush.next()   -> n | null    the lowest unlocked level with fewer than three stars
//   G.rush.active                  true from start() until the camera is back in the world
//   G.rush.phase                   'idle' | 'ready' | 'run' | 'dash' | 'unload' | 'cheer' | 'result'
//   G.rush.leave() / retry(n?)     the result card's buttons (leave() also quits a rush in progress)
//   G.rush.botSteer() -> { x, y }  the stick a competent player would hold now (the test bot)
//   G.rush.debugUnlock(on = true)  tests: every level counts as unlocked
// Events: 'rush:start' { level }, 'rush:done' { level, stars, newStars, cash, count, cleared }.
// State:  levels.<world>.rushes = { '1': { stars, best }, ... }; meta.rushStars = stars over all worlds.
//
// A client of the mini-mode host (engine/modes), like the Gate Run: the host freezes the world, hides
// its HUD, moves the camera and shows the level sheet and the result card. The layout comes from
// level.js (seeded), the 3D from field.js, the DOM from hud.js, the colours from theme.js.
// Field coordinates: a = across (screen right), b = up the screen; the stick maps to them directly.
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { makeCharacter, animateCharacter, LOOKS } from '../chars.js';
import { buildLevel, fieldSize, LEVELS, ITEM_CAP, WIDER, MAGNET, DOUBLE, TIME } from './level.js';
import { createField, MOUND_CAP, LOAD_CAP, PICK_CAP, TRUCK } from './field.js';
import { createRushHud } from './hud.js';
import { rushTheme } from './theme.js';

const S2 = Math.SQRT1_2;
export const TUNE = {
  speed: 7.6,               // the hero, units / second
  sweep: 1.7,               // sweep radius
  ahead: 0.9,               // the sweep circle's centre is this far in front of the hero
  hitch: 2.35,              // hero to cart
  pick: 1.6,                // a pick-up is taken within this distance
  widerMul: 1.65, magnetR: 3.9,
  wider: 6, magnet: 5, double: 5, bonusTime: 5,   // seconds
  comboGap: 1.0,            // collecting with no gap longer than this builds the combo ...
  comboRise: 3.0,           // ... one step per this many seconds, up to x3
  comboFall: 1.5,           // steps lost per second once stalled
  mud: 0.5,                 // speed factor in a mud patch
  ready: 1.5,               // seconds before GO
  dash: 21,                 // the run to the trucks at time up
  view: { portrait: 34, landscape: 20 },          // most world units shown vertically while sweeping
};
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const NAMES = ['WIDER!', 'MAGNET!', 'DOUBLE!', '+5 SECONDS'];
const KINDS = ['wider', 'magnet', 'double', 'time'];
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.500" r="7.500" fill="none" stroke="#fff" stroke-width="2.600"/>'
  + '<path d="M12 9.500v4l2.700 1.800M9.500 2.800h5M12 2.800v3M18.300 6.200l1.500 1.500" fill="none" stroke="#fff" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function loadRushes(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (let n = 1; n <= LEVELS; n++) {
    const r = raw[n];
    if (!isObj(r)) continue;
    const stars = Number.isFinite(r.stars) ? clamp(Math.floor(r.stars), 0, 3) : 0;
    const best = Number.isFinite(r.best) && r.best > 0 ? Math.min(99999, Math.floor(r.best)) : 0;
    if (stars > 0 || best > 0) out[n] = { stars: Math.max(stars, best > 0 ? 1 : 0), best };
  }
  return out;
}

export function createRush(G) {
  const modes = G.modes;
  if (!modes) throw new Error('the Harvest Rush needs the mode host (G.modes)');
  const theme = rushTheme(G);
  const origin = modes.arena(2);
  const saved = (G.state.rushes = loadRushes(G.state.rushes));
  const T = TUNE;
  const D = { all: false };

  // ------------------------------------------------------------------ unlocking and records
  const paid = (G.world.pads || []).filter((p) => p.cost > 0);
  const need1 = Math.min(5, paid.length);
  const need2 = Math.min(paid.length, Math.max(need1 + 1, Math.ceil(paid.length * 0.6)));
  function bought() { let c = 0; for (let i = 0; i < paid.length; i++) if (G.state.done[paid[i].id]) c++; return c; }
  function unlocked(n) {
    if (D.all) return true;
    if (n === 1) return bought() >= need1;
    if (n === 2) return bought() >= need2;
    return !!(G.stats && G.stats.won);
  }
  function needText(n) {
    if (n === 3) return 'Finish this world';
    const left = (n === 1 ? need1 : need2) - bought();
    return left === 1 ? '1 more upgrade' : left + ' more upgrades';
  }
  function levels() {
    const out = [];
    for (let n = 1; n <= LEVELS; n++) {
      const r = saved[n], open = unlocked(n);
      out.push({ n, unlocked: open, stars: r ? r.stars : 0, best: r ? r.best : 0, isNew: open && !r, need: open ? '' : needText(n) });
    }
    return out;
  }
  function next() {
    for (let n = 1; n <= LEVELS; n++) if (unlocked(n) && !(saved[n] && saved[n].stars >= 3)) return n;
    return null;
  }
  function totalStars() {
    let t = 0;
    const lv = G.save && G.save.levels;
    if (isObj(lv)) for (const w in lv) {
      const r = lv[w] && lv[w].rushes;
      if (isObj(r)) for (const k in r) { const s = r[k] && r[k].stars; if (s > 0 && s <= 3) t += Math.floor(s); }
    }
    return t;
  }
  if (G.save && G.save.meta) G.save.meta.rushStars = totalStars();

  // ------------------------------------------------------------------ state
  // numbers that change every step live on objects and typed arrays: no per-step allocation
  const S = {
    phase: 'idle', t: 0, time: 0, n: 0, level: null, W: 0, H: 0, sinE: 0.67, hudF: 0.15, safe: 1,
    a: 0, b: 0, va: 0, vb: 0, h: 0, sp: 0, inMud: false,          // the hero
    ca: 0, cb: 0, ch: 0, bounce: 0,                                // the cart
    sa: 0, sb: 0, R: 1.9, pulse: 0, la: 0, lb: 0,                  // the sweep circle, the last trail stamp
    clock: 0, sec: -1, count: 0, items: 0, landed: 0,
    combo: 0, mult: 1, gap: 9, note: 0, noteN: 0, hapN: 0,
    wider: 0, magnet: 0, dbl: 0,
    dustT: 0, bannerT: 0,
    view: 34, vPlay: 34, vFit: 40, vDock: 26, fa: 0, fb: 0,        // camera
    truckGap: 3.5, truckB: 0, dockB: 0,
    final: 0, tally: 0, moved: 0, rate: 0, truck: 0, shown0: 0, tick: 0, flyT: 0, doneT: 0, cheers: 0,
    wp: 0, wpN: 0,
    result: null,
  };
  const st = new Uint8Array(ITEM_CAP);          // 0 on the ground, 1 flying to the cart, 2 gone
  const ft = new Float32Array(ITEM_CAP), fd = new Float32Array(ITEM_CAP);
  const flying = new Int16Array(ITEM_CAP);
  let flyN = 0;
  const taken = new Uint8Array(PICK_CAP);
  const truckT = new Float32Array(3);           // seconds since truck k left (-1: parked)
  const wpA = new Float32Array(96), wpB = new Float32Array(96);
  const steer = { x: 0, y: 0 };

  // ------------------------------------------------------------------ 3D, built on the first rush
  let B = null;
  function ensure() {
    if (B) return B;
    const root = new THREE.Group();
    root.name = 'harvest-rush';
    root.position.set(origin.x, 0, origin.z);
    root.rotation.y = Math.PI / 4;           // local +z = up the screen, local -x = screen right
    root.visible = false;
    G.scene.add(root);
    const field = createField(G, root, theme);
    // the world's own player look, as engine/player.js resolves it
    const P = { ...PLAYER, ...(G.world.player || {}) };
    const look = typeof P.look === 'string' ? (LOOKS[P.look] || LOOKS.player) : P.look;
    const char = makeCharacter(look);
    root.add(char);
    B = { root, field, char };
    return B;
  }

  const hud = createRushHud(G, { leave: () => leave() });
  const play = (name, o) => { if (G.audio && G.audio.play) G.audio.play(name, o); };
  const haptic = (ms) => modes.haptic(ms);

  // temporaries and pre-built option objects
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3();
  const anim = { moving: false, speed: 1.2, carrying: false, action: null };
  const sound = { pitch: 1, volume: 1 };
  const toWorld = (a, b, y, out) => out.set(origin.x + (b - a) * S2, y, origin.z + (a + b) * S2);
  const loadFly = { kind: theme.item, from: _v, to: _w, dur: 0.34, arc: 2.6, delay: 0, onDone: null, data: null };
  const comboText = { color: '#ffe14d', size: 1.5, life: 1.0, maxW: 0.5 };
  const pickText = { color: '#ffffff', size: 1.5, life: 1.1, maxW: 0.7 };
  const fullText = { color: '#ffe14d', size: 1.05, life: 1.1, maxW: 0.3 };
  const SPARK = { colors: [0xffffff, 0xffe14d, theme.colors.accent], count: 2, speed: 3.4, size: 0.12, life: 0.4, gravity: 7, up: 3 };
  const DUST = { color: theme.ground.trail, count: 1, speed: 1.4, size: 0.13, life: 0.42, gravity: 2, up: 1 };
  const SPLAT = { color: theme.ground.mud, count: 3, speed: 2.6, size: 0.13, life: 0.4, gravity: 10, up: 2.6 };
  const BURST = { color: 0xffffff, count: 24, speed: 6, size: 0.18, life: 0.6, gravity: 9, up: 4.5 };
  const RING = { color: 0xffffff, radius: 3.4, life: 0.5 };
  const doneEvt = { level: 0, stars: 0, newStars: 0, cash: 0, count: 0, cleared: 0 };
  const startEvt = { level: 0 };

  // ------------------------------------------------------------------ building a level
  const aspect = () => (window.innerWidth || 1) / (window.innerHeight || 1);
  function prepare(n) {
    const b = ensure();
    const asp = aspect();
    G.camera.getWorldDirection(_v);
    const sinE = clamp(Math.abs(_v.y), 0.35, 1);     // a length up the screen is this much shorter than on the ground
    // the field's shape follows the screen: tall on a phone held upright, wide in landscape
    const { W, H } = fieldSize(n, clamp(asp * sinE * 1.25, 0.45, 1.6));
    const lv = buildLevel(G.worldId, n, W, H);
    S.truckGap = Math.min(3.6, (W - 2.6) / 3);
    b.field.size(W, H, 2 * S.truckGap + TRUCK.wid + 2.2);
    S.level = lv; S.n = n; S.W = W; S.H = H; S.sinE = sinE;
    S.hudF = asp < 1 ? 0.2 : 0.24;                  // share of the screen's height under the top HUD
    S.truckB = H / 2 + 1.15 + TRUCK.len / 2;
    S.dockB = H / 2 - 2.5;
    // what the camera has to show: the field, the trucks beyond its top edge, room for the HUD
    // (a perspective camera shows less of the near ground than its view size says: fit with room to spare)
    const persp = !!G.camera.isPerspectiveCamera;
    S.safe = persp ? 0.62 : 1;
    const fitA = (W + 2.4) / asp, fitB = ((H + 8.8) * sinE) / (1 - S.hudF);
    S.vFit = Math.max(fitA, fitB) * (persp ? 1.25 : 1);
    S.vPlay = Math.min(S.vFit, asp < 1 ? T.view.portrait : T.view.landscape);
    S.vDock = clamp(Math.max((2 * S.truckGap + TRUCK.wid + 3.4) / asp, (13.5 * sinE) / (1 - S.hudF)), 15, S.vPlay);
    lanes();
  }
  /** the bot's plan: lanes along the long side, there and back */
  function lanes() {
    const W = S.W, H = S.H, up = H >= W;
    const short = up ? W : H, long = up ? H : W, m = 0.75;
    const n = Math.max(1, Math.ceil((short - 2 * m) / (2 * T.sweep * 0.94))), sp = (short - 2 * m) / n;
    const lo = -long / 2 + 1.7, hi = long / 2 - 1.7;
    let k = 0;
    for (let i = 0; i < n && k < 94; i++) {
      const c = -short / 2 + m + (i + 0.5) * sp;
      for (let e = 0; e < 2; e++) {
        const v = (i + e) % 2 ? hi : lo;
        wpA[k] = up ? c : v; wpB[k] = up ? v : c;
        k++;
      }
    }
    S.wpN = k;
  }
  function begin() {
    const b = B, f = b.field, lv = S.level;
    st.fill(0); flyN = 0; taken.fill(0); truckT.fill(-1);
    f.layout(lv);
    S.phase = 'ready'; S.t = 0; S.time = 0;
    S.a = lv.start.a; S.b = lv.start.b; S.va = 0; S.vb = 0; S.h = 0; S.sp = 0; S.inMud = false;
    S.ca = S.a + T.hitch; S.cb = S.b - 0.4; S.ch = -Math.PI / 2; S.bounce = 0;
    S.R = T.sweep; S.pulse = 0; S.la = 1e9; S.lb = 1e9;
    S.clock = lv.time; S.sec = -1; S.count = 0; S.items = 0; S.landed = 0;
    S.combo = 0; S.mult = 1; S.gap = 9; S.note = 0; S.noteN = 0; S.hapN = 0;
    S.wider = 0; S.magnet = 0; S.dbl = 0; S.dustT = 0; S.bannerT = 0;
    S.final = 0; S.tally = 0; S.moved = 0; S.truck = 0; S.tick = 0; S.flyT = 0; S.doneT = 0; S.cheers = 0;
    S.wp = 0; S.result = null;
    S.view = S.vFit * 1.04;
    for (let k = 0; k < 3; k++) {
      const tr = f.trucks[k];
      tr.a = (k - 1) * S.truckGap; tr.b = S.truckB;
      tr.group.position.set(-tr.a, 0, tr.b);
      tr.group.scale.set(1, 1, 1);
      tr.group.visible = true;
      tr.load.count = 0;
    }
    f.mound.count = 0;
    b.root.visible = true;
    place();
    hud.label(theme.itemName.toUpperCase());
    hud.clock(Math.ceil(S.clock)); hud.count(0, false); hud.combo(1, 0);
    hud.chip(WIDER, 0); hud.chip(MAGNET, 0); hud.chip(DOUBLE, 0);
    hud.tally(false);
    hud.banner('LEVEL ' + S.n, '');
    S.bannerT = 1.1;
    hud.show(true);
    camera(1);
    startEvt.level = S.n;
    G.events.emit('rush:start', startEvt);
  }
  function end() {
    if (!B) return;
    B.root.visible = false;
    hud.show(false);
    hud.banner('');
    S.phase = 'idle'; S.result = null;
  }

  // ------------------------------------------------------------------ the hero, the plough, the cart
  function place() {
    const b = B, f = b.field;
    b.char.position.set(-S.a, 0, S.b);
    b.char.rotation.y = -S.h;
    f.plough.position.set(-S.a, 0, S.b);
    f.plough.rotation.y = -S.h;
    f.plough.scale.set(S.R / 1.02, 1 + 0.12 * S.pulse, 1 + 0.3 * S.pulse);
    f.cart.position.set(-S.ca, 0, S.cb);
    f.cart.rotation.y = -S.ch;
    f.cart.scale.set(1 + 0.05 * S.bounce, 1 - 0.07 * S.bounce, 1 + 0.05 * S.bounce);
    S.sa = S.a + Math.sin(S.h) * T.ahead; S.sb = S.b + Math.cos(S.h) * T.ahead;
    const run = S.phase === 'ready' || S.phase === 'run';
    f.setRing(0, S.sa, S.sb, run ? S.R * 1.06 : 0, S.time * 0.9);
    f.setRing(1, S.sa, S.sb, run && S.magnet > 0 ? T.magnetR * (1 + 0.04 * Math.sin(S.time * 12)) : 0, -S.time * 2.2);
  }
  /** walk with velocity (ta, tb); bales push back, mud slows, the fence holds */
  function move(dt, ta, tb) {
    const lv = S.level;
    let slow = 1;
    for (let i = 0; i < lv.mud.length; i++) {
      const o = lv.mud[i], da = S.a - o.a, db = S.b - o.b;
      if (da * da + db * db < o.r * o.r * 0.85) slow = T.mud;
    }
    if ((slow < 1) !== S.inMud) {
      S.inMud = slow < 1;
      if (S.inMud) { play('rushMud'); haptic(20); G.fx.burst(toWorld(S.a, S.b, 0.1, _p), SPLAT); }
    }
    const k = Math.min(1, dt * 12);
    S.va += (ta * slow - S.va) * k; S.vb += (tb * slow - S.vb) * k;
    S.a += S.va * dt; S.b += S.vb * dt;
    for (let i = 0; i < lv.bales.length; i++) {
      const o = lv.bales[i], da = S.a - o.a, db = S.b - o.b, r = o.r + 0.55, d2 = da * da + db * db;
      if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); S.a = o.a + (da / d) * r; S.b = o.b + (db / d) * r; }
    }
    S.a = clamp(S.a, -S.W / 2 + 0.55, S.W / 2 - 0.55);
    S.b = clamp(S.b, -S.H / 2 + 0.55, S.H / 2 - 0.55);
    S.sp = Math.hypot(S.va, S.vb);
    if (S.sp > 0.6) turn(Math.atan2(S.va, S.vb), dt * 13);
    // the cart is on a bar: it swings round behind
    let da = S.ca - S.a, db = S.cb - S.b, d = Math.hypot(da, db);
    if (d < 1e-4) { da = -Math.sin(S.h); db = -Math.cos(S.h); d = 1; }
    S.ca = S.a + (da / d) * T.hitch; S.cb = S.b + (db / d) * T.hitch;
    S.ch = Math.atan2(S.a - S.ca, S.b - S.cb);
  }
  function turn(want, k) {
    let d = want - S.h;
    d -= Math.round(d / 6.2831853) * 6.2831853;
    S.h += d * Math.min(1, k);
  }
  function dust(dt) {
    S.dustT -= dt;
    if (S.dustT > 0 || S.sp < 2) return;
    S.dustT = S.sp > 12 ? 0.03 : 0.07;
    toWorld(S.a - Math.sin(S.h) * 0.3, S.b - Math.cos(S.h) * 0.3, 0.05, _p);
    G.fx.burst(_p, S.inMud ? SPLAT : DUST);
  }

  // ------------------------------------------------------------------ sweeping
  function take(i, delay) {
    st[i] = 1;
    ft[i] = -delay;
    fd[i] = 0.3 + (i % 7) * 0.014 + (delay > 0 ? 0.08 : 0);
    flying[flyN++] = i;
    S.items++;
    S.count += S.mult * (S.dbl > 0 ? 2 : 1);
  }
  function sweep() {
    const lv = S.level, n = lv.count, A = lv.a, Bb = lv.b;
    const sa = S.sa, sb = S.sb, R2 = S.R * S.R, M2 = S.magnet > 0 ? T.magnetR * T.magnetR : 0;
    const before = S.items;
    for (let i = 0; i < n; i++) {
      if (st[i]) continue;
      const da = A[i] - sa, db = Bb[i] - sb, d2 = da * da + db * db;
      if (d2 < R2) take(i, 0);
      else if (d2 < M2) take(i, (Math.sqrt(d2) - S.R) * 0.05);
    }
    const got = S.items - before;
    if (!got) return;
    S.gap = 0;
    S.pulse = 1;
    // a chime that climbs while the sweep goes on
    S.noteN += got;
    if (S.noteN >= 10) { S.noteN = 0; if (S.note < PENTA.length - 1) S.note++; }
    sound.pitch = Math.pow(2, PENTA[S.note] / 12) * (S.dbl > 0 ? 1.06 : 1); sound.volume = 0.8;
    play('rushPick', sound);
    S.hapN += got;
    if (S.hapN >= 14) { S.hapN = 0; haptic(5); }
    SPARK.count = got > 3 ? 3 : got;
    G.fx.burst(toWorld(sa, sb, 0.35, _p), SPARK);
  }
  /** items on their way to the cart: a hop straight up, then an arc into the mound */
  function flights(dt) {
    if (!flyN) return;
    const f = B.field, lv = S.level, mound = f.mound;
    const ty = mound.userData.top[mound.count] + 0.25, ta = S.ca, tb = S.cb;
    let landed = 0;
    for (let k = flyN - 1; k >= 0; k--) {
      const i = flying[k], t = (ft[i] += dt);
      if (t < 0) continue;                       // a magnet's pull reaches the far ones a little later
      const u = t / fd[i];
      if (u >= 1) {
        st[i] = 2;
        f.hideItem(i);
        flying[k] = flying[--flyN];
        landed++;
        continue;
      }
      const e = u * u, a0 = lv.a[i], b0 = lv.b[i];
      const y = ty * e + (1.7 + (i % 5) * 0.3) * 4 * u * (1 - u) * (1 - 0.45 * u);
      const s = u < 0.22 ? 1 + u * 1.6 : 1.35 - (u - 0.22) * 0.75;
      f.setItem(i, a0 + (ta - a0) * e, b0 + (tb - b0) * e, y, lv.yaw[i] + t * (7 + (i % 3) * 3), u * 2.4, s);
    }
    f.carpet.instanceMatrix.needsUpdate = true;
    if (landed) {
      S.landed += landed;
      S.bounce = 1;
      f.mound.count = Math.min(MOUND_CAP, Math.round(MOUND_CAP * Math.sqrt(S.landed / lv.count)));
    }
  }
  function pickups() {
    const lv = S.level, f = B.field;
    for (let i = 0; i < lv.picks.length; i++) {
      const p = lv.picks[i], icon = f.icons[i];
      if (taken[i]) continue;
      icon.position.y = 1.95 + 0.2 * Math.sin(S.time * 3 + i * 1.7);
      f.setRing(2 + i, p.a, p.b, 1.45 + 0.12 * Math.sin(S.time * 5 + i), S.time * 0.8);
      const da = p.a - S.a, db = p.b - S.b;
      if (S.phase !== 'run' || da * da + db * db > T.pick * T.pick) continue;
      taken[i] = 1;
      icon.visible = false;
      f.setRing(2 + i, 0, 0, 0, 0);
      if (p.type === WIDER) S.wider = T.wider;
      else if (p.type === MAGNET) S.magnet = T.magnet;
      else if (p.type === DOUBLE) S.dbl = T.double;
      else { S.clock += T.bonusTime; S.sec = -1; }
      hud.banner(NAMES[p.type], KINDS[p.type]);
      S.bannerT = 1.0;
      hud.flash('good');
      toWorld(p.a, p.b, 1.2, _p);
      BURST.color = f.iconColor(p.type);
      G.fx.burst(_p, BURST);
      RING.color = BURST.color;
      G.fx.ring(_p, RING);
      sound.pitch = 1 + p.type * 0.08; sound.volume = 1;
      play('rushPower', sound);
      haptic(25);
      G.fx.shake(0.14, 0.2);
    }
  }
  function runStep(dt) {
    const inp = G.input, lv = S.level;
    let ix = inp ? inp.x || 0 : 0, iy = inp ? inp.y || 0 : 0;
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    move(dt, ix * T.speed, iy * T.speed);
    S.R += (T.sweep * (S.wider > 0 ? T.widerMul : 1) - S.R) * Math.min(1, dt * 9);
    S.sa = S.a + Math.sin(S.h) * T.ahead; S.sb = S.b + Math.cos(S.h) * T.ahead;
    sweep();
    pickups();
    // the swept path stays on the ground
    if (Math.abs(S.sa - S.la) + Math.abs(S.sb - S.lb) > 0.4) { S.la = S.sa; S.lb = S.sb; B.field.trail.stamp(S.sa, S.sb, S.R * 1.12); }
    dust(dt);

    // the combo: collect without a pause and it climbs; stall and it drains fast
    S.gap += dt;
    if (S.gap <= T.comboGap) S.combo = Math.min(3, S.combo + dt / T.comboRise);
    else { S.combo = Math.max(0, S.combo - dt * T.comboFall); S.note = 0; S.noteN = 0; }
    const mult = Math.min(3, 1 + Math.floor(S.combo));
    if (mult !== S.mult) {
      if (mult > S.mult) {
        G.fx.popText(toWorld(S.a, S.b, 3.2, _p), 'x' + mult, comboText);
        sound.pitch = mult === 3 ? 1.26 : 1; sound.volume = 1;
        play('rushCombo', sound);
        haptic(18);
      }
      S.mult = mult;
    }
    hud.combo(mult, mult >= 3 ? S.combo - 2 : S.combo - (mult - 1));
    hud.count(S.count, false);

    if (S.wider > 0) S.wider -= dt;
    if (S.magnet > 0) S.magnet -= dt;
    if (S.dbl > 0) S.dbl -= dt;
    hud.chip(WIDER, S.wider / T.wider); hud.chip(MAGNET, S.magnet / T.magnet); hud.chip(DOUBLE, S.dbl / T.double);

    // the clock
    S.clock -= dt;
    const sec = Math.max(0, Math.ceil(S.clock));
    if (sec !== S.sec) {
      const fell = sec < S.sec;
      S.sec = sec;
      hud.clock(sec);
      if (fell && sec <= 5 && sec > 0) { play(sec & 1 ? 'rushTick' : 'rushTock'); hud.tick(); haptic(10); }
    }
    if (S.clock <= 0 || S.items >= lv.count) {
      S.phase = 'dash'; S.t = 0;
      // a bare field before the whistle: the seconds left are worth a little each
      if (S.clock > 0) { S.count += Math.ceil(S.clock) * Math.round(lv.count * 0.03); hud.count(S.count, true); }
      hud.banner(S.clock <= 0 ? 'TIME UP!' : 'ALL CLEAR!', S.clock <= 0 ? 'stop' : 'double');
      S.bannerT = 1.3;
      play('rushWhistle');
      haptic(70);
      G.fx.shake(0.2, 0.3);
      hud.flash(S.clock <= 0 ? 'stop' : 'good');
    }
  }

  // ------------------------------------------------------------------ the trucks
  function depart(k) {
    truckT[k] = 0;
    const tr = B.field.trucks[k];
    tr.load.count = LOAD_CAP;
    hud.truck(k, 1, true);
    toWorld(tr.a, tr.b - 0.6, 3.6, _p);
    G.fx.popText(_p, 'FULL!', fullText);
    G.fx.confetti(_p, 36);
    sound.pitch = 1 + k * 0.12; sound.volume = 1;
    play('rushHonk', sound);
    play('star', sound);
    haptic(30);
    G.fx.shake(0.12, 0.2);
  }
  function driveTrucks(dt) {
    for (let k = 0; k < 3; k++) {
      if (truckT[k] < 0) continue;
      const tr = B.field.trucks[k], t = (truckT[k] += dt);
      if (!tr.group.visible) continue;
      const z = t < 0.25 ? -0.25 * Math.sin((t / 0.25) * Math.PI) : 9 * (t - 0.25) * (t - 0.25);
      tr.group.position.z = tr.b + z;
      const sq = t < 0.3 ? Math.sin((t / 0.3) * Math.PI) : 0;
      tr.group.scale.set(1 + 0.05 * sq, 1 - 0.07 * sq, 1);
      if (t > 0.25 && t < 1.2 && ((t * 30) | 0) % 3 === 0) { DUST.count = 1; G.fx.burst(toWorld(tr.a, tr.b + z - 2.6, 0.2, _p), DUST); }
      if (t > 2.1) tr.group.visible = false;
    }
  }
  function unload(dt) {
    const lv = S.level, f = B.field;
    if (S.tally < S.final) {
      S.moved += S.rate * dt * (S.truck >= 3 ? 2.5 : 1);
      const now = Math.min(S.final, Math.floor(S.moved));
      if (now > S.tally) {
        S.tally = now;
        hud.count(now, false);
        f.mound.count = Math.round(S.shown0 * (1 - now / S.final));
        S.tick -= dt;
        if (S.tick <= 0) {
          S.tick = 0.05;
          sound.pitch = 0.8 + 1.0 * (now / S.final); sound.volume = 0.8;
          play('rushLoad', sound);
          haptic(5);
        }
        // a spray of items from the cart into the truck that is loading
        S.flyT -= dt;
        if (S.flyT <= 0 && S.truck < 3) {
          S.flyT = 0.034;
          const tr = f.trucks[S.truck];
          toWorld(S.ca, S.cb, f.mound.userData.top[f.mound.count] + 0.3, _v);
          toWorld(tr.a + (Math.random() - 0.5) * 1.2, tr.b - 0.9 + (Math.random() - 0.5) * 2, TRUCK.bedY + 0.5, _w);
          loadFly.dur = 0.3 + Math.random() * 0.1; loadFly.arc = 2.2 + Math.random() * 1.6;
          G.fx.fly(loadFly);
        }
      }
      while (S.truck < 3 && S.tally >= lv.t[S.truck]) { depart(S.truck); S.truck++; }
      if (S.truck < 3) {
        const lo = S.truck ? lv.t[S.truck - 1] : 0, frac = (S.tally - lo) / (lv.t[S.truck] - lo);
        f.trucks[S.truck].load.count = Math.min(LOAD_CAP, Math.ceil(frac * LOAD_CAP));
        hud.truck(S.truck, frac, false);
      }
      if (S.tally >= S.final) S.doneT = S.t;
    }
  }

  function nice(n) {
    if (!(n > 0)) return 1;
    const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(n)) - 1));
    return Math.max(1, Math.round(n / p) * p);
  }
  function unit() {
    if (G.thrills && G.thrills.unit) return G.thrills.unit();
    let c = Infinity;
    const vis = G.pads && G.pads.visible ? G.pads.visible() : null;
    if (vis) for (let i = 0; i < vis.length; i++) if (vis[i].cost > 0 && vis[i].cost < c) c = vis[i].cost;
    return Math.max(15, c === Infinity ? 0 : c * 0.2);
  }
  /** the trucks are loaded: stars, records, cash */
  function settle() {
    const lv = S.level, c = S.final;
    const stars = c >= lv.t[2] ? 3 : c >= lv.t[1] ? 2 : 1;
    const cleared = lv.count > 0 ? S.items / lv.count : 0;
    const factor = 1 + Math.min(4, Math.floor(cleared * 5 + 0.001));      // 1 to 5: how much of the field is bare
    const first = !saved[lv.n];
    const rec = saved[lv.n] || (saved[lv.n] = { stars: 0, best: 0 });
    const newStars = Math.max(0, stars - rec.stars);
    const newBest = !first && c > rec.best;
    // a first finish and every new star pay in full; sweeping a beaten level again pays half
    const replay = !first && newStars === 0;
    const cash = nice(unit() * (0.5 + 0.25 * factor + 0.1 * stars) * (replay ? 0.5 : 1));
    if (stars > rec.stars) rec.stars = stars;
    if (c > rec.best) rec.best = c;
    if (G.save && G.save.meta) G.save.meta.rushStars = totalStars();
    // bonus money stays out of the thrills' income estimate, like its own prizes
    if (G.thrills && G.thrills.pay) G.thrills.pay(cash, null, '', false, true); else G.addMoney(cash);
    if (G.thrills && G.thrills.addStar) for (let i = 0; i < newStars; i++) G.thrills.addStar(1);
    S.result = { stars, cash, newStars, newBest, replay, count: c, cleared, trucks: Math.min(3, S.truck) };
    doneEvt.level = lv.n; doneEvt.stars = stars; doneEvt.newStars = newStars; doneEvt.cash = cash; doneEvt.count = c; doneEvt.cleared = cleared;
    G.events.emit('rush:done', doneEvt);
    if (G.saveNow) G.saveNow();
  }
  function showResult() {
    const r = S.result, lv = S.level;
    const toNext = r.stars === 1 ? lv.t[1] - r.count : r.stars === 2 ? lv.t[2] - r.count : 0;
    const note = r.newStars > 0 && G.thrills ? `+${r.newStars} perk star${r.newStars > 1 ? 's' : ''} for the perk gates`
      : r.replay ? 'Replay: half reward. New stars pay in full.'
        : toNext > 0 ? `${toNext} more for the next truck` : '';
    modes.showResult({
      kicker: `HARVEST RUSH  /  LEVEL ${lv.n}`,
      title: r.stars >= 3 ? 'CLEAN SWEEP!' : r.stars === 2 ? 'GREAT HARVEST!' : 'TIME UP!',
      stars: r.stars,
      newBest: r.newBest,
      lines: [
        { label: theme.itemName + ' loaded', value: r.count, roll: true },
        { label: 'Field cleared', text: Math.round(r.cleared * 100) + '%', accent: true },
      ],
      cash: r.cash,
      note,
      onRetry: () => retry(),
      onContinue: () => leave(),
    });
  }

  // ------------------------------------------------------------------ camera
  function camera(k) {
    const sweeping = S.phase === 'ready' || S.phase === 'run' || S.phase === 'dash';
    const want = S.phase === 'ready' && S.t < 0.6 ? S.vFit * 1.04
      : sweeping ? S.vPlay * (1 + 0.04 * Math.min(3, S.combo)) : S.vDock;
    S.view += (want - S.view) * Math.min(1, k * 0.7);
    let ta = 0, tb;
    if (sweeping) {
      const gw = S.view * aspect(), gh = S.view / S.sinE;
      const pan = Math.max(0, (S.W + 2.4 - gw) / 2);
      ta = (S.a / (S.W / 2)) * pan;
      const lo = -S.H / 2 - 1.7 + gh / 2, hi = S.truckB + TRUCK.len / 2 + 0.5 - gh / 2 + S.hudF * gh;
      tb = lo >= hi ? (lo + hi) / 2 : lo + (hi - lo) * clamp((S.b + S.H / 2) / S.H, 0, 1);
      // whatever the field and the camera: the hero stays well inside the screen
      const sx = gw * 0.34 * S.safe, up = gh * (0.4 - S.hudF) * S.safe, dn = gh * 0.36 * S.safe;
      ta = clamp(ta, S.a - sx, S.a + sx);
      tb = clamp(tb, S.b - up, S.b + dn);
    } else tb = S.H / 2 + 1.0 + (S.view / S.sinE) * S.hudF * 0.5;
    S.fa += (ta - S.fa) * k; S.fb += (tb - S.fb) * k;
    modes.follow(origin.x + (S.fb - S.fa) * S2, origin.z + (S.fa + S.fb) * S2, modes.zoomFor(S.view));
  }

  // ------------------------------------------------------------------ update
  function update(dt) {
    const b = B, lv = S.level;
    if (!b || !lv || S.phase === 'idle') return;
    S.t += dt; S.time += dt;
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) hud.banner(''); }
    S.pulse = Math.max(0, S.pulse - dt * 7);
    S.bounce = Math.max(0, S.bounce - dt * 6);
    anim.moving = false; anim.action = null;

    if (S.phase === 'ready') {
      pickups();
      if (S.t >= T.ready) { S.phase = 'run'; S.t = 0; hud.banner('GO!', 'go'); S.bannerT = 0.6; play('runGo'); haptic(15); }
    } else if (S.phase === 'run') {
      runStep(dt);
      anim.moving = S.sp > 0.8;
    } else if (S.phase === 'dash') {
      // straight to the trucks, as fast as legs go
      const da = 0 - S.a, db = S.dockB - S.b, d = Math.hypot(da, db);
      const v = d > 0.05 ? Math.min(T.dash, 3 + d * 6) : 0;
      move(dt, d > 0.05 ? (da / d) * v : 0, d > 0.05 ? (db / d) * v : 0);
      if (d < 0.6) turn(0, dt * 8);
      S.R += (T.sweep - S.R) * Math.min(1, dt * 9);
      dust(dt);
      anim.moving = d > 0.3;
      if ((d < 0.3 || S.t > 4) && flyN === 0 && S.t > 0.9) {
        S.final = S.count; S.tally = 0; S.moved = 0; S.truck = 0; S.tick = 0; S.flyT = 0; S.doneT = -1;
        S.rate = S.final / clamp(S.final / 900, 2.2, 3.6);
        S.shown0 = b.field.mound.count;
        S.phase = 'unload'; S.t = 0;
        hud.tally(true);
        hud.count(0, false);
        if (S.final <= 0) S.doneT = 0;
      }
    } else if (S.phase === 'unload') {
      turn(0, dt * 8);
      unload(dt);
      if (S.doneT >= 0 && S.t - S.doneT > 0.45) {
        settle();
        S.phase = 'cheer'; S.t = 0; S.cheers = 0;
        play('runWin');
        haptic(60);
        hud.count(S.final, true);
      }
    } else if (S.phase === 'cheer') {
      anim.action = 'wave';
      turn(Math.PI, dt * 6);
      if (S.cheers < 3 && S.t >= S.cheers * 0.3) {
        toWorld((S.cheers - 1) * 3.4, S.dockB + 1.5, 0.6, _p);
        G.fx.confetti(_p, 50);
        S.cheers++;
      }
      if (S.t >= 1.5) { S.phase = 'result'; S.t = 0; hud.show(false); showResult(); }
    } else if (S.phase === 'result') {
      anim.action = 'wave';
    }

    flights(dt);
    driveTrucks(dt);
    place();
    animateCharacter(b.char, dt, anim);
    camera(1 - Math.exp(-3.4 * dt));
  }

  // ------------------------------------------------------------------ the mode and its API
  const mode = { id: 'rush', update, onEnter: begin, onExit: end, frame() { if (B) B.field.trail.flush(); } };
  const active = () => modes.active === mode;

  function start(n) {
    n = Math.floor(n);
    if (!(n >= 1 && n <= LEVELS) || modes.active || !G.player || !G.fx || !G.fx.fly || !unlocked(n)) return false;
    try { prepare(n); } catch (err) { console.error('[rush] could not build the level:', err); return false; }
    return modes.enter(mode);
  }
  function leave() { if (active()) modes.exit(); }
  /** start over behind the curtain: the same level, or level n if it is unlocked */
  function retry(n) {
    if (!active()) return false;
    n = n >= 1 && n <= LEVELS && unlocked(Math.floor(n)) ? Math.floor(n) : S.n;
    return modes.blink(() => { prepare(n); begin(); });
  }

  // ------------------------------------------------------------------ the test bot
  /**
   * The stick a competent player would hold: up and down the field in lanes one sweep wide, a short
   * detour to a pick-up that is close, round the bales, and after the last lane whatever is left.
   */
  function botSteer() {
    steer.x = 0; steer.y = 0;
    if (!active() || S.phase !== 'run') return steer;
    const lv = S.level;
    let ta = S.a, tb = S.b, found = false;
    // a pick-up within reach comes first
    let best = 3.2 * 3.2;
    for (let i = 0; i < lv.picks.length; i++) {
      if (taken[i]) continue;
      const p = lv.picks[i], d2 = (p.a - S.a) * (p.a - S.a) + (p.b - S.b) * (p.b - S.b);
      if (d2 < best) { best = d2; ta = p.a; tb = p.b; found = true; }
    }
    if (!found) {
      while (S.wp < S.wpN && Math.hypot(wpA[S.wp] - S.a, wpB[S.wp] - S.b) < 0.8) S.wp++;
      if (S.wp < S.wpN) {
        // aim a little way down the line to the waypoint, so a detour comes back onto the lane
        const k = S.wp, qa = wpA[k], qb = wpB[k];
        const pa = k ? wpA[k - 1] : lv.start.a, pb = k ? wpB[k - 1] : lv.start.b;
        const sa = qa - pa, sb = qb - pb, len = Math.hypot(sa, sb);
        if (len < 0.01) { ta = qa; tb = qb; } else {
          const along = clamp(((S.a - pa) * sa + (S.b - pb) * sb) / len, 0, len) + 2.6;
          if (along >= len) { ta = qa; tb = qb; } else { ta = pa + (sa / len) * along; tb = pb + (sb / len) * along; }
        }
        found = true;
      } else {
        // mop up: the nearest item still on the ground
        let d = Infinity;
        for (let i = 0; i < lv.count; i++) {
          if (st[i]) continue;
          const da = lv.a[i] - S.a, db = lv.b[i] - S.b, d2 = da * da + db * db;
          if (d2 < d) { d = d2; ta = lv.a[i]; tb = lv.b[i]; found = true; }
        }
      }
    }
    if (!found) return steer;
    let da = ta - S.a, db = tb - S.b;
    const d = Math.hypot(da, db);
    if (d < 0.05) return steer;
    da /= d; db /= d;
    // slide round a bale that is in the way
    for (let i = 0; i < lv.bales.length; i++) {
      const o = lv.bales[i], oa = o.a - S.a, ob = o.b - S.b, od = Math.hypot(oa, ob), near = o.r + 1.5;
      if (od > near || oa * da + ob * db < 0) continue;
      const side = da * ob - db * oa >= 0 ? 1 : -1, w = clamp((near - od) / 0.9, 0, 1) * 1.6;
      da += (ob / od) * side * w; db += (-oa / od) * side * w;
    }
    const m = Math.hypot(da, db) || 1;
    steer.x = da / m; steer.y = db / m;
    return steer;
  }

  // ------------------------------------------------------------------ listing on the bonus-level sheet
  modes.registerLevels({
    type: 'rush',
    title: 'HARVEST RUSH',
    sub: () => `Sweep up the ${theme.itemName.toLowerCase()} before the clock runs out`,
    icon: ICON,
    levels,
    start,
  });

  return {
    levels, start, next, leave, retry, botSteer,
    get active() { return active(); },
    get phase() { return active() ? S.phase : 'idle'; },
    /** the live rush, for tests and the console: count, clock, items, level */
    get state() { return S; },
    /** how many triangles one carpet item has (0 before the first rush) */
    get proxyTris() { return B ? B.field.proxyTris : 0; },
    theme, tune: T,
    debugUnlock(on = true) { D.all = !!on; modes.refresh(false); },
  };
}
