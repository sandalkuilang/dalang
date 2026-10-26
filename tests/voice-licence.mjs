#!/usr/bin/env node
// node tests/voice-licence.mjs — the voice that speaks is the voice the user was told about, and the licence gate checks it.
// Part 1: tts_timestamps.mjs against a mock VoiceStudio: without --model it speaks with the backend's active TTS model,
//   prints the model and its licence, and stops (sends nothing) when it cannot read which model is active.
// Part 2: check_assets.mjs on fixture projects: the narration's ASSETS.json licence is checked against the model its
//   take recorded (audio/<name>.response.json _meta), so a non-commercial voice cannot pass under a commercial licence.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const tts = fileURLToPath(new URL("../scripts/tts_timestamps.mjs", import.meta.url));
const check = fileURLToPath(new URL("../scripts/check_assets.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-voice-licence-"));
const narration = path.join(tmp, "n.txt");
fs.writeFileSync(narration, "Hello there. This is a short test.\n"); // under 120 chars: one chunk, no ffmpeg join

// A mock VoiceStudio that records every speech request. The transcription route fails on purpose: the run then
// stops, and what the test asserts is what was sent before that.
function mock(profile) {
  const sent = [];
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/api/settings/performance-profile") {
        const [code, b] = profile;
        res.writeHead(code, { "content-type": "application/json" });
        return res.end(JSON.stringify(b));
      }
      if (req.url === "/v1/audio/speech") {
        sent.push(JSON.parse(body));
        res.writeHead(200, { "content-type": "audio/wav" });
        return res.end("RIFF0000WAVE");
      }
      res.writeHead(500, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok({ srv, sent })));
}
const run = (script, args) => new Promise((ok) => execFile(process.execPath, [script, ...args], { timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

const failures = [];
let count = 0;
const test = async (name, fn) => { count++; try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

// ── Part 1: tts_timestamps.mjs ──────────────────────────────────────────────
const speak = async (profile, extra = []) => {
  const { srv, sent } = await mock(profile);
  const out = path.join(tmp, `out-${count}`);
  const r = await run(tts, ["--input", narration, "--out", out, "--voice", "default", "--instructions", "calm", "--sample", "--align", "off", "--vs-url", `http://127.0.0.1:${srv.address().port}`, ...extra]);
  srv.close(); srv.closeAllConnections();
  return { ...r, sent };
};
await test("A. VoxCPM2 active, no --model: spoken by VoxCPM2, style sent as description", async () => {
  const r = await speak([200, { selections: { tts: { engine: "voxcpm2", model: "voxcpm2" } } }]);
  assert.equal(r.sent[0]?.model, "voxcpm2", r.out);
  assert.ok("description" in r.sent[0] && !("instructions" in r.sent[0]), "style key");
  assert.match(r.out, /Model +: voxcpm2 — Apache-2\.0/);
});
await test("A. OmniVoice active (repo id), no --model: OmniVoice, style as instructions, NC said", async () => {
  const r = await speak([200, { selections: { tts: { model: "k2-fsa/OmniVoice" } } }]);
  assert.equal(r.sent[0]?.model, "omnivoice", r.out);
  assert.ok("instructions" in r.sent[0] && !("description" in r.sent[0]), "style key");
  assert.match(r.out, /Model +: omnivoice — CC-BY-NC-4\.0 — non-commercial/);
});
await test("A. selections without a tts model: the app default, as preflight reads it", async () => {
  const r = await speak([200, { selections: {} }]);
  assert.equal(r.sent[0]?.model, "omnivoice", r.out);
});
for (const [name, profile] of [["profile 500", [500, {}]], ["profile without selections", [200, {}]]]) {
  await test(`B. ${name}: stops, sends nothing, names --model, never says install`, async () => {
    const r = await speak(profile);
    assert.notEqual(r.code, 0);
    assert.equal(r.sent.length, 0, "a speech request was sent");
    assert.match(r.out, /--model/);
    assert.ok(!/\binstall (?!nothing)/i.test(r.out), r.out);
  });
}
await test("C. --model given while VoxCPM2 is active: that model is sent and the line says where it came from", async () => {
  const r = await speak([200, { selections: { tts: { model: "voxcpm2" } } }], ["--model", "omnivoice"]);
  assert.equal(r.sent[0]?.model, "omnivoice", r.out);
  assert.match(r.out, /Model +: omnivoice — CC-BY-NC-4\.0.*--model/);
});

// ── Part 2: check_assets.mjs ────────────────────────────────────────────────
// A project with assets/narration.m4a listed under `licence`, and (when meta is given) the take's response file.
let n = 0;
const project = (licence, meta, { take = "narration.response.json", raw } = {}) => {
  const dir = path.join(tmp, `proj-${n++}`);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
  fs.writeFileSync(path.join(dir, "assets", "narration.m4a"), "");
  fs.writeFileSync(path.join(dir, "ASSETS.json"), JSON.stringify([{ file: "assets/narration.m4a", source: "generated", licence, author: "VoiceStudio", model: "m", prompt: "narration.txt" }]));
  if (raw !== undefined) fs.writeFileSync(path.join(dir, "audio", take), raw);
  else if (meta) fs.writeFileSync(path.join(dir, "audio", take), JSON.stringify({ _meta: meta }));
  return dir;
};
const assets = async (name, dir, flags, code, want) => test(name, async () => {
  const r = await run(check, [dir, ...flags]);
  assert.equal(r.code, code, r.out);
  if (want) assert.match(r.out, want, r.out);
});
const omni = { engine: "voicestudio", model: "omnivoice" };
await assets("D. OmniVoice take listed as Apache-2.0: PROBLEM", project("Apache-2.0", omni), [], 3, /PROBLEM.*OmniVoice/);
await assets("D. OmniVoice take listed as CC-BY-NC-4.0: passes", project("CC-BY-NC-4.0", omni), [], 0, /Result +: OK/);
await assets("D. ...and fails with --commercial", project("CC-BY-NC-4.0", omni), ["--commercial"], 3, /non-commercial/);
await assets("E. VoxCPM2 take listed as Apache-2.0: passes", project("Apache-2.0", { engine: "voicestudio", model: "voxcpm2" }), [], 0);
await assets("E. ...and with --commercial", project("Apache-2.0", { engine: "voicestudio", model: "voxcpm2" }), ["--commercial"], 0);
await assets("F. ElevenLabs free tier listed as Apache-2.0: PROBLEM", project("Apache-2.0", { engine: "elevenlabs", model: "eleven_v4", tier: "free" }), [], 3, /PROBLEM.*ElevenLabs/);
await assets("F. ElevenLabs paid tier listed as Apache-2.0: passes", project("Apache-2.0", { engine: "elevenlabs", model: "eleven_v4", tier: "creator" }), [], 0);
await assets("G. an OmniVoice audition (sample-*) is ignored", project("Apache-2.0", omni, { take: "sample-x.response.json" }), [], 0);
await assets("H. a corrupt response file: PROBLEM, cannot tell which model spoke", project("Apache-2.0", null, { raw: "{not json" }), [], 3, /PROBLEM.*which model spoke/);
await assets("H. a response file without _meta.model or engine: not in the table, ignored", project("Apache-2.0", {}), [], 0);
await assets("I. no audio/ folder at all: unchanged", project("Apache-2.0", null), [], 0);

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`voice licence ok: ${count} cases`);
