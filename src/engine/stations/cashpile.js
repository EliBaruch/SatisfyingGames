// Station type 'cashpile': a standalone cash pile that something else pays onto (the
// vendor truck, scripted events). Capability: cash pile, plus cash.deposit(amount, from).
//
// def = { id, type: 'cashpile', name, open, cashPile: { x, z, r: 1.4 } (or x, z), bundle: 15, markers: true }
import { registerStationType } from '../registry.js';
import { createCashPile, zoneOf, isNum, zoneMarker, showAll } from './kit.js';

function createCashpileStation(G, def) {
  const pileDef = zoneOf(def.cashPile, def.x ?? 0, def.z ?? 0, 1.4);
  const cp = createCashPile(G, pileDef, { bundle: def.bundle ?? 15 });
  const markers = def.markers === false ? [] : [zoneMarker(G, pileDef, null, true)];
  const station = {
    pos: { x: pileDef.x, z: pileDef.z },
    name: def.name || def.id,
    active: false,
    cash: cp.cash,
    /** Add money; with `from` ({x, y, z}) a bill flies from there. */
    deposit: cp.deposit,
    meshes: { markers },
    activate() { cp.activate(); showAll(G, markers, false); },
    update(dt) { if (station.active) cp.update(dt); },
    serialize() { return { cash: Math.round(cp.amount * 100) / 100 }; },
    restore(d) { if (d && isNum(d.cash)) cp.amount = d.cash; },
  };
  return station;
}

registerStationType('cashpile', { create: createCashpileStation, describe: 'standalone cash pile with deposit()' });
