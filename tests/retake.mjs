#!/usr/bin/env node
// node tests/retake.mjs — tts_timestamps.mjs against a mock VoiceStudio that can hear what it is sent.
// Covers: a VoiceStudio 503 ("abandoned job") is BUSY — wait, retry once, then WARN + exit 3, never FAILED; a heavy
// engine (VoxCPM2) never gets a chunk over its limit; a light engine keeps one chunk; --retake auto, --retake <n,…> and
// --retake changed re-speak only the flagged, named or edited sentences and splice them into the take; a stopped take
// resumes from its chunks on disk; a heavy engine checks the backend and memory first, splits a chunk that answered 503
// and shrinks the rest after a slow one; a dropped request is retried once, then WARN + exit 3; a clipped sentence
// start heard only without the prompt is retaken; a new take keeps the last one in takes/<n>/.
// The mock speaks real audio: a 24 kHz mono 16-bit WAV where each word is 0.30 s of one constant sample value
// (its id in a vocabulary), 0.10 s of silence after it, and 0.40 s more after a sentence end. Its transcription route
// reads those values back, so the words it "hears" are the words in the audio — a splice of two takes is heard as
// spliced. An ffmpeg / ffprobe shim on PATH (no codecs needed) joins and measures those files.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const tts = fileURLToPath(new URL("../scripts/tts_timestamps.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-retake-"));
const shim = path.join(tmp, "bin");
fs.mkdirSync(shim);

// ── The audio the mock speaks and hears ─────────────────────────────────────
const RATE = 24000;
const vocab = new Map(); // word -> id (1-based)
const words = [];        // id - 1 -> word
const norm = (w) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
const idOf = (w) => { if (!vocab.has(w)) { vocab.set(w, vocab.size + 1); words.push(w); } return vocab.get(w); };
const wav = (samples) => {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(s, 44 + i * 2));
  return b;
};
// Speak a list of tokens (as written in the text): constant-value words, short gaps, a longer pause after .!?
const speakWords = (tokens) => {
  const out = [];
  const zeros = (s) => { for (let i = 0; i < Math.round(s * RATE); i++) out.push(0); };
  zeros(0.1);
  for (const t of tokens) {
    const v = idOf(norm(t)) * 64;
    for (let i = 0; i < Math.round(0.3 * RATE); i++) out.push(v);
    zeros(0.1);
    if (/[.!?]$/.test(t)) zeros(0.4);
  }
  return wav(out);
};
// The data chunk of a WAV buffer found at `from` (walks the RIFF chunks).
const pcmOf = (buf, from = 0) => {
  let p = from + 12;
  while (p + 8 <= buf.length) {
    const id = buf.toString("latin1", p, p + 4), n = buf.readUInt32LE(p + 4);
    if (id === "data") return buf.subarray(p + 8, Math.min(p + 8 + n, buf.length));
    p += 8 + n;
  }
  return Buffer.alloc(0);
};
// Words heard in 10 ms windows: each run of one non-zero value is one word.
const hear = (buf) => {
  const pcm = pcmOf(buf, buf.indexOf("RIFF"));
  const win = RATE / 100, out = [];
  let cur = null;
  for (let w = 0; w * win < pcm.length / 2; w++) {
    const v = pcm.readInt16LE(w * win * 2);
    if (v !== 0 && cur && cur.v === v) cur.end = (w + 1) / 100;
    else { if (cur) out.push(cur); cur = v !== 0 ? { v, start: w / 100, end: (w + 1) / 100 } : null; }
  }
  if (cur) out.push(cur);
  return out.map((r) => ({ word: words[r.v / 64 - 1], start: r.start, end: r.end }));
};

