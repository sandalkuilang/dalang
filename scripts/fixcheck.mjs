#!/usr/bin/env node
// A fixer's proof in one call (review.md step 3, express.md "Fix rounds"): the group built fresh from its template, its
// checks, then stills at the times its findings name. A fixer once snapshotted before the template was filled and judged
// the old build; another returned "UNVERIFIED" and the next review round paid for the check. Here the build runs first and
// the stills folder is emptied, so a failed snapshot leaves no old sheet behind.
// Usage: node fixcheck.mjs <group> [dir] [--at t1,t2,…]   (default: every t= of review/fixes-<group>.md)
// Prints SHEET (open it once) and one LOOK line per finding; the fixer reports each finding PASS (what the still shows)
// or FAIL. A finding no still shows is FAIL, never "unverified".
// Exit 0 built and snapped, 1 a step failed (named), 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFindings, timeOf } from './findings.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const atArg = opt('--at', null);
const [group, dirArg] = args;
const dir = path.resolve(dirArg ?? '.');
const tpl = `src/compositions/${group}.tpl.html`;
const usage = why => { console.error(`Usage: node fixcheck.mjs <group> [dir] [--at t1,t2,…] (${why})`); process.exit(2); };
if (!group) usage('no group');
if (!existsSync(path.join(dir, tpl))) usage(`no ${tpl}`);
const ff = path.join(dir, 'review', `fixes-${group}.md`);
const { findings } = parseFindings(existsSync(ff) ? readFileSync(ff, 'utf8') : '');
// --at takes seconds or m:ss, like a finding's t=
const times = [...new Set((atArg ? atArg.split(',').map(s => timeOf(`t=${s.trim()}`)) : findings.map(f => f.t)).filter(t => t !== null))]
  .sort((a, b) => a - b).map(t => t.toFixed(2));
if (!times.length) usage(`no times: pass --at, or write t=<s> in review/fixes-${group}.md`);

let failed = 0;
const step = (name, bin, argv, filter = () => true) => {
  const r = spawnSync(bin, argv, { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'OK    ' : 'FAILED'} ${name}`);
  if (!ok) `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? r.error.message : ''}`.split('\n').filter(l => l.trim() && filter(l)).slice(-12).forEach(l => console.log(`       ${l.slice(0, 240)}`));
};
const node = (s, ...a) => [process.execPath, [path.join(HERE, s), ...a]];
// emptied before the build: a failed build or snapshot leaves no old sheet to judge
const out = `review/fixcheck/${group}`;
rmSync(path.join(dir, out), { recursive: true, force: true });
mkdirSync(path.join(dir, out), { recursive: true });
step('fill_times host', ...node('fill_times.mjs', 'src/index.tpl.html', 'index.html'));
step(`fill_times ${group}`, ...node('fill_times.mjs', tpl, `compositions/${group}.html`));
step('lint_scene', ...node('lint_scene.mjs', '.'));
if (existsSync(path.join(dir, 'assets/iso.js'))) step(`film_gate --group ${group}`, ...node('film_gate.mjs', '.', '--group', group), l => /^(FAILED|WARN)/.test(l));
if (existsSync(path.join(dir, 'assets/machine.js'))) step('machine_audit', ...node('machine_audit.mjs', '.'), l => /PROBLEM|WARN|Result/.test(l));
let sheet = null;
if (!failed) {
  step(`snapshot ${times.join(', ')} s`, 'npx', ['hyperframes', 'snapshot', '--at', times.join(','), '--no-end', '--describe', 'false', '-o', `${out}/`]);
  sheet = readdirSync(path.join(dir, out)).find(f => /^contact-sheet.*\.jpg$/.test(f)) ?? null;
  if (!failed && !sheet) { failed++; console.log(`FAILED no contact sheet in ${out}/: the snapshot made none, rerun`); }
}
if (!failed) {
  console.log(`SHEET  ${out}/${sheet}: open it once`);
  for (const f of findings) console.log((f.t === null ? `LOOK   no time (pass --at): ${f.sev} ${f.test}: ${f.change}` : `LOOK   t=${f.t} ${f.sev} ${f.test}: ${f.change}`).slice(0, 240));
}
console.log(failed ? `Result: ${failed} step(s) FAILED: no still is proof until these pass` : 'Result: OK; report each finding PASS (what the still shows) or FAIL');
process.exit(failed ? 1 : 0);
