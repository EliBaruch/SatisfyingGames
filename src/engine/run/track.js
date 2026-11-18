// The Gate Run's runway and everything that stands on it, built from code in the world's colours:
// a bright lane with chevrons and coloured edges, rails with bollards and pennants, puffs drifting
// below, the finish arch, the scale and the bonus meter, plus the instanced meshes for pickups,
// hazards and the pile on the scale. Everything is built once (again only if the lane width
// changes) and re-laid for each level, so starting runs over and over allocates nothing on the GPU.
//
// Local frame of `root`: +z along the runway, +y up, -x toward the right of the screen.
import * as THREE from 'three';
import { Parts } from '../art/parts.js';
import { litMaterial, getSharedMaterial } from '../art/material.js';
import { roundRect } from '../decals.js';
import { itemGeometry, itemMaterial } from '../items.js';
import { rng } from '../geom.js';
import { CHUNK, BACK, AFTER } from './level.js';

const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, "Segoe UI", Arial, sans-serif';
const TILE = 10;                    // world units one repeat of the lane texture covers
/** where things stand past the finish line (distance after it) */
export const FIN = { stop: 5.6, pan: 10.8, gauge: 16.2, plaza: 11.4, plazaR: 7.3, archH: 6.6, ribbonY: 5.2 };
export const LAMPS = 5, LAMP_H = 1.06, LAMP_GAP = 1.22, LAMP_Y0 = 0.75;
export const PILE_CAP = 96, PICK_CAP = 56, HAZ_CAP = 8;

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const rgba = (hex, a) => `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${a})`;
const _a = new THREE.Color(), _b = new THREE.Color();
const mix = (a, b, t) => _a.set(a).lerp(_b.set(b), t).getHex();

function texture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) t.wrapT = THREE.RepeatWrapping;
  return t;
}

function laneTexture(col) {
  return texture(256, 512, (g, W, H) => {
    g.fillStyle = css(col.lane);
    g.fillRect(0, 0, W, H);
    g.fillStyle = rgba(col.accent, 0.07);                     // two tones along the runway: speed reads
    g.fillRect(0, 0, W, H / 2);
    g.fillStyle = rgba(col.accent, 0.1);                      // faint seams across
    for (let i = 0; i < 4; i++) g.fillRect(0, (i * H) / 4, W, 3);
    g.lineJoin = 'round'; g.lineCap = 'round';
    for (let k = 0; k < 2; k++) {                              // chevrons pointing up the runway
      const y = H * (0.25 + 0.5 * k);
      g.strokeStyle = rgba(col.accent, 0.3);
      g.lineWidth = 26;
      g.beginPath(); g.moveTo(W * 0.3, y + 30); g.lineTo(W / 2, y - 30); g.lineTo(W * 0.7, y + 30); g.stroke();
    }
    const e = Math.round(W * 0.085);
    g.fillStyle = css(col.accent);
    g.fillRect(0, 0, e, H); g.fillRect(W - e, 0, e, H);
    g.fillStyle = '#ffffff';
    g.fillRect(e, 0, 5, H); g.fillRect(W - e - 5, 0, 5, H);
    g.fillStyle = 'rgba(255, 255, 255, 0.6)';
    for (let i = 0; i < 4; i++) {
      const y = (i * H) / 4 + 22;
      roundRect(g, e * 0.3, y, e * 0.4, H / 4 - 44, 4); g.fill();
      roundRect(g, W - e * 0.7, y, e * 0.4, H / 4 - 44, 4); g.fill();
    }
  }, true);
}

function checkerTexture() {
  const t = texture(128, 32, (g, W, H) => {
    const n = 8, s = W / n;
    for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) { g.fillStyle = (i + j) % 2 ? '#2b2440' : '#ffffff'; g.fillRect(i * s, j * s, s, s); }
  });
  t.magFilter = THREE.NearestFilter;
  return t;
}

