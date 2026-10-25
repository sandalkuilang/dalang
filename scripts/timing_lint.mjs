#!/usr/bin/env node
// Timing lint for a built project: every picture cut sits between words, and no scene is a flicker.
// Reads the visual clips (elements with data-track-index, not <audio> or captions) of index.html and audio/words.json.
// Checks idea from iart-ai/b-roll-skills (MIT, © 2026 iart.ai); this implementation is dalang's own.
//
// Usage: node timing_lint.mjs [index.html] [--audio audio]
// Exit 3 when a cut falls inside a word or a scene is shorter than 1 s.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const ai = argv.indexOf('--audio');
const audioDir = ai >= 0 ? argv[ai + 1] : 'audio';
const html = argv.find((x, i) => !x.startsWith('--') && argv[i - 1] !== '--audio') ?? 'index.html';
const words = JSON.parse(readFileSync(path.join(audioDir, 'words.json'), 'utf8'));

const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
const clips = [...readFileSync(html, 'utf8').matchAll(/<(?!audio\b)([a-z]+)\b[^>]*\sdata-track-index="[^"]*"[^>]*>/g)]
  .map(m => ({ id: attr(m[0], 'id') || attr(m[0], 'data-hf-id') || m[1], cls: attr(m[0], 'class') || '', start: +attr(m[0], 'data-start'), dur: +attr(m[0], 'data-duration') }))
  // Captions change on words by design; only picture clips are cuts.
  .filter(c => Number.isFinite(c.start) && Number.isFinite(c.dur) && !/\bcap(tion)?s?\b|^cap-/i.test(`${c.id} ${c.cls}`));
if (!clips.length) { console.error(`No timed visual clips in ${html} (run fill_times.mjs first?).`); process.exit(1); }

const problems = [];
const cuts = [...new Set(clips.flatMap(c => [c.start, c.start + c.dur]).map(t => Math.round(t * 1000) / 1000))].filter(t => t > 0.05).sort((a, b) => a - b);
for (const t of cuts) {
  const k = words.findIndex(w => t > w.start + 0.04 && t < w.end - 0.04);
  if (k < 0) continue;
  const w = words[k], before = words[k - 1], after = words[k + 1];
  // Nearest silence to move the cut to: the gap before this word or the one after it.
  const gapBefore = before ? (before.end + w.start) / 2 : w.start, gapAfter = after ? (w.end + after.start) / 2 : w.end;
  problems.push(`cut at ${t.toFixed(2)} s falls inside "${w.text}" (${w.start.toFixed(2)}–${w.end.toFixed(2)}); move to ${gapBefore.toFixed(2)} or ${gapAfter.toFixed(2)}${w.est ? ' (word timing estimated — check by ear)' : ''}`);
}
for (const c of clips) if (c.dur < 1) problems.push(`clip ${c.id} lasts ${c.dur.toFixed(2)} s — under 1 s reads as a flicker`);

console.log(`Timing lint: ${clips.length} visual clips, ${cuts.length} cut points, ${words.length} words`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : '  Result   : OK');
process.exit(problems.length ? 3 : 0);
