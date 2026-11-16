// Frostpine Camp scenery: a snowy valley ringed with pines. Snow ground with trodden paths, the
// trading post in the west wall and the villagers' trail, the yard and palisade that go up with the
// camp, the cook fire with its turning spit, the larder rack, tents and woodpiles, a backdrop forest,
// drifts and boulders, falling snow, the whirling axes, the Great Beacon and the travel gate.
// Station furniture appears through G.stations.onOpen(id, fn(live)); build results through
// G.pads.onDone(padId, fn(live)). Static scenery is merged into a few chunk meshes.
import * as THREE from 'three';
import { Parts, meshOf } from '../../engine/art/parts.js';
import { litMaterial, getSharedMaterial } from '../../engine/art/material.js';
import { makeGround, makeZone } from '../../engine/art/props.js';
import { rng } from '../../engine/geom.js';
import { canvasTex, signTexture, makeDropDecal, makeCashDecal } from '../../engine/decals.js';
import {
  COLORS, makePineGeometry, makeTradingPost, makeCookFire, makeLarderGeometry, makePalisadeGeometry, makeGatePostGeometry,
  makeTentGeometry, makeWoodpileGeometry, makeDriftGeometry, makeSnowRockGeometry, makeWhirlAxeGeometry, makeBeacon,
  makeGateArch, makeGlow,
} from './models.js';

const FACE_CAMERA = -Math.PI * 0.75;
const inRect = (x, z, r, pad = 0) => x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad;

