// Grocery world models: carried / shelved product crates built from pack food models, plus
// code-built store furniture (shelves, checkouts, signs, trucks) used by scene.js.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { preload } from '../../engine/art/assets.js';

// Shared sizes: items lie along X, origin bottom-centre.
export const CRATE = { w: 0.62, d: 0.42, h: 0.26, step: 0.3 };

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
  const { w, d, h } = CRATE;
  const b = new Parts();
  b.rbox(P.crate, w, h, d, 0.06, [0, h / 2, 0], null, null, 1);
  b.rbox(P.rim, w + 0.02, 0.05, d + 0.02, 0.025, [0, h - 0.02, 0], null, null, 1);
  const top = h - 0.02;
  if (kind === 'produce') {
    b.model('food-kit/paprika', { pos: [-0.17, top, 0.0], height: 0.28, tint: 0xffffff });
    b.model('food-kit/pear', { pos: [0.02, top, 0.07], height: 0.3 });
    b.model('food-kit/paprika', { pos: [0.19, top, -0.05], height: 0.26, rot: [0, 1.2, 0] });
  } else if (kind === 'bread') {
    b.model('food-kit/loaf-baguette', { pos: [0.0, top, 0.08], width: 0.5, rot: [0, 0.15, 0] });
    b.model('food-kit/croissant', { pos: [-0.1, top, -0.07], width: 0.3 });
    b.model('food-kit/croissant', { pos: [0.16, top, -0.08], width: 0.3, rot: [0, 0.6, 0] });
  } else if (kind === 'milk') {
    for (let i = 0; i < 3; i++) b.model('food-kit/carton-small', { pos: [-0.19 + i * 0.19, top, 0.0], height: 0.36 });
  } else {
    for (let i = 0; i < 4; i++) b.model('food-kit/soda-can', { pos: [-0.2 + (i % 2) * 0.2 + 0.0, top, i < 2 ? 0.08 : -0.08], height: 0.3 });
  }
  return b.merged({ ao: { ground: 0.12, groundH: 0.12, down: 0.08, noBoxes: true } });
}

export const ASSETS = [
  'food-kit/paprika', 'food-kit/pear', 'food-kit/loaf-baguette', 'food-kit/croissant', 'food-kit/carton-small', 'food-kit/soda-can',
];

// The engine builds item geometry (fx pools) before it preloads world.assets, so the food models the crates
// are made of are loaded here, while the module is imported (top-level await).
await preload(ASSETS);

export { Parts, meshOf, THREE };
