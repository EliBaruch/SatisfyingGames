// Chicken world scenery: a sunny farmyard. Lit grass, straw hen pens with wooden fences and a hen
// house, animated hens, rounded farm stand, the egg packing machine (belt, gear, lamp, steam),
// silo + trough that show the feed level, the truck stop on the country road, trees / barn /
// windmill / hay, the Giant Golden Egg monument site and the travel gate.
// Station furniture appears through G.stations.onOpen(id, fn(live)); build results through
// G.pads.onDone(padId, fn(live)). Static scenery is merged into a few chunk meshes.
import * as THREE from 'three';
import { Parts as ArtParts, meshOf } from '../../engine/art/parts.js';
import { litMaterial } from '../../engine/art/material.js';
import { makeGround } from '../../engine/art/props.js';
import { getModel } from '../../engine/art/assets.js';
import { rng } from '../../engine/geom.js';
import { addBlob, lodCharacter } from '../../engine/chars.js';
import { canvasTex, roundRect as rr, signTexture, makeDropDecal, makeCashDecal } from '../../engine/decals.js';
import { makeZone } from '../../engine/art/props.js';
import { COLORS, makeStandCounter, makePackerMachine, makeTroughModel, makeHenHouse, makeMonument, makeGateArch } from './models.js';

class Parts extends ArtParts {
  rbox(c, w, h, d, r, pos, rot, scl, seg = 1) { return super.rbox(c, w, h, d, r, pos, rot, scl, seg); }
}

const FACE_CAMERA = -Math.PI * 0.75;
const inRect = (x, z, r, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

function dashRectTexture(w, d) {
  const px = 90;
  return canvasTex(Math.round(w * px), Math.round(d * px), (ctx, W, H) => {
    rr(ctx, 14, 14, W - 28, H - 28, 40);
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,255,255,0.8)'; ctx.shadowBlur = 10;
    ctx.setLineDash([32, 28]); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.stroke();
  });
}

function roadLineTexture() {
  return canvasTex(64, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,244,200,0.95)';
    ctx.fillRect(w / 2 - 5, 24, 10, 100);
  }, { repeat: true });
}

