#!/usr/bin/env node
// Studio's mechanical steps as one call each, so the main session only decides, spawns and reads short verdicts. Every
// main-session turn re-reads the whole session: hand-written chains, polling loops and retyped verdicts are what grew it.
// after-voice, frames and fixes run in the foreground (timeout 600000), so the result is in the same turn; qc and final
// with run_in_background (never nohup/&, never polled): a background run costs a wake-up turn and a turn to read it.
// Each prints one line per step, only failing lines under it, and a `next:` line. Express's runner is express.mjs; the
// two share after-voice and final.
//
// Usage: node studio.mjs after-voice [dir]          express.mjs after-voice: the take's WARNINGs, pad, captions, gates 1–2
//        node studio.mjs frames [dir] --at a,b,…     style-frame stills at those seconds (style-frames/) on one sheet:
//                                                    review/style-frames/sheet.jpg + frame-NN.png, for the checker; the
//                                                    moving sample (style-frames/sample.mp4) and its hook.mp4
//        node studio.mjs qc [dir] [--allow a-b]… [--targets <shots|beats>]     round n: the last round's verdicts moved to review/round-<n-1>/, then
//                                                    hyperframes check, the draft (10 fps), qc_all, strips --crops (against
//                                                    the last round's stills), the cut sheet
//        node studio.mjs fixes [dir]                 one fixer line per review/fixes-<group>.md (the reviewer writes them)
//        node studio.mjs final [dir]                 express.mjs final --quality high (check, assets, render, poster,
//                                                    gate 4, metrics), then qc_all on final.mp4
//        --dry-run (qc, frames): print the steps, run nothing
// Exit 0 all passed, 1 a step failed (named), 2 usage.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes('--dry-run') && !!args.splice(args.indexOf('--dry-run'), 1);
const allow = [];
for (let i = args.indexOf('--allow'); i >= 0; i = args.indexOf('--allow')) allow.push(...args.splice(i, 2).slice(1));
const atI = args.indexOf('--at'), at = atI >= 0 ? args.splice(atI, 2)[1] : null;
const tgI = args.indexOf('--targets'), targets = tgI >= 0 ? args.splice(tgI, 2)[1] : null;
const [cmd, dirArg] = args;
const dir = path.resolve(dirArg ?? '.');
const CMDS = ['after-voice', 'frames', 'qc', 'fixes', 'final'];
if (!CMDS.includes(cmd)) { console.error(`Usage: node studio.mjs ${CMDS.join('|')} [dir]`); process.exit(2); }

let failed = 0;
const step = (name, bin, argv, { cwd = dir, keep = 8, filter } = {}) => {
  if (dry) return console.log(`STEP   ${name}: ${[path.basename(bin), ...argv].join(' ')}`), { ok: true, out: [] };
  const r = spawnSync(bin, argv, { cwd, encoding: 'utf8', maxBuffer: 64 << 20 });
  let out = `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter(l => l.trim() && !/^npm warn/i.test(l));
  if (filter) out = out.filter(filter);
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'OK    ' : 'FAILED'} ${name}`);
  if (!ok) out.slice(-keep).forEach(l => console.log(`       ${l.slice(0, 240)}`));
  return { ok, out };
};
const node = (script, ...a) => [process.execPath, [path.join(HERE, script), ...a]];
const passOn = (...a) => { const r = spawnSync(process.execPath, [path.join(HERE, 'express.mjs'), ...a, dir], { stdio: 'inherit' }); process.exit(r.status ?? 1); };

if (cmd === 'after-voice') passOn('after-voice');
if (cmd === 'final') {
  // express.mjs final (check, assets, high render, poster, gate 4, metrics), then the measured checks on the final itself
  const r = spawnSync(process.execPath, [path.join(HERE, 'express.mjs'), 'final', dir, '--quality', 'high'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  step('qc_all on final.mp4', ...node('qc_all.mjs', 'final.mp4', '.', ...allow.flatMap(a => ['--allow', a])), { keep: 30, filter: l => !/^PASS/.test(l) });
}

if (cmd === 'frames') {
  if (!at) { console.error('frames needs --at <seconds,…> (the style frames\' beat times)'); process.exit(2); }
  const sf = path.join(dir, 'style-frames'), out = path.join(dir, 'review', 'style-frames');
  if (!dry) { rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true }); }
  const snap = step('snapshot', 'npx', ['hyperframes', 'snapshot', '--at', at, '--describe', 'false'], { cwd: sf });
  if (snap.ok && !dry) {
    const root = path.join(sf, 'src', '.hyperframes', 'artifacts', 'snapshots');
    const last = existsSync(root) ? readdirSync(root).map(d => path.join(root, d)).sort().pop() : null;
    const pngs = last ? readdirSync(last).filter(f => f.endsWith('.png')).sort() : [];
    if (!pngs.length) { failed++; console.log(`FAILED no stills under ${root}`); }
    pngs.forEach((f, i) => renameSync(path.join(last, f), path.join(out, `frame-${String(i).padStart(2, '0')}.png`)));
    if (pngs.length) step('sheet', 'ffmpeg', ['-y', '-v', 'error', '-i', path.join(out, 'frame-%02d.png'), '-vf', `scale=540:-2,tile=${Math.min(pngs.length, 4)}x${Math.ceil(pngs.length / 4)}`, '-frames:v', '1', path.join(out, 'sheet.jpg')]);
  }
  // the moving sample at the film's fps and its hook cut: what the benchmark reviewer scores
  const fps = (existsSync(path.join(dir, 'BRIEF.md')) ? readFileSync(path.join(dir, 'BRIEF.md'), 'utf8') : '').match(/^\W*fps\W*:\W*(\d+)/im)?.[1] ?? '30';
  let hookEnd = 3;
  try { hookEnd = JSON.parse(readFileSync(path.join(dir, 'audio/beats.json'), 'utf8')).beats[0].end; } catch { /* no beats: 3 s */ }
  if (!failed) step(`moving sample (${fps} fps, high)`, 'npx', ['hyperframes', 'render', '--fps', fps, '--quality', 'high', '--quiet', '--output', 'sample.mp4'], { cwd: sf });
  if (!failed) step(`hook.mp4 (0–${hookEnd.toFixed(2)} s)`, 'ffmpeg', ['-y', '-v', 'error', '-t', String(hookEnd), '-i', 'sample.mp4', '-c', 'copy', 'hook.mp4'], { cwd: sf });
  if (!failed) console.log(`next: one checker (look-build.md "Style frames"): review/style-frames/sheet.jpg + frame-NN.png; it writes review/style-frame-check.md and replies in ≤ 5 lines`);
}

