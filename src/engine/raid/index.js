// Raid: bonus levels where the world's goods are defended. A little fenced yard floats away from the
// world, with a pallet of the world's main item in the middle. Pests hop out of burrows, come in
// through the gaps in the fence, grab one item each and run back out with it. The world's own
// character sweeps them away just by being near (no button), every popped pest drops a coin, and
// coins buy scarecrow helpers on four pads round the pile. The last wave brings one BIG pest.
//
//   G.raid.levels() -> [{ n, unlocked, stars, best, isNew, need }]
//   G.raid.start(n) -> bool       start level n (false: locked, busy, or it could not be built)
//   G.raid.next()   -> n | null   the lowest unlocked level with fewer than three stars
//   G.raid.active                 true from start() until the camera is back in the world
//   G.raid.phase                  'idle' | 'ready' | 'fight' | 'cheer' | 'fail' | 'result'
//   G.raid.leave() / retry(n?)    the result card's buttons (leave() also quits a raid in progress)
//   G.raid.botSteer() -> { x, y } the stick a competent player would hold now (the test bot)
//   G.raid.debugUnlock(on = true) tests: every level counts as unlocked
// Events: 'raid:start' { level }, 'raid:done' { level, stars, newStars, cash, left }.
// State:  levels.<world>.raids = { '1': { stars, best }, ... }; meta.raidStars = stars over all worlds.
//
// A client of the mini-mode host (engine/modes), like the Gate Run: the host freezes the world, hides
// its HUD, moves the camera and shows the level sheet and the result card. The level comes from
// level.js (seeded: the same every time), the 3D from arena.js, the item and colours from the Gate
// Run's theme (run/theme.js), so a world needs to define nothing. world.raid = { pest: 0xrrggbb,
// shot: 'turnip' | 'corn' | 'apple' | 'bolt' | 'snowball' } re-dresses the pests and the helpers.
//
// The simulation runs in update(dt) on typed arrays (no allocation); matrices are written once per
// rendered frame (frame()).
import * as THREE from 'three';
import { PLAYER } from '../config.js';
import { makeCharacter, animateCharacter, LOOKS } from '../chars.js';
import { themeFor } from '../run/theme.js';
import { buildRaid, LEVELS, PAD_COST } from './level.js';
import { createArena, R, PILE_R, BURROW, PEST_CAP, COIN_CAP, SHOT_CAP } from './arena.js';
import { createRaidHud, SHIELD } from './hud.js';

const S2 = Math.SQRT1_2;
export const TUNE = {
  view: { portrait: 29, landscape: 19 },      // world units visible vertically
  lift: { portrait: 0.4, landscape: 1.1 },    // the yard sits this far below the middle of the screen (the HUD is on top)
  follow: { portrait: 0.62, landscape: 0.28 },// how far the camera leans after the hero
  speed: 7.6,                                 // the hero's pace
  reach: 2.05,                                // sweep radius
  bopEvery: 0.3,                              // seconds between sweeps while something is in reach
  knock: 8.5,                                 // knock-back speed
  ready: 1.25,                                // seconds before the clock starts
  fireEvery: 1.0, range: 7.5, shotTime: 0.34, // helpers
  payEvery: 0.055, padRadius: 1.25,
  stars: [0.45, 0.8],                         // share of the pile left for two and three stars
};
const DRESS = {
  flower: { pest: 0x9a6fe0, shot: 'turnip' },
  chicken: { pest: 0xf2843a, shot: 'corn' },
  grocery: { pest: 0x7f8aa6, shot: 'apple' },
  factory: { pest: 0x39b8a6, shot: 'bolt' },
  frost: { pest: 0x9fbdf2, shot: 'snowball' },
  town: { pest: 0xb07a4e, shot: 'turnip' },
};
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const FREE = 0, IN = 1, GO = 2, GRAB = 3, BACK = 4, OUT = 5, POP = 6, DROP = 7;
const BIG = PEST_CAP - 1;                    // the big one has a slot of its own
const BIG_SCALE = 6.5;                       // 5x an ordinary pest
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function angTo(a, b, k) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2; else if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}

function loadRaids(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (let n = 1; n <= LEVELS; n++) {
    const r = raw[n];
    if (!isObj(r)) continue;
    const stars = Number.isFinite(r.stars) ? clamp(Math.floor(r.stars), 0, 3) : 0;
    const best = Number.isFinite(r.best) && r.best > 0 ? Math.min(999, Math.floor(r.best)) : 0;
    if (stars > 0 || best > 0) out[n] = { stars: Math.max(stars, best > 0 ? 1 : 0), best };
  }
  return out;
}

