#!/usr/bin/env node
// Exposure and hue of a video as numbers, per cut (ffmpeg signalstats), so nobody opens a scope image for a cut that is fine.
// Only a cut outside its band gets a waveform and a vectorscope PNG (--png).
//
// Usage:
//   node scopes.mjs draft.mp4 [--cuts 0,4.2,9.8] [--scene 0.3] [--png [dir]] [--limits tv|pc]
//
//   --cuts    start time (s) of every cut; default: scene detect (--scene = threshold, 0-1)
//   --png     for each flagged cut write <dir>/waveform-<t>.png and <dir>/vectorscope-<t>.png (default dir: review)
//   --limits  tv (floor 16, ceiling 235) or pc (0, 255); default: the stream's colour range, tv when unset
//
// Exit: 0 all cuts inside their bands, 3 a cut is flagged, 2 could not read (WARN, rerun), 1 usage.

import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

// YLOW / YHIGH are the 10th / 90th luma percentile: at the floor / ceiling means 10 % of the pixels sit there
const HUE_JUMP_DEG = 40;  // hue change between adjacent cuts that reads as a different grade
const HUE_MIN_SAT = 20;   // below this SATAVG a cut is near grey and has no hue to compare
const EDGE = 0.2;         // frames in the first and last 20 % of a cut (fades, dissolves) do not count
const RANGE = { tv: [16, 235], pc: [0, 255] };

const usage = () => {
  console.error('Usage: node scopes.mjs <video> [--cuts t0,t1,...] [--scene 0.3] [--png [dir]] [--limits tv|pc]');
  process.exit(1);
};
const warn = what => { console.log(`WARN: could not read ${what}; rerun`); process.exit(2); };

const a = { scene: 0.3 };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--cuts') {
    const v = argv[++i];
    a.cuts = (v ?? '').split(',').map(s => (s.trim() === '' ? NaN : Number(s)));
    if (!a.cuts.length || a.cuts.some(n => !Number.isFinite(n) || n < 0)) usage();
  } else if (k === '--scene') { a.scene = Number(argv[++i]); if (!(a.scene > 0 && a.scene < 1)) usage(); }
  else if (k === '--limits') { a.limits = argv[++i]; if (!RANGE[a.limits]) usage(); }
  else if (k === '--png') a.png = argv[i + 1] && !argv[i + 1].startsWith('--') && a.file ? argv[++i] : 'review';
  else if (!k.startsWith('--') && !a.file) a.file = k;
  else usage();
}
if (!a.file) usage();

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const probe = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
  'format=duration:stream=color_range', '-of', 'default=nw=1', a.file]);
if (probe.error || probe.status !== 0) warn(a.file);
const duration = parseFloat((probe.stdout.match(/duration=([\d.]+)/) || [])[1]);
if (!Number.isFinite(duration) || duration <= 0) warn(a.file);
const limits = a.limits || ((probe.stdout.match(/color_range=(\w+)/) || [])[1] === 'pc' ? 'pc' : 'tv');
const [floor, ceil] = RANGE[limits];

// Per-frame stats, one pass.
const st = run('ffmpeg', ['-hide_banner', '-nostats', '-i', a.file, '-map', '0:v:0', '-vf',
  'signalstats,metadata=mode=print:file=-', '-f', 'null', '-']);
if (st.error || st.status !== 0) warn('the frame statistics of ' + a.file);
const frames = [];
let cur = null;
for (const line of st.stdout.split('\n')) {
  let m;
  if ((m = line.match(/pts_time:([\d.]+)/))) { cur = { t: parseFloat(m[1]) }; frames.push(cur); }
  else if (cur && (m = line.match(/lavfi\.signalstats\.(YMIN|YLOW|YHIGH|YMAX|SATAVG|HUEAVG)=([-\d.]+)/))) cur[m[1]] = parseFloat(m[2]);
}
const good = frames.filter(f => ['YMIN', 'YLOW', 'YHIGH', 'YMAX', 'SATAVG', 'HUEAVG'].every(k => Number.isFinite(f[k])));
if (!good.length) warn('the frame statistics of ' + a.file);

