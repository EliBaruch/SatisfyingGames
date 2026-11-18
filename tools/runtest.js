#!/usr/bin/env node
// Bloom Rush Gate Run test: in each world the bot plays until run level 1 unlocks and runs it by
// itself, then levels 2 and 3 are started through G.run.start (unlocked with G.run.debugUnlock()).
// Checked for every run: it finishes, stars are 1..3, cash was added, the world stood still meanwhile
// (playTime, G.thrills) and resumes afterwards, draw calls and triangles stay inside the budget,
// starting 20 runs in a row leaks no geometries or textures, and there are no console or page errors.
// Usage: node tools/runtest.js [--url=http://localhost:8100/] [--worlds=flower,chicken,...] [--shots=DIR]
// Exits non-zero on any failure.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const URL_ = args.url && args.url !== true ? args.url : 'http://localhost:8100/';
const WORLDS = (args.worlds && args.worlds !== true ? args.worlds : 'flower,chicken,grocery,factory,frost').split(',');
const SHOTS = args.shots && args.shots !== true ? path.resolve(args.shots) : null;
const BUDGET = { calls: 150, triangles: 250000 };
const BATCH = 120;

async function testWorld(browser, world) {
  const fails = [];
  const check = (ok, what) => { if (!ok) { fails.push(what); console.log(`  FAIL ${what}`); } return ok; };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('__rt')) { localStorage.clear(); sessionStorage.setItem('__rt', '1'); } } catch (e) { /* ignore */ } });
  await page.goto(`${URL_}${URL_.includes('?') ? '&' : '?'}world=${world}&unlock=1&autoplay&noreveal`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game && window.__game.step && window.__autoplay, null, { timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('#start .tap'); if (b) b.click(); });
  await page.waitForTimeout(200);

  const has = await page.evaluate(() => {
    const G = window.__game;
    G.timeScale = 0;                      // the page's loop keeps rendering; the sim is stepped from here
    if (!G.run || !G.modes) return false;
    const T = (window.__rt = { runs: [], thrill: 0, open: null });
    if (G.thrills) { const u = G.thrills.update; G.thrills.update = (dt) => { T.thrill++; return u(dt); }; }
    G.events.on('run:start', (e) => { T.open = { level: e.level, money: G.state.money, play: G.state.playTime, thrill: T.thrill }; });
    G.events.on('run:done', (e) => { T.open = { ...T.open, stars: e.stars, count: e.count, cash: e.cash, newStars: e.newStars, paid: G.state.money - T.open.money }; });
    G.events.on('mode:exit', () => {
      if (!T.open) return;
      T.runs.push({ ...T.open, playMoved: G.state.playTime - T.open.play, thrillMoved: T.thrill - T.open.thrill, done: T.open.stars !== undefined });
      T.open = null;
    });
    return true;
  });
  if (!check(has, 'G.run and G.modes exist')) { await ctx.close(); return { world, fails, errors }; }

  const step = (n) => page.evaluate((k) => { const G = window.__game; for (let i = 0; i < k; i++) G.step(1 / 60); }, n);
  const state = () => page.evaluate(() => {
    const G = window.__game, T = window.__rt;
    return { active: G.run.active, phase: G.run.phase, runs: T.runs.length, play: G.state.playTime, s: G.run.state.s, len: G.run.state.level ? G.run.state.level.length : 0, levels: G.run.levels() };
  });
  const render = async () => { await page.waitForTimeout(160); return page.evaluate(() => { const r = window.__game.renderer.info.render; return { calls: r.calls, triangles: r.triangles }; }); };
  let shotN = 0;
  const shoot = async (name) => { if (SHOTS) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOTS, `${world}-${++shotN}-${name}.png`) }); } };

  /** step until the run in progress has ended (the bot steers and presses CONTINUE); samples the renderer on the way */
  async function playOut(level) {
    let peak = { calls: 0, triangles: 0 }, sampled = 0, guard = 0;
    for (;;) {
      await step(40);
      const st = await state();
      if (!st.active) break;
      if (st.phase === 'run' && st.s > st.len * (0.25 + 0.3 * sampled) && sampled < 2) {
        sampled++;
        const r = await render();
        peak = { calls: Math.max(peak.calls, r.calls), triangles: Math.max(peak.triangles, r.triangles) };
        await shoot(`run${level}-mid${sampled}`);
      }
      if (st.phase === 'unload' && sampled < 3) {
        sampled = 3;
        const r = await render();
        peak = { calls: Math.max(peak.calls, r.calls), triangles: Math.max(peak.triangles, r.triangles) };
        await shoot(`run${level}-finish`);
      }
      if (++guard > 400) { check(false, `run ${level} did not finish within ${Math.round(guard * 40 / 60)} s`); await page.evaluate(() => window.__game.modes.abort()); break; }
    }
    return peak;
  }
  async function verify(level, peak) {
    const r = await page.evaluate((lv) => window.__rt.runs.filter((x) => x.level === lv).pop() || null, level);
    if (!check(!!r && r.done, `run ${level} finished (run:done)`)) return;
    check(r.stars >= 1 && r.stars <= 3, `run ${level} stars 1..3 (got ${r.stars})`);
    check(r.cash > 0 && r.paid >= r.cash, `run ${level} cash added (cash ${r.cash}, money moved ${r.paid})`);
    check(Math.abs(r.playMoved) < 1e-6, `run ${level} playTime stood still (moved ${r.playMoved})`);
    check(r.thrillMoved === 0, `run ${level} thrills stood still (${r.thrillMoved} updates)`);
    check(peak.calls > 0 && peak.calls <= BUDGET.calls && peak.triangles <= BUDGET.triangles, `run ${level} render budget (${peak.calls} calls, ${peak.triangles} triangles)`);
    const st = await state();
    check(!st.active, `run ${level} G.run.active is false afterwards`);
    const rec = st.levels.find((l) => l.n === level);
    check(rec && rec.stars === Math.max(r.stars, rec.stars) && rec.best >= r.count, `run ${level} saved (stars ${rec && rec.stars}, best ${rec && rec.best})`);
    // the world carries on: its clock, the thrills and the player
    const before = await page.evaluate(() => ({ play: window.__game.state.playTime, thrill: window.__rt.thrill, x: window.__game.player.pos.x, z: window.__game.player.pos.z }));
    await step(180);
    const after = await page.evaluate(() => ({ play: window.__game.state.playTime, thrill: window.__rt.thrill, x: window.__game.player.pos.x, z: window.__game.player.pos.z, hasThrills: !!window.__game.thrills }));
    check(after.play - before.play > 2.9, `run ${level} playTime advances again (+${(after.play - before.play).toFixed(2)} s)`);
    check(!after.hasThrills || after.thrill - before.thrill === 180, `run ${level} thrills update again (${after.thrill - before.thrill})`);
    console.log(`  run ${level}: ${r.stars} star${r.stars > 1 ? 's' : ''}, count ${r.count}, cash ${r.cash}, peak ${peak.calls} calls / ${peak.triangles} triangles`);
  }

  // ---- level 1: the bot plays the world until it unlocks, then starts it by itself
  let st = await state(), guard = 0;
  while (!st.levels[0].unlocked && ++guard < 400) { await step(BATCH); st = await state(); }
  check(st.levels[0].unlocked, `level 1 unlocks by playing (${Math.round(st.play)} s of play)`);
  console.log(`  level 1 unlocked after ${Math.round(st.play)} s of play`);
  await shoot('unlocked');
  guard = 0;
  while (!st.active && st.runs === 0 && ++guard < 20) { await step(30); st = await state(); }
  if (check(st.active, 'the bot starts level 1 by itself')) await verify(1, await playOut(1));
  await page.evaluate(() => { window.__autoplay.noRuns = true; });

  // ---- levels 2 and 3 through the API
  for (const level of [2, 3]) {
    const locked = await page.evaluate((lv) => { const G = window.__game; G.run.debugUnlock(false); return G.run.levels()[lv - 1].unlocked ? null : G.run.start(lv); }, level);
    check(locked === null || locked === false, `run ${level} does not start while locked`);
    const ok = await page.evaluate((lv) => { const G = window.__game; G.run.debugUnlock(); return G.run.start(lv); }, level);
    if (!check(ok === true, `G.run.start(${level}) returns true`)) continue;
    check(await page.evaluate((lv) => window.__game.run.start(lv), level) === false, `G.run.start(${level}) refuses while a run is active`);
    await verify(level, await playOut(level));
  }
  const nx = await page.evaluate(() => ({ next: window.__game.run.next(), levels: window.__game.run.levels(), stars: window.__game.save.meta.runStars }));
  check(nx.next === null || nx.levels[nx.next - 1].stars < 3, 'G.run.next() is null or a level with fewer than three stars');
  check(nx.stars === nx.levels.reduce((a, l) => a + l.stars, 0), `meta.runStars totals the stars (${nx.stars})`);

  // ---- a retry from the result card, then leaving in the middle of a run
  await page.evaluate(() => { window.__autoplay.hold = true; window.__game.run.start(1); });
  await step(60);
  const mid = await page.evaluate(() => { const G = window.__game; const a = G.run.active; G.run.leave(); return a; });
  await step(40);
  st = await state();
  check(mid && !st.active, 'leaving a run in progress returns to the world');
  await page.evaluate(() => { window.__autoplay.hold = false; });

  // ---- 20 runs in a row leak nothing on the GPU
  // (restarted behind the curtain, so the world does not play in between and add its own textures)
  await page.evaluate(() => window.__game.run.start(1));
  await step(60);
  await page.waitForTimeout(200);
  const mem0 = await page.evaluate(() => ({ ...window.__game.renderer.info.memory }));
  let restarts = 0;
  for (let i = 0; i < 20; i++) {
    if (await page.evaluate((lv) => window.__game.run.retry(lv), 1 + ((i + 1) % 3))) restarts++;
    await step(60);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  const mem1 = await page.evaluate(() => ({ ...window.__game.renderer.info.memory }));
  check(restarts === 20, `20 restarts in a row (${restarts})`);
  check(mem1.geometries <= mem0.geometries && mem1.textures <= mem0.textures, `20 runs leak nothing (geometries ${mem0.geometries} -> ${mem1.geometries}, textures ${mem0.textures} -> ${mem1.textures})`);
  await page.evaluate(() => window.__game.run.leave());
  await step(40);
  st = await state();
  check(!st.active, 'no run is active at the end');
  await shoot('end');

  check(errors.length === 0, `no console or page errors (${errors.length})`);
  for (const e of errors.slice(0, 8)) console.log('    ' + e);
  await ctx.close();
  return { world, fails, errors };
}

(async () => {
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  let bad = 0;
  for (const world of WORLDS) {
    console.log(`\n=== ${world} ===`);
    const t0 = Date.now();
    let res;
    try { res = await testWorld(browser, world); } catch (err) { console.log('  FAIL crashed: ' + (err && err.message)); res = { world, fails: ['crashed'], errors: [] }; }
    console.log(`  ${res.fails.length ? 'FAILED (' + res.fails.length + ')' : 'ok'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    if (res.fails.length) bad++;
  }
  await browser.close();
  console.log(`\n${bad ? bad + ' world(s) FAILED' : 'ALL WORLDS PASSED'}`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
