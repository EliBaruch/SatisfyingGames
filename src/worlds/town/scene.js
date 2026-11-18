// Wheatwhistle Junction scenery: golden-hour farmland beside a railway. A painted ground (dirt
// street and lanes, furrowed fields, the straw paddock) over warm grass; the market stall; the
// windmill with turning sails, the bakery with a smoking chimney, the creamery; cows and their
// trough; the rails, the level crossing, the goods platform with its station house, signal and
// train board; hedgerows, trees, bales and a backdrop of farmland; the cottages, town square, clock
// tower and the Harvest Fair that arrive as the town grows.
// Station furniture appears through G.stations.onOpen(id, fn(live)); build results through
// G.pads.onDone(padId, fn(live)). Static scenery is merged into a few chunk meshes.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { litMaterial, getSharedMaterial } from '../../engine/art/material.js';
import { makeGround, makeZone } from '../../engine/art/props.js';
import { getGeometry } from '../../engine/art/assets.js';
import { rng } from '../../engine/geom.js';
import { canvasTex, signTexture, makeDropDecal, makeCashDecal } from '../../engine/decals.js';
import { onScreen } from '../../engine/chars.js';
import {
  COLORS, makeStall, makeWindmill, makeBakery, makeCreamery, makeTroughGeometry, makeStationHouse, makeClockTower, makeSignal,
  makeHayBales, makeScarecrow, makeWell, makeFountain, makeFair, makeFairSite, makeGateArch, makeBarrier,
  cottage, addLamp, addBunting, addCrate, addBarrel, addPumpkin, fenceRun, hayBale,
} from './models.js';

const FACE_CAMERA = -Math.PI * 0.75;
const inRect = (x, z, r, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;
const css = (c, a = 1) => { const k = new THREE.Color(c); return `rgba(${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)},${a})`; };

// ------------------------------------------------------------ painted ground ---
// Soft-edged dirt, soil and straw painted on canvases that lie over the grass (transparent where the
// grass shows). One layer per part of the world, so the ground wears in as the farm grows.
const PX = 34;                   // canvas pixels per world unit
const DIRT = 0xdcc5a0, DIRT_D = 0xbfa078, DIRT_L = 0xf1e3c6;
/** Paint a layer over the world rectangle { x0, z0, x1, z1 }: draw(tools) -> a canvas texture. */
function paintLayer(R, seed, draw) {
  const w = Math.round((R.x1 - R.x0) * PX), h = Math.round((R.z1 - R.z0) * PX), k = PX;
  return canvasTex(w, h, (ctx) => {
    const r = rng(seed);
    const X = (x) => (x - R.x0) * k, Z = (z) => (z - R.z0) * k;
    const OFF = 6000;
    const T = {
      ctx, r, X, Z, k,
      /** a soft-edged rectangle (the blur comes from a shadow, which every browser supports) */
      soft(x0, z0, x1, z1, color, a = 1, blur = 0.5, rad = 0.6) {
        ctx.save();
        ctx.shadowColor = css(color, a); ctx.shadowBlur = blur * k; ctx.shadowOffsetX = OFF;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        const px = X(x0) - OFF, pz = Z(z0), ww = (x1 - x0) * k, hh = (z1 - z0) * k, q = Math.min(rad * k, ww / 2, hh / 2);
        ctx.moveTo(px + q, pz); ctx.arcTo(px + ww, pz, px + ww, pz + hh, q); ctx.arcTo(px + ww, pz + hh, px, pz + hh, q);
        ctx.arcTo(px, pz + hh, px, pz, q); ctx.arcTo(px, pz, px + ww, pz, q); ctx.closePath();
        ctx.fill();
        ctx.restore();
      },
      blob(x, z, rad, color, a = 1) {
        const g = ctx.createRadialGradient(X(x), Z(z), rad * k * 0.35, X(x), Z(z), rad * k);
        g.addColorStop(0, css(color, a)); g.addColorStop(1, css(color, 0));
        ctx.fillStyle = g; ctx.fillRect(X(x - rad), Z(z - rad), rad * 2 * k, rad * 2 * k);
      },
      /** a trodden strip along a polyline */
      strip(pts, wd, color, a = 1) {
        for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
          const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / (wd * 0.3)));
          for (let j = 0; j <= n; j++) T.blob(ax + (bx - ax) * j / n + (r() - 0.5) * wd * 0.14, az + (bz - az) * j / n + (r() - 0.5) * wd * 0.14, wd * (0.52 + r() * 0.1), color, a * 0.75);
        }
      },
      /** ragged edges: blobs straddling the outline of a rectangle */
      ragged(x0, z0, x1, z1, color, a = 0.8, rad = 0.7) {
        const per = 2 * (x1 - x0 + z1 - z0), n = Math.ceil(per / 1.1);
        for (let i = 0; i < n; i++) {
          let d = (i / n) * per, x, z;
          if (d < x1 - x0) { x = x0 + d; z = z0; } else if ((d -= x1 - x0) < z1 - z0) { x = x1; z = z0 + d; } else if ((d -= z1 - z0) < x1 - x0) { x = x1 - d; z = z1; } else { d -= x1 - x0; x = x0; z = z1 - d; }
          if (r() < 0.75) T.blob(x + (r() - 0.5) * 0.5, z + (r() - 0.5) * 0.5, rad * (0.6 + r() * 0.7), color, a);
        }
      },
      /** details that only land where something is already painted */
      atop(x0, z0, x1, z1, fn) {
        ctx.save();
        ctx.beginPath(); ctx.rect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); ctx.clip();
        ctx.globalCompositeOperation = 'source-atop';
        fn();
        ctx.restore();
      },
      speckle(x0, z0, x1, z1, n, colors, s0 = 0.03, s1 = 0.09, skip = null) {
        T.atop(x0, z0, x1, z1, () => {
          for (let i = 0; i < n; i++) {
            const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0), c = colors[(r() * colors.length) | 0], sz = (s0 + r() * (s1 - s0)) * k, e = 0.6 + r() * 0.4, rot = r() * 3;
            if (skip && skip(x, z)) continue;
            ctx.fillStyle = c;
            ctx.beginPath(); ctx.ellipse(X(x), Z(z), sz, sz * e, rot, 0, 6.3); ctx.fill();
          }
        });
      },
      /** pebbles and wear over everything painted so far in the layer */
      wear(density = 1.6, skip = null) {
        const area = (R.x1 - R.x0) * (R.z1 - R.z0);
        T.speckle(R.x0, R.z0, R.x1, R.z1, Math.round(area * density), [css(DIRT_D, 0.4), css(DIRT_D, 0.3), css(DIRT_L, 0.55), css(0xa59a8c, 0.6)], 0.03, 0.1, skip);
      },
    };
    draw(T);
  });
}

