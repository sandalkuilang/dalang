#!/usr/bin/env node
// Scorecard of one finished (or drafted) video project — the measurable part of an eval run.
// Run it on each golden brief (references/evals.md) after changing the skill, and compare.
//
// Usage: node score_run.mjs <project dir> [--json]

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !existsSync(dir)) { console.error('Usage: node score_run.mjs <project dir> [--json]'); process.exit(1); }
const here = path.dirname(new URL(import.meta.url).pathname);
const read = f => { try { return readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
const run = (script, ...a) => { const r = spawnSync('node', [path.join(here, script), ...a], { encoding: 'utf8', cwd: dir }); return { ok: r.status === 0, out: r.stdout || '' }; };
const num = (s, re) => { const m = s.match(re); return m ? Number(m[1]) : null; };

const video = ['final.mp4', 'draft.mp4'].find(f => existsSync(path.join(dir, f)));
const s = { project: path.basename(path.resolve(dir)), video: video ?? null };

if (video) {
  const st = run('stillness.mjs', video), ld = run('loudness.mjs', video), qc = run('qc.mjs', video);
  Object.assign(s, {
    still_pct: num(st.out, /= ([\d.]+)%/), longest_still_s: num(st.out, /Longest still\s*: ([\d.]+)/), stillness_ok: st.ok,
    lufs: num(ld.out, /integrated\): (-?[\d.]+)/), true_peak: num(ld.out, /True peak\s*: (-?[\d.]+)/), loudness_ok: ld.ok,
    qc_problems: (qc.out.match(/PROBLEM/g) || []).length,
  });
}
const words = read('audio/words.json');
if (words) { const w = JSON.parse(words); Object.assign(s, { words: w.length, est_words: w.filter(x => x.est).length }); }
const beats = read('audio/beats.json');
if (beats) { const b = JSON.parse(beats); Object.assign(s, { narration_s: b.duration, beats: b.beats.length, beats_per_10s: Math.round(b.beats.length / b.duration * 100) / 10 }); }
if (existsSync(path.join(dir, 'index.html')) && words) s.timing_problems = (run('timing_lint.mjs').out.match(/PROBLEM/g) || []).length;
if (existsSync(path.join(dir, 'ASSETS.json'))) s.assets_ok = run('check_assets.mjs', '.').ok;
if (existsSync(path.join(dir, 'state.json'))) s.gates_approved = (run('state.mjs', '.').out.match(/approved/g) || []).length;
const review = read('QC-REVIEW.md');
if (review) Object.assign(s, { review_p0: (review.match(/\bP0\b/g) || []).length, review_p1: (review.match(/\bP1\b/g) || []).length });
// Wall time and logged problems from PRODUCTION.md ("HH:MM–HH:MM | step | output | problems").
const prod = read('PRODUCTION.md');
if (prod) {
  const rows = prod.split('\n').filter(l => /^\d\d:\d\d/.test(l));
  const mins = rows.reduce((t, l) => { const m = l.match(/^(\d\d):(\d\d)[–-](\d\d):(\d\d)/); if (!m) return t; let d = (m[3] * 60 + +m[4]) - (m[1] * 60 + +m[2]); return t + (d < 0 ? d + 1440 : d); }, 0);
  Object.assign(s, { logged_minutes: mins, steps_logged: rows.length, logged_problems: rows.filter(l => (l.split('|')[3] || '').trim() !== '-').length });
}

if (process.argv.includes('--json')) console.log(JSON.stringify(s));
else for (const [k, v] of Object.entries(s)) console.log(`${k.padEnd(18)} ${v}`);
