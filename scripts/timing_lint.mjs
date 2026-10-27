#!/usr/bin/env node
// Timing lint for a built project: every picture cut sits between words, and no scene is a flicker.
// Reads the visual clips (elements with data-track-index, not <audio> or captions) of index.html and audio/words.json,
// and follows every host (data-composition-src) into its group file, adding the host's start to the group's local times.
// An unreadable group file, an unfilled {{placeholder}} or a host loop is exit 1, never OK.
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

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}=(?:"([^"]*)"|'([^']*)')`)); return m ? m[1] ?? m[2] : undefined; };
const fail = msg => { console.error(msg); process.exit(1); };
const TAG = name => new RegExp(`<(?!audio\\b)([a-z]+)\\b(?:[^>"']|"[^"]*"|'[^']*')*\\s${name}=(?:[^>"']|"[^"]*"|'[^']*')*>`, 'g');
const projectDir = path.dirname(path.resolve(html));
const rel = f => path.relative(projectDir, f) || path.basename(f);

// A film built as shot groups keeps only the hosts in index.html; the cuts inside a group are in its file, with times
// local to that file (data-start is local to the declaring file). Follow every host (data-composition-src) and add its
// start, so a group's cuts are judged on the absolute narration time, like a flat film's.
const clips = [];
const visit = (file, offset, chain) => {
  const label = rel(file), isRoot = chain.length === 1;
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { fail(`Cannot read ${label}: ${e.code || e.message} (a group file is missing: run fill_times.mjs on its template?)`); }
  if (/\sdata-(?:start|duration)=["']\s*\{\{/.test(text)) fail(`${label} still holds {{placeholders}} in data-start / data-duration (run fill_times.mjs on its template first).`);
  for (const m of text.matchAll(TAG('data-composition-src'))) {
    const src = attr(m[0], 'data-composition-src'), start = +attr(m[0], 'data-start');
    if (!Number.isFinite(start)) fail(`Host ${attr(m[0], 'id') || src} in ${label} has no numeric data-start (run fill_times.mjs first?).`);
    const target = path.resolve(projectDir, src);
    if (chain.includes(target)) fail(`${label}: host ${attr(m[0], 'id') || src} mounts itself (${rel(target)} is already open above it): a host loop.`);
    visit(target, offset + start, [...chain, target]);
  }
  for (const m of text.matchAll(TAG('data-track-index'))) {
    // The scene root of a group file mirrors its host (already a clip in the file that declares it): not a second cut.
    if (!isRoot && attr(m[0], 'data-composition-id') && !attr(m[0], 'data-composition-src')) continue;
    clips.push({ id: attr(m[0], 'id') || attr(m[0], 'data-hf-id') || m[1], cls: attr(m[0], 'class') || '', start: offset + +attr(m[0], 'data-start'), dur: +attr(m[0], 'data-duration'), file: isRoot ? '' : label, offset });
  }
};
visit(path.resolve(html), 0, [path.resolve(html)]);
// Captions change on words by design; only picture clips are cuts.
const visual = clips.filter(c => Number.isFinite(c.start) && Number.isFinite(c.dur) && !/\b(cap|captions?|subtitles?|subs?)\b/i.test(`${c.id} ${c.cls}`));
clips.length = 0; clips.push(...visual);
if (!clips.length) { console.error(`No timed visual clips in ${html} (run fill_times.mjs first?).`); process.exit(1); }

const problems = [];
const r3 = t => Math.round(t * 1000) / 1000;
const cutFiles = new Map(); // cut time -> the group files whose clips make it
for (const c of clips) for (const t of [c.start, c.start + c.dur]) { const k = r3(t); if (c.file) cutFiles.set(k, [...new Set([...(cutFiles.get(k) || []), `${c.file}: local time = absolute − ${r3(c.offset)}`])]); }
const cuts = [...new Set(clips.flatMap(c => [c.start, c.start + c.dur]).map(r3))].filter(t => t > 0.05).sort((a, b) => a - b);
for (const t of cuts) {
  const k = words.findIndex(w => t > w.start + 0.04 && t < w.end - 0.04);
  if (k < 0) continue;
  const w = words[k], before = words[k - 1], after = words[k + 1];
  // Nearest silence to move the cut to: the gap before this word or the one after it.
  const gapBefore = before ? (before.end + w.start) / 2 : w.start, gapAfter = after ? (w.end + after.start) / 2 : w.end;
  problems.push(`cut at ${t.toFixed(2)} s falls inside "${w.text}" (${w.start.toFixed(2)}–${w.end.toFixed(2)}); move to ${gapBefore.toFixed(2)} or ${gapAfter.toFixed(2)}${w.est ? ' (word timing estimated — check by ear)' : ''}${cutFiles.has(t) ? ` [in ${cutFiles.get(t).join('; ')}]` : ''}`);
}
for (const c of clips) if (c.dur < 1) problems.push(`clip ${c.file ? `${c.file}#` : ''}${c.id} lasts ${c.dur.toFixed(2)} s — under 1 s reads as a flicker`);

console.log(`Timing lint: ${clips.length} visual clips, ${cuts.length} cut points, ${words.length} words`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : '  Result   : OK');
process.exit(problems.length ? 3 : 0);
