// Purchase pads: ground decals with label, price and fill; standing on one pays into it.
// Pads come from world.pads; what a bought pad does is its effect's registered handler
// (engine/pad-effects.js). Pads become visible when every pad in `requires` is done.
import * as THREE from 'three';
import { PAD, fmtMoney } from './config.js';
import { getPadEffect } from './registry.js';

const TEX = 256;
const STAND_DELAY = 0.15;
const SLOW = 0.35;
const BILL_RATE = 12;
const REDRAW_MIN = 0.1;
const FILL_INSET = 0.13;   // fraction of the pad size kept free around the fill

let fillGeo = null;
let lineGeo = null;
let lineMat = null;
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

// Static part shared by every pad: soft dark translucent rounded body, glowing cyan-white dashed outline.
let bgTex = null;
function getBgTexture() {
  if (bgTex) return bgTex;
  const W = TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = W;
  const ctx = cv.getContext('2d');
  roundRect(ctx, 14, 14, W - 28, W - 28, 44);
  const g = ctx.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, 'rgba(20, 34, 58, 0.50)');
  g.addColorStop(1, 'rgba(12, 22, 42, 0.66)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([26, 17]);
  ctx.shadowColor = '#5fe6ff';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  roundRect(ctx, 20, 20, W - 40, W - 40, 38);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#6fe9ff';
  ctx.stroke();
  ctx.restore();
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
  let size = 54;
  for (const l of lines) size = Math.min(size, fitFont(ctx, l, maxW, 54));
  ctx.font = `900 ${size}px ${FONT}`;
  const ly = lines.length === 1 ? 78 : 62;
  for (let i = 0; i < lines.length; i++) {
    const y = ly + i * (size + 4);
    ctx.lineWidth = 11;
    ctx.strokeStyle = 'rgba(14, 22, 44, 0.9)';
    ctx.strokeText(lines[i], W / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lines[i], W / 2, y);
  }
  // price row: banknote icon + amount ("GO" for free pads such as travel gates)
  if (pad.cost <= 0) {
    const go = pad.priceText || 'GO';
    const gs = fitFont(ctx, go, 170, 70);
    ctx.font = `900 ${gs}px ${FONT}`;
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(20, 24, 40, 0.8)';
    ctx.strokeText(go, W / 2, 182);
    ctx.fillStyle = '#8dff9a';
    ctx.fillText(go, W / 2, 182);
    return;
  }
  const price = fmtMoney(remaining);
  const ps = fitFont(ctx, price, 140, 62);
  ctx.font = `900 ${ps}px ${FONT}`;
  const tw = ctx.measureText(price).width;
  const iw = 62, ih = 40, gap = 10;
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
  ctx.lineWidth = 11;
  ctx.strokeStyle = 'rgba(14, 22, 44, 0.9)';
  ctx.strokeText(price, x0 + iw + gap, py + 3);
  ctx.fillStyle = '#ffe14d';
  ctx.fillText(price, x0 + iw + gap, py + 3);
}

