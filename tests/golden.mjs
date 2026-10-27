#!/usr/bin/env node
// node tests/golden.mjs — scripts/golden.mjs without Chrome: the pure functions (version, semver, detail density,
// stillness parse, compare against tolerances) and the measure mode (--frames/--clip) on ffmpeg-made fixtures:
// the folder, metrics.json, sheet, diff against the previous version, FLAGs, --explained, unreadable baselines.
// The full run (engine build + hyperframes render) needs Chrome and is release-time, so it is not run here.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const golden = fileURLToPath(new URL("../scripts/golden.mjs", import.meta.url));
const G = await import(pathToFileURL(golden).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-golden-"));
const run = (args) => new Promise((resolve) => execFile(process.execPath, [golden, ...args], (e, out, err) => resolve({ code: e ? e.code : 0, out, err })));
const has = (cmd, ...a) => !spawnSync(cmd, a, { stdio: "ignore" }).error;
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");

try {
  // 1. topVersion
  assert.equal(G.topVersion("# Changelog\n## [Unreleased]\n- x\n## [1.12.0] - 2026-01-01\n## [1.11.0] - 2025-12-01\n"), "1.12.0");
  assert.equal(G.topVersion("## [Unreleased]\n## [1.0.0-rc.1] - 2026-01-01\n"), "1.0.0-rc.1");
  assert.equal(G.topVersion("## [Unreleased]\nnothing\n"), null);
  // 2. semverCmp
  assert.ok(G.semverCmp("1.10.0", "1.9.0") > 0);
  assert.ok(G.semverCmp("1.0.0", "1.0.0-rc.1") > 0);
  assert.equal(G.semverCmp("1.0.0", "1.0.0"), 0);
  // 3. detailDensity
  const W = 160, H = 96;
  const flat = Buffer.alloc(W * H, 128);
  assert.equal(G.detailDensity(flat, W, H), 0);
  const checker = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) checker[y * W + x] = ((x >> 1) + (y >> 1)) % 2 ? 230 : 20;
  assert.ok(G.detailDensity(checker, W, H) > 10);
  const border = Buffer.alloc(W * H, 128);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 16 || x >= W - 16 || y < 16 || y >= H - 16) border[y * W + x] = ((x >> 1) + (y >> 1)) % 2 ? 230 : 20;
  assert.equal(G.detailDensity(border, W, H), 0, "detail only in the outer border does not count");
  // 4. parseStillness
  const rep = "Stillness: a.mp4\n  Video length        : 6.0 s\n  Total still         : 0.8 s = 12.5%  (target ≤ 100%)\n  Longest still       : 1.4 s  (limit 1000)\n  Still stretches     : 2\n";
  assert.deepEqual(G.parseStillness(rep), { pct: 12.5, longest: 1.4 });
  assert.equal(G.parseStillness("garbage"), null);
  // 5. compare
  const host = { platform: "darwin", arch: "arm64", cpus: 8, model: "M" };
  const base = { size: "1280x720", fps: 30, host, render: { seconds: 40 }, stillness: { pct: 10, longest: 1 },
    detail: { wide: 20, medium: 20, macro: 40 }, shadow: { wide: { texelMm: 1 }, medium: { texelMm: 1 }, macro: { texelMm: 1 } } };
  const mod = (f) => { const c = structuredClone(base); f(c); return c; };
  let c = G.compare(base, structuredClone(base), G.TOL);
  assert.deepEqual([c.flags.length, c.warns.length], [0, 0]);
  c = G.compare(base, mod((x) => { x.render.seconds = 52; }), G.TOL);
  assert.equal(c.flags.length, 1); assert.match(c.flags[0], /render time/);
  c = G.compare(base, mod((x) => { x.render.seconds = 52; x.host = { ...host, model: "Other" }; }), G.TOL);
  assert.deepEqual([c.flags.length, c.warns.length], [0, 1]);
  c = G.compare(base, mod((x) => { x.detail.macro = 32; }), G.TOL);
  assert.equal(c.flags.length, 1); assert.match(c.flags[0], /detail/);
  assert.equal(G.compare(base, mod((x) => { x.detail.macro = 36; }), G.TOL).flags.length, 0);
  c = G.compare(base, mod((x) => { x.shadow.macro.texelMm = 1.3; }), G.TOL);
  assert.equal(c.flags.length, 1); assert.match(c.flags[0], /shadow/);
  assert.equal(G.compare(base, mod((x) => { x.stillness.pct = 16; }), G.TOL).flags.length, 1);
  assert.equal(G.compare(base, mod((x) => { x.stillness.pct = 14; }), G.TOL).flags.length, 0);
  c = G.compare(base, mod((x) => { x.detail.macro = null; }), G.TOL);
  assert.deepEqual([c.flags.length, c.warns.length], [0, 1]); assert.match(c.warns[0], /rerun/);
  c = G.compare(base, mod((x) => { x.size = "640x360"; }), G.TOL);
  assert.deepEqual([c.flags.length, c.warns.length], [0, 1]); assert.match(c.warns[0], /not comparable/);
  console.log("ok  pure functions");

  // 6. usage errors
  let r = await run(["--version", "../x", "--frames", tmp, "--clip", "x.mp4"]);
  assert.equal(r.code, 1); assert.match(r.err, /version/i);
  r = await run(["--version", "1.2"]);
  assert.equal(r.code, 1);
  r = await run(["--version", "1.0.0", "--frames", tmp]);
  assert.equal(r.code, 1); assert.match(r.err, /--clip/);
  console.log("ok  usage errors");

  if (has("ffmpeg", "-version") && has("ffprobe", "-version")) {
    const ff = (...a) => { const p = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...a], { encoding: "utf8" }); assert.equal(p.status, 0, p.stderr); };
    const fx = path.join(tmp, "fx"); fs.mkdirSync(fx);
    ff("-f", "lavfi", "-i", "testsrc2=size=1280x720", "-frames:v", "1", "-q:v", "2", path.join(fx, "sharp.jpg"));
    ff("-f", "lavfi", "-i", "testsrc2=size=1280x720", "-vf", "gblur=sigma=12", "-frames:v", "1", "-q:v", "2", path.join(fx, "soft.jpg"));
    ff("-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=2", "-pix_fmt", "yuv420p", path.join(fx, "clip.mp4"));
    const stations = path.join(fx, "stations.json");
    fs.writeFileSync(stations, JSON.stringify({ wide: { t: 1, texelMm: 1.2 }, medium: { t: 3, texelMm: 1.2 }, macro: { t: 5.2, texelMm: 1.2 } }));
    const frames = (name, macro = "sharp.jpg") => {
      const d = path.join(tmp, name); fs.mkdirSync(d);
      for (const [n, f] of [["wide", "sharp.jpg"], ["medium", "sharp.jpg"], ["macro", macro]]) fs.copyFileSync(path.join(fx, f), path.join(d, `${n}.jpg`));
      return d;
    };
    const args = (out, version, fdir, secs = 40, extra = []) =>
      ["--version", version, "--out", out, "--frames", fdir, "--clip", path.join(fx, "clip.mp4"), "--render-seconds", String(secs), "--stations", stations, ...extra];
    const sharp = frames("f-sharp");
    const soft = frames("f-soft", "soft.jpg");
    const before = fs.readdirSync(tmp).sort();

    // 7. first run
    const out = path.join(tmp, "evals");
    r = await run(args(out, "1.0.0", sharp));
    assert.equal(r.code, 0, r.err + r.out);
    const d0 = path.join(out, "1.0.0");
    for (const f of ["wide.jpg", "medium.jpg", "macro.jpg", "sheet.jpg", "metrics.json", "diff.md"]) assert.ok(fs.existsSync(path.join(d0, f)), f);
    assert.equal(spawnSync("ffprobe", ["-v", "error", path.join(d0, "sheet.jpg")]).status, 0);
    const m = JSON.parse(read(d0, "metrics.json"));
    assert.ok(m.detail.macro > 0); assert.equal(m.version, "1.0.0"); assert.equal(m.size, "1280x720");
    assert.ok(!Object.keys(m).some((k) => /stamp|date|^time$/i.test(k)), "no timestamp key");
    assert.match(read(d0, "diff.md"), /none \(first run\)/);
    assert.match(r.out, /no earlier version/);
    console.log("ok  first run");

    // 8. second run, same inputs; determinism check with --against itself
    r = await run(args(out, "1.0.1", sharp));
    assert.equal(r.code, 0, r.err + r.out);
    assert.ok(fs.existsSync(path.join(out, "1.0.1", "compare.jpg")));
    assert.ok((read(out, "1.0.1", "diff.md").match(/unchanged/g) ?? []).length >= 3);
    assert.doesNotMatch(r.out, /FLAG:/);
    r = await run(args(out, "1.0.1", sharp, 40, ["--against", "1.0.1"]));
    assert.equal(r.code, 0, r.err + r.out);
    assert.doesNotMatch(r.out, /FLAG:/);
    console.log("ok  second run and --against itself");

    // 9. regressions
    const seeded = async (name) => { const o = path.join(tmp, name); const s = await run(args(o, "1.0.0", sharp)); assert.equal(s.code, 0, s.err); return o; };
    let o = await seeded("reg-time");
    r = await run(args(o, "1.1.0", sharp, 52));
    assert.equal(r.code, 3); assert.match(r.out, /FLAG: render time/);
    o = await seeded("reg-detail");
    r = await run(args(o, "1.1.0", soft));
    assert.equal(r.code, 3); assert.match(r.out, /FLAG: detail/);
    o = await seeded("reg-expl");
    r = await run(args(o, "1.1.0", soft, 40, ["--explained", "lens change"]));
    assert.equal(r.code, 0, r.err + r.out); assert.match(r.out, /EXPLAINED:/);
    assert.equal(JSON.parse(read(o, "1.1.0", "metrics.json")).explained, "lens change");
    o = await seeded("reg-host");
    const bm = path.join(o, "1.0.0", "metrics.json");
    const bj = JSON.parse(read(bm)); bj.host.model = "Another"; fs.writeFileSync(bm, JSON.stringify(bj));
    r = await run(args(o, "1.1.0", sharp, 80));
    assert.equal(r.code, 0, r.err + r.out); assert.match(r.out, /WARN: render time not compared/);
    console.log("ok  regressions, explained, other host");

    // 10. unreadable baseline, unknown --against
    o = await seeded("reg-bad");
    fs.writeFileSync(path.join(o, "1.0.0", "metrics.json"), "{");
    r = await run(args(o, "1.1.0", sharp));
    assert.equal(r.code, 3); assert.match(r.out + r.err, /rerun/); assert.doesNotMatch(r.out + r.err, /missing/i);
    r = await run(args(o, "1.1.0", sharp, 40, ["--against", "9.9.9"]));
    assert.equal(r.code, 1); assert.match(r.err, /1\.0\.0/);
    console.log("ok  unreadable baseline, unknown --against");

    // 11. nothing outside --out
    const added = fs.readdirSync(tmp).filter((f) => !before.includes(f));
    assert.deepEqual(added.filter((f) => !/^(evals|reg-)/.test(f)), [], "no stray entry beside the outs");
    assert.deepEqual(fs.readdirSync(out).sort(), ["1.0.0", "1.0.1"]);
    console.log("ok  nothing written outside --out");
  } else console.log("skip  measure mode (needs ffmpeg and ffprobe)");
  console.log("golden: ok");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
