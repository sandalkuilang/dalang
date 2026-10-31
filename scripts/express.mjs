#!/usr/bin/env node
// Express's mechanical steps as one call each, so the main agent spends its turns on the script, the SPEC and the
// verdicts, not on chains of small commands it has to remember (every main-agent turn re-reads the whole session).
// Each prints one line per check and only the lines that failed.
//
// Usage: node express.mjs after-voice [dir] [--log <file>]   (default: the newest voice-*.log, the last retake's)
//          the take's WARNING lines (none → go on), pad_voice, captions (format from BRIEF.md), gates 1–2 by agent;
//          tts_timestamps.mjs runs it itself after a clean Express take (--take-clean: it read the WARNING lines)
//        node express.mjs scaffold [dir]
//          the planner's last call: storyboard_lint clean, then scaffold.mjs with the arguments of SPEC.md's one
//          `SCAFFOLD:` line (--look … --groups … --music …); prints the builders' prompt line
//        node express.mjs assemble [dir]
//          audio/beats.js and audio/captions.js checked for what after-voice writes (BEATS, WORDS, NARRATION_DURATION,
//          CAPTIONS), fill_times on the host and every group, lint_scene, timing_lint, hyperframes lint (errors only), hyperframes check
//          (a page error from the host or a group, printed under the part that threw: check names none itself, so a failed
//          check is run again on the host alone and on the host with one group, in a temp folder of links), film_gate.mjs
//          (isometric looks: seams, the world in motion, reading time, dead stretches), gate 3,
//          object-studio: every shot measured in the browser (strips.mjs capture, layout_lint.mjs: the hero under 60 %
//          of the frame or cut by an edge, text over the hero, the hero against its ground; a capture with no layout records is
//          captured once more, and the WARN names the step to rerun), each line printed OPEN under its group
//          (a line fails the step: the fix round takes it),
//          the tokens spent so far (over 8M: no fix round);
//          a failure is printed under its group, for that group's builder
//        node express.mjs final [dir] [--quality looks|high]
//          the files changed since assemble (review/assembled.json: the world and every group, by sha256), for the main
//          agent to check against the fix round's assignments; hyperframes check and check_assets first (no render on a
//          failure), render (BRIEF.md fps, --quality looks), the poster (the hook's last frame: poster.jpg and frame 0),
//          object-studio: the frames measured again first; a line still open is printed OPEN for the hand-off, not a stop
//          gate 4, the metrics table
// Exit 0 all passed, 1 a check failed (named), 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rerunHint } from './rerun_hint.mjs';
import { flagOff, isOn } from './layout_flag.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const logArg = opt('--log');
const quality = opt('--quality', 'looks');   // final: Studio passes high (studio.mjs final)
const takeClean = args.includes('--take-clean') && !!args.splice(args.indexOf('--take-clean'), 1);
const [cmd, dirArg] = args;
const dir = path.resolve(dirArg ?? '.');
if (!['after-voice', 'scaffold', 'assemble', 'final'].includes(cmd)) { console.error('Usage: node express.mjs after-voice|scaffold|assemble|final [dir]'); process.exit(2); }