// Cuts: given, or one scene-detect pass.
let starts = a.cuts;
if (!starts) {
  const sc = run('ffmpeg', ['-hide_banner', '-nostats', '-i', a.file, '-map', '0:v:0', '-vf',
    `select='gt(scene,${a.scene})',showinfo`, '-f', 'null', '-']);
  if (sc.error || sc.status !== 0) warn('the scene changes of ' + a.file);
  starts = [0, ...[...sc.stderr.matchAll(/pts_time:([\d.]+)/g)].map(m => parseFloat(m[1])).filter(t => t > 0)];
}
starts = [...new Set(starts)].sort((x, y) => x - y).filter(t => t < duration);
if (!starts.length) warn('the cuts of ' + a.file);

const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const cuts = starts.map((start, i) => {
  const end = i + 1 < starts.length ? starts[i + 1] : duration;
  let fs = good.filter(f => f.t >= start - 1e-6 && f.t < end - 1e-6);
  const mid = fs.filter(f => f.t >= start + EDGE * (end - start) && f.t <= end - EDGE * (end - start));
  if (mid.length) fs = mid;
  if (!fs.length) return { start, end, none: true };
  const rad = d => (d * Math.PI) / 180;
  const hue = (Math.atan2(mean(fs.map(f => Math.sin(rad(f.HUEAVG)))), mean(fs.map(f => Math.cos(rad(f.HUEAVG))))) * 180) / Math.PI;
  return {
    start, end,
    YMIN: Math.min(...fs.map(f => f.YMIN)), YMAX: Math.max(...fs.map(f => f.YMAX)),
    YLOW: mean(fs.map(f => f.YLOW)), YHIGH: mean(fs.map(f => f.YHIGH)),
    SATAVG: mean(fs.map(f => f.SATAVG)), HUEAVG: (hue + 360) % 360, flags: [],
  };
});
if (cuts.some(c => c.none)) warn('the frames of a cut in ' + a.file);

const hueDiff = (x, y) => { const d = Math.abs(x - y) % 360; return d > 180 ? 360 - d : d; };
cuts.forEach((c, i) => {
  if (c.YLOW <= floor) c.flags.push('crushed blacks');
  if (c.YHIGH >= ceil) c.flags.push('clipped whites');
  const p = cuts[i - 1];
  if (p && c.SATAVG >= HUE_MIN_SAT && p.SATAVG >= HUE_MIN_SAT && hueDiff(c.HUEAVG, p.HUEAVG) > HUE_JUMP_DEG) c.flags.push('hue jump');
});

const f = (n, d = 0) => n.toFixed(d);
const flagged = cuts.map((c, i) => ({ c, n: i + 1 })).filter(x => x.c.flags.length);
if (!flagged.length) {
  console.log(`Scopes: ${cuts.length} cuts, ${limits} range — Result: OK, every cut inside its bands (no PNG needed)`);
  process.exit(0);
}
// only the flagged cuts' rows: an in-band cut has nothing to read
console.log(`Scopes: ${cuts.length} cuts, ${limits} range`);
console.log('  cut | start-end s     | YMIN | YMAX | YLOW | YHIGH | SATAVG | HUEAVG | flags');
flagged.forEach(({ c, n }) => {
  const i = n - 1;
  console.log(`  ${String(i + 1).padStart(3)} | ${`${f(c.start, 1)}-${f(c.end, 1)}`.padEnd(15)} | ${f(c.YMIN).padStart(4)} | ${f(c.YMAX).padStart(4)} | ${f(c.YLOW).padStart(4)} | ${f(c.YHIGH).padStart(5)} | ${f(c.SATAVG, 1).padStart(6)} | ${f(c.HUEAVG).padStart(6)} | ${c.flags.join(', ')}`);
});

console.log(`  Result : OPEN THE SCOPES for cut(s) ${flagged.map(x => x.n).join(', ')} (crushed blacks / clipped whites / hue jump); a flag is a finding to look at, the look may want it.`);
if (a.png) {
  mkdirSync(a.png, { recursive: true });
  for (const { c } of flagged) {
    const t = ((c.start + c.end) / 2).toFixed(2);
    const jobs = [['waveform', 'waveform=scale=ire:graticule=green:flags=numbers+dots'], ['vectorscope', 'vectorscope=mode=color3:graticule=color']];
    for (const [name, vf] of jobs) {
      const out = path.join(a.png, `${name}-${t}.png`);
      const r = run('ffmpeg', ['-v', 'error', '-y', '-ss', t, '-i', a.file, '-vf', vf, '-frames:v', '1', out]);
      if (r.error || r.status !== 0) warn(`${name} of ${a.file} at ${t} s`);
      console.log(`  wrote ${out}`);
    }
  }
}
process.exit(3);
