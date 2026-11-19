// The raid's yard and everything in it, built from code in the world's colours: a round floating
// yard with a low picket fence, gaps with lantern posts and a little bridge to a burrow outside each,
// the pallet and the stockpile, the pests (one InstancedMesh, hopping in the matrix), what they carry,
// coins, helper pads, scarecrow helpers and what they toss, the sweep arc and two health bars.
// Everything is built once and re-laid per level, so restarting raids allocates nothing on the GPU.
//
// Local frame of `root`: the yard's centre is the origin; an angle a is the point (cos a, sin a).
import * as THREE from 'three';
import { Parts } from '../art/parts.js';
import { litMaterial, getSharedMaterial } from '../art/material.js';
import { roundRect } from '../decals.js';
import { itemGeometry, itemMaterial } from '../items.js';
import { getItem } from '../registry.js';
import { rng } from '../geom.js';
import { SEGS, GAP_SEGS, MAX_GAPS, PAD_COST } from './level.js';

export const R = 9;                 // the fence's radius
export const PILE_R = 1.8;          // the pallet, as a circle
export const PAD_R = 5.1;           // helper pads stand this far from the centre
export const BRIDGE = 4.4;          // a bridge runs this far out from the fence
export const BURROW = R + 3.7;      // the burrow's distance from the centre
export const PEST_CAP = 96, COIN_CAP = 48, SHOT_CAP = 12, PILE_CAP = 64;
export const BAR_W = 2.6;

const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, "Segoe UI", Arial, sans-serif';
const TAU = Math.PI * 2;
const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const rgba = (hex, a) => `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${a})`;
const _a = new THREE.Color(), _b = new THREE.Color();
const mix = (a, b, t) => _a.set(a).lerp(_b.set(b), t).getHex();

function texture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** the yard's floor: pale paving in rings, a marked circle round the pile, a coloured border */
function yardTexture(col, radius) {
  return texture(1024, 1024, (g, W) => {
    const c = W / 2, u = c / radius;             // pixels per world unit
    g.fillStyle = css(mix(col.lane, col.accent, 0.5));
    g.fillRect(0, 0, W, W);
    g.beginPath(); g.arc(c, c, (R + 0.45) * u, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
    g.beginPath(); g.arc(c, c, (R + 0.2) * u, 0, TAU); g.fillStyle = css(col.lane); g.fill();
    // paving: rings of slabs, every other one a shade deeper
    const rings = 6, rw = (R + 0.2) / rings;
    for (let i = rings - 1; i >= 0; i--) {
      const r0 = i * rw, r1 = r0 + rw, n = Math.max(6, Math.round(((r0 + r1) / 2) * TAU / 2.1));
      for (let k = 0; k < n; k++) {
        if ((k + i) % 2) continue;
        const a0 = (k / n) * TAU + i * 0.37, a1 = a0 + TAU / n;
        g.beginPath(); g.arc(c, c, r1 * u, a0, a1); g.arc(c, c, r0 * u, a1, a0, true); g.closePath();
        g.fillStyle = rgba(col.accent, 0.07);
        g.fill();
      }
      g.beginPath(); g.arc(c, c, r1 * u, 0, TAU);
      g.strokeStyle = rgba(col.accent, 0.12); g.lineWidth = 3; g.stroke();
    }
    // the pile's circle
    g.beginPath(); g.arc(c, c, 3.05 * u, 0, TAU); g.fillStyle = rgba(col.accent, 0.16); g.fill();
    g.setLineDash([26, 18]); g.lineCap = 'round';
    g.strokeStyle = '#ffffff'; g.lineWidth = 9; g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.arc(c, c, 2.25 * u, 0, TAU); g.fillStyle = rgba(col.accent2, 0.22); g.fill();
  });
}

function padTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { cv, ctx: cv.getContext('2d'), tex: t };
}