if (!existsSync(path.join(dir, 'audio/beats.json'))) { console.log('FAILED no take yet: audio/beats.json is missing (tts_timestamps.mjs first)\nResult: 1 step(s) FAILED'); process.exit(1); }
const brief = existsSync(path.join(dir, 'BRIEF.md')) ? readFileSync(path.join(dir, 'BRIEF.md'), 'utf8') : '';
// the visual thesis (looks.md object-studio) applies to object-studio films built with the machine; a Studio iso film, or one
// started before the machine existed (no assets/machine.js), keeps its old measure and gets no palette line
const thesis = /^\W*look\W*:\W*object-studio/im.test(brief) && existsSync(path.join(dir, 'assets/machine.js'));
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
// A failed `hyperframes check` names no file for a page error: its message is the error's own text, and the location
// line under it is always index.html. So which part threw is found here, for the fix round to go to that builder only.
// 1) a classic script in a group reports `composition script error: <group> …`: that id is the group.
// 2) any other page error (a module script, the host's own) is found by running check on the film again with fewer
//    parts loaded, in a temp folder of links to the project (the project itself is never touched): the host alone
//    first, then the host with one group at a time; a part whose run has more runtime errors than the host alone threw.
// A probe that could not be read is a WARN to rerun, never "no part found".
const runtimeErrors = (cwd) => {
  const r = spawnSync('npx', ['hyperframes', 'check', '--json'], { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
  try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'), r.stdout.lastIndexOf('}') + 1)).runtime.findings.filter(f => f.severity === 'error').length; } catch { return null; }
};
const blamePageErrors = (lines, groups) => {
  const named = new Map();
  let unnamed = 0;
  for (const l of lines.filter(l => /✗ (page_error|console_error)/.test(l))) {
    const g = l.match(/composition script error: (\S+)/)?.[1];
    if (g && groups.includes(g)) named.set(g, (named.get(g) ?? 0) + 1); else unnamed++;
  }
  for (const [g, n] of named) console.log(`       → group ${g}: ${n} page error(s), for its builder`);
  if (!unnamed) return;
  const hostFile = path.join(dir, 'index.html');
  const host = existsSync(hostFile) ? readFileSync(hostFile, 'utf8') : null;
  // the host with only the listed groups kept: each group is one element carrying data-composition-src
  const keep = (only) => groups.reduce((h, g) => h.replace(new RegExp(`<div\\b[^>]*data-composition-src="compositions/${g}\\.html"[^>]*>\\s*</div>`), m => only.includes(g) ? m : ''), host);
  if (host === null || groups.some(g => keep(groups.filter(x => x !== g)) === host)) {
    return console.log('WARN   page error(s) not tied to a part: index.html does not load each group as one `<div … data-composition-src="compositions/<group>.html" …></div>`; read the message above, or run npx hyperframes check on each part');
  }
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dalang-probe-'));
  try {
    for (const f of readdirSync(dir)) if (f !== 'index.html' && f !== '.hyperframes') symlinkSync(path.join(dir, f), path.join(tmp, f));
    const probe = (only) => { writeFileSync(path.join(tmp, 'index.html'), keep(only)); return runtimeErrors(tmp); };
    const base = probe([]);
    if (base === null) return console.log('WARN   page error(s) not tied to a part: the probe of the host alone could not be read (npx hyperframes check --json); rerun');
    if (base > 0) console.log(`       → host: ${base} page error(s), for the host's builder`);
    let tied = base > 0;
    for (const g of groups) {
      const n = probe([g]);
      if (n === null) { tied = true; console.log(`WARN   group ${g}: the probe could not be read (npx hyperframes check --json); rerun`); continue; }
      const extra = n - base - (named.get(g) ?? 0);   // the classic-script errors above are already printed
      if (extra > 0) { tied = true; console.log(`       → group ${g}: ${extra} page error(s), for its builder`); }
      else if (named.has(g)) tied = true;
    }
    if (!tied) console.log('WARN   page error(s) not tied to a part: each part loaded alone ran clean (an error that needs two parts together?); read the message above');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
};
// the work a fix round may touch: the world (or the machine) and every built group, each by its sha256
const LOCK = path.join(dir, 'review', 'assembled.json');
const sha = f => createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex');
const locked = () => ['assets/world.js', 'assets/machine.js', ...(existsSync(path.join(dir, 'compositions')) ? readdirSync(path.join(dir, 'compositions')).filter(f => f.endsWith('.html')).map(f => `compositions/${f}`) : [])].filter(f => existsSync(path.join(dir, f)));
const gate = n => {
  if (spawnSync(process.execPath, [path.join(HERE, 'state.mjs'), 'check', String(n), dir]).status === 0) return console.log(`OK     gate ${n} (approved, fresh)`);
  const r = spawnSync(process.execPath, [path.join(HERE, 'state.mjs'), 'approve', String(n), dir, '--by', 'agent'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) { failed++; console.log(`FAILED gate ${n} by agent`); `${r.stderr ?? ''}${r.stdout ?? ''}`.trim().split('\n').slice(0, 13).forEach(l => console.log(`       ${l.slice(0, 240)}`)); return; }
  console.log(`OK     gate ${n} by agent`);
  // a first approval prints the next step's reading: passed through, so no main-agent turn goes to `next`
  const reading = (r.stdout ?? '').split('\n').slice(1).join('\n').trim();
  if (reading) console.log(`\n${reading}`);
};
// object-studio: each shot measured in the browser (the page's layoutFrame records, captured by strips.mjs) and linted.
// block: a line fails the step (assemble: the fix round takes it); else it is OPEN, for the hand-off (final: no polish round follows).
// Unmeasured is a WARN, never clean; it fails the step only with block.
const measure = ({ block }) => {
  if (!existsSync(path.join(dir, 'assets/objectStudio.js'))) return;
  const run = (script, ...a) => spawnSync(process.execPath, [path.join(HERE, script), ...a], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  const cap = run('strips.mjs', '.', '--out', 'review/measure', '--expect-layout');
  // thesis: one whole hero filling 60-70 % of its larger axis, its height measured in the subject box (y 18-60 % of the frame, looks.md),
  // and at most two kinds of text on screen at once
  const lint = cap.status === 0 ? run('layout_lint.mjs', 'review/measure/layout.json', '--no-safe-area', '--min-caption', '46', '--min-label', '22', ...(thesis ? ['--min-hero', '0.6', '--hero-band', '0.18,0.60', '--max-text-layers', '2'] : [])) : null;
  if (!lint || lint.status === 2) {
    if (block) failed++;
    const again = rerunHint({ cmd: block ? 'assemble' : 'final', studio: process.env.DALANG_RUNNER === 'studio', quality }), note = (cap.stdout ?? '').match(/^WARN: layout.*$/m)?.[0];
    console.log(`WARN   measured frames: not measured (${lint ? 'layout_lint.mjs could not read the records; the capture was tried twice' : `strips.mjs exit ${cap.status}`}): rerun \`${again}\`; this is not clean`);
    return note && console.log(`       ${note.slice(0, 240)}`);
  }
  const probs = lint.stdout.split('\n').filter(l => l.startsWith('  PROBLEM'));
  if (!probs.length) return console.log(`OK     measured frames (${thesis ? 'hero at 60 % or more of the subject box, at most two text layers, ' : 'hero size, '}edges, text over the hero, contrast)`);
  if (block) failed++;
  console.log(`${block ? 'FAILED' : 'OPEN  '} measured frames: ${probs.length} line(s)${block ? ', for the fix round' : ', name them in the hand-off'}`);
  const html = existsSync(path.join(dir, 'index.html')) ? readFileSync(path.join(dir, 'index.html'), 'utf8') : '';
  const groups = [...html.matchAll(/data-composition-id="([^"]+)"[^>]*?data-start="([\d.]+)"[^>]*?data-duration="([\d.]+)"/g)].filter(m => m[1] !== 'main').map(m => ({ g: m[1], a: +m[2], z: +m[2] + +m[3] }));
  for (const l of probs) {
    const t = Number(l.match(/t=([\d.]+)s/)?.[1]), g = groups.find(x => t >= x.a && t < x.z)?.g ?? '?';
    console.log(`       → group ${g}: ${l.replace(/^\s*PROBLEM\s*:\s*/, '').slice(0, 220)}`);
  }
};

if (cmd === 'after-voice') {
  // the newest take log: a retake writes its own, and the first take's WARNING lines are no longer the film's
  const log = logArg ?? readdirSync(dir).filter(f => /^voice-.*\.log$/.test(f)).sort((a, b) => statSync(path.join(dir, b)).mtimeMs - statSync(path.join(dir, a)).mtimeMs)[0] ?? 'voice-take.log';
  const lf = path.join(dir, log);
  const warns = takeClean ? [] : existsSync(lf) ? readFileSync(lf, 'utf8').split('\n').filter(l => /WARNING/.test(l)) : null;
  if (warns === null) console.log(`WARN   ${log} not found: the take's warnings were not read (start the take with > ${log} 2>&1)`);
  else if (warns.length) { failed++; console.log(`FAILED the take has ${warns.length} WARNING line(s): respell once, --retake changed (express.md Steps 3–4)`); warns.slice(0, 6).forEach(l => console.log(`       ${l.slice(0, 240)}`)); }
  else console.log(`OK     take: no WARNING (${takeClean ? 'read by tts_timestamps.mjs' : log})`);
  if (!failed) {
    const p = (brief.match(/^\W*platform\W*:(.*)$/im)?.[1] ?? '').toLowerCase();
    const format = /landscape|16:9|youtube(?! short)/.test(p) ? 'landscape' : /feed|4:5/.test(p) ? 'feed' : /short|tiktok/.test(p) ? 'shorts' : 'reels';
    step('pad_voice', ...node('pad_voice.mjs', '.'), { quiet: true });
    step(`captions (${format})`, ...node('captions.mjs', 'narration.txt', 'audio/words.json', '--out', 'audio', '--format', format), { quiet: true });
    if (!failed) { gate(1); gate(2); }
  }
} else if (cmd === 'scaffold') {
  // the planner's finished SPEC and storyboard into the film's frame: no main-agent turn between planner and builders
  const sb = step('storyboard_lint', ...node('storyboard_lint.mjs', '.'), { quiet: true, keep: 12, filter: l => /PROBLEM|WARN|Result/.test(l) });
  const spec = existsSync(path.join(dir, 'SPEC.md')) ? readFileSync(path.join(dir, 'SPEC.md'), 'utf8') : null;
  const lines = (spec ?? '').split('\n').filter(l => /^\W*SCAFFOLD\W*:/.test(l));
  const hero = /hero["'`]?\s*:\s*true/i.test(spec ?? ''), af = path.join(dir, 'research/anatomy.md'), anatomy = existsSync(af) ? readFileSync(af, 'utf8') : '';
  if (spec === null) { failed++; console.log('FAILED SPEC.md not found: the planner writes it first'); }
  else if (lines.length !== 1) { failed++; console.log(`FAILED SPEC.md needs exactly one \`SCAFFOLD: --look <look> --groups <name>:<first beat>,… --music <calm|bright|tense>\` line (found ${lines.length})`); }
  // the hero's inside comes from research/anatomy.md's parts table (express.md, the anatomy strand), never from memory
  else if (hero && !/^\|\s*\d+\s*\|/m.test(anatomy)) { failed++; console.log('FAILED SPEC.md has a `hero: true` object but research/anatomy.md has no parts table row: run the anatomy strand (express.md Steps 3–4, job 1), then scaffold again'); }
  else if (sb.ok) {
    // the line's arguments, quotes kept together ("a label", 'a label'); backticks around the line are dropped
    const argv = [...lines[0].replace(/^\W*SCAFFOLD\W*:/, '').replace(/`/g, ' ').matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3]);
    if (hero) console.log('OK     anatomy: research/anatomy.md');
    step('scaffold', ...node('scaffold.mjs', '.', ...argv), { keep: 4 });
  }
} else if (cmd === 'assemble') {
  const groups = existsSync(path.join(dir, 'src/compositions')) ? readdirSync(path.join(dir, 'src/compositions')).filter(f => f.endsWith('.tpl.html')).map(f => f.replace('.tpl.html', '')) : [];
  // a world still the stub means the first builder never wrote it: every group drew an empty slab
  if (existsSync(path.join(dir, 'assets/world.js')) && /^export const STUB/m.test(readFileSync(path.join(dir, 'assets/world.js'), 'utf8'))) { failed++; console.log('FAILED assets/world.js is still the stub: the first group\'s builder fills it, then every group snapshots again'); }
  if (existsSync(path.join(dir, 'assets/machine.js')) && /^export const STUB/m.test(readFileSync(path.join(dir, 'assets/machine.js'), 'utf8'))) { failed++; console.log('FAILED assets/machine.js is still the stub: the first group never built the machine'); }
  // after-voice's files (express.md Step 4): a host that loads audio/beats.js and audio/captions.js with a missing global
  // fails only in hyperframes, one render later. Each file and global named, with the step that writes it.
  {
    const probs = [];
    const load = (f) => {
      const p = path.join(dir, f);
      if (!existsSync(p)) { probs.push(`${f} is missing`); return null; }
      const win = {};
      try { vm.runInNewContext(readFileSync(p, 'utf8'), { window: win }); } catch (e) { probs.push(`${f} does not run: ${String(e.message).slice(0, 120)}`); return null; }
      return win;
    };
    const b = load('audio/beats.js');
    if (b) {
      if (!b.BEATS || typeof b.BEATS !== 'object' || Array.isArray(b.BEATS)) probs.push('audio/beats.js sets no window.BEATS');
      if (!Array.isArray(b.WORDS)) probs.push('audio/beats.js sets no window.WORDS');
      if (!Number.isFinite(b.NARRATION_DURATION) || b.NARRATION_DURATION <= 0) probs.push('audio/beats.js sets no window.NARRATION_DURATION');
    }
    const c = load('audio/captions.js');
    if (c && !Array.isArray(c.CAPTIONS)) probs.push('audio/captions.js sets no window.CAPTIONS');
    if (probs.length) {
      failed++;
      console.log(`FAILED voice files (what the take and after-voice write): ${probs.length} problem(s)`);
      probs.forEach(l => console.log(`       ${l}`));
      console.log('       fix: node <skill-dir>/scripts/express.mjs after-voice . (pad_voice, captions, Gates 1-2); beats.js is the take\'s own, so a take that left none is run again');
    } else console.log('OK     voice files (audio/beats.js: BEATS, WORDS, NARRATION_DURATION; audio/captions.js: CAPTIONS)');
  }
  step('fill_times host', ...node('fill_times.mjs', 'src/index.tpl.html', 'index.html'), { quiet: true });
  for (const g of groups) step(`fill_times ${g}`, ...node('fill_times.mjs', `src/compositions/${g}.tpl.html`, `compositions/${g}.html`), { quiet: true });
  step('lint_scene', ...node('lint_scene.mjs', '.'), { quiet: true, keep: 10 });
  step('timing_lint', ...node('timing_lint.mjs', 'index.html'), { quiet: true, keep: 10 });
  const hf = step('hyperframes lint (errors)', 'npx', ['hyperframes', 'lint'], { quiet: true, keep: 20, filter: l => /✗|error/i.test(l) });
  for (const g of groups) { const mine = hf.out.filter(l => l.includes(`compositions/${g}.html`)); if (mine.length) console.log(`       → group ${g}: ${mine.length} error(s), for its builder`); }
  // check loads the composition in the browser, as final does: a page error (a host or group that throws on load and
  // draws nothing) fails here, for the fix round, not first at final
  const hc = step('hyperframes check', 'npx', ['hyperframes', 'check'], { quiet: true, keep: 12, filter: l => /✗|error:|Error/.test(l) && !/\b0 error/.test(l) });
  if (!hc.ok) blamePageErrors(hc.out, groups);
  // the film measured from each group's own module (no seam reviewer, no look at a frame): seams, the world in motion,
  // the reading time of every overlay, dead stretches
  if (existsSync(path.join(dir, 'assets/iso.js'))) step('film_gate', ...node('film_gate.mjs', '.'), { keep: 24, filter: l => /^(FAILED|NOTE|WARN)/.test(l) });
  // object-studio's machine proved to run before a frame is measured: links keep length, gears ratio, contacts gap; parts move
  if (existsSync(path.join(dir, 'assets/machine.js'))) step('machine_audit', ...node('machine_audit.mjs', '.'), { keep: 12, filter: l => /PROBLEM|WARN|INFO|Result/.test(l) });
  measure({ block: true });
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
    for (const f of changed) console.log(`CHANGED since assemble: ${f}${f === 'assets/world.js' ? ' (the world: its owner only)' : f === 'assets/machine.js' ? ' (the machine: its owner only)' : ''}`);
    for (const f of gone) console.log(`CHANGED since assemble: ${f} removed`);
  }
  measure({ block: false });
  // a capture killed mid-way leaves the page posting (strips.mjs puts false back after it): off before check and render
  const flag = path.join(dir, 'assets', 'layout_on.js');
  if (existsSync(flag) && isOn(readFileSync(flag, 'utf8'))) { writeFileSync(flag, flagOff(readFileSync(flag, 'utf8'))); console.log('OK     assets/layout_on.js was left on by a killed capture: off again'); }
  const fps = brief.match(/^\W*fps\W*:\W*(\d+)/im)?.[1] ?? '30';
  // check reads the composition, not the mp4: before the render, so a page error (a group that throws and draws
  // nothing) costs one check, not a render; only its ✗ lines are printed, the error itself, never its progress
  step('hyperframes check', 'npx', ['hyperframes', 'check'], { quiet: true, keep: 12, filter: l => /✗|error:|Error/.test(l) && !/\b0 error/.test(l) });
  step('check_assets', ...node('check_assets.mjs', '.'), { quiet: true, keep: 6 });
  if (!failed) step(`render (${fps} fps, ${quality})`, 'npx', ['hyperframes', 'render', '--fps', fps, '--quality', quality, '--quiet', '--output', 'final.mp4'], { quiet: true, keep: 8 });
  // the visual thesis (looks.md object-studio): neutrals, the one accent, at most one mechanism hue on its beat
  if (!failed && thesis) {
    const h = spawnSync(process.execPath, [path.join(HERE, 'palette.mjs'), 'final.mp4', '--hues', '2'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
    const lines = (h.stdout ?? '').split('\n').filter((l) => l.startsWith('  OVER'));
    if (h.status === 0) console.log('OK     palette: neutrals plus at most 2 hue families per frame');
    else if (h.status === 3) { console.log(`OPEN   palette: ${lines.length} frame(s) over 2 hue families, name them in the hand-off`); lines.slice(0, 6).forEach((l) => console.log(`       ${l.trim()}`)); }
    else console.log(`WARN   palette: not measured (palette.mjs exit ${h.status}): rerun; this is not clean`);
  }
  // the poster (after latent-spaces/brag): the hook beat's finished frame, also laid over frame 0, so every platform's
  // thumbnail is the hook, not a half-built first frame; the length and the audio are unchanged
  if (!failed) {
    let at = 0;
    try { at = Math.max(0, JSON.parse(readFileSync(path.join(dir, 'audio/beats.json'), 'utf8')).beats[0].end - 0.4); } catch { /* no beats: frame 0 itself */ }
    step(`poster (${at.toFixed(1)} s, the hook's last frame)`, 'ffmpeg', ['-y', '-v', 'error', '-ss', String(at), '-i', 'final.mp4', '-frames:v', '1', '-q:v', '2', 'poster.jpg'], { quiet: true });
    if (!failed) step('poster on frame 0', 'ffmpeg', ['-y', '-v', 'error', '-i', 'final.mp4', '-i', 'poster.jpg', '-filter_complex', "[0:v][1:v]overlay=enable='eq(n,0)'", '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', 'final.poster.mp4'], { quiet: true });
    if (!failed) renameSync(path.join(dir, 'final.poster.mp4'), path.join(dir, 'final.mp4'));
  }
  if (!failed) { gate(4); step('metrics', ...node('state.mjs', 'metrics', dir), { keep: 40 }); }
}
console.log(failed ? `Result: ${failed} step(s) FAILED` : 'Result: OK');
process.exit(failed ? 1 : 0);
