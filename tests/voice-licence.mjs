#!/usr/bin/env node
// node tests/voice-licence.mjs — the voice that speaks is the voice the user was told about, and the licence gate checks it.
// Part 1: tts_timestamps.mjs against a mock VoiceStudio: without --model it speaks with the backend's active TTS model,
//   prints the model and its licence, and stops (sends nothing) when it cannot read which model is active.
//   The same script against a mock VoiceStudio dialogue (style key per model) and a mock ElevenLabs (the plan tier it records).
// Part 2: check_assets.mjs on fixture projects: the narration's ASSETS.json licence is checked against the model its
//   take recorded (audio/<name>.response.json _meta), so a non-commercial voice cannot pass under a commercial licence,
//   and a take whose voice it cannot identify is a WARN (never silence, never "commercial-OK").
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
      if (req.url === "/v1/audio/voices") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ voices: [{ voice_id: "va", name: "va" }, { voice_id: "vb", name: "vb" }] }));
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
const run = (script, args, env = {}) => new Promise((ok) => execFile(process.execPath, [script, ...args], { timeout: 60000, env: { ...process.env, ...env } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

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

// Dialogue (--voices): every line is sent in its speaker's voice, with its [style] under the key the model reads.
const dialogue = path.join(tmp, "dialogue.txt");
fs.writeFileSync(dialogue, "A: [warm] Hello there.\nB: [dry] Good morning to you.\n");
const talk = async (profile, extra = []) => {
  const { srv, sent } = await mock(profile);
  const out = path.join(tmp, `dlg-${count}`);
  const r = await run(tts, ["--input", dialogue, "--out", out, "--voices", "a=va,b=vb", "--align", "off", "--vs-url", `http://127.0.0.1:${srv.address().port}`, ...extra]);
  srv.close(); srv.closeAllConnections();
  return { ...r, sent };
};
await test("J. dialogue on VoxCPM2: each line's style is sent as description, with its speaker's voice", async () => {
  const r = await talk([200, { selections: { tts: { model: "voxcpm2" } } }]);
  assert.equal(r.sent.length, 2, r.out);
  assert.deepEqual(r.sent.map((b) => [b.model, b.voice, b.description]), [["voxcpm2", "va", "warm"], ["voxcpm2", "vb", "dry"]]);
  assert.ok(r.sent.every((b) => !("instructions" in b)), "instructions sent to VoxCPM2");
});
await test("J. dialogue on OmniVoice: the style stays under instructions", async () => {
  const r = await talk([200, { selections: { tts: { model: "k2-fsa/OmniVoice" } } }], ["--instructions", "calm"]);
  assert.deepEqual(r.sent.map((b) => [b.model, b.instructions]), [["omnivoice", "warm, calm"], ["omnivoice", "dry, calm"]], r.out);
  assert.ok(r.sent.every((b) => !("description" in b)), "description sent to OmniVoice");
});

// ElevenLabs against a mock API: the take records the plan tier it read, and null (never "free", never a paid tier)
// when it cannot read it.
const eleven = (subscription) => {
  const srv = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      if (req.url === "/v1/user/subscription") {
        res.writeHead(subscription[0], { "content-type": "application/json" });
        return res.end(JSON.stringify(subscription[1]));
      }
      if (req.url.startsWith("/v1/text-to-speech/")) {
        const chars = [..."Hello there. This is a short test."];
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ audio_base64: Buffer.from("ID3x").toString("base64"), alignment: { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => (i + 1) * 0.05) } }));
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end("{}");
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
};
const elevenTake = async (subscription) => {
  const srv = await eleven(subscription);
  const out = path.join(tmp, `el-${count}`);
  const r = await run(tts, ["--engine", "elevenlabs", "--input", narration, "--out", out, "--voice-id", "v1", "--sample", "--api-url", `http://127.0.0.1:${srv.address().port}`], { ELEVENLABS_API_KEY: "test-key" });
  srv.close(); srv.closeAllConnections();
  const file = fs.existsSync(out) ? fs.readdirSync(out).find((f) => f.endsWith(".response.json")) : null;
  return { ...r, meta: file ? JSON.parse(fs.readFileSync(path.join(out, file), "utf8"))._meta : null };
};
const modelLine = (out) => out.split("\n").find((l) => /^Model/.test(l)) || "";
await test("K. ElevenLabs free plan: the take records tier free and the line says non-commercial", async () => {
  const r = await elevenTake([200, { tier: "free" }]);
  assert.equal(r.meta?.tier, "free", r.out);
  assert.equal(r.meta.engine, "elevenlabs");
  assert.match(modelLine(r.out), /eleven_v4 \(plan free\) — ElevenLabs free tier.*non-commercial/);
});
await test("K. ElevenLabs paid plan: the take records that tier, and the line is not marked non-commercial", async () => {
  const r = await elevenTake([200, { tier: "creator" }]);
  assert.equal(r.meta?.tier, "creator", r.out);
  assert.match(modelLine(r.out), /eleven_v4 \(plan creator\)/);
  assert.ok(!/non-commercial|unknown/.test(modelLine(r.out)), modelLine(r.out));
});
await test("K. ElevenLabs plan unreadable (401): tier null, the line says the licence is unknown, no 'free' guessed", async () => {
  const r = await elevenTake([401, { detail: "missing_permissions" }]);
  assert.equal(r.meta?.tier, null, r.out);
  assert.match(modelLine(r.out), /eleven_v4 — .*licence unknown/);
});

