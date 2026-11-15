#!/usr/bin/env node
// Bloom Rush playtest runner: plays the whole game with src/autoplay.js and reports the unlock timeline.
// Usage: node tools/playtest.js [--speed=20] [--max=1200] [--shots=DIR] [--url=http://localhost:8100/]
//                               [--fresh|--no-fresh] [--until=padId] [--driver=page|loop]
// driver=page (default): the page's own loop is frozen (G.timeScale = 0) and the sim is advanced by calling
//   G.step(1/60) in batches inside page.evaluate (fast, no rendering needed). driver=loop: uses the game loop at ?speed=N.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const SPEED = parseFloat(args.speed || 20);
const MAX = parseFloat(args.max || 1200);
const SHOTS = args.shots && args.shots !== true ? path.resolve(args.shots) : null;
const URL_ = args.url || 'http://localhost:8100/';
const FRESH = !(args['no-fresh']) && args.fresh !== 'false';
const UNTIL = args.until || null;
const DRIVER = args.driver || 'page';
const WALL_LIMIT = 15 * 60 * 1000;
const BATCH = 120; // steps per evaluate in page mode (2 sim-seconds)

const SHOT_AT = { cashier0: 'first-cashier', cutter0c: 'third-cutter', tractor0: 'tractor0', farm1: 'farm1', farm2: 'farm2', farm3: 'farm3', greenhouse: 'greenhouse' };
const BIG_WAIT = new Set(['farm1', 'farm2', 'farm3', 'tractor0', 'greenhouse']);

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const wall0 = Date.now();
  const outDir = SHOTS || process.cwd();
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  let pageErrors = 0;
  page.on('pageerror', () => { pageErrors++; });

  if (FRESH) await page.addInitScript(() => { try { if (!sessionStorage.getItem('__pt')) { localStorage.clear(); sessionStorage.setItem('__pt', '1'); } } catch (e) {} });
  const base = URL_ + (URL_.includes('?') ? '&' : '?') + 'autoplay&speed=' + (DRIVER === 'loop' ? SPEED : 1);
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.step && window.__autoplay, null, { timeout: 30000 });
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(200);

  if (DRIVER === 'page') {
    // freeze the game's own loop and skip rendering while stepping (rendering is only re-enabled for screenshots)
    await page.evaluate(() => { const G = window.__game; G.timeScale = 0; window.__origRender = G.renderer.render.bind(G.renderer); G.renderer.render = () => {}; });
  }

  const shotsDone = new Set();
  let shot10 = false;
  let seen = 0;
  let simAtStart = await page.evaluate(() => window.__game.state.playTime);
  let status = null;
  let lastProgressWall = Date.now(), lastUnlockCount = 0;

  async function shoot(name, wait) {
    if (!SHOTS) return;
    if (DRIVER === 'page') await page.evaluate(() => { window.__game.renderer.render = window.__origRender; });
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
    if (DRIVER === 'page') await page.evaluate(() => { window.__game.renderer.render = () => {}; });
  }

  async function snapshot() {
    return page.evaluate(() => ({ t: window.__game.state.playTime, done: window.__autoplay.done, stuck: window.__autoplay.stuck, n: window.__autoplay.log.length, won: window.__game.state.won }));
  }

  async function processLog() {
    const log = await page.evaluate((s) => window.__autoplay.log.slice(s), seen);
    seen += log.length;
    for (const e of log) {
      if (e.event === 'unlock') {
        if (SHOT_AT[e.id] && SHOTS && !shotsDone.has(e.id)) {
          shotsDone.add(e.id);
          if (e.id === 'greenhouse' && DRIVER === 'page') {
            await page.evaluate(() => { window.__autoplay.hold = true; for (let i = 0; i < 180; i++) window.__game.step(1 / 60); });
          }
          await shoot(SHOT_AT[e.id], e.id === 'greenhouse' ? 800 : BIG_WAIT.has(e.id) ? 1700 : 300);
          if (e.id === 'greenhouse') await page.evaluate(() => { window.__autoplay.hold = false; });
        }
        if (UNTIL && e.id === UNTIL) status = 'until';
      }
    }
  }

  for (;;) {
    if (DRIVER === 'page') {
      await page.evaluate((n) => { const G = window.__game; for (let i = 0; i < n; i++) G.step(1 / 60); }, BATCH);
    } else {
      await sleep(500);
    }
    const s = await snapshot();
    if (SHOTS && !shot10 && s.t >= 10) { shot10 = true; await shoot('t10s', 300); }
    await processLog();
    if (status === 'until') break;
    if (s.done) { await processLog(); if (DRIVER === 'page') { /* greenhouse shot handled above */ } break; }
    if (s.stuck) { status = 'stuck'; break; }
    if (s.t > MAX) { status = 'max'; break; }
    if (Date.now() - wall0 > WALL_LIMIT) { status = 'wall'; break; }
  }
  if (status === 'until' && DRIVER === 'page') { /* nothing */ }

  const result = await page.evaluate(() => ({ log: window.__autoplay.log, t: window.__game.state.playTime, money: window.__game.state.money, earned: window.__game.state.earned }));
  const wall = (Date.now() - wall0) / 1000;
  await browser.close();

  const log = result.log;
  const unlocks = log.filter((e) => e.event === 'unlock');
  const samples = log.filter((e) => e.event === 'sample');
  const stucks = log.filter((e) => e.event === 'stuck');
  const win = log.find((e) => e.event === 'win');

  console.log('\n=== UNLOCK TIMELINE ===');
  console.log('time   id          cost      since prev');
  let prev = 0;
  const gaps = [];
  for (const u of unlocks) {
    const dt = u.t - prev;
    if (dt > 60) gaps.push({ from: prev, to: u.t, id: u.id });
    console.log(`${mmss(u.t).padEnd(6)} ${u.id.padEnd(11)} ${String(u.cost).padStart(7)}   +${dt.toFixed(1)}s`);
    prev = u.t;
  }
  console.log('\n=== INCOME SAMPLES ===');
  console.log('t       money    income/s  carried  action');
  for (const s of samples) console.log(`${mmss(s.t).padEnd(7)} ${String(s.money).padStart(8)} ${String(s.incomePerSec).padStart(8)}  ${String(s.carried).padStart(5)}    ${s.action}`);
  console.log('\n=== GAPS > 60s ===');
  if (!gaps.length) console.log('none');
  for (const g of gaps) {
    const during = samples.filter((s) => s.t > g.from && s.t <= g.to).map((s) => s.action);
    const counts = {}; during.forEach((a) => { counts[a] = (counts[a] || 0) + 1; });
    console.log(`${mmss(g.from)} -> ${mmss(g.to)} (before ${g.id}, ${(g.to - g.from).toFixed(0)}s): samples ${JSON.stringify(counts)}`);
  }
  console.log('\n=== STUCK EVENTS ===');
  if (!stucks.length) console.log('none');
  for (const s of stucks) console.log(JSON.stringify(s));
  console.log('\n=== ERRORS ===');
  if (!errors.length) console.log('none');
  for (const e of errors) console.log(e);

  const simElapsed = result.t - simAtStart;
  console.log('\n=== RESULT ===');
  if (win) console.log(`WON at sim time ${mmss(win.t)} (${win.t}s)`);
  else {
    const last = unlocks[unlocks.length - 1];
    console.log(`not won (${status || 'ended'}), reached ${last ? last.id : 'nothing'} at ${last ? mmss(last.t) : '0:00'}; sim time ${mmss(result.t)}`);
  }
  console.log(`wall time ${wall.toFixed(1)}s, sim/wall ratio ${(simElapsed / wall).toFixed(1)}x (driver=${DRIVER})`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'playtest-log.json'), JSON.stringify({ win: win || null, status, simTime: result.t, wallSeconds: wall, log, errors }, null, 1));
  const bad = pageErrors > 0 || status === 'stuck';
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
