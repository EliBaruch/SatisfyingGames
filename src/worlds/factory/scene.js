// Volt Works scenery. First pass: grounds (grass, concrete, dirt yard, road), the garage walls.
import * as THREE from 'three';
import { Parts as ArtParts, meshOf } from '../../engine/art/parts.js';
import { litMaterial } from '../../engine/art/material.js';
import { canvasTex } from '../../engine/decals.js';
import { rng } from '../../engine/geom.js';

class Parts extends ArtParts {
  rbox(c, w, h, d, r, pos, rot, scl, seg = 1) { return super.rbox(c, w, h, d, r, pos, rot, scl, seg); }
}

// ---------------------------------------------------------------- textures
// Tileable 512 px canvases. Colours are pre-grade (the look lifts mid-tones), so they are written darker.
function wrap(S, fn) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); }
function speckle(ctx, S, R, n, colors, rmin, rmax, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = rmin + R() * (rmax - rmin);
    ctx.fillStyle = colors[(R() * colors.length) | 0];
    wrap(S, (dx, dy) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 6.283); ctx.fill(); });
  }
  ctx.globalAlpha = 1;
}
function blotches(ctx, S, R, n, colors, rmin, rmax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = rmin + R() * (rmax - rmin);
    const c = colors[(R() * colors.length) | 0];
    wrap(S, (dx, dy) => {
      const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = alpha; ctx.fillStyle = g;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
  ctx.globalAlpha = 1;
}
const TEX = {
  grass: () => canvasTex(512, 512, (ctx, S) => {
    const R = rng(11);
    ctx.fillStyle = '#58a63c'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, R, 26, ['#6dbb45', '#4b9836', '#74c24e', '#3f8c31'], 40, 120, 0.5);
    // blades: short strokes in darker and lighter greens
    ctx.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      const x = R() * S, y = R() * S, l = 5 + R() * 9, a = -1.2 - R() * 0.8;
      ctx.strokeStyle = ['#3c8a2e', '#7fcf55', '#49a039', '#8fd963', '#35802a'][(R() * 5) | 0];
      ctx.lineWidth = 1.6 + R() * 1.6; ctx.globalAlpha = 0.75;
      wrap(S, (dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); ctx.stroke(); });
    }
    ctx.globalAlpha = 1;
    speckle(ctx, S, R, 26, ['#f4f1d0', '#ffe27a', '#ffffff'], 1.6, 2.8, 0.9);      // tiny flowers
    speckle(ctx, S, R, 12, ['#b9b29a', '#9d977f'], 3, 6, 0.8);                      // pebbles
  }, { repeat: true }),
  concrete: () => canvasTex(512, 512, (ctx, S) => {
    const R = rng(23);
    ctx.fillStyle = '#b1b6bd'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, R, 30, ['#c2c7ce', '#a0a6ae', '#b9b3a8', '#9aa1aa'], 50, 150, 0.45);
    speckle(ctx, S, R, 900, ['#8f959d', '#cfd4da', '#7f858d'], 0.5, 1.5, 0.5);
    // scuffs and tyre marks
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const x = R() * S, y = R() * S, l = 60 + R() * 160, a = R() * 6.283;
      ctx.strokeStyle = '#6f757d'; ctx.globalAlpha = 0.1 + R() * 0.1; ctx.lineWidth = 5 + R() * 9;
      wrap(S, (dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.quadraticCurveTo(x + dx + Math.cos(a) * l * 0.5 + 20, y + dy + Math.sin(a) * l * 0.5, x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); ctx.stroke(); });
    }
    ctx.globalAlpha = 1;
    // expansion joints: one slab per tile
    ctx.strokeStyle = '#7b8189'; ctx.lineWidth = 5; ctx.globalAlpha = 0.8;
    ctx.strokeRect(0, 0, S, S);
    ctx.strokeStyle = '#d6dae0'; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
    ctx.strokeRect(4, 4, S - 8, S - 8);
    ctx.globalAlpha = 1;
  }, { repeat: true }),
  asphalt: () => canvasTex(512, 512, (ctx, S) => {
    const R = rng(31);
    ctx.fillStyle = '#4a4f59'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, R, 24, ['#565c67', '#40454e', '#5d636e'], 50, 140, 0.5);
    speckle(ctx, S, R, 1600, ['#6b717c', '#383c44', '#7b818c'], 0.6, 1.8, 0.6);
  }, { repeat: true }),
  dirt: () => canvasTex(512, 512, (ctx, S) => {
    const R = rng(41);
    ctx.fillStyle = '#b08a58'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, R, 30, ['#c29c68', '#9c784a', '#b9925e', '#8f6c42'], 40, 130, 0.5);
    speckle(ctx, S, R, 700, ['#8a6840', '#cfab78', '#7d5d38'], 0.8, 2.4, 0.6);
    speckle(ctx, S, R, 40, ['#8d949e', '#a6adb6', '#6f7782'], 3, 7, 0.9);            // stones
    speckle(ctx, S, R, 20, ['#b7653a', '#9c5530'], 2, 5, 0.8);                        // rust flakes
  }, { repeat: true }),
};
const texCache = new Map();
function tex(kind) { let t = texCache.get(kind); if (!t) { t = TEX[kind](); texCache.set(kind, t); } return t; }

