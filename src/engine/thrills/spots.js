// Where a thrill may appear: a free spot near the player, on screen, that the player can
// walk to in a straight line. Uses only station capabilities, pads and the world bounds.
const S2 = Math.SQRT1_2;

export function createSpots(G) {
  const stations = G.stations.list;

  /** Is (x, z) inside a solid blocker (grown by m)? */
  function blocked(x, z, m) {
    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      if (!st.active || !st.blockers) continue;
      const bl = st.blockers;
      for (let b = 0; b < bl.length; b++) {
        const o = bl[b];
        const dx = x - o.x, dz = z - o.z;
        if (o.r !== undefined) { const r = o.r + m; if (dx * dx + dz * dz < r * r) return true; }
        else if (Math.abs(dx) < o.hx + m && Math.abs(dz) < o.hz + m) return true;
      }
    }
    return false;
  }

  function inBounds(x, z, m) {
    const b = G.world.bounds;
    return !b || (x > b.minX + m && x < b.maxX - m && z > b.minZ + m && z < b.maxZ - m);
  }

  /** Is (x, z) on something the player uses (a zone, a cash pile, a price pad), grown by m? */
  function busy(x, z, m) {
    for (let s = 0; s < stations.length; s++) {
      const st = stations[s];
      if (!st.active) continue;
      const zs = st.drop ? st.drop.zone : null, zp = st.pickup ? st.pickup.zone : null, zc = st.cash ? st.cash.pile : null, zv = st.serve ? st.serve.zone : null;
      if (zs && Math.hypot(x - zs.x, z - zs.z) < zs.r + m) return true;
      if (zp && Math.hypot(x - zp.x, z - zp.z) < zp.r + m) return true;
      if (zc && Math.hypot(x - zc.x, z - zc.z) < zc.r + m) return true;
      if (zv && Math.hypot(x - zv.x, z - zv.z) < zv.r + m) return true;
    }
    const pads = G.pads && G.pads.visible ? G.pads.visible() : null;
    if (pads) for (let i = 0; i < pads.length; i++) if (Math.hypot(x - pads[i].pos.x, z - pads[i].pos.z) < 1.9 + m) return true;
    return false;
  }

  /** Straight walk from a to b free of blockers? */
  function clearLine(ax, az, bx, bz, m) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / 0.5));
    for (let k = 1; k <= n; k++) if (blocked(ax + (bx - ax) * k / n, az + (bz - az) * k / n, m)) return false;
    return true;
  }

  /**
   * A spot for something `half` wide (along the screen's right axis), written to out {x, z}.
   * Sampled in screen space around the player so it is in view: sx across, sy up the screen
   * (ground units). Returns false if nothing fits (a tiny or crowded room): try again later.
   */
  function find(out, rnd, { half = 0, minD = 4.5, sx = 3.4, syMin = -7, syMax = 3.6, margin = 1.2 } = {}) {
    const pl = G.player;
    if (!pl) return false;
    const px = pl.pos.x, pz = pl.pos.z;
    // the ranges are written for the default portrait view; other views (a closer camera, landscape) scale them
    const kx = viewScale(), ky = Math.max(0.5, Math.min(1.2, viewH() / 23.5));
    sx *= kx; syMin *= ky; syMax *= ky; minD *= Math.min(1, Math.max(kx, 0.6));
    const across = Math.max(0.4, sx - half);
    for (let pass = 0; pass < 3; pass++) {
      // later passes accept closer and more crowded spots
      const dMin = pass === 0 ? minD : pass === 1 ? minD * 0.7 : 2.6;
      const m = pass === 2 ? 0.7 : margin;
      for (let i = 0; i < 40; i++) {
        const u = (rnd() * 2 - 1) * across, v = syMin + rnd() * (syMax - syMin);
        if (Math.hypot(u, v) < dMin) continue;
        // screen-right = world (-x, +z) / sqrt2, screen-up = world (+x, +z) / sqrt2
        const x = px + (-u + v) * S2, z = pz + (u + v) * S2;
        if (!inBounds(x, z, 1.2 + half * 0.5)) continue;
        let ok = true;
        // the whole width must be free (gates stand side by side along screen-right)
        for (let k = -1; k <= 1 && ok; k++) {
          const ex = x - k * half * S2, ez = z + k * half * S2;
          if (blocked(ex, ez, m) || (pass < 2 && busy(ex, ez, 0.5))) ok = false;
        }
        if (!ok || !clearLine(px, pz, x, z, 0.5)) continue;
        out.x = x; out.z = z;
        return true;
      }
    }
    return false;
  }

  function viewH() { return G.view && G.view.viewSize ? G.view.viewSize : 23.5; }
  /** How wide the view is next to the default portrait one (10.9 m across): 0.5 .. 1.5. */
  function viewScale() {
    const a = (window.innerWidth || 1) / (window.innerHeight || 1);
    return Math.max(0.5, Math.min(1.5, (viewH() * a) / 10.9));
  }

  return { find, blocked, inBounds, busy, clearLine, viewScale };
}
