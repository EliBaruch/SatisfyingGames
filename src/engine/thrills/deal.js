// Flash sale: two gates with price tags. Run through one to buy it with the money in hand, or
// walk past and keep the money for the price pads. One gate sells a perk outright; the other a
// star or a timed boost. The sale only opens when the player can afford at least one of them.
import { perkById, offerPerks } from './perks.js';

const TTL = 22;
const GOLD = 0xf0b400, ORANGE = 0xff7a1a, BLUE = 0x2e9bff, VIOLET = 0x7a4bd6;

export function createDeal(K) {
  const { G, T, st, gates, spots, rnd } = K;
  const E = { active: false, t: 0, done: false };
  const spot = { x: 0, z: 0 };
  const needText = { color: '#ff7a7a', size: 0.7, life: 0.9, maxW: 0.5 };
  let needT = 0;

  function options() {
    const u = K.unit();
    const out = [];
    const offer = offerPerks(st.perks, { crew: K.hasCrew(), harvest: K.hasHarvest() }, rnd, 1)[0];
    if (offer) out.push({ kind: 'perk', id: offer.id, color: offer.color, title: offer.title, sub: offer.sub, icon: offer.icon, price: K.nice(u * 1.6) });
    const pool = [{ w: 4, o: { kind: 'star', color: GOLD, title: '+1', sub: 'STAR', icon: 'star', price: K.nice(u * 0.6) } }];
    if (!K.fever.on) pool.push({ w: 3, o: { kind: 'fever', color: ORANGE, title: 'x2', sub: 'FEVER NOW', icon: 'flame', price: K.nice(u * 0.35) } });
    pool.push({ w: 2, o: { kind: 'turbo', color: BLUE, title: 'TURBO', sub: `RUN FAST ${T.turboTime * 2}s`, icon: 'bolt', price: K.nice(u * 0.25) } });
    if (K.hasCrew()) pool.push({ w: 2, o: { kind: 'crew', color: VIOLET, title: 'CREW', sub: `RUSH ${T.crewTime * 2}s`, icon: 'bolt', price: K.nice(u * 0.35) } });
    while (out.length < 2 && pool.length) {
      let total = 0;
      for (const p of pool) total += p.w;
      let r = rnd() * total, i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
      out.push(pool.splice(i, 1)[0].o);
    }
    return rnd() < 0.5 ? out : out.reverse();
  }

  function buy(i, o) {
    G.spend(o.price);
    switch (o.kind) {
      case 'perk': K.grantPerk(o.id); break;
      case 'star': K.addStar(1, gates.x, gates.z); break;
      case 'fever': K.fever.start(); break;
      case 'turbo': K.boost('turbo', T.turboTime * 2); K.toast('TURBO!'); K.play('whoosh'); break;
      case 'crew': K.boost('crew', T.crewTime * 2); K.toast('CREW RUSH!'); K.play('whoosh'); break;
    }
    K.play('pay');
    E.done = true; E.t = 0;
  }

  function start() {
    if (E.active || gates.active) return false;
    const opts = options();
    if (opts.length < 2) return false;
    const money = G.state.money;
    if (money < Math.min(opts[0].price, opts[1].price)) return false;    // nothing affordable: no point teasing
    const gs = K.gateScale();
    if (!spots.find(spot, rnd, { half: 2.9 * gs, minD: 4.5 })) return false;
    E.active = true; E.t = 0; E.done = false;
    gates.open({
      x: spot.x, z: spot.z, ttl: TTL, scale: gs, options: opts,
      canPick(i, o) {
        if (G.state.money >= o.price) return true;
        needT -= 1;
        if (needT <= 0 && G.fx && G.player) {
          needT = 45;       // about once a second while standing in the gate (called every step)
          G.fx.popText({ x: G.player.pos.x, y: 2.4, z: G.player.pos.z }, 'NOT ENOUGH CASH', needText);
          K.play('full');
        }
        return false;
      },
      onPick: buy,
      onExpire() { E.done = true; E.t = 0; },
    });
    K.toast('FLASH SALE!');
    K.tip('deal', 'Run through a gate to buy it, or keep your cash', 6);
    K.play('order');
    return true;
  }

  function update(dt) {
    if (!E.active) return;
    E.t += dt;
    if (E.done && E.t > 0.6 && !gates.active) E.active = false;
  }

  return { start, update, get active() { return E.active; } };
}
