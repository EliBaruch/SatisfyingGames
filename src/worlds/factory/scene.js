// Volt Works scenery. Textured grounds (grass, sealed concrete, yard dirt, asphalt), the halls that
// open stage by stage (floor, markings, outer walls, decor), machine housings for the stations,
// robot arms, order bubbles over the trucks, the solar roof and the finale sign.
// Per-station furniture appears through G.stations.onOpen(id, fn(live)); stage reveals, zoom and
// bounds through G.pads.onDone(padId, fn(live)).
import * as THREE from 'three';
import { Parts as ArtParts } from '../../engine/art/parts.js';
import { litMaterial, getGlossMaterial, getSharedMaterial } from '../../engine/art/material.js';
import { getGeometry, nodePosition } from '../../engine/art/assets.js';
import { canvasTex, roundRect as rr, makeDropDecal } from '../../engine/decals.js';
import { rng } from '../../engine/geom.js';

class Parts extends ArtParts {
  rbox(c, w, h, d, r, pos, rot, scl, seg = 1) { return super.rbox(c, w, h, d, r, pos, rot, scl, seg); }
}

const TAU = Math.PI * 2;
const C = {
  wall: 0xe6ebf1, wallDark: 0xcfd6df, base: 0x7d8796, band: 0x2f7fe0, cap: 0xf7f9fb, glass: 0x9fd8ff, frame: 0xf7f9fb,
  steel: 0x9aa5b4, dark: 0x3d4654, yellow: 0xf2b632, orange: 0xff8a2a, red: 0xe4474f, lav: 0x8f97d1, lavDark: 0x6f77b3,
  wood: 0xc08a52, woodDark: 0x9a6a3c, blue: 0x2f8df0, green: 0x39c98a, white: 0xf4f6f8,
};

// ---------------------------------------------------------------- textures
// Tileable 512 px canvases. Colours are pre-grade (the look lifts mid-tones), so they are written darker.
function wrap(S, fn) { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy); }
function speckle(ctx, S, R, n, colors, rmin, rmax, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = R() * S, y = R() * S, r = rmin + R() * (rmax - rmin);
    ctx.fillStyle = colors[(R() * colors.length) | 0];
    wrap(S, (dx, dy) => { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); });
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
    ctx.lineCap = 'round';
    for (let i = 0; i < 1500; i++) {
      const x = R() * S, y = R() * S, l = 5 + R() * 9, a = -1.2 - R() * 0.8;
      ctx.strokeStyle = ['#3c8a2e', '#7fcf55', '#49a039', '#8fd963', '#35802a'][(R() * 5) | 0];
      ctx.lineWidth = 1.6 + R() * 1.6; ctx.globalAlpha = 0.75;
      wrap(S, (dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); ctx.stroke(); });
    }
    ctx.globalAlpha = 1;
    speckle(ctx, S, R, 26, ['#f4f1d0', '#ffe27a', '#ffffff'], 1.6, 2.8, 0.9);
    speckle(ctx, S, R, 12, ['#b9b29a', '#9d977f'], 3, 6, 0.8);
  }, { repeat: true }),
  concrete: () => canvasTex(512, 512, (ctx, S) => {
    const R = rng(23);
    ctx.fillStyle = '#b9bec5'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, R, 10, ['#c3c8cf', '#b1b7bf', '#bdb9b1'], 110, 240, 0.13);
    speckle(ctx, S, R, 700, ['#a0a6ae', '#cfd4da', '#959ba3'], 0.5, 1.3, 0.35);
    ctx.lineCap = 'round';
    for (let i = 0; i < 10; i++) {
      const x = R() * S, y = R() * S, l = 60 + R() * 160, a = R() * TAU;
      ctx.strokeStyle = '#7d838b'; ctx.globalAlpha = 0.05 + R() * 0.05; ctx.lineWidth = 5 + R() * 9;
      wrap(S, (dx, dy) => { ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.quadraticCurveTo(x + dx + Math.cos(a) * l * 0.5 + 20, y + dy + Math.sin(a) * l * 0.5, x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); ctx.stroke(); });
    }
    ctx.globalAlpha = 0.6; ctx.strokeStyle = '#8b9199'; ctx.lineWidth = 4; ctx.strokeRect(0, 0, S, S);
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#d6dae0'; ctx.lineWidth = 2; ctx.strokeRect(3.5, 3.5, S - 7, S - 7);
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
    ctx.fillStyle = '#a8845a'; ctx.fillRect(0, 0, S, S);
    blotches(ctx, S, R, 30, ['#b9955f', '#967448', '#b08b58', '#8a6840'], 40, 130, 0.5);
    speckle(ctx, S, R, 700, ['#84633c', '#c7a373', '#775836'], 0.8, 2.4, 0.6);
    speckle(ctx, S, R, 40, ['#8d949e', '#a6adb6', '#6f7782'], 3, 7, 0.9);
    speckle(ctx, S, R, 20, ['#b7653a', '#9c5530'], 2, 5, 0.8);
  }, { repeat: true }),
  hazard: () => canvasTex(128, 128, (ctx, S) => {
    ctx.fillStyle = '#f2b632'; ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#2b3038';
    for (let x = -S; x < S * 2; x += 64) { ctx.beginPath(); ctx.moveTo(x, S); ctx.lineTo(x + 32, S); ctx.lineTo(x + 32 + S, 0); ctx.lineTo(x + S, 0); ctx.fill(); }
  }, { repeat: true }),
};
const texCache = new Map();
function tex(kind) { let t = texCache.get(kind); if (!t) { t = TEX[kind](); texCache.set(kind, t); } return t; }

/** A lit, shadow-receiving ground rectangle [x0, x1] x [z0, z1] with a tiling texture (tile = world units per repeat). */
function ground(kind, x0, x1, z0, z1, tile, y = 0) {
  const w = x1 - x0, d = z1 - z0;
  const t = tex(kind).clone(); t.needsUpdate = true;
  t.repeat.set(w / tile, d / tile);
  t.offset.set(((x0 / tile) % 1 + 1) % 1, ((-z1 / tile) % 1 + 1) % 1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), litMaterial({ map: t }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = true;
  return m;
}

/** A sign texture: bold lines on a rounded plate. */
function signTex(lines, bg, w = 512, h = 192, rim = '#ffffff') {
  return canvasTex(w, h, (ctx) => {
    rr(ctx, 6, 6, w - 12, h - 12, Math.min(h * 0.24, 40));
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = rim; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const n = lines.length;
    lines.forEach((ln, i) => {
      let size = ln.size || Math.round((h * 0.56) / (n > 1 ? 1.25 : 1));
      ctx.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`;
      while (ctx.measureText(ln.text).width > w * 0.86 && size > 14) { size -= 2; ctx.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`; }
      const y = (h / (n + 1)) * (i + 1) + (ln.dy || 0);
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = ln.stroke || 'rgba(0,0,0,0.3)'; ctx.strokeText(ln.text, w / 2, y);
      ctx.fillStyle = ln.color || '#ffffff'; ctx.fillText(ln.text, w / 2, y);
    });
  });
}
/** A flat sign facing -z (yaw 0) or -x (yaw = -PI/2): both face the camera side. */
function sign(texture, w, h, x, y, z, faceX = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: texture, transparent: true }));
  m.position.set(x, y, z);
  m.rotation.y = faceX ? -Math.PI / 2 : Math.PI;
  return m;
}

