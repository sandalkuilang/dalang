#!/usr/bin/env node
// node tests/retake.mjs — tts_timestamps.mjs against a mock VoiceStudio that can hear what it is sent.
// Covers: a VoiceStudio 503 ("abandoned job") is BUSY — wait, retry once, then WARN + exit 3, never FAILED; a heavy
// engine (VoxCPM2) never gets a chunk over its limit; a light engine keeps one chunk.
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
} else if (a.includes('-i')) fs.copyFileSync(a[a.indexOf('-i') + 1], o);
`, { mode: 0o755 });
fs.writeFileSync(path.join(shim, "ffprobe"), `#!/usr/bin/env node
const b = require('fs').readFileSync(process.argv[process.argv.length - 1]);
let p = 12; while (p + 8 <= b.length) { const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4); if (id === 'data') { console.log(n / ${RATE * 2}); process.exit(0); } p += 8 + n; }
process.exit(1);
`, { mode: 0o755 });

// ── The mock VoiceStudio ────────────────────────────────────────────────────
// `speak(body, k)` (k = 0-based count of speech requests so far) may return [status, detail] to refuse, or
// { tokens } to say other words than the input.
function mock({ model = "k2-fsa/OmniVoice", speak } = {}) {
  const speech = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const json = (code, b) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      if (req.url === "/api/settings/performance-profile") return json(200, { selections: { tts: { model } } });
      if (req.url === "/v1/audio/voices") return json(200, { voices: [{ voice_id: "va", name: "va" }] });
      if (req.url === "/v1/audio/speech") {
        const body = JSON.parse(buf.toString("utf8"));
        const k = speech.length;
        speech.push(body);
        const r = speak?.(body, k);
        if (Array.isArray(r)) return json(r[0], { detail: r[1] });
        res.writeHead(200, { "content-type": "audio/wav" });
        return res.end(speakWords(r?.tokens || body.input.split(/\s+/).filter(Boolean)));
      }
      if (req.url === "/v1/audio/transcriptions") {
        const heard = hear(buf);
        return json(200, { text: heard.map((w) => w.word).join(" "), language: "en", words: heard });
      }
      json(404, {});
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, speech })));
}
const run = (args, env = {}) => new Promise((ok) => execFile(process.execPath, [tts, ...args], { timeout: 60000, env: { ...process.env, PATH: `${shim}${path.delimiter}${process.env.PATH}`, DALANG_VS_BUSY_WAIT_S: "0.1", ...env } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

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
  const r = await run(["--input", input, "--out", path.join(dir, "audio"), "--voice", "va", "--language", "en", "--align", "off", "--vs-url", `http://127.0.0.1:${srv.address().port}`, ...extra]);
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
await test("E7. --retake is refused for ElevenLabs, a sample and a dialogue, before any request", async () => {
  for (const [text, extra, why] of [[NARRATION, ["--engine", "elevenlabs"], /ElevenLabs/], [NARRATION, ["--sample"], /single-voice/], ["A: Hello there.\nB: Hi there.\n", ["--voices", "a=va,b=va"], /single-voice/]]) {
    const r = await take(text, {}, ["--retake", "auto", ...extra]);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, why);
    assert.equal(r.speech.length, 0);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`retake ok: ${count} cases`);
