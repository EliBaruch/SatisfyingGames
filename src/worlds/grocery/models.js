// Grocery world models: carried / shelved product crates built from pack food models, plus
// code-built store furniture (shelves, checkouts, signs, trucks) used by scene.js.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { preload } from '../../engine/art/assets.js';

// Shared sizes: items lie along X, origin bottom-centre.
const K = 1.2;   // crates are built at 0.62 x 0.42 x 0.26 and scaled up so they read from the camera
export const CRATE = { w: 0.62 * K, d: 0.42 * K, h: 0.26 * K, step: 0.3 * K };

const PRODUCTS = {
  produce: { crate: 0x7fd34f, rim: 0xa7e86f, model: 'food-kit/paprika', color: 0xffffff, ids: ['food-kit/paprika', 'food-kit/pear', 'food-kit/paprika'] },
  bread: { crate: 0xe3a45a, rim: 0xf5c98a, ids: ['food-kit/loaf-baguette', 'food-kit/croissant'] },
  milk: { crate: 0x5db6f0, rim: 0xa6dcff, ids: ['food-kit/carton-small', 'food-kit/carton-small', 'food-kit/carton-small'] },
  drinks: { crate: 0xff6f91, rim: 0xffa8bd, ids: ['food-kit/soda-can', 'food-kit/soda-can', 'food-kit/soda-can', 'food-kit/soda-can'] },
};
export const PRODUCT_COLOR = { produce: 0x7fd34f, bread: 0xe3a45a, milk: 0x5db6f0, drinks: 0xff6f91 };

/** One crate of a product: rounded open tray with the goods peeking out. */
export function makeCrateGeometry(kind) {
  const P = PRODUCTS[kind];
  const w = 0.62, d = 0.42, h = 0.26;
  const b = new Parts();
  // sharp-edged tray (24 triangles with the rim) so the goods stay under ~300 triangles per crate
  b.box(P.crate, w, h, d, [0, h / 2, 0]);
  b.box(P.rim, w + 0.03, 0.05, d + 0.03, [0, h - 0.02, 0]);
  const top = h - 0.02;
  if (kind === 'produce') {
    b.model('food-kit/paprika', { pos: [-0.14, top, 0.0], height: 0.28 });
    b.model('food-kit/pear', { pos: [0.14, top, 0.02], height: 0.32 });
  } else if (kind === 'bread') {
    b.model('food-kit/loaf-baguette', { pos: [0.0, top, 0.08], width: 0.5, rot: [0, 0.15, 0] });
    b.model('food-kit/loaf', { pos: [0.0, top, -0.09], width: 0.36 });
  } else if (kind === 'milk') {
    for (let i = 0; i < 3; i++) b.model('food-kit/carton-small', { pos: [-0.19 + i * 0.19, top, 0.0], height: 0.36 });
  } else {
    b.model('food-kit/soda-can', { pos: [-0.17, top, 0.0], height: 0.34 });
    b.cyl(0xffffff, 0.085, 0.085, 0.3, [0.02, top + 0.15, 0.06], null, 7);
    b.cyl(0x6ad0ff, 0.085, 0.085, 0.3, [0.2, top + 0.15, -0.04], null, 7);
  }
  const g = b.merged({ ao: { ground: 0.12, groundH: 0.12, down: 0.08, noBoxes: true } });
  g.scale(K, K, K);
  return g;
}

export const ASSETS = [
  'food-kit/paprika', 'food-kit/pear', 'food-kit/loaf-baguette', 'food-kit/croissant', 'food-kit/carton-small', 'food-kit/soda-can', 'food-kit/loaf',
];

// The engine builds item geometry (fx pools) before it preloads world.assets, so the food models the crates
// are made of are loaded here, while the module is imported (top-level await).
await preload(ASSETS);

export { Parts, meshOf, THREE };
