#!/usr/bin/env node
// node tests/sfx.mjs — the bake's impacts drive the SFX (engine/three/sfx.js, engine/three/sfx.mjs): material pair + weight
// pick a sample tag, dv sets the gain (log law, capped), impacts under 40 ms apart merge into the hardest, quiet ones are
// dropped, every picked sample needs an ASSETS.json row (and passes scripts/check_assets.mjs), unknown stays unplaced.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { impactSounds, audioTags, productionTable, tagFor } from "../engine/three/sfx.js";

const check = fileURLToPath(new URL("../scripts/check_assets.mjs", import.meta.url));
const cli = fileURLToPath(new URL("../engine/three/sfx.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-sfx-"));
const run = (script, args) => new Promise((ok) => execFile(process.execPath, [script, ...args], { timeout: 60000 }, (e, out, err) => ok({ code: e ? e.code : 0, out: out + err })));

const failures = [];
const test = async (name, fn) => { try { await fn(); } catch (e) { failures.push(`✗ ${name}: ${e.message}`); } };

const library = [
  { file: "assets/sfx/knock.wav", tags: ["wood-on-wood light"], duration: 0.45 },
  { file: "assets/sfx/thud.wav", tags: ["wood-on-wood medium", "wood-on-wood heavy"], duration: 0.6 },
  { file: "assets/sfx/clang.wav", tags: ["metal-on-stone heavy"], duration: 1.2 },
  { file: "assets/sfx/click.wav", tags: ["latch-click"], duration: 0.2 },
  { file: "assets/sfx/crash.wav", tags: ["glass-shatter"], duration: 1.5 },
  { file: "assets/sfx/splash.wav", tags: ["water-splash"], duration: 0.8 },
];
const assets = library.map((l) => ({ file: l.file, source: "https://example.org/" + path.basename(l.file), licence: "CC0-1.0" }));
const materials = { book: "wood", crate: "metal", floor: "stone", pane: "glass", plunger: "metal", cape: "cloth" };
const fixture = [{ t: 1.0, name: "book", dv: 0.3 }, { t: 2.0, name: "crate", dv: 3.0, with: "floor" }, { t: 2.015, name: "book", dv: 0.5 }];
const base = { library, assets, materials, against: "wood" };

await test("A. 3 impacts (light, heavy, one 15 ms after the heavy) -> 2 rows, right tags, gains by impulse, times = impacts", () => {
  const r = impactSounds(fixture, base);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows.map((x) => x.tag), ["wood-on-wood light", "metal-on-stone heavy"]);
  assert.deepEqual(r.rows.map((x) => x.start), [1, 2]);
  assert.deepEqual(r.rows.map((x) => x.id), ["sfx-1", "sfx-2"]);
  assert.ok(r.rows[0].volume < r.rows[1].volume && r.rows[1].volume <= 1);
  assert.equal(r.rows[1].merged, 1);
  assert.deepEqual(r.rows.map((x) => x.duration), [0.45, 1.2]);
  assert.equal(r.dropped.length, 1);
  assert.equal(r.dropped[0].why, "merged");
});

await test("B. below the floor and pre-roll are dropped, exactly the floor is kept", () => {
  const r = impactSounds([{ t: 1, name: "book", dv: 0.1 }, { t: -0.2, name: "book", dv: 1 }, { t: 3, name: "book", dv: 0.15 }], base);
  assert.deepEqual(r.rows.map((x) => x.start), [3]);
  assert.deepEqual(r.dropped.map((x) => x.why).sort(), ["below floor", "pre-roll"]);
});

