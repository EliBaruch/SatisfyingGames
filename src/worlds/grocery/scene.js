// Grocery world scenery: a bright, clean corner market. Warm tiled sales floor, grey concrete back-of-house with a
// delivery dock (roller shutters, pallets, trucks), tall walls on the +x / +z sides only, a low glass-front on the
// camera side with the street doors, department shelves that show the station's stock, checkout lanes with
// belts and registers, signs per department, plants, carts, a locked-department look that opens up as pads are bought,
// and the Mega Mart finale (marquee, balloons, bunting, red carpet) plus the travel gate.
// Per-station furniture appears through G.stations.onOpen(id, fn(live)); finale / gate through G.pads.onDone.
import * as THREE from 'three';
import { Parts as ArtParts, meshOf } from '../../engine/art/parts.js';
import { litMaterial } from '../../engine/art/material.js';
import { makeGround } from '../../engine/art/props.js';
import { getModel } from '../../engine/art/assets.js';
import { rng } from '../../engine/geom.js';
import { addBlob } from '../../engine/chars.js';
import { canvasTex, roundRect as rr, makeDropDecal, makeCashDecal } from '../../engine/decals.js';
import { PRODUCT_COLOR } from './models.js';

class Parts extends ArtParts {
  rbox(c, w, h, d, r, pos, rot, scl, seg = 1) { return super.rbox(c, w, h, d, r, pos, rot, scl, seg); }
}

const FACE_CAMERA = -Math.PI * 0.75;     // yaw that turns a +Z face toward the camera
const TAU = Math.PI * 2;
const hexs = (c) => '#' + new THREE.Color(c).getHexString();

