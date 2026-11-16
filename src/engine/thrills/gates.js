// Choice gates: two glowing arches side by side. The player decides by running through one;
// the other one pops. No dialog, no pause: the choice is made with the joystick.
//
//   gates.open({ x, z, ttl, options: [{ color, title, sub, icon, price }, ...], onPick(i, option), onExpire(),
//                canPick(i, option) })      // optional: false = the gate stays shut (a price not met)
//
// One set at a time. The gates stand along the screen's right axis and face the camera.
// ttl <= 0 keeps them until one is taken.
import * as THREE from 'three';
import { fmtMoney } from '../config.js';
import { mergeGroup } from './util.js';

const S2 = Math.SQRT1_2;
const SPACING = 3.3;          // centre to centre
const TRIGGER = 1.2;          // the player within this of a gate's centre takes it
const W = 2.5, H = 2.9;       // panel size
const TEX_W = 256, TEX_H = 296;
const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, "Segoe UI", Arial, sans-serif';

function fit(ctx, text, maxW, size, weight = 700) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 16 && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = `${weight} ${s}px ${FONT}`; }
  return s;
}

function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r;
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

const ICONS = {
  star(ctx, cx, cy) {
    star(ctx, cx, cy, 44);
    ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = '#8a5a00'; ctx.lineJoin = 'round'; ctx.stroke();
  },
  cash(ctx, cx, cy) {
    const w = 96, h = 58;
    ctx.fillStyle = '#2e9e44';
    ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 10); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#17602a'; ctx.stroke();
    ctx.fillStyle = '#5fd06d';
    ctx.beginPath(); ctx.roundRect(cx - w / 2 + 8, cy - h / 2 + 8, w - 16, h - 16, 5); ctx.fill();
    ctx.fillStyle = '#c8f7c9';
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, Math.PI * 2); ctx.fill();
  },
  bolt(ctx, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy - 48); ctx.lineTo(cx - 28, cy + 6); ctx.lineTo(cx - 4, cy + 6);
    ctx.lineTo(cx - 12, cy + 48); ctx.lineTo(cx + 28, cy - 10); ctx.lineTo(cx + 4, cy - 10);
    ctx.closePath();
    ctx.fillStyle = '#ffe14d'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#8a5a00'; ctx.lineJoin = 'round'; ctx.stroke();
  },
  flame(ctx, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 50);
    ctx.bezierCurveTo(cx + 44, cy - 14, cx + 40, cy + 46, cx, cy + 46);
    ctx.bezierCurveTo(cx - 40, cy + 46, cx - 40, cy - 2, cx - 16, cy - 20);
    ctx.bezierCurveTo(cx - 12, cy - 2, cx - 2, cy - 8, cx, cy - 50);
    ctx.closePath();
    ctx.fillStyle = '#ff7a1a'; ctx.fill();
    ctx.lineWidth = 6; ctx.strokeStyle = '#9a2a00'; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy + 20, 15, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe14d'; ctx.fill();
  },
};

function drawLabel(ctx, o) {
  ctx.clearRect(0, 0, TEX_W, TEX_H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const icon = o.icon && ICONS[o.icon];
  const priced = o.price > 0;
  const up = priced ? 26 : 0;                 // a price tag takes the bottom of the label
  let ty = 132 - up;
  if (icon) { icon(ctx, TEX_W / 2, 74 - up * 0.6); ty = 176 - up; }
  const title = String(o.title || '');
  const ts = fit(ctx, title, TEX_W - 28, icon ? 74 : 108);
  ctx.lineWidth = Math.max(10, ts * 0.2);
  ctx.strokeStyle = 'rgba(20, 16, 44, 0.92)';
  ctx.strokeText(title, TEX_W / 2, ty);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, TEX_W / 2, ty);
  const sub = String(o.sub || '');
  if (sub) {
    const lines = sub.split('\n');
    let size = 40;
    for (const l of lines) size = Math.min(size, fit(ctx, l, TEX_W - 20, 40, 700));
    ctx.font = `700 ${size}px ${FONT}`;
    if (priced) size = Math.min(size, 30);
    ctx.font = `700 ${size}px ${FONT}`;
    const y0 = (icon ? 244 : 232) - up * 1.25 - (lines.length - 1) * (size + 2) * 0.5;
    for (let i = 0; i < lines.length; i++) {
      const y = y0 + i * (size + 2);
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(20, 16, 44, 0.9)';
      ctx.strokeText(lines[i], TEX_W / 2, y);
      ctx.fillStyle = '#fff3b0';
      ctx.fillText(lines[i], TEX_W / 2, y);
    }
  }
  if (priced) {
    const text = '$' + fmtMoney(o.price);
    const ps = fit(ctx, text, TEX_W - 70, 46);
    const tw = ctx.measureText(text).width, pw = tw + 44, px = TEX_W / 2 - pw / 2, py = TEX_H - 62;
    ctx.fillStyle = 'rgba(16, 24, 44, 0.9)';
    ctx.beginPath(); ctx.roundRect(px, py, pw, 54, 27); ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffe14d'; ctx.stroke();
    ctx.font = `700 ${ps}px ${FONT}`;
    ctx.fillStyle = '#ffe14d';
    ctx.fillText(text, TEX_W / 2, py + 29);
  }
}

