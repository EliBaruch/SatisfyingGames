#!/usr/bin/env node
// Bloom Rush Raid test: in each world raid levels 1 to 3 are unlocked (G.raid.debugUnlock()), started
// through G.raid.start and played by the bot (src/autoplay.js steers with G.raid.botSteer() and presses
// CONTINUE). Checked for every raid: a locked level does not start, the raid ends, stars are 0..3, cash
// was added, the world stood still meanwhile (playTime, G.thrills), G.modes.active is null afterwards and
// the world resumes, draw calls and triangles stay inside the budget. Then: leaving in the middle of a
// raid, ten restarts in a row leak no geometries or textures, and there are no console or page errors.
// Usage: node tools/raidtest.js [--url=http://localhost:8100/] [--worlds=flower,chicken,...] [--shots=DIR]
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
    window.__autoplay.noRuns = true;      // levels are started from here, not by the bot
    if (!G.raid || !G.modes) return false;
    const T = (window.__rt = { raids: [], thrill: 0, open: null, peak: 0 });
    if (G.thrills) { const u = G.thrills.update; G.thrills.update = (dt) => { T.thrill++; return u(dt); }; }
    G.events.on('raid:start', (e) => { T.peak = 0; T.open = { level: e.level, money: G.state.money, play: G.state.playTime, thrill: T.thrill }; });
    G.events.on('raid:done', (e) => { T.open = { ...T.open, stars: e.stars, left: e.left, cash: e.cash, newStars: e.newStars, paid: G.state.money - T.open.money }; });
    G.events.on('mode:exit', () => {
      if (!T.open) return;
      T.raids.push({ ...T.open, playMoved: G.state.playTime - T.open.play, thrillMoved: T.thrill - T.open.thrill, done: T.open.stars !== undefined, peak: T.peak });
      T.open = null;
    });
    return true;
  });
  if (!check(has, 'G.raid and G.modes exist')) { await ctx.close(); return { world, fails, errors }; }

  const step = (n) => page.evaluate((k) => {
    const G = window.__game, T = window.__rt;
    for (let i = 0; i < k; i++) { G.step(1 / 60); if (G.raid.active && G.raid.state.liveN > T.peak) T.peak = G.raid.state.liveN; }
  }, n);
  const state = () => page.evaluate(() => {
    const G = window.__game, S = G.raid.state;
    return { active: G.raid.active, mode: G.modes.active ? G.modes.active.id : null, phase: G.raid.phase, raids: window.__rt.raids.length, live: S.liveN, wave: S.wave, waves: S.level ? S.level.waves : 0, levels: G.raid.levels() };
  });
  const render = async () => { await page.waitForTimeout(160); return page.evaluate(() => { const r = window.__game.renderer.info.render; return { calls: r.calls, triangles: r.triangles }; }); };
  let shotN = 0;
  const shoot = async (name) => { if (SHOTS) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOTS, `${world}-${++shotN}-${name}.png`) }); } };

  /** step until the raid in progress has ended (the bot steers and presses CONTINUE); samples the renderer on the way */
  async function playOut(level) {
    let peak = { calls: 0, triangles: 0 }, guard = 0, most = 0;
    for (;;) {
      await step(60);
      const st = await state();
      if (!st.active) break;
      // sample whenever the yard is busier than at the last sample
      if (st.phase === 'fight' && st.live > most + 6) {
        most = st.live;
        const r = await render();
        peak = { calls: Math.max(peak.calls, r.calls), triangles: Math.max(peak.triangles, r.triangles) };
        await shoot(`raid${level}-${st.live}`);
      }
      if (++guard > 240) { check(false, `raid ${level} did not end within ${guard} s`); await page.evaluate(() => window.__game.modes.abort()); break; }
    }
    return peak;
  }
  async function verify(level, peak) {
    const r = await page.evaluate((lv) => window.__rt.raids.filter((x) => x.level === lv).pop() || null, level);
    if (!check(!!r && r.done, `raid ${level} ended (raid:done)`)) return;
    check(Number.isInteger(r.stars) && r.stars >= 0 && r.stars <= 3, `raid ${level} stars 0..3 (got ${r.stars})`);
    check(r.cash > 0 && r.paid >= r.cash, `raid ${level} cash added (cash ${r.cash}, money moved ${r.paid})`);
    check(Math.abs(r.playMoved) < 1e-6, `raid ${level} playTime stood still (moved ${r.playMoved})`);
    check(r.thrillMoved === 0, `raid ${level} thrills stood still (${r.thrillMoved} updates)`);
    check(peak.calls > 0 && peak.calls <= BUDGET.calls && peak.triangles <= BUDGET.triangles, `raid ${level} render budget (${peak.calls} calls, ${peak.triangles} triangles)`);
    const st = await state();
    check(!st.active && st.mode === null, `raid ${level} G.modes.active is null afterwards`);
    const rec = st.levels.find((l) => l.n === level);
    check(rec && rec.stars >= r.stars && (r.stars === 0 || rec.best >= r.left), `raid ${level} saved (stars ${rec && rec.stars}, best ${rec && rec.best})`);
    // the world carries on: its clock, the thrills and the player
    const before = await page.evaluate(() => ({ play: window.__game.state.playTime, thrill: window.__rt.thrill }));
    await step(180);
    const after = await page.evaluate(() => ({ play: window.__game.state.playTime, thrill: window.__rt.thrill, hasThrills: !!window.__game.thrills }));
    check(after.play - before.play > 2.9, `raid ${level} playTime advances again (+${(after.play - before.play).toFixed(2)} s)`);
    check(!after.hasThrills || after.thrill - before.thrill === 180, `raid ${level} thrills update again (${after.thrill - before.thrill})`);
    console.log(`  raid ${level}: ${r.stars} star${r.stars === 1 ? '' : 's'}, ${r.left} left, cash ${r.cash}, up to ${r.peak} pests, peak ${peak.calls} calls / ${peak.triangles} triangles`);
  }

  // a little play first, so the world is running and has an income for the rewards
  await step(600);
  await shoot('world');

  for (const level of [1, 2, 3]) {
    const locked = await page.evaluate((lv) => { const G = window.__game; G.raid.debugUnlock(false); return G.raid.levels()[lv - 1].unlocked ? null : G.raid.start(lv); }, level);
    check(locked === null || locked === false, `raid ${level} does not start while locked`);
    const ok = await page.evaluate((lv) => { const G = window.__game; G.raid.debugUnlock(); return G.raid.start(lv); }, level);
    if (!check(ok === true, `G.raid.start(${level}) returns true`)) continue;
    check(await page.evaluate((lv) => window.__game.raid.start(lv), level) === false, `G.raid.start(${level}) refuses while a raid is active`);
    await verify(level, await playOut(level));
  }
  const nx = await page.evaluate(() => ({ next: window.__game.raid.next(), levels: window.__game.raid.levels(), stars: window.__game.save.meta.raidStars, saved: window.__game.state.raids }));
  check(nx.next === null || nx.levels[nx.next - 1].stars < 3, 'G.raid.next() is null or a level with fewer than three stars');
  check(nx.stars === nx.levels.reduce((a, l) => a + l.stars, 0), `meta.raidStars totals the stars (${nx.stars})`);
  check(nx.saved && typeof nx.saved === 'object', 'G.state.raids holds the records');

  // ---- leaving in the middle of a raid
  await page.evaluate(() => { window.__autoplay.hold = true; window.__game.raid.start(1); });
  await step(300);
  const mid = await page.evaluate(() => { const G = window.__game; const a = G.raid.active && G.raid.phase === 'fight'; G.raid.leave(); return a; });
  await step(40);
  let st = await state();
  check(mid && !st.active && st.mode === null, 'leaving a raid in progress returns to the world');
  await page.evaluate(() => { window.__autoplay.hold = false; });

  // ---- 10 raids in a row leak nothing on the GPU
  // (restarted behind the curtain, so the world does not play in between and add its own textures)
  await page.evaluate(() => window.__game.raid.start(1));
  await step(420);
  await page.waitForTimeout(200);
  const mem0 = await page.evaluate(() => ({ ...window.__game.renderer.info.memory }));
  let restarts = 0;
  for (let i = 0; i < 10; i++) {
    if (await page.evaluate((lv) => window.__game.raid.retry(lv), 1 + ((i + 1) % 3))) restarts++;
    await step(420);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  const mem1 = await page.evaluate(() => ({ ...window.__game.renderer.info.memory }));
  check(restarts === 10, `10 restarts in a row (${restarts})`);
  check(mem1.geometries <= mem0.geometries && mem1.textures <= mem0.textures, `10 raids leak nothing (geometries ${mem0.geometries} -> ${mem1.geometries}, textures ${mem0.textures} -> ${mem1.textures})`);
  await page.evaluate(() => window.__game.raid.leave());
  await step(40);
  st = await state();
  check(!st.active && st.mode === null, 'no raid is active at the end');
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
