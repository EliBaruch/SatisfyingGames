// Bloom Rush — the static world: lights, ground, roads, plots, decor, per-farm furniture.
import * as THREE from 'three';
import { FLOWERS, FARMS, PADS, WORLD, SIZES } from './config.js';
import { Parts, mergeParts, getSharedMaterial, makeCounter, makeGreenhouse } from './models.js';

// ---------------------------------------------------------------- helpers ---
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, { repeat = false, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** Ground decal: flat plane of the given size, yawed so texture-up points toward world (+x,+z). */
function makeDecal(tex, size, { yaw = -Math.PI * 0.75, y = 0.03, order = 3 } = {}) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = order;
  m.receiveShadow = true;
  g.add(m);
  g.rotation.y = yaw;
  g.position.y = y;
  return g;
}

function flatPlane(w, d, mat, y, order = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = order;
  m.receiveShadow = true;
  return m;
}

function inRect(x, z, r, pad = 0) { return x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad; }

// ------------------------------------------------------------- textures -----
function sellTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    rr(ctx, 14, 14, w - 28, h - 28, 70);
    ctx.fillStyle = 'rgba(40,200,255,0.30)'; ctx.fill();
    ctx.lineCap = 'round';
    ctx.setLineDash([46, 30]); ctx.lineWidth = 22;
    ctx.strokeStyle = '#ffffff'; ctx.stroke();
    rr(ctx, 44, 44, w - 88, h - 88, 50);
    ctx.setLineDash([26, 24]); ctx.lineWidth = 9; ctx.strokeStyle = '#19b8f2'; ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 170px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 26; ctx.strokeStyle = '#0a86c4'; ctx.strokeText('SELL', w / 2, h / 2 - 14);
    ctx.fillStyle = '#ffffff'; ctx.fillText('SELL', w / 2, h / 2 - 14);
    // little arrows pointing in (down on the texture)
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0a86c4'; ctx.lineWidth = 8;
    for (const dx of [-70, 0, 70]) {
      const x = w / 2 + dx, y = h - 150;
      ctx.beginPath(); ctx.moveTo(x - 28, y - 10); ctx.lineTo(x + 28, y - 10); ctx.lineTo(x, y + 24); ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
  });
}

function cashTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    rr(ctx, 14, 14, w - 28, h - 28, 70);
    ctx.fillStyle = 'rgba(255,230,120,0.30)'; ctx.fill();
    ctx.lineCap = 'round';
    ctx.setLineDash([46, 30]); ctx.lineWidth = 20; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.setLineDash([]);
    // banknote
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.12);
    rr(ctx, -150, -85, 300, 170, 24);
    ctx.fillStyle = '#2fbf5b'; ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#0f7a35'; ctx.stroke();
    rr(ctx, -125, -62, 250, 124, 14);
    ctx.lineWidth = 6; ctx.strokeStyle = '#a8f0b8'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fillStyle = '#c9f7d2'; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = '#0f7a35'; ctx.stroke();
    ctx.fillStyle = '#0f7a35'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 66px "Arial Black", Impact, Arial, sans-serif';
    ctx.fillText('$', 0, 4);
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(sx * 98, 0, 13, 0, Math.PI * 2); ctx.fillStyle = '#a8f0b8'; ctx.fill(); }
    ctx.restore();
    // coin
    ctx.beginPath(); ctx.arc(w - 140, h - 130, 44, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 9; ctx.strokeStyle = '#d9971a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(w - 140, h - 130, 25, 0, Math.PI * 2); ctx.lineWidth = 6; ctx.stroke();
  });
}

function dashedPlotTexture() {
  return canvasTex(1024, 1024, (ctx, w, h) => {
    rr(ctx, 26, 26, w - 52, h - 52, 60);
    ctx.lineCap = 'round';
    ctx.setLineDash([60, 40]); ctx.lineWidth = 18; ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
  });
}

function signTexture(lines, bg, fg, w = 512, h = 320) {
  return canvasTex(w, h, (ctx) => {
    rr(ctx, 6, 6, w - 12, h - 12, 28);
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 12; ctx.strokeStyle = '#7a4a22'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const size = ln.size || 100;
      ctx.font = `900 ${size}px "Arial Black", Impact, Arial, sans-serif`;
      ctx.lineJoin = 'round';
      const y = (h / (n + 1)) * (i + 1) + (n === 1 ? 0 : 0);
      ctx.lineWidth = 14; ctx.strokeStyle = ln.stroke || 'rgba(0,0,0,0.25)'; ctx.strokeText(ln.text, w / 2, y);
      ctx.fillStyle = ln.color || fg; ctx.fillText(ln.text, w / 2, y);
    });
  });
}

function stripeTexture(a, b) {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b; ctx.fillRect(0, 0, w / 2, h);
  }, { repeat: true });
}

function soilTexture() {
  const r = rng(77);
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#74492a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const v = r();
      ctx.fillStyle = v < 0.5 ? 'rgba(52,30,16,0.18)' : 'rgba(150,100,60,0.14)';
      const s = 5 + r() * 14;
      ctx.beginPath(); ctx.ellipse(r() * w, r() * h, s, s * 0.6, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
  }, { repeat: true });
}

