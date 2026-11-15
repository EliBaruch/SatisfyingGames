// Renderer, scene, orthographic isometric camera that follows the player (with glides
// to far-away unlocks), resize handling and adaptive pixel ratio.
import * as THREE from 'three';
import { CAMERA } from './config.js';

export function createView(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Render resolution adapts to the device: start at up to 2x and step down if the
  // frame rate cannot hold (see adaptQuality below).
  const PR_STEPS = [2, 1.5, 1.25, 1];
  let prLevel = 0;
  const maxPR = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(maxPR, PR_STEPS[prLevel]));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // r187 removed PCFSoftShadowMap

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fdcff);
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const cam = { ...CAMERA };

  function resize() {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const aspect = w / h;
    const view = aspect < 1 ? cam.viewPortrait : cam.viewLandscape;
    camera.top = view / 2;
    camera.bottom = -view / 2;
    camera.left = (-view * aspect) / 2;
    camera.right = (view * aspect) / 2;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // ------------------------------------------------------------------ follow
  const focus = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const OFF = new THREE.Vector3(cam.offset.x, cam.offset.y, cam.offset.z);
  const glide = { t: 0, dur: 0, x: 0, z: 0 };
  let G = null;

  function updateCamera(realDt) {
    const pl = G && G.player;
    if (pl) camTarget.set(pl.pos.x, 0, pl.pos.z);
    if (glide.dur > 0) {
      glide.t += realDt;
      const u = glide.t / glide.dur;
      if (u >= 1) glide.dur = 0;
      else {
        const w = u < 0.3 ? u / 0.3 : u > 0.7 ? (1 - u) / 0.3 : 1;
        const e = w * w * (3 - 2 * w);
        camTarget.x += (glide.x - camTarget.x) * e;
        camTarget.z += (glide.z - camTarget.z) * e;
      }
    }
    const k = 1 - Math.exp(-(glide.dur > 0 ? 4 : cam.lerp) * realDt);
    focus.x += (camTarget.x - focus.x) * k;
    focus.z += (camTarget.z - focus.z) * k;
    const sh = G && G.fx && G.fx.shakeOffset;
    camera.position.set(focus.x + OFF.x, OFF.y, focus.z + OFF.z);
    if (sh) camera.position.add(sh);
    camera.lookAt(focus.x + (sh ? sh.x : 0), sh ? sh.y : 0, focus.z + (sh ? sh.z : 0));
  }

  // Drop the render resolution one notch whenever the smoothed frame time stays above
  // ~24 ms (under ~42 fps) for a while. Never goes back up, so it cannot oscillate.
  let qEma = 1 / 60, qBad = 0, qWarm = 0;
  function adaptQuality(realDt) {
    if (document.hidden || (G && G.timeScale > 1.5) || realDt <= 0) return;
    qWarm += realDt;
    if (qWarm < 3) return;                       // ignore start-up hitches
    qEma += (Math.min(realDt, 0.1) - qEma) * 0.05;
    if (qEma > 0.024) qBad += realDt; else qBad = Math.max(0, qBad - realDt * 2);
    if (qBad > 2 && prLevel < PR_STEPS.length - 1) {
      prLevel++;
      qBad = 0; qEma = 1 / 60; qWarm = 1.5;
      if (PR_STEPS[prLevel] < maxPR) {
        renderer.setPixelRatio(PR_STEPS[prLevel]);
        resize();
      }
    }
  }

  return {
    renderer, scene, camera,
    /** attach the game object (camera follows G.player, shakes with G.fx) */
    bind(g) {
      G = g;
      const w = G.world.camera;
      if (w) { Object.assign(cam, w); if (w.offset) OFF.set(w.offset.x, w.offset.y, w.offset.z); resize(); }
      if (G.state && G.state.player) focus.set(G.state.player.x, 0, G.state.player.z);
    },
    /** glide the camera to (x, z) and back over `dur` seconds */
    glideTo(x, z, dur = 1.6) { glide.t = 0; glide.dur = dur; glide.x = x; glide.z = z; },
    resize,
    frame(realDt) {
      updateCamera(realDt);
      renderer.render(scene, camera);
      adaptQuality(realDt);
    },
  };
}
