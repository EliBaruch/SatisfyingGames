#!/usr/bin/env node
// Release guard: the only way the game should reach https://bloom-rush-game.netlify.app.
// It exists because a deploy once replaced the live game with a branch that did not contain what was live
// (the thrills, trophies, the town world and the bonus levels vanished). See RELEASES.md and CLAUDE.md.
//
//   node tools/release.js check [--quick] [--live-commit=<sha>]
//       Gates before a deploy. Fails (exit 1) unless ALL hold:
//       1. the working tree is clean and HEAD is the tip of the release branch on origin;
//       2. everything that is live is inside HEAD: the commit in the live site's /release.json (or
//          --live-commit, for a site deployed before release.json existed) is an ancestor of HEAD;
//       3. no other branch on origin has commits that were deployed but are missing here (a warning lists
//          every branch with work HEAD does not contain, so nothing is dropped by accident);
//       4. every world in src/engine/worlds.js is won by the test bot with no errors or stuck events,
//          and the bonus-level tests pass (--quick skips the playtests; never use it for a real release).
//       On success it writes release.json (commit, branch, date) into the folder that gets uploaded.
//   node tools/release.js verify [--deploy=<netlify deploy id>]
//       After the upload: the live /release.json must name HEAD, and the title screen and every world must
//       start in a browser without errors. On success it appends the release to RELEASES.md.
//
// Needs a local server for the playtests: python3 -m http.server 8100
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RELEASE_BRANCH = 'claude/clever-allen-0k86le';
const LIVE = 'https://bloom-rush-game.netlify.app';
const args = {};
for (const a of process.argv.slice(3)) { const m = a.match(/^--([^=]+)(?:=(.*))?$/); if (m) args[m[1]] = m[2] === undefined ? true : m[2]; }
const cmd = process.argv[2];