export function createRaid(G) {
  const modes = G.modes;
  if (!modes) throw new Error('the raid needs the mode host (G.modes)');
  const theme = themeFor(G);
  const wr = isObj(G.world.raid) ? G.world.raid : {};
  const d0 = DRESS[G.worldId] || {};
  const dress = { pest: Number.isFinite(wr.pest) ? wr.pest : d0.pest || theme.colors.accent2, shot: wr.shot || d0.shot || 'turnip' };
  const origin = modes.arena(1);
  const saved = (G.state.raids = loadRaids(G.state.raids));
  const T = TUNE;
  const D = { all: false };

  // ------------------------------------------------------------------ unlocking and records
  const paid = (G.world.pads || []).filter((p) => p.cost > 0);
  const need1 = Math.min(paid.length, Math.max(1, Math.ceil(paid.length * 0.35)));
  const need2 = Math.min(paid.length, Math.max(need1, Math.ceil(paid.length * 0.75)));
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
      const r = lv[w] && lv[w].raids;
      if (isObj(r)) for (const k in r) { const s = r[k] && r[k].stars; if (s > 0 && s <= 3) t += Math.floor(s); }
    }
    return t;
  }
  if (G.save && G.save.meta) G.save.meta.raidStars = totalStars();

  // ------------------------------------------------------------------ state
  // numbers that change every step live on objects and typed arrays: no per-step allocation
  const S = {
    phase: 'idle', t: 0, clock: 0, time: 0, n: 0, level: null, epoch: 0,
    hx: 0, hz: 0, hyaw: 0, moving: false,
    bopT: 0, swing: 0, arcA: 0, combo: 0, comboT: 0, coinCombo: 0, coinT: 0, textT: 0, grabT: 0,
    coins: 0, pile: 0, incoming: 0, lost: 0, popped: 0, total: 0,
    wave: 0, si: 0, bigOn: false, bigY: 0, bigHp: 1, payT: 0, pileFlash: 0, bannerT: 0,
    liveN: 0, carriers: 0, cx: 0, cz: 0, result: null,
  };
  const px = new Float32Array(PEST_CAP), pz = new Float32Array(PEST_CAP), kx = new Float32Array(PEST_CAP), kz = new Float32Array(PEST_CAP);
  const tx = new Float32Array(PEST_CAP), tz = new Float32Array(PEST_CAP), lf = new Float32Array(PEST_CAP);
  const ph = new Float32Array(PEST_CAP), tm = new Float32Array(PEST_CAP), ag = new Float32Array(PEST_CAP), sp = new Float32Array(PEST_CAP);
  const sc = new Float32Array(PEST_CAP), fl = new Float32Array(PEST_CAP), yw = new Float32Array(PEST_CAP), tn = new Float32Array(PEST_CAP);
  const st = new Uint8Array(PEST_CAP), hp = new Uint8Array(PEST_CAP), gp = new Uint8Array(PEST_CAP), cr = new Uint8Array(PEST_CAP), cn = new Uint8Array(PEST_CAP);
  const live = new Uint8Array(PEST_CAP);
  const gcos = new Float32Array(8), gsin = new Float32Array(8), gapFlash = new Float32Array(8);
  // coins: 0 free, 1 popping out, 2 flying to the hero
  const cOn = new Uint8Array(COIN_CAP), cx = new Float32Array(COIN_CAP), cy = new Float32Array(COIN_CAP), cz = new Float32Array(COIN_CAP);
  const cvx = new Float32Array(COIN_CAP), cvy = new Float32Array(COIN_CAP), cvz = new Float32Array(COIN_CAP), ct = new Float32Array(COIN_CAP);
  // what the helpers toss
  const sOn = new Uint8Array(SHOT_CAP), sT = new Float32Array(SHOT_CAP), sFx = new Float32Array(SHOT_CAP), sFz = new Float32Array(SHOT_CAP);
  const sQx = new Float32Array(SHOT_CAP), sQz = new Float32Array(SHOT_CAP), sTarget = new Uint8Array(SHOT_CAP);
  // helpers and their pads
  const NP = PAD_COST.length;
  const tOn = new Uint8Array(NP), padPaid = new Float32Array(NP), tRise = new Float32Array(NP), tCool = new Float32Array(NP), tYaw = new Float32Array(NP), tKick = new Float32Array(NP);

  // ------------------------------------------------------------------ 3D, built on the first raid
  let B = null;
  function ensure() {
    if (B) return B;
    const arena = createArena(G, origin, theme, dress);
    // the world's own player look, as engine/player.js resolves it
    const P = { ...PLAYER, ...(G.world.player || {}) };
    const look = typeof P.look === 'string' ? (LOOKS[P.look] || LOOKS.player) : P.look;
    const char = makeCharacter(look);
    char.visible = false;
    G.scene.add(char);
    // the human rig's swing is a deep lunge for cutting crops: too much for a bop, the sweep arc says it
    B = { arena, char, swings: char.userData.rig !== 'human' };
    return B;
  }

  const hud = createRaidHud(G, { leave: () => leave() });
  const play = (name, o) => { if (G.audio && G.audio.play) G.audio.play(name, o); };
  const haptic = (ms) => modes.haptic(ms);

  // temporaries and pre-built option objects
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0), IDQ = new THREE.Quaternion();
  const anim = { moving: false, speed: 1.15, carrying: false, action: null };
  const sound = { pitch: 1, volume: 1 };
  const steer = { x: 0, y: 0 };
  const W = (x, y, z, out) => out.set(origin.x + x, y, origin.z + z);
  const pileTop = (out) => { B.arena.slot(S.pile + Math.max(0, S.incoming - 1), out); out.x += origin.x; out.z += origin.z; return out; };
  const landed = (epoch) => {
    if (epoch !== S.epoch) return;                 // an item of an earlier raid: that pile is gone
    S.incoming = Math.max(0, S.incoming - 1);
    S.pile = Math.min(S.total, S.pile + 1);
    B.arena.setPile(S.pile);
    hud.pile(S.pile, S.total, false);
    sound.pitch = 1.2; sound.volume = 0.7;
    play('raidBack', sound);
  };
  const backFly = { kind: theme.item, from: _v, to: pileTop, dur: 0.42, arc: 2.6, delay: 0, onDone: landed, data: 0 };
  const POPB = { colors: [0xffffff, dress.pest, 0xfff0a8], count: 9, speed: 4.2, size: 0.15, life: 0.45, gravity: 9, up: 3.4 };
  const HITB = { color: 0xffffff, count: 4, speed: 3, size: 0.11, life: 0.3, gravity: 6, up: 2 };
  const DUST = { colors: [0xffffff, theme.colors.lane], count: 30, speed: 7, size: 0.22, life: 0.7, gravity: 5, up: 2.2 };
  const BUILD = { colors: [0xffffff, theme.colors.accent, theme.colors.accent2], count: 22, speed: 5, size: 0.16, life: 0.6, gravity: 9, up: 4.5 };
  const PAYB = { color: 0xffd84a, count: 2, speed: 1.6, size: 0.1, life: 0.3, gravity: 5, up: 2 };
  const RING = { color: 0xffffff, radius: 3, life: 0.5 };
  const coinText = { color: '#ffe14d', size: 0.85, life: 0.6, maxW: 0.3 };
  const lossText = { color: '#ff6b6b', size: 1.0, life: 0.8, maxW: 0.4 };
  const goodText = { color: '#ffffff', size: 1.2, life: 1.0, maxW: 0.6 };
  const doneEvt = { level: 0, stars: 0, newStars: 0, cash: 0, left: 0 };
  const startEvt = { level: 0 };
  const LOSS = ['', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', '-11', '-12'];

  // ------------------------------------------------------------------ building a level
  const aspect = () => (window.innerWidth || 1) / (window.innerHeight || 1);
  function prepare(n) {
    const b = ensure();
    const lv = buildRaid(G.worldId, n);
    b.arena.layout(lv);
    S.level = lv; S.n = n;
    for (let g = 0; g < lv.gaps.length; g++) { gcos[g] = Math.cos(lv.gaps[g].a); gsin[g] = Math.sin(lv.gaps[g].a); }
  }
  function begin() {
    const b = B, lv = S.level, a = b.arena;
    S.epoch++;
    backFly.data = S.epoch;
    st.fill(0); cr.fill(0); cn.fill(0); fl.fill(0); kx.fill(0); kz.fill(0);
    cOn.fill(0); sOn.fill(0); tOn.fill(0); padPaid.fill(0); tRise.fill(0); tCool.fill(0); tKick.fill(0); gapFlash.fill(0);
    S.phase = 'ready'; S.t = 0; S.clock = 0; S.time = 0;
    S.hx = -2.5; S.hz = -2.5; S.hyaw = Math.atan2(-1, -1); S.moving = false;
    S.bopT = 0; S.swing = 0; S.combo = 0; S.comboT = 0; S.coinCombo = 0; S.coinT = 0; S.textT = 0; S.grabT = 0;
    S.coins = 0; S.total = lv.total; S.pile = lv.total; S.incoming = 0; S.lost = 0; S.popped = 0;
    S.wave = 0; S.si = 0; S.bigOn = false; S.bigY = 0; S.bigHp = lv.big.hp; S.payT = 0; S.pileFlash = 0;
    S.liveN = 0; S.carriers = 0; S.cx = S.hx * 0.4; S.cz = S.hz * 0.4; S.result = null;
    a.setPile(S.pile);
    a.tintPile(0);
    for (let g = 0; g < lv.gaps.length; g++) a.tintGap(g, 0);
    for (let k = 0; k < NP; k++) { a.pads[k].group.visible = true; a.pads[k].group.scale.setScalar(1); a.pads[k].draw(PAD_COST[k], 0); }
    a.pileBar.group.visible = true;
    a.pileBar.group.position.set(0, a.top(S.total) + 1.0, 0);
    a.pileBar.set(1);
    a.bigBar.group.visible = false;
    a.big.visible = false;
    a.root.visible = true;
    b.char.visible = true;
    hud.pile(S.pile, S.total, false);
    hud.coins(0, false);
    hud.wave(0, lv.waves);
    hud.banner('RAID ' + S.n, 'Defend the ' + theme.itemName.toLowerCase() + '!', '');
    S.bannerT = 1.2;
    hud.show(true);
    place();
    camera(1);
    draw();
    startEvt.level = S.n;
    G.events.emit('raid:start', startEvt);
  }
  function end() {
    if (!B) return;
    S.epoch++;
    B.arena.root.visible = false;
    B.char.visible = false;
    hud.show(false);
    hud.banner('');
    S.phase = 'idle'; S.result = null;
  }
  function place() {
    W(S.hx, 0, S.hz, B.char.position);
    B.char.rotation.y = S.hyaw;
  }
  function camera(k) {
    const port = aspect() < 1;
    const f = port ? T.follow.portrait : T.follow.landscape;
    S.cx += (S.hx * f - S.cx) * k; S.cz += (S.hz * f - S.cz) * k;
    const up = (port ? T.lift.portrait : T.lift.landscape) * S2;      // screen-up is world (+x, +z)
    modes.follow(origin.x + S.cx + up, origin.z + S.cz + up, modes.zoomFor(port ? T.view.portrait : T.view.landscape));
  }

  // ------------------------------------------------------------------ pests
  function freeSlot() {
    for (let i = 0; i < BIG; i++) if (st[i] === FREE) return i;
    return -1;
  }
  function spawn(k) {
    const lv = S.level, i = freeSlot();
    if (i < 0) return;
    const g = lv.spawnGap[k], ca = gcos[g], sa = gsin[g], f = lv.spawnF[k];
    st[i] = IN; gp[i] = g; lf[i] = f; cr[i] = 0; cn[i] = 0;
    px[i] = ca * BURROW - sa * f * 0.5; pz[i] = sa * BURROW + ca * f * 0.5;
    const a = lv.gaps[g].a + Math.PI + lv.spawnA[k];              // where on the pile's edge it will reach in
    tx[i] = -Math.cos(a) * (PILE_R + 0.45); tz[i] = -Math.sin(a) * (PILE_R + 0.45);
    hp[i] = lv.spawnHp[k];
    sc[i] = hp[i] >= 3 ? 1.85 : hp[i] === 2 ? 1.55 : 1.3;
    tn[i] = hp[i] >= 3 ? 0.66 : hp[i] === 2 ? 0.82 : 1;
    sp[i] = lv.speed * lv.spawnV[k] * (hp[i] >= 3 ? 0.85 : 1);
    ph[i] = k * 1.7; tm[i] = 0; ag[i] = 0; fl[i] = 0; kx[i] = 0; kz[i] = 0;
    yw[i] = Math.atan2(-ca, -sa);
  }
  function spawnBig() {
    const lv = S.level, g = lv.big.gap, i = BIG;
    S.bigOn = true;
    st[i] = DROP; gp[i] = g; lf[i] = 0; cr[i] = 0; cn[i] = 0;
    px[i] = gcos[g] * (R - 2.4); pz[i] = gsin[g] * (R - 2.4);
    tx[i] = gcos[g] * (PILE_R + 2.1); tz[i] = gsin[g] * (PILE_R + 2.1);
    hp[i] = lv.big.hp; S.bigHp = lv.big.hp;
    sc[i] = BIG_SCALE; tn[i] = 1; sp[i] = 1.35;
    ph[i] = 0; tm[i] = 0; ag[i] = 1; fl[i] = 0; kx[i] = 0; kz[i] = 0;
    yw[i] = Math.atan2(-gcos[g], -gsin[g]);
    S.bigY = 16;
    hud.banner('BIG ONE!', 'It takes many bops', 'warn');
    S.bannerT = 1.3;
    play('raidWave', sound);
  }
  /** an item (or the big one's armful) flies back onto the pile */
  function giveBack(i) {
    const n = cn[i];
    for (let k = 0; k < n; k++) {
      S.incoming++;
      W(px[i], 0.75 * sc[i], pz[i], _v);
      backFly.delay = k * 0.05;
      G.fx.fly(backFly);
    }
    cr[i] = 0; cn[i] = 0;
  }
  function dropCoin(x, y, z, k) {
    for (let j = 0; j < COIN_CAP; j++) {
      if (cOn[j]) continue;
      const a = k * 2.4 + S.time * 7;
      cOn[j] = 1; ct[j] = 0;
      cx[j] = x; cy[j] = y; cz[j] = z;
      cvx[j] = Math.cos(a) * (1.4 + (k % 3)); cvz[j] = Math.sin(a) * (1.4 + (k % 3)); cvy[j] = 6.5 + (k % 2);
      return;
    }
    gotCoin();                                     // the pool is full: straight into the purse
  }
  function gotCoin() {
    S.coins++;
    S.coinCombo = S.coinT > 0 ? Math.min(PENTA.length - 1, S.coinCombo + 1) : 0;
    S.coinT = 0.7;
    sound.pitch = Math.pow(2, PENTA[S.coinCombo] / 12); sound.volume = 0.8;
    play('raidCoin', sound);
    hud.coins(S.coins, true);
    if (S.textT <= 0) {
      S.textT = 0.16;
      W(S.hx, 1.9, S.hz, _p);
      G.fx.popText(_p, '+1', coinText);
    }
  }
  function pop(i) {
    const big = i === BIG;
    if (cr[i]) giveBack(i);
    st[i] = POP; tm[i] = 0;
    S.popped++;
    W(px[i], 0.4 * sc[i], pz[i], _v);
    G.fx.burst(_v, POPB);
    if (big) {
      for (let k = 0; k < 6; k++) dropCoin(px[i], 1.4, pz[i], k);
      G.fx.confetti(_v, 80);
      RING.color = dress.pest; RING.radius = 5;
      G.fx.ring(_v, RING);
      G.fx.shake(0.35, 0.35);
      _v.y = 3.4;
      G.fx.popText(_v, 'POP!', goodText);
      sound.pitch = 1.5; sound.volume = 1;
      play('raidBoss', sound);
      haptic(50);
      B.arena.bigBar.group.visible = false;
    } else dropCoin(px[i], 0.5, pz[i], S.popped);
  }
  /** a bop from (fromX, fromZ): one hit point, a knock-back, and a carried item goes home */
  function hit(i, fromX, fromZ, knock) {
    const s = st[i];
    if (s === FREE || s === POP || s === DROP) return false;
    const big = i === BIG;
    hp[i]--;
    fl[i] = 1;
    if (hp[i] <= 0) { pop(i); return true; }
    if (s === GO || s === GRAB || s === BACK) {
      const dx = px[i] - fromX, dz = pz[i] - fromZ, d = Math.hypot(dx, dz) || 1, k = big ? knock * 0.1 : knock;
      kx[i] = (dx / d) * k; kz[i] = (dz / d) * k;
    }
    if (!big) {
      if (cr[i]) { giveBack(i); st[i] = BACK; } else if (s === GRAB) st[i] = GO;
      W(px[i], 0.5, pz[i], _v);
      G.fx.burst(_v, HITB);
    }
    return true;
  }
  /** at the pile: take an item (the big one an armful) and turn for the gap */
  function grab(i) {
    const big = i === BIG;
    st[i] = BACK; tm[i] = 0;
    if (S.pile <= 0) return;
    const take = Math.min(S.pile, big ? S.level.big.steal : 1);
    S.pile -= take;
    cr[i] = 1; cn[i] = take;
    B.arena.setPile(S.pile);
    S.pileFlash = 1;
    hud.pile(S.pile, S.total, true);
    if (big || S.grabT <= 0) {
      S.grabT = 0.25;
      W(0, B.arena.top(S.pile) + 0.4, 0, _p);
      G.fx.popText(_p, LOSS[Math.min(LOSS.length - 1, take)], lossText);
      sound.pitch = big ? 0.7 : 1; sound.volume = 0.9;
      play('raidGrab', sound);
      haptic(big ? 40 : 10);
    }
    if (big) G.fx.shake(0.3, 0.3);
  }
  /** a pest is back in its burrow: what it carried is gone */
  function escaped(i) {
    st[i] = FREE;
    if (i === BIG) B.arena.bigBar.group.visible = false;
    if (!cr[i]) return;
    S.lost += cn[i];
    cr[i] = 0; cn[i] = 0;
    gapFlash[gp[i]] = 1;
    hud.flash('hit');
    play('raidLost');
    haptic(30);
  }
  function pestsStep(dt) {
    const decay = Math.exp(-7 * dt);
    let n = 0, carriers = 0;
    for (let i = 0; i < PEST_CAP; i++) {
      const s = st[i];
      if (s === FREE) continue;
      ag[i] += dt;
      if (fl[i] > 0) fl[i] = Math.max(0, fl[i] - dt * 5);
      if (s === POP) { tm[i] += dt; if (tm[i] >= (i === BIG ? 0.32 : 0.2)) st[i] = FREE; continue; }
      live[n++] = i;
      if (cr[i]) carriers++;
      if (s === DROP) {                              // the big one comes down from the sky
        tm[i] += dt;
        const u = Math.min(1, tm[i] / 0.75);
        S.bigY = 16 * (1 - u * u);
        if (u >= 1) {
          st[i] = GO; S.bigY = 0;
          W(px[i], 0.2, pz[i], _v);
          G.fx.burst(_v, DUST);
          RING.color = 0xffffff; RING.radius = 6;
          G.fx.ring(_v, RING);
          G.fx.shake(0.6, 0.5);
          sound.pitch = 1; sound.volume = 1;
          play('raidBoss', sound);
          haptic(70);
          hud.flash('thud');
          B.arena.bigBar.group.visible = true;
          // everything near is bowled away
          for (let j = 0; j < BIG; j++) {
            if (st[j] !== GO && st[j] !== BACK && st[j] !== GRAB) continue;
            const dx = px[j] - px[i], dz = pz[j] - pz[i], d = Math.hypot(dx, dz) || 1;
            if (d < 4) { kx[j] = (dx / d) * 9; kz[j] = (dz / d) * 9; }
          }
        }
        continue;
      }
      if (s === GRAB) {
        tm[i] += dt; ph[i] += dt * 24;
        if (tm[i] >= (i === BIG ? 0.9 : 0.35)) grab(i);
        continue;
      }
      const g = gp[i], ca = gcos[g], sa = gsin[g];
      let v = sp[i], gx, gz;
      if (s === GO) { gx = tx[i]; gz = tz[i]; }
      else if (s === OUT) { gx = ca * BURROW - sa * lf[i] * 0.4; gz = sa * BURROW + ca * lf[i] * 0.4; }
      else { gx = ca * (R - 1.1) - sa * lf[i] * 1.4; gz = sa * (R - 1.1) + ca * lf[i] * 1.4; }
      if (s === BACK || s === OUT) v *= cr[i] ? 0.92 : 1.4;
      const dx = gx - px[i], dz = gz - pz[i], d = Math.hypot(dx, dz);
      if (d < 0.3) {
        if (s === IN) st[i] = GO;
        else if (s === GO) { st[i] = GRAB; tm[i] = 0; }
        else if (s === BACK) st[i] = OUT;
        else { const had = cr[i]; escaped(i); n--; if (had) carriers--; continue; }
      } else {
        const k = Math.min(1, (v * dt) / d);
        px[i] += dx * k; pz[i] += dz * k;
        yw[i] = angTo(yw[i], Math.atan2(dx, dz), dt * 10);
      }
      if (s === GO || s === BACK) {
        // knocked about, but never over the fence or into the pile
        px[i] += kx[i] * dt; pz[i] += kz[i] * dt;
        const r = Math.hypot(px[i], pz[i]), max = R - 0.7, min = PILE_R + 0.2 + (i === BIG ? 1.7 : 0);
        if (r > max) { px[i] *= max / r; pz[i] *= max / r; } else if (r < min && r > 1e-4) { px[i] *= min / r; pz[i] *= min / r; }
      }
      kx[i] *= decay; kz[i] *= decay;
      ph[i] += dt * (i === BIG ? 5 : 8 + v * 1.5);
    }
    S.liveN = n; S.carriers = carriers;
    // pests do not stand inside each other
    for (let a = 0; a < n; a++) {
      const i = live[a], si = st[i];
      if (si !== GO && si !== BACK && si !== GRAB) continue;
      for (let b = a + 1; b < n; b++) {
        const j = live[b], sj = st[j];
        if (sj !== GO && sj !== BACK && sj !== GRAB) continue;
        const dx = px[j] - px[i], dz = pz[j] - pz[i], min = 0.27 * (sc[i] + sc[j]);
        if (dx > min || dx < -min || dz > min || dz < -min) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = ((min - d) * 0.5) / d, wi = sc[j] / (sc[i] + sc[j]);
        px[i] -= dx * push * wi; pz[i] -= dz * push * wi;
        px[j] += dx * push * (1 - wi); pz[j] += dz * push * (1 - wi);
      }
    }
  }

  // ------------------------------------------------------------------ the hero
  function heroStep(dt) {
    const inp = G.input, on = S.phase === 'fight' || S.phase === 'ready';
    const ix = on && inp ? clamp(inp.x || 0, -1, 1) : 0, iy = on && inp ? clamp(inp.y || 0, -1, 1) : 0;
    let wx = (-ix + iy) * S2, wz = (ix + iy) * S2;
    const mag = Math.hypot(wx, wz);
    if (mag > 1) { wx /= mag; wz /= mag; }
    S.hx += wx * T.speed * dt; S.hz += wz * T.speed * dt;
    const r = Math.hypot(S.hx, S.hz), max = R - 0.8, min = PILE_R + 0.5;
    if (r > max) { S.hx *= max / r; S.hz *= max / r; } else if (r < min) {
      if (r < 1e-4) { S.hx = -min * S2; S.hz = -min * S2; } else { S.hx *= min / r; S.hz *= min / r; }
    }
    const pads = B.arena.pads;
    for (let k = 0; k < NP; k++) {
      if (!tOn[k]) continue;
      const dx = S.hx - pads[k].x, dz = S.hz - pads[k].z, d = Math.hypot(dx, dz);
      if (d < 1 && d > 1e-4) { S.hx = pads[k].x + (dx / d); S.hz = pads[k].z + (dz / d); }
    }
    S.moving = mag > 0.05;
    if (S.moving) S.hyaw = angTo(S.hyaw, Math.atan2(wx, wz), dt * 14);
  }
  function sweep(dt) {
    S.bopT -= dt;
    S.swing = Math.max(0, S.swing - dt * 3.6);
    S.comboT -= dt;
    if (S.bopT > 0) return;
    let hits = 0;
    const n = S.liveN;
    for (let a = 0; a < n; a++) {
      const i = live[a], dx = px[i] - S.hx, dz = pz[i] - S.hz, rr = T.reach + 0.24 * sc[i];
      if (dx * dx + dz * dz < rr * rr && hit(i, S.hx, S.hz, T.knock)) hits++;
    }
    if (!hits) { S.bopT = 0; return; }
    S.bopT = T.bopEvery;
    S.swing = 1;
    S.combo = S.comboT > 0 ? Math.min(PENTA.length - 1, S.combo + 1) : 0;
    S.comboT = 0.6;
    sound.pitch = Math.pow(2, PENTA[S.combo] / 12) * 0.8; sound.volume = Math.min(1, 0.7 + hits * 0.08);
    play('raidBop', sound);
    haptic(hits > 3 ? 14 : 8);
  }

  // ------------------------------------------------------------------ coins, pads, helpers
  function coinsStep(dt) {
    for (let j = 0; j < COIN_CAP; j++) {
      if (!cOn[j]) continue;
      ct[j] += dt;
      if (cOn[j] === 1) {
        cvy[j] -= 22 * dt;
        cx[j] += cvx[j] * dt; cy[j] += cvy[j] * dt; cz[j] += cvz[j] * dt;
        if (cy[j] < 0.3) { cy[j] = 0.3; cvy[j] *= -0.4; }
        if (ct[j] >= 0.34) cOn[j] = 2;
      } else {
        const k = Math.min(1, dt * (7 + (ct[j] - 0.34) * 40));
        const dx = S.hx - cx[j], dy = 1.0 - cy[j], dz = S.hz - cz[j];
        cx[j] += dx * k; cy[j] += dy * k; cz[j] += dz * k;
        if (dx * dx + dz * dz < 0.3) { cOn[j] = 0; gotCoin(); }
      }
    }
  }
  function build(k) {
    const pad = B.arena.pads[k];
    tOn[k] = 1; tRise[k] = 0; tCool[k] = 0.5; tKick[k] = 0;
    tYaw[k] = Math.atan2(-pad.x, -pad.z) + Math.PI;        // looks outward
    pad.group.visible = false;
    W(pad.x, 0.6, pad.z, _v);
    G.fx.burst(_v, BUILD);
    RING.color = theme.colors.accent; RING.radius = 3;
    G.fx.ring(_v, RING);
    _v.y = 2.4;
    G.fx.popText(_v, 'HELPER!', goodText);
    play('raidBuild');
    haptic(25);
    // the hero is standing where the helper comes up: step aside
    const dx = S.hx - pad.x, dz = S.hz - pad.z, d = Math.hypot(dx, dz);
    if (d < 1) { const ux = d > 1e-3 ? dx / d : -S2, uz = d > 1e-3 ? dz / d : -S2; S.hx = pad.x + ux; S.hz = pad.z + uz; }
  }
  function padsStep(dt) {
    const pads = B.arena.pads;
    let near = -1;
    for (let k = 0; k < NP; k++) {
      if (tOn[k]) continue;
      const left = PAD_COST[k] - padPaid[k];
      const dx = S.hx - pads[k].x, dz = S.hz - pads[k].z;
      if (dx * dx + dz * dz < T.padRadius * T.padRadius) near = k;
      // an affordable pad breathes
      pads[k].group.scale.setScalar(S.coins >= left ? 1 + 0.05 * Math.sin(S.time * 7 + k) : 1);
    }
    if (near < 0 || S.coins <= 0 || S.phase !== 'fight') { S.payT = 0; return; }
    S.payT -= dt;
    let moved = false;
    while (S.payT <= 0 && S.coins > 0 && padPaid[near] < PAD_COST[near]) {
      S.payT += T.payEvery;
      S.coins--; padPaid[near]++;
      moved = true;
    }
    if (!moved) return;
    const frac = padPaid[near] / PAD_COST[near];
    hud.coins(S.coins, false);
    pads[near].draw(PAD_COST[near] - padPaid[near], frac);
    W(pads[near].x, 0.3, pads[near].z, _v);
    G.fx.burst(_v, PAYB);
    sound.pitch = 0.9 + frac * 0.9; sound.volume = 0.8;
    play('pay', sound);
    if (padPaid[near] >= PAD_COST[near]) build(near);
  }
  function helpersStep(dt) {
    const pads = B.arena.pads, n = S.liveN;
    for (let k = 0; k < NP; k++) {
      if (!tOn[k]) continue;
      if (tRise[k] < 1) tRise[k] = Math.min(1, tRise[k] + dt * 2.6);
      if (tKick[k] > 0) tKick[k] = Math.max(0, tKick[k] - dt * 4);
      tCool[k] -= dt;
      if (tCool[k] > 0 || S.phase !== 'fight') continue;
      // the nearest pest in range, a carrying one first
      let best = -1, bd = T.range * T.range;
      for (let a = 0; a < n; a++) {
        const i = live[a], s = st[i];
        if (s !== GO && s !== GRAB && s !== BACK) continue;
        const dx = px[i] - pads[k].x, dz = pz[i] - pads[k].z;
        let d2 = dx * dx + dz * dz;
        if (d2 >= T.range * T.range) continue;
        if (cr[i]) d2 *= 0.25;
        if (d2 < bd) { bd = d2; best = i; }
      }
      if (best < 0) { tCool[k] = 0.12; continue; }
      tCool[k] = T.fireEvery;
      tKick[k] = 1;
      tYaw[k] = Math.atan2(px[best] - pads[k].x, pz[best] - pads[k].z);
      for (let j = 0; j < SHOT_CAP; j++) {
        if (sOn[j]) continue;
        sOn[j] = 1; sT[j] = 0; sTarget[j] = best;
        sFx[j] = pads[k].x; sFz[j] = pads[k].z; sQx[j] = px[best]; sQz[j] = pz[best];
        break;
      }
      sound.pitch = 0.9 + k * 0.08; sound.volume = 0.5;
      play('raidToss', sound);
    }
    for (let j = 0; j < SHOT_CAP; j++) {
      if (!sOn[j]) continue;
      sT[j] += dt;
      const i = sTarget[j], s = st[i];
      if (s !== FREE && s !== POP) { sQx[j] = px[i]; sQz[j] = pz[i]; }      // it follows its pest
      if (sT[j] < T.shotTime) continue;
      sOn[j] = 0;
      if (s !== FREE && s !== POP) hit(i, sFx[j], sFz[j], 4);
      else { W(sQx[j], 0.3, sQz[j], _v); G.fx.burst(_v, HITB); }
    }
  }

  // ------------------------------------------------------------------ the end
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
  /** the raid is over: stars from the share of the pile that is left, records, cash */
  function settle() {
    const lv = S.level, left = S.pile, share = left / lv.total;
    const stars = left <= 0 ? 0 : share >= T.stars[1] ? 3 : share >= T.stars[0] ? 2 : 1;
    const factor = clamp(1 + Math.round(share * 4), 1, 5);
    const first = !saved[lv.n];
    const had = first ? 0 : saved[lv.n].stars;
    const newStars = Math.max(0, stars - had);
    const newBest = !first && left > saved[lv.n].best;
    // a first finish and every new star pay in full; a beaten level played again pays half;
    // an emptied pile pays a small consolation
    const replay = !first && newStars === 0;
    const cash = stars > 0 ? nice(unit() * (0.6 + 0.35 * factor + 0.15 * stars) * (replay ? 0.5 : 1)) : nice(unit() * 0.3);
    if (stars > 0) {
      const rec = saved[lv.n] || (saved[lv.n] = { stars: 0, best: 0 });
      if (stars > rec.stars) rec.stars = stars;
      if (left > rec.best) rec.best = left;
    }
    if (G.save && G.save.meta) G.save.meta.raidStars = totalStars();
    // bonus money stays out of the thrills' income estimate, like its own prizes
    if (G.thrills && G.thrills.pay) G.thrills.pay(cash, null, '', false, true); else G.addMoney(cash);
    if (G.thrills && G.thrills.addStar) for (let i = 0; i < newStars; i++) G.thrills.addStar(1);
    S.result = { stars, cash, newStars, newBest, replay, left, total: lv.total, popped: S.popped };
    doneEvt.level = lv.n; doneEvt.stars = stars; doneEvt.newStars = newStars; doneEvt.cash = cash; doneEvt.left = left;
    G.events.emit('raid:done', doneEvt);
    if (G.saveNow) G.saveNow();
  }
  function finish(won) {
    settle();
    S.phase = won ? 'cheer' : 'fail'; S.t = 0;
    B.arena.bigBar.group.visible = false;
    if (won) {
      hud.banner('CLEARED!', S.result.left + ' of ' + S.result.total + ' saved', 'good');
      W(0, B.arena.top(S.pile) + 0.5, 0, _v);
      G.fx.confetti(_v, 110);
      play('raidWin');
      haptic(60);
    } else {
      hud.banner('RAIDED!', 'The pile is empty', 'warn');
      play('raidFail');
      haptic(80);
      // whoever is left runs home
      for (let i = 0; i < PEST_CAP; i++) if (st[i] === GO || st[i] === GRAB) st[i] = BACK;
    }
    S.bannerT = 1.4;
  }
  function showResult() {
    const r = S.result, lv = S.level;
    const need = r.stars === 1 ? Math.ceil(lv.total * T.stars[0]) - r.left : r.stars === 2 ? Math.ceil(lv.total * T.stars[1]) - r.left : 0;
    const note = r.stars === 0 ? 'A little something for trying. Helpers make it easier!'
      : r.newStars > 0 && G.thrills ? `+${r.newStars} perk star${r.newStars > 1 ? 's' : ''} for the perk gates`
        : r.replay ? 'Replay: half reward. New stars pay in full.'
          : need > 0 ? `Save ${need} more for the next star` : '';
    modes.showResult({
      kicker: `RAID ${lv.n}  /  ${theme.itemName.toUpperCase()}`,
      title: r.stars >= 3 ? 'PILE DEFENDED!' : r.stars === 2 ? 'WELL GUARDED!' : r.stars === 1 ? 'RAID SURVIVED!' : 'TRY AGAIN',
      stars: r.stars,
      newBest: r.newBest,
      lines: [
        { label: theme.itemName + ' saved', text: r.left + ' / ' + r.total, accent: true },
        { label: 'Pests chased off', value: r.popped, roll: true },
      ],
      cash: r.cash,
      note,
      onRetry: () => retry(),
      onContinue: () => leave(),
    });
  }

  // ------------------------------------------------------------------ update (the fixed step)
  function fightStep(dt) {
    const lv = S.level;
    S.clock += dt;
    // a cleared yard does not wait for the clock: the next wave is called early
    if (S.liveN === 0 && S.wave < lv.waves && S.si < lv.spawnN && lv.spawnWave[S.si] >= S.wave && S.clock < lv.waveAt[S.wave] - 1.8) S.clock = lv.waveAt[S.wave] - 1.8;
    if (S.wave < lv.waves && S.clock >= lv.waveAt[S.wave] - 1.3) {
      S.wave++;
      const last = S.wave === lv.waves;
      hud.wave(S.wave, lv.waves);
      hud.banner(last ? 'FINAL WAVE' : 'WAVE ' + S.wave, last ? 'Here comes the big one' : '', last ? 'warn' : '');
      S.bannerT = 1.2;
      sound.pitch = 1 + (S.wave - 1) * 0.06; sound.volume = 1;
      play('raidWave', sound);
      haptic(20);
    }
    while (S.si < lv.spawnN && S.clock >= lv.spawnT[S.si]) spawn(S.si++);
    if (!S.bigOn && S.clock >= lv.big.at) spawnBig();
  }
  function update(dt) {
    const b = B, lv = S.level;
    if (!b || !lv || S.phase === 'idle') return;
    const a = b.arena;
    S.t += dt; S.time += dt;
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) hud.banner(''); }
    if (S.coinT > 0) S.coinT -= dt;
    if (S.textT > 0) S.textT -= dt;
    if (S.grabT > 0) S.grabT -= dt;

    if (S.phase === 'ready') { if (S.t >= T.ready) { S.phase = 'fight'; S.t = 0; } }
    if (S.phase === 'fight') fightStep(dt);
    heroStep(dt);
    pestsStep(dt);
    if (S.phase === 'fight') sweep(dt); else S.swing = Math.max(0, S.swing - dt * 3.6);
    coinsStep(dt);
    padsStep(dt);
    helpersStep(dt);

    // flashes ease out
    if (S.pileFlash > 0) { S.pileFlash = Math.max(0, S.pileFlash - dt * 3.2); a.tintPile(S.pileFlash); }
    for (let g = 0; g < lv.gaps.length; g++) {
      if (gapFlash[g] <= 0) continue;
      gapFlash[g] = Math.max(0, gapFlash[g] - dt * 1.8);
      a.tintGap(g, gapFlash[g] * (0.55 + 0.45 * Math.sin(S.time * 26)));
    }
    a.pileBar.set(S.pile / S.total);

    if (S.phase === 'fight') {
      if (S.si >= lv.spawnN && S.bigOn && S.liveN === 0 && S.incoming === 0 && st[BIG] === FREE) finish(true);
      else if (S.pile === 0 && S.carriers === 0 && S.incoming === 0 && S.lost > 0) finish(false);
    } else if (S.phase === 'cheer' || S.phase === 'fail') {
      if (S.t >= 1.7) { S.phase = 'result'; S.t = 0; hud.show(false); showResult(); }
    }

    place();
    anim.moving = S.moving;
    anim.action = S.phase === 'cheer' || (S.phase === 'result' && S.result && S.result.stars > 0) ? 'wave' : S.swing > 0.45 && b.swings ? 'swing' : null;
    animateCharacter(b.char, dt, anim);
    camera(1 - Math.exp(-4 * dt));
  }

  // ------------------------------------------------------------------ drawing (once per rendered frame)
  function draw() {
    const b = B;
    if (!b || !S.level) return;
    const a = b.arena, cs = a.carryScale;
    let n = 0, c = 0;
    for (let i = 0; i < BIG; i++) {
      const s = st[i];
      if (s === FREE) continue;
      const scl = sc[i];
      let k = scl * Math.min(1, 0.15 + ag[i] / 0.22), y = 0, sy = 1, sxz = 1;
      if (s === POP) { const u = Math.min(1, tm[i] / 0.2); sy = 1 - u; sxz = 1 + 0.7 * u; }
      else { const h = Math.sin(ph[i]); y = Math.abs(h) * 0.32 * scl; sy = 1 + 0.14 * Math.cos(ph[i] * 2); sxz = 1 - 0.07 * Math.cos(ph[i] * 2); }
      _m.compose(_p.set(px[i], y, pz[i]), _q.setFromAxisAngle(UP, yw[i]), _s.set(k * sxz, k * sy, k * sxz));
      a.pests.setMatrixAt(n, _m);
      const f = fl[i] * 1.8, t = tn[i];
      a.pests.setColorAt(n, _c.setRGB(t + f, t * (0.94 + 0.06 * t) + f, t + f));
      const bs = k * 0.85 * (1 - y * 0.5);
      _m.compose(_p.set(px[i], 0.03, pz[i]), IDQ, _s.set(bs, 1, bs));
      a.blobs.setMatrixAt(n, _m);
      n++;
      if (cr[i] && s !== POP) {
        _m.compose(_p.set(px[i], y + 0.72 * scl, pz[i]), _q, _s.set(cs, cs, cs));
        a.carried.setMatrixAt(c++, _m);
      }
    }
    const small = n;
    // the big one
    const bs = st[BIG];
    if (bs !== FREE) {
      const big = a.big;
      let y = S.bigY, sy = 1, sxz = 1, k = BIG_SCALE;
      if (bs === POP) { const u = Math.min(1, tm[BIG] / 0.32); k *= 1 + 0.25 * u; sy = 1 - u; sxz = 1 + 0.5 * u; }
      else if (bs !== DROP) { const h = Math.sin(ph[BIG]); y = Math.abs(h) * 0.5; sy = 1 + 0.07 * Math.cos(ph[BIG] * 2); sxz = 1 - 0.035 * Math.cos(ph[BIG] * 2); }
      else { sy = 1.12; sxz = 0.94; }
      big.visible = true;
      big.position.set(px[BIG], y, pz[BIG]);
      big.rotation.y = yw[BIG];
      big.scale.set(k * sxz, k * sy, k * sxz);
      big.material.emissive.setScalar(fl[BIG] * 0.55);
      const sh = BIG_SCALE * 0.85 * Math.max(0.25, 1 - y * 0.05);
      _m.compose(_p.set(px[BIG], 0.03, pz[BIG]), IDQ, _s.set(sh, 1, sh));
      a.blobs.setMatrixAt(n++, _m);
      if (cr[BIG] && bs !== POP) {
        const m = Math.min(3, cn[BIG]);
        _q.setFromAxisAngle(UP, yw[BIG]);
        for (let j = 0; j < m; j++) {
          _m.compose(_p.set(px[BIG] + (j - 1) * 0.5 * Math.cos(yw[BIG]), y + 0.74 * BIG_SCALE + (j === 1 ? 0.3 : 0), pz[BIG] - (j - 1) * 0.5 * Math.sin(yw[BIG])), _q, _s.set(cs * 2.2, cs * 2.2, cs * 2.2));
          a.carried.setMatrixAt(c++, _m);
        }
      }
      a.bigBar.group.position.set(px[BIG], y + 0.9 * BIG_SCALE + 0.7, pz[BIG]);
      a.bigBar.group.quaternion.copy(G.camera.quaternion);
      a.bigBar.set(hp[BIG] / S.bigHp);
    } else if (a.big.visible) a.big.visible = false;
    a.pests.count = small; a.blobs.count = n; a.carried.count = c;
    a.pests.instanceMatrix.needsUpdate = true; a.pests.instanceColor.needsUpdate = true;
    a.blobs.instanceMatrix.needsUpdate = true; a.carried.instanceMatrix.needsUpdate = true;

    // coins
    n = 0;
    for (let j = 0; j < COIN_CAP; j++) {
      if (!cOn[j]) continue;
      _m.compose(_p.set(cx[j], cy[j], cz[j]), _q.setFromAxisAngle(UP, ct[j] * 14 + j), _s.set(1, 1, 1));
      a.coins.setMatrixAt(n++, _m);
    }
    a.coins.count = n;
    a.coins.instanceMatrix.needsUpdate = true;
    // helpers and what they toss
    n = 0;
    for (let k = 0; k < NP; k++) {
      if (!tOn[k]) continue;
      const u = tRise[k], e = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2), kick = tKick[k];      // ease out, with a little overshoot
      _m.compose(_p.set(a.pads[k].x, 0, a.pads[k].z), _q.setFromAxisAngle(UP, tYaw[k]), _s.set(1.3 * e * (1 + 0.1 * kick), 1.3 * e * (1 - 0.14 * kick), 1.3 * e * (1 + 0.1 * kick)));
      a.turrets.setMatrixAt(n++, _m);
    }
    a.turrets.count = n;
    a.turrets.instanceMatrix.needsUpdate = true;
    n = 0;
    for (let j = 0; j < SHOT_CAP; j++) {
      if (!sOn[j]) continue;
      const u = Math.min(1, sT[j] / T.shotTime);
      _m.compose(_p.set(sFx[j] + (sQx[j] - sFx[j]) * u, 1.9 + (0.4 - 1.9) * u + 4 * u * (1 - u) * 1.3, sFz[j] + (sQz[j] - sFz[j]) * u), _q.setFromAxisAngle(UP, u * 9), _s.set(1, 1, 1));
      a.shots.setMatrixAt(n++, _m);
    }
    a.shots.count = n;
    a.shots.instanceMatrix.needsUpdate = true;
    // the hero's reach
    S.arcA -= 0.22;
    a.ring.position.x = S.hx; a.ring.position.z = S.hz;
    a.ring.scale.set(T.reach, 1, T.reach);
    a.arc.visible = S.swing > 0.02;
    a.arc.position.set(S.hx, 0.9, S.hz);
    a.arc.rotation.y = S.arcA;
    a.arc.scale.set(T.reach, 1, T.reach);
    a.arcMat.opacity = 0.85 * S.swing;
    a.pileBar.group.quaternion.copy(G.camera.quaternion);
  }

  // ------------------------------------------------------------------ the mode and its API
  const mode = { id: 'raid', update, onEnter: begin, onExit: end, frame: draw };
  const active = () => modes.active === mode;

  function start(n) {
    n = Math.floor(n);
    if (!(n >= 1 && n <= LEVELS) || modes.active || !G.player || !G.fx || !G.fx.fly || !unlocked(n)) return false;
    try { prepare(n); } catch (err) { console.error('[raid] could not build the level:', err); return false; }
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
   * The stick a competent player would hold: after the nearest pest that carries something, else onto
   * a pad it can pay for, else at the nearest pest, else back to the pile. Walks round the pile, not into it.
   */
  function botSteer() {
    steer.x = 0; steer.y = 0;
    if (!active() || S.phase !== 'fight' || !B) return steer;
    let gx = 0, gz = 0, stop = 0.3, found = false, best = Infinity;
    const n = S.liveN;
    for (let a = 0; a < n; a++) {
      const i = live[a];
      if (!cr[i] || st[i] === POP) continue;
      const dx = px[i] - S.hx, dz = pz[i] - S.hz, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; gx = px[i]; gz = pz[i]; found = true; stop = 0.9 + 0.24 * sc[i]; }
    }
    if (!found) {
      const pads = B.arena.pads;
      for (let k = 0; k < NP && !found; k++) {
        if (tOn[k] || S.coins < PAD_COST[k] - padPaid[k]) continue;
        gx = pads[k].x; gz = pads[k].z; stop = 0.35; found = true;
      }
    }
    if (!found) {
      for (let a = 0; a < n; a++) {
        const i = live[a], s = st[i];
        if (s !== GO && s !== GRAB && s !== BACK && s !== DROP) continue;
        const dx = px[i] - S.hx, dz = pz[i] - S.hz, d2 = dx * dx + dz * dz;
        if (d2 < best) { best = d2; gx = px[i]; gz = pz[i]; found = true; stop = 0.9 + 0.24 * sc[i]; }
      }
    }
    if (!found) {
      // nothing in the yard: wait between the pile and the burrow the next pest comes out of
      const lv = S.level, g = S.si < lv.spawnN ? lv.spawnGap[S.si] : 0;
      gx = gcos[g] * (PILE_R + 2.2); gz = gsin[g] * (PILE_R + 2.2);
    }
    let dx = gx - S.hx, dz = gz - S.hz;
    const d = Math.hypot(dx, dz);
    if (d < stop) return steer;
    dx /= d; dz /= d;
    // does the straight line cross the pile? then go round it
    const along = -(S.hx * dx + S.hz * dz);
    if (along > 0 && along < d) {
      const qx = S.hx + dx * along, qz = S.hz + dz * along;
      if (qx * qx + qz * qz < (PILE_R + 0.9) * (PILE_R + 0.9)) {
        const hr = Math.hypot(S.hx, S.hz) || 1;
        let ux = -S.hz / hr, uz = S.hx / hr;
        if (ux * dx + uz * dz < 0) { ux = -ux; uz = -uz; }
        dx = ux + (S.hx / hr) * 0.25; dz = uz + (S.hz / hr) * 0.25;
        const m = Math.hypot(dx, dz) || 1;
        dx /= m; dz /= m;
      }
    }
    const m = Math.min(1, (d - stop) / 0.6 + 0.35);
    steer.x = (-dx + dz) * S2 * m;
    steer.y = (dx + dz) * S2 * m;
    return steer;
  }

  // ------------------------------------------------------------------ listing on the bonus-level sheet
  modes.registerLevels({
    type: 'raid',
    title: 'RAID',
    sub: () => `Defend the ${theme.itemName.toLowerCase()} from the pests`,
    icon: SHIELD,
    levels,
    start,
  });

  return {
    levels, start, next, leave, retry, botSteer,
    get active() { return active(); },
    get phase() { return active() ? S.phase : 'idle'; },
    /** the live raid, for tests and the console: pile, coins, wave, pests in the yard */
    get state() { return S; },
    theme, dress, tune: T,
    debugUnlock(on = true) { D.all = !!on; modes.refresh(false); },
  };
}