/** a helper pad in the engine's pad style: dark glass, a glowing dashed outline, a coin and what is left to pay */
function drawPad(ctx, remaining, frac) {
  const W = 256;
  ctx.clearRect(0, 0, W, W);
  ctx.save();
  roundRect(ctx, 14, 14, W - 28, W - 28, 44);
  const g = ctx.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, 'rgba(20, 34, 58, 0.58)');
  g.addColorStop(1, 'rgba(12, 22, 42, 0.74)');
  ctx.fillStyle = g;
  ctx.fill();
  if (frac > 0) {
    ctx.clip();
    const y = 14 + (W - 28) * (1 - Math.min(1, frac));
    const f = ctx.createLinearGradient(0, y, 0, W);
    f.addColorStop(0, 'rgba(110, 240, 130, 0.9)');
    f.addColorStop(1, 'rgba(40, 170, 80, 0.85)');
    ctx.fillStyle = f;
    ctx.fillRect(0, y, W, W - y);
    ctx.fillStyle = 'rgba(230, 255, 235, 0.95)';
    ctx.fillRect(0, y, W, 5);
  }
  ctx.restore();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([26, 17]);
  ctx.shadowColor = '#5fe6ff';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  roundRect(ctx, 20, 20, W - 40, W - 40, 38);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#6fe9ff';
  ctx.stroke();
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.font = `700 44px ${FONT}`;
  ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(14, 22, 44, 0.9)';
  ctx.strokeText('HELPER', W / 2, 80);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('HELPER', W / 2, 80);
  // a coin and the price
  const price = String(remaining);
  ctx.font = `700 66px ${FONT}`;
  const tw = ctx.measureText(price).width, cr = 27, gap = 10;
  const x0 = W / 2 - (cr * 2 + gap + tw) / 2, y = 168;
  ctx.beginPath(); ctx.arc(x0 + cr, y, cr, 0, TAU); ctx.fillStyle = '#b97800'; ctx.fill();
  ctx.beginPath(); ctx.arc(x0 + cr, y - 2, cr - 4, 0, TAU); ctx.fillStyle = '#ffc928'; ctx.fill();
  ctx.beginPath(); ctx.arc(x0 + cr, y - 2, cr - 11, 0, TAU); ctx.fillStyle = '#ffe58a'; ctx.fill();
  ctx.textAlign = 'left';
  ctx.lineWidth = 11; ctx.strokeStyle = 'rgba(14, 22, 44, 0.9)';
  ctx.strokeText(price, x0 + cr * 2 + gap, y + 3);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(price, x0 + cr * 2 + gap, y + 3);
}

/** the critter: a round body with ears, a robber's mask, a nose and a tuft of a tail. Faces +z, feet at the origin. */
function pestGeometry(tint, hi) {
  const b = new Parts();
  const k = hi ? 2 : 1;
  const dark = mix(tint, 0x241a3a, 0.72), light = mix(tint, 0xffffff, 0.62), pink = 0xff8fa8;
  b.sph(tint, 0.36, [0, 0.37, 0], [1, 0.94, 1.04], null, 10 * k, 7 * k);
  b.sph(light, 0.25, [0, 0.27, 0.15], [1, 0.9, 0.86], null, 8 * k, 5 * k);                    // belly
  for (const sx of [-1, 1]) {
    b.sph(tint, 0.15, [sx * 0.2, 0.73, -0.02], [0.72, 1.15, 0.42], [0, 0, -sx * 0.22], 6 * k, 4 * k);     // ear
    b.sph(pink, 0.09, [sx * 0.2, 0.73, 0.03], [0.62, 1.1, 0.3], [0, 0, -sx * 0.22], 5 * k, 3 * k);
    b.sph(dark, 0.125, [sx * 0.135, 0.47, 0.27], [1.05, 0.92, 0.5], [0, sx * 0.35, 0], 6 * k, 4 * k);     // mask
    b.sph(0xffffff, 0.075, [sx * 0.135, 0.475, 0.315], [1, 1, 0.6], null, 6 * k, 4 * k);                // eye
    b.sph(0x1c1430, 0.042, [sx * 0.13, 0.47, 0.355], [1, 1, 0.6], null, 5 * k, 3 * k);
    b.sph(dark, 0.1, [sx * 0.17, 0.05, 0.14], [1, 0.55, 1.5], null, 5 * k, 3 * k);                      // foot
  }
  b.sph(pink, 0.05, [0, 0.38, 0.37], [1.2, 0.8, 0.8], null, 5 * k, 3 * k);                             // nose
  b.sph(light, 0.12, [0, 0.3, -0.37], null, null, 6 * k, 4 * k);                                       // tail
  return b.merged();
}

