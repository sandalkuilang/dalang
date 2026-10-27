#!/usr/bin/env node
// node tests/kokoro.mjs — tts_timestamps.mjs --engine kokoro against a mock Python (no Kokoro, no VoiceStudio).
// Covers: a Kokoro take is spoken one sentence per helper call and timed only by forced alignment (never by an
// estimate, never by VoiceStudio); the helper or the aligner missing stops the take with the consent / download words
// and no words.json; --retake changed / <n> / auto re-speak only the edited, named or flagged sentences; refusals
// come before any helper call; the licence table knows Kokoro-82M (Apache-2.0) and never reads a Kokoro take with
// no recorded model as commercial.
// The mock Python is a Node script in DALANG_PYTHON. kokoro_tts.py speaks a 24 kHz mono 16-bit WAV where each word
// is 0.30 s of one constant sample value (a hash of the word), 0.10 s of silence after it, 0.05 s of lead-in; it logs
// each call to DALANG_TEST_LOG. align.py reads those values back (one run per word), so the alignment is what the
// audio holds. An ffmpeg / ffprobe shim on PATH (no codecs needed) joins and measures those files.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { voiceModel } from "../scripts/voice_licences.mjs";

const tts = fileURLToPath(new URL("../scripts/tts_timestamps.mjs", import.meta.url));
const check = fileURLToPath(new URL("../scripts/check_assets.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-kokoro-"));
const shim = path.join(tmp, "bin");
fs.mkdirSync(shim);

const RATE = 24000;
const norm = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

