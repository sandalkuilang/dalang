#!/usr/bin/env node
// node tests/preflight-mock.mjs — preflight's VoiceStudio checks against a mock backend, one per case, in parallel.
// Each case pins the state preflight must report and the fix its `Voice:` line carries: a busy, unreadable or
// refusing backend is never read as missing, a model selected by bare name is found, odd replies stay WARN.
// The skill-clone check runs against fixture clones and remotes (behind, ahead, diverged, dirty, offline, pinned), and
// a git shim fails each of its reads in turn: a failed read is always "could not check".
// The Workspace row (is the videos folder lean?) reads workspace.mjs status against a fixture HOME: not lean is INFO, lean OK,
// unreadable settings WARN.
// `--check-kokoro` checks the Kokoro row against a fake Python: present, package or weights missing, no Python, and
// a crash, odd reply or hang (those are "could not check", never MISSING, and never suggest an install).
// `--check-blender` checks the Blender row against a fake binary: a version is OK, a binary that does not exist is
// MISSING with the consent note, and a crash, odd reply or hang is "could not check", never MISSING, no install offer.
// The `Voices` row names the default voice (a profile named Dalang, or the one voice.json names); an unreadable list never names one.
// `--start` on a port other than 3900 checks VoiceStudio only and opens nothing, so no app or network is needed.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const preflight = fileURLToPath(new URL("../scripts/preflight.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-preflight-")), seal = path.join(tmp, "seal"), noSeal = path.join(tmp, "no-seal");
fs.mkdirSync(path.join(seal, "audioseal"), { recursive: true }); fs.mkdirSync(path.join(noSeal, "audioseal"), { recursive: true });
const w = path.join(seal, "audioseal", "generator.pth"); fs.writeFileSync(w, ""); fs.truncateSync(w, 60e6); // sparse: the size preflight checks, no disk

