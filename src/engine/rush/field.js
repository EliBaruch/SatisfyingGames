// The Harvest Rush field and everything on it, built from code in the world's colours: the ground
// with its swept-trail overlay, the fence, the carpet of items (ONE InstancedMesh of a low-detail
// proxy of the world's item), the cart with its growing mound, three trucks, the plough, the sweep
// rings, the floating pick-up icons, bales and mud. Everything is built once and only re-laid for a
// level or another field size, so starting rushes over and over allocates nothing on the GPU.
//
// Frame: `root` is turned 45 degrees so that field coordinates are screen-aligned:
//   a = across (screen right) = local -x,   b = up the screen = local +z.
import * as THREE from 'three';
import { Parts } from '../art/parts.js';
import { litMaterial, getSharedMaterial } from '../art/material.js';
import { roundRect } from '../decals.js';
import { itemGeometry, itemMaterial } from '../items.js';
import { getItem } from '../registry.js';
import { rng } from '../geom.js';
import { ITEM_CAP, WIDER, MAGNET, DOUBLE } from './level.js';

const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, "Segoe UI", Arial, sans-serif';
export const PROXY_TRIS = 44;       // the carpet's item: at most this many triangles (2,000 of them = 88k)
export const MOUND_CAP = 90, LOAD_CAP = 42, FENCE_CAP = 110, PICK_CAP = 6, BALE_CAP = 8, MUD_CAP = 4, RING_CAP = 2 + PICK_CAP;
export const TRUCK = { len: 5.2, wid: 2.3, bedY: 0.86 };
const TRAIL_PX = 256;

const css = (hex) => '#' + hex.toString(16).padStart(6, '0');
const rgba = (hex, a) => `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${a})`;
const _ca = new THREE.Color(), _cb = new THREE.Color();
const mix = (a, b, t) => _ca.set(a).lerp(_cb.set(b), t).getHex();

function texture(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** tilled ground: the base colour, speckles and soft furrows across (tiles seamlessly) */
function groundTexture(color, furrows, seed) {
  return texture(256, 256, (g, W, H) => {
    const rnd = rng(seed);
    g.fillStyle = css(color);
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * W, y = rnd() * H, r = 1.5 + rnd() * 5;
      g.fillStyle = rnd() < 0.5 ? `rgba(255, 255, 255, ${0.03 + rnd() * 0.05})` : `rgba(0, 0, 0, ${0.03 + rnd() * 0.06})`;
      g.beginPath(); g.ellipse(x, y, r * 1.6, r, 0, 0, 6.283); g.fill();
    }
    if (furrows) {
      const n = 8, s = H / n;
      for (let i = 0; i < n; i++) {
        const grd = g.createLinearGradient(0, i * s, 0, (i + 1) * s);
        grd.addColorStop(0, 'rgba(0, 0, 0, 0.16)');
        grd.addColorStop(0.35, 'rgba(0, 0, 0, 0)');
        grd.addColorStop(0.7, 'rgba(255, 255, 255, 0.07)');
        grd.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
        g.fillStyle = grd;
        g.fillRect(0, i * s, W, s);
      }
    }
  }, true);
}

/** a soft ring on the ground (the sweep circle, the glow under a pick-up); white, tinted per instance */
function ringTexture() {
  return texture(128, 128, (g, W) => {
    const c = W / 2;
    const grd = g.createRadialGradient(c, c, c * 0.2, c, c, c * 0.96);
    grd.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    grd.addColorStop(0.8, 'rgba(255, 255, 255, 0.2)');
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(c, c, c, 0, 6.283); g.fill();
    g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    g.lineWidth = 5;
    g.setLineDash([16, 9]);
    g.beginPath(); g.arc(c, c, c * 0.9, 0, 6.283); g.stroke();
  });
}

