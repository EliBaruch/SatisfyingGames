// Worker role 'cashier': stands behind a shop counter and waves at sales. Purely
// decorative: being hired is what makes the shop serve on its own (the shop checks
// G.stats.staff[shopId].cashier).
//
// hire effect: { type: 'hire', role: 'cashier', to: 'shop-roses', spot?: {x, z, yaw} }
// Default spot: the shop's `staffSpot` (from its def.cashierSpot).
import { registerWorkerRole } from '../registry.js';
import { makeCharacter, animateCharacter, LOOKS } from '../chars.js';
import { roleConfig, pt } from './common.js';

function createCashier(G, hire, team, live) {
  const cfg = roleConfig(G, 'cashier', hire);
  const B = G.stations.get(hire.to);
  if (!B) { console.error(`[cashier] unknown station '${hire.to}'`); return null; }
  const e = hire.effect || {};
  const spot = pt(e.spot || B.staffSpot || B.pos);
  const look = typeof cfg.look === 'string' ? (LOOKS[cfg.look] || LOOKS.cashier) : cfg.look;
  const group = makeCharacter(look);
  group.position.set(spot.x, 0, spot.z);
  group.rotation.y = spot.yaw ?? 0;
  G.scene.add(group);
  if (live && G.fx && G.fx.popIn) G.fx.popIn(group);
  const c = {
    group, wave: 0, cool: 0,
    anim: { moving: false, speed: 1, carrying: false, action: null },
    update(dt) {
      if (c.wave > 0) c.wave -= dt;
      if (c.cool > 0) c.cool -= dt;
      c.anim.action = c.wave > 0 ? 'wave' : null;
      animateCharacter(group, dt, c.anim);
    },
  };
  G.events.on('sale', (s) => {
    if (s && s.stationId === hire.to && c.cool <= 0) { c.wave = 0.6; c.cool = 1.4; }
  });
  return c;
}

registerWorkerRole('cashier', { create: createCashier, toast: 'CASHIER HIRED!' });
