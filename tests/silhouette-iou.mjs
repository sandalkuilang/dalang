#!/usr/bin/env node
// node tests/silhouette-iou.mjs — scripts/silhouette_iou.mjs on synthetic pictures (ffmpeg lavfi): the same shape at
// another size and place is IoU 1 (one uniform scale, centred); a shape a quarter narrower is IoU 0.75 with the side named;
// a shape stretched 1.5x wide fails (per-axis scaling would have hidden it) with its aspect difference; a busy
// background gives no clean mask (exit 2, ask for a plain one, never a guess); a list run with an ortho view, the
// overlay written.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/silhouette_iou.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-siou-"));
const img = (name, filter) => {
  const out = path.join(tmp, name);
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", out]);
  assert.equal(r.status, 0, `ffmpeg makes ${name}`);
  return out;
};
const run = (...a) => { const r = spawnSync(process.execPath, [script, ...a], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
try {
  const ref = img("ref.png", "color=c=white:s=400x300,drawbox=x=100:y=50:w=200:h=200:c=black:t=fill");
  const same = img("same.png", "color=c=black:s=300x300,drawbox=x=10:y=10:w=100:h=100:c=white:t=fill");
  const narrow = img("narrow.png", "color=c=black:s=300x300,drawbox=x=10:y=10:w=75:h=100:c=white:t=fill");
  const wide = img("wide.png", "color=c=black:s=300x300,drawbox=x=10:y=10:w=150:h=100:c=white:t=fill");
  const busy = img("busy.png", "testsrc=s=400x300");

  let r = run("--ref", ref, "--render", same, "--name", "side");
  assert.equal(r.code, 0, r.out); assert.match(r.out, /PASS side\s+IoU 1\.000/);

  r = run("--ref", ref, "--render", narrow, "--name", "side", "--json");
  assert.equal(r.code, 1, r.out);
  const v = JSON.parse(r.out).views[0];
  assert.ok(Math.abs(v.iou - 0.75) < 0.02, `a quarter narrower: ${v.iou}`);
  assert.match(v.worst, /(left|right), render missing here/);
  assert.ok(v.aspect > 0.3, `the reference is wider: ${v.aspect}`);

  r = run("--ref", ref, "--render", wide, "--name", "side");
  assert.equal(r.code, 1, r.out); assert.match(r.out, /FAIL side\s+IoU 0\.6\d\d/); assert.match(r.out, /aspect -33/);

  r = run("--ref", busy, "--render", same, "--name", "side");
  assert.equal(r.code, 2, r.out); assert.match(r.out, /plain background/); assert.doesNotMatch(r.out, /FAIL/);

  const overlay = path.join(tmp, "ov.png");
  fs.writeFileSync(path.join(tmp, "views.json"), JSON.stringify([{ name: "top", ref: "ref.png", render: "same.png", ortho: true, overlay: "ov.png" }]));
  r = run("--list", path.join(tmp, "views.json"));
  assert.equal(r.code, 0, r.out); assert.match(r.out, /PASS top\s+IoU 1\.000 \/ 0\.92/);
  assert.ok(fs.statSync(overlay).size > 0, "the overlay is written");
  console.log("silhouette-iou: OK");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
