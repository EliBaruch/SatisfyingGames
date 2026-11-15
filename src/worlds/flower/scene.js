// Flower world scenery: a cared-for garden estate. Lit grass with mowing stripes, warm paved
// paths, rounded timber-edged soil beds, trimmed hedges and picket fences, pack trees / bushes /
// rocks / barn / silo / windmill and code-built cottages, the greenhouse build site and finished
// greenhouse, and the travel gate. Lights come from the engine (world.lighting).
// Per-station furniture appears through G.stations.onOpen(id, fn(live)); the greenhouse and the
// gate through G.pads.onDone(padId, fn(live)).
// Static scenery is merged into a handful of chunk meshes (one draw call each when in view).
import * as THREE from 'three';
import { Parts as ArtParts, meshOf } from '../../engine/art/parts.js';
import { litMaterial } from '../../engine/art/material.js';
import { makeGround } from '../../engine/art/props.js';
import { rng } from '../../engine/geom.js';
import { canvasTex, roundRect as rr, signTexture, makeDropDecal, makeCashDecal } from '../../engine/decals.js';
import { makeCounter, makeGreenhouse, makeCottage, makeGateArch, flowerParts } from './models.js';

// rounded boxes default to the cheapest bevel (108 triangles) in this scene: scenery is seen small
class Parts extends ArtParts {
  rbox(c, w, h, d, r, pos, rot, scl, seg = 1) { return super.rbox(c, w, h, d, r, pos, rot, scl, seg); }
}

const inRect = (x, z, r, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
const FACE_CAMERA = -Math.PI * 0.75;     // yaw that turns a +Z face toward the camera

// ------------------------------------------------------------- textures -----
function dashedPlotTexture() {
  return canvasTex(1024, 1024, (ctx, w, h) => {
    rr(ctx, 30, 30, w - 60, h - 60, 90);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 16;
    ctx.setLineDash([54, 46]); ctx.lineWidth = 13; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
  });
}

/** soft light / dark mowing stripes (white and black at low alpha, over the grass) */
function stripeTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,230,0.16)'; ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = 'rgba(10,50,0,0.07)'; ctx.fillRect(w / 2, 0, w / 2, h);
  }, { repeat: true });
}

function medallionTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    const cx = w / 2, cy = h / 2;
    const ring = (r, c) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
    ring(250, '#dcb878'); ring(238, '#fbf1d3'); ring(216, '#eecb8f'); ring(198, '#fcf3da');
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((i / 8) * Math.PI * 2);
      ctx.beginPath(); ctx.ellipse(0, -118, 36, 74, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#ff7aa8' : '#ff4d7d'; ctx.fill();
      ctx.lineWidth = 7; ctx.strokeStyle = '#d9366b'; ctx.stroke();
      ctx.restore();
    }
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(((i + 0.5) / 8) * Math.PI * 2);
      ctx.beginPath(); ctx.ellipse(0, -168, 14, 34, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5fc46f'; ctx.fill(); ctx.restore();
    }
    ring(54, '#ffd23f'); ring(38, '#e9a01d'); ring(24, '#ffe680');
  });
}

const glow = (c) => '#' + new THREE.Color(c).getHexString();

