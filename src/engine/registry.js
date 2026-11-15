// Engine registries: item kinds, station types, worker roles, pad effects.
// Every mechanic plugs in through one of these four functions, so a world (or a shared
// engine module listed in a world's `modules`) can add new behaviour without editing
// engine files. See docs/ENGINE.md.
//
// Registration happens at import time (module top level) or from a world's `items`
// list (main.js registers those). Registering an id twice replaces the earlier entry
// and logs a warning, so hot-reloading a dev world is harmless.

const items = new Map();        // id -> item kind (normalised)
const itemList = [];            // same, in registration order (index = item.index)
const stationTypes = new Map(); // type -> { create(G, def) }
const workerRoles = new Map();  // role -> { create(G, hire, team) , ... }
const padEffects = new Map();   // type -> { fold, apply, focus, toast, sound }

function warnDup(kind, id) { console.warn(`[engine] ${kind} '${id}' registered twice; the later one wins`); }

/**
 * Register an item kind.
 *   id         string, unique ('rose', 'egg', 'cash' is built in)
 *   name       display name ('Roses')
 *   value      base sale value in money (before G.stats.priceMult)
 *   geometry   BufferGeometry, or a function returning one (called once, lazily).
 *              Origin at the bottom centre of the item; the item lies in the XZ plane.
 *   material   optional Material or function returning one (default: shared vertex-colour Lambert)
 *   step       vertical distance between stacked items (default 0.24)
 *   footprint  { w, d }: size of the item on the ground, w along local X (default 0.9 x 0.42)
 *   flyScale   scale while flying (default 1)
 *   carry      optional free-form data for worlds (ignored by the engine)
 */
export function registerItem(def) {
  if (!def || typeof def.id !== 'string' || !def.id) throw new Error('registerItem: id required');
  const prev = items.get(def.id);
  if (prev) warnDup('item', def.id);
  const it = {
    id: def.id,
    name: def.name || def.id,
    value: Number.isFinite(def.value) ? def.value : 1,
    step: def.step > 0 ? def.step : 0.24,
    footprint: { w: (def.footprint && def.footprint.w) || 0.9, d: (def.footprint && def.footprint.d) || 0.42 },
    flyScale: def.flyScale > 0 ? def.flyScale : 1,
    index: prev ? prev.index : itemList.length,
    def,
    _geo: null,
    _mat: null,
  };
  items.set(it.id, it);
  itemList[it.index] = it;
  return it;
}
/** Item kind by id, or null. */
export function getItem(id) { return items.get(id) || null; }
/** All registered item kinds, index order. Do not mutate. */
export function allItems() { return itemList; }

/**
 * Register a station type. `type.create(G, def)` returns a station instance (see
 * docs/ENGINE.md "Stations"). Optional `type.describe` is a one-line doc string.
 */
export function registerStationType(name, type) {
  if (!type || typeof type.create !== 'function') throw new Error(`registerStationType('${name}'): create(G, def) required`);
  if (stationTypes.has(name)) warnDup('station type', name);
  stationTypes.set(name, type);
}
export function getStationType(name) { return stationTypes.get(name) || null; }
export function stationTypeNames() { return [...stationTypes.keys()]; }

/**
 * Register a worker role. `role.create(G, hire, team)` returns a worker with update(dt).
 *   hire  the folded hire record { role, from, to, pad, n, ...effect fields }
 *   team  array shared by every worker of this role bound to the same `from` station
 *         (the new worker is already pushed into it); use it to split work.
 * Optional: role.toast (string) shown when hired, role.focus(G, hire) -> {x,z} for the camera.
 */
export function registerWorkerRole(name, role) {
  if (!role || typeof role.create !== 'function') throw new Error(`registerWorkerRole('${name}'): create(G, hire, team) required`);
  if (workerRoles.has(name)) warnDup('worker role', name);
  workerRoles.set(name, role);
}
export function getWorkerRole(name) { return workerRoles.get(name) || null; }

/**
 * Register a pad effect type.
 *   fold(stats, effect, pad, def)   fold a bought pad into a fresh stats object (pure; no side effects)
 *   apply(G, effect, pad)           side effects right after the pad is bought live (optional)
 *   focus(G, effect, pad) -> {x,z}  where the camera glides for big pads (optional)
 *   toast(effect, pad) -> string    toast text (optional; pad.toast wins)
 *   sound                           'unlock' | 'hire' | ... (optional)
 *   repeatable                      true: the pad is never marked done and stays usable
 *                                   (fold is not called; apply runs each time; e.g. 'travel')
 */
export function registerPadEffect(name, handler) {
  if (!handler || typeof handler !== 'object') throw new Error(`registerPadEffect('${name}'): handler object required`);
  if (padEffects.has(name)) warnDup('pad effect', name);
  padEffects.set(name, handler);
}
export function getPadEffect(name) { return padEffects.get(name) || null; }