export function createScene(G) {
  const LAY = G.world.layout;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'factory';
  scene.add(root);
  const Y = LAY.yard, RZ = LAY.roadZ;
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const pop = (obj, scale = 1.12) => { if (G.fx && G.fx.pop && obj) G.fx.pop(obj, { scale, dur: 0.3 }); };
  const AO = { ground: 0.2, groundH: 0.5, down: 0.08, noBoxes: true };
  /** merged static mesh from a Parts (vertex colours); gloss > 0 picks the glossy material */
  const solid = (parts, { gloss = 0, ao = AO, cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(parts.merged(ao ? { ao } : undefined), gloss > 0 ? getGlossMaterial(gloss, 44) : getSharedMaterial());
    m.castShadow = cast; m.receiveShadow = receive;
    return m;
  };
  const place = (o, x, y, z, yaw = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };
  const animated = [];

  // ============================================================ always there
  {
    root.add(ground('grass', -150, 190, -130, 170, 9, -0.03));
    // the road and its apron
    root.add(ground('asphalt', -150, 190, RZ - 3.8, RZ + 2.2, 7, 0.002));
    root.add(ground('concrete', -6, 60, RZ + 2.2, -7, 4, 0.004));
    const dash = canvasTex(256, 16, (ctx, w) => { ctx.fillStyle = '#f4e9c0'; ctx.fillRect(0, 3, w * 0.55, 10); }, { repeat: true });
    dash.repeat.set(70, 1);
    const dl = new THREE.Mesh(new THREE.PlaneGeometry(340, 0.22), litMaterial({ map: dash, transparent: true }));
    dl.rotation.x = -Math.PI / 2; dl.position.set(20, 0.012, RZ - 0.8); dl.receiveShadow = true; root.add(dl);
    // kerbs
    const kp = new Parts();
    kp.rbox(0xb8c0ca, 340, 0.16, 0.3, 0.05, [20, 0.07, RZ + 2.2]);
    kp.rbox(0xb8c0ca, 340, 0.16, 0.3, 0.05, [20, 0.07, RZ - 3.8]);
    root.add(solid(kp, { ao: false, cast: false }));

    // the scrap yard: packed dirt with a raised kerb
    const yx0 = Y.x0 - 1.5, yx1 = Y.x0 + (Y.cols - 1) * Y.dx + 1.5, yz0 = Y.z0 - 1.5, yz1 = Y.z0 + (Y.rows - 1) * Y.dz + 1.5;
    root.add(ground('dirt', yx0, yx1, yz0, yz1, 6, 0.004));
    const yp = new Parts();
    const K = 0x9aa3ad;
    yp.rbox(K, yx1 - yx0 + 0.5, 0.22, 0.36, 0.08, [(yx0 + yx1) / 2, 0.1, yz0 - 0.12]);
    yp.rbox(K, yx1 - yx0 + 0.5, 0.22, 0.36, 0.08, [(yx0 + yx1) / 2, 0.1, yz1 + 0.12]);
    yp.rbox(K, 0.36, 0.22, yz1 - yz0 + 0.5, 0.08, [yx0 - 0.12, 0.1, (yz0 + yz1) / 2]);
    // a path of slabs from the yard to the garage
    yp.rbox(0xb8bec6, 2.4, 0.05, 3.2, 0.02, [-2.9, 0.012, 5.0]);
    // yard dressing on the far (+z) side: containers and a scrap skip
    yp.model('city-kit-industrial/shipping-container-a', { pos: [-13.5, 0, 12.2], rot: [0, Math.PI / 2, 0], height: 2.5 });
    yp.model('city-kit-industrial/shipping-container-b', { pos: [-13.2, 2.5, 12.3], rot: [0, Math.PI / 2 + 0.06, 0], height: 2.5, tint: 0x9fd0ff });
    yp.model('city-kit-industrial/shipping-container-c', { pos: [-17.6, 0, 12.6], rot: [0, 0.2, 0], height: 2.5, tint: 0xbfe8c8 });
    yp.model('factory-kit/warning-orange', { pos: [-4.6, 0, -6.4], height: 1.7 });
    yp.model('factory-kit/warning-orange', { pos: [-4.6, 0, 10.4], height: 1.7 });
    for (const [x, z] of [[-6.2, -7.2], [-9.5, -7.4], [-17.4, -7.0]]) yp.model('car-kit/cone', { pos: [x, 0, z], height: 0.7 });
    root.add(solid(yp));

    // trees, bushes and rocks around the site (on the camera side they stay beyond the road)
    const tp = new Parts();
    const R = rng(77);
    const trees = [[-24, -18], [-12, -19.5], [-2, -18], [9, -20], [22, -18.5], [34, -20], [46, -18], [58, -19.5],
      [-25, 4], [-27, 14], [-24, 22], [-16, 26], [-8, 30], [-30, -6], [-34, 10], [-22, 34], [-12, 40], [-30, 28]];
    for (const [x, z] of trees) {
      tp.model(R() < 0.5 ? 'nature-kit/tree_default' : 'nature-kit/tree_oak', { pos: [x + R() * 2 - 1, 0, z + R() * 2 - 1], rot: [0, R() * TAU, 0], height: 4.2 + R() * 2.2 });
    }
    for (let i = 0; i < 26; i++) {
      const x = -34 + R() * 100, z = -22 + R() * 5;
      tp.model(R() < 0.6 ? 'nature-kit/plant_bushDetailed' : 'nature-kit/rock_smallA', { pos: [x, 0, z], rot: [0, R() * TAU, 0], height: 0.6 + R() * 0.7 });
    }
    for (let i = 0; i < 14; i++) tp.model('nature-kit/plant_bush', { pos: [-22 - R() * 12, 0, -10 + R() * 44], rot: [0, R() * TAU, 0], height: 0.7 + R() * 0.6 });
    root.add(solid(tp, { ao: false, cast: false }));

    // the industrial park behind: big silhouettes softened by the fog
    const bp = new Parts();
    const far = [
      ['city-kit-industrial/building-a', 62, 58, 15, 0.2], ['city-kit-industrial/building-c', 24, 64, 13, -0.4], ['city-kit-industrial/building-e', 84, 30, 17, 1.2],
      ['city-kit-industrial/building-l', -6, 70, 18, 0.5], ['city-kit-industrial/building-h', 96, 62, 10, 0.1], ['city-kit-industrial/chimney-large', 46, 70, 24, 0],
      ['city-kit-industrial/chimney-medium', 74, 52, 19, 0], ['city-kit-industrial/water-tower', 14, 56, 15, 0.3], ['city-kit-industrial/detail-tank-large', 36, 52, 7, 0],
      ['city-kit-industrial/detail-tank', 44, 50, 6, 0], ['city-kit-industrial/windmill', 100, 20, 22, -0.6], ['city-kit-industrial/windmill', 108, 44, 22, -0.6],
      ['city-kit-industrial/building-c', 70, -2, 12, 2.2], ['city-kit-industrial/building-a', 92, 4, 14, 1.4],
    ];
    for (const [id, x, z, h, yaw] of far) bp.model(id, { pos: [x, 0, z], rot: [0, yaw, 0], height: h });
    const bm = solid(bp, { ao: false });
    bm.castShadow = false;
    root.add(bm);
  }

  // ============================================================ halls ======
  const WH = 3.8, WT = 0.45;
  /** A wall run. axis 'x': along x at z = at (face toward -z). axis 'z': along z at x = at (face toward -x). */
  function wallRun(p, axis, at, a0, a1, { gaps = [], windows = true, label = null } = {}) {
    const box = (c, len, h, t, mid, y, proud = 0, r = 0.04) => {
      if (len <= 0.01) return;
      if (axis === 'x') p.rbox(c, len, h, t, r, [mid, y, at + WT / 2 - proud]);
      else p.rbox(c, t, h, len, r, [at + WT / 2 - proud, y, mid]);
    };
    // split into solid segments around the gaps
    const segs = [];
    let s = a0;
    for (const g of gaps.slice().sort((u, v) => u[0] - v[0])) { if (g[0] > s) segs.push([s, g[0]]); s = Math.max(s, g[1]); }
    if (s < a1) segs.push([s, a1]);
    for (const [u, v] of segs) {
      const len = v - u, mid = (u + v) / 2;
      box(C.wall, len, WH, WT, mid, WH / 2);
      box(C.base, len + 0.02, 0.75, WT + 0.1, mid, 0.375, 0.05);
      box(C.band, len + 0.02, 0.42, WT + 0.08, mid, WH - 0.62, 0.04);
      box(C.cap, len + 0.06, 0.16, WT + 0.16, mid, WH + 0.06, 0.02);
      // pilasters and windows
      const n = Math.max(1, Math.round(len / 4));
      const step = len / n;
      for (let i = 0; i <= n; i++) box(C.wallDark, 0.34, WH - 0.2, WT + 0.14, u + i * step, (WH - 0.2) / 2, 0.07, 0.05);
      if (windows) {
        for (let i = 0; i < n; i++) {
          const wm = u + (i + 0.5) * step, ww = Math.min(2.2, step - 1.2);
          if (ww < 0.8) continue;
          box(C.frame, ww + 0.22, 1.24, 0.12, wm, 2.15, 0.07, 0.04);
          box(C.glass, ww, 1.02, 0.14, wm, 2.15, 0.09, 0.03);
          box(C.frame, 0.07, 1.02, 0.16, wm, 2.15, 0.1, 0.01);
        }
      }
    }
    for (const g of gaps) {
      const len = g[1] - g[0], mid = (g[0] + g[1]) / 2, dh = g[2] || 3.0;
      box(C.wall, len, WH - dh, WT, mid, dh + (WH - dh) / 2);
      box(C.band, len + 0.02, 0.42, WT + 0.08, mid, WH - 0.62, 0.04);
      box(C.cap, len + 0.06, 0.16, WT + 0.16, mid, WH + 0.06, 0.02);
      box(C.yellow, 0.3, dh, WT + 0.2, g[0], dh / 2, 0.1, 0.03);
      box(C.yellow, 0.3, dh, WT + 0.2, g[1], dh / 2, 0.1, 0.03);
      box(C.yellow, len + 0.3, 0.3, WT + 0.2, mid, dh + 0.1, 0.1, 0.03);
      if (g[3] === 'shutter') box(0xb9c2cd, len - 0.3, dh, 0.12, mid, dh / 2, -0.05, 0.02);    // closed roller shutter
    }
    void label;
  }
  // outer walls for each hall extent (shown while that extent is the latest)
  const wallSets = [null];
  const hallDefs = [
    null,
    { maxX: 14, maxZ: 9, gx: [], gz: [] },
    { maxX: 14, maxZ: 21, gx: [], gz: [] },
    { maxX: 36, maxZ: 21, gx: [], gz: [[16.1, 19.1, 3.0, 'shutter']] },
    { maxX: 36, maxZ: 37, gx: [[27.4, 32.6, 3.1]], gz: [[11.9, 15.3, 3.0, 'shutter']] },
  ];
  // dressing that stands against a wall belongs to that wall set (it goes when the wall moves out)
  const shelfX = (d, z, x) => {         // a rack against the +x wall
    d.box(C.steel, 0.5, 2.2, 2.2, [x - 0.45, 1.1, z]);
    for (const y of [0.5, 1.2, 1.9]) d.box(C.dark, 0.6, 0.06, 2.3, [x - 0.5, y, z]);
    d.model('factory-kit/box-small', { pos: [x - 0.55, 0.53, z - 0.5], height: 0.5 });
    d.model('factory-kit/box-small', { pos: [x - 0.55, 1.23, z + 0.4], height: 0.5, rot: [0, 0.3, 0] });
    d.model('factory-kit/box-large', { pos: [x - 0.6, 1.93, z], height: 0.45, rot: [0, Math.PI / 2, 0] });
  };
  const shelfZ = (d, x, z, wheels) => { // a rack against the +z wall
    d.box(C.steel, 2.2, 2.2, 0.5, [x, 1.1, z - 0.45]);
    for (const y of [0.5, 1.2, 1.9]) d.box(C.dark, 2.3, 0.06, 0.6, [x, y, z - 0.5]);
    if (wheels) {
      d.model('car-kit/wheel-default', { pos: [x - 0.5, 0.56, z - 0.6], height: 0.6, rot: [0, Math.PI / 2, 0] });
      d.model('car-kit/wheel-default', { pos: [x + 0.4, 1.26, z - 0.6], height: 0.6, rot: [0, Math.PI / 2, 0] });
    } else {
      d.model('factory-kit/box-small', { pos: [x - 0.5, 0.53, z - 0.55], height: 0.5, rot: [0, 0.2, 0] });
      d.model('factory-kit/box-large', { pos: [x + 0.2, 1.23, z - 0.6], height: 0.45 });
    }
    d.model('factory-kit/box-small', { pos: [x + 0.2, 1.93, z - 0.6], height: 0.5 });
  };
  const pipes = (d, xs, z) => { for (const x of xs) d.model('factory-kit/pipe-large-long', { pos: [x, 2.95, z - 0.25], height: 0.55 }); };
  const crates = (d, x, z) => {
    d.model('factory-kit/box-large', { pos: [x, 0, z - 0.9], height: 0.8, rot: [0, 0.2, 0] });
    d.model('factory-kit/box-large', { pos: [x + 0.05, 0.8, z - 0.85], height: 0.7, rot: [0, -0.25, 0] });
    d.model('factory-kit/box-wide', { pos: [x - 1.3, 0, z - 0.75], height: 0.75, rot: [0, 1.4, 0] });
  };
  const screen = (d, x, z, wide) => d.model(wide ? 'factory-kit/screen-panel-wide' : 'factory-kit/screen-wide', { pos: [x, 0, z - 0.7], height: 1.75, rot: [0, Math.PI, 0] });
  const cogs = (d, x, z) => {
    d.model('factory-kit/cog-a', { pos: [x, 2.5, z - 0.14], rot: [Math.PI / 2, 0, 0], height: 0.3 });
    d.model('factory-kit/cog-b', { pos: [x + 0.95, 2.1, z - 0.14], rot: [Math.PI / 2, 0.3, 0], height: 0.24 });
  };
  const DRESS = [
    null,
    (d) => { for (const z of [-4.5, -1.2, 7.6]) shelfX(d, z, 14); screen(d, 5.9, 9); pipes(d, [3.0, 4.1], 9); d.model('factory-kit/pipe-large-valve', { pos: [1.9, 2.95, 8.75], height: 0.6 }); cogs(d, 8.6, 9); crates(d, 12.9, 9); },
    (d) => { for (const z of [-4.5, -1.2, 7.6, 10.4, 17.6]) shelfX(d, z, 14); screen(d, 6.0, 21); pipes(d, [2.6, 3.7], 21); cogs(d, 8.8, 21); crates(d, 12.6, 21); },
    (d) => { shelfX(d, 19.2, 36); screen(d, 6.0, 21); screen(d, 21.4, 21, true); screen(d, 27.6, 21); pipes(d, [2.6, 3.7, 22.5, 23.6, 28.9, 30.0], 21); cogs(d, 8.8, 21); crates(d, 12.6, 21); },
    (d) => { for (const z of [19.2, 22.8, 34.6]) shelfX(d, z, 36); for (const x of [19, 23, 27]) shelfZ(d, x, 37, true); screen(d, 32.4, 37, true); pipes(d, [17.2, 18.3, 29.2, 30.3], 37); cogs(d, 2.2, 37); },
  ];
  for (let s = 1; s <= 4; s++) {
    const h = hallDefs[s];
    const p = new Parts();
    wallRun(p, 'x', h.maxZ, -2, h.maxX + WT, { gaps: h.gz });
    wallRun(p, 'z', h.maxX, -7, h.maxZ, { gaps: h.gx });
    const g = new THREE.Group();
    g.add(solid(p, { ao: { ground: 0.12, groundH: 0.6, noBoxes: true } }));
    // the company sign on the +z wall
    const st = signTex([{ text: 'VOLT WORKS', color: '#ffffff' }], '#2f7fe0', 768, 192);
    g.add(sign(st, s === 1 ? 6.4 : 8.0, s === 1 ? 1.6 : 2.0, s === 1 ? 6 : (h.maxX - 2) / 2 + 1, WH + (s === 1 ? 1.0 : 1.25), h.maxZ + 0.1));
    const post = new Parts();
    const sx = s === 1 ? 6 : (h.maxX - 2) / 2 + 1, sw = s === 1 ? 6.4 : 8.0;
    for (const d of [-0.35, 0.35]) post.box(C.dark, 0.14, 1.2, 0.14, [sx + d * sw, WH + 0.5, h.maxZ + 0.2]);
    g.add(solid(post, { ao: false }));
    const dress = new Parts();
    DRESS[s](dress);
    g.add(solid(dress, { gloss: 0.18, cast: false }));
    g.visible = false;
    root.add(g);
    wallSets.push(g);
  }

  // floors and markings per stage
  const stage = [null];
  // hazard-striped floor strips: collected per stage and drawn as one mesh each (u, v in world units)
  const hazRects = [null, [], [], [], [], []];
  const haz = (s, x0, x1, z0, z1) => { hazRects[s].push([x0, x1, z0, z1]); };
  let hazMaterial = null;
  function hazardMesh(rects, y = 0.014) {
    const pos = [], uv = [], idx = [];
    for (const [x0, x1, z0, z1] of rects) {
      const b0 = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
      uv.push(x0 / 0.8, z0 / 0.8, x1 / 0.8, z0 / 0.8, x0 / 0.8, z1 / 0.8, x1 / 0.8, z1 / 0.8);
      idx.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (!hazMaterial) hazMaterial = litMaterial({ map: tex('hazard') });
    const m = new THREE.Mesh(g, hazMaterial);
    m.receiveShadow = true;
    return m;
  }
  const LINE_Y = 0.011;
  const lane = (p, x0, z0, x1, z1, w = 0.16, c = C.yellow) => {
    if (Math.abs(x1 - x0) > Math.abs(z1 - z0)) p.box(c, Math.abs(x1 - x0), 0.012, w, [(x0 + x1) / 2, LINE_Y, (z0 + z1) / 2]);
    else p.box(c, w, 0.012, Math.abs(z1 - z0), [(x0 + x1) / 2, LINE_Y, (z0 + z1) / 2]);
  };
  for (let s = 1; s <= 5; s++) {
    const g = new THREE.Group();
    g.visible = false;
    root.add(g);
    stage.push({ group: g, decor: [] });
    const f = LAY.floors[s];
    if (f) g.add(ground('concrete', f.minX, f.maxX, f.minZ, f.maxZ, 4, s * 0.0004));
  }
  const addDecor = (s, obj) => { stage[s].group.add(obj); stage[s].decor.push(obj); return obj; };

  // ---- stage 1: the garage
  {
    const p = new Parts();
    // walkway lines and a hazard edge at the open front
    lane(p, -1.6, -6.6, 13.6, -6.6, 0.2);
    lane(p, -1.6, -6.6, -1.6, 8.6, 0.2);
    lane(p, 6.2, -0.8, 6.2, 8.6, 0.12, 0xffffff);
    const lines = solid(p, { ao: false, cast: false });
    stage[1].group.add(lines);
    haz(1, 8.9, 12.3, -6.9, -6.3);
    const d = new Parts();
    // shipping bay: pallet, bollards
    d.box(C.wood, 3.1, 0.1, 1.9, [10.6, 0.05, -5.3]);
    for (const x of [9.2, 10.1, 11.1, 12.0]) d.box(C.woodDark, 0.16, 0.1, 1.9, [x, 0.0, -5.3]);
    for (const x of [8.4, 12.8]) { d.cyl(C.yellow, 0.14, 0.14, 0.9, [x, 0.45, -6.7], null, 10); d.cyl(C.dark, 0.145, 0.145, 0.16, [x, 0.6, -6.7], null, 10); }
    addDecor(1, solid(d, { gloss: 0.18 }));
    const ship = makeDropDecal('SHIP', 2.7);
    ship.position.set(10.6, 0.04, -2.2);
    stage[1].group.add(ship);
  }

  // ---- stage 2: workshop extension
  {
    const p = new Parts();
    lane(p, -1.6, 8.6, -1.6, 20.6, 0.2);
    lane(p, 6.2, 8.6, 6.2, 20.6, 0.12, 0xffffff);
    stage[2].group.add(solid(p, { ao: false, cast: false }));
    const d = new Parts();
    for (const [x, z] of [[-1.2, 9.6], [-1.2, 16.4]]) d.model('car-kit/cone', { pos: [x, 0, z], height: 0.7 });
    // the sweeper's parking bay outside
    addDecor(2, solid(d, { gloss: 0.18 }));
    stage[2].group.add(ground('concrete', -8.4, -2, 10.6, 15.2, 4, 0.006));
    haz(2, -8.4, -2, 10.3, 10.6);
  }

  // ---- stage 3: the auto line hall
  {
    const p = new Parts();
    lane(p, 14.4, -6.6, 35.6, -6.6, 0.2);
    lane(p, 15.0, 12.4, 32.4, 12.4, 0.12, 0xffffff);
    lane(p, 15.0, 3.6, 32.4, 3.6, 0.12, 0xffffff);
    stage[3].group.add(solid(p, { ao: false, cast: false }));
    haz(3, 32.8, 36.0, -6.9, -6.3);
    haz(3, 15.6, 19.6, 14.2, 14.5);
    const d = new Parts();
    // ore bay: a steel bin around the ore and a hopper feeding the belt
    d.box(C.steel, 3.2, 0.9, 0.14, [17.6, 0.45, 18.3]);
    d.box(C.steel, 0.14, 0.9, 3.4, [15.9, 0.45, 16.6]);
    d.box(C.steel, 3.2, 0.9, 0.14, [17.6, 0.45, 14.8]);
    d.model('factory-kit/hopper-square', { pos: [19.4, 0.7, 16.5], height: 1.0 });
    // the truck bay pallet
    d.box(C.wood, 2.2, 0.1, 1.9, [34.3, 0.05, -4.4]);
    // crates and cones on the open floor
    for (const [x, z, r2] of [[15.4, -5.6, 0.2], [15.3, -3.6, -0.1], [16.8, -5.8, 1.4]]) d.model('factory-kit/box-large', { pos: [x, 0, z], height: 0.85, rot: [0, r2, 0] });
    d.model('factory-kit/box-small', { pos: [15.4, 0.85, -5.5], height: 0.55 });
    for (const [x, z] of [[33.0, -2.2], [33.0, 12.2], [15.6, 12.6]]) d.model('car-kit/cone', { pos: [x, 0, z], height: 0.7 });
    addDecor(3, solid(d, { gloss: 0.18 }));
  }

  // ---- stage 4: the car hall, the lot and its road
  {
    const g4 = stage[4].group;
    g4.add(ground('asphalt', 36.6, 54.5, 20, 39, 7, 0.003));
    g4.add(ground('asphalt', 48.6, 54.5, RZ + 2.2, 20, 7, 0.003));
    const p = new Parts();
    lane(p, -1.6, 20.6, -1.6, 36.6, 0.2);
    lane(p, 6.4, 27.9, 31.6, 27.9, 0.2);
    lane(p, 6.4, 32.1, 31.6, 32.1, 0.2);
    lane(p, 16.4, 22.4, 31.0, 22.4, 0.12, 0xffffff);
    // parking bays
    const L = LAY.lot;
    for (let c = 0; c <= L.cols; c++) for (let r = 0; r < L.rows; r++) {
      const x = L.x0 + (c - 0.5) * L.dx, z = L.z0 + r * L.dz;
      p.box(0xffffff, 0.14, 0.012, 3.0, [x, LINE_Y, z]);
    }
    g4.add(solid(p, { ao: false, cast: false }));
    haz(4, 36.0, 36.6, 27.5, 32.5);
    const d = new Parts();
    // steel bay rack, wheel rack
    d.box(C.steel, 3.4, 0.12, 2.0, [13.6, 0.06, 35.2]);
    for (const x of [12.0, 15.2]) d.box(C.yellow, 0.14, 1.5, 0.14, [x, 0.75, 36.1]);
    d.box(C.steel, 1.9, 0.12, 2.8, [0.2, 0.06, 24.6]);
    for (const z of [23.2, 26.0]) d.box(C.yellow, 0.14, 1.5, 0.14, [-0.7, 0.75, z]);
    for (const [x, z] of [[5.6, 27.2], [5.6, 32.8], [32.2, 27.2], [32.2, 32.8]]) d.model('car-kit/cone', { pos: [x, 0, z], height: 0.7 });
    // lot: a sales booth and lamp posts
    d.rbox(C.white, 3.0, 2.6, 2.4, 0.1, [51.6, 1.3, 37.2]);
    d.rbox(C.band, 3.2, 0.4, 2.6, 0.06, [51.6, 2.7, 37.2]);
    d.rbox(C.glass, 2.0, 1.0, 0.1, 0.04, [51.6, 1.6, 35.96]);
    for (const [x, z] of [[38.2, 21.4], [47.5, 21.4], [38.2, 38.2], [47.5, 38.2]]) {
      d.cyl(C.dark, 0.08, 0.1, 4.2, [x, 2.1, z], null, 8);
      d.rbox(C.white, 0.9, 0.12, 0.3, 0.04, [x, 4.2, z]);
    }
    addDecor(4, solid(d, { gloss: 0.18 }));
    // stage portals over the line
    const names = ['WELD', 'PAINT', 'BATTERY', 'WHEELS'], cols = ['#ff8a2a', '#e4474f', '#2f8df0', '#39c98a'];
    const lp = new Parts();
    const A = LAY.line.from, B = LAY.line.to;
    for (let k = 0; k < 4; k++) {
      const x = A.x + (B.x - A.x) * ((k + 0.5) / 4);
      for (const dz of [-2.15, 2.15]) lp.rbox(C.yellow, 0.34, 3.5, 0.34, 0.06, [x, 1.75, A.z + dz]);
      lp.rbox(C.dark, 0.5, 0.4, 4.9, 0.08, [x, 3.6, A.z]);
      lp.rbox(C.steel, 0.2, 0.12, 4.3, 0.04, [x, 3.3, A.z]);
      const sg = sign(signTex([{ text: names[k] }], cols[k], 384, 128), 2.6, 0.86, x - 0.27, 4.35, A.z, true);
      g4.add(sg);
    }
    addDecor(4, solid(lp, { gloss: 0.3 }));
  }

  for (let s = 1; s <= 5; s++) if (hazRects[s].length) stage[s].group.add(hazardMesh(hazRects[s]));

  // ============================================================ machines ===
  const machines = {};
  /** a machine housing built around a factory-kit tunnel model; flows along x */
  function housing(kind, { h = 2.2, hopper = false, screen = false, tint } = {}) {
    const p = new Parts();
    p.model('factory-kit/' + kind, { height: h, rot: [0, Math.PI / 2, 0], tint });
    if (hopper) p.model('factory-kit/hopper-round', { pos: [0, h - 0.12, 0], height: 0.95 });
    if (screen) p.model('factory-kit/screen-small', { pos: [-0.75, 0, -h * 0.62], height: 1.35, rot: [0, Math.PI, 0] });
    p.rbox(C.dark, h * 1.3, 0.1, h * 1.05, 0.03, [0, 0.05, 0]);
    return solid(p, { gloss: 0.34 });
  }
  function bench() {
    const p = new Parts();
    p.rbox(C.wood, 2.4, 0.14, 1.5, 0.05, [0, 1.05, 0]);                         // top
    p.rbox(C.steel, 2.3, 0.08, 1.4, 0.03, [0, 0.42, 0]);                        // lower shelf
    for (const sx of [-1.05, 1.05]) for (const sz of [-0.6, 0.6]) p.box(C.dark, 0.12, 1.0, 0.12, [sx, 0.5, sz]);
    p.rbox(0xd8dee6, 2.4, 1.3, 0.1, 0.03, [0, 1.75, 0.72]);                     // pegboard
    p.box(C.red, 0.12, 0.5, 0.05, [-0.8, 1.9, 0.66]); p.box(C.yellow, 0.3, 0.1, 0.05, [-0.35, 2.05, 0.66]);
    p.box(C.blue, 0.1, 0.42, 0.05, [0.15, 1.85, 0.66]); p.box(C.green, 0.24, 0.24, 0.05, [0.65, 1.95, 0.66]);
    p.rbox(C.blue, 0.42, 0.26, 0.3, 0.04, [-0.75, 1.25, 0.25]);                 // vice
    p.cyl(C.yellow, 0.05, 0.05, 0.7, [0.95, 1.45, 0.45], [0, 0, 0.5], 8);       // lamp arm
    p.cone(C.yellow, 0.2, 0.24, [0.72, 1.72, 0.45], [0, 0, Math.PI], 12);
    p.model('factory-kit/box-small', { pos: [0.5, 0.46, 0], height: 0.45 });
    return solid(p, { gloss: 0.2 });
  }
  const furnish = (id, mesh, x, z, yaw = 0, extra = null) => {
    place(mesh, x, 0, z, yaw);
    mesh.visible = false;
    root.add(mesh);
    machines[id] = mesh;
    G.stations.onOpen(id, (live) => { mesh.visible = true; if (live) popIn(mesh); if (extra) extra(live); });
    return mesh;
  };
  furnish('cellmaker', housing('machine-window', { hopper: true, screen: true }), 1.5, 5.0);
  furnish('cellmaker2', housing('machine-window', { hopper: true, screen: true }), 1.5, 13.0);
  furnish('bench', bench(), 10.6, 5.0);
  furnish('bench2', bench(), 10.6, 13.0);
  furnish('cell3', housing('machine-fortified', { h: 2.5, hopper: true }), 24.3, 16.5);
  furnish('packer3', housing('machine-window-bar', { h: 2.5, screen: true }), 30.7, 16.5);
  furnish('cell4', housing('machine-fortified', { h: 2.5, hopper: true }), 24.3, 8.2);
  furnish('packer4', housing('machine-window-bar', { h: 2.5, screen: true }), 30.7, 8.2);
  {
    const d = new Parts();
    d.box(C.steel, 3.2, 0.9, 0.14, [17.6, 0.45, 10.0]);
    d.box(C.steel, 0.14, 0.9, 3.4, [15.9, 0.45, 8.3]);
    d.box(C.steel, 3.2, 0.9, 0.14, [17.6, 0.45, 6.5]);
    d.model('factory-kit/hopper-square', { pos: [19.4, 0.7, 8.2], height: 1.0 });
    furnish('oredock2', solid(d, { gloss: 0.18 }), 0, 0);
  }
  // the press: a yellow frame with a ram that slams down
  const pressRam = (() => {
    const frame = new Parts();
    frame.rbox(C.dark, 3.0, 0.5, 2.5, 0.08, [0, 0.25, 0]);
    frame.rbox(C.steel, 2.2, 0.35, 1.8, 0.05, [0, 0.67, 0]);
    for (const sx of [-1.25, 1.25]) frame.rbox(C.yellow, 0.42, 3.1, 1.9, 0.08, [sx, 1.95, 0]);
    frame.rbox(C.yellow, 3.0, 0.7, 2.0, 0.1, [0, 3.45, 0]);
    frame.rbox(C.dark, 1.2, 0.3, 0.2, 0.04, [0, 3.45, -1.02]);
    frame.model('factory-kit/screen-small', { pos: [1.9, 0, -0.9], height: 1.35, rot: [0, Math.PI, 0] });
    const fm = solid(frame, { gloss: 0.4 });
    const ram = new Parts();
    ram.rbox(C.steel, 1.9, 0.5, 1.6, 0.06, [0, 0, 0]);
    ram.cyl(0xc9d0d8, 0.26, 0.26, 1.4, [0, 0.9, 0], null, 12);
    const rm = solid(ram, { gloss: 0.5, ao: false });
    rm.position.y = 2.6;
    fm.add(rm);
    furnish('press', fm, 7.5, 34.6);
    return rm;
  })();
  const press = G.stations.get('press');
  const pressSnd = { pos: { x: 7.5, z: 34.6 }, volume: 0.7 };
  if (press) animated.push((dt) => {
    if (!press.active) return;
    // the ram comes down over the cycle and snaps back up
    const u = press.running ? press.progress : 0;
    const y = 2.6 - (u > 0.75 ? (u - 0.75) / 0.25 : 0) * 1.45;
    pressRam.position.y += (y - pressRam.position.y) * Math.min(1, dt * 22);
  });
  G.events.on('convert', (e) => {
    const m = machines[e.stationId];
    if (m && m.visible) pop(m, 1.07);
    if (e.stationId === 'press') {
      if (G.audio && G.audio.play) G.audio.play('press', pressSnd);
      if (G.fx && G.fx.shake && G.player && Math.hypot(G.player.pos.x - 7.5, G.player.pos.z - 34.6) < 12) G.fx.shake(0.08, 0.12);
    }
  });

  // ============================================================ robot arms =
  // Every arm is two rigid pieces (base, and everything above the shoulder), drawn by two instanced
  // meshes for the whole world: 2 draw calls however many arms there are.
  const ARM = 'factory-kit/robot-arm-a', ARM_H = 3.3, ARM_MAX = 12;
  const arms = [];
  {
    const opts = { height: ARM_H };
    const baseG = getGeometry(ARM, { ...opts, nodes: { key: 'base', test: (p) => !/element-b/.test(p) } });
    const upG = getGeometry(ARM, { ...opts, nodes: { key: 'upper', test: (p) => /element-b/.test(p) } }).clone();
    const piv = nodePosition(ARM, 'element-b', opts) || new THREE.Vector3(0, ARM_H * 0.2, 0);
    upG.translate(-piv.x, -piv.y, -piv.z);
    const mat = getGlossMaterial(0.5, 50);
    const mk = (g) => {
      const m = new THREE.InstancedMesh(g, mat, ARM_MAX);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.castShadow = true; m.frustumCulled = false; m.count = 0;
      root.add(m);
      return m;
    };
    const baseM = mk(baseG), upM = mk(upG);
    const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    const pv = new THREE.Vector3(), sv = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    animated.push((dt) => {
      let n = 0;
      for (const a of arms) {
        if (!a.on) continue;
        if (a.grow < 1) a.grow = Math.min(1, a.grow + dt * 2.2);
        const busy = a.busy();
        a.t += dt * (busy ? a.speed : 0.5);
        const s = busy ? Math.sin(a.t) * 0.5 + 0.5 : 0.5 + Math.sin(a.t) * 0.06;
        const yaw = a.yawA + (a.yawB - a.yawA) * s;
        const pitch = busy ? 0.35 + Math.abs(Math.cos(a.t)) * 0.5 : 0.55;
        const gr = a.grow < 0 ? 0 : a.grow;
        const k = gr < 1 ? gr * gr * (3 - 2 * gr) : 1;
        sv.set(k, k, k);
        q.setFromEuler(e.set(0, yaw, 0));
        mA.compose(pv.set(a.x, 0, a.z), q, sv);
        baseM.setMatrixAt(n, mA);
        q.setFromEuler(e.set(pitch, 0, 0));
        mB.compose(piv, q, one);
        mA.multiply(mB);
        upM.setMatrixAt(n, mA);
        n++;
      }
      baseM.count = upM.count = n;
      baseM.instanceMatrix.needsUpdate = upM.instanceMatrix.needsUpdate = true;
    });
  }
  /** an arm at (x, z) swinging between two headings while busy() is true */
  function addArm(x, z, yawA, yawB, busy, speed = 2.4) {
    const a = { x, z, yawA, yawB, busy, speed, on: false, grow: 1, t: Math.random() * 10 };
    arms.push(a);
    return a;
  }
  const showArm = (a, live, delay = 0) => { a.on = true; a.grow = live ? -delay * 2.2 : 1; };
  // loader arm at the auto line's shipping bay: swings toward the truck while one is loading
  const vendorsAt = (id) => (G.workers ? G.workers.list.filter((w) => w.role === 'vendor' && w.hire && w.hire.from === id) : []);
  {
    let vs = null, vn = -1;
    const arm = addArm(32.2, -6.6, Math.PI * 0.75, Math.PI * 1.35, () => {
      if (!G.workers) return false;
      if (G.workers.list.length !== vn) { vn = G.workers.list.length; vs = vendorsAt('ship2'); }
      for (let i = 0; i < vs.length; i++) if (vs[i].state === 'load') return true;
      return false;
    });
    G.stations.onOpen('ship2', (live) => showArm(arm, live, 0.4));
  }
  // welding / fitting arms along the car line (the ROBOT WELDERS pad)
  {
    const A = LAY.line.from, B = LAY.line.to;
    const lineArms = [];
    const busyT = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const x = A.x + (B.x - A.x) * ((k + 0.5) / 4);
      for (const side of [-1, 1]) {
        const toLine = side > 0 ? Math.PI : 0;        // facing the track
        lineArms.push(addArm(x + 1.2, A.z + side * 2.9, toLine - 0.5, toLine + 0.5, () => busyT[k] > 0, 7));
      }
    }
    G.pads.onDone('welders', (live) => { lineArms.forEach((a, i) => showArm(a, live, i * 0.08)); });
    G.events.on('line:stage', (ev) => { if (ev.stage >= 0 && ev.stage < 4) busyT[ev.stage] = 1.6; });
    animated.push((dt) => { for (let k = 0; k < 4; k++) if (busyT[k] > 0) busyT[k] -= dt; });
  }

  // ============================================================ paint shop ==
  {
    const A = LAY.line.from, B = LAY.line.to;
    const x = A.x + (B.x - A.x) * (1.5 / 4);
    const p = new Parts();
    p.rbox(C.white, 4.6, 3.3, 0.3, 0.08, [x, 1.75, A.z + 2.35]);
    p.rbox(C.white, 4.6, 3.3, 0.3, 0.08, [x, 1.75, A.z - 2.35]);
    p.rbox(C.red, 4.8, 0.35, 5.2, 0.1, [x, 3.5, A.z]);
    p.rbox(C.glass, 3.4, 1.3, 0.34, 0.05, [x, 2.0, A.z - 2.35]);
    for (const dz of [-1.6, 0, 1.6]) p.cyl(C.steel, 0.12, 0.12, 0.5, [x, 3.15, A.z + dz], null, 8);
    const booth = solid(p, { gloss: 0.45 });
    booth.visible = false;
    root.add(booth);
    G.pads.onDone('paint', (live) => { booth.visible = true; if (live) popIn(booth); });
    const sprayOpts = { colors: [0xe4474f, 0x2f8df0, 0xf2b632, 0x39c98a, 0xffffff], count: 16, speed: 3, size: 0.09, life: 0.6, gravity: 1, up: 1.5 };
    const v = new THREE.Vector3();
    G.events.on('line:stage', (e) => { if (e.stage === 1 && G.fx && G.fx.burst) { v.set(e.x, 1.6, e.z); G.fx.burst(v, sprayOpts); } });
  }

  // ============================================================ solar roof ==
  {
    const p = new Parts();
    // canopies along the back walls carrying panels, and a field of panels behind the hall
    for (let x = 0; x <= 32; x += 4.6) {
      p.box(C.dark, 0.14, 0.9, 0.14, [x + 1, WH + 0.6, 37.9]);
      p.model('city-kit-industrial/solar-panel-landscape-group', { pos: [x + 1, WH + 0.95, 38.3], width: 4.2, rot: [0, 0, 0] });
    }
    for (let z = -4; z <= 34; z += 4.6) {
      p.box(C.dark, 0.14, 0.9, 0.14, [36.9, WH + 0.6, z]);
      p.model('city-kit-industrial/solar-panel-landscape-group', { pos: [37.3, WH + 0.95, z], width: 4.2, rot: [0, Math.PI / 2, 0] });
    }
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) p.model('city-kit-industrial/solar-panel-landscape-group', { pos: [5 + i * 7.6, 0, 43 + j * 5], width: 6.4, rot: [0, 0, 0] });
    const m = solid(p, { gloss: 0.6, ao: false, cast: false });
    m.visible = false;
    root.add(m);
    G.pads.onDone('solar', (live) => { m.visible = true; if (live) popIn(m); });
  }

  // ============================================================ finale ======
  {
    const g = new THREE.Group();
    const t = signTex([{ text: 'GIGAFACTORY', color: '#ffe14d' }], '#25324a', 1024, 224, '#ffe14d');
    g.add(sign(t, 17, 3.7, 17, WH + 3.3, 37.3));
    const p = new Parts();
    for (const x of [9.5, 17, 24.5]) p.box(C.dark, 0.2, 1.7, 0.2, [x, WH + 0.85, 37.4]);
    g.add(solid(p, { ao: false }));
    g.visible = false;
    root.add(g);
    G.pads.onDone('giga', (live) => { g.visible = true; if (live) { popIn(g); if (G.view && G.view.setZoom) G.view.setZoom(LAY.zoom[5] * 1.25, 3); } });
  }

  // ============================================================ order bubbles
  // A speech bubble over each truck: what it wants and how many it still takes.
  const bubbles = [];
  function drawBubble(ctx, n) {
    const W = 256, H = 176;
    ctx.clearRect(0, 0, W, H);
    rr(ctx, 8, 8, W - 16, H - 52, 34);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#25324a'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2 - 22, H - 46); ctx.lineTo(W / 2, H - 8); ctx.lineTo(W / 2 + 22, H - 46); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(W / 2 - 26, H - 60, 52, 18);
    // battery pack icon
    rr(ctx, 30, 40, 92, 62, 12); ctx.fillStyle = '#2b3442'; ctx.fill();
    ctx.fillStyle = '#39d98a'; ctx.fillRect(30, 78, 92, 12);
    ctx.fillStyle = '#2f8df0';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(46 + i * 20, 58, 7.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#25324a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '900 62px "Arial Black", Impact, Arial, sans-serif';
    ctx.fillText(String(n), 138, 74);
  }
  function bubbleFor(w) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 176;
    const ctx = canvas.getContext('2d');
    const tx = new THREE.CanvasTexture(canvas); tx.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(2.5, 1.72, 1);
    sp.renderOrder = 6;
    sp.visible = false;
    root.add(sp);
    return { w, sp, ctx, tx, shown: -1, cap: 0 };
  }
  let bubbleN = -1;
  animated.push(() => {
    const list = G.workers ? G.workers.list : null;
    if (!list) return;
    if (list.length !== bubbleN) {
      bubbleN = list.length;
      for (const w of list) if (w.role === 'vendor' && !bubbles.some((b) => b.w === w)) bubbles.push(bubbleFor(w));
    }
    for (const b of bubbles) {
      const w = b.w;
      const left = Math.max(0, w.stack.capacity - w.loaded);
      const on = w.group.visible && (w.state === 'in' || w.state === 'load') && left > 0;
      b.sp.visible = on;
      if (!on) continue;
      if (left !== b.shown) { b.shown = left; drawBubble(b.ctx, left); b.tx.needsUpdate = true; }
      b.sp.position.set(w.x, 4.3 + Math.sin(G.time * 3 + w.x) * 0.08, w.z);
    }
  });

  // stock on the floor and in bays casts no shadow-map shadow (hundreds of items; they sit low)
  for (const st of G.stations.list) {
    for (const store of [st.input, st.output, st.store]) if (store && store.meshes) for (const m of store.meshes) m.castShadow = false;
  }

  // ============================================================ stages ======
  let cur = 0;
  function setStage(n, live) {
    n = Math.max(1, Math.min(5, n | 0));
    if (n === cur) return;
    for (let s = 1; s <= n; s++) {
      const st = stage[s];
      if (!st.group.visible) {
        st.group.visible = true;
        if (live) st.decor.forEach((o, i) => popIn(o, 0.25 + i * 0.12));
      }
    }
    const wi = Math.min(4, n);
    for (let s = 1; s <= 4; s++) {
      const on = s === wi;
      if (on && !wallSets[s].visible && live) popIn(wallSets[s], 0.1);
      wallSets[s].visible = on;
    }
    Object.assign(G.world.bounds, LAY.bounds[n]);
    if (G.view && G.view.setZoom) G.view.setZoom(LAY.zoom[n], live ? 2.4 : 0);
    cur = n;
  }
  setStage((G.stats && G.stats.stage) || 1, false);
  G.pads.onDone('workshop', (live) => setStage(2, live));
  G.pads.onDone('autoline', (live) => setStage(3, live));
  G.pads.onDone('carhall', (live) => setStage(4, live));
  G.pads.onDone('auto', (live) => setStage(5, live));

  return {
    update(dt) { for (let i = 0; i < animated.length; i++) animated[i](dt); },
    get stage() { return cur; },
  };
}