await test("C. every picked sample has an ASSETS.json row that passes check_assets; none without a source and licence", async () => {
  const r = impactSounds(fixture, base);
  const dir = fs.mkdtempSync(path.join(tmp, "p-"));
  fs.mkdirSync(path.join(dir, "assets/sfx"), { recursive: true });
  for (const l of library) fs.writeFileSync(path.join(dir, l.file), "x");
  fs.writeFileSync(path.join(dir, "ASSETS.json"), JSON.stringify(assets));
  const res = await run(check, [dir]);
  assert.equal(res.code, 0, res.out);
  for (const row of r.rows) assert.ok(assets.some((a) => a.file === row.file));
  const none = impactSounds(fixture, { ...base, assets: [] });
  assert.deepEqual(none.rows, []);
  assert.equal(none.problems.length, 2);
  assert.ok(none.problems.every((p) => /ASSETS\.json/.test(p)));
  const nolic = impactSounds(fixture, { ...base, assets: assets.map((a) => ({ ...a, licence: "" })) });
  assert.deepEqual(nolic.rows, []);
});

await test("D. unknown material is unplaced (never guessed); a tag with no sample is listed as missing, no substitute", () => {
  const r = impactSounds([{ t: 1, name: "ghost", dv: 1 }, { t: 2, name: "pane", dv: 1 }], base);
  assert.deepEqual(r.rows, []);
  assert.equal(r.unplaced.length, 1);
  assert.equal(r.unplaced[0].name, "ghost");
  assert.deepEqual(r.missing, ["glass-on-wood medium"]);
  const noPartner = impactSounds([{ t: 1, name: "book", dv: 1 }], { ...base, against: undefined });
  assert.equal(noPartner.unplaced.length, 1);
});

await test("E. merge window: 39 ms merges, 41 ms does not; the hardest wins whatever the order", () => {
  const mk = (gap) => [{ t: 1 + gap, name: "book", dv: 0.3 }, { t: 1, name: "book", dv: 0.9 }];
  const m = impactSounds(mk(0.039), base);
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].dv, 0.9);
  assert.equal(m.rows[0].start, 1);
  assert.equal(impactSounds(mk(0.041), base).rows.length, 2);
});

await test("F. gain law: dv 1.2 -> 0.5, capped, custom cap, monotonic", () => {
  const vol = (dv, o = {}) => impactSounds([{ t: 1, name: "book", dv }], { ...base, ...o }).rows[0].volume;
  assert.equal(vol(1.2), 0.5);
  assert.equal(vol(100), 1);
  assert.equal(vol(100, { cap: 0.8 }), 0.8);
  assert.ok(vol(0.2) < vol(0.5) && vol(0.5) < vol(1) && vol(1) < vol(2));
});

await test("G. tags: soft, brittle, water, sorted pair, unknown", () => {
  assert.equal(tagFor("cloth", "wood", 2), "cloth-soft");
  assert.equal(tagFor("glass", "wood", 3.5), "glass-shatter");
  assert.equal(tagFor("glass", "wood", 1), "glass-on-wood medium");
  assert.equal(tagFor("stone", "metal", 2), "metal-on-stone heavy");
  assert.equal(tagFor("wood", "wood", 0.3), "wood-on-wood light");
  assert.equal(tagFor("water", "wood", 1), "water-splash");
  assert.equal(tagFor("wood", "mystery", 1), null);
});

await test("H. latches and events go through the same function (merge, offset)", () => {
  const l = impactSounds([], { ...base, latches: [{ name: "plunger", t: 0.5 }] });
  assert.equal(l.rows[0].kind, "latch");
  assert.equal(l.rows[0].tag, "latch-click");
  assert.equal(l.rows[0].volume, 0.4);
  const e = impactSounds([], { ...base, offset: 10, events: [{ kind: "fracture", t: 1, material: "glass" }, { kind: "splash", t: 1.02 }] });
  assert.equal(e.rows.length, 1);
  assert.equal(e.rows[0].start, 11);
  assert.equal(impactSounds([], { ...base, offset: 10, latches: [{ name: "plunger", t: 0.5 }] }).rows[0].start, 10.5);
});

