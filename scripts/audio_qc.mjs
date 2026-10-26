#!/usr/bin/env node
// Audio QC of a project's mix: what stills and integrated loudness cannot see. Node + ffmpeg only.
//   1. Bed level: the music <audio> at the gain index.html gives it (data-volume x the data-automation volume lane,
//      clip-local times, placed at data-start) against the narration, RMS in 50 ms frames, the median over the speech
//      frames (word spans of audio/words.json). Flag: the bed more than 25 dB under the narration (inaudible on a phone
//      speaker) or less than 8 dB under it (masks words). Unweighted RMS in dB, not K-weighted LU.
//   2. Clicks: a sample-to-sample jump above 8x the local RMS of the jumps (±5 ms, the sample itself left out) and
//      above 0.1 full scale, in audio/narration.wav and in the --mix file (48 kHz mono). Dropouts: a digital silence
//      (|x| <= 1e-5) of 5–150 ms with sound (> -40 dBFS) in the 50 ms before and after it; given word spans, only
//      one inside a word counts (a pause between words is not a dropout).
//   3. Voice consistency: per sentence (times from audio/words.json, sentences from narration.txt, numbered as
//      tts_timestamps.mjs --retake numbers them), the median pitch (autocorrelation, 16 kHz mono, 40 ms frames every
//      10 ms, 60–400 Hz) and the mean spectral centroid (512-point FFT). Flag a sentence more than 3 semitones or
//      25 % of centroid away from the take's median sentence.
// The starting values come from real films; tune them here only (THRESHOLDS). Every flag is a P1 (references/qc.md,
// Step 7); the results go into PRODUCTION.md. Known limits: data-media-start, data-playback-rate and lane curves are
// ignored; a mix with sharp percussion can show a false click; an engine that writes digital zeros inside a word can
// show a false dropout.
//
// Usage: node audio_qc.mjs [project] [--mix draft.mp4] [--music <id|src>] [--text narration.txt]
// Exit: 0 every check ran, no flag · 3 a flag · 2 a check could not run (WARN above: fix it, rerun) · 1 usage / failure.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { osProblem } from './palette.mjs';

export const THRESHOLDS = {
  bedMaxUnder: 25, bedMinUnder: 8,        // dB of the bed under the narration: inaudible above the first, masking below the second
  clickRatio: 8, clickFloor: 0.1,         // a jump over 8x the local jump RMS and over 0.1 full scale
  dropMinS: 0.005, dropMaxS: 0.15, dropFloor: 1e-5, // a digital silence of 5–150 ms
  soundDb: -40,                           // "sound" and "voiced" start here, dBFS
  maxSemitones: 3, maxCentroid: 0.25,     // a sentence off the take's median pitch / centroid
};
const T = THRESHOLDS;

export const median = (arr) => {
  const v = arr.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const toDb = (rms) => (rms > 1e-6 ? 20 * Math.log10(rms) : -120);
const rmsOf = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return b > a ? Math.sqrt(s / (b - a)) : 0; };

// RMS dBFS per frame of frameS seconds.
export function frameDb(x, rate, frameS = 0.05) {
  const n = Math.round(frameS * rate), out = [];
  for (let a = 0; a + n <= x.length; a += n) out.push(toDb(rmsOf(x, a, a + n)));
  return out;
}

// The bed against the narration over the speech frames. speech: [[start, end], ...] seconds; empty = the narration's own
// frames above -45 dBFS.
export function bedGap({ narr, bed, rate, speech }) {
  const frameS = 0.05, len = Math.min(narr.length, bed.length);
  const nd = frameDb(narr.subarray(0, len), rate, frameS), bd = frameDb(bed.subarray(0, len), rate, frameS);
  const inSpeech = (k) => (speech && speech.length ? speech.some(([s, e]) => (k + 0.5) * frameS >= s && (k + 0.5) * frameS <= e) : nd[k] > -45);
  const sp = [], rest = [];
  let first = -1, last = -1;
  for (let k = 0; k < nd.length; k++) if (inSpeech(k)) { sp.push(k); if (first < 0) first = k; last = k; }
  for (let k = first; k >= 0 && k <= last; k++) if (!inSpeech(k)) rest.push(k);
  const narrDb = median(sp.map((k) => nd[k])), bedDb = median(sp.map((k) => bd[k]));
  const gapDb = narrDb - bedDb;
  const verdict = gapDb > T.bedMaxUnder ? 'inaudible' : gapDb < T.bedMinUnder ? 'masks' : 'ok';
  return { gapDb, narrDb, bedDb, pauseBedDb: median(rest.map((k) => bd[k])), verdict };
}

