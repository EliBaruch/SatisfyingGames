// G.workers: spawns one worker per hire in G.stats.hires (via the registered role) and
// updates them. Built-in roles are imported here; a new role lives in its own file that
// calls registerWorkerRole(...) and is listed in a world's `modules`.
import { getWorkerRole } from '../registry.js';
import './hauler.js';
import './harvester.js';
import './cashier.js';

export function createWorkers(G) {
  const list = [];
  const byPad = new Map();      // pad id -> worker
  const teams = new Map();      // role|from -> [worker]
  const errCount = new Map();

  function sync(live) {
    const hires = G.stats.hires;
    for (let i = 0; i < hires.length; i++) {
      const h = hires[i];
      if (byPad.has(h.pad)) continue;
      const role = getWorkerRole(h.role);
      if (!role) { console.error(`[workers] unknown role '${h.role}' (pad '${h.pad}'). Did the world list its module?`); byPad.set(h.pad, null); continue; }
      const key = h.role + '|' + (h.from || h.to || '');   // team = same role on the same source
      let team = teams.get(key);
      if (!team) { team = []; teams.set(key, team); }
      let w = null;
      try {
        const slot = {};          // placeholder so the team length includes the newcomer
        team.push(slot);
        w = role.create(G, h, team, live);
        const k = team.indexOf(slot);
        if (w) team[k] = w; else team.splice(k, 1);
      } catch (err) { console.error(`[workers] creating '${h.role}' for pad '${h.pad}' failed:`, err); }
      byPad.set(h.pad, w);
      if (w) {
        w.role = h.role;
        w.hire = h;
        list.push(w);
      }
    }
  }

  return {
    list,
    sync,
    update(dt) {
      for (let i = 0; i < list.length; i++) {
        try { list[i].update(dt); } catch (err) {
          const n = (errCount.get(i) || 0) + 1;
          errCount.set(i, n);
          if (n <= 3) console.error(`[workers] ${list[i].role}.update failed:`, err);
        }
      }
    },
  };
}
