// Built-in pad effects: open, hire, stat, win, travel.
// Each handler folds a bought pad into G.stats (pure) and may have live side effects.
// Add your own with registerPadEffect (see docs/ENGINE.md "Pad effects").
import { registerPadEffect, getWorkerRole } from './registry.js';
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

// { type: 'win' }  the finale. Level flow (engine/level.js) handles the celebration.
registerPadEffect('win', {
  fold(s) { s.won = true; },
  apply(G) { G.events.emit('win', { world: G.worldId }); },
  focus(G) { const f = G.world.finale; return f && f.focus ? f.focus : null; },
  toast: (e, pad) => pad.label + '!',
  sound: 'bigUnlock',
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
