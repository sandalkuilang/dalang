#!/usr/bin/env node
// Review strips for Step 7: N stills per storyboard shot (3 → 10 %, 50 %, 90 %), captured in one `hyperframes
// snapshot` call and tiled on numbered sheets, one row per shot, plus index.md: frame → sheet, row, column → time → shot.
// Shots: storyboard.md's shot table (| # | a–b | beat | …); without it (or with --from beats) audio/beats.json.
// The sheets replace hand-tiled contact sheets: the reviewer reads the index to name a frame by its time and shot.
//
// Usage: node strips.mjs [project] [--per-shot 3] [--per-sheet 12] [--out review/strips] [--from storyboard|beats]
//        [--audio audio] [--width 480] [--timeout <ms>] [--frames <dir>] [--dry-run]
//        [--against <previous round dir> --targets <shots|beats> [--threshold 1]]
//   --frames <dir>  tile stills already captured there (…at-<s>s.png) instead of capturing
//   --dry-run       write index.md only: no capture, no ffmpeg
//   --against <dir> compare each still with the one at the same time in the previous round (its frames/ folder, or the
//                   folder itself) and label it in index.md: unchanged (the earlier verdict stands), changed (targeted)
//                   (its shot number or beat is in --targets: review again), changed (not targeted) (a possible regression)
//   --threshold <%> a frame is changed from this score on (default 1): 64x36 gray mean difference, or 4x less for the
//                   worst 8x9 block, so a small local change is not diluted
// Exit 1: usage, or no shots. Exit 2: the capture or ffmpeg failed, or no still matches any shot time (stills of an
// earlier timing). Exit 3: some still is missing (black cell, WARN) or could not be compared. A possible regression is
// a finding (FLAG), not a failed run: exit 0.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const VAL = ['--per-shot', '--per-sheet', '--out', '--from', '--audio', '--width', '--timeout', '--frames', '--against', '--targets', '--threshold'];
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const dir = argv.find((x, i) => !x.startsWith('--') && !VAL.includes(argv[i - 1])) ?? '.';
const perShot = Math.max(1, parseInt(opt('--per-shot', '3'), 10) || 3);
const shotsPerSheet = Math.max(1, Math.floor((parseInt(opt('--per-sheet', '12'), 10) || 12) / perShot));
const width = parseInt(opt('--width', '480'), 10) || 480;
const outRel = opt('--out', path.join('review', 'strips'));
const out = path.resolve(dir, outRel);
const dry = argv.includes('--dry-run');
const usage = (why) => {
  console.error(`${why}\nUsage: node strips.mjs [project] [--per-shot 3] [--per-sheet 12] [--out review/strips] [--from storyboard|beats] [--audio audio] [--width 480] [--timeout ms] [--frames dir] [--dry-run] [--against prev-round-dir --targets shots|beats [--threshold 1]]`);
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
const against = opt('--against', null), targetsRaw = opt('--targets', null);
const threshold = parseFloat(opt('--threshold', '1'));
const targets = new Set((targetsRaw ?? '').split(',').map(x => x.trim()).filter(Boolean));
if (!!against !== !!targetsRaw) usage('--against needs --targets (the fix list\'s shot numbers or beat names), and --targets needs --against.');
if (against && !(threshold > 0)) usage('--threshold must be a number above 0.');
if (against && dry) usage('--against compares stills: it cannot run with --dry-run.');
for (const x of targets) if (!frames.some(f => f.shot === x || f.beat === x)) usage(`--targets: "${x}" matches no shot number and no beat name of this round.`);
const sheetCount = frames.at(-1).sheet;
const sheetName = n => `strip-${String(n).padStart(2, '0')}.jpg`;
const pct = Array.from({ length: perShot }, (_, j) => `${Math.round(frac(j) * 100)} %`).join(', ');

// Where the stills are: captured now, or taken from --frames. Files are matched by the time in their name.
let framesDir = opt('--frames', null) ? path.resolve(opt('--frames', null)) : path.join(out, 'frames');
const scanDir = d => { // ms → file
  const m = new Map();
  if (!existsSync(d)) return m;
  for (const f of readdirSync(d)) {
    const x = f.match(/at-(\d+(?:\.\d+)?)s\.png$/); // snapshot's own contact-sheet*.jpg never matches
    if (x) m.set(Math.round(+x[1] * 1000), path.join(d, f));
  }
  return m;
};
const nearest = (map, t) => { // exact millisecond, else the nearest within 10 ms (a stamp rounded by the snapshot)
  const ms = Math.round(t * 1000);
  if (map.has(ms)) return map.get(ms);
  let best = null;
  for (const k of map.keys()) if (Math.abs(k - ms) <= 10 && (best === null || Math.abs(k - ms) < Math.abs(best - ms))) best = k;
  return best === null ? null : map.get(best);
};
let found = new Map();
const scan = () => { found = scanDir(framesDir); };
const still = t => nearest(found, t);
if (against) {
  const prevDir = path.resolve(dir, against);
  if (prevDir === out || prevDir === framesDir) usage(`--against ${against} is this run's own output, which a capture overwrites. Keep the last round first under a name no earlier round used (mv review/strips review/strips-<n>, n = rounds done), or capture with --out review/strips-<n+1>.`);
  // The signature of a repeat `mv` onto an existing folder: the last round landed inside it as <dir>/strips, and the
  // folder still holds an older round. Diffing it would compare against the wrong round (false regressions).
  const nested = path.join(prevDir, path.basename(out));
  if (existsSync(path.join(nested, 'frames')) || (existsSync(nested) && scanDir(nested).size)) usage(`--against ${against} holds an older round, and the last round sits inside it at ${nested} (mv onto a folder that already existed). Compare against ${nested}, and name each kept round by its number (review/strips-1, review/strips-2, …).`);
}

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
const gone = new Set(missing);

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

// --against: label every frame by its difference from the still at the same time in the previous round.
const label = new Map(), unreadable = [];
const isTarget = f => targets.has(f.shot) || targets.has(f.beat);
const gray = file => { // 64x36 gray raw buffer, or null
  const g = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'scale=64:36:flags=area,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 });
  return g.status === 0 && g.stdout.length === 2304 ? g.stdout : null;
};
const diffPct = (a, b) => { // the larger of the whole-frame mean and a quarter of the worst 8x9 block's mean, in %
  let all = 0; const blk = new Array(32).fill(0);
  for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) { const d = Math.abs(a[y * 64 + x] - b[y * 64 + x]); all += d; blk[Math.floor(y / 9) * 8 + Math.floor(x / 8)] += d; }
  return Math.max(all / 2304, Math.max(...blk) / 72 / 4) / 255 * 100;
};
if (against) {
  const prevDir = path.resolve(dir, against);
  const prev = scanDir(existsSync(path.join(prevDir, 'frames')) ? path.join(prevDir, 'frames') : prevDir);
  if (!prev.size) { console.error(`No stills named …at-<s>s.png in ${prevDir}.`); process.exit(2); }
  for (const f of frames) {
    if (gone.has(f)) { label.set(f, { change: '-', diff: '' }); continue; }
    const kind = isTarget(f) ? 'changed (targeted)' : 'changed (not targeted)';
    const before = nearest(prev, f.t);
    if (!before) { label.set(f, { change: kind, diff: 'no earlier still', changed: true }); continue; }
    const a = gray(before), b = gray(still(f.t));
    if (!a || !b) { label.set(f, { change: 'unknown', diff: 'unreadable' }); unreadable.push(f); continue; }
    const d = diffPct(a, b);
    label.set(f, d >= threshold ? { change: kind, diff: d.toFixed(1), changed: true } : { change: 'unchanged', diff: d.toFixed(1) });
  }
}
const num = f => frames.indexOf(f) + 1;
const regress = frames.filter(f => label.get(f)?.changed && !isTarget(f));
const quiet = [...targets].filter(x => !frames.some(f => (f.shot === x || f.beat === x) && label.get(f)?.changed));
const count = c => frames.filter(f => label.get(f)?.change === c).length;