function mudTexture() {
  return texture(128, 128, (g, W) => {
    const c = W / 2, rnd = rng(77);
    g.fillStyle = 'rgba(255, 255, 255, 0.96)';
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const th = (i / 40) * 6.283, r = c * (0.8 + 0.1 * Math.sin(th * 3 + 1) + 0.07 * Math.sin(th * 7));
      if (i) g.lineTo(c + Math.cos(th) * r, c + Math.sin(th) * r); else g.moveTo(c + Math.cos(th) * r, c + Math.sin(th) * r);
    }
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(0, 0, 0, ${0.06 + rnd() * 0.1})`;
      g.beginPath(); g.ellipse(rnd() * W, rnd() * W, 6 + rnd() * 16, 4 + rnd() * 8, rnd() * 3, 0, 6.283); g.fill();
    }
    g.strokeStyle = 'rgba(255, 255, 255, 0.5)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.arc(c, c, c * 0.5, -2.4, -1.4); g.stroke();
    g.beginPath(); g.arc(c * 1.1, c * 1.1, c * 0.3, 0.3, 1.2); g.stroke();
    g.globalCompositeOperation = 'source-over';
  });
}

const ICON_COLORS = [0x2f8df0, 0xe8433f, 0xff9a1f, 0x2fb14a];
/** a pick-up's badge: a glossy disc in the pick-up's colour with a white glyph */
function iconTexture(type) {
  return texture(160, 160, (g, W) => {
    const c = W / 2, col = ICON_COLORS[type];
    g.beginPath(); g.arc(c, c + 3, c - 6, 0, 6.283); g.fillStyle = 'rgba(20, 16, 44, 0.9)'; g.fill();
    g.beginPath(); g.arc(c, c, c - 8, 0, 6.283); g.fillStyle = '#ffffff'; g.fill();
    const grd = g.createLinearGradient(0, 14, 0, W - 14);
    grd.addColorStop(0, css(mix(col, 0xffffff, 0.3))); grd.addColorStop(1, css(mix(col, 0x000000, 0.18)));
    g.beginPath(); g.arc(c, c, c - 15, 0, 6.283); g.fillStyle = grd; g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.22)';
    g.beginPath(); g.ellipse(c, c - 26, c - 30, c - 48, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#ffffff';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = 'rgba(20, 16, 44, 0.45)'; g.shadowOffsetY = 4; g.shadowBlur = 0;
    if (type === WIDER) {
      g.lineWidth = 13;
      g.beginPath(); g.moveTo(c - 34, c); g.lineTo(c + 34, c); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(c + s * 22, c - 19); g.lineTo(c + s * 42, c); g.lineTo(c + s * 22, c + 19); g.stroke(); }
    } else if (type === MAGNET) {
      g.lineWidth = 22; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(c - 26, c + 34); g.lineTo(c - 26, c - 4); g.arc(c, c - 4, 26, Math.PI, 0); g.lineTo(c + 26, c + 34); g.stroke();
      g.shadowColor = 'transparent';
      g.fillStyle = css(mix(ICON_COLORS[MAGNET], 0x000000, 0.35));
      g.fillRect(c - 37, c + 18, 22, 7); g.fillRect(c + 15, c + 18, 22, 7);
    } else {
      g.font = `700 ${type === DOUBLE ? 78 : 64}px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(type === DOUBLE ? 'x2' : '+5s', c, c + 5);
    }
  });
}

/**
 * A low-detail stand-in for an item: its vertices are snapped to a coarse grid (cells average their
 * positions and vertex colours), triangles that collapse are dropped. Flat shaded, in the item's own
 * colours; from the rush camera an item is 15 to 25 pixels long, so the shape is all that reads.
 */
