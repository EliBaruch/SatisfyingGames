// Ground markings and canvas helpers for scenes: drop-zone decals ("SELL"), cash-pile
// decals, signs. Pure builders; a scene adds what they return to its own root.
import * as THREE from 'three';
import { makeZone } from './art/props.js';

export function canvasTex(w, h, draw, { repeat = false, anisotropy = 4 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}


/** Ground decal: flat plane of the given size, yawed so texture-up points toward world (+x,+z). */
export function makeDecal(tex, size, { yaw = -Math.PI * 0.75, y = 0.03, order = 3 } = {}) {
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

/** Flat ground plane w x d at height y. */
export function flatPlane(w, d, mat, y, order = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = order;
  m.receiveShadow = true;
  return m;
}


export function signTexture(lines, bg, fg, w = 512, h = 320) {
  return canvasTex(w, h, (ctx) => {
    roundRect(ctx, 6, 6, w - 12, h - 12, 28);
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


/**
 * Drop-zone decal ("SELL"): the art kit's zone helper (rounded square, glowing cyan-white dashed
 * outline, bold label, reads upright from the camera). Returns a Mesh (position it; y is 0.04).
 */
export function makeDropDecal(text = 'SELL', size = 3.4) {
  const z = makeZone({ w: size, d: size, label: text });
  return z;
}

/** Cash-pile decal: warm zone with a banknote icon painted on it. */
export function makeCashDecal(size = 3.0) {
  const px = 170;
  const z = makeZone({ w: size, d: size, label: '', color: '#fff0a0', fill: 'rgba(255,205,70,0.30)', px });
  const tex = z.material.map;
  const ctx = tex.image.getContext('2d');
  const W = tex.image.width, H = tex.image.height;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.1);
  const bw = W * 0.5, bh = bw * 0.56;
  roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh * 0.16);
  ctx.fillStyle = '#35b856'; ctx.fill();
  ctx.lineWidth = Math.max(6, bh * 0.07); ctx.strokeStyle = '#176a33'; ctx.stroke();
  roundRect(ctx, -bw * 0.42, -bh * 0.36, bw * 0.84, bh * 0.72, bh * 0.1);
  ctx.lineWidth = Math.max(3, bh * 0.03); ctx.strokeStyle = '#a9f0b9'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, bh * 0.26, 0, Math.PI * 2);
  ctx.fillStyle = '#c8f7d2'; ctx.fill(); ctx.lineWidth = bh * 0.04; ctx.strokeStyle = '#176a33'; ctx.stroke();
  ctx.fillStyle = '#176a33'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `900 ${bh * 0.36}px "Arial Black", Impact, Arial, sans-serif`;
  ctx.fillText('$', 0, bh * 0.02);
  ctx.restore();
  tex.needsUpdate = true;
  return z;
}
