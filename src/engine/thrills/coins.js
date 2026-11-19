// Coin rush: a winding trail of big gold coins appears near the player. Each coin pays a little
// (with a rising chime); taking all of them before they fade pays a bonus and a star.
import * as THREE from 'three';

const MAX = 14, MIN = 7;
const STEP = 1.7;           // metres between coins
const TAKE = 1.15;          // the player within this takes a coin
const TTL = 17;

export function createCoins(K) {
  const { G, T, spots, rnd } = K;
  let mesh = null;
  const cx = new Float32Array(MAX), cz = new Float32Array(MAX), on = new Uint8Array(MAX), pop = new Float32Array(MAX);
  const E = { active: false, n: 0, left: 0, t: 0, got: 0, each: 1, endT: 0 };
  const spot = { x: 0, z: 0 };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const P = new THREE.Vector3();
  const SPARK = { colors: [0xffe14d, 0xffffff, 0xffb02e], count: 7, speed: 3.2, size: 0.13, life: 0.45, gravity: 6, up: 3.4 };
  const sound = { pitch: 1 };

  function build() {
    if (mesh) return;
    const geo = new THREE.CylinderGeometry(0.56, 0.56, 0.12, 18).rotateX(Math.PI / 2);
    mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffc928, emissive: 0x7a5200 }), MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    G.scene.add(mesh);
  }

  const free = (x, z) => spots.inBounds(x, z, 1.1) && !spots.blocked(x, z, 0.7);

  /** Lay the trail: from a spot near the player, step by step along a heading that wanders. */
  function layTrail() {
    if (!spots.find(spot, rnd, { half: 0, minD: 3.2, sx: 3.2, syMin: -5, syMax: 3.2 })) return 0;
    const pl = G.player;
    let x = spot.x, z = spot.z;
    let h = Math.atan2(x - pl.pos.x, z - pl.pos.z), turn = (rnd() - 0.5) * 0.9;
    let n = 0;
    cx[n] = x; cz[n] = z; n++;
    while (n < MAX) {
      let placed = false;
      turn = Math.max(-0.7, Math.min(0.7, turn + (rnd() - 0.5) * 0.5));
      // the wanted heading first, then wider and wider turns either way
      for (let k = 0; k < 9 && !placed; k++) {
        const a = h + turn + (k === 0 ? 0 : ((k + 1) >> 1) * 0.45 * (k & 1 ? 1 : -1));
        const nx = x + Math.sin(a) * STEP, nz = z + Math.cos(a) * STEP;
        if (!free(nx, nz) || spots.busy(nx, nz, 0.2)) continue;
        // not back onto the trail
        let near = false;
        for (let i = 0; i < n - 1 && !near; i++) if (Math.hypot(nx - cx[i], nz - cz[i]) < STEP * 0.95) near = true;
        if (near) continue;
        x = nx; z = nz; h = a; placed = true;
      }
      if (!placed) break;
      cx[n] = x; cz[n] = z; n++;
    }
    return n;
  }

  function start() {
    if (E.active || !G.player) return false;
    const n = layTrail();
    if (n < MIN) return false;
    build();
    E.active = true; E.n = n; E.left = n; E.t = 0; E.got = 0; E.endT = 0;
    E.each = Math.max(1, K.nice(K.unit() * 0.05));
    for (let i = 0; i < MAX; i++) { on[i] = i < n ? 1 : 0; pop[i] = -i * 0.05; }
    mesh.count = n;
    mesh.visible = true;
    sound.pitch = 1;
    K.toast('COIN RUSH!');
    K.tip('coins', 'Grab every coin before they fade for a bonus and a star', 6);
    K.play('order');
    return true;
  }

  function finish(all) {
    if (all) {
      const pl = G.player;
      K.pay(K.nice(K.unit() * 0.7), pl ? pl.pos : null, 'ALL COINS');
      K.addStar(1);
      K.won('coins');
      K.play('orderDone');
      K.fever.work(0.1);
      if (G.fx && pl) { P.set(pl.pos.x, 0.4, pl.pos.z); G.fx.confetti(P, 70); }
    }
    E.endT = 0.4;
  }

  function update(dt) {
    if (!E.active) return;
    if (E.endT > 0) {
      E.endT -= dt;
      if (E.endT <= 0) { E.active = false; mesh.visible = false; return; }
    }
    E.t += dt;
    const pl = G.player;
    const fading = E.endT > 0 ? Math.max(0, E.endT / 0.4) : 1;
    const blink = E.endT <= 0 && TTL - E.t < 3.5 ? (Math.sin(E.t * 16) > -0.2 ? 1 : 0.35) : 1;
    for (let i = 0; i < E.n; i++) {
      if (!on[i]) { m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m); continue; }
      pop[i] = Math.min(1, pop[i] + dt / 0.3);
      const u = Math.max(0, pop[i]);
      const sc = (u < 1 ? 0.4 + 0.6 * u + Math.sin(u * Math.PI) * 0.4 : 1) * fading * blink;
      if (E.endT <= 0 && pl && u >= 1) {
        const dx = pl.pos.x - cx[i], dz = pl.pos.z - cz[i];
        if (dx * dx + dz * dz < TAKE * TAKE) {
          on[i] = 0; E.left--; E.got++;
          K.pay(E.each, null, '', true, true);      // the chime and sparkle are the feedback
          sound.pitch = Math.pow(2, Math.min(14, E.got) / 12);
          K.play('tip', sound);
          K.fever.work(0.01);
          if (G.fx) { P.set(cx[i], 0.9, cz[i]); G.fx.burst(P, SPARK); }
          m.makeScale(0, 0, 0); mesh.setMatrixAt(i, m);
          if (E.left <= 0) finish(true);
          continue;
        }
      }
      e.set(0, E.t * 4 + i * 0.6, 0);
      q.setFromEuler(e);
      p.set(cx[i], 0.95 + Math.sin(E.t * 3.5 + i * 0.7) * 0.14, cz[i]);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (E.active && E.endT <= 0 && E.t >= TTL) finish(false);
  }

  return {
    start, update,
    get active() { return E.active; },
    /** the nearest coin still there */
    position(out) {
      if (!E.active || E.endT > 0 || !G.player) return null;
      let best = -1, bd = Infinity;
      for (let i = 0; i < E.n; i++) {
        if (!on[i]) continue;
        const d = Math.hypot(G.player.pos.x - cx[i], G.player.pos.z - cz[i]);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0) return null;
      out.x = cx[best]; out.z = cz[best];
      return out;
    },
  };
}
