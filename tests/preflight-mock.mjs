#!/usr/bin/env node
// node tests/preflight-mock.mjs — preflight's VoiceStudio checks against a mock backend, one per case, in parallel.
// Each case pins the state preflight must report and the fix its `Voice:` line carries: a busy, unreadable or
// refusing backend is never read as missing, a model selected by bare name is found, odd replies stay WARN.
// `--start` on a port other than 3900 checks VoiceStudio only and opens nothing, so no app or network is needed.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const preflight = fileURLToPath(new URL("../scripts/preflight.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-preflight-")), seal = path.join(tmp, "seal"), noSeal = path.join(tmp, "no-seal");
fs.mkdirSync(path.join(seal, "audioseal"), { recursive: true }); fs.mkdirSync(path.join(noSeal, "audioseal"), { recursive: true });
const w = path.join(seal, "audioseal", "generator.pth"); fs.writeFileSync(w, ""); fs.truncateSync(w, 60e6); // sparse: the size preflight checks, no disk

const models = [{ repo_id: "k2-fsa/OmniVoice", installed: true, incomplete: false }, { repo_id: "deepdml/faster-whisper-large-v3-turbo-ct2", installed: true, incomplete: false }];
const prof = { selections: { tts: { model: "k2-fsa/OmniVoice" }, asr: { engine: "faster-whisper", model: "deepdml/faster-whisper-large-v3-turbo-ct2" } } };
const voices = { voices: [{ voice_id: "alloy", name: "alloy", type: "openai_alias" }, { voice_id: "p1", name: "Mock One", type: "profile", language: "en" }, { voice_id: "p2", name: "A; B = C\nINJECT", type: "profile" }] };
const vox = (installed, model = "voxcpm2") => ({ models: [...models, { repo_id: "openbmb/VoxCPM2", installed, incomplete: false }], profile: { selections: { ...prof.selections, tts: { engine: "voxcpm2", model } } } });

