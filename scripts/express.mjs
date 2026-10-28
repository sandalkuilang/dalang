#!/usr/bin/env node
// Express's mechanical steps as one call each, so the main agent spends its turns on the script, the SPEC and the
// verdicts, not on chains of small commands it has to remember (every main-agent turn re-reads the whole session).
// Each prints one line per check and only the lines that failed.
//
// Usage: node express.mjs after-voice [dir] [--log voice-take.log]
//          the take's WARNING lines (none → go on), pad_voice, captions (format from BRIEF.md), gates 1–2 by agent
//        node express.mjs assemble [dir]
//          fill_times on the host and every group, lint_scene, timing_lint, hyperframes lint (errors only), gate 3;
//          a failure is printed under its group, for that group's builder
//        node express.mjs final [dir]
//          render (BRIEF.md fps, --quality looks), hyperframes check, check_assets, gate 4, the metrics table
// Exit 0 all passed, 1 a check failed (named), 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const log = opt('--log', 'voice-take.log');
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
const gate = n => {
  if (spawnSync(process.execPath, [path.join(HERE, 'state.mjs'), 'check', String(n), dir]).status === 0) return console.log(`OK     gate ${n} (approved, fresh)`);
  step(`gate ${n} by agent`, ...node('state.mjs', 'approve', String(n), dir, '--by', 'agent'), { keep: 2 });
};

if (cmd === 'after-voice') {
  const lf = path.join(dir, log);
  const warns = existsSync(lf) ? readFileSync(lf, 'utf8').split('\n').filter(l => /WARNING/.test(l)) : null;
  if (warns === null) console.log(`WARN   ${log} not found: the take's warnings were not read (start the take with > ${log} 2>&1)`);
  else if (warns.length) { failed++; console.log(`FAILED the take has ${warns.length} WARNING line(s): respell once, --retake changed (express.md Steps 3–4)`); warns.slice(0, 6).forEach(l => console.log(`       ${l.slice(0, 240)}`)); }
  else console.log('OK     take: no WARNING');
  if (!failed) {
    const p = (brief.match(/^\W*platform\W*:(.*)$/im)?.[1] ?? '').toLowerCase();
    const format = /landscape|16:9|youtube(?! short)/.test(p) ? 'landscape' : /feed|4:5/.test(p) ? 'feed' : /short|tiktok/.test(p) ? 'shorts' : 'reels';
    step('pad_voice', ...node('pad_voice.mjs', '.'), { quiet: true });
    step(`captions (${format})`, ...node('captions.mjs', 'narration.txt', 'audio/words.json', '--out', 'audio', '--format', format), { quiet: true });
    if (!failed) { gate(1); gate(2); }
  }
} else if (cmd === 'assemble') {
  const groups = existsSync(path.join(dir, 'src/compositions')) ? readdirSync(path.join(dir, 'src/compositions')).filter(f => f.endsWith('.tpl.html')).map(f => f.replace('.tpl.html', '')) : [];
  step('fill_times host', ...node('fill_times.mjs', 'src/index.tpl.html', 'index.html'), { quiet: true });
  for (const g of groups) step(`fill_times ${g}`, ...node('fill_times.mjs', `src/compositions/${g}.tpl.html`, `compositions/${g}.html`), { quiet: true });
  step('lint_scene', ...node('lint_scene.mjs', '.'), { quiet: true, keep: 10 });
  step('timing_lint', ...node('timing_lint.mjs', 'index.html'), { quiet: true, keep: 10 });
  const hf = step('hyperframes lint (errors)', 'npx', ['hyperframes', 'lint'], { quiet: true, keep: 20, filter: l => /✗|error/i.test(l) });
  for (const g of groups) { const mine = hf.out.filter(l => l.includes(`compositions/${g}.html`)); if (mine.length) console.log(`       → group ${g}: ${mine.length} error(s), for its builder`); }
  if (!failed) gate(3);
} else {
  const fps = brief.match(/^\W*fps\W*:\W*(\d+)/im)?.[1] ?? '30';
  step(`render (${fps} fps, looks)`, 'npx', ['hyperframes', 'render', '--fps', fps, '--quality', 'looks', '--quiet', '--output', 'final.mp4'], { quiet: true, keep: 8 });
  if (!failed) step('hyperframes check', 'npx', ['hyperframes', 'check'], { quiet: true, keep: 8 });
  step('check_assets', ...node('check_assets.mjs', '.'), { quiet: true, keep: 6 });
  if (!failed) { gate(4); step('metrics', ...node('state.mjs', 'metrics', dir), { keep: 40 }); }
}
console.log(failed ? `Result: ${failed} step(s) FAILED` : 'Result: OK');
process.exit(failed ? 1 : 0);
