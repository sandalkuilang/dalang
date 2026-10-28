#!/usr/bin/env node
// Express's mechanical steps as one call each, so the main agent spends its turns on the script, the SPEC and the
// verdicts, not on chains of small commands it has to remember (every main-agent turn re-reads the whole session).
// Each prints one line per check and only the lines that failed.
//
// Usage: node express.mjs after-voice [dir] [--log <file>]   (default: the newest voice-*.log, the last retake's)
//          the take's WARNING lines (none → go on), pad_voice, captions (format from BRIEF.md), gates 1–2 by agent
//        node express.mjs assemble [dir]
//          fill_times on the host and every group, lint_scene, timing_lint, hyperframes lint (errors only), gate 3,
//          the tokens spent so far (over 8M: no fix round);
//          a failure is printed under its group, for that group's builder
//        node express.mjs final [dir]
//          the files changed since assemble (review/assembled.json: the world and every group, by sha256), for the main
//          agent to check against the fix round's assignments; hyperframes check and check_assets first (no render on a
//          failure), render (BRIEF.md fps, --quality looks), gate 4, the metrics table
// Exit 0 all passed, 1 a check failed (named), 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const logArg = opt('--log');
const [cmd, dirArg] = args;
const dir = path.resolve(dirArg ?? '.');
if (!['after-voice', 'assemble', 'final'].includes(cmd)) { console.error('Usage: node express.mjs after-voice|assemble|final [dir]'); process.exit(2); }

