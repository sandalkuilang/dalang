#!/usr/bin/env node
// node tests/seam-gate.mjs — scripts/seam_gate.mjs measures each Express seam from the groups' own cameras: a held seam
// and a move carried through the cut pass, a jump and a move that turns back fail (exit 3), a move that stops dead at the
// cut is a NOTE, and a folder it cannot read is a WARN (exit 2), never clean.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const S = (f) => fileURLToPath(new URL(`../scripts/${f}`, import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-seam-gate-"));
const node = (...a) => { const r = spawnSync(process.execPath, a, { cwd: tmp, encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
const gate = () => node(S("seam_gate.mjs"), ".");
const file = (f) => path.join(tmp, f);
try {
  assert.equal(gate().code, 2, "no film: WARN, never clean");
  fs.writeFileSync(file("narration.txt"), "{Open here.|hook} {Then this.|middle} {And last.|close}\n");
  assert.equal(node(S("scaffold.mjs"), ".", "--look", "isometric-world", "--groups", "intro:hook,body:middle", "--illustration", "X", "--music", "none").code, 0);
  fs.mkdirSync(file("audio"), { recursive: true });
  fs.writeFileSync(file("audio/beats.js"), 'window.BEATS = { hook: { start: 0, end: 2 }, middle: { start: 2, end: 4 }, close: { start: 4, end: 6 } };\nwindow.WORDS = [];\nwindow.NARRATION_DURATION = 6;\n');
  fs.writeFileSync(file("audio/beats.json"), JSON.stringify({ duration: 6, beats: [{ name: "hook", start: 0, end: 2 }, { name: "middle", start: 2, end: 4 }, { name: "close", start: 4, end: 6 }] }));
  fs.writeFileSync(file("audio/words.json"), "[]");
  const fill = () => ["index", "compositions/intro", "compositions/body"].forEach((f) => node(S("fill_times.mjs"), f.includes("/") ? `src/${f}.tpl.html` : "src/index.tpl.html", `${f}.html`));
  // the camera keys of a group, as a builder writes them
  const camera = (g, keys) => { const p = file(`src/compositions/${g}.tpl.html`), s = fs.readFileSync(p, "utf8"), re = /const CAMERA = \[.*\];/;
    assert.match(s, re); fs.writeFileSync(p, s.replace(re, `const CAMERA = ${keys};`)); };
  const held = '[{ t: 0, ...OPEN }, { t: DUR, ...CLOSE, ease: "inOut" }]';
  fill();
  let r = gate();
  assert.equal(r.code, 0, r.out); assert.match(r.out, /OK {5}intro → body \(2\.0 s\): held on both sides/);

  camera("body", '[{ t: 0, ...OPEN, x: 2 }, { t: DUR, ...CLOSE, ease: "inOut" }]'); fill(); r = gate();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /FAILED intro → body .*jumps 180\.0 px/, "the next group opens away from the last frame");

  camera("intro", '[{ t: 0, ...OPEN, x: -1 }, { t: DUR, ...CLOSE, ease: "linear" }]');
  camera("body", '[{ t: 0, ...OPEN }, { t: DUR, ...CLOSE, x: -2, ease: "linear" }]'); fill(); r = gate();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /FAILED .*turns back at the cut/, "a ping-pong at the cut");

  camera("body", '[{ t: 0, ...OPEN }, { t: DUR, ...CLOSE, x: 2, ease: "linear" }]'); fill(); r = gate();
  assert.equal(r.code, 0, r.out); assert.match(r.out, /one move carried through \(1\.5 → 1\.5 px\/frame\)/);

  camera("body", held); fill(); r = gate();
  assert.equal(r.code, 0, r.out); assert.match(r.out, /NOTE {3}.*intro's move stops dead at the cut/);
  console.log("ok  seam gate: held and carried pass; a jump and a turn back fail; a dead stop is a note; unread is a WARN");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