/** the helper: a scarecrow on a tub, in the world's colours. Faces +z. */
function scarecrowGeometry(col) {
  const b = new Parts();
  const wood = 0x9a6a3c, straw = 0xf2cf62;
  b.rcyl(mix(wood, 0x2b1740, 0.25), 0.52, 0.32, 0.08, [0, 0.16, 0], null, 16);
  b.rcyl(col.accent2, 0.55, 0.1, 0.04, [0, 0.3, 0], null, 16);
  b.cyl(wood, 0.075, 0.09, 1.25, [0, 0.9, 0], null, 8);
  b.cyl(wood, 0.06, 0.06, 1.6, [0, 1.22, 0], [0, 0, Math.PI / 2], 8);
  b.rcyl(col.accent, 0.34, 0.64, 0.12, [0, 1.04, 0], null, 14, [1, 1, 0.72]);
  b.rcyl(mix(col.accent, 0xffffff, 0.55), 0.345, 0.14, 0.05, [0, 0.9, 0], null, 14, [1, 1, 0.74]);
  for (const sx of [-1, 1]) {
    b.cyl(col.accent, 0.11, 0.13, 0.5, [sx * 0.5, 1.22, 0], [0, 0, Math.PI / 2], 8);
    b.cone(straw, 0.14, 0.32, [sx * 0.9, 1.22, 0], [0, 0, sx * Math.PI / 2], 7);
  }
  b.cyl(straw, 0.2, 0.24, 0.1, [0, 1.41, 0], null, 10);
  b.sph(0xffe9c4, 0.3, [0, 1.7, 0], null, null, 14, 10);
  for (const sx of [-1, 1]) b.sph(0x2b1740, 0.05, [sx * 0.11, 1.74, 0.27], null, null, 6, 4);
  b.cone(0xff8a2e, 0.06, 0.2, [0, 1.66, 0.36], [Math.PI / 2, 0, 0], 6);
  b.cyl(col.accent2, 0.46, 0.46, 0.05, [0, 1.92, 0], null, 14);
  b.cone(col.accent2, 0.28, 0.44, [0, 2.15, 0], null, 12);
  b.sph(0xffffff, 0.07, [0, 2.38, 0], null, null, 6, 4);
  return b.merged();
}

/** what a helper tosses: harmless and themed. Centred on the origin, about 0.25 in radius. */
function shotGeometry(kind) {
  const b = new Parts();
  if (kind === 'snowball') {
    b.sph(0xffffff, 0.24, [0, 0, 0], null, null, 10, 7);
    b.sph(0xdfeeff, 0.13, [0.12, 0.12, 0.08], null, null, 6, 4);
  } else if (kind === 'bolt') {
    b.cyl(0xb9c4d2, 0.09, 0.09, 0.44, [0, -0.05, 0], null, 8);
    b.cyl(0x8794a8, 0.2, 0.2, 0.15, [0, 0.22, 0], null, 6);
  } else if (kind === 'corn') {
    b.capsule(0xffd23f, 0.14, 0.26, [0, 0.03, 0], null, null, 3, 8);
    b.cone(0x58b84a, 0.17, 0.3, [0, -0.2, 0], [Math.PI, 0, 0], 7);
  } else if (kind === 'apple') {
    b.sph(0xe8433f, 0.23, [0, 0, 0], [1, 0.92, 1], null, 10, 7);
    b.cyl(0x7a4a2a, 0.025, 0.025, 0.14, [0, 0.24, 0], null, 5);
    b.sph(0x58b84a, 0.08, [0.08, 0.27, 0], [1.4, 0.35, 0.8], null, 5, 3);
  } else {                                                   // a turnip
    b.sph(0xb565c9, 0.22, [0, 0.04, 0], null, null, 10, 7);
    b.cone(0xfff1fa, 0.2, 0.3, [0, -0.17, 0], [Math.PI, 0, 0], 10);
    for (const s of [-1, 1]) b.cone(0x58b84a, 0.07, 0.26, [s * 0.06, 0.33, 0], [0, 0, -s * 0.35], 5);
  }
  return b.merged();
}