/** a tileable texture of ripe wheat seen from above (the backdrop fields) */
function wheatTexture() {
  return canvasTex(256, 256, (ctx, w, h) => {
    const r = rng(8);
    ctx.fillStyle = '#c9aa6c'; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { ctx.fillStyle = 'rgba(150,118,66,0.5)'; ctx.fillRect(0, y + 26, w, 6); ctx.fillStyle = 'rgba(236,214,160,0.5)'; ctx.fillRect(0, y + 6, w, 12); }
    for (let i = 0; i < 700; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(244,228,180,0.7)' : 'rgba(170,136,80,0.6)'; ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 2); }
  }, { repeat: true });
}

// ----------------------------------------------------------------- the world --
export function createScene(G) {
  const LAY = G.world.layout;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const rnd = rng(613);
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const pop = (obj) => { if (G.fx && G.fx.pop) G.fx.pop(obj); };
  const fixed = (o) => { o.matrixAutoUpdate = false; o.updateMatrix(); return o; };
  const place = (o, x, z, yaw = 0, y = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };
  const addMesh = (parent, geometry, { cast = true, receive = true } = {}) => {
    const m = meshOf(geometry, { cast, receive });
    fixed(m);
    parent.add(m);
    return m;
  };
  const hidden = (o) => { o.visible = false; root.add(o); return o; };
  const signBoard = (lines, bg, w, h, fg = '#ffffff') => new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: signTexture(lines, bg, fg, 640, Math.round(640 * h / w)) }));
  const decal = (d, x, z) => { d.position.set(x, 0.04, z); return d; };

  const ST = G.stations;
  const stall = ST.get('stall'), mill = ST.get('mill'), bakery = ST.get('bakery'), creamery = ST.get('creamery');
  const trough = ST.get('trough'), platform = ST.get('platform'), milk = ST.get('milk');
  const solid = ST.get('scenery').blockers, WB = G.world.bounds;
  const walkable = (x, z, m = 0.6) => x > WB.minX - m && x < WB.maxX + m && z > WB.minZ - m && z < WB.maxZ + m;
  const block = (x, z, r) => { if (walkable(x, z, r)) solid.push({ x, z, r }); };

  // Raw goods belong in the works: the stall takes wheat, flour and milk only while the machine that
  // wants them is full, and pumpkins only while the platform is (so nobody is ever stuck holding them).
  {
    const d = stall.drop, orig = d.accepts;
    const full = (st, kind) => !st.active || st.drop.roomFor(kind) <= 0;
    d.accepts = (kind) => {
      if (!orig(kind)) return false;
      if (kind === 'wheat') return full(mill, kind);
      if (kind === 'flour') return full(bakery, kind);
      if (kind === 'milk') return full(creamery, kind);
      if (kind === 'pumpkin') return full(platform, kind);
      return true;
    };
  }

  // ---------------------------------------------------------------- ground --
  const truckPath = (() => { const p = G.world.workers.vendor.path; return [...p.in.slice(1), p.stop, ...p.out.slice(0, -1)].map((q) => [q.x, q.z]); })();
  const fades = [];        // ground layers wearing in
  /** A painted ground layer; `shown` false = hidden until layer.show(live). */
  const layer = (R, seed, draw, shown = true) => {
    const mat = litMaterial({ map: paintLayer(R, seed, draw), transparent: true, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((R.x0 + R.x1) / 2, 0.014, (R.z0 + R.z1) / 2);
    m.receiveShadow = true; m.renderOrder = 1;
    m.visible = shown;
    root.add(fixed(m));
    return {
      mesh: m,
      show(live) {
        if (m.visible) return;
        if (!live) { m.visible = true; return; }
        mat.opacity = 0;
        const go = () => { m.visible = true; fades.push(mat); };
        if (G.fx && G.fx.defer) G.fx.defer(go); else go();
      },
    };
  };
  const SS = LAY.street;
  const padBlob = (T, id, rad = 1.9) => { const p = G.pads.get(id); if (p) T.blob(p.pos.x, p.pos.z, rad, DIRT, 0.7); };
  {
    const gb = LAY.ground;
    const grass = makeGround('grass', gb.maxX - gb.minX, gb.maxZ - gb.minZ, { color: 0x79a65a, tile: 7, seed: 5 });
    grass.position.set((gb.minX + gb.maxX) / 2, 0, (gb.minZ + gb.maxZ) / 2);
    root.add(fixed(grass));
    // the dirt road (east) under the level crossing
    const road = makeGround('soil', 3.9, gb.maxZ - gb.minZ, { color: 0xd6c09a, tile: 5, seed: 12, y: 0.008 });
    road.position.set(LAY.roadX, 0.008, (gb.minZ + gb.maxZ) / 2);
    root.add(fixed(road));

    // the first day: the street, the wheat field, the stall's apron and the queue
    const wf = LAY.wheat;
    const W = { x0: wf.x0 - 0.9, x1: wf.x0 + (wf.cols - 1) * wf.dx + 0.75, z0: wf.z0 - 0.9, z1: wf.z0 + (wf.rows - 1) * wf.dz + 0.9 };
    const inField = (x, z) => x > W.x0 - 0.3 && x < W.x1 + 0.3 && z > W.z0 - 0.3 && z < W.z1 + 0.3;
    layer({ x0: -15, z0: -30, x1: 21.5, z1: 20.4 }, 41, (T) => {
      const SOIL = 0xb9966a, SOIL_D = 0x8f6c46;
      T.soft(W.x0, W.z0, W.x1, W.z1, SOIL, 1, 0.35, 0.5);
      T.ragged(W.x0, W.z0, W.x1, W.z1, SOIL, 0.7, 0.55);
      T.atop(W.x0 - 1, W.z0 - 1, W.x1 + 1, W.z1 + 1, () => {
        for (let i = 0; i < wf.rows; i++) {                                // straw-gold rows with dark furrows between
          const z = wf.z0 + i * wf.dz;
          T.ctx.fillStyle = css(0xdcc080, 0.5); T.ctx.fillRect(T.X(W.x0 - 1), T.Z(z - 0.3), (W.x1 - W.x0 + 2) * T.k, 0.6 * T.k);
          T.ctx.fillStyle = css(SOIL_D, 0.45); T.ctx.fillRect(T.X(W.x0 - 1), T.Z(z + 0.42), (W.x1 - W.x0 + 2) * T.k, 0.16 * T.k);
        }
      });
      T.speckle(W.x0, W.z0, W.x1, W.z1, 800, [css(SOIL_D, 0.4), css(0xf0dca0, 0.6), css(0x7a5a38, 0.3)]);
      T.soft(SS.minX - 0.1, -30, SS.maxX + 0.1, 19.6, DIRT, 1, 0.45, 0.4);
      T.soft(SS.maxX - 0.5, -6.2, 10.5, 2.6, DIRT, 1, 0.5, 0.9);                    // the stall's apron
      T.strip([[10.3, 0], [20.6, 0.1]], 2.6, DIRT);                                 // the queue
      for (const id of ['keeper', 'scythe', 'hand1']) padBlob(T, id);
      T.wear(1.5, inField);
      // two soft wheel ruts down the street
      T.atop(SS.minX, -30, SS.maxX, 19.6, () => { for (const x of [SS.minX + 1.1, SS.maxX - 1.1]) { T.ctx.fillStyle = css(DIRT_D, 0.2); T.ctx.fillRect(T.X(x - 0.18), T.Z(-30), 0.36 * T.k, 49.6 * T.k); } });
    });
  }
  const groundMill = layer({ x0: -17.5, z0: 6.0, x1: 2.2, z1: 14.8 }, 42, (T) => {
    T.soft(-12.9, 9.3, SS.minX + 0.5, 14.0, DIRT, 1, 0.5, 0.9);
    T.strip([[-8, 9.4], [-8.2, 7.4]], 2.6, DIRT, 0.85);
    T.strip([[-11.2, 9.6], [-13.4, 8.2], [-15.8, 8.4]], 2.6, DIRT, 0.9);            // the combine's corner
    padBlob(T, 'mill'); T.wear();
  }, false);
  const groundBakery = layer({ x0: 4.2, z0: 6.2, x1: 11.4, z1: 15.2 }, 43, (T) => {
    T.soft(SS.maxX - 0.5, 7.0, 8.7, 14.4, DIRT, 1, 0.5, 0.9);
    T.soft(6.6, 8.6, 10.6, 10.5, DIRT, 1, 0.4, 0.5);
    T.wear();
  }, false);
  const groundTruck = layer({ x0: 6.8, z0: -0.8, x1: 24, z1: 13.2 }, 44, (T) => {
    T.strip(truckPath, 2.5, DIRT);
    const tc = ST.get('truckcash').def.cashPile;
    T.blob(tc.x, tc.z, 1.9, DIRT, 0.75);
    T.wear();
    T.atop(6.8, -0.8, 24, 13.2, () => {                                             // tyre tracks
      for (const s of [-0.55, 0.55]) {
        T.ctx.strokeStyle = css(DIRT_D, 0.28); T.ctx.lineWidth = 0.3 * T.k; T.ctx.lineJoin = 'round'; T.ctx.beginPath();
        truckPath.forEach(([x, z], i) => { if (i) T.ctx.lineTo(T.X(x + s * 0.3), T.Z(z + s)); else T.ctx.moveTo(T.X(x + s * 0.3), T.Z(z + s)); });
        T.ctx.stroke();
      }
    });
  }, false);
  const PDK = LAY.paddock;
  const groundDairy = layer({ x0: 4.4, z0: -20.6, x1: 21, z1: -4.8 }, 45, (T) => {
    const STRAW = 0xe9d8a4;
    const inPad = (x, z) => inRect(x, z, PDK, 0.5);
    T.soft(SS.maxX - 0.5, -12.6, 7.0, -9.2, DIRT, 1, 0.5, 0.7);                     // creamery door
    T.soft(6.9, -17.4, 11.5, -12.4, DIRT, 1, 0.5, 0.9);                             // milk bay
    T.strip([[SS.maxX, -15.5], [7.4, -15.6]], 2.2, DIRT);
    T.strip([[7.6, -6], [11.7, -8]], 2.3, DIRT);                                    // to the trough
    padBlob(T, 'dairy');
    T.wear(1.6, inPad);
    T.soft(PDK.minX, PDK.minZ, PDK.maxX + 0.5, PDK.maxZ - 0.2, STRAW, 0.97, 0.5, 0.8);
    T.ragged(PDK.minX, PDK.minZ, PDK.maxX + 0.5, PDK.maxZ - 0.2, STRAW, 0.6, 0.7);
    T.speckle(PDK.minX - 0.5, PDK.minZ - 0.5, PDK.maxX + 1, PDK.maxZ, 800, [css(0xcfb26a, 0.6), css(0xfbf0c8, 0.75), css(0xb89468, 0.3)], 0.04, 0.14, (x, z) => !inPad(x, z));
  }, false);
  const groundPatch = layer({ x0: -14.2, z0: -19.2, x1: 2.4, z1: -5.9 }, 46, (T) => {
    const pf = LAY.pumpkins, SOIL = 0xab8b68;
    const PP = { x0: pf.x0 - 1.0, x1: pf.x0 + (pf.cols - 1) * pf.dx + 0.9, z0: pf.z0 - 1.0, z1: pf.z0 + (pf.rows - 1) * pf.dz + 0.9 };
    T.strip([[SS.minX, -7.6], [-7.2, -7.7]], 2.4, DIRT);                            // the lane to the patch
    T.wear();
    T.soft(PP.x0, PP.z0, PP.x1, PP.z1, SOIL, 1, 0.35, 0.5);
    T.ragged(PP.x0, PP.z0, PP.x1, PP.z1, SOIL, 0.7, 0.55);
    T.atop(PP.x0 - 1, PP.z0 - 1, PP.x1 + 1, PP.z1 + 1, () => {
      for (let i = 0; i < pf.rows; i++) for (let j = 0; j < pf.cols; j++) {       // a mound under every vine
        const cx = pf.x0 + j * pf.dx, cz = pf.z0 + i * pf.dz;
        const g = T.ctx.createRadialGradient(T.X(cx), T.Z(cz), 0, T.X(cx), T.Z(cz), 0.62 * T.k);
        g.addColorStop(0, css(0xc9aa80, 0.9)); g.addColorStop(1, css(0xc9aa80, 0));
        T.ctx.fillStyle = g; T.ctx.fillRect(T.X(cx - 0.7), T.Z(cz - 0.7), 1.4 * T.k, 1.4 * T.k);
      }
    });
    T.speckle(PP.x0, PP.z0, PP.x1, PP.z1, 420, [css(0x8a6a4a, 0.45), css(0xd9bf96, 0.5)]);
  }, false);
  const groundJunction = layer({ x0: -5, z0: 12.6, x1: 17.4, z1: 20.2 }, 47, (T) => {
    T.soft(-3.8, 15.5, 9.4, 19.7, DIRT, 1, 0.5, 0.9);
    for (const id of ['junction', 'porter1', 'town', 'clock']) padBlob(T, id);
    T.wear();
  }, false);
  ST.onOpen('mill', (live) => groundMill.show(live));
  ST.onOpen('bakery', (live) => groundBakery.show(live));
  ST.onOpen('truckcash', (live) => groundTruck.show(live));
  ST.onOpen('trough', (live) => groundDairy.show(live));
  ST.onOpen('pumpkins', (live) => groundPatch.show(live));
  ST.onOpen('platform', (live) => groundJunction.show(live));

  // ------------------------------------------------- rails, crossing, backdrop --
  const RZ = LAY.railZ;
  {
    const b = new Parts();
    const x0 = -66, x1 = 70;
    b.box(0xa59a8a, x1 - x0, 0.1, 2.9, [(x0 + x1) / 2, 0.05, RZ]);
    b.box(0x8f8577, x1 - x0, 0.06, 2.1, [(x0 + x1) / 2, 0.11, RZ]);
    for (let x = x0 + 0.4; x < x1; x += 0.85) b.box(x > LAY.roadX - 2.1 && x < LAY.roadX + 2.1 ? COLORS.wood : 0x6b4a32, 0.3, 0.1, 2.2, [x, 0.17, RZ]);
    for (const s of [-1, 1]) {
      b.box(0x5a6270, x1 - x0, 0.14, 0.11, [(x0 + x1) / 2, 0.28, RZ + s * 0.74]);
      b.box(0xc9d1da, x1 - x0, 0.02, 0.07, [(x0 + x1) / 2, 0.355, RZ + s * 0.74]);
    }
    // planks of the level crossing
    b.box(COLORS.woodLight, 3.9, 0.16, 1.2, [LAY.roadX, 0.25, RZ]);
    for (const s of [-1, 1]) b.box(COLORS.wood, 3.9, 0.16, 0.6, [LAY.roadX, 0.2, RZ + s * 1.15]);
    // crossbucks
    for (const [x, z] of [[LAY.roadX - 2.4, RZ - 2.3], [LAY.roadX + 2.4, RZ + 2.3]]) {
      b.cyl(COLORS.cream, 0.07, 0.09, 2.6, [x, 1.3, z], null, 6);
      b.box(COLORS.cream, 1.3, 0.2, 0.06, [x, 2.45, z], [0, FACE_CAMERA, 0.6]);
      b.box(COLORS.cream, 1.3, 0.2, 0.06, [x, 2.45, z], [0, FACE_CAMERA, -0.6]);
      b.box(COLORS.red, 0.3, 0.2, 0.07, [x - 0.03, 2.45, z - 0.03], [0, FACE_CAMERA, 0]);
    }
    addMesh(root, b.merged({ ao: { ground: 0.12, groundH: 0.2, down: 0, noBoxes: true } }), { cast: false }).name = 'rails';
  }
  const barriers = [];
  for (const [x, z, yaw] of [[LAY.roadX - 2.25, RZ - 1.9, 0], [LAY.roadX + 2.25, RZ + 1.9, Math.PI]]) {
    const bar = makeBarrier();
    place(bar, x, z, yaw);
    bar.userData.arm.rotation.z = 1.25;
    root.add(bar);
    barriers.push(bar);
  }

  // ------------------------------------------------------------ the stall --
  {
    const PC = stall.def.counter;
    root.add(fixed(place(makeStall(), PC.x, PC.z, PC.yaw)));
    root.add(decal(makeDropDecal('SELL', 3.5), stall.def.dropZone.x, stall.def.dropZone.z));
    root.add(decal(makeCashDecal(3.0), stall.def.cashPile.x, stall.def.cashPile.z));
    const sg = new THREE.Group();
    sg.add(signBoard([{ text: 'MARKET', size: 150, color: '#ffffff', stroke: '#7a2a1c' }], '#c9483a', 2.2, 0.8));
    place(sg, PC.x - 0.55, PC.z, Math.PI * 1.5, 3.42);
    root.add(fixed(sg));
  }

  // ------------------------------------------------------------- windmill --
  const millG = makeWindmill();
  place(millG, mill.pos.x, mill.pos.z, 0);
  hidden(millG);
  const millDecals = [
    decal(makeZone({ w: 2.9, d: 2.9, label: 'WHEAT' }), mill.def.dropZone.x, mill.def.dropZone.z),
    decal(makeZone({ w: 2.7, d: 2.7, label: 'FLOUR', color: '#ffe9a8', fill: 'rgba(255,190,70,0.24)' }), mill.def.output.zone.x, mill.def.output.zone.z),
  ];
  {
    const pl = new Parts();
    pl.rbox(COLORS.wood, 2.0, 0.1, 1.3, 0.04, [mill.def.input.layout.x, 0.06, mill.def.input.layout.z], null, null, 1);
    pl.rbox(COLORS.woodLight, 1.8, 0.1, 1.3, 0.04, [mill.def.output.layout.x, 0.06, mill.def.output.layout.z], null, null, 1);
    millDecals.push(addMesh(new THREE.Group(), pl.merged(), { cast: false }));
    for (const d of millDecals) hidden(d);
    const ud = millG.userData;
    mill.machine.mouth.set(mill.pos.x + ud.mouth[0], ud.mouth[1], mill.pos.z + ud.mouth[2]);
    mill.machine.spout.set(mill.pos.x + ud.spout[0], ud.spout[1], mill.pos.z + ud.spout[2]);
  }
  ST.onOpen('mill', (live) => { millG.visible = true; millDecals.forEach((d) => { d.visible = true; }); if (live) popIn(millG); });

  // --------------------------------------------------------------- bakery --
  const bakeG = makeBakery();
  place(bakeG, bakery.pos.x, bakery.pos.z, 0);
  hidden(bakeG);
  const bakeDecals = [
    decal(makeZone({ w: 2.7, d: 2.7, label: 'FLOUR' }), bakery.def.dropZone.x, bakery.def.dropZone.z),
    decal(makeZone({ w: 2.7, d: 2.7, label: 'BREAD', color: '#ffe9a8', fill: 'rgba(255,190,70,0.24)' }), bakery.def.output.zone.x, bakery.def.output.zone.z),
  ];
  const chimney = new THREE.Vector3();
  {
    const pl = new Parts();
    pl.rbox(COLORS.wood, 1.8, 0.1, 1.3, 0.04, [bakery.def.input.layout.x, 0.06, bakery.def.input.layout.z], null, null, 1);
    pl.rbox(COLORS.woodLight, 2.9, 0.1, 0.8, 0.04, [bakery.def.output.layout.x, 0.06, bakery.def.output.layout.z], null, null, 1);
    bakeDecals.push(addMesh(new THREE.Group(), pl.merged(), { cast: false }));
    for (const d of bakeDecals) hidden(d);
    const ud = bakeG.userData;
    bakery.machine.mouth.set(bakery.pos.x + ud.mouth[0], ud.mouth[1], bakery.pos.z + ud.mouth[2]);
    bakery.machine.spout.set(bakery.pos.x + ud.spout[0], ud.spout[1], bakery.pos.z + ud.spout[2]);
    chimney.set(bakery.pos.x + ud.chimney[0], ud.chimney[1], bakery.pos.z + ud.chimney[2]);
  }
  ST.onOpen('bakery', (live) => { bakeG.visible = true; bakeDecals.forEach((d) => { d.visible = true; }); if (live) popIn(bakeG); });
  const snd = { pos: { x: 0, z: 0 }, volume: 1 };
  const playAt = (name, x, z, volume) => { if (G.audio && G.audio.play) { snd.pos.x = x; snd.pos.z = z; snd.volume = volume; G.audio.play(name, snd); } };
  G.events.on('convert', (e) => {
    if (e.stationId === 'bakery') pop(bakeG);
    else if (e.stationId === 'creamery') pop(creamG);
    else if (e.stationId === 'mill') playAt('creak', mill.pos.x, mill.pos.z, 0.5);
  });
  G.events.on('trough', (e) => { if (e.boosting) playAt('moo', trough.pos.x, trough.pos.z - 3, 0.8); });

  // the bakery truck's cash
  {
    const tc = ST.get('truckcash');
    const cd = hidden(decal(makeCashDecal(2.6), tc.def.cashPile.x, tc.def.cashPile.z));
    ST.onOpen('truckcash', () => { cd.visible = true; });
  }

  // ------------------------------------------------------------- creamery --
  const creamG = makeCreamery();
  place(creamG, creamery.pos.x, creamery.pos.z, 0);
  hidden(creamG);
  const creamDecals = [
    decal(makeZone({ w: 2.7, d: 2.7, label: 'MILK' }), creamery.def.dropZone.x, creamery.def.dropZone.z),
    decal(makeZone({ w: 2.7, d: 2.7, label: 'CHEESE', color: '#ffe9a8', fill: 'rgba(255,190,70,0.24)' }), creamery.def.output.zone.x, creamery.def.output.zone.z),
  ];
  {
    const pl = new Parts();
    pl.rbox(COLORS.wood, 2.5, 0.1, 0.7, 0.04, [creamery.def.input.layout.x, 0.06, creamery.def.input.layout.z], null, null, 1);
    pl.rbox(COLORS.woodLight, 0.9, 0.1, 2.3, 0.04, [creamery.def.output.layout.x, 0.06, creamery.def.output.layout.z], null, null, 1);
    creamDecals.push(addMesh(new THREE.Group(), pl.merged(), { cast: false }));
    for (const d of creamDecals) hidden(d);
    const ud = creamG.userData;
    creamery.machine.mouth.set(creamery.pos.x + ud.mouth[0], ud.mouth[1], creamery.pos.z + ud.mouth[2]);
    creamery.machine.spout.set(creamery.pos.x + ud.spout[0], ud.spout[1], creamery.pos.z + ud.spout[2]);
  }
  ST.onOpen('creamery', (live) => { creamG.visible = true; creamDecals.forEach((d) => { d.visible = true; }); if (live) popIn(creamG); });

  // ------------------------------------------------- the dairy: cows, trough --
  const PD = LAY.paddock;
  const dairy = new THREE.Group();
  hidden(dairy);
  const COWS = [];
  let cowMesh = null, feed = null;
  {
    const tm = meshOf(makeTroughGeometry(trough.def.trough.len), { receive: true });
    place(tm, trough.pos.x, trough.pos.z, 0);
    dairy.add(fixed(tm));
    feed = new THREE.Mesh(new THREE.BoxGeometry(trough.def.trough.len - 0.3, 1, 0.66).translate(0, 0.5, 0), litMaterial({ color: COLORS.wheat }));
    feed.position.set(trough.pos.x, 0.42, trough.pos.z);
    feed.scale.y = 0.001;
    dairy.add(feed);
    dairy.add(decal(makeZone({ w: 2.5, d: 2.5, label: 'FEED' }), trough.def.dropZone.x, trough.def.dropZone.z));
    // the paddock fence: along the north side behind the trough, the east side and the south side
    const f = new Parts();
    fenceRun(f, PD.minX + 1.2, PD.maxZ, PD.maxX + 0.9, PD.maxZ);
    fenceRun(f, PD.maxX + 0.9, PD.maxZ, PD.maxX + 0.9, PD.minZ - 0.6);
    fenceRun(f, PD.maxX + 0.9, PD.minZ - 0.6, 6.4, PD.minZ - 0.6);
    hayBale(f, 18.3, -18.2, 0.5, 0.5, 0.85); hayBale(f, 17.3, -18.4, -0.3, 0.5, 0.85);
    // a water tub
    f.cyl(COLORS.wood, 0.55, 0.5, 0.5, [12.5, 0.25, -17.9], null, 10);
    f.cyl(COLORS.water, 0.47, 0.47, 0.03, [12.5, 0.47, -17.9], null, 10);
    dairy.add(addMesh(new THREE.Group(), f.merged({ ao: { ground: 0.15, groundH: 0.3, down: 0.05, noBoxes: true } })));
    const pb = ST.get('paddock').blockers;
    pb.push({ x: (PD.minX + 1.2 + PD.maxX + 0.9) / 2, z: PD.maxZ, hx: (PD.maxX + 0.9 - PD.minX - 1.2) / 2, hz: 0.14 });
    pb.push({ x: 12.5, z: -17.9, r: 0.55 });
    // the cows: one beside every churn, two more at the trough
    const g = LAY.milk;
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      COWS.push({ x: g.x0 + c * g.dx + 1.05, z: g.z0 + r * g.dz + 0.1, yaw: FACE_CAMERA + (rnd() - 0.5) * 0.9, ph: rnd() * 6.28, s: 0.92 + rnd() * 0.16 });
    }
    COWS.push({ x: 14.3, z: -9.25, yaw: 0, ph: 1, s: 1, eat: true }, { x: 16.7, z: -9.3, yaw: 0.2, ph: 3, s: 0.95, eat: true });
    for (const cw of COWS) pb.push({ x: cw.x, z: cw.z, r: 0.5 });
    cowMesh = new THREE.InstancedMesh(getGeometry('cube-pets/animal-cow', { height: 1.25 }), getSharedMaterial(), COWS.length);
    cowMesh.castShadow = true;
    cowMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3((PD.minX + PD.maxX) / 2, 0.6, (PD.minZ + PD.maxZ) / 2), 9);
    dairy.add(cowMesh);
  }
  ST.onOpen('trough', (live) => { dairy.visible = true; if (live) popIn(dairy); });

  // ------------------------------------------------------------ the junction --
  const DK = LAY.deck;
  const junction = new THREE.Group();
  hidden(junction);
  const signal = makeSignal();
  let board = null, boardCtx = null, boardTex = null;
  {
    const b = new Parts();
    const dw = DK.maxX - DK.minX, dd = DK.maxZ - DK.minZ, cx = (DK.minX + DK.maxX) / 2, cz = (DK.minZ + DK.maxZ) / 2;
    b.rbox(0xd9cdb8, dw, DK.h, dd, 0.06, [cx, DK.h / 2, cz], null, null, 1);
    b.box(0xb9ad98, dw + 0.06, DK.h * 0.55, dd + 0.06, [cx, DK.h * 0.28, cz]);
    b.box(COLORS.gold, dw - 0.3, 0.02, 0.16, [cx, DK.h + 0.011, DK.maxZ - 0.26]);                   // the safety line by the track
    for (let i = 0; i < 9; i++) b.box(0xc6baa4, 0.05, 0.012, dd - 0.1, [DK.minX + (i + 1) * dw / 10, DK.h + 0.007, cz]);
    // ramps down to the yard at both ends, a pallet under the goods, luggage, lamps
    b.rbox(COLORS.woodLight, 7.6, 0.07, 1.25, 0.03, [LAY.platform.x, DK.h + 0.03, LAY.platform.z], null, null, 1);
    for (let i = 0; i < 6; i++) b.box(COLORS.wood, 0.12, 0.071, 1.27, [LAY.platform.x - 3.2 + i * 1.28, DK.h + 0.031, LAY.platform.z]);
    const up = new Parts();        // things standing on the deck
    addLamp(up, -8.2, DK.minZ + 0.3, 0.3, -1, 3.1); addLamp(up, -1.4, DK.maxZ - 0.5, 0.3, -1, 3.1); addLamp(up, 7.6, DK.minZ + 0.3, -0.3, -1, 3.1);
    addCrate(up, -5.4, 20.4, 0.6, 0.3); addCrate(up, -4.7, 20.9, 0.5, -0.2, COLORS.woodLight); addBarrel(up, -6.3, 20.9);
    b.append(up, [0, DK.h, 0]);
    b.add(makeStationHouse(), 0xffffff, [LAY.stationHouse.x, DK.h, LAY.stationHouse.z], null, null, true);
    junction.add(addMesh(new THREE.Group(), b.merged({ ao: { ground: 0.14, groundH: 0.4, down: 0.05, noBoxes: true } })));
    place(signal, DK.minX + 0.7, DK.maxZ - 0.35, FACE_CAMERA, DK.h);
    junction.add(signal);
    // the station's name board
    const name = signBoard([{ text: 'WHEATWHISTLE', size: 104, color: '#2a6e60', stroke: 'rgba(255,255,255,0.5)' }], '#fff4dc', 2.36, 0.33, '#2a6e60');
    name.position.set(LAY.stationHouse.x, DK.h + 2.75, LAY.stationHouse.z - 1.7); name.rotation.y = Math.PI;
    junction.add(fixed(name));
    junction.add(decal(makeZone({ w: 3.3, d: 3.3, label: 'LOAD', sub: 'for the train' }), platform.def.dropZone.x, platform.def.dropZone.z));
    const tc = ST.get('traincash');
    junction.add(decal(makeCashDecal(2.8), tc.def.cashPile.x, tc.def.cashPile.z));
    // the train board: when the next one is due, and how full it is
    const cv = document.createElement('canvas');
    cv.width = 320; cv.height = 160;
    boardCtx = cv.getContext('2d');
    boardTex = new THREE.CanvasTexture(cv);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    board = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.05), new THREE.MeshBasicMaterial({ map: boardTex }));
    face.position.y = 2.75;
    board.add(face);
    const bp = new Parts();
    bp.rbox(COLORS.tealDark, 2.3, 1.25, 0.1, 0.05, [0, 2.75, -0.06], null, null, 1);
    for (const x of [-0.95, 0.95]) bp.cyl(COLORS.tealDark, 0.06, 0.08, 2.2, [x, 1.1, -0.06], null, 6);
    bp.sph(COLORS.gold, 0.1, [0, 3.44, -0.06], null, null, 6, 5);
    board.add(meshOf(bp.merged()));
    place(board, 6.9, 18.9, FACE_CAMERA);
    junction.add(board);
  }
  // before the railway: a sign on the old line
  const railSign = new THREE.Group();
  {
    railSign.add(signBoard([{ text: 'OLD RAILWAY', size: 84, color: '#ffffff', stroke: '#1f5348' }, { text: 'BUILD A STATION', size: 50, color: '#ffe9a8', stroke: '#1f5348' }], '#2d9480', 2.5, 1.25));
    const pp = new Parts();
    for (const x of [-0.9, 0.9]) pp.cyl(COLORS.woodDark, 0.07, 0.08, 2.4, [x, -1.25, -0.05], null, 6);
    railSign.add(meshOf(pp.merged()));
    place(railSign, 3.6, 20.7, FACE_CAMERA, 2.35);
    root.add(railSign);
  }
  ST.onOpen('platform', (live) => { railSign.visible = false; junction.visible = true; if (live) popIn(junction); });
  G.events.on('train', (e) => {
    if (e.phase !== 'full' || !(e.bonus > 0)) return;
    const p = e.worker.loco.position;
    if (G.fx.popText) G.fx.popText({ x: p.x + 4, y: 3.4, z: p.z - 1.5 }, 'FULL TRAIN! +$' + e.bonus, { color: '#ffe14d', size: 1.5, life: 1.6, maxW: 0.9 });
    if (G.fx.confetti) G.fx.confetti({ x: p.x + 6, y: 1.5, z: p.z - 1 }, 70);
    if (G.audio && G.audio.play) G.audio.play('orderDone');
  });

  // ------------------------------------------------------- scenery layout --
  // where nothing may stand: the play area (inside the bounds), the railway, the road and the building sites
  const keep = [
    { minX: WB.minX - 1.2, maxX: WB.maxX + 0.6, minZ: WB.minZ - 1.4, maxZ: WB.maxZ + 0.4 },
    { minX: -70, maxX: 74, minZ: RZ - 2.4, maxZ: RZ + 2.4 },
    { minX: LAY.roadX - 3.0, maxX: LAY.roadX + 3.0, minZ: -70, maxZ: 84 },
    { minX: DK.minX - 1, maxX: DK.maxX + 2.5, minZ: 19, maxZ: 23 },
    { minX: LAY.fair.x - 8, maxX: LAY.fair.x + 8, minZ: LAY.fair.z - 6.2, maxZ: LAY.fair.z + 8 },
    { minX: LAY.gate.x - 4, maxX: LAY.gate.x + 4, minZ: -32, maxZ: -19 },
  ];
  const taken = [];
  const free = (x, z, r) => {
    for (const q of keep) if (inRect(x, z, q, r)) return false;
    for (const t of taken) if (Math.hypot(x - t.x, z - t.z) < t.r + r) return false;
    return true;
  };
  const claim = (x, z, r) => { taken.push({ x, z, r }); };

  // the town's building plots (claimed now, so no tree ever stands where a cottage will)
  const PLOTS = [
    // across the tracks, west of the fairground
    { x: -6.5, z: 27.6, v: 0, s: 1.05 }, { x: -1.6, z: 28.4, v: 3, s: 0.95, ridge: 'x' }, { x: 3.2, z: 27.4, v: 2, s: 1.0 },
    // round the level crossing and along the road
    { x: 26.6, z: 27.8, v: 1, s: 1.1, ridge: 'x' }, { x: 27.2, z: 18.4, v: 0, s: 1.0 }, { x: 27.4, z: 12.6, v: 4, s: 0.95, ridge: 'x' },
    { x: 27.0, z: 6.4, v: 2, s: 1.05 }, { x: 27.3, z: 0.2, v: 3, s: 0.95 }, { x: 27.0, z: -6.2, v: 1, s: 1.0, ridge: 'x' }, { x: 31.6, z: 23.0, v: 4, s: 1.0 },
  ];
  for (const p of PLOTS) claim(p.x, p.z, 3.1);

  // big farm buildings as a backdrop, north-west beyond the tracks
  const AO = { ground: 0.14, groundH: 0.6, down: 0.08, noBoxes: true };
  {
    const b = new Parts();
    b.model('farmbuildings/Barn', { pos: [-17, 0, 30.5], rot: [0, FACE_CAMERA, 0], scale: 1.75 });
    b.model('farmbuildings/Silo', { pos: [-22.4, 0, 28.2], scale: 1.45 });
    hayBale(b, -12.6, 27.2, 0.4); hayBale(b, -11.4, 27.9, 0.9); hayBale(b, -12.2, 27.6, 0.5, 0.5, 0.85, 1.0);
    addMesh(root, b.merged({ ao: AO }));
    claim(-17, 30.5, 6.5); claim(-22.4, 28.2, 3); claim(-12, 27.6, 2.2);
  }
  // patchwork fields in the distance (flat, textured)
  {
    const wt = wheatTexture();
    for (const [x0, x1, z0, z1, rot] of [[-40, -22, -16, 4, 0], [-42, -24, 8, 22, 1], [-20, 0, -44, -30, 1], [34, 52, -30, -12, 0], [-44, -30, 30, 48, 0], [32, 50, 34, 50, 1]]) {
      const t = wt.clone(); t.needsUpdate = true; t.repeat.set((rot ? z1 - z0 : x1 - x0) / 4, (rot ? x1 - x0 : z1 - z0) / 4); t.rotation = rot ? Math.PI / 2 : 0;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), litMaterial({ map: t }));
      m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.02, (z0 + z1) / 2); m.receiveShadow = true;
      root.add(fixed(m));
      claim((x0 + x1) / 2, (z0 + z1) / 2, Math.max(x1 - x0, z1 - z0) / 2 + 0.5);
    }
  }

  // fences, bales, the scarecrow and the well round the fields
  {
    const b = new Parts();
    const wf = LAY.wheat, fx = wf.x0 - 1.6;
    fenceRun(b, fx, 6.9, fx, -19.9);
    fenceRun(b, fx, -19.9, 1.0, -19.9);
    fenceRun(b, 5.6, -19.9, 6.4, -19.9);
    fenceRun(b, -19.4, 6.9, fx, 6.9);
    const bales = makeHayBales();
    b.add(bales, 0xffffff, [-16.6, 0, 3.2], [0, 0.5, 0], null, true);
    b.add(bales, 0xffffff, [-17.4, 0, -12.5], [0, -0.7, 0], null, true);
    b.add(makeScarecrow(), 0xffffff, [-6.4, 0, 0.4], [0, FACE_CAMERA + 0.25, 0], null, true);
    b.add(makeWell(), 0xffffff, [-17.6, 0, -4.2], [0, FACE_CAMERA + Math.PI / 2, 0], null, true);
    hayBale(b, -1.6, 6.9, 1.2, 0.5, 0.85);
    addCrate(b, 0.3, 7.3, 0.55, 0.3); addCrate(b, 0.95, 6.75, 0.45, -0.4, COLORS.woodLight);
    addBarrel(b, 5.9, 3.6); addCrate(b, 6.0, -6.6, 0.5, 0.2);
    for (let i = 0; i < 4; i++) addPumpkin(b, -13.4 + (i % 2) * 0.6, -9.2 + i * 0.45, 1.1 + (i % 2) * 0.3);
    addMesh(root, b.merged({ ao: { ground: 0.15, groundH: 0.35, down: 0.05, noBoxes: true } }));
    block(-6.4, 0.4, 0.3); block(-1.6, 6.9, 0.6); block(0.6, 7.0, 0.55); block(5.9, 3.6, 0.4); block(6.0, -6.6, 0.4);
    claim(-16.6, 3.2, 2.2); claim(-17.4, -12.5, 2.2); claim(-17.6, -4.2, 1.8);
  }

  // trees, bushes, flowers and tufts: merged per quadrant so off-screen ones are culled
  {
    const TREES = [
      ['nature-kit/tree_default', 4.6, 0.75, 0xfff0c0], ['nature-kit/tree_oak', 4.2, 0.9, 0xfff0c0], ['nature-kit/tree_fat', 3.6, 0.8, 0xfff2c8],
      ['nature-kit/tree_oak_fall', 4.3, 0.9, 0xffb060], ['nature-kit/tree_default', 5.2, 0.8, 0xffd27a], ['nature-kit/tree_thin', 4.8, 0.6, 0xfff0c0],
      ['nature-kit/tree_small', 3.2, 0.5, 0xffdc8c], ['nature-kit/tree_oak_fall', 3.6, 0.8, 0xffc878],
    ];
    const hi = [new Parts(), new Parts(), new Parts(), new Parts()], lo = [new Parts(), new Parts(), new Parts(), new Parts()];
    const quad = (x, z) => (x > 3 ? 1 : 0) + (z > 2 ? 2 : 0);
    let n = 0;
    for (let i = 0; i < 2600 && n < 190; i++) {
      const x = -50 + rnd() * 106, z = -48 + rnd() * 104;
      const [id, h, rad, tint] = TREES[(rnd() * TREES.length) | 0];
      const sc = 0.85 + rnd() * 0.45;
      if (!free(x, z, rad * sc + 0.6)) continue;
      // dense near the play area, thinning with distance
      const d = Math.max(Math.abs(x), Math.abs(z)) - 24;
      if (d > 0 && rnd() < d / 30) continue;
      hi[quad(x, z)].model(id, { height: h, pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], scl: [sc, sc, sc], tint });
      claim(x, z, rad * sc + 0.9);
      n++;
    }
    // a hedgerow of bushes along the outside of the fences
    const BUSH = ['nature-kit/plant_bushLarge', 'nature-kit/plant_bushDetailed', 'nature-kit/plant_bush'];
    const bush = (x, z, w) => { lo[quad(x, z)].model(BUSH[(rnd() * 3) | 0], { width: w, pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], tint: rnd() < 0.3 ? 0xffd890 : 0xfff2c0 }); };
    for (let z = -19; z < 6.5; z += 1.5 + rnd() * 0.7) if (rnd() < 0.8) bush(-15.2 + rnd() * 0.5, z, 1.5 + rnd() * 0.8);
    for (let x = -13; x < 19; x += 1.6 + rnd() * 0.8) if (rnd() < 0.8 && Math.abs(x - LAY.gate.x) > 3.2) bush(x, -20.9 - rnd() * 0.5, 1.5 + rnd() * 0.8);
    for (let i = 0; i < 150; i++) {
      const x = -44 + rnd() * 92, z = -42 + rnd() * 92;
      if (free(x, z, 1.0)) bush(x, z, 1.1 + rnd() * 1.0);
    }
    // rocks
    for (let i = 0; i < 40; i++) {
      const x = -40 + rnd() * 84, z = -38 + rnd() * 84;
      if (!free(x, z, 1.0)) continue;
      lo[quad(x, z)].model(rnd() < 0.3 ? 'nature-kit/rock_largeA' : rnd() < 0.5 ? 'nature-kit/rock_smallD' : 'nature-kit/rock_smallA', { width: 0.8 + rnd() * 1.0, pos: [x, 0, z], rot: [0, rnd() * 6.28, 0], tint: 0xffe8c8 });
    }
    for (let q = 0; q < 4; q++) {
      if (hi[q].parts.length) addMesh(root, hi[q].merged({ ao: AO }), { cast: true, receive: false }).name = 'trees' + q;
      if (lo[q].parts.length) addMesh(root, lo[q].merged({ ao: { ground: 0.2, groundH: 0.3, down: 0.08, noBoxes: true } }), { cast: false, receive: true }).name = 'bushes' + q;
    }

    // flowers and grass tufts on the grass, inside the play area too (they block nothing): instanced
    const onDirt = (x, z) => {
      const S = LAY.street, wf = LAY.wheat, pf = LAY.pumpkins;
      if (x > S.minX - 0.6 && x < S.maxX + 0.6 && z < 19.6) return true;
      if (inRect(x, z, { minX: wf.x0 - 1.3, maxX: wf.x0 + 14.2, minZ: wf.z0 - 1.3, maxZ: wf.z0 + 12.3 })) return true;
      if (inRect(x, z, { minX: pf.x0 - 1.4, maxX: pf.x0 + 12.2, minZ: pf.z0 - 1.4, maxZ: pf.z0 + 7.5 })) return true;
      if (inRect(x, z, PD, 0.8)) return true;
      if (inRect(x, z, { minX: -13.2, maxX: 9, minZ: 8.6, maxZ: 14.8 }) || inRect(x, z, { minX: -4.4, maxX: 14.5, minZ: 15, maxZ: 23 })) return true;
      if (inRect(x, z, { minX: 5, maxX: 20, minZ: -6.8, maxZ: 11.4 }) || inRect(x, z, { minX: 5, maxX: 12, minZ: -18, maxZ: -8 })) return true;
      if (Math.abs(z - RZ) < 2.2 || Math.abs(x - LAY.roadX) < 2.6) return true;
      if (Math.hypot(x - LAY.fair.x, z - LAY.fair.z) < 7.2) return true;
      for (const p of G.world.pads) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 2.0) return true;
      for (const p of PLOTS) if (Math.hypot(x - p.x, z - p.z) < 2.6) return true;
      return false;
    };
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
    const scatter = (id, opts, count, tries, sMin, sMax, near) => {
      const geo = getGeometry(id, opts);
      const spots = [];
      for (let i = 0; i < tries && spots.length < count; i++) {
        const x = near ? -24 + rnd() * 50 : -40 + rnd() * 84, z = near ? -24 + rnd() * 50 : -38 + rnd() * 84;
        if (onDirt(x, z)) continue;
        spots.push([x, z, sMin + rnd() * (sMax - sMin), rnd() * 6.28]);
      }
      // four instanced meshes (quadrants) so they cull
      for (let q = 0; q < 4; q++) {
        const list = spots.filter(([x, z]) => quad(x, z) === q);
        if (!list.length) continue;
        const im = new THREE.InstancedMesh(geo, getSharedMaterial(), list.length);
        const box = new THREE.Box3();
        list.forEach(([x, z, sc, yaw], i) => {
          im.setMatrixAt(i, m4.compose(p3.set(x, 0, z), q4.setFromAxisAngle(up, yaw), s3.set(sc, sc, sc)));
          box.expandByPoint(p3.set(x, 0, z)); box.expandByPoint(p3.set(x, 1, z));
        });
        im.castShadow = false; im.receiveShadow = false;
        im.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        im.boundingSphere.radius += 1;
        fixed(im);
        root.add(im);
      }
    };
    scatter('nature-kit/grass', { height: 0.42 }, 520, 3000, 0.7, 1.4, false);
    scatter('nature-kit/flower_yellowA', { height: 0.5 }, 150, 1200, 0.8, 1.3, true);
    scatter('nature-kit/flower_redA', { height: 0.55 }, 110, 1000, 0.8, 1.3, true);
    scatter('nature-kit/flower_purpleA', { height: 0.5 }, 90, 900, 0.8, 1.3, true);
  }

  // ------------------------------------------------------------- the town --
  // cottages (stage 5), the square round the stall's queue, the clock tower, the fair
  const townParts = [];
  {
    PLOTS.forEach((p, i) => {
      const b = new Parts();
      cottage(b, 0, 0, p.v, p.s, p.ridge || 'z');
      // a garden: a fence corner, a tree or flowers
      if (i % 2 === 0) b.model('nature-kit/tree_small', { height: 2.6, pos: [-2.2, 0, 1.2], tint: 0xffe8a8 });
      else b.model('nature-kit/plant_bushDetailed', { width: 1.2, pos: [-2.1, 0, -1.0], tint: 0xfff2c0 });
      for (let k = 0; k < 3; k++) b.model(k % 2 ? 'nature-kit/flower_redA' : 'nature-kit/flower_yellowA', { height: 0.5, pos: [0.7 + k * 0.35, 0, -1.75 * p.s] });
      const m = meshOf(b.merged({ ao: AO }));
      place(m, p.x, p.z, 0);
      townParts.push(hidden(m));
    });
    // street lamps and bunting along the road and the platform
    const b = new Parts();
    for (const [x, z] of [[25.0, 15.4], [25.0, 3.4], [25.0, -3.2], [19.9, 21.2], [-4.2, 25.4], [1.0, 25.5]]) addLamp(b, x, z, -0.7, -0.7, 2.9);
    addBunting(b, [25.0, 2.8, 3.4], [25.0, 2.8, -3.2], 10);
    addBunting(b, [-4.2, 2.8, 25.4], [1.0, 2.8, 25.5], 9);
    const lamps = meshOf(b.merged({ ao: { ground: 0.12, groundH: 0.3, down: 0, noBoxes: true } }));
    townParts.push(hidden(lamps));
  }
  G.pads.onDone('town', (live) => { townParts.forEach((o, i) => { o.visible = true; if (live) popIn(o, 0.15 + i * 0.12); }); });

  const squareParts = [];
  const fountain = makeFountain();
  {
    const SQ = LAY.square;
    const pave = makeGround('paving', SQ.maxX - SQ.minX, SQ.maxZ - SQ.minZ, { color: 0xe2cfae, tile: 4.2, seed: 21, y: 0.022 });
    pave.position.set((SQ.minX + SQ.maxX) / 2, 0.022, (SQ.minZ + SQ.maxZ) / 2);
    squareParts.push({ o: hidden(fixed(pave)), flat: true });
    place(fountain, LAY.fountain.x, LAY.fountain.z, 0);
    squareParts.push({ o: hidden(fountain) });
    const b = new Parts();
    const posts = [[SQ.minX + 0.5, SQ.maxZ - 0.4], [SQ.maxX - 0.6, SQ.maxZ - 0.4], [SQ.maxX - 0.6, SQ.minZ + 0.4], [SQ.minX + 0.5, SQ.minZ + 0.4]];
    for (const [x, z] of posts) addLamp(b, x, z, -0.7, -0.7, 3.0);
    addBunting(b, [posts[0][0], 2.9, posts[0][1]], [posts[1][0], 2.9, posts[1][1]], 14);
    addBunting(b, [posts[3][0], 2.9, posts[3][1]], [posts[2][0], 2.9, posts[2][1]], 14);
    // benches and flower tubs
    for (const [x, z] of [[13.0, 3.6], [17.6, 3.6]]) {
      b.rbox(COLORS.wood, 1.5, 0.1, 0.5, 0.03, [x, 0.48, z], null, null, 1);
      b.rbox(COLORS.wood, 1.5, 0.5, 0.08, 0.03, [x, 0.8, z + 0.24], null, null, 1);
      for (const sx of [-0.6, 0.6]) b.box(COLORS.iron, 0.07, 0.48, 0.44, [x + sx, 0.24, z]);
    }
    for (const [x, z] of [[11.0, -4.6], [18.6, -4.6]]) {
      b.cyl(COLORS.wood, 0.5, 0.42, 0.5, [x, 0.25, z], null, 10);
      for (let k = 0; k < 4; k++) b.model(k % 2 ? 'nature-kit/flower_redA' : 'nature-kit/flower_purpleA', { height: 0.6, pos: [x + Math.cos(k * 1.6) * 0.2, 0.45, z + Math.sin(k * 1.6) * 0.2] });
    }
    squareParts.push({ o: hidden(meshOf(b.merged({ ao: { ground: 0.12, groundH: 0.3, down: 0, noBoxes: true } }))) });
    const sqb = ST.get('square').blockers;
    for (const [x, z] of posts) sqb.push({ x, z, r: 0.25 });
    sqb.push({ x: 13.0, z: 3.7, hx: 0.8, hz: 0.35 }, { x: 17.6, z: 3.7, hx: 0.8, hz: 0.35 }, { x: 11.0, z: -4.6, r: 0.5 }, { x: 18.6, z: -4.6, r: 0.5 });
  }
  G.pads.onDone('square', (live) => { squareParts.forEach((p, i) => { p.o.visible = true; if (live && !p.flat) popIn(p.o, 0.2 + i * 0.25); }); });

  const clock = meshOf(makeClockTower());
  place(clock, LAY.clock.x, LAY.clock.z, 0, DK.h);
  hidden(clock);
  G.pads.onDone('clock', (live) => { clock.visible = true; if (live) popIn(clock); });

  // --------------------------------------------------------------- the finale --
  const F = LAY.fair;
  const site = new THREE.Group();
  {
    site.add(meshOf(makeFairSite(), { receive: true }));
    const sb = signBoard([{ text: 'HARVEST FAIR', size: 86, color: '#ffffff', stroke: '#7a2a1c' }, { text: 'COMING TO TOWN', size: 50, color: '#ffe27a', stroke: '#7a2a1c' }], '#d9483a', 2.8, 1.4);
    const sg = new THREE.Group();
    sg.add(sb);
    const pp = new Parts();
    for (const x of [-1.0, 1.0]) pp.cyl(COLORS.woodDark, 0.08, 0.1, 2.6, [x, -1.3, -0.05], null, 6);
    sg.add(meshOf(pp.merged()));
    place(sg, -2.6, -2.4, FACE_CAMERA, 2.6);
    site.add(sg);
    place(site, F.x, F.z, 0);
    root.add(site);
  }
  let fair = null;
  G.pads.onDone('fair', (live) => {
    site.visible = false;
    fair = makeFair();
    place(fair, F.x, F.z, 0);
    root.add(fair);
    if (live) popIn(fair);
  });
  const gate = meshOf(makeGateArch(6));
  place(gate, LAY.gate.x, LAY.gate.z, 0);
  hidden(gate);
  G.events.on('win', () => { gate.visible = true; popIn(gate, 0.8); });
  if (G.state && G.state.won) gate.visible = true;

  // -------------------------------------------------------------- animation ---
  let T = 0, smokeT = 0, boardT = 0, boardText = '', cowT = 0, splashT = 0, mooT = 6;
  let train = null;
  const cm = new THREE.Matrix4(), cq = new THREE.Quaternion(), ce = new THREE.Euler(), cs = new THREE.Vector3(), cp = new THREE.Vector3();
  const SMOKE = { colors: [0xffffff, 0xf4efe6, 0xe2dcd0], count: 2, speed: 0.5, size: 0.42, life: 1.4, gravity: -2.6, up: 1.6 };
  const SPLASH = { colors: [0xffffff, 0xbfeaf8], count: 3, speed: 1.2, size: 0.1, life: 0.5, gravity: 9, up: 2.2 };
  const sv = new THREE.Vector3();
  function drawBoard(top, big, fill) {
    const c = boardCtx;
    c.fillStyle = '#17382f'; c.fillRect(0, 0, 320, 160);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#8fe3c8'; c.font = '800 34px system-ui, Arial, sans-serif'; c.fillText(top, 160, 38);
    c.fillStyle = '#ffe9a8'; c.font = '900 62px system-ui, Arial, sans-serif'; c.fillText(big, 160, 96);
    c.fillStyle = '#0d231d'; c.fillRect(30, 136, 260, 12);
    if (fill > 0) { c.fillStyle = '#ffc42e'; c.fillRect(30, 136, 260 * Math.min(1, fill), 12); }
    boardTex.needsUpdate = true;
  }
  function writeCows() {
    const fed = trough.amount > 0;
    for (let i = 0; i < COWS.length; i++) {
      const c = COWS[i];
      const w = Math.sin(T * (fed ? 2.2 : 1.1) + c.ph);
      ce.set(c.eat && fed ? 0.2 + w * 0.08 : w * 0.04, c.yaw + Math.sin(T * 0.5 + c.ph * 2) * 0.1, 0, 'YXZ');
      cq.setFromEuler(ce);
      cs.set(c.s, c.s * (1 + w * 0.03), c.s);
      cm.compose(cp.set(c.x, 0, c.z), cq, cs);
      cowMesh.setMatrixAt(i, cm);
    }
    cowMesh.instanceMatrix.needsUpdate = true;
  }
  writeCows();

  return {
    root,
    update(dt) {
      T += dt;
      for (let i = fades.length - 1; i >= 0; i--) { const m = fades[i]; m.opacity = Math.min(1, m.opacity + dt * 1.4); if (m.opacity >= 1) fades.splice(i, 1); }
      // the windmill turns, faster while it grinds
      if (millG.visible) millG.userData.sails.rotation.z -= dt * (mill.running ? 1.5 : 0.45);
      // the bakery chimney smokes while the oven is busy
      if (bakeG.visible && bakery.running) {
        smokeT -= dt;
        if (smokeT <= 0) { smokeT = 0.45; if (onScreen(G, chimney.x, chimney.y, chimney.z, 1.2)) G.fx.burst(chimney, SMOKE); }
      }
      // cows chew faster when the trough is full; the feed sinks as they eat
      if (dairy.visible) {
        feed.scale.y = Math.max(0.001, 0.32 * trough.level);
        feed.visible = trough.level > 0.01;
        cowT -= dt;
        if (cowT <= 0) { cowT = 0.05; writeCows(); }
        mooT -= dt;
        if (mooT <= 0) { mooT = 9 + (T * 7.3) % 8; const c = COWS[((T * 3.1) | 0) % COWS.length]; playAt('moo', c.x, c.z, 0.6); }
      }
      // the junction: signal, crossing barriers and the train board follow the train
      if (!train && G.workers) { const l = G.workers.list; for (let i = 0; i < l.length; i++) if (l[i].role === 'train') { train = l[i]; break; } }
      const coming = !!train && (train.state === 'in' || train.state === 'out' || (train.state === 'away' && train.t < 2.5));
      const k = Math.min(1, dt * 4);
      for (let i = 0; i < barriers.length; i++) { const a = barriers[i].userData.arm; a.rotation.z += ((coming ? 0 : 1.25) - a.rotation.z) * k; }
      if (junction.visible && train) {
        const arm = signal.userData.arm;
        arm.rotation.z += ((train.state === 'away' ? 0 : -0.85) - arm.rotation.z) * k;
        boardT -= dt;
        if (boardT <= 0) {
          boardT = 0.25;
          let top = 'NEXT TRAIN', big = '', fill = 0;
          if (train.state === 'away') { const s = Math.max(0, Math.ceil(train.t / (G.stats.trainRate || 1))); big = '0:' + (s < 10 ? '0' : '') + s; }
          else if (train.state === 'in') { top = 'STAND CLEAR'; big = 'ARRIVING'; }
          else if (train.state === 'load') { top = 'LOADING'; big = train.loaded + ' / ' + train.capacity; fill = train.capacity ? train.loaded / train.capacity : 0; }
          else { top = 'THANK YOU'; big = 'DEPARTED'; }
          const text = top + big;
          if (text !== boardText) { boardText = text; drawBoard(top, big, fill); }
        }
      }
      // the fountain sparkles
      if (fountain.visible) {
        splashT -= dt;
        if (splashT <= 0) { splashT = 0.3; if (onScreen(G, LAY.fountain.x, 1, LAY.fountain.z, 1.1)) G.fx.burst(sv.set(LAY.fountain.x, 2.1, LAY.fountain.z), SPLASH); }
      }
      // the fair: the big wheel and the carousel turn
      if (fair) { fair.userData.wheel.rotation.z += dt * 0.35; fair.userData.carousel.rotation.y += dt * 0.9; }
    },
  };
}
