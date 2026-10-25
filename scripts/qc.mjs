#!/usr/bin/env node
// Technical QC of a render in one call: format, duration vs the narration, black frames,
// clipped audio and long silences. Stillness and loudness have their own scripts.
//
// Usage: node qc.mjs draft.mp4 [--audio audio] [--size 1080x1920] [--fps 30]
//   --audio  folder with beats.json; the film must not end before the narration does
//   --size / --fps  expected format (from BRIEF.md); omitted = only reported

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const file = argv.find((x, i) => !x.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!file || !existsSync(file)) { console.error('Usage: node qc.mjs <video> [--audio audio] [--size WxH] [--fps N]'); process.exit(1); }
const audioDir = opt('--audio') ?? 'audio';

const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,pix_fmt,color_primaries,color_transfer,color_space,color_range,width,height,r_frame_rate', '-of', 'json', file], { encoding: 'utf8' }).stdout || '{}');
const v = (probe.streams || []).find(s => s.codec_type === 'video') || {};
const hasAudio = (probe.streams || []).some(s => s.codec_type === 'audio');
const dur = parseFloat(probe.format?.duration);
const [n, d] = String(v.r_frame_rate || '0/1').split('/').map(Number);
const fps = Math.round((n / (d || 1)) * 100) / 100;

// One decode: black frames on the picture; clipping and silences on the sound.
const af = hasAudio ? ['-af', 'astats=metadata=0:measure_overall=Peak_level+Number_of_samples,silencedetect=noise=-50dB:d=2'] : ['-an'];
const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vf', 'blackdetect=d=0.1:pix_th=0.10', ...af, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
const log = r.stderr || '';
const blacks = [...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map(m => [+m[1], +m[2]]);
const silences = [...log.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map(m => [+m[1], +m[2]]);
const peak = parseFloat((log.match(/Overall[\s\S]*?Peak level dB: (-?[\d.inf]+)/) || [])[1]);

const problems = [];
const size = `${v.width}x${v.height}`;
if (opt('--size') && opt('--size') !== size) problems.push(`size ${size}, expected ${opt('--size')}`);
if (opt('--fps') && Math.abs(fps - Number(opt('--fps'))) > 0.01) problems.push(`fps ${fps}, expected ${opt('--fps')}`);
let narration = null;
try { narration = JSON.parse(readFileSync(path.join(audioDir, 'beats.json'), 'utf8')).duration; } catch { /* no timing data */ }
if (narration && dur < narration) problems.push(`film ends at ${dur.toFixed(2)} s, before the narration (${narration} s)`);
if (!hasAudio) problems.push('no audio track');
// Platforms and players expect H.264 4:2:0 tagged BT.709 limited range; an untagged re-encode plays washed out or crushed.
if (v.codec_name !== 'h264' || v.pix_fmt !== 'yuv420p') problems.push(`video is ${v.codec_name}/${v.pix_fmt}, expected h264/yuv420p`);
const tags = [v.color_primaries, v.color_transfer, v.color_space, v.color_range].join('/');
if (tags !== 'bt709/bt709/bt709/tv') problems.push(`colour tags ${tags}, expected bt709/bt709/bt709/tv (re-encode with -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv)`);
// A fade from/to black at the very start or end (≤ 1 s) is fine; anywhere else, or longer, it is a hole.
const holes = blacks.filter(([s, e]) => (s > 0.2 && e < dur - 0.2) || e - s > 1);
if (holes.length) problems.push(`black frames at ${holes.map(([s, e]) => `${s.toFixed(2)}–${e.toFixed(2)} s`).join(', ')}`);
if (Number.isFinite(peak) && peak >= -0.1) problems.push(`audio clips (sample peak ${peak.toFixed(2)} dBFS)`);
if (silences.length) problems.push(`silence ≥ 2 s at ${silences.map(([s, e]) => `${s.toFixed(1)}–${e.toFixed(1)} s`).join(', ')}`);

console.log(`QC: ${file}`);
console.log(`  Format   : ${size} @ ${fps} fps, ${dur.toFixed(2)} s${narration ? ` (narration ${narration} s)` : ''}, audio ${hasAudio ? 'yes' : 'no'}${Number.isFinite(peak) ? `, sample peak ${peak.toFixed(1)} dBFS` : ''}`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
console.log(`  Result   : ${problems.length ? `${problems.length} problem(s) — fix before the gate.` : 'OK'}`);
process.exit(problems.length ? 3 : 0);
