#!/usr/bin/env node
// node tests/film-gate.mjs — scripts/film_gate.mjs measures an Express film from the groups' own modules: a held seam
// and a move carried through the cut pass, a jump and a turn back fail; a part that floats only while the world moves
// fails; an overlay too short for its words fails; a dead stretch and a dead stop at a cut are NOTEs; a folder it
// cannot read is a WARN (exit 2), never clean.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const S = (f) => fileURLToPath(new URL(`../scripts/${f}`, import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-film-gate-"));
const node = (...a) => { const r = spawnSync(process.execPath, a, { cwd: tmp, encoding: "utf8" }); return { code: r.status, out: r.stdout + r.stderr }; };
const gate = (...a) => node(S("film_gate.mjs"), ".", ...a);
const file = (f) => path.join(tmp, f);
try {
  assert.equal(gate().code, 2, "no film: WARN, never clean");
  fs.writeFileSync(file("narration.txt"), "{Open here.|hook} {Then this.|middle} {And last.|close}\n");
  assert.equal(node(S("scaffold.mjs"), ".", "--look", "isometric-world", "--groups", "intro:hook,body:middle", "--music", "none").code, 0);
  fs.mkdirSync(file("audio"), { recursive: true });
  fs.writeFileSync(file("audio/beats.js"), 'window.BEATS = { hook: { start: 0, end: 2 }, middle: { start: 2, end: 4 }, close: { start: 4, end: 6 } };\nwindow.WORDS = [];\nwindow.NARRATION_DURATION = 6;\n');
  fs.writeFileSync(file("audio/beats.json"), JSON.stringify({ duration: 6, beats: [{ name: "hook", start: 0, end: 2 }, { name: "middle", start: 2, end: 4 }, { name: "close", start: 4, end: 6 }] }));
  fs.writeFileSync(file("audio/words.json"), "[]");
  // a crate on a slab; `lift` raises it
  fs.writeFileSync(file("assets/world.js"), 'export const COLORS = { ground: "#B8C2C6", subject: "#009B7D", ink: "#22333B" };\nexport const WORLD = [\n  { name: "set", at: [0, 0, 0], parts: [{ name: "slab", form: "box", at: [0, 0, -0.3], w: 8, d: 8, h: 0.3, color: COLORS.ground }] },\n  { name: "crate", at: [0, 0, "lift"], parts: [{ name: "crate", form: "box", at: [0, 0, 0], w: 1, d: 1, h: 1, color: COLORS.subject }] },\n];\nexport const VALUES = { lift: 0 };\nexport const PINS = [];\n');
  const fill = () => ["index", "compositions/intro", "compositions/body"].forEach((f) => node(S("fill_times.mjs"), f.includes("/") ? `src/${f}.tpl.html` : "src/index.tpl.html", `${f}.html`));
  const edit = (g, re, to) => { const p = file(`src/compositions/${g}.tpl.html`), s = fs.readFileSync(p, "utf8"); assert.match(s, re); fs.writeFileSync(p, s.replace(re, to)); };
  const camera = (g, keys) => edit(g, /const CAMERA = \[.*\];/, `const CAMERA = ${keys};`);
  fill();
  let r = gate();
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /OK {5}seam intro → body \(2\.0 s\): held on both sides/);
  assert.match(r.out, /NOTE {3}still body 2\.0–5\.0 s: nothing moves/, "a dead stretch is named");
  assert.doesNotMatch(r.out, /motion/, "a crate at rest on the slab is clean");

  camera("body", '[{ t: 0, ...OPEN, x: 2 }, { t: DUR, ...CLOSE, ease: "inOut" }]'); fill(); r = gate();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /FAILED seam intro → body .*jumps 180\.0 px/, "the next group opens away from the last frame");
  assert.match(r.out, /intro ends on \{ x: 0, .*body opens on \{ x: 2, /, "both poses named, for the later group's builder");
  assert.match(gate("--group", "body").out, /FAILED seam intro → body/, "a seam is both sides' line");
  assert.equal(gate("--group", "nope").code, 2, "an unknown group is a WARN");

  camera("intro", '[{ t: 0, ...OPEN, x: -1 }, { t: DUR, ...CLOSE, ease: "linear" }]');
  camera("body", '[{ t: 0, ...OPEN }, { t: DUR, ...CLOSE, x: -2, ease: "linear" }]'); fill(); r = gate();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /FAILED .*turns back at the cut/, "a ping-pong at the cut");

  camera("body", '[{ t: 0, ...OPEN }, { t: DUR, ...CLOSE, x: 2, ease: "linear" }]'); fill(); r = gate();
  assert.equal(r.code, 0, r.out); assert.match(r.out, /one move carried through \(1\.5 → 1\.5 px\/frame\)/);
  assert.doesNotMatch(r.out, /still body/, "a moving camera is not a dead stretch");

  camera("body", '[{ t: 0, ...OPEN }, { t: DUR, ...CLOSE, ease: "inOut" }]'); fill(); r = gate();
  assert.match(r.out, /NOTE {3}seam .*intro's move stops dead at the cut/);

  edit("body", /const values = \(t\) => \(\{ \.\.\.VALUES \}\);/, "const values = (t) => ({ ...VALUES, lift: t > 2 ? 0.5 : 0 });"); fill(); r = gate();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /FAILED motion body 4\.\d s: crate\.crate floats.*only while it moves/, "lifted off its slab mid-film");
  r = gate("--group", "intro"); assert.equal(r.code, 0, r.out); assert.doesNotMatch(r.out, /motion body/, "--group keeps only that group's lines");
  r = gate(); assert.match(r.out.trim().split("\n").at(-2), /^FAILED/, "FAILED lines come last, after the NOTEs");

  edit("body", /lift: t > 2 \? 0\.5 : 0/, "lift: 0");
  edit("intro", /(\/\/ ov\.headline\(.*\n)/, '$1    ov.headline({ text: "One two three four five six", from: 0.5, to: 1.2 });\n'); fill(); r = gate();
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /FAILED reading intro headline "One two three four five six" at 0\.5 s: settled 0\.0 s, 6 word\(s\) need 1\.8 s/);
  // a close-up past the drawing's detail: the crate fills the frame alone
  edit("intro", /(\/\/ ov\.headline\(.*\n)    ov\.headline\(\{ text: "One two three four five six", from: 0\.5, to: 1\.2 \}\);\n/, "$1");
  camera("intro", '[{ t: 0, ...OPEN, k: 900 }, { t: DUR, ...OPEN, k: 900, ease: "linear" }]');
  camera("body", '[{ t: 0, ...OPEN, k: 900 }, { t: DUR, ...OPEN, k: 900, ease: "linear" }]'); fill(); r = gate();
  assert.equal(r.code, 3, r.out); assert.match(r.out, /FAILED detail intro 0\.0–2\.0 s: crate\.crate fill \d+ % of the frame: frame it wider \(k ≤ \d/, "a plain block filling the frame");
  console.log("ok  film gate: seams held/carried pass, jump/turn back fail; floats in motion and rushed labels fail; still stretches and dead stops are notes; a plain close-up fails; unread is a WARN");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
