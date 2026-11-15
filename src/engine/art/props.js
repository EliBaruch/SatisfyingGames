// Bloom Rush art kit - props every world needs, built to the shared standard.
//
//   cash:    makeCashBundleGeometry(), makeCoinGeometry()          -> merged geometry (use with getSharedMaterial)
//   counter: makeCounter({ accent, len, depth, h })                -> Group
//   zones:   makeZone({ w, d, label, sub })                        -> Mesh (ground decal, text reads upright on screen)
//   ground:  makeGround('grass'|'wood'|'tile'|'paving'|'soil', w, d, opts) -> Mesh;  groundTexture(kind) -> CanvasTexture
//   scenery: tree(), bush(), rock(), fence(len), flowerPot()       -> Mesh (one draw call each; preload SCENERY_IDS)
import * as THREE from 'three';
import { Parts, meshOf } from './parts.js';
import { getGeometry, getSharedMaterial } from './assets.js';
import { litMaterial, LIGHTING } from './material.js';

// ------------------------------------------------------------------- money ---
/** Default cash-bundle dimensions: chunky, readable from the camera. Stack step = h. */
export const CASH = { len: 0.62, h: 0.16, d: 0.38 };

/** A chunky bundle of banknotes: banded green layers, a paper band, a printed top note. Origin bottom-centre. */
export function makeCashBundleGeometry({ len = CASH.len, h = CASH.h, d = CASH.d } = {}) {
  const b = new Parts();
  const layers = [0x3dbb58, 0x31a64c, 0x45c862, 0x33ab4f];
  const lh = h / layers.length;
  layers.forEach((c, i) => b.rbox(c, len - (i % 2) * 0.012, lh + 0.004, d - (i % 2) * 0.012, 0.018, [0, lh * (i + 0.5), 0], null, null, 1));
  // printed top note and emblem
  b.rbox(0x58cf74, len * 0.9, 0.012, d * 0.84, 0.006, [0, h + 0.002, 0], null, null, 1);
  b.cyl(0xc8f0b0, d * 0.2, d * 0.2, 0.014, [0.0, h + 0.012, 0], null, 18);
  b.cyl(0x3dbb58, d * 0.12, d * 0.12, 0.016, [0.0, h + 0.014, 0], null, 14);
  // paper band
  b.rbox(0xf7f0d6, len * 0.24, h + 0.02, d + 0.02, 0.014, [0, h / 2, 0], null, null, 1);
  b.rbox(0xe05d4f, len * 0.24 + 0.002, 0.03, d + 0.024, 0.01, [0, h * 0.62, 0], null, null, 1);
  return b.merged({ ao: { ground: 0.18, groundH: 0.1, down: 0.1, noBoxes: true } });
}

/** A gold coin lying flat (axis Y), origin at its bottom centre. */
export function makeCoinGeometry({ r = 0.2, h = 0.055 } = {}) {
  const b = new Parts();
  b.rcyl(0xf5b21f, r, h, 0.018, [0, h / 2, 0], null, 24);
  b.rcyl(0xffd54a, r * 0.8, h + 0.012, 0.01, [0, h / 2, 0], null, 24);
  b.rcyl(0xf5b21f, r * 0.5, h + 0.016, 0.008, [0, h / 2, 0], null, 18);
  return b.merged();
}

// ----------------------------------------------------------------- counter ---
/**
 * A rounded shop counter. Long axis = Z, customer side = local +X, total height `h`. Origin on the floor
 * at its centre. opts: { len = 3.4, depth = 1.2, h = 1.0, accent = 0xff6fa5, wood = 0xc98a4b,
 * top = 0xfff3d6, register = true }.
 */
