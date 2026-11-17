// Trophies: long-term goals across every world. Counted from the same events the player level
// uses ('thrill' { kind }, 'run:done', wins, levels) and kept in meta: meta.counts = { kind: n },
// meta.trophies = { id: true }. Earning one shows a banner and pays XP. The list opens from the
// TROPHIES chip on the title screen.
//
// A trophy is { id, title, text, need, get(ctx) } where get returns how far along it is.

const MEDAL = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 4h18l-4 16H19z" fill="#e04f6c"/><path d="M15 4h7l2 16h-5z" fill="#ff86a6"/><circle cx="24" cy="30" r="14" fill="#ffd23f" stroke="#a86a00" stroke-width="2.5"/><circle cx="24" cy="30" r="9.500" fill="none" stroke="#fff3b0" stroke-width="2"/><path d="M24 22.500l2.300 4.900 5.300.6-3.900 3.600 1.100 5.200-4.800-2.700-4.800 2.700 1.100-5.200-3.900-3.600 5.300-.6z" fill="#fff"/></svg>';

const count = (k) => (c) => c.counts[k] || 0;
export const TROPHIES = [
  { id: 'fever1', title: 'Hot Streak', text: 'Start a fever', need: 1, get: count('fever') },
  { id: 'fever25', title: 'On Fire', text: 'Start 25 fevers', need: 25, get: count('fever') },
  { id: 'order10', title: 'Rush Hour', text: 'Finish 10 rush orders', need: 10, get: count('order') },
  { id: 'order50', title: 'Never Late', text: 'Finish 50 rush orders', need: 50, get: count('order') },
  { id: 'pig5', title: 'Pig Catcher', text: 'Catch 5 piggy banks', need: 5, get: count('pig') },
  { id: 'pig20', title: 'Bacon Saver', text: 'Catch 20 piggy banks', need: 20, get: count('pig') },
  { id: 'coins10', title: 'Coin Collector', text: 'Clear 10 coin trails', need: 10, get: count('coins') },
  { id: 'escort5', title: 'Good Host', text: 'Escort 5 VIPs', need: 5, get: count('escort') },
  { id: 'jackpot1', title: 'Jackpot!', text: 'Hit a jackpot in a mystery gate', need: 1, get: count('jackpot') },
  { id: 'deal5', title: 'Big Spender', text: 'Buy 5 flash sale offers', need: 5, get: count('deal') },
  { id: 'perk10', title: 'Build Master', text: 'Pick 10 perks', need: 10, get: count('perk') },
  { id: 'load25', title: 'Heavy Lifter', text: 'Hand in 25 full loads', need: 25, get: count('load') },
  { id: 'run1', title: 'Off and Running', text: 'Finish a gate run', need: 1, get: count('run') },
  { id: 'run3', title: 'Perfect Run', text: 'Get three stars on a gate run', need: 1, get: count('run3') },
  { id: 'runStars', title: 'Star Collector', text: 'Earn 15 gate run stars', need: 15, get: count('runStar') },
  { id: 'level5', title: 'Rising Star', text: 'Reach level 5', need: 5, get: (c) => c.level },
  { id: 'level15', title: 'Old Hand', text: 'Reach level 15', need: 15, get: (c) => c.level },
  { id: 'level30', title: 'Legend', text: 'Reach level 30', need: 30, get: (c) => c.level },
  { id: 'world1', title: 'First Harvest', text: 'Finish a world', need: 1, get: (c) => c.finished },
  { id: 'world3', title: 'Entrepreneur', text: 'Finish 3 worlds', need: 3, get: (c) => c.finished },
  { id: 'worldAll', title: 'Tycoon', text: 'Finish every world', need: 1, get: (c) => (c.finished >= c.worlds && c.worlds > 0 ? 1 : 0) },
  { id: 'fast', title: 'Speedrunner', text: 'Finish a world in under 6 minutes', need: 1, get: (c) => (c.bestTime > 0 && c.bestTime < 360 ? 1 : 0) },
];

