#!/usr/bin/env node
// Numbers lint (Gate 1): every number the film computes comes from one model. The project's model.mjs writes
// numbers.json ({ "<name>": { "value": <number>, "say": "<the spoken words>" } }, or "<name>": <number>), script.md
// tags a model number `[calc: <name>]`, and narration.txt speaks it in a beat named after it: `{about forty dollars|<name>}`;
// a further mention is a beat `<name>__<suffix>`.
// Checks: every [calc: name] is in numbers.json; numbers.json is not older than model.mjs (an input changed, the model
// not rerun); every beat named after a model number says it — in words first: contains its `say` (whole words, case,
// punctuation and hyphens ignored; a figure beside them is another figure); else in digits: one figure equals the value
// after the narration's rounding (decimals as spoken, "40" = one significant figure, "1,200" / "1.200" thousands),
// unless the words around it are the `say` with one word changed. A beat name used twice is a problem; a beat of
// another name holding a `say` with one word changed is a WARN. `[calc: a × b = c]` hand arithmetic is listed, not checked.
// Usage: node numbers_lint.mjs [project]   (default: .)
// Exit 1 on a problem (file:line, what is spoken, the model value), 2 when a file cannot be read or a beat cannot be
// checked (rerun / add say), 0 when clean.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.');
const problems = [], warns = [], infos = [];
const read = rel => { // text, null when absent, undefined when it could not be read (never "absent")
  try { return readFileSync(path.join(dir, rel), 'utf8'); }
  catch (e) { if (e.code === 'ENOENT') return null; warns.push(`${rel}: cannot read (${e.code}) — rerun`); return undefined; }
};
const lines = t => t.replace(/\r/g, '').split('\n');
const NAME = /^[A-Za-z_]\w*$/;

const script = read('script.md'), narration = read('narration.txt'), json = read('numbers.json');
if (script === null && narration === null) warns.push(`nothing to lint: no script.md or narration.txt in ${dir} — run it in the video project`);
else for (const [rel, t] of [['script.md', script], ['narration.txt', narration]]) if (t === null) problems.push(`${rel} not found in ${dir}`);

// [calc: …] tags in script.md: a name points into numbers.json; anything else is hand arithmetic.
const calcs = [];
lines(script ?? '').forEach((l, i) => {
  for (const m of l.matchAll(/\[calc:\s*([^\]]*?)\s*\]/g)) {
    if (NAME.test(m[1])) calcs.push({ name: m[1], at: `script.md:${i + 1}` });
    else infos.push(`script.md:${i + 1} [calc: ${m[1]}] is hand arithmetic, not checked — give it a name in model.mjs`);
  }
});

let model = null; // name -> { value, say? }
let modelTime = null;
try { modelTime = statSync(path.join(dir, 'model.mjs')).mtimeMs; } catch (e) { if (e.code !== 'ENOENT') warns.push(`model.mjs: cannot read (${e.code}) — rerun`); }
if (json === null) { if (calcs.length || modelTime !== null) problems.push(`numbers.json not found in ${dir} — run node model.mjs`); }
else if (json !== undefined) {
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object of named numbers');
    model = Object.create(null); // no inherited keys: a beat named "constructor" is not a model number
    for (const [k, v] of Object.entries(raw)) {
      const n = typeof v === 'number' ? { value: v } : v && typeof v === 'object' ? v : { value: v };
      if (typeof n.value !== 'number' || !Number.isFinite(n.value)) problems.push(`numbers.json ${k}: value ${JSON.stringify(n.value)} is not a number — fix model.mjs`);
      else if (n.say !== undefined && typeof n.say !== 'string') problems.push(`numbers.json ${k}: say ${JSON.stringify(n.say)} is not text — fix model.mjs`);
      else model[k] = n;
    }
    // invalid entries stay known names, so their [calc] tags are not also reported as missing
    for (const k of Object.keys(raw)) model[k] ??= null;
    if (modelTime !== null && statSync(path.join(dir, 'numbers.json')).mtimeMs < modelTime) problems.push('numbers.json is older than model.mjs (an input changed) — run node model.mjs');
  } catch (e) { warns.push(`numbers.json: cannot parse (${e.message}) — rerun node model.mjs, then this lint`); model = null; }
}
if (model) for (const c of calcs) if (!(c.name in model)) problems.push(`${c.at} [calc: ${c.name}] is not in numbers.json — add it to model.mjs and rerun it`);

