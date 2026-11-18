// How a Harvest Rush looks in each world. The item and the accent colours come from the Gate Run's
// theme (engine/run/theme.js: factory = battery packs, frost = logs, ...); this adds the ground the
// carpet lies on. A world does not have to define anything. It may override any of it with
//   world.rush = { ground: { out, field, trail, edge, mud, fence, ring }, obstacle: 'bale' | 'crate' | 'rock' }
//
//   out    the land around the field          field  the field itself (dark enough for the items to pop)
//   trail  the swept ground behind the hero    edge   the rim of the field
//   mud    the slow patches                    fence  rails and posts
//   ring   the sweep circle on the ground
import { themeFor } from '../run/theme.js';

const GENERIC = { out: 0x86c267, field: 0x7a5637, trail: 0xc49a66, edge: 0x4f3622, mud: 0x3d2a1c, fence: 0xffffff, ring: 0xffffff };
const DEFAULTS = {
  flower: { ground: { out: 0x7fc765, field: 0x6e4a31, trail: 0xbd9261, edge: 0x4a301f, mud: 0x3a2618 }, obstacle: 'bale' },
  chicken: { ground: { out: 0x9ad06c, field: 0x4f9442, trail: 0xa9d877, edge: 0x35702f, mud: 0x5b4127, fence: 0xfff1d6 }, obstacle: 'bale' },
  grocery: { ground: { out: 0xcfe0e6, field: 0x4d7f97, trail: 0x9ccbe0, edge: 0x2f5a70, mud: 0xd9732b, fence: 0xfff7ea }, obstacle: 'crate' },
  factory: { ground: { out: 0x6c7886, field: 0x3c4654, trail: 0x7f8da0, edge: 0x232a34, mud: 0x1d1730, fence: 0xffc928, ring: 0xffe27a }, obstacle: 'crate' },
  frost: { ground: { out: 0xdfeefa, field: 0xc3dcf0, trail: 0x86a9cc, edge: 0x7f9fc0, mud: 0x5f86b3, fence: 0x8a5a36, ring: 0x2f6fd0 }, obstacle: 'rock' },
  town: { ground: { out: 0x8fcf6a, field: 0x7a5435, trail: 0xc79d68, edge: 0x513622, mud: 0x3d2a1c }, obstacle: 'bale' },
};

export function rushTheme(G) {
  const base = themeFor(G);
  const d = DEFAULTS[G.worldId] || {};
  const o = G.world && G.world.rush && typeof G.world.rush === 'object' ? G.world.rush : {};
  return {
    ...base,
    ground: { ...GENERIC, ...(d.ground || {}), ...(o.ground || {}) },
    obstacle: o.obstacle || d.obstacle || 'crate',
  };
}