mkdirSync(out, { recursive: true });
const origin = (from !== 'beats' && fromStoryboard()) ? 'storyboard.md' : 'beats.json';
writeFileSync(path.join(out, 'index.md'), [
  '# Review strips', '',
  `${frames.length} stills: ${shots.length} shots from ${origin}, ${perShot} per shot (${pct} of each shot). One row per shot, left to right.`, '',
  `| Frame | Sheet | Row | Col | Time (s) | Shot | Beat | Note |${against ? ' Change | Diff (score %) |' : ''}`, `|---|---|---|---|---|---|---|---|${against ? '---|---|' : ''}`,
  ...frames.map((f, i) => `| ${i + 1} | ${sheetName(f.sheet)} | ${f.row} | ${f.col} | ${f.t} | ${f.shot} | ${f.beat} | ${gone.has(f) ? 'missing (black)' : ''} |${against ? ` ${label.get(f).change} | ${label.get(f).diff} |` : ''}`), '',
  ...(against ? [
    `## Against ${against} (threshold ${threshold} %)`,
    `unchanged ${count('unchanged')} · changed (targeted) ${count('changed (targeted)')} · changed (not targeted) ${count('changed (not targeted)')}${unreadable.length ? ` · unknown ${unreadable.length}` : ''}`,
    `Possible regressions (changed, not targeted): ${regress.length ? regress.map(f => `frame ${num(f)} (shot ${f.shot} \`${f.beat}\`, ${f.t} s, ${label.get(f).diff}${/^\d/.test(label.get(f).diff) ? ' %' : ''})`).join(', ') : 'none'}`,
    `Targeted with no changed frame: ${quiet.length ? quiet.map(x => `${x} (the fix is not visible, or not rebuilt)`).join(', ') : 'none'}`,
    'Reviewer: skip `unchanged` frames; their previous verdict stands.', '',
  ] : []),
].join('\n'));

console.log(`Strips: ${shots.length} shots × ${perShot} stills → ${sheetCount} sheet${sheetCount > 1 ? 's' : ''} in ${outRel} (index.md)${dry ? ' [dry run]' : ''}`);
for (const f of missing) console.log(`WARN: no still at ${f.t} s (shot ${f.shot}): black cell`);
if (against) {
  console.log(`Against ${against}: ${count('unchanged')} unchanged, ${count('changed (targeted)')} changed (targeted), ${count('changed (not targeted)')} changed (not targeted)`);
  for (const f of regress) console.log(`FLAG: frame ${num(f)} (shot ${f.shot}, ${f.t} s) changed but its shot is not targeted: possible regression`);
  for (const x of quiet) console.log(`WARN: targeted shot ${x} shows no change`);
  for (const f of unreadable) console.log(`WARN: could not compare frame ${num(f)} (shot ${f.shot}, ${f.t} s); rerun`);
}
process.exit(missing.length || unreadable.length ? 3 : 0);
