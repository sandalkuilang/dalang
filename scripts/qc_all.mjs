#!/usr/bin/env node
// Step 7's measured checks on the draft in one call: stillness, loudness, audio_qc (--mix), qc (--size from BRIEF.md),
// timing_lint, lint_scene and scopes (--png), run side by side. One line per check (PASS, FAIL or WARN) and, under a
// FAIL or WARN only, that check's own problem lines, so the main agent reads seven lines, not seven logs. Each script
// stays runnable alone with its own flags (qc.md); this only calls them.
//
// Usage: node qc_all.mjs <draft.mp4> [project] [--size WxH] [--allow a-b]...
//   project   the film folder (default .): index.html, audio/, BRIEF.md
//   --size    expected canvas; default from BRIEF.md's platform (9:16 1080x1920, 16:9 1920x1080, 4:5 1080x1350)
//   --allow   a planned pause for stillness.mjs, once per pause
// A check's exit: 0 PASS; 2 WARN (could not run or read: fix the named cause, rerun; never a pass); any other FAIL.
// Exit 0 every check passed, 1 a check FAILED, 2 none failed but one could not run (WARN), 64 usage.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const allow = [];
for (let i = args.indexOf('--allow'); i >= 0; i = args.indexOf('--allow')) allow.push(...args.splice(i, 2).slice(1));
const si = args.indexOf('--size');
let size = si >= 0 ? args.splice(si, 2)[1] : null;
const [draftArg, dirArg] = args;
if (!draftArg || args.some(a => a.startsWith('--'))) { console.error('Usage: node qc_all.mjs <draft.mp4> [project] [--size WxH] [--allow a-b]...'); process.exit(64); }
const dir = path.resolve(dirArg ?? '.');
const draft = path.resolve(draftArg);
if (!existsSync(draft)) { console.log(`FAIL   draft: ${draftArg} not found (render it first)\nResult: 1 check(s) FAILED`); process.exit(1); }
if (!size) {
  let brief = '';
  try { brief = readFileSync(path.join(dir, 'BRIEF.md'), 'utf8'); } catch { /* no brief: size only reported */ }
  const p = (brief.match(/^\W*platform\W*:(.*)$/im)?.[1] ?? '').toLowerCase();
  size = !p ? null : /landscape|16:9|youtube(?! short)/.test(p) ? '1920x1080' : /feed|4:5/.test(p) ? '1080x1350' : '1080x1920';
}

const CHECKS = [
  ['stillness', 'stillness.mjs', [draft, ...allow.flatMap(a => ['--allow', a])]],
  ['loudness', 'loudness.mjs', [draft]],
  ['audio_qc', 'audio_qc.mjs', ['.', '--mix', draft]],
  [`qc${size ? ` (${size})` : ' (size not in BRIEF.md: reported only)'}`, 'qc.mjs', [draft, ...(size ? ['--size', size] : [])]],
  ['timing_lint', 'timing_lint.mjs', ['index.html']],
  ['lint_scene', 'lint_scene.mjs', ['.']],
  ['scopes', 'scopes.mjs', [draft, '--png']],
];
const run = ([name, script, argv]) => new Promise(res => {
  const c = spawn(process.execPath, [path.join(HERE, script), ...argv], { cwd: dir });
  let out = '';
  c.stdout.on('data', d => { out += d; });
  c.stderr.on('data', d => { out += d; });
  c.on('error', e => res({ name, code: 2, out: `could not start: ${e.message}` }));
  c.on('close', code => res({ name, code: code ?? 2, out }));
});
// the problem lines of a check's output; none matched → its last lines
const PROBLEM = /FAIL|PROBLEM|WARN|FLAG|ERROR|NEEDS|✗|expected|outside|crushed|clipped|jump|inside a word|shorter than/i;
const details = out => {
  const lines = out.split('\n').map(l => l.trimEnd()).filter(l => l.trim());
  const hit = lines.filter(l => PROBLEM.test(l));
  return (hit.length ? hit : lines.slice(-6)).slice(0, 12);
};

const results = await Promise.all(CHECKS.map(run));
let failed = 0, warned = 0;
for (const r of results) {
  const tag = r.code === 0 ? 'PASS' : r.code === 2 ? 'WARN' : 'FAIL';
  if (tag === 'FAIL') failed++; else if (tag === 'WARN') warned++;
  console.log(`${tag.padEnd(6)} ${r.name}${tag === 'PASS' ? '' : ` (exit ${r.code})`}`);
  if (tag !== 'PASS') details(r.out).forEach(l => console.log(`       ${l.trim().slice(0, 240)}`));
}
console.log(failed ? `Result: ${failed} check(s) FAILED${warned ? `, ${warned} not checked (WARN: rerun)` : ''}` : warned ? `Result: ${warned} check(s) not checked (WARN: fix the cause, rerun)` : 'Result: OK');
process.exit(failed ? 1 : warned ? 2 : 0);
