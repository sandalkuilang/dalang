#!/usr/bin/env node
// node tests/assets.mjs — the asset licence gate (scripts/check_assets.mjs) and the engine manifest it reads.
// A file in assets/ that no row lists fails; a wrong licence fails (unlisted, ND, NC under --commercial, and any
// part of "A AND B"); the files an engine build wrote are listed by its own .engine.json (engine/three/build.mjs),
// so a fresh project passes with no hand-written engine rows, and a manifest that is unreadable, short or long
// fails closed.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const check = fileURLToPath(new URL("../scripts/check_assets.mjs", import.meta.url));
const build = fileURLToPath(new URL("../engine/three/build.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-assets-"));
const run = (script, args, env = {}) => new Promise((ok) => execFile(process.execPath, [script, ...args], { timeout: 180000, env: { ...process.env, ...env } }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

const failures = [];
let count = 0;
const test = async (name, fn) => { count++; try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

// A fresh project folder: assets (name → text), ASSETS.json rows.
const project = (files, rows) => {
  const dir = fs.mkdtempSync(path.join(tmp, "p-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  fs.writeFileSync(path.join(dir, "ASSETS.json"), typeof rows === "string" ? rows : JSON.stringify(rows));
  return dir;
};
const row = (licence, extra = {}) => ({ file: "assets/a.png", source: "https://x", licence, author: "A", ...extra });

await test("A. a file in assets/ that no row lists fails; the listed file passes", async () => {
  const bad = await run(check, [project({ "assets/a.png": "x" }, [])]);
  assert.equal(bad.code, 3, bad.out);
  assert.match(bad.out, /assets\/a\.png: not in ASSETS\.json/);
  const ok = await run(check, [project({ "assets/a.png": "x" }, [row("CC-BY-4.0")])]);
  assert.equal(ok.code, 0, ok.out);
});

await test("B. wrong licences fail, a right one passes", async () => {
  const cases = [
    ["All rights reserved", [], 3, /not on the allowed list/],
    ["CC-BY-ND-4.0", [], 3, /forbids derivatives/],
    ["CC-BY-NC-4.0", ["--commercial"], 3, /non-commercial/],
    ["CC-BY-4.0", [], 0, /OK/],
    ["CC-BY-NC-4.0", [], 0, /OK/],
  ];
  for (const [licence, args, code, re] of cases) {
    const r = await run(check, [project({ "assets/a.png": "x" }, [row(licence)]), ...args]);
    assert.equal(r.code, code, `${licence} ${args}: ${r.out}`);
    assert.match(r.out, re, licence);
  }
});

await test("C. a compound licence is checked part by part", async () => {
  const bad = await run(check, [project({ "assets/a.png": "x" }, [row("MIT AND GPL-3.0")])]);
  assert.equal(bad.code, 3, bad.out);
  assert.match(bad.out, /"GPL-3\.0" is not on the allowed list/);
  const nd = await run(check, [project({ "assets/a.png": "x" }, [row("MIT AND CC-BY-ND-4.0")])]);
  assert.equal(nd.code, 3, nd.out);
  assert.match(nd.out, /forbids derivatives/);
  const nc = await run(check, [project({ "assets/a.png": "x" }, [row("MIT AND CC-BY-NC-4.0")]), "--commercial"]);
  assert.equal(nc.code, 3, nc.out);
  assert.match(nc.out, /non-commercial/);
  for (const licence of ["MIT AND Zlib", "MIT AND Zlib AND ISC AND Apache-2.0", "BSD-3-Clause"]) {
    const ok = await run(check, [project({ "assets/a.png": "x" }, [row(licence)])]);
    assert.equal(ok.code, 0, `${licence}: ${ok.out}`);
  }
});

await test("D. an engine manifest lists the files beside it; nothing else rides along", async () => {
  const manifest = JSON.stringify([{ file: "x.js", source: "s", licence: "MIT" }]);
  const ok = await run(check, [project({ "assets/engine/.engine.json": manifest, "assets/engine/x.js": "1" }, [])]);
  assert.equal(ok.code, 0, ok.out);
  const extra = await run(check, [project({ "assets/engine/.engine.json": manifest, "assets/engine/x.js": "1", "assets/engine/y.js": "2" }, [])]);
  assert.equal(extra.code, 3, extra.out);
  assert.match(extra.out, /assets\/engine\/y\.js: not in ASSETS\.json/);
  const gone = await run(check, [project({ "assets/engine/.engine.json": manifest }, [])]);
  assert.equal(gone.code, 3, gone.out);
  assert.match(gone.out, /file missing/);
  const gpl = await run(check, [project({ "assets/engine/.engine.json": JSON.stringify([{ file: "x.js", source: "s", licence: "MIT AND GPL-3.0" }]), "assets/engine/x.js": "1" }, [])]);
  assert.equal(gpl.code, 3, gpl.out);
  assert.match(gpl.out, /GPL-3\.0/);
});

await test("D. an unreadable engine manifest fails closed", async () => {
  for (const text of ["{oops", '{"file":"x.js"}']) {
    const r = await run(check, [project({ "assets/engine/.engine.json": text, "assets/engine/x.js": "1" }, [])]);
    assert.equal(r.code, 3, r.out);
    assert.match(r.out, /unreadable engine manifest/);
  }
});

await test("E. a real build lists its own files: a fresh project passes with ASSETS.json = []", async () => {
  for (const sub of ["assets/engine", "assets"]) {
    const dir = project({}, []);
    const b = await run(build, [path.join(dir, sub)]);
    assert.equal(b.code, 0, b.out);
    const rows = JSON.parse(fs.readFileSync(path.join(dir, sub, ".engine.json"), "utf8"));
    const vendor = rows.find((r) => r.file === "three-vendor.js");
    assert.ok(vendor, "three-vendor.js row");
    assert.ok(vendor.components.some((c) => c.name === "three"), JSON.stringify(vendor.components));
    assert.match(vendor.licence, /Zlib/);
    assert.ok(rows.some((r) => r.file === "rapier.js" && /Apache-2\.0/.test(r.licence)), "rapier.js row");
    assert.ok(rows.some((r) => r.file === "examples/cat.js" && r.licence === "MIT"), "example row");
    assert.ok(rows.every((r) => !("author" in r)), "no author: the engine stays out of CREDITS.md");
    const r = await run(check, [dir]);
    assert.equal(r.code, 0, `${sub}: ${r.out}`);
    assert.ok(!fs.existsSync(path.join(dir, "CREDITS.md")), "no credit line for engine files");
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log(`assets ok: ${count} cases`);