export function makeCounter({ len = 3.4, depth = 1.2, h = 1.0, accent = 0xff6fa5, wood = 0xc98a4b, top = 0xfff3d6, register = true } = {}) {
  const g = new THREE.Group();
  const b = new Parts();
  const D = depth, L = len;
  const bodyH = h - 0.28;
  b.rbox(0xe9dcc3, D + 0.12, 0.14, L + 0.12, 0.05, [0, 0.07, 0]);                    // stone plinth
  b.rbox(wood, D, bodyH, L, 0.07, [0, 0.14 + bodyH / 2 - 0.04, 0]);                  // wooden body
  b.rbox(accent, D + 0.1, 0.1, L + 0.1, 0.04, [0, h - 0.13, 0]);                     // accent trim band
  b.rbox(top, D + 0.04, 0.09, L + 0.04, 0.04, [0, h - 0.045, 0]);                    // cream top
  const n = Math.max(2, Math.round(L / 1.08));
  const pw = (L - 0.3) / n - 0.16;
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + 0.15 + (L - 0.3) * (i + 0.5) / n;
    for (const sx of [-1, 1]) {
      b.rbox(0xe3a766, 0.05, bodyH - 0.22, pw + 0.1, 0.02, [sx * (D / 2 + 0.005), 0.14 + bodyH / 2 - 0.04, z], null, null, 1);
      b.rbox(accent, 0.05, bodyH - 0.32, pw, 0.02, [sx * (D / 2 + 0.02), 0.14 + bodyH / 2 - 0.04, z], null, null, 1);
      b.rbox(0xfff0d0, 0.05, bodyH - 0.45, pw - 0.1, 0.02, [sx * (D / 2 + 0.035), 0.14 + bodyH / 2 - 0.04, z], null, null, 1);
    }
  }
  if (register) {
    const z0 = L / 2 - 0.45;
    b.rbox(0x3b4458, 0.52, 0.2, 0.44, 0.04, [-0.05, h + 0.1, z0]);
    b.rbox(0x5a6578, 0.46, 0.08, 0.38, 0.03, [-0.05, h + 0.24, z0]);
    b.rbox(0x58e0c4, 0.05, 0.24, 0.32, 0.02, [0.1, h + 0.37, z0], [0, 0, -0.35]);
    b.rbox(0xffd23f, 0.2, 0.05, 0.36, 0.02, [0.28, h + 0.04, z0]);
    b.sph(0xffd23f, 0.075, [-0.3, h + 0.04, z0 - 0.5], [1, 0.8, 1]);
  }
  g.add(meshOf(b.merged({ ao: { ground: 0.2, groundH: 0.3, down: 0.12, boxK: 0.2 } }), { receive: true }));
  g.userData.size = { len, depth, h };
  return g;
}

// ------------------------------------------------------------------- zones ---
function roundRectPath(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawZone(ctx, W, H, o) {
  ctx.clearRect(0, 0, W, H);
  const m = 14, r = Math.min(W, H) * 0.14;
  // soft fill
  roundRectPath(ctx, m, m, W - 2 * m, H - 2 * m, r);
  ctx.fillStyle = o.fill;
  ctx.fill();
  // glowing dashed outline
  ctx.save();
  ctx.lineWidth = 9;
  ctx.setLineDash([26, 18]);
  ctx.lineCap = 'round';
  ctx.shadowColor = o.line;
  ctx.shadowBlur = 22;
  ctx.strokeStyle = '#ffffff';
  roundRectPath(ctx, m + 6, m + 6, W - 2 * m - 12, H - 2 * m - 12, r - 4);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = o.line;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  // label
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const big = Math.min(H * 0.34, W * 0.2);
  const fit = (txt, size) => { ctx.font = `800 ${size}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`; while (ctx.measureText(txt).width > W * 0.82 && size > 16) { size -= 2; ctx.font = `800 ${size}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`; } return size; };
  const text = (txt, y, size, fillStyle) => {
    size = fit(txt, size);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, size * 0.16);
    ctx.strokeStyle = 'rgba(20,50,70,0.85)';
    ctx.strokeText(txt, W / 2, y);
    ctx.fillStyle = fillStyle;
    ctx.fillText(txt, W / 2, y);
  };
  if (o.sub) { text(o.label, H * 0.42, big, '#ffffff'); text(o.sub, H * 0.72, big * 0.62, o.subColor); }
  else text(o.label, H * 0.5, big, '#ffffff');
}

/**
 * A ground decal: rounded rectangle with a glowing cyan-white dashed outline and bold label text.
 * The text reads upright from the game camera (its "up" points toward world +x,+z).
 * Lies at y = 0.04 and ignores lighting (always bright). opts: { w = 3, d = 2.4, label, sub, color = '#7defff',
 * fill = 'rgba(40,150,190,0.28)', subColor = '#ffe27a', px = 170 (pixels per world unit) }.
 * mesh.userData.setLabel(label, sub) redraws; mesh.userData.setActive(bool) brightens.
 */
