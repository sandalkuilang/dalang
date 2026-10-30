// Spoken ≠ written. narration.txt holds what the voice says ("de en a"); a reader expects what the script writes ("DNA").
// say.txt beside narration.txt: one `written = spoken` per line ("DNA = de en a", "DNA = DNA" when the voice reads it right),
// `#` comments. The voice, words.json and every timing keep the spoken form; captions and the SRT show the written one,
// and a transcript that hears the written form for the spoken one is no mismatch.
// A missing say.txt is no pairs; one that cannot be read throws (unknown is never "none").
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const loadSay = dir => {
  let text;
  try { text = readFileSync(path.join(dir, 'say.txt'), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  return text.split('\n').map(l => l.replace(/#.*/, '').trim()).filter(Boolean).flatMap(l => {
    const i = l.indexOf('=');
    const w = l.slice(0, i).trim(), s = l.slice(i + 1).trim();
    return i > 0 && w && s ? [[w, s]] : [];
  });
};

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spokenRe = s => new RegExp(`(?<![\\p{L}\\p{N}])${s.split(/\s+/).map(esc).join('\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
const capital = (m, w) => m[0] !== m[0].toLowerCase() && w[0] === w[0].toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w;

// a text with every spoken form replaced by its written one (a sentence-initial capital kept)
export const written = (text, say) => say.reduce((t, [w, s]) => w === s ? t : t.replace(spokenRe(s), m => capital(m, w)), text);

// caption phrases ({ text, words: [{ text, start, end, … }] }): the text rewritten, the words of one spoken form merged
// into one written word that spans their times
const core = t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();
export const writtenPhrases = (caps, say) => say.length ? caps.map(p => {
  const words = [...(p.words ?? [])];
  for (const [w, s] of say) {
    if (w === s) continue;
    const toks = s.toLowerCase().split(/\s+/);
    for (let i = 0; i + toks.length <= words.length; i++) {
      const run = words.slice(i, i + toks.length);
      if (!run.every((x, k) => core(String(x.text)) === toks[k])) continue;
      const first = String(run[0].text), last = String(run.at(-1).text);
      const lead = first.match(/^[^\p{L}\p{N}]*/u)[0], tail = last.match(/[^\p{L}\p{N}]*$/u)[0];
      words.splice(i, toks.length, { ...run.at(-1), ...run[0], text: lead + capital(first.slice(lead.length), w) + tail, end: run.at(-1).end });
    }
  }
  return { ...p, text: written(p.text, say), ...(p.words && { words }) };
}) : caps;

// heard word (lower case, no punctuation) → the spoken words it stands for: "dna" → ["de", "en", "a"]
export const heardAs = say => new Map(say.filter(([w, s]) => w !== s && !/\s/.test(w)).map(([w, s]) => [core(w), s.toLowerCase().split(/\s+/)]));

// the narration's letter codes the voice reads by its own rule ("DNA", "USB-C", "3D", "CO2"): [{ token, index }]
export const codesIn = prose => [...prose.matchAll(/[\p{L}\p{N}][\p{L}\p{N}-]*[\p{L}\p{N}]/gu)]
  .filter(m => (m[0].match(/\p{Lu}/gu) ?? []).length >= 2 && !/\p{Ll}/u.test(m[0]) || /\p{L}/u.test(m[0]) && /\p{N}/u.test(m[0]))
  .map(m => ({ token: m[0], index: m.index }));
