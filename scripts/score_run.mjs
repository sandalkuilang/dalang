#!/usr/bin/env node
// Scorecard of one finished (or drafted) video project — the measurable part of an eval run.
// Run it on each golden brief (references/evals.md) after changing the skill, and compare.
//
// Reads review/quiz-result.md (sound-off quiz) into quiz_score / quiz_pct.
// Usage: node score_run.mjs <project dir> [--json]

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('Usage: node score_run.mjs <project dir> [--json]'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const read = f => { try { return readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
const run = (script, ...a) => { const r = spawnSync('node', [path.join(here, script), ...a], { encoding: 'utf8', cwd: dir }); return { ok: r.status === 0, out: r.stdout || '' }; };
// A script that crashed (non-zero exit without its PROBLEM lines) is an error, never a perfect 0.
const count = r => !r.ok && !/PROBLEM/.test(r.out) ? 'error' : (r.out.match(/PROBLEM/g) || []).length;
const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : null; };

const video = ['final.mp4', 'draft.mp4'].find(f => existsSync(path.join(dir, f)));
const s = { project: path.basename(path.resolve(dir)), video: video ?? null };

if (video) {
  const st = run('stillness.mjs', video), ld = run('loudness.mjs', video), qc = run('qc.mjs', video);
  Object.assign(s, {
    still_pct: num(st.out, /= ([\d.]+)%/), longest_still_s: num(st.out, /Longest still\s*: ([\d.]+)/), stillness_ok: st.ok,
    lufs: num(ld.out, /integrated\): (-?[\d.]+)/), true_peak: num(ld.out, /True peak\s*: (-?[\d.]+)/), loudness_ok: ld.ok,
    qc_problems: count(qc),
  });
}
const words = read('audio/words.json');
if (words) { const w = JSON.parse(words); Object.assign(s, { words: w.length, est_words: w.filter(x => x.est).length }); }
const beats = read('audio/beats.json');
if (beats) { const b = JSON.parse(beats); Object.assign(s, { narration_s: b.duration, beats: b.beats.length, beats_per_10s: Math.round(b.beats.length / b.duration * 100) / 10 }); }
if (existsSync(path.join(dir, 'index.html')) && words) s.timing_problems = count(run('timing_lint.mjs'));
// check_assets writes CREDITS.md; the scorecard only reads, so it reports whether CREDITS.md exists instead.
if (existsSync(path.join(dir, 'ASSETS.json'))) s.credits_md = existsSync(path.join(dir, 'CREDITS.md'));
if (existsSync(path.join(dir, 'state.json'))) s.gates_approved = (run('state.mjs', '.').out.match(/approved/g) || []).length;
const review = read('QC-REVIEW.md');
// Open items only: a line marked FIXED is done.
const open = tag => review.split('\n').filter(l => new RegExp(`\\b${tag}\\b`).test(l) && !/FIXED/.test(l)).length;
if (review) Object.assign(s, { review_p0: open('P0'), review_p1: open('P1') });
// Sound-off quiz (references/review.md): one numbered row per question, the verdict the last cell. Unknown is an error, never 0 or perfect.
// A file that exists but is empty or unreadable is a started quiz without a result: error, never "no quiz".
const quiz = existsSync(path.join(dir, 'review/quiz-result.md')) ? (read('review/quiz-result.md') ?? '') : null;
if (quiz !== null) {
  const verdicts = quiz.split('\n').filter(l => /^\|\s*\d+\s*\|/.test(l))
    .map(l => (l.split('|').map(c => c.replace(/[*`\s]+/g, ' ').trim().toLowerCase()).filter(Boolean).pop() || ''));
  const known = { correct: 'correct', 'partly correct': 'partly', partly: 'partly', wrong: 'wrong' };
  const n = v => verdicts.filter(x => known[x] === v).length;
  s.quiz_questions = verdicts.length;
  if (!verdicts.length || verdicts.some(x => !known[x])) {
    s.quiz_score = 'error';
    console.error('WARN: review/quiz-result.md: no rows or an unrecognised verdict (correct / partly correct / wrong); rerun the quiz');
  } else {
    const score = n('correct') + 0.5 * n('partly');
    Object.assign(s, { quiz_correct: n('correct'), quiz_partly: n('partly'), quiz_wrong: n('wrong'), quiz_score: score, quiz_pct: Math.round(score / verdicts.length * 100) });
  }
}
// Wall time and logged problems from PRODUCTION.md ("HH:MM–HH:MM | step | output | problems").
const prod = read('PRODUCTION.md');
if (prod) {
  const rows = prod.split('\n').filter(l => /^\d\d:\d\d/.test(l));
  // Union of the logged intervals: overlapping lines (background work) are not counted twice.
  const iv = rows.map(l => l.match(/^(\d\d):(\d\d)[–-](\d\d):(\d\d)/)).filter(Boolean).map(m => { const a = m[1] * 60 + +m[2]; let b = m[3] * 60 + +m[4]; if (b < a) b += 1440; return [a, b]; }).sort((x, y) => x[0] - y[0]);
  let mins = 0, end = -1;
  for (const [a, b] of iv) { if (b > end) { mins += b - Math.max(a, end); end = b; } }
  Object.assign(s, { logged_minutes: mins, steps_logged: rows.length, logged_problems: rows.filter(l => (l.split('|')[3] || '').trim() !== '-').length });
}

if (process.argv.includes('--json')) console.log(JSON.stringify(s));
else for (const [k, v] of Object.entries(s)) console.log(`${k.padEnd(18)} ${v}`);
