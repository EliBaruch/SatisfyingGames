// Small helpers for the thrills' own props.
import * as THREE from 'three';

/**
 * Bake a group of simple meshes into ONE mesh (one draw call, one shadow pass): positions and
 * normals in the group's space, each part's material colour (times its vertex colours, if any)
 * written to a `color` attribute.
 */
export function mergeGroup(group, { emissive = 0x000000, doubleSide = false } = {}) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const pos = [], nor = [], col = [];
  const m = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    m.multiplyMatrices(inv, o.matrixWorld);
    n3.getNormalMatrix(m);
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
    c.copy(o.material.color || c.set(0xffffff));
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
      if (N) v.fromBufferAttribute(N, i).applyMatrix3(n3).normalize(); else v.set(0, 1, 0);
      nor.push(v.x, v.y, v.z);
      if (C) col.push(c.r * C.getX(i), c.g * C.getY(i), c.b * C.getZ(i)); else col.push(c.r, c.g, c.b);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide }));
  mesh.castShadow = true;
  return mesh;
}
