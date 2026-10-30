#!/usr/bin/env node
// Gate 1: is the narration easy to follow by ear? TTS has no eyes: a semicolon, colon, bracket or slash becomes a pause of
// unpredictable length, and a long sentence becomes one breath too many; the viewer loses the thread. Reads narration.txt the
// way tts_timestamps.mjs does (# lines are sections, [tags] are hints, (1.5) is silence, {words|name} is words) and checks
// script.md for the two lines that say where the film goes.
// Fails (file:line): a ; : ( ) or / in spoken text, a sentence with two commas or more that is not a list closed by
// "and"/"then" (the ear hears a list, or loses the point), a sentence starting in lower case (a "…" or a line break
// split it: the voice restarts its intonation there), a sentence over 22 words (languages written without spaces: not
// counted), script.md without a `Promise:` line and a `Takeaway:` line, a letter code ("DNA", "USB-C", "3D") with no
// `written = spoken` line in say.txt (say.mjs). Dialogue files (most lines `name: text`) keep the colon.
//
// Usage: node narration_lint.mjs [project]   (default: .)
// Exit 0 = clean; 1 = problems; 2 = a file could not be read: rerun, then lint again.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSay, codesIn } from './say.mjs';

const dir = process.argv[2] ?? '.';
if (dir === '--help' || dir === '-h') { console.log('Usage: node narration_lint.mjs [project]'); process.exit(0); }
const MAX_WORDS = 22;
// The words that close a list or join its last clause, in the languages the skill is most used in (a sentence in
// another language with two commas is flagged unless its last part starts with one: add the word here).
const CLOSERS = new Set(`and or then so but nor plus yet until while because
  dan atau lalu kemudian terus baru tapi tetapi namun jadi sehingga serta hingga sampai supaya agar karena sambil
  und oder dann aber also sowie et ou puis mais donc ni y e o u pero luego entonces ni ma poi quindi oppure en of maar dus`.split(/\s+/));
const problems = [], warns = [];

const read = file => {
  try { return readFileSync(join(dir, file), 'utf8'); }
  catch (e) {
    if (e.code === 'ENOENT') problems.push(`${file} not found`);
    else warns.push(`${file}: cannot read (${e.code ?? e.message}) — rerun`);
    return null;
  }
};

const narration = read('narration.txt');
if (narration !== null) {
  const lines = narration.replace(/\r/g, '').split('\n');
  const speech = l => !l.trim().startsWith('#') && !/^\s*\(\d+(\.\d+)?\)\s*$/.test(l);
  const talk = lines.filter(l => l.trim() && speech(l));
  const dialogue = talk.length > 0 && talk.filter(l => /^\s*[\p{L}\p{N}_-]{1,24}:\s/u.test(l)).length * 2 >= talk.length;
  let prose = '', at = []; // the spoken text, and the file line of each character
  lines.forEach((l, i) => {
    if (!speech(l)) { prose += '\n'; at.push(i + 1); return; }
    const s = l.replace(/\[[^\]]*\]/g, '').replace(/\{([^{}|]*)(\|[^{}]*)?\}/g, '$1').replace(dialogue ? /^\s*[\p{L}\p{N}_-]{1,24}:\s/u : /^$/, '');
    prose += s + '\n'; at.push(...Array(s.length + 1).fill(i + 1));
  });
  for (const m of prose.matchAll(/[;:()/]/g)) {
    if (dialogue && m[0] === ':') continue;
    problems.push(`narration.txt:${at[m.index]} "${m[0]}" is read as a pause of unknown length — split the sentence, or use a full stop or a comma`);
  }
  for (const m of prose.matchAll(/[^.!?…\n]+(?:[.!?…]+|\n|$)/g)) {
    const words = m[0].trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)), line = at[m.index + m[0].search(/\S/)];
    if (!words.length) continue;
    const head = `"${words.slice(0, 6).join(' ')}${words.length > 6 ? ' …' : ''}"`;
    if (words.length > MAX_WORDS) problems.push(`narration.txt:${line} a sentence of ${words.length} words (${head}): over ${MAX_WORDS}, split it, one idea each`);
    // the voice starts a new sentence's intonation at every . ! ? … and line break: one that goes on in lower case
    // ("… then it pushes") is said, and retaken, as a sentence of its own
    const first = m[0].match(/\p{L}/u)?.[0];
    if (first && first !== first.toUpperCase() && first === first.toLowerCase()) problems.push(`narration.txt:${line} ${head} starts in lower case: the voice says it as a new sentence (a "…" or a line break cut the one before) — end the sentence there with a capital after it, or join it with a comma`);
    // two commas or more: the ear hears a list, or loses which clause is the point (an aside between commas sounds like
    // a list item, three clauses in a row like one flat list) — one clause a sentence, or a list closed by "and"
    const parts = m[0].split(',');
    // closed: the last part starts with the closer ("…, then bake it") or has it after its first word ("…, salt and yeast")
    const closed = (parts.at(-1).match(/\p{L}+/gu) ?? []).slice(0, 2).some(w => CLOSERS.has(w.toLowerCase()));
    if (parts.length >= 3 && !closed) problems.push(`narration.txt:${line} ${head} has ${parts.length - 1} commas: heard as a list, or the point gets lost — one clause per sentence (a full stop), or a list whose last item starts with "and", "then", "so" in the narration language`);
  }
  // a letter code is read by the voice's own rule: how it is said is decided before the first take, in say.txt, so a
  // respelling never reaches the captions (written form on screen, spoken form in narration.txt)
  let say = null;
  try { say = loadSay(dir); } catch (e) { warns.push(`say.txt: cannot read (${e.code ?? e.message}) — rerun`); }
  if (say) {
    const decided = new Set(say.map(([w]) => w));
    for (const { token, index } of codesIn(prose)) if (!decided.has(token)) problems.push(`narration.txt:${at[index]} "${token}" is a letter code the voice reads by its own rule — write how it is said and add "${token} = <said>" to say.txt (captions and the SRT keep ${token}), or "${token} = ${token}" when the voice says it right`);
  }
}

const script = read('script.md');
if (script !== null) {
  for (const key of ['Promise', 'Takeaway']) {
    if (!new RegExp(`^\\s*[*_>-]*\\s*${key}\\s*[*_]*\\s*:`, 'mi').test(script)) problems.push(`script.md has no "${key}:" line — the film must say what it asks and what it answers (script-voice.md "Promise")`);
  }
}

console.log('Narration lint');
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
for (const w of warns) console.log(`  WARN     : ${w}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun, then lint again` : '  Result   : OK');
process.exit(problems.length ? 1 : warns.length ? 2 : 0);
