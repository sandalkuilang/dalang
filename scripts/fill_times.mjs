#!/usr/bin/env node
// Fill {{expr}} in an HTML template with times from tts_timestamps.mjs, so HTML attributes that can't
// read window.BEATS (data-start, data-duration) still follow the voice. Re-run after every new take.
// In scope: every beat name (= its start), W[i] / WE[i] (start / end of word i in words.json),
// END (narration duration). Example: data-start="{{hook - 0.05}}" data-duration="{{reveal - hook}}"
//
// Usage: node fill_times.mjs <template.html> <out.html> [--audio audio]

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [src, out, ...rest] = process.argv.slice(2);
if (!src || !out) { console.error('Usage: node fill_times.mjs <template.html> <out.html> [--audio audio]'); process.exit(1); }
const audio = rest[0] === '--audio' ? rest[1] : 'audio';
const B = JSON.parse(readFileSync(path.join(audio, 'beats.json'), 'utf8'));
const words = JSON.parse(readFileSync(path.join(audio, 'words.json'), 'utf8'));
const env = { ...Object.fromEntries(B.beats.map(b => [b.name, b.start])), W: words.map(w => w.start), WE: words.map(w => w.end), END: B.duration };

let n = 0;
const bad = [];
const html = readFileSync(src, 'utf8').replace(/\{\{([^}]+)\}\}/g, (m, expr) => {
  let v;
  try { v = new Function(...Object.keys(env), `return (${expr})`)(...Object.values(env)); }
  catch (e) { console.error(`FAILED: {{${expr}}} — ${e.message}. Beats: ${B.beats.map(b => b.name).join(', ')}`); process.exit(1); }
  if (!Number.isFinite(v)) { console.error(`FAILED: {{${expr}}} is not a number (an untimed beat?)`); process.exit(1); }
  if (v < 0) bad.push(`{{${expr}}} = ${v}`);
  n++;
  return String(Math.round(v * 1000) / 1000);
});
writeFileSync(out, html);
console.log(`${out}: ${n} times filled, END ${B.duration} s`);
if (bad.length) { console.log(`WARNING: negative values (beats out of order?): ${bad.join('; ')}`); process.exit(3); }
