#!/usr/bin/env node
// Find the "still" parts of a video (the picture barely changes) and compute their share.
// A slightly moving mouth still counts as still — that is exactly what we want to catch.
//
// Usage:
//   node stillness.mjs draft.mp4
//   node stillness.mjs draft.mp4 --noise 0.004 --min 0.5 --max-still 1.5 --target 10
//
//   --noise      change threshold (0–1). Higher = more counts as still.
//                Use the SAME value when measuring a reference video and your own draft.
//   --min        minimum length (seconds) before a stretch counts as still
//   --max-still  still stretches longer than this are flagged (seconds)
//   --target     maximum still percentage that is still OK
//   --allow a-b  a deliberate pause (repeatable), e.g. --allow 12.0-14.5

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function parseArgs(argv) {
  const a = { noise: 0.004, min: 0.5, maxStill: 1.5, target: 10, allow: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--noise') a.noise = parseFloat(argv[++i]);
    else if (k === '--min') a.min = parseFloat(argv[++i]);
    else if (k === '--max-still') a.maxStill = parseFloat(argv[++i]);
    else if (k === '--target') a.target = parseFloat(argv[++i]);
    else if (k === '--allow') { const [s, e] = argv[++i].split('-').map(Number); a.allow.push([s, e]); }
    else if (!a.file && !k.startsWith('--')) a.file = k;
    else { console.error(`Unknown option: ${k}`); process.exit(1); }
  }
  return a;
}

const fmt = s => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

const a = parseArgs(process.argv.slice(2));
if (!a.file) { console.error('Usage: node stillness.mjs <video> [--noise 0.004] [--min 0.5] [--max-still 1.5] [--target 10]'); process.exit(1); }
if (!existsSync(a.file)) { console.error(`FAILED: file not found: ${a.file}`); process.exit(1); }

const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration', '-of', 'csv=p=0', a.file], { encoding: 'utf8' });
const duration = parseFloat(probe.stdout.trim());
if (!Number.isFinite(duration) || duration <= 0) { console.error('FAILED to read the video duration.'); process.exit(1); }

const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', a.file, '-map', '0:v:0', '-vf', `freezedetect=n=${a.noise}:d=${a.min}`, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (r.error) { console.error('FAILED: ffmpeg not found.'); process.exit(1); }

const segs = [];
let cur = null;
for (const line of r.stderr.split('\n')) {
  let m;
  if ((m = line.match(/freeze_start:\s*([\d.]+)/))) cur = { start: parseFloat(m[1]) };
  else if ((m = line.match(/freeze_end:\s*([\d.]+)/)) && cur) { cur.end = parseFloat(m[1]); segs.push(cur); cur = null; }
}
if (cur) { cur.end = duration; segs.push(cur); }

const overlapsAllowed = s => a.allow.some(([x, y]) => s.start >= x - 0.25 && s.end <= y + 0.25);
const counted = segs.filter(s => !overlapsAllowed(s));
const total = counted.reduce((t, s) => t + (s.end - s.start), 0);
const pct = (total / duration) * 100;
const longest = counted.reduce((m, s) => Math.max(m, s.end - s.start), 0);
const flagged = counted.filter(s => s.end - s.start > a.maxStill);

console.log(`Stillness: ${a.file}`);
console.log(`  Video length        : ${duration.toFixed(1)} s`);
console.log(`  Total still         : ${total.toFixed(1)} s = ${pct.toFixed(1)}%  (target ≤ ${a.target}%)`);
console.log(`  Longest still       : ${longest.toFixed(1)} s  (limit ${a.maxStill})`);
console.log(`  Still stretches     : ${counted.length}${a.allow.length ? ` (+${segs.length - counted.length} deliberate pauses ignored)` : ''}`);
if (flagged.length) {
  console.log('  Needs more motion:');
  for (const s of flagged) console.log(`    ${fmt(s.start)} – ${fmt(s.end)}  (${(s.end - s.start).toFixed(1)} s)`);
}
const ok = pct <= a.target && flagged.length === 0;
console.log(`  Result              : ${ok ? 'OK — enough motion.' : 'NEEDS MOTION — add continuous motion in the stretches above.'}`);
console.log(`  (threshold --noise ${a.noise}; keep it the same when comparing with a reference video)`);
process.exit(ok ? 0 : 3);
