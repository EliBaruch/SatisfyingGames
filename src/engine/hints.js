// Goal hints: the HUD goal line plus a bouncing arrow, a pulsing ground ring and a
// pointer at the player's feet. The goal is derived from station capabilities only:
//   1. carrying enough of something a drop zone accepts  -> that drop zone
//   2. a pad is affordable                                -> that pad
//   2b. a station raises an alert (foes at the wall)    -> go there
//   3. shoppers waiting at an unstaffed checkout (serve) -> its serve zone
//   4. enough cash waiting on a pile                      -> that pile
//   5. a drop zone with a high `need` (empty trough/shelf) -> it, or a pickup that supplies it
//   6. otherwise                                          -> the newest harvest / non-empty pickup station
// After the win, a visible free pad (the travel gate) is the goal.
// Texts: station def `hint` wins; else world.hints[drop|buy|cash|harvest|pickup|travel]
// with {name} (station name) and {label} (pad label) substituted; else engine defaults.
import * as THREE from 'three';
import { HINTS, PAD } from './config.js';
import { getItem } from './registry.js';

export function createHints(G) {
  const scene = G.scene;
  const texts = { ...HINTS, travel: 'Next world!', serve: 'Serve the shoppers!', ...(G.world.hints || {}) };
  const stations = G.stations.list;

  // ---------------------------------------------------------------- visuals
  const arrow = new THREE.Group();
  {
    const mat = new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x6b4a00 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.95, 4), mat);
    cone.rotation.x = Math.PI;
    cone.rotation.y = Math.PI / 4;
    cone.position.y = 0.48;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.42), mat);
    shaft.position.y = 1.3;
    shaft.rotation.y = Math.PI / 4;
    cone.castShadow = shaft.castShadow = true;
    arrow.add(cone, shaft);
    arrow.visible = false;
    scene.add(arrow);
  }
  // pulsing ground ring that marks exactly where the arrow points
  const arrowRing = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 1.0, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  arrowRing.rotation.x = -Math.PI / 2;
  arrowRing.visible = false;
  arrowRing.renderOrder = 3;
  scene.add(arrowRing);
  const pointer = new THREE.Group();
  {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.55);
    shape.lineTo(0.42, -0.1);
    shape.lineTo(0.16, -0.02);
    shape.lineTo(0, -0.28);
    shape.lineTo(-0.16, -0.02);
    shape.lineTo(-0.42, -0.1);
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2); // shape +y -> world -z
    geo.rotateY(Math.PI);      // tip -> world +z
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }));
    m.renderOrder = 4;
    pointer.add(m);
    pointer.visible = false;
    scene.add(pointer);
  }

  const hint = { text: '', has: false, x: 0, z: 0, nearR: 2, t: 0, kind: '', target: null };
  function setHint(kind, text, x, z, nearR, target) {
    hint.kind = kind; hint.text = text; hint.has = true; hint.x = x; hint.z = z; hint.nearR = nearR; hint.target = target || null;
  }
  function clear() { hint.has = false; hint.text = ''; hint.kind = ''; hint.target = null; }

  function fmt(key, st, pad) {
    const per = st && st.def.hints;   // per-capability station texts: { drop, pickup, serve, harvest }
    let t = per && per[key] ? per[key] : (st && st.def.hint && key !== 'cash') ? st.def.hint : texts[key] || '';
    if (st) {
      const it = st.harvest ? getItem(st.harvest.kind) : null;
      t = t.replace('{name}', it && key === 'harvest' ? it.name.toLowerCase() : st.name);
    }
    if (pad) t = t.replace('{label}', pad.label);
    return t;
  }

  const inBox = (p, b, m) => p.x > b.minX - m && p.x < b.maxX + m && p.z > b.minZ - m && p.z < b.maxZ + m;

  function compute() {
    const pl = G.player;
    const pads = G.pads;
    if (!pl) { clear(); return; }
    if (G.stats.won || G.state.won) {
      // the only goal left: a free pad such as the travel gate
      const vis = pads && pads.visible ? pads.visible() : [];
      let gate = null;
      for (let i = 0; i < vis.length; i++) if (vis[i].cost <= 0) { gate = vis[i]; break; }
      if (gate) setHint('travel', fmt('travel', null, gate), gate.pos.x, gate.pos.z, PAD.radius, gate);
      else clear();
      return;
    }
    const st = pl.stack;
    const carried = st.count + st.incoming;
    const cap = st.capacity;
    const nextPad = pads && pads.next ? pads.next() : null;
    const money = G.state.money;

    // is the harvest area the player works nearly empty?
    let low = false;
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      if (!s.active || !s.harvest) continue;
      if (inBox(pl.pos, s.harvest.bounds, 4) && s.harvest.available < s.harvest.total * 0.15) low = true;
    }
    if (carried > 0 && (carried >= cap * 0.6 || low || st.room <= 0)) {
      // the drop zone that takes the topmost item, else the nearest that takes anything carried
      let target = null;
      const top = st.items.length ? st.items[st.items.length - 1] : null;
      let bd = Infinity;
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        if (!s.active || !s.drop || !st.has(s.drop.accepts) || s.drop.room() <= 0) continue;
        const d = Math.hypot(s.drop.zone.x - pl.pos.x, s.drop.zone.z - pl.pos.z) - (top && s.drop.accepts(top) ? 1000 : 0);
        if (d < bd) { bd = d; target = s; }
      }
      if (target) {
        const z = target.drop.zone;
        setHint('drop', fmt('drop', target), z.x, z.z, z.r, target);
        return;
      }
    }
    if (nextPad && money >= pads.remaining(nextPad)) {
      setHint('buy', fmt('buy', null, nextPad), nextPad.pos.x, nextPad.pos.z, PAD.radius, nextPad);
      return;
    }
    // foes at the gates (a 'horde' station's alert): go and fight
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const al = s.alert;
      if (!s.active || !al || !al.active) continue;
      setHint('alert', al.text || fmt('harvest', s), al.x, al.z, al.r || 2.5, s);
      return;
    }
    // shoppers waiting at a checkout nobody serves
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const sv = s.serve;
      if (!s.active || !sv || sv.staffed || sv.waiting < (sv.hintAt || 2)) continue;
      setHint('serve', fmt('serve', s), sv.zone.x, sv.zone.z, sv.zone.r, s);
      return;
    }
    let best = null, bestCash = 0;
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      if (!s.active || !s.cash) continue;
      if (s.cash.amount > bestCash) { bestCash = s.cash.amount; best = s; }
    }
    const need = nextPad ? pads.remaining(nextPad) - money : Infinity;
    if (best && (bestCash >= 20 || bestCash >= need * 0.25)) {
      const p = best.cash.pile;
      setHint('cash', fmt('cash', best), p.x, p.z, p.r + 0.6, best);
      return;
    }
    // a drop zone that badly needs items (an empty trough or shelf): bring them, or fetch them
    let needy = null, bestNeed = 0;
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      if (!s.active || !s.drop || s.drop.need === undefined) continue;
      const n = s.drop.need;
      if (n >= (s.drop.urgent || 0.75) && n > bestNeed && s.drop.room() > 0) { bestNeed = n; needy = s; }
    }
    if (needy) {
      if (st.has(needy.drop.accepts)) {
        const z = needy.drop.zone;
        setHint('drop', fmt('drop', needy), z.x, z.z, z.r, needy);
        return;
      }
      for (let i = 0; i < stations.length; i++) {
        const s = stations[i];
        const pk = s.pickup;
        if (!s.active || !pk || !(pk.available > 0) || (pk.has && !pk.has(needy.drop.accepts))) continue;
        setHint('pickup', fmt('pickup', s), pk.zone.x, pk.zone.z, pk.zone.r, s);
        return;
      }
    }
    // newest harvest / pickup station
    const order = G.stations.activationOrder;
    for (let i = order.length - 1; i >= 0; i--) {
      const s = G.stations.get(order[i]);
      if (!s || (!s.harvest && !s.pickup)) continue;
      if (!s.harvest && (s.pickup.idleHint === false || !(s.pickup.available > 0))) continue;
      if (s.harvest) {
        const b = s.harvest.bounds;
        setHint('harvest', fmt('harvest', s), (b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2 + 1, s);
        if (inBox(pl.pos, b, 1)) hint.nearR = 1e9;   // inside the area: no arrow needed
      } else {
        const z = s.pickup.zone;
        setHint('pickup', fmt('pickup', s), z.x, z.z, z.r, s);
      }
      return;
    }
    clear();
  }

  function updateVisuals(realDt) {
    hint.t += realDt;
    const pl = G.player;
    if (!hint.has || !pl) { arrow.visible = false; arrowRing.visible = false; pointer.visible = false; return; }
    const dx = hint.x - pl.pos.x, dz = hint.z - pl.pos.z;
    const d = Math.hypot(dx, dz);
    const near = d < hint.nearR;
    arrow.visible = !near;
    if (arrow.visible) {
      const bob = Math.abs(Math.sin(hint.t * 4.2));
      arrow.position.set(hint.x, 1.25 + bob * 0.7, hint.z);
      arrow.rotation.y = hint.t * 1.6;
      const sq = 1 + (1 - bob) * 0.12;
      arrow.scale.set(sq, 2 - sq, sq);
    }
    arrowRing.visible = arrow.visible;
    if (arrowRing.visible) {
      const k = (hint.t * 1.4) % 1;
      const rs = 0.75 + k * 0.9;
      arrowRing.position.set(hint.x, 0.06, hint.z);
      arrowRing.scale.set(rs, rs, 1);
      arrowRing.material.opacity = 0.85 * (1 - k);
    }
    pointer.visible = !near && d > 7;
    if (pointer.visible) {
      const ux = dx / d, uz = dz / d;
      const r = 1.9 + Math.sin(hint.t * 6) * 0.15;
      pointer.position.set(pl.pos.x + ux * r, 0.09, pl.pos.z + uz * r);
      pointer.rotation.y = Math.atan2(ux, uz);
    }
  }

  let hintT = 0;
  // a purchase changes the goal at once (the bought pad's "Buy: X" must not linger)
  G.events.on('unlock', () => {
    hintT = 0.25;
    try { compute(); } catch (err) { console.error('[hints] failed:', err); }
    if (G.hud) G.hud.setGoal(hint.text);
  });
  return {
    /** current goal: { kind, text, has, x, z, target } (read-only) */
    current: hint,
    compute,
    /** called once per rendered frame with the real frame time */
    frame(realDt) {
      hintT -= realDt;
      if (hintT <= 0) {
        hintT = 0.25;
        try { compute(); } catch (err) { console.error('[hints] failed:', err); }
        if (G.hud) G.hud.setGoal(hint.text);
      }
      updateVisuals(realDt);
    },
  };
}
