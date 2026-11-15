// Item kinds: built-in 'cash' plus lazy geometry/material resolution for any registered kind.
import { registerItem, getItem } from './registry.js';
import { getSharedMaterial } from './art/material.js';
import { CASH } from './art/props.js';
import { Parts } from './art/parts.js';

/**
 * The art kit's chunky cash bundle (CASH size: 0.62 x 0.16 x 0.38, banded green layers, paper band, printed
 * top note) rebuilt with fewer triangles: the original is 884 triangles and the pile on a counter draws up to
 * 40 of them per shop (about 300 here), still bevelled and baked-AO shaded.
 */
function makeCashBundle() {
  const { len, h, d } = CASH;
  const b = new Parts();
  b.rbox(0x38b554, len, h, d, 0.04, [0, h / 2, 0], null, null, 1);
  b.box(0x5fd47c, len * 0.9, 0.012, d * 0.84, [0, h + 0.002, 0]);
  b.rbox(0xf7f0d6, len * 0.24, h + 0.02, d + 0.02, 0.03, [0, h / 2, 0], null, null, 1);
  b.rbox(0xe05d4f, len * 0.24 + 0.004, 0.035, d + 0.03, 0.012, [0, h * 0.62, 0], null, null, 1);
  return b.merged({ ao: { ground: 0.18, groundH: 0.1, down: 0.1, noBoxes: true } });
}

// Money bundles (the art kit's chunky cash bundle): what flies from counters to cash piles, from piles to the player and
// from the player into pads. Always available, whatever the world.
registerItem({
  id: 'cash', name: 'Cash', value: 0,
  geometry: makeCashBundle,
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