/** A rounded store sign texture: lines [{ text, size, color }], solid background with a white rim. */
function signTex(lines, bg, w = 512, h = 256, { rim = '#ffffff', stripes = null } = {}) {
  return canvasTex(w, h, (ctx) => {
    rr(ctx, 6, 6, w - 12, h - 12, Math.min(h * 0.22, 40));
    ctx.fillStyle = bg; ctx.fill();
    if (stripes) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = stripes;
      for (let x = -h; x < w + h; x += 64) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 32, h); ctx.lineTo(x + 32 + h * 0.25, h * 0.78); ctx.lineTo(x + h * 0.25, h * 0.78); ctx.fill(); }
      ctx.restore();
    }
    rr(ctx, 6, 6, w - 12, h - 12, Math.min(h * 0.22, 40));
    ctx.lineWidth = 10; ctx.strokeStyle = rim; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const size = ln.size || Math.round(h * 0.5 / (n > 1 ? 1.2 : 1));
      ctx.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`;
      const y = (h / (n + 1)) * (i + 1) + (ln.dy || 0);
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = ln.stroke || 'rgba(0,0,0,0.28)'; ctx.strokeText(ln.text, w / 2, y);
      ctx.fillStyle = ln.color || '#ffffff'; ctx.fillText(ln.text, w / 2, y);
    });
  });
}
const flatSign = (tex, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: tex, transparent: true }));

export function createScene(G) {
  const LAY = G.world.layout;
  const ST = LAY.store;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'grocery';
  scene.add(root);
  const animated = [];
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const addMesh = (parent, geometry, { cast = true, receive = true } = {}) => {
    const m = meshOf(geometry, { cast, receive });
    m.matrixAutoUpdate = false; m.updateMatrix();
    parent.add(m);
    return m;
  };
  const place = (o, x, y, z, yaw = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };
  const AO = { ground: 0.16, groundH: 0.5, down: 0.08, noBoxes: true };
  const AO_SOFT = { ground: 0.12, groundH: 0.3, down: 0.05, noBoxes: true };

  const W = ST.maxX - ST.minX, D = ST.maxZ - ST.minZ;
  const CX = (ST.minX + ST.maxX) / 2, CZ = (ST.minZ + ST.maxZ) / 2;
  const WALL_H = 3.6, LOW_H = 0.95;
  const COL = { cream: 0xfff4e0, wall: 0xfdeccf, band: 0x39b8a8, bandDark: 0x2a9a8c, trim: 0xffffff, wood: 0xc98a4b, dark: 0x5b6472, steel: 0xb8c2cf };

  // ============================================================ ground =====
  {
    // big surround (grass) so the world never ends in a void
    const g = makeGround('grass', 220, 220, { tile: 9, seed: 5 });
    g.position.set(CX, -0.02, CZ); g.matrixAutoUpdate = false; g.updateMatrix(); root.add(g);

    // sales floor: warm tile
    const floor = makeGround('tile', W, D, { color: 0xf7efe0, tile: 2.4, seed: 7 });
    floor.position.set(CX, 0.0, CZ); floor.matrixAutoUpdate = false; floor.updateMatrix(); root.add(floor);

    // back-of-house concrete (dock side)
    const dockW = ST.maxX - 15.6;
    const conc = makeGround('paving', dockW, D, { color: 0xc9ced6, tile: 3, seed: 8 });
    conc.position.set(15.6 + dockW / 2, 0.012, CZ); conc.matrixAutoUpdate = false; conc.updateMatrix(); root.add(conc);
    // yellow safety line between sales floor and back-of-house
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.22, D), litMaterial({ color: 0xffd23f }));
    line.rotation.x = -Math.PI / 2; line.position.set(15.6, 0.016, CZ); line.receiveShadow = true; root.add(line);

    // street: pavement strip, kerb, asphalt road
    const walk = makeGround('paving', 60, 4.2, { color: 0xe6dcc6, tile: 3, seed: 9 });
    walk.position.set(CX + 6, 0.005, ST.minZ - 2.1); walk.matrixAutoUpdate = false; walk.updateMatrix(); root.add(walk);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), litMaterial({ color: 0x6d7480 }));
    road.rotation.x = -Math.PI / 2; road.position.set(CX + 6, 0.004, ST.minZ - 8.7); road.receiveShadow = true; root.add(road);
    const dash = canvasTex(256, 16, (ctx, w, h) => { ctx.fillStyle = '#ffe27a'; ctx.fillRect(0, 4, w * 0.55, 8); }, { repeat: true });
    dash.repeat.set(14, 1);
    const dl = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.2), litMaterial({ map: dash, transparent: true }));
    dl.rotation.x = -Math.PI / 2; dl.position.set(CX + 6, 0.012, ST.minZ - 8.7); dl.receiveShadow = true; root.add(dl);
    // delivery yard behind the dock wall
    const yard = makeGround('paving', 14, D + 2, { color: 0xbfc5ce, tile: 3, seed: 10 });
    yard.position.set(ST.maxX + 7.3, 0.005, CZ); yard.matrixAutoUpdate = false; yard.updateMatrix(); root.add(yard);
  }

  // ============================================================ walls ======
  const wp = new Parts();
  const T = 0.5;   // wall thickness
  {
    // ---- back wall (+z): wainscot, cream upper, teal band, cap
    const zb = ST.maxZ + T / 2;
    const bx0 = ST.minX - T, bx1 = ST.maxX + T;
    const len = bx1 - bx0, cx = (bx0 + bx1) / 2;
    wp.rbox(COL.wall, len, WALL_H, T, 0.06, [cx, WALL_H / 2, zb]);
    wp.rbox(0xf3d9ae, len + 0.04, 1.05, T + 0.1, 0.05, [cx, 0.52, zb - 0.02]);                 // wainscot
    wp.rbox(COL.band, len + 0.04, 0.34, T + 0.12, 0.05, [cx, 1.18, zb - 0.02]);                // teal rail
    wp.rbox(COL.band, len + 0.04, 0.3, T + 0.1, 0.05, [cx, WALL_H - 0.15, zb - 0.02]);         // top band
    wp.rbox(COL.trim, len + 0.12, 0.14, T + 0.2, 0.05, [cx, WALL_H + 0.05, zb]);               // cap
    // windows high on the wall between the department signs
    for (const x of [-7.4, 4.4, 9.0, 13.2, 19.4]) {
      wp.rbox(COL.trim, 1.7, 1.05, 0.12, 0.05, [x, 2.1, ST.maxZ - 0.02]);
      wp.rbox(0xbfe8ff, 1.45, 0.82, 0.14, 0.04, [x, 2.1, ST.maxZ - 0.03]);
      wp.box(COL.trim, 0.06, 0.82, 0.16, [x, 2.1, ST.maxZ - 0.04]);
    }
    // ---- dock wall (+x): pillars between the bays, lintel, solid ends
    const xw = ST.maxX + T / 2;
    const zs = Object.values(LAY.dockZ).sort((a, b) => a - b);
    const pitch = 3.6, half = pitch / 2;
    const bayLo = zs[0] - half, bayHi = zs[zs.length - 1] + half;
    wp.rbox(COL.wall, T, WALL_H, (ST.maxZ + T) - bayHi, 0.06, [xw, WALL_H / 2, (bayHi + ST.maxZ + T) / 2]);
    wp.rbox(COL.wall, T, WALL_H, bayLo - (ST.minZ - T), 0.06, [xw, WALL_H / 2, (bayLo + ST.minZ - T) / 2]);
    wp.rbox(COL.wall, T, WALL_H - 3.0, bayHi - bayLo, 0.05, [xw, 3.0 + (WALL_H - 3.0) / 2, (bayLo + bayHi) / 2]);   // lintel
    wp.rbox(COL.band, T + 0.12, 0.3, bayHi - bayLo, 0.05, [xw, 3.0 - 0.02, (bayLo + bayHi) / 2]);
    for (let i = 0; i <= zs.length; i++) {
      const z = bayLo + i * pitch;
      wp.rbox(0xf3d9ae, T + 0.1, 3.0, 0.3, 0.06, [xw, 1.5, z]);
      wp.rbox(0xffd23f, T + 0.12, 3.0, 0.1, 0.02, [xw - 0.0, 1.5, z - 0.12]);
    }
    wp.rbox(COL.band, T + 0.12, 0.3, (ST.maxZ + T) - bayHi, 0.05, [xw, WALL_H - 0.15, (bayHi + ST.maxZ + T) / 2]);
    wp.rbox(COL.band, T + 0.12, 0.3, bayLo - (ST.minZ - T), 0.05, [xw, WALL_H - 0.15, (bayLo + ST.minZ - T) / 2]);
    wp.rbox(COL.trim, T + 0.2, 0.14, ST.maxZ - ST.minZ + 2 * T, 0.05, [xw, WALL_H + 0.05, CZ]);
    // ---- low front wall (-z) with the door gaps, and low left wall (-x)
    const zf = ST.minZ - T / 2;
    const gaps = [[LAY.doorOut - 1.5, LAY.doorOut + 1.5], [LAY.doorIn - 1.5, LAY.doorIn + 1.5]].sort((a, b) => a[0] - b[0]);
    let cur = ST.minX - T;
    const seg = (a, b) => {
      if (b - a < 0.1) return;
      wp.rbox(COL.wall, b - a, LOW_H, T, 0.08, [(a + b) / 2, LOW_H / 2, zf]);
      wp.rbox(COL.band, b - a + 0.02, 0.26, T + 0.1, 0.06, [(a + b) / 2, 0.55, zf - 0.02]);
      wp.rbox(COL.trim, b - a + 0.06, 0.12, T + 0.18, 0.05, [(a + b) / 2, LOW_H + 0.04, zf - 0.02]);
    };
    for (const g of gaps) { seg(cur, g[0]); cur = g[1]; }
    seg(cur, ST.maxX + T);
    // door posts
    for (const g of gaps) for (const x of g) {
      wp.rbox(COL.trim, 0.3, 2.6, 0.3, 0.1, [x, 1.3, zf]);
      wp.rbox(COL.band, 0.34, 0.5, 0.34, 0.1, [x, 0.25, zf]);
    }
    const xl = ST.minX - T / 2;
    wp.rbox(COL.wall, T, LOW_H, D + 2 * T, 0.08, [xl, LOW_H / 2, CZ]);
    wp.rbox(COL.band, T + 0.1, 0.26, D + 2 * T, 0.06, [xl - 0.02, 0.55, CZ]);
    wp.rbox(COL.trim, T + 0.18, 0.12, D + 2 * T, 0.05, [xl - 0.02, LOW_H + 0.04, CZ]);
    // corner pillars (cream, with teal caps)
    for (const [x, z, h] of [[ST.minX - T / 2, ST.minZ - T / 2, 1.6], [ST.maxX + T / 2, ST.minZ - T / 2, WALL_H], [ST.minX - T / 2, ST.maxZ + T / 2, WALL_H], [ST.maxX + T / 2, ST.maxZ + T / 2, WALL_H + 0.1]]) {
      wp.rbox(COL.trim, 0.8, h, 0.8, 0.14, [x, h / 2, z]);
      wp.rbox(COL.band, 0.9, 0.18, 0.9, 0.08, [x, h + 0.04, z]);
    }
  }
  addMesh(root, wp.merged({ ao: AO }), { cast: true, receive: true }).name = 'walls';

  // ---- glass panes above the low walls would hide the play area; a thin glass strip on the left wall only
  // ============================================================ doors & mats
  {
    const dp = new Parts();
    const mats = [[LAY.doorIn, '#2a9a8c', 'IN'], [LAY.doorOut, '#e0903a', 'OUT']];
    for (const [x, , ] of mats) {
      dp.rbox(0x3b4350, 2.8, 0.05, 1.7, 0.02, [x, 0.03, ST.minZ - 0.1]);
    }
    // sliding doors parked open: glass leaves at both sides
    for (const [x] of mats) for (const s of [-1, 1]) {
      dp.rbox(0x9fdcff, 0.12, 2.3, 0.7, 0.04, [x + s * 1.3, 1.25, ST.minZ - 0.28]);
    }
    addMesh(root, dp.merged({ ao: AO_SOFT }), { cast: false, receive: true });
    for (const [x, c, label] of mats) {
      const m = flatSign(signTex([{ text: label, size: 110 }], c, 256, 160, { rim: '#fff' }), 1.6, 1.0);
      m.rotation.set(-Math.PI / 2, 0, 0); m.rotation.order = 'YXZ'; m.rotation.y = FACE_CAMERA + Math.PI;
      m.position.set(x, 0.045, ST.minZ - 0.15); m.renderOrder = 3; root.add(m);
      // lintel board above each door with the same label (thin, high, so it does not hide the floor)
    }
    // welcome mat inside
    const mat = flatSign(signTex([{ text: 'WELCOME', size: 70 }], '#e9525e', 512, 200), 2.8, 1.1);
    mat.rotation.set(-Math.PI / 2, 0, 0); mat.rotation.order = 'YXZ'; mat.rotation.y = FACE_CAMERA + Math.PI;
    mat.position.set(LAY.doorIn, 0.03, ST.minZ + 1.0); mat.renderOrder = 2; root.add(mat);
  }

  // ============================================================ street dressing
  {
    const sp = new Parts();
    const rnd = rng(31);
    // lamp posts and benches along the pavement
    const lamp = (x, z) => {
      sp.rcyl(0x4a5060, 0.18, 0.12, 0.04, [x, 0.06, z], null, 12);
      sp.cyl(0x4a5060, 0.07, 0.09, 3.0, [x, 1.5, z], null, 10);
      sp.sph(0xfff0a8, 0.28, [x, 3.15, z], null, null, 14, 10);
    };
    const bench = (x, z, yaw) => {
      const b = new Parts();
      b.rbox(0xb9824a, 1.8, 0.1, 0.55, 0.04, [0, 0.45, 0]);
      b.rbox(0xb9824a, 1.8, 0.5, 0.1, 0.04, [0, 0.8, -0.25]);
      b.rbox(0x4a5060, 0.1, 0.45, 0.5, 0.03, [-0.8, 0.22, 0]);
      b.rbox(0x4a5060, 0.1, 0.45, 0.5, 0.03, [0.8, 0.22, 0]);
      sp.append(b, [x, 0, z], [0, yaw, 0]);
    };
    for (const x of [-6, 4, 18, 28]) lamp(x, ST.minZ - 3.7);
    bench(1.5, ST.minZ - 2.9, Math.PI);
    bench(17.0, ST.minZ - 2.9, Math.PI);
    // planters and a bike rack-ish bollards
    const planter = (x, z, c) => {
      sp.rbox(0xf2f2f2, 1.4, 0.7, 0.8, 0.12, [x, 0.35, z]);
      sp.sph(0x45b84e, 0.55, [x, 0.9, z], [1.2, 0.8, 0.8], null, 10, 7);
      for (let k = 0; k < 5; k++) sp.sph([c, 0xffffff, c, 0xffe14d, c][k], 0.14, [x - 0.5 + k * 0.25, 1.15 + (k % 2) * 0.06, z], null, null, 7, 5);
    };
    planter(8.2, ST.minZ - 1.5, 0xff6fa5);
    planter(16.0, ST.minZ - 1.5, 0xff9a3d);
    // a parked delivery bike / cart outside? keep clean; add a corner mailbox
    sp.rbox(0x3b82f6, 0.7, 1.1, 0.6, 0.15, [-8.0, 0.55, ST.minZ - 1.4]);
    sp.rbox(0xffffff, 0.5, 0.12, 0.45, 0.05, [-8.0, 0.9, ST.minZ - 1.7]);
    void rnd;
    addMesh(root, sp.merged({ ao: AO }), { cast: true, receive: true });

    // trees and hedges on the verge (left, camera side) and the yard side
    const tp = new Parts();
    const tree = (id, x, z, h, s = 1) => tp.model(id, { pos: [x, 0, z], height: h, rot: [0, rnd() * 6.28, 0], scl: [s, s, s], ao: AO });
    const IDS = ['nature-kit/tree_default', 'nature-kit/tree_oak', 'nature-kit/tree_fat'];
    for (let z = ST.minZ - 3; z < ST.maxZ + 14; z += 4.6) tree(IDS[(rnd() * 3) | 0], ST.minX - 3.5 - rnd() * 4, z + rnd() * 2, 3.6 + rnd());
    for (let x = ST.minX + 2; x < ST.maxX + 14; x += 5.2) tree(IDS[(rnd() * 3) | 0], x + rnd() * 2, ST.minZ - 14.5 - rnd() * 3, 3.6 + rnd());
    for (let x = ST.minX - 4; x < ST.maxX + 14; x += 5.5) tree(IDS[(rnd() * 3) | 0], x + rnd() * 2, ST.maxZ + 5 + rnd() * 3, 3.8 + rnd());
    for (let z = ST.minZ + 4; z < ST.maxZ + 14; z += 5.5) tree(IDS[(rnd() * 3) | 0], ST.maxX + 12 + rnd() * 2, z + rnd() * 2, 3.8 + rnd());
    for (let z = ST.minZ + 1; z < ST.maxZ; z += 3.2) tp.model('nature-kit/plant_bushDetailed', { pos: [ST.minX - 1.6, 0, z], width: 1.5, scl: [1, 1, 1], ao: AO });
    addMesh(root, tp.merged(), { cast: false, receive: true }).name = 'trees';
  }

  // ============================================================ interior dressing
  {
    const ip = new Parts();
    // plants in the front corners and by the doors
    const plant = (x, z, s = 1) => {
      ip.rcyl(0xf2f2f2, 0.42 * s, 0.5 * s, 0.06, [x, 0.25 * s, z], null, 14);
      ip.sph(0x45b84e, 0.5 * s, [x, 0.85 * s, z], [1, 1.15, 1], null, 10, 7);
      ip.sph(0x5fd36a, 0.36 * s, [x + 0.22 * s, 1.15 * s, z + 0.1 * s], null, null, 8, 6);
      ip.sph(0x3cb857, 0.32 * s, [x - 0.2 * s, 1.05 * s, z - 0.12 * s], null, null, 8, 6);
    };
    plant(ST.minX + 0.9, ST.minZ + 0.9, 1.1);
    plant(ST.maxX - 5.2, ST.minZ + 0.9, 1.1);
    plant(ST.minX + 0.9, ST.maxZ - 1.0, 1.2);
    plant(LAY.doorIn + 2.3, ST.minZ + 1.0, 1.0);
    plant(LAY.doorOut - 2.2, ST.minZ + 1.0, 1.0);
    // shopping carts and baskets by the entrance (pack models)
    ip.model('mini-shop/shopping-cart', { pos: [LAY.doorIn + 2.2, 0, ST.minZ + 2.4], rot: [0, FACE_CAMERA + 0.4, 0] });
    ip.model('mini-shop/shopping-cart', { pos: [LAY.doorIn + 3.0, 0, ST.minZ + 2.9], rot: [0, FACE_CAMERA + 0.1, 0] });
    for (let i = 0; i < 3; i++) ip.model('mini-shop/shopping-basket', { pos: [LAY.doorIn + 4.2, 0.0 + i * 0.4, ST.minZ + 1.3], rot: [0, 0.2 * i, 0] });
    // promo stands along the left wall: fruit, bread, cans (pack displays)
    ip.model('mini-shop/display-fruit', { pos: [ST.minX + 1.0, 0, 8.6], rot: [0, FACE_CAMERA, 0], scale: 1.1 });
    ip.model('mini-shop/display-bread', { pos: [ST.minX + 1.0, 0, 11.4], rot: [0, FACE_CAMERA, 0], scale: 1.1 });
    ip.model('mini-shop/display-cans', { pos: [ST.minX + 1.1, 0, 5.6], rot: [0, FACE_CAMERA, 0], scale: 0.9 });
    // columns near the dock line
    addMesh(root, ip.merged({ ao: AO }), { cast: true, receive: true }).name = 'interior';
  }

  // ============================================================ dock (back of house)
  const dockViews = [];
  const trucks = [];
  {
    const dockDefs = G.world.layout.departments.filter((d) => d.dock);
    const stat = (id) => G.stations.get(id);
    const xw = ST.maxX + 0.25;
    const sp = new Parts();
    // hand trucks and spare boxes by the pillars, a pallet rack stack at the corners
    sp.model('mini-shop/hand-truck', { pos: [19.6, 0, 10.9], rot: [0, FACE_CAMERA - 0.3, 0] });
    sp.model('mini-shop/hand-truck', { pos: [16.4, 0, -6.6], rot: [0, FACE_CAMERA + 0.5, 0] });
    sp.model('factory-kit/box-wide', { pos: [19.4, 0, 12.4], rot: [0, 0.2, 0], scale: 0.85 });
    sp.model('factory-kit/box-long', { pos: [19.5, 0.7, 12.4], rot: [0, -0.1, 0], scale: 0.7 });
    sp.model('factory-kit/box-wide', { pos: [20.0, 0, -6.4], rot: [0, 0.3, 0], scale: 0.85 });
    sp.model('factory-kit/box-long', { pos: [18.4, 0, -6.8], rot: [0, 0.1, 0], scale: 0.8 });
    addMesh(root, sp.merged({ ao: AO }), { cast: true, receive: true });

    for (const d of dockDefs) {
      const st = stat(d.dock);
      const z = st.def.z, x = st.def.x;
      const view = { st, group: new THREE.Group(), shutter: null, closedGroup: null };
      // wooden pallet under the crates
      const pp = new Parts();
      pp.rbox(0xb98552, 1.7, 0.08, 1.7, 0.03, [0, 0.14, 0]);
      for (const dz of [-0.7, 0, 0.7]) pp.rbox(0xa4733f, 1.7, 0.12, 0.26, 0.03, [0, 0.07, dz]);
      for (const dx of [-0.7, 0, 0.7]) pp.rbox(0xa4733f, 0.26, 0.04, 1.7, 0.02, [dx, 0.02, 0]);
      const pal = meshOf(pp.merged({ ao: AO_SOFT }), { cast: false, receive: true });
      pal.position.set(x - 0.0, 0, z);
      view.group.add(pal);
      // zone decal CRATES
      const dec = makeDropDecal('CRATES', 3.0);
      dec.position.set(st.pickup.zone.x, 0.04, st.pickup.zone.z);
      view.group.add(dec);
      // bay number sign on the pillar side
      const sign = flatSign(signTex([{ text: d.label === 'FRESH PRODUCE' ? 'PRODUCE' : d.label, size: 62 }], d.color, 420, 150), 1.7, 0.6);
      sign.position.set(xw - 0.45, 3.4, z); sign.rotation.y = -Math.PI / 2;
      view.group.add(sign);
      // truck backed into the bay
      const tm = getModel(trucks.length % 2 ? 'car-kit/van' : 'car-kit/delivery-flat');
      tm.position.set(x + 4.0, 0, z); tm.rotation.y = -Math.PI / 2;
      addBlob(tm, { rx: 1.2, rz: 2.2, yaw: true });
      view.truck = tm; view.truckBase = tm.position.x;
      trucks.push(tm);
      view.group.add(tm);
      // roller shutter: closed while the dock is locked
      const shp = new Parts();
      shp.rbox(0xc9d2de, 0.12, 3.0, 3.3, 0.04, [0, 1.5, 0]);
      for (let k = 0; k < 10; k++) shp.rbox(0xaeb9c8, 0.16, 0.06, 3.3, 0.02, [0.0, 0.2 + k * 0.3, 0]);
      shp.rbox(0xffd23f, 0.2, 0.3, 3.3, 0.05, [0, 0.15, 0]);
      const sh = meshOf(shp.merged(), { cast: true, receive: true });
      sh.position.set(xw - 0.12, 0, z);
      view.shutter = sh;
      root.add(sh);
      root.add(view.group);
      view.group.visible = false;
      dockViews.push(view);
      G.stations.onOpen(d.dock, (live) => {
        view.group.visible = true; sh.visible = false;
        if (live) { popIn(pal, 0.1); popIn(tm, 0.2); }
      });
      G.events.on('pile:supply', (e) => {
        if (e.stationId === d.dock) { view.bounce = 0.5; }
      });
    }
    animated.push((dt) => {
      for (const v of dockViews) {
        if (v.bounce > 0) {
          v.bounce -= dt;
          const k = Math.max(0, v.bounce) / 0.5;
          v.truck.position.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.09 * k;
        } else v.truck.position.y = 0;
      }
    });
  }

  // ============================================================ shelves (departments)
  const shelfViews = [];
  const shelfGeo = new Map();
  function shelfUnit(color, accent, kind) {
    const key = color + '/' + accent + '/' + kind;
    let g = shelfGeo.get(key);
    if (g) return g;
    const D_ = 1.1, L = 3.4, H = 1.5, gap = H / 3;
    const b = new Parts();
    b.rbox(0x6a7380, D_, 0.12, L, 0.04, [0, 0.06, 0]);                              // plinth
    b.rbox(color, 0.1, H, L - 0.06, 0.04, [-D_ / 2 + 0.06, H / 2 + 0.06, 0]);        // back
    for (const s of [-1, 1]) b.rbox(color, D_, H + 0.08, 0.12, 0.05, [0, H / 2 + 0.06, s * (L / 2 - 0.06)]);   // ends
    for (let l = 0; l < 3; l++) {
      b.rbox(0xfafafa, D_ - 0.1, 0.05, L - 0.2, 0.02, [0.0, 0.1 + l * gap, 0]);      // board
      b.rbox(accent, 0.05, 0.1, L - 0.2, 0.02, [D_ / 2 - 0.05, 0.1 + l * gap + 0.04, 0]);   // price strip
    }
    b.rbox(accent, D_ + 0.1, 0.12, L + 0.1, 0.05, [0, H + 0.12, 0]);                 // top cap
    b.rbox(color, D_ + 0.02, 0.1, L + 0.02, 0.04, [0, H + 0.2, 0]);
    if (kind === 'bread') {
      // striped awning lip over the front
      for (let i = 0; i < 8; i++) b.rbox(i % 2 ? 0xffffff : 0xe0903a, 0.28, 0.12, (L + 0.1) / 8, 0.03, [D_ / 2 + 0.12, H - 0.02, -L / 2 + 0.2 + i * (L / 8)], [0, 0, 0.3]);
    }
    g = b.merged({ ao: { ground: 0.14, groundH: 0.3, down: 0.05, noBoxes: true } });
    shelfGeo.set(key, g);
    return g;
  }
  const lockDash = canvasTex(512, 256, (ctx, w, h) => {
    rr(ctx, 12, 12, w - 24, h - 24, 40);
    ctx.lineCap = 'round'; ctx.setLineDash([30, 24]); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(70,90,110,0.7)'; ctx.stroke();
  });
  for (const d of LAY.departments) {
    const st = G.stations.get(d.shelf);
    const U = st.shelf;
    const col = new THREE.Color(d.color).getHex();
    const acc = new THREE.Color(d.color).offsetHSL(0, 0, 0.12).getHex();
    const view = { group: new THREE.Group(), locked: new THREE.Group() };
    view.group.position.set(U.x, 0, U.z); view.group.rotation.y = U.yaw;
    const body = meshOf(shelfUnit(col, acc, d.key), { cast: true, receive: true });
    view.group.add(body);
    // wall sign over the department (back wall, faces -z)
    const sg = flatSign(signTex([{ text: d.label, size: d.label.length > 9 ? 78 : 96, stroke: 'rgba(0,0,0,0.3)' }], d.color, 640, 240, { rim: '#fff' }), 3.3, 1.24);
    sg.position.set(U.x, 2.75, ST.maxZ - 0.05); sg.rotation.y = Math.PI;
    view.sign = sg;
    root.add(view.group); root.add(sg);
    // stock-here zone decal
    const dec = makeDropDecal('STOCK', 2.6);
    dec.position.set(st.drop.zone.x, 0.04, st.drop.zone.z);
    view.group.visible = false; sg.visible = false;
    // locked look: dashed outline + wooden "opening soon" post
    const lk = new THREE.Group();
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.2), new THREE.MeshBasicMaterial({ map: lockDash, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    dm.rotation.x = -Math.PI / 2; dm.rotation.z = Math.PI / 2; dm.position.set(U.x - 0.4, 0.03, U.z); dm.renderOrder = 2;
    lk.add(dm);
    const soon = flatSign(signTex([{ text: 'COMING', size: 80, stroke: '#44505e' }, { text: 'SOON', size: 80, stroke: '#44505e' }], '#8d99a8', 420, 240, { rim: '#fff' }), 2.2, 1.25);
    soon.position.set(U.x, 2.75, ST.maxZ - 0.05); soon.rotation.y = Math.PI;
    lk.add(soon);
    view.locked = lk;
    root.add(lk);
    view.dec = dec; root.add(dec); dec.visible = false;
    shelfViews.push(view);
    const lockedAtBoot = !st.def.open && !G.stats.open[st.id];
    lk.visible = lockedAtBoot;
    G.stations.onOpen(d.shelf, (live) => {
      view.group.visible = true; sg.visible = true; dec.visible = true; lk.visible = false;
      if (live) { popIn(view.group, 0.0); popIn(sg, 0.25); }
    });
  }

  // ============================================================ checkouts
  const COUNTER_GEO = {};
  function counterGeo() {
    if (COUNTER_GEO.g) return COUNTER_GEO.g;
    const L = 2.7, Dp = 1.0, h = 0.95;
    const b = new Parts();
    b.rbox(0xdfe6ee, Dp + 0.1, 0.12, L + 0.1, 0.04, [0, 0.06, 0]);
    b.rbox(0xffffff, Dp, h - 0.2, L, 0.07, [0, 0.12 + (h - 0.2) / 2, 0]);
    b.rbox(COL.band, Dp + 0.06, 0.1, L + 0.06, 0.04, [0, h - 0.2, 0]);
    b.rbox(0xe6edf5, Dp + 0.02, 0.08, L + 0.02, 0.04, [0, h - 0.04, 0]);
    // belt lane (customer side) and packing shelf (staff side)
    b.rbox(0x39414f, 0.46, 0.05, L - 0.8, 0.02, [0.18, h + 0.02, -0.25]);
    for (let i = 0; i < 6; i++) b.rbox(0x4a5262, 0.42, 0.012, 0.1, 0.004, [0.18, h + 0.055, -1.0 + i * 0.34]);
    b.rbox(0x2f3541, 0.09, 0.13, L - 0.8, 0.03, [0.46, h + 0.06, -0.25]);
    b.rbox(0xff6f91, 0.5, 0.05, 0.5, 0.03, [-0.1, h + 0.025, 1.0]);   // card pad shelf
    // register block and screen
    b.rbox(0xdde4ec, 0.5, 0.3, 0.56, 0.08, [-0.18, h + 0.15, 1.0]);
    b.rbox(0x2f3541, 0.06, 0.34, 0.5, 0.03, [-0.4, h + 0.5, 1.0], [0, 0, -0.25]);
    b.rbox(0x7ee1c6, 0.02, 0.26, 0.4, 0.01, [-0.37, h + 0.5, 1.0], [0, 0, -0.25]);
    // scanner glow bar
    b.rbox(0xff4d4d, 0.05, 0.03, 0.36, 0.01, [0.18, h + 0.08, -1.25]);
    COUNTER_GEO.g = b.merged({ ao: { ground: 0.12, groundH: 0.3, down: 0.05, noBoxes: true } });
    return COUNTER_GEO.g;
  }
  const checkoutViews = [];
  ['co1', 'co2'].forEach((id, idx) => {
    const st = G.stations.get(id);
    const C = st.def.counter;
    const grp = new THREE.Group();
    const body = meshOf(counterGeo(), { cast: true, receive: true });
    place(grp, C.x, 0, C.z, C.yaw);
    grp.add(body);
    // lane sign on a post at the counter's end (staff side)
    const post = new Parts();
    post.rcyl(0x59606d, 0.12, 0.08, 0.03, [0, 0.04, 0], null, 12);
    post.cyl(0x59606d, 0.05, 0.06, 2.3, [0, 1.2, 0], null, 8);
    const pm = meshOf(post.merged());
    pm.position.set(-0.35, 0, -1.55);
    grp.add(pm);
    const num = flatSign(signTex([{ text: String(idx + 1), size: 150, stroke: '#1f7d71' }], '#39b8a8', 200, 200), 0.9, 0.9);
    num.position.set(-0.35, 2.5, -1.55); num.rotation.y = Math.PI / 2 - FACE_CAMERA + 0.0;
    // face the camera regardless of counter yaw: world yaw FACE_CAMERA -> local = FACE_CAMERA - C.yaw
    num.rotation.y = FACE_CAMERA - C.yaw;
    grp.add(num);
    grp.visible = false;
    root.add(grp);
    // decals
    const zone = st.serve.zone, cp = st.def.cashPile;
    const sd = makeDropDecal('SERVE', 2.7); sd.position.set(zone.x, 0.04, zone.z);
    const cd = makeCashDecal(2.8); cd.position.set(cp.x, 0.04, cp.z);
    sd.visible = cd.visible = false;
    root.add(sd, cd);
    // queue floor markings: little stanchion posts at the line
    const qp = new Parts();
    const q = st.def.queue;
    for (let i = 0; i < q.length; i += 1) {
      for (const s of [-1, 1]) qp.rcyl(0x59606d, 0.09, 0.9, 0.03, [q[i].x + s * 0.72, 0.45, q[i].z + 0.45], null, 8);
    }
    const qm = meshOf(qp.merged(), { cast: false, receive: false });
    qm.visible = false; root.add(qm);
    // belts of rope between the posts (thin boxes)
    const rp = new Parts();
    for (let i = 0; i < q.length - 1; i++) for (const s of [-1, 1]) rp.rbox(0xe9525e, 0.05, 0.05, 0.95, 0.02, [q[i].x + s * 0.72, 0.85, (q[i].z + q[i + 1].z) / 2 + 0.45]);
    const rm = meshOf(rp.merged(), { cast: false, receive: false }); rm.visible = false; root.add(rm);
    checkoutViews.push({ grp, sd, cd, qm, rm });
    G.stations.onOpen(id, (live) => {
      grp.visible = sd.visible = cd.visible = qm.visible = rm.visible = true;
      if (live) { popIn(grp); popIn(qm, 0.1); }
    });
  });

  // ============================================================ promo stands
  {
    const pp = new Parts();
    // freezer chests along the back wall between departments, end caps
    pp.model('mini-shop/freezers-standing', { pos: [-7.4, 0, 13.4], rot: [0, Math.PI, 0] });
    pp.model('mini-shop/freezers-standing', { pos: [-5.2, 0, 13.4], rot: [0, Math.PI, 0] });
    pp.model('mini-shop/shelf-end', { pos: [18.2, 0, 13.4], rot: [0, Math.PI, 0] });
    pp.model('mini-shop/shelf-bags', { pos: [20.0, 0, 13.4], rot: [0, Math.PI, 0] });
    pp.model('mini-shop/freezer', { pos: [-3.0, 0, 13.45], rot: [0, Math.PI, 0] });
    addMesh(root, pp.merged({ ao: AO }), { cast: true, receive: true });
    // welcome signage on the back wall centre
    const sg = flatSign(signTex([{ text: 'FRESH CORNER', size: 84, color: '#ffffff', stroke: '#1f7d71' }, { text: 'MARKET', size: 100, color: '#ffe27a', stroke: '#1f7d71' }], '#39b8a8', 800, 300, { rim: '#ffffff' }), 5.2, 1.95);
    sg.position.set(9.0, 3.1, ST.maxZ - 0.06); sg.rotation.y = Math.PI;
    root.add(sg);
  }

  // ============================================================ finale: Mega Mart
  const finale = new THREE.Group();
  finale.visible = false;
  {
    const fp = new Parts();
    // red carpet from the door to the middle
    fp.rbox(0xd7263d, 2.6, 0.05, 14.0, 0.02, [LAY.doorIn - 0.0, 0.04, ST.minZ + 7.4]);
    // balloons clusters near doors and the dock wall
    const balloons = [[-7.5, 12.6], [20.4, 13.4], [-7.5, -6.5], [14.8, 13.0], [0.2, 13.2]];
    const cols = [0xff5d73, 0xffd23f, 0x4cc9f0, 0x7ee081, 0xb583ff];
    balloons.forEach(([x, z], j) => {
      fp.cyl(0xdddddd, 0.015, 0.015, 2.4, [x, 1.2, z], null, 5);
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + j;
        fp.sph(cols[(k + j) % 5], 0.36, [x + Math.cos(a) * 0.45, 2.7 + (k % 3) * 0.28, z + Math.sin(a) * 0.45], [1, 1.2, 1], null, 10, 8);
      }
    });
    // bunting along the back wall and the left edge
    const flag = (x, y, z, c, alongX) => fp.cone(c, 0.2, 0.42, [x, y, z], [Math.PI, 0, 0], 4, alongX ? [1, 1, 0.3] : [0.3, 1, 1]);
    for (let i = 0; i < 30; i++) {
      const x = ST.minX + 0.5 + i;
      flag(x, 3.0 - Math.sin((i / 30) * Math.PI) * -0.0 - 0.0, ST.maxZ - 0.45, cols[i % 5], true);
    }
    // gold star arch frame above the centre sign
    fp.rbox(0xffd23f, 6.4, 0.18, 0.18, 0.06, [9.0, 4.4, ST.maxZ - 0.3]);
    for (let k = 0; k < 7; k++) fp.sph(k % 2 ? 0xfff3a0 : 0xffd23f, 0.22, [9.0 - 3.0 + k, 4.6, ST.maxZ - 0.3], null, null, 8, 6);
    const fm = meshOf(fp.merged({ ao: AO_SOFT }), { cast: true, receive: true });
    finale.add(fm);
    // MEGA MART marquee over the +x/+z corner side of the store
    const mq = flatSign(signTex([{ text: 'MEGA MART', size: 150, color: '#fff3a0', stroke: '#b3263d' }, { text: 'GRAND OPENING', size: 64, color: '#ffffff', stroke: '#b3263d' }], '#e9525e', 900, 330, { rim: '#ffd23f' }), 6.6, 2.4);
    mq.position.set(9.0, 3.1, ST.maxZ - 0.1); mq.rotation.y = Math.PI;
    finale.add(mq);
    finale.userData.mq = mq;
  }
  root.add(finale);

  // ============================================================ travel gate
  const gate = new THREE.Group();
  {
    const pos = G.world.pads.find((p) => p.id === 'travel').pos;
    const gp = new Parts();
    gp.rbox(0xffffff, 0.4, 3.4, 0.4, 0.12, [-1.9, 1.7, 0]);
    gp.rbox(0xffffff, 0.4, 3.4, 0.4, 0.12, [1.9, 1.7, 0]);
    gp.rbox(COL.band, 4.5, 0.5, 0.5, 0.15, [0, 3.45, 0]);
    gp.rbox(0xffd23f, 4.6, 0.12, 0.6, 0.05, [0, 3.18, 0]);
    gate.add(meshOf(gp.merged({ ao: AO_SOFT })));
    const bd = flatSign(signTex([{ text: 'NEXT WORLD', size: 80 }], '#39b8a8', 600, 190), 4.0, 1.2);
    bd.position.set(0, 4.1, -0.26); bd.rotation.y = Math.PI;
    gate.add(bd);
    const back = flatSign(bd.material.map, 4.0, 1.2); back.position.set(0, 4.1, 0.26); gate.add(back);
    gate.position.set(pos.x, 0, pos.z + 1.2);
    gate.rotation.y = FACE_CAMERA + Math.PI * 0.5 * 0;
    gate.rotation.y = 0;
    gate.visible = false;
  }
  root.add(gate);

  // ============================================================ boot state
  G.pads.onDone('megamart', (live) => {
    finale.visible = true;
    if (live) { popIn(finale, 0.1); }
  });
  G.pads.onDone('travel', () => {});
  G.events.on('win', () => { finale.visible = true; });
  const showGate = (live) => { gate.visible = true; if (live) popIn(gate, 0.6); };
  G.pads.onDone('megamart', showGate);

  return {
    root,
    update(dt) { for (const a of animated) a(dt); },
  };
}