function arcGeometry() {
  // unit radius; two arcs, each bright and thick at its head and tapering to nothing at its tail
  const SEG = 18, ARC = 2.2;
  const pos = [], colr = [], idx = [];
  for (let a = 0; a < 2; a++) {
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, th = a * Math.PI + u * ARC;
      const inner = 1 - 0.3 * u * u, c = u * u;
      pos.push(Math.sin(th), 0, Math.cos(th), Math.sin(th) * inner, 0, Math.cos(th) * inner);
      colr.push(c, c, c, c * 0.6, c * 0.6, c * 0.6);
      if (i < SEG) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.setIndex(idx);
  return g;
}

let barBack = null;
/** a health bar that faces the camera: set(frac) fills it, tint(hex) colours it */
function makeBar(w, h) {
  if (!barBack) {
    barBack = texture(256, 48, (g, W, H) => {
      roundRect(g, 2, 2, W - 4, H - 4, 20); g.fillStyle = '#ffffff'; g.fill();
      roundRect(g, 7, 7, W - 14, H - 14, 15); g.fillStyle = '#1c1446'; g.fill();
    });
  }
  const group = new THREE.Group();
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.3, h + 0.3), new THREE.MeshBasicMaterial({ map: barBack, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  back.renderOrder = 900;
  const mat = new THREE.MeshBasicMaterial({ color: 0x5fe07a, transparent: true, depthTest: false, depthWrite: false, fog: false });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0), mat);
  fill.renderOrder = 901;
  fill.position.x = -w / 2;
  group.add(back, fill);
  group.visible = false;
  let shown = -1;
  return {
    group,
    set(frac) {
      const f = frac < 0 ? 0 : frac > 1 ? 1 : frac;
      if (f === shown) return;
      shown = f;
      fill.scale.set(Math.max(0.0001, w * f), h, 1);
      mat.color.setHex(f > 0.6 ? 0x5fe07a : f > 0.3 ? 0xffc928 : 0xff5a5a);
    },
  };
}

