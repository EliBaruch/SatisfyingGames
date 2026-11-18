// Gate pairs across the runway: two arches side by side, blue for a gain and red for a loss, each
// with its number drawn big on a canvas texture. A small pool is re-labelled as the runner advances.
// Local frame of the runway root: +z along the runway, -x toward the right of the screen.
import * as THREE from 'three';
import { roundRect } from '../decals.js';           // not ctx.roundRect: older browsers lack it
import { Parts } from '../art/parts.js';
import { litMaterial } from '../art/material.js';

const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, "Segoe UI", Arial, sans-serif';
const TEX_W = 256, TEX_H = 272;
const H = 3.5;                 // panel height
export const GAIN = 0x2e9bff, LOSS = 0xff4d5e;
const PAIRS = 3;

function drawLabel(ctx, text, gain) {
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  // a soft plate behind the number keeps it readable over the runway
  ctx.fillStyle = gain ? 'rgba(10, 60, 140, 0.28)' : 'rgba(140, 10, 30, 0.28)';
  roundRect(ctx, 14, 40, TEX_W - 28, TEX_H - 80, 36); ctx.fill();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let size = 150;
  ctx.font = `700 ${size}px ${FONT}`;
  while (size > 40 && ctx.measureText(text).width > TEX_W - 40) { size -= 4; ctx.font = `700 ${size}px ${FONT}`; }
  ctx.lineWidth = Math.max(12, size * 0.2);
  ctx.strokeStyle = 'rgba(20, 16, 44, 0.92)';
  ctx.strokeText(text, TEX_W / 2, TEX_H / 2 + 6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, TEX_W / 2, TEX_H / 2 + 6);
}

export function createGatePool(G, root) {
  const frameMat = { gain: litMaterial({ vertexColors: true, color: GAIN, emissive: 0x0a2f66 }), loss: litMaterial({ vertexColors: true, color: LOSS, emissive: 0x5a0f1a }) };
  let frameGeo = null, panelGeo = null, width = 0;
  const gates = [];            // 2 per pair: [left, right, left, right, ...]
  const pairs = [];            // { row, s, state, t }

  function makeGate() {
    const group = new THREE.Group();
    group.rotation.y = Math.PI;                      // faces back down the runway, toward the camera
    const frame = new THREE.Mesh(undefined, frameMat.gain);
    frame.castShadow = true;
    const panelMat = new THREE.MeshBasicMaterial({ color: GAIN, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(undefined, panelMat);
    panel.renderOrder = 6;
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W; canvas.height = TEX_H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const label = new THREE.Mesh(undefined, labelMat);
    label.position.z = 0.06;
    label.renderOrder = 7;
    group.add(frame, panel, label);
    group.visible = false;
    root.add(group);
    return { group, frame, panel, label, panelMat, labelMat, ctx: canvas.getContext('2d'), tex, color: GAIN, f: 0 };
  }
  for (let i = 0; i < PAIRS; i++) {
    gates.push(makeGate(), makeGate());
    pairs.push({ row: -1, s: 0, state: 0, t: 0, picked: 0 });
  }

  /** (re)build the shared geometry for a lane of half width `half` */
  function size(half) {
    const w = half - 0.1;                            // one gate spans half the lane
    if (Math.abs(w - width) < 0.01) return;
    width = w;
    if (frameGeo) frameGeo.dispose();
    if (panelGeo) panelGeo.dispose();
    const b = new Parts();
    const post = [0.17, 0.2, H + 0.5];
    b.cyl(0xffffff, post[0], post[1], post[2], [-w / 2 + 0.06, post[2] / 2, 0], null, 12);
    b.cyl(0xffffff, post[0], post[1], post[2], [w / 2 - 0.06, post[2] / 2, 0], null, 12);
    b.rbox(0xffffff, 1, 0.5, 0.44, 0.12, [0, H + 0.42, 0], null, [w + 0.3, 1, 1], 1);
    b.sph(0xffffff, 0.27, [-w / 2 + 0.06, H + 0.72, 0], null, null, 10, 8);
    b.sph(0xffffff, 0.27, [w / 2 - 0.06, H + 0.72, 0], null, null, 10, 8);
    frameGeo = b.merged();
    panelGeo = new THREE.PlaneGeometry(w - 0.36, H).translate(0, H / 2 + 0.12, 0);
    for (const g of gates) { g.frame.geometry = frameGeo; g.panel.geometry = panelGeo; g.label.geometry = panelGeo; }
  }

  function dress(g, opt, x, s) {
    g.color = opt.gain ? GAIN : LOSS;
    g.frame.material = opt.gain ? frameMat.gain : frameMat.loss;
    g.panelMat.color.setHex(g.color);
    g.panelMat.opacity = 0.5; g.labelMat.opacity = 1;
    try { drawLabel(g.ctx, opt.text, opt.gain); } catch (err) { console.error('[run] gate label failed:', err); }
    g.tex.needsUpdate = true;
    g.group.position.set(x, 0, s);
    g.group.scale.set(1, 1, 1);
    g.group.visible = true;
  }

  function reset() {
    for (const g of gates) g.group.visible = false;
    for (const p of pairs) { p.row = -1; p.state = 0; }
  }

  /** keep the next rows dressed: `next` is the index of the first gate row not yet passed */
  function assign(level, next) {
    for (let k = 0; k < PAIRS; k++) {
      const row = next + k;
      if (row >= level.gates.length) break;
      const i = row % PAIRS, p = pairs[i];
      if (p.row === row || p.state >= 2) continue;   // still bursting from its last row
      const g = level.gates[row];
      p.row = row; p.s = g.s; p.state = 1; p.t = 0;
      dress(gates[i * 2], g.a, width / 2 + 0.05, g.s);        // left on screen = +x
      dress(gates[i * 2 + 1], g.b, -width / 2 - 0.05, g.s);
    }
  }

  /** the runner went through row `row` on side 0 (left) or 1 (right): both go, the taken one bigger */
  function take(row, side) {
    const p = pairs[row % PAIRS];
    if (p.row !== row) return;
    p.state = 2; p.t = 0; p.picked = side;
  }

  function update(dt, time) {
    for (let i = 0; i < PAIRS; i++) {
      const p = pairs[i];
      if (!p.state) continue;
      p.t += dt;
      for (let k = 0; k < 2; k++) {
        const g = gates[i * 2 + k];
        if (p.state === 1) {
          const s = 1 + 0.035 * Math.sin(time * 5 + k * 2 + i);
          g.group.scale.set(s, s, 1);
        } else {
          const u = p.t / 0.26;
          if (u >= 1) { g.group.visible = false; continue; }
          if (k === p.picked) { const s = 1 + u * 0.8; g.group.scale.set(s, Math.max(0.001, 1 - u), s); }
          else g.group.scale.set(1, Math.max(0.001, 1 - u * 1.4), 1);
          g.panelMat.opacity = 0.5 * (1 - u); g.labelMat.opacity = 1 - u;
        }
      }
      if (p.state === 2 && p.t >= 0.26) p.state = 0;
    }
  }

  return { size, reset, assign, take, update, get width() { return width; }, height: H };
}