export function createTrophies(G, host) {
  const meta = G.save.meta;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(meta.counts)) meta.counts = {};
  if (!isObj(meta.trophies)) meta.trophies = {};
  for (const k of Object.keys(meta.counts)) if (!(meta.counts[k] > 0)) delete meta.counts[k];

  const ctx = { counts: meta.counts, level: 1, finished: 0, worlds: 0, bestTime: 0 };
  function refreshCtx() {
    ctx.level = host.level();
    let fin = 0;
    const f = meta.finished || {};
    for (const k in f) if (f[k]) fin++;
    ctx.finished = fin;
    ctx.worlds = Array.isArray(G.worlds) ? G.worlds.length : 0;
    let best = 0;
    const b = meta.best || {};
    for (const k in b) if (b[k] > 0 && (best === 0 || b[k] < best)) best = b[k];
    ctx.bestTime = best;
  }

  let dirty = true, queue = [];
  /** something happened: count it (kind may be null for "just re-check") */
  function note(kind, n = 1) {
    if (kind) meta.counts[kind] = (meta.counts[kind] || 0) + n;
    dirty = true;
  }
  function check() {
    dirty = false;
    refreshCtx();
    for (let i = 0; i < TROPHIES.length; i++) {
      const t = TROPHIES[i];
      if (meta.trophies[t.id] || t.get(ctx) < t.need) continue;
      meta.trophies[t.id] = true;
      queue.push(t);
    }
  }
  // trophies already deserved when this feature arrives (an old save) are granted quietly
  check();
  queue = [];

  let wait = 0;
  function update(dt) {
    if (dirty) check();
    if (!queue.length) return;
    wait -= dt;
    if (wait > 0) return;
    wait = 3.2;                                // one banner at a time
    const t = queue.shift();
    host.addXp(40);
    host.banner('TROPHY: ' + t.title.toUpperCase(), t.text + '  ·  +40 XP');
    if (G.audio && G.audio.play) G.audio.play('star');
    if (G.saveNow) G.saveNow();
  }

  function earned() { let n = 0; for (const t of TROPHIES) if (meta.trophies[t.id]) n++; return n; }

  // ------------------------------------------------------------------ the sheet
  let sheet = null, grid = null, head = null;
  function build() {
    if (sheet || typeof document === 'undefined') return;
    sheet = document.createElement('div');
    sheet.className = 'trophy-sheet';
    sheet.innerHTML = '<div class="ts-card" role="dialog" aria-label="Trophies"><div class="ts-head"><b></b><button type="button" class="ts-close" aria-label="Close">CLOSE</button></div><div class="ts-grid"></div></div>';
    grid = sheet.querySelector('.ts-grid');
    head = sheet.querySelector('.ts-head b');
    sheet.addEventListener('click', (e) => { if (e.target === sheet || (e.target.closest && e.target.closest('.ts-close'))) close(); });
    document.body.append(sheet);
  }
  function open() {
    build();
    if (!sheet) return;
    refreshCtx();
    head.textContent = `TROPHIES  ${earned()} / ${TROPHIES.length}`;
    grid.textContent = '';
    // earned first, then the closest to done
    const rows = TROPHIES.map((t) => ({ t, have: Math.min(t.need, t.get(ctx)), done: !!meta.trophies[t.id] }))
      .sort((a, b) => (b.done - a.done) || (b.have / b.t.need - a.have / a.t.need));
    for (const r of rows) {
      const el = document.createElement('div');
      el.className = 'ts-item' + (r.done ? ' is-done' : '');
      const icon = document.createElement('span');
      icon.className = 'ts-medal';
      icon.innerHTML = MEDAL;
      const text = document.createElement('span');
      text.className = 'ts-text';
      const b = document.createElement('b');
      b.textContent = r.t.title;
      const s = document.createElement('span');
      s.textContent = r.t.text;
      const bar = document.createElement('i');
      bar.className = 'ts-bar';
      const fill = document.createElement('i');
      fill.style.width = Math.round((r.done ? 1 : r.have / r.t.need) * 100) + '%';
      bar.append(fill);
      text.append(b, s, bar);
      const n = document.createElement('span');
      n.className = 'ts-n';
      n.textContent = r.done ? 'DONE' : (r.t.need > 1 ? `${Math.floor(r.have)}/${r.t.need}` : '');
      el.append(icon, text, n);
      grid.append(el);
    }
    sheet.classList.add('show');
  }
  function close() { if (sheet) sheet.classList.remove('show'); }

  return { note, update, open, close, earned, get total() { return TROPHIES.length; } };
}