// Spoken words: lower case, punctuation as space, a dash between letters kept as "-" (so "one" is not in "twenty-one").
const norm = s => s.normalize('NFKC').toLowerCase().replace(/(?<=[\p{L}\p{N}])\p{Pd}(?=[\p{L}\p{N}])/gu, '\u0000')
  .replace(/[\p{P}\p{S}\s]+/gu, ' ').replace(/\u0000/g, '-').trim();
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const edge = c => c === undefined || c === ' ' || UNSPACED.test(c) || !/[\p{L}\p{N}\p{M}-]/u.test(c);
// "twenty-one" and "twenty one" are the same words: inside the match a dash is a space; outside it, a dash still joins
// the next word ("one" is not in "twenty-one"). The two strings keep the same length, so one index serves both.
const says = (text, say) => {
  const t = norm(text), s = norm(say).replace(/-/g, ' '), tc = t.replace(/-/g, ' ');
  if (!s) return false;
  for (let i = tc.indexOf(s); i >= 0; i = tc.indexOf(s, i + 1)) if ((edge(t[i - 1]) || UNSPACED.test(s[0])) && (edge(t[i + s.length]) || UNSPACED.test(s.at(-1)))) return true;
  return false;
};
// The words of a text, dashes as spaces. nearMiss: a window of the text as long as a multi-word `say` that differs
// from it in exactly one word (no figure in it, and not any model number's own words): the say with another number.
const wordsOf = text => norm(text).replace(/-/g, ' ').split(' ').filter(Boolean);
const nearMiss = (text, say, allSays) => {
  const sw = wordsOf(say), tw = wordsOf(text);
  if (sw.length < 2) return null;
  for (let i = 0; i + sw.length <= tw.length; i++) {
    const w = tw.slice(i, i + sw.length);
    if (w.some(x => /^\p{N}+$/u.test(x)) || allSays.has(w.join(' '))) continue;
    if (w.filter((x, k) => x !== sw[k]).length === 1) return w.join(' ');
  }
  return null;
};
// A figure as spoken -> every value it can mean, each with its rounding: [{ n, round: v => rounded }].
const readings = tok => {
  const out = [], seps = tok.match(/[.,]/g) ?? [];
  const asInt = digits => { // "18" rounds to the unit; "40", "29000" to their significant figures (4, 29)
    const n = Number(digits), z = n ? digits.match(/0*$/)[0].length : 0, sig = String(n).length - z;
    return { n, round: v => (z && v ? Number(v.toPrecision(sig)) : Math.round(v)) }; };
  if (/^\d{1,3}([.,]\d{3})+$/.test(tok) && new Set(seps).size === 1) out.push(asInt(tok.replace(/[.,]/g, ''))); // 1,200 / 28.800
  if (!seps.length) out.push(asInt(tok));
  else { const k = Math.max(tok.lastIndexOf('.'), tok.lastIndexOf(',')), d = tok.length - k - 1;
    out.push({ n: Number(tok.slice(0, k).replace(/[.,]/g, '') + '.' + tok.slice(k + 1)), round: v => Math.round(v * 10 ** d) / 10 ** d }); }
  return out;
};
const show = v => String(Number(v.toPrecision(12))); // 15.99, not 15.990000000000002
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

// A beat is named after a model number (`cost`); a further mention of it is `cost__recap` (the key, two underscores,
// any suffix; the longest key wins). Any other beat is not a model beat, but words one word off a model number's `say`
// there are reported (WARN), never passed as OK.
const keyOf = name => model[name] !== undefined ? name
  : Object.keys(model).filter(k => name.startsWith(k + '__') && name.length > k.length + 2).sort((a, b) => b.length - a.length)[0];
const allSays = new Set(model ? Object.values(model).filter(n => typeof n?.say === 'string').map(n => wordsOf(n.say).join(' ')) : []);
let beats = 0;
const named = new Map(); // beat name -> first line (the voice step renames the second beat of one name: cost -> cost_5)
if (model) lines(narration ?? '').forEach((l, i) => {
  // every beat, named or not; the voice step trims the name, so a name with spaces around it is the same name
  for (const m of l.matchAll(/\{([^{}|]*)(?:\|([^{}]*))?\}/g)) {
    const text = m[1], name = (m[2] ?? '').trim(), key = name && keyOf(name), n = key && model[key], at = `narration.txt:${i + 1}`;
    if (!key) { // not a model beat
      for (const [k, o] of Object.entries(model)) {
        const near = typeof o?.say === 'string' && nearMiss(text, o.say, allSays);
        if (near) warns.push(`${at} {${text}|${name}} says "${near}", one word off ${k} "${o.say}" — if it is the model number, name the beat ${k}__<suffix> so it is checked; if not, reword`);
      }
      continue;
    }
    if (!n) continue; // an invalid model number, already reported
    beats++;
    if (named.has(name)) { problems.push(`${at} {${text}|${name}} is the second beat named ${name} (first at ${named.get(name)}): the voice step renames it; a further mention is named ${key}__<suffix>`); continue; }
    named.set(name, at);
    const toks = text.match(/\d+(?:[.,]\d+)*/g), v = Math.abs(n.value), hasSay = typeof n.say === 'string';
    // Words first: the say decides, a figure beside them is another figure. Else the figure, unless the words around
    // it are the say with another number.
    if (hasSay && says(text, n.say)) continue;
    if (toks && toks.some(t => readings(t).some(r => close(r.round(v), r.n)))) {
      const near = hasSay && nearMiss(text, n.say, allSays);
      if (near) problems.push(`${at} {${text}|${name}} says "${near}" and a figure, model ${show(n.value)} — expects "${n.say}"`);
    } else if (toks) problems.push(`${at} {${text}|${name}} says ${toks.join(', ')}, model ${show(n.value)}${hasSay ? ` — expects "${n.say}"` : ''}`);
    else if (hasSay) problems.push(`${at} {${text}|${name}} says "${text.trim()}", model ${show(n.value)} — expects "${n.say}"`);
    else warns.push(`${at} {${text}|${name}} is spoken in words and numbers.json gives no say for ${key} — add say in model.mjs`);
  }
});

const count = model ? Object.values(model).filter(Boolean).length : 0;
console.log(`Numbers lint: ${count} model numbers, ${calcs.length} [calc: name] tags, ${beats} spoken beats`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
for (const w of warns) console.log(`  WARN     : ${w}`);
for (const n of infos) console.log(`  INFO     : ${n}`);
console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun or fix, then lint again` : '  Result   : OK');
process.exit(problems.length ? 1 : warns.length ? 2 : 0);
