#!/usr/bin/env node
// The cue table a builder writes its timeline from, so nobody prints or parses words.json.
// One line per beat: its name, its time, then each of its words as the engine's cue call (`w("word", n)`: n is the
// 0-based occurrence in the whole film, case and punctuation ignored, as engine cues() counts) with its start.
//
// Usage: node cues.mjs [dir] [--beats hook,crack] [--lang <code>]   (reads <dir>/audio[/<code>]/beats.json + words.json)
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
const only = opt('--beats')?.split(',').map(s => s.trim()).filter(Boolean);
const lang = opt('--lang');
const dir = path.resolve(args[0] ?? '.');
const audio = path.join(dir, 'audio', lang ?? '');
const load = f => {
  const p = path.join(audio, f);
  if (!existsSync(p)) { console.error(`FAILED: ${path.relative(dir, p)} not found (run the voice take first)`); process.exit(1); }
  return JSON.parse(readFileSync(p, 'utf8'));
};
const { beats, duration } = load('beats.json');
const raw = load('words.json'), words = Array.isArray(raw) ? raw : raw.words;
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const seen = {}, cue = words.map(w => { const k = norm(w.text), n = seen[k] = (seen[k] ?? -1) + 1; return n ? `${k}#${n}` : k; });
const t = x => Number(x).toFixed(2);

if (only) { const miss = only.filter(n => !beats.some(b => b.name === n)); if (miss.length) { console.error(`FAILED: no beat ${miss.join(', ')} (beats: ${beats.map(b => b.name).join(', ')})`); process.exit(1); } }
console.log(`Cues (w("word", n) = word#n; a word with no #n is n 0) — film ${t(duration)} s`);
beats.forEach((b, i) => {
  if (only && !only.includes(b.name)) return;
  const next = beats[i + 1], to = next ? next.word_index : words.length;
  const ws = words.slice(b.word_index, to).map((w, j) => `${cue[b.word_index + j]} ${t(w.start)}`);
  console.log(`${b.name} ${t(b.start)}–${t(next ? next.start : duration)} | ${ws.join(' · ')}`);
});