export function proxyGeometry(src, maxTris) {
  const g0 = src.index ? src.toNonIndexed() : src;
  const P = g0.attributes.position, C = g0.attributes.color;
  const tris = P.count / 3;
  if (tris <= maxTris || !C) return { geometry: src, tris, own: false };
  src.computeBoundingBox();
  const bb = src.boundingBox;
  const sx = Math.max(1e-3, bb.max.x - bb.min.x), sy = Math.max(1e-3, bb.max.y - bb.min.y), sz = Math.max(1e-3, bb.max.z - bb.min.z);
  const sm = Math.max(sx, sy, sz);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  let out = null;
  for (let res = 8; res >= 2 && !out; res--) {
    const nx = Math.max(2, Math.round((res * sx) / sm)), ny = Math.max(2, Math.round((res * sy) / sm)), nz = Math.max(2, Math.round((res * sz) / sm));
    const cells = new Map();
    const cellOf = (v, i, w) => {
      const ix = Math.min(nx - 1, Math.floor(((v.x - bb.min.x) / sx) * nx)), iy = Math.min(ny - 1, Math.floor(((v.y - bb.min.y) / sy) * ny)), iz = Math.min(nz - 1, Math.floor(((v.z - bb.min.z) / sz) * nz));
      const key = ix + nx * (iy + ny * iz);
      let c = cells.get(key);
      if (!c) { c = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, w: 0 }; cells.set(key, c); }
      c.x += v.x * w; c.y += v.y * w; c.z += v.z * w;
      c.r += C.getX(i) * w; c.g += C.getY(i) * w; c.b += C.getZ(i) * w; c.w += w;
      return key;
    };
    const keep = [], seen = new Set();
    for (let t = 0; t < tris; t++) {
      va.fromBufferAttribute(P, t * 3); vb.fromBufferAttribute(P, t * 3 + 1); vc.fromBufferAttribute(P, t * 3 + 2);
      const w = e1.subVectors(vb, va).cross(e2.subVectors(vc, va)).length() + 1e-6;
      const k0 = cellOf(va, t * 3, w), k1 = cellOf(vb, t * 3 + 1, w), k2 = cellOf(vc, t * 3 + 2, w);
      if (k0 === k1 || k1 === k2 || k0 === k2) continue;
      // the same triangle with the same winding only once
      const id = k0 < k1 && k0 < k2 ? `${k0},${k1},${k2}` : k1 < k2 ? `${k1},${k2},${k0}` : `${k2},${k0},${k1}`;
      if (seen.has(id)) continue;
      seen.add(id);
      keep.push(k0, k1, k2);
    }
    if (keep.length / 3 > maxTris || keep.length < 12) continue;
    const pos = new Float32Array(keep.length * 3), col = new Float32Array(keep.length * 3);
    for (let i = 0; i < keep.length; i++) {
      const c = cells.get(keep[i]);
      pos[i * 3] = c.x / c.w; pos[i * 3 + 1] = c.y / c.w; pos[i * 3 + 2] = c.z / c.w;
      col[i * 3] = c.r / c.w; col[i * 3 + 1] = c.g / c.w; col[i * 3 + 2] = c.b / c.w;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    out = { geometry: geo, tris: keep.length / 3, own: true };
  }
  return out || { geometry: src, tris, own: false };
}