fs.writeFileSync(path.join(shim, "ffmpeg"), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2); const o = a[a.length - 1];
const pcm = (b) => { let p = 12; while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') return b.subarray(p + 8, p + 8 + n); p += 8 + n; } return Buffer.alloc(0); };
const wav = (d) => { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + d.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(${RATE}, 24); h.writeUInt32LE(${RATE * 2}, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(d.length, 40); return Buffer.concat([h, d]); };
if (a.some((x) => /silencedetect/.test(x))) process.exit(0);
if (a.includes('concat')) {
  const list = fs.readFileSync(a[a.indexOf('-i') + 1], 'utf8').split('\\n').map((l) => /^file '(.*)'$/.exec(l)).filter(Boolean).map((m) => m[1].replace(/'\\\\''/g, "'"));
  fs.writeFileSync(o, wav(Buffer.concat(list.map((f) => pcm(fs.readFileSync(f))))));
} else if (a.some((x) => /atempo=/.test(x))) {
  const t = parseFloat(a.find((x) => /atempo=/.test(x)).split('=')[1]); const src = pcm(fs.readFileSync(a[a.indexOf('-i') + 1]));
  const n = Math.round(src.length / 2 / t), out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) out.writeInt16LE(src.readInt16LE(Math.min(Math.floor(i * t), src.length / 2 - 1) * 2), i * 2);
  fs.writeFileSync(o, wav(out));
} else if (a.includes('-i')) fs.copyFileSync(a[a.indexOf('-i') + 1], o);
`, { mode: 0o755 });
fs.writeFileSync(path.join(shim, "ffprobe"), `#!/usr/bin/env node
const b = require('fs').readFileSync(process.argv[process.argv.length - 1]);
let p = 12; while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') { console.log(n / ${RATE * 2}); process.exit(0); } p += 8 + n; }
process.exit(1);
`, { mode: 0o755 });

// ── The mock VoiceStudio ────────────────────────────────────────────────────
// `speak(body, k)` (k = 0-based count of speech requests so far) may return [status, detail] to refuse, "drop" to cut
// the connection, or { tokens } to say other words than the input. `transcribe(k, prompted)` (k = 0-based count of
// transcription requests) may return [status, detail] to refuse, "empty" to hear no words, or a function that changes
// the words heard. `health: "hang"` never answers /health.
function mock({ model = "k2-fsa/OmniVoice", speak, transcribe, health } = {}) {
  const speech = [];
  let heardCount = 0; // transcription requests so far
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const json = (code, b) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      if (req.url === "/api/settings/performance-profile") return json(200, { selections: { tts: { model } } });
      if (req.url === "/health") { if (health === "hang") return; return json(200, { ok: true }); }
      if (req.url === "/v1/audio/voices") return json(200, { voices: [{ voice_id: "va", name: "va" }] });
      if (req.url === "/v1/audio/speech") {
        const body = JSON.parse(buf.toString("utf8"));
        const k = speech.length;
        speech.push(body);
        const r = speak?.(body, k);
        if (Array.isArray(r)) return json(r[0], { detail: r[1] });
        if (r === "drop") return req.socket.destroy();
        res.writeHead(200, { "content-type": "audio/wav" });
        return res.end(speakWords(r?.tokens || body.input.split(/\s+/).filter(Boolean)));
      }
      if (req.url === "/v1/audio/transcriptions") {
        const k = heardCount++;
        const r = transcribe?.(k, buf.includes('name="prompt"'));
        if (Array.isArray(r)) return json(r[0], { detail: r[1] });
        if (r === "empty") return json(200, { text: "", language: "en", words: [] });
        const heard = typeof r === "function" ? r(hear(buf)) : hear(buf);
        return json(200, { text: heard.map((w) => w.word).join(" "), language: "en", words: heard });
      }
      json(404, {});
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, speech })));
}
const run = (args, env = {}) => new Promise((ok) => execFile(process.execPath, [tts, ...args], { timeout: 60000, env: { ...process.env, PATH: `${shim}${path.delimiter}${process.env.PATH}`, DALANG_VS_BUSY_WAIT_S: "0.1", DALANG_FREE_GB: "16", DALANG_RETAKE_LEVEL: "off", ...env } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

const failures = [];
let count = 0;
const test = async (name, fn) => { count++; try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

let n = 0;
// Make a take of `text` (one narration.txt) against a mock; returns what happened. `opts.dir` reuses a case folder
// (a second run on the take the first one made).
const take = async (text, opts = {}, extra = []) => {
  const dir = opts.dir || path.join(tmp, `case-${++n}`);
  if (!opts.dir) fs.mkdirSync(dir);
  const input = path.join(dir, "narration.txt");
  fs.writeFileSync(input, text);
  const { srv, speech } = await mock(opts);
  const r = await run(["--input", input, "--out", path.join(dir, "audio"), "--voice", "va", "--language", "en", "--align", "off", "--vs-url", `http://127.0.0.1:${srv.address().port}`, ...extra], opts.env);
  srv.close(); srv.closeAllConnections();
  return { ...r, speech, dir, out: r.out, audio: path.join(dir, "audio") };
};
const tokensOf = (s) => s.split(/\s+/).map(norm).filter(Boolean);

const NARRATION = "The river starts in the hills. It runs past the old mill. Water turns the wheel all day. The town grows near the bank.\n";
const BUSY = "generate ran for more than 300s of actual compute time and was abandoned; the engine keeps holding the device until it finishes, so an immediate retry competes with it";
const LONG = "The river starts high in the quiet hills, and it gathers every small stream that falls from the grey rocks, and it carries the cold clear water down through the pine woods, past the farms and the stone bridges, and on toward the wide valley where the old mill stands beside the road, turning its wheel all day. It never stops.\n";

await test("B1. a 503 on the speech route waits, retries once, and the take goes on", async () => {
  const r = await take(NARRATION, { speak: (_b, k) => (k === 0 ? [503, BUSY] : undefined) });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 2, "the same request, twice");
  assert.match(r.out, /BUSY/);
  assert.match(r.out, /retrying once/);
  assert.ok(fs.existsSync(path.join(r.audio, "words.json")), "words.json written");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.audio, "words.json"), "utf8")).map((w) => norm(w.text)), tokensOf(NARRATION));
});
await test("B2. a second 503 is a WARN with 'rerun', exit 3, never FAILED, never a restart", async () => {
  const r = await take(NARRATION, { speak: () => [503, BUSY] });
  assert.equal(r.code, 3, r.out);
  assert.equal(r.speech.length, 2, "one try, one retry, no more");
  assert.match(r.out, /rerun in a few minutes/);
  assert.doesNotMatch(r.out, /FAILED/);
  assert.doesNotMatch(r.out, /(?<!not )restart VoiceStudio/i, "it never tells the agent to restart");
});
await test("B2b. a 429 (GPU worker pool saturated) is BUSY too: one retry, then WARN, exit 3, never FAILED", async () => {
  const r = await take(NARRATION, { speak: () => [429, "the local GPU worker pool is saturated (1 running, 2 already queued on 1 worker(s))"] });
  assert.equal(r.code, 3, r.out);
  assert.equal(r.speech.length, 2, "one try, one retry, no more");
  assert.match(r.out, /BUSY/);
  assert.match(r.out, /rerun in a few minutes/);
  assert.doesNotMatch(r.out, /FAILED/);
});
await test("B3. any other error still fails hard (exit 1, FAILED)", async () => {
  const r = await take(NARRATION, { speak: () => [500, "boom"] });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /FAILED/);
  assert.equal(r.speech.length, 1, "no retry for a 500");
});
await test("C1. VoxCPM2 never gets a chunk over 120 characters, even from one long sentence", async () => {
  assert.ok(LONG.split(/(?<=\.)\s/)[0].length > 250, "the first sentence is over 250 characters");
  const r = await take(LONG, { model: "openbmb/VoxCPM2" });
  assert.equal(r.code, 0, r.out);
  assert.ok(r.speech.length >= 3, `${r.speech.length} requests`);
  for (const b of r.speech) { assert.ok(b.input.length <= 120, `${b.input.length} characters: ${b.input}`); assert.match(b.model, /voxcpm/i); }
  assert.deepEqual(r.speech.flatMap((b) => tokensOf(b.input)), tokensOf(LONG), "every word sent, in order");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.audio, "words.json"), "utf8")).map((w) => norm(w.text)), tokensOf(LONG));
});
await test("C2. a light engine (OmniVoice) keeps one chunk for the same text", async () => {
  const r = await take(LONG);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1);
  assert.equal(r.speech[0].input.length, LONG.trim().length);
});