export function makeZone(opts = {}) {
  const o = { w: 3, d: 2.4, label: '', sub: '', color: '#7defff', fill: 'rgba(40,150,190,0.28)', subColor: '#ffe27a', px: 170, ...opts };
  const W = Math.round(o.w * o.px), H = Math.round(o.d * o.px);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const state = { label: o.label, sub: o.sub };
  const redraw = () => { drawZone(ctx, W, H, { ...o, line: o.color, label: state.label, sub: state.sub }); tex.needsUpdate = true; };
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.d), mat);
  // canvas up (+Y of the plane) -> world (+x,+z); plane normal -> +Y
  mesh.rotation.set(-Math.PI / 2, -3 * Math.PI / 4, 0, 'YXZ');
  mesh.position.y = 0.04;
  mesh.renderOrder = 2;
  mesh.name = 'zone:' + o.label;
  redraw();
  mesh.userData.setLabel = (label, sub = '') => { state.label = label; state.sub = sub; redraw(); };
  mesh.userData.setActive = (on) => { mat.opacity = on ? 1 : 0.8; };
  mesh.userData.size = { w: o.w, d: o.d };
  return mesh;
}

// ---------------------------------------------------------- ground textures ---
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const hex = (c) => '#' + new THREE.Color(c).getHexString();
function shade(c, k) { const t = new THREE.Color(c); t.offsetHSL(0, 0, k); return '#' + t.getHexString(); }

/** draw `fn(dx, dy)` at the 9 wrapped offsets so texture tiles seamlessly */
function wrapDraw(S, fn) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); }

const GROUND_KINDS = {
  // world units covered by one texture repeat; draw(ctx, S, rnd, colors)
  grass: {
    tile: 6, base: 0x6cc24a,
    draw(c, S, r, base) {
      c.fillStyle = hex(base); c.fillRect(0, 0, S, S);
      for (let i = 0; i < 70; i++) {
        const x = r() * S, y = r() * S, rad = S * (0.06 + r() * 0.14);
        const col = shade(base, (r() - 0.5) * 0.07);
        wrapDraw(S, (dx, dy) => {
          const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          g.addColorStop(0, col + 'cc'); g.addColorStop(1, col + '00');
          c.fillStyle = g; c.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        });
      }
      c.lineCap = 'round';
      for (let i = 0; i < 260; i++) {
        const x = r() * S, y = r() * S, l = 4 + r() * 7, a = -Math.PI / 2 + (r() - 0.5) * 1.1;
        c.strokeStyle = shade(base, (r() - 0.35) * 0.12) + 'aa'; c.lineWidth = 1.6;
        wrapDraw(S, (dx, dy) => { c.beginPath(); c.moveTo(x + dx, y + dy); c.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); c.stroke(); });
      }
    },
  },
  wood: {
    tile: 4, base: 0xd9a066,
    draw(c, S, r, base) {
      const planks = 8, ph = S / planks;
      for (let i = 0; i < planks; i++) {
        const y = i * ph;
        const seg = 2; // staggered butt joints
        const off = r() * S;
        for (let k = 0; k < seg; k++) {
          const x0 = (off + (k * S) / seg) % S, w = S / seg;
          const col = shade(base, (r() - 0.5) * 0.09);
          wrapDraw(S, (dx, dy) => {
            if (dy !== 0) return;
            c.fillStyle = col; c.fillRect(x0 + dx, y, w, ph);
            c.fillStyle = 'rgba(80,40,10,0.35)'; c.fillRect(x0 + dx, y, 3, ph);
          });
        }
        c.fillStyle = 'rgba(90,50,15,0.45)'; c.fillRect(0, y, S, 3);
        c.fillStyle = 'rgba(255,235,200,0.25)'; c.fillRect(0, y + 3, S, 2);
        for (let k = 0; k < 6; k++) { // grain
          c.strokeStyle = 'rgba(110,60,20,0.18)'; c.lineWidth = 1;
          const gy = y + 6 + r() * (ph - 12); c.beginPath(); c.moveTo(r() * S, gy); c.lineTo(r() * S, gy + (r() - 0.5) * 3); c.stroke();
        }
      }
    },
  },
  tile: {
    tile: 4, base: 0xf4efe6,
    draw(c, S, r, base) {
      const n = 4, ts = S / n;
      c.fillStyle = '#d8d2c6'; c.fillRect(0, 0, S, S);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const col = (i + j) % 2 ? shade(base, -0.015) : shade(base, 0.02);
        c.fillStyle = col; roundRectPath(c, i * ts + 3, j * ts + 3, ts - 6, ts - 6, 6); c.fill();
        const g = c.createLinearGradient(i * ts, j * ts, (i + 1) * ts, (j + 1) * ts);
        g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.04)');
        c.fillStyle = g; roundRectPath(c, i * ts + 3, j * ts + 3, ts - 6, ts - 6, 6); c.fill();
      }
    },
  },
  paving: {
    tile: 4, base: 0xd9cdb8,
    draw(c, S, r, base) {
      c.fillStyle = '#a89c88'; c.fillRect(0, 0, S, S);
      const rows = 6, bh = S / rows;
      for (let j = 0; j < rows; j++) {
        const cols = 3, bw = S / cols, off = (j % 2) * bw / 2;
        for (let i = -1; i < cols + 1; i++) {
          const x = i * bw + off, y = j * bh;
          c.fillStyle = shade(base, (r() - 0.5) * 0.1);
          wrapDraw(S, (dx, dy) => { if (dy) return; roundRectPath(c, x + 3 + dx, y + 3, bw - 6, bh - 6, 8); c.fill(); });
        }
      }
    },
  },
  soil: {
    tile: 3, base: 0x8a5a36,
    draw(c, S, r, base) {
      c.fillStyle = hex(base); c.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        const x = r() * S, y = r() * S, rad = S * (0.05 + r() * 0.1), col = shade(base, (r() - 0.5) * 0.1);
        wrapDraw(S, (dx, dy) => { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad); g.addColorStop(0, col + 'cc'); g.addColorStop(1, col + '00'); c.fillStyle = g; c.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2); });
      }
      for (let i = 0; i < 220; i++) { c.fillStyle = shade(base, (r() - 0.5) * 0.18); const x = r() * S, y = r() * S; c.beginPath(); c.arc(x, y, 1 + r() * 2.2, 0, 7); c.fill(); }
    },
  },
};

