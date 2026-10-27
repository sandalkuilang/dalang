#!/usr/bin/env node
// Palette measurement (scripts/palette.mjs): OKLCH lightness, dominant colours of a buffer and of a clip, and the
// figure-ground comparison (>= 0.2 OKLCH L separates). The video case runs only where ffmpeg runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "scripts", "palette.mjs");
const measure = path.join(here, "..", "scripts", "measure_reference.sh");
const { oklchL, dominant, spawnProblem, osProblem } = await import(script);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-palette-"));
const cli = (args, env = process.env) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env });
// A PATH holding only the given ffmpeg stand-in (a shell script body, or null for a file that cannot run).
const fakeFfmpeg = (name, body) => {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "ffmpeg"), body ?? "", { mode: body == null ? 0o644 : 0o755 });
  return { ...process.env, PATH: dir };
};
const ffprobe = spawnSync("ffmpeg", ["-version"]);
const hasFfmpeg = !(ffprobe.error && ffprobe.error.code === "ENOENT") && ffprobe.status === 0;

try {
  // 1. Lightness: white 1, black 0, mid grey ~0.6 (OKLab L is perceptual, not linear).
  assert.ok(Math.abs(oklchL([255, 255, 255]) - 1) < 0.002);
  assert.ok(Math.abs(oklchL([0, 0, 0])) < 0.002);
  assert.ok(Math.abs(oklchL([128, 128, 128]) - 0.5999) < 0.002);
  console.log("ok  oklchL: white 1, black 0, mid grey 0.60");

  // 2. Dominant colours of a synthetic 64x64 rgb24 frame: 75 % light warm, 25 % dark; one colour stays one entry.
  const px = 64 * 64, frame = Buffer.alloc(px * 3);
  for (let i = 0; i < px; i++) {
    const c = i < px * 0.75 ? [230, 220, 210] : [40, 40, 40];
    frame.set(c, i * 3);
  }
  const d = dominant(frame);
  assert.equal(d.length, 2);
  assert.deepEqual(d.map((c) => c.hex), ["#e8d8d8", "#282828"]);
  assert.deepEqual(d.map((c) => c.pct), [75, 25]);
  const one = dominant(Buffer.alloc(px * 3, 200));
  assert.equal(one.length, 1);
  assert.equal(one[0].pct, 100);
  console.log("ok  dominant: two colours 75/25 with their bin-centre hexes, one colour at 100 %");

  // 3. --compare: a light and a dark colour separate (exit 0); two lights merge (exit 3); bad input is exit 1.
  let r = cli(["--compare", "#f4f4f4", "#303030"]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /separates/);
  r = cli(["--compare", "#f0f0f0", "#e0dcd4"]);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stdout, /merges/);
  r = cli(["--compare", "nothex", "#fff000"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAILED/);
  console.log("ok  --compare: light vs dark separates (0), light vs light merges (3), bad colour exits 1");

  // 4. A missing file is a failure, never an empty palette; it is the only input state that says "not found".
  r = cli([path.join(tmp, "nope.mp4")]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^FAILED: file not found: .*nope\.mp4/);
  console.log("ok  missing file: exit 1 with FAILED: file not found");

  // 4b. An input that exists but cannot be checked is unknown, never "not found": a symlink loop (ELOOP) and, where
  // permissions bite (not root), a clip inside a folder with no search permission (EACCES). Each names its code and
  // says to check the permissions and rerun.
  const unknownInput = (r, code) => {
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /^FAILED: /);
    assert.match(r.stderr, new RegExp(code));
    assert.match(r.stderr, /permissions.*rerun/s);
    assert.doesNotMatch(r.stderr, /not found/);
    assert.equal(r.stdout, "");
  };
  const loop = path.join(tmp, "loop.mp4");
  fs.symlinkSync(path.join(tmp, "loop2.mp4"), loop);
  fs.symlinkSync(loop, path.join(tmp, "loop2.mp4"));
  unknownInput(cli([loop]), "ELOOP");
  const locked = path.join(tmp, "locked");
  fs.mkdirSync(locked);
  fs.writeFileSync(path.join(locked, "clip.mp4"), "not a video");
  fs.chmodSync(locked, 0o000);
  try {
    if (process.getuid && process.getuid() === 0) console.log("EACCES case skipped: root ignores folder permissions");
    else unknownInput(cli([path.join(locked, "clip.mp4")]), "EACCES");
  } finally {
    fs.chmodSync(locked, 0o755);
  }
  console.log("ok  unreadable input: ELOOP and EACCES name their code and say rerun, never not found");

  // 4c. The class, structurally: every OS error in palette.mjs becomes words in ONE place, osProblem, and only its
  // ENOENT branch says "not found". No existsSync (false on any stat error), and no other code line says "not found".
  const src = fs.readFileSync(script, "utf8");
  assert.doesNotMatch(src, /existsSync/, "existsSync reads every stat error as missing");
  const sayNotFound = src.split("\n").filter((l) => /not found/.test(l) && !/^\s*\/\//.test(l));
  assert.equal(sayNotFound.length, 1, "only osProblem may say not found:\n" + sayNotFound.join("\n"));
  assert.match(sayNotFound[0], /ENOENT/);
  for (const code of ["EACCES", "EPERM", "ELOOP", "EIO", "ENOTDIR", "EMFILE", "ENOBUFS", undefined]) {
    const m = osProblem(code ? { code } : {}, "file", { where: ": x.mp4" });
    assert.doesNotMatch(m, /not found/, String(code));
    assert.match(m, new RegExp(code || "unknown error"));
    assert.match(m, /rerun/);
  }
  assert.equal(osProblem({ code: "ENOENT" }, "file", { where: ": x.mp4" }), "file not found: x.mp4");
  console.log("ok  one choke point: osProblem says not found only for ENOENT; every other code (or none) says rerun");

  // 5. ffmpeg stand-ins: each way ffmpeg can fail is its own FAILED line, and only a real ENOENT says "not found".
  const failed = (r, re, notRe) => {
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /^FAILED: /);
    assert.match(r.stderr, re);
    if (notRe) assert.doesNotMatch(r.stderr, notRe);
    assert.equal(r.stdout, "", "no palette header on a failure");
  };
  const any = path.join(tmp, "any.mp4");
  fs.writeFileSync(any, "not a video");
  failed(cli([any], { ...process.env, PATH: path.join(tmp, "empty-path") }), /ffmpeg not found/);
  failed(cli([any], fakeFfmpeg("noexec", null)), /EACCES.*rerun/s, /not found/);
  failed(cli([any], fakeFfmpeg("fails", "#!/bin/sh\necho 'boom: bad input' >&2\nexit 1\n")), /could not read .*boom: bad input/);
  failed(cli([any], fakeFfmpeg("signal", "#!/bin/sh\nkill -9 $$\n")), /signal.*rerun/s, /not found/);
  failed(cli([any], fakeFfmpeg("silent", "#!/bin/sh\nexit 0\n")), /no frames decoded.*rerun/s);
  assert.match(spawnProblem({ code: "ENOENT" }, 1), /^ffmpeg not found/);
  const big = spawnProblem({ code: "ENOBUFS" }, 0.01);
  assert.match(big, /ENOBUFS/);
  assert.match(big, /larger --every/);
  assert.doesNotMatch(big, /not found/);
  assert.doesNotMatch(spawnProblem({ code: "EMFILE" }, 1), /not found/);
  console.log("ok  ffmpeg failures: absent (ENOENT) says not found; EACCES, a signal, ENOBUFS, EMFILE say rerun; bad input and zero frames exit 1");

  // 6. A real clip: half light, half dark.
  if (!hasFfmpeg) console.log("video cases skipped: ffmpeg did not run (" + (ffprobe.error ? ffprobe.error.code : "status " + ffprobe.status) + ")");
  else {
    const clip = path.join(tmp, "two.mkv");
    const f = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i",
      "color=c=0xf0e4dc:s=128x128:d=2,drawbox=x=0:y=0:w=64:h=128:color=0x202020:t=fill", "-c:v", "ffv1", clip], { encoding: "utf8" });
    assert.equal(f.status, 0, f.stderr);
    r = cli([clip]);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.split("\n");
    const rows = lines.slice(lines.findIndex((l) => l.startsWith("Overall")) + 1)
      .map((l) => /^\s+(#[0-9a-f]{6})\s+([\d.]+) %\s+L ([\d.]+)$/.exec(l)).filter(Boolean)
      .map((m) => ({ hex: m[1], pct: Number(m[2]), L: Number(m[3]) }));
    assert.ok(rows.length >= 2, r.stdout);
    assert.ok(rows[0].pct + rows[1].pct >= 90, r.stdout);
    for (const c of rows.slice(0, 2)) assert.ok(c.pct >= 42 && c.pct <= 58, r.stdout);
    const [light, dark] = rows.slice(0, 2).sort((a, b) => b.L - a.L);
    assert.ok(light.L > 0.85 && dark.L < 0.35, r.stdout);
    console.log("ok  clip: two colours about half each, the light one L > 0.85, the dark one L < 0.35");

    // 7. An existing file that is not a video, and a clip with no video stream, are failures, never an empty palette.
    failed(cli([any]), /could not read .*any\.mp4/);
    const audio = path.join(tmp, "tone.wav");
    const a = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=d=1", audio], { encoding: "utf8" });
    assert.equal(a.status, 0, a.stderr);
    failed(cli([audio]), /could not read .*tone\.wav/);
    console.log("ok  garbage file and audio-only clip: exit 1 with FAILED, no Palette header");

    // 8. measure_reference.sh: the palette lands in the summary; a failing palette does not stop it; no Node still finishes.
    const run = (out, scriptsDir, env) => spawnSync("bash", [path.join(scriptsDir, "measure_reference.sh"), clip, out], { encoding: "utf8", env });
    let m = run(path.join(tmp, "m1"), path.dirname(measure), process.env);
    assert.equal(m.status, 0, m.stderr);
    assert.match(m.stdout, /Overall \(\d+ frames\)/);
    assert.match(fs.readFileSync(path.join(tmp, "m1", "palette.txt"), "utf8"), /^Palette: /);

    const broken = path.join(tmp, "broken-scripts");
    fs.mkdirSync(broken);
    for (const n of ["measure_reference.sh", "stillness.mjs", "loudness.mjs"]) fs.copyFileSync(path.join(path.dirname(measure), n), path.join(broken, n));
    fs.writeFileSync(path.join(broken, "palette.mjs"), "console.error('FAILED: stand-in palette failure');process.exit(1);\n");
    m = run(path.join(tmp, "m2"), broken, process.env);
    assert.equal(m.status, 0, "a failing palette must not stop the measurement: " + m.stderr);
    assert.ok(fs.existsSync(path.join(tmp, "m2", "summary.txt")));
    assert.match(fs.readFileSync(path.join(tmp, "m2", "palette.txt"), "utf8"), /FAILED: stand-in palette failure/);
    assert.match(m.stdout, /palette\.txt: FAILED: stand-in palette failure/, "the summary says the palette failed");
    assert.doesNotMatch(m.stdout, /Overall/);

    const bin = path.join(tmp, "bin-no-node");
    fs.mkdirSync(bin);
    for (const t of ["bash", "env", "ffmpeg", "ffprobe", "awk", "tee", "cat", "head", "ls", "wc", "tr", "grep", "cut", "mkdir", "dirname", "basename", "sed", "sort", "rm", "cp"]) {
      const w = spawnSync("sh", ["-c", `command -v ${t}`], { encoding: "utf8" }).stdout.trim();
      if (w.startsWith("/")) fs.symlinkSync(w, path.join(bin, t));
    }
    m = run(path.join(tmp, "m3"), path.dirname(measure), { ...process.env, PATH: bin });
    assert.equal(m.status, 0, "no Node: still finishes: " + m.stderr);
    assert.ok(fs.existsSync(path.join(tmp, "m3", "summary.txt")));
    assert.ok(!fs.existsSync(path.join(tmp, "m3", "palette.txt")));
    console.log("ok  measure_reference.sh: palette in the summary; a failing palette is reported and non-fatal; no Node still finishes");
  }
  console.log("OK");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