function quadGeometry() {
  // a unit square on the ground; u runs with a (screen right), v with b (up the screen)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([1, 0, 0, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

export function createField(G, root, theme) {
  const col = theme.colors, gr = theme.ground;
  const shared = getSharedMaterial();
  const item = getItem(theme.item);
  const proxy = proxyGeometry(itemGeometry(theme.item), PROXY_TRIS);
  const itemMat = proxy.own ? shared : itemMaterial(theme.item);
  // every world's item lies about the same size on the field
  const sc = Math.min(1.5, Math.max(0.7, 0.86 / Math.max(0.3, item.footprint.w)));
  const iw = item.footprint.w * sc, id = Math.max(0.3, item.footprint.d * sc), istep = Math.max(0.12, item.step * sc);
  const quad = quadGeometry();
  const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _c = new THREE.Color();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), UP = new THREE.Vector3(0, 1, 0);

  // ---- ground: the land around, the rim, the field and the swept trail over it
  const outTex = groundTexture(gr.out, false, 11), fieldTex = groundTexture(gr.field, true, 23);
  const land = new THREE.Mesh(quad, litMaterial({ map: outTex }));
  land.scale.set(420, 1, 420); land.position.y = -0.03;
  outTex.repeat.set(52, 52);
  land.receiveShadow = true; land.frustumCulled = false;
  const rim = new THREE.Mesh(quad, litMaterial({ color: gr.edge }));
  rim.position.y = -0.015; rim.receiveShadow = true; rim.frustumCulled = false;
  const ground = new THREE.Mesh(quad, litMaterial({ map: fieldTex }));
  ground.receiveShadow = true; ground.frustumCulled = false;
  const trailCanvas = document.createElement('canvas');
  trailCanvas.width = trailCanvas.height = TRAIL_PX;
  const tctx = trailCanvas.getContext('2d');
  const trailTex = new THREE.CanvasTexture(trailCanvas);
  trailTex.colorSpace = THREE.SRGBColorSpace;
  const trailMesh = new THREE.Mesh(quad, litMaterial({ map: trailTex, transparent: true, opacity: 0.9, depthWrite: false }));
  trailMesh.position.y = 0.02; trailMesh.renderOrder = 1; trailMesh.receiveShadow = true; trailMesh.frustumCulled = false;
  // the loading yard beyond the top fence: a paved drive the trucks stand on and leave by
  const yardTex = texture(128, 256, (g, w, h) => {
    const rnd = rng(5);
    g.fillStyle = '#5d6470';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.07)'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 4, 2 + rnd() * 3); }
    g.fillStyle = '#f4f1e6';
    g.fillRect(0, 0, 7, h); g.fillRect(w - 7, 0, 7, h);
    g.fillStyle = 'rgba(255, 214, 80, 0.9)';
    for (let i = 0; i < 4; i++) g.fillRect(w / 2 - 3, i * (h / 4) + 10, 6, h / 4 - 28);
  }, true);
  const yard = new THREE.Mesh(quad, litMaterial({ map: yardTex }));
  yard.position.y = -0.01; yard.receiveShadow = true; yard.frustumCulled = false;
  root.add(land, rim, ground, trailMesh, yard);
  // the brush: a soft dot in the swept colour, a darker lip round it (the pushed-up edge of the path)
  const brush = document.createElement('canvas');
  brush.width = brush.height = 64;
  {
    const g = brush.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, rgba(gr.trail, 0.55));
    grd.addColorStop(0.62, rgba(gr.trail, 0.5));
    grd.addColorStop(0.86, rgba(mix(gr.trail, gr.field, 0.5), 0.2));
    grd.addColorStop(1, rgba(gr.trail, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  let W = 0, H = 0, trailDirty = false;
  const trail = {
    clear() { tctx.clearRect(0, 0, TRAIL_PX, TRAIL_PX); trailTex.needsUpdate = true; trailDirty = false; },
    /** sweep a dot of radius r (field units) at (a, b) */
    stamp(a, b, r) {
      const rx = (r / W) * TRAIL_PX, ry = (r / H) * TRAIL_PX;
      tctx.drawImage(brush, (a / W + 0.5) * TRAIL_PX - rx, (0.5 - b / H) * TRAIL_PX - ry, rx * 2, ry * 2);
      trailDirty = true;
    },
    /** once per rendered frame: upload if something was swept */
    flush() { if (trailDirty) { trailTex.needsUpdate = true; trailDirty = false; } },
  };

  const inst = (geo, mat, cap, cast, parent) => {
    const m = new THREE.InstancedMesh(geo, mat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.castShadow = !!cast;
    m.count = 0;
    (parent || root).add(m);
    return m;
  };

  // ---- fence: one post and two rails per segment, stretched along its length
  const fenceGeo = (() => {
    const b = new Parts(), dark = mix(gr.fence, 0x3a2a20, 0.22);
    b.box(gr.fence, 0.09, 1.12, 0.2, [0, 0.56, 0]);
    b.box(dark, 0.1, 0.07, 0.24, [0, 1.15, 0]);
    b.box(gr.fence, 1, 0.14, 0.07, [0.5, 0.82, 0]);
    b.box(gr.fence, 1, 0.14, 0.07, [0.5, 0.44, 0]);
    return b.merged();
  })();
  const fence = inst(fenceGeo, shared, FENCE_CAP, true);
  function layFence() {
    const hw = W / 2 + 0.55, hh = H / 2 + 0.55;
    const sides = [[-hw, -hh, 1, 0, 0, 2 * hw], [hw, -hh, 0, 1, -Math.PI / 2, 2 * hh], [hw, hh, -1, 0, Math.PI, 2 * hw], [-hw, hh, 0, -1, Math.PI / 2, 2 * hh]];
    let n = 0;
    for (const [x0, z0, dx, dz, yaw, len] of sides) {
      const k = Math.max(1, Math.round(len / 2.2)), seg = len / k;
      for (let i = 0; i < k && n < FENCE_CAP; i++) {
        _m.compose(_p.set(x0 + dx * seg * i, 0, z0 + dz * seg * i), _q.setFromAxisAngle(UP, yaw), _s.set(seg, 1, 1));
        fence.setMatrixAt(n++, _m);
      }
    }
    fence.count = n;
    fence.instanceMatrix.needsUpdate = true;
  }

  // ---- the carpet
  const carpet = inst(proxy.geometry, itemMat, ITEM_CAP, false);
  /** write item i: field position, height, heading (about y), forward tumble, scale factor */
  function setItem(i, a, b, y, yaw, tumble, k) {
    _e.set(tumble, yaw, 0, 'YXZ');
    _m.compose(_p.set(-a, y, b), _q.setFromEuler(_e), _s.set(sc * k, sc * k, sc * k));
    carpet.setMatrixAt(i, _m);
  }
  function hideItem(i) { carpet.setMatrixAt(i, ZERO); }

  // ---- a heap of items in a box: slots are fixed (bottom to top), only `count` changes.
  // Rings of items that get smaller toward the top, so it is a mound and never a tower.
  function heap(parent, cap, rx, rz, y0, layers, seed) {
    const m = inst(proxy.geometry, itemMat, cap, false, parent);
    const rnd = rng(seed), ys = new Float32Array(cap + 1);
    const lift = Math.min(istep * 0.62, 1.9 / layers);
    // items per layer fall off linearly; scaled so the layers hold `cap` between them
    let sum = 0;
    for (let l = 0; l < layers; l++) sum += 1 - (l / layers) * 0.86;
    let n = 0;
    for (let l = 0; l < layers && n < cap; l++) {
      const k = 1 - (l / layers) * 0.86, per = l === layers - 1 ? cap - n : Math.max(1, Math.round((cap * k) / sum));
      const ax = Math.max(0, rx * k - iw * 0.3), az = Math.max(0, rz * k - id * 0.3), ph = rnd() * 6.283;
      for (let i = 0; i < per && n < cap; i++) {
        const th = ph + (i / per) * 6.283, r = per < 4 ? 0.35 * (i % 2) : Math.sqrt(0.2 + 0.8 * rnd());
        _p.set(Math.cos(th) * ax * r, y0 + l * lift + rnd() * 0.04, Math.sin(th) * az * r);
        _e.set((rnd() - 0.5) * 0.5, rnd() * 6.283, (rnd() - 0.5) * 0.5);
        _m.compose(_p, _q.setFromEuler(_e), _s.set(sc, sc, sc));
        m.setMatrixAt(n, _m);
        ys[n++] = y0 + (l + 1) * lift + 0.1;
      }
    }
    ys[cap] = ys[cap - 1];
    m.instanceMatrix.needsUpdate = true;
    m.userData.top = ys;
    return m;
  }

  // ---- the cart that trails the hero (forward = local +z)
  const cart = new THREE.Group();
  {
    const b = new Parts(), wood = 0xc98a4b, dark = 0x8a5a2e, tyre = 0x2f2a36;
    b.box(dark, 1.62, 0.1, 2.0, [0, 0.5, 0]);
    for (const s of [-1, 1]) {
      b.box(wood, 0.1, 0.62, 2.06, [s * 0.81, 0.84, 0]);
      b.box(col.accent, 0.12, 0.12, 2.1, [s * 0.81, 1.17, 0]);
      b.box(wood, 1.62, 0.62, 0.1, [0, 0.84, s * 0.99]);
      b.box(col.accent, 1.74, 0.12, 0.12, [0, 1.17, s * 0.99]);
      b.cyl(tyre, 0.42, 0.42, 0.24, [s * 0.98, 0.42, -0.1], [0, 0, Math.PI / 2], 14);
      b.cyl(col.accent2, 0.2, 0.2, 0.27, [s * 0.98, 0.42, -0.1], [0, 0, Math.PI / 2], 10);
    }
    b.box(dark, 0.1, 0.1, 1.3, [0, 0.52, 1.6]);
    const body = new THREE.Mesh(b.merged(), shared);
    body.castShadow = true;
    cart.add(body);
  }
  root.add(cart);
  const mound = heap(cart, MOUND_CAP, 0.86, 1.05, 0.58, 11, 301);
  if (G.blobs && G.blobs.attach) G.blobs.attach(cart, { rx: 1.1, rz: 1.3, yaw: true });

  // ---- trucks: backs to the field, they drive off up the screen (forward = local +z)
  const truckGeo = (() => {
    const b = new Parts(), dark = 0x2c2a36, bed = 0xf3efe6, glass = 0xbfe6ff;
    b.box(dark, 2.0, 0.3, 5.0, [0, 0.6, 0]);
    b.rbox(col.accent, 2.24, 1.55, 1.5, 0.16, [0, 1.52, 1.78]);
    b.box(glass, 1.8, 0.55, 0.06, [0, 1.86, 1.02]);
    b.box(glass, 1.9, 0.6, 0.06, [0, 1.82, 2.54]);
    b.box(mix(col.accent, 0xffffff, 0.35), 2.0, 0.08, 1.2, [0, 2.31, 1.78]);
    b.box(bed, 2.24, 0.12, 3.36, [0, 0.8, -0.88]);
    for (const s of [-1, 1]) {
      b.box(bed, 0.12, 0.74, 3.36, [s * 1.06, 1.2, -0.88]);
      b.box(col.accent2, 0.14, 0.16, 3.4, [s * 1.06, 1.5, -0.88]);
      for (const z of [1.72, -1.6]) {
        b.cyl(dark, 0.48, 0.48, 0.3, [s * 1.02, 0.48, z], [0, 0, Math.PI / 2], 14);
        b.cyl(0xd9dde4, 0.22, 0.22, 0.33, [s * 1.02, 0.48, z], [0, 0, Math.PI / 2], 8);
      }
      b.box(0xff4a4a, 0.3, 0.16, 0.06, [s * 0.8, 0.68, -2.54]);
    }
    b.box(bed, 2.24, 0.74, 0.12, [0, 1.2, 0.76]);
    b.box(bed, 2.24, 0.74, 0.12, [0, 1.2, -2.52]);
    b.box(col.accent2, 2.28, 0.16, 0.14, [0, 1.5, -2.52]);
    b.box(0xd9dde4, 2.2, 0.2, 0.16, [0, 0.52, -2.56]);
    return b.merged();
  })();
  const trucks = [];
  for (let k = 0; k < 3; k++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(truckGeo, shared);
    body.castShadow = true;
    group.add(body);
    const load = heap(group, LOAD_CAP, 1.0, 1.55, TRUCK.bedY, 5, 500 + k * 17);
    load.position.z = -0.88;
    root.add(group);
    if (G.blobs && G.blobs.attach) G.blobs.attach(group, { rx: 1.4, rz: 2.8, yaw: true });
    trucks.push({ group, load, a: 0, b: 0 });
  }

  // ---- the plough: a wide blade in front of the hero; x is scaled with the sweep radius
  const plough = new THREE.Group();
  {
    const b = new Parts(), steel = 0xe6ebf2;
    b.box(col.accent, 1.5, 0.62, 0.14, [0, 0.36, 1.05]);
    b.box(steel, 1.5, 0.1, 0.2, [0, 0.07, 1.1]);
    b.box(0xffffff, 1.5, 0.08, 0.16, [0, 0.7, 1.05]);
    for (const s of [-1, 1]) {
      b.box(col.accent, 0.34, 0.62, 0.14, [s * 0.88, 0.36, 0.96], [0, -s * 0.6, 0]);
      b.box(steel, 0.34, 0.1, 0.2, [s * 0.88, 0.07, 1.0], [0, -s * 0.6, 0]);
      b.box(0xffffff, 0.34, 0.08, 0.16, [s * 0.88, 0.7, 0.96], [0, -s * 0.6, 0]);
      b.box(0x3a3340, 0.05, 0.07, 0.7, [s * 0.22, 0.42, 0.68], [0, s * 0.18, 0]);
    }
    const blade = new THREE.Mesh(b.merged(), shared);
    blade.castShadow = true;
    plough.add(blade);
  }
  root.add(plough);

  // ---- rings on the ground: [0] the sweep circle, [1] the magnet's reach, then one under each pick-up
  const rings = inst(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, depthWrite: false }), RING_CAP, false);
  rings.renderOrder = 3;
  rings.count = RING_CAP;
  for (let i = 0; i < RING_CAP; i++) { rings.setMatrixAt(i, ZERO); rings.setColorAt(i, _c.set(0xffffff)); }
  rings.instanceColor.setUsage(THREE.DynamicDrawUsage);
  /** ring i at (a, b), radius r (0 hides it), turned by `spin` */
  function setRing(i, a, b, r, spin) {
    if (r > 0) _m.compose(_p.set(-a, 0.05, b), _q.setFromAxisAngle(UP, spin), _s.set(r, 1, r)); else _m.copy(ZERO);
    rings.setMatrixAt(i, _m);
    rings.instanceMatrix.needsUpdate = true;
  }
  function tintRing(i, hex) { rings.setColorAt(i, _c.set(hex)); rings.instanceColor.needsUpdate = true; }
  tintRing(0, gr.ring); tintRing(1, mix(ICON_COLORS[MAGNET], 0xffffff, 0.25));

  // ---- pick-ups: floating badges that face the camera
  const iconMats = [0, 1, 2, 3].map((t) => new THREE.SpriteMaterial({ map: iconTexture(t), transparent: true, depthWrite: false }));
  const icons = [];
  for (let i = 0; i < PICK_CAP; i++) {
    const s = new THREE.Sprite(iconMats[0]);
    s.visible = false; s.renderOrder = 7;
    root.add(s);
    icons.push(s);
  }

  // ---- obstacles
  const baleGeo = (() => {
    const b = new Parts();
    if (theme.obstacle === 'bale') {
      b.rbox(0xe6bd5c, 2.0, 1.1, 1.25, 0.14, [0, 0.55, 0]);
      for (const x of [-0.5, 0.5]) b.box(0x9a6b2e, 0.09, 1.13, 1.28, [x, 0.55, 0]);
      b.box(0xf3d27e, 1.9, 0.04, 1.1, [0, 1.11, 0]);
    } else if (theme.obstacle === 'rock') {
      b.ico(0x8d99a8, 1.0, [0, 0.5, 0], [1.05, 0.75, 0.95]);
      b.ico(0x7a8696, 0.6, [0.7, 0.3, 0.35], [1, 0.7, 1]);
      b.ico(0xffffff, 0.78, [-0.05, 0.92, 0], [1.05, 0.4, 0.95]);
    } else {
      b.rbox(0xc9955a, 1.55, 1.3, 1.55, 0.06, [0, 0.65, 0]);
      for (const s of [-1, 1]) {
        b.box(0x9b6a36, 1.6, 0.16, 1.6, [0, 0.65 + s * 0.57, 0]);
        b.box(0x9b6a36, 0.16, 1.3, 1.6, [s * 0.72, 0.65, 0]);
      }
      b.box(col.accent, 0.7, 0.4, 1.58, [0, 0.7, 0]);
    }
    return b.merged();
  })();
  const bales = inst(baleGeo, shared, BALE_CAP, true);
  const mudMesh = inst(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: mudTexture(), color: gr.mud, transparent: true, depthWrite: false }), MUD_CAP, false);
  mudMesh.renderOrder = 2;

  /** the field's size, and where the three trucks park */
  function size(w, h, yardW) {
    if (w === W && h === H) return;
    W = w; H = h;
    const yl = 60;
    yard.scale.set(yardW, 1, yl);
    yard.position.z = H / 2 + 0.85 + yl / 2;
    yardTex.repeat.set(1, yl / (yardW * 1.6));
    ground.scale.set(W, 1, H);
    fieldTex.repeat.set(W / 7, H / 7);
    rim.scale.set(W + 1.7, 1, H + 1.7);
    trailMesh.scale.set(W, 1, H);
    layFence();
    trail.clear();
  }

  /** lay a level: every item on the ground, obstacles, pick-ups */
  function layout(lv) {
    for (let i = 0; i < lv.count; i++) setItem(i, lv.a[i], lv.b[i], 0, lv.yaw[i], 0, 1);
    carpet.count = lv.count;
    carpet.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < lv.bales.length && i < BALE_CAP; i++) {
      const o = lv.bales[i];
      _m.compose(_p.set(-o.a, 0, o.b), _q.setFromAxisAngle(UP, o.yaw), _s.set(1, 1, 1));
      bales.setMatrixAt(i, _m);
    }
    bales.count = Math.min(BALE_CAP, lv.bales.length);
    bales.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < lv.mud.length && i < MUD_CAP; i++) {
      const o = lv.mud[i];
      _m.compose(_p.set(-o.a, 0.03, o.b), _q.setFromAxisAngle(UP, i * 1.7), _s.set(o.r, 1, o.r));
      mudMesh.setMatrixAt(i, _m);
    }
    mudMesh.count = Math.min(MUD_CAP, lv.mud.length);
    mudMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < PICK_CAP; i++) {
      const p = lv.picks[i], s = icons[i];
      s.visible = !!p;
      if (!p) { setRing(2 + i, 0, 0, 0, 0); continue; }
      s.material = iconMats[p.type];
      s.position.set(-p.a, 1.9, p.b);
      s.scale.set(2.3, 2.3, 1);
      tintRing(2 + i, mix(ICON_COLORS[p.type], 0xffffff, 0.35));
      setRing(2 + i, p.a, p.b, 1.5, 0);
    }
    trail.clear();
  }

  return {
    carpet, mound, cart, plough, trucks, icons, rings, bales,
    proxyTris: proxy.tris, proxyOwn: proxy.own, scale: sc, step: istep,
    size, layout, setItem, hideItem, setRing, tintRing, trail,
    iconColor: (type) => ICON_COLORS[type],
  };
}