const _gt = new Map();
/**
 * Tileable canvas texture for a ground kind: 'grass' | 'wood' | 'tile' | 'paving' | 'soil'.
 * opts: { color (base colour, pre-grade sRGB), size (canvas px, default 256), seed }. Cached per key.
 * texture.userData.tile = world units covered by one repeat.
 */
export function groundTexture(kind, { color, size = 256, seed = 7 } = {}) {
  const K = GROUND_KINDS[kind];
  if (!K) throw new Error('unknown ground kind ' + kind);
  const base = color ?? (K.base === GROUND_KINDS.grass.base ? LIGHTING.ground.grass : K.base);
  const key = `${kind}|${new THREE.Color(base).getHexString()}|${size}|${seed}`;
  let t = _gt.get(key);
  if (t) return t;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  K.draw(canvas.getContext('2d'), size, rng(seed), base);
  t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.tile = K.tile;
  _gt.set(key, t);
  return t;
}

/**
 * A lit ground plane (receives shadows) covering x in [0,w] z in [0,d]... centred on the origin:
 * `makeGround('grass', 120, 120)`. opts: { color, tile (world units per repeat), y, seed }.
 */
export function makeGround(kind, w, d, opts = {}) {
  const tex = groundTexture(kind, opts).clone();
  tex.needsUpdate = true;
  const tile = opts.tile || tex.userData.tile || 4;
  tex.repeat.set(w / tile, d / tile);
  const mat = litMaterial({ map: tex });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = opts.y || 0;
  m.receiveShadow = true;
  m.name = 'ground:' + kind;
  return m;
}

// ---------------------------------------------------------------- scenery ---
/** Model ids the scenery helpers need: preload(SCENERY_IDS) before calling them. */
export const SCENERY_IDS = [
  'nature-kit/tree_default', 'nature-kit/tree_oak', 'nature-kit/tree_fat', 'nature-kit/tree_small', 'nature-kit/tree_pineTallA',
  'nature-kit/plant_bush', 'nature-kit/plant_bushLarge', 'nature-kit/plant_bushDetailed',
  'nature-kit/rock_largeA', 'nature-kit/rock_largeD', 'nature-kit/rock_smallA', 'nature-kit/rock_smallD', 'nature-kit/rock_tallA',
  'nature-kit/pot_large', 'nature-kit/pot_small', 'nature-kit/flower_redA', 'nature-kit/flower_yellowA', 'nature-kit/flower_purpleA',
  'nature-kit/fence_simple', 'nature-kit/fence_planks', 'nature-kit/grass', 'mini-forest/tree', 'mini-forest/tree-high',
];

