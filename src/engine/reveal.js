// Reveals: a short cinematic when a pad with `reveal` is bought. Play stops, the camera travels to
// the new thing, it builds in while the player watches (belts are laid down along their line),
// the world runs for a moment so it can be seen working, then the camera returns.
//
// pad.reveal = true                       one shot at pad.focus: everything the pad brings pops in there
// pad.reveal = {
//   title: 'PACK BELT!', sub: 'Packs now ride to the car line',   // title card (default: pad.toast / label)
//   zoom: 0.85,                           // factor on the current zoom while it plays (< 1 = closer)
//   run: 1.3,                             // seconds the world runs at the end before the camera returns
//   shots: [                              // in order
//     { at: [x, z], show: ['stationId', 'scene'] | '*', hold: 0.9, zoom },   // go there, pop those in, wait
//     { belt: 'beltId', dur, hold, zoom },                                   // pan along a belt while it is laid
//   ],
// }
// What can be shown: station ids (what the station and its scenery pop in when it opens), 'scene'
// (pop-ins from pad hooks such as a new hall), 'pads' (the next price pads; always last), '*' (all
// that is left except the pads). Anything not shown by a shot appears when the reveal ends.
//
// How it collects: G.pads calls begin(pad) before applying the purchase and start(pad) after it.
// In between, G.fx.popIn and G.fx.defer record their calls (with G.fx.owner) instead of running.
// A tap skips the reveal. The clock is the simulation's (update(dt) from the main loop), so tests
// that step the game directly run reveals at the same pace.
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createReveal(G) {
  let R = null;             // the running reveal
  let count = 0;
  const P = { x: 0, y: 0, z: 0, w: 0 };
  const SPARK = { colors: [0xffe14d, 0xffffff, 0x8fd3ff], count: 7, speed: 3.2, size: 0.13, life: 0.45, up: 2.6 };

  // ---- title card and letterbox bars
  let el = null, elTitle = null, elSub = null;
  function dom() {
    if (el || typeof document === 'undefined') return;
    el = document.createElement('div');
    el.className = 'reveal';
    el.innerHTML = '<div class="reveal-bar top"></div><div class="reveal-bar bottom"></div><div class="reveal-card"><b></b><span></span></div><div class="reveal-skip">Tap to skip</div>';
    document.body.appendChild(el);
    elTitle = el.querySelector('b'); elSub = el.querySelector('span');
    window.addEventListener('pointerdown', () => { if (R && R.age > 0.7 && R.phase !== 'back') skip(); });
  }
  function ui(on, title, sub) {
    dom();
    if (!el) return;
    if (on) { elTitle.textContent = title || ''; elSub.textContent = sub || ''; elSub.style.display = sub ? '' : 'none'; }
    el.classList.toggle('show', !!on);
    document.body.classList.toggle('cine', !!on);
  }

  function begin() {
    if (R || G.noReveal || !G.fx || !G.view || !G.view.setCine || !G.player || !('capture' in G.fx)) return false;
    G.fx.capture = [];
    return true;
  }

  function start(pad) {
    const cap = G.fx.capture || [];
    G.fx.capture = null;
    const def = pad.reveal && typeof pad.reveal === 'object' ? pad.reveal : {};
    const f = pad.focus || pad.pos;
    const groups = new Map();
    for (const c of cap) { const k = c.owner || 'scene'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    // belts are laid along their path instead of popping in
    const belts = new Map();
    for (const [k, list] of groups) {
      const st = G.stations && G.stations.get(k);
      if (!st || !st.build) continue;
      for (const c of list) if (c.obj) c.obj.visible = true;
      groups.set(k, list.filter((c) => !c.obj));
      st.build.set(0);
      belts.set(k, st);
    }
    const shots = (def.shots && def.shots.length ? def.shots : [{ at: [f.x, f.z], show: '*', hold: 1.4 }]).map((s) => ({ ...s }));
    const vf = G.view.focus;
    R = {
      pad, def, groups, belts, shots, i: -1, phase: 'next', t: 0, dur: 0, age: 0,
      from: { x: vf.x, z: vf.z }, to: null, cam: { x: vf.x, z: vf.z }, zoom: def.zoom > 0 ? def.zoom : 0.85,
      later: [], last: 0, frozen: true,
    };
    count++;
    ui(true, def.title || pad.toast || pad.label, def.sub);
    if (G.audio && G.audio.play) G.audio.play('whoosh');
    G.view.setCine(R.cam, R.zoom);
    G.events.emit('reveal:start', { pad });
  }

  // ---- showing things
  function release(key, stagger) {
    const list = R.groups.get(key);
    R.groups.delete(key);
    const belt = R.belts.get(key);
    if (belt) { belt.build.set(Infinity); R.belts.delete(key); }
    if (!list) return false;
    for (const c of list) {
      if (c.obj) G.fx.popIn(c.obj, { dur: c.dur, delay: (c.delay || 0) + stagger });
      else if (c.fn) { if (stagger > 0) R.later.push({ t: R.age + stagger, fn: c.fn }); else { try { c.fn(); } catch (err) { console.error(err); } } }
    }
    return list.length > 0;
  }
  function show(what) {
    const keys = what === '*' ? [...new Set([...R.groups.keys(), ...R.belts.keys()])].filter((k) => k !== 'pads') : Array.isArray(what) ? what : what ? [what] : [];
    let k = 0;
    for (const key of keys) {
      const st = G.stations && G.stations.get(key);
      const any = release(key, k * 0.16);
      if (any && st && st.pos && G.fx.ring && key !== 'scene') G.fx.ring({ x: st.pos.x, y: 0.1, z: st.pos.z }, { color: 0xffffff, radius: 2.6, life: 0.5 });
      if (any) k++;
    }
    if (k && G.audio && G.audio.play) G.audio.play('unlock');
  }

  function nextShot() {
    R.i++;
    R.t = 0;
    R.from = { x: R.cam.x, z: R.cam.z };
    const s = R.shots[R.i];
    if (!s) {
      // the world runs for a moment with the camera still on the new thing
      for (const key of [...new Set([...R.groups.keys(), ...R.belts.keys()])]) if (key !== 'pads') release(key, 0);
      R.phase = 'run'; R.dur = R.def.run >= 0 ? R.def.run : 1.3; R.frozen = false;
      return;
    }
    if (s.belt) {
      const st = G.stations.get(s.belt);
      if (!st || !st.build) { nextShot(); return; }
      R.belt = st;
      st.build.pointAt(0, P);
      R.to = { x: P.x, z: P.z };
    } else R.to = { x: s.at[0], z: s.at[1] };
    if (s.zoom > 0) R.zoom = s.zoom;
    R.phase = 'move';
    R.dur = s.move >= 0 ? s.move : clamp(Math.hypot(R.to.x - R.from.x, R.to.z - R.from.z) / 26, 0.45, 1.1);
  }

  function finish() {
    for (const key of [...new Set([...R.groups.keys(), ...R.belts.keys()])]) release(key, 0);
    for (const l of R.later) { try { l.fn(); } catch (err) { console.error(err); } }
    const pad = R.pad;
    R = null;
    ui(false);
    G.view.setCine(null);
    G.events.emit('reveal:end', { pad });
    if (G.saveNow) G.saveNow();
  }
  function skip() { if (R) finish(); }

  function update(dt) {
    if (!R) {
      // a purchase that failed between begin() and start() must not leave things hidden
      if (G.fx && G.fx.capture) { const cap = G.fx.capture; G.fx.capture = null; for (const c of cap) { try { if (c.obj) G.fx.popIn(c.obj, { dur: c.dur, delay: c.delay }); else if (c.fn) c.fn(); } catch (err) { console.error(err); } } }
      return;
    }
    R.age += dt;
    R.t += dt;
    for (let i = R.later.length - 1; i >= 0; i--) if (R.later[i].t <= R.age) { const fn = R.later[i].fn; R.later.splice(i, 1); try { fn(); } catch (err) { console.error(err); } }
    if (R.phase === 'next') nextShot();
    const s = R.shots[R.i];
    if (R.phase === 'move') {
      const u = R.dur > 0 ? ease(R.t / R.dur) : 1;
      R.cam.x = R.from.x + (R.to.x - R.from.x) * u; R.cam.z = R.from.z + (R.to.z - R.from.z) * u;
      if (R.t >= R.dur) {
        R.t = 0;
        if (s.belt) { R.phase = 'pan'; R.dur = s.dur > 0 ? s.dur : clamp(R.belt.build.length / 10, 1.1, 4.5); R.last = -1; }
        else { show(s.show); R.phase = 'hold'; R.dur = s.hold >= 0 ? s.hold : 0.9; }
      }
    } else if (R.phase === 'pan') {
      const b = R.belt.build, u = clamp(R.t / R.dur, 0, 1);
      const d = b.length * (u * u * (3 - 2 * u) * 0.5 + u * 0.5);      // a soft start and stop on a steady pace
      b.set(d);
      b.pointAt(d, P);
      R.cam.x = P.x; R.cam.z = P.z;
      // a spark and a click for each piece that drops in at the head
      const piece = Math.floor(d / 1.15);
      if (piece !== R.last) {
        R.last = piece;
        if (G.fx.burst) G.fx.burst(P, SPARK);
        if (G.audio && G.audio.play) G.audio.play('build', { pitch: 0.9 + (piece % 5) * 0.05 });
      }
      if (R.t >= R.dur) { b.set(Infinity); R.belts.delete(s.belt); R.groups.delete(s.belt); R.t = 0; R.phase = 'hold'; R.dur = s.hold >= 0 ? s.hold : 0.35; if (s.show) show(s.show); }
    } else if (R.phase === 'hold') {
      if (R.t >= R.dur) R.phase = 'next';
    } else if (R.phase === 'run') {
      if (R.t >= R.dur) { R.phase = 'back'; R.t = 0; R.dur = 0.7; R.from = { x: R.cam.x, z: R.cam.z }; R.zoom = 1; ui(false); }
    } else if (R.phase === 'back') {
      const u = ease(R.t / R.dur), pl = G.player.pos;
      R.cam.x = R.from.x + (pl.x - R.from.x) * u; R.cam.z = R.from.z + (pl.z - R.from.z) * u;
      if (R.t >= R.dur) { finish(); return; }
    }
    G.view.setCine(R.cam, R.zoom);
  }

  return {
    begin, start, update, skip,
    /** a reveal is playing (the player has no control) */
    get active() { return !!R; },
    /** the simulation is paused for it */
    get frozen() { return !!R && R.frozen; },
    get count() { return count; },
  };
}
