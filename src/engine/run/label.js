// A floating number on a pill-shaped plate, made of quads cut from one small atlas: the count above
// the runner's tower and the counter over the scale. Changing the number rewrites a few floats (no
// canvas work, no strings), so it can change every step.
import * as THREE from 'three';

const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, "Segoe UI", Arial, sans-serif';
const CELL_W = 72, CELL_H = 104, MAX = 5;
// atlas: ten digit cells in a row, then one square cell holding a disc (the plate's round ends and fill)
const ATLAS_W = CELL_W * 10 + CELL_H;
let atlas = null;

function getAtlas() {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = ATLAS_W; c.height = CELL_H;
  const ctx = c.getContext('2d');
  ctx.font = `700 90px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (let d = 0; d < 10; d++) {
    const x = d * CELL_W + CELL_W / 2, y = CELL_H / 2 + 5;
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#1c1446';
    ctx.strokeText(String(d), x, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(d), x, y);
  }
  // the plate: a disc with a dark rim and a soft top highlight
  const cx = CELL_W * 10 + CELL_H / 2, cy = CELL_H / 2, r = CELL_H / 2 - 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1c1446'; ctx.fill();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, '#7a70ff'); g.addColorStop(1, '#4234c4');
  ctx.beginPath(); ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
  ctx.fillStyle = g; ctx.fill();
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

/** opts: { height (world units of the plate), parent } */
export function createDigits(G, opts = {}) {
  const H = opts.height || 1.2;              // plate height
  const h = H * 0.86, w = h * (CELL_W / CELL_H), adv = h * 0.47;
  const QUADS = MAX + 3;                     // plate: left end, middle, right end; then the digits
  const pos = new Float32Array(QUADS * 12), uv = new Float32Array(QUADS * 8);
  const idx = [];
  for (let i = 0; i < QUADS; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), H * 5);
  const mat = new THREE.MeshBasicMaterial({ map: getAtlas(), transparent: true, depthTest: false, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 900;
  mesh.frustumCulled = false;
  mesh.visible = false;
  (opts.parent || G.scene).add(mesh);

  function quad(i, x0, x1, y0, y1, u0, u1) {
    const p = i * 12, u = i * 8;
    pos[p] = x0; pos[p + 1] = y0; pos[p + 3] = x1; pos[p + 4] = y0;
    pos[p + 6] = x1; pos[p + 7] = y1; pos[p + 9] = x0; pos[p + 10] = y1;
    uv[u] = u0; uv[u + 1] = 0; uv[u + 2] = u1; uv[u + 3] = 0;
    uv[u + 4] = u1; uv[u + 5] = 1; uv[u + 6] = u0; uv[u + 7] = 1;
  }
  const U0 = (CELL_W * 10) / ATLAS_W, UM = (CELL_W * 10 + CELL_H / 2) / ATLAS_W;

  const D = { n: -1, pulse: 0 };
  function set(n) {
    n = n < 0 ? 0 : n > 99999 ? 99999 : n | 0;
    if (n === D.n) return;
    if (D.n >= 0) D.pulse = 1;
    D.n = n;
    const k = n < 10 ? 1 : n < 100 ? 2 : n < 1000 ? 3 : n < 10000 ? 4 : 5;
    const span = (k - 1) * adv + w;                 // the digits' width
    const half = Math.max(0, span / 2 - H * 0.24);  // half length of the plate's straight part
    quad(0, -half - H / 2, -half, 0, H, U0, UM);
    quad(1, -half, half, 0, H, UM, UM);
    quad(2, half, half + H / 2, 0, H, UM, 1);
    let x = -span / 2, div = 1;
    const y0 = (H - h) / 2;
    for (let i = 1; i < k; i++) div *= 10;
    for (let i = 0; i < k; i++) {
      const d = ((n / div) | 0) % 10;
      div /= 10;
      quad(3 + i, x, x + w, y0, y0 + h, (d * CELL_W) / ATLAS_W, ((d + 1) * CELL_W) / ATLAS_W);
      x += adv;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.setDrawRange(0, (3 + k) * 6);
  }
  set(0);

  return {
    mesh, set,
    get value() { return D.n; },
    show(on) { mesh.visible = !!on; },
    /** face the camera, ease the pop that follows a change */
    update(dt, scale = 1) {
      if (!mesh.visible) return;
      if (D.pulse > 0) D.pulse = Math.max(0, D.pulse - dt * 5);
      mesh.quaternion.copy(G.camera.quaternion);
      mesh.scale.setScalar(scale * (1 + 0.25 * D.pulse * D.pulse));
    },
  };
}
