// Bloom Rush art kit - pooled blob contact shadows.
//
// One InstancedMesh of soft radial-gradient quads lying just above the ground, so characters,
// workers and props look grounded even where the real shadow map is soft, far away, or off.
//
//   const blobs = createBlobShadows(scene, { max: 96 });
//   blobs.attach(player, 0.55);                       // circle radius 0.55
//   blobs.attach(tractor, { rx: 1.0, rz: 1.8, yaw: true });   // ellipse that turns with the object
//   blobs.update();                                   // once per rendered frame (reads world positions)
//   blobs.detach(customer);
import * as THREE from 'three';
import { BLOB } from './material.js';

function gradientTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  // smooth falloff: dense core, long soft tail
  const stops = [[0, 1], [0.25, 0.9], [0.5, 0.55], [0.75, 0.2], [0.9, 0.05], [1, 0]];
  for (const [o, a] of stops) grd.addColorStop(o, `rgba(255,255,255,${a})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createBlobShadows(parent, opts = {}) {
  const max = opts.max || 96;
  const y = opts.y ?? BLOB.y;
  const geo = new THREE.PlaneGeometry(2, 2); // unit circle diameter 2 -> scale = radius
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: gradientTexture(), color: opts.color ?? 0x1c3a1a, transparent: true, opacity: opts.opacity ?? BLOB.opacity,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  mesh.name = 'blob-shadows';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);

  const items = [];            // { obj, rx, rz, yaw, lift, ox, oz }
  const index = new Map();     // obj -> item
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let enabled = true;

  function visible(o) { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; }

  return {
    mesh, material: mat,
    /** attach(obj, radius) or attach(obj, { rx, rz, yaw, lift, ox, oz }); returns obj. */
    attach(obj, r = 0.5) {
      if (index.has(obj)) return obj;
      if (items.length >= max) { if (!this._warned) { this._warned = true; console.warn('[art] blob shadow pool full (' + max + ')'); } return obj; }
      const o = typeof r === 'number' ? { rx: r, rz: r } : r;
      const it = { obj, rx: o.rx ?? o.radius ?? 0.5, rz: o.rz ?? o.rx ?? o.radius ?? 0.5, yaw: !!o.yaw, lift: !!o.lift, ox: o.ox || 0, oz: o.oz || 0 };
      index.set(obj, it); items.push(it);
      return obj;
    },
    detach(obj) {
      const it = index.get(obj);
      if (!it) return;
      index.delete(obj);
      const i = items.indexOf(it);
      items[i] = items[items.length - 1];
      items.pop();
    },
    clear() { items.length = 0; index.clear(); mesh.count = 0; },
    setEnabled(on) { enabled = !!on; mesh.visible = enabled; },
    setOpacity(v) { mat.opacity = v; },
    get count() { return items.length; },
    /** Call once per rendered frame. Cheap: one matrix compose per attached object. */
    update() {
      if (!enabled) return;
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const o = it.obj;
        if (!visible(o)) continue;
        o.updateWorldMatrix(true, false);
        const el = o.matrixWorld.elements;
        let k = 1;
        let ox = it.ox, oz = it.oz;
        if (it.yaw) {
          // yaw from the object's +Z axis
          const yaw = Math.atan2(el[8], el[10]);
          q.setFromAxisAngle(UP, yaw);
          const c = Math.cos(yaw), sn = Math.sin(yaw);
          const wx = ox * c + oz * sn, wz = -ox * sn + oz * c;
          ox = wx; oz = wz;
        } else q.identity();
        if (it.lift) { const h = Math.max(0, el[13]); k = 1 / (1 + 0.45 * h); }
        p.set(el[12] + ox, y, el[14] + oz);
        s.set(it.rx * k, 1, it.rz * k);
        m.compose(p, q, s);
        mesh.setMatrixAt(n++, m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