function snowTexture(base, seed, blotch) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 46; i++) {
      const x = r() * w, y = r() * h, rad = 14 + r() * 34;
      // draw each blotch wrapped so the texture tiles
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        g.addColorStop(0, blotch); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.5})`; ctx.fillRect(r() * w, r() * h, 1.6, 1.6); }
  }, { repeat: true });
}

// ----------------------------------------------------------------- the world --
export function createScene(G) {
  const LAY = G.world.layout;
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const rnd = rng(77);
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };
  const pop = (obj) => { if (G.fx && G.fx.pop) G.fx.pop(obj); };
  const addMesh = (parent, geometry, { cast = true, receive = true } = {}) => {
    const m = meshOf(geometry, { cast, receive });
    m.matrixAutoUpdate = false; m.updateMatrix();
    parent.add(m);
    return m;
  };
  const place = (o, x, z, yaw = 0, y = 0) => { o.position.set(x, y, z); o.rotation.y = yaw; return o; };
  const fixed = (o) => { o.matrixAutoUpdate = false; o.updateMatrix(); return o; };
  const signBoard = (lines, bg, w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), litMaterial({ map: signTexture(lines, bg, '#ffffff', 640, Math.round(640 * h / w)) }));
  const groundPatch = (tex, x0, x1, z0, z1, y, tile = 6) => {
    const t = tex.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / tile, (z1 - z0) / tile);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), litMaterial({ map: t }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
    return fixed(m);
  };

  const C = LAY.camp, GT = LAY.gates;
  const post = G.stations.get('post'), fire = G.stations.get('fire'), larder = G.stations.get('larder');
  const walls = G.stations.get('walls');
  // trees and boulders standing where the player can walk are solid
  const solid = G.stations.get('forest').blockers, WB = G.world.bounds;
  const walkable = (x, z) => x > WB.minX - 1 && x < WB.maxX + 1 && z > WB.minZ - 1 && z < WB.maxZ + 1;

  // With the cook fire lit, raw meat and logs belong on the fire: the post takes them only while the
  // fire's bay for that kind is full, so nobody (player or helper) is ever stuck holding them.
  {
    const d = post.drop, orig = d.accepts;
    d.accepts = (k) => {
      if ((k === 'meat' || k === 'log') && fire.active) return orig(k) && fire.drop.roomFor(k) <= 0;
      return orig(k);
    };
  }

  // ---------------------------------------------------------------- ground --
  const snowTex = snowTexture('#edf3fa', 5, 'rgba(176,200,232,0.30)');
  const pathTex = snowTexture('#d3deec', 9, 'rgba(150,172,205,0.32)');
  {
    const gb = LAY.ground;
    root.add(groundPatch(snowTex, gb.minX, gb.maxX, gb.minZ, gb.maxZ, 0, 9));
    // trodden snow: the trail to the post, and the ways out to the grove, the hunt and the beacon
    const paths = [
      [C.maxX + 0.4, 22, -1.7, 1.7],                           // the queue
      [GT.north[0] + 2.5, GT.north[1] - 3, C.maxZ, 13.4],      // to the grove
      [-14.2, C.minX, GT.west[0] + 2, GT.west[1] - 2],         // to the hunting ground
      [GT.south[0], GT.south[1], -12.6, C.minZ],               // to the world gate
      [C.maxX, 15, 4, 9.6],                                    // round the corner to the beacon
    ];
    for (const [x0, x1, z0, z1] of paths) root.add(groundPatch(pathTex, x0, x1, z0, z1, 0.012, 5));
    // the villagers' trail, a slanted strip
    const [a, b] = LAY.trail;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const t = pathTex.clone(); t.needsUpdate = true; t.repeat.set(3.2 / 5, len / 5);
    const trail = new THREE.Mesh(new THREE.PlaneGeometry(3.2, len + 3), litMaterial({ map: t }));
    trail.rotation.x = -Math.PI / 2; trail.rotation.z = Math.atan2(b.x - a.x, b.z - a.z);
    trail.position.set((a.x + b.x) / 2, 0.011, (a.z + b.z) / 2); trail.receiveShadow = true;
    root.add(fixed(trail));
  }

  // --------------------------------------------------------- the trading post --
  {
    const PC = post.def.counter;
    root.add(fixed(place(makeTradingPost(), PC.x, PC.z, PC.yaw)));
    const sd = makeDropDecal('SELL', 3.5); sd.position.set(post.def.dropZone.x, 0.04, post.def.dropZone.z); root.add(sd);
    const cd = makeCashDecal(3.0); cd.position.set(post.def.cashPile.x, 0.04, post.def.cashPile.z); root.add(cd);
    const board = signBoard([{ text: 'TRADING POST', size: 84, color: '#ffffff', stroke: '#7a2a1c' }, { text: 'LOGS  MEAT  ROASTS', size: 46, color: '#ffe9a8', stroke: '#6b3a1a' }], '#c9483a', 2.5, 1.35);
    const sg = new THREE.Group(); sg.add(board);
    const pp = new Parts();
    for (const x of [-0.9, 0.9]) pp.cyl(COLORS.barkDark, 0.07, 0.08, 3.0, [x, -1.5, 0.04], null, 6);
    sg.add(meshOf(pp.merged()));
    place(sg, PC.x + 0.4, PC.z - 4.4, FACE_CAMERA, 3.0);
    root.add(fixed(sg));
  }

  // --------------------------------------------------------------- the camp --
  // everything that goes up when the camp is built: the cobbled yard, the palisade, gate posts, a tent
  const campParts = [];
  {
    const yard = makeGround('paving', C.maxX - C.minX - 0.5, C.maxZ - C.minZ - 0.5, { color: 0xb9ad9c, tile: 4.5, seed: 31, y: 0.02 });
    yard.position.set((C.minX + C.maxX) / 2, 0.02, (C.minZ + C.maxZ) / 2);
    campParts.push({ o: fixed(yard), flat: true });
    // snow banked along the inside of the yard edge
    const edge = new Parts();
    for (let i = 0; i < 40; i++) {
      const side = i % 4, u = rnd();
      const x = side === 0 ? C.minX + 0.5 : side === 1 ? C.maxX - 0.5 : C.minX + u * (C.maxX - C.minX);
      const z = side === 2 ? C.minZ + 0.5 : side === 3 ? C.maxZ - 0.5 : C.minZ + u * (C.maxZ - C.minZ);
      edge.sph(COLORS.snow, 0.5 + rnd() * 0.4, [x, 0.02, z], [1.5, 0.3, 1.1], [0, rnd() * 3, 0], 6, 4);
    }
    campParts.push({ o: addMesh(new THREE.Group(), edge.merged(), { cast: false }), flat: true });

    let k = 0;
    for (const b of walls.def.blockers) {
      const alongX = b.hx > b.hz;
      const len = (alongX ? b.hx : b.hz) * 2;
      const m = meshOf(makePalisadeGeometry(len, ++k), { cast: true, receive: true });
      if (alongX) place(m, b.x - b.hx, b.z, 0); else place(m, b.x, b.z - b.hz, -Math.PI / 2);
      campParts.push({ o: m });
    }
    const postGeo = makeGatePostGeometry();
    const gp = (x, z) => { const m = meshOf(postGeo); place(m, x, z, 0); campParts.push({ o: m }); };
    gp(GT.north[0], C.maxZ); gp(GT.north[1], C.maxZ);
    gp(C.minX, GT.west[0]); gp(C.minX, GT.west[1]);
    gp(GT.south[0], C.minZ); gp(GT.south[1], C.minZ);
    campParts.push({ o: place(meshOf(makeTentGeometry(COLORS.hide, 1.25)), 8.0, 8.2, 0.4) });
    campParts.push({ o: place(meshOf(makeWoodpileGeometry()), -6.6, 8.9, 0.3) });
    campParts.push({ o: place(meshOf(makeWoodpileGeometry()), 8.8, -7.1, Math.PI / 2) });
    walls.blockers.push({ x: 8.0, z: 8.2, r: 1.15 }, { x: -6.6, z: 8.9, r: 0.7 }, { x: 8.8, z: -7.1, r: 0.7 });
    for (const p of campParts) { p.o.visible = false; root.add(p.o); }
  }
  G.pads.onDone('camp', (live) => {
    campParts.forEach((p, i) => {
      p.o.visible = true;
      if (live && !p.flat) popIn(p.o, 0.15 + (i % 12) * 0.05);
    });
  });

  // ---------------------------------------------------------- the cook fire --
  const cook = makeCookFire();
  place(cook, fire.pos.x, fire.pos.z, 0);
  cook.visible = false;
  root.add(cook);
  const fireDecals = [];
  {
    const din = makeZone({ w: 3.0, d: 3.0, label: 'COOK' }); din.position.set(fire.def.dropZone.x, 0.04, fire.def.dropZone.z); fireDecals.push(din);
    const dout = makeZone({ w: 2.8, d: 2.8, label: 'ROASTS', color: '#ffd9a0', fill: 'rgba(255,160,60,0.22)' }); dout.position.set(fire.def.output.zone.x, 0.04, fire.def.output.zone.z); fireDecals.push(dout);
    const pl = new Parts();
    pl.rbox(COLORS.wood, 2.1, 0.1, 1.8, 0.04, [fire.def.input.layout.x, 0.06, fire.def.input.layout.z], null, null, 1);
    pl.rbox(COLORS.woodLight, 2.1, 0.1, 1.8, 0.04, [fire.def.output.layout.x, 0.06, fire.def.output.layout.z], null, null, 1);
    const plates = addMesh(new THREE.Group(), pl.merged(), { cast: false });
    fireDecals.push(plates);
    for (const d of fireDecals) { d.visible = false; root.add(d); }
    const ud = cook.userData;
    fire.machine.mouth.set(fire.pos.x + ud.mouth[0], ud.mouth[1], fire.pos.z + ud.mouth[2]);
    fire.machine.spout.set(fire.pos.x + ud.spout[0], ud.spout[1], fire.pos.z + ud.spout[2]);
  }
  G.stations.onOpen('fire', (live) => {
    cook.visible = true; fireDecals.forEach((d) => { d.visible = true; });
    if (live) popIn(cook);
  });
  G.events.on('convert', (e) => { if (e.stationId === 'fire') pop(cook.userData.spit); });

  // -------------------------------------------------------------- the larder --
  {
    const rack = meshOf(makeLarderGeometry());
    place(rack, larder.pos.x, larder.pos.z, 0);
    rack.visible = false; root.add(rack);
    const dz = makeZone({ w: 2.8, d: 2.8, label: 'MEAT', color: '#ffd9a0', fill: 'rgba(255,160,60,0.22)' });
    dz.position.set(larder.def.zone.x, 0.04, larder.def.zone.z); dz.visible = false; root.add(dz);
    G.stations.onOpen('larder', (live) => { rack.visible = true; dz.visible = true; if (live) popIn(rack); });
  }

  // ------------------------------------------------------- forest and drifts --
  // where nothing may stand: the play areas, the paths between them, the trail and the finale site
  const keep = [
    { ...C, pad: 2.5 }, { ...LAY.grove, pad: 1.2 }, { ...LAY.hunt, pad: 2.2 }, { ...LAY.high, pad: 2.2 },
    { minX: C.maxX, maxX: 26, minZ: -4.5, maxZ: 4.5, pad: 0 },                  // the queue
    { minX: C.minX, maxX: C.maxX, minZ: -14, maxZ: C.minZ, pad: 0 },             // south of the camp
    { minX: -16, maxX: C.minX, minZ: -8, maxZ: 16, pad: 0 },                     // west strip, camp to both herds
    { minX: -6, maxX: 8, minZ: 10, maxZ: 14, pad: 0 },                           // camp to the grove
    { minX: C.maxX, maxX: 16, minZ: 2, maxZ: 12, pad: 0 },                       // camp to the beacon
  ];
  const trailDist = (x, z) => {
    const [a, b] = LAY.trail, [c1, c2, c3] = post.def.customerOut;
    const seg = (p, q) => {
      const dx = q.x - p.x, dz = q.z - p.z, t = Math.max(0, Math.min(1, ((x - p.x) * dx + (z - p.z) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - p.x - dx * t, z - p.z - dz * t);
    };
    return Math.min(seg(a, b), seg(c2, c3), seg(c1, c2));
  };
  const B = LAY.beacon, GA = LAY.gate;
  const free = (x, z, r) => {
    for (const k of keep) if (inRect(x, z, k, k.pad + r)) return false;
    if (trailDist(x, z) < 2.6 + r) return false;
    if (Math.hypot(x - B.x, z - B.z) < 8.5 + r) return false;
    if (Math.hypot(x - GA.x, z - GA.z) < 5 + r) return false;
    return true;
  };
  {
    // backdrop pines: instanced, in four quadrant chunks so off-screen ones are culled
    const geo = makePineGeometry();
    const spots = [[], [], [], []];
    for (let i = 0; i < 2600 && spots[0].length + spots[1].length + spots[2].length + spots[3].length < 330; i++) {
      const x = -52 + rnd() * 100, z = -46 + rnd() * 96;
      if (!free(x, z, 1.0)) continue;
      // dense near the play area, thinning out with distance
      const d = Math.max(Math.abs(x + 9), Math.abs(z - 4));
      if (d > 26 && rnd() < (d - 26) / 24) continue;
      const sc = 0.85 + rnd() * 0.7;
      spots[(x > -9 ? 1 : 0) + (z > 4 ? 2 : 0)].push([x, z, sc, rnd() * 6.28]);
      if (walkable(x, z)) solid.push({ x, z, r: 0.42 * sc });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (const list of spots) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, getSharedMaterial(), list.length);
      const box = new THREE.Box3();
      list.forEach(([x, z, sc, yaw], i) => {
        im.setMatrixAt(i, m4.compose(p.set(x, 0, z), q.setFromAxisAngle(up, yaw), s.set(sc, sc, sc)));
        box.expandByPoint(p.set(x, 0, z)); box.expandByPoint(p.set(x, 6, z));
      });
      im.castShadow = true; im.receiveShadow = false;
      im.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      im.boundingSphere.radius += 3;
      im.matrixAutoUpdate = false;
      root.add(im);
    }
    // drifts (flat, no shadows) and snow-capped boulders, merged
    const lo = new Parts(), hi = new Parts();
    const drift = makeDriftGeometry(1.3), rock = makeSnowRockGeometry(0.8);
    for (let i = 0; i < 150; i++) {
      const x = -42 + rnd() * 80, z = -36 + rnd() * 78;
      const sc = 0.7 + rnd() * 0.9;
      if (!free(x, z, 0.4)) {
        // inside the hunting grounds a few low drifts are welcome; elsewhere keep clear
        if (!(inRect(x, z, LAY.hunt, -1) || inRect(x, z, LAY.high, -1)) || rnd() > 0.5) continue;
        lo.add(drift, null, [x, 0, z], [0, rnd() * 6.28, 0], [sc * 0.55, sc * 0.5, sc * 0.55], true);
        continue;
      }
      lo.add(drift, null, [x, 0, z], [0, rnd() * 6.28, 0], [sc, sc, sc], true);
    }
    for (let i = 0; i < 46; i++) {
      const x = -38 + rnd() * 72, z = -32 + rnd() * 70;
      if (!free(x, z, 1.4)) continue;
      const sc = 0.7 + rnd() * 1.3;
      hi.add(rock, null, [x, 0, z], [0, rnd() * 6.28, 0], [sc, sc, sc], true);
      if (walkable(x, z)) solid.push({ x, z, r: 0.85 * sc });
    }
    // the villagers' tents and lanterns along the trail
    for (const [x, z, r, c] of [[30, 1.5, 1.5, COLORS.hide], [22, -10.5, 1.7, COLORS.cloth], [27, 14, 1.4, COLORS.hideDark], [14.5, -8.6, 1.2, COLORS.hide]]) {
      hi.add(makeTentGeometry(c, r), null, [x, 0, z], [0, 0.6 + rnd(), 0], null, true);
    }
    for (const [x, z] of [[13.5, 3.2], [13.5, -3.2], [21, 4.6], [28.5, 12.4]]) {
      hi.cyl(COLORS.barkDark, 0.08, 0.1, 2.2, [x, 1.1, z], null, 6);
      hi.rbox(COLORS.flame, 0.26, 0.32, 0.26, 0.06, [x, 2.3, z], null, null, 1);
      hi.rbox(COLORS.iron, 0.32, 0.06, 0.32, 0.02, [x, 2.49, z], null, null, 1);
      hi.sph(COLORS.snow, 0.2, [x, 2.58, z], [1, 0.5, 1], null, 5, 3);
    }
    addMesh(root, lo.merged(), { cast: false, receive: true }).name = 'drifts';
    addMesh(root, hi.merged()).name = 'rocks-tents';
  }

  // --------------------------------------------------------------- the finale --
  const beacon = makeBeacon();
  place(beacon, B.x, B.z, 0);
  beacon.visible = false;
  root.add(beacon);
  const site = new THREE.Group();
  {
    const sp = new Parts();
    sp.rcyl(0xdfe7f0, 4.6, 0.3, 0.12, [0, 0.15, 0], null, 28);
    for (let i = 0; i < 9; i++) { const a = i * 0.7; sp.ico(i % 2 ? COLORS.stone : COLORS.stoneDark, 0.55, [Math.cos(a) * 3.2, 0.6, Math.sin(a) * 3.2], [1.2, 0.8, 1], [0, a, 0]); }
    sp.cyl(COLORS.barkDark, 0.1, 0.12, 2.4, [-3.6, 1.2, -3.6], null, 6);
    site.add(meshOf(sp.merged({ ao: true })));
    const sb = signBoard([{ text: 'GREAT BEACON', size: 82, color: '#ffffff', stroke: '#7a4a12' }, { text: 'LIGHT THE VALLEY', size: 46, color: '#ffe27a', stroke: '#6b3a1a' }], '#d9902a', 2.6, 1.3);
    sb.position.set(-3.6, 2.7, -3.6); sb.rotation.y = FACE_CAMERA; site.add(sb);
    place(site, B.x, B.z, 0);
    root.add(site);
  }
  let lit = false;
  G.pads.onDone('beacon', (live) => { lit = true; site.visible = false; beacon.visible = true; if (live) popIn(beacon); });
  const gate = meshOf(makeGateArch(7));
  place(gate, GA.x, GA.z, 0);
  gate.visible = false; root.add(gate);
  G.events.on('win', () => { gate.visible = true; popIn(gate, 0.8); });
  if (G.state && G.state.won) gate.visible = true;

  // ------------------------------------------------------- the whirling axes --
  const whirl = new THREE.Group();
  {
    const geo = makeWhirlAxeGeometry();
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.y = (i / 4) * Math.PI * 2;
      const m = meshOf(geo, { cast: true });
      m.position.x = 1; m.scale.setScalar(1.5);
      arm.add(m); whirl.add(arm);
    }
    const ringGlow = makeGlow(1, 0xcfefff, 0.35);
    ringGlow.position.y = -0.9;
    whirl.add(ringGlow);
    whirl.userData.glow = ringGlow;
    whirl.visible = false;
    root.add(whirl);
  }

  // ------------------------------------------------------------- falling snow --
  const SNOW = 240, SX = 46, SY = 20, SZ = 46;
  const snowPos = new Float32Array(SNOW * 3), snowVel = new Float32Array(SNOW * 2);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (rnd() - 0.5) * SX; snowPos[i * 3 + 1] = rnd() * SY; snowPos[i * 3 + 2] = (rnd() - 0.5) * SZ;
    snowVel[i * 2] = 1.6 + rnd() * 1.6; snowVel[i * 2 + 1] = rnd() * 6.28;
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const flakes = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 3.2, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false }));
  flakes.frustumCulled = false;
  flakes.renderOrder = 4;
  root.add(flakes);

  // -------------------------------------------------------------- animation ---
  let T = 0;
  const flicker = (list, baseScale) => {
    for (let i = 0; i < list.length; i++) {
      const f = list[i], ud = f.userData;
      const a = Math.sin(T * 9 + ud.phase) * 0.5 + Math.sin(T * 14.3 + ud.phase * 2.1) * 0.5;
      f.scale.set(baseScale * (1 + a * 0.12), baseScale * (1 + a * 0.28), baseScale * (1 + a * 0.12));
      f.position.set(ud.base.x + Math.sin(T * 6 + ud.phase) * 0.05, ud.base.y + a * 0.12, ud.base.z);
    }
  };
  return {
    root,
    update(dt) {
      T += dt;
      const pl = G.player;
      // the cook fire: bigger flames and a turning spit while it cooks
      if (cook.visible) {
        const ud = cook.userData, run = fire.running;
        flicker(ud.flames, run ? 1.15 : 0.7);
        ud.spit.rotation.z += dt * (run ? 2.6 : 0.5);
        ud.glow.material.opacity = (run ? 0.5 : 0.3) + Math.sin(T * 11) * 0.05;
      }
      if (lit) {
        const ud = beacon.userData;
        flicker(ud.flames, 1);
        ud.glow.material.opacity = 0.5 + Math.sin(T * 7) * 0.08;
      }
      // the whirling axes circle the player once bought
      const on = !!G.stats.whirl && !!pl;
      if (on) {
        const r = (G.stats.harvestRadius || 3) * 0.72;
        if (!whirl.visible) { whirl.visible = true; popIn(whirl); }
        whirl.position.set(pl.pos.x, 0.95, pl.pos.z);
        whirl.rotation.y -= dt * 9;
        for (let i = 0; i < 4; i++) { const arm = whirl.children[i]; arm.children[0].position.x = r; arm.children[0].rotation.z = Math.sin(T * 9 + i) * 0.12; }
        whirl.userData.glow.scale.setScalar(r * 1.25);
      } else if (whirl.visible) whirl.visible = false;
      // snow drifts down around the player
      if (pl) {
        const cx = pl.pos.x, cz = pl.pos.z;
        for (let i = 0; i < SNOW; i++) {
          const k = i * 3, ph = snowVel[i * 2 + 1];
          let x = snowPos[k] + Math.sin(T * 0.9 + ph) * 0.5 * dt - 0.7 * dt;
          let y = snowPos[k + 1] - snowVel[i * 2] * dt;
          let z = snowPos[k + 2] + Math.cos(T * 0.7 + ph) * 0.4 * dt + 0.5 * dt;
          if (y < 0) y += SY;
          if (x - cx > SX / 2) x -= SX; else if (x - cx < -SX / 2) x += SX;
          if (z - cz > SZ / 2) z -= SZ; else if (z - cz < -SZ / 2) z += SZ;
          snowPos[k] = x; snowPos[k + 1] = y; snowPos[k + 2] = z;
        }
        snowGeo.attributes.position.needsUpdate = true;
      }
    },
  };
}
