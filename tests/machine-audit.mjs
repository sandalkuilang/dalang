#!/usr/bin/env node
// node tests/machine-audit.mjs — scripts/machine_audit.mjs against fixture machines: a stub fails, a true machine
// passes and reports its moving parts, a right-angle bevel pair passes and one with its apexes apart fails, a failed hand check at load is a PROBLEM (exit 1), a stretching link and a machine whose parts never move fail, an unreadable
// module is WARN (exit 2), never OK.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = path.join(root, "scripts/machine_audit.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-machine-audit-"));
const engine = path.join(tmp, "engine");
const built = spawnSync(process.execPath, [path.join(root, "engine/three/build.mjs"), engine], { stdio: "ignore" });
let n = 0;
const proj = (machine) => { const d = path.join(tmp, `p${++n}`); fs.cpSync(engine, path.join(d, "assets"), { recursive: true }); fs.writeFileSync(path.join(d, "assets/machine.js"), machine); return d; };
const run = (d) => { const r = spawnSync(process.execPath, [script, d], { encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
// a neutral slider-crank: crank pin on a circle of r, piston pin on the axis, a rod of L between them
const machine = ({ stretch = 1, still = false } = {}) => `
import { THREE } from "./three-vendor.js";
import { drive } from "./drive.js";
import { rod, gear } from "./parts.js";
const r = 0.04, L = 0.12;
export const MODEL = drive({ input: (t) => t * 360, state: (th) => { const a = th * Math.PI / 180, px = r * Math.sin(a), py = r * Math.cos(a); return { th, pin: [px, py, 0], piston: [0, (py + Math.sqrt(L * L - px * px)) * ${stretch}, 0] }; } });
export const AUDIT = { u: [0, 360], rigid: [{ name: "rod", a: (s) => s.pin, b: (s) => s.piston, len: L }] };
export function build() { const m = new THREE.MeshBasicMaterial(), crank = new THREE.Mesh(gear(12, 0.004, 0.01), m), piston = new THREE.Mesh(rod([0, 0, 0], [0, 0.03, 0], 0.02), m), root = new THREE.Group(); root.add(crank, piston); return { root, parts: { crank, piston } }; }
export function pose(p, s) { ${still ? "" : "p.crank.rotation.z = -s.th * Math.PI / 180; p.piston.position.y = s.piston[1];"} }
`;
// a right-angle bevel pair: both apexes at the origin, the crown turned so its +z is the x shaft
const bevel = ({ apex = 0 } = {}) => `
import { THREE } from "./three-vendor.js";
import { drive } from "./drive.js";
import { bevelGear, bevelAngles } from "./parts.js";
const [da, db] = bevelAngles(20, 40), A = bevelGear({ teeth: 20, module: 0.003, pitchAngle: da, face: 0.015 }), B = bevelGear({ teeth: 40, module: 0.003, pitchAngle: db, face: 0.015 });
export const MODEL = drive({ input: (t) => t * 360, state: (th) => ({ a: th, b: -th / 2 }) });
export const AUDIT = { u: [0, 720], mesh: [{ name: "bevel", a: { angle: (s) => s.a, z: 20, cone: A.userData.bevel, axis: () => [0, 0, 1], apex: () => [0, 0, 0] }, b: { angle: (s) => s.b, z: 40, cone: B.userData.bevel, axis: () => [1, 0, 0], apex: () => [${apex}, 0, 0] } }] };
export function build() { const m = new THREE.MeshBasicMaterial(), pinion = new THREE.Mesh(A, m), crown = new THREE.Mesh(B, m), root = new THREE.Group(); crown.rotation.y = Math.PI / 2; root.add(pinion, crown); return { root, parts: { pinion, crown } }; }
export function pose(p, s) { p.pinion.rotation.z = s.a * Math.PI / 180; p.crown.rotation.z = s.b * Math.PI / 180; }
`;
try {
  assert.equal(built.status, 0, "engine/three/build.mjs installs the engine");
  let r = run(proj(fs.readFileSync(path.join(root, "engine/three/templates/machine.tpl.js"), "utf8")));
  assert.equal(r.code, 1, r.out); assert.match(r.out, /stub/, r.out);
  r = run(proj(machine()));
  assert.equal(r.code, 0, r.out); assert.match(r.out, /2 of 2 parts move/, r.out); assert.match(r.out, /Result\s*: OK/, r.out);
  r = run(proj(machine({ stretch: 1.01 })));
  assert.equal(r.code, 1, r.out); assert.match(r.out, /rod: length/, r.out);
  r = run(proj(machine({ still: true })));
  assert.equal(r.code, 1, r.out); assert.match(r.out, /0 of 2 parts move/, r.out);
  // a hand check that wants 128 and gets 127 throws drive: at load: a PROBLEM (exit 1), not an unreadable module
  r = run(proj(machine().replace("state: (th)", "checks: [{ name: \"stroke\", u: 90, got: () => 127, want: 128 }], state: (th)")));
  assert.equal(r.code, 1, r.out); assert.match(r.out, /PROBLEM.*drive: check "stroke" got 127, want 128/, r.out); assert.doesNotMatch(r.out, /WARN/, r.out);
  r = run(proj("export const = ;"));
  assert.equal(r.code, 2, r.out); assert.match(r.out, /WARN/, r.out); assert.doesNotMatch(r.out, /Result\s*: OK/, r.out);
  // a right-angle bevel pair passes; the same pair with its apexes 1 mm apart is a PROBLEM
  r = run(proj(bevel()));
  assert.equal(r.code, 0, r.out); assert.match(r.out, /2 of 2 parts move/, r.out); assert.match(r.out, /Result\s*: OK/, r.out);
  r = run(proj(bevel({ apex: 0.001 })));
  assert.equal(r.code, 1, r.out); assert.match(r.out, /PROBLEM.*bevel: apex/, r.out);
  console.log("machine-audit: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