await test("I. hostile input throws a clear error", () => {
  assert.throws(() => impactSounds("x", base), /impacts/);
  assert.throws(() => impactSounds([{ t: NaN, name: "book", dv: 1 }], base), /t/);
  assert.throws(() => impactSounds([{ t: 1, name: "book", dv: -1 }], base), /dv/);
  assert.throws(() => impactSounds([], { ...base, merge: 0 }), /merge/);
  assert.throws(() => impactSounds([], { ...base, library: {} }), /library/);
});

await test("J. audioTags and productionTable", () => {
  const r = impactSounds(fixture, base);
  const html = audioTags(r.rows);
  assert.match(html, /data-start="1\.000"/);
  assert.match(html, /data-duration="0\.45"/);
  assert.match(html, /data-volume="/);
  assert.match(html, /<!-- bake t=1\.000 dv=0\.30 book wood-on-wood light -->/);
  assert.ok(!/data-track-index/.test(html));
  assert.match(audioTags(r.rows, { track: 7 }), /data-track-index="7"/);
  const t = productionTable(r);
  assert.equal(t.split("\n").filter((x) => /^\| [\d.]+ \|/.test(x)).length, 2);
  assert.ok(!/Missing samples/.test(t));
  assert.match(productionTable(impactSounds([{ t: 1, name: "pane", dv: 1 }], base)), /Missing samples: glass-on-wood medium/);
});

await test("K. CLI: bake file + plan -> audio rows (exit 0); missing sample exit 1; truncated bake exit 2", async () => {
  const dir = fs.mkdtempSync(path.join(tmp, "cli-"));
  const bake = (impacts) => {
    let j = JSON.stringify({ format: 1, hash: "x", n: 0, dt: 0.002, counts: [], series: [], impacts, report: { latches: [] } });
    while ((8 + Buffer.byteLength(j)) % 4) j += " ";
    const h = Buffer.alloc(8); h.write("DLB1"); h.writeUInt32LE(Buffer.byteLength(j), 4);
    return Buffer.concat([h, Buffer.from(j)]);
  };
  fs.writeFileSync(path.join(dir, "ASSETS.json"), JSON.stringify(assets));
  fs.writeFileSync(path.join(dir, "sfx.json"), JSON.stringify({ materials, against: "wood", library }));
  fs.writeFileSync(path.join(dir, "ok.bin"), bake(fixture));
  const ok = await run(cli, [dir, "--bake", "ok.bin", "--plan", "sfx.json", "--at", "5"]);
  assert.equal(ok.code, 0, ok.out);
  assert.match(ok.out, /<audio/);
  assert.match(ok.out, /data-start="6\.000"/);
  fs.writeFileSync(path.join(dir, "miss.bin"), bake([{ t: 1, name: "pane", dv: 1 }]));
  assert.equal((await run(cli, [dir, "--bake", "miss.bin", "--plan", "sfx.json"])).code, 1);
  fs.writeFileSync(path.join(dir, "cut.bin"), bake(fixture).subarray(0, 20));
  assert.equal((await run(cli, [dir, "--bake", "cut.bin", "--plan", "sfx.json"])).code, 2);
});

await test("L. a row check_assets refuses never becomes an <audio> row (same verdict as the gate, both ways)", async () => {
  const lib = [{ file: "assets/sfx/a.wav", tags: ["wood-on-wood light"], duration: 0.4 }];
  const imp = [{ t: 1, name: "book", dv: 0.3 }];
  const cases = [
    [{ licence: "CC-BY-NC-ND-4.0" }, {}], [{ licence: "CC-BY-NC-4.0" }, {}], [{ licence: "CC-BY-NC-4.0" }, { commercial: true }],
    [{ licence: "GPL-3.0" }, {}], [{ licence: "MIT GPL-3.0" }, {}], [{ licence: "CC-BY-4.0" }, {}], [{ licence: "CC-BY-4.0", author: "A" }, {}],
    [{ licence: "CC0-1.0" }, {}], [{ licence: "CC0 1.0 Universal" }, {}], [{ licence: "attribution" }, {}], [{ licence: "CC0-1.0", source: "generated" }, {}],
    [{ licence: "CC0-1.0", source: "generated", model: "m (MIT)", prompt: "p" }, {}], [{ licence: "CC-BY-NC-4.0", author: "A" }, {}],
  ];
  for (const [extra, o] of cases) {
    const row = { file: lib[0].file, source: "https://example.org/a", ...extra };
    const dir = fs.mkdtempSync(path.join(tmp, "lic-"));
    fs.mkdirSync(path.join(dir, "assets/sfx"), { recursive: true });
    fs.writeFileSync(path.join(dir, lib[0].file), "x");
    fs.writeFileSync(path.join(dir, "ASSETS.json"), JSON.stringify([row]));
    const gate = await run(check, o.commercial ? [dir, "--commercial"] : [dir]);
    const r = impactSounds(imp, { library: lib, assets: [row], materials, against: "wood", ...o });
    const label = JSON.stringify(extra) + JSON.stringify(o);
    if (gate.code === 0) { assert.equal(r.rows.length, 1, "gate passes, sfx must too: " + label); assert.deepEqual(r.problems, [], label); }
    else { assert.deepEqual(r.rows, [], "gate refuses, sfx must too: " + label); assert.equal(r.problems.length, 1, label); assert.match(r.problems[0], /check_assets/, label); }
  }
});

await test("M. a fracture without a known material, or a custom event without a tag string, is unplaced, never missing", () => {
  for (const ev of [{ kind: "fracture", t: 1 }, { kind: "fracture", t: 1, material: "xyz" }, { kind: "fracture", t: 1, material: 5 }, { kind: "custom", t: 1 }, { kind: "custom", t: 1, tag: 7 }]) {
    const r = impactSounds([], { ...base, events: [ev] });
    assert.deepEqual(r.missing, [], JSON.stringify(ev));
    assert.equal(r.unplaced.length, 1, JSON.stringify(ev));
    assert.equal(r.unplaced[0].t, 1);
  }
  const ok = impactSounds([], { ...base, events: [{ kind: "fracture", t: 1, material: "ceramic" }, { kind: "custom", t: 3, tag: "latch-click" }] });
  assert.deepEqual(ok.missing, ["ceramic-shatter"]);
  assert.deepEqual(ok.unplaced, []);
  assert.equal(ok.rows.length, 1);
});

await test("N. CLI: a refused licence exits 1 and --commercial reaches the plan", async () => {
  const dir = fs.mkdtempSync(path.join(tmp, "cli2-"));
  let j = JSON.stringify({ format: 1, hash: "x", n: 0, dt: 0.002, counts: [], series: [], impacts: [{ t: 1, name: "book", dv: 0.3 }], report: { latches: [] } });
  while ((8 + Buffer.byteLength(j)) % 4) j += " ";
  const h = Buffer.alloc(8); h.write("DLB1"); h.writeUInt32LE(Buffer.byteLength(j), 4);
  fs.writeFileSync(path.join(dir, "b.bin"), Buffer.concat([h, Buffer.from(j)]));
  fs.writeFileSync(path.join(dir, "sfx.json"), JSON.stringify({ materials, against: "wood", library }));
  const rowWith = (licence) => JSON.stringify(assets.map((a) => (a.file.endsWith("knock.wav") ? { ...a, licence, author: "A" } : a)));
  fs.writeFileSync(path.join(dir, "ASSETS.json"), rowWith("CC-BY-NC-ND-4.0"));
  assert.equal((await run(cli, [dir, "--bake", "b.bin", "--plan", "sfx.json"])).code, 1);
  fs.writeFileSync(path.join(dir, "ASSETS.json"), rowWith("CC-BY-NC-4.0"));
  assert.equal((await run(cli, [dir, "--bake", "b.bin", "--plan", "sfx.json"])).code, 0);
  assert.equal((await run(cli, [dir, "--bake", "b.bin", "--plan", "sfx.json", "--commercial"])).code, 1);
});

fs.rmSync(tmp, { recursive: true, force: true });
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("sfx: all checks passed");
