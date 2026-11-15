// Scene lighting from world.lighting: hemisphere + shadow-casting sun that follows the
// player (snapped, so the shadow map does not shimmer) + a soft camera-side fill.
//
// world.lighting = {
//   background: 0x6fbf4b,                                  // scene background colour
//   hemi: { sky, ground, intensity },
//   sun:  { color, intensity, dir: [x, y, z], mapSize: 1536, extent: 19 },
//   fill: { color, intensity, pos: [x, y, z] } | null,
// }
// Every field is optional; the defaults are the flower farm's.
import * as THREE from 'three';

const DEFAULTS = {
  background: 0x6fbf4b,
  hemi: { sky: 0xe8f6ff, ground: 0x8fc46a, intensity: 1.3 },
  sun: { color: 0xfff1d6, intensity: 1.95, dir: [9, 22, -8], mapSize: 1536, extent: 19 },
  fill: { color: 0xffe6f0, intensity: 0.55, pos: [-14, 12, -10] },
};

export function createLights(G) {
  const L = G.world.lighting || {};
  const hemiCfg = { ...DEFAULTS.hemi, ...(L.hemi || {}) };
  const sunCfg = { ...DEFAULTS.sun, ...(L.sun || {}) };
  const fillCfg = L.fill === null ? null : { ...DEFAULTS.fill, ...(L.fill || {}) };
  const root = new THREE.Group();
  root.name = 'lights';
  G.scene.add(root);
  G.scene.background = new THREE.Color(L.background ?? DEFAULTS.background);

  const hemi = new THREE.HemisphereLight(hemiCfg.sky, hemiCfg.ground, hemiCfg.intensity);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(sunCfg.color, sunCfg.intensity);
  const SUN_DIR = new THREE.Vector3(...sunCfg.dir).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(sunCfg.mapSize, sunCfg.mapSize);
  const sc = sun.shadow.camera;
  // just big enough for the visible area around the player; a larger box makes the
  // shadow pass draw everything off-screen too
  const E = sunCfg.extent;
  sc.left = -E; sc.right = E; sc.top = E; sc.bottom = -E; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  root.add(sun);
  root.add(sun.target);
  let fill = null;
  if (fillCfg) {
    fill = new THREE.DirectionalLight(fillCfg.color, fillCfg.intensity); // no shadows
    fill.position.set(...fillCfg.pos);
    root.add(fill);
  }

  const SNAP = 4;
  let lastX = 1e9, lastZ = 1e9;
  function placeSun(x, z) {
    const tx = Math.round(x / SNAP) * SNAP, tz = Math.round(z / SNAP) * SNAP;
    if (tx === lastX && tz === lastZ) return;
    lastX = tx; lastZ = tz;
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + SUN_DIR.x * 50, SUN_DIR.y * 50, tz + SUN_DIR.z * 50);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }
  placeSun(G.state.player.x, G.state.player.z);

  return {
    hemi, sun, fill, root,
    update() {
      const p = G.player && G.player.pos;
      if (p) placeSun(p.x, p.z);
    },
  };
}
