// Bonus level portal: a single glowing gate appears near the player and leads straight into the
// next bonus level (gate run, harvest rush or raid, taking turns) that still has stars to win. Walk past it and it closes.
// Only offered while such a level exists.
const TTL = 20;

export function createPortal(K) {
  const { G, gates, spots, rnd } = K;
  const E = { active: false, t: 0, done: false, level: 0, go: false, kind: 'run', title: 'GATE RUN' };
  const spot = { x: 0, z: 0 };

  // the kinds of bonus level, taking turns: whichever has a level with stars left to win
  const KINDS = [['run', 'GATE RUN'], ['rush', 'HARVEST RUSH'], ['raid', 'RAID']];
  let turn = 0;
  function nextLevel() {
    if (G.modes && G.modes.active) return 0;
    for (let i = 0; i < KINDS.length; i++) {
      const k = KINDS[(turn + i) % KINDS.length], m = G[k[0]];
      const n = m && m.next && m.start ? m.next() | 0 : 0;
      if (n > 0) { E.kind = k[0]; E.title = k[1]; turn = (turn + i + 1) % KINDS.length; return n; }
    }
    return 0;
  }

  function start() {
    if (E.active || gates.active) return false;
    const n = nextLevel();
    if (!(n > 0)) return false;
    const gs = K.gateScale();
    if (!spots.find(spot, rnd, { half: 1.4 * gs, minD: 5 })) return false;
    E.active = true; E.t = 0; E.done = false; E.go = false; E.level = n;
    gates.open({
      x: spot.x, z: spot.z, ttl: TTL, scale: gs,
      options: [{ color: 0x7a4bd6, title: E.title, sub: 'BONUS LEVEL ' + n, icon: 'star' }],
      onPick() { E.go = true; E.done = true; E.t = 0; },
      onExpire() { E.done = true; E.t = 0; },
    });
    K.toast('BONUS LEVEL!');
    K.tip('portal', 'Step through the gate to play a bonus level', 6);
    K.play('order');
    return true;
  }

  function update(dt) {
    if (!E.active) return;
    E.t += dt;
    if (!E.done && !gates.active) { E.done = true; E.t = 0; }       // the gate went away without a callback
    if (E.go && E.t > 0.25) {
      // a beat after the burst, the run begins (the world stands still until it is over)
      E.go = false;
      try { G[E.kind].start(E.level); } catch (err) { console.error('[thrills] bonus run failed to start:', err); }
    }
    if (E.done && !E.go && E.t > 0.6 && !gates.active) E.active = false;
  }

  return { start, update, get active() { return E.active; } };
}
