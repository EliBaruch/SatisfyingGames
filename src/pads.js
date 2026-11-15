// Bloom Rush — purchase pads: ground decals with label, price and fill; standing on one pays into it.
import * as THREE from 'three';
import { PADS, PAD, computeStats, fmtMoney } from './config.js';

const TEX = 256;
const STAND_DELAY = 0.15;
const SLOW = 0.35;
const BILL_RATE = 12;
const REDRAW_MIN = 0.1;
const FILL_INSET = 0.13;   // fraction of the pad size kept free around the fill

let fillGeo = null;
let planeGeo = null;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const FONT = '"Arial Rounded MT Bold", "Nunito", "Baloo 2", "Varela Round", system-ui, "Segoe UI", Arial, sans-serif';

function fitFont(ctx, text, maxW, size, weight = 900) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (s > 14 && ctx.measureText(text).width > maxW) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

function splitLabel(label) {
  const words = label.split(' ');
  if (words.length <= 1 || label.length <= 9) return [label];
  // split into two lines as evenly as possible
  let best = [label], bestD = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const d = Math.max(a.length, b.length);
    if (d < bestD) { bestD = d; best = [a, b]; }
  }
  return best;
}

// Static part shared by every pad: translucent dark body + dashed white border.
let bgTex = null;
function getBgTexture() {
  if (bgTex) return bgTex;
  const W = TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const ctx = cv.getContext('2d');
  roundRect(ctx, 10, 10, W - 20, W - 20, 30);
  ctx.fillStyle = 'rgba(24, 30, 46, 0.55)';
  ctx.fill();
  ctx.setLineDash([22, 13]);
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#ffffff';
  roundRect(ctx, 12, 12, W - 24, W - 24, 28);
  ctx.stroke();
  bgTex = new THREE.CanvasTexture(cv);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  bgTex.anisotropy = 4;
  return bgTex;
}

// Per-pad part (drawn above the fill): label, banknote icon, remaining price.
function drawPad(ctx, pad, remaining) {
  const W = TEX;
  ctx.clearRect(0, 0, W, W);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // label
  const lines = splitLabel(pad.label);
  const maxW = W - 52;
  let size = 46;
  for (const l of lines) size = Math.min(size, fitFont(ctx, l, maxW, 46));
  ctx.font = `900 ${size}px ${FONT}`;
  const ly = lines.length === 1 ? 82 : 64;
  for (let i = 0; i < lines.length; i++) {
    const y = ly + i * (size + 4);
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(20, 24, 40, 0.75)';
    ctx.strokeText(lines[i], W / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], W / 2, y);
  }
  // price row: banknote icon + amount
  const price = fmtMoney(remaining);
  const ps = fitFont(ctx, price, 140, 62);
  ctx.font = `900 ${ps}px ${FONT}`;
  const tw = ctx.measureText(price).width;
  const iw = 54, ih = 34, gap = 10;
  const total = iw + gap + tw;
  const x0 = W / 2 - total / 2;
  const py = 180;
  // banknote
  roundRect(ctx, x0, py - ih / 2, iw, ih, 6);
  ctx.fillStyle = '#2e9e44';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#17602a';
  ctx.stroke();
  roundRect(ctx, x0 + 5, py - ih / 2 + 5, iw - 10, ih - 10, 3);
  ctx.fillStyle = '#5fd06d';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x0 + iw / 2, py, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#c8f7c9';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#2e9e44';
  ctx.stroke();
  // amount
  ctx.textAlign = 'left';
  ctx.lineWidth = 9;
  ctx.strokeStyle = 'rgba(20, 24, 40, 0.8)';
  ctx.strokeText(price, x0 + iw + gap, py + 3);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(price, x0 + iw + gap, py + 3);
}

