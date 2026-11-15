// Geometry helpers shared by engine and worlds. The modelling helpers and the shared lit material
// now live in the art kit (src/engine/art/); this file re-exports them so older imports keep
// working, and keeps the two tiny non-art helpers (geo cache, rng).
export { Parts, mergeParts, meshOf, roundedBoxGeometry } from './art/parts.js';
export { getSharedMaterial } from './art/material.js';

// primitive geometry cache (shared, never disposed)
const GC = new Map();
export function geo(key, make) {
  let g = GC.get(key);
  if (!g) { g = make(); GC.set(key, g); }
  return g;
}

/** Deterministic PRNG (mulberry32) returning floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