// ----------------------------------------------------------------- the world --
export function createScene(G) {
  const LAY = G.world.layout;
  const PLOTS = LAY.plots;
  const PADS = G.world.pads;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const animated = [];
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const addMesh = (parent, geometry, { cast = true, receive = true } = {}) => {
    const m = meshOf(geometry, { cast, receive });
    m.matrixAutoUpdate = false; m.updateMatrix();
    parent.add(m);
    return m;
  };

  const R = LAY.road, X = LAY.cross, GH = LAY.greenhouse;
  const QUAD = { minX: X.maxX + 0 - 26, maxX: X.maxX, minZ: X.maxZ, maxZ: X.maxZ + 26 };   // the greenhouse garden: x 25..51, z 25..51
  const inRoad = (x, z, pad = 0) => inRect(x, z, R, pad) || inRect(x, z, X, pad);

  // ---------------------------------------------------------------- ground --
  {
    const gb = LAY.ground;
    const gw = gb.maxX - gb.minX, gd = gb.maxZ - gb.minZ;
    const ground = makeGround('grass', gw, gd, { tile: 9, seed: 3 });
    ground.position.set((gb.minX + gb.maxX) / 2, 0, (gb.minZ + gb.maxZ) / 2);
    ground.matrixAutoUpdate = false; ground.updateMatrix();
    root.add(ground);
  }

  // ----------------------------------------------------------------- roads --
  {
    const paveColor = 0xe9dcbc;
    const strip = (x0, x1, z0, z1, seed) => {
      const p = makeGround('paving', x1 - x0, z1 - z0, { color: paveColor, tile: 4, seed, y: 0.02 });
      p.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
      p.matrixAutoUpdate = false; p.updateMatrix();
      root.add(p);
    };
    strip(R.minX, R.maxX, R.minZ, R.maxZ, 5);
    strip(X.minX, R.minX, X.minZ, X.maxZ, 5);
    strip(R.maxX, X.maxX, X.minZ, X.maxZ, 5);
    // kerbs along the open road edges: soft cream rounded blocks
    const kp = new Parts();
    const kerb = (cx, cz, w, d) => kp.rbox(0xfff3da, w, 0.2, d, 0.09, [cx, 0.08, cz], null, null, 1);
    const kz0 = R.minZ, kz1 = PLOTS[0].rect.minZ - 0.6;
    kerb(R.minX - 0.15, (kz0 + kz1) / 2, 0.34, kz1 - kz0);
    kerb(R.maxX + 0.15, (kz0 + kz1) / 2, 0.34, kz1 - kz0);
    kerb((R.minX + R.maxX) / 2, R.minZ - 0.15, R.maxX - R.minX + 0.7, 0.34);
    kerb((R.minX + R.maxX) / 2, R.maxZ + 0.15, R.maxX - R.minX + 0.7, 0.34);
    kerb(X.minX - 0.15, (X.minZ + X.maxZ) / 2, 0.34, X.maxZ - X.minZ + 0.7);
    kerb(X.maxX + 0.15, (X.minZ + X.maxZ) / 2, 0.34, X.maxZ - X.minZ + 0.7);
    addMesh(root, kp.merged({ ao: { ground: 0.1, groundH: 0.1, down: 0, noBoxes: true } }));

    // inlaid flower medallion at the crossing (flat, decorative)
    const mat = litMaterial({ map: medallionTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const med = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), mat);
    med.rotation.x = -Math.PI / 2;
    med.rotation.z = Math.PI * 0.25;
    med.position.set((R.minX + R.maxX) / 2, 0.026, (X.minZ + X.maxZ) / 2);
    med.renderOrder = 1; med.receiveShadow = true;
    med.matrixAutoUpdate = false; med.updateMatrix();
    root.add(med);
  }

  // -------------------------------------------------------- scenery layout --
  const exclusions = [];   // circles {x, z, r}
  const blocked = (x, z, pad) => {
    for (const f of PLOTS) if (inRect(x, z, f.rect, pad)) return true;
    if (inRoad(x, z, pad)) return true;
    if (inRect(x, z, QUAD, pad)) return true;
    for (const p of PADS) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 3.4 + pad * 0.3) return true;
    for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r + pad * 0.5) return true;
    return false;
  };
  const CH = 24;
  const chunks = new Map();
  const chunk = (x, z) => {
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let c = chunks.get(k);
    if (!c) { c = new Parts(); chunks.set(k, c); }
    return c;
  };
  const wildChunks = new Map();     // wildflower tufts: small, ground level, no real shadow
  const wildChunk = (x, z) => {
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let c = wildChunks.get(k);
    if (!c) { c = new Parts(); wildChunks.set(k, c); }
    return c;
  };
  const AO = { ground: 0.14, groundH: 0.55, down: 0.1, noBoxes: true };
  const cottageGeo = new Map();
  const cottage = (cx, cz, wall, roof, yaw = FACE_CAMERA, s = 1) => {
    const key = wall + '/' + roof;
    let g = cottageGeo.get(key);
    if (!g) { g = makeCottage(wall, roof); cottageGeo.set(key, g); }
    chunk(cx, cz).add(g, 0xffffff, [cx, 0, cz], [0, yaw, 0], [s, s, s], true);
    exclusions.push({ x: cx, z: cz, r: 4.2 * s });
  };
  const packModel = (id, cx, cz, { yaw = FACE_CAMERA, s = 1, r = 4, ...o } = {}) => {
    chunk(cx, cz).model(id, { pos: [cx, 0, cz], rot: [0, yaw, 0], scl: [s, s, s], ao: AO, ...o });
    exclusions.push({ x: cx, z: cz, r });
  };

  // buildings: barns, silos, a windmill, cottages around the outside of the estate
  packModel('farmbuildings/Barn', -25, 2, { scale: 1.5, r: 6 });
  packModel('farmbuildings/Silo', -26, -9, { scale: 1.45, r: 3.5 });
  packModel('farmbuildings/OpenBarn', -26, 62, { scale: 1.5, r: 5 });
  packModel('farmbuildings/Windmill', 31, -28, { scale: 1.45, r: 4.5 });
  packModel('farmbuildings/Barn', 64, 30, { scale: 1.45, yaw: FACE_CAMERA, r: 6 });
  packModel('farmbuildings/Silo', 65, 12, { scale: 1.45, r: 3.5 });
  [
    [-25, 36, 0xffd3df, 0x7a5be0], [3, -26, 0xd8f5c8, 0xf0883a], [50, -27, 0xcfe8ff, 0xe8553d], [63, -8, 0xfff0c2, 0x3b82f6],
    [-4, 63, 0xd8f5c8, 0x7a5be0], [47, 65, 0xfff0c2, 0xf0883a], [-26, 22, 0xfff0c2, 0xe8553d], [64, 50, 0xffd3df, 0xe8553d],
  ].forEach(([x, z, w, r]) => cottage(x, z, w, r));

  // rounded blossom tree (code built): trunk + clustered pink / white / gold crowns
  const blossom = (x, z, s, color) => {
    const tp = chunk(x, z);
    const trunk = 0x9a6a3c;
    tp.cyl(trunk, 0.2 * s, 0.3 * s, 1.5 * s, [x, 0.75 * s, z], null, 10);
    tp.sph(color, 1.45 * s, [x, 2.6 * s, z], [1, 0.9, 1], null, 10, 7);
    tp.sph(color, 0.95 * s, [x - 0.8 * s, 2.2 * s, z + 0.5 * s], null, null, 8, 6);
    tp.sph(color, 0.9 * s, [x + 0.7 * s, 2.3 * s, z - 0.6 * s], null, null, 8, 6);
  };
  // trimmed round topiary
  const topiary = (x, z, s = 1) => {
    const tp = chunk(x, z);
    tp.rcyl(0xe07a4a, 0.5 * s, 0.5 * s, 0.07, [x, 0.25 * s, z], null, 16);
    tp.cyl(0x8b5a2b, 0.07 * s, 0.07 * s, 0.5 * s, [x, 0.7 * s, z], null, 8);
    tp.sph(0x3cb857, 0.7 * s, [x, 1.4 * s, z], null, null, 12, 8);
  };

  // trees, bushes, rocks, wildflowers
  {
    const rnd = rng(2024);
    const TREES = [
      ['nature-kit/tree_default', 4.0, 0.3], ['nature-kit/tree_oak', 3.6, 0.22], ['nature-kit/tree_fat', 3.5, 0.22],
      ['nature-kit/tree_small', 3.4, 0.16], ['nature-kit/tree_pineTallA', 4.4, 0.10],
    ];
    const pickTree = () => { let v = rnd(); for (const t of TREES) { v -= t[2]; if (v < 0) return t; } return TREES[0]; };
    const tints = [0xffffff, 0xf0ffe0, 0xe6ffe6, 0xfff8d8];
    const tree = (x, z, big = 1) => {
      const t = pickTree();
      const sc = (0.85 + rnd() * 0.45) * big;
      chunk(x, z).model(t[0], { height: t[1], pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], tint: tints[(rnd() * tints.length) | 0], ao: AO });
    };
    const BUSH = [['nature-kit/plant_bush', 1.5], ['nature-kit/plant_bushLarge', 1.7], ['nature-kit/plant_bushDetailed', 1.9]];
    const bush = (x, z, s = 1) => {
      const b = BUSH[(rnd() * 3) | 0];
      const sc = (0.8 + rnd() * 0.5) * s;
      chunk(x, z).model(b[0], { width: b[1], pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], ao: { ground: 0.2, groundH: 0.3, down: 0.1, noBoxes: true } });
    };
    const ROCKS = [['nature-kit/rock_largeA', 1.7], ['nature-kit/rock_largeD', 1.8], ['nature-kit/rock_smallA', 0.9], ['nature-kit/rock_smallD', 1.0], ['nature-kit/rock_tallA', 1.6]];
    const rock = (x, z) => {
      const k = ROCKS[(rnd() * ROCKS.length) | 0];
      const sc = 0.7 + rnd() * 0.6;
      chunk(x, z).model(k[0], { width: k[1], pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], ao: { ground: 0.15, groundH: 0.25, down: 0.05, noBoxes: true } });
    };
    const WILD = ['nature-kit/flower_redA', 'nature-kit/flower_yellowA', 'nature-kit/flower_purpleA'];
    const wild = (x, z) => {
      const sc = 0.9 + rnd() * 0.6;
      wildChunk(x, z).model(WILD[(rnd() * 3) | 0], { height: 0.6, pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc] });
    };
    // jittered grid of trees: a wooded border, open meadow closer in
    const step = 7.0;
    for (let gx = -56; gx < 96; gx += step) for (let gz = -64; gz < 104; gz += step) {
      const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
      if (blocked(x, z, 3.4)) continue;
      const v = rnd();
      if (v < 0.35) continue;
      if (v < 0.5) blossom(x, z, 0.85 + rnd() * 0.3, [0xffb3d1, 0xffd0e4, 0xffc2dc, 0xffffff][(rnd() * 4) | 0]);
      else tree(x, z);
    }
    // bushes hugging the outside of the plot fences, and the garden quadrant's edge
    const hug = (rect, gap) => {
      for (let t = rect.minX; t <= rect.maxX; t += 2.4 + rnd() * 2.6) for (const z of [rect.minZ - gap, rect.maxZ + gap]) if (!blocked(t, z, 0.6) && rnd() < 0.6) bush(t, z);
      for (let t = rect.minZ; t <= rect.maxZ; t += 2.4 + rnd() * 2.6) for (const x of [rect.minX - gap, rect.maxX + gap]) if (!blocked(x, t, 0.6) && rnd() < 0.6) bush(x, t);
    };
    for (const f of PLOTS) hug(f.rect, 2.0);
    hug(QUAD, 2.0);
    for (let i = 0; i < 70; i++) {
      const x = -52 + rnd() * 120, z = -58 + rnd() * 130;
      if (blocked(x, z, 2.5)) continue;
      const v = rnd();
      if (v < 0.55) bush(x, z); else if (v < 0.75) rock(x, z); else if (v < 0.87) { blossom(x, z, 0.7, 0xff9ec7); } else { topiary(x, z, 1.2); }
    }
    // wildflowers in the meadow
    for (let i = 0; i < 130; i++) {
      const x = -50 + rnd() * 112, z = -56 + rnd() * 124;
      if (blocked(x, z, 1.2)) continue;
      for (let k = 0; k < 2; k++) wild(x + (rnd() - 0.5) * 1.4, z + (rnd() - 0.5) * 1.4);
    }
    // hay bales and log stacks by the barns
    for (const [x, z] of [[-21, 7], [-20, -3], [60, 26], [61, 35]]) {
      const tp = chunk(x, z);
      tp.rcyl(0xe8c25a, 0.62, 0.9, 0.12, [x, 0.62, z], [Math.PI / 2, 0.3, 0], 18);
      tp.rcyl(0xe0b648, 0.55, 0.92, 0.12, [x + 1.3, 0.55, z + 0.2], [Math.PI / 2, 0.1, 0], 18);
      tp.rcyl(0xeccb66, 0.58, 0.9, 0.12, [x + 0.6, 1.55, z + 0.1], [Math.PI / 2, 0.5, 0], 18);
    }
    chunk(-20, 11).model('nature-kit/log_stack', { pos: [-20, 0, 11], rot: [0, FACE_CAMERA, 0], scale: 1.2, ao: AO });
    chunk(59, 40).model('nature-kit/log_stack', { pos: [59, 0, 40], rot: [0, FACE_CAMERA, 0], scale: 1.2, ao: AO });
  }

  // road dressing: lamp posts along both sides, entrance pillars with flower tubs
  {
    const lamp = (x, z) => {
      const tp = chunk(x, z);
      tp.rcyl(0x4a5060, 0.16, 0.14, 0.04, [x, 0.07, z], null, 12);
      tp.cyl(0x4a5060, 0.06, 0.08, 2.6, [x, 1.4, z], null, 10);
      tp.sph(0xfff0a8, 0.26, [x, 2.85, z], null, null, 14, 10);
      tp.rcyl(0x4a5060, 0.3, 0.07, 0.03, [x, 3.1, z], null, 12);
    };
    for (let z = R.minZ + 4; z < R.maxZ - 2; z += 9) {
      if (Math.abs(z - (X.minZ + X.maxZ) / 2) < 7) continue;
      lamp(R.minX + 0.8, z); lamp(R.maxX - 0.8, z);
    }
    const tp = chunk(R.minX, R.minZ);
    for (const px of [R.minX - 0.6, R.maxX + 0.6]) {
      const z = R.minZ - 1.5;
      const c = chunk(px, z);
      c.rbox(0xf6ecd6, 1.1, 1.9, 1.1, 0.25, [px, 0.95, z]);
      c.rbox(0xe0d2b4, 1.35, 0.22, 1.35, 0.09, [px, 1.95, z]);
      c.sph(0xff6fa5, 0.52, [px, 2.5, z], null, null, 14, 10);
      exclusions.push({ x: px, z, r: 1.6 });
    }
    void tp;
    const tub = (x, z, c1, c2) => {
      const cc = chunk(x, z);
      cc.rcyl(0xe07a4a, 0.5, 0.42, 0.07, [x, 0.21, z], null, 16);
      cc.sph(0x45b84e, 0.46, [x, 0.55, z], [1, 0.7, 1], null, 12, 8);
      for (let k = 0; k < 5; k++) cc.sph([c1, c2, 0xffffff, c1, c2][k], 0.15, [x + Math.cos(k * 1.26) * 0.3, 0.78 + (k % 2) * 0.05, z + Math.sin(k * 1.26) * 0.3], null, null, 8, 6);
    };
    for (const [x, z, a, b] of [[R.minX - 1.0, R.minZ + 3, 0xff5d8f, 0xffd23f], [R.maxX + 1.0, R.minZ + 3, 0xffd23f, 0xff5d8f], [R.minX - 1.0, R.minZ + 5.2, 0xffd23f, 0x9b5cff], [R.maxX + 1.0, R.minZ + 5.2, 0x9b5cff, 0xff5d8f],
      [X.minX - 1.0, X.minZ + 1.5, 0xff5d8f, 0xffd23f], [X.minX - 1.0, X.maxZ - 1.5, 0xffd23f, 0x9b5cff], [X.maxX + 1.0, X.minZ + 1.5, 0xffd23f, 0xff5d8f], [X.maxX + 1.0, X.maxZ - 1.5, 0x9b5cff, 0xffd23f]]) tub(x, z, a, b);
  }

  // ---------------------------------------------------------------- plots ---
  const stripeTex = stripeTexture();
  const dashTex = dashedPlotTexture();
  const stripeMat = litMaterial({ map: stripeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x1c4a3a, transparent: true, opacity: 0.34, depthWrite: false });
  const dashMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const plane = (w, d, mat, y, order = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = order; m.receiveShadow = true;
    return m;
  };
  const woodMat = litMaterial({ color: 0xb9824a });
  const signBoard = (lines, bg, w, h, cacheKey) => {
    const tex = signTexture(lines, bg, '#ffffff', 640, Math.round(640 * h / w));
    void cacheKey;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: tex }));
  };

  const farmViews = PLOTS.map((f, idx) => {
    const p = f.rect;
    const shop = G.stations.get(f.shop), bed = G.stations.get(f.source);
    const C = shop.def.counter;
    const cx = f.origin.x, cz = f.origin.z;
    const view = { f, lock: new THREE.Group(), furniture: [], built: false };
    root.add(view.lock);
    const Lw = (lx, lz) => ({ x: cx + f.flip * lx, z: cz + lz });

    // lawn with mowing stripes (always)
    const sm = stripeMat.clone();
    sm.map = stripeTex.clone(); sm.map.needsUpdate = true; sm.map.repeat.set(13, 1);
    sm.customProgramCacheKey = stripeMat.customProgramCacheKey; sm.onBeforeCompile = stripeMat.onBeforeCompile; sm.shadowSide = stripeMat.shadowSide;
    const lawn = plane(26, 26, sm, 0.012, 0);
    lawn.position.x = cx; lawn.position.z = cz;
    lawn.matrixAutoUpdate = false; lawn.updateMatrix();
    root.add(lawn);

    // locked dressing: dimmed lawn, dashed outline, FOR SALE sign
    const dim = plane(26, 26, dimMat, 0.02, 1);
    dim.position.set(cx, 0.02, cz);
    const dash = plane(26.4, 26.4, dashMat, 0.03, 2);
    dash.position.set(cx, 0.03, cz);
    view.lock.add(dim, dash);
    if (f.sign) {
      const sg = new THREE.Group();
      const post = new Parts();
      post.rbox(0x8a5a30, 0.24, 2.2, 0.24, 0.08, [-1.1, 1.1, 0]);
      post.rbox(0x8a5a30, 0.24, 2.2, 0.24, 0.08, [1.1, 1.1, 0]);
      post.rbox(0xb9824a, 3.0, 1.8, 0.16, 0.12, [0, 1.75, -0.02]);
      const pm = meshOf(post.merged({ ao: true })); sg.add(pm);
      const board = signBoard([{ text: 'FOR SALE', size: 100, color: '#ffffff', stroke: '#a33a2a' }, { text: f.name.split(' ')[0], size: 58, color: '#ffe9a8', stroke: '#6b3a1a' }], '#e8553d', 2.7, 1.6);
      board.position.set(0, 1.75, 0.07);
      sg.add(board);
      sg.position.set(f.sign.x, 0, f.sign.z);
      sg.scale.setScalar(1.25);
      sg.rotation.y = FACE_CAMERA;
      view.lock.add(sg);
      view.sign = sg;
    }

    // --- furniture (appears when the plot is bought) ---
    const fu = [];
    // soil bed with a rounded timber border
    {
      const b = bed.harvest.bounds, m = 1.0;
      const w = b.maxX - b.minX + 2 * m, d = b.maxZ - b.minZ + 2 * m;
      const g = new THREE.Group();
      const soil = makeGround('soil', w, d, { tile: 3, color: 0x7d4d2c, seed: 11 + idx });
      soil.position.y = 0.022;
      const fp = new Parts();
      const fh = 0.32, ft = 0.4;
      fp.rbox(0xcd8f4e, w + ft, fh, ft, 0.14, [0, fh / 2 - 0.02, -d / 2]);
      fp.rbox(0xcd8f4e, w + ft, fh, ft, 0.14, [0, fh / 2 - 0.02, d / 2]);
      fp.rbox(0xcd8f4e, ft, fh, d, 0.14, [-w / 2, fh / 2 - 0.02, 0]);
      fp.rbox(0xcd8f4e, ft, fh, d, 0.14, [w / 2, fh / 2 - 0.02, 0]);
      for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) fp.rbox(0xa5652c, ft + 0.1, fh + 0.1, ft + 0.1, 0.16, [sx2 * w / 2, (fh + 0.1) / 2 - 0.02, sz2 * d / 2]);
      const fm = meshOf(fp.merged({ ao: { ground: 0.2, groundH: 0.3, down: 0.1, noBoxes: true } }), { receive: true });
      fm.name = 'bed-border';
      g.add(soil, fm);
      g.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
      fu.push(g);
    }
    // counter
    {
      const c = makeCounter(f.color);
      c.position.set(C.x, 0, C.z);
      c.rotation.y = C.yaw;
      fu.push(c);
    }
    // decals: SELL bay and cash pad
    {
      const dz = shop.def.dropZone, cp = shop.def.cashPile;
      const sd = makeDropDecal('SELL', 3.4);
      sd.position.set(dz.x, 0.04, dz.z);
      fu.push(sd);
      const cd = makeCashDecal(3.0);
      cd.position.set(cp.x, 0.04, cp.z);
      fu.push(cd);
    }
    // paved queue strip from the counter to the road
    {
      const a = Lw(6.9, -1.6), b2 = Lw(13.1, 1.6);
      const q = makeGround('paving', 6.2, 3.2, { color: 0xe9dcbc, tile: 3, seed: 21, y: 0.02 });
      q.position.set((a.x + b2.x) / 2, 0.021, (a.z + b2.z) / 2);
      q.matrixAutoUpdate = false; q.updateMatrix();
      fu.push(q);
    }
    // hedges (road sides), picket fences (other sides), corner pillars, corner flower tubs: one merged mesh
    {
      const bp = new Parts();
      const rnd = rng(900 + idx);
      const edges = [
        { axis: 'x', c: p.minX, a: p.minZ, b: p.maxZ, out: [-1, 0] },
        { axis: 'x', c: p.maxX, a: p.minZ, b: p.maxZ, out: [1, 0] },
        { axis: 'z', c: p.minZ, a: p.minX, b: p.maxX, out: [0, -1] },
        { axis: 'z', c: p.maxZ, a: p.minX, b: p.maxX, out: [0, 1] },
      ];
      const hedgeSeg = (x, z, len, alongX) => {
        const w = 0.95, h = 1.0;
        const j = (rnd() - 0.5) * 0.06;
        bp.rbox(0x2f9e44, alongX ? len : w, h * 0.7, alongX ? w : len, 0.3, [x, h * 0.35, z], null, null, 1);
        bp.rbox(0x4cc65a, alongX ? len - 0.16 : w - 0.2, h * 0.5, alongX ? w - 0.2 : len - 0.16, 0.24, [x, h * 0.72 + j, z], null, null, 1);
        if (rnd() < 0.5) bp.sph([0xffffff, 0xff9ec7, 0xffe14d][(rnd() * 3) | 0], 0.13, [x + (rnd() - 0.5) * (alongX ? len * 0.6 : 0.3), h + 0.02, z + (rnd() - 0.5) * (alongX ? 0.3 : len * 0.6)], null, null, 8, 6);
      };
      const picket = (x, z, alongX) => {
        bp.box(0xffffff, alongX ? 0.15 : 0.06, 0.72, alongX ? 0.06 : 0.15, [x, 0.36, z]);
        bp.cone(0xffffff, 0.09, 0.16, [x, 0.8, z], null, 4, alongX ? [1, 1, 0.45] : [0.45, 1, 1], false);
      };
      for (const e of edges) {
        const mx = e.axis === 'x' ? e.c + e.out[0] * 1.5 : (e.a + e.b) / 2;
        const mz = e.axis === 'z' ? e.c + e.out[1] * 1.5 : (e.a + e.b) / 2;
        const roadSide = inRoad(mx, mz);
        const alongX = e.axis === 'z';
        const mid = e.axis === 'x' ? cz : cx;
        const gap = roadSide ? 3.6 : 0;
        const addRange = (s0, s1) => {
          if (s1 - s0 < 0.2) return;
          if (roadSide) {
            const n = Math.max(1, Math.round((s1 - s0) / 1.7));
            const sl = (s1 - s0) / n;
            for (let i = 0; i < n; i++) {
              const s = s0 + (i + 0.5) * sl;
              hedgeSeg(e.axis === 'x' ? e.c : s, e.axis === 'x' ? s : e.c, sl - 0.04, alongX);
            }
          } else {
            const n = Math.round((s1 - s0) / 0.42);
            for (let i = 0; i < n; i++) {
              const s = s0 + (i + 0.5) * ((s1 - s0) / n);
              picket(e.axis === 'x' ? e.c : s, e.axis === 'x' ? s : e.c, alongX);
            }
            for (const yy of [0.22, 0.52]) {
              if (alongX) bp.rbox(0xf2f2f2, s1 - s0, 0.08, 0.06, 0.02, [(s0 + s1) / 2, yy, e.c + 0.07], null, null, 1);
              else bp.rbox(0xf2f2f2, 0.06, 0.08, s1 - s0, 0.02, [e.c + 0.07, yy, (s0 + s1) / 2], null, null, 1);
            }
            const np = Math.max(2, Math.round((s1 - s0) / 3.2) + 1);
            for (let i = 0; i < np; i++) {
              const s = s0 + (i / (np - 1)) * (s1 - s0);
              bp.rbox(0xeeeef6, 0.22, 1.0, 0.22, 0.07, e.axis === 'x' ? [e.c, 0.5, s] : [s, 0.5, e.c], null, null, 1);
            }
          }
        };
        if (roadSide) {
          addRange(e.a, mid - gap); addRange(mid + gap, e.b);
          for (const s of [mid - gap, mid + gap]) {   // gate pillars with a ball in the plot's colour
            const pp = e.axis === 'x' ? [e.c, 0, s] : [s, 0, e.c];
            bp.rbox(0xf6ecd6, 0.6, 1.45, 0.6, 0.16, [pp[0], 0.72, pp[2]]);
            bp.rbox(0xe0d2b4, 0.78, 0.16, 0.78, 0.07, [pp[0], 1.5, pp[2]]);
            bp.sph(f.color, 0.27, [pp[0], 1.82, pp[2]], null, null, 10, 7);
          }
        } else addRange(e.a, e.b);
      }
      for (const sx2 of [p.minX, p.maxX]) for (const sz2 of [p.minZ, p.maxZ]) {
        bp.rbox(0xf6ecd6, 0.7, 1.4, 0.7, 0.18, [sx2, 0.7, sz2]);
        bp.rbox(0xe0d2b4, 0.88, 0.16, 0.88, 0.07, [sx2, 1.45, sz2]);
        bp.sph(0xffffff, 0.24, [sx2, 1.76, sz2], null, null, 10, 7);
      }
      // flower tubs in the lawn corners and by the counter
      for (const [lx, lz, c1, c2] of [[-11.2, -11.2, f.color, 0xffffff], [-11.2, 11.2, f.color, 0xffe14d], [11.2, 11.2, 0xffffff, f.color], [11.2, -11.2, 0xffe14d, f.color], [8.0, 3.4, f.color, 0xffffff]]) {
        const q = Lw(lx, lz);
        bp.rcyl(0xe07a4a, 0.55, 0.48, 0.08, [q.x, 0.24, q.z], null, 12);
        bp.sph(0x45b84e, 0.52, [q.x, 0.6, q.z], [1, 0.7, 1], null, 9, 6);
        for (let k = 0; k < 6; k++) bp.sph(k % 2 ? c1 : c2, 0.17, [q.x + Math.cos(k * 1.05) * 0.33, 0.85 + (k % 3) * 0.05, q.z + Math.sin(k * 1.05) * 0.33], null, null, 7, 5);
      }
      // no real shadow for the hedges and fences (about 17k triangles per plot); baked AO grounds them
      const m = meshOf(bp.merged({ ao: { ground: 0.2, groundH: 0.45, down: 0.05, noBoxes: true } }), { cast: false, receive: true });
      m.name = 'plot-fence';
      const g = new THREE.Group();
      g.position.set(cx, 0, cz);
      m.position.set(-cx, 0, -cz);       // geometry is in world coordinates: pivot the pop-in at the plot centre
      g.add(m);
      fu.push(g);
    }
    for (const o of fu) { o.visible = false; root.add(o); }
    view.furniture = fu;
    return view;
  });

  const showFarm = (i, animate) => {
    const v = farmViews[i];
    if (v.built) return;
    v.built = true;
    v.lock.visible = false;
    v.furniture.forEach((o, k) => {
      o.visible = true;
      if (animate) popIn(o, k * 0.12);
    });
  };

  // ------------------------------------------------------------ greenhouse ---
  // the garden quadrant: striped lawn, paved forecourt, hedges, topiary, flower beds
  {
    const cxq = (QUAD.minX + QUAD.maxX) / 2, czq = (QUAD.minZ + QUAD.maxZ) / 2;
    const sm = stripeMat.clone();
    sm.map = stripeTex.clone(); sm.map.needsUpdate = true; sm.map.repeat.set(13, 1);
    sm.customProgramCacheKey = stripeMat.customProgramCacheKey; sm.onBeforeCompile = stripeMat.onBeforeCompile; sm.shadowSide = stripeMat.shadowSide;
    const lawn = plane(26, 26, sm, 0.012, 0);
    lawn.position.set(cxq, 0.012, czq);
    lawn.matrixAutoUpdate = false; lawn.updateMatrix();
    root.add(lawn);
    // forecourt path from the cross road to the greenhouse door
    const fp = makeGround('paving', 8, 12.5, { color: 0xe9dcbc, tile: 4, seed: 33, y: 0.02 });
    fp.position.set(GH.x, 0.02, QUAD.minZ + 6.2);
    fp.matrixAutoUpdate = false; fp.updateMatrix();
    root.add(fp);
    const gp = new Parts();
    const rnd = rng(77);
    // low trimmed hedge borders on both sides of the path, topiary at the corners of the court
    for (const sx of [-1, 1]) {
      const x = GH.x + sx * 4.5;
      gp.rbox(0x2f9e44, 0.9, 0.9, 11.5, 0.3, [x, 0.45, QUAD.minZ + 6.2], null, null, 1);
      gp.rbox(0x4cc65a, 0.7, 0.45, 11.3, 0.22, [x, 0.9, QUAD.minZ + 6.2], null, null, 1);
    }
    for (const [x, z] of [[GH.x - 3.6, QUAD.minZ + 1.6], [GH.x + 3.6, QUAD.minZ + 1.6], [GH.x - 3.6, QUAD.minZ + 9.0], [GH.x + 3.6, QUAD.minZ + 9.0]]) {
      gp.rcyl(0xe07a4a, 0.5, 0.5, 0.07, [x, 0.25, z], null, 16);
      gp.cyl(0x8b5a2b, 0.07, 0.07, 0.5, [x, 0.7, z], null, 8);
      gp.sph(0x3cb857, 0.7, [x, 1.4, z], null, null, 12, 8);
    }
    // flower beds in the four corners of the quadrant, ringed with soft stone
    for (const [x, z] of [[QUAD.minX + 4.2, QUAD.minZ + 4.0], [QUAD.maxX - 4.2, QUAD.minZ + 4.0], [QUAD.minX + 4.2, QUAD.maxZ - 4.2], [QUAD.maxX - 4.2, QUAD.maxZ - 4.2]]) {
      gp.rcyl(0xe9dcc3, 2.2, 0.36, 0.1, [x, 0.18, z], null, 18);
      gp.rcyl(0x7d4d2c, 1.9, 0.4, 0.06, [x, 0.2, z], null, 18);
      for (let k = 0; k < 22; k++) {
        const a = k * 2.4, rr2 = Math.sqrt((k + 0.5) / 22) * 1.6;
        gp.sph([0xff4d7d, 0xffd23f, 0x9b5cff, 0xffffff, 0xff9ec7][k % 5], 0.2 + rnd() * 0.06, [x + Math.cos(a) * rr2, 0.56 + rnd() * 0.12, z + Math.sin(a) * rr2], null, null, 7, 5);
      }
    }
    // outer hedge on the two outer sides of the quadrant
    gp.rbox(0x2f9e44, 25.6, 1.0, 0.95, 0.3, [cxq, 0.5, QUAD.maxZ - 0.3], null, null, 1);
    gp.rbox(0x4cc65a, 25.4, 0.5, 0.75, 0.22, [cxq, 0.95, QUAD.maxZ - 0.3], null, null, 1);
    gp.rbox(0x2f9e44, 0.95, 1.0, 25.6, 0.3, [QUAD.maxX - 0.3, 0.5, czq], null, null, 1);
    gp.rbox(0x4cc65a, 0.75, 0.5, 25.4, 0.22, [QUAD.maxX - 0.3, 0.95, czq], null, null, 1);
    // blossom trees and benches in the garden
    for (const [x, z, c] of [[QUAD.minX + 2.0, GH.z, 0xffb3d1], [QUAD.maxX - 2.2, GH.z - 1, 0xffc2dc], [QUAD.minX + 2.0, QUAD.maxZ - 2.2, 0xffd0e4]]) {
      gp.cyl(0x9a6a3c, 0.22, 0.32, 1.6, [x, 0.8, z], null, 10);
      gp.sph(c, 1.5, [x, 2.7, z], [1, 0.9, 1], null, 12, 8);
      gp.sph(c, 0.95, [x - 0.8, 2.3, z + 0.5], null, null, 9, 6);
    }
    const gm = addMesh(root, gp.merged({ ao: { ground: 0.15, groundH: 0.4, down: 0.05, noBoxes: true } }));
    void gm;
  }

  const site = new THREE.Group();
  {
    const sp = new Parts();
    sp.rbox(0xa7845a, GH.w + 1.6, 0.14, GH.d + 1.6, 0.06, [0, 0.07, 0]);
    sp.rbox(0xc09c6c, GH.w - 0.4, 0.16, GH.d - 0.4, 0.06, [0, 0.09, 0]);
    // barrier fence: posts + striped rails
    const px0 = -GH.w / 2 - 1.2, px1 = GH.w / 2 + 1.2, pz0 = -GH.d / 2 - 1.2, pz1 = GH.d / 2 + 1.2;
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / 0.9);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        for (const yy of [0.55, 0.92]) sp.rbox(i % 2 ? 0xff8a2a : 0xffffff, 0.09, 0.22, len / n, 0.04, [x, yy, z], [0, ang, 0], null, 1);
      }
      for (let i = 0; i <= Math.round(len / 2.4); i++) {
        const t = i / Math.round(len / 2.4);
        sp.rbox(0xffffff, 0.16, 1.15, 0.16, 0.06, [x0 + (x1 - x0) * t, 0.58, z0 + (z1 - z0) * t], null, null, 1);
      }
    };
    rail(px0, pz0, px1, pz0); rail(px0, pz1, px1, pz1); rail(px0, pz0, px0, pz1); rail(px1, pz0, px1, pz1);
    // lumber, sacks, crates, cones, a ladder
    for (let i = 0; i < 5; i++) sp.rbox(0xe0b070, 2.4, 0.17, 0.36, 0.06, [-2.5, 0.28 + i * 0.18, 0.5 + (i % 2) * 0.03], null, null, 1);
    for (let i = 0; i < 4; i++) sp.rbox(0xdde7ef, 1.6, 0.2, 0.52, 0.09, [2.6, 0.28 + i * 0.21, -1.2]);
    sp.rbox(0xcfa56a, 0.65, 0.65, 0.65, 0.1, [0.2, 0.43, 2.0]);
    sp.rbox(0xcfa56a, 0.65, 0.65, 0.65, 0.1, [0.9, 0.43, 2.3]);
    for (const [cxx, czz] of [[px0 + 0.1, pz0 + 0.3], [px1 - 0.1, pz0 + 0.3], [0.9, pz0 + 0.1], [-0.9, pz0 + 0.1]]) {
      sp.cone(0xff7a1a, 0.24, 0.6, [cxx, 0.35, czz], null, 14);
      sp.rbox(0xffffff, 0.34, 0.12, 0.34, 0.05, [cxx, 0.14, czz], null, null, 1);
    }
    sp.rbox(0xffd23f, 0.95, 0.55, 0.95, 0.14, [-3.6, 0.4, -2.4]);
    sp.rbox(0x8a5a30, 0.2, 2.4, 0.2, 0.07, [-4.2, 1.3, 2.3]);
    sp.rbox(0x8a5a30, 0.2, 2.4, 0.2, 0.07, [-3.7, 1.3, 2.5]);
    for (let i = 0; i < 6; i++) sp.rbox(0x8a5a30, 0.7, 0.1, 0.1, 0.04, [-3.95, 0.5 + i * 0.4, 2.4], [0, 0.25, 0], null, 1);
    sp.rbox(0xc9d2de, 0.5, 0.5, 0.5, 0.1, [-1.2, 0.35, -2.8]);      // a barrow of cement
    site.add(meshOf(sp.merged({ ao: { ground: 0.15, groundH: 0.3, down: 0.05, noBoxes: true } }), { receive: true }));
    // sign
    const post = new Parts();
    post.rbox(0x8a5a30, 0.24, 2.6, 0.24, 0.08, [-1.6, 1.3, 0]);
    post.rbox(0x8a5a30, 0.24, 2.6, 0.24, 0.08, [1.6, 1.3, 0]);
    post.rbox(0xb9824a, 4.5, 2.8, 0.16, 0.14, [0, 2.0, -0.02]);
    const sgn = new THREE.Group();
    sgn.add(meshOf(post.merged({ ao: true })));
    const board = signBoard([{ text: 'COMING SOON', size: 66, color: '#ffe27a', stroke: '#6b3a1a' }, { text: 'GRAND', size: 70, color: '#ffffff', stroke: '#2a8a4a' }, { text: 'GREENHOUSE', size: 62, color: '#ffffff', stroke: '#2a8a4a' }], '#3dbb6a', 4.2, 2.5);
    board.position.set(0, 2.0, 0.07);
    sgn.add(board);
    sgn.position.set(-2.5, 0, -GH.d / 2 - 1.9);
    sgn.rotation.y = FACE_CAMERA;
    site.add(sgn);
  }
  site.position.set(GH.x, 0, GH.z);
  root.add(site);
  const greenhouse = makeGreenhouse();
  greenhouse.position.set(GH.x, 0, GH.z);
  greenhouse.visible = false;
  root.add(greenhouse);
  let ghBuilt = false;
  const showGreenhouse = (animate) => {
    if (ghBuilt) return;
    ghBuilt = true;
    site.visible = false;
    greenhouse.visible = true;
    if (animate) popIn(greenhouse, 0.1);
  };

  // ------------------------------------------------------------ travel gate ---
  const gate = new THREE.Group();
  {
    const gm = meshOf(makeGateArch(6.4));
    gate.add(gm);
    const board = signBoard([{ text: 'NEXT WORLD', size: 96, color: '#ffffff', stroke: '#1e6a8a' }], '#3db8e8', 4.4, 1.3);
    board.position.set(0, 4.95, -0.34);
    board.rotation.y = Math.PI;      // faces the camera side (-z)
    gate.add(board);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.3), litMaterial({ map: board.material.map }));
    back.position.set(0, 4.95, 0.34);
    gate.add(back);
    const post = new Parts();
    post.rbox(0xb9824a, 4.7, 1.55, 0.18, 0.14, [0, 4.95, 0]);
    post.rbox(0x8a5a30, 0.14, 0.7, 0.14, 0.05, [-1.9, 4.1, 0]);
    post.rbox(0x8a5a30, 0.14, 0.7, 0.14, 0.05, [1.9, 4.1, 0]);
    gate.add(meshOf(post.merged()));
  }
  gate.position.set(LAY.gate.x, 0, LAY.gate.z + 2.3);
  gate.visible = false;
  root.add(gate);

  // ------------------------------------------------------------ boot state ---
  // chunk meshes last: everything static above is already added; these are the big merged scatters
  for (const c of chunks.values()) {
    const m = addMesh(root, c.merged());
    m.name = 'scenery-chunk';
  }
  for (const c of wildChunks.values()) addMesh(root, c.merged(), { cast: false, receive: true }).name = 'wild-chunk';
  PLOTS.forEach((f, i) => G.stations.onOpen(f.shop, (live) => showFarm(i, live)));
  G.pads.onDone('greenhouse', (live) => {
    showGreenhouse(live);
    gate.visible = true;
    if (live) popIn(gate, 0.6);
  });
  void flowerParts; void glow;

  return {
    root,
    update(dt) {
      for (const a of animated) a(dt);
    },
  };
}
