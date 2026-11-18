// Mini-modes: short bonus levels played inside the page, away from the world (the Gate Run is the
// first one, engine/run). This host owns what every such mode needs, so a mode is only its own game:
//
//   G.modes.enter(mode) -> bool    mode = { id, update(dt), onEnter?(), onExit?(), frame?(realDt) }
//                                  The curtain closes, the world freezes (main.js steps only input, the
//                                  mode, fx and hud; playTime stands still), the world HUD hides
//                                  (body.in-mode), onEnter() runs behind the curtain, the camera cuts.
//   G.modes.exit()                 curtain, onExit(), camera back on the player, HUD back, G.saveNow().
//   G.modes.abort()                the same at once, without the fade (errors).
//   G.modes.blink(fn)              close the curtain, run fn behind it, open it (a restart).
//   G.modes.active                 the running mode, or null
//   G.modes.follow(x, z, zoom)     the camera looks at (x, z); zoom is a factor on the world's zoom.
//                                  Call it every step. G.modes.snap() cuts to the last target at once.
//   G.modes.zoomFor(viewSize)      the factor that shows `viewSize` world units vertically
//   G.modes.arena(index)           { x, z } origin of a region far from the world, one per mode
//   G.modes.registerLevels({ type, title, sub, icon, levels: () => [{ n, unlocked, stars, best, isNew, need }],
//                            start: (n) => bool })
//                                  lists a level type on the bonus-level sheet (HUD button, bottom right)
//   G.modes.showResult({ kicker, title, stars, lines: [{ label, value | text, roll }], cash, note, newBest,
//                        onRetry, onContinue })
//                                  the result card: stars come in one by one, numbers roll.
//                                  G.modes.result is true while it is up; pressContinue() / pressRetry()
//                                  press its buttons (the test bot does).
//
// Events: 'mode:enter' { id }, 'mode:exit' { id }.
// Clock: the simulation's (update(dt) from the main loop), so tests that call G.step play modes at the same pace.
import { fmtMoney } from '../config.js';
import { createModesUi } from './ui.js';

const FADE = 0.22;           // seconds the curtain takes to close
const ARENA = { x: 700, z: 700, step: 600 };

