// Scene lighting: the art kit's lights (hemisphere + shadow-casting sun + camera-side fill) with the
// sun's shadow box following the player, snapped to shadow texels so the shadow map does not shimmer.
//
// world.lighting (all optional):
//   variant: 'outdoor' (default) | 'indoor'      the art kit's LIGHTING / LIGHTING.indoor
//   background: 0x9fdcff                          scene background colour
//   hemi: { sky, ground, intensity }, sun: { color, intensity, dir: [x, y, z] }, fill: { color, intensity }
//   shadow: { extent, mapSize, radius, intensity }  shadow box half-size (world units), map size...
//   shadows: false                                 no real shadows (blob shadows remain)
//   tint: 0xffe6c0, tintAmount: 0.2                mix every light colour toward a tint (golden hour...)
// `G.lights.follow(x, z)` is called by view.frame every rendered frame.
import * as THREE from 'three';
import { createLights as artLights, LIGHTING } from './art/material.js';

const _c = new THREE.Color();

export function createLights(G) {
  const L = G.world.lighting || {};
  const base = L.variant === 'indoor' ? LIGHTING.indoor : null;
  const variant = {
    ...(base || {}),
    hemi: { ...(base && base.hemi), ...L.hemi },
    sun: { ...(base && base.sun), ...L.sun },
    fill: { ...(base && base.fill), ...L.fill },
  };
  if (L.tint != null) {
    const k = L.tintAmount ?? 0.2;
    const mix = (c, fb) => '#' + _c.set(c ?? fb).lerp(new THREE.Color(L.tint), k).getHexString();
    const bh = base ? base.hemi : LIGHTING.hemi, bs = base ? base.sun : LIGHTING.sun, bf = base ? base.fill : LIGHTING.fill;
    const bgc = (o, b) => ({ ...o, ...b });
    variant.hemi = bgc(variant.hemi, { sky: mix(variant.hemi.sky, bh.sky ?? LIGHTING.hemi.sky), ground: mix(variant.hemi.ground, bh.ground ?? LIGHTING.hemi.ground) });
    variant.sun = bgc(variant.sun, { color: mix(variant.sun.color, bs.color ?? LIGHTING.sun.color) });
    variant.fill = bgc(variant.fill, { color: mix(variant.fill.color, bf.color ?? LIGHTING.fill.color) });
  }
  const bg = L.background ?? (base ? base.background : LIGHTING.background);
  G.scene.background = new THREE.Color(bg);
  const lights = artLights(G.scene, { variant, shadow: L.shadow, shadows: L.shadows });
  const p = G.state.player;
  lights.follow(p.x, p.z);
  lights.update = () => {};          // following happens per rendered frame (view.frame)
  lights.root = lights.group;
  return lights;
}
