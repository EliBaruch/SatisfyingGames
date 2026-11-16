// Station type 'solid': scenery that blocks the player (a bin, a rack, a booth). It has no
// capabilities; it only contributes `blockers` while open. Not built in: list
// '../../engine/stations/solid.js' in the world's `modules`.
//
// def = { id, type: 'solid', open, blockers: [{ x, z, hx, hz } | { x, z, r }, ...] }
import { registerStationType } from '../registry.js';

registerStationType('solid', {
  create(G, def) {
    const b = Array.isArray(def.blockers) ? def.blockers : [];
    const first = b[0] || { x: 0, z: 0 };
    return { pos: { x: first.x, z: first.z }, name: def.name || def.id, active: false, blockers: b, activate() {}, update() {} };
  },
  describe: 'invisible blockers for scenery',
});
