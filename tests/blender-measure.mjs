#!/usr/bin/env node
// node tests/blender-measure.mjs — engine/blender/measure.py on a generic fixture (tests/fixtures/blender_measure.py):
// readable instances counted from a flat object-ID pass at the film's lens, occlusion (a soft foreground counts half),
// a section cap facing the camera or edge-on (a turned cut found by explore), a state move in px, base-colour contrast
// against the neighbour, a focal name that matches nothing, the potential Φ and its history (a stall after two runs that do not lower it), and
// the explore class of a failing row (a legal variant, a camera decision, or the model). No Blender: SKIP, never a pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/blender_measure.py", import.meta.url));
const mod = fileURLToPath(new URL("../engine/blender/measure.py", import.meta.url));
for (const f of [mod, fixture]) {
  const r = spawnSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", f], { encoding: "utf8" });
  assert.equal(r.status, 0, `${path.basename(f)} parses: ${r.stderr}`);
}
const B = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
if (!fs.existsSync(B)) { console.log("ok  blender measure: parses\nSKIP   Blender not installed here: the measure half is unchecked"); process.exit(0); }

const out = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-measure-"));
const lens = { el: 0, mm: 50, dist: 0.5 };
const spec = {
  asset: "fixture", frame: [1080, 1920], front: [0, -1, 0],
  rows: [
    { shot: 1, side: "left", target: [0, 0, 0], focal: ["part.roller"], states: ["low", "high"], keys: [{ az: 90, ...lens }], need: { instances: 3, minPx: 40, visible: 0.4, move: 60 } },
    { shot: 2, side: "left", target: [0, 0, 0], focal: ["part.roller"], states: ["low"], keys: [{ az: 90, ...lens }], need: { instances: 6, minPx: 40 } },
    { shot: 3, side: "left", target: [0, 0, 0], focal: ["part.roller.2"], cut: true, keys: [{ az: 90, ...lens }] },
    { shot: 4, side: "front", target: [0, 0, 0], focal: ["part.roller.2"], cut: true, keys: [{ az: 0, ...lens }], need: { cap: 0.5 } },
    { shot: 5, side: "left", target: [0, 0, 0], focal: ["part.roller"], soft: ["part.cover"], keys: [{ az: 90, ...lens }], need: { instances: 6, minPx: 40 } },
    { shot: 6, side: "left", target: [0, 0, 0], focal: ["part.rolle"], keys: [{ az: 90, ...lens }] },
  ],
};
const specPath = path.join(out, "hero-shots.json");
fs.writeFileSync(specPath, JSON.stringify(spec));
const run = (env = {}) => {
  const r = spawnSync(B, ["-b", "-P", fixture, "--", out, specPath], { encoding: "utf8", timeout: 300000, env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stdout.slice(-1500) + r.stderr.slice(-800));
  return { stdout: r.stdout, res: JSON.parse(fs.readFileSync(path.join(out, "hero-measure.json"), "utf8")) };
};
try {
  let { stdout, res } = run();
  const row = (shot, state) => res.rows.find((x) => x.shot === shot && (state === undefined || x.state === state));
  const r1 = row(1, "low");
  assert.equal(r1.got.instances, 3, "the cover hides the lower three rollers: " + JSON.stringify(r1.got));
  assert.ok(r1.got.visible > 0.4 && r1.got.visible < 0.7, "about half the focal pixels are covered: " + r1.got.visible);
  assert.ok(row(1, "high").got.move >= 60, "roller 2 moves 20 mm, about 160 px: " + row(1, "high").got.move);
  assert.equal(r1.pass, true);
  assert.equal(row(2).pass, false);
  assert.equal(res.explore["2"].class, "decision", "only another side shows all six: " + JSON.stringify(res.explore["2"]));
  assert.ok(res.explore["2"].pass.some((v) => v.side === "right"), "the right side sees the ring unobstructed");
  assert.ok(row(3).got.cap > 0.5 && row(3).pass, "the cap faces the camera: " + row(3).got.cap);
  assert.ok(row(4).got.cap < 0.1 && !row(4).pass, "the cap is edge-on from the front: " + row(4).got.cap);
  assert.equal(res.explore["4"].class, "legal", "turning the cut fixes it: " + JSON.stringify(res.explore["4"]));
  assert.ok(res.explore["4"].pass.some((v) => v.cut >= 60 && v.cut <= 120), "a cut turned toward the front camera passes: " + JSON.stringify(res.explore["4"]));
  assert.ok(row(5).pass && row(5).got.instances === 6, "a soft cover never hides an instance: " + JSON.stringify(row(5).got));
  assert.ok(row(5).got.visible > 0.6 && row(5).got.visible < 1, "it still counts half: " + row(5).got.visible);
  assert.ok(row(1, "low").got.contrast > 30, "steel rollers on a dark hub stand apart: " + row(1, "low").got.contrast);
  assert.deepEqual(row(6).got.missing, ["part.rolle"], "a focal prefix that matches nothing is named");
  assert.equal(row(6).pass, false);
  assert.ok(res.phi > 0 && res.history.length === 1);
  assert.match(stdout, /MEASURE FAIL/);
  assert.ok(fs.readFileSync(path.join(out, "hero-measure.md"), "utf8").includes("| 2 |"), "the report has a row per shot");
  run(); ({ stdout, res } = run({ DALANG_FIXTURE_FLAT: "1" }));
  assert.ok(row(1, "low").got.contrast < 15 && !row(1, "low").pass, "a hub painted like the rollers fails contrast: " + row(1, "low").got.contrast);
  assert.equal(res.history.length, 3);
  assert.match(stdout, /MEASURE STALL/, "Φ not lowered twice in a row: stop and report");
  console.log(`ok  blender measure: instances, occlusion, cap, move, Φ ${res.phi.toFixed(2)}, history and explore check out`);
} finally { fs.rmSync(out, { recursive: true, force: true }); }
