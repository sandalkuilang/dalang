#!/usr/bin/env node
// node tests/blender-parts.mjs — engine/blender: the part library and the assembly compile (python3), and where
// Blender is installed (BLENDER or /Applications/Blender.app) the assembly builds into a GLB whose nodes a film
// addresses (the fan on its axle, the compressor's parts and section quarters, the colour-coded pipes), under 300k
// triangles. No Blender: the build half is a SKIP, never a pass.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../engine/blender/", import.meta.url));
for (const f of ["parts.py", "assemblies/condensing_unit.py"]) {
  const r = spawnSync("python3", ["-c", "import ast,sys; ast.parse(open(sys.argv[1]).read())", path.join(dir, f)], { encoding: "utf8" });
  assert.equal(r.status, 0, `${f} parses: ${r.stderr}`);
}
const B = process.env.BLENDER || "/Applications/Blender.app/Contents/MacOS/Blender";
if (!fs.existsSync(B)) { console.log("SKIP   Blender not installed here: the build half is unchecked"); process.exit(0); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-blender-"));
try {
  const r = spawnSync(B, ["-b", "-P", path.join(dir, "assemblies/condensing_unit.py"), "--", out], { encoding: "utf8", timeout: 300000 });
  assert.equal(r.status, 0, r.stdout.slice(-800) + r.stderr.slice(-800));
  const tri = Number(/TRIANGLES (\d+)/.exec(r.stdout)?.[1]);
  assert.ok(tri > 50000 && tri < 300000, `a detailed asset within budget: ${tri} triangles`);
  const glb = fs.readFileSync(path.join(out, "condensing_unit.glb")), n = glb.readUInt32LE(12), j = JSON.parse(glb.subarray(20, 20 + n).toString());
  const names = new Set(j.nodes.map((x) => x.name));
  for (const want of ["fan.blade", "fan.motor", "coil.fins", "compressor.shell", "compressor.shell.quarter", "compressor.stator", "compressor.rotor", "compressor.piston", "pipe.discharge", "pipe.suction", "valve.gas", "flare.gas", "casing.front", "grille.front"])
    assert.ok(names.has(want), `node ${want}`);
  const fan = j.nodes.find((x) => x.name === "fan.blade");
  assert.ok(!fan.rotation || fan.rotation.every((v, i) => Math.abs(v - [0, 0, 0, 1][i]) < 1e-6), "the fan exports unrotated, its axle its local +Z");
  console.log(`ok  blender parts: library and assembly compile; the assembly builds ${tri} triangles with the nodes a film addresses`);
} finally { fs.rmSync(out, { recursive: true, force: true }); }
