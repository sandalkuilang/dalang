#!/usr/bin/env node
// Fill {{expr}} in an HTML template with times from tts_timestamps.mjs, so HTML attributes that can't
// read window.BEATS (data-start, data-duration) still follow the voice. Re-run after every new take.
// In scope: every beat name (= its start), W[i] / WE[i] (start / end of word i in words.json),
// END (narration duration). Example: data-start="{{hook - 0.05}}" data-duration="{{reveal - hook}}"
//
// --lang <code> (a second-language cut, look-build.md "Second-language cut"): the times come from audio/<code>/, and
// every local src / href of the output is switched to its language variant: audio/<rest> -> audio/<code>/<rest>
// (missing = FAILED: the cut would play the first language's file; a path already in audio/<code>/ must exist too),
// any other <dir>/<name>.<ext> -> <dir>/<name>.<code>.<ext> when that file exists. No variant: kept as a
// language-free asset, except narration.<ext> and strings.<ext> (the narration the film plays, the on-screen words),
// which are FAILED like audio/. A leading ./ is ignored. URLs, //, / and # paths are kept. Paths resolve from the current folder (the project). Without --lang only the times change, so a plain run
// after a cut gives the first language's index.html back byte for byte (Gate 4 hashes it).
//
// Usage: node fill_times.mjs <template.html> <out.html> [--audio audio | --lang <code>]

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const USAGE = 'Usage: node fill_times.mjs <template.html> <out.html> [--audio audio | --lang <code>]';
const [src, out, ...rest] = process.argv.slice(2);
if (!src || !out) { console.error(USAGE); process.exit(1); }
let audio = 'audio', lang = null, audioGiven = false;
for (let i = 0; i < rest.length; i += 2) {
  const flag = rest[i], value = rest[i + 1];
  if (flag === '--audio' && value !== undefined) { audio = value; audioGiven = true; }
  else if (flag === '--lang' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value ?? '')) lang = value;
  else { console.error(USAGE); process.exit(1); }
}
if (audioGiven && lang) { console.error(USAGE); process.exit(1); }
if (lang) {
  audio = path.join('audio', lang);
  if (!existsSync(path.join(audio, 'beats.json'))) { console.error(`FAILED: no ${audio}/beats.json — run tts_timestamps.mjs --out ${audio} first`); process.exit(1); }
}
const B = JSON.parse(readFileSync(path.join(audio, 'beats.json'), 'utf8'));
const words = JSON.parse(readFileSync(path.join(audio, 'words.json'), 'utf8'));
if (B.pad && readFileSync(src, 'utf8').includes(`${audio}/${B.pad.take}`)) { console.error(`FAILED: ${src} plays ${audio}/${B.pad.take}, but the times are padded (pad_voice.mjs): play ${audio}/voice.wav, or the picture runs ${B.pad.lead} s early`); process.exit(1); }
if (!B.pad && /audio\/voice\.wav/.test(readFileSync(src, 'utf8'))) console.warn(`WARN: ${audio}/voice.wav has no room yet (beats.json has no pad record): run node ${path.join(path.dirname(new URL(import.meta.url).pathname), 'pad_voice.mjs')} . first (1.45 s before the voice, 1.35 s after)`);
const env = { ...Object.fromEntries(B.beats.map(b => [b.name, b.start ?? NaN])), W: words.map(w => w.start), WE: words.map(w => w.end), END: B.duration };

let n = 0;
const bad = [];
let html = readFileSync(src, 'utf8').replace(/\{\{([^}]+)\}\}/g, (m, expr) => {
  let v;
  // `with` (not parameters) so a beat named like a reserved word (new, class) can't break every expression.
  try { v = new Function('$', `with ($) return (${expr})`)(env); }
  catch (e) { console.error(`FAILED: {{${expr}}} — ${e.message}. Beats: ${B.beats.map(b => b.name).join(', ')}`); process.exit(1); }
  if (!Number.isFinite(v)) { console.error(`FAILED: {{${expr}}} is not a number (an untimed beat?)`); process.exit(1); }
  if (v < 0) bad.push(`{{${expr}}} = ${v}`);
  n++;
  return String(Math.round(v * 1000) / 1000);
});
// --lang: every local src / href to its language variant (a missing audio/ variant, or one of narration.* / strings.*
// anywhere, writes nothing)
const LANG_BOUND = /^(narration|strings)\.[^.]+$/;
const switched = [], missing = [];
if (lang) html = html.replace(/(\s(?:src|href)=)(["'])([^"']+)\2/g, (m, pre, q, val) => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(val) || /^[/#]/.test(val) || val.includes('{{')) return m; // URL, absolute, anchor
  const [, raw, tail] = val.match(/^([^?#]*)(.*)$/); // the existence check ignores a ?query / #hash, the output keeps it
  const p = path.posix.normalize(raw); // ./audio/x, audio//x and a/../audio/x are audio/x
  let to;
  if (p.startsWith('audio/')) {
    if (p.startsWith(`audio/${lang}/`)) {
      if (!existsSync(p)) { if (!missing.includes(p)) missing.push(p); }
      return m;
    }
    to = `audio/${lang}/${p.slice(6)}`;
    if (!existsSync(to)) { if (!missing.includes(p)) missing.push(p); return m; }
  } else {
    to = p.replace(/(\.[^./]+)$/, `.${lang}$1`);
    if (to === p || !existsSync(to)) {
      // the narration the film plays and the on-screen words are language-bound by name: no variant = FAILED
      if (LANG_BOUND.test(path.posix.basename(p))) { if (!missing.includes(p)) missing.push(p); }
      return m; // else a language-free asset
    }
  }
  if (!switched.includes(`${p} → ${to}`)) switched.push(`${p} → ${to}`);
  return pre + q + to + tail + q;
});
if (missing.length) { console.error(`FAILED: --lang ${lang}: no language variant for ${missing.join(', ')} (the cut would play the first language's file)`); process.exit(1); }
writeFileSync(out, html);
console.log(`${out}: ${n} times filled, END ${B.duration} s`);
if (lang) console.log(switched.length ? `--lang ${lang}: ${switched.length} path(s) switched: ${switched.join(', ')}` : `--lang ${lang}: no path switched`);
if (bad.length) { console.log(`WARNING: negative values (beats out of order?): ${bad.join('; ')}`); process.exit(3); }
