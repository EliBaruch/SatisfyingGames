// G.stations: builds one station per entry in world.stations using the registered
// station types, restores their saved data, activates the open ones, and updates them.
//
// Built-in types are imported here. A new type lives in its own file that calls
// registerStationType(...) at import time; a world that uses it lists that file in its
// `modules` (see docs/ENGINE.md). Nothing in the engine needs editing.
import { getStationType, stationTypeNames } from '../registry.js';
import './source.js';
import './shop.js';

export function createStations(G) {
  const def = G.world;
  const list = [];
  const byId = new Map();
  const openHooks = new Map();   // id -> [fn(live)]
  const activationOrder = [];    // station ids in the order they became active

  for (const sd of def.stations || []) {
    const type = getStationType(sd.type);
    if (!type) {
      console.error(`[stations] unknown station type '${sd.type}' for '${sd.id}' (known: ${stationTypeNames().join(', ')}). Did the world list its module?`);
      continue;
    }
    let st = null;
    try { st = type.create(G, sd); } catch (err) { console.error(`[stations] creating '${sd.id}' failed:`, err); }
    if (!st) continue;
    st.id = sd.id;
    st.type = sd.type;
    st.def = sd;
    st.name = st.name || sd.name || sd.id;
    if (!st.pos) st.pos = { x: 0, z: 0 };
    if (typeof st.active !== 'boolean') st.active = false;
    const saved = G.state.stations[sd.id];
    if (saved != null && st.restore) {
      try { st.restore(saved); } catch (err) { console.error(`[stations] restoring '${sd.id}' failed:`, err); }
    }
    list.push(st);
    byId.set(sd.id, st);
  }

  function open(st, live) {
    if (st.active) return;
    try { st.activate(live); } catch (err) { console.error(`[stations] activating '${st.id}' failed:`, err); }
    st.active = true;
    activationOrder.push(st.id);
    G.events.emit('open', { station: st, live });
    const hooks = openHooks.get(st.id);
    if (hooks) for (const fn of hooks) { try { fn(live); } catch (err) { console.error(err); } }
  }

  /** Activate every station G.stats.open names (called at boot and after purchases). */
  function sync(live) {
    for (let i = 0; i < list.length; i++) if (G.stats.open[list[i].id] && !list[i].active) open(list[i], live);
  }

  const errCount = new Map();
  return {
    list,
    activationOrder,
    get(id) { return byId.get(id) || null; },
    sync,
    /**
     * Run fn(live) when station `id` becomes active: at once with live=false if it
     * already is, else later with live=true. Use it in scene.js for per-station furniture.
     */
    onOpen(id, fn) {
      const st = byId.get(id);
      if (st && st.active) { fn(false); return; }
      if (!openHooks.has(id)) openHooks.set(id, []);
      openHooks.get(id).push(fn);
    },
    /** Per-station data for the save: { id: serialize() } for stations that have it. */
    serialize(out) {
      for (let i = 0; i < list.length; i++) {
        const st = list[i];
        if (!st.serialize) continue;
        try {
          const d = st.serialize();
          if (d != null) out[st.id] = d;
        } catch (err) { console.error(`[stations] serialize '${st.id}' failed:`, err); }
      }
      return out;
    },
    update(dt) {
      for (let i = 0; i < list.length; i++) {
        const st = list[i];
        if (!st.update) continue;
        try { st.update(dt); } catch (err) {
          const n = (errCount.get(st.id) || 0) + 1;
          errCount.set(st.id, n);
          if (n <= 3) console.error(`[stations] '${st.id}'.update failed:`, err);
        }
      }
    },
  };
}