const TREES = { round: 'nature-kit/tree_default', oak: 'nature-kit/tree_oak', fat: 'nature-kit/tree_fat', small: 'nature-kit/tree_small', pine: 'nature-kit/tree_pineTallA', forest: 'mini-forest/tree', tall: 'mini-forest/tree-high' };
const BUSHES = { plain: 'nature-kit/plant_bush', large: 'nature-kit/plant_bushLarge', detailed: 'nature-kit/plant_bushDetailed' };
const ROCKS = { large: 'nature-kit/rock_largeA', big: 'nature-kit/rock_largeD', small: 'nature-kit/rock_smallA', pebble: 'nature-kit/rock_smallD', tall: 'nature-kit/rock_tallA' };

/** A tree. opts: { kind: 'round'|'oak'|'fat'|'small'|'pine'|'forest'|'tall', height = 4.2, rotY }. */
export function tree({ kind = 'round', height = 4.2, rotY = 0 } = {}) {
  return meshOf(getGeometry(TREES[kind] || TREES.round, { height, rotY, ao: { ground: 0.12, groundH: 0.5, down: 0.1, noBoxes: true } }));
}
/** A bush. opts: { kind: 'plain'|'large'|'detailed', width = 1.4, rotY }. */
export function bush({ kind = 'plain', width = 1.4, rotY = 0 } = {}) {
  return meshOf(getGeometry(BUSHES[kind] || BUSHES.plain, { width, rotY, ao: { ground: 0.2, groundH: 0.3, down: 0.1, noBoxes: true } }));
}
/** A rock. opts: { kind: 'large'|'big'|'small'|'pebble'|'tall', width = 1.6, rotY }. */
export function rock({ kind = 'large', width = 1.6, rotY = 0 } = {}) {
  return meshOf(getGeometry(ROCKS[kind] || ROCKS.large, { width, rotY, ao: { ground: 0.15, groundH: 0.25, down: 0.05, noBoxes: true } }));
}

/**
 * A fence along +X from x = 0 to x = len (origin at the left end, ground level), one merged mesh.
 * opts: { style: 'simple'|'planks', h = 1.0 }.
 */
export function fence(len, { style = 'simple', h = 1.0 } = {}) {
  const id = style === 'planks' ? 'nature-kit/fence_planks' : 'nature-kit/fence_simple';
  const b = new Parts();
  const seg = getGeometry(id, { natural: true });
  const sx = seg.userData.size.x || 1, sy = seg.userData.size.y || 0.34;
  const n = Math.max(1, Math.round(len / (sx * (h / sy))));
  const kx = len / n / sx, ky = h / sy;
  for (let i = 0; i < n; i++) b.add(seg, 0xffffff, [(i + 0.5) * (len / n), 0, 0], null, [kx, ky, ky], true);
  return meshOf(b.merged({ ao: { ground: 0.15, groundH: 0.2, down: 0.05, noBoxes: true } }));
}

/** A flower pot with a bloom, one merged mesh ~0.8 tall. opts: { flower: 'red'|'yellow'|'purple', size = 1 }. */
export function flowerPot({ flower = 'red', size = 1 } = {}) {
  const b = new Parts();
  b.model('nature-kit/pot_large', { height: 0.5 * size, pos: [0, 0, 0] });
  const f = { red: 'nature-kit/flower_redA', yellow: 'nature-kit/flower_yellowA', purple: 'nature-kit/flower_purpleA' }[flower] || 'nature-kit/flower_redA';
  for (const [x, z, k] of [[0, 0, 1], [0.16, 0.05, 0.8], [-0.14, -0.08, 0.85]]) b.model(f, { height: 0.5 * size * k, pos: [x * size, 0.42 * size, z * size] });
  return meshOf(b.merged({ ao: { ground: 0.15, groundH: 0.15, down: 0.08, noBoxes: true } }));
}

export { getSharedMaterial };
