#!/usr/bin/env node
// Audio QC of a project's mix: what stills and integrated loudness cannot see. Node + ffmpeg only.
//   1. Bed level: every music <audio> (anchored names: music, bgm, bed, soundtrack, with an index or a cue word; the src
//      may sit on a <source> child) at the gain index.html gives it (data-volume x the data-automation volume lane,
//      clip-local times, placed at data-start, entered at data-media-start, cut at data-end or data-duration, times the
//      <hf-audio-group> bus data-volume and the linear data-fade-in / data-fade-out), summed, against the narration (same
//      model), RMS in 50 ms frames, the median over the speech
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
// Step 7); the results go into PRODUCTION.md. A bed whose level the script cannot compute (index.html unreadable or
// absent without --music, no src in the HTML, a data-volume or lane that does not parse, a data-playback-rate other than
// 1, an <audio> not named as music that plays longer than an SFX, loops without a short data-duration or cannot be read, a
// <video> that is not muted (HyperFrames' compile step gives it an id and data-has-audio="true", so its sound is mixed),
// until --music names every bed; a data-fx-chain on a bed, the narration, a bus or the composition root, a bus lane, a
// fade-out without a clip end, a data-composition-src sub-composition) is NOT CHECKED, never "no bed" and never OK; so is a
// voice check with fewer than 3 voiced sentences. The Result is made in one place (verdict): OK only when the bed, clicks and
// voice each have an outcome.
//
// THE CONTRACT IS BOUNDED TO THE DECLARED MIX: the <audio> and <video> tags and the <hf-audio-group> buses of index.html,
// with the attributes of the allowlist below (INPUTS = modelled or judged, INERT = no effect on the mix; the inputs are
// those of HyperFrames 0.8.206). Anything outside it makes the bed NOT CHECKED (exit 2), never OK, and the model is not
// meant to grow until it equals the renderer: (1) an attribute outside the allowlist, or the same attribute twice on one
// element (the first value is read, like the DOM); (2) a data-hidden or <template> ancestor, a lane other than a straight
// volume lane, a gain HyperFrames clamps; (3) THE SCRIPT RULE: a page that loads ANY script other than the engine library
// is NOT CHECKED, never a pass ("page runs a script that is not the engine library; check the bed by ear on the draft"), whether a bed is measured or "no bed in the film" is being proved (a script can make an <audio> at run time or change an SFX's src or duration). A
// script is a <script> of any type a browser runs (the JavaScript MIME essences and the language attribute included), inline
// or by src / SVG href, and script text in an attribute (an on* handler on any element, a javascript: URL). The engine
// library is a local file the .engine.json beside it lists (a copy under examples/ is not listed: NOT CHECKED, a spurious
// but safe answer), loaded by a <script src>; nothing else is allowed, and no script
// text is read: no word list, no JavaScript parsed, so no way of writing the same thing differently gets past it. A page with
// a <base href> or a <script type="importmap"> changes what a name loads: NOT CHECKED too ("page loads scripts the check does
// not resolve; ..."). A NESTED DOCUMENT: an iframe srcdoc is read as a document like index.html (its scripts are judged by the
// same rule, its own media is NOT CHECKED); an iframe or frame src, an object data, an embed src (FRAMES) that opens a local or
// unresolved document is NOT CHECKED, a remote http(s) one is another origin. One choke point judges every document
// (pageProblem): a scan field it does not know throws, never passes; (4) the unknown tags and fx chains above. A tag
// HyperFrames leaves out (data-hidden on the tag or its bus, a data-duration of 0, a data-end at or before the start) is not
// a bed, nor is a tag in a comment. Other limits: a `loop` bed is repeated across the film (an unnamed `loop` clip without a
// data-duration of at most 10 s is unknown); a mix with sharp percussion can show a false click; an engine that writes digital
// zeros inside a word can show a false dropout.
//
// Usage: node audio_qc.mjs [project] [--mix draft.mp4] [--music <id|src>]... [--text narration.txt]   (--music: once per bed)
// Exit: 0 every check ran, no flag · 3 a flag · 2 a check could not run (WARN above: fix it, rerun; a cause
// the film cannot fix, such as a page script, is named in the hand-off when nobody can listen: never a pass) · 1 usage / failure.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { osProblem } from './palette.mjs';