// ----------------------------------------------------------------- the world --
export function createWorld(G) {
  const scene = G.scene;
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);
  const sharedMat = getSharedMaterial();
  const animated = [];

  // ---------------------------------------------------------------- lights --
  const hemi = new THREE.HemisphereLight(0xe8f6ff, 0x8fc46a, 1.3);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.95);
  const SUN_DIR = new THREE.Vector3(9, 22, -8).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  root.add(sun);
  root.add(sun.target);
  const fill = new THREE.DirectionalLight(0xffe6f0, 0.55); // soft camera-side fill, no shadows
  fill.position.set(-14, 12, -10);
  root.add(fill);
  scene.background = new THREE.Color(0x6fbf4b);

  // ---------------------------------------------------------------- ground --
  {
    const gt = canvasTex(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#74c44e'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#6bba47'; ctx.fillRect(0, 0, w / 2, h / 2); ctx.fillRect(w / 2, h / 2, w / 2, h / 2);
    }, { repeat: true });
    const gb = WORLD.ground;
    const gw = gb.maxX - gb.minX, gd = gb.maxZ - gb.minZ;
    gt.repeat.set(gw / 10, gd / 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), new THREE.MeshLambertMaterial({ map: gt }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((gb.minX + gb.maxX) / 2, 0, (gb.minZ + gb.maxZ) / 2);
    ground.receiveShadow = true;
    ground.matrixAutoUpdate = false; ground.updateMatrix();
    root.add(ground);
  }

  // ----------------------------------------------------------------- roads --
  const R = WORLD.road, X = WORLD.crossRoad;
  const inRoad = (x, z, pad = 0) => inRect(x, z, R, pad) || inRect(x, z, X, pad);
  {
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xdcc596 });
    for (const r of [R, X]) {
      const s = flatPlane(r.maxX - r.minX, r.maxZ - r.minZ, slabMat, 0.02, 0);
      s.position.x = (r.minX + r.maxX) / 2; s.position.z = (r.minZ + r.maxZ) / 2;
      s.matrixAutoUpdate = false; s.updateMatrix();
      root.add(s);
    }
    const rnd = rng(1234);
    const pv = new Parts();
    const tones = [0xf5e5bf, 0xf0dfb6, 0xf8ebcb, 0xecd9ad, 0xf3e2ba, 0xf6e8c6];
    const paver = (cx, cz, w, d) => {
      const c = tones[(rnd() * tones.length) | 0];
      pv.box(c, w, 0.05, d, [cx, 0.025, cz]);
    };
    const fillRegion = (x0, x1, z0, z1, nx, nz) => {
      const sx = (x1 - x0) / nx, sz = (z1 - z0) / nz;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const cx = x0 + (i + 0.5) * sx, cz = z0 + (j + 0.5) * sz;
        const v = rnd();
        if (v < 0.3) { // two half pavers
          paver(cx, cz - sz * 0.25, sx - 0.1, sz / 2 - 0.1);
          paver(cx, cz + sz * 0.25, sx - 0.1, sz / 2 - 0.1);
        } else if (v < 0.45) {
          paver(cx - sx * 0.25, cz, sx / 2 - 0.1, sz - 0.1);
          paver(cx + sx * 0.25, cz, sx / 2 - 0.1, sz - 0.1);
        } else paver(cx, cz, sx - 0.1, sz - 0.1);
      }
    };
    fillRegion(R.minX, R.maxX, R.minZ, R.maxZ, 8, 61);
    fillRegion(X.minX, R.minX, X.minZ, X.maxZ, 17, 8);
    fillRegion(R.maxX, X.maxX, X.minZ, X.maxZ, 17, 8);
    // kerbs along open road edges
    const kerb = (cx, cz, w, d) => { pv.box(0xfff6e0, w, 0.16, d, [cx, 0.08, cz]); };
    const kz0 = R.minZ, kz1 = FARMS[0].plot.minZ - 0.6;
    kerb(R.minX - 0.15, (kz0 + kz1) / 2, 0.3, kz1 - kz0);
    kerb(R.maxX + 0.15, (kz0 + kz1) / 2, 0.3, kz1 - kz0);
    kerb((R.minX + R.maxX) / 2, R.minZ - 0.15, R.maxX - R.minX + 0.6, 0.3);
    kerb((R.minX + R.maxX) / 2, R.maxZ + 0.15, R.maxX - R.minX + 0.6, 0.3);
    kerb(X.minX - 0.15, (X.minZ + X.maxZ) / 2, 0.3, X.maxZ - X.minZ + 0.6);
    kerb(X.maxX + 0.15, (X.minZ + X.maxZ) / 2, 0.3, X.maxZ - X.minZ + 0.6);
    const m = new THREE.Mesh(pv.merged(), sharedMat);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }

  // inlaid flower medallion at the crossing (flat, decorative)
  {
    const tex = canvasTex(512, 512, (ctx, w, h) => {
      const cx = w / 2, cy = h / 2;
      const ring = (r, c) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
      ring(250, '#d4b27c'); ring(236, '#f7ecce'); ring(214, '#e6c58a'); ring(196, '#f9efd2');
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((i / 8) * Math.PI * 2);
        ctx.beginPath(); ctx.ellipse(0, -118, 34, 72, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#ff7aa8' : '#ff4d7d'; ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = '#c92a5c'; ctx.stroke();
        ctx.restore();
      }
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(((i + 0.5) / 8) * Math.PI * 2);
        ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(14, -186); ctx.lineTo(-14, -186); ctx.closePath();
        ctx.fillStyle = '#58b868'; ctx.fill(); ctx.restore();
      }
      ring(52, '#ffd23f'); ring(36, '#d9971a'); ring(22, '#ffe680');
    });
    const med = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    med.rotation.x = -Math.PI / 2;
    med.rotation.z = Math.PI * 0.25;
    med.position.set((R.minX + R.maxX) / 2, 0.056, (X.minZ + X.maxZ) / 2);
    med.renderOrder = 1; med.receiveShadow = true;
    med.matrixAutoUpdate = false; med.updateMatrix();
    root.add(med);
  }

  // -------------------------------------------------------- scenery layout --
  const exclusions = []; // circles {x,z,r}
  const blocked = (x, z, pad) => {
    for (const f of FARMS) if (inRect(x, z, f.plot, pad)) return true;
    if (inRoad(x, z, pad)) return true;
    const gh = WORLD.greenhouse;
    if (Math.abs(x - gh.x) < gh.w / 2 + pad + 1 && Math.abs(z - gh.z) < gh.d / 2 + pad + 1) return true;
    for (const p of PADS) if (Math.hypot(x - p.pos.x, z - p.pos.z) < 3.4 + pad * 0.3) return true;
    for (const e of exclusions) if (Math.hypot(x - e.x, z - e.z) < e.r + pad * 0.5) return true;
    return false;
  };

  // buildings (merged into one mesh)
  const bp = new Parts();
  const addCottage = (cx, cz, yaw, wall, roof, sizeMul = 1) => {
    const g = new Parts();
    const W = 4.2, H = 2.6, D = 3.6;
    g.box(0xece0c6, W + 0.3, 0.35, D + 0.3, [0, 0.175, 0]);
    g.box(wall, W, H, D, [0, 0.35 + H / 2, 0]);
    g.cone(roof, 3.5, 2.3, [0, 0.35 + H + 1.15, 0], [0, Math.PI / 4, 0], 4, [1.0, 1, 0.9]);
    g.box(0xffffff, 0.3, 0.12, 0.3, [0, 0.35 + H + 2.3, 0]);
    g.box(0xe6e0d2, 0.55, 1.3, 0.55, [1.2, 0.35 + H + 1.0, -0.5]);
    g.box(0x8a5a30, 0.9, 1.65, 0.1, [0, 1.18, D / 2 + 0.03]);
    g.box(0xffffff, 1.1, 0.12, 0.14, [0, 2.07, D / 2 + 0.04]);
    g.sph(0xffd23f, 0.07, [0.26, 1.15, D / 2 + 0.1], null, null, 6, 4);
    for (const sx of [-1.3, 1.3]) {
      g.box(0xffffff, 0.9, 0.9, 0.1, [sx, 1.7, D / 2 + 0.02]);
      g.box(0xa8e4ff, 0.7, 0.7, 0.12, [sx, 1.7, D / 2 + 0.04]);
      g.box(0xffffff, 0.06, 0.7, 0.14, [sx, 1.7, D / 2 + 0.05]);
      g.box(0xb9824a, 1.0, 0.22, 0.28, [sx, 1.1, D / 2 + 0.2]);
      for (let k = 0; k < 3; k++) g.ico([0xff5d8f, 0xffd23f, 0xffffff][k], 0.11, [sx - 0.3 + k * 0.3, 1.3, D / 2 + 0.22]);
    }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(sizeMul, sizeMul, sizeMul));
    for (const p of g.parts) bp.parts.push({ geometry: p.geometry, color: p.color, matrix: m.clone().multiply(p.matrix) });
    exclusions.push({ x: cx, z: cz, r: 4.2 * sizeMul });
  };
  const addShed = (cx, cz, yaw, wall, roof) => {
    const g = new Parts();
    g.box(wall, 3.2, 2.1, 2.6, [0, 1.05, 0]);
    g.box(roof, 3.6, 0.2, 3.1, [0, 2.3, 0], [0.18, 0, 0]);
    g.box(roof, 3.7, 0.12, 0.3, [0, 2.45, -1.55]);
    g.box(0xffffff, 1.2, 1.5, 0.1, [0, 0.8, 1.32]);
    g.box(0xc9763c, 1.0, 1.35, 0.12, [0, 0.8, 1.33]);
    g.box(0xffffff, 0.1, 1.35, 0.14, [0, 0.8, 1.34]);
    g.box(0xa8e4ff, 0.6, 0.5, 0.1, [1.0, 1.35, 1.32]);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    for (const p of g.parts) bp.parts.push({ geometry: p.geometry, color: p.color, matrix: m.clone().multiply(p.matrix) });
    exclusions.push({ x: cx, z: cz, r: 3.4 });
  };
  const addWaterTower = (cx, cz) => {
    const g = new Parts();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cyl(0x9aa3b2, 0.14, 0.18, 5.2, [sx * 1.1, 2.6, sz * 1.1], [sz * 0.08, 0, -sx * 0.08], 6);
    g.box(0xb98048, 2.6, 0.16, 0.16, [0, 2.0, -1.1]); g.box(0xb98048, 2.6, 0.16, 0.16, [0, 2.0, 1.1]);
    g.box(0xb98048, 0.16, 0.16, 2.6, [-1.1, 3.2, 0]); g.box(0xb98048, 0.16, 0.16, 2.6, [1.1, 3.2, 0]);
    g.cyl(0x56b9ff, 1.7, 1.7, 2.4, [0, 6.4, 0], null, 12);
    g.cyl(0xffffff, 1.74, 1.74, 0.25, [0, 6.0, 0], null, 12);
    g.cyl(0xffffff, 1.74, 1.74, 0.25, [0, 7.0, 0], null, 12);
    g.cone(0xff6b6b, 1.95, 1.4, [0, 8.3, 0], null, 12);
    g.sph(0xffd23f, 0.18, [0, 9.1, 0], null, null, 6, 4);
    g.box(0xb98048, 0.12, 5, 0.5, [1.3, 2.5, 0.0], [0, 0, 0]);
    for (const p of g.parts) bp.parts.push({ geometry: p.geometry, color: p.color, matrix: new THREE.Matrix4().makeTranslation(cx, 0, cz).multiply(p.matrix) });
    exclusions.push({ x: cx, z: cz, r: 3.6 });
  };
  const buildings = [
    // left strip
    () => addCottage(-24, 4, -Math.PI * 0.75, 0xfff0c2, 0xe8553d),
    () => addCottage(-25, 36, -Math.PI * 0.75, 0xffd3df, 0x7a5be0),
    () => addShed(-23, -9, -Math.PI * 0.75, 0xcfe8ff, 0x3b82f6),
    () => addShed(-22, 62, -Math.PI * 0.75, 0xffe0b0, 0xe8553d),
    // bottom strip
    () => addCottage(3, -26, -Math.PI * 0.75, 0xd8f5c8, 0xf0883a),
    () => addCottage(34, -27, -Math.PI * 0.75, 0xcfe8ff, 0xe8553d),
    () => addShed(-8, -30, -Math.PI * 0.75, 0xffe0b0, 0x7a5be0),
    // right strip
    () => addCottage(62, -10, -Math.PI * 0.75, 0xfff0c2, 0x3b82f6),
    () => addCottage(62, 28, -Math.PI * 0.75, 0xffd3df, 0xe8553d),
    () => addWaterTower(63, 50),
    // top strip
    () => addCottage(-4, 62, -Math.PI * 0.75, 0xd8f5c8, 0x7a5be0),
    () => addCottage(46, 64, -Math.PI * 0.75, 0xfff0c2, 0xf0883a),
  ];
  buildings.forEach((f) => f());

  // windmill (static tower in the merged mesh, rotor animated)
  const WM = { x: 63, z: 10 };
  {
    const g = new Parts();
    g.cyl(0xf3e9d2, 1.3, 2.1, 6.2, [0, 3.1, 0], null, 8);
    g.cyl(0xc9a56a, 2.25, 2.25, 0.5, [0, 0.25, 0], null, 8);
    g.cyl(0xe8553d, 1.45, 1.45, 0.3, [0, 6.35, 0], null, 8);
    g.cone(0xe8553d, 1.75, 2.0, [0, 7.4, 0], null, 8);
    g.sph(0xffd23f, 0.2, [0, 8.5, 0], null, null, 6, 4);
    g.box(0x8a5a30, 1.0, 1.7, 0.2, [0, 0.95, 1.85], [-0.1, 0, 0]);
    g.box(0xa8e4ff, 0.6, 0.8, 0.12, [0, 4.4, 1.5]);
    g.cyl(0x8a5a30, 0.3, 0.3, 1.0, [0, 6.6, 1.5], [Math.PI / 2, 0, 0], 8);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(WM.x, 0, WM.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI * 0.75), new THREE.Vector3(1, 1, 1));
    for (const p of g.parts) bp.parts.push({ geometry: p.geometry, color: p.color, matrix: m.clone().multiply(p.matrix) });
    exclusions.push({ x: WM.x, z: WM.z, r: 4.4 });
    // rotor
    const rp = new Parts();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const mm = new THREE.Matrix4().makeRotationZ(a);
      const part = new Parts();
      part.box(0x8a5a30, 0.22, 4.6, 0.22, [0, 2.4, 0]);
      part.box(0xffffff, 1.15, 3.2, 0.1, [0.65, 2.9, 0.08]);
      part.box(0xff8fa8, 1.15, 0.5, 0.11, [0.65, 4.2, 0.09]);
      for (const p of part.parts) rp.parts.push({ geometry: p.geometry, color: p.color, matrix: mm.clone().multiply(p.matrix) });
    }
    rp.sph(0xe8553d, 0.35, [0, 0, 0.1], null, null, 8, 6);
    const rotor = new THREE.Mesh(rp.merged(), sharedMat);
    rotor.castShadow = true;
    const holder = new THREE.Group();
    holder.position.set(WM.x, 6.6, WM.z);
    holder.rotation.y = -Math.PI * 0.75;
    rotor.position.set(0, 0, 2.15);
    holder.add(rotor);
    root.add(holder);
    animated.push((dt) => { rotor.rotation.z -= dt * 0.7; });
  }
  {
    const m = new THREE.Mesh(bp.merged(), sharedMat);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }

  // entrance pillars, rocks, hay, flower pots (merged decor)
  {
    const dp = new Parts();
    for (const px of [R.minX - 0.6, R.maxX + 0.6]) {
      dp.box(0xf0e6cf, 1.1, 1.8, 1.1, [px, 0.9, R.minZ - 1.5]);
      dp.box(0xd9cdb0, 1.3, 0.2, 1.3, [px, 1.9, R.minZ - 1.5]);
      dp.sph(0xff6fa5, 0.5, [px, 2.45, R.minZ - 1.5], null, null, 10, 8);
      exclusions.push({ x: px, z: R.minZ - 1.5, r: 1.5 });
    }
    // arch banner posts are skipped to keep the road clear
    const rnd = rng(55);
    const pot = (x, z, c) => {
      dp.cyl(0xe07a4a, 0.28, 0.2, 0.34, [x, 0.17, z], null, 8);
      dp.cyl(0xc8643a, 0.31, 0.28, 0.08, [x, 0.36, z], null, 8);
      dp.sph(0x45b84e, 0.3, [x, 0.55, z], [1, 0.8, 1], null, 8, 6);
      for (let k = 0; k < 4; k++) dp.ico(c, 0.1, [x + (rnd() - 0.5) * 0.4, 0.7 + rnd() * 0.12, z + (rnd() - 0.5) * 0.4]);
    };
    const pots = [[R.minX - 0.9, R.minZ + 3, 0xff5d8f], [R.maxX + 0.9, R.minZ + 3, 0xffd23f], [R.minX - 0.9, R.minZ + 5, 0xffd23f], [R.maxX + 0.9, R.minZ + 5, 0xff5d8f],
      [X.minX - 1.0, X.minZ + 1.5, 0xff5d8f], [X.minX - 1.0, X.maxZ - 1.5, 0xffd23f], [X.maxX + 1.0, X.minZ + 1.5, 0xffd23f], [X.maxX + 1.0, X.maxZ - 1.5, 0xff5d8f]];
    for (const [x, z, c] of pots) { pot(x, z, c); }
    for (let i = 0; i < 60; i++) {
      const x = -50 + rnd() * 110, z = -55 + rnd() * 120;
      if (blocked(x, z, 1.5)) continue;
      if (i % 3 === 0) {
        const s = 0.5 + rnd() * 0.6;
        dp.ico(0xb4bcc8, s, [x, s * 0.4, z], [1, 0.7, 1], [0, rnd() * 3, 0]);
        dp.ico(0x9aa3b2, s * 0.6, [x + s * 0.8, s * 0.25, z + s * 0.3], [1, 0.7, 1], [0, rnd() * 3, 0]);
      } else if (i % 3 === 1) {
        dp.cyl(0xe8c25a, 0.55, 0.55, 0.8, [x, 0.55, z], [Math.PI / 2, 0, rnd() * 3], 10);
        dp.cyl(0xd9ac3c, 0.5, 0.5, 0.82, [x, 0.55, z], [Math.PI / 2, 0, 0], 10);
      } else {
        dp.box(0xc98a4b, 0.8, 0.8, 0.8, [x, 0.4, z], [0, rnd() * 3, 0]);
        dp.box(0xe3a766, 0.84, 0.12, 0.84, [x, 0.8, z], [0, rnd() * 3, 0]);
      }
    }
    const m = new THREE.Mesh(dp.merged(), sharedMat);
    m.castShadow = true; m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    root.add(m);
  }

  // trees + bushes
  {
    const rnd = rng(2024);
    const chunks = new Map();
    const CH = 22;
    const chunk = (x, z) => {
      const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
      let c = chunks.get(k);
      if (!c) { c = new Parts(); chunks.set(k, c); }
      return c;
    };
    const greens = [0x35b04a, 0x2f9e44, 0x4cc65a, 0x3cba54];
    const blossoms = [0xff9ec7, 0xffd23f, 0xffffff];
    const tree = (x, z) => {
      const tp = chunk(x, z);
      const s = 0.8 + rnd() * 0.6;
      const k = rnd();
      const trunk = 0x8b5a2b;
      if (k < 0.5) { // cone tree
        const c = greens[(rnd() * greens.length) | 0];
        tp.cyl(trunk, 0.2 * s, 0.26 * s, 1.0 * s, [x, 0.5 * s, z], null, 6);
        tp.cone(c, 1.5 * s, 2.0 * s, [x, 1.9 * s, z], null, 8);
        tp.cone(c, 1.15 * s, 1.7 * s, [x, 2.9 * s, z], null, 8);
        tp.cone(c, 0.8 * s, 1.5 * s, [x, 3.8 * s, z], null, 8);
      } else if (k < 0.9) { // ball tree
        const c = greens[(rnd() * greens.length) | 0];
        tp.cyl(trunk, 0.2 * s, 0.28 * s, 1.5 * s, [x, 0.75 * s, z], null, 6);
        tp.sph(c, 1.35 * s, [x, 2.5 * s, z], [1, 0.9, 1], null, 8, 6);
        tp.sph(0x57d366, 0.8 * s, [x - 0.5 * s, 3.1 * s, z - 0.4 * s], null, null, 6, 4);
      } else { // blossom tree
        const c = blossoms[(rnd() * 2) | 0];
        tp.cyl(trunk, 0.2 * s, 0.28 * s, 1.5 * s, [x, 0.75 * s, z], null, 6);
        tp.sph(c, 1.4 * s, [x, 2.5 * s, z], [1, 0.9, 1], null, 8, 6);
        tp.sph(c === 0xffd23f ? 0xffe680 : 0xffc2dc, 0.8 * s, [x - 0.5 * s, 3.1 * s, z - 0.4 * s], null, null, 6, 4);
      }
    };
    const bush = (x, z) => {
      const tp = chunk(x, z);
      const s = 0.6 + rnd() * 0.5;
      const g = greens[(rnd() * greens.length) | 0];
      tp.sph(g, 0.75 * s, [x, 0.5 * s, z], [1.1, 0.85, 1.1], null, 7, 5);
      const bc = blossoms[(rnd() * blossoms.length) | 0];
      for (let i = 0; i < 4; i++) {
        const a = rnd() * Math.PI * 2, u = 0.2 + rnd() * 0.8;
        tp.oct(bc, 0.17 * s + 0.03, [x + Math.cos(a) * 0.7 * s * (1 - u * 0.4), 0.5 * s + u * 0.55 * s, z + Math.sin(a) * 0.7 * s * (1 - u * 0.4)]);
      }
    };
    // jittered grid
    const step = 5.0;
    for (let gx = -52; gx < 96; gx += step) for (let gz = -62; gz < 106; gz += step) {
      const x = gx + (rnd() - 0.5) * step * 0.9, z = gz + (rnd() - 0.5) * step * 0.9;
      // keep a loose wooded border: denser close to the play area
      if (blocked(x, z, 3.2)) continue;
      if (rnd() < 0.4) continue;
      tree(x, z);
    }
    // bushes hugging the outside of the plot fences
    for (const f of FARMS) {
      const p = f.plot;
      for (let t = p.minX; t <= p.maxX; t += 1.8 + rnd() * 2.5) {
        for (const z of [p.minZ - 1.6, p.maxZ + 1.6]) if (!blocked(t, z, 1.0) && rnd() < 0.55) bush(t, z);
      }
      for (let t = p.minZ; t <= p.maxZ; t += 1.8 + rnd() * 2.5) {
        for (const x of [p.minX - 1.6, p.maxX + 1.6]) if (!blocked(x, t, 1.0) && rnd() < 0.55) bush(x, t);
      }
    }
    for (let i = 0; i < 60; i++) {
      const x = -50 + rnd() * 110, z = -55 + rnd() * 120;
      if (!blocked(x, z, 2.5)) bush(x, z);
    }
    for (const c of chunks.values()) {
      const m = new THREE.Mesh(c.merged(), sharedMat);
      m.name = 'trees';
      m.castShadow = true; m.receiveShadow = true;
      m.matrixAutoUpdate = false; m.updateMatrix();
      root.add(m);
    }
  }

  // ---------------------------------------------------------------- plots ---
  const lawnTex = stripeTexture('#86d65a', '#7aca50');
  lawnTex.repeat.set(1, 1);
  const dashTex = dashedPlotTexture();
  const soilTex = soilTexture();
  const sellTex = sellTexture();
  const cashTex = cashTexture();
  const dimMat = new THREE.MeshLambertMaterial({ color: 0x2a6a58, transparent: true, opacity: 0.42, depthWrite: false });
  const dashMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const signMats = {};
  const farmNames = ['', 'TULIP FARM', 'SUNFLOWER FARM', 'ORCHID FARM'];
  const popIn = (obj, delay = 0) => { if (G.fx && G.fx.popIn) G.fx.popIn(obj, { delay }); };

  const farmViews = FARMS.map((f) => {
    const p = f.plot;
    const cx = f.origin.x, cz = f.origin.z;
    const view = { f, lock: new THREE.Group(), furniture: [], built: false };
    root.add(view.lock);

    // lawn (always)
    const lawnT = lawnTex.clone(); lawnT.needsUpdate = true; lawnT.repeat.set(13, 1);
    const lawn = flatPlane(26, 26, new THREE.MeshLambertMaterial({ map: lawnT }), 0.012, 0);
    lawn.position.set(cx, 0.012, cz);
    lawn.matrixAutoUpdate = false; lawn.updateMatrix();
    root.add(lawn);

    // locked dressing
    const dim = flatPlane(26, 26, dimMat, 0.02, 1);
    dim.position.set(cx, 0.02, cz);
    const dash = flatPlane(26.4, 26.4, dashMat, 0.03, 2);
    dash.position.set(cx, 0.03, cz);
    view.lock.add(dim, dash);
    // FOR SALE sign near the road-side edge
    const sx = f.flip > 0 ? p.maxX - 1.6 : p.minX + 1.6;
    const sPos = [[0, 0], [p.minX + 1.4, cz - 7.5], [cx - 4.5, p.minZ + 1.4], [p.minX + 1.4, cz + 5.5]][f.idx];
    const signPos = f.idx === 0 ? null : { x: sPos[0], z: sPos[1] };
    void sx;
    if (signPos) {
      const sg = new THREE.Group();
      const post = new Parts();
      post.box(0x8a5a30, 0.2, 1.7, 0.2, [-0.9, 0.85, 0]);
      post.box(0x8a5a30, 0.2, 1.7, 0.2, [0.9, 0.85, 0]);
      const pm = new THREE.Mesh(post.merged(), sharedMat); pm.castShadow = true;
      const tex = signTexture([{ text: 'FOR SALE', size: 92, color: '#ffffff', stroke: '#a33a2a' }, { text: farmNames[f.idx].split(' ')[0], size: 54, color: '#ffe9a8', stroke: '#6b3a1a' }], '#e8553d', '#ffffff');
      const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), new THREE.MeshLambertMaterial({ map: tex }));
      board.position.set(0, 1.9, 0.07);
      board.castShadow = true;
      const back = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.7, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
      back.position.set(0, 1.9, -0.02); back.castShadow = true;
      sg.add(pm, back, board);
      sg.position.set(signPos.x, 0, signPos.z);
      sg.scale.setScalar(1.35);
      sg.rotation.y = -Math.PI * 0.75; // board faces the camera
      view.lock.add(sg);
      view.sign = sg;
    }

    // --- furniture (unlocked) ---
    const fu = [];
    // soil bed
    {
      const b = f.bed, m = 1.0;
      const w = b.maxX - b.minX + 2 * m, d = b.maxZ - b.minZ + 2 * m;
      const g = new THREE.Group();
      const st = soilTex.clone(); st.needsUpdate = true; st.repeat.set(w / 4, d / 4);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshLambertMaterial({ map: st }));
      soil.position.set(0, 0.05, 0); soil.receiveShadow = true;
      // plank frame
      const fp = new Parts();
      const fh = 0.22, ft = 0.28;
      fp.box(0xb98048, w + ft, fh, ft, [0, fh / 2, -d / 2]);
      fp.box(0xb98048, w + ft, fh, ft, [0, fh / 2, d / 2]);
      fp.box(0xb98048, ft, fh, d, [-w / 2, fh / 2, 0]);
      fp.box(0xb98048, ft, fh, d, [w / 2, fh / 2, 0]);
      for (const sx2 of [-1, 1]) for (const sz2 of [-1, 1]) fp.box(0x8a5a30, ft + 0.06, fh + 0.08, ft + 0.06, [sx2 * w / 2, (fh + 0.08) / 2, sz2 * d / 2]);
      const fm = new THREE.Mesh(fp.merged(), sharedMat); fm.castShadow = true; fm.receiveShadow = true;
      g.add(soil, fm);
      g.position.set((b.minX + b.maxX) / 2, 0.012, (b.minZ + b.maxZ) / 2);
      fu.push(g);
    }
    // counter
    {
      const c = makeCounter(FLOWERS[f.flower].petal);
      c.position.set(f.counter.x, 0, f.counter.z);
      c.rotation.y = f.counter.dir > 0 ? 0 : Math.PI;
      c.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
      fu.push(c);
    }
    // decals
    {
      const sd = makeDecal(sellTex, 3.4, { y: 0.03 });
      sd.position.set(f.sellZone.x, 0.03, f.sellZone.z);
      fu.push(sd);
      const cd = makeDecal(cashTex, 3.0, { y: 0.03 });
      cd.position.set(f.cashPile.x, 0.03, f.cashPile.z);
      fu.push(cd);
    }
    // queue pavers, hedges, fences, pillars (one merged mesh)
    {
      const bp2 = new Parts();
      const rnd = rng(900 + f.idx);
      const L = (lx, lz) => ({ x: cx + f.flip * lx, z: cz + lz });
      // paved queue strip from counter to the road
      for (let lx = 6.9; lx < 13.1; lx += 1.0) for (let lz = -1.5; lz < 1.6; lz += 1.0) {
        const q = L(lx + 0.5, lz + 0.5);
        const tone = [0xf4e3bd, 0xefdcb2, 0xf8ebca, 0xe8d3a6][(rnd() * 4) | 0];
        bp2.box(tone, 0.92, 0.05, 0.92, [q.x - f.flip * 0.0 - f.flip * 0.0 - (f.flip > 0 ? 0 : 0) , 0.04, q.z]);
      }
      // borders
      const edges = [
        { axis: 'x', c: p.minX, a: p.minZ, b: p.maxZ, out: [-1, 0] },
        { axis: 'x', c: p.maxX, a: p.minZ, b: p.maxZ, out: [1, 0] },
        { axis: 'z', c: p.minZ, a: p.minX, b: p.maxX, out: [0, -1] },
        { axis: 'z', c: p.maxZ, a: p.minX, b: p.maxX, out: [0, 1] },
      ];
      const hedgeSeg = (x, z, len, alongX) => {
        const w = 0.8, h = 0.85;
        const jitter = (rnd() - 0.5) * 0.08;
        const c1 = 0x2f9e44, c2 = 0x45bd57;
        bp2.box(c1, alongX ? len : w, h * 0.6, alongX ? w : len, [x, h * 0.3, z]);
        bp2.box(c2, alongX ? len - 0.12 : w - 0.1, h * 0.5, alongX ? w - 0.1 : len - 0.12, [x, h * 0.6 + h * 0.22 + jitter, z]);
        bp2.box(0x57d366, alongX ? len - 0.35 : w - 0.34, 0.1, alongX ? w - 0.34 : len - 0.35, [x, h + 0.1, z]);
      };
      const picket = (x, z, alongX) => {
        bp2.box(0xffffff, alongX ? 0.15 : 0.06, 0.7, alongX ? 0.06 : 0.15, [x, 0.35, z]);
        bp2.cone(0xffffff, 0.09, 0.14, [x, 0.77, z], null, 4, alongX ? [1, 1, 0.45] : [0.45, 1, 1], false);
      };
      for (const e of edges) {
        const mx = e.axis === 'x' ? e.c + e.out[0] * 1.5 : (e.a + e.b) / 2;
        const mz = e.axis === 'z' ? e.c + e.out[1] * 1.5 : (e.a + e.b) / 2;
        const roadSide = inRoad(mx, mz);
        const alongX = e.axis === 'z';
        const mid = e.axis === 'x' ? cz : cx;
        const gap = roadSide ? 3.6 : 0;
        const len = e.b - e.a;
        const addRange = (s0, s1) => {
          if (s1 - s0 < 0.2) return;
          if (roadSide) {
            const n = Math.max(1, Math.round((s1 - s0) / 1.6));
            const sl = (s1 - s0) / n;
            for (let i = 0; i < n; i++) {
              const s = s0 + (i + 0.5) * sl;
              hedgeSeg(e.axis === 'x' ? e.c : s, e.axis === 'x' ? s : e.c, sl - 0.06, alongX);
            }
          } else {
            const n = Math.round((s1 - s0) / 0.42);
            for (let i = 0; i < n; i++) {
              const s = s0 + (i + 0.5) * ((s1 - s0) / n);
              picket(e.axis === 'x' ? e.c : s, e.axis === 'x' ? s : e.c, alongX);
            }
            for (const yy of [0.22, 0.52]) {
              if (alongX) bp2.box(0xf2f2f2, s1 - s0, 0.07, 0.05, [(s0 + s1) / 2, yy, e.c + 0.07]);
              else bp2.box(0xf2f2f2, 0.05, 0.07, s1 - s0, [e.c + 0.07, yy, (s0 + s1) / 2]);
            }
            const np = Math.max(2, Math.round((s1 - s0) / 3.2) + 1);
            for (let i = 0; i < np; i++) {
              const s = s0 + (i / (np - 1)) * (s1 - s0);
              bp2.box(0xeaeaf2, 0.2, 0.95, 0.2, e.axis === 'x' ? [e.c, 0.47, s] : [s, 0.47, e.c]);
            }
          }
        };
        if (roadSide) {
          addRange(e.a, mid - gap); addRange(mid + gap, e.b);
          for (const s of [mid - gap, mid + gap]) { // gate pillars
            const pp = e.axis === 'x' ? [e.c, 0, s] : [s, 0, e.c];
            bp2.box(0xf0e6cf, 0.55, 1.35, 0.55, [pp[0], 0.675, pp[2]]);
            bp2.box(0xd9cdb0, 0.7, 0.14, 0.7, [pp[0], 1.4, pp[2]]);
            bp2.sph(FLOWERS[f.flower].petal, 0.24, [pp[0], 1.68, pp[2]], null, null, 8, 6);
          }
        } else addRange(e.a, e.b);
        void len;
      }
      for (const sx2 of [p.minX, p.maxX]) for (const sz2 of [p.minZ, p.maxZ]) {
        bp2.box(0xf0e6cf, 0.6, 1.3, 0.6, [sx2, 0.65, sz2]);
        bp2.box(0xd9cdb0, 0.78, 0.14, 0.78, [sx2, 1.35, sz2]);
        bp2.sph(0xffffff, 0.22, [sx2, 1.62, sz2], null, null, 8, 6);
      }
      const m = new THREE.Mesh(bp2.merged(), sharedMat);
      m.castShadow = true; m.receiveShadow = true;
      fu.push(m);
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
  const GH = WORLD.greenhouse;
  const site = new THREE.Group();
  {
    const sp = new Parts();
    sp.box(0x9c7a52, GH.w + 1.4, 0.12, GH.d + 1.4, [0, 0.06, 0]);
    sp.box(0xb89367, GH.w - 0.4, 0.14, GH.d - 0.4, [0, 0.07, 0]);
    // barrier fence: posts + striped rails
    const px0 = -GH.w / 2 - 1.2, px1 = GH.w / 2 + 1.2, pz0 = -GH.d / 2 - 1.2, pz1 = GH.d / 2 + 1.2;
    const rail = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.round(len / 0.8);
      const ang = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
        for (const yy of [0.55, 0.9]) sp.box(i % 2 ? 0xff7a1a : 0xffffff, 0.08, 0.2, len / n, [x, yy, z], [0, ang, 0]);
      }
      for (let i = 0; i <= Math.round(len / 2.4); i++) {
        const t = i / Math.round(len / 2.4);
        sp.box(0xffffff, 0.14, 1.1, 0.14, [x0 + (x1 - x0) * t, 0.55, z0 + (z1 - z0) * t]);
      }
    };
    rail(px0, pz0, px1, pz0); rail(px0, pz1, px1, pz1); rail(px0, pz0, px0, pz1); rail(px1, pz0, px1, pz1);
    // lumber, bags, cones
    for (let i = 0; i < 5; i++) sp.box(0xe0b070, 2.4, 0.16, 0.34, [-2.5, 0.2 + i * 0.17, 0.5 + (i % 2) * 0.03]);
    for (let i = 0; i < 4; i++) sp.box(0xdde7ef, 1.6, 0.18, 0.5, [2.6, 0.2 + i * 0.19, -1.2]);
    sp.box(0xcfa56a, 0.6, 0.6, 0.6, [0.2, 0.4, 2.0]);
    sp.box(0xcfa56a, 0.6, 0.6, 0.6, [0.9, 0.4, 2.3]);
    for (const [cxx, czz] of [[-px1 + 0.1, pz0 + 0.3], [px1 - 0.1, pz0 + 0.3], [0.9, pz0 + 0.1], [-0.9, pz0 + 0.1]]) {
      sp.cone(0xff7a1a, 0.22, 0.55, [cxx, 0.3, czz], null, 8);
      sp.box(0xffffff, 0.3, 0.12, 0.3, [cxx, 0.12, czz]);
    }
    sp.box(0xffd23f, 0.9, 0.5, 0.9, [-3.6, 0.35, -2.4]);
    sp.box(0x8a5a30, 0.2, 2.4, 0.2, [-4.2, 1.2, 2.3]);
    sp.box(0x8a5a30, 0.2, 2.4, 0.2, [-3.7, 1.2, 2.5]);
    for (let i = 0; i < 6; i++) sp.box(0x8a5a30, 0.7, 0.1, 0.1, [-3.95, 0.4 + i * 0.4, 2.4], [0, 0.25, 0]);
    const sm = new THREE.Mesh(sp.merged(), sharedMat);
    sm.castShadow = true; sm.receiveShadow = true;
    site.add(sm);
    // sign
    const post = new Parts();
    post.box(0x8a5a30, 0.22, 2.3, 0.22, [-1.5, 1.15, 0]);
    post.box(0x8a5a30, 0.22, 2.3, 0.22, [1.5, 1.15, 0]);
    const pm = new THREE.Mesh(post.merged(), sharedMat); pm.castShadow = true;
    const tex = signTexture([{ text: 'COMING SOON', size: 64, color: '#ffe27a', stroke: '#6b3a1a' }, { text: 'GRAND', size: 66, color: '#ffffff', stroke: '#2a8a4a' }, { text: 'GREENHOUSE', size: 60, color: '#ffffff', stroke: '#2a8a4a' }], '#3dbb6a', '#ffffff', 640, 400);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.6), new THREE.MeshLambertMaterial({ map: tex }));
    board.position.set(0, 1.9, 0.07);
    board.castShadow = true;
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.3, 2.7, 0.12), new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
    back.position.set(0, 1.9, -0.02); back.castShadow = true;
    const sgn = new THREE.Group(); sgn.add(pm, back, board);
    sgn.position.set(-2.5, 0, -GH.d / 2 - 1.8);
    sgn.rotation.y = -Math.PI * 0.75;
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

  // ------------------------------------------------------------ boot state ---
  G.stats.farms.forEach((on, i) => { if (on) showFarm(i, false); });
  if (G.stats.won) showGreenhouse(false);
  G.events.on('unlock', ({ effect }) => {
    if (!effect) return;
    if (effect.type === 'farm') showFarm(effect.farm, true);
    else if (effect.type === 'win') showGreenhouse(true);
  });

  // ---------------------------------------------------------------- update ---
  const SNAP = 4;
  const lastT = new THREE.Vector3(1e9, 0, 1e9);
  const camLike = new THREE.Vector3();
  function placeSun(x, z) {
    const tx = Math.round(x / SNAP) * SNAP, tz = Math.round(z / SNAP) * SNAP;
    if (tx === lastT.x && tz === lastT.z) return;
    lastT.set(tx, 0, tz);
    sun.target.position.set(tx, 0, tz);
    sun.position.set(tx + SUN_DIR.x * 50, SUN_DIR.y * 50, tz + SUN_DIR.z * 50);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }
  const startPos = G.state && G.state.player ? G.state.player : { x: 0, z: 0 };
  placeSun(startPos.x, startPos.z);
  void camLike;

  return {
    root,
    update(dt) {
      const p = G.player && G.player.pos;
      if (p) placeSun(p.x, p.z);
      for (const a of animated) a(dt);
    },
  };
}