// Gain at clip-local time t: data-volume x the lane (linear between points, first value held before, last after).
export function gainAt(volume, lane, t) {
  if (!lane || !lane.length) return volume;
  if (t <= lane[0].t) return volume * lane[0].v;
  for (let i = 1; i < lane.length; i++) {
    if (t <= lane[i].t) {
      const a = lane[i - 1], b = lane[i];
      return volume * (b.t === a.t ? b.v : a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t));
    }
  }
  return volume * lane[lane.length - 1].v;
}
// The points of the volume lane in a data-automation JSON, or null. A JSON that does not parse throws.
export function laneOf(automation) {
  if (!automation) return null;
  const j = JSON.parse(automation);
  const lane = (j.lanes || []).find((l) => l && l.target === 'volume');
  const pts = lane && Array.isArray(lane.points) ? lane.points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v)) : [];
  return pts.length ? pts.sort((a, b) => a.t - b.t) : null;
}
// The clip placed at `start` seconds with its gain, as `total` samples of the composition's timeline.
export function applyGain(x, rate, start, volume, lane, total) {
  const out = new Float32Array(total), off = Math.round(start * rate);
  for (let i = Math.max(0, off); i < total && i - off < x.length; i++) out[i] = x[i - off] * gainAt(volume, lane, (i - off) / rate);
  return out;
}

// Sample-to-sample jumps far above their neighbourhood. Events within 50 ms merge into the largest.
export function findClicks(x, rate) {
  const n = x.length, w = Math.max(2, Math.round(0.005 * rate));
  const d = new Float32Array(n), S = new Float64Array(n + 1);
  for (let i = 1; i < n; i++) d[i] = Math.abs(x[i] - x[i - 1]);
  for (let i = 0; i < n; i++) S[i + 1] = S[i] + d[i] * d[i];
  const hits = [];
  for (let i = 1; i < n; i++) {
    if (d[i] <= T.clickFloor) continue;
    const lo = Math.max(1, i - w), hi = Math.min(n, i + w + 1);
    const local = Math.sqrt(Math.max(0, S[hi] - S[lo] - d[i] * d[i]) / Math.max(1, hi - lo - 1));
    const ratio = d[i] / Math.max(local, 1e-9);
    if (ratio > T.clickRatio) hits.push({ t: i / rate, jump: d[i], ratio });
  }
  const out = [];
  for (const h of hits) {
    const prev = out[out.length - 1];
    if (prev && h.t - prev.t < 0.05) { if (h.jump > prev.jump) out[out.length - 1] = { ...h, t: h.t }; } else out.push(h);
  }
  return out;
}

// Digital silences of dropMinS..dropMaxS with sound on both sides; with word spans only those inside a word.
export function findDropouts(x, rate, spans) {
  const out = [], n = x.length, pad = Math.round(0.05 * rate), shrink = 0.02;
  const minN = Math.round(T.dropMinS * rate), maxN = Math.round(T.dropMaxS * rate);
  const sound = (a, b) => b > a && toDb(rmsOf(x, Math.max(0, a), Math.min(n, b))) > T.soundDb;
  for (let i = 0; i < n;) {
    if (Math.abs(x[i]) > T.dropFloor) { i++; continue; }
    let j = i; while (j < n && Math.abs(x[j]) <= T.dropFloor) j++;
    const len = j - i;
    if (len >= minN && len <= maxN && sound(i - pad, i) && sound(j, j + pad)) {
      const a = i / rate, b = j / rate;
      if (!spans || !spans.length || spans.some(([s, e]) => a >= s + shrink && b <= e - shrink)) out.push({ t: a, dur: len / rate });
    }
    i = j;
  }
  return out;
}