const models = [{ repo_id: "k2-fsa/OmniVoice", installed: true, incomplete: false }, { repo_id: "deepdml/faster-whisper-large-v3-turbo-ct2", installed: true, incomplete: false }];
const prof = { selections: { tts: { model: "k2-fsa/OmniVoice" }, asr: { engine: "faster-whisper", model: "deepdml/faster-whisper-large-v3-turbo-ct2" } } };
const voices = { voices: [{ voice_id: "alloy", name: "alloy", type: "openai_alias" }, { voice_id: "p1", name: "Mock One", type: "profile", language: "en" }, { voice_id: "p2", name: "A; B = C\nINJECT", type: "profile" }] };
const dalang = { voice_id: "p3", name: "Dalang", type: "profile", language: "id" };
const withDalang = { voices: [...voices.voices, dalang] };
const cfg = (name, text) => { const f = path.join(tmp, name); fs.writeFileSync(f, text); return f; };
const cfgMock = cfg("voice-mock.json", JSON.stringify({ default: "mock one" })), cfgBad = cfg("voice-bad.json", "{not json");
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
const run = (args, sealDir = seal, env = {}) => new Promise((ok) => execFile(process.execPath, [preflight, ...args], { env: { ...process.env, AUDIOSEAL_CACHE_DIR: sealDir, DALANG_VOICE_FILE: path.join(tmp, "no-voice.json"), ...env }, timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
// Text rows: "STATUS item: note" (no padding; VoiceStudio's own rows indented, the note optional).
const parse = (out) => {
  const rows = {}, lines = out.split("\n");
  for (const l of lines) { const m = /^([A-Z]+) +([^:]+?)(?:: (.*))?$/.exec(l); if (m) rows[m[2].trim()] = { status: m[1], note: m[3] ?? "" }; }
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
  ["voice default Dalang", { "/v1/audio/voices": [200, withDalang] }, { Voices: ["INFO", /"Dalang" = p3 \(id\) — default: "Dalang" = p3$/] }, ready],
  ["voice no default without Dalang", {}, { Voices: ["INFO", /= p2$/] }, ready],
  ["voice default, case aside", { "/v1/audio/voices": [200, { voices: [...voices.voices, { ...dalang, name: "dalang" }] }] }, { Voices: ["INFO", /— default: "dalang" = p3$/] }, ready],
  ["voice default from voice.json wins over Dalang", { "/v1/audio/voices": [200, withDalang] }, { Voices: ["INFO", /— default: "Mock One" = p1$/] }, ready, { env: { DALANG_VOICE_FILE: cfgMock } }],
  ["voice.json unreadable names none", { "/v1/audio/voices": [200, withDalang] }, { Voices: ["INFO", /— default voice: none \(.*unreadable.*\)/] }, ready, { env: { DALANG_VOICE_FILE: cfgBad } }],
  ["voice two Dalang profiles name none", { "/v1/audio/voices": [200, { voices: [...withDalang.voices, { ...dalang, voice_id: "p4" }] }] }, { Voices: ["INFO", /— default: none \(2 profiles match "Dalang"\)/] }, ready],
  ["voices 500 never a default", { "/v1/audio/voices": [500, {}] }, { Voices: ["WARN", /^(?!.*default).*rerun preflight/] }, ready, { env: { DALANG_VOICE_FILE: cfgMock } }],
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
  const { out } = await run(["--start", ...(o.eq ? [`--vs-url=${url}`] : ["--vs-url", url])], o.seal, o.env);
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
// The Kokoro row (--check-kokoro): a fake Python answers `<helper> --check` as the real helper would (exit 0 + JSON,
// 5 = package missing, 4 = weights not downloaded). A crash, odd reply or timeout is "could not check", never MISSING.
const fakePy = path.join(tmp, "fake-python");
fs.writeFileSync(fakePy, `#!/usr/bin/env node
const m = process.env.DALANG_TEST_KOKORO;
if (process.env.DALANG_TEST_CALLS) require("fs").appendFileSync(process.env.DALANG_TEST_CALLS, "called\\n");
if (m === "ok") { console.log(JSON.stringify({ ok: true, version: "0.9.4" })); process.exit(0); }
if (m === "ok-noen") { console.log(JSON.stringify({ ok: true, version: "0.9.4", english_model: false })); process.exit(0); }
if (m === "refused") { console.error("refused a download of http://example.invalid/x"); process.exit(6); }
if (m === "nopkg") process.exit(5);
if (m === "noweights") process.exit(4);
if (m === "crash") { console.error("Traceback (most recent call last):\\n  boom"); process.exit(1); }
if (m === "garbage") { console.log("hello"); process.exit(0); }
if (m === "hang") setTimeout(() => {}, 1e9);
`, { mode: 0o755 });
const kokoroCases = [
  ["kokoro present, only en and en-gb, the other engine named", "ok", "OK", /Apache-2\.0.*commercial OK/],
  ["kokoro present, English text model absent", "ok-noen", "OK", /en_core_web_sm.*consent.*--download/],
  ["kokoro check refused a fetch", "refused", "WARN", /could not check.*refused.*rerun/],
  ["kokoro package missing", "nopkg", "MISSING", /Apache-2\.0.*330 MB.*consent/],
  // the consented install is pip kokoro soundfile into that Python: it pulls torch and the rest, so the note states that size too
  ["kokoro package missing states the whole install, not only the weights", "nopkg", "MISSING", /torch.*\d\s?GB.*330 MB.*consent/s],
  ["kokoro weights missing", "noweights", "MISSING", /--download --lang a.*330 MB/],
  // the packages are already there: only the weights are left to download, so no package size is claimed
  ["kokoro weights missing claims no package size", "noweights", "MISSING", /330 MB/, { not: /torch|\d\s?GB/ }],
  ["kokoro no Python", "ok", "MISSING", /consent/, { py: path.join(tmp, "no-such-python") }],
  ["kokoro no Python states the whole install", "ok", "MISSING", /torch.*\d\s?GB.*consent/s, { py: path.join(tmp, "no-such-python") }],
  ["kokoro helper crashes", "crash", "WARN", /could not check.*rerun/],
  ["kokoro odd reply", "garbage", "WARN", /could not check.*rerun/],
  ["kokoro helper hangs", "hang", "WARN", /could not check.*rerun/],
];
for (const [name, mode, status, note, o = {}] of kokoroCases) {
  const { out } = await run(["--check-kokoro"], seal, { DALANG_PYTHON: o.py || fakePy, DALANG_TEST_KOKORO: mode, DALANG_PREFLIGHT_KOKORO_MS: "1500" });
  try {
    const got = parse(out), row = got.rows["Kokoro (voice)"];
    assert.equal(row?.status, status, "status");
    assert.match(row.note, note, "note");
    if (o.not) assert.doesNotMatch(row.note, o.not, "note");
    if (status !== "WARN") assert.match(row.note, /only en and en-gb.*VoiceStudio/s, "the row lists exactly the supported languages and names the other engine");
    assert.doesNotMatch(row.note, /OpenJTalk|\bja\b|japanese|--lang j|\bzh\b|\bhi\b/i, "no other language is listed as supported or offered");
    if (status === "WARN") assert.doesNotMatch(row.note, /pip|--download|MISSING/, "unknown must not read as missing or suggest an install");
    assert.deepEqual(Object.keys(got.rows), ["Kokoro (voice)"], "only the Kokoro row");
  } catch (e) { failures.push(`✗ ${name}: ${e.message}\n${out.trim().split("\n").map((l) => "    " + l).join("\n")}`); }
}
// Kokoro never lives in VoiceStudio's venv (references/voice.md "Setup — Kokoro"). With DALANG_PYTHON unset the row does
// not borrow that venv (it runs nothing there and names no install into it); with DALANG_PYTHON pointed at it, a
// missing package or weights is told to go to a separate Python.
const vsHome = path.join(tmp, "vs-home"), vsPy = path.join(vsHome, "Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python");
fs.mkdirSync(path.dirname(vsPy), { recursive: true });
fs.copyFileSync(fakePy, vsPy);
fs.chmodSync(vsPy, 0o755);
const vsLinkDir = path.join(tmp, "vs-link-bin");
fs.symlinkSync(path.dirname(vsPy), vsLinkDir);
const vsLinked = path.join(vsLinkDir, "python");
for (const [name, py, mode, note] of [
  ["kokoro, DALANG_PYTHON unset: no VoiceStudio venv", "", "nopkg", /DALANG_PYTHON.*separate Python.*torch.*\d\s?GB/s],
  ["kokoro, DALANG_PYTHON unset, kokoro present in the venv is still not used", "", "ok", /DALANG_PYTHON.*separate Python/],
  ["kokoro, DALANG_PYTHON = VoiceStudio's venv, package missing", vsPy, "nopkg", /separate Python.*torch.*\d\s?GB/s],
  ["kokoro, DALANG_PYTHON = VoiceStudio's venv, weights missing", vsPy, "noweights", /separate Python/],
  // the same venv reached through a symlinked folder (realpath of the folder, on both sides): still that venv
  ["kokoro, DALANG_PYTHON = VoiceStudio's venv through a symlinked folder, package missing", vsLinked, "nopkg", /separate Python/],
  ["kokoro, DALANG_PYTHON = VoiceStudio's venv through a symlinked folder, weights missing", vsLinked, "noweights", /separate Python/],
]) {
  const calls = path.join(tmp, `calls-${Math.random().toString(36).slice(2)}`);
  const { out } = await run(["--check-kokoro"], seal, { HOME: vsHome, DALANG_PYTHON: py, DALANG_TEST_KOKORO: mode, DALANG_TEST_CALLS: calls, DALANG_PREFLIGHT_KOKORO_MS: "1500" });
  try {
    const row = parse(out).rows["Kokoro (voice)"];
    assert.equal(row?.status, "MISSING", "status");
    assert.match(row.note, note, "note");
    assert.doesNotMatch(row.note, /VoiceStudio\/runtime|\.venv|pip kokoro|install(?:ed)? in|--download/, "no install or download offer into that venv");
    if (!py) assert.ok(!fs.existsSync(calls), "the VoiceStudio venv's Python was run");
  } catch (e) { failures.push(`✗ ${name}: ${e.message}\n${out.trim().split("\n").map((l) => "    " + l).join("\n")}`); }
}
// A separate Python that DALANG_PYTHON names legitimately reports its own missing package (the case above, "kokoro
// package missing"), with the pip line.
// The skill's own clone: a fixture remote and clone per case; the check fetches, reads counts and never pulls.
const git = (cwd, ...a) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd, stdio: "pipe" }).toString().trim();
let fx = 0;
function fixture() {
  const base = path.join(tmp, `fx${fx++}`), remote = path.join(base, "origin.git"), seed = path.join(base, "seed"), skill = path.join(base, "skill");
  fs.mkdirSync(seed, { recursive: true });
  git(base, "init", "--bare", "-b", "main", remote);
  git(seed, "init", "-b", "main"); fs.writeFileSync(path.join(seed, "a.txt"), "1\n"); git(seed, "add", "."); git(seed, "commit", "-m", "first");
  git(seed, "remote", "add", "origin", remote); git(seed, "push", "-u", "origin", "main");
  git(base, "clone", "-b", "main", remote, skill);
  return { seed, skill, remote };
}
// A remote with two releases (v1.0.0, then v1.1.0 which main also holds); pin(tag, shallow) is an install per the README.
function tagged() {
  const f = fixture();
  git(f.seed, "tag", "v1.0.0"); advance(f.seed, "release work"); git(f.seed, "tag", "v1.1.0"); git(f.seed, "push", "origin", "--tags");
  f.pin = (tag, shallow) => {
    const s = path.join(path.dirname(f.skill), "pinned" + fx++);
    if (shallow) git(path.dirname(f.skill), "clone", "--branch", tag, "--depth", "1", "file://" + f.remote, s);
    else { git(path.dirname(f.skill), "clone", f.remote, s); git(s, "checkout", tag); }
    return { ...f, skill: s };
  };
  return f;
}
const advance = (dir, subject, push = true) => { fs.appendFileSync(path.join(dir, "a.txt"), subject + "\n"); git(dir, "commit", "-am", subject); if (push) git(dir, "push", "origin", "main"); };
const skillCases = [
  ["skill up to date", () => fixture().skill, "OK", /^up to date with origin\/main/],
  ["skill behind 2, never pulls", () => { const f = fixture(); advance(f.seed, "first fix"); advance(f.seed, "second fix"); f.head = git(f.skill, "rev-parse", "HEAD"); return f; }, "WARN", /2 commits behind \(latest: second fix\).*pull --ff-only/],
  ["skill behind 1", () => { const f = fixture(); advance(f.seed, "only fix"); return f.skill; }, "WARN", /1 commit behind \(latest: only fix\)/, /1 commits/],
  // the version in words for the user's first line: the release the clone is on and the newest one on origin/main
  ["skill up to date names its release", () => { const f = fixture(); git(f.seed, "tag", "v1.2.3"); git(f.seed, "push", "origin", "v1.2.3"); git(f.skill, "fetch", "--tags"); return f.skill; }, "OK", /^up to date with origin\/main \(DALANG v1\.2\.3, [0-9a-f]+\)$/],
  ["skill behind names its release and the newest", () => { const f = fixture(); git(f.seed, "tag", "v1.2.3"); git(f.seed, "push", "origin", "v1.2.3"); git(f.skill, "fetch", "--tags"); advance(f.seed, "fix"); git(f.seed, "tag", "v1.2.4"); git(f.seed, "push", "origin", "v1.2.4"); return f.skill; }, "WARN", /1 commit behind \(latest: fix\); DALANG v1\.2\.3, newest release v1\.2\.4/],
  ["skill remote unreachable", () => { const f = fixture(); git(f.skill, "remote", "set-url", "origin", path.join(tmp, "does-not-exist.git")); return f.skill; }, "WARN", /could not check.*rerun/],
  ["skill dirty and behind", () => { const f = fixture(); advance(f.seed, "fix"); fs.appendFileSync(path.join(f.skill, "a.txt"), "local\n"); return f.skill; }, "WARN", /uncommitted/, /pull --ff-only/],
  ["skill diverged", () => { const f = fixture(); advance(f.seed, "remote fix"); advance(f.skill, "local work", false); return f.skill; }, "WARN", /diverged: 1 commit behind and 1 ahead/, /pull --ff-only/],
  ["skill ahead only", () => { const f = fixture(); advance(f.skill, "local work", false); return f.skill; }, "INFO", /1 commit ahead of origin\/main/],
  ["skill not a git clone", () => { const d = path.join(tmp, "plain"); fs.mkdirSync(d); return d; }, "INFO", /not a git clone/],
  ["skill folder inside another repo", () => { const f = fixture(), d = path.join(f.skill, "sub"); fs.mkdirSync(d); return d; }, "INFO", /not a git clone/],
  // Unknown is never missing: a .git that git cannot read, or no git at all, is "could not check", never "clone it again".
  ["skill .git unreadable", () => { const f = fixture(); fs.writeFileSync(path.join(f.skill, ".git", "HEAD"), "garbage\n"); return f.skill; }, "WARN", /could not check.*rerun/, /not a git clone|clone the repo again/],
  ["skill .git is a gitfile to nowhere", () => { const d = path.join(tmp, "gitfile"); fs.mkdirSync(d); fs.writeFileSync(path.join(d, ".git"), "gitdir: " + path.join(tmp, "nowhere") + "\n"); return d; }, "WARN", /could not check.*rerun/, /not a git clone|clone the repo again/],
  ["skill git not on PATH", () => { const f = fixture(), empty = path.join(tmp, "empty-bin"); fs.mkdirSync(empty, { recursive: true }); f.env = { PATH: empty }; return f; }, "WARN", /could not check.*rerun/, /not a git clone|clone the repo again/],
  // A pinned install is detached: no pull from main; the note names the pinned release, the newest one and the README update.
  ["skill pinned (shallow tag clone), newer release", () => { const f = tagged(); return f.pin("v1.0.0", true); }, "WARN", /pinned at v1\.0\.0 \(detached\).*newest release is v1\.1\.0.*git -C \S+ fetch --tags origin && git -C \S+ checkout v1\.1\.0/, /pull --ff-only|could not|not a git clone/],
  ["skill pinned (full clone, checkout of a tag), newer release", () => { const f = tagged(); return f.pin("v1.0.0", false); }, "WARN", /pinned at v1\.0\.0 \(detached\).*newest release is v1\.1\.0.*checkout v1\.1\.0/, /pull --ff-only|could not/],
  ["skill pinned at the newest release", () => { const f = tagged(); return f.pin("v1.1.0", true); }, "OK", /pinned at v1\.1\.0 \(detached\).*newest release/, /pull --ff-only|could not/],
  ["skill pinned, uncommitted changes", () => { const f = tagged(), s = f.pin("v1.0.0", false); fs.appendFileSync(path.join(s.skill, "a.txt"), "local\n"); return s; }, "WARN", /pinned at v1\.0\.0.*uncommitted.*never stash/, /pull/],
  ["skill pinned, remote unreachable", () => { const f = tagged(), s = f.pin("v1.0.0", false); git(s.skill, "remote", "set-url", "origin", path.join(tmp, "does-not-exist.git")); return s; }, "WARN", /could not check.*rerun/, /pull --ff-only|newest release is/],
  ["skill detached at a commit that is no release", () => { const f = tagged(), s = f.pin("v1.0.0", false); advance(f.seed, "later"); git(s.skill, "fetch", "origin"); git(s.skill, "checkout", "--detach", "origin/main"); return s; }, "INFO", /detached at [0-9a-f]+ \(not a release tag\).*newest release is v1\.1\.0/, /pull --ff-only/],
  ["skill on a branch other than main (single-branch clone)", () => { const f = tagged(); git(f.seed, "checkout", "-b", "dev"); git(f.seed, "push", "origin", "dev"); const s = path.join(path.dirname(f.skill), "dev-clone"); git(path.dirname(f.skill), "clone", "--single-branch", "-b", "dev", f.remote, s); return s; }, "INFO", /on branch dev, not main.*no update check/, /could not|pull --ff-only/],
  ["skill shallow clone of main, behind 1", () => { const f = fixture(), s = path.join(path.dirname(f.skill), "shallow"); git(path.dirname(f.skill), "clone", "--depth", "1", "-b", "main", "file://" + f.remote, s); advance(f.seed, "fix"); return s; }, "WARN", /1 commit behind \(latest: fix\).*pull --ff-only/, /could not/],
  // A .git git skips (a corrupt HEAD) inside a repo higher up (a versioned ~/.claude): git answers the parent's
  // toplevel, and the .git here still makes it a clone whose state is unknown, never "not a clone".
  ["skill .git unreadable inside a parent repo", () => { const f = fixture(); git(path.dirname(f.skill), "init", "-q"); fs.writeFileSync(path.join(f.skill, ".git", "HEAD"), "garbage\n"); return f.skill; }, "WARN", /could not check.*rerun/, /not a git clone|clone the repo again/],
  // a plugin copy: no .git, .claude-plugin/plugin.json beside SKILL.md — its version, and the update command; never "not a git clone"
  ["skill plugin copy", () => { const d = path.join(tmp, "plugin-copy"); fs.mkdirSync(path.join(d, ".claude-plugin"), { recursive: true }); fs.writeFileSync(path.join(d, ".claude-plugin", "plugin.json"), '{"name":"dalang","version":"9.9.9"}'); return d; }, "INFO", /^plugin v9\.9\.9 .*claude plugin update dalang/, /not a git clone|pull/],
];
// The class "unknown read as missing", for every git read the check makes: a git that fails that one read (any exit
// or a timeout, here exit 128 from a PATH shim) is "could not check", never a known state (up to date, behind,
// pinned, not a release tag, not a clone). Each read is matched by its argv (" -C <dir> <subcommand> …").
const realGit = execFileSync("sh", ["-c", "command -v git"]).toString().trim(), shim = path.join(tmp, "shim-bin");
fs.mkdirSync(shim); fs.writeFileSync(path.join(shim, "git"), `#!/bin/sh\nif printf ' %s' "$@" ' ' | grep -Eq -- "$DALANG_TEST_GIT_FAIL"; then echo "fatal: injected failure" >&2; exit 128; fi\nexec '${realGit}' "$@"\n`, { mode: 0o755 });
const known = /up to date with|behind \(|pinned at|not a release tag|detached at|not a git clone|clone the repo again|on branch|ahead of/;
const reads = { main: [" rev-parse --show-toplevel ", " rev-parse --abbrev-ref ", " status ", " fetch ", " rev-list ", " log "], pinned: [" rev-parse --show-toplevel ", " rev-parse --abbrev-ref ", " status ", " ls-remote ", " (describe|tag) ", " rev-parse --short "] };
const kinds = [
  ["main, behind 1", "main", () => { const f = fixture(); advance(f.seed, "fix"); return f; }],
  ["pinned at v1.0.0", "pinned", () => tagged().pin("v1.0.0", false)],
  ["detached, no release", "pinned", () => { const f = tagged(), s = f.pin("v1.0.0", false); advance(f.seed, "later"); git(s.skill, "fetch", "origin"); git(s.skill, "checkout", "--detach", "origin/main"); return s; }],
];
for (const [kind, path_, make] of kinds) for (const r of reads[path_])
  skillCases.push([`skill ${kind}, git fails${r.trimEnd()}`, () => ({ ...make(), env: { PATH: shim + path.delimiter + process.env.PATH, DALANG_TEST_GIT_FAIL: r } }), "WARN", /could not check.*rerun/, known]);
// The shim itself changes nothing when no read fails: the same clones keep their known state.
const passthrough = { PATH: shim + path.delimiter + process.env.PATH, DALANG_TEST_GIT_FAIL: " no-such-read " };
skillCases.push(["skill pinned at v1.0.0 through the git shim, no read fails", () => ({ ...tagged().pin("v1.0.0", false), env: passthrough }), "WARN", /pinned at v1\.0\.0 \(detached\).*newest release is v1\.1\.0/, /could not/]);
skillCases.push(["skill detached, no release through the git shim, no read fails", () => ({ ...kinds[2][2](), env: passthrough }), "INFO", /detached at [0-9a-f]{7,} \(not a release tag\)/, /could not/]);
skillCases.push(["skill main behind 1 through the git shim, no read fails", () => ({ ...kinds[0][2](), env: passthrough }), "WARN", /1 commit behind \(latest: fix\)/, /could not/]);
for (const [name, setup, status, note, not] of skillCases) {
  const f = setup(), dir = typeof f === "string" ? f : f.skill;
  const { out } = await run(["--check-skill", "--skill-dir", dir], undefined, f.env);
  try {
    const row = parse(out).rows["DALANG skill"];
    assert.equal(row?.status, status, "status");
    assert.match(row.note, note, "note");
    if (not) assert.doesNotMatch(row.note, not, "note must not say");
    if (f.head) assert.equal(git(dir, "rev-parse", "HEAD"), f.head, "the check never pulls");
  } catch (e) { failures.push(`✗ ${name}: ${e.message}\n${out.trim().split("\n").map((l) => "    " + l).join("\n")}`); }
}
// Two copies at once (a clone and the plugin): one WARN row that names both paths, from either side; it removes nothing.
{
  const home = path.join(tmp, "home-two"), clone = path.join(home, ".claude", "skills", "dalang"), cache = path.join(home, ".claude", "plugins", "cache", "dalang", "dalang", "9.9.9");
  for (const d of [clone, cache]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "SKILL.md"), "---\nname: dalang\n---\n"); }
  const { out } = await run(["--check-skill", "--skill-dir", cache], undefined, { HOME: home });
  try {
    const row = parse(out).rows["DALANG copies"];
    assert.equal(row?.status, "WARN", "status");
    assert.match(row.note, /two copies.*skills\/dalang.*plugins\/cache\/dalang/, "names both");
    assert.ok(fs.existsSync(path.join(clone, "SKILL.md")), "nothing removed");
  } catch (e) { failures.push(`✗ two copies: ${e.message}\n${out}`); }
  const one = await run(["--check-skill", "--skill-dir", cache], undefined, { HOME: path.join(tmp, "home-none") });
  if (parse(one.out).rows["DALANG copies"]) failures.push("✗ one copy: a DALANG copies row appeared");
}
// The Blender row (--check-blender): BLENDER names a fake binary that answers `--version` per DALANG_TEST_BLENDER.
const fakeBlender = path.join(tmp, "fake-blender");
fs.writeFileSync(fakeBlender, `#!/bin/sh
case "$DALANG_TEST_BLENDER" in
  ok) printf 'Blender 4.2.3 LTS\\n\\tbuild date: 2024-10-21\\n' ;;
  crash) echo "Segmentation fault" >&2; exit 139 ;;
  garbage) echo "hello" ;;
  hang) sleep 30 ;;
esac
`, { mode: 0o755 });
const blenderCases = [
  ["blender installed", fakeBlender, "ok", "OK", /Blender 4\.2\.3/],
  ["blender not installed", path.join(tmp, "no-such-blender"), "ok", "MISSING", /Brief Call 0.*about 1 GB.*GPL.*consent/],
  ["blender crashes", fakeBlender, "crash", "WARN", /could not check.*rerun/],
  ["blender odd reply", fakeBlender, "garbage", "WARN", /could not check.*rerun/],
  ["blender hangs", fakeBlender, "hang", "WARN", /could not check.*timeout.*rerun/],
];
for (const [name, bin, mode, status, note] of blenderCases) {
  const { out } = await run(["--check-blender"], seal, { BLENDER: bin, DALANG_TEST_BLENDER: mode, DALANG_PREFLIGHT_BLENDER_MS: "1500" });
  try {
    const got = parse(out), row = got.rows["Blender"];
    assert.equal(row?.status, status, "status");
    assert.match(row.note, note, "note");
    if (status === "WARN") assert.doesNotMatch(row.note, /GB|blender\.org|consent/, "an unread state offers no install");
    assert.deepEqual(Object.keys(got.rows), ["Blender"], "only the Blender row");
  } catch (e) { failures.push(`✗ ${name}: ${e.message}\n${out.trim().split("\n").map((l) => "    " + l).join("\n")}`); }
}
// The Workspace row: a videos folder that loads plugins or MCP servers a video never uses is INFO (asked in Brief Call 0),
// a lean one is OK, and settings preflight cannot read are a WARN to rerun, never "nothing enabled". HOME is a fixture.
{
  const workspaceScript = fileURLToPath(new URL("../scripts/workspace.mjs", import.meta.url));
  const home = path.join(tmp, "ws-home"), dir = path.join(tmp, "ws-videos");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ enabledPlugins: { "hyperframes@hf": true, "deploy-tools@cloud": true } }));
  const env = { HOME: home, CLAUDE_CONFIG_DIR: "" };
  const row = async () => parse((await run(["--check-workspace", "--workspace-dir", dir], undefined, env)).out).rows["Workspace"];
  const check = async (name, want, note, not) => {
    const r = await row();
    try {
      assert.equal(r?.status, want, "status");
      assert.match(r.note, note, "note");
      if (not) assert.doesNotMatch(r.note, not, "note must not say");
    } catch (e) { failures.push(`✗ ${name}: ${e.message}\n    ${JSON.stringify(r)}`); }
  };
  await check("workspace not lean", "INFO", /asked in Brief Call 0.*workspace\.mjs init/);
  execFileSync(process.execPath, [workspaceScript, "init", dir, "--yes"], { env: { ...process.env, ...env } });
  await check("workspace lean after init", "OK", /lean/);
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{");
  await check("workspace unreadable settings", "WARN", /could not read.*rerun/, /^lean|nothing a video never uses is on/);
}
// The full run prints only what needs action, the DALANG row and one "OK: <n> items (…)" line (--all and --json: every
// row), and records for state.mjs whether setup left a Brief Call 0 choice: a voice list or the photo tracer offer is no
// choice, a WARN (unknown) always is. DALANG_TEST_ROWS stands in for the checks.
{
  const row = (item, status, note) => [item, status, note];
  const base = [row("DALANG skill", "OK", "up to date (v9.9.9)"), row("node", "OK", "v99"), row("ffmpeg/ffprobe", "OK", ""), row("VoiceStudio", "OK", "v1"), row("  TTS model", "OK", "m"), row("  ASR (word timing)", "OK", "a"), row("  Voices", "INFO", "saved profiles: x"), row("Photo tracer", "INFO", "vtracer not installed"), row("Kokoro (voice)", "SKIP", "")];
  const full = async (rows, extra = []) => {
    const rec = path.join(tmp, `rec-${Math.random().toString(36).slice(2)}.json`);
    const { out } = await run(extra, seal, { DALANG_TEST_ROWS: JSON.stringify(rows), DALANG_PREFLIGHT_STATE: rec });
    return { out, rec: fs.existsSync(rec) ? JSON.parse(fs.readFileSync(rec, "utf8")) : null };
  };
  const t = async (name, fn) => { try { await fn(); } catch (e) { failures.push(`✗ compact: ${name}: ${e.message}`); } };
  await t("clean setup: action rows only, OK summary, no choice", async () => {
    const { out, rec } = await full(base);
    assert.match(out, /^OK DALANG skill: up to date \(v9\.9\.9\)$/m, "the DALANG row always prints (the skill version)");
    assert.doesNotMatch(out, /^OK node/m);
    assert.match(out, /^INFO {3}Voices: saved profiles: x$/m);
    assert.match(out, /^OK: 5 items \(node, ffmpeg\/ffprobe, VoiceStudio, TTS model, ASR \(word timing\)\)$/m);
    assert.match(out, /^SKIP: 1 items \(Kokoro \(voice\)\)$/m);
    assert.match(out, /^Voice: ready/m);
    assert.equal(rec?.choice, false, "a voice list and the tracer offer are no Call 0 choice");
  });
  await t("a WARN is a choice and prints", async () => {
    const { out, rec } = await full([...base, row("HyperFrames skills", "WARN", "could not check — rerun")]);
    assert.match(out, /^WARN HyperFrames skills: could not check — rerun$/m);
    assert.equal(rec?.choice, true, "unknown is never read as no choice");
  });
  await t("--all and --json print every row", async () => {
    const a = await full(base, ["--all"]);
    assert.match(a.out, /^OK node: v99$/m); assert.doesNotMatch(a.out, /^OK: \d+ items/m);
    const j = await full(base, ["--json"]);
    assert.equal(JSON.parse(j.out.split("\n")[0]).length, base.length);
  });
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`preflight mock ok: ${cases.length + 2 + kokoroCases.length + blenderCases.length + skillCases.length + 3 + 3 + 2} cases`);