// ----------------------------------------------------------------- the world --
export function createScene(G) {
  const LAY = G.world.layout;
  const PADS = G.world.pads;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const animated = [];
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const pop = (obj) => { if (G.fx && G.fx.pop) G.fx.pop(obj); };
  const addMesh = (parent, geometry, { cast = true, receive = true } = {}) => {
    const m = meshOf(geometry, { cast, receive });
    m.matrixAutoUpdate = false; m.updateMatrix();
    parent.add(m);
    return m;
  };
  const plane = (w, d, mat, y, order = 1) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = order; m.receiveShadow = true;
    return m;
  };
  const place = (o, x, z, yaw = 0, y = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };
  const signBoard = (lines, bg, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: signTexture(lines, bg, '#ffffff', 640, Math.round(640 * h / w)) }));

  const R = LAY.road, PA = LAY.penA, PB = LAY.penB, MON = LAY.monument, GATE = LAY.gate;
  const stand = G.stations.get('stand');
  const packer = G.stations.get('packer'), packer2 = G.stations.get('packer2');
  const trough = G.stations.get('trough'), trough2 = G.stations.get('trough2');
  const silo = G.stations.get('silo');
  const truckcash = G.stations.get('truckcash');

  // while the packer is built, raw eggs go to the packer, not the stand (collectors keep working)
  {
    const d = stand.drop;
    const orig = d.accepts;
    let packed = false;
    d.accepts = (k) => (k === 'egg' && packed ? false : orig(k));
    G.pads.onDone('packer', () => { packed = true; });
  }

  // ---------------------------------------------------------------- ground --
  {
    const gb = LAY.ground;
    const ground = makeGround('grass', gb.maxX - gb.minX, gb.maxZ - gb.minZ, { tile: 9, seed: 5 });
    ground.position.set((gb.minX + gb.maxX) / 2, 0, (gb.minZ + gb.maxZ) / 2);
    ground.matrixAutoUpdate = false; ground.updateMatrix();
    root.add(ground);
  }

  // ------------------------------------------------------------------ road --
  {
    const rw = R.maxX - R.minX, rl = R.maxZ - R.minZ, cx = (R.minX + R.maxX) / 2, cz = (R.minZ + R.maxZ) / 2;
    const asphalt = makeGround('paving', rw, rl, { color: 0x8c93a1, tile: 5, seed: 8, y: 0.02 });
    asphalt.position.set(cx, 0.02, cz); asphalt.matrixAutoUpdate = false; asphalt.updateMatrix(); root.add(asphalt);
    // sidewalk strips (customers walk here)
    for (const [x0, x1] of [[R.minX, R.minX + 1.9], [R.maxX - 2.9, R.maxX]]) {
      const s = makeGround('paving', x1 - x0, rl, { color: 0xeadfc2, tile: 4, seed: 9, y: 0.03 });
      s.position.set((x0 + x1) / 2, 0.03, cz); s.matrixAutoUpdate = false; s.updateMatrix(); root.add(s);
    }
    // dashed centre line
    const lt = roadLineTexture(); lt.repeat.set(1, rl / 4);
    const line = plane(0.6, rl, new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), 0.04, 2);
    line.position.set(cx - 0.3, 0.04, cz);
    line.matrixAutoUpdate = false; line.updateMatrix(); root.add(line);
    const kp = new Parts();
    for (const x of [R.minX - 0.15, R.maxX + 0.15]) kp.rbox(0xfff3da, 0.34, 0.2, rl, 0.09, [x, 0.08, cz]);
    addMesh(root, kp.merged({ ao: { ground: 0.1, groundH: 0.1, down: 0, noBoxes: true } }), { cast: false });
  }

  // ------------------------------------------------------- scenery layout ---
  const exclusions = [];
  const PADV = PADS.map((p) => p.pos);
  const blocked = (x, z, pad) => {
    if (inRect(x, z, PA, pad + 1) || inRect(x, z, PB, pad + 1)) return true;
    if (inRect(x, z, R, pad)) return true;
    if (inRect(x, z, { minX: -8, maxX: 36, minZ: -8, maxZ: 52 }, pad - 3)) return true;     // keep the working yard open
    if (inRect(x, z, { minX: MON.x - 8, maxX: MON.x + 8, minZ: MON.z - 8, maxZ: MON.z + 8 }, pad)) return true;
    for (const p of PADV) if (Math.hypot(x - p.x, z - p.z) < 3.4 + pad * 0.3) return true;
    for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r + pad * 0.5) return true;
    return false;
  };
  const CH = 24;
  const mk = () => new Map();
  const chunks = mk(), wildChunks = mk();
  const chunkOf = (map) => (x, z) => {
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let c = map.get(k);
    if (!c) { c = new Parts(); map.set(k, c); }
    return c;
  };
  const chunk = chunkOf(chunks), wildChunk = chunkOf(wildChunks);
  const AO = { ground: 0.14, groundH: 0.55, down: 0.1, noBoxes: true };
  const packModel = (id, cx, cz, { yaw = FACE_CAMERA, s = 1, r = 4, ...o } = {}) => {
    chunk(cx, cz).model(id, { pos: [cx, 0, cz], rot: [0, yaw, 0], scl: [s, s, s], ao: AO, ...o });
    exclusions.push({ x: cx, z: cz, r });
  };

  // big buildings on the outside of the yard
  packModel('farmbuildings/Barn', -16, 31, { scale: 1.6, r: 7 });
  packModel('farmbuildings/OpenBarn', -16, 50, { scale: 1.5, r: 6 });
  packModel('farmbuildings/Silo', -16, 40, { scale: 1.3, r: 3.5 });
  packModel('farmbuildings/Windmill', 12, 62, { scale: 1.5, r: 5 });
  packModel('farmbuildings/Barn', 52, 8, { scale: 1.5, r: 7 });
  packModel('farmbuildings/Silo', 54, -8, { scale: 1.3, r: 3.5 });
  packModel('farmbuildings/Windmill', 52, 62, { scale: 1.5, r: 5 });
  // tractor parked by the barn
  chunk(-13, 21).model('car-kit/tractor', { pos: [-13, 0, 21], rot: [0, 0.6, 0], ao: AO });
  exclusions.push({ x: -13, z: 21, r: 3 });
  // crop rows and corn
  for (let i = 0; i < 4; i++) {
    chunk(-14 + i * 2.2, 6).model('nature-kit/crops_wheatStageA', { pos: [-14 + i * 2.2, 0, 6], rot: [0, FACE_CAMERA, 0], scale: 1.6 });
    chunk(-14 + i * 2.2, 3).model('nature-kit/crops_wheatStageA', { pos: [-14 + i * 2.2, 0, 3], rot: [0, FACE_CAMERA, 0], scale: 1.6 });
  }
  exclusions.push({ x: -8, z: 5, r: 8 });
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) chunk(46 + j * 1.6, -2 + i * 1.5).model('nature-kit/crops_cornStageD', { pos: [46 + j * 1.6, 0, -2 + i * 1.5], scale: 1.2 });
  exclusions.push({ x: 47, z: 1, r: 6 });

  // hay bales
  for (const [x, z] of [[-9, 26], [-10.5, 24.5], [-7.4, 24.2], [48, 36], [49.6, 35]]) {
    const tp = chunk(x, z);
    tp.rcyl(0xe8c25a, 0.62, 0.9, 0.12, [x, 0.62, z], [Math.PI / 2, 0.3, 0], 18);
    tp.rcyl(0xe0b648, 0.55, 0.92, 0.12, [x + 1.3, 0.55, z + 0.2], [Math.PI / 2, 0.1, 0], 18);
  }

  // trees, bushes, rocks, wildflowers
  {
    const rnd = rng(77);
    const TREES = [['nature-kit/tree_default', 4.0, 0.3], ['nature-kit/tree_oak', 3.6, 0.25], ['nature-kit/tree_fat', 3.5, 0.2], ['nature-kit/tree_small', 3.4, 0.15], ['nature-kit/tree_pineTallA', 4.4, 0.1]];
    const pickTree = () => { let v = rnd(); for (const t of TREES) { v -= t[2]; if (v < 0) return t; } return TREES[0]; };
    const tints = [0xffffff, 0xf0ffe0, 0xe6ffe6, 0xfff8d8];
    const tree = (x, z, big = 1) => {
      const t = pickTree(); const sc = (0.85 + rnd() * 0.45) * big;
      chunk(x, z).model(t[0], { height: t[1], pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], tint: tints[(rnd() * tints.length) | 0], ao: AO });
    };
    const BUSH = [['nature-kit/plant_bush', 1.5], ['nature-kit/plant_bushLarge', 1.7], ['nature-kit/plant_bushDetailed', 1.9]];
    const bush = (x, z, s = 1) => {
      const b = BUSH[(rnd() * 3) | 0]; const sc = (0.8 + rnd() * 0.5) * s;
      chunk(x, z).model(b[0], { width: b[1], pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], ao: { ground: 0.2, groundH: 0.3, down: 0.1, noBoxes: true } });
    };
    const ROCKS = [['nature-kit/rock_largeA', 1.7], ['nature-kit/rock_smallA', 0.9], ['nature-kit/rock_smallD', 1.0], ['nature-kit/rock_tallA', 1.6]];
    const rock = (x, z) => { const k = ROCKS[(rnd() * ROCKS.length) | 0]; const sc = 0.7 + rnd() * 0.6; chunk(x, z).model(k[0], { width: k[1], pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], ao: { ground: 0.15, groundH: 0.25, down: 0.05, noBoxes: true } }); };
    const WILD = ['nature-kit/flower_redA', 'nature-kit/flower_yellowA', 'nature-kit/flower_purpleA'];
    const wild = (x, z) => { const sc = 0.9 + rnd() * 0.6; wildChunk(x, z).model(WILD[(rnd() * 3) | 0], { height: 0.6, pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc] }); };
    const step = 6.5;
    for (let gx = -52; gx < 96; gx += step) for (let gz = -48; gz < 96; gz += step) {
      const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
      if (blocked(x, z, 3.2)) continue;
      if (rnd() < 0.3) continue;
      tree(x, z);
    }
    const hug = (rect, gap) => {
      for (let t = rect.minX; t <= rect.maxX; t += 2.4 + rnd() * 2.6) for (const z of [rect.minZ - gap, rect.maxZ + gap]) if (!blocked(t, z, 0.2) && rnd() < 0.5) bush(t, z);
    };
    hug({ minX: PA.minX, maxX: PA.maxX, minZ: PA.minZ, maxZ: PA.maxZ }, 2.2);
    hug({ minX: PB.minX, maxX: PB.maxX, minZ: PB.minZ, maxZ: PB.maxZ }, 2.2);
    for (let i = 0; i < 60; i++) {
      const x = -48 + rnd() * 110, z = -44 + rnd() * 110;
      if (blocked(x, z, 2.5)) continue;
      if (rnd() < 0.7) bush(x, z); else rock(x, z);
    }
    for (let i = 0; i < 140; i++) {
      const x = -46 + rnd() * 106, z = -44 + rnd() * 110;
      if (blocked(x, z, 1.0)) continue;
      for (let k = 0; k < 2; k++) wild(x + (rnd() - 0.5) * 1.4, z + (rnd() - 0.5) * 1.4);
    }
    // grass tufts inside the yard edges (small, no shadow)
    for (let i = 0; i < 80; i++) {
      const x = -8 + rnd() * 44, z = -8 + rnd() * 62;
      if (inRect(x, z, PA, 0.5) || inRect(x, z, PB, 0.5) || inRect(x, z, R, 0.5) || PADV.some((p) => Math.hypot(x - p.x, z - p.z) < 3)) continue;
      if (Math.hypot(x - 17, z - 2) < 5 || Math.hypot(x - 17, z - 36) < 5 || Math.hypot(x - 17, z - 12) < 5) continue;
      wildChunk(x, z).model('nature-kit/grass', { height: 0.5, pos: [x, 0, z], rot: [0, rnd() * 6.28, 0] });
    }
  }

  // road dressing: lamp posts, bale of signs
  {
    const lamp = (x, z) => {
      const tp = chunk(x, z);
      tp.rcyl(0x4a5060, 0.16, 0.14, 0.04, [x, 0.07, z], null, 12);
      tp.cyl(0x4a5060, 0.06, 0.08, 2.6, [x, 1.4, z], null, 10);
      tp.sph(0xfff0a8, 0.26, [x, 2.85, z], null, null, 14, 10);
    };
    for (let z = -40; z < 90; z += 12) lamp(R.minX + 0.9, z + 6);
    // mailbox + painted stop line near the stand lane are drawn below
  }

  // ------------------------------------------------------------- pens ------
  const strawMat = (rect, seed) => {
    const w = rect.maxX - rect.minX, d = rect.maxZ - rect.minZ;
    const s = makeGround('soil', w, d, { color: 0xe3b86a, tile: 3.5, seed, y: 0.015 });
    s.position.set((rect.minX + rect.maxX) / 2, 0.015, (rect.minZ + rect.maxZ) / 2);
    s.matrixAutoUpdate = false; s.updateMatrix();
    return s;
  };
  /** posts + two rails around a rect; gate gap on the +x edge around gz */
  const fenceRect = (rect, gz) => {
    const p = new Parts();
    const post = (x, z) => p.rbox(0xa9703a, 0.22, 1.05, 0.22, 0.07, [x, 0.52, z]);
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.4, 0.82]) p.rbox(0xd9a566, 0.1, 0.14, len, 0.04, [(x0 + x1) / 2, y, (z0 + z1) / 2], [0, ang, 0]);
      const n = Math.max(1, Math.round(len / 2.2));
      for (let i = 0; i <= n; i++) post(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n);
    };
    rail(rect.minX, rect.minZ, rect.maxX, rect.minZ);
    rail(rect.minX, rect.maxZ, rect.maxX, rect.maxZ);
    rail(rect.minX, rect.minZ, rect.minX, rect.maxZ);
    rail(rect.maxX, rect.minZ, rect.maxX, gz - 1.9);
    rail(rect.maxX, gz + 1.9, rect.maxX, rect.maxZ);
    for (const z of [gz - 1.9, gz + 1.9]) { p.rbox(0xfff1dc, 0.34, 1.35, 0.34, 0.1, [rect.maxX, 0.67, z]); p.sph(COLORS.gold, 0.2, [rect.maxX, 1.5, z], [1, 1.3, 1], null, 8, 6); }
    return meshOf(p.merged({ ao: { ground: 0.2, groundH: 0.4, down: 0.05, noBoxes: true } }), { cast: false, receive: true });
  };
  root.add(strawMat(PA, 31)); root.add(fenceRect(PA, 10));
  // nests bed: soft border around the starting nests
  {
    const b = G.stations.get('nests').harvest.bounds;
    const w = b.maxX - b.minX + 2.2, d = b.maxZ - b.minZ + 2.2;
    const bp = new Parts();
    const ft = 0.34, fh = 0.28;
    bp.rbox(0xcd8f4e, w + ft, fh, ft, 0.12, [0, fh / 2, -d / 2]); bp.rbox(0xcd8f4e, w + ft, fh, ft, 0.12, [0, fh / 2, d / 2]);
    bp.rbox(0xcd8f4e, ft, fh, d, 0.12, [-w / 2, fh / 2, 0]); bp.rbox(0xcd8f4e, ft, fh, d, 0.12, [w / 2, fh / 2, 0]);
    const g = new THREE.Group();
    const straw = makeGround('soil', w, d, { color: 0xf0cc80, tile: 2.5, seed: 4, y: 0.022 });
    g.add(straw, meshOf(bp.merged({ ao: { ground: 0.2, groundH: 0.3, down: 0.1, noBoxes: true } }), { cast: false, receive: true }));
    g.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2);
    root.add(g);
    const eggs = makeZone({ w: w - 0.6, d: d - 0.6, label: '', color: '#fff6c8', fill: 'rgba(255,230,140,0.10)' });
    eggs.position.set((b.minX + b.maxX) / 2, 0.04, (b.minZ + b.maxZ) / 2);
    root.add(eggs);
  }

  // hen house A
  {
    const hm = meshOf(makeHenHouse(), { receive: true });
    const h = new THREE.Group(); h.add(hm);
    place(h, 6.8, 19.0, FACE_CAMERA); h.scale.setScalar(1.0);
    root.add(h);
  }
  // pen B (golden coop): locked until bought
  const lockB = new THREE.Group(); root.add(lockB);
  const furnB = [];
  { const s = strawMat(PB, 41); s.visible = false; furnB.push(s); root.add(s); }
  {
    const fb = fenceRect(PB, 39.5); fb.visible = false; furnB.push(fb); root.add(fb);
    const hm = new THREE.Group(); hm.add(meshOf(makeHenHouse({ gold: true }), { receive: true }));
    place(hm, 6.8, 44.5, FACE_CAMERA); hm.visible = false; furnB.push(hm); root.add(hm);
    const b = G.stations.get('nestsB').harvest.bounds;
    const w = b.maxX - b.minX + 2.2, d = b.maxZ - b.minZ + 2.2;
    const g = new THREE.Group();
    g.add(makeGround('soil', w, d, { color: 0xffd98a, tile: 2.5, seed: 6, y: 0.022 }));
    const ez = makeZone({ w: w - 0.6, d: d - 0.6, label: '', color: '#fff0a0', fill: 'rgba(255,205,70,0.14)' });
    ez.position.y = 0.04; g.add(ez);
    g.position.set((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2); g.visible = false; furnB.push(g); root.add(g);
    // lock dressing
    const dash = plane(PB.maxX - PB.minX + 0.6, PB.maxZ - PB.minZ + 0.6, new THREE.MeshBasicMaterial({ map: dashRectTexture(PB.maxX - PB.minX + 0.6, PB.maxZ - PB.minZ + 0.6), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 0.03, 2);
    dash.position.set((PB.minX + PB.maxX) / 2, 0.03, (PB.minZ + PB.maxZ) / 2);
    const dim = plane(PB.maxX - PB.minX + 24, PB.maxZ - PB.minZ, new THREE.MeshBasicMaterial({ color: 0x2b5a3a, transparent: true, opacity: 0.3, depthWrite: false }), 0.02, 1);
    dim.position.set((PB.minX + PB.maxX) / 2 + 12, 0.02, (PB.minZ + PB.maxZ) / 2);
    lockB.add(dash, dim);
    const sg = new THREE.Group();
    const post = new Parts();
    post.rbox(0x8a5a30, 0.24, 2.2, 0.24, 0.08, [-1.1, 1.1, 0]); post.rbox(0x8a5a30, 0.24, 2.2, 0.24, 0.08, [1.1, 1.1, 0]);
    post.rbox(0xb9824a, 3.0, 1.8, 0.16, 0.12, [0, 1.75, -0.02]);
    sg.add(meshOf(post.merged({ ao: true })));
    const board = signBoard([{ text: 'FOR SALE', size: 96, color: '#ffffff', stroke: '#a33a2a' }, { text: 'GOLDEN COOP', size: 56, color: '#ffe27a', stroke: '#6b3a1a' }], '#e8553d', 2.7, 1.6);
    board.position.set(0, 1.75, 0.07); sg.add(board);
    place(sg, 12.6, 30.5, FACE_CAMERA); sg.scale.setScalar(1.2); lockB.add(sg);
  }

  // ------------------------------------------------------------ hens --------
  const hens = [];
  {
    const OB_A = [{ minX: 4.8, maxX: 8.8, minZ: 17.2, maxZ: 21.6 }, { minX: -5.2, maxX: -1.6, minZ: 18.6, maxZ: 22 }, { minX: 0.2, maxX: 3.8, minZ: 16.4, maxZ: 18 }];
    const dz = PB.minZ - PA.minZ;
    const shift = (r) => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ + dz, maxZ: r.maxZ + dz });
    const bandsA = [{ minX: -5.4, maxX: 9.3, minZ: 14.8, maxZ: 21.2 }, { minX: -5.4, maxX: 9.3, minZ: 6.2, maxZ: 8.0 }];
    const mkHen = (bands, obst, seed, home) => {
      const g = getModel('cube-pets/animal-chick', { scale: 1.45, receive: true });
      const inst = g.userData.instance, clips = g.userData.clips || [];
      const holder = new THREE.Group(); holder.add(g);
      const h = { g: holder, mixer: null, act: {}, bands, obst, band: bands[seed % bands.length], x: 0, z: 0, tx: 0, tz: 0, state: 'idle', t: Math.random() * 3, acc: 0, peck: 0, rnd: rng(100 + seed), hop: 0, yaw: 0, home };
      if (inst) {
        h.mixer = new THREE.AnimationMixer(inst);
        for (const n of ['idle', 'walk']) { const c = clips.find((k) => k.name === n); if (c) { h.act[n] = h.mixer.clipAction(c); h.act[n].play(); h.act[n].setEffectiveWeight(n === 'idle' ? 1 : 0); } }
        h.mixer.update(Math.random());
      }
      const inObst = (x, z) => { for (const o of obst) if (x > o.minX - 0.5 && x < o.maxX + 0.5 && z > o.minZ - 0.5 && z < o.maxZ + 0.5) return true; return false; };
      h.inObst = inObst;
      h.pick = () => {
        for (let k = 0; k < 12; k++) {
          const b = h.band;
          const x = b.minX + h.rnd() * (b.maxX - b.minX), z = b.minZ + h.rnd() * (b.maxZ - b.minZ);
          if (inObst(x, z) || inObst((x + h.x) / 2, (z + h.z) / 2)) continue;
          h.tx = x; h.tz = z; return;
        }
        h.tx = h.x; h.tz = h.z;
      };
      for (let k = 0; k < 20; k++) { h.x = h.band.minX + h.rnd() * (h.band.maxX - h.band.minX); h.z = h.band.minZ + h.rnd() * (h.band.maxZ - h.band.minZ); if (!inObst(h.x, h.z)) break; }
      holder.position.set(h.x, 0, h.z);
      addBlob(holder, 0.55);
      root.add(holder);
      hens.push(h);
      return h;
    };
    for (let i = 0; i < 6; i++) mkHen(bandsA, OB_A, i, 'A');
    const bandsB = bandsA.map(shift), obB = OB_A.map(shift);
    for (let i = 0; i < 3; i++) { const h = mkHen(bandsB, obB, 10 + i, 'B'); h.g.visible = false; h.off = true; }
  }
  const henStep = (h, dt) => {
    if (h.off) return;
    h.t -= dt;
    const happy = (h.home === 'A' ? trough : trough2).boosting;
    if (h.state === 'idle') {
      if (h.t <= 0) { if (h.rnd() < 0.55) { h.state = 'peck'; h.t = 0.9 + h.rnd() * 1.4; } else { h.pick(); h.state = 'walk'; h.t = 6; } }
    } else if (h.state === 'peck') {
      h.peck += dt * (happy ? 9 : 6);
      if (h.t <= 0) { h.state = 'idle'; h.t = 0.4 + h.rnd() * 1.2; h.peck = 0; }
    } else {
      const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz), sp = happy ? 2.4 : 1.4;
      if (d < 0.15 || h.t <= 0) { h.state = 'idle'; h.t = 0.3 + h.rnd() * 1.0; }
      else { h.x += dx / d * sp * dt; h.z += dz / d * sp * dt; h.yaw = Math.atan2(dx, dz); }
    }
    h.hop = happy ? (h.hop + dt * 7) : 0;
  };
  const henPose = (h, dt) => {
    const holder = h.g;
    holder.position.set(h.x, happy2(h) ? Math.abs(Math.sin(h.hop)) * 0.12 : 0, h.z);
    let d = h.yaw - holder.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    holder.rotation.y += d * Math.min(1, dt * 10);
    holder.rotation.x = h.state === 'peck' ? 0.28 + Math.abs(Math.sin(h.peck)) * 0.35 : 0;
    const walk = h.state === 'walk';
    if (h.act.walk) { h.act.walk.setEffectiveWeight(walk ? 1 : 0); h.act.idle.setEffectiveWeight(walk ? 0 : 1); }
  };
  const happy2 = (h) => (h.home === 'A' ? trough : trough2).boosting;

  // -------------------------------------------------------- feed: silo + trough --
  const troughViews = [];
  {
    const mkTrough = (st, color) => {
      const m = makeTroughModel(3.2, 1.0);
      place(m, st.pos.x, st.pos.z, 0);
      m.visible = false; root.add(m);
      const zone = makeZone({ w: 3.0, d: 2.4, label: 'FEED' });
      zone.position.set(st.def.dropZone.x, 0.04, st.def.dropZone.z); zone.visible = false; root.add(zone);
      troughViews.push({ st, m, fill: m.userData.fill });
      G.stations.onOpen(st.id, (live) => { m.visible = true; zone.visible = true; if (live) { popIn(m); } });
    };
    mkTrough(trough); mkTrough(trough2);
    // silo
    const sg = new THREE.Group();
    const sm = getModel('farmbuildings/Silo', { scale: 1.15, receive: true });
    sg.add(sm);
    const base = new Parts();
    base.rbox(0xb9824a, 3.4, 0.14, 3.0, 0.06, [0, 0.07, 3.0]);
    sg.add(meshOf(base.merged(), { cast: false, receive: true }));
    const sb = signBoard([{ text: 'FEED', size: 120, color: '#fff3c4', stroke: '#8a3a22' }], '#d9503f', 1.6, 0.8);
    sb.position.set(0, 1.5, 1.2); sg.add(sb);
    place(sg, silo.pos.x, silo.pos.z, FACE_CAMERA);
    sg.visible = false; root.add(sg);
    const sz = makeZone({ w: 3.0, d: 2.6, label: 'SACKS' });
    sz.position.set(silo.def.zone.x, 0.04, silo.def.zone.z); sz.visible = false; root.add(sz);
    G.stations.onOpen('silo', (live) => { sg.visible = true; sz.visible = true; if (live) popIn(sg); });
    // trough B / silo already placed; coop B furniture is shown with the golden coop
  }

  // ---------------------------------------------------------------- stand ----
  {
    const C = stand.def.counter;
    const c = makeStandCounter(0xe5483c);
    place(c, C.x, C.z, C.yaw);
    root.add(c);
    const sd = makeDropDecal('SELL', 3.5); sd.position.set(stand.def.dropZone.x, 0.04, stand.def.dropZone.z); root.add(sd);
    const cd = makeCashDecal(3.0); cd.position.set(stand.def.cashPile.x, 0.04, stand.def.cashPile.z); root.add(cd);
    // paving for the queue, stand sign, crates and baskets
    const q = makeGround('paving', 11, 3.2, { color: 0xeadfc2, tile: 3.5, seed: 21, y: 0.025 });
    q.position.set(23.5, 0.025, 11); q.matrixAutoUpdate = false; q.updateMatrix(); root.add(q);
    const p = new Parts();
    // sign post at the far end of the counter
    p.rbox(0x8a5a30, 0.2, 2.9, 0.2, 0.07, [C.x - 0.4, 1.45, C.z - 2.4]);
    p.rbox(0x8a5a30, 0.2, 2.9, 0.2, 0.07, [C.x - 0.4, 1.45, C.z - 4.2]);
    // crates with eggs and hay beside the stand
    for (const [x, z, y] of [[C.x - 0.4, C.z - 3.3, 0], [C.x - 0.2, C.z + 2.8, 0], [C.x + 0.9, C.z + 3.1, 0]]) {
      p.rbox(0xcfa56a, 0.9, 0.55, 0.9, 0.1, [x, y + 0.28, z]);
    }
    for (let i = 0; i < 5; i++) p.sph(i % 2 ? COLORS.egg : COLORS.eggShade, 0.14, [C.x - 0.4 + (i % 3 - 1) * 0.22, 0.7, C.z - 3.3 + (i > 2 ? 0.2 : -0.1)], [1, 1.3, 1], null, 6, 5);
    p.rcyl(0xe8c25a, 0.5, 0.7, 0.1, [C.x + 0.1, 0.5, C.z + 3.7], [Math.PI / 2, 0.3, 0], 16);
    // wicker basket full of eggs
    p.rcyl(0xc98a4b, 0.42, 0.4, 0.07, [C.x - 0.2, 0.7 + 0.0, C.z + 2.8], null, 14);
    for (let i = 0; i < 5; i++) p.sph(COLORS.egg, 0.15, [C.x - 0.2 + Math.cos(i * 1.26) * 0.2, 1.0, C.z + 2.8 + Math.sin(i * 1.26) * 0.2], [1, 1.25, 1], null, 6, 5);
    addMesh(root, p.merged({ ao: AO }));
    const board = signBoard([{ text: 'FARM STAND', size: 92, color: '#ffffff', stroke: '#b3281c' }, { text: 'FRESH EGGS', size: 58, color: '#ffe9a8', stroke: '#6b3a1a' }], '#e5483c', 2.4, 1.5);
    board.position.set(0, 0, 0);
    const sg = new THREE.Group(); sg.add(board);
    place(sg, C.x - 0.4, C.z - 3.3, FACE_CAMERA, 2.6); sg.scale.setScalar(1.15);
    root.add(sg);
    exclusions.push({ x: 17, z: 11, r: 6 });
  }

  // ---------------------------------------------------------------- machines --
  const machines = [];
  const mkMachine = (st, gold, inLabel, outLabel) => {
    const m = makePackerMachine({ gold });
    place(m, st.pos.x, st.pos.z, 0);
    m.visible = false;
    root.add(m);
    const ud = m.userData;
    const board = signBoard([{ text: gold ? 'GOLD PACKER' : 'EGG PACKER', size: 78, color: '#ffffff', stroke: gold ? '#b96a12' : '#1a7c68' }], gold ? '#f0a92a' : '#2fb59a', 1.9, 0.62);
    board.position.set(0, 2.95, 0); board.rotation.y = FACE_CAMERA; m.add(board);
    const decals = [];
    const din = makeZone({ w: 3.0, d: 2.8, label: inLabel }); din.position.set(st.def.dropZone.x, 0.04, st.def.dropZone.z); decals.push(din);
    const dout = makeZone({ w: 3.0, d: 2.8, label: outLabel, color: '#ffd9a0', fill: 'rgba(255,160,60,0.22)' }); dout.position.set(st.def.output.zone.x, 0.04, st.def.output.zone.z); decals.push(dout);
    for (const d of decals) { d.visible = false; root.add(d); }
    // pallet / ground plates under the bays
    const pp = new Parts();
    pp.rbox(0xb9824a, 3.0, 0.1, 2.0, 0.05, [st.def.dropZone.x + 1.9, 0.06, st.pos.z]);
    const plate = new THREE.Group();
    // site marker before it is built
    const site = new THREE.Group();
    const dw = 12.5, dd = 4.6;
    const dash = plane(dw, dd, new THREE.MeshBasicMaterial({ map: dashRectTexture(dw, dd), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 0.03, 2);
    dash.position.set(st.pos.x + 2.0, 0.03, st.pos.z);
    site.add(dash);
    const crate = new Parts();
    for (const [dx, dz] of [[-1, -1.0], [0.2, -1.2], [0.2, 1.1]]) crate.rbox(0xcfa56a, 0.9, 0.7, 0.9, 0.1, [st.pos.x + dx, 0.35, st.pos.z + dz]);
    site.add(meshOf(crate.merged({ ao: true })));
    const sb = signBoard([{ text: gold ? 'GOLD PACKER' : 'EGG PACKER', size: 86, color: '#ffffff', stroke: '#1a7c68' }, { text: 'COMING SOON', size: 46, color: '#ffe27a', stroke: '#6b3a1a' }], '#2fb59a', 2.6, 1.3);
    const sg = new THREE.Group();
    const post = new Parts(); post.rbox(0x8a5a30, 0.2, 1.8, 0.2, 0.07, [0, 0.9, 0]);
    sg.add(meshOf(post.merged())); sb.position.set(0, 2.0, 0); sg.add(sb);
    place(sg, st.pos.x + 1.8, st.pos.z - 2.3, FACE_CAMERA);
    site.add(sg);
    root.add(site);
    machines.push({ st, m, ud, site, lastProg: -1, puff: 0, plate });
    G.stations.onOpen(st.id, (live) => {
      site.visible = false; m.visible = true; plate.visible = true; decals.forEach((d) => { d.visible = true; });
      if (live) { popIn(m); }
    });
    // eggs fly to the machine's intake and cartons leave from its spout
    st.machine.mouth.set(st.pos.x + ud.mouth[0], ud.mouth[1], st.pos.z + ud.mouth[2]);
    st.machine.spout.set(st.pos.x + ud.spout[0], ud.spout[1], st.pos.z + ud.spout[2]);
  };
  mkMachine(packer, false, 'PACK', 'CARTONS');
  mkMachine(packer2, true, 'PACK', 'CARTONS');
  G.events.on('convert', (e) => { const mm = machines.find((x) => x.st.id === e.stationId); if (mm) pop(mm.m); });

  // ------------------------------------------------------------- truck stop --
  const bay = new THREE.Group(); root.add(bay);
  {
    const bp = new Parts();
    // painted bay lines and a loading apron
    bp.rbox(0xf6f2e6, 0.16, 0.03, 5.6, 0.01, [25.3, 0.06, 2]);
    bp.rbox(0xf6f2e6, 0.16, 0.03, 5.6, 0.01, [29.9, 0.06, 2]);
    bp.rbox(0xffd23f, 4.8, 0.03, 0.22, 0.01, [27.6, 0.06, 4.9]);
    // cones by the stop
    for (const [x, z] of [[25.1, 5.2], [30.1, 5.2], [25.1, -1.2]]) { bp.cone(0xff7a1a, 0.24, 0.6, [x, 0.35, z], null, 12); bp.rbox(0xffffff, 0.34, 0.12, 0.34, 0.05, [x, 0.14, z], null, null, 1); }
    addMesh(bay, bp.merged({ ao: AO }), { cast: false });
    const cd = makeCashDecal(3.0); cd.position.set(truckcash.def.cashPile.x, 0.04, truckcash.def.cashPile.z); cd.visible = false; root.add(cd);
    const sign = signBoard([{ text: 'DELIVERY', size: 92, color: '#ffffff', stroke: '#1c5aa8' }, { text: 'TRUCK STOP', size: 52, color: '#ffe27a', stroke: '#173f73' }], '#2e7fe0', 2.4, 1.4);
    const sg = new THREE.Group();
    const post = new Parts();
    post.rbox(0x8a5a30, 0.2, 2.4, 0.2, 0.07, [-1.0, 1.2, 0]); post.rbox(0x8a5a30, 0.2, 2.4, 0.2, 0.07, [1.0, 1.2, 0]);
    sg.add(meshOf(post.merged())); sign.position.set(0, 2.3, 0); sg.add(sign);
    place(sg, 23.3, 6.6, FACE_CAMERA); sg.visible = false; root.add(sg);
    G.pads.onDone('truck', (live) => { cd.visible = true; sg.visible = true; if (live) { popIn(sg); popIn(cd, 0.2); } });
  }

  // ------------------------------------------------------- monument + gate ---
  const site = new THREE.Group();
  {
    const sp = new Parts();
    sp.rbox(0xa7845a, MON.w + 2.0, 0.14, MON.d + 2.0, 0.06, [0, 0.07, 0]);
    sp.rbox(0xc09c6c, MON.w - 0.4, 0.16, MON.d - 0.4, 0.06, [0, 0.09, 0]);
    const px0 = -MON.w / 2 - 1.2, px1 = MON.w / 2 + 1.2, pz0 = -MON.d / 2 - 1.2, pz1 = MON.d / 2 + 1.2;
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.9), ang = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; for (const yy of [0.55, 0.92]) sp.rbox(i % 2 ? 0xff8a2a : 0xffffff, 0.09, 0.22, len / n, 0.04, [x0 + (x1 - x0) * t, yy, z0 + (z1 - z0) * t], [0, ang, 0], null, 1); }
      for (let i = 0; i <= Math.round(len / 2.4); i++) { const t = i / Math.round(len / 2.4); sp.rbox(0xffffff, 0.16, 1.15, 0.16, 0.06, [x0 + (x1 - x0) * t, 0.58, z0 + (z1 - z0) * t], null, null, 1); }
    };
    rail(px0, pz0, px1, pz0); rail(px0, pz1, px1, pz1); rail(px0, pz0, px0, pz1); rail(px1, pz0, px1, pz1);
    for (const [x, z, y] of [[-3, 0, 0.0], [2.5, -2, 0.0], [3.5, 2.5, 0.0]]) sp.rbox(0xcfa56a, 0.9, 0.9, 0.9, 0.12, [x, 0.55, z]);
    for (let i = 0; i < 4; i++) sp.rbox(0xe0b070, 2.4, 0.17, 0.36, 0.06, [-2.5, 0.28 + i * 0.18, 3.3]);
    // a giant egg-shaped mould under a tarp
    sp.sph(0xdde7ef, 2.0, [0.3, 2.0, 0.2], [1, 1.35, 1], null, 14, 10);
    site.add(meshOf(sp.merged({ ao: { ground: 0.15, groundH: 0.3, down: 0.05, noBoxes: true } }), { receive: true }));
    const post = new Parts();
    post.rbox(0x8a5a30, 0.24, 2.6, 0.24, 0.08, [-1.6, 1.3, 0]); post.rbox(0x8a5a30, 0.24, 2.6, 0.24, 0.08, [1.6, 1.3, 0]);
    post.rbox(0xb9824a, 4.5, 2.8, 0.16, 0.14, [0, 2.0, -0.02]);
    const sgn = new THREE.Group(); sgn.add(meshOf(post.merged({ ao: true })));
    const board = signBoard([{ text: 'COMING SOON', size: 66, color: '#ffe27a', stroke: '#6b3a1a' }, { text: 'GIANT', size: 70, color: '#ffffff', stroke: '#b3741a' }, { text: 'GOLDEN EGG', size: 62, color: '#ffffff', stroke: '#b3741a' }], '#f0a92a', 4.2, 2.5);
    board.position.set(0, 2.0, 0.07); sgn.add(board);
    place(sgn, -4.2, -MON.d / 2 - 1.9, FACE_CAMERA);
    site.add(sgn);
  }
  site.position.set(MON.x, 0, MON.z);
  root.add(site);
  // paved forecourt from the road to the monument
  {
    const fp = makeGround('paving', 8, 6, { color: 0xeadfc2, tile: 4, seed: 33, y: 0.026 });
    fp.position.set(MON.x - 10, 0.026, MON.z); fp.matrixAutoUpdate = false; fp.updateMatrix(); root.add(fp);
    const fz = makeGround('grass', MON.w + 8, MON.d + 8, { tile: 8, seed: 12, y: 0.012, color: 0x66bb4e });
    fz.position.set(MON.x, 0.012, MON.z); fz.matrixAutoUpdate = false; fz.updateMatrix(); root.add(fz);
  }
  const monument = new THREE.Group();
  monument.add(meshOf(makeMonument(), { receive: true }));
  monument.position.set(MON.x, 0, MON.z); monument.visible = false; root.add(monument);
  let monBuilt = false;
  const glow = new THREE.Mesh(new THREE.CircleGeometry(7, 40), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.0, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(MON.x, 0.05, MON.z); root.add(glow);
  const showMonument = (animate) => {
    if (monBuilt) return;
    monBuilt = true; site.visible = false; monument.visible = true; glow.userData.on = true;
    if (animate) popIn(monument, 0.1);
  };

  const gate = new THREE.Group();
  {
    gate.add(meshOf(makeGateArch(8.6)));
    const board = signBoard([{ text: 'NEXT WORLD', size: 96, color: '#ffffff', stroke: '#1e6a8a' }], '#3db8e8', 5.6, 1.5);
    board.position.set(0, 3.7, -0.38); board.rotation.y = Math.PI; gate.add(board);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.5), litMaterial({ map: board.material.map }));
    back.position.set(0, 3.7, 0.38); gate.add(back);
    place(gate, GATE.x, GATE.z + 2.6, 0);
    gate.visible = false; root.add(gate);
  }

  // ------------------------------------------------------------ cows & pig ---
  const critters = [];
  for (const [id, x, z, yaw] of [['cube-pets/animal-cow', -11, 42, 2.4], ['cube-pets/animal-cow', -9.5, 44.5, 4.0], ['cube-pets/animal-pig', -12, 46, 1.0], ['cube-pets/animal-cow', 49, 20, 0.6]]) {
    const g = getModel(id, { scale: 3.0, receive: true });
    const holder = new THREE.Group(); holder.add(g); place(holder, x, z, yaw); addBlob(holder, 0.9); root.add(holder);
    const inst = g.userData.instance, clip = (g.userData.clips || []).find((k) => k.name === 'idle');
    let mixer = null;
    if (inst && clip) { mixer = new THREE.AnimationMixer(inst); mixer.clipAction(clip).play(); mixer.update(Math.random() * 2); }
    critters.push({ holder, mixer, acc: 0 });
  }

  // ------------------------------------------------------------ boot state ---
  for (const c of chunks.values()) addMesh(root, c.merged()).name = 'scenery-chunk';
  for (const c of wildChunks.values()) addMesh(root, c.merged(), { cast: false, receive: true }).name = 'wild-chunk';

  let bBuilt = false;
  G.stations.onOpen('nestsB', (live) => {
    bBuilt = true; lockB.visible = false;
    furnB.forEach((o, k) => { o.visible = true; if (live) popIn(o, k * 0.12); });
    for (const h of hens) if (h.home === 'B') { h.off = false; h.g.visible = true; if (live) popIn(h.g, 0.3); }
  });
  G.pads.onDone('monument', (live) => { showMonument(live); });
  G.pads.onDone('travel', () => {});
  G.events.on('win', () => { gate.visible = true; popIn(gate, 0.8); });
  if (G.state && G.state.won) gate.visible = true;
  void PADS; void bBuilt;

  // -------------------------------------------------------------- animation ---
  let T = 0;
  const hensAcc = { t: 0 };
  return {
    root,
    update(dt) {
      T += dt;
      for (const h of hens) { henStep(h, dt); }
      hensAcc.t += dt;
      const doMix = hensAcc.t >= 1 / 24;
      for (const h of hens) {
        if (h.off) continue;
        lodCharacter(G, h.g);
        if (!h.g.visible) continue;
        henPose(h, dt);
        if (h.mixer) { h.acc += dt; if (doMix) { h.mixer.update(h.acc * (h.state === 'walk' ? 1.4 : 0.8)); h.acc = 0; } }
      }
      if (doMix) {
        for (const c of critters) { const p = c.holder.position; const far = !G.camera || Math.abs(p.x - G.player.pos.x) + Math.abs(p.z - G.player.pos.z) > 34; c.holder.visible = !far; if (c.mixer && !far) c.mixer.update(hensAcc.t); }
        hensAcc.t = 0;
      }
      for (const tv of troughViews) {
        const lv = tv.st.level || 0;
        tv.fill.visible = lv > 0.02;
        tv.fill.scale.set(1, Math.max(0.001, lv) * 1.2, 1);
        tv.fill.position.y = 0.58 + Math.max(0, lv) * 0.1;
      }
      for (const mm of machines) {
        if (!mm.m.visible) continue;
        const st = mm.st, ud = mm.ud;
        const run = st.running;
        const tex = ud.belt.material.map;
        if (run) { tex.offset.x -= dt * 0.9; ud.gear.rotation.z += dt * 3.2; }
        ud.bar.scale.x = run ? Math.max(0.001, st.progress) : 0.001;
        ud.lamp.material.color.setHex(st.blocked ? 0xff4a3a : run ? 0x5cf07a : 0xffd23f);
        mm.puff += run ? dt : 0;
        for (let i = 0; i < ud.puffs.length; i++) {
          const p = ud.puffs[i];
          if (!run) { p.visible = false; continue; }
          const u = ((mm.puff * 0.55 + i / ud.puffs.length) % 1);
          p.visible = true;
          p.position.set(ud.chimney[0] + u * 0.3, ud.chimney[1] + u * 1.2, ud.chimney[2]);
          p.scale.setScalar(0.5 + u * 1.2);
          p.material.opacity = 0.7 * (1 - u);
        }
      }
      if (glow.userData.on) glow.material.opacity = 0.16 + Math.sin(T * 2) * 0.06;
      if (monBuilt) monument.rotation.y = Math.sin(T * 0.6) * 0.05;
    },
  };
}
