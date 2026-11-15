// Item kinds: built-in 'cash' plus lazy geometry/material resolution for any registered kind.
import { registerItem, getItem } from './registry.js';
import { getSharedMaterial } from './art/material.js';
import { makeCashBundleGeometry, CASH } from './art/props.js';

// Money bundles (the art kit's chunky cash bundle): what flies from counters to cash piles, from piles to the player and
// from the player into pads. Always available, whatever the world.
registerItem({
  id: 'cash', name: 'Cash', value: 0,
  geometry: () => makeCashBundleGeometry(),
  step: CASH.h, footprint: { w: CASH.len, d: CASH.d },
});

/** The kind's BufferGeometry (built once). Accepts an id or an item object. */
export function itemGeometry(kind) {
  const it = typeof kind === 'string' ? getItem(kind) : kind;
  if (!it) return null;
  if (!it._geo) {
    const g = it.def.geometry;
    it._geo = typeof g === 'function' ? g() : g;
    if (!it._geo) throw new Error(`item '${it.id}' has no geometry`);
    if (!it._geo.boundingSphere) it._geo.computeBoundingSphere();
  }
  return it._geo;
}

/** The kind's material (shared vertex-colour Lambert unless the item def gives one). */
export function itemMaterial(kind) {
  const it = typeof kind === 'string' ? getItem(kind) : kind;
  if (!it) return getSharedMaterial();
  if (!it._mat) {
    const m = it.def.material;
    it._mat = (typeof m === 'function' ? m() : m) || getSharedMaterial();
  }
  return it._mat;
}

/** Base value of one item of `kind` (0 for unknown kinds). */
export function itemValue(kind) {
  const it = getItem(kind);
  return it ? it.value : 0;
}
