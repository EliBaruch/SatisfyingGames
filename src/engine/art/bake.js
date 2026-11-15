// Bloom Rush art kit - geometry helpers shared by assets.js and parts.js:
// flattening/merging into one non-indexed vertex-colour geometry and baked ambient occlusion.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _n3 = new THREE.Matrix3();

/**
 * Append `geometry` (indexed or not, any attribute encoding) transformed by `matrix` to the
 * accumulator `acc = { pos: [], nor: [], col: [], uv: [] }` (plain number arrays are avoided:
 * we use growable Float32 chunks collected in `acc.chunks`).
 * `colorFn(i)` -> THREE.Color-like {r,g,b} (linear) for source vertex i.
 */
export function newAcc() { return { chunks: [], count: 0 }; }

export function pushGeometry(acc, geometry, matrix, colorFn, withUV = false) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pa = g.attributes.position;
  let na = g.attributes.normal;
  if (!na) { g.computeVertexNormals(); na = g.attributes.normal; }
  const ua = withUV ? g.attributes.uv : null;
  const n = pa.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = colorFn ? new Float32Array(n * 3) : null;
  const uv = ua ? new Float32Array(n * 2) : null;
  _n3.getNormalMatrix(matrix);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pa, i).applyMatrix4(matrix);
    pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
    _n.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize();
    nor[i * 3] = _n.x; nor[i * 3 + 1] = _n.y; nor[i * 3 + 2] = _n.z;
    if (col) { const c = colorFn(i); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    if (uv) { uv[i * 2] = ua.getX(i); uv[i * 2 + 1] = ua.getY(i); }
  }
  // mirrored transforms (negative determinant) flip triangle winding: restore it
  if (matrix.determinant() < 0) {
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = (i + 1) * 3 + k, b = (i + 2) * 3 + k;
        let t = pos[a]; pos[a] = pos[b]; pos[b] = t;
        t = nor[a]; nor[a] = nor[b]; nor[b] = t;
        if (col) { t = col[a]; col[a] = col[b]; col[b] = t; }
        if (uv && k < 2) { const ua2 = (i + 1) * 2 + k, ub = (i + 2) * 2 + k; t = uv[ua2]; uv[ua2] = uv[ub]; uv[ub] = t; }
      }
    }
  }
  acc.chunks.push({ pos, nor, col, uv, n });
  acc.count += n;
}

export function finishAcc(acc, { color = true, uv = false } = {}) {
  const total = acc.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = color ? new Float32Array(total * 3) : null;
  const uvs = uv ? new Float32Array(total * 2) : null;
  let o = 0;
  for (const ch of acc.chunks) {
    pos.set(ch.pos, o * 3);
    nor.set(ch.nor, o * 3);
    if (col && ch.col) col.set(ch.col, o * 3);
    if (uvs && ch.uv) uvs.set(ch.uv, o * 2);
    o += ch.n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uvs) out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Bake a transform (and optional uniform scale already inside `matrix`) into a geometry, in place. */
export function applyToGeometry(geometry, matrix) {
  geometry.applyMatrix4(matrix);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// -------------------------------------------------------------------- AO bake ---
/**
 * Bake cheap ambient occlusion into the `color` attribute of a vertex-colour geometry.
 * opts:
 *   ground   0..1  darkening at the bottom (default 0.22): vertices below `groundH` fade toward dark
 *   groundH  height over which the ground darkening fades (default 0.35)
 *   down     0..1  darkening of faces that point downward (default 0.18)
 *   boxes    [{ min: [x,y,z], max: [x,y,z] }] occluders: vertices whose normal faces an occluder
 *            box and sit within `range` of it are darkened (crevices between parts)
 *   range    reach of box occlusion (default 0.25), strength `boxK` (default 0.35)
 *   skip     function(i) -> true to leave vertex i alone (e.g. vertices of the occluder part itself)
 * Returns the geometry.
 */
export function bakeAO(geometry, opts = {}) {
  const { ground = 0.22, groundH = 0.35, down = 0.18, boxes = null, range = 0.25, boxK = 0.35, minY = 0 } = opts;
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const col = geometry.attributes.color;
  if (!col) return geometry;
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i) - minY;
    const ny = nor.getY(i);
    let ao = 1;
    if (ground > 0 && y < groundH) { const t = Math.max(0, y) / groundH; ao *= 1 - ground * (1 - t * t); }
    if (down > 0 && ny < 0) ao *= 1 + down * ny; // ny in [-1,0] -> darker
    if (boxes && opts.boxOf) {
      const own = opts.boxOf[i];
      for (let b = 0; b < boxes.length; b++) {
        if (b === own) continue;
        const bx = boxes[b];
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const cx = Math.min(Math.max(px, bx.min[0]), bx.max[0]);
        const cy = Math.min(Math.max(py, bx.min[1]), bx.max[1]);
        const cz = Math.min(Math.max(pz, bx.min[2]), bx.max[2]);
        const dx = cx - px, dy = cy - py, dz = cz - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > range * range) continue;
        const d = Math.sqrt(d2);
        if (d < 1e-5) continue; // vertex lies inside/on the box: embedded geometry, not a crevice
        const facing = (nor.getX(i) * dx + nor.getY(i) * dy + nor.getZ(i) * dz) / d;
        if (facing <= 0.25) continue;
        ao *= 1 - boxK * facing * (1 - d / range);
      }
    }
    if (ao < 1) col.setXYZ(i, col.getX(i) * ao, col.getY(i) * ao, col.getZ(i) * ao);
  }
  col.needsUpdate = true;
  return geometry;
}
