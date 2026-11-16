// Worker role 'operator': stands at a machine and works it (the 'work' pose while the station runs,
// idle otherwise). Decorative, like the cashier: pair the hire with a stat boost in one pad:
//   { type: 'multi', effects: [ { type: 'hire', role: 'operator', to: 'bench', spot: { x, z } }, { type: 'stat', stat: 'benchSpeed', mul: 1.5 } ] }
// Not built in: list '../../engine/workers/operator.js' in the world's `modules`.
// Options (world.workers.operator < effect.options): look.
import { registerWorkerRole } from '../registry.js';
import { makeCharacter, animateCharacter, lodCharacter, LOOKS } from '../chars.js';
import { roleConfig, pt } from './common.js';

function createOperator(G, hire, team, live) {
  const cfg = roleConfig(G, 'operator', hire);
  const B = G.stations.get(hire.to);
  if (!B) { console.error(`[operator] unknown station '${hire.to}'`); return null; }
  const e = hire.effect || {};
  const spot = pt(e.spot || B.staffSpot || B.pos);
  const look = typeof cfg.look === 'string' ? (LOOKS[cfg.look] || LOOKS.hauler || LOOKS.cashier) : (cfg.look || LOOKS.hauler || LOOKS.cashier);
  const group = makeCharacter(look);
  const face = e.face || B.pos;
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.yaw ?? Math.atan2(face.x - spot.x, face.z - spot.z);
  G.scene.add(group);
  if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
  const anim = { moving: false, speed: 1, carrying: false, action: null };
  let busy = 0;
  return {
    group,
    update(dt) {
      // keep working a moment after a cycle ends so short cycles do not make the arms twitch
      if (B.running) busy = 0.5; else if (busy > 0) busy -= dt;
      anim.action = busy > 0 ? 'work' : null;
      lodCharacter(G, group);
      animateCharacter(group, dt, anim);
    },
  };
}

registerWorkerRole('operator', { create: createOperator, toast: 'OPERATOR HIRED!', focus: (G, e) => { const s = G.stations.get(e.to); return s ? s.pos : null; } });
