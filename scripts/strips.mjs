#!/usr/bin/env node
// Review strips for Step 7: N stills per storyboard shot (3 → 10 %, 50 %, 90 %), captured in one `hyperframes
// snapshot` call and tiled on numbered sheets, one row per shot, plus index.md: frame → sheet, row, column → time → shot.
// Shots: storyboard.md's shot table (| # | a–b | beat | …); without it (or with --from beats) audio/beats.json.
// The sheets replace hand-tiled contact sheets: the reviewer reads the index to name a frame by its time and shot.
//
// Usage: node strips.mjs [project] [--per-shot 3] [--per-sheet 12] [--out review/strips] [--from storyboard|beats]
//        [--audio audio] [--width 480] [--timeout <ms>] [--frames <dir>] [--dry-run]
//   --frames <dir>  tile stills already captured there (…at-<s>s.png) instead of capturing
//   --dry-run       write index.md only: no capture, no ffmpeg
// Exit 1: usage, or no shots. Exit 2: the capture or ffmpeg failed, or no still matches any shot time (stills of an
// earlier timing). Exit 3: some still is missing (black cell, WARN).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const VAL = ['--per-shot', '--per-sheet', '--out', '--from', '--audio', '--width', '--timeout', '--frames'];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const dir = argv.find((x, i) => !x.startsWith('--') && !VAL.includes(argv[i - 1])) ?? '.';
const perShot = Math.max(1, parseInt(opt('--per-shot', '3'), 10) || 3);
const shotsPerSheet = Math.max(1, Math.floor((parseInt(opt('--per-sheet', '12'), 10) || 12) / perShot));
const width = parseInt(opt('--width', '480'), 10) || 480;
const outRel = opt('--out', path.join('review', 'strips'));
const out = path.resolve(dir, outRel);
const dry = argv.includes('--dry-run');
const usage = (why) => {
  console.error(`${why}\nUsage: node strips.mjs [project] [--per-shot 3] [--per-sheet 12] [--out review/strips] [--from storyboard|beats] [--audio audio] [--width 480] [--timeout ms] [--frames dir] [--dry-run]`);
  process.exit(1);
};

