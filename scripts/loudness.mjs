#!/usr/bin/env node
// Measure (and on request, fix) the loudness of a video/audio file against a platform target.
//
// Usage:
//   node loudness.mjs video.mp4                       -> measure only
//   node loudness.mjs video.mp4 --fix fixed.mp4       -> two-pass normalisation to the target
//   node loudness.mjs video.mp4 --target -14 --tp -1  -> change the target (LUFS, dBTP)
//
// Needs ffmpeg. With --fix the video stream is copied, only the audio is re-encoded.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function parseArgs(argv) {
  const a = { target: -14, tp: -1, lra: 11, tol: 1 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--fix') a.fix = argv[++i];
    else if (k === '--target') a.target = parseFloat(argv[++i]);
    else if (k === '--tp') a.tp = parseFloat(argv[++i]);
    else if (k === '--lra') a.lra = parseFloat(argv[++i]);
    else if (k === '--tolerance') a.tol = parseFloat(argv[++i]);
    else if (!a.file && !k.startsWith('--')) a.file = k;
    else { console.error(`Unknown option: ${k}`); process.exit(1); }
  }
  return a;
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) { console.error('FAILED: ffmpeg not found.'); process.exit(1); }
  return r;
}

function hasAudio(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim().length > 0;
}

function measure(file, a) {
  const r = ffmpeg(['-i', file, '-map', '0:a:0', '-af', `loudnorm=I=${a.target}:TP=${a.tp}:LRA=${a.lra}:print_format=json`, '-f', 'null', '-']);
  const m = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!m) { console.error('FAILED to read the loudnorm measurement:\n' + r.stderr.slice(-800)); process.exit(1); }
  return JSON.parse(m[0]);
}

function report(label, j, a, fixed = false) {
  const I = parseFloat(j.input_i), TP = parseFloat(j.input_tp), LRA = parseFloat(j.input_lra);
  const diff = I - a.target;
  const okI = Math.abs(diff) <= a.tol;
  const okTP = TP <= a.tp + 0.1;
  console.log(`${label}`);
  console.log(`  Loudness (integrated): ${I.toFixed(1)} LUFS  (target ${a.target}, off by ${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB)`);
  console.log(`  True peak            : ${TP.toFixed(1)} dBTP (limit ${a.tp})`);
  console.log(`  Range (LRA)          : ${LRA.toFixed(1)} LU`);
  let verdict;
  if (okI && okTP) verdict = 'OK — loudness is on target.';
  else if (fixed) verdict = `STILL OFF after normalising (${!okI ? `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} dB` : 'peak'}): tame the loudest peaks in the mix (lower SFX, or a limiter) and measure again — rerunning --fix won't help.`;
  else if (!okI && diff < 0) verdict = `TOO QUIET by ${Math.abs(diff).toFixed(1)} dB. Raise the narration in the mix, or use --fix.`;
  else if (!okI) verdict = `TOO LOUD by ${diff.toFixed(1)} dB. Lower the mix, or use --fix.`;
  else verdict = 'Peak too high (may clip). Use --fix.';
  console.log(`  Result               : ${verdict}`);
  return okI && okTP;
}

const a = parseArgs(process.argv.slice(2));
if (!a.file) { console.error('Usage: node loudness.mjs <file> [--fix output.mp4] [--target -14] [--tp -1]'); process.exit(1); }
if (!existsSync(a.file)) { console.error(`FAILED: file not found: ${a.file}`); process.exit(1); }
if (!hasAudio(a.file)) { console.log('This file has no audio track. Nothing to measure.'); process.exit(2); }

const j = measure(a.file, a);
const ok = report(`Loudness: ${a.file}`, j, a);

if (a.fix) {
  // Aim the peak 0.5 dB lower: the AAC encode overshoots true peak by about that much.
  const filter = `loudnorm=I=${a.target}:TP=${a.tp - 0.5}:LRA=${a.lra}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true:print_format=summary`;
  const r = ffmpeg(['-y', '-i', a.file, '-map', '0:v?', '-map', '0:a:0', '-c:v', 'copy', '-af', filter, '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', a.fix]);
  if (r.status !== 0) { console.error('FAILED to normalise:\n' + r.stderr.slice(-800)); process.exit(1); }
  const j2 = measure(a.fix, a);
  const ok2 = report(`\nAfter fixing: ${a.fix}`, j2, a, true);
  process.exit(ok2 ? 0 : 3);
}
process.exit(ok ? 0 : 3);
