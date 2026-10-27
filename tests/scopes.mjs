#!/usr/bin/env node
// Scopes as numbers (scripts/scopes.mjs): YMIN/YMAX/YLOW/YHIGH/SATAVG/HUEAVG per cut, bands, PNGs only for a flagged
// cut, WARN + rerun on an unreadable file. Runs only where ffmpeg runs.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "scripts", "scopes.mjs");
const probe = spawnSync("ffmpeg", ["-version"]);
if ((probe.error && probe.error.code === "ENOENT") || probe.status !== 0) {
  console.log("skipped: ffmpeg not found");
  process.exit(0);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-scopes-"));
const cli = (args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
// One 1 s, 10 fps clip per colour, joined into one tv-range film.
const film = (name, colours) => {
  const out = path.join(tmp, name);
  const args = ["-v", "error", "-y"];
  for (const c of colours) args.push("-f", "lavfi", "-i", `color=c=${c}:s=64x64:d=1:r=10`);
  args.push("-filter_complex", `concat=n=${colours.length}:v=1:a=0,format=yuv420p`,
    "-c:v", "libx264", "-color_range", "tv", out);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return out;
};
const row = (out, n) => out.split("\n").find((l) => new RegExp(`^\\s*${n}\\s*\\|`).test(l)) || "";

try {
  const mixed = film("mixed.mp4", ["0x808080", "0x000000", "0xFFFFFF", "0xC04040", "0x40A040"]);

  // 1. Mixed film with the cuts given: black crushed, white clipped, red after white no hue jump, green after red a jump.
  const r = cli([mixed, "--cuts", "0,1,2,3,4"]);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.doesNotMatch(row(r.stdout, 1), /crushed|clipped|hue/);
  assert.match(row(r.stdout, 2), /crushed blacks/);
  assert.match(row(r.stdout, 3), /clipped whites/);
  assert.doesNotMatch(row(r.stdout, 4), /hue jump/);
  assert.match(row(r.stdout, 5), /hue jump/);
  assert.match(r.stdout, /OPEN THE SCOPES for cut\(s\) 2, 3, 5/);
  console.log("ok  flags: crushed blacks, clipped whites, hue jump (not after a grey cut)");

  // 1b. Without --cuts the scene detect finds the grey-black and black-white cuts at 1 s and 2 s (a colour-to-colour cut scores low, so --cuts is given there).
  const auto = cli([mixed]);
  assert.match(auto.stdout, /1\.0-2\.0/, auto.stdout);
  assert.match(auto.stdout, /2\.0-3\.0/, auto.stdout);
  console.log("ok  scene detect finds the cuts");

  // 2. In-band film: OK, exit 0, --png writes nothing.
  const fine = film("fine.mp4", ["0x808080", "0x806040", "0x806848"]);
  const pngDir0 = path.join(tmp, "png0");
  const ok = cli([fine, "--cuts", "0,1,2", "--png", pngDir0]);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /OK/);
  assert.ok(!fs.existsSync(pngDir0) || fs.readdirSync(pngDir0).length === 0);
  console.log("ok  in-band film: OK, no PNG");

  // 3. PNGs only for the flagged cuts (3 cuts x 2 files).
  const pngDir = path.join(tmp, "png");
  const pr = cli([mixed, "--cuts", "0,1,2,3,4", "--png", pngDir]);
  assert.equal(pr.status, 3);
  const files = fs.readdirSync(pngDir);
  assert.equal(files.filter((f) => /^waveform-.*\.png$/.test(f)).length, 3, files.join());
  assert.equal(files.filter((f) => /^vectorscope-.*\.png$/.test(f)).length, 3, files.join());
  console.log("ok  --png: waveform + vectorscope for the 3 flagged cuts only");

  // 4. Unreadable: WARN + rerun, never missing / none / install.
  const bad = path.join(tmp, "x.mp4");
  fs.writeFileSync(bad, "not a video");
  for (const p of [bad, path.join(tmp, "nope.mp4")]) {
    const u = cli([p]);
    assert.equal(u.status, 2, u.stdout + u.stderr);
    const text = u.stdout + u.stderr;
    assert.match(text, /WARN.*rerun/);
    assert.doesNotMatch(text, /missing|none|install/i);
  }
  console.log("ok  unreadable: WARN + rerun, exit 2");

  // 5. Usage errors.
  for (const args of [[], [mixed, "--cuts", "a,b"], [mixed, "--limits", "xx"]]) {
    assert.equal(cli(args).status, 1, args.join(" "));
  }
  console.log("ok  usage errors exit 1");

  // 6. Range switch: pure black is crushed under tv (Y=16), not under pc (floor 0).
  const black = film("black.mp4", ["0x000000"]);
  assert.match(cli([black, "--cuts", "0"]).stdout, /crushed blacks/);
  assert.doesNotMatch(cli([black, "--cuts", "0", "--limits", "pc"]).stdout, /crushed blacks/);
  console.log("ok  --limits pc moves the floor to 0");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
