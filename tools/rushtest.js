#!/usr/bin/env node
// Bloom Rush Harvest Rush test: in each world the levels are unlocked with G.rush.debugUnlock(), the
// bot starts level 1 by itself and levels 2 and 3 are started through G.rush.start. Checked for every
// rush: it ends (rush:done), stars are 1..3, cash was added, the world stood still meanwhile (playTime,
// G.thrills) and resumes afterwards, G.modes.active is null again, draw calls and triangles stay inside
// the budget, 10 restarts in a row leak no geometries or textures, and there are no console or page errors.
// Usage: node tools/rushtest.js [--url=http://localhost:8100/] [--worlds=flower,chicken,...] [--shots=DIR]
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
const WORLDS = (args.worlds && args.worlds !== true ? args.worlds : 'flower,chicken,grocery,factory,frost,town').split(',');
const SHOTS = args.shots && args.shots !== true ? path.resolve(args.shots) : null;
const BUDGET = { calls: 150, triangles: 250000 };
const BATCH = 150;

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
    if (!G.rush || !G.modes) return false;
    const T = (window.__rt = { runs: [], thrill: 0, open: null });
    if (G.thrills) { const u = G.thrills.update; G.thrills.update = (dt) => { T.thrill++; return u(dt); }; }
    G.events.on('rush:start', (e) => { T.open = { level: e.level, money: G.state.money, play: G.state.playTime, thrill: T.thrill }; });
    G.events.on('rush:done', (e) => { T.open = { ...T.open, stars: e.stars, count: e.count, cash: e.cash, newStars: e.newStars, cleared: e.cleared, paid: G.state.money - T.open.money }; });
    G.events.on('mode:exit', (e) => {
      if (!T.open || e.id !== 'rush') return;
      T.runs.push({ ...T.open, playMoved: G.state.playTime - T.open.play, thrillMoved: T.thrill - T.open.thrill, done: T.open.stars !== undefined });
      T.open = null;
    });
    return true;
  });
  if (!check(has, 'G.rush and G.modes exist')) { await ctx.close(); return { world, fails, errors }; }

  const step = (n) => page.evaluate((k) => { const G = window.__game; for (let i = 0; i < k; i++) G.step(1 / 60); }, n);
  const state = () => page.evaluate(() => {
    const G = window.__game, T = window.__rt, S = G.rush.state;
    return { active: G.rush.active, phase: G.rush.phase, mode: G.modes.active ? G.modes.active.id : null, runs: T.runs.length, play: G.state.playTime, clock: S.clock, time: S.level ? S.level.time : 0, levels: G.rush.levels() };
  });
  const render = async () => { await page.waitForTimeout(160); return page.evaluate(() => { const r = window.__game.renderer.info.render; return { calls: r.calls, triangles: r.triangles }; }); };
  let shotN = 0;
  const shoot = async (name) => { if (SHOTS) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOTS, `${world}-${++shotN}-${name}.png`) }); } };

  /** step until the rush in progress has ended (the bot steers and presses CONTINUE); samples the renderer on the way */
  async function playOut(level) {
    let peak = { calls: 0, triangles: 0 }, sampled = 0, guard = 0;
    const sample = async (name) => {
      const r = await render();
      peak = { calls: Math.max(peak.calls, r.calls), triangles: Math.max(peak.triangles, r.triangles) };
      await shoot(`rush${level}-${name}`);
    };
    // big batches: every round trip to the page also waits for a rendered frame
    for (;;) {
      const st = await state();
      if (!st.active) break;
      if (st.phase === 'ready' && sampled < 1) { sampled = 1; await sample('start'); }
      if (st.phase === 'run' && sampled < 2 && st.clock < st.time * 0.55) { sampled = 2; await sample('mid'); }
      if (st.phase === 'unload' && sampled < 3) { sampled = 3; await sample('tally'); }
      await step(st.phase === 'run' && st.clock > 3 ? BATCH : 30);
      if (++guard > 300) { check(false, `rush ${level} did not end (phase ${st.phase})`); await page.evaluate(() => window.__game.modes.abort()); break; }
    }
    return peak;
  }
  async function verify(level, peak) {
    const r = await page.evaluate((lv) => window.__rt.runs.filter((x) => x.level === lv).pop() || null, level);
    if (!check(!!r && r.done, `rush ${level} ended (rush:done)`)) return;
    check(r.stars >= 1 && r.stars <= 3, `rush ${level} stars 1..3 (got ${r.stars})`);
    check(r.cash > 0 && r.paid >= r.cash, `rush ${level} cash added (cash ${r.cash}, money moved ${r.paid})`);
    check(r.count > 0 && r.cleared > 0.3, `rush ${level} the bot sweeps the field (count ${r.count}, cleared ${Math.round(r.cleared * 100)}%)`);
    check(Math.abs(r.playMoved) < 1e-6, `rush ${level} playTime stood still (moved ${r.playMoved})`);
    check(r.thrillMoved === 0, `rush ${level} thrills stood still (${r.thrillMoved} updates)`);
    check(peak.calls > 0 && peak.calls <= BUDGET.calls && peak.triangles <= BUDGET.triangles, `rush ${level} render budget (${peak.calls} calls, ${peak.triangles} triangles)`);
    const st = await state();
    check(!st.active && st.mode === null, `rush ${level} G.modes.active is null afterwards`);
    const rec = st.levels.find((l) => l.n === level);
    check(rec && rec.stars === Math.max(r.stars, rec.stars) && rec.best >= r.count, `rush ${level} saved (stars ${rec && rec.stars}, best ${rec && rec.best})`);
    // the world carries on: its clock, the thrills and the HUD
    const before = await page.evaluate(() => ({ play: window.__game.state.playTime, thrill: window.__rt.thrill }));
    await step(180);
    const after = await page.evaluate(() => ({ play: window.__game.state.playTime, thrill: window.__rt.thrill, hasThrills: !!window.__game.thrills, inMode: document.body.classList.contains('in-mode') }));
    check(after.play - before.play > 2.9, `rush ${level} playTime advances again (+${(after.play - before.play).toFixed(2)} s)`);
    check(!after.hasThrills || after.thrill - before.thrill === 180, `rush ${level} thrills update again (${after.thrill - before.thrill})`);
    check(!after.inMode, `rush ${level} the world HUD is back`);
    console.log(`  rush ${level}: ${r.stars} star${r.stars > 1 ? 's' : ''}, count ${r.count}, cleared ${Math.round(r.cleared * 100)}%, cash ${r.cash}, peak ${peak.calls} calls / ${peak.triangles} triangles`);
  }

  // ---- locked on a fresh save; unlocked for the test; the bot starts level 1 by itself
  await step(30);
  let st = await state();
  check(st.levels.length === 3 && !st.levels[0].unlocked && !!st.levels[0].need, 'level 1 is locked on a fresh save and says what it needs');
  check(await page.evaluate(() => window.__game.rush.start(1)) === false, 'G.rush.start(1) refuses while locked');
  await page.evaluate(() => window.__game.rush.debugUnlock());
  let guard = 0;
  st = await state();
  while (!st.active && st.runs === 0 && ++guard < 20) { await step(30); st = await state(); }
  await page.evaluate(() => { window.__autoplay.noRuns = true; });
  if (check(st.active, 'the bot starts level 1 by itself')) await verify(1, await playOut(1));

  // ---- levels 2 and 3 through the API
  for (const level of [2, 3]) {
    const ok = await page.evaluate((lv) => window.__game.rush.start(lv), level);
    if (!check(ok === true, `G.rush.start(${level}) returns true`)) continue;
    check(await page.evaluate((lv) => window.__game.rush.start(lv), level) === false, `G.rush.start(${level}) refuses while a rush is active`);
    await verify(level, await playOut(level));
  }
  const nx = await page.evaluate(() => {
    const G = window.__game;
    return { next: G.rush.next(), levels: G.rush.levels(), stars: G.save.meta.rushStars, saved: JSON.parse(JSON.stringify(G.state.rushes || {})) };
  });
  check(nx.next === null || nx.levels[nx.next - 1].stars < 3, 'G.rush.next() is null or a level with fewer than three stars');
  check(nx.stars === nx.levels.reduce((a, l) => a + l.stars, 0), `meta.rushStars totals the stars (${nx.stars})`);
  check([1, 2, 3].every((n) => nx.saved[n] && nx.saved[n].stars >= 1 && nx.saved[n].best > 0), 'G.state.rushes holds stars and best for the three levels');

  // ---- leaving in the middle of a rush pays nothing and returns to the world
  await page.evaluate(() => { window.__autoplay.hold = true; window.__game.rush.start(1); });
  await step(140);
  const mid = await page.evaluate(() => { const G = window.__game; const a = G.rush.active; G.rush.leave(); return a; });
  await step(40);
  st = await state();
  const left = await page.evaluate(() => window.__rt.runs[window.__rt.runs.length - 1]);
  check(mid && !st.active && st.mode === null && left && left.level === 1 && !left.done, 'leaving a rush in progress returns to the world with no reward');
  await page.evaluate(() => { window.__autoplay.hold = false; });

  // ---- 10 restarts in a row leak nothing on the GPU
  // (restarted behind the curtain, so the world does not play in between and add its own textures)
  await page.evaluate(() => window.__game.rush.start(1));
  await step(200);
  await page.waitForTimeout(200);
  const mem0 = await page.evaluate(() => ({ ...window.__game.renderer.info.memory }));
  let restarts = 0;
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate((lv) => window.__game.rush.retry(lv), 1 + ((i + 1) % 3))) restarts++;
    await step(200);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(200);
  const mem1 = await page.evaluate(() => ({ ...window.__game.renderer.info.memory }));
  check(restarts === 10, `10 restarts in a row (${restarts})`);
  check(mem1.geometries <= mem0.geometries && mem1.textures <= mem0.textures, `10 restarts leak nothing (geometries ${mem0.geometries} -> ${mem1.geometries}, textures ${mem0.textures} -> ${mem1.textures})`);
  await page.evaluate(() => window.__game.rush.leave());
  await step(40);
  st = await state();
  check(!st.active && st.mode === null, 'no rush is active at the end');
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
