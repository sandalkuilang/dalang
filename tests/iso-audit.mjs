#!/usr/bin/env node
// node tests/iso-audit.mjs — engine/anatomy/world.mjs proves an Express world on its true shapes: a resting set
// passes; a floating part, two objects sunk into each other, a pipe through a post and a pipe end in mid-air are each
// caught by name; parts of one object may nest; the engine's own example specs are checked too.
import assert from "node:assert/strict";
import { auditWorld } from "../engine/anatomy/world.mjs";
import * as EX from "../engine/iso/examples.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const slab = { name: "slab", parts: [{ name: "slab", form: "box", at: [0, 0, -0.3], w: 8, d: 8, h: 0.3, ground: true }] };
const table = { name: "table", at: [0, 0, 0], parts: [
  { name: "leg", form: "box", at: [-0.6, -0.3, 0], w: 0.05, d: 0.05, h: 0.72, array: { count: 2, step: [1.2, 0, 0] } },
  { name: "legB", form: "box", at: [-0.6, 0.3, 0], w: 0.05, d: 0.05, h: 0.72, array: { count: 2, step: [1.2, 0, 0] } },
  { name: "top", form: "box", at: [0, 0, 0.72], w: 1.4, d: 0.7, h: 0.04 },
  { name: "drawer", form: "box", at: [0, 0, 0.6], w: 0.5, d: 0.6, h: 0.12 }, // nests in the table: one object
] };
const lamp = { name: "lamp", at: [0.3, 0, 0.76], parts: [{ name: "foot", form: "cyl", r: 0.08, h: 0.02 }, { name: "pole", form: "cyl", r: 0.01, h: 0.4 }, { name: "shade", form: "cone", at: [0, 0, 0.35], r: 0.12, h: 0.15 }] };
const post = { name: "post", at: [2, 0, 0], parts: [{ name: "post", form: "cyl", r: 0.1, h: 1.5 }] };

const ok = auditWorld([slab, table, lamp, post]);
assert.ok(ok.ok, "a resting set passes:\n" + ok.text);

const float = auditWorld([slab, table, { ...lamp, at: [0.3, 0, 1.2] }, post]);
assert.ok(float.problems.some((p) => p.kind === "floats" && p.part.startsWith("lamp.")), "a lamp in mid-air floats:\n" + float.text);

const sunk = auditWorld([slab, table, { ...post, at: [0.5, 0.2, 0] }]);
assert.ok(sunk.problems.some((p) => p.kind === "sunk" && [p.part, p.other].some((n) => n.startsWith("post.")) && [p.part, p.other].some((n) => n.startsWith("table."))), "a post through the table top is two objects drawing through each other:\n" + sunk.text);

const pipeThrough = { name: "pipe", parts: [{ name: "run", form: "sweep", r: 0.03, path: [[1.5, 0, 0.8], [2.5, 0, 0.8]] }] };
const thr = auditWorld([slab, post, pipeThrough]);
assert.ok(thr.problems.some((p) => p.kind === "through" && p.part.includes("run") && p.other.startsWith("post.")), "a pipe through the post:\n" + thr.text);
assert.ok(thr.problems.some((p) => p.kind === "loose end" || p.kind === "floats"), "its ends land on nothing:\n" + thr.text);

const pipeLands = { name: "pipe", parts: [{ name: "run", form: "sweep", r: 0.03, path: [[2.1, 0, 0.8], [3, 0, 0.8], [3, 0, 0]] }] };
const lands = auditWorld([slab, post, pipeLands]);
assert.ok(!lands.problems.some((p) => p.part.includes("run")), "a pipe from the post's side down to the slab lands at both ends:\n" + lands.text);

assert.throws(() => auditWorld([{ parts: [{ name: "x", form: "box", w: 1, d: 1 }] }]), /needs h/, "a part without its sizes is refused");

// the engine's own examples, each on a floor at z = 0: printed, never assumed clean
for (const [k, spec] of Object.entries(EX)) if (spec?.parts) console.log(k + ": " + auditWorld([spec], { floor: 0, values: { level: 3, drive: 0 } }).text.split("\n").slice(1).join(" | "));
// the builder's command: exit 0 clean, 3 with problems named, 2 (WARN, never clean) when the world cannot be read
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "iso_audit.mjs"), proj = mkdtempSync(path.join(tmpdir(), "iso-audit-"));
const run = (world) => { mkdirSync(path.join(proj, "assets"), { recursive: true }); writeFileSync(path.join(proj, "assets", "world.js"), world); return spawnSync("node", [cli, proj, "--ground", "slab"], { encoding: "utf8" }); };
try {
  const js = (w) => `export const WORLD = ${JSON.stringify(w)};\nexport const VALUES = {};\n`;
  const a = run(js([slab, table, lamp, post])), b = run(js([slab, table, { ...lamp, at: [0.3, 0, 1.2] }])), c = run("export const STUB = true;\nexport const WORLD = [];\n");
  assert.equal(a.status, 0, "clean world: exit 0\n" + a.stdout);
  assert.ok(b.status === 3 && /lamp\.\w+ floats/.test(b.stdout), "a floating lamp: exit 3, named\n" + b.stdout);
  assert.ok(c.status === 2 && /WARN/.test(c.stdout) && !/ok:/.test(c.stdout), "the stub world: WARN, exit 2, never clean\n" + c.stdout);
} finally { rmSync(proj, { recursive: true, force: true }); }
console.log("iso-audit ok: resting set passes; floating, sunk, pipe-through and loose pipe ends caught by name; the CLI exits 0/3/2");