// A mock VoiceStudio: o overrides one route's reply; "hang" never answers, "reset" drops the socket.
function mock(o = {}) {
  const routes = { "/health": [200, { status: "ok", device: "mock", version: "9.9.9" }], "/models": [200, models], "/api/settings/performance-profile": [200, prof], "/v1/audio/voices": [200, voices], ...o };
  const srv = http.createServer((req, res) => {
    const r = routes[req.url];
    if (r === "hang") return;
    if (r === "reset") return req.socket.destroy();
    if (r === "html") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<html>"); }
    const [code, body] = r || [404, {}];
    res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(body));
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}
const freePort = () => new Promise((ok) => { const s = http.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const run = (args, sealDir = seal) => new Promise((ok) => execFile(process.execPath, [preflight, ...args], { env: { ...process.env, AUDIOSEAL_CACHE_DIR: sealDir }, timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
// Text rows: status (11), item (22), note.
const parse = (out) => {
  const rows = {}, lines = out.split("\n");
  for (const l of lines) if (/^[A-Z]+ +/.test(l) && l.length > 34) rows[l.slice(12, 34).trim()] = { status: l.slice(0, 11).trim(), note: l.slice(35) };
  return { rows, voice: (lines.find((l) => l.startsWith("Voice: ")) || "").slice(7), lines };
};

const ready = /^ready \(free, VoiceStudio; OmniVoice weights CC-BY-NC/, unread = /^VoiceStudio state unreadable — could not read model state/;
const cases = [
  ["ok", {}, { VoiceStudio: "OK", "TTS model": ["OK", /CC-BY-NC/], "ASR (word timing)": "OK", "AudioSeal watermark": "OK", Voices: ["INFO", /"Mock One" = p1 \(en\); "A; B = C\\nINJECT" = p2/] }, ready],
  ["busy", { "/health": "hang" }, { VoiceStudio: ["BUSY", /timeout.*never restart/] }, /^VoiceStudio BUSY/],
  ["health 404", { "/health": [404, { detail: "Not Found" }] }, { VoiceStudio: ["CONFLICT", /HTTP 404/] }, /^VoiceStudio CONFLICT/],
  ["health 503", { "/health": [503, { status: "loading" }] }, { VoiceStudio: ["BUSY", /HTTP 503/] }, /^VoiceStudio BUSY/],
  ["health html", { "/health": "html" }, { VoiceStudio: ["CONFLICT", /unexpected reply/] }, /^VoiceStudio CONFLICT/],
  ["health reset", { "/health": "reset" }, { VoiceStudio: "BUSY" }, /^VoiceStudio BUSY/],
  ["models hang", { "/models": "hang" }, { "TTS model": ["WARN", /timeout/], "ASR (word timing)": "WARN", Voices: "INFO" }, unread],
  ["models 500", { "/models": [500, {}] }, { "TTS model": ["WARN", /HTTP 500/], "ASR (word timing)": "WARN" }, unread],
  ["models empty", { "/models": [200, []] }, { "TTS model": ["WARN", /unexpected reply/] }, unread],
  ["profile 500", { "/api/settings/performance-profile": [500, {}] }, { "TTS model": "WARN", "ASR (word timing)": "WARN" }, unread],
  ["profile empty", { "/api/settings/performance-profile": [200, {}] }, { "TTS model": ["WARN", /unexpected reply/] }, unread],
  ["voices hang", { "/v1/audio/voices": "hang" }, { Voices: ["WARN", /timeout.*never assume none exist/] }, ready],
  ["voices 500", { "/v1/audio/voices": [500, {}] }, { Voices: ["WARN", /HTTP 500/] }, ready],
  ["voices array", { "/v1/audio/voices": [200, voices.voices] }, { Voices: ["WARN", /unexpected reply/] }, ready],
  ["voices odd", { "/v1/audio/voices": [200, { voices: [{ voice_id: "x1", name: "X", type: "cloned_voice" }] }] }, { Voices: ["WARN", /unknown shape/] }, ready],
  ["voices none", { "/v1/audio/voices": [200, { voices: [voices.voices[0]] }] }, { Voices: ["INFO", /no saved profile/] }, ready],
  ["asr missing", { "/models": [200, [models[0]]] }, { "ASR (word timing)": "MISSING", "TTS model": "OK" }, /^VoiceStudio not ready — fix ASR \(word timing\)/],
  ["tts bare name", { "/models": [200, vox(true).models], "/api/settings/performance-profile": [200, vox(true).profile] }, { "TTS model": ["OK", /^openbmb\/VoxCPM2$/] }, /^ready \(free, VoiceStudio\)\.$/],
  ["tts bare name, case", { "/models": [200, vox(true, "VOXCPM2").models], "/api/settings/performance-profile": [200, vox(true, "VOXCPM2").profile] }, { "TTS model": ["OK", /openbmb\/VoxCPM2/] }, /^ready \(free, VoiceStudio\)\.$/],
  ["tts bare name, not installed", { "/models": [200, vox(false).models], "/api/settings/performance-profile": [200, vox(false).profile] }, { "TTS model": "MISSING" }, /^VoiceStudio not ready — fix TTS model/],
  ["seal missing", {}, { "AudioSeal watermark": "MISSING", "TTS model": "OK" }, /^ready .*pre-download the AudioSeal watermark/, { seal: noSeal }],
  ["asr and seal missing", { "/models": [200, [models[0]]] }, { "ASR (word timing)": "MISSING" }, /fix ASR \(word timing\) and AudioSeal watermark/, { seal: noSeal }],
  ["--vs-url=<url>", {}, { VoiceStudio: "OK" }, ready, { eq: true }],
  ["remote, auth required", { "/api/settings/performance-profile": [403, { detail: "loopback only" }], "/models": [401, {}], "/v1/audio/voices": [401, {}] }, { VoiceStudio: "OK", "TTS model": ["WARN", /refused the read/], Voices: "WARN" }, /refused the read/, { host: "[::ffff:127.0.0.1]" }],
  ["remote, busy", { "/health": "hang" }, { VoiceStudio: ["UNREACHABLE", /never restart/] }, /^VoiceStudio UNREACHABLE/, { host: "[::ffff:127.0.0.1]" }],
  ["remote, nothing listening", null, { VoiceStudio: ["UNREACHABLE", /nothing listens/] }, /^VoiceStudio UNREACHABLE/, { host: "[::ffff:127.0.0.1]" }],
  ["local, nothing listening", null, { VoiceStudio: ["DOWN", /nothing at/] }, /^VoiceStudio DOWN/],
];

const failures = [];
await Promise.all(cases.map(async ([name, routes, want, voice, o = {}]) => {
  const srv = routes && (await mock(routes)), port = srv ? srv.address().port : await freePort(), url = `http://${o.host || "localhost"}:${port}`;
  const { out } = await run(["--start", ...(o.eq ? [`--vs-url=${url}`] : ["--vs-url", url])], o.seal);
  srv?.close(); srv?.closeAllConnections();
  try {
    const got = parse(out);
    for (const [item, w] of Object.entries(want)) {
      const [status, note] = Array.isArray(w) ? w : [w];
      assert.equal(got.rows[item]?.status, status, `${item} status`);
      if (note) assert.match(got.rows[item].note, note, `${item} note`);
    }
    assert.match(got.voice, voice, "Voice: line");
    assert.ok(!got.lines.some((l) => l.startsWith("INJECT")), "a profile name cannot inject a line");
  } catch (e) { failures.push(`✗ ${name}: ${e.message}\n${out.trim().split("\n").map((l) => "    " + l).join("\n")}`); }
}));
for (const [args, why] of [[["--vs-url"], "missing URL"], [["--vs-url=foo"], "invalid URL"]]) {
  const { code, out } = await run(args);
  if (code !== 2 || !/--vs-url needs a URL/.test(out)) failures.push(`✗ --vs-url with a ${why}: exit ${code}\n    ${out.trim()}`);
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`preflight mock ok: ${cases.length + 2} cases`);