// Median pitch (Hz) of the voiced frames, or null.
export function f0Of(x, rate) {
  const N = Math.round(0.04 * rate), hop = Math.round(0.01 * rate);
  const minLag = Math.floor(rate / 400), maxLag = Math.ceil(rate / 60);
  const sq = new Float64Array(x.length + 1);
  for (let i = 0; i < x.length; i++) sq[i + 1] = sq[i] + x[i] * x[i];
  const r = new Float64Array(maxLag + 2), pitches = [];
  for (let a = 0; a + N + maxLag + 1 <= x.length; a += hop) {
    const e0 = sq[a + N] - sq[a];
    if (toDb(Math.sqrt(e0 / N)) <= T.soundDb) continue;
    let best = -1;
    for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
      let c = 0;
      for (let i = 0; i < N; i++) c += x[a + i] * x[a + i + lag];
      const e1 = sq[a + N + lag] - sq[a + lag];
      r[lag] = e0 > 0 && e1 > 0 ? c / Math.sqrt(e0 * e1) : 0;
      if (lag >= minLag && lag <= maxLag && r[lag] > best) best = r[lag];
    }
    if (best < 0.5) continue;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (r[lag] >= 0.9 * best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        const den = r[lag - 1] - 2 * r[lag] + r[lag + 1];
        const off = den < 0 ? (0.5 * (r[lag - 1] - r[lag + 1])) / den : 0;
        pitches.push(rate / (lag + off));
        break;
      }
    }
  }
  return pitches.length >= 8 ? median(pitches) : null;
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + h] * cr - im[i + k + h] * ci, vi = re[i + k + h] * ci + im[i + k + h] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + h] = ur - vr; im[i + k + h] = ui - vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}
// Mean spectral centroid (Hz) over the frames above soundDb, or null.
export function centroidOf(x, rate) {
  const n = 512, hann = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  const re = new Float64Array(n), im = new Float64Array(n), cs = [];
  for (let a = 0; a + n <= x.length; a += 256) {
    if (toDb(rmsOf(x, a, a + n)) <= T.soundDb) continue;
    for (let i = 0; i < n; i++) { re[i] = x[a + i] * hann[i]; im[i] = 0; }
    fft(re, im);
    let num = 0, den = 0;
    for (let k = 1; k < n / 2; k++) { const m = Math.hypot(re[k], im[k]); num += ((k * rate) / n) * m; den += m; }
    if (den > 0) cs.push(num / den);
  }
  return cs.length ? cs.reduce((s, v) => s + v, 0) / cs.length : null;
}

// sentences: [{ n, start, end, text, f0, centroid }] -> the take's medians and the sentences far from them.
export function voiceFlags(sentences) {
  const f0s = sentences.map((s) => s.f0).filter((v) => v != null), cs = sentences.map((s) => s.centroid).filter((v) => v != null);
  const f0Med = median(f0s), cMed = median(cs), flags = [];
  if (f0s.length >= 3) {
    for (const s of sentences) {
      if (s.f0 == null) continue;
      const semitones = 12 * Math.log2(s.f0 / f0Med), centroidPct = s.centroid != null ? (s.centroid / cMed - 1) * 100 : 0;
      if (Math.abs(semitones) > T.maxSemitones || Math.abs(centroidPct) > T.maxCentroid * 100) {
        flags.push({ n: s.n, start: s.start, text: s.text, semitones, centroidPct });
      }
    }
  }
  return { f0Med, cMed, flags };
}