// ── ALLOWLIST: the attributes of a media element or a bus that the model applies or judges (INPUTS) or knows do not
// change the mix (INERT; aria-* too). Written once; a new input is modelled only by adding it here and applying it.
export const HF_MAX_GAIN = 10 ** (12 / 20); // HyperFrames clamps a gain to 0..+12 dB
export const INPUTS = {
  media: new Set(['src', 'data-start', 'data-end', 'data-duration', 'data-volume', 'data-media-start', 'data-playback-rate', 'data-automation', 'loop', 'data-audio-group', 'data-fx-chain', 'data-fade-in', 'data-fade-out', 'data-hidden', 'data-has-audio', 'muted']),
  bus: new Set(['data-volume', 'data-fx-chain', 'data-automation', 'data-hidden']),
};
export const INERT = new Set(['id', 'class', 'style', 'title', 'alt', 'type', 'width', 'height', 'poster', 'preload', 'crossorigin', 'referrerpolicy', 'controls', 'autoplay', 'playsinline', 'webkit-playsinline', 'disablepictureinpicture', 'disableremoteplayback', 'data-hf-id', 'data-hf-render-id', 'data-hf-auto-start', 'data-track-index', 'data-layer', 'data-label', 'data-name']);
export const THRESHOLDS = {
  bedMaxUnder: 25, bedMinUnder: 8,        // dB of the bed under the narration: inaudible above the first, masking below the second
  clickRatio: 8, clickFloor: 0.1,         // a jump over 8x the local jump RMS and over 0.1 full scale
  dropMinS: 0.005, dropMaxS: 0.15, dropFloor: 1e-5, // a digital silence of 5–150 ms
  soundDb: -40,                           // "sound" and "voiced" start here, dBFS
  maxSemitones: 3, maxCentroid: 0.25,     // a sentence off the take's median pitch / centroid
  sfxMaxS: 10,                            // an <audio> not named as music plays at most this long to count as an SFX
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
// The points of the volume lane in a data-automation JSON (sorted by t), or null without one. Only what the model applies
// passes; anything else throws, so the tag is NOT CHECKED: a JSON that does not parse, a format other than HyperFrames'
// version 1 with a lanes list, a lane other than volume (rate, fx.*), a point that is not {t, v} numbers, a curved point
// (curve, viaX / viaY; the model draws straight lines), a gain HyperFrames clamps, more points than it reads (512).
export function laneOf(automation) {
  if (!automation) return null;
  const j = JSON.parse(automation);
  if (!j || typeof j !== 'object' || j.version !== 1 || !Array.isArray(j.lanes)) throw new Error('not a version 1 automation with a lanes list');
  const other = j.lanes.find((l) => !l || l.target !== 'volume');
  if (other) throw new Error(`a "${other && other.target}" lane, which this check does not model`);
  const lane = j.lanes[0];
  if (!lane) return null;
  if (!Array.isArray(lane.points) || lane.points.length > 512) throw new Error('a volume lane without a points list of at most 512');
  for (const p of lane.points) {
    if (!p || !Number.isFinite(p.t) || !Number.isFinite(p.v)) throw new Error('a lane point that is not {t, v} numbers');
    if (p.curve || p.viaX !== undefined || p.viaY !== undefined) throw new Error('a curved lane segment, which this check reads as a straight line');
    if (p.v < 0 || p.v > HF_MAX_GAIN) throw new Error(`a lane gain of ${p.v} (HyperFrames clamps a gain to 0–${HF_MAX_GAIN.toFixed(2)})`);
  }
  return lane.points.length ? [...lane.points].sort((a, b) => a.t - b.t) : null;
}
// The clip placed at `start` seconds with its gain, as `total` samples of the composition's timeline. opts.mediaStart:
// seconds skipped at the head of the file (data-media-start); opts.dur: the clip's length on the timeline (data-duration);
// opts.loop: the clip repeats until opts.dur, else until the end of the film. opts.fadeIn / opts.fadeOut: linear fades of
// the clip's first / last seconds (afade as HyperFrames applies it; the pair is scaled down when longer than opts.dur; a
// fade-out needs opts.dur).
export function applyGain(x, rate, start, volume, lane, total, opts = {}) {
  const out = new Float32Array(total), off = Math.round(start * rate), ms = Math.max(0, Math.round((opts.mediaStart || 0) * rate));
  const avail = Math.max(0, x.length - ms), durN = opts.dur > 0 ? Math.round(opts.dur * rate) : null;
  const n = opts.loop && avail > 0 ? (durN ?? Math.max(0, total - off)) : Math.min(avail, durN ?? avail);
  const L = opts.dur > 0 ? opts.dur : null;
  let fi = opts.fadeIn > 0 ? opts.fadeIn : 0, fo = opts.fadeOut > 0 && L ? opts.fadeOut : 0;
  if (L && fi + fo > L) { const s = L / (fi + fo); fi *= s; fo *= s; }
  for (let k = 0; k < n; k++) {
    const i = off + k;
    if (i < 0 || i >= total) continue;
    const t = k / rate, fade = (fi > 0 && t < fi ? t / fi : 1) * (fo > 0 && t > L - fo ? Math.max(0, (L - t) / fo) : 1);
    out[i] = x[ms + (opts.loop ? k % avail : k)] * gainAt(volume, lane, t) * fade;
  }
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
  const f0Med = median(f0s), cMed = median(cs), flags = [], judged = f0s.length >= 3;
  if (judged) {
    for (const s of sentences) {
      if (s.f0 == null) continue;
      const semitones = 12 * Math.log2(s.f0 / f0Med), centroidPct = s.centroid != null ? (s.centroid / cMed - 1) * 100 : 0;
      if (Math.abs(semitones) > T.maxSemitones || Math.abs(centroidPct) > T.maxCentroid * 100) {
        flags.push({ n: s.n, start: s.start, text: s.text, semitones, centroidPct });
      }
    }
  }
  return { f0Med, cMed, flags, judged, voiced: f0s.length };
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

// The attributes of a tag's text: name="v", name='v', name=v and a bare name (loop): a bare attribute is present with ''.
// The first value of a repeated name wins, like the DOM; the repeated names go to `dups`.
// `raw` gets each value as written (no character reference decoded), for the attributes whose text is decoded once, in full (htmlDecode).
const attrsOf = (text, dups = [], raw = {}) => {
  const attrs = {};
  for (const a of text.matchAll(/([\w:.@-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const k = a[1].toLowerCase();
    if (Object.hasOwn(attrs, k)) { if (!dups.includes(k)) dups.push(k); continue; }
    raw[k] = a[2] ?? a[3] ?? a[4] ?? '';
    attrs[k] = (a[2] ?? a[3] ?? a[4] ?? '').replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&amp;/g, '&');
  }
  return attrs;
};
// The character references a browser decodes before it runs the script text of an attribute (numeric and the few named ones).
const htmlDecode = (t) => t.replace(/&(?:#(\d+)|#x([\da-f]+)|(lt|gt|quot|apos|amp|nbsp));/gi, (all, d, h, n) => {
  if (n) return { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&', nbsp: ' ' }[n.toLowerCase()];
  const c = d != null ? Number(d) : parseInt(h, 16);
  return c <= 0x10ffff ? String.fromCodePoint(c) : all;
});
// A fade length as HyperFrames reads it: parseFloat, and only a finite value above 0 is a fade.
const fadeOf = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// Unmodelled inputs of a tag or bus: an attribute outside the ALLOWLIST (top of the file), a repeated one, a gain
// HyperFrames clamps; [] when the model covers it all. renderProblem makes them NOT CHECKED for a measured tag.
const unmodelledOf = (attrs, known, dups = []) => {
  const out = Object.keys(attrs).filter((k) => !known.has(k) && !INERT.has(k) && !k.startsWith('aria-'));
  for (const k of dups) out.push(`a repeated ${k}`);
  const v = parseFloat(attrs['data-volume']);
  if (Number.isFinite(v) && (v < 0 || v > HF_MAX_GAIN)) out.push(`data-volume ${v} (HyperFrames clamps a gain to 0–${HF_MAX_GAIN.toFixed(2)})`);
  return out;
};
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TAGS = new Set(['script', 'style', 'textarea', 'title']);

// One walk over index.html the way a browser reads it: a comment or raw text (script, style) holds no tag, a closing
// tag closes up to its element, `/>` closes only a void element (a `<div data-hidden/>` stays open). Every <audio> and
// every <video> that HyperFrames mixes is a media tag: its compile step gives each one an id and a <video> without
// data-has-audio the flag "true" unless it is muted, so a video is silent only when muted or data-has-audio is not "true".
// Returns { media, groups, master, scripts }:
//   media: { kind, id, src, start, end, volume, duration, mediaStart, rate, automation, bad, loop, group, fx, fadeIn,
//     fadeOut, hidden, unmodelled, context } (bad: an attribute that is not a number; loop / hidden: the bare attribute;
//     group: data-audio-group; fx: data-fx-chain; end: data-end; unmodelled: unmodelledOf; context: why an ancestor's state
//     is unknown, or null). A tag without src takes the src of its first <source> child.
//   groups: the <hf-audio-group> buses by id: { volume (data-volume, 1 when absent or not a number), fx, automation, hidden,
//     unmodelled }. A member is mixed on its bus: its gain times the bus volume, then the bus's own lane and fx chain.
//   master: the data-fx-chain of the first data-composition-id element (the master bus), or null.
//   scripts: { attrs, text } of every <script>.
//   handlers: { tag, attr, text } of every script text that sits in an attribute, on any element: an on* event handler
//     (onload, onerror...) and a javascript: URL (character references decoded). Script text like any <script>, see scriptProblem.
//   frames: { tag, attr, value } of every attribute that opens another document in the page (FRAMES: an iframe src or
//     srcdoc, a frame src, an object data, an embed src...), its value decoded once; a javascript: URL is a handler instead.
//   base: the href of the first <base href> (a page with one is NOT CHECKED, see scriptProblem), or null.
// Every field is judged by pageProblem (code) or the bed check (mix); a field neither knows throws (SCAN_FIELDS).
export function scanHtml(html) {
  const media = [], groups = new Map(), scripts = [], handlers = [], frames = [], stack = [];
  let master, base;
  const re = /<!--[\s\S]*?(?:-->|$)|<\/([a-zA-Z][\w:.-]*)[^>]*>|<([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (let m; (m = re.exec(html));) {
    if (m[1]) { const i = stack.findLastIndex((e) => e.name === m[1].toLowerCase()); if (i >= 0) stack.length = i; continue; }
    if (!m[2]) continue;
    const name = m[2].toLowerCase(), selfClosed = /\/\s*$/.test(m[3]), dups = [], raw = {}, attrs = attrsOf(m[3].replace(/\s*\/\s*$/, ''), dups, raw);
    // Every attribute of every element, decoded once as the browser does: script text (an on* handler, a javascript: URL)
    // and a document the element opens (FRAMES: an iframe srcdoc is read as a document, any other local one is a load not resolved).
    for (const attr of Object.keys(attrs)) {
      const v = htmlDecode(raw[attr]), opens = Object.hasOwn(FRAMES, name) && FRAMES[name].includes(attr);
      const js = /^on[a-z]+$/.test(attr) ? v : v.match(/^[\s\x00-\x20]*javascript:([\s\S]*)$/i)?.[1];
      if (js != null) handlers.push({ tag: name, attr, text: js });
      if (opens && (attr === 'srcdoc' || js == null)) frames.push({ tag: name, attr, value: v });
    }
    if (RAW_TAGS.has(name)) {
      const close = html.slice(re.lastIndex).search(new RegExp(`</${name}\\s*>`, 'i')), end = close < 0 ? html.length : re.lastIndex + close;
      if (name === 'script') scripts.push({ attrs, text: html.slice(re.lastIndex, end) });
      re.lastIndex = end;
      continue;
    }
    if (master === undefined && Object.hasOwn(attrs, 'data-composition-id')) master = attrs['data-fx-chain'] || null;
    if (name === 'base' && base === undefined && Object.hasOwn(attrs, 'href')) base = attrs.href;
    if (name === 'hf-audio-group') {
      const id = attrs['data-hf-render-id'] ?? attrs.id, v = parseFloat(attrs['data-volume']);
      if (id) groups.set(id, { volume: Number.isFinite(v) ? v : 1, fx: attrs['data-fx-chain'] || null, automation: attrs['data-automation'] || null, hidden: Object.hasOwn(attrs, 'data-hidden'), unmodelled: unmodelledOf(attrs, INPUTS.bus, dups) });
    }
    const silentVideo = name === 'video' && (Object.hasOwn(attrs, 'muted') || (Object.hasOwn(attrs, 'data-has-audio') && attrs['data-has-audio'] !== 'true'));
    if ((name === 'audio' || name === 'video') && !silentVideo) {
      const hiddenBy = stack.find((e) => e.hidden), template = stack.some((e) => e.name === 'template');
      const context = template ? 'is inside a <template>, whose content HyperFrames renders only as the page\'s one wrapper'
        : hiddenBy ? `is inside <${hiddenBy.name}${hiddenBy.id ? ` id="${hiddenBy.id}"` : ''} data-hidden>` : null;
      media.push(mediaTag(name, attrs, selfClosed ? '' : html.slice(re.lastIndex), context, dups));
    }
    if (!VOID_TAGS.has(name)) stack.push({ name, hidden: Object.hasOwn(attrs, 'data-hidden'), id: attrs.id || '' });
  }
  return { media, groups, master: master ?? null, scripts, handlers, frames, base: base ?? null };
}
// The elements that open another document in the page (a nested browsing context or a plugin) and the attributes that
// name it. A srcdoc is read as a document like index.html; any other local document is a load the check does not resolve.
export const FRAMES = { iframe: ['src', 'srcdoc'], frame: ['src'], object: ['data'], embed: ['src'], portal: ['src'], fencedframe: ['src'] };
function mediaTag(kind, attrs, rest, context, dups = []) {
  const bad = [];
  const num = (k, dflt) => {
    if (attrs[k] == null || attrs[k] === '') return dflt;
    const v = Number(attrs[k]);
    if (Number.isFinite(v)) return v;
    bad.push(k); return dflt;
  };
  let src = attrs.src || '';
  if (!src && rest) {
    const end = rest.search(new RegExp(`</${kind}\\s*>|<${kind}(?=[\\s/>])`, 'i'));
    const sm = (end < 0 ? rest : rest.slice(0, end)).match(/<source\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (sm) src = (sm[1] ?? sm[2]).replace(/&amp;/g, '&');
  }
  return {
    kind, id: attrs.id || '', src, start: num('data-start', 0), end: num('data-end', null), volume: num('data-volume', 1),
    duration: num('data-duration', null), mediaStart: num('data-media-start', 0), rate: num('data-playback-rate', 1),
    automation: attrs['data-automation'] || null, bad, loop: Object.hasOwn(attrs, 'loop'),
    group: attrs['data-audio-group'] || null, fx: attrs['data-fx-chain'] || null,
    fadeIn: fadeOf(attrs['data-fade-in']), fadeOut: fadeOf(attrs['data-fade-out']), hidden: Object.hasOwn(attrs, 'data-hidden'),
    unmodelled: unmodelledOf(attrs, INPUTS.media, dups), context,
  };
}
export const audioTags = (html) => scanHtml(html).media;
export const groupsOf = (html) => scanHtml(html).groups;
export const masterFxChain = (html) => scanHtml(html).master;

// Scripts: see scriptProblem (the script rule). No script text is read and no JavaScript is parsed.
// The script types a browser runs: "module" and the JavaScript MIME essences of the HTML spec (Chromium, the HyperFrames
// renderer, runs all of them). Any other type (json, a template, speculationrules, vbscript) is a data block, never run.
const JS_TYPES = new Set(['module', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript',
  'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3',
  'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
// The script's type string as the HTML spec derives it: an empty or absent type is JavaScript unless a non-empty language
// attribute stands alone (text/<language>); parameters (charset...) are dropped, on the safe side: a script is not skipped.
export function isJsScript(attrs) {
  const has = (k) => Object.hasOwn(attrs, k) && String(attrs[k]).trim() !== '';
  const type = has('type') ? String(attrs.type) : has('language') && !Object.hasOwn(attrs, 'type') ? `text/${String(attrs.language).trim()}` : 'text/javascript';
  return JS_TYPES.has(type.split(';')[0].trim().toLowerCase());
}
// Why the page's scripts make the mix unknown, or null. THE SCRIPT RULE (owner's decision, issue 39): a page that loads ANY
// script other than the engine library is NOT CHECKED, never a pass. A script can change the mix in more ways than a check can
// follow (a volume, a mute, a playback rate, a gain, an element made at run time, a document written in), and "unknown is never
// read as pass"; so no script text is read and no JavaScript is parsed. The engine library is the one script allowed: a local
// file that the .engine.json beside it lists (engine/three/build.mjs writes it), loaded by a <script src> (or the href of an
// SVG <script>); it is vendored code, not the scene. Everything else is a script that is not the engine: any other <script src>
// (a project file, a remote library, a data: URL), any inline <script> with code (a module that imports the engine included:
// the inline code is the scene's own), an on* handler or javascript: URL on any element (non-blank). A <script> of a data type
// (json, a template, speculationrules) is data and never runs. A page with a <base href> or a <script type="importmap"> changes
// what a name loads, so even an engine name is unknown: NOT CHECKED (UNRESOLVED).
// What follows every "by ear": an agent cannot listen, and almost every film loads a script (the GSAP library and its own
// timeline), so an unattended run meets this advice in nearly every film and must not read it as a pass.
export const BY_EAR = 'check the bed by ear on the draft; with nobody to listen, name "bed level not checked" in the hand-off as a known bug';
export const NON_ENGINE = `page runs a script that is not the engine library; ${BY_EAR}`;
export const UNRESOLVED = `page loads scripts the check does not resolve; ${BY_EAR}`;
// A NESTED DOCUMENT is judged the same way: an iframe srcdoc is read as a document like index.html (pageProblem); any other
// document an element opens (FRAMES) that is not a remote http(s) page (another origin cannot reach this page) is a load
// the check does not resolve; an empty one or about:blank is none.
export function scriptProblem(scripts, dir, read, { base = null, handlers = [], frames = [] } = {}) {
  const ORIGIN = 'http://project.invalid', doc = new URL(`${ORIGIN}/index.html`);
  const clip = (what) => String(what).replace(/\s+/g, ' ').slice(0, 50);
  const unresolved = (what) => `${UNRESOLVED} (${clip(what)})`;
  const nonEngine = (what) => `${NON_ENGINE} (${clip(what)})`;
  if (base !== null) return unresolved(`<base href="${base}">`);
  if (scripts.some((s) => (s.attrs.type || '').trim().toLowerCase() === 'importmap')) return unresolved('a <script type="importmap">');
  // What a URL is: a local file of the project, a remote document, or null (a data: or blob: URL, a server on this machine that
  // may serve the project itself, any other scheme).
  const locate = (u) => {
    if (u.origin === ORIGIN) return { file: path.join(dir, ...decodeURIComponent(u.pathname).split('/')) };
    if ((u.protocol === 'http:' || u.protocol === 'https:') && !/^(?:localhost|127\.[\d.]+|0\.0\.0\.0|\[::1?\]|.*\.localhost)$/i.test(u.hostname)) return { remote: true };
    return null;
  };
  // The engine is a file the .engine.json beside it lists. A manifest that is missing, unreadable or not JSON lists nothing: the
  // file is not the engine (unknown is never the engine).
  const manifests = new Map();
  const isEngine = (p) => {
    const d = path.dirname(p);
    if (!manifests.has(d)) {
      let names = new Set();
      try { const r = read(path.join(d, '.engine.json')); if (r.text != null) names = new Set(JSON.parse(r.text).map((e) => e.file)); } catch { /* not a manifest: nothing is the engine */ }
      manifests.set(d, names);
    }
    return manifests.get(d).has(path.basename(p));
  };
  const engineUrl = (spec) => {
    let at = null;
    try { at = locate(new URL(spec, doc)); } catch { /* not a URL, or a path that does not decode: unknown */ }
    return !!(at && at.file && isEngine(at.file));
  };
  for (const s of scripts) {
    if (!isJsScript(s.attrs)) continue;
    // every attribute that loads the script's file: src, and href / xlink:href of an SVG <script>; each must be the engine
    const loads = ['src', 'href', 'xlink:href'].filter((k) => s.attrs[k]);
    if (loads.length) {
      const bad = loads.find((k) => !engineUrl(s.attrs[k]));
      if (bad) return nonEngine(s.attrs[bad]);
    } else if (s.text.trim() !== '') return nonEngine('an inline <script>');
  }
  // script text in an attribute (an on* handler, a javascript: URL) on any element runs in the page like an inline script
  for (const h of handlers) if (h.text.trim() !== '') return nonEngine(`the ${h.attr} attribute of <${h.tag}>`);
  for (const f of frames) {
    const v = f.value.trim(), what = `<${f.tag} ${f.attr}="${v}">, a document whose scripts can reach the page`;
    let why = null;
    if (f.attr === 'srcdoc') why = pageProblem(scanHtml(f.value), dir, read, { nested: `the srcdoc of <${f.tag}>` });
    else if (v !== '' && !/^about:blank(?:[?#]|$)/i.test(v)) {
      let at = null;
      try { at = locate(new URL(v, doc)); } catch { /* not a URL, or a path that does not decode: unknown */ }
      why = at && at.remote ? null : unresolved(what);
    }
    if (why) return why;
  }
  return null;
}
// THE ONE PLACE A DOCUMENT IS JUDGED for what may change the mix: index.html, and each srcdoc in it (nested: where it sits).
// Every field scanHtml returns is judged: the code fields here (scriptProblem), the mix fields by the bed check of
// index.html (media, groups, master; a srcdoc's own <audio> or <video> is a mix this check does not read). A field in
// neither list is a scan nobody judges: it throws, so a new kind of input can never pass unread.
export const SCAN_FIELDS = { code: ['scripts', 'handlers', 'frames', 'base'], mix: ['media', 'groups', 'master'] };
export function pageProblem(page, dir, read, { nested = null } = {}) {
  const unjudged = Object.keys(page).filter((k) => !SCAN_FIELDS.code.includes(k) && !SCAN_FIELDS.mix.includes(k));
  if (unjudged.length) throw new Error(`pageProblem: the scan field ${unjudged.join(', ')} is not judged`);
  if (nested && (page.media.length || page.master !== null)) return `${nested} has its own <audio>, <video> or mix, which this check does not read; ${BY_EAR}`;
  return scriptProblem(page.scripts, dir, read, { base: page.base, handlers: page.handlers, frames: page.frames });
}
// The clip's length on the timeline: data-end (absolute, wins) minus data-start, else data-duration, else null (to the end of the film).
export const clipLength = (t) => (t.end != null ? t.end - t.start : t.duration ?? null);
// Why HyperFrames leaves the tag out of the mix (data-hidden on it or its group, a data-duration of 0 or less, a data-end
// at or before the start), or null. An ancestor's data-hidden is not judged here: it is the tag's context (renderProblem).
export function notRendered(t, groups = new Map()) {
  if (t.hidden) return 'data-hidden';
  if (t.group && groups.get(t.group)?.hidden) return `its audio group "${t.group}" is data-hidden`;
  if (!t.bad.includes('data-duration') && t.duration != null && t.duration <= 0) return 'data-duration is 0 or less';
  if (!t.bad.some((k) => k === 'data-end' || k === 'data-start') && t.end != null && t.end <= t.start) return 'data-end is not after data-start';
  return null;
}
// The one place a tag's render inputs are judged: what the gain model leaves out for this tag, or null. An ancestor state
// the check cannot see (data-hidden, <template>), an input outside the inventory (INPUTS / INERT) on the tag or its bus, a
// lane laneOf does not model, an fx chain (data-fx-chain, such as a gain or a carve), a bus lane or fx chain, a playback
// rate, a fade-out that needs a clip end it does not have; for the narration also a media start or a loop (its words are
// timed on the file). Each makes the bed NOT CHECKED, because the mix then differs from what is measured.
export function renderProblem(t, groups = new Map(), { narration = false } = {}) {
  const g = t.group ? groups.get(t.group) : null;
  if (t.context) return `${t.context}, a state this check cannot see without a DOM: put data-hidden on the tag itself or move the tag out, then rerun`;
  if (t.unmodelled && t.unmodelled.length) return `has ${t.unmodelled.join(', ')}, an input this check does not model`;
  if (g && g.unmodelled && g.unmodelled.length) return `is on the audio group "${t.group}", which has ${g.unmodelled.join(', ')}, an input this check does not model`;
  try { laneOf(t.automation); } catch (e) { return `has a data-automation this check cannot model (${e.message})`; }
  if (t.fx) return 'has a data-fx-chain (an effect chain such as a gain or a carve), which this check does not model';
  if (g && g.fx) return `is on the audio group "${t.group}", which has a data-fx-chain this check does not model`;
  if (g && g.automation) return `is on the audio group "${t.group}", which has a data-automation lane this check does not model`;
  if (t.rate != null && t.rate !== 1) return `has data-playback-rate ${t.rate}, which this check does not model`;
  if (t.fadeOut > 0 && clipLength(t) == null) return 'has a data-fade-out but no data-end or data-duration, so the time the fade lands is unknown: give the clip an end';
  if (narration && t.mediaStart) return 'has a data-media-start, so its words are not at the times of words.json';
  if (narration && t.loop) return 'has loop, so its words repeat';
  return null;
}
// The linear gain of the tag's audio group bus (data-volume of its <hf-audio-group>), 1 without one.
export const busGain = (t, groups = new Map()) => (t.group && groups.get(t.group) ? groups.get(t.group).volume : 1);
// The timeline options of applyGain for a tag.
export const clipOpts = (t) => ({ mediaStart: t.mediaStart, dur: clipLength(t), loop: t.loop, fadeIn: t.fadeIn, fadeOut: t.fadeOut });

// The music cues among the tags: a name (the id, else the file name without extension) that is the word music, bgm, bed or
// soundtrack, optionally "background-" before and an index or cue word after (music-a, bgm_2, background-music-loop).
// A name that merely contains the word (embedded-hit, bedroom, bed-creak, music-box) is a sound effect, not the bed.
const BED_NAME = /^(?:(?:background|bg)[-_ ]?)?(?:music|bgm|bed|soundtrack)(?:[-_ ](?:\d{1,2}|[a-z]|intro|outro|loop|main|theme|track|cue|full|short)|\d{1,2})*$/i;
export function musicTags(tags) {
  const base = (src) => path.basename(String(src).split(/[?#]/)[0]).replace(/\.[a-z0-9]+$/i, '');
  return tags.filter((t) => BED_NAME.test(t.id) || BED_NAME.test(base(t.src)));
}

// Every <audio> and audible <video> tag gets exactly one role; "no bed in the film" is concluded only when none is 'unknown'.
// narration: the narration tag. bed: a music cue by name (musicTags; <audio> only) or one that a --music value names by id or
// src. skipped: HyperFrames leaves it out of the mix (notRendered). sfx: plays at most THRESHOLDS.sfxMaxS (its clip length,
// data-end or data-duration, else lengthOf(tag): the file's length in seconds, or { why } when it cannot be read, after
// data-media-start and at its playback rate); a `loop` tag is one only with a clip length that short. unknown: anything else
// (a longer clip, a looped one, a file that cannot be read, a timing attribute that does not parse, an input outside the
// inventory, any <video> that is not muted); it may be the bed, so the bed is NOT CHECKED until --music names it.
export function tagRoles(tags, narrTag, lengthOf, music = [], groups = new Map()) {
  const others = tags.filter((t) => t !== narrTag);
  const beds = new Set([...musicTags(others.filter((t) => t.kind !== 'video')), ...others.filter((t) => music.some((m) => t.id === m || t.src === m))]);
  return tags.map((t) => {
    if (t === narrTag) return { tag: t, role: 'narration' };
    const gone = notRendered(t, groups);
    if (gone) return { tag: t, role: 'skipped', why: gone };
    if (beds.has(t)) return { tag: t, role: 'bed' };
    if (t.kind === 'video') return { tag: t, role: 'unknown', why: 'a <video> that is not muted mixes its own sound (HyperFrames gives it data-has-audio="true")' };
    const badTime = t.bad.filter((k) => k !== 'data-volume' && k !== 'data-start');
    if (badTime.length) return { tag: t, role: 'unknown', why: `${badTime.join(', ')} is not a number` };
    if (!(t.rate > 0)) return { tag: t, role: 'unknown', why: `data-playback-rate ${t.rate}` };
    const clip = clipLength(t);
    if (clip != null && clip >= 0 && clip <= T.sfxMaxS) return { tag: t, role: 'sfx' };
    if (t.unmodelled && t.unmodelled.length) return { tag: t, role: 'unknown', why: `has ${t.unmodelled.join(', ')}, an input this check does not model` };
    if (t.loop) return { tag: t, role: 'unknown', why: `loop without a clip length (data-end or data-duration) of at most ${T.sfxMaxS} s` };
    const len = lengthOf(t);
    if (typeof len !== 'number' || !Number.isFinite(len)) return { tag: t, role: 'unknown', why: (len && len.why) || 'its length could not be read' };
    const plays = Math.min(clip ?? Infinity, Math.max(0, len - t.mediaStart) / t.rate);
    return plays <= T.sfxMaxS ? { tag: t, role: 'sfx' } : { tag: t, role: 'unknown', why: `plays ${plays.toFixed(1)} s` };
  });
}

// The one place the Result is made. Each of CHECKS must end 'done' (judged) or, for the bed only, 'absent' (no music in
// the film, proved by tagRoles); a check with neither outcome is NOT CHECKED, whatever path skipped it. So an unknown
// can never print OK: OK is not a fallback, it needs every outcome.
export const CHECKS = ['bed', 'clicks', 'voice'];
export function verdict({ flags, notChecked, done, absent }) {
  const open = [...new Set([...CHECKS.filter((c) => !done.includes(c) && !(c === 'bed' && absent.includes('bed'))), ...notChecked])];
  const AWAY = ' Away from the user, name each NOT CHECKED item in the hand-off as a known bug: it is never a pass.';
  if (flags.length) return { exit: 3, text: `${flags.length} flag(s) — each is a P1: fix and rerun.${open.length ? ` NOT CHECKED: ${open.join(', ')}.${AWAY}` : ''}` };
  if (open.length) return { exit: 2, text: `NOT CHECKED: ${open.join(', ')} — rerun after fixing the WARN above.${AWAY}` };
  return { exit: 0, text: `OK — ${done.includes('bed') ? 'bed audible' : 'no bed in the film'}, no clicks or dropouts, voice steady.` };
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
    else if (k === '--music') { if (argv[i + 1] == null || argv[i + 1].startsWith('--')) { console.error('--music needs a bed: an <audio> id or a file'); process.exit(1); } (a.music ||= []).push(argv[++i]); }
    else if (k === '--text') a.text = argv[++i];
    else if (!k.startsWith('--') && !dirSet) { a.dir = k; dirSet = true; }
    else { console.error(`Unknown option: ${k}\nUsage: node audio_qc.mjs [project] [--mix draft.mp4] [--music <id|src>]... [--text narration.txt]`); process.exit(1); }
  }
  const at = (p) => path.resolve(a.dir, p);
  const lines = [`Audio QC: ${a.dir}`], flags = [], notChecked = [];
  const warn = (m) => lines.push(row('WARN', m));
  const info = (m) => lines.push(row('INFO', m));
  const skip = (what, why) => { warn(`${what} not checked: ${why}`); notChecked.push(what); };
  const flag = (m) => flags.push(row('FLAG (P1)', m));
  const done = [], absent = [];
  const bad = missing(a.dir, 'project folder');
  if (bad) { console.error(`FAILED: ${bad}`); process.exit(1); }

  // Inputs
  const html = readText(at('index.html'));
  const page = html.text ? scanHtml(html.text) : scanHtml(''), tags = page.media;
  if (html.err) warn(html.err);
  else if (html.text == null) info('no index.html: the bed is read from --music only and the narration is audio/narration.wav');
  for (const t of tags) if (t.bad.length) warn(`<audio${t.id ? ' id="' + t.id + '"' : ''}> ${t.bad.join(', ')} is not a number (a template expression?): read as the default`);
  const groups = page.groups, master = page.master;
  const narrTag = tags.find((t) => t.kind !== 'video' && /narration/i.test(t.id + ' ' + t.src));
  const narrFile = narrTag && narrTag.src && !/^[a-z]+:/i.test(narrTag.src) && !missing(at(narrTag.src), '') ? at(narrTag.src) : at('audio/narration.wav');
  const narrStart = narrTag ? narrTag.start : 0, narrVol = narrTag ? narrTag.volume : 1;
  let narrLane = null, narrLaneErr = null;
  try { narrLane = narrTag ? laneOf(narrTag.automation) : null; } catch (e) { narrLaneErr = e.message; warn(`the narration's data-automation cannot be modelled (${e.message})`); }

  const wj = readText(at('audio/words.json'));
  let words = null;
  if (wj.text != null) { try { words = JSON.parse(wj.text); if (!Array.isArray(words)) throw new Error('not a list'); } catch (e) { warn(`audio/words.json is not a word list (${e.message}): rerun tts_timestamps.mjs`); } }
  else if (wj.err) warn(wj.err);
  const spans = words ? words.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end)).map((w) => [w.start, w.end]) : [];

  const nm = missing(narrFile, 'the narration');
  const rate16 = 16000, rate48 = 48000;
  let narr16 = null, narr48 = null;
  if (nm) { skip('narration', nm); } else {
    try { narr16 = decode(narrFile, rate16); narr48 = decode(narrFile, rate48); } catch (e) { if (e instanceof Fatal) { console.error(e.message); process.exit(1); } skip('narration', e.message); }
  }
  const rel = (f) => path.relative(a.dir, f) || f;

  // 1. Bed: every music cue at its gain, summed. A level the script cannot compute is NOT CHECKED, never "no bed".
  // Without --music, every tag is classified first (tagRoles); one it cannot classify makes the bed NOT CHECKED.
  const lengthOf = (t) => {
    if (!t.src) return { why: 'no src in index.html' };
    if (/^[a-z][a-z0-9+.-]*:/i.test(t.src)) return { why: 'a remote file' };
    const f = at(t.src), mm = missing(f, 'the file');
    if (mm) return { why: mm };
    try { return decode(f, 8000).length / 8000; } catch (e) { if (e instanceof Fatal) { console.error(e.message); process.exit(1); } return { why: e.message }; }
  };
  // Classification always runs: each --music value turns the tag it names into a bed, the rest keeps its role, so an
  // unknown tag that nothing names stays unknown. A --music value that no tag has is a file, a cue of its own.
  const music = a.music || [];
  const roles = html.text == null ? [] : tagRoles(tags, narrTag, lengthOf, music, groups);
  const unknown = roles.filter((r) => r.role === 'unknown');
  const musicCues = roles.filter((r) => r.role === 'bed').map((r) => r.tag);
  for (const m of music) if (!tags.some((t) => t.id === m || t.src === m)) musicCues.push({ kind: 'audio', id: '', src: m, start: 0, end: null, volume: 1, duration: null, mediaStart: 0, rate: 1, automation: null, bad: [], loop: false, group: null, fx: null, fadeIn: 0, fadeOut: 0, hidden: false, unmodelled: [], context: null });
  let bedLine = null, cp = null;
  // The script rule judges the page whether a bed is measured or proved absent: code can make an <audio> at run time or
  // change an SFX's src or duration, so "no bed in the film" needs the same page as a measured bed.
  const codeProblem = () => pageProblem(page, path.resolve(a.dir), (p) => { const r = readText(p); return r.text != null ? r : { why: r.err || 'not found' }; });
  const bedProblem = () => {
    if (html.err) return 'index.html could not be read, so the gain of the music is unknown: fix the WARN above and rerun';
    if (narrTag && narrTag.bad.length) return `the narration's ${narrTag.bad.join(', ')} is not a number, so the timeline is unknown`;
    if (narrLaneErr) return `the narration's data-automation cannot be modelled (${narrLaneErr}), so its level is unknown`;
    if (master) return 'the composition root has a data-fx-chain (the master bus), which this check does not model';
    const sp = codeProblem();
    if (sp) return sp;
    if (narrTag) {
      const gone = notRendered(narrTag, groups), p = gone ? `is not rendered (${gone})` : renderProblem(narrTag, groups, { narration: true });
      if (p) return `the narration <audio> ${p}, so the mix differs from what is measured`;
    }
    for (const c of musicCues) {
      const who = c.id ? `<${c.kind || 'audio'} id="${c.id}">` : c.src;
      if (!c.src) return `${who} has no src in index.html (set by a script?): pass the file with --music <file>`;
      if (/^[a-z][a-z0-9+.-]*:/i.test(c.src)) return `${c.src} is a remote file: download it into the project and rerun`;
      if (c.bad.length) return `${who} ${c.bad.join(', ')} is not a number (a template expression?), so its gain is unknown`;
      const p = renderProblem(c, groups);
      if (p) return `${who} ${p}`;
    }
    return null;
  };
  if (html.text && /\bdata-composition-src\s*=/i.test(html.text)) {
    skip('bed', 'index.html loads a sub-composition (data-composition-src), whose own <audio> tags this check does not read, so which music plays is unknown: put the music and narration <audio> tags in index.html itself and rerun');
  } else if (unknown.length) {
    const names = unknown.slice(0, 6).map((r) => `${r.tag.id ? `<${r.tag.kind} id="${r.tag.id}">` : r.tag.src || `<${r.tag.kind}>`} (${r.why})`).join(', ');
    skip('bed', `${names} is neither a music cue by name (music, bgm, bed, soundtrack, e.g. music-a) nor an SFX (at most ${T.sfxMaxS} s): if it is the bed (or one of them) name every bed with --music <id> (repeatable), then rerun`);
  } else if (!musicCues.length) {
    if (html.err) skip('bed', 'index.html could not be read, so which music plays is unknown: fix the WARN above and rerun');
    else if (html.text == null) skip('bed', 'there is no index.html to say which music plays: pass the file with --music <file>');
    else if ((cp = codeProblem())) skip('bed', cp);
    else {
      absent.push('bed');
      const sfx = roles.filter((r) => r.role === 'sfx').map((r) => r.tag.id || r.tag.src);
      const off = roles.filter((r) => r.role === 'skipped').map((r) => `${r.tag.id || r.tag.src} (${r.why})`);
      info(`bed: no music <audio> in index.html (id or file name music/bgm/bed/soundtrack, e.g. music-a)${sfx.length ? `; SFX (at most ${T.sfxMaxS} s): ${sfx.slice(0, 6).join(', ')}` : ''}${off.length ? `; not rendered: ${off.slice(0, 6).join(', ')}` : ''}; --music <id> names a bed`);
    }
  } else {
    const why = bedProblem();
    if (why) skip('bed', why);
    else if (narr16) {
      try {
        const total = Math.round((narrStart + narr16.length / rate16) * rate16), bed = new Float32Array(total), shown = [];
        for (const c of musicCues) {
          const mf = at(c.src), mm = missing(mf, 'the music file');
          if (mm) throw new Error(mm);
          const lane = laneOf(c.automation);
          const gain = c.volume * busGain(c, groups);
          const clip = applyGain(decode(mf, rate16), rate16, c.start, gain, lane, total, clipOpts(c));
          for (let i = 0; i < total; i++) bed[i] += clip[i];
          shown.push(`${rel(mf)} x ${+gain.toFixed(4)}${lane ? ' (volume lane)' : ''}${c.fadeIn || c.fadeOut ? ' (fades)' : ''}`);
        }
        const nt = applyGain(narr16, rate16, narrStart, narrVol * (narrTag ? busGain(narrTag, groups) : 1), narrLane, total, narrTag ? clipOpts(narrTag) : {});
        const g = bedGap({ narr: nt, bed, rate: rate16, speech: spans.map(([s, e]) => [s + narrStart, e + narrStart]) });
        if (!Number.isFinite(g.gapDb)) skip('bed', 'no speech frames to compare against (words.json empty and the narration silent)');
        else {
          bedLine = row('Bed', `${shown.join(' + ')} sits ${g.gapDb.toFixed(1)} dB under the narration in speech (band ${T.bedMinUnder}–${T.bedMaxUnder})${Number.isFinite(g.pauseBedDb) ? `, pauses ${g.pauseBedDb.toFixed(1)} dBFS` : ''}`);
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
    if (html.err) skip('mix', 'index.html could not be read, so the narration\'s data-start is unknown: fix the WARN above and rerun');
    else if (narrTag && narrTag.bad.includes('data-start')) skip('mix', `the narration's data-start is not a number, so the mix cannot be lined up with the words`);
    else if (mm) skip('mix', mm); else {
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
    const unvoiced = per.filter((s) => s.f0 == null).length;
    lines.push(row('Voice', Number.isFinite(v.f0Med)
      ? `${per.length} ${unitName}s, median ${Math.round(v.f0Med)} Hz, centroid ${Math.round(v.cMed)} Hz${unvoiced ? `, ${unvoiced} too short or unvoiced to judge` : ''}`
      : `${per.length} ${unitName}s, none long enough or voiced to judge`));
    if (v.judged) done.push('voice');
    else skip('voice', `only ${v.voiced} of ${per.length} ${unitName}${per.length === 1 ? '' : 's'} long enough and voiced to judge; comparing against the take's median needs at least 3 (nothing was compared)`);
    for (const f of v.flags) {
      const text = f.text.length > 60 ? f.text.slice(0, 57) + '…' : f.text;
      flag(`${unitName} ${f.n} at ${fmt(f.start)} is ${f.semitones >= 0 ? '+' : ''}${f.semitones.toFixed(1)} st / ${f.centroidPct >= 0 ? '+' : ''}${Math.round(f.centroidPct)} % centroid off the take: "${text}"${unitName === 'sentence' ? ` -> --retake ${f.n}` : ''}`);
    }
  }

  lines.push(...flags);
  const res = verdict({ flags, notChecked, done, absent });
  lines.push(row('Result', res.text));
  console.log(lines.join('\n'));
  process.exit(res.exit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
