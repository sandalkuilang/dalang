#!/usr/bin/env node
// node tests/preflight-mock.mjs — preflight's VoiceStudio checks against a mock backend, one per case, in parallel.
// Each case pins the state preflight must report and the fix its `Voice:` line carries: a busy, unreadable or
// refusing backend is never read as missing, a model selected by bare name is found, odd replies stay WARN.
// The skill-clone check runs against fixture clones and remotes (behind, ahead, diverged, dirty, offline).
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
const run = (args, sealDir = seal, env = {}) => new Promise((ok) => execFile(process.execPath, [preflight, ...args], { env: { ...process.env, AUDIOSEAL_CACHE_DIR: sealDir, ...env }, timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));
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
];
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
fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`preflight mock ok: ${cases.length + 2 + skillCases.length} cases`);
