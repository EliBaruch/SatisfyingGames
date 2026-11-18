// Renderer, scene, orthographic isometric camera that follows the player (with glides
// to far-away unlocks), resize handling and adaptive pixel ratio.
//
// world.camera (all optional, see config.js CAMERA for the defaults):
//   viewPortrait, viewLandscape, offset, lerp
//   type: 'perspective'     a narrow-angle perspective camera looking along the same direction as
//                           the orthographic one (same input mapping). `fov` (degrees, default 30).
//                           viewPortrait / viewLandscape = world units visible vertically at the focus.
//   zoom: 1                 starting zoom factor on the view size (> 1 = further out)
//   fog: { color, start, end }   distance fog measured from the focus point outward (perspective only)
// view.setZoom(z, dur) eases the zoom factor (both camera types); view.zoom reads it.
import * as THREE from 'three';
import { CAMERA } from './config.js';
import { configureRenderer } from './art/material.js';

export function createView(canvas, camDef) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // Render resolution adapts to the device: start at up to 2x and step down if the
  // frame rate cannot hold (see adaptQuality below).
  const PR_STEPS = [2, 1.5, 1.25, 1];
  let prLevel = 0;
  const maxPR = window.devicePixelRatio || 1;
  renderer.setPixelRatio(Math.min(maxPR, PR_STEPS[prLevel]));
  configureRenderer(renderer);   // sRGB output, no tone mapping, PCF shadows (art kit)

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fdcff);
  const persp = !!(camDef && camDef.type === 'perspective');
  const camera = persp ? new THREE.PerspectiveCamera(camDef.fov || 30, 1, 1, 400) : new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  const cam = { ...CAMERA };
  const Z = { cur: 1, from: 1, to: 1, t: 0, dur: 0 };   // zoom factor on the view size
  const C = { on: false, x: 0, z: 0, mul: 1, to: 1 };    // cinematic focus (engine/reveal.js): a point instead of the player, and a zoom factor
  const DIR = new THREE.Vector3();
  let fog = null;

  function resize() {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    renderer.setSize(w, h, false);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    applyProjection();
  }
  /** camera projection for the current window size and zoom (no canvas resize) */
  function applyProjection() {
    const aspect = (window.innerWidth || 1) / (window.innerHeight || 1);
    const view = (aspect < 1 ? cam.viewPortrait : cam.viewLandscape) * Z.cur * C.mul;
    if (persp) {
      // keep `view` world units visible vertically at the focus point: move the camera along its offset direction
      const dist = (view / 2) / Math.tan((camera.fov * Math.PI) / 360);
      DIR.set(cam.offset.x, cam.offset.y, cam.offset.z).normalize();
      OFF.copy(DIR).multiplyScalar(dist);
      camera.aspect = aspect;
      camera.near = Math.max(1, dist * 0.25);
      camera.far = dist + 220;
      if (fog) { fog.near = dist + fog.userData.start; fog.far = dist + fog.userData.end; }
    } else {
      camera.top = view / 2;
      camera.bottom = -view / 2;
      camera.left = (-view * aspect) / 2;
      camera.right = (view * aspect) / 2;
    }
    camera.updateProjectionMatrix();
  }
  const OFF = new THREE.Vector3(cam.offset.x, cam.offset.y, cam.offset.z);
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  // ------------------------------------------------------------------ follow
  const focus = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const glide = { t: 0, dur: 0, x: 0, z: 0 };
  let G = null;

  function updateCamera(realDt) {
    if (Z.dur > 0) {
      Z.t += realDt;
      const u = Math.min(1, Z.t / Z.dur);
      Z.cur = Z.from + (Z.to - Z.from) * (u * u * (3 - 2 * u));
      if (u >= 1) Z.dur = 0;
      applyProjection();
    }
    if (Math.abs(C.to - C.mul) > 0.0005) { C.mul += (C.to - C.mul) * (1 - Math.exp(-3.2 * realDt)); applyProjection(); }
    const pl = G && G.player;
    if (pl) camTarget.set(pl.pos.x, 0, pl.pos.z);
    if (C.on) camTarget.set(C.x, 0, C.z);
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
    const k = 1 - Math.exp(-(C.on ? 7 : glide.dur > 0 ? 4 : cam.lerp) * realDt);
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
      if (w) {
        Object.assign(cam, w);
        if (w.offset) OFF.set(w.offset.x, w.offset.y, w.offset.z);
        if (w.zoom > 0) Z.cur = Z.from = Z.to = w.zoom;
        if (persp && w.fog) {
          fog = new THREE.Fog(w.fog.color ?? 0xffffff, 1, 1000);
          fog.userData = { start: w.fog.start ?? 20, end: w.fog.end ?? 120 };
          scene.fog = fog;
        }
        resize();
      }
      if (G.state && G.state.player) focus.set(G.state.player.x, 0, G.state.player.z);
    },
    /** glide the camera to (x, z) and back over `dur` seconds */
    glideTo(x, z, dur = 1.6) { glide.t = 0; glide.dur = dur; glide.x = x; glide.z = z; },
    /** ease the zoom factor on the view size to `z` over `dur` seconds (0 = at once) */
    setZoom(z, dur = 1.5) {
      if (!(z > 0)) return;
      if (dur > 0) { Z.from = Z.cur; Z.to = z; Z.t = 0; Z.dur = dur; } else { Z.cur = Z.from = Z.to = z; Z.dur = 0; applyProjection(); }
    },
    get zoom() { return Z.cur; },
    /** cinematic: look at (x, z) instead of the player, with `zoom` as a factor on the current zoom; setCine(null) hands the camera back */
    setCine(p, zoom = 1) { if (p) { C.on = true; C.x = p.x; C.z = p.z; C.to = zoom > 0 ? zoom : 1; } else { C.on = false; C.to = 1; } },
    /** cut: look at (x, z) right now, with no pan across the map and the cinematic zoom already in (engine/modes) */
    snapTo(x, z) { focus.set(x, 0, z); glide.dur = 0; if (C.mul !== C.to) { C.mul = C.to; applyProjection(); } },
    /** the point the camera is looking at right now */
    get focus() { return focus; },
    /** world units visible vertically at the focus point right now */
    get viewSize() { const a = (window.innerWidth || 1) / (window.innerHeight || 1); return (a < 1 ? cam.viewPortrait : cam.viewLandscape) * Z.cur; },
    resize,
    frame(realDt) {
      updateCamera(realDt);
      if (G) {
        const pl = G.player;
        if (G.lights && pl) { if (C.on) G.lights.follow(focus.x, focus.z); else G.lights.follow(pl.pos.x, pl.pos.z); }
        if (G.blobs) G.blobs.update();
      }
      renderer.render(scene, camera);
      adaptQuality(realDt);
    },
  };
}