// ── Part 2: check_assets.mjs ────────────────────────────────────────────────
// A project with assets/narration.m4a listed under `licence`, and (when meta is given) the take's response file.
let n = 0;
const project = (licence, meta, { take = "narration.response.json", raw, noAudio } = {}) => {
  const dir = path.join(tmp, `proj-${n++}`);
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  if (!noAudio) fs.mkdirSync(path.join(dir, "audio"), { recursive: true });
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
await assets("I. no audio/ folder at all (takes live elsewhere): no crash", project("Apache-2.0", null, { noAudio: true }), [], 0, /Result +: OK/);
await test("I. ...and no WARN line either", async () => {
  const r = await run(check, [project("Apache-2.0", null, { noAudio: true })]);
  assert.ok(!/WARN/.test(r.out), r.out);
});

// A voice the table cannot identify is never read as commercial-OK. The exit stays 0 (it is not a proven mismatch),
// but the line is there: the response file, "unknown", and what to check.
const warnOnly = (name, dir, flags = []) => test(name, async () => {
  const r = await run(check, [dir, ...flags]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN +: audio\/narration\.response\.json.*unknown.*(model card|plan)/s, r.out);
  assert.ok(!/PROBLEM/.test(r.out), r.out);
});
const eleven4 = { engine: "elevenlabs", model: "eleven_v4" };
await warnOnly("L. ElevenLabs take whose plan could not be read (tier null) listed as Apache-2.0: WARN", project("Apache-2.0", { ...eleven4, tier: null }));
await warnOnly("L. ...also under --commercial", project("Apache-2.0", { ...eleven4, tier: null }), ["--commercial"]);
await warnOnly("L. ElevenLabs take made before tiers were recorded (no tier field): WARN", project("Apache-2.0", eleven4));
await warnOnly("L. ElevenLabs take on a plan name not in the table: WARN", project("Apache-2.0", { ...eleven4, tier: "mystery-plan" }));
await warnOnly("L. VoiceStudio model not in the table: WARN", project("Apache-2.0", { engine: "voicestudio", model: "some-new-tts" }));
await warnOnly("L. a response file without _meta.model or engine: WARN", project("Apache-2.0", {}));
await test("M. identified voices raise no WARN (OmniVoice NC, VoxCPM2, ElevenLabs paid, the user's own recording)", async () => {
  const cases = [["CC-BY-NC-4.0", omni, []], ["Apache-2.0", { engine: "voicestudio", model: "voxcpm2" }, ["--commercial"]], ["Apache-2.0", { ...eleven4, tier: "creator" }, ["--commercial"]], ["user", { engine: "user-audio", source: "me.wav" }, ["--commercial"]]];
  for (const [licence, meta, flags] of cases) {
    const r = await run(check, [project(licence, meta), ...flags]);
    assert.ok(!/WARN/.test(r.out), `${JSON.stringify(meta)}: ${r.out}`);
    assert.equal(r.code, 0, r.out);
  }
});
await test("N. a non-commercial take with no ASSETS.json row of its name: WARN, the narration cannot be checked", async () => {
  const dir = project("Apache-2.0", omni, { take: "voiceover.response.json" });
  const r = await run(check, [dir]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /WARN +: audio\/voiceover\.response\.json.*OmniVoice.*no ASSETS\.json row/s, r.out);
});
await test("N. ...a commercial take with no row of its name: no WARN", async () => {
  const r = await run(check, [project("Apache-2.0", { engine: "voicestudio", model: "voxcpm2" }, { take: "voiceover.response.json" })]);
  assert.ok(!/WARN/.test(r.out), r.out);
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`voice licence ok: ${count} cases`);