export function createModes(G) {
  const sections = [];
  const M = { mode: null, phase: 'idle', t: 0, fn: null, x: 0, z: 0, zoom: 1, paused: null };
  const cam = { x: 0, z: 0 };
  const R = { on: false, t: 0, stars: 0, shown: 0, onRetry: null, onContinue: null, rolls: [] };
  const evt = { id: '' };

  const ui = createModesUi(G, {
    open: openSheet,
    close: closeSheet,
    pick(type, n) {
      const sec = sections.find((s) => s.type === type);
      closeSheet();
      if (sec) { try { sec.start(n); } catch (err) { console.error('[modes] start failed:', err); } }
    },
    retry: () => pressRetry(),
    resume: () => pressContinue(),
  });
  const play = (name, o) => { if (G.audio && G.audio.play) G.audio.play(name, o); };
  /** vibrate is blocked (and logged as an error) before the first user gesture */
  function haptic(ms) {
    if (!G.audio || !G.audio.haptic) return;
    if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    G.audio.haptic(ms);
  }

  // ------------------------------------------------------------------ camera
  function follow(x, z, zoom) {
    cam.x = x; cam.z = z;
    M.zoom = zoom > 0 ? zoom : 1;
    if (G.view && G.view.setCine) G.view.setCine(cam, M.zoom);
  }
  function snap() { if (G.view && G.view.snapTo) G.view.snapTo(cam.x, cam.z); }
  function cameraHome() {
    if (!G.view) return;
    if (G.view.setCine) G.view.setCine(null);
    const p = G.player && G.player.pos;
    if (p && G.view.snapTo) G.view.snapTo(p.x, p.z);
  }

  // ------------------------------------------------------------------ enter / exit
  function enter(mode) {
    if (!mode || typeof mode.update !== 'function' || M.mode) return false;
    if (!G.player || !G.view || !G.view.setCine) return false;
    if (G.reveal && G.reveal.active) return false;
    closeSheet();
    M.mode = mode; M.phase = 'in'; M.t = 0;
    ui.curtain(true);
    evt.id = mode.id || '';
    G.events.emit('mode:enter', evt);
    return true;
  }
  function arrive() {
    const mode = M.mode;
    ui.setMode(true);
    try { if (mode.onEnter) mode.onEnter(); } catch (err) { console.error(`[modes] ${mode.id}.onEnter failed:`, err); abort(); return; }
    snap();
    ui.curtain(false);
    M.phase = 'on'; M.t = 0;
  }
  function exit() {
    if (!M.mode || M.phase === 'out') return;
    hideResult();
    M.phase = 'out'; M.t = 0;
    ui.curtain(true);
  }
  function leave() {
    const mode = M.mode;
    if (!mode) return;
    hideResult();
    try { if (mode.onExit) mode.onExit(); } catch (err) { console.error(`[modes] ${mode.id}.onExit failed:`, err); }
    cameraHome();
    ui.setMode(false);
    ui.curtain(false);
    M.mode = null; M.phase = 'idle'; M.fn = null;
    refresh(false);
    if (G.saveNow) G.saveNow();
    evt.id = mode.id || '';
    G.events.emit('mode:exit', evt);
  }
  function abort() { if (M.mode) leave(); }
  function blink(fn) {
    if (!M.mode || M.phase !== 'on') return false;
    hideResult();
    M.phase = 'blink'; M.t = 0; M.fn = fn || null;
    ui.curtain(true);
    return true;
  }

  function update(dt) {
    const mode = M.mode;
    if (!mode) return;
    M.t += dt;
    if (M.phase === 'in') { if (M.t >= FADE) arrive(); return; }
    if (M.phase === 'out') { if (M.t >= FADE) leave(); return; }
    if (M.phase === 'blink') {
      if (M.t < FADE) return;
      const fn = M.fn;
      M.fn = null;
      try { if (fn) fn(); } catch (err) { console.error(`[modes] ${mode.id} restart failed:`, err); abort(); return; }
      snap();
      ui.curtain(false);
      M.phase = 'on'; M.t = 0;
      return;
    }
    if (R.on) tickResult(dt);
    try { mode.update(dt); } catch (err) { console.error(`[modes] ${mode.id}.update failed:`, err); abort(); }
  }

  // ------------------------------------------------------------------ level sheet and its button
  let known = -1;            // how many levels were open at the last look (a rise shows the bubble)
  function refresh(announce) {
    let open = 0, fresh = false, total = 0;
    for (const sec of sections) {
      let list = [];
      try { list = sec.levels() || []; } catch (err) { console.error('[modes] levels() failed:', err); }
      for (const l of list) { total++; if (l.unlocked) { open++; if (l.isNew) fresh = true; } }
    }
    ui.button(!total ? '' : !open ? 'locked' : fresh ? 'new' : 'open');
    if (announce && known >= 0 && open > known && !M.mode) ui.bubble('NEW BONUS LEVEL!');
    known = open;
  }
  function openSheet() {
    if (M.mode || ui.sheetOpen || !sections.length || (G.reveal && G.reveal.active)) return false;
    const data = sections.map((s) => {
      let list = [];
      try { list = s.levels() || []; } catch (err) { console.error('[modes] levels() failed:', err); }
      return { type: s.type, title: s.title, sub: typeof s.sub === 'function' ? s.sub() : s.sub, icon: s.icon, list };
    });
    // the world waits while the sheet is up (as it does for the world picker, engine/hud.js)
    if (M.paused === null && typeof G.timeScale === 'number') { M.paused = G.timeScale; G.timeScale = 0; }
    ui.bubble('');
    ui.sheet(data);
    return true;
  }
  function closeSheet() {
    if (!ui.sheetOpen) return;
    ui.sheet(null);
    if (M.paused !== null) { G.timeScale = M.paused; M.paused = null; }
  }
  function registerLevels(sec) {
    if (!sec || !sec.type || typeof sec.levels !== 'function' || typeof sec.start !== 'function') return false;
    const i = sections.findIndex((s) => s.type === sec.type);
    if (i >= 0) sections[i] = sec; else sections.push(sec);
    refresh(false);
    return true;
  }
  G.events.on('unlock', () => refresh(true));
  G.events.on('level:won', () => refresh(true));
  G.events.on('win', () => refresh(true));

  // ------------------------------------------------------------------ result card
  const STAR_AT = 0.45, STAR_GAP = 0.36, ROLL = 0.8;
  function showResult(o) {
    o = o || {};
    R.on = true; R.t = 0; R.shown = 0;
    R.stars = o.stars >= 0 ? Math.min(3, o.stars | 0) : -1;
    R.onRetry = o.onRetry || null; R.onContinue = o.onContinue || null;
    R.rolls.length = 0;
    const lines = (o.lines || []).map((l, i) => {
      const roll = l.roll && typeof l.value === 'number' && l.value > 0;
      if (roll) R.rolls.push({ i, to: l.value, shown: -1, pre: l.prefix || '', post: l.suffix || '' });
      return { label: l.label, accent: !!l.accent, text: roll ? (l.prefix || '') + '0' + (l.suffix || '') : l.text != null ? String(l.text) : (l.prefix || '') + fmtMoney(l.value || 0) + (l.suffix || '') };
    });
    ui.result({ kicker: o.kicker, title: o.title, stars: R.stars, lines, cash: o.cash, note: o.note, newBest: !!o.newBest,
      retry: R.onRetry ? o.retryLabel : false, resume: o.continueLabel });
  }
  function tickResult(dt) {
    R.t += dt;
    while (R.shown < R.stars && R.t >= STAR_AT + R.shown * STAR_GAP) {
      ui.resultStar(R.shown);
      play('star', { pitch: 1 + R.shown * 0.12 });
      haptic(12);
      R.shown++;
    }
    for (let k = 0; k < R.rolls.length; k++) {
      const r = R.rolls[k];
      if (r.shown === r.to) continue;
      const u = Math.min(1, R.t / ROLL);
      const v = u >= 1 ? r.to : Math.floor(r.to * (1 - (1 - u) * (1 - u)));
      if (v !== r.shown) { r.shown = v; ui.resultLine(r.i, r.pre + fmtMoney(v) + r.post); }
    }
  }
  function hideResult() {
    if (!R.on) return;
    R.on = false; R.onRetry = null; R.onContinue = null;
    ui.resultHide();
  }
  function pressContinue() {
    if (!R.on) return false;
    const fn = R.onContinue;
    hideResult();
    if (fn) { try { fn(); } catch (err) { console.error('[modes] continue failed:', err); abort(); } } else exit();
    return true;
  }
  function pressRetry() {
    if (!R.on || !R.onRetry) return false;
    const fn = R.onRetry;
    hideResult();
    try { fn(); } catch (err) { console.error('[modes] retry failed:', err); abort(); }
    return true;
  }

  return {
    enter, exit, abort, blink, update,
    /** once per rendered frame */
    frame(realDt) { const m = M.mode; if (m && m.frame && M.phase === 'on') { try { m.frame(realDt); } catch (err) { console.error(err); } } },
    get active() { return M.mode; },
    /** 'idle' | 'in' | 'on' | 'blink' | 'out' */
    get phase() { return M.phase; },
    follow, snap,
    zoomFor(viewSize) { const v = G.view && G.view.viewSize; return v > 0 && viewSize > 0 ? viewSize / v : 1; },
    arena(index = 0) { const i = Math.max(0, index | 0); return { x: ARENA.x + i * ARENA.step, z: ARENA.z - i * ARENA.step }; },
    registerLevels, refresh, openSheet, closeSheet,
    get sheetOpen() { return ui.sheetOpen; },
    showResult, hideResult, pressContinue, pressRetry,
    get result() { return R.on; },
    haptic,
  };
}