export function createGates(G) {
  const MAX = 2;
  const pool = [];
  const postGeo = new THREE.CylinderGeometry(0.2, 0.24, H + 0.3, 10).translate(0, (H + 0.3) / 2, 0);
  const beamGeo = new THREE.BoxGeometry(W + 0.75, 0.42, 0.46).translate(0, H + 0.36, 0);
  const panelGeo = new THREE.PlaneGeometry(W, H).translate(0, H / 2 + 0.06, 0);
  const ringGeo = new THREE.RingGeometry(1.0, 1.32, 36).rotateX(-Math.PI / 2);

  function make() {
    const group = new THREE.Group();
    group.rotation.y = -Math.PI * 0.75;       // faces the camera
    // posts and beam as one mesh; the gate's colour goes on its material
    const parts = new THREE.Group(), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const postL = new THREE.Mesh(postGeo, white); postL.position.x = -W / 2 - 0.14;
    const postR = new THREE.Mesh(postGeo, white); postR.position.x = W / 2 + 0.14;
    parts.add(postL, postR, new THREE.Mesh(beamGeo, white));
    const frame = mergeGroup(parts);
    const frameMat = frame.material;
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.renderOrder = 6;
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W; canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
    const label = new THREE.Mesh(panelGeo, labelMat);
    label.position.z = 0.05;
    label.renderOrder = 7;
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.07;
    ring.renderOrder = 3;
    group.add(frame, panel, label);
    group.visible = false;
    ring.visible = false;
    G.scene.add(group, ring);
    return { group, ring, ringMat, frameMat, panelMat, labelMat, ctx, tex, x: 0, z: 0, color: 0xffffff, state: 0, t: 0 };
  }
  for (let i = 0; i < MAX; i++) pool.push(make());

  // state: 0 hidden, 1 rising, 2 up, 3 taken (bursting), 4 leaving
  const set = { on: false, n: 0, ttl: 0, age: 0, options: null, onPick: null, onExpire: null, canPick: null, x: 0, z: 0, picked: -1, s: 1 };
  const P = { x: 0, y: 0, z: 0 };
  const tmpColor = new THREE.Color();

  function open(o) {
    close();
    const opts = o.options || [];
    set.on = true; set.n = Math.min(MAX, opts.length); set.ttl = o.ttl || 0; set.age = 0;
    set.options = opts; set.onPick = o.onPick || null; set.onExpire = o.onExpire || null; set.canPick = o.canPick || null;
    set.x = o.x; set.z = o.z; set.picked = -1;
    const S = (set.s = o.scale > 0 ? o.scale : 1);     // a closer camera gets smaller gates
    for (let i = 0; i < set.n; i++) {
      const g = pool[i], op = opts[i];
      const k = i - (set.n - 1) / 2;
      // along screen-right = world (-x, +z) / sqrt2
      g.x = o.x - k * SPACING * S * S2; g.z = o.z + k * SPACING * S * S2;
      g.color = op.color ?? 0x2e9bff;
      g.frameMat.color.setHex(g.color);
      g.frameMat.emissive.copy(tmpColor.setHex(g.color)).multiplyScalar(0.35);
      g.panelMat.color.setHex(g.color);
      g.ringMat.color.setHex(g.color);
      drawLabel(g.ctx, op);
      g.tex.needsUpdate = true;
      g.group.position.set(g.x, 0, g.z);
      g.group.scale.set(S, 0.001, S);
      g.group.visible = true;
      g.ring.position.set(g.x, 0.07, g.z);
      g.ring.visible = true;
      g.labelMat.opacity = 1; g.panelMat.opacity = 0.5;
      g.state = 1; g.t = -i * 0.12;
    }
  }

  function hide(g) { g.group.visible = false; g.ring.visible = false; g.state = 0; }
  function close() {
    for (let i = 0; i < MAX; i++) hide(pool[i]);
    set.on = false; set.options = null; set.onPick = null; set.onExpire = null; set.canPick = null;
  }

  function pick(i) {
    if (!set.on || set.picked >= 0 || i < 0 || i >= set.n) return;
    set.picked = i;
    const g = pool[i];
    g.state = 3; g.t = 0;
    for (let k = 0; k < set.n; k++) if (k !== i) { pool[k].state = 4; pool[k].t = 0; }
    P.x = g.x; P.y = 1.2; P.z = g.z;
    if (G.fx) {
      G.fx.confetti(P, 46);
      G.fx.ring(P, { color: g.color, radius: 3.2, life: 0.55 });
      SPARK.color = g.color;
      G.fx.burst(P, SPARK);
    }
    const fn = set.onPick, op = set.options[i];
    if (fn) { try { fn(i, op); } catch (err) { console.error('[thrills] gate pick failed:', err); } }
  }
  const SPARK = { color: 0xffffff, count: 22, speed: 5.5, size: 0.16, life: 0.6, gravity: 9, up: 4 };

  function update(dt) {
    if (!set.on) return;
    set.age += dt;
    const S = set.s;
    const pl = G.player;
    let alive = false;
    const blink = set.ttl > 0 && set.ttl - set.age < 4 && set.picked < 0 ? 0.55 + 0.45 * Math.sin(set.age * 14) : 1;
    for (let i = 0; i < set.n; i++) {
      const g = pool[i];
      if (g.state === 0) continue;
      alive = true;
      g.t += dt;
      if (g.state === 1) {
        const u = Math.max(0, Math.min(1, g.t / 0.45));
        const e = u >= 1 ? 1 : 1 + 2.4 * Math.pow(u - 1, 3) + 1.4 * Math.pow(u - 1, 2);   // back-out
        g.group.scale.set(S, Math.max(0.001, e * S), S);
        if (u >= 1) { g.state = 2; g.t = 0; }
      } else if (g.state === 2) {
        const s = S * (1 + 0.03 * Math.sin(set.age * 5 + i * 2));
        g.group.scale.set(s, s, S);
        g.labelMat.opacity = blink; g.panelMat.opacity = 0.5 * blink;
        const k = (set.age * 1.2 + i * 0.5) % 1;
        g.ring.scale.setScalar(S * (0.85 + k * 0.6));
        g.ringMat.opacity = 0.75 * (1 - k);
        if (pl && set.picked < 0) {
          const dx = pl.pos.x - g.x, dz = pl.pos.z - g.z;
          const tr = Math.max(0.85, TRIGGER * S);
          if (dx * dx + dz * dz < tr * tr && (!set.canPick || set.canPick(i, set.options[i]))) pick(i);
        }
      } else if (g.state === 3) {
        const u = g.t / 0.28;
        if (u >= 1) hide(g);
        else { const s = S * (1 + u * 0.7); g.group.scale.set(s, Math.max(0.001, S * (1 - u)), s); g.panelMat.opacity = 0.5 * (1 - u); g.labelMat.opacity = 1 - u; g.ringMat.opacity = 0; }
      } else if (g.state === 4) {
        const u = g.t / 0.35;
        if (u >= 1) hide(g);
        else { g.group.scale.set(S, Math.max(0.001, S * (1 - u)), S); g.labelMat.opacity = 1 - u; g.panelMat.opacity = 0.5 * (1 - u); g.ringMat.opacity = 0; }
      }
    }
    if (set.picked < 0 && set.ttl > 0 && set.age >= set.ttl) {
      const fn = set.onExpire;
      set.picked = -2;
      for (let i = 0; i < set.n; i++) if (pool[i].state) { pool[i].state = 4; pool[i].t = 0; }
      if (fn) { try { fn(); } catch (err) { console.error('[thrills] gate expire failed:', err); } }
      return;
    }
    if (!alive) close();
  }

  return {
    open, close, update, pick,
    /** true while a set is up and nothing has been taken yet */
    get waiting() { return set.on && set.picked === -1; },
    get active() { return set.on; },
    get x() { return set.x; }, get z() { return set.z; },
    get count() { return set.n; },
    /** centre of gate i */
    at(i, out) { const g = pool[i]; out.x = g.x; out.z = g.z; return out; },
    option(i) { return set.options ? set.options[i] : null; },
  };
}
