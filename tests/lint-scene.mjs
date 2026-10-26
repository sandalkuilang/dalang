#!/usr/bin/env node
// node tests/lint-scene.mjs — scripts/lint_scene.mjs against fixture projects: a `//` comment written mid-line that
// swallows the code after it (a member assignment or call, a comma), and what must stay quiet (end-of-line comments,
// `//` in strings, regex literals, block and whole-line comments, an engine copy, .html text outside <script>).
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lint = fileURLToPath(new URL("../scripts/lint_scene.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-lint-scene-"));
const run = (cwd, ...args) => { const r = spawnSync(process.execPath, [lint, ...args], { cwd, encoding: "utf8" }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const put = (proj, rel, lines) => { const f = path.join(proj, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, lines.join("\n") + "\n"); };
const found = (out) => [...out.matchAll(/PROBLEM\s*:\s*(\S+:\d+)/g)].map((m) => m[1].split(path.sep).join("/")).sort();
const msg = (out, loc) => out.split("\n").find((l) => l.includes(loc)) ?? "";

try {
  // 1. A bad project: exactly the swallowing lines are reported, with file:line and the swallowed text.
  const bad = path.join(tmp, "bad");
  put(bad, "assets/scene.js", [
    "const obj = { position: {}, scale: {} }; // end of line, nothing after it",
    "obj.position.y = 0.02; // lift it obj.scale.y = 0.04;",
    'const url = "https://example.org/a//b"; // a URL in a string',
  ]);
  put(bad, "assets/light.js", ["key.shadow.mapSize.set(2048, 2048); // sharper key.shadow.bias = -0.0005;"]);
  put(bad, "assets/shots.js", [
    "export const SHOTS = [",
    "  [0, { cam: 'wide' }, 1] // establishing,",
    "  [2, { cam: 'close' }, 1],",
    "];",
  ]);
  put(bad, "assets/parts.js", ["const lid = makePart(); // the lid parent.add(lid);"]);
  put(bad, "src/index.tpl.html", [
    '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>',
    "<p>Don't stop // this is page text</p>",
    "<script>",
    "  tl.to(box, { x: 1 }); // slide tl.to(box, { y: 2 });",
    "</script>",
  ]);
  put(bad, "assets/engine/.engine.json", ["[]"]);
  put(bad, "assets/engine/core.js", ["a.b = 1; // x c.d = 2;"]);
  const b = run(bad);
  assert.equal(b.code, 1, b.out + b.err);
  assert.deepEqual(found(b.out), ["assets/light.js:1", "assets/parts.js:1", "assets/scene.js:2", "assets/shots.js:2", "src/index.tpl.html:4"]);
  assert.ok(b.out.includes("obj.scale.y = 0.04"), "the swallowed text is shown");
  assert.match(msg(b.out, "assets/shots.js:2"), /comma/);
  console.log("ok  swallowed assignment, call, comma and <script> code flagged; URL, page text, engine copy and end-of-line comment not");

  // 2. A clean project passes.
  const clean = path.join(tmp, "clean");
  put(clean, "assets/clean.js", [
    "const s = 300; // 1 m = 300 px",
    "const u = 'https://example.org/x'; const v = `https://example.org/y`;",
    String.raw`const re = /\/\//g; // two slashes`,
    "/* a.b = 1; // x.y = 2; */ run();",
    "// obj.scale.y = 2;",
    "go(); // it's fine",
    'const w = "a // b";',
    "const frag = `",
    "float a = b; // note c.x = 1.0;",
    "`;",
  ]);
  const c = run(clean);
  assert.equal(c.code, 0, c.out + c.err);
  assert.match(c.out, /Result\s+: OK/);
  assert.ok(!/PROBLEM/.test(c.out));
  console.log("ok  clean project passes (end-of-line prose, strings, regex, block, whole-line and template text)");

  // 3. Nothing to lint is not "OK".
  const empty = path.join(tmp, "empty");
  fs.mkdirSync(empty);
  const e = run(empty);
  assert.equal(e.code, 2, e.out + e.err);
  assert.ok(!/Result\s+: OK/.test(e.out));
  const missing = run(tmp, path.join(tmp, "nowhere"));
  assert.equal(missing.code, 2);
  console.log("ok  an empty or missing folder exits 2, never OK");

  // 4. A file argument and a project argument.
  const f = run(bad, path.join(bad, "assets", "light.js"));
  assert.equal(f.code, 1);
  assert.match(f.out, /light\.js:1/);
  const p = run(tmp, clean);
  assert.equal(p.code, 0, p.out + p.err);
  console.log("ok  a file or a project path as argument");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