export function createArena(G, origin, theme, dress) {
  const col = theme.colors;
  const shared = getSharedMaterial();
  const item = getItem(theme.item);
  const root = new THREE.Group();
  root.name = 'raid';
  root.position.set(origin.x, 0, origin.z);
  root.visible = false;
  G.scene.add(root);

  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
  const _c = new THREE.Color();
  const UP = new THREE.Vector3(0, 1, 0);
  const inst = (geo, mat, cap, cast, tinted) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = !!cast;
    if (tinted) {
      for (let i = 0; i < cap; i++) m.setColorAt(i, _c.setRGB(1, 1, 1));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    m.count = 0;
    root.add(m);
    return m;
  };

  // ---- the yard: a textured top, a rim that reads as its thickness, puffs drifting below
  const GR = R + 1.5;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(GR, 64).rotateX(-Math.PI / 2), litMaterial({ map: yardTexture(col, GR) }));
  floor.receiveShadow = true;
  root.add(floor);
  {
    const b = new Parts();
    const deep = mix(col.accent, 0x2b1740, 0.34);
    b.cyl(mix(col.lane, col.accent, 0.5), GR, GR - 0.12, 0.34, [0, -0.18, 0], null, 64, null, true);
    b.cyl(deep, GR - 0.12, GR - 1.5, 1.5, [0, -1.1, 0], null, 64, null, true);
    b.cyl(mix(deep, 0x2b1740, 0.3), GR - 1.5, GR - 4.5, 1.6, [0, -2.65, 0], null, 40);
    const rnd = rng(60113);
    const low = mix(col.puff, theme.background, 0.45);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + rnd() * 0.5, d = GR + 2.5 + rnd() * 7, y = -3 - rnd() * 5, r = 1.2 + rnd() * 1.3;
      const c = mix(col.puff, low, Math.min(1, (-y - 3) / 5));
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      b.sph(c, r, [x, y, z], [1.5, 0.55, 1.2], null, 12, 7);
      b.sph(c, r * 0.7, [x + r * 1.1, y + 0.1, z + r * 0.3], [1.4, 0.55, 1.1], null, 10, 6);
      b.sph(c, r * 0.6, [x - r * 1.0, y - 0.05, z - r * 0.25], [1.4, 0.55, 1.1], null, 10, 6);
    }
    const under = new THREE.Mesh(b.merged(), shared);
    root.add(under);
  }

  // ---- fence: one instance per segment (a post, two rails, three pickets); gaps get lantern posts
  const L = 2 * R * Math.sin(Math.PI / SEGS);
  const fenceGeo = (() => {
    const b = new Parts();
    const rail = mix(col.edge, col.accent, 0.3);
    b.rbox(col.edge, 0.24, 1.08, 0.24, 0.06, [L / 2, 0.54, 0], null, null, 1);
    b.sph(col.accent, 0.16, [L / 2, 1.16, 0], null, null, 8, 6);
    b.box(rail, L, 0.11, 0.07, [0, 0.34, 0]);
    b.box(rail, L, 0.11, 0.07, [0, 0.72, 0]);
    for (let i = 1; i <= 3; i++) b.rbox(col.edge, 0.22, 0.86 + (i === 2 ? 0.08 : 0), 0.08, 0.035, [L / 2 - (L * i) / 4, 0.45 + (i === 2 ? 0.04 : 0), 0.05], null, null, 1);
    return b.merged();
  })();
  const fence = inst(fenceGeo, shared, SEGS, true, true);
  const postGeo = (() => {
    const b = new Parts();
    b.rbox(col.edge, 0.4, 1.7, 0.4, 0.09, [0, 0.85, 0], null, null, 1);
    b.rbox(col.accent, 0.48, 0.34, 0.48, 0.08, [0, 0.3, 0], null, null, 1);
    b.rbox(col.accent, 0.48, 0.24, 0.48, 0.08, [0, 1.5, 0], null, null, 1);
    b.sph(col.accent2, 0.3, [0, 1.98, 0], null, null, 12, 8);
    b.sph(0xffffff, 0.1, [-0.1, 2.1, -0.12], null, null, 6, 4);
    return b.merged();
  })();
  const posts = inst(postGeo, shared, MAX_GAPS * 2, true, true);
  // a bridge out to a burrow: local +z runs outward, z = 0 at the fence
  const bridgeGeo = (() => {
    const b = new Parts();
    const W = L * GAP_SEGS + 0.5, len = BRIDGE + 1.6;
    const earth = 0x7a4f35;
    b.rbox(col.lane, W, 0.5, len, 0.2, [0, -0.27, len / 2 - 0.2], null, null, 2);
    b.rbox(mix(col.accent, 0x2b1740, 0.34), W - 0.6, 0.5, len - 0.6, 0.2, [0, -0.62, len / 2 - 0.2], null, null, 1);
    for (const sx of [-1, 1]) b.rbox(mix(col.lane, col.accent, 0.5), 0.26, 0.12, len - 1.2, 0.05, [sx * (W / 2 - 0.28), -0.03, len / 2 - 0.2], null, null, 1);
    // the burrow: a mound with a dark mouth
    const bz = BURROW - R;
    b.torus(earth, 1.2, 0.36, [0, 0.02, bz], [Math.PI / 2, 0, 0], [1, 1, 0.8], TAU, 8, 20);
    b.cyl(0x241a3a, 1.2, 1.2, 0.04, [0, 0.0, bz], null, 20);
    b.sph(mix(earth, 0xffffff, 0.2), 0.3, [1.1, 0.12, bz + 0.75], [1, 0.6, 1], null, 7, 5);
    b.sph(mix(earth, 0xffffff, 0.2), 0.22, [-1.25, 0.1, bz + 0.45], [1, 0.6, 1], null, 7, 5);
    return b.merged();
  })();
  const bridges = inst(bridgeGeo, shared, MAX_GAPS, false, false);
  bridges.receiveShadow = true;

  // ---- the pallet and the stockpile
  {
    const b = new Parts();
    const wood = 0xc98f55, woodD = 0xa9743f;
    for (const z of [-1.12, 0, 1.12]) b.box(woodD, 2.8, 0.16, 0.3, [0, 0.08, z]);
    for (let i = 0; i < 6; i++) b.rbox(wood, 0.4, 0.09, 2.8, 0.03, [-1.2 + i * 0.48, 0.2, 0], null, null, 1);
    const pallet = new THREE.Mesh(b.merged(), shared);
    pallet.castShadow = true; pallet.receiveShadow = true;
    root.add(pallet);
  }
  const pile = inst(itemGeometry(theme.item), itemMaterial(theme.item), PILE_CAP, true, true);
  const slots = new Float32Array(PILE_CAP * 3);
  const P = { scale: 1, top: 0.25, perLayer: 1, total: 0 };
  function pileLayout(total) {
    total = Math.min(PILE_CAP, total);
    const w = Math.max(0.2, item.footprint.w), d = Math.max(0.2, item.footprint.d), st = Math.max(0.08, item.step);
    let s = 1.15, cols = 1, rows = 1;
    for (let k = 0; k < 12; k++) {
      cols = Math.max(1, Math.min(5, Math.floor(2.7 / (w * s + 0.05))));
      rows = Math.max(1, Math.min(5, Math.floor(2.7 / (d * s + 0.05))));
      if (Math.ceil(total / (cols * rows)) * st * s <= 2.6 || s <= 0.5) break;
      s -= 0.07;
    }
    P.scale = s; P.perLayer = cols * rows; P.total = total;
    const rnd = rng(4471);
    for (let j = 0; j < total; j++) {
      const layer = Math.floor(j / P.perLayer), k = j % P.perLayer, cx = k % cols, cz = Math.floor(k / cols);
      const x = (cx - (cols - 1) / 2) * (w * s + 0.05), z = (cz - (rows - 1) / 2) * (d * s + 0.05), y = 0.25 + layer * st * s;
      slots[j * 3] = x; slots[j * 3 + 1] = y; slots[j * 3 + 2] = z;
      _e.set(0, (rnd() - 0.5) * 0.12, 0);
      _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(s, s, s));
      pile.setMatrixAt(j, _m);
    }
    pile.instanceMatrix.needsUpdate = true;
  }
  let pileTint = -1;

  // ---- pests, their shadows, what they carry, the big one
  const pests = inst(pestGeometry(dress.pest, false), shared, PEST_CAP, false, true);
  const blobs = inst(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true, opacity: 0.26, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), PEST_CAP, false, false);
  blobs.renderOrder = 2;
  const carried = inst(itemGeometry(theme.item), itemMaterial(theme.item), PEST_CAP, false, false);
  const big = new THREE.Mesh(pestGeometry(mix(dress.pest, 0x3a1f5c, 0.3), true), litMaterial({ vertexColors: true }));
  big.castShadow = true;
  big.frustumCulled = false;
  big.visible = false;
  root.add(big);

  // ---- coins and what the helpers toss
  const coinGeo = (() => {
    const b = new Parts();
    b.cyl(0xf2a900, 0.25, 0.25, 0.08, [0, 0, 0], [Math.PI / 2, 0, 0], 14);
    b.cyl(0xffd84a, 0.18, 0.18, 0.1, [0, 0, 0], [Math.PI / 2, 0, 0], 12);
    return b.merged();
  })();
  const coins = inst(coinGeo, litMaterial({ vertexColors: true, emissive: 0x5a3d00 }), COIN_CAP, false, false);
  const shots = inst(shotGeometry(dress.shot), shared, SHOT_CAP, true, false);

  // ---- helper pads and the helpers
  const pads = [];
  for (let k = 0; k < PAD_COST.length; k++) {
    const t = padTexture();
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3),
      new THREE.MeshBasicMaterial({ map: t.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 3;
    const group = new THREE.Group();
    group.rotation.y = -Math.PI * 0.75;          // texture-up toward the top of the screen
    group.position.y = 0.035;
    group.add(mesh);
    root.add(group);
    const pad = { group, x: 0, z: 0, shown: -1, draw(remaining, frac) {
      const key = remaining * 100 + Math.round(frac * 40);
      if (key === pad.shown) return;
      pad.shown = key;
      drawPad(t.ctx, remaining, frac);
      t.tex.needsUpdate = true;
    } };
    pads.push(pad);
  }
  const turrets = inst(scarecrowGeometry(col), shared, PAD_COST.length, true, false);

  // ---- the hero's reach: a faint ring on the ground and the sweep arcs
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 56).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: mix(col.accent, 0xffffff, 0.2), transparent: true, opacity: 0.5, depthWrite: false }));
  ring.renderOrder = 4;
  ring.position.y = 0.05;
  const arcMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const arc = new THREE.Mesh(arcGeometry(), arcMat);
  arc.renderOrder = 6;
  arc.frustumCulled = false;
  root.add(ring, arc);

  // ---- health bars
  const pileBar = makeBar(BAR_W, 0.3);
  const bigBar = makeBar(BAR_W * 1.25, 0.34);
  root.add(pileBar.group, bigBar.group);

  // ---- per level
  const gapFence = [];             // per gap: the fence instances beside it
  const gapSeg = new Uint8Array(SEGS);
  function layout(level) {
    gapSeg.fill(0);
    for (const g of level.gaps) for (let k = 0; k < GAP_SEGS; k++) gapSeg[(g.seg + k) % SEGS] = 1;
    const index = new Int16Array(SEGS).fill(-1);
    let n = 0;
    const rc = R * Math.cos(Math.PI / SEGS);
    for (let j = 0; j < SEGS; j++) {
      if (gapSeg[j]) continue;
      const am = ((j + 0.5) / SEGS) * TAU;
      _m.compose(_p.set(Math.cos(am) * rc, 0, Math.sin(am) * rc), _q.setFromAxisAngle(UP, Math.PI / 2 - am), _s.set(1, 1, 1));
      fence.setMatrixAt(n, _m);
      fence.setColorAt(n, _c.setRGB(1, 1, 1));
      index[j] = n++;
    }
    fence.count = n;
    fence.instanceMatrix.needsUpdate = true;
    fence.instanceColor.needsUpdate = true;
    gapFence.length = 0;
    let pn = 0, bn = 0;
    for (const g of level.gaps) {
      const near = [];
      for (const j of [g.seg - 2, g.seg - 1, g.seg + GAP_SEGS, g.seg + GAP_SEGS + 1]) { const i = index[((j % SEGS) + SEGS) % SEGS]; if (i >= 0) near.push(i); }
      gapFence.push(near);
      for (const j of [g.seg, g.seg + GAP_SEGS]) {
        const a = (j / SEGS) * TAU;
        _m.compose(_p.set(Math.cos(a) * R, 0, Math.sin(a) * R), _q.setFromAxisAngle(UP, Math.PI / 2 - a), _s.set(1, 1, 1));
        posts.setMatrixAt(pn, _m);
        posts.setColorAt(pn++, _c.setRGB(1, 1, 1));
      }
      _m.compose(_p.set(Math.cos(g.a) * R, 0, Math.sin(g.a) * R), _q.setFromAxisAngle(UP, Math.PI / 2 - g.a), _s.set(1, 1, 1));
      bridges.setMatrixAt(bn++, _m);
    }
    posts.count = pn; bridges.count = bn;
    posts.instanceMatrix.needsUpdate = true; posts.instanceColor.needsUpdate = true;
    bridges.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < pads.length; k++) {
      const a = level.pads[k].a;
      pads[k].x = Math.cos(a) * PAD_R; pads[k].z = Math.sin(a) * PAD_R;
      pads[k].group.position.x = pads[k].x; pads[k].group.position.z = pads[k].z;
    }
    pileLayout(level.total);
    pileTint = -1;
  }

  return {
    root, layout, floor,
    fence, posts, bridges, pile, pests, blobs, carried, big, coins, shots, pads, turrets, ring, arc, arcMat, pileBar, bigBar,
    /** the scale items lie on the pile at; a carried item's scale */
    get pileScale() { return P.scale; },
    carryScale: Math.min(1, 0.62 / Math.max(item.footprint.w, item.footprint.d, 0.2)),
    /** local position of pile slot j (clamped) */
    slot(j, out) { const k = Math.max(0, Math.min(P.total - 1, j)) * 3; return out.set(slots[k], slots[k + 1], slots[k + 2]); },
    /** height of the top of the pile holding n items */
    top(n) { return 0.25 + Math.ceil(Math.max(0, n) / P.perLayer) * item.step * P.scale; },
    setPile(n) { pile.count = Math.max(0, Math.min(P.total, n)); },
    /** v 0..1: the pile glows red */
    tintPile(v) {
      const q = Math.round(v * 8);
      if (q === pileTint) return;
      pileTint = q;
      const t = q / 8;
      _c.setRGB(1 + 0.5 * t, 1 - 0.62 * t, 1 - 0.62 * t);
      for (let i = 0; i < P.total; i++) pile.setColorAt(i, _c);
      pile.instanceColor.needsUpdate = true;
    },
    /** v 0..1: the posts and fence beside gap g glow red */
    tintGap(g, v) {
      _c.setRGB(1 + 0.4 * v, 1 - 0.7 * v, 1 - 0.7 * v);
      const near = gapFence[g];
      if (!near) return;
      for (let i = 0; i < near.length; i++) fence.setColorAt(near[i], _c);
      posts.setColorAt(g * 2, _c); posts.setColorAt(g * 2 + 1, _c);
      fence.instanceColor.needsUpdate = true; posts.instanceColor.needsUpdate = true;
    },
  };
}