function bannerTexture(col) {
  return texture(512, 96, (g, W, H) => {
    g.fillStyle = css(col.accent);
    g.fillRect(0, 0, W, H);
    const s = H / 4;
    for (const x0 of [0, W - s * 4]) for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.fillStyle = (i + j) % 2 ? '#2b2440' : '#ffffff'; g.fillRect(x0 + i * s, j * s, s, s); }
    g.font = `700 74px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = 14; g.strokeStyle = 'rgba(20, 16, 44, 0.9)';
    g.strokeText('FINISH', W / 2, H / 2 + 4);
    g.fillStyle = '#ffffff';
    g.fillText('FINISH', W / 2, H / 2 + 4);
  });
}

function gaugeTexture() {
  return texture(160, 640, (g, W, H) => {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `700 88px ${FONT}`;
    for (let i = 0; i < LAMPS; i++) {
      const y = H - (i + 0.5) * (H / LAMPS) + 4;
      g.lineWidth = 16; g.strokeStyle = 'rgba(20, 16, 44, 0.92)';
      g.strokeText('x' + (i + 1), W / 2, y);
      g.fillStyle = '#ffffff';
      g.fillText('x' + (i + 1), W / 2, y);
    }
  });
}

function puddleTexture() {
  return texture(128, 128, (g, W) => {
    const c = W / 2;
    const grd = g.createRadialGradient(c, c, 4, c, c, c);
    grd.addColorStop(0, 'rgba(96, 62, 214, 0.95)');
    grd.addColorStop(0.72, 'rgba(70, 40, 180, 0.92)');
    grd.addColorStop(0.9, 'rgba(150, 120, 255, 0.85)');
    grd.addColorStop(1, 'rgba(150, 120, 255, 0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.75)'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(c, c, c * 0.62, -2.5, -1.5); g.stroke();
    g.beginPath(); g.arc(c, c, c * 0.4, 0.4, 1.3); g.stroke();
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    g.beginPath(); g.arc(c * 1.34, c * 0.7, 5, 0, Math.PI * 2); g.fill();
  });
}

/** a pennant: a flat triangle in the XY plane, its base on the pole at x = 0 */
function pennantGeometry(len, h, depth) {
  const sh = new THREE.Shape();
  sh.moveTo(0, h / 2); sh.lineTo(len, 0); sh.lineTo(0, -h / 2); sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return g;
}

function starGeometry(r, depth) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.5 : r;
    if (i) sh.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else sh.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: r * 0.06, bevelThickness: r * 0.06, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -depth / 2);
  g.deleteAttribute('uv');
  return g;
}

export function createTrack(G, root, theme) {
  const col = theme.colors;
  const shared = getSharedMaterial();      // the game's vertex-colour look
  const owned = [];                // geometries rebuilt when the lane width changes
  const own = (g) => { owned.push(g); return g; };
  let half = 0, star = null, pennant = null;

  // ---- lane: one quad, the texture repeats along it
  const laneTex = laneTexture(col);
  const laneGeo = new THREE.BufferGeometry();
  laneGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 0, 1, -0.5, 0, 1], 3));
  laneGeo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  laneGeo.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 1, 1], 2));
  laneGeo.setIndex([0, 2, 1, 0, 3, 2]);
  const lane = new THREE.Mesh(laneGeo, litMaterial({ map: laneTex }));
  lane.receiveShadow = true;
  lane.frustumCulled = false;
  // a darker, wider layer just below: reads as the runway's thickness from above
  const skirt = new THREE.Mesh(laneGeo, new THREE.MeshBasicMaterial({ color: mix(col.accent, 0x2b1740, 0.3) }));
  skirt.frustumCulled = false;
  skirt.position.y = -0.45;
  root.add(lane, skirt);

  // ---- per-chunk meshes (rails and scenery): pooled, share a handful of geometries
  const rails = [], decos = [];
  let railGeo = null;
  const decoGeo = [];

  // ---- the finish: arch, plaza, scale and bonus meter (one merged mesh) + its textured bits
  const finish = new THREE.Group();
  root.add(finish);
  const finMesh = new THREE.Mesh(undefined, shared);
  finMesh.castShadow = true; finMesh.receiveShadow = true;
  const checker = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ map: checkerTexture(), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  // the ribbon across the finish line: the runner bursts through it (hidden from then on)
  const ribbon = new THREE.Group();
  const beam = new THREE.Mesh(undefined, shared);
  beam.castShadow = true;
  const banner = new THREE.Mesh(undefined, new THREE.MeshBasicMaterial({ map: bannerTexture(col) }));
  banner.rotation.y = Math.PI;
  ribbon.add(beam, banner);
  const gaugeLabel = new THREE.Mesh(
    new THREE.PlaneGeometry(1.3, LAMPS * LAMP_GAP),
    new THREE.MeshBasicMaterial({ map: gaugeTexture(), transparent: true, depthWrite: false }),
  );
  gaugeLabel.rotation.y = Math.PI;
  gaugeLabel.position.set(0, LAMP_Y0 + (LAMPS * LAMP_GAP) / 2 - (LAMP_GAP - LAMP_H) / 2, FIN.gauge - 0.5);
  gaugeLabel.renderOrder = 8;
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), LAMPS);
  lamps.frustumCulled = false;
  lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  finish.add(finMesh, checker, ribbon, lamps, gaugeLabel);

  // ---- instanced props
  const inst = (geo, mat, cap, cast) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = !!cast;
    m.count = 0;
    root.add(m);
    return m;
  };
  const pickups = inst(itemGeometry(theme.item), itemMaterial(theme.item), PICK_CAP, true);
  const pile = inst(itemGeometry(theme.item), itemMaterial(theme.item), PILE_CAP, true);
  const barrier = inst(undefined, shared, HAZ_CAP, true);
  const post = inst(undefined, shared, HAZ_CAP, true);
  const arm = inst(undefined, shared, HAZ_CAP, true);
  const puddle = inst(
    new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: puddleTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    HAZ_CAP, false,
  );
  puddle.renderOrder = 2;

  function buildRail(h) {
    const b = new Parts();
    const x = h + 0.3;
    for (const sx of [-1, 1]) {
      b.capsule(col.edge, 0.19, CHUNK, [sx * x, 0.08, CHUNK / 2], [Math.PI / 2, 0, 0], null, 3, 10);
      for (const z of [3, 9]) {
        b.cyl(col.accent2, 0.17, 0.2, 0.5, [sx * x, 0.42, z], null, 10);
        b.sph(col.edge, 0.2, [sx * x, 0.72, z], null, null, 10, 6);
      }
    }
    return own(b.merged());
  }
  /** scenery beside one chunk: puffs drifting below the runway, a pennant on the rail */
  function buildDeco(h, v) {
    const rnd = rng(9173 + v * 131);
    const b = new Parts();
    const low = mix(col.puff, theme.background, 0.45);
    const n = 2 + (v % 2);
    for (let i = 0; i < n; i++) {
      const side = (i + v) % 2 ? 1 : -1;
      const x = side * (h + 3.2 + rnd() * 7.5), y = -2 - rnd() * 6, z = rnd() * CHUNK;
      const r = 1.1 + rnd() * 1.1, c = mix(col.puff, low, Math.min(1, (-y - 2) / 6));
      b.sph(c, r, [x, y, z], [1.5, 0.55, 1.1], null, 12, 7);
      b.sph(c, r * 0.72, [x + r * 1.1, y + 0.1, z + r * 0.3], [1.4, 0.55, 1.1], null, 10, 6);
      b.sph(c, r * 0.6, [x - r * 1.05, y - 0.05, z - r * 0.2], [1.4, 0.55, 1.1], null, 10, 6);
    }
    if (v % 2 === 0) {
      const sx = v % 4 ? 1 : -1, x = sx * (h + 0.3), z = 6;
      b.cyl(col.edge, 0.055, 0.07, 2.7, [x, 1.35, z], null, 8);
      b.sph(col.accent2, 0.11, [x, 2.74, z], null, null, 8, 6);
      if (!pennant) pennant = pennantGeometry(1.15, 0.78, 0.06);
      b.add(pennant, v % 4 ? col.accent : col.accent2, [x, 2.28, z], [0, sx > 0 ? 0 : Math.PI, 0]);
    }
    return own(b.merged());
  }
  function buildFinish(h) {
    const b = new Parts();
    const px = h + 0.8, A = FIN.archH;
    // the finish posts: two banded pylons (the ribbon between them is its own mesh)
    for (const sx of [-1, 1]) {
      b.rbox(col.edge, 0.62, A, 0.62, 0.14, [sx * px, A / 2, 0], null, null, 1);
      for (let k = 0; k < 3; k++) b.rbox(k % 2 ? col.accent2 : col.accent, 0.72, 0.62, 0.72, 0.12, [sx * px, 1.1 + k * 2.1, 0], null, null, 1);
      b.sph(col.accent2, 0.5, [sx * px, A + 0.35, 0], null, null, 12, 8);
    }
    // plaza with a coloured rim
    b.rcyl(col.accent, FIN.plazaR + 0.4, 0.5, 0.14, [0, -0.33, FIN.plaza], null, 44);
    b.rcyl(col.lane, FIN.plazaR, 0.5, 0.1, [0, -0.27, FIN.plaza], null, 44);
    // rings round the scale, each a hair above the last so nothing fights for depth
    b.cyl(mix(col.lane, col.accent, 0.35), 4.75, 4.75, 0.02, [0, -0.024, FIN.pan], null, 40);
    b.cyl(col.lane, 4.45, 4.45, 0.02, [0, -0.018, FIN.pan], null, 40);
    b.cyl(mix(col.lane, col.accent2, 0.3), 3.75, 3.75, 0.02, [0, -0.012, FIN.pan], null, 40);
    // the scale
    b.rcyl(col.edge, 3.05, 0.3, 0.1, [0, 0.13, FIN.pan], null, 36);
    b.rcyl(col.accent2, 2.7, 0.26, 0.09, [0, 0.38, FIN.pan], null, 36);
    b.rcyl(mix(col.lane, 0xffffff, 0.5), 2.3, 0.1, 0.04, [0, 0.54, FIN.pan], null, 36);
    // the bonus meter: a tall board with five lamp slots
    const top = LAMP_Y0 + LAMPS * LAMP_GAP, gz = FIN.gauge;
    b.rbox(0x27365a, 2.9, top + 0.35, 0.56, 0.2, [0, (top + 0.35) / 2 + 0.2, gz], null, null, 1);
    for (let i = 0; i < LAMPS; i++) b.box(0x18223f, 2.3, LAMP_H, 0.1, [0, LAMP_Y0 + i * LAMP_GAP + LAMP_H / 2, gz - 0.27]);
    b.rbox(col.accent, 3.3, 0.46, 0.8, 0.14, [0, 0.3, gz], null, null, 1);
    b.rbox(col.accent, 3.3, 0.42, 0.8, 0.14, [0, top + 0.62, gz], null, null, 1);
    if (!star) star = starGeometry(1, 0.34);
    b.add(star, 0xffc928, [0, top + 1.75, gz], [0, Math.PI, 0], [0.9, 0.9, 0.9]);
    return own(b.merged());
  }
  function buildBarrier() {
    const b = new Parts();
    const n = 5, w = 1 / n;
    for (let i = 0; i < n; i++) b.rbox(i % 2 ? 0xffffff : 0xff5a4f, w * 1.02, 1.05, 0.6, 0.05, [-0.5 + (i + 0.5) * w, 0.525, 0], null, null, 1);
    b.box(0x3a2a55, 1, 0.1, 0.66, [0, 0.05, 0]);
    return own(b.merged());
  }
  function buildSpinner(reach) {
    const p = new Parts();
    p.rcyl(0x3a2a55, 0.42, 0.9, 0.1, [0, 0.45, 0], null, 16);
    p.rcyl(col.accent2, 0.3, 0.5, 0.1, [0, 1.05, 0], null, 14);
    p.sph(0xffffff, 0.24, [0, 1.36, 0], null, null, 10, 8);
    const a = new Parts();
    const n = 6, w = (reach * 2) / n;
    for (let i = 0; i < n; i++) a.rbox(i % 2 ? 0xffffff : 0xff5a4f, w * 1.02, 0.36, 0.36, 0.08, [-reach + (i + 0.5) * w, 0.95, 0], null, null, 1);
    for (const sx of [-1, 1]) a.sph(0xffc928, 0.32, [sx * reach, 0.95, 0], null, null, 12, 8);
    return [own(p.merged()), own(a.merged())];
  }

  /** build (or rebuild) everything that depends on the lane's half width */
  function size(h) {
    if (Math.abs(h - half) < 0.01) return;
    half = h;
    for (const g of owned) g.dispose();
    owned.length = 0;
    railGeo = buildRail(h);
    decoGeo.length = 0;
    for (let v = 0; v < 4; v++) decoGeo.push(buildDeco(h, v));
    for (const m of rails) m.geometry = railGeo;
    for (let i = 0; i < decos.length; i++) decos[i].geometry = decoGeo[i % 4];
    finMesh.geometry = buildFinish(h);
    barrier.geometry = buildBarrier();
    const sp = buildSpinner(h * 0.55);
    post.geometry = sp[0]; arm.geometry = sp[1];
    const W = (h + 0.5) * 2;
    lane.scale.x = W;
    skirt.scale.x = W + 0.5;
    const rb = new Parts();
    rb.rbox(col.accent, 1, 1.5, 0.3, 0.1, [0, 0, 0], null, [h * 2 + 1.3, 1, 1], 1);
    beam.geometry = own(rb.merged());
    ribbon.position.set(0, FIN.ribbonY, 0);
    checker.geometry = own(new THREE.PlaneGeometry(h * 2, (h * 2) / 4).rotateX(-Math.PI / 2).translate(0, 0.012, h / 4));
    banner.geometry = own(new THREE.PlaneGeometry(h * 2 + 1.1, 1.3));
    banner.position.set(0, 0, -0.17);
  }

  /** lay the runway out for a level of this length */
  function layout(length) {
    const total = BACK + length + AFTER;
    lane.position.z = skirt.position.z = -BACK;
    lane.scale.z = skirt.scale.z = total;
    ribbon.visible = true;
    laneTex.repeat.set(1, total / TILE);
    const n = Math.round(total / CHUNK);
    for (let i = 0; i < n; i++) {
      if (!rails[i]) {
        const r = new THREE.Mesh(railGeo, shared);
        r.castShadow = true;
        const d = new THREE.Mesh(decoGeo[i % 4], shared);
        rails.push(r); decos.push(d);
        root.add(r, d);
      }
      rails[i].position.z = decos[i].position.z = -BACK + i * CHUNK;
      rails[i].visible = decos[i].visible = true;
    }
    for (let i = n; i < rails.length; i++) rails[i].visible = decos[i].visible = false;
    finish.position.z = length;
  }

  return { root, size, layout, pickups, pile, barrier, post, arm, puddle, lamps, ribbon, get half() { return half; } };
}