export function createPads(G) {
  const S = G.state;
  const PADS = G.world.pads || [];
  const byId = new Map();
  const visibleList = [];
  const views = new Map(); // id -> view
  const viewList = [];      // same views, iterated without allocating
  const doneHooks = new Map(); // padId -> [fn(live)]

  if (!planeGeo) {
    planeGeo = new THREE.PlaneGeometry(PAD.size, PAD.size);
    planeGeo.rotateX(-Math.PI / 2);
    // fill: a plane whose bottom edge (screen-down side) sits at local z = 0 and grows toward -z (texture up)
    const fs = PAD.size * (1 - FILL_INSET * 2);
    fillGeo = new THREE.PlaneGeometry(fs, 1);
    fillGeo.translate(0, 0.5, 0);
    fillGeo.rotateX(-Math.PI / 2);
    lineGeo = new THREE.PlaneGeometry(fs, 0.07);
    lineGeo.rotateX(-Math.PI / 2);
    lineMat = new THREE.MeshBasicMaterial({ color: 0xd8ffe6, transparent: true, opacity: 0.95, depthWrite: false });
  }
  for (const p of PADS) byId.set(p.id, p);
  const bgMat = new THREE.MeshBasicMaterial({ map: getBgTexture(), transparent: true, depthWrite: false });

  const isVisible = (p) => !S.done[p.id] && p.requires.every((r) => S.done[r]);

  function makeView(pad, live) {
    const group = new THREE.Group();
    // lifted a little so pads read on top of paving / ground decals (up to ~6 cm high)
    group.position.set(pad.pos.x, PAD.lift, pad.pos.z);
    // texture "up" (-z after rotateX) must point to world (+x,+z): yaw -3pi/4
    group.rotation.y = -Math.PI * 3 / 4;

    const bg = new THREE.Mesh(planeGeo, bgMat);
    bg.position.y = 0.035;
    bg.renderOrder = 2;
    group.add(bg);

    const fillMat = new THREE.MeshBasicMaterial({ color: 0x4fe88a, transparent: true, opacity: 0.55, depthWrite: false });
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.position.set(0, 0.04, PAD.size / 2 - PAD.size * FILL_INSET);
    fill.scale.z = 0.0001;
    fill.renderOrder = 3;
    group.add(fill);
    // bright waterline riding on the top edge of the fill
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.set(0, 0.042, PAD.size / 2 - PAD.size * FILL_INSET);
    line.renderOrder = 3;
    line.visible = false;
    group.add(line);

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
      pad, group, fill, line, fillMat, decal, mat, tex, canvas, ctx,
      shown: '', rem: -1, redrawT: 0, removing: -1, stand: 0, acc: 0, billT: 0, pulse: 0,
      // a pad that appears under the player (or a free pad) only triggers after the
      // player has stepped off it once: nothing is ever bought by accident
      armed: !(live || pad.cost <= 0),
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
    if (!force && rem === v.rem) return;           // nothing changed: no string work this step
    const txt = fmtMoney(rem);
    if (!force && txt === v.shown) return;
    if (!force && v.redrawT > 0) return;
    v.shown = txt;
    v.rem = rem;
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
        if (live && G.fx && G.fx.popIn) { const o = G.fx.owner; G.fx.owner = 'pads'; G.fx.popIn(v.group, { dur: 0.55, delay: 0.25 + k * 0.15 }); G.fx.owner = o; }
        k++;
      }
    }
  }
  refresh(false);

  /** The cheapest visible pad that costs money (null if none). */
  function next() {
    let best = null;
    for (let i = 0; i < visibleList.length; i++) {
      const p = visibleList[i];
      if (p.cost <= 0) continue;
      if (!best || p.cost < best.cost) best = p;
    }
    return best;
  }

  const billFrom = new THREE.Vector3();
  const billOpts = { kind: 'cash', from: billFrom, to: null, dur: 0.3, arc: 1.3 };
  const padTargets = new Map();
  function padTarget(p) {
    let t = padTargets.get(p.id);
    if (!t) { t = { x: p.pos.x, y: 0.1, z: p.pos.z }; padTargets.set(p.id, t); }
    return t;
  }

  function complete(v) {
    const pad = v.pad;
    const h = pad.effect && getPadEffect(pad.effect.type);
    if (h && h.repeatable) {
      // e.g. a travel gate: never marked done, stays in place, re-arms when stepped off
      v.armed = false;
      v.stand = 0;
      G.events.emit('unlock', { pad, effect: pad.effect, repeat: true });
      if (h.apply) h.apply(G, pad.effect, pad);
      return;
    }
    S.done[pad.id] = true;
    delete S.paid[pad.id];
    v.removing = 0;
    v.fill.scale.z = PAD.size * (1 - FILL_INSET * 2);
    // a pad with `reveal` gets a short cinematic: everything it brings in is collected here and
    // shown when the camera gets there (engine/reveal.js)
    const cine = !!(pad.reveal && G.reveal && G.reveal.begin(pad));
    if (G.refresh) G.refresh(true);              // stats + stations + workers + player
    refresh(true);
    G.events.emit('unlock', { pad, effect: pad.effect, reveal: cine });
    const hooks = doneHooks.get(pad.id);
    if (hooks) for (const fn of hooks) { try { fn(true); } catch (err) { console.error(err); } }
    if (h && h.apply) h.apply(G, pad.effect, pad);
    if (cine) G.reveal.start(pad);
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
        if (!inside) v.armed = true;
        if (inside && v.armed && pl.speed01 < SLOW) v.stand += dt; else if (!inside) v.stand = 0;
        if (inside && v.armed && v.stand >= STAND_DELAY) {
          if (rem <= 0) { complete(v); if (v.removing >= 0) continue; }    // free pad
          if (money > 0) paying = true;
        }
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
      const frac = pad.cost > 0 ? Math.min(1, (S.paid[pad.id] || 0) / pad.cost) : 0;
      const fullH = PAD.size * (1 - FILL_INSET * 2);
      const target = Math.max(0.0001, frac * fullH);
      v.fill.scale.z += (target - v.fill.scale.z) * Math.min(1, dt * 14);
      v.line.visible = v.fill.scale.z > 0.02;
      v.line.position.z = PAD.size / 2 - PAD.size * FILL_INSET - v.fill.scale.z;
      redraw(v, false);
      // gentle pulse when affordable (always for free pads)
      if (!v.group.userData.fxTween) {
        const afford = (S.money >= rem && rem > 0) || pad.cost <= 0;
        v.pulse = afford ? v.pulse + dt : 0;
        const s = afford ? 1 + 0.045 * Math.sin(v.pulse * 6.5) : 1;
        v.group.scale.setScalar(s);
      }
    }
  }

  /**
   * Run fn(live) when pad `id` is bought: at once with live=false if it already is,
   * else later with live=true. Use it in scene.js to build things a pad unlocks.
   */
  function onDone(id, fn) {
    if (S.done[id]) { fn(false); return; }
    if (!doneHooks.has(id)) doneHooks.set(id, []);
    doneHooks.get(id).push(fn);
  }

  return {
    update,
    next,
    onDone,
    get(id) { return byId.get(id) || null; },
    remaining: remainingOf,
    visible() { return visibleList; },
    views,
  };
}
