// Gate Run: bonus runner levels. The world's own character runs up a floating runway with a tower
// of the world's item, steers through pairs of gates that add to or multiply the tower, dodges soft
// hazards that knock some of it off, and unloads everything on a scale at the finish.
//
//   G.run.levels() -> [{ n, unlocked, stars, best, isNew, need }]
//   G.run.start(n) -> bool        start level n (false: locked, busy, or it could not be built)
//   G.run.next()   -> n | null    the lowest unlocked level with fewer than three stars
//   G.run.active                  true from start() until the camera is back in the world
//   G.run.phase                   'idle' | 'ready' | 'run' | 'brake' | 'unload' | 'cheer' | 'result'
//   G.run.leave() / retry(n?)     the result card's buttons (leave() also quits a run in progress)
//   G.run.botSteer() -> -1..1     the stick x a competent player would use now (the test bot)
//   G.run.debugUnlock(on = true)  tests: every level counts as unlocked
// Events: 'run:start' { level }, 'run:done' { level, stars, count, cash, newStars, mult }.
// State:  levels.<world>.runs = { '1': { stars, best }, ... }; meta.runStars = stars over all worlds.
//
// It is a client of the mini-mode host (engine/modes): the host freezes the world, hides its HUD,
// moves the camera and shows the level sheet and the result card. This file is only the runner.
// The level layout comes from level.js (seeded: the same every time), the 3D from track.js / gates.js.
// Themed from the world without the world defining anything (theme.js; world.run overrides).
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { getItem } from '../registry.js';
import { makeCharacter, animateCharacter, LOOKS } from '../chars.js';
import { createStack } from '../stack.js';
import { buildLevel, applyOp, LEVELS, BARRIER, PUDDLE, SPINNER, MUL } from './level.js';
import { createTrack, FIN, LAMPS, LAMP_H, LAMP_GAP, LAMP_Y0, PILE_CAP, PICK_CAP, HAZ_CAP } from './track.js';
import { createGatePool, GAIN, LOSS } from './gates.js';
import { createDigits } from './label.js';
import { createRunHud } from './hud.js';
import { themeFor } from './theme.js';

