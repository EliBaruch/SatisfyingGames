// Rush orders: a short goal with a clock. "Deliver 30 Roses" counts what the player hands in to
// any drop zone; "Collect $400" counts cash picked up from the piles. On time pays in full and
// gives a star; late still pays half for a while; after that the order just leaves. It can never
// cost the player anything.
//
// The size comes from what the player has been doing: the item is one they delivered lately and
// the amount is what their recent pace makes in the time allowed, so an order is a push, not a wall.
import { fmtMoney } from '../config.js';
import { getItem } from '../registry.js';

const TIME = 50;        // seconds for full pay
const LATE = 25;        // extra seconds at half pay
const DECAY_EVERY = 10, DECAY = 0.7;   // the delivery memory fades: steady state = rate x 33 s

export function createOrders(K) {
  const { G, T, st, ui, rnd } = K;
  const recent = new Map();        // kind -> recent deliveries (decaying)
  const kinds = [];                // same keys, no allocation when iterating
  let cashRecent = 0, decayT = 0;
  const O = { active: false, type: '', kind: '', name: '', need: 0, have: 0, left: 0, late: false, pay: 0, endT: 0, text: '', shown: -1 };

  function onDeliver(kind) {
    const v = recent.get(kind);
    if (v === undefined) { recent.set(kind, 1); kinds.push(kind); } else recent.set(kind, v + 1);
    if (O.active && O.endT <= 0 && O.type === 'deliver' && O.kind === kind) O.have++;
  }
  function onCash(amount) {
    cashRecent += amount;
    if (O.active && O.endT <= 0 && O.type === 'cash') O.have += amount;
  }

  /** is something the player can still gather or deliver? (the kind must have an open drop zone) */
  function deliverable(kind) {
    const l = G.stations.list;
    for (let i = 0; i < l.length; i++) if (l[i].active && l[i].drop && l[i].drop.accepts(kind)) return true;
    return false;
  }

  function start() {
    if (O.active) return false;
    // a kind the player has been delivering, weighted by how much
    let total = 0;
    for (let i = 0; i < kinds.length; i++) { const v = recent.get(kinds[i]); if (v >= 3 && deliverable(kinds[i])) total += v; }
    let kind = null;
    if (total > 0 && rnd() < 0.75) {
      let r = rnd() * total;
      for (let i = 0; i < kinds.length; i++) {
        const v = recent.get(kinds[i]);
        if (v < 3 || !deliverable(kinds[i])) continue;
        r -= v;
        if (r <= 0) { kind = kinds[i]; break; }
      }
    }
    const cap = G.stats.capacity;
    if (kind) {
      const rate = recent.get(kind) / 33;                       // items per second lately
      let n = Math.round(rate * TIME * 1.1);
      n = Math.max(Math.ceil(cap * 0.6), Math.min(cap * 3, n));
      if (n >= 20) n = Math.round(n / 5) * 5;
      const it = getItem(kind);
      O.type = 'deliver'; O.kind = kind; O.need = Math.max(3, n);
      O.name = it ? it.name : kind;
    } else {
      // late game (the crew does the hauling) or nothing delivered lately: a cash run
      const rate = Math.max(K.rate, cashRecent / 33);
      if (!(rate > 0) && total <= 0) return false;
      O.type = 'cash'; O.kind = '';
      O.need = K.nice(Math.max(K.unit() * 1.2, rate * TIME * 0.8));
      O.name = '';
    }
    O.active = true; O.have = 0; O.left = TIME; O.late = false; O.endT = 0; O.shown = -1;
    O.pay = K.nice(K.unit() * T.orderPay * K.totals.orderPay);
    ui.order(label(), '+$' + fmtMoney(O.pay));
    K.toast('RUSH ORDER!');
    K.tip('order', 'Finish it before the clock for full pay and a star', 6);
    K.play('order');
    return true;
  }

  function label() {
    return O.type === 'cash'
      ? `Collect $${fmtMoney(Math.min(O.have, O.need))} / $${fmtMoney(O.need)}`
      : `${Math.min(O.have, O.need)} / ${O.need} ${O.name}`;
  }

  function finish() {
    const pl = G.player;
    const amount = O.late ? Math.max(1, Math.round(O.pay * 0.5)) : O.pay;
    K.pay(amount, pl ? pl.pos : null, O.late ? 'ORDER' : 'RUSH ORDER');
    if (!O.late) K.addStar(1);
    K.fever.work(0.1);
    K.won('order');
    K.play('orderDone');
    if (G.fx && pl) { G.fx.confetti({ x: pl.pos.x, y: 0.4, z: pl.pos.z }, 60); G.fx.ring(pl.pos, { color: 0x7dff8a, radius: 3.4, life: 0.6 }); }
    ui.orderEnd(true, O.late ? 'ORDER DONE' : 'ORDER DONE! +1 STAR');
    O.endT = 1.2;
  }

  /** every step, order or not: the delivery memory fades */
  function tick(dt) {
    decayT += dt;
    if (decayT < DECAY_EVERY) return;
    decayT -= DECAY_EVERY;
    for (let i = 0; i < kinds.length; i++) recent.set(kinds[i], recent.get(kinds[i]) * DECAY);
    cashRecent *= DECAY;
  }

  function update(dt) {
    if (!O.active) return;
    if (O.endT > 0) { O.endT -= dt; if (O.endT <= 0) O.active = false; return; }
    if (O.have >= O.need) { finish(); return; }
    O.left -= dt;
    if (O.left <= 0) {
      if (!O.late) {
        O.late = true; O.left = LATE;
        ui.order(label(), 'half pay');
      } else {
        ui.orderEnd(false, 'Order left');
        O.endT = 0.8;
        return;
      }
    }
    // the label only changes when the count does
    const shown = O.type === 'cash' ? Math.floor(O.have) : O.have;
    let text = null;
    if (shown !== O.shown) { O.shown = shown; text = label(); }
    ui.orderProgress(O.have / O.need, O.left, O.late, text);
  }

  return {
    start, update, tick, onDeliver, onCash,
    get active() { return O.active; },
    get info() { return O; },
  };
}
