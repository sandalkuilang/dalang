#!/usr/bin/env node
// node tests/iso.mjs — engine/iso/iso.js (vendored, the Express look) still loads and draws: a box queued and flushed paints
// three faces in three tones of one colour, and two boxes are painted back to front (painter depth x + y + z).
import assert from "node:assert/strict";
import { Iso, tri } from "../engine/iso/iso.js";

const calls = [];
const ctx = new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])),
  set: (o, k, v) => { o[k] = v; if (k === "fillStyle") calls.push(["fillStyle", v]); return true; },
});
const t3 = tri("#3A7BD5");
assert.equal(new Set(t3).size, 3, "tri() gives three tones");
const iso = new Iso(ctx, 1080, 1920);
iso.box(4, 4, 0, 1, 1, 1, tri("#D54A3A"));   // near
iso.box(0, 0, 0, 1, 1, 1, t3);               // far
iso.flush();
const fills = calls.filter((c) => c[0] === "fillStyle").map((c) => c[1]);
assert.ok(fills.length >= 6, `two boxes paint at least six faces, got ${fills.length}`);
// shading mixes each face from its tones: tell the two boxes apart by hue (blue far, red near)
const rgbOf = (f) => (f.startsWith("#") ? [1, 3, 5].map((i) => parseInt(f.slice(i, i + 2), 16)) : f.match(/\d+/g).map(Number));
const blue = (f) => { const [r, , b] = rgbOf(f); return b > r; };
const firstFar = fills.findIndex(blue), firstNear = fills.findIndex((f) => !blue(f));
assert.ok(firstFar >= 0 && firstNear > firstFar, "the far box is painted before the near one");
console.log("iso ok");