if (!existsSync(path.join(dir, 'audio/beats.json'))) { console.log('FAILED no take yet: audio/beats.json is missing (tts_timestamps.mjs first)\nResult: 1 step(s) FAILED'); process.exit(1); }
const brief = existsSync(path.join(dir, 'BRIEF.md')) ? readFileSync(path.join(dir, 'BRIEF.md'), 'utf8') : '';
let failed = 0;
// one step: its name, OK or FAILED with the last lines of its output
const step = (name, bin, argv, { keep = 6, quiet = false, filter } = {}) => {
  const r = spawnSync(bin, argv, { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  let out = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter(l => l.trim() && !/^npm warn/i.test(l));
  if (filter) out = out.filter(filter);
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'OK    ' : 'FAILED'} ${name}`);
  if (!ok || !quiet) out.slice(-keep).forEach(l => console.log(`       ${l.slice(0, 240)}`));
  return { ok, out };
};
const node = (script, ...a) => [process.execPath, [path.join(HERE, script), ...a]];
// the work a fix round may touch: the world and every built group, each by its sha256
const LOCK = path.join(dir, 'review', 'assembled.json');
const sha = f => createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex');
const locked = () => ['assets/world.js', ...(existsSync(path.join(dir, 'compositions')) ? readdirSync(path.join(dir, 'compositions')).filter(f => f.endsWith('.html')).map(f => `compositions/${f}`) : [])].filter(f => existsSync(path.join(dir, f)));
const gate = n => {
  if (spawnSync(process.execPath, [path.join(HERE, 'state.mjs'), 'check', String(n), dir]).status === 0) return console.log(`OK     gate ${n} (approved, fresh)`);
  step(`gate ${n} by agent`, ...node('state.mjs', 'approve', String(n), dir, '--by', 'agent'), { keep: 2 });
};

if (cmd === 'after-voice') {
  // the newest take log: a retake writes its own, and the first take's WARNING lines are no longer the film's
  const log = logArg ?? readdirSync(dir).filter(f => /^voice-.*\.log$/.test(f)).sort((a, b) => statSync(path.join(dir, b)).mtimeMs - statSync(path.join(dir, a)).mtimeMs)[0] ?? 'voice-take.log';
  const lf = path.join(dir, log);
  const warns = existsSync(lf) ? readFileSync(lf, 'utf8').split('\n').filter(l => /WARNING/.test(l)) : null;
  if (warns === null) console.log(`WARN   ${log} not found: the take's warnings were not read (start the take with > ${log} 2>&1)`);
  else if (warns.length) { failed++; console.log(`FAILED the take has ${warns.length} WARNING line(s): respell once, --retake changed (express.md Steps 3–4)`); warns.slice(0, 6).forEach(l => console.log(`       ${l.slice(0, 240)}`)); }
  else console.log(`OK     take: no WARNING (${log})`);
  if (!failed) {
    const p = (brief.match(/^\W*platform\W*:(.*)$/im)?.[1] ?? '').toLowerCase();
    const format = /landscape|16:9|youtube(?! short)/.test(p) ? 'landscape' : /feed|4:5/.test(p) ? 'feed' : /short|tiktok/.test(p) ? 'shorts' : 'reels';
    step('pad_voice', ...node('pad_voice.mjs', '.'), { quiet: true });
    step(`captions (${format})`, ...node('captions.mjs', 'narration.txt', 'audio/words.json', '--out', 'audio', '--format', format), { quiet: true });
    if (!failed) { gate(1); gate(2); }
  }
} else if (cmd === 'assemble') {
  const groups = existsSync(path.join(dir, 'src/compositions')) ? readdirSync(path.join(dir, 'src/compositions')).filter(f => f.endsWith('.tpl.html')).map(f => f.replace('.tpl.html', '')) : [];
  // a world still the stub means the first builder never wrote it: every group drew an empty slab
  if (existsSync(path.join(dir, 'assets/world.js')) && /^export const STUB/m.test(readFileSync(path.join(dir, 'assets/world.js'), 'utf8'))) { failed++; console.log('FAILED assets/world.js is still the stub: the first group\'s builder fills it, then every group snapshots again'); }
  step('fill_times host', ...node('fill_times.mjs', 'src/index.tpl.html', 'index.html'), { quiet: true });
  for (const g of groups) step(`fill_times ${g}`, ...node('fill_times.mjs', `src/compositions/${g}.tpl.html`, `compositions/${g}.html`), { quiet: true });
  step('lint_scene', ...node('lint_scene.mjs', '.'), { quiet: true, keep: 10 });
  step('timing_lint', ...node('timing_lint.mjs', 'index.html'), { quiet: true, keep: 10 });
  const hf = step('hyperframes lint (errors)', 'npx', ['hyperframes', 'lint'], { quiet: true, keep: 20, filter: l => /✗|error/i.test(l) });
  for (const g of groups) { const mine = hf.out.filter(l => l.includes(`compositions/${g}.html`)); if (mine.length) console.log(`       → group ${g}: ${mine.length} error(s), for its builder`); }
  if (!failed) gate(3);
  mkdirSync(path.dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, JSON.stringify(Object.fromEntries(locked().map(f => [f, sha(f)])), null, 1) + '\n');
  // the session's spend so far decides the fix round (express.md "Fix rounds"): main and subagents together, read from
  // tokens.mjs; unread is a WARN to rerun, never "nothing spent"
  const tk = spawnSync(process.execPath, [path.join(HERE, 'tokens.mjs'), '.', '--json'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  let spent = null;
  try { const r = JSON.parse(tk.stdout.slice(0, tk.stdout.lastIndexOf('}') + 1)); spent = r.main.total + r.subagentTotal; } catch { /* not read */ }
  const M = n => `${(n / 1e6).toFixed(1)}M`;
  if (spent === null) console.log('WARN   tokens not read (node tokens.mjs . says why): rerun before a fix round');
  else if (spent > 8e6) console.log(`SKIP   fix round: ${M(spent)} of the 10M used (over 8M): express.mjs final now, the findings named in the hand-off`);
  else console.log(`OK     tokens ${M(spent)} of 10M: one fix round fits (10 turns each, effort medium, the world's owner first)`);
} else {
  // what the fix round changed: each file against its assemble sha256 (no record: say so, never "nothing changed")
  let was = null;
  try { was = JSON.parse(readFileSync(LOCK, 'utf8')); } catch { console.log('WARN   no review/assembled.json: the files changed since assemble cannot be listed (run express.mjs assemble first)'); }
  if (was) {
    const now = locked(), changed = now.filter(f => was[f] !== sha(f)), gone = Object.keys(was).filter(f => !now.includes(f));
    if (!changed.length && !gone.length) console.log('OK     nothing changed since assemble');
    for (const f of changed) console.log(`CHANGED since assemble: ${f}${f === 'assets/world.js' ? ' (the world: its owner only)' : ''}`);
    for (const f of gone) console.log(`CHANGED since assemble: ${f} removed`);
  }
  const fps = brief.match(/^\W*fps\W*:\W*(\d+)/im)?.[1] ?? '30';
  // check reads the composition, not the mp4: before the render, so a page error (a group that throws and draws
  // nothing) costs one check, not a render; only its ✗ lines are printed, the error itself, never its progress
  step('hyperframes check', 'npx', ['hyperframes', 'check'], { quiet: true, keep: 12, filter: l => /✗|error:|Error/.test(l) && !/\b0 error/.test(l) });
  step('check_assets', ...node('check_assets.mjs', '.'), { quiet: true, keep: 6 });
  if (!failed) step(`render (${fps} fps, looks)`, 'npx', ['hyperframes', 'render', '--fps', fps, '--quality', 'looks', '--quiet', '--output', 'final.mp4'], { quiet: true, keep: 8 });
  if (!failed) { gate(4); step('metrics', ...node('state.mjs', 'metrics', dir), { keep: 40 }); }
}
console.log(failed ? `Result: ${failed} step(s) FAILED` : 'Result: OK');
process.exit(failed ? 1 : 0);