fs.writeFileSync(path.join(shim, "ffmpeg"), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const o = a[a.length - 1];
const pcm = (b) => { let p = 12; while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') return b.subarray(p + 8, p + 8 + n); p += 8 + n; } return Buffer.alloc(0); };
const wav = (d) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(${RATE}, 24); h.writeUInt32LE(${RATE * 2}, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40); return Buffer.concat([h, d]); };
if (a.some((x) => /silencedetect/.test(x))) process.exit(0);
if (a.includes('concat')) {
  const list = fs.readFileSync(a[a.indexOf('-i') + 1], 'utf8').split('\\n').map((l) => /^file '(.*)'$/.exec(l)).filter(Boolean).map((m) => m[1].replace(/'\\\\''/g, "'"));
  fs.writeFileSync(o, wav(Buffer.concat(list.map((f) => pcm(fs.readFileSync(f))))));
} else if (a.includes('-i')) fs.copyFileSync(a[a.indexOf('-i') + 1], o);
`, { mode: 0o755 });
fs.writeFileSync(path.join(shim, "ffprobe"), `#!/usr/bin/env node
const b = require('fs').readFileSync(process.argv[process.argv.length - 1]);
let p = 12; while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') { console.log(n / ${RATE * 2}); process.exit(0); } p += 8 + n; }
process.exit(1);
`, { mode: 0o755 });

// The fake Python, serialised into a script: it dispatches on the helper it is given (kokoro_tts.py or align.py).
function mockPython(RATE) {
  const fs = require("fs"), path = require("path");
  const norm = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  const val = (w) => 64 * (1 + [...w].reduce((s, c) => (s * 31 + c.codePointAt(0)) % 500, 0));
  const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? undefined : process.argv[i + 1]; };
  const wav = (samples) => {
    const b = Buffer.alloc(44 + samples.length * 2);
    b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8);
    b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
    b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
    samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2));
    return b;
  };
  const helper = path.basename(process.argv[2]);
  const env = process.env;
  if (helper === "kokoro_tts.py") {
    if (env.DALANG_TEST_KOKORO === "nopkg") { console.error("ModuleNotFoundError: No module named 'kokoro'"); process.exit(5); }
    if (env.DALANG_TEST_KOKORO === "noweights") { console.error("weights not cached"); process.exit(4); }
    if (env.DALANG_TEST_KOKORO === "noen") { console.error("English text model en_core_web_sm is not installed"); process.exit(6); }
    if (env.DALANG_TEST_KOKORO === "refused") { console.error("refused a download of http://example.invalid/x: without --download this helper reaches no network"); process.exit(6); }
    const text = fs.readFileSync(arg("--text"), "utf8");
    fs.appendFileSync(env.DALANG_TEST_LOG, JSON.stringify({ text, lang: arg("--lang"), voice: arg("--voice"), speed: Number(arg("--speed")) }) + "\n");
    const out = [];
    const zeros = (s) => { for (let i = 0; i < Math.round(s * RATE); i++) out.push(0); };
    zeros(0.05);
    for (const t of text.split(/\s+/).filter(Boolean)) {
      const v = val(norm(t) === env.DALANG_TEST_GARBLE ? "maybe" : norm(t));
      for (let i = 0; i < Math.round(0.3 * RATE); i++) out.push(v);
      zeros(0.1);
    }
    fs.writeFileSync(arg("--out"), wav(out));
  } else if (helper === "align.py") {
    if (env.DALANG_TEST_ALIGN === "missing") { console.error("alignment model not downloaded"); process.exit(4); }
    const b = fs.readFileSync(arg("--audio"));
    let p = 12, pcm = Buffer.alloc(0);
    while (p + 8 <= b.length) {
      const id = b.toString("latin1", p, p + 4), n = b.readUInt32LE(p + 4);
      if (id === "data") { pcm = b.subarray(p + 8, p + 8 + n); break; }
      p += 8 + n;
    }
    const win = RATE / 100, runs = [];
    let cur = null;
    for (let w = 0; w * win < pcm.length / 2; w++) {
      const v = pcm.readInt16LE(w * win * 2);
      if (v !== 0 && cur && cur.v === v) cur.end = (w + 1) / 100;
      else { if (cur) runs.push(cur); cur = v !== 0 ? { v, start: w / 100, end: (w + 1) / 100 } : null; }
    }
    if (cur) runs.push(cur);
    const words = fs.readFileSync(arg("--text"), "utf8").replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
    let prev = 0;
    const res = words.map((t, k) => {
      const r = runs[k];
      if (!r) { const o = { text: t, start: prev, end: prev + 0.1, score: null }; prev += 0.1; return o; }
      prev = r.end;
      return { text: t, start: r.start, end: r.end, score: r.v === val(norm(t)) ? 0.95 : 0.05 };
    });
    fs.writeFileSync(arg("--out"), JSON.stringify(res));
  } else process.exit(1);
}
const py = path.join(tmp, "python-mock");
fs.writeFileSync(py, `#!/usr/bin/env node\n(${mockPython.toString()})(${RATE});\n`, { mode: 0o755 });

const run = (args, env = {}) => new Promise((ok) => execFile(process.execPath, [tts, ...args], { timeout: 60000, env: { ...process.env, PATH: `${shim}${path.delimiter}${process.env.PATH}`, DALANG_PYTHON: py, ...env } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
const runCheck = (args) => new Promise((ok) => execFile(process.execPath, [check, ...args], { timeout: 30000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

const failures = [];
let count = 0;
const test = async (name, fn) => { count++; try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

let n = 0;
// Make (or, with opts.dir, retake) a Kokoro take of `text`. Nothing listens on --vs-url: a take that reached for
// VoiceStudio would fail. `opts.engine === false` leaves --engine out (a retake: the take's own record decides).
const take = async (text, opts = {}, extra = []) => {
  const dir = opts.dir || path.join(tmp, `case-${++n}`);
  if (!opts.dir) fs.mkdirSync(dir);
  const input = path.join(dir, "narration.txt");
  fs.writeFileSync(input, text);
  const log = path.join(dir, "calls.jsonl");
  const args = ["--input", input, "--out", path.join(dir, "audio"), "--vs-url", "http://127.0.0.1:9", ...(opts.engine === false ? [] : ["--engine", "kokoro"]), ...(opts.language === false ? [] : ["--language", opts.language || "en"]), ...extra];
  const r = await run(args, { DALANG_TEST_LOG: log, ...(opts.env || {}) });
  const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { ...r, calls, dir, audio: path.join(dir, "audio") };
};
const tokensOf = (s) => s.split(/\s+/).map(norm).filter(Boolean);
const wordsJson = (r) => JSON.parse(fs.readFileSync(path.join(r.audio, "words.json"), "utf8"));
const wordsOf = (r) => wordsJson(r).map((w) => norm(w.text));
const respOf = (r) => JSON.parse(fs.readFileSync(path.join(r.audio, "narration.response.json"), "utf8"));

const NARRATION = "The river starts in the hills. It runs past the old mill. Water turns the wheel all day. The town grows near the bank.\n";
const S2 = "It runs past the old mill.";
const S3 = "Water turns the wheel all day.";
const EDITED = NARRATION.replace("old mill", "red mill");
const S2_NEW = "It runs past the red mill.";

await test("K1. a take is spoken one sentence per call and timed by forced alignment only", async () => {
  const r = await take(NARRATION);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
  for (const w of wordsJson(r)) { assert.equal(w.est, undefined, `${w.text} is an estimate`); assert.equal(w.score, 0.95, w.text); }
  assert.equal(r.calls.length, 4, "one call per sentence");
  assert.deepEqual(r.calls.map((c) => c.text), ["The river starts in the hills.", S2, S3, "The town grows near the bank."]);
  assert.ok(r.calls.every((c) => c.lang === "a" && c.voice === "af_heart" && c.speed === 1), JSON.stringify(r.calls[0]));
  assert.match(r.out, /Model\s+: Kokoro-82M — Apache-2\.0/);
  assert.match(r.out, /Billed\s+: 0 \(local\)/);
  assert.match(r.out, /Timing\s+: forced alignment/);
  assert.equal(respOf(r)._meta.engine, "kokoro");
  assert.equal(respOf(r)._meta.model, "Kokoro-82M");
  assert.equal(respOf(r)._meta.voice_id, "af_heart");
  assert.ok(fs.existsSync(path.join(r.audio, "narration.wav")));
  assert.deepEqual(fs.readdirSync(r.audio).filter((f) => /kokoro|part/.test(f)), [], "no leftovers");
  const gb = await take(NARRATION, { language: "en-gb" });
  assert.equal(gb.code, 0, gb.out);
  assert.ok(gb.calls.every((c) => c.lang === "b" && c.voice === "bf_emma"), JSON.stringify(gb.calls[0]));
  const v = await take(NARRATION, {}, ["--voice", "am_adam", "--speed", "1.1"]);
  assert.ok(v.calls.every((c) => c.voice === "am_adam" && c.speed === 1.1), JSON.stringify(v.calls[0]));
});

await test("K2. --retake changed re-speaks only the edited sentence and keeps the engine", async () => {
  const first = await take(NARRATION);
  assert.equal(first.code, 0, first.out);
  const r = await take(EDITED, { dir: first.dir, engine: false }, ["--retake", "changed"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.calls.length, 5, "four for the take, one for the edit");
  assert.equal(r.calls[4].text, S2_NEW);
  assert.deepEqual(wordsOf(r), tokensOf(EDITED));
  assert.match(r.out, /Retake\s+: sentence 2 .*changed/);
  assert.equal(respOf(r)._meta.text.trim(), EDITED.trim());
  assert.equal(respOf(r)._meta.engine, "kokoro");
  const again = await take(EDITED, { dir: first.dir, engine: false }, ["--retake", "changed"]);
  assert.equal(again.calls.length, 5, "the take now matches the script");
});

await test("K3. --retake 2 re-speaks sentence 2 alone", async () => {
  const first = await take(NARRATION);
  const r = await take(NARRATION, { dir: first.dir, engine: false }, ["--retake", "2"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.calls.length, 5);
  assert.equal(r.calls[4].text, S2);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
  assert.match(r.out, /Retake\s+: sentence 2 .*try 1/);
});

await test("K4. the aligner not downloaded: exit 1, no estimated timing shipped, no words.json", async () => {
  const r = await take(NARRATION, { env: { DALANG_TEST_ALIGN: "missing" } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /timed only by forced alignment/);
  assert.match(r.out, /not downloaded/);
  assert.ok(!fs.existsSync(path.join(r.audio, "words.json")), "words.json written");
  assert.ok(fs.existsSync(path.join(r.audio, "narration.wav")), "the audio is kept");
});

await test("K5. Kokoro or its weights missing stops with consent / size words, never MISSING or an install", async () => {
  const a = await take(NARRATION, { env: { DALANG_TEST_KOKORO: "nopkg" } });
  assert.equal(a.code, 1, a.out);
  assert.match(a.out, /not installed.*consent/);
  // the install the consent covers is pip kokoro soundfile: it pulls torch and the rest, so the whole size is stated, not only the weights
  assert.match(a.out, /torch.*\d\s?GB/s);
  const b = await take(NARRATION, { env: { DALANG_TEST_KOKORO: "noweights" } });
  assert.equal(b.code, 1, b.out);
  assert.match(b.out, /--download.*330 MB/);
  assert.doesNotMatch(b.out, /torch|\d\s?GB/, "the packages are already there: only the weights are left, no package size claimed");
  for (const r of [a, b]) {
    assert.doesNotMatch(r.out, /MISSING/);
    assert.ok(!fs.existsSync(path.join(r.audio, "words.json")));
  }
});

await test("K5b. the English text model absent stops the take with its size and the consented command, never a fetch", async () => {
  const r = await take(NARRATION, { env: { DALANG_TEST_KOKORO: "noen" } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /en_core_web_sm.*consent.*--download --lang a/s);
  assert.doesNotMatch(r.out, /MISSING|not installed in/);
  assert.ok(!fs.existsSync(path.join(r.audio, "words.json")));
});

// Only en and en-gb: their G2P is the one proven offline-safe. Every other language (ja, zh, hi, and es, fr, it, pt-br
// whose G2P is not proven from here either) is refused before any helper call, with VoiceStudio named, never MISSING,
// never a download or install offer.
await test("K5b2. any other language is refused before the helper runs, names VoiceStudio and offers nothing", async () => {
  for (const language of ["ja", "zh", "hi", "es", "fr", "it", "pt-br", "pt", "de"]) {
    const r = await take(NARRATION, { language });
    assert.equal(r.code, 1, `${language}: ${r.out}`);
    assert.match(r.out, /only en and en-gb.*VoiceStudio/s, language);
    assert.doesNotMatch(r.out, /MISSING|--download|pip |OpenJTalk|consent|not installed/, `${language}: offers nothing`);
    assert.equal(r.calls.length, 0, `${language}: the helper ran`);
    assert.ok(!fs.existsSync(path.join(r.audio, "words.json")), `${language}: words.json`);
    assert.ok(!fs.existsSync(path.join(r.audio, "narration.wav")), `${language}: audio`);
  }
  const none = await take(NARRATION, { language: false });
  assert.equal(none.code, 1, none.out);
  assert.match(none.out, /only en and en-gb.*VoiceStudio/s);
});

await test("K5b2a. a retake of a take whose recorded language is not en or en-gb is refused the same way", async () => {
  const first = await take(NARRATION);
  assert.equal(first.code, 0, first.out);
  const resp = path.join(first.audio, "narration.response.json");
  const j = JSON.parse(fs.readFileSync(resp, "utf8"));
  j._meta.language = "ja";
  fs.writeFileSync(resp, JSON.stringify(j));
  const r = await take(NARRATION, { dir: first.dir, engine: false, language: false }, ["--retake", "2"]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /only en and en-gb.*VoiceStudio/s);
  assert.doesNotMatch(r.out, /MISSING|--download|OpenJTalk/);
  assert.equal(r.calls.length, 4, "no sentence was re-spoken");
});

await test("K5b3. the helper refused a network reach: the take stops, names the refusal and the consented command, never MISSING", async () => {
  const r = await take(NARRATION, { language: "en-gb", env: { DALANG_TEST_KOKORO: "refused" } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /refused a download of http:\/\/example\.invalid\/x.*consent.*--download --lang b/s);
  assert.doesNotMatch(r.out, /MISSING|not installed in|OpenJTalk/);
  assert.ok(!fs.existsSync(path.join(r.audio, "words.json")));
});

// Kokoro never lives in VoiceStudio's venv (voice.md "Setup — Kokoro"): without DALANG_PYTHON the take does not run
// that venv's Python and names no install into it; DALANG_PYTHON pointing at it gets "use a separate Python".
const vsHome = path.join(tmp, "vs-home"), vsPy = path.join(vsHome, "Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python");
fs.mkdirSync(path.dirname(vsPy), { recursive: true });
fs.copyFileSync(py, vsPy);
fs.chmodSync(vsPy, 0o755);
await test("K5c. DALANG_PYTHON unset: no take in VoiceStudio's venv, the stop note asks for a separate Python", async () => {
  const r = await take(NARRATION, { env: { HOME: vsHome, DALANG_PYTHON: "" } });
  assert.equal(r.code, 1, r.out);
  assert.equal(r.calls.length, 0, "the VoiceStudio venv's Python was run");
  assert.match(r.out, /DALANG_PYTHON.*separate Python/s);
  assert.match(r.out, /separate Python.*torch.*\d\s?GB/s, "the stop note states the whole install size");
  assert.doesNotMatch(r.out, /\.venv|VoiceStudio\/runtime/);
});
await test("K5d. DALANG_PYTHON = VoiceStudio's venv and kokoro missing: no install offer into it", async () => {
  const r = await take(NARRATION, { env: { HOME: vsHome, DALANG_PYTHON: vsPy, DALANG_TEST_KOKORO: "nopkg" } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /separate Python/);
  assert.doesNotMatch(r.out, /not installed in|install it only/);
});

await test("K5d2. DALANG_PYTHON = VoiceStudio's venv through a symlinked folder is still that venv: no install offer", async () => {
  const link = path.join(tmp, "vs-link-bin");
  fs.symlinkSync(path.dirname(vsPy), link);
  const r = await take(NARRATION, { env: { HOME: vsHome, DALANG_PYTHON: path.join(link, "python"), DALANG_TEST_KOKORO: "nopkg" } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /separate Python/);
  assert.doesNotMatch(r.out, /not installed in|install it only/);
});

await test("K6. refusals come before any helper call", async () => {
  for (const [extra, opts, why] of [
    [["--align", "off"], {}, /forced alignment/],
    [["--instructions", "calm"], {}, /built-in voices/],
    [[], { language: "de" }, /only en and en-gb.*VoiceStudio/s],
    [[], { language: "ja" }, /only en and en-gb.*VoiceStudio/s],
    [[], { language: false }, /only en and en-gb.*VoiceStudio/s],
    [["--model", "k2-fsa/OmniVoice"], {}, /Kokoro-82M/],
  ]) {
    const r = await take(NARRATION, opts, extra);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, why);
    assert.equal(r.calls.length, 0);
  }
});

await test("K7. a sentence the voice garbles is named with the respell command; --retake auto tries once, then warns", async () => {
  const r = await take(NARRATION, { env: { DALANG_TEST_GARBLE: "wheel" } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /sentence 3 may not say the script/);
  assert.match(r.out, /respell .*--retake changed/);
  assert.equal(r.calls.length, 4);
  const auto = await take(NARRATION, { env: { DALANG_TEST_GARBLE: "wheel" } }, ["--retake", "auto"]);
  assert.equal(auto.code, 0, auto.out);
  assert.equal(auto.calls.length, 5, "the take, then sentence 3 once");
  assert.equal(auto.calls[4].text, S3);
  assert.match(auto.out, /WARNING\s+: sentence 3 .*after 1 tries/);
  const clean = await take(NARRATION, {}, ["--retake", "auto"]);
  assert.equal(clean.calls.length, 4, "a clean take sends nothing more");
});

await test("L1. the licence table knows Kokoro-82M, and a Kokoro take with no model is unknown", async () => {
  const v = voiceModel({ engine: "kokoro", model: "Kokoro-82M" });
  assert.equal(v?.licence, "Apache-2.0");
  assert.equal(v?.nc, false);
  assert.equal(voiceModel({ engine: "kokoro" }), null);
  const r = await take(NARRATION);
  const project = (meta) => {
    const dir = path.join(tmp, `proj-${++n}`);
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.mkdirSync(path.join(dir, "audio"));
    fs.writeFileSync(path.join(dir, "assets", "narration.m4a"), "");
    fs.writeFileSync(path.join(dir, "ASSETS.json"), JSON.stringify([{ file: "assets/narration.m4a", source: "generated", licence: "Apache-2.0", author: "Kokoro-82M", model: "Kokoro-82M", prompt: "narration.txt" }]));
    fs.writeFileSync(path.join(dir, "audio", "narration.response.json"), JSON.stringify({ _meta: meta }));
    return dir;
  };
  const ok = await runCheck([project(respOf(r)._meta), "--commercial"]);
  assert.equal(ok.code, 0, ok.out);
  assert.doesNotMatch(ok.out, /WARN|PROBLEM/);
  const unknown = await runCheck([project({ engine: "kokoro" }), "--commercial"]);
  assert.match(unknown.out, /WARN.*unknown/s);
});

// The docs say what the code says (consent states the whole install), and the PR keeps the rules it found in voice.md
// that have nothing to do with Kokoro.
const repo = fileURLToPath(new URL("..", import.meta.url));
const doc = (f) => fs.readFileSync(path.join(repo, f), "utf8");
const section = (src, heading) => { const i = src.indexOf(heading + "\n"); assert.ok(i >= 0, `${heading} not found`); const j = src.indexOf("\n## ", i + 1); return src.slice(i, j < 0 ? undefined : j); };
await test("D1. voice.md Setup - Kokoro and the README row state the whole install (torch and the rest, in GB), not only the weights", async () => {
  const setup = section(doc("references/voice.md"), "## Setup — Kokoro (free, commercial-OK, optional)");
  assert.match(setup, /torch.*\d\s?GB/s);
  assert.match(setup, /torchaudio/, "align.py imports torchaudio");
  assert.match(setup, /330 MB/);
  const row = doc("README.md").split("\n").find((l) => l.startsWith("| Kokoro-82M"));
  assert.match(row, /torch.*\d\s?GB/);
  assert.match(row, /330 MB/);
  // the Brief call that offers Kokoro says the size asked about is the whole install
  assert.match(doc("references/brief.md"), /install only with the whole install size/);
});
await test("D2. voice.md Use (Step 4) keeps the audition-tags rule and the 503 rule (wait, never FAILED, never switch engines)", async () => {
  const use = section(doc("references/voice.md"), "## Use (Step 4)");
  assert.match(use, /Accent or style tags change the pace: audition with the exact tags you will use/);
  const rest = doc("references/voice.md");
  const five = rest.split("\n").find((l) => l.startsWith("- **`503` from VoiceStudio:**"));
  assert.ok(five, "503 bullet present");
  assert.match(five, /never `FAILED`/);
  assert.match(five, /Never restart the app or switch engines for it/);
  assert.match(five, /BUSY means wait/);
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`kokoro ok: ${count} cases`);