if (cmd === 'qc') {
  // a new round starts with the last round's verdicts and stills put aside, so strips can label what changed
  const rounds = existsSync(path.join(dir, 'review')) ? readdirSync(path.join(dir, 'review')).filter(d => /^round-\d+$/.test(d)).length : 0;
  const prev = path.join(dir, 'review', `round-${rounds + 1}`);
  const done = ['QC-REVIEW.md', 'review/reality-check.md', 'review/quiz-result.md', 'review/strips', ...(existsSync(path.join(dir, 'review')) ? readdirSync(path.join(dir, 'review')).filter(f => /^fixes-.+\.md$/.test(f)).map(f => `review/${f}`) : [])].filter(f => existsSync(path.join(dir, f)));
  const isRound = existsSync(path.join(dir, 'QC-REVIEW.md'));
  if (isRound) {
    console.log(`${dry ? 'STEP  ' : 'OK    '} round ${rounds + 1} put aside in review/round-${rounds + 1}/ (${done.length} item(s))`);
    if (!dry) { mkdirSync(prev, { recursive: true }); for (const f of done) renameSync(path.join(dir, f), path.join(prev, path.basename(f))); }
  }
  // a film without a bed is a defect, not a choice the run makes for the user (BRIEF.md `music: none` is theirs)
  const noMusic = /^\W*music\W*:\W*none\b/im.test(existsSync(path.join(dir, 'BRIEF.md')) ? readFileSync(path.join(dir, 'BRIEF.md'), 'utf8') : '');
  if (!noMusic && !existsSync(path.join(dir, 'assets/music.mp3'))) { failed++; console.log('FAILED no assets/music.mp3: node <skill-dir>/scripts/music.mjs . <calm|bright|tense>, the assembler mounts it, then qc again'); }
  step('hyperframes check', 'npx', ['hyperframes', 'check', '--snapshots'], { keep: 12, filter: l => /✗|error:|Error/.test(l) && !/\b0 error/.test(l) });
  step('draft render (10 fps)', 'npx', ['hyperframes', 'render', '--fps', '10', '--quality', 'draft', '--quiet', '--output', 'draft.mp4']);
  if (!failed) {
    step('qc_all', ...node('qc_all.mjs', 'draft.mp4', '.', ...allow.flatMap(a => ['--allow', a])), { keep: 30, filter: l => !/^PASS/.test(l) });
    step('strips --crops', ...node('strips.mjs', '.', '--crops', ...(isRound ? ['--against', path.join(prev, 'strips'), ...(targets ? ['--targets', targets] : [])] : [])), { keep: 10, filter: l => /FLAG|WARN|FAIL|exit|missing/i.test(l) });
    step('cut sheet', 'ffmpeg', ['-y', '-v', 'error', '-i', 'draft.mp4', '-vf', "select='eq(n\\,0)+gt(scene\\,0.3)',scale=480:-2,tile=4x3", '-frames:v', '1', '-fps_mode', 'vfr', 'review/cuts.png']);
  }
  if (!failed) console.log('next: reviewer ‖ quiz ‖ Set / Reality check in one message (review.md), each on review/strips/index.md; the reviewer writes QC-REVIEW.md and one review/fixes-<group>.md per group with a P0/P1; then studio.mjs fixes');
}

if (cmd === 'fixes') {
  const rv = path.join(dir, 'review');
  const files = existsSync(rv) ? readdirSync(rv).filter(f => /^fixes-.+\.md$/.test(f)).sort() : [];
  if (!files.length) console.log('OK     no review/fixes-<group>.md: no P0/P1 open, go to studio.mjs final');
  for (const f of files) {
    const t = readFileSync(path.join(rv, f), 'utf8'), n = k => (t.match(new RegExp(`^\\W*${k}\\b`, 'gm')) || []).length;
    const g = f.replace(/^fixes-|\.md$/g, '');
    console.log(`fixer ${g}: ${n('P0')} P0, ${n('P1')} P1 — prompt: "Fix round for group ${g}: do review/fixes-${g}.md (only its files); report to review/reports/fix-${g}.md, reply ≤ 15 lines."`);
  }
  if (files.length) console.log(`next: every fixer above in one message (dalang-builder, model from state.mjs next), last in it node ${path.join(HERE, 'wait.mjs')} . --expect ${files.length} (timeout 600000); then studio.mjs qc for the next round`);
}
console.log(failed ? `Result: ${failed} step(s) FAILED` : 'Result: OK');
process.exit(failed ? 1 : 0);
