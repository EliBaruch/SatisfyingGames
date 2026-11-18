// The list of worlds (levels), in play order. This is the only place that names them.
// A world is loaded from src/worlds/<id>/world.js; entries whose folder does not exist
// yet are listed (the title screen can show them as "coming soon") but never loaded.
//
//   id          folder name under src/worlds/
//   name        display name
//   order       play order (1-based)
//   unlockedBy  world id that must be finished first (null = always open)

export const WORLDS = [
  { id: 'flower', name: 'Flower Farm', order: 1, unlockedBy: null },
  { id: 'chicken', name: 'Chicken Farm', order: 2, unlockedBy: 'flower' },
  { id: 'grocery', name: 'Grocery Store', order: 3, unlockedBy: 'chicken' },
  { id: 'factory', name: 'Volt Works', order: 4, unlockedBy: 'grocery' },
  { id: 'frost', name: 'Frostpine Camp', order: 5, unlockedBy: 'factory' },
  { id: 'keep', name: 'Ironwall Keep', order: 6, unlockedBy: 'frost' },
];

export function worldInfo(id) { return WORLDS.find((w) => w.id === id) || null; }

/** True if `id` may be played given meta.finished (always true for the first world). */
export function isUnlocked(id, meta) {
  const w = worldInfo(id);
  if (!w) return false;
  return !w.unlockedBy || !!(meta && meta.finished && meta.finished[w.unlockedBy]);
}

/** The world after `id` in play order, or null. */
export function nextWorld(id) {
  const w = worldInfo(id);
  if (!w) return null;
  return WORLDS.filter((x) => x.order > w.order).sort((a, b) => a.order - b.order)[0] || null;
}
