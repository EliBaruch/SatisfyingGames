// Station type 'depot' (opt-in: list '../../engine/stations/depot.js' in a world's `modules`).
// A goods platform: a `pile` that people only hand goods IN to. The player and haulers unload at
// its drop zone, the stock is drawn on the platform, and nobody can pick it back up by hand: the
// pickup capability is exposed as `freight` instead, which a vehicle role loads from (the 'train'
// role reads `station.freight || station.pickup`). Hints, the test bot and haulers therefore never
// treat it as a source.
//
// def: everything the `pile` type takes (items, capacity, kindCap, layout, dropZone, workerSpot,
// label, markers, placeholder, pallet). `dropZone` is required; `zone` (where a pile's pickup zone
// would be) is not used.
// Readable like a pile: count, fill, store; plus freight { available, take(accept), has, count, from }.
// Save: the pile's ({ n: { kind: count } }, items in flight included).
import { registerStationType } from '../registry.js';
import { createPile } from './pile.js';

registerStationType('depot', {
  create(G, def) {
    if (!def.dropZone) throw new Error(`depot '${def.id}': dropZone required`);
    const st = createPile(G, { idleHint: false, ...def });
    // the pile's TAKE marker (first in the list) has no meaning here
    const marks = st.meshes && st.meshes.markers;
    if (marks && marks.length > 1) { const m = marks.shift(); if (m.parent) m.parent.remove(m); }
    st.freight = st.pickup;
    st.pickup = null;
    return st;
  },
  describe: 'goods platform: drop zone in, vehicles load from `freight`',
});
