#!/usr/bin/env node
// node tests/timing-lint.mjs — scripts/timing_lint.mjs on a film built as shot groups (look-build.md "Parallel build"):
// index.html holds only the hosts (data-composition-src), the cuts inside a group are in compositions/<group>.html with
// times local to that file. The lint follows each host into its file and shifts the group's times by the host's start:
//  - a cut inside a word, or a clip under 1 s, inside a group is a PROBLEM (exit 3), with the file named;
//  - a group whose cuts sit between words passes even where its local times alone would land inside a word;
//  - a file it cannot read, an unfilled {{placeholder}} or a host loop is exit 1, never "OK";
//  - a flat film (no hosts) lints exactly as before.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/timing_lint.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-timing-"));
let n = 0;

// Word i spans i .. i+0.8 s, so every integer second has a 0.2 s gap before it (i+0.8 .. i+1).
const words = Array.from({ length: 12 }, (_, i) => ({ text: `w${i}`, start: i, end: i + 0.8 }));
const clip = (id, start, dur) => `<div id="${id}" class="clip" data-start="${start}" data-duration="${dur}" data-track-index="1"></div>`;
const host = (id, start, dur) => `<div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${start}" data-duration="${dur}" data-track-index="1"></div>`;
const scene = (id, dur, ...inner) => `<template><div id="${id}" data-composition-id="${id}" data-start="0" data-duration="${dur}" data-track-index="1">${inner.join("")}</div></template>`;
// Group a starts at 0 and group b at 3.85 (both cuts between words). b's local 2.14 is inside a word when read alone
// (word 2 = 2.0-2.8) and at 5.99 absolute it is between words 5 and 6.
const project = ({ files, index, plain = false }) => {
  const p = path.join(tmp, `p${n++}`);
  fs.mkdirSync(path.join(p, "compositions"), { recursive: true });
  fs.mkdirSync(path.join(p, "audio"), { recursive: true });
  fs.writeFileSync(path.join(p, "audio", "words.json"), JSON.stringify(words));
  fs.writeFileSync(path.join(p, "index.html"), index ?? `<html><body>${host("a", 0, 3.85)}${host("b", 3.85, 6)}</body></html>`);
  for (const [f, text] of Object.entries(files ?? {})) fs.writeFileSync(path.join(p, "compositions", f), text);
  return p;
};
const lint = (p, ...extra) => { const r = spawnSync(process.execPath, [script, ...extra], { encoding: "utf8", cwd: p }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const groupA = scene("a", 3.85, clip("a-s1", 0, 1.9), clip("a-s2", 1.9, 1.95));
const groupB = (...c) => scene("b", 6, ...c);

try {
  // Legitimate: every cut between words once shifted by the host start; the local 2.14 alone would be inside "w2".
  let r = lint(project({ files: { "a.html": groupA, "b.html": groupB(clip("b-s1", 0, 2.14), clip("b-s2", 2.14, 3.86)) } }));
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /Result\s*: OK/);
  assert.match(r.out, /[1-9]\d* visual clips/);
  console.log("ok  a group's cuts between words (local times shifted by the host start) = OK");

  // Attack 1: a cut inside a word in a group: absolute 3.85 + 2.4 = 6.25, inside "w6" (6.0-6.8). The hosts alone are clean.
  r = lint(project({ files: { "a.html": groupA, "b.html": groupB(clip("b-s1", 0, 2.4), clip("b-s2", 2.4, 3.6)) } }));
  assert.equal(r.code, 3, r.out + r.err);
  assert.match(r.out, /cut at 6\.25 s falls inside "w6"/);
  assert.match(r.out, /compositions\/b\.html/);
  console.log("ok  a mid-word cut inside a group = PROBLEM with the absolute time and the group file");

  // Attack 2: a 0.85 s clip inside a group (both its cuts between words).
  r = lint(project({ files: { "a.html": groupA, "b.html": groupB(clip("b-s1", 0, 2.14), clip("b-flash", 2.14, 0.85), clip("b-s3", 2.99, 3.01)) } }));
  assert.equal(r.code, 3, r.out + r.err);
  assert.match(r.out, /b-flash lasts 0\.85 s/);
  assert.doesNotMatch(r.out, /falls inside/);
  console.log("ok  a clip under 1 s inside a group = PROBLEM");

  // The root of a group file mirrors its host: a short group is reported once, not twice.
  r = lint(project({ index: `<html>${host("a", 0, 3.85)}${host("b", 3.85, 0.95)}</html>`, files: { "a.html": groupA, "b.html": scene("b", 0.95, clip("b-s1", 0, 0.95)) } }));
  assert.equal(r.code, 3);
  assert.equal((r.out.match(/lasts 0\.95 s/g) || []).length, 2, "the host and the clip inside it: two lines, never the root as a third");
  console.log("ok  the scene root is not counted again beside its host");

  // A host inside a group file is followed too, with both offsets added: 3.85 + 2.14 + 0.4 = 6.39, inside "w6".
  r = lint(project({ files: {
    "a.html": groupA,
    "b.html": groupB(clip("b-s1", 0, 2.14), `<div id="c" data-composition-id="c" data-composition-src="compositions/c.html" data-start="2.14" data-duration="3.86" data-track-index="2"></div>`),
    "c.html": scene("c", 3.86, clip("c-s1", 0, 0.4), clip("c-s2", 0.4, 3.46)),
  } }));
  assert.equal(r.code, 3, r.out + r.err);
  assert.match(r.out, /cut at 6\.39 s falls inside "w6"/);
  console.log("ok  a group mounted inside a group adds both host starts");

  // Unknown is never OK: missing file, unfilled placeholder, a host that mounts itself.
  r = lint(project({ files: { "a.html": groupA } }));
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.err, /compositions\/b\.html/);
  assert.doesNotMatch(r.out, /Result\s*: OK/);
  r = lint(project({ files: { "a.html": groupA, "b.html": groupB(clip("b-s1", 0, "{{reveal - first}}")) } }));
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.err, /fill_times/);
  r = lint(project({ files: { "a.html": groupA, "b.html": groupB(clip("b-s1", 0, 2.14), host("b", 2.14, 3.86)) } }));
  assert.equal(r.code, 1, r.out + r.err);
  assert.match(r.err, /mounts itself|loop|cycle/i);
  console.log("ok  a missing group file, an unfilled placeholder and a host loop = exit 1 with the cause, never OK");

  // A flat film (no hosts) is linted as before: clean passes, a mid-word cut fails.
  const flat = (...c) => `<html>${c.join("")}</html>`;
  r = lint(project({ index: flat(clip("s1", 0, 3.9), clip("s2", 3.9, 5.9)) }));
  assert.equal(r.code, 0, r.out + r.err);
  r = lint(project({ index: flat(clip("s1", 0, 3.4), clip("s2", 3.4, 6)) }));
  assert.equal(r.code, 3);
  assert.match(r.out, /cut at 3\.40 s falls inside "w3"/);
  console.log("ok  a flat film (no hosts) lints as before");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
