// Ground markings and canvas helpers for scenes: drop-zone decals ("SELL"), cash-pile
// decals, signs. Pure builders; a scene adds what they return to its own root.
import * as THREE from 'three';

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


export function dropZoneTexture(text = 'SELL') {
  return canvasTex(512, 512, (ctx, w, h) => {
    roundRect(ctx, 14, 14, w - 28, h - 28, 70);
    ctx.fillStyle = 'rgba(40,200,255,0.30)'; ctx.fill();
    ctx.lineCap = 'round';
    ctx.setLineDash([46, 30]); ctx.lineWidth = 22;
    ctx.strokeStyle = '#ffffff'; ctx.stroke();
    roundRect(ctx, 44, 44, w - 88, h - 88, 50);
    ctx.setLineDash([26, 24]); ctx.lineWidth = 9; ctx.strokeStyle = '#19b8f2'; ctx.stroke();
    ctx.setLineDash([]);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let fs = 170;
    ctx.font = `900 ${fs}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`;
    while (fs > 60 && ctx.measureText(text).width > w - 120) { fs -= 10; ctx.font = `900 ${fs}px "Arial Black", Impact, "Helvetica Neue", Arial, sans-serif`; }
    ctx.lineJoin = 'round';
    ctx.lineWidth = 26; ctx.strokeStyle = '#0a86c4'; ctx.strokeText(text, w / 2, h / 2 - 14);
    ctx.fillStyle = '#ffffff'; ctx.fillText(text, w / 2, h / 2 - 14);
    // little arrows pointing in (down on the texture)
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#0a86c4'; ctx.lineWidth = 8;
    for (const dx of [-70, 0, 70]) {
      const x = w / 2 + dx, y = h - 150;
      ctx.beginPath(); ctx.moveTo(x - 28, y - 10); ctx.lineTo(x + 28, y - 10); ctx.lineTo(x, y + 24); ctx.closePath();
      ctx.stroke(); ctx.fill();
    }
  });
}

export function cashZoneTexture() {
  return canvasTex(512, 512, (ctx, w, h) => {
    roundRect(ctx, 14, 14, w - 28, h - 28, 70);
    ctx.fillStyle = 'rgba(255,230,120,0.30)'; ctx.fill();
    ctx.lineCap = 'round';
    ctx.setLineDash([46, 30]); ctx.lineWidth = 20; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.setLineDash([]);
    // banknote
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.12);
    roundRect(ctx, -150, -85, 300, 170, 24);
    ctx.fillStyle = '#2fbf5b'; ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#0f7a35'; ctx.stroke();
    roundRect(ctx, -125, -62, 250, 124, 14);
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


const texCache = new Map();
/** Drop-zone decal (dashed rounded square with big text), cached per text. */
export function makeDropDecal(text = 'SELL', size = 3.4) {
  let t = texCache.get('drop:' + text);
  if (!t) { t = dropZoneTexture(text); texCache.set('drop:' + text, t); }
  return makeDecal(t, size, { y: 0.03 });
}
/** Cash-pile decal (banknote + coin). */
export function makeCashDecal(size = 3.0) {
  let t = texCache.get('cash');
  if (!t) { t = cashZoneTexture(); texCache.set('cash', t); }
  return makeDecal(t, size, { y: 0.03 });
}