// ── --retake auto and --retake <n,…> ─────────────────────────────────────────
// How long the mock's audio is for these tokens (a word 0.4 s, 0.4 s more after a sentence end, 0.1 s lead-in).
const durOf = (tokens) => 0.1 + tokens.reduce((s, t) => s + 0.4 + (/[.!?]$/.test(t) ? 0.4 : 0), 0);
const wordsOf = (r) => JSON.parse(fs.readFileSync(path.join(r.audio, "words.json"), "utf8")).map((w) => norm(w.text));
const durationOf = (r) => JSON.parse(fs.readFileSync(path.join(r.audio, "beats.json"), "utf8")).duration;
// The voice adds "maybe" after "wheel" (sentence 3) in the requests `when(k)` selects.
const adds = (when) => (b, k) => (when(k) ? { tokens: b.input.split(/\s+/).flatMap((t) => (norm(t) === "wheel" ? [t, "maybe"] : [t])) } : undefined);
const S3 = "Water turns the wheel all day.";
const S2 = "It runs past the old mill.";

// ── a slow or busy backend: resume, split, shrink, check first, retry a dropped request ─────────────────────
const VOX = { model: "openbmb/VoxCPM2" };
const partsOf = (r) => path.join(r.audio, ".tts-parts");
await test("R1. a heavy take stopped by 503s keeps its chunks; the rerun speaks only the rest and clears them", async () => {
  const first = await take(LONG, { ...VOX, speak: (_b, k) => (k >= 2 ? [503, BUSY] : undefined) });
  assert.equal(first.code, 3, first.out);
  assert.match(first.out, /rerun in a few minutes/);
  assert.match(first.out, /2 of \d+ chunks are kept/);
  assert.doesNotMatch(first.out, /FAILED/);
  const kept = fs.readdirSync(partsOf(first)).filter((f) => f.endsWith(".wav")).length;
  assert.equal(kept, 2, "the two spoken chunks are on disk");
  const r = await take(LONG, { ...VOX, dir: first.dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Resume\s+: 2 of \d+ chunks are on disk/);
  const sent = [...first.speech.slice(0, 2), ...r.speech].flatMap((b) => tokensOf(b.input));
  assert.deepEqual(sent, tokensOf(LONG), "the rerun sends only the words not yet spoken, in order");
  assert.deepEqual(wordsOf(r), tokensOf(LONG));
  assert.ok(!fs.existsSync(partsOf(r)), "the chunks are cleared once the take is whole");
});
await test("R2. a heavy chunk that answered 503 is retried in halves; a light one is retried whole", async () => {
  const r = await take(LONG, { ...VOX, speak: (_b, k) => (k === 0 ? [503, BUSY] : undefined) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /with the chunk in \d+ parts/);
  assert.ok(r.speech[1].input.length < r.speech[0].input.length, "the retry is shorter");
  assert.ok(r.speech[0].input.startsWith(r.speech[1].input), "and is the chunk's first half");
  assert.deepEqual(wordsOf(r), tokensOf(LONG));
});
await test("R3. a heavy chunk that took over half the compute limit shrinks the rest", async () => {
  const r = await take(LONG, VOX);
  const slow = await take(LONG, { ...VOX, env: { DALANG_VS_LIMIT_S: "0.0001" } });
  assert.equal(slow.code, 0, slow.out);
  assert.match(slow.out, /the rest go at ≤ 40 characters/);
  assert.ok(slow.speech.length > r.speech.length, `${slow.speech.length} requests vs ${r.speech.length}`);
  for (const b of slow.speech.slice(1)) assert.ok(b.input.length <= 40, `${b.input.length}: ${b.input}`);
  assert.deepEqual(wordsOf(slow), tokensOf(LONG));
});
await test("R4. low free memory starts a heavy take at 60-character chunks, with a WARN, never MISSING", async () => {
  const r = await take(LONG, { ...VOX, env: { DALANG_FREE_GB: "2" } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN\s+: 2\.0 GB of memory free/);
  assert.doesNotMatch(r.out, /MISSING/);
  for (const b of r.speech) assert.ok(b.input.length <= 60, `${b.input.length}: ${b.input}`);
  const light = await take(LONG, { env: { DALANG_FREE_GB: "2" } });
  assert.doesNotMatch(light.out, /memory/, "a light engine does not check");
});
await test("R5. a backend that does not answer /health before a heavy take: WARN, rerun, exit 3, nothing spoken", async () => {
  const r = await take(LONG, { ...VOX, health: "hang" });
  assert.equal(r.code, 3, r.out);
  assert.equal(r.speech.length, 0);
  assert.match(r.out, /WARN: .*rerun in a few minutes/);
  assert.doesNotMatch(r.out, /FAILED|MISSING|(?<!not )restart VoiceStudio/);
});
await test("D1. a dropped request is retried once and the take goes on; dropped twice is WARN + exit 3", async () => {
  const r = await take(NARRATION, { speak: (_b, k) => (k === 0 ? "drop" : undefined) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /BUSY\s+: VoiceStudio dropped/);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
  const x = await take(NARRATION, { speak: () => "drop" });
  assert.equal(x.code, 3, x.out);
  assert.match(x.out, /rerun in a few minutes/);
  assert.doesNotMatch(x.out, /FAILED/);
});
await test("K1. a new take keeps the last one in takes/1/ (audio and response), never overwrites it", async () => {
  const first = await take(NARRATION);
  const wav = fs.readFileSync(path.join(first.audio, "narration.wav")), json = fs.readFileSync(path.join(first.audio, "narration.response.json"));
  const r = await take(NARRATION, { dir: first.dir });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Kept\s+: the previous take/);
  assert.ok(fs.readFileSync(path.join(r.audio, "takes", "1", "narration.wav")).equals(wav));
  assert.ok(fs.readFileSync(path.join(r.audio, "takes", "1", "narration.response.json")).equals(json));
  assert.ok(fs.existsSync(path.join(r.audio, "narration.wav")), "the new take is in place");
});


await test("E1. --retake auto re-speaks only the sentence with an invented word, and splices it in", async () => {
  const r = await take(NARRATION, { speak: adds((k) => k === 0) }, ["--retake", "auto"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 2, "the full take, then sentence 3 alone");
  assert.equal(r.speech[1].input, S3);
  assert.match(r.out, /Retake\s+: sentence 3 .*try 1/);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION), "words.json matches narration.txt word for word");
  // the first take was one invented word (0.4 s) longer; the two joins each overlap 10 ms
  assert.ok(Math.abs(durationOf(r) - (durOf(NARRATION.split(/\s+/).filter(Boolean)) - 0.02)) < 0.05, `duration ${durationOf(r)}`);
  const resp = JSON.parse(fs.readFileSync(path.join(r.audio, "narration.response.json"), "utf8"));
  assert.equal(resp._meta.text.trim(), NARRATION.trim(), "the response describes the spliced take");
  assert.deepEqual(resp.transcript.words.map((w) => w.word), tokensOf(NARRATION), "and its transcript is the spliced audio's");
});
await test("E2. a clean take with --retake auto sends no extra request", async () => {
  const r = await take(NARRATION, {}, ["--retake", "auto"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1);
  assert.doesNotMatch(r.out, /Retake\s+: sentence/);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
});
await test("E3. a sentence that never comes out right: two tries (the second with another seed), then a WARNING", async () => {
  const r = await take(NARRATION, { speak: adds(() => true) }, ["--retake", "auto"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 3, "the full take and two retakes");
  assert.equal(r.speech[1].seed, 42);
  assert.equal(r.speech[2].seed, 43);
  assert.equal(r.speech[1].input, S3);
  assert.equal(r.speech[2].input, S3);
  assert.match(r.out, /WARNING\s+: sentence 3 .*after 2 tries/);
  assert.doesNotMatch(r.out, /FAILED/);
});
await test("E4. --retake 2 re-speaks sentence 2 of the take on disk, with no full take", async () => {
  const first = await take(NARRATION, { speak: adds(() => false) });
  assert.equal(first.code, 0, first.out);
  const r = await take(NARRATION, { dir: first.dir }, ["--retake", "2"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1);
  assert.equal(r.speech[0].input, S2);
  assert.match(r.out, /Retake\s+: sentence 2 .*try 1/);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
});
await test("E5. --retake with a number past the last sentence, or with no take on disk, stops before any request", async () => {
  const first = await take(NARRATION);
  const r = await take(NARRATION, { dir: first.dir }, ["--retake", "9"]);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /has 4 sentences/);
  assert.equal(r.speech.length, 0);
  const none = await take(NARRATION, {}, ["--retake", "2"]);
  assert.equal(none.code, 1, none.out);
  assert.match(none.out, /existing take/);
  assert.equal(none.speech.length, 0);
  const bad = await take(NARRATION, {}, ["--retake", "second"]);
  assert.equal(bad.code, 1, bad.out);
  assert.match(bad.out, /auto, changed or sentence numbers/);
});
await test("E6. without --retake a flagged sentence is named, with the command that fixes it, and nothing is re-spoken", async () => {
  const r = await take(NARRATION, { speak: adds((k) => k === 0) });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1);
  assert.match(r.out, /Retake\s+: sentence 3 may not say the script \(heard ≠ script: heard "[^"]+"\) — run again with --retake auto --from-response \S*narration\.response\.json/);
  assert.doesNotMatch(r.out, /listen/i, "no warning tells the agent to listen");
  const clean = await take(NARRATION);
  assert.doesNotMatch(clean.out, /Retake\s+:/);
});
await test("E7.--retake is refused for ElevenLabs, a sample and a dialogue, before any request", async () => {
  for (const [text, extra, why] of [[NARRATION, ["--engine", "elevenlabs"], /ElevenLabs/], [NARRATION, ["--sample"], /single-voice/], ["A: Hello there.\nB: Hi there.\n", ["--voices", "a=va,b=va"], /single-voice/]]) {
    const r = await take(text, {}, ["--retake", "auto", ...extra]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, why);
    assert.equal(r.speech.length, 0);
  }
});

// ── --retake changed ─────────────────────────────────────────────────────────
const EDITED = NARRATION.replace("old mill", "stone mill");
const S2_NEW = "It runs past the stone mill.";
await test("E8. --retake changed after editing one sentence re-speaks only that sentence", async () => {
  const first = await take(NARRATION);
  assert.equal(first.code, 0, first.out);
  const before = durationOf(first);
  const r = await take(EDITED, { dir: first.dir }, ["--retake", "changed"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1, "no full take: one request");
  assert.equal(r.speech[0].input, S2_NEW);
  assert.match(r.out, /Retake\s+: sentence 2 .*try 1.*changed/);
  assert.deepEqual(wordsOf(r), tokensOf(EDITED), "words.json matches the edited narration.txt");
  assert.ok(Math.abs(durationOf(r) - before) < 0.05, `as long as before (${before} s), not ${durationOf(r)} s`);
  const resp = JSON.parse(fs.readFileSync(path.join(r.audio, "narration.response.json"), "utf8"));
  assert.equal(resp._meta.text.trim(), EDITED.trim(), "the response describes the edited take, so the next --retake changed compares with it");
  assert.deepEqual(resp.transcript.words.map((w) => w.word), tokensOf(EDITED));
  const again = await take(EDITED, { dir: first.dir }, ["--retake", "changed"]);
  assert.equal(again.speech.length, 0, "the take now matches the script");
});
await test("E8b. --retake changed on an unchanged script re-speaks nothing", async () => {
  const first = await take(NARRATION);
  const r = await take(NARRATION, { dir: first.dir }, ["--retake", "changed"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 0);
  assert.match(r.out, /matches the last take/);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
});
await test("E8c. --retake changed with a sentence added and one removed re-speaks the new one and drops the old", async () => {
  const first = await take(NARRATION);
  const NEXT = "It runs past the old mill. Water turns the wheel all day. The town grows near the bank. Boats wait by the quay.\n";
  const r = await take(NEXT, { dir: first.dir }, ["--retake", "changed"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1);
  assert.equal(r.speech[0].input, "Boats wait by the quay.");
  assert.deepEqual(wordsOf(r), tokensOf(NEXT));
});
await test("E8d. --retake changed re-speaks a changed sentence that comes out wrong a second time, then warns", async () => {
  const first = await take(NARRATION);
  const r = await take(EDITED, { dir: first.dir, speak: (b) => ({ tokens: b.input.split(/\s+/).flatMap((t) => (norm(t) === "stone" ? [t, "maybe"] : [t])) }) }, ["--retake", "changed"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 2, "try 1, then try 2");
  assert.equal(r.speech[0].seed, 42);
  assert.equal(r.speech[1].seed, 43);
  assert.match(r.out, /WARNING\s+: sentence 2 .*after 2 tries/);
});

// ── a retake that cannot finish never leaves the audio and its response describing different takes ────────────
const LONGER = NARRATION.replace("It runs past the old mill.", "It runs past the old stone mill by the road.");
const bytes = (dir, f) => fs.readFileSync(path.join(dir, "audio", f));
const wavSeconds = (dir) => (bytes(dir, "narration.wav").length - 44) / 2 / RATE;
for (const [label, transcribe, why] of [
  ["a second 503 on the transcription (exit 3, rerun)", (k) => (k >= 1 ? [503, BUSY] : undefined), 3],
  ["a transcription that comes back without words", (k) => (k >= 1 ? "empty" : undefined), 1],
]) {
  await test(`G1. --retake changed with ${label}: narration.wav, narration.response.json and the folder stay as they were`, async () => {
    const first = await take(NARRATION);
    assert.equal(first.code, 0, first.out);
    const wavBefore = bytes(first.dir, "narration.wav"), jsonBefore = bytes(first.dir, "narration.response.json");
    const r = await take(LONGER, { dir: first.dir, transcribe }, ["--retake", "changed"]);
    assert.equal(r.code, why, r.out);
    assert.ok(r.speech.length >= 1, "a sentence was re-spoken");
    assert.ok(bytes(first.dir, "narration.wav").equals(wavBefore), "the audio is the old take, not the splice");
    assert.ok(bytes(first.dir, "narration.response.json").equals(jsonBefore), "its response still describes that audio");
    assert.deepEqual(fs.readdirSync(r.audio).filter((f) => /retake/i.test(f)), [], "no _retake folder or temp file left behind");
  });
}
await test("G2. --retake changed with every request answered still swaps the audio and its response together", async () => {
  const first = await take(NARRATION);
  const r = await take(LONGER, { dir: first.dir }, ["--retake", "changed"]);
  assert.equal(r.code, 0, r.out);
  const resp = JSON.parse(bytes(first.dir, "narration.response.json"));
  assert.equal(resp._meta.text.trim(), LONGER.trim());
  assert.ok(Math.abs(resp.transcript.words.at(-1).end - wavSeconds(first.dir)) < 0.6, "the response's last word ends where the audio ends");
  assert.deepEqual(fs.readdirSync(r.audio).filter((f) => /retake/i.test(f)), [], "nothing left behind");
});
await test("G3. a retake that stops in round 2 leaves words.json and beats.json on the audio round 1 committed", async () => {
  // take: sentence 3 gets two invented words (+0.8 s); retake 1: one invented word (+0.4 s, still flagged); retake 2: 503 twice
  const speak = (b, k) => k >= 2 ? [503, BUSY] : { tokens: b.input.split(/\s+/).flatMap((t) => (norm(t) === "wheel" ? (k === 0 ? [t, "maybe", "maybe"] : [t, "maybe"]) : [t])) };
  const r = await take(NARRATION, { speak }, ["--retake", "auto"]);
  assert.equal(r.code, 3, r.out);
  const beats = JSON.parse(bytes(r.dir, "beats.json"));
  assert.ok(Math.abs(beats.duration - wavSeconds(r.dir)) < 0.05, `beats.json says ${beats.duration} s, the audio is ${wavSeconds(r.dir)} s`);
  assert.equal(JSON.parse(bytes(r.dir, "words.json")).length, tokensOf(NARRATION).length);
});

await test("O1. a sentence start heard clipped only without the prompt is flagged and retaken", async () => {
  // the take's plain pass (transcription 1) hears "water" as "ater"; the prompted pass hears it as written
  const clip = (k, prompted) => (k === 1 && !prompted ? (ws) => ws.map((w) => (w.word === "water" ? { ...w, word: "ater" } : w)) : undefined);
  const r = await take(NARRATION, { transcribe: clip }, ["--retake", "auto"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Retake\s+: sentence 3 .*clipped start/);
  assert.equal(r.speech.length, 2, "the take, then sentence 3 alone");
  assert.equal(r.speech[1].input, S3);
  assert.doesNotMatch(r.out, /WARNING/);
  const plain = await take(NARRATION, { transcribe: clip });
  assert.match(plain.out, /sentence 3 may not say the script \(clipped start\)/, "without --retake it is named");
});

// ── a flagged sentence is never delivered quietly ────────────────────────────────────────────────────────────
await test("H1. --retake auto: every clip of try 1 comes back without words, so there is a try 2 (seed + 1) and then a WARNING", async () => {
  const r = await take(NARRATION, { speak: (b, k) => (k === 0 ? adds(() => true)(b, k) : { tokens: [] }) }, ["--retake", "auto"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 3, "the take and two tries");
  assert.equal(r.speech[1].seed, 42);
  assert.equal(r.speech[2].seed, 43);
  assert.match(r.out, /WARNING\s+: sentence 3 .*do not deliver/);
});
await test("H2. --retake auto: try 1 comes back without words, try 2 is good: no WARNING, words match", async () => {
  const r = await take(NARRATION, { speak: (b, k) => (k === 0 ? adds(() => true)(b, k) : k === 1 ? { tokens: [] } : undefined) }, ["--retake", "auto"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 3);
  assert.doesNotMatch(r.out, /WARNING\s+: sentence/);
  assert.doesNotMatch(r.out, /may not say the script/);
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
});
await test("H3. --retake 2 whose clips never come back with words: two tries, then a WARNING naming sentence 2", async () => {
  const first = await take(NARRATION);
  const r = await take(NARRATION, { dir: first.dir, speak: () => ({ tokens: [] }) }, ["--retake", "2"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 2);
  assert.match(r.out, /WARNING\s+: sentence 2 .*do not deliver/);
});
await test("H4. --retake 2 on a take where sentence 3 is flagged: sentence 3 is named; on a clean take nothing is", async () => {
  const flagged = await take(NARRATION, { speak: adds((k) => k === 0) });
  const r = await take(NARRATION, { dir: flagged.dir }, ["--retake", "2"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARNING\s+: sentence 3 may not say the script/);
  const clean = await take(NARRATION);
  const c = await take(NARRATION, { dir: clean.dir }, ["--retake", "2"]);
  assert.equal(c.code, 0, c.out);
  assert.doesNotMatch(c.out, /may not say the script|WARNING\s+: sentence/);
});
await test("H5. a sentence flagged only after the splice is named once, and one already warned is not named twice", async () => {
  const r = await take(NARRATION, { speak: adds(() => true) }, ["--retake", "auto"]);
  assert.match(r.out, /WARNING\s+: sentence 3 .*after 2 tries/);
  assert.doesNotMatch(r.out, /may not say the script/, "already warned by name");
});

// ── --tempo: the approved take on disk plays at another speed and stays a first-class take ─────────────────────
const respOf = (r) => path.join(r.audio, "narration.response.json");
const metaOf = (r) => JSON.parse(fs.readFileSync(respOf(r), "utf8"))._meta;
const tempo = (r, t, extra = []) => take(NARRATION, { dir: r.dir }, ["--from-response", respOf(r), "--tempo", String(t), ...extra]);
const checkAssets = fileURLToPath(new URL("../scripts/check_assets.mjs", import.meta.url));
let T1;
await test("T1. --tempo 0.9 on a take: duration x 1/0.9, no new speech, model kept, _meta.tempo recorded", async () => {
  const r0 = await take(NARRATION, { model: "openbmb/VoxCPM2" });
  const d0 = durationOf(r0), last0 = JSON.parse(fs.readFileSync(path.join(r0.audio, "words.json"), "utf8")).at(-1).end;
  const r = await tempo(r0, 0.9);
  T1 = { r0, d0 };
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 0, "no speech request");
  assert.ok(Math.abs(durationOf(r) - d0 / 0.9) <= d0 / 0.9 * 0.01, `${durationOf(r)} vs ${d0 / 0.9}`);
  const m = metaOf(r);
  assert.match(m.model, /voxcpm/i); assert.equal(m.tempo, 0.9); assert.equal(m.engine, "voicestudio");
  assert.deepEqual(wordsOf(r), tokensOf(NARRATION));
  const last = JSON.parse(fs.readFileSync(path.join(r.audio, "words.json"), "utf8")).at(-1).end;
  assert.ok(Math.abs(last - last0 / 0.9) <= 0.05, `${last} vs ${last0 / 0.9}`);
  assert.match(r.out, /Tempo\s+: x0\.9/);
});
await test("T2. a tempo-changed take passes check_assets --commercial with no hand-written licence", async () => {
  const dir = path.join(tmp, "proj");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true }); fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "narration.m4a"), "");
  fs.writeFileSync(path.join(dir, "ASSETS.json"), JSON.stringify([{ file: "assets/narration.m4a", source: "generated", licence: "Apache-2.0", author: "VoiceStudio", model: "m", prompt: "narration.txt" }]));
  fs.copyFileSync(respOf(T1.r0), path.join(dir, "audio", "narration.response.json"));
  const r = await new Promise((ok) => execFile(process.execPath, [checkAssets, dir, "--commercial"], { timeout: 30000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /unknown/i);
});
await test("T3. --retake 2 on a tempo-changed take re-speaks one sentence at the same tempo", async () => {
  const r = await take(NARRATION, { dir: T1.r0.dir, model: "openbmb/VoxCPM2" }, ["--retake", "2"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.speech.length, 1);
  assert.equal(r.speech[0].input, S2);
  assert.equal(metaOf(r).tempo, 0.9);
  assert.ok(Math.abs(durationOf(r) - T1.d0 / 0.9) <= 0.1, `${durationOf(r)} vs ${T1.d0 / 0.9}`);
  const runs = JSON.parse(fs.readFileSync(path.join(r.audio, "words.json"), "utf8")).find((w) => norm(w.text) === "runs");
  assert.ok(Math.abs(runs.end - runs.start - 0.333) <= 0.04, `runs lasts ${runs.end - runs.start}`);
});
await test("T4. --tempo refusals: out of range, no take, combined flags, an ElevenLabs take", async () => {
  const base = await take(NARRATION);
  let r = await tempo(base, 1.5);
  assert.notEqual(r.code, 0); assert.match(r.out, /FAILED/); assert.match(r.out, /0\.8 to 1\.2/);
  const fresh = path.join(tmp, "empty-case"); fs.mkdirSync(fresh);
  r = await take(NARRATION, { dir: fresh }, ["--from-response", path.join(fresh, "audio", "narration.response.json"), "--tempo", "0.9"]);
  assert.notEqual(r.code, 0); assert.match(r.out, /FAILED/); assert.match(r.out, /not found/);
  r = await tempo(base, 0.9, ["--retake", "changed"]);
  assert.notEqual(r.code, 0); assert.match(r.out, /FAILED/); assert.match(r.out, /do not combine/);
  r = await tempo(base, 0.9, ["--speed", "0.9"]);
  assert.notEqual(r.code, 0); assert.match(r.out, /FAILED/); assert.match(r.out, /do not combine/);
  const el = path.join(tmp, "eleven-case"); fs.mkdirSync(path.join(el, "audio"), { recursive: true });
  const resp = JSON.parse(fs.readFileSync(respOf(base), "utf8")); resp._meta.engine = "elevenlabs";
  fs.writeFileSync(path.join(el, "audio", "narration.response.json"), JSON.stringify(resp));
  fs.copyFileSync(path.join(base.audio, resp.audio_file), path.join(el, "audio", resp.audio_file));
  r = await take(NARRATION, { dir: el }, ["--from-response", path.join(el, "audio", "narration.response.json"), "--tempo", "0.9"]);
  assert.notEqual(r.code, 0); assert.match(r.out, /FAILED/); assert.match(r.out, /--speed/);
});
await test("T5. tempo is cumulative (0.9 x 0.9 = 0.81); a third pass past 0.8 is refused and changes nothing", async () => {
  const r0 = await take(NARRATION);
  const d0 = durationOf(r0);
  await tempo(r0, 0.9);
  const r = await tempo(r0, 0.9);
  assert.equal(r.code, 0, r.out);
  assert.equal(metaOf(r).tempo, 0.81);
  assert.ok(Math.abs(durationOf(r) - d0 / 0.81) <= d0 / 0.81 * 0.01);
  const resp = fs.readFileSync(respOf(r)), audio = fs.readFileSync(path.join(r.audio, JSON.parse(resp).audio_file));
  const x = await tempo(r0, 0.9);
  assert.notEqual(x.code, 0); assert.match(x.out, /FAILED/); assert.match(x.out, /total stays 0\.8/);
  assert.ok(fs.readFileSync(respOf(r)).equals(resp), "response unchanged");
  assert.ok(fs.readFileSync(path.join(r.audio, JSON.parse(resp).audio_file)).equals(audio), "audio unchanged");
});
await test("T6. --tempo 1 leaves the take as it is", async () => {
  const r0 = await take(NARRATION);
  const audio = fs.readFileSync(path.join(r0.audio, JSON.parse(fs.readFileSync(respOf(r0), "utf8")).audio_file));
  const r = await tempo(r0, 1);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /unchanged/);
  assert.equal(metaOf(r).tempo, undefined);
  assert.ok(fs.readFileSync(path.join(r.audio, JSON.parse(fs.readFileSync(respOf(r), "utf8")).audio_file)).equals(audio));
});

// A re-spoken sentence is brought to the level of the kept speech around it (the mock's values are its words, so the
// splices above run with DALANG_RETAKE_LEVEL=off; this checks the level match itself on real-shaped audio).
await test("L1. a retake said 3 dB louder than its neighbours is spliced at their level, within ±6 dB", async () => {
  const { levelOf, matchLevel } = await import(tts);
  const tone = (amp, n = 24000, gap = 4800) => Int16Array.from({ length: n + gap }, (_, i) => i < n ? Math.round(amp * Math.sin(i / 7)) : 0);
  const near = [tone(6000), tone(6000)], loud = tone(6000 * 10 ** (3 / 20));
  assert.ok(Math.abs(levelOf(tone(6000)) - levelOf(tone(6000, 24000, 48000))) < 1, "pauses do not lower the level");
  const g = matchLevel(loud, near);
  assert.ok(Math.abs(20 * Math.log10(g) + 3) < 0.1, `gain ${g}`); assert.ok(Math.abs(levelOf(loud) - levelOf(near[0])) < levelOf(near[0]) * 0.01);
  const soft = tone(500);
  assert.ok(Math.abs(matchLevel(soft, near) - 2) < 1e-9, "never more than +6 dB");
  assert.equal(matchLevel(tone(0), near), 1, "silence is left alone");
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`retake ok: ${count} cases`);