/** A lit, shadow-receiving ground rectangle [x0, x1] x [z0, z1] with a tiling texture (tile = world units per repeat). */
function ground(kind, x0, x1, z0, z1, tile, y = 0) {
  const w = x1 - x0, d = z1 - z0;
  const t = tex(kind).clone(); t.needsUpdate = true;
  t.repeat.set(w / tile, d / tile);
  t.offset.set((x0 / tile) % 1, (-z1 / tile) % 1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), litMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  m.matrixAutoUpdate = false; m.updateMatrix();
  return m;
}

export function createScene(G) {
  const LAY = G.world.layout;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'factory';
  scene.add(root);
  const GA = LAY.garage, Y = LAY.yard;
  const RZ = LAY.roadZ;

  // ============================================================ ground =====
  root.add(ground('grass', -140, 180, -120, 160, 9, -0.03));
  root.add(ground('concrete', GA.minX, GA.maxX, GA.minZ, GA.maxZ, 4, 0));
  // the scrap yard: packed dirt with a raised kerb
  const yx0 = Y.x0 - 1.4, yx1 = Y.x0 + (Y.cols - 1) * Y.dx + 1.4, yz0 = Y.z0 - 1.4, yz1 = Y.z0 + (Y.rows - 1) * Y.dz + 1.4;
  root.add(ground('dirt', yx0, yx1, yz0, yz1, 6, 0.004));
  // road
  root.add(ground('asphalt', -140, 180, RZ - 3.6, RZ + 3.0, 7, 0.002));
  {
    const kp = new Parts();
    const K = 0x9aa3ad;
    kp.rbox(K, yx1 - yx0 + 0.5, 0.2, 0.34, 0.07, [(yx0 + yx1) / 2, 0.09, yz0 - 0.1]);
    kp.rbox(K, yx1 - yx0 + 0.5, 0.2, 0.34, 0.07, [(yx0 + yx1) / 2, 0.09, yz1 + 0.1]);
    kp.rbox(K, 0.34, 0.2, yz1 - yz0 + 0.5, 0.07, [yx0 - 0.1, 0.09, (yz0 + yz1) / 2]);
    const m = meshOf(kp.merged(), { receive: true });
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }

  // ============================================================ garage walls
  {
    const wp = new Parts();
    const H = 3.4, T = 0.4;
    const WALL = 0xe9edf2, BAND = 0x2f7fe0, BASE = 0x8d97a5;
    // +z wall
    wp.rbox(WALL, GA.maxX - GA.minX + T, H, T, 0.05, [(GA.minX + GA.maxX) / 2 + T / 2, H / 2, GA.maxZ + T / 2]);
    wp.rbox(BASE, GA.maxX - GA.minX + T + 0.06, 0.7, T + 0.08, 0.04, [(GA.minX + GA.maxX) / 2 + T / 2, 0.35, GA.maxZ + T / 2]);
    wp.rbox(BAND, GA.maxX - GA.minX + T + 0.06, 0.34, T + 0.08, 0.04, [(GA.minX + GA.maxX) / 2 + T / 2, H - 0.5, GA.maxZ + T / 2]);
    // +x wall
    wp.rbox(WALL, T, H, GA.maxZ - GA.minZ, 0.05, [GA.maxX + T / 2, H / 2, (GA.minZ + GA.maxZ) / 2]);
    wp.rbox(BASE, T + 0.08, 0.7, GA.maxZ - GA.minZ + 0.06, 0.04, [GA.maxX + T / 2, 0.35, (GA.minZ + GA.maxZ) / 2]);
    wp.rbox(BAND, T + 0.08, 0.34, GA.maxZ - GA.minZ + 0.06, 0.04, [GA.maxX + T / 2, H - 0.5, (GA.minZ + GA.maxZ) / 2]);
    const m = meshOf(wp.merged({ ao: { ground: 0.14, groundH: 0.5, noBoxes: true } }), { receive: true });
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }

  return { update() {} };
}
