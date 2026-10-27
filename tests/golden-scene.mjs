#!/usr/bin/env node
// node tests/golden-scene.mjs — the golden scene (examples/golden/scene.js) without a render: it is DOM-free, so Node
// builds it against the real engine and checks its constants, its three stations, the shadow texel size per station
// and that the camera is a pure function of t resting on each station at the frame times. The render is release-time.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-golden-scene-"));
try {
  execFileSync(process.execPath, [path.join(root, "engine", "three", "build.mjs"), path.join(tmp, "assets", "engine")], { stdio: ["ignore", "ignore", "inherit"] });
  fs.mkdirSync(path.join(tmp, "src"));
  const sceneSrc = fs.readFileSync(path.join(root, "examples", "golden", "scene.js"), "utf8");
  fs.writeFileSync(path.join(tmp, "src", "scene.js"), sceneSrc);
  const S = await import(pathToFileURL(path.join(tmp, "src", "scene.js")).href);
  const V = await import(pathToFileURL(path.join(tmp, "assets", "engine", "three-vendor.js")).href);
  const { CONFIG: C } = S;

  // 1. constants
  for (const k of ["width", "height", "fps", "duration", "revision"]) assert.ok(Number.isFinite(C[k]) && C[k] > 0, `CONFIG.${k}`);
  const ft = ["wide", "medium", "macro"].map((s) => C.frameTimes[s]);
  assert.ok(ft.every((t) => Number.isFinite(t) && t >= 0 && t <= C.duration), "frame times inside the clip");
  assert.ok(ft[0] < ft[1] && ft[1] < ft[2], "frame times strictly increasing");

  // 2. the scene builds in Node, three stations, texel size
  const w = S.buildScene({ aspect: C.width / C.height });
  for (const s of ["home", "medium", "macro"]) {
    assert.ok(w.stations[s], `station ${s}`);
    const mm = w.texelMm(s);
    assert.ok(Number.isFinite(mm) && mm > 0 && mm < 5, `texelMm(${s}) = ${mm}`);
  }
  assert.throws(() => w.texelMm("nowhere"), /nowhere/);

  // 3. the camera is a pure function of t, and rests on each station at its frame time
  const cam = new V.THREE.PerspectiveCamera(30, C.width / C.height, 0.01, 100);
  const pose = (t) => { w.at(t, cam); return [cam.position.x, cam.position.y, cam.position.z, cam.fov]; };
  for (const t of [0, 1, 3, 5.2, 6]) assert.ok(pose(t).every(Number.isFinite), `finite pose at ${t}`);
  const a = pose(3);
  assert.deepEqual(pose(3), a, "same t, same pose");
  pose(5.2); // out of order, then back
  assert.deepEqual(pose(3), a, "an out-of-order seek repeats");
  for (const [name, st] of [["wide", "home"], ["medium", "medium"], ["macro", "macro"]]) {
    const p = pose(C.frameTimes[name]), s = w.stations[st];
    const err = Math.abs(p[0] - s.position.x) + Math.abs(p[1] - s.position.y) + Math.abs(p[2] - s.position.z) + Math.abs(p[3] - s.fov);
    assert.ok(err < 1e-6, `${name} frame time rests on station ${st}`);
  }
  const d = w.dof(C.frameTimes.macro), d0 = w.dof(C.frameTimes.wide);
  assert.ok(d.focusPoint.isVector3 && d.bokehScale > d0.bokehScale, "depth of field is strongest at the macro");

  // 4. fixed text, ASCII, non-empty; no clocks or randomness
  const texts = [...S.CAPTIONS.map((c) => c.text), ...Object.values(S.LABELS), S.DIM.text];
  assert.ok(texts.length >= 5 && texts.every((x) => typeof x === "string" && /^[\x20-\x7e]+$/.test(x)), "shown text is non-empty ASCII");
  const html = fs.readFileSync(path.join(root, "examples", "golden", "index.html"), "utf8");
  for (const [n, src] of [["scene.js", sceneSrc], ["index.html", html]]) {
    for (const bad of ["Math.random", "Date.now", "requestAnimationFrame", "performance.now"]) assert.ok(!src.includes(bad), `${n} must not use ${bad}`);
  }
  assert.match(sceneSrc, /\.\.\/assets\/engine\//, "scene.js imports the engine from the project's assets/engine");
  assert.ok(!/\b(document|window)\b/.test(sceneSrc.replace(/\/\/.*$/gm, "")), "scene.js is DOM-free");
  console.log("golden-scene: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