export function createPads(G) {
  const S = G.state;
  const byId = new Map();
  const visibleList = [];
  const views = new Map(); // id -> view
  const viewList = [];      // same views, iterated without allocating

  if (!planeGeo) {
    planeGeo = new THREE.PlaneGeometry(PAD.size, PAD.size);
    planeGeo.rotateX(-Math.PI / 2);
    // fill: a plane whose bottom edge (screen-down side) sits at local z = 0 and grows toward -z (texture up)
    const fs = PAD.size * (1 - FILL_INSET * 2);
    fillGeo = new THREE.PlaneGeometry(fs, 1);
    fillGeo.translate(0, 0.5, 0);
    fillGeo.rotateX(-Math.PI / 2);
  }
  for (const p of PADS) byId.set(p.id, p);
  const bgMat = new THREE.MeshBasicMaterial({ map: getBgTexture(), transparent: true, depthWrite: false });

  const isVisible = (p) => !S.done[p.id] && p.requires.every((r) => S.done[r]);

  function makeView(pad, live) {
    const group = new THREE.Group();
    group.position.set(pad.pos.x, 0, pad.pos.z);
    // texture "up" (-z after rotateX) must point to world (+x,+z): yaw -3π/4
    group.rotation.y = -Math.PI * 3 / 4;

    const bg = new THREE.Mesh(planeGeo, bgMat);
    bg.position.y = 0.035;
    bg.renderOrder = 2;
    group.add(bg);

    const fillMat = new THREE.MeshBasicMaterial({ color: 0x49e86a, transparent: true, opacity: 0.92, depthWrite: false });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.set(0, 0.04, PAD.size / 2 - PAD.size * FILL_INSET);
    fill.scale.z = 0.0001;
    fill.renderOrder = 3;
    group.add(fill);

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEX;
    const ctx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const decal = new THREE.Mesh(planeGeo, mat);
    decal.position.y = 0.045;
    decal.renderOrder = 4;
    group.add(decal);

    G.scene.add(group);
    const v = {
      pad, group, fill, fillMat, decal, mat, tex, canvas, ctx,
      shown: '', redrawT: 0, removing: -1, stand: 0, acc: 0, billT: 0, pulse: 0,
    };
    redraw(v, true);
    if (live && G.fx && G.fx.ring) G.fx.ring({ x: pad.pos.x, y: 0, z: pad.pos.z }, { color: 0xffffff, radius: 2.4, life: 0.6 });
    views.set(pad.id, v);
    viewList.push(v);
    return v;
  }

  function remainingOf(pad) { return Math.max(0, pad.cost - (S.paid[pad.id] || 0)); }

  function redraw(v, force) {
    const rem = remainingOf(v.pad);
    const txt = fmtMoney(rem);
    if (!force && txt === v.shown) return;
    if (!force && v.redrawT > 0) return;
    v.shown = txt;
    v.redrawT = REDRAW_MIN;
    drawPad(v.ctx, v.pad, rem);
    v.tex.needsUpdate = true;
  }

  function disposeView(v) {
    G.scene.remove(v.group);
    v.tex.dispose();
    v.mat.dispose();
    v.fillMat.dispose();
    views.delete(v.pad.id);
    const i = viewList.indexOf(v);
    if (i >= 0) viewList.splice(i, 1);
  }

  function refresh(live) {
    visibleList.length = 0;
    let k = 0;
    for (const p of PADS) {
      if (!isVisible(p)) continue;
      visibleList.push(p);
      if (!views.has(p.id)) {
        const v = makeView(p, live);
        if (live && G.fx && G.fx.popIn) G.fx.popIn(v.group, { dur: 0.55, delay: 0.25 + k * 0.15 });
        k++;
      }
    }
  }
  refresh(false);

  function next() {
    let best = null;
    for (let i = 0; i < visibleList.length; i++) {
      const p = visibleList[i];
      if (!best || p.cost < best.cost) best = p;
    }
    return best;
  }

  const billFrom = new THREE.Vector3();
  const billOpts = { kind: 'bill', from: billFrom, to: null, dur: 0.3, arc: 1.3 };
  const padTargets = new Map();
  function padTarget(p) {
    let t = padTargets.get(p.id);
    if (!t) { t = { x: p.pos.x, y: 0.1, z: p.pos.z }; padTargets.set(p.id, t); }
    return t;
  }

  function complete(v) {
    const pad = v.pad;
    S.done[pad.id] = true;
    delete S.paid[pad.id];
    G.stats = computeStats(S.done);
    v.removing = 0;
    v.fill.scale.z = PAD.size * (1 - FILL_INSET * 2);
    refresh(true);
    G.events.emit('unlock', { pad, effect: pad.effect });
    if (pad.effect && pad.effect.type === 'win') G.events.emit('win', {});
  }

  function update(dt) {
    const pl = G.player;
    const money = S.money;
    for (let vi = viewList.length - 1; vi >= 0; vi--) {
      const v = viewList[vi];
      v.redrawT -= dt;
      const pad = v.pad;
      if (v.removing >= 0) {
        v.removing += dt;
        const u = v.removing / 0.3;
        if (u >= 1) { disposeView(v); continue; }
        const s = u < 0.35 ? 1 + 0.25 * (u / 0.35) : 1.25 * (1 - (u - 0.35) / 0.65);
        v.group.scale.setScalar(Math.max(0.001, s));
        continue;
      }
      const paid = S.paid[pad.id] || 0;
      const rem = pad.cost - paid;
      // paying
      let paying = false;
      if (pl) {
        const dx = pl.pos.x - pad.pos.x, dz = pl.pos.z - pad.pos.z;
        const inside = dx * dx + dz * dz <= PAD.radius * PAD.radius;
        if (inside && pl.speed01 < SLOW) v.stand += dt; else if (!inside) v.stand = 0;
        if (inside && v.stand >= STAND_DELAY && money > 0 && rem > 0) paying = true;
      }
      if (paying) {
        const rate = Math.max(pad.cost / PAD.payTime, 40);
        v.acc += rate * dt;
        let amt = Math.floor(v.acc);
        if (amt > rem) amt = rem;
        if (amt > S.money) amt = Math.floor(S.money);
        if (amt >= 1) {
          v.acc -= amt;
          if (v.acc > 1) v.acc = 1;
          G.spend(amt);
          S.paid[pad.id] = paid + amt;
        }
        v.billT += dt;
        if (v.billT >= 1 / BILL_RATE) {
          v.billT = 0;
          billFrom.set(pl.pos.x, 1.3, pl.pos.z);
          billOpts.to = padTarget(pad);
          billOpts.dur = 0.24 + Math.random() * 0.08;
          if (G.fx && G.fx.fly) G.fx.fly(billOpts);
          if (G.audio && G.audio.play) G.audio.play('pay');
        }
        if (S.paid[pad.id] >= pad.cost) { complete(v); continue; }
      } else {
        v.acc = 0;
        v.billT = 1 / BILL_RATE;
      }
      // fill + label
      const frac = Math.min(1, (S.paid[pad.id] || 0) / pad.cost);
      const fullH = PAD.size * (1 - FILL_INSET * 2);
      const target = Math.max(0.0001, frac * fullH);
      v.fill.scale.z += (target - v.fill.scale.z) * Math.min(1, dt * 14);
      redraw(v, false);
      // gentle pulse when affordable
      if (!v.group.userData.fxTween) {
        const afford = S.money >= rem && rem > 0;
        v.pulse = afford ? v.pulse + dt : 0;
        const s = afford ? 1 + 0.045 * Math.sin(v.pulse * 6.5) : 1;
        v.group.scale.setScalar(s);
      }
    }
  }

  return {
    update,
    next,
    visible() { return visibleList; },
    views,
  };
}
