// How the Gate Run looks in each world: which item is carried and the runway's colours.
// A world does not have to define anything. It may override any of it with
//   world.run = { item: 'rose', name: 'PETAL DASH', colors: { accent, accent2, lane, edge, puff } }
// The table below is only the defaults for the built-in worlds; an unknown world gets its first item
// that is worth something and the generic colours.
import { getItem } from '../registry.js';

const GENERIC = { accent: 0xff5c93, accent2: 0xffc928, lane: 0xfff4e2, edge: 0xffffff };
const DEFAULTS = {
  flower: { item: 'rose', name: 'PETAL DASH', colors: { accent: 0xff5c93, accent2: 0x46c46a, lane: 0xfff3e2 } },
  chicken: { item: 'egg', name: 'EGG DASH', colors: { accent: 0xff9a2e, accent2: 0xe8543f, lane: 0xfff5da } },
  grocery: { item: 'produce', name: 'CRATE DASH', colors: { accent: 0x22b89a, accent2: 0xff6b5e, lane: 0xfffaf0 } },
  factory: { item: 'pack', name: 'VOLT DASH', colors: { accent: 0x2f8df0, accent2: 0xffc928, lane: 0xf1f5fa } },
  frost: { item: 'log', name: 'TIMBER DASH', colors: { accent: 0x5f86ff, accent2: 0x35c9c4, lane: 0xf3f9ff } },
  keep: { item: 'arrows', name: 'ARROW DASH', colors: { accent: 0x2f6fd0, accent2: 0xd23c3c, lane: 0xf3ecdc } },
};

export function themeFor(G) {
  const W = G.world || {};
  const d = DEFAULTS[G.worldId] || {};
  const o = W.run && typeof W.run === 'object' ? W.run : {};
  const items = W.items || [];
  let item = null;
  for (const id of [o.item, d.item]) if (!item && id && getItem(id)) item = id;
  if (!item) { const worth = items.find((it) => it.value > 0 && getItem(it.id)); item = worth ? worth.id : items[0] ? items[0].id : 'cash'; }
  const it = getItem(item) || getItem('cash');
  const bg = G.scene && G.scene.background && G.scene.background.isColor ? G.scene.background.getHex() : 0x9fdcff;
  return {
    item: it.id,
    itemName: it.name || it.id,
    name: String(o.name || d.name || 'GATE RUN').toUpperCase(),
    colors: { ...GENERIC, puff: 0xffffff, ...(d.colors || {}), ...(o.colors || {}) },
    background: bg,
  };
}
