#!/usr/bin/env node
// node tests/save-profile.mjs — `tts_timestamps.mjs --save-profile` takes a --sample audition as it is.
// A clip over the engine's 20 s is cut at the last timed word end <= 15 s when the audition's <name>.words.json is
// next to it, and those words become the ref text. Without that file, with a --ref-text of its own, or with no usable
// word to cut at, it still stops and sends nothing. A clip under the limit is never cut.
// Runs tts_timestamps.mjs against a mock VoiceStudio, with ffmpeg and ffprobe shims (no codecs needed): a fake audio
// file holds "DUR <seconds>"; the ffmpeg shim copies it, or writes the length asked by -t; ffprobe reads it back.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const tts = fileURLToPath(new URL("../scripts/tts_timestamps.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-save-profile-"));
const shim = path.join(tmp, "bin");
const ffLog = path.join(tmp, "ffmpeg.log");
fs.mkdirSync(shim);
fs.writeFileSync(path.join(shim, "ffmpeg"), `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(ffLog)}, a.join(' ') + '\\n');
const i = a.indexOf('-i'); const t = a.indexOf('-t'); const o = a[a.length - 1];
if (i >= 0) { if (t >= 0) fs.writeFileSync(o, 'DUR ' + a[t + 1]); else fs.copyFileSync(a[i + 1], o); }
`, { mode: 0o755 });
fs.writeFileSync(path.join(shim, "ffprobe"), `#!/usr/bin/env node
const m = /DUR ([\\d.]+)/.exec(require('fs').readFileSync(process.argv[process.argv.length - 1], 'utf8'));
if (!m) process.exit(1);
console.log(m[1]);
`, { mode: 0o755 });

// A mock VoiceStudio that records every request. Transcription fails on purpose: a cut must not need it.
function mock() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ url: req.url, body });
      if (req.url === "/profiles" && req.method === "POST") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ id: "p1" }));
      }
      res.writeHead(req.url.startsWith("/v1/audio/transcriptions") ? 500 : 404, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, seen })));
}
const run = (args) => new Promise((ok) => execFile(process.execPath, [tts, ...args], { timeout: 60000, env: { ...process.env, PATH: `${shim}${path.delimiter}${process.env.PATH}` } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

const failures = [];
let count = 0;
const test = async (name, fn) => { count++; try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

// A fake audition of `dur` seconds named sample-x.wav, with 40 words (0.6 s apart, each 0.45 s long) when `words` is true.
let n = 0;
const audition = (dur, words, mapWords = (w) => w) => {
  const dir = path.join(tmp, `case-${++n}`);
  fs.mkdirSync(dir);
  const ref = path.join(dir, "sample-x.wav");
  fs.writeFileSync(ref, `DUR ${dur}`);
  if (words) fs.writeFileSync(path.join(dir, "sample-x.words.json"), JSON.stringify(Array.from({ length: 40 }, (_, k) => mapWords({ i: k, text: `w${k}`, start: k * 0.6, end: k * 0.6 + 0.45 }))));
  return { ref, out: path.join(dir, "out") };
};
const save = async (aud, extra = []) => {
  const { srv, seen } = await mock();
  fs.rmSync(ffLog, { force: true });
  const r = await run(["--save-profile", "Narrator", "--ref", aud.ref, "--out", aud.out, "--language", "en", "--vs-url", `http://127.0.0.1:${srv.address().port}`, ...extra]);
  srv.close(); srv.closeAllConnections();
  const log = fs.existsSync(ffLog) ? fs.readFileSync(ffLog, "utf8") : "";
  return { ...r, seen, log, posts: seen.filter((s) => s.url === "/profiles"), refText: (s) => /name="ref_text"\r\n\r\n([^\r]*)/.exec(s.body)?.[1] };
};
const TOO_LONG = /reference is 25\.04 s; the engine takes at most 20 s\. Cut 3–10 s of clean speech first\./;

await test("A. a 25 s audition with its words.json is saved from a cut that ends on a word, with those words as the ref text", async () => {
  const aud = audition(25.04, true);
  const r = await save(aud);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.posts.length, 1, "one profile POST");
  const text = r.refText(r.posts[0]);
  assert.equal(text, Array.from({ length: 25 }, (_, k) => `w${k}`).join(" "), "the words up to the cut, w0..w24");
  const t = /-t ([\d.]+)/.exec(r.log);
  assert.ok(t && Number(t[1]) <= 15 && Number(t[1]) >= 14.85, `cut at ${t?.[1]} s: after the last word end (14.85), never past 15`);
  assert.equal(fs.readFileSync(path.join(aud.out, "narrator.ref.wav"), "utf8"), "DUR 15");
  assert.ok(!r.seen.some((s) => s.url.startsWith("/v1/audio/transcriptions")), "the cut needs no transcription");
  assert.match(r.out, /Cut +:/);
});
await test("B. a 25 s clip with no words.json still fails with the current message and sends nothing", async () => {
  const r = await save(audition(25.04, false));
  assert.notEqual(r.code, 0);
  assert.match(r.out, TOO_LONG);
  assert.equal(r.seen.length, 0);
});
await test("C. a 25 s audition with a --ref-text of its own is not cut (that text describes the whole clip)", async () => {
  const r = await save(audition(25.04, true), ["--ref-text", "whole clip text"]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, TOO_LONG);
  assert.equal(r.seen.length, 0);
});
await test("D. a words.json with no timed word ending between 3 and 15 s fails and sends nothing", async () => {
  for (const mapWords of [(w) => ({ ...w, start: 16 + w.i, end: 16.4 + w.i }), (w) => ({ ...w, est: true })]) {
    const r = await save(audition(25.04, true, mapWords));
    assert.notEqual(r.code, 0);
    assert.match(r.out, /no timed word ending between 3 and 15 s/);
    assert.equal(r.seen.length, 0);
  }
});
await test("E. an 8 s clip is saved as it is, never cut", async () => {
  const r = await save(audition(8, true), ["--ref-text", "hello"]);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.posts.length, 1);
  assert.equal(r.refText(r.posts[0]), "hello");
  assert.ok(!/ -t /.test(r.log), "no -t passed to ffmpeg");
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`save-profile ok: ${count} cases`);
