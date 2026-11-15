#!/usr/bin/env node
// Bloom Rush asset fetcher (no dependencies).
//
//   node tools/fetch-assets.mjs                 fetch everything in assets/manifest.json
//   node tools/fetch-assets.mjs flower common    only these manifest groups
//   node tools/fetch-assets.mjs --force          re-download files that already exist
//   node tools/fetch-assets.mjs --engine         use the larger "engine" tier (plain glTF, no meshopt/WebP)
//   node tools/fetch-assets.mjs --licenses       only rewrite assets/LICENSES.md
//
// manifest.json: { groups: { <group>: [ { source: 'kenney'|'quaternius', id: '<kit>/<name>', as?: '<name>' } ] } }
//   -> downloads the model's web-tier GLB from the Hugging Face dataset
//      codepawl/<kenney|quaternius>-glb into assets/<kit>/<as || name>.glb.
//
// Download uses `curl -L` (works through the sandbox proxy). If curl is not installed it falls
// back to Node fetch, which needs the proxy switched on:  NODE_USE_ENV_PROXY=1 node tools/fetch-assets.mjs
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const HF = 'https://huggingface.co/datasets/codepawl';
const REPO = { kenney: 'kenney-glb', quaternius: 'quaternius-glb' };
const CONCURRENCY = 8;

const KITS = {
  // slug -> [display name, author, page]
  'mini-characters': ['Mini Characters', 'Kenney', 'https://kenney.nl/assets/mini-characters'],
  'mini-shop': ['Mini Shop', 'Kenney', 'https://kenney.nl/assets/mini-shop'],
  'mini-forest': ['Mini Forest', 'Kenney', 'https://kenney.nl/assets/mini-forest'],
  'food-kit': ['Food Kit', 'Kenney', 'https://kenney.nl/assets/food-kit'],
  'cube-pets': ['Cube Pets', 'Kenney', 'https://kenney.nl/assets/cube-pets'],
  'car-kit': ['Car Kit', 'Kenney', 'https://kenney.nl/assets/car-kit'],
  'factory-kit': ['Factory Kit', 'Kenney', 'https://kenney.nl/assets/factory-kit'],
  'nature-kit': ['Nature Kit', 'Kenney', 'https://kenney.nl/assets/nature-kit'],
  farmbuildings: ['Farm Buildings Pack', 'Quaternius', 'https://quaternius.com/packs/farmbuildings.html'],
  cutemonsters: ['Cute Animated Monsters Pack', 'Quaternius', 'https://quaternius.com/packs/cutemonsters.html'],
  ultimatecrops: ['Ultimate Crops Pack', 'Quaternius', 'https://quaternius.com/packs/ultimatecrops.html'],
  simplenature: ['Simple Nature Pack', 'Quaternius', 'https://quaternius.com/packs/simplenature.html'],
};

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const wantGroups = args.filter((a) => !a.startsWith('--'));
const FORCE = flags.has('--force');
const TIER = flags.has('--engine') ? 'engine' : 'objects'; // "objects" is the web tier (files.web)

function curl(url, dest) {
  return new Promise((resolve, reject) => {
    execFile('curl', ['-sSL', '--fail', '--retry', '2', '-o', dest, url], (err, _o, stderr) => {
      if (err) { err.stderr = stderr; reject(err); } else resolve();
    });
  });
}

async function nodeFetch(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
}

let useFetch = false;
async function download(url, dest) {
  if (!useFetch) {
    try { await curl(url, dest); return; } catch (e) {
      if (e.code !== 'ENOENT') throw e; // curl exists but the request failed
      useFetch = true; // curl missing -> Node fetch (needs NODE_USE_ENV_PROXY=1 behind the proxy)
    }
  }
  await nodeFetch(url, dest);
}

async function isGlb(file) {
  const fh = await fs.open(file, 'r');
  try {
    const b = Buffer.alloc(4);
    await fh.read(b, 0, 4, 0);
    return b.toString('latin1') === 'glTF';
  } finally { await fh.close(); }
}

function plan(manifest) {
  const groups = manifest.groups || {};
  const names = wantGroups.length ? wantGroups : Object.keys(groups);
  const items = new Map(); // key -> item
  for (const g of names) {
    if (!groups[g]) throw new Error(`manifest has no group "${g}" (have: ${Object.keys(groups).join(', ')})`);
    for (const e of groups[g]) {
      if (!REPO[e.source]) throw new Error(`bad source in ${JSON.stringify(e)}`);
      const [kit, ...rest] = e.id.split('/');
      const tail = rest.join('/');
      const name = e.as || tail;
      const key = `${kit}/${name}`;
      if (!items.has(key)) {
        const stem = `${kit}__${tail}`;
        items.set(key, { ...e, kit, name, key, stem, groups: [g], dest: path.join(ASSETS, kit, `${name}.glb`) });
      } else items.get(key).groups.push(g);
    }
  }
  return [...items.values()];
}

