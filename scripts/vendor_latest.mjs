#!/usr/bin/env node
// Keeps the engine's pinned bundle sources (engine/three/vendor/package.json) on their latest releases, three.js first.
//   node vendor_latest.mjs            -> one line per package: ok, behind (pinned → latest) or capped; exit 0 (a check never blocks)
//   node vendor_latest.mjs --update   -> writes the latest versions into package.json and runs `npm install` there (the owner's
//                                        standing consent for three.js and its add-ons); then run engine/three/selfcheck.mjs
// "Latest" for three.js is the newest release the add-ons accept: postprocessing declares a three peer range, and an
// install past it breaks. When the newest three is outside that range the line says `capped` and names the package to wait for.
// npm unreachable or an odd reply: `unknown ... rerun`, never "behind" and never a changed file.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const vendor = path.join(HERE, '..', 'engine', 'three', 'vendor'), file = path.join(vendor, 'package.json');
const update = process.argv.includes('--update');
const pkg = JSON.parse(readFileSync(file, 'utf8'));
const groups = ['dependencies', 'devDependencies'].filter(g => pkg[g]);

const num = v => String(v).split(/[.-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
const cmp = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
// a peer range of the forms this tree uses: ">=a <b", ">=a", "^a"
const within = (v, range) => String(range).replace(/(>=|<=|>|<|\^|=)\s+/g, '$1').trim().split(/\s+/).every(c => {
  const m = c.match(/^(>=|<=|>|<|\^|=)?v?(\d[\w.-]*)$/); if (!m) return true;
  const [, op = '=', r] = m, d = cmp(v, r);
  return op === '>=' ? d >= 0 : op === '<=' ? d <= 0 : op === '>' ? d > 0 : op === '<' ? d < 0 : op === '^' ? d >= 0 : d === 0;
});
const npm = (...a) => { const r = spawnSync('npm', ['view', ...a, '--json'], { encoding: 'utf8', timeout: 60000 }); if (r.status !== 0) return null; try { return JSON.parse(r.stdout); } catch { return null; } };

const out = [], next = {}; let unknown = 0;
const latest = {};
for (const g of groups) for (const name of Object.keys(pkg[g])) { const v = npm(name, 'version'); latest[name] = typeof v === 'string' ? v : null; if (!latest[name]) unknown++; }

// the three release the add-ons allow: every pinned add-on's own peer range, read at the add-on's latest version
let three = latest.three;
for (const name of Object.keys(latest)) {
  if (name === 'three' || !latest[name] || !three) continue;
  const peers = npm(`${name}@${latest[name]}`, 'peerDependencies');
  if (peers && peers.three && !within(three, peers.three)) {
    out.push(`capped three ${pkg.dependencies.three}: newest is ${three}, but ${name}@${latest[name]} supports three ${peers.three}; wait for ${name}`);
    const all = npm('three', 'versions');
    three = Array.isArray(all) ? all.filter(v => /^\d+\.\d+\.\d+$/.test(v) && within(v, peers.three)).sort(cmp).pop() ?? null : null;
  }
}
for (const g of groups) for (const [name, pinned] of Object.entries(pkg[g])) {
  const want = name === 'three' ? three : latest[name];
  if (!want) { out.push(`unknown ${name} ${pinned}: could not read npm, rerun`); continue; }
  if (cmp(want, pinned) > 0) { out.push(`behind ${name} ${pinned} → ${want}`); next[name] = want; g === 'dependencies' && (pkg[g][name] = want); g === 'devDependencies' && (pkg[g][name] = want); }
  else out.push(`ok ${name} ${pinned}`);
}
console.log(out.join('\n'));
if (update && Object.keys(next).length) {
  writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: vendor, stdio: 'inherit' });
  if (r.status !== 0) { console.log('FAILED npm install: package.json is updated; fix it or `git checkout engine/three/vendor/package.json`'); process.exit(1); }
  console.log(`updated ${Object.keys(next).join(', ')}: now run node engine/three/build.mjs <dir> && node engine/three/selfcheck.mjs <dir>`);
}
else if (update) console.log('nothing to update');