const S2 = Math.SQRT1_2;
export const TUNE = {
  view: { portrait: 22, landscape: 15.5 },   // world units visible vertically while running
  viewFinish: 19,                             // ... at least this much at the scale
  lateral: 9.5,                               // sideways speed at full stick
  towerH: 11,                                 // one column of the tower is at most this tall
  columns: 2,
  ready: 1.0,                                 // seconds before GO
  // what a hazard knocks off: [share of the tower, at least, at most]
  knock: [[0.14, 3, 20], [0.07, 2, 10], [0.18, 4, 30]],
};
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const LAMP_COLORS = [0x4cd964, 0xffd23f, 0xff9a2e, 0xff5c93, 0xb26bff];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function loadRuns(raw) {
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

export function createRun(G) {
  const modes = G.modes;
  if (!modes) throw new Error('the Gate Run needs the mode host (G.modes)');
  const theme = themeFor(G);
  const item = getItem(theme.item);
  const origin = modes.arena(0);
  const saved = (G.state.runs = loadRuns(G.state.runs));
  const T = TUNE;
  const D = { all: false };

  // ------------------------------------------------------------------ unlocking and records
  const paid = (G.world.pads || []).filter((p) => p.cost > 0);
  const need1 = Math.min(3, paid.length);
  const need2 = Math.min(paid.length, Math.max(need1 + 1, Math.ceil(paid.length / 2)));
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
      const r = lv[w] && lv[w].runs;
      if (isObj(r)) for (const k in r) { const s = r[k] && r[k].stars; if (s > 0 && s <= 3) t += Math.floor(s); }
    }
    return t;
  }
  if (G.save && G.save.meta) G.save.meta.runStars = totalStars();

  // ------------------------------------------------------------------ state
  // numbers that change every step live on objects: no per-step allocation
  const S = {
    phase: 'idle', t: 0, time: 0, n: 0, level: null, half: 3, lim: 2.6, pickHalf: 2.5,
    s: 0, l: 0, v: 0, lv: 0, yaw: Math.PI / 4,
    count: 0, pending: 0, combo: 0, comboT: 0, slow: 0, safe: 0, boost: 0,
    gi: 0, pLo: 0, trail: 0, bannerT: 0,
    final: 0, unloaded: 0, moved: 0, rate: 0, fill: -1, mult: 1, pileN: -1, cheers: 0, tick: 0,
    view: 22, cs: 0, cl: 0,
    result: null,
  };
  let taken = new Uint8Array(0);
  let hazS = new Float32Array(0), hazL = new Float32Array(0), hazW = new Float32Array(0), hazT = new Float32Array(0);
  let hazState = new Uint8Array(0);        // 0 live, 1 spent (stays), 2 knocked away (animating out), 3 gone
  let hazN = 0;

  // ------------------------------------------------------------------ 3D, built on the first run
  let B = null;
  function ensure() {
    if (B) return B;
    const root = new THREE.Group();
    root.name = 'gate-run';
    root.position.set(origin.x, 0, origin.z);
    root.rotation.y = Math.PI / 4;           // local +z = up the screen, local -x = screen right
    root.visible = false;
    G.scene.add(root);
    const track = createTrack(G, root, theme);
    const gates = createGatePool(G, root);
    // the world's own player look, as engine/player.js resolves it
    const P = { ...PLAYER, ...(G.world.player || {}) };
    const look = typeof P.look === 'string' ? (LOOKS[P.look] || LOOKS.player) : P.look;
    const char = makeCharacter(look);
    char.visible = false;
    G.scene.add(char);
    const carry = char.userData.carry;       // the human rig carries in its hands, in front
    const perColumn = clamp(Math.floor(T.towerH / item.step), 10, 60);
    const cap = perColumn * T.columns;
    const stack = createStack(G, {
      parent: char,
      offset: carry ? carry.offset : { x: 0, y: 0.55, z: -0.42 },
      billboard: carry ? !!carry.billboard : true,
      capacity: cap,
      perColumn,
      // extra columns go ahead of the runner, never into its body
      columnGap: carry && !carry.billboard ? -(item.footprint.d + 0.05) : 0,
    });
    const count = createDigits(G, { height: 1.25 });
    const tally = createDigits(G, { height: 1.7 });
    for (let i = 0; i < LAMPS; i++) track.lamps.setColorAt(i, _col.setHex(LAMP_COLORS[i]));
    track.lamps.instanceColor.needsUpdate = true;
    B = { root, track, gates, char, stack, perColumn, cap, count, tally, linear: Math.round(perColumn * 0.3), curve: perColumn * 0.21 };
    return B;
  }

  const hud = createRunHud(G, { leave: () => leave() });
  const play = (name, o) => { if (G.audio && G.audio.play) G.audio.play(name, o); };
  const haptic = (ms) => modes.haptic(ms);

  // temporaries and pre-built option objects
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler(), _col = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const anim = { moving: false, speed: 1, carrying: false, action: null };
  const sound = { pitch: 1, volume: 1 };
  const toWorld = (s, l, y, out) => out.set(origin.x + (s - l) * S2, y, origin.z + (s + l) * S2);
  const stackTop = (out) => B.stack.topWorld(out);
  const landed = () => { if (S.pending > 0) S.pending--; };
  const pickFly = { kind: theme.item, from: _v, to: stackTop, dur: 0.2, arc: 1.3, delay: 0, onDone: landed, data: null };
  const spillFly = { kind: theme.item, from: _v, to: _w, dur: 0.5, arc: 2, delay: 0, onDone: null, data: null };
  const loadFly = { kind: theme.item, from: _v, to: _w, dur: 0.3, arc: 2.6, delay: 0, onDone: null, data: null };
  const gateText = { color: '#ffffff', size: 1.25, life: 0.9, maxW: 0.5 };
  const lossText = { color: '#ff6b6b', size: 1.05, life: 0.9, maxW: 0.45 };
  const multText = { color: '#ffe14d', size: 1.5, life: 1.3, maxW: 0.6 };
  const stepText = { color: '#ffffff', size: 0.9, life: 0.8, maxW: 0.4 };
  const BURST = { color: 0xffffff, count: 26, speed: 6.5, size: 0.18, life: 0.65, gravity: 9, up: 4.5 };
  const BURST_SMALL = { color: 0xffffff, count: 10, speed: 4, size: 0.13, life: 0.45, gravity: 9, up: 3 };
  const SPARK = { colors: [0xffffff, 0xffe14d, theme.colors.accent], count: 5, speed: 2.6, size: 0.11, life: 0.4, gravity: 6, up: 2.4 };
  const DUST = { color: 0xffffff, count: 1, speed: 1.2, size: 0.1, life: 0.35, gravity: 2, up: 0.9 };
  const SPLASH = { colors: [0x7a5cff, 0xb9a5ff, 0xffffff], count: 16, speed: 4.5, size: 0.14, life: 0.5, gravity: 12, up: 3.6 };
  const RING = { color: 0xffffff, radius: 3.2, life: 0.5 };
  const doneEvt = { level: 0, stars: 0, count: 0, cash: 0, newStars: 0, mult: 1 };
  const startEvt = { level: 0 };

  // ------------------------------------------------------------------ building a level
  const aspect = () => (window.innerWidth || 1) / (window.innerHeight || 1);
  const baseView = () => (aspect() < 1 ? T.view.portrait : T.view.landscape);
  function prepare(n) {
    const b = ensure();
    // the lane fills most of a portrait screen and stays a sensible width on a wide one
    S.half = clamp(baseView() * aspect() * 0.345, 2.6, 4.2);
    S.lim = S.half - 0.42;
    S.pickHalf = S.half - 0.55;
    b.track.size(S.half);
    b.gates.size(S.half);
    const lv = buildLevel(G.worldId, n);
    b.track.layout(lv.length);
    S.level = lv; S.n = n;
    if (taken.length < lv.pickN) taken = new Uint8Array(lv.pickN);
    hazN = lv.hazards.length;
    if (hazS.length < hazN) {
      hazS = new Float32Array(hazN); hazL = new Float32Array(hazN); hazW = new Float32Array(hazN); hazT = new Float32Array(hazN);
      hazState = new Uint8Array(hazN);
    }
    for (let i = 0; i < hazN; i++) {
      const h = lv.hazards[i];
      hazS[i] = h.s; hazL[i] = h.f * S.half; hazW[i] = h.hw * S.half;
    }
  }
  function begin() {
    const b = B, lv = S.level;
    taken.fill(0); hazState.fill(0); hazT.fill(0);
    S.phase = 'ready'; S.t = 0; S.time = 0;
    S.s = 0; S.l = 0; S.v = 0; S.lv = 0; S.yaw = Math.PI / 4;
    S.count = lv.start; S.pending = 0; S.combo = 0; S.comboT = 0; S.slow = 0; S.safe = 0; S.boost = 0;
    S.gi = 0; S.pLo = 0; S.trail = 0; S.bannerT = 0;
    S.final = 0; S.unloaded = 0; S.moved = 0; S.fill = -1; S.mult = 1; S.pileN = -1; S.cheers = 0; S.tick = 0;
    S.result = null;
    S.view = baseView(); S.cs = S.view * 0.27; S.cl = 0;
    b.stack.clear();
    b.gates.reset();
    b.root.visible = true;
    b.char.visible = true;
    b.count.show(true); b.count.set(S.count);
    b.tally.show(false); b.tally.set(0);
    setLamps(0);
    setPile(0);
    hud.progress(0);
    hud.count(S.count, false);
    hud.banner('RUN ' + S.n);
    hud.speed(0);
    hud.show(true);
    place();
    camera(1);
    startEvt.level = S.n;
    G.events.emit('run:start', startEvt);
  }
  function end() {
    if (!B) return;
    B.root.visible = false;
    B.char.visible = false;
    B.count.show(false); B.tally.show(false);
    B.stack.clear();
    hud.show(false);
    hud.banner('');
    S.phase = 'idle'; S.result = null;
  }

  // ------------------------------------------------------------------ the runner
  function place() {
    const b = B;
    toWorld(S.s, S.l, 0, b.char.position);
    b.char.rotation.y = S.yaw;
  }
  /** move the visible tower toward the count: a gate's gain cascades in over a few frames */
  /**
   * How many items the tower shows for a count. Every item shows while the tower is small; after that it
   * keeps growing, but ever more slowly, so it is still growing at 500 and never outgrows the screen.
   * The number above it is the truth.
   */
  function shownFor(c) {
    const a = B.linear;
    return c <= a ? c : Math.min(B.cap, Math.round(a + B.curve * Math.log(1 + (c - a) / B.curve)));
  }
  function syncStack() {
    const st = B.stack;
    const want = shownFor(Math.max(0, S.count - S.pending));
    let have = st.count;
    if (have < want) {
      let k = Math.max(1, Math.ceil((want - have) * 0.22));
      while (k-- > 0 && have < want) { st.push(theme.item); have++; }
    } else if (have > want) {
      let k = Math.max(1, Math.ceil((have - want) * 0.3));
      while (k-- > 0 && have > want) { st.pop(); have--; }
    }
  }
  function camera(k) {
    const lv = S.level, running = S.phase === 'ready' || S.phase === 'run';
    const base = baseView();
    const tower = Math.min(1, B.stack.count / B.perColumn);
    const view = running ? base * (1 + 0.22 * tower) : Math.max(base, T.viewFinish);
    const ts = running ? S.s + view * (aspect() < 1 ? 0.27 : 0.33) : lv.length + FIN.gauge - 2.8;
    const tl = running ? S.l * 0.35 : 0;
    S.view += (view - S.view) * Math.min(1, k * 0.6);
    if (running) { S.cs = ts; S.cl += (tl - S.cl) * k; } else { S.cs += (ts - S.cs) * k; S.cl += (tl - S.cl) * k; }
    modes.follow(origin.x + (S.cs - S.cl) * S2, origin.z + (S.cs + S.cl) * S2, modes.zoomFor(S.view));
  }

  // ------------------------------------------------------------------ things that happen on the way
  function collect(i, l) {
    const lv = S.level;
    taken[i] = 1;
    S.count++;
    S.pending++;
    toWorld(lv.pickS[i], l, 0.4, _v);
    pickFly.dur = 0.16 + 0.05 * (S.pending & 1);
    G.fx.fly(pickFly);
    G.fx.burst(_v, SPARK);
    S.combo = S.comboT > 0 ? Math.min(PENTA.length - 1, S.combo + 1) : 0;
    S.comboT = 0.55;
    sound.pitch = Math.pow(2, PENTA[S.combo] / 12); sound.volume = 0.9;
    play('runPick', sound);
    if ((S.count & 3) === 0) haptic(6);
  }
  /** items knocked off the tower fly out over the edges of the runway */
  function spill(lost) {
    const n = Math.min(12, lost), top = B.stack.count * item.step * 0.9;
    for (let i = 0; i < n; i++) {
      const side = i & 1 ? 1 : -1, r = Math.random();
      toWorld(S.s + 0.6, S.l, 0.8 + Math.random() * Math.min(top, 6), _v);
      toWorld(S.s + 3 + r * 6, side * (S.half + 1.5 + Math.random() * 3.5), -2.5, _w);
      spillFly.dur = 0.42 + r * 0.25; spillFly.arc = 1.6 + Math.random() * 1.8; spillFly.delay = i * 0.012;
      G.fx.fly(spillFly);
    }
  }
  function passGate(g, side) {
    const o = side ? g.b : g.a, before = S.count;
    S.count = Math.min(99999, applyOp(S.count, o.op, o.v));
    B.gates.take(S.gi, side);
    const gw = B.gates.width;
    for (let k = 0; k < 2; k++) {
      const opt = k ? g.b : g.a, mine = k === side;
      toWorld(g.s, (k ? 1 : -1) * gw * 0.5, 1.5, _p);
      const c = opt.gain ? GAIN : LOSS;
      const bo = mine ? BURST : BURST_SMALL;
      bo.color = c;
      G.fx.burst(_p, bo);
      if (mine) { RING.color = c; G.fx.ring(_p, RING); }
    }
    toWorld(g.s + 0.5, S.l, 3.2, _p);
    if (o.gain) {
      G.fx.popText(_p, o.text, gateText);
      sound.pitch = o.op === MUL ? 1.26 : 1; sound.volume = 1;
      play('runGate', sound);
      haptic(18);
      hud.flash('good');
      S.boost = 0.7;
      if (o.op === MUL) G.fx.shake(0.16, 0.2);
    } else {
      G.fx.popText(_p, o.text, lossText);
      play('runBad');
      haptic(40);
      hud.flash('hit');
      G.fx.shake(0.22, 0.25);
      spill(before - S.count);
    }
    hud.count(S.count, true);
  }
  function hitHazard(i) {
    const type = S.level.hazards[i].type, k = T.knock[type];
    const lost = Math.min(S.count, clamp(Math.round(S.count * k[0]), k[1], k[2]));
    S.count -= lost;
    hazState[i] = type === PUDDLE ? 1 : 2;
    hazT[i] = 0;
    S.slow = 1; S.safe = 0.7;
    spill(lost);
    toWorld(S.s, S.l, 0.3, _p);
    if (type === PUDDLE) G.fx.burst(_p, SPLASH);
    else { BURST.color = 0xff8a7a; G.fx.burst(_p, BURST); }
    _p.y = 2.6;
    if (lost > 0) G.fx.popText(_p, '-' + lost, lossText);
    play('runHit');
    haptic(45);
    hud.flash('hit');
    G.fx.shake(0.3, 0.3);
    hud.count(S.count, true);
  }

  // ------------------------------------------------------------------ the finish
  function setLamps(fill) {
    const f = Math.round(clamp(fill, 0, 1) * 400) / 400;
    if (f === S.fill) return;
    S.fill = f;
    const lamps = B.track.lamps;
    for (let i = 0; i < LAMPS; i++) {
      const p = clamp(f * LAMPS - i, 0, 1);
      _p.set(0, LAMP_Y0 + i * LAMP_GAP, FIN.gauge - 0.34);
      if (p > 0) _s.set(2.3, LAMP_H * p, 0.1); else _s.set(0, 0, 0);
      _m.compose(_p, _q.identity(), _s);
      lamps.setMatrixAt(i, _m);
    }
    lamps.instanceMatrix.needsUpdate = true;
  }
  /** 0..1 on the bonus meter for a count: each fifth is one multiplier step */
  function fillOf(c) {
    const lv = S.level, st = lv.steps;
    let lo = 0;
    for (let k = 0; k < LAMPS; k++) {
      const hi = k < 4 ? st[k] : lv.max;
      if (c < hi) return (k + (c - lo) / Math.max(1, hi - lo)) / LAMPS;
      lo = hi;
    }
    return 1;
  }
  function multOf(c) { const st = S.level.steps; let m = 1; for (let k = 0; k < 4; k++) if (c >= st[k]) m = k + 2; return m; }
  function pileSlot(j, out) {
    const layer = (j / 6) | 0, k = j % 6;
    return out.set(((k % 2) - 0.5) * (item.footprint.w + 0.06), 0.6 + layer * item.step, S.level.length + FIN.pan + (((k / 2) | 0) - 1) * (item.footprint.d + 0.06));
  }
  function setPile(n) {
    n = Math.min(PILE_CAP, n);
    if (n === S.pileN) return;
    const pile = B.track.pile;
    for (let j = Math.max(0, S.pileN); j < n; j++) {
      pileSlot(j, _p);
      _e.set(0, ((j * 7) % 5 - 2) * 0.03, 0);
      _m.compose(_p, _q.setFromEuler(_e), _s.set(1, 1, 1));
      pile.setMatrixAt(j, _m);
    }
    S.pileN = n;
    pile.count = n;
    pile.instanceMatrix.needsUpdate = true;
  }
  function unload(dt) {
    const lv = S.level;
    S.moved += S.rate * dt;
    let k = Math.min(S.final, Math.floor(S.moved)) - S.unloaded, flies = 0;
    if (k <= 0) return;
    while (k-- > 0) {
      S.unloaded++;
      S.count--;
      if (flies < 2 && B.stack.count > 0) {
        flies++;
        B.stack.topWorld(_v);
        const shownTo = S.final <= PILE_CAP ? S.unloaded : Math.ceil((S.unloaded / S.final) * PILE_CAP);
        pileSlot(Math.min(PILE_CAP, shownTo), _p);
        toWorld(_p.z, -_p.x, _p.y, _w);
        loadFly.dur = 0.26 + 0.06 * flies;
        G.fx.fly(loadFly);
      }
      const m = multOf(S.unloaded);
      if (m > S.mult) {
        S.mult = m;
        toWorld(lv.length + FIN.gauge - 1, 0, LAMP_Y0 + (m - 1) * LAMP_GAP + 0.3, _p);
        G.fx.popText(_p, 'x' + m, stepText);
        BURST_SMALL.color = LAMP_COLORS[m - 1];
        G.fx.burst(_p, BURST_SMALL);
        sound.pitch = 1 + (m - 2) * 0.16; sound.volume = 1;
        play('runMult', sound);
        haptic(20);
      }
    }
    setPile(S.final <= PILE_CAP ? S.unloaded : Math.ceil((S.unloaded / S.final) * PILE_CAP));
    setLamps(fillOf(S.unloaded));
    S.tick -= dt;
    if (S.tick <= 0) {
      S.tick = 0.045;
      sound.pitch = 0.8 + 1.0 * (S.unloaded / S.final); sound.volume = 0.8;
      play('runTick', sound);
      haptic(5);
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
  /** the tower is on the scale: stars, records, cash */
  function settle() {
    const lv = S.level, c = S.final;
    const stars = c >= lv.t3 ? 3 : c >= lv.t2 ? 2 : 1;
    const mult = multOf(c);
    const first = !saved[lv.n];
    const rec = saved[lv.n] || (saved[lv.n] = { stars: 0, best: 0 });
    const newStars = Math.max(0, stars - rec.stars);
    const newBest = !first && c > rec.best;
    // a first finish and every new star pay in full; running a beaten level again pays half
    const replay = !first && newStars === 0;
    const cash = nice(unit() * (0.5 + 0.25 * mult + 0.1 * stars) * (replay ? 0.5 : 1));      // 0.85 to 2.05 units
    if (stars > rec.stars) rec.stars = stars;
    if (c > rec.best) rec.best = c;
    if (G.save && G.save.meta) G.save.meta.runStars = totalStars();
    // bonus money stays out of the thrills' income estimate, like its own prizes
    if (G.thrills && G.thrills.pay) G.thrills.pay(cash, null, '', false, true); else G.addMoney(cash);
    if (G.thrills && G.thrills.addStar) for (let i = 0; i < newStars; i++) G.thrills.addStar(1);
    S.result = { stars, mult, cash, newStars, newBest, replay, count: c };
    doneEvt.level = lv.n; doneEvt.stars = stars; doneEvt.count = c; doneEvt.cash = cash; doneEvt.newStars = newStars; doneEvt.mult = mult;
    G.events.emit('run:done', doneEvt);
    if (G.saveNow) G.saveNow();
  }
  function showResult() {
    const r = S.result, lv = S.level;
    const toNext = r.stars === 1 ? lv.t2 - r.count : r.stars === 2 ? lv.t3 - r.count : 0;
    const note = r.newStars > 0 && G.thrills ? `+${r.newStars} perk star${r.newStars > 1 ? 's' : ''} for the perk gates`
      : r.replay ? 'Replay: half reward. New stars pay in full.'
        : toNext > 0 ? `${toNext} more for the next star` : '';
    modes.showResult({
      kicker: `${theme.name}  /  RUN ${lv.n}`,
      title: r.stars >= 3 ? 'PERFECT RUN!' : r.stars === 2 ? 'GREAT RUN!' : 'RUN COMPLETE!',
      stars: r.stars,
      newBest: r.newBest,
      lines: [
        { label: theme.itemName + ' delivered', value: r.count, roll: true },
        { label: 'Bonus', text: 'x' + r.mult, accent: true },
      ],
      cash: r.cash,
      note,
      onRetry: () => retry(),
      onContinue: () => leave(),
    });
  }

  // ------------------------------------------------------------------ instanced props in view
  function drawProps() {
    const lv = S.level, tr = B.track, time = S.time;
    // pickups: spin and bob; only the ones near the runner are drawn
    const pm = tr.pickups;
    let n = 0;
    while (S.pLo < lv.pickN && lv.pickS[S.pLo] < S.s - 13) S.pLo++;
    for (let i = S.pLo; i < lv.pickN && n < PICK_CAP; i++) {
      const ps = lv.pickS[i];
      if (ps > S.s + 46) break;
      if (taken[i]) continue;
      _p.set(-lv.pickF[i] * S.pickHalf, 0.32 + 0.1 * Math.sin(time * 4 + i * 1.3), ps);
      _e.set(0, time * 1.8 + i * 0.9, 0.22);
      _m.compose(_p, _q.setFromEuler(_e), _s.set(1.12, 1.12, 1.12));
      pm.setMatrixAt(n++, _m);
    }
    pm.count = n;
    pm.instanceMatrix.needsUpdate = true;
    // hazards
    let nb = 0, np = 0, ns = 0, na = 0;
    for (let i = 0; i < hazN; i++) {
      const st = hazState[i], hs = hazS[i];
      if (st === 3 || hs < S.s - 13 || hs > S.s + 46) continue;
      const h = lv.hazards[i];
      let k = 1, lift = 0;
      if (st === 2) { const u = hazT[i] / 0.35; k = Math.max(0.001, 1 - u); lift = u * 2.2; }
      if (h.type === BARRIER && nb < HAZ_CAP) {
        _p.set(-hazL[i], lift, hs);
        _e.set(st === 2 ? -hazT[i] * 6 : 0, 0, 0);
        _m.compose(_p, _q.setFromEuler(_e), _s.set(hazW[i] * 2 * k, k, k));
        tr.barrier.setMatrixAt(nb++, _m);
      } else if (h.type === PUDDLE && np < HAZ_CAP) {
        const r = hazW[i] * (1 + 0.04 * Math.sin(time * 3 + i));
        _m.compose(_p.set(-hazL[i], 0.02, hs), _q.identity(), _s.set(r, 1, r));
        tr.puddle.setMatrixAt(np++, _m);
      } else if (h.type === SPINNER) {
        if (ns < HAZ_CAP) { _m.compose(_p.set(-hazL[i], 0, hs), _q.identity(), _s.set(1, 1, 1)); tr.post.setMatrixAt(ns++, _m); }
        if (st !== 2 || k > 0.01) {
          if (na < HAZ_CAP) {
            _m.compose(_p.set(-hazL[i], lift, hs), _q.setFromAxisAngle(UP, h.ph + h.w * time), _s.set(k, k, k));
            tr.arm.setMatrixAt(na++, _m);
          }
        }
      }
    }
    tr.barrier.count = nb; tr.puddle.count = np; tr.post.count = ns; tr.arm.count = na;
    tr.barrier.instanceMatrix.needsUpdate = true; tr.puddle.instanceMatrix.needsUpdate = true;
    tr.post.instanceMatrix.needsUpdate = true; tr.arm.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ update
  function runStep(dt) {
    const lv = S.level, inp = G.input;
    // forward: a steady pace that ramps up a little; a hit slows the runner for a moment
    const prog = clamp(S.s / lv.length, 0, 1);
    S.slow = Math.max(0, S.slow - dt * 2.2);
    S.safe = Math.max(0, S.safe - dt);
    S.v = (lv.v0 + (lv.v1 - lv.v0) * prog) * (1 - 0.5 * S.slow);
    // sideways: straight from the stick, clamped to the lane
    const ix = clamp(inp ? inp.x || 0 : 0, -1, 1);
    const l0 = S.l;
    S.l = clamp(S.l + ix * T.lateral * dt, -S.lim, S.lim);
    S.lv += ((S.l - l0) / dt - S.lv) * Math.min(1, dt * 14);
    S.s += S.v * dt;

    // pickups
    for (let i = S.pLo; i < lv.pickN; i++) {
      const d = lv.pickS[i] - S.s;
      if (d > 0.8) break;
      if (taken[i] || d < -0.8) continue;
      const l = lv.pickF[i] * S.pickHalf;
      if (Math.abs(l - S.l) < 0.9) collect(i, l);
    }
    S.comboT -= dt;
    // gates: the half of the lane the runner is in decides
    if (S.gi < lv.gates.length && S.s >= lv.gates[S.gi].s - 0.2) { passGate(lv.gates[S.gi], S.l < 0 ? 0 : 1); S.gi++; }
    // hazards
    for (let i = 0; i < hazN; i++) {
      const st = hazState[i];
      if (st === 2) { hazT[i] += dt; if (hazT[i] > 0.35) hazState[i] = 3; continue; }
      if (st !== 0 || S.safe > 0) continue;
      const ds = S.s - hazS[i], dl = S.l - hazL[i];
      if (ds < -3 || ds > 3) continue;
      const h = lv.hazards[i];
      let hit = false;
      if (h.type === BARRIER) hit = Math.abs(ds) < 0.7 && Math.abs(dl) < hazW[i] + 0.3;
      else if (h.type === PUDDLE) hit = ds * ds + dl * dl < hazW[i] * hazW[i] * 0.72;
      else {
        const a = h.ph + h.w * S.time, ca = Math.cos(a), sa = Math.sin(a);
        hit = Math.abs(dl * ca + ds * sa) < hazW[i] + 0.3 && Math.abs(-dl * sa + ds * ca) < 0.55;
      }
      if (hit) hitHazard(i);
    }
    // dust at the heels, sparks while boosted
    S.trail -= dt;
    if (S.trail <= 0) {
      S.trail = 0.07;
      toWorld(S.s - 0.4, S.l, 0.05, _p);
      G.fx.burst(_p, DUST);
    }
    S.boost = Math.max(0, S.boost - dt);
    hud.speed(S.boost > 0 ? 2 : 1);
    hud.progress(prog);
    hud.count(S.count, false);
    if (S.s >= lv.length - 0.7) {
      // through the ribbon
      S.phase = 'brake'; S.t = 0;
      hud.banner('FINISH!'); S.bannerT = 1.1;
      hud.show(false);
      B.track.ribbon.visible = false;
      B.count.show(false);
      toWorld(lv.length, 0, FIN.ribbonY, _p);
      BURST.color = theme.colors.accent;
      G.fx.burst(_p, BURST);
      G.fx.confetti(_p, 90);
      play('runGate', sound);
      haptic(30);
    }
  }

  function update(dt) {
    const b = B, lv = S.level;
    if (!b || !lv || S.phase === 'idle') return;
    S.t += dt; S.time += dt;
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) hud.banner(''); }
    anim.moving = false; anim.action = null;

    if (S.phase === 'ready') {
      if (S.t >= T.ready) { S.phase = 'run'; S.t = 0; hud.banner('GO!'); S.bannerT = 0.6; play('runGo'); haptic(15); }
    } else if (S.phase === 'run') {
      runStep(dt);
      anim.moving = true;
    } else if (S.phase === 'brake') {
      // run on to the scale, drifting to the middle
      const stop = lv.length + FIN.stop;
      S.v = Math.min(S.v, Math.max(2.4, (stop - S.s) * 2.4));
      S.s = Math.min(stop, S.s + S.v * dt);
      S.l += (0 - S.l) * Math.min(1, dt * 5);
      S.lv *= 0.8;
      anim.moving = true;
      hud.progress(1);
      if (S.s >= stop - 0.02) {
        S.final = S.count; S.unloaded = 0; S.moved = 0; S.mult = 1; S.tick = 0;
        S.rate = S.final / clamp(S.final / 80, 1.2, 2.8);
        S.phase = 'unload'; S.t = 0;
        b.tally.show(true);
      }
    } else if (S.phase === 'unload') {
      if (S.unloaded < S.final) unload(dt);
      if (S.unloaded >= S.final && S.t > 0.25) {
        settle();
        S.phase = 'cheer'; S.t = 0; S.cheers = 0;
        toWorld(lv.length + FIN.pan, 0, 3.6 + Math.ceil(Math.max(0, S.pileN) / 6) * item.step, _p);
        G.fx.popText(_p, 'x' + S.result.mult + ' BONUS', multText);
        play('runWin');
        haptic(60);
        G.fx.shake(0.2, 0.3);
      }
    } else if (S.phase === 'cheer') {
      anim.action = 'wave';
      if (S.cheers < 3 && S.t >= S.cheers * 0.32) {
        const side = S.cheers - 1;
        toWorld(lv.length + FIN.pan + side * 1.5, side * 3.4, 0.6, _p);
        G.fx.confetti(_p, 60);
        S.cheers++;
      }
      if (S.t >= 1.5) { S.phase = 'result'; S.t = 0; showResult(); }
    } else if (S.phase === 'result') {
      anim.action = 'wave';
    }

    // the runner leans into a turn
    const want = Math.atan2(Math.max(0.1, S.v) - S.lv * 0.55, Math.max(0.1, S.v) + S.lv * 0.55);
    S.yaw += (want - S.yaw) * Math.min(1, dt * 12);
    place();
    anim.carrying = b.stack.count > 0;
    animateCharacter(b.char, dt, anim);
    syncStack();
    b.stack.update(dt, anim.moving ? 1 : 0);
    b.gates.assign(lv, S.gi);
    b.gates.update(dt, S.time);
    drawProps();

    // floating numbers: the count over the tower, the tally over the scale
    const ls = S.view / 22;
    if (b.count.mesh.visible) {
      b.stack.root.getWorldPosition(_v);
      b.count.mesh.position.set(_v.x, _v.y + Math.min(b.stack.count, b.perColumn) * item.step + 0.55, _v.z);
      b.count.set(S.count);
      b.count.update(dt, ls);
    }
    if (b.tally.mesh.visible) {
      toWorld(lv.length + FIN.pan, 0, 1.5 + Math.ceil(Math.max(0, S.pileN) / 6) * item.step, b.tally.mesh.position);
      b.tally.set(S.unloaded);
      b.tally.update(dt, ls);
    }
    camera(1 - Math.exp(-3.4 * dt));
  }

  // ------------------------------------------------------------------ the mode and its API
  const mode = { id: 'run', update, onEnter: begin, onExit: end };
  const active = () => modes.active === mode;

  function start(n) {
    n = Math.floor(n);
    if (!(n >= 1 && n <= LEVELS) || modes.active || !G.player || !G.fx || !G.fx.fly || !unlocked(n)) return false;
    try { prepare(n); } catch (err) { console.error('[run] could not build the level:', err); return false; }
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
  /** The stick x a competent player would use: the better gate, the pickups on the way, round the hazards. */
  function botSteer() {
    if (!active() || S.phase !== 'run') return 0;
    const lv = S.level;
    let target = S.l, lo = -S.lim, hi = S.lim;
    // the next gate decides which half of the lane to be in
    if (S.gi < lv.gates.length) {
      const g = lv.gates[S.gi], d = g.s - S.s;
      if (d < 15) {
        const right = applyOp(S.count, g.b.op, g.b.v) > applyOp(S.count, g.a.op, g.a.v);
        if (right) lo = 0.5; else hi = -0.5;
        target = right ? S.half * 0.5 : -S.half * 0.5;
      }
    }
    // the nearest pickup ahead that can be had on this side
    for (let i = S.pLo; i < lv.pickN; i++) {
      const d = lv.pickS[i] - S.s;
      if (d > 8) break;
      if (taken[i] || d < 0.3) continue;
      const l = lv.pickF[i] * S.pickHalf;
      if (l < lo - 0.3 || l > hi + 0.3 || Math.abs(l - S.l) > d * 0.85 + 0.9) continue;
      target = l;
      break;
    }
    target = clamp(target, lo, hi);
    // step round a hazard that is in the way
    for (let i = 0; i < hazN; i++) {
      if (hazState[i] !== 0) continue;
      const d = hazS[i] - S.s;
      if (d < -1 || d > 9) continue;
      const m = hazW[i] + (lv.hazards[i].type === PUDDLE ? 0.25 : 0.75);
      if (Math.abs(target - hazL[i]) >= m) continue;
      const a = hazL[i] - m - 0.1, c = hazL[i] + m + 0.1;
      const okA = a >= lo - 0.01 && a >= -S.lim, okC = c <= hi + 0.01 && c <= S.lim;
      if (okA && okC) target = Math.abs(a - S.l) < Math.abs(c - S.l) ? a : c;
      else if (okA) target = a;
      else if (okC) target = c;
      else if (a >= -S.lim) target = a;
      else if (c <= S.lim) target = c;
    }
    return clamp((target - S.l) * 2.4, -1, 1);
  }

  // ------------------------------------------------------------------ listing on the bonus-level sheet
  modes.registerLevels({
    type: 'run',
    title: 'GATE RUN',
    sub: () => `${theme.name}: stack ${theme.itemName.toLowerCase()} through the gates`,
    levels,
    start,
  });

  return {
    levels, start, next, leave, retry, botSteer,
    get active() { return active(); },
    get phase() { return active() ? S.phase : 'idle'; },
    /** the live run, for tests and the console: count, distance, level */
    get state() { return S; },
    theme, tune: T,
    debugUnlock(on = true) { D.all = !!on; modes.refresh(false); },
  };
}