async function fetchOne(it) {
  if (!FORCE) {
    try { const st = await fs.stat(it.dest); if (st.size > 0 && await isGlb(it.dest)) return { it, status: 'exists', bytes: st.size }; } catch { /* missing */ }
  }
  await fs.mkdir(path.dirname(it.dest), { recursive: true });
  const tmp = `${it.dest}.part`;
  const tiers = TIER === 'engine' ? ['engine'] : ['objects', 'engine'];
  let lastErr;
  for (const tier of tiers) {
    const url = `${HF}/${REPO[it.source]}/resolve/main/${tier}/${it.stem}/${it.stem}.glb`;
    try {
      await download(url, tmp);
      if (!(await isGlb(tmp))) throw new Error('downloaded file is not a GLB (missing glTF magic)');
      await fs.rename(tmp, it.dest);
      const st = await fs.stat(it.dest);
      return { it, status: tier === 'objects' ? 'ok' : 'ok (engine tier)', bytes: st.size };
    } catch (e) { lastErr = e; await fs.rm(tmp, { force: true }); }
  }
  return { it, status: 'FAILED', bytes: 0, error: String(lastErr && (lastErr.stderr || lastErr.message || lastErr)).trim() };
}

async function writeLicenses(manifest, items) {
  const byKit = new Map();
  for (const it of items) { if (!byKit.has(it.kit)) byKit.set(it.kit, []); byKit.get(it.kit).push(it); }
  const lines = [];
  lines.push('# Asset licenses', '');
  lines.push('All 3D models in this folder are released under **CC0 1.0 Universal (public domain dedication)**:');
  lines.push('https://creativecommons.org/publicdomain/zero/1.0/', '');
  lines.push('Credit is not required, but we gladly give it:', '');
  lines.push('- **Kenney** (https://kenney.nl) - Mini Characters, Mini Shop, Mini Forest, Food Kit, Cube Pets, Car Kit, Factory Kit, Nature Kit.');
  lines.push('- **Quaternius** (https://quaternius.com) - Farm Buildings Pack, Cute Animated Monsters Pack, Ultimate Crops Pack, Simple Nature Pack.', '');
  lines.push('The files were obtained from the Hugging Face dataset mirrors `codepawl/kenney-glb` and `codepawl/quaternius-glb`',
    '(web tier: meshopt-compressed geometry, WebP textures). Geometry and textures are unmodified.', '');
  lines.push('## Kits in use', '');
  lines.push('| Kit | Author | Models | Source |', '|---|---|---|---|');
  const kits = [...byKit.keys()].sort();
  for (const k of kits) {
    const [title, author, url] = KITS[k] || [k, 'unknown', ''];
    lines.push(`| ${title} (\`${k}\`) | ${author} | ${byKit.get(k).length} | ${url} |`);
  }
  lines.push('', '## Files', '');
  for (const k of kits) {
    const [title, author] = KITS[k] || [k, 'unknown'];
    lines.push(`### ${title} - ${author} - CC0 1.0`, '');
    lines.push(byKit.get(k).map((it) => `\`${it.name}\``).sort().join(', '), '');
  }
  lines.push('_Generated by `tools/fetch-assets.mjs` from `assets/manifest.json`. Do not edit by hand._', '');
  await fs.writeFile(path.join(ASSETS, 'LICENSES.md'), lines.join('\n'));
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const allItems = plan({ groups: manifest.groups }); // licenses always cover the whole manifest
  const items = wantGroups.length ? plan(manifest) : allItems;
  if (flags.has('--licenses')) { await writeLicenses(manifest, allItems); console.log('wrote assets/LICENSES.md'); return; }

  const results = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const it = items[next++];
      const r = await fetchOne(it);
      results.push(r);
      const kb = (r.bytes / 1024).toFixed(1).padStart(7);
      console.log(`${r.status.padEnd(16)} ${kb} KB  ${it.key}${r.error ? '  <- ' + r.error : ''}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));

  const failed = results.filter((r) => r.status === 'FAILED');
  const fetched = results.filter((r) => r.status.startsWith('ok'));
  const total = results.reduce((s, r) => s + r.bytes, 0);
  await writeLicenses(manifest, allItems);
  console.log(`\n${items.length} models: ${fetched.length} downloaded, ${results.length - fetched.length - failed.length} already present, ${failed.length} failed.`);
  console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB  (assets/LICENSES.md rewritten)`);
  if (failed.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
