#!/usr/bin/env node
// node tests/blender-parts.mjs — engine/blender: parts.py compiles (python3); the clip template carries its HERO data
// block and no subject words; where Blender is installed (BLENDER or /Applications/Blender.app) the demo fixture builds
// from parts.py into a GLB with the node names a film addresses. No Blender: the build half is a SKIP, never a pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../engine/blender/", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/blender_demo.py", import.meta.url));
for (const f of [path.join(dir, "parts.py"), fixture]) {
  const r = spawnSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", f], { encoding: "utf8" });
  assert.equal(r.status, 0, `${path.basename(f)} parses: ${r.stderr}`);
}
const tpl = fs.readFileSync(path.join(dir, "templates/hero.clip.tpl.html"), "utf8");
const block = /const HERO = \{([\s\S]*?)\n\};/.exec(tpl)?.[1];
assert.ok(block, "the template opens with one HERO data block");
for (const k of ["glb", "duration", "shell", "front", "quarters", "context", "rotors", "hot", "cold", "stations", "beats", "detail", "pins"])
  assert.match(block, new RegExp(`^\\s*${k}:`, "m"), `HERO.${k}`);
for (const k of ["renderer.clear(); composer.render()", "isoFrame", "isoLook", "inkLines", "DepthOfFieldEffect", 'window.__timelines["main"]', "paused: true"])
  assert.ok(tpl.includes(k), `template keeps ${k}`);
// subject words of a removed sample asset, split so a repo grep for them stays clean
const subject = new RegExp(["cond" + "ens", "refri" + "gera", "compres" + "sor", "kompre" + "sor", "konden" + "sor", "kip" + "as", "evapo" + "rat", "\\bHV" + "AC\\b", "\\bA" + "C\\b"].join("|"), "i").exec(tpl);
assert.equal(subject, null, `template is generic (found "${subject?.[0]}")`);

const B = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
if (!fs.existsSync(B)) { console.log("ok  blender parts: parts.py and the template check out\nSKIP   Blender not installed here: the build half is unchecked"); process.exit(0); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-blender-"));
try {
  const r = spawnSync(B, ["-b", "-P", fixture, "--", out], { encoding: "utf8", timeout: 300000 });
  assert.equal(r.status, 0, r.stdout.slice(-800) + r.stderr.slice(-800));
  const tri = Number(/TRIANGLES (\d+)/.exec(r.stdout)?.[1]);
  assert.ok(tri > 5000 && tri < 300000, `triangles within budget: ${tri}`);
  const glb = fs.readFileSync(path.join(out, "blender_demo.glb")), n = glb.readUInt32LE(12), j = JSON.parse(glb.subarray(20, 20 + n).toString());
  const names = new Set(j.nodes.map((x) => x.name));
  for (const want of ["fan.blade", "fan.motor", "housing", "housing.quarter", "bolts", "pipe.out"])
    assert.ok(names.has(want), `node ${want}`);
  const fan = j.nodes.find((x) => x.name === "fan.blade");
  assert.ok(!fan.rotation || fan.rotation.every((v, i) => Math.abs(v - [0, 0, 0, 1][i]) < 1e-6), "the fan exports unrotated, its axle its local +Z");
  console.log(`ok  blender parts: parts.py and the template check out; the demo fixture builds ${tri} triangles with the nodes a film addresses`);
} finally { fs.rmSync(out, { recursive: true, force: true }); }
