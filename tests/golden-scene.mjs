#!/usr/bin/env node
// node tests/golden-scene.mjs — the golden scene (examples/golden/scene.js) without a render: it is DOM-free, so Node
// builds it against the real engine and checks its constants, its three iso stations, the mm per pixel per station
// and that the camera is a pure function of t resting on each station at the frame times, never tilting. The render is release-time.
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
  const w = S.buildScene({ W: C.width, H: C.height });
  for (const s of ["home", "medium", "macro"]) {
    assert.ok(w.stations[s], `station ${s}`);
    const mm = w.texelMm(s);
    assert.ok(Number.isFinite(mm) && mm > 0 && mm < 5, `texelMm(${s}) = ${mm}`);
  }
  assert.throws(() => w.texelMm("nowhere"), /nowhere/);

  // 3. the camera is a pure function of t, and rests on each station at its frame time
  const E = await import(pathToFileURL(path.join(tmp, "assets", "engine", "camera.js")).href);
  const cam = E.isoCamera(C.width, C.height), dir = new V.THREE.Vector3(), iso = new V.THREE.Vector3(-1, -1, -1).normalize();
  const pose = (t) => { w.at(t, cam); return [cam.position.x, cam.position.y, cam.position.z, cam.zoom]; };
  for (const t of [0, 1, 3, 5.2, 6]) {
    assert.ok(pose(t).every(Number.isFinite), `finite pose at ${t}`);
    assert.ok(cam.getWorldDirection(dir).distanceTo(iso) < 1e-9, `the iso view never tilts (t = ${t})`);
  }
  const a = pose(3);
  assert.deepEqual(pose(3), a, "same t, same pose");
  pose(5.2); // out of order, then back
  assert.deepEqual(pose(3), a, "an out-of-order seek repeats");
  for (const [name, st] of [["wide", "home"], ["medium", "medium"], ["macro", "macro"]]) {
    const p = pose(C.frameTimes[name]), ref = E.place(E.isoCamera(C.width, C.height), w.stations[st]);
    const err = Math.abs(p[0] - ref.position.x) + Math.abs(p[1] - ref.position.y) + Math.abs(p[2] - ref.position.z) + Math.abs(p[3] - ref.zoom);
    assert.ok(err < 1e-6, `${name} frame time rests on station ${st}`);
  }
  assert.ok(w.stations.macro.k > w.stations.medium.k && w.stations.medium.k > w.stations.home.k, "the stations close in: wide, medium, close");
  assert.ok(w.scene.getObjectByName("floor").material.isMeshMatcapMaterial, "the set wears the iso look");

  // 4. fixed text, ASCII, non-empty; no clocks or randomness
  const texts = [...S.CAPTIONS.map((c) => c.text), ...Object.values(S.LABELS), S.DIM.text];
  assert.ok(texts.length >= 5 && texts.every((x) => typeof x === "string" && /^[\x20-\x7e]+$/.test(x)), "shown text is non-empty ASCII");
  const html = fs.readFileSync(path.join(root, "examples", "golden", "index.html"), "utf8");
  for (const [n, src] of [["scene.js", sceneSrc], ["index.html", html]]) {
    for (const bad of ["Math.random", "Date.now", "requestAnimationFrame", "performance.now"]) assert.ok(!src.includes(bad), `${n} must not use ${bad}`);
  }
  // 4b. The layout numbers are wired on the main path: the ready example the builder starts from calls layoutFrame last in
  // its frame function (after the caption and the labels it records), and the build step says to do the same.
  const frameFn = html.slice(html.indexOf("function renderAt"));
  assert.match(html, /import \{[^}]*\blayoutFrame\b[^}]*\} from "\.\/assets\/engine\/type\.js"/, "golden imports layoutFrame");
  assert.match(html, /import \{[^}]*\bheroBox\b[^}]*\} from "\.\/assets\/engine\/camera\.js"/, "golden imports heroBox");
  const at = (re) => frameFn.search(re);
  assert.ok(at(/layoutFrame\(ctx, t, \{[^}]*hero: heroBox\(/) > Math.max(at(/drawCaption\(/), at(/pinLabel\(/)), "layoutFrame comes after drawCaption and pinLabel");
  const lookBuild = fs.readFileSync(path.join(root, "references", "look-build.md"), "utf8");
  const craft = fs.readFileSync(path.join(root, "references", "craft-rules.md"), "utf8");
  assert.match(lookBuild, /`layoutFrame` last \(`craft-rules\.md` §6\)/, "Step 6 item 4 tells the builder to call layoutFrame last");
  assert.match(craft, /layoutFrame\(ctx, t, \{ format, hero: heroBox\(camera, heroObject, W, H\) \}\)[^\n]{0,80}LAST in the frame function/, "craft-rules §6 says how");
  assert.match(sceneSrc, /\.\.\/assets\/engine\//, "scene.js imports the engine from the project's assets/engine");
  assert.ok(!/\b(document|window)\b/.test(sceneSrc.replace(/\/\/.*$/gm, "")), "scene.js is DOM-free");
  console.log("golden-scene: ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