const fromStoryboard = () => {
  const f = path.join(dir, 'storyboard.md'); if (!existsSync(f)) return null;
  const re = /^\|\s*(\d+)\s*\|\s*(\d+(?:\.\d+)?)\s*s?\s*[–—-]\s*(\d+(?:\.\d+)?)\s*s?\s*\|\s*([^|]*?)\s*\|/;
  const rows = readFileSync(f, 'utf8').split('\n').map(l => l.match(re)).filter(m => m && +m[3] > +m[2])
    .map(m => ({ shot: m[1], start: +m[2], end: +m[3], beat: m[4].replace(/`/g, '') }));
  return rows.length ? rows : null;
};
const fromBeats = () => {
  const f = path.join(dir, opt('--audio', 'audio'), 'beats.json'); if (!existsSync(f)) return null;
  let B; try { B = JSON.parse(readFileSync(f, 'utf8')); } catch { return null; }
  if (!Array.isArray(B?.beats)) return null; // valid JSON, but no beat list
  const t = B.beats.filter(b => Number.isFinite(b.start)); // an untimed beat is no shot
  return t.map((b, i) => ({ shot: String(i + 1), start: b.start, end: t[i + 1]?.start ?? B.duration, beat: b.name }))
    .filter(s => Number.isFinite(s.end) && s.end > s.start);
};
const from = opt('--from', null);
const shots = (from === 'beats' ? null : fromStoryboard()) ?? (from === 'storyboard' ? null : fromBeats());
if (!shots?.length) usage(`No shots: no shot table in ${path.join(dir, 'storyboard.md')} and no timed beats in ${path.join(dir, opt('--audio', 'audio'), 'beats.json')}.`);

const frac = j => perShot === 1 ? 0.5 : 0.1 + 0.8 * j / (perShot - 1);
const frames = shots.flatMap((s, i) => Array.from({ length: perShot }, (_, j) => ({
  t: +(s.start + (s.end - s.start) * frac(j)).toFixed(3), shot: s.shot, beat: s.beat,
  sheet: Math.floor(i / shotsPerSheet) + 1, row: (i % shotsPerSheet) + 1, col: j + 1,
})));
const sheetCount = frames.at(-1).sheet;
const sheetName = n => `strip-${String(n).padStart(2, '0')}.jpg`;
const pct = Array.from({ length: perShot }, (_, j) => `${Math.round(frac(j) * 100)} %`).join(', ');

// Where the stills are: captured now, or taken from --frames. Files are matched by the time in their name.
let framesDir = opt('--frames', null) ? path.resolve(opt('--frames', null)) : path.join(out, 'frames');
const found = new Map(); // ms → file
const scan = () => {
  found.clear();
  if (!existsSync(framesDir)) return;
  for (const f of readdirSync(framesDir)) {
    const m = f.match(/at-(\d+(?:\.\d+)?)s\.png$/); // snapshot's own contact-sheet*.jpg never matches
    if (m) found.set(Math.round(+m[1] * 1000), path.join(framesDir, f));
  }
};
const still = t => { // exact millisecond, else the nearest within 10 ms (a stamp rounded by the snapshot)
  const ms = Math.round(t * 1000);
  if (found.has(ms)) return found.get(ms);
  let best = null;
  for (const k of found.keys()) if (Math.abs(k - ms) <= 10 && (best === null || Math.abs(k - ms) < Math.abs(best - ms))) best = k;
  return best === null ? null : found.get(best);
};

if (!dry) {
  mkdirSync(out, { recursive: true });
  if (!opt('--frames', null)) {
    const timeout = opt('--timeout', null);
    const args = ['--yes', 'hyperframes', 'snapshot', '--at', frames.map(f => f.t).join(','), '--no-end', '--describe', 'false', '--output', framesDir, ...(timeout ? ['--timeout', timeout] : [])];
    const r = spawnSync('npx', args, { cwd: dir, encoding: 'utf8' });
    if (r.error || r.status !== 0) {
      console.error(`snapshot failed (${r.error?.message ?? `exit ${r.status}`}):\n${(r.stderr || '').trim().split('\n').slice(-12).join('\n')}`);
      process.exit(2);
    }
  }
  scan();
  if (!found.size) { console.error(`No stills named …at-<s>s.png in ${framesDir}.`); process.exit(2); }
  if (!frames.some(f => still(f.t))) { // stills exist, none for any shot: an earlier timing, or stamps the snapshot rounded past 10 ms
    const list = (a) => `${a.slice(0, 6).join(', ')}${a.length > 6 ? ', …' : ''} s`;
    console.error(`No still in ${framesDir} is within 10 ms of a shot time: ${found.size} still${found.size > 1 ? 's' : ''} at ${list([...found.keys()].sort((a, b) => a - b).map(k => k / 1000))}, shots at ${list(frames.map(f => f.t))}.\nStills of an earlier timing? Capture again (without --frames), or point --frames at the stills of this storyboard.`);
    process.exit(2);
  }
  if (spawnSync('ffmpeg', ['-version']).error) { console.error(`Tiling needs ffmpeg; the stills are in ${framesDir}.`); process.exit(2); }
  for (const f of readdirSync(out)) if (/^strip-\d+\.jpg$/.test(f)) rmSync(path.join(out, f)); // a smaller rerun leaves no stale sheet
}
const missing = dry ? [] : frames.filter(f => !still(f.t));

if (!dry) {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dalang-strips-'));
  try {
    let black = null;
    if (missing.length) { // a black cell the size of any found still; drawbox needs no font
      black = path.join(tmp, 'black.png');
      const b = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', still(frames.find(f => still(f.t)).t), '-vf', 'drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill', '-frames:v', '1', black], { encoding: 'utf8' });
      if (b.status !== 0) { console.error(`ffmpeg failed:\n${b.stderr.trim().split('\n').slice(-12).join('\n')}`); process.exit(2); }
    }
    for (let n = 1; n <= sheetCount; n++) {
      const on = frames.filter(f => f.sheet === n);
      on.forEach((f, i) => symlinkSync(still(f.t) ?? black, path.join(tmp, `f-${String(i + 1).padStart(3, '0')}.png`)));
      const rows = on.length / perShot;
      const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(tmp, 'f-%03d.png'),
        '-vf', `scale=${width}:-2,tile=${perShot}x${rows}`, '-frames:v', '1', '-q:v', '3', path.join(out, sheetName(n))], { encoding: 'utf8' });
      if (r.status !== 0) { console.error(`ffmpeg failed on ${sheetName(n)}:\n${r.stderr.trim().split('\n').slice(-12).join('\n')}`); process.exit(2); }
      on.forEach((_, i) => rmSync(path.join(tmp, `f-${String(i + 1).padStart(3, '0')}.png`)));
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

mkdirSync(out, { recursive: true });
const gone = new Set(missing);
const origin = (from !== 'beats' && fromStoryboard()) ? 'storyboard.md' : 'beats.json';
writeFileSync(path.join(out, 'index.md'), [
  '# Review strips', '',
  `${frames.length} stills: ${shots.length} shots from ${origin}, ${perShot} per shot (${pct} of each shot). One row per shot, left to right.`, '',
  '| Frame | Sheet | Row | Col | Time (s) | Shot | Beat | Note |', '|---|---|---|---|---|---|---|---|',
  ...frames.map((f, i) => `| ${i + 1} | ${sheetName(f.sheet)} | ${f.row} | ${f.col} | ${f.t} | ${f.shot} | ${f.beat} | ${gone.has(f) ? 'missing (black)' : ''} |`), '',
].join('\n'));

console.log(`Strips: ${shots.length} shots × ${perShot} stills → ${sheetCount} sheet${sheetCount > 1 ? 's' : ''} in ${outRel} (index.md)${dry ? ' [dry run]' : ''}`);
for (const f of missing) console.log(`WARN: no still at ${f.t} s (shot ${f.shot}): black cell`);
process.exit(missing.length ? 3 : 0);