// The sentences of narration.txt with their word ranges in words.json, or null when the counts differ. The split and
// the word rule (a token with a letter or digit; [tags] and the |names| of {beats|names} are not spoken) are those of
// tts_timestamps.mjs, so the numbers are the ones --retake takes.
export function sentencesFrom(text, words) {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !/^\(\s*\d+(?:\.\d+)?\s*s?\s*\)$/.test(l));
  const clean = lines.join('\n').replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\{([^}|]*)\|[^}]*\}/g, '$1').replace(/[{}]/g, '');
  const parts = clean.split(/(?<=[.!?…。！？]["'”’)\]]*)[ \t]+|\n+/g);
  const out = []; let at = 0, total = 0;
  for (const part of parts) {
    const count = [...part.matchAll(/\S+/g)].filter((m) => /[\p{L}\p{N}]/u.test(m[0])).length;
    total += count;
    if (!count) continue;
    const ws = words.slice(at, at + count).filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
    at += count;
    if (ws.length) out.push({ n: out.length + 1, start: ws[0].start, end: ws[ws.length - 1].end, text: part.trim() });
  }
  return total === words.length ? out : null;
}
// Fallback groups: words split where the pause between two is at least `gap` seconds.
export function phrasesFrom(words, gap = 0.3) {
  const ws = words.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
  const out = []; let cur = null;
  for (const w of ws) {
    if (cur && w.start - cur.end < gap) { cur.end = w.end; cur.words.push(w.text); } else { cur = { n: out.length + 1, start: w.start, end: w.end, words: [w.text] }; out.push(cur); }
  }
  return out.map(({ words: t, ...p }) => ({ ...p, text: t.join(' ') }));
}

// Every <audio ...> tag: { id, src, start, volume, automation, bad } (bad: an attribute that is not a number).
export function audioTags(html) {
  const out = [];
  for (const m of html.matchAll(/<audio\b([^>]*?)\/?>/gi)) {
    const attrs = {};
    for (const a of m[1].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[a[1].toLowerCase()] = (a[2] ?? a[3]).replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&amp;/g, '&');
    }
    const bad = [];
    const num = (k, dflt) => {
      if (attrs[k] == null || attrs[k] === '') return dflt;
      const v = Number(attrs[k]);
      if (Number.isFinite(v)) return v;
      bad.push(k); return dflt;
    };
    out.push({ id: attrs.id || '', src: attrs.src || '', start: num('data-start', 0), volume: num('data-volume', 1), automation: attrs['data-automation'] || null, bad });
  }
  return out;
}

// ── I/O ──────────────────────────────────────────────────────────────────────
const fmt = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
class Fatal extends Error {}
const row = (label, text) => `  ${label.padEnd(13)}: ${text}`;

function decode(file, rate) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(rate), '-f', 'f32le', '-'], { maxBuffer: 1024 ** 3 });
  if (r.error) {
    if (r.error.code === 'ENOENT') throw new Fatal(`FAILED: ${osProblem(r.error, 'ffmpeg', { where: ' on PATH' })}`);
    throw new Fatal(`FAILED: ${osProblem(r.error, 'ffmpeg', { where: ' on PATH', rerun: 'rerun' })}`);
  }
  if (r.signal) throw new Error(`ffmpeg was stopped by ${r.signal} reading ${file}; rerun`);
  if (r.status !== 0) {
    const last = String(r.stderr || '').trim().split('\n').pop();
    throw new Error(`ffmpeg could not read ${file}: ${last || 'exit ' + r.status}`);
  }
  const b = r.stdout;
  return b.byteOffset % 4 === 0 ? new Float32Array(b.buffer, b.byteOffset, b.length >> 2) : Float32Array.from(new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.length & ~3))));
}
// A file's status: null when it exists; else the reason (ENOENT is "not found", any other error never is).
function missing(file, what) {
  try { statSync(file); return null; } catch (e) { return e.code === 'ENOENT' ? `${what} not found: ${file}` : osProblem(e, what, { where: `: ${file}`, rerun: 'check the permissions and rerun' }); }
}
function readText(file) {
  try { return { text: readFileSync(file, 'utf8') }; } catch (e) { return { err: e.code === 'ENOENT' ? null : osProblem(e, file, { rerun: 'check the permissions and rerun' }) }; }
}

