// The tool's reach, made visible: two white arcs sweep around the player while they harvest, as
// wide as the harvest radius. A reach upgrade (a pad or the WIDER REACH perk) is seen at once as a
// bigger sweep. Worlds that draw their own (the frost camp's whirling axes) are left alone.
import * as THREE from 'three';

const SEG = 18, ARC = 2.1;        // segments and radians per arc

function arcGeometry() {
  // unit radius; each arc is thick and bright at its head and tapers to nothing at its tail
  const pos = [], col = [], idx = [];
  for (let a = 0; a < 2; a++) {
    const base = pos.length / 3;
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG, th = a * Math.PI + u * ARC;
      const inner = 1 - 0.3 * u * u, c = u * u;
      pos.push(Math.sin(th), 0, Math.cos(th), Math.sin(th) * inner, 0, Math.cos(th) * inner);
      col.push(c, c, c, c * 0.6, c * 0.6, c * 0.6);
      if (i < SEG) { const k = base + i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export function createSwoosh(G) {
  const P = { ...(G.world.player || {}) };
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(arcGeometry(), mat);
  mesh.visible = false;
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  G.scene.add(mesh);
  let level = 0, angle = 0;

  function update(dt) {
    const pl = G.player;
    if (!pl) return;
    const act = pl.action;
    const on = !!act && act !== 'pickup' && !G.stats.whirl;
    level += ((on ? 1 : 0) - level) * Math.min(1, dt * (on ? 14 : 7));
    if (level < 0.02) { if (mesh.visible) mesh.visible = false; return; }
    const r = (G.stats.harvestRadius || P.harvestRadius || 1.25) * (G.stats.reach || 1);
    angle -= dt * 13;
    mesh.visible = true;
    mesh.position.set(pl.pos.x, 0.85, pl.pos.z);
    mesh.rotation.y = angle;
    mesh.scale.set(r, 1, r);
    mat.opacity = 0.75 * level;
  }

  return { update };
}
