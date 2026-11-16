// Built-in pad effects: open, hire, stat, win, travel.
// Each handler folds a bought pad into G.stats (pure) and may have live side effects.
// Add your own with registerPadEffect (see docs/ENGINE.md "Pad effects").
import { registerPadEffect, getPadEffect, getWorkerRole } from './registry.js';
import { applyStatOp } from './stats.js';
import { nextWorld } from './worlds.js';

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// { type: 'open', stations: ['tulips', 'shop-tulips'] }   (also accepts `station: 'id'`)
registerPadEffect('open', {
  fold(s, e) { for (const id of asList(e.stations || e.station)) s.open[id] = true; },
  focus(G, e) {
    const ids = asList(e.stations || e.station);
    let x = 0, z = 0, n = 0;
    for (const id of ids) { const st = G.stations.get(id); if (st) { x += st.pos.x; z += st.pos.z; n++; } }
    return n ? { x: x / n, z: z / n } : null;
  },
  toast: (e, pad) => pad.label + ' OPEN!',
  sound: 'unlock',
});

// { type: 'hire', role: 'hauler', from: 'roses', to: 'shop-roses', ...role options }
registerPadEffect('hire', {
  fold(s, e, pad) {
    let n = 0;
    for (let i = 0; i < s.hires.length; i++) if (s.hires[i].role === e.role && s.hires[i].from === (e.from || null)) n++;
    s.hires.push({ role: e.role, from: e.from || null, to: e.to || null, pad: pad.id, n, effect: e });
    const key = e.to || e.from;
    if (key) {
      const st = s.staff[key] || (s.staff[key] = {});
      st[e.role] = (st[e.role] || 0) + 1;
    }
  },
  focus(G, e) {
    const role = getWorkerRole(e.role);
    return role && role.focus ? role.focus(G, e) : null;
  },
  toast(e) {
    const role = getWorkerRole(e.role);
    return (role && role.toast) || 'HIRED!';
  },
  sound: 'hire',
});

// { type: 'stat', stat: 'capacity', max: 50 }  ops: set | add | mul | min | max
// Several ops at once: { type: 'stat', ops: [{ stat, mul }, ...] }
registerPadEffect('stat', {
  fold(s, e) {
    if (Array.isArray(e.ops)) for (const op of e.ops) applyStatOp(s, op);
    else applyStatOp(s, e);
  },
  sound: 'unlock',
});

// { type: 'stage', stage: 2 }  the world moved on to a bigger stage: G.stats.stage = the highest one bought.
// Scenes react through G.pads.onDone(padId, fn) (reveal a hall, zoom the camera out, widen world.bounds).
registerPadEffect('stage', {
  fold(s, e) { s.stage = Math.max(s.stage || 0, e.stage | 0); },
  toast: (e, pad) => pad.label + '!',
  sound: 'bigUnlock',
});

// { type: 'multi', effects: [ { type: 'open', ... }, { type: 'stat', ... }, { type: 'hire', ... } ] }
// One pad, several effects. A second or later hire in the list is recorded under '<padId>:<index>'.
registerPadEffect('multi', {
  fold(s, e, pad, def) {
    let hires = 0;
    (e.effects || []).forEach((sub, i) => {
      const h = sub && getPadEffect(sub.type);
      if (!h || !h.fold || h.repeatable) return;
      const p = sub.type === 'hire' && hires++ > 0 ? { ...pad, id: pad.id + ':' + i } : pad;
      h.fold(s, sub, p, def);
    });
  },
  apply(G, e, pad) {
    for (const sub of e.effects || []) { const h = sub && getPadEffect(sub.type); if (h && h.apply && !h.repeatable) h.apply(G, sub, pad); }
  },
  focus(G, e, pad) {
    for (const sub of e.effects || []) { const h = sub && getPadEffect(sub.type); const f = h && h.focus ? h.focus(G, sub, pad) : null; if (f) return f; }
    return null;
  },
  toast(e, pad) {
    for (const sub of e.effects || []) { const h = sub && getPadEffect(sub.type); if (h && h.toast) return typeof h.toast === 'function' ? h.toast(sub, pad) : h.toast; }
    return pad.label + '!';
  },
  sound: 'unlock',
});

// { type: 'win' }  the finale. Level flow (engine/level.js) handles the celebration.
registerPadEffect('win', {
  fold(s) { s.won = true; },
  apply(G) { G.events.emit('win', { world: G.worldId }); },
  focus(G) { const f = G.world.finale; return f && f.focus ? f.focus : null; },
  toast: (e, pad) => pad.label + '!',
  sound: 'bigUnlock',
});

// { type: 'worlds' }  opens the world select (the last world's gate, where there is no next world to travel to)
registerPadEffect('worlds', {
  repeatable: true,
  fold() {},
  apply(G) { if (G.hud && G.hud.openWorlds) G.hud.openWorlds(); },
  toast: () => 'WORLD SELECT',
  sound: 'unlock',
});

// { type: 'travel', world: 'chicken' }  (world defaults to the next world in order)
registerPadEffect('travel', {
  repeatable: true,   // never marked done: the gate stays usable
  fold() {},
  apply(G, e) {
    const id = e.world || (nextWorld(G.worldId) || {}).id;
    if (id && G.travel) G.travel(id);
  },
  toast: () => 'LET\'S GO!',
  sound: 'bigUnlock',
});