function main(argv) {
  const a = { dir: '.' };
  let dirSet = false;
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--mix') a.mix = argv[++i];
    else if (k === '--music') a.music = argv[++i];
    else if (k === '--text') a.text = argv[++i];
    else if (!k.startsWith('--') && !dirSet) { a.dir = k; dirSet = true; }
    else { console.error(`Unknown option: ${k}\nUsage: node audio_qc.mjs [project] [--mix draft.mp4] [--music <id|src>] [--text narration.txt]`); process.exit(1); }
  }
  const at = (p) => path.resolve(a.dir, p);
  const lines = [`Audio QC: ${a.dir}`], flags = [], notChecked = [];
  const warn = (m) => lines.push(row('WARN', m));
  const info = (m) => lines.push(row('INFO', m));
  const skip = (what, why) => { warn(`${what} not checked: ${why}`); notChecked.push(what); };
  const flag = (m) => flags.push(row('FLAG (P1)', m));
  const done = [];
  const bad = missing(a.dir, 'project folder');
  if (bad) { console.error(`FAILED: ${bad}`); process.exit(1); }

  // Inputs
  const html = readText(at('index.html'));
  const tags = html.text ? audioTags(html.text) : [];
  if (html.err) warn(html.err);
  if (html.text == null) info('no index.html: the bed is read from --music only and the narration is audio/narration.wav');
  for (const t of tags) if (t.bad.length) warn(`<audio${t.id ? ' id="' + t.id + '"' : ''}> ${t.bad.join(', ')} is not a number (a template expression?): read as the default`);
  const narrTag = tags.find((t) => /narration/i.test(t.id + ' ' + t.src));
  const narrFile = narrTag && narrTag.src && !/^[a-z]+:/i.test(narrTag.src) && !missing(at(narrTag.src), '') ? at(narrTag.src) : at('audio/narration.wav');
  const narrStart = narrTag ? narrTag.start : 0, narrVol = narrTag ? narrTag.volume : 1;
  let narrLane = null;
  try { narrLane = narrTag ? laneOf(narrTag.automation) : null; } catch (e) { warn(`the narration's data-automation is not JSON (${e.message}): its lane is ignored`); }

  const wj = readText(at('audio/words.json'));
  let words = null;
  if (wj.text != null) { try { words = JSON.parse(wj.text); if (!Array.isArray(words)) throw new Error('not a list'); } catch (e) { warn(`audio/words.json is not a word list (${e.message}): rerun tts_timestamps.mjs`); } }
  else if (wj.err) warn(wj.err);
  const spans = words ? words.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end)).map((w) => [w.start, w.end]) : [];

  const nm = missing(narrFile, 'the narration');
  const rate16 = 16000, rate48 = 48000;
  let narr16 = null, narr48 = null;
  if (nm) { skip('narration (bed, clicks, voice)', nm); } else {
    try { narr16 = decode(narrFile, rate16); narr48 = decode(narrFile, rate48); } catch (e) { if (e instanceof Fatal) { console.error(e.message); process.exit(1); } skip('narration (bed, clicks, voice)', e.message); }
  }
  const rel = (f) => path.relative(a.dir, f) || f;

  // 1. Bed
  const musicTag = a.music ? tags.find((t) => t.id === a.music || t.src === a.music) : tags.find((t) => /music|bgm|bed/i.test(t.id + ' ' + t.src));
  const musicSrc = musicTag ? musicTag.src : a.music;
  let bedLine = null;
  if (!musicSrc) {
    info('bed: no music <audio> in index.html (id or src music/bgm/bed); --music <id> names it');
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(musicSrc)) {
    skip('bed', `${musicSrc} is a remote file: download it into the project and rerun`);
  } else if (narr16) {
    const mf = at(musicSrc), mm = missing(mf, 'the music file');
    if (mm) skip('bed', mm); else {
      try {
        let lane = null;
        try { lane = laneOf(musicTag && musicTag.automation); } catch (e) { warn(`the bed's data-automation is not JSON (${e.message}): its lane is ignored`); }
        const music = decode(mf, rate16);
        const vol = musicTag ? musicTag.volume : 1, st = musicTag ? musicTag.start : 0;
        const total = Math.round((narrStart + narr16.length / rate16) * rate16);
        const bed = applyGain(music, rate16, st, vol, lane, total);
        const nt = applyGain(narr16, rate16, narrStart, narrVol, narrLane, total);
        const g = bedGap({ narr: nt, bed, rate: rate16, speech: spans.map(([s, e]) => [s + narrStart, e + narrStart]) });
        if (!Number.isFinite(g.gapDb)) skip('bed', 'no speech frames to compare against (words.json empty and the narration silent)');
        else {
          bedLine = row('Bed', `${rel(mf)} x ${+vol.toFixed(3)}${lane ? ' with a volume lane' : ''} sits ${g.gapDb.toFixed(1)} dB under the narration in speech (band ${T.bedMinUnder}–${T.bedMaxUnder})${Number.isFinite(g.pauseBedDb) ? `, pauses ${g.pauseBedDb.toFixed(1)} dBFS` : ''}`);
          done.push('bed');
          if (g.verdict === 'inaudible') flag(`bed inaudible: ${g.gapDb.toFixed(1)} dB under the narration (> ${T.bedMaxUnder}): raise its data-volume or lane`);
          if (g.verdict === 'masks') flag(`bed masks words: only ${g.gapDb.toFixed(1)} dB under the narration (< ${T.bedMinUnder}): lower it`);
        }
      } catch (e) { if (e instanceof Fatal) { console.error(e.message); process.exit(1); } skip('bed', e.message); }
    }
  }
  if (bedLine) lines.push(bedLine);

  // Sentences (the voice check, and the --retake number for a click)
  let units = null, unitName = 'sentence';
  if (words) {
    const tf = a.text ? { file: at(a.text) } : { file: at('narration.txt') };
    let tx = readText(tf.file);
    if (tx.text == null && !a.text) tx = readText(at('audio/narration.txt'));
    if (tx.err) warn(tx.err);
    units = tx.text != null ? sentencesFrom(tx.text, words) : null;
    if (!units) {
      units = phrasesFrom(words); unitName = 'phrase';
      warn(tx.text != null ? `the sentence split does not match words.json (${words.length} words): checked per phrase, and a click's --retake number is not given` : `no narration.txt (--text names it): checked per phrase, and a click's --retake number is not given`);
    }
  }
  const sentenceAt = (t) => (unitName === 'sentence' && units ? units.find((u) => t >= u.start - 0.05 && t <= u.end + 0.05) : null);

  // 2. Clicks and dropouts
  const scan = (x, label, shift) => {
    const sh = spans.map(([s, e]) => [s + shift, e + shift]);
    return { label, clicks: findClicks(x, rate48), drops: findDropouts(x, rate48, sh), shift };
  };
  const scans = [];
  if (narr48) scans.push(scan(narr48, rel(narrFile), 0));
  if (a.mix) {
    const mixFile = missing(at(a.mix), '') ? a.mix : at(a.mix), mm = missing(mixFile, 'the mix file');
    if (mm) skip('mix', mm); else {
      try { scans.push(scan(decode(mixFile, rate48), a.mix, narrStart)); } catch (e) { if (e instanceof Fatal) { console.error(e.message); process.exit(1); } skip('mix', e.message); }
    }
  } else if (narr48) info('pass --mix draft.mp4 to scan the mix too');
  if (scans.length) {
    done.push('clicks');
    const cap = (list) => list.slice(0, 8);
    for (const s of scans) {
      for (const c of cap(s.clicks)) {
        const u = sentenceAt(c.t - s.shift);
        flag(`click at ${fmt(c.t)} in ${s.label} (jump ${c.jump.toFixed(2)}, ${Math.round(c.ratio)}x local): ${u ? `retake sentence ${u.n} (--retake ${u.n})` : 'retake that sentence'}`);
      }
      if (s.clicks.length > 8) flag(`${s.clicks.length - 8} more clicks in ${s.label}`);
      for (const d of cap(s.drops)) {
        const u = sentenceAt(d.t - s.shift);
        flag(`dropout at ${fmt(d.t)} in ${s.label} (${Math.round(d.dur * 1000)} ms of digital silence inside speech): ${u ? `retake sentence ${u.n} (--retake ${u.n})` : 'retake that sentence'}`);
      }
      if (s.drops.length > 8) flag(`${s.drops.length - 8} more dropouts in ${s.label}`);
    }
    const list = (key) => scans.map((s) => `${s.label} ${s[key].length ? `${s[key].length} (${s[key].slice(0, 4).map((c) => fmt(c.t)).join(', ')}${s[key].length > 4 ? ', …' : ''})` : 'none'}`).join(' · ');
    lines.push(row('Clicks', list('clicks')), row('Dropouts', list('drops')));
  }

  // 3. Voice
  if (!words) skip('voice', 'it needs audio/words.json: rerun tts_timestamps.mjs or check the path');
  else if (narr16 && units) {
    const per = units.map((u) => {
      const x = narr16.subarray(Math.max(0, Math.floor(u.start * rate16)), Math.min(narr16.length, Math.ceil(u.end * rate16)));
      return { ...u, f0: f0Of(x, rate16), centroid: centroidOf(x, rate16) };
    });
    const v = voiceFlags(per);
    done.push('voice');
    const unvoiced = per.filter((s) => s.f0 == null).length;
    lines.push(row('Voice', Number.isFinite(v.f0Med)
      ? `${per.length} ${unitName}s, median ${Math.round(v.f0Med)} Hz, centroid ${Math.round(v.cMed)} Hz${unvoiced ? `, ${unvoiced} too short or unvoiced to judge` : ''}`
      : `${per.length} ${unitName}s, none long enough or voiced to judge`));
    for (const f of v.flags) {
      const text = f.text.length > 60 ? f.text.slice(0, 57) + '…' : f.text;
      flag(`${unitName} ${f.n} at ${fmt(f.start)} is ${f.semitones >= 0 ? '+' : ''}${f.semitones.toFixed(1)} st / ${f.centroidPct >= 0 ? '+' : ''}${Math.round(f.centroidPct)} % centroid off the take: "${text}"${unitName === 'sentence' ? ` -> --retake ${f.n}` : ''}`);
    }
  }

  lines.push(...flags);
  if (flags.length) lines.push(row('Result', `${flags.length} flag(s) — each is a P1: fix and rerun.`));
  else if (notChecked.length) lines.push(row('Result', `NOT CHECKED: ${[...new Set(notChecked)].join(', ')} — rerun after fixing the WARN above.`));
  else lines.push(row('Result', `OK — ${done.includes('bed') ? 'bed audible' : 'no bed in the film'}, no clicks or dropouts, voice steady.`));
  console.log(lines.join('\n'));
  process.exit(flags.length ? 3 : notChecked.length ? 2 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