const sh = (c) => execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const ok = (c) => { try { execSync(c, { cwd: ROOT, stdio: 'ignore' }); return true; } catch (e) { return false; } };
const fails = [];
const gate = (name, pass, detail) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`); if (!pass) fails.push(name); };

async function liveRelease() {
  try {
    const r = await fetch(LIVE + '/release.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

function worldIds() {
  const src = fs.readFileSync(path.join(ROOT, 'src/engine/worlds.js'), 'utf8');
  return [...src.matchAll(/\{\s*id:\s*'([a-z0-9_-]+)'/g)].map((m) => m[1]);
}

async function check() {
  sh('git fetch -q origin');
  const head = sh('git rev-parse HEAD');
  // 1. clean tree, at the tip of the release branch
  const dirty = sh('git status --porcelain --untracked-files=no');
  gate('working tree clean', !dirty, dirty ? dirty.split('\n').length + ' changed files' : '');
  const tip = sh(`git rev-parse origin/${RELEASE_BRANCH}`);
  gate(`HEAD is the tip of origin/${RELEASE_BRANCH}`, head === tip, head === tip ? head.slice(0, 7) : `HEAD ${head.slice(0, 7)}, origin ${tip.slice(0, 7)}: merge into the release branch and push first`);
  // 2. what is live is contained in HEAD
  const live = await liveRelease();
  const liveCommit = (live && live.commit) || args['live-commit'] || null;
  if (!liveCommit) gate('live commit known', false, `${LIVE}/release.json is missing; pass --live-commit=<sha> of what is live`);
  else {
    const known = ok(`git cat-file -e ${liveCommit}^{commit}`);
    const inside = known && ok(`git merge-base --is-ancestor ${liveCommit} HEAD`);
    gate('everything live is in HEAD', inside, known ? `live ${liveCommit.slice(0, 7)}${live ? ' (from release.json)' : ' (given)'}` : `live commit ${liveCommit} is not in this clone: fetch the branch it came from`);
  }
  // 3. other branches with work not in HEAD (a warning: not every branch is meant to ship)
  const branches = sh('git branch -r --format="%(refname:short)"').split('\n').filter((b) => b && !b.endsWith('/HEAD'));
  for (const b of branches) {
    const n = +sh(`git rev-list --count HEAD..${b}`);
    if (n > 0) console.log(`WARN  ${b} has ${n} commit(s) not in HEAD (last: ${sh(`git log -1 --format="%h %ad %s" --date=short ${b}`)})`);
  }
  // 4. every world wins, the bonus levels pass
  if (args.quick) console.log('SKIP  playtests (--quick: not for a real release)');
  else {
    for (const w of worldIds()) {
      const r = spawnSync('node', ['tools/playtest.js', `--world=${w}`, '--max=2700'], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60 * 1000 });
      const out = (r.stdout || '') + (r.stderr || '');
      const won = /WON at sim time ([0-9:]+)/.exec(out);
      const errs = /=== ERRORS ===\s*\n(?!none)/.test(out);
      const stuck = /=== STUCK EVENTS ===\s*\n(?!none)/.test(out);
      gate(`playtest ${w}`, !!won && !errs && !stuck, won ? `won ${won[1]}${errs ? ', errors' : ''}${stuck ? ', stuck' : ''}` : 'not won');
    }
    for (const t of ['runtest', 'raidtest', 'rushtest']) {
      if (!fs.existsSync(path.join(ROOT, 'tools', t + '.js'))) continue;
      const r = spawnSync('node', [`tools/${t}.js`], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60 * 1000 });
      gate(t, r.status === 0, r.status === 0 ? '' : ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-3).join(' / '));
    }
  }
  if (fails.length) { console.log(`\nNOT READY: ${fails.length} gate(s) failed. Do not deploy.`); process.exit(1); }
  const rel = { commit: head, branch: RELEASE_BRANCH, date: new Date().toISOString(), subject: sh('git log -1 --format=%s') };
  fs.writeFileSync(path.join(ROOT, 'release.json'), JSON.stringify(rel, null, 2) + '\n');
  console.log(`\nREADY: release.json written for ${head.slice(0, 7)}. Upload this folder to Netlify, then run: node tools/release.js verify --deploy=<id>`);
}

async function verify() {
  const head = sh('git rev-parse HEAD');
  const live = await liveRelease();
  gate('live release.json names HEAD', !!live && live.commit === head, live ? `live ${String(live.commit).slice(0, 7)}` : 'no release.json on the live site');
  const { chromium } = require('playwright');
  const b = await chromium.launch();
  for (const q of ['', ...worldIds().map((w) => `?world=${w}&unlock=1`)]) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })).newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    let world = null;
    try {
      await p.goto(LIVE + '/' + q, { waitUntil: 'load' });
      await p.waitForFunction(() => window.__game && window.__game.step, null, { timeout: 45000 });
      world = await p.evaluate(() => { const G = window.__game; G.timeScale = 0; for (let i = 0; i < 600; i++) G.step(1 / 60); return G.worldId; });
    } catch (e) { errs.push(e.message.split('\n')[0]); }
    gate(`live ${q || 'title'}`, !errs.length && !!world, errs.length ? errs.slice(0, 2).join(' | ') : world);
    await p.close();
  }
  await b.close();
  if (fails.length) { console.log(`\nLIVE CHECK FAILED: ${fails.join(', ')}. Fix forward and redeploy.`); process.exit(1); }
  const line = `| ${new Date().toISOString().slice(0, 16).replace('T', ' ')} | \`${head.slice(0, 7)}\` | ${args.deploy ? '`' + args.deploy + '`' : '-'} | ${sh('git log -1 --format=%s')} |\n`;
  fs.appendFileSync(path.join(ROOT, 'RELEASES.md'), line);
  console.log('\nLIVE OK. Added to RELEASES.md: commit and push it.');
}

(cmd === 'check' ? check() : cmd === 'verify' ? verify() : Promise.resolve(console.log('usage: node tools/release.js check|verify'))).catch((e) => { console.error(e); process.exit(1); });
