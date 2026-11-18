// Ironwall Keep scenery: a green valley with a trampled battlefield to the north. The walled yard with
// its great north wall and gatehouse, low walls on the near sides, corner towers, banners, tents and
// carts; the war chest by the gate; the workshops (fletcher, forge, spear works, mason) under their
// awnings; the woods, the iron mine and the quarry outside the gaps; the raiders' camp at the far end
// of the field; a ring of forest; the Citadel and the world gate. The knight's flame blade glows.
// Station furniture appears through G.stations.onOpen(id, fn(live)); build results through
// G.pads.onDone(padId, fn(live)). Static scenery is merged into a few chunk meshes.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { litMaterial, getSharedMaterial } from '../../engine/art/material.js';
import { makeGround, makeZone } from '../../engine/art/props.js';
import { rng } from '../../engine/geom.js';
import { canvasTex, signTexture, makeCashDecal } from '../../engine/decals.js';
import {
  COLORS, makeOakGeometry, makeWallGeometry, makeLowWallGeometry, makeCornerTowerGeometry, makeGatehouseGeometry,
  makeWarChestGeometry, makeWorkshop, makeBannerGeometry, makeTentGeometry, makeCartGeometry, makeCitadel, makeGateArch, makeGlow,
} from './models.js';

const FACE_CAMERA = -Math.PI * 0.75;
const inRect = (x, z, r, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

function blotchTexture(base, seed, blotch, specks) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 14 + r() * 34;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, blotch); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 220; i++) { ctx.fillStyle = specks[i % specks.length]; ctx.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: true });
}

export function createScene(G) {
  const LAY = G.world.layout;
  const root = new THREE.Group();
  root.name = 'world';
  G.scene.add(root);
  const rnd = rng(61);
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const pop = (obj) => { if (G.fx && G.fx.pop) G.fx.pop(obj); };
  const place = (o, x, z, yaw = 0, y = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };
  const fixed = (o) => { o.matrixAutoUpdate = false; o.updateMatrix(); return o; };
  const signBoard = (lines, bg, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: signTexture(lines, bg, '#ffffff', 640, Math.round(640 * h / w)) }));
  const groundPatch = (tex, x0, x1, z0, z1, y, tile = 6) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / tile, (z1 - z0) / tile);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), litMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
    return fixed(m);
  };
  const Y = LAY.yard, WZ = LAY.wallZ, GP = LAY.gaps;
  const solid = G.stations.get('forest').blockers, WB = G.world.bounds;
  const walkable = (x, z) => x > WB.minX - 1 && x < WB.maxX + 1 && z > WB.minZ - 1 && z < WB.maxZ + 1;

  // ---------------------------------------------------------------- ground --
  const grassTex = blotchTexture('#86b84f', 3, 'rgba(70,130,40,0.35)', ['#9bcc5e', '#6fa33e', '#a7d36a']);
  const dirtTex = blotchTexture('#b8945f', 7, 'rgba(120,88,52,0.35)', ['#a07c4c', '#cfae78', '#8f6a42']);
  const fieldTex = blotchTexture('#a2a85e', 11, 'rgba(130,100,60,0.4)', ['#8c9a4e', '#b8945f', '#c2b77a']);
  {
    const gb = LAY.ground;
    root.add(groundPatch(grassTex, gb.minX, gb.maxX, gb.minZ, gb.maxZ, 0, 10));
    const F = LAY.field;
    root.add(groundPatch(fieldTex, F.minX - 2, F.maxX + 2, WZ + 0.4, F.maxZ + 4, 0.008, 7));
    const yard = makeGround('paving', Y.maxX - Y.minX, Y.maxZ - Y.minZ, { color: 0xc9bca4, tile: 2.6, seed: 31, y: 0.015 });
    yard.position.set((Y.minX + Y.maxX) / 2, 0.015, (Y.minZ + Y.maxZ) / 2);
    root.add(fixed(yard));
    // paths out through the gaps, and the mine and quarry floors
    const paths = [
      [-23, Y.minX, GP.west[0], GP.west[1]], [Y.maxX, 23, GP.east[0], GP.east[1]], [GP.south[0], GP.south[1], -18, Y.minZ],
      [LAY.mine.minX - 1, LAY.mine.maxX + 1, LAY.mine.minZ - 1, LAY.mine.maxZ + 1],
      [LAY.quarry.minX - 1, LAY.quarry.maxX + 1, LAY.quarry.minZ - 1, LAY.quarry.maxZ + 1],
      [-17, -7, -28, -18],
    ];
    for (const [x0, x1, z0, z1] of paths) root.add(groundPatch(dirtTex, x0, x1, z0, z1, 0.011, 5));
  }

  // -------------------------------------------------------------- the walls --
  {
    const hi = new Parts();
    const walls = G.stations.get('walls').def.blockers;
    let k = 0;
    for (const b of walls) {
      const alongX = b.hx > b.hz;
      const len = (alongX ? b.hx : b.hz) * 2;
      const north = alongX && Math.abs(b.z - WZ) < 0.1;
      const geo = north ? makeWallGeometry(len, 2.6, ++k) : makeLowWallGeometry(len);
      if (alongX) hi.add(geo, null, [b.x - b.hx, 0, b.z], [0, 0, 0], null, true);
      else hi.add(geo, null, [b.x, 0, b.z + b.hz], [0, Math.PI / 2, 0], null, true);
    }
    hi.add(makeGatehouseGeometry(4, 3.6), null, [0, 0, WZ], null, null, true);
    const ct = makeCornerTowerGeometry(4.2);
    hi.add(ct, null, [Y.minX, 0, WZ], null, null, true);
    hi.add(ct, null, [Y.maxX, 0, WZ], null, null, true);
    const ctLow = makeCornerTowerGeometry(1.6);
    hi.add(ctLow, null, [Y.minX, 0, Y.minZ], null, null, true);
    hi.add(ctLow, null, [Y.maxX, 0, Y.minZ], null, null, true);
    // gate posts at the gaps
    for (const [x, z] of [[Y.minX, GP.west[0]], [Y.minX, GP.west[1]], [Y.maxX, GP.east[0]], [Y.maxX, GP.east[1]], [GP.south[0], Y.minZ], [GP.south[1], Y.minZ]]) {
      hi.rbox(COLORS.stone, 1.0, 1.4, 1.0, 0.1, [x, 0.7, z]);
      hi.sph(COLORS.flame, 0.18, [x, 1.6, z], null, null, 7, 5);
    }
    // banners, tents and carts inside the yard
    const bannerB = makeBannerGeometry(COLORS.blue), bannerR = makeBannerGeometry(COLORS.red);
    for (const [x, z, red] of [[-3.2, 8.4, 0], [3.2, 8.4, 1], [-18, -11.8, 1], [18, -11.8, 0], [-1.6, -11.8, 0], [10.5, -11.8, 1]]) hi.add(red ? bannerR : bannerB, null, [x, 0, z], [0, FACE_CAMERA + Math.PI, 0], null, true);
    for (const [x, z, r, c] of [[-16.6, -11, 1.1, COLORS.cream], [16.6, -10.8, 1.1, COLORS.cream], [16.8, 7.3, 0.9, 0xe9d0a0]]) hi.add(makeTentGeometry(c, r), null, [x, 0, z], [0, rnd() * 3, 0], null, true);
    hi.add(makeCartGeometry(), null, [-17.6, 0, 5.4], [0, 0.4, 0], null, true);
    G.stations.get('walls').blockers.push({ x: -16.6, z: -11, r: 1.0 }, { x: 16.6, z: -10.8, r: 1.0 }, { x: 16.8, z: 7.3, r: 0.85 }, { x: -17.6, z: 5.4, r: 0.9 });
    const m = meshOf(hi.merged(), { cast: true, receive: true });
    m.name = 'keep-walls';
    root.add(fixed(m));
    const board = signBoard([{ text: 'IRONWALL KEEP', size: 84, color: '#ffffff', stroke: '#1d3a6b' }, { text: 'HOLD THE GATE', size: 46, color: '#ffe27a', stroke: '#1d3a6b' }], '#2f6fd0', 2.6, 1.3);
    board.position.set(-2.2, 5.6, WZ - 1.15);
    board.rotation.y = Math.PI;
    root.add(fixed(board));
  }

  // ------------------------------------------------------------ the war chest --
  {
    const chest = meshOf(makeWarChestGeometry());
    place(chest, LAY.chest.x + 2.1, LAY.chest.z + 0.9, -0.3);
    root.add(fixed(chest));
    G.stations.get('walls').blockers.push({ x: LAY.chest.x + 2.1, z: LAY.chest.z + 0.9, r: 0.7 });
    const cd = makeCashDecal(3.1); cd.position.set(LAY.chest.x, 0.04, LAY.chest.z); root.add(cd);
  }

  // ------------------------------------------------------------- workshops --
  const shops = {};
  for (const id of ['fletcher', 'forge', 'spearworks', 'mason']) {
    const st = G.stations.get(id);
    const g = makeWorkshop(id === 'spearworks' ? 'spears' : id);
    place(g, st.pos.x, st.pos.z, 0);
    g.visible = false;
    root.add(g);
    const d = st.def;
    const din = makeZone({ w: 2.6, d: 2.6, label: d.labels.input });
    din.position.set(d.dropZone.x, 0.04, d.dropZone.z);
    const dout = makeZone({ w: 2.6, d: 2.6, label: d.labels.output, color: '#ffd9a0', fill: 'rgba(255,160,60,0.22)' });
    dout.position.set(d.output.zone.x, 0.04, d.output.zone.z);
    const decals = [din, dout];
    for (const x of decals) { x.visible = false; root.add(x); }
    st.machine.mouth.set(st.pos.x, 1.6, st.pos.z);
    st.machine.spout.set(st.pos.x, 1.2, st.pos.z);
    shops[id] = g;
    G.stations.onOpen(id, (live) => { g.visible = true; decals.forEach((x) => { x.visible = true; }); if (live) popIn(g); });
  }
  G.events.on('convert', (e) => { const g = shops[e.stationId]; if (g) pop(g.children[0]); });

  // --------------------------------------------------- forest, rocks and camp --
  const keepClear = [
    { ...Y, pad: 2.2 }, { ...LAY.field, pad: 1.5 }, { ...LAY.woods, pad: 0.6 }, { ...LAY.mine, pad: 1.2 }, { ...LAY.quarry, pad: 1.2 },
    { minX: -23, maxX: Y.minX, minZ: -4, maxZ: 5, pad: 0 }, { minX: Y.maxX, maxX: 23, minZ: -4, maxZ: 5, pad: 0 },
    { minX: 0, maxX: 13, minZ: -18, maxZ: Y.minZ, pad: 0 },
    { minX: -18, maxX: -6, minZ: -29, maxZ: -17, pad: 0 },     // the citadel's site
  ];
  const free = (x, z, r) => { for (const k of keepClear) if (inRect(x, z, k, k.pad + r)) return false; return true; };
  {
    const geo = makeOakGeometry();
    const spots = [[], [], [], []];
    for (let i = 0; i < 3200 && spots[0].length + spots[1].length + spots[2].length + spots[3].length < 260; i++) {
      const x = -60 + rnd() * 118, z = -50 + rnd() * 116;
      if (!free(x, z, 1.1)) continue;
      const d = Math.max(Math.abs(x), Math.abs(z - 6));
      if (d > 34 && rnd() < (d - 34) / 26) continue;
      const sc = 0.85 + rnd() * 0.6;
      spots[(x > 0 ? 1 : 0) + (z > 6 ? 2 : 0)].push([x, z, sc, rnd() * 6.28]);
      if (walkable(x, z)) solid.push({ x, z, r: 0.45 * sc });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const list of spots) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, getSharedMaterial(), list.length);
      const box = new THREE.Box3();
      list.forEach(([x, z, sc, yaw], i) => {
        im.setMatrixAt(i, m4.compose(p.set(x, 0, z), q.setFromAxisAngle(up, yaw), s.set(sc, sc, sc)));
        box.expandByPoint(p.set(x, 0, z)); box.expandByPoint(p.set(x, 5, z));
      });
      im.castShadow = true;
      im.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      im.boundingSphere.radius += 3;
      im.matrixAutoUpdate = false;
      root.add(im);
    }
    // the raiders' camp at the far end of the field: tents, war banners, a burnt cart
    const hi = new Parts();
    const F = LAY.field;
    for (let i = 0; i < 7; i++) {
      const x = F.minX + 2 + i * ((F.maxX - F.minX - 4) / 6), z = F.maxZ + 3 + (i % 2) * 2;
      hi.add(makeTentGeometry(i % 2 ? 0x6b4a6e : 0x7a3a2e, 1.3 + (i % 3) * 0.2), null, [x, 0, z], [0, rnd() * 3, 0], null, true);
    }
    for (let i = 0; i < 6; i++) hi.add(makeBannerGeometry(0x3a2a3a), null, [F.minX + 1 + i * 6.8, 0, F.maxZ + 0.8], [0, Math.PI, 0], null, true);
    // stakes and rubble scattered on the battlefield
    for (let i = 0; i < 26; i++) {
      const x = F.minX + rnd() * (F.maxX - F.minX), z = WZ + 4 + rnd() * (F.maxZ - WZ - 6);
      if (rnd() < 0.5) hi.cyl(COLORS.woodDark, 0.07, 0.09, 0.8, [x, 0.3, z], [rnd() - 0.5, 0, rnd() - 0.5], 5);
      else hi.ico(COLORS.stoneDark, 0.18 + rnd() * 0.2, [x, 0.08, z], [1.3, 0.5, 1]);
    }
    // boulders round the mine and quarry
    for (let i = 0; i < 40; i++) {
      const x = -40 + rnd() * 80, z = -38 + rnd() * 80;
      if (!free(x, z, 1.4)) continue;
      const sc = 0.6 + rnd() * 1.1;
      hi.ico(rnd() < 0.5 ? COLORS.stone : COLORS.stoneDark, 0.8 * sc, [x, 0.35 * sc, z], [1.2, 0.8, 1], [0, rnd() * 6, 0]);
      if (walkable(x, z)) solid.push({ x, z, r: 0.8 * sc });
    }
    const m = meshOf(hi.merged({ ao: true }));
    m.name = 'camp-rocks';
    root.add(fixed(m));
  }

  // --------------------------------------------------------------- the finale --
  const CT = LAY.citadel;
  const citadel = makeCitadel();
  place(citadel, CT.x, CT.z, 0);
  citadel.visible = false;
  root.add(citadel);
  const site = new THREE.Group();
  {
    const sp = new Parts();
    sp.rbox(COLORS.stoneDark, 9, 0.3, 9, 0.1, [0, 0.15, 0]);
    for (let i = 0; i < 8; i++) { const a = i * 0.8; sp.rbox(i % 2 ? COLORS.stone : COLORS.stoneLight, 1.0, 0.6, 0.8, 0.08, [Math.cos(a) * 3.4, 0.6, Math.sin(a) * 3.4], [0, a, 0]); }
    for (const [x, z] of [[-4.3, -4.3], [4.3, -4.3], [-4.3, 4.3], [4.3, 4.3]]) sp.cyl(COLORS.woodDark, 0.1, 0.12, 3, [x, 1.5, z], null, 6);
    site.add(meshOf(sp.merged({ ao: true })));
    const sb = signBoard([{ text: 'THE CITADEL', size: 82, color: '#ffffff', stroke: '#1d3a6b' }, { text: 'CROWN THE KEEP', size: 46, color: '#ffe27a', stroke: '#1d3a6b' }], '#2f6fd0', 2.6, 1.3);
    sb.position.set(4.3, 2.9, -4.3); sb.rotation.y = FACE_CAMERA; site.add(sb);
    place(site, CT.x, CT.z, 0);
    root.add(site);
  }
  solid.push({ x: CT.x, z: CT.z, r: 4.6 });
  G.pads.onDone('citadel', (live) => { site.visible = false; citadel.visible = true; if (live) popIn(citadel); });
  const gate = meshOf(makeGateArch(6));
  place(gate, LAY.worldGate.x, LAY.worldGate.z, 0);
  gate.visible = false; root.add(gate);
  G.events.on('win', () => { gate.visible = true; popIn(gate, 0.8); });
  if (G.state && G.state.won) gate.visible = true;

  // ------------------------------------------------------- the flame blade --
  const flame = makeGlow(1, 0xff9a3a, 0.55);
  flame.visible = false;
  root.add(flame);

  // a war horn for every wave
  G.events.on('horde:wave', () => { if (G.audio && G.audio.play) G.audio.play('horn', { volume: 0.7 }); });

  let T = 0;
  return {
    root,
    update(dt) {
      T += dt;
      const pl = G.player;
      if (pl && G.stats.flameBlade) {
        const r = (G.stats.harvestRadius || 3) * (1.05 + Math.sin(T * 9) * 0.06);
        flame.visible = true;
        flame.position.set(pl.pos.x, 0.07, pl.pos.z);
        flame.scale.set(r, r, 1);
        flame.material.opacity = (pl.action ? 0.75 : 0.4) + Math.sin(T * 13) * 0.08;
      } else if (flame.visible) flame.visible = false;
    },
  };
}
