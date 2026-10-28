#!/usr/bin/env node
// node tests/iso-cinema.mjs — engine/iso/cinema.js and the lens options of parallax.drawLayers: keyed camera moves
// (held outside, eased, zoom in log), seeded handheld, speed ramps that integrate without a jump, whip pans that blur
// most in the middle, motion blur as a running mean over the shutter, depth of field and haze per layer, and the finish
// in grade order, its grain the same for the same frame.
import assert from "node:assert/strict";
import { Iso } from "../engine/iso/iso.js";
import { drawLayers } from "../engine/iso/parallax.js";
import { EASE, camAt, handheld, ramp, whip, motionBlur, makeFinish } from "../engine/iso/cinema.js";

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
for (const [n, f] of Object.entries(EASE)) assert.ok(near(f(0), 0) && near(f(1), 1), `ease ${n} runs 0 → 1`);

const keys = [{ t: 1, x: 0, y: 0, z: 0, k: 10 }, { t: 3, x: 10, y: -4, z: 2, k: 40, ease: "linear" }];
assert.deepEqual(camAt(0, keys), { x: 0, y: 0, z: 0, k: 10 }, "held before the first key");
assert.deepEqual(camAt(9, keys), { x: 10, y: -4, z: 2, k: 40 }, "held after the last");
const mid = camAt(2, keys);
assert.ok(near(mid.x, 5) && near(mid.k, 20), "halfway: half the pan, the geometric mean of the zoom");
assert.throws(() => camAt(0, []), /no keys/); assert.throws(() => camAt(2, [keys[1], keys[0]]), /sorted/);

const base = { x: 1, y: 2, z: 3, k: 10 };
assert.deepEqual(handheld(base, 1.234, { seed: 4 }), handheld(base, 1.234, { seed: 4 }), "handheld is seeded: the same frame twice");
assert.notDeepEqual(handheld(base, 1.234, { seed: 4 }), handheld(base, 1.234, { seed: 5 }), "another seed, another hand");
let worst = 0; for (let t = 0; t < 10; t += 0.01) { const h = handheld(base, t, { amp: 0.05 }); worst = Math.max(worst, Math.abs(h.x - 1), Math.abs(h.y - 2)); }
assert.ok(worst <= 0.05 + 1e-9 && worst > 0.02, "the shake stays inside its amplitude: " + worst);
assert.deepEqual(handheld(base, 2, { amp: 0 }), base, "amp 0 is a locked tripod");

assert.equal(ramp(2.5, []), 2.5, "no ramp: story time is film time");
const R = [{ t: 0, speed: 1 }, { t: 1, speed: 1 }, { t: 1.5, speed: 0.25 }, { t: 2.5, speed: 0.25 }, { t: 3, speed: 1 }];
assert.ok(near(ramp(1, R), 1) && near(ramp(1.5, R), 1 + 0.5 * 0.625) && near(ramp(2.5, R), 1.3125 + 0.25), "τ is the integral of the speed");
let prev = -1, jump = 0; for (let t = 0; t < 4; t += 0.001) { const v = ramp(t, R); jump = Math.max(jump, v - prev > 0 ? 0 : 1); assert.ok(v >= prev); prev = v; }
assert.ok(near(ramp(4, R) - ramp(3, R), 1), "back to normal speed after the ramp");

const A = { x: 0, y: 0, z: 0, k: 10 }, B = { x: 20, y: 0, z: 0, k: 10 };
assert.deepEqual(whip(0, 0, 0.4, A, B).cam, A); assert.deepEqual(whip(0.4, 0, 0.4, A, B).cam, B);
assert.ok(whip(0.2, 0, 0.4, A, B).blur > 0.9 && whip(0.02, 0, 0.4, A, B).blur < 0.1, "a whip blurs through the middle, sharp at its ends");

// Motion blur: `samples` instants across a 180° shutter, as a running mean
const log = [], fakeCanvas = (name) => ({ width: 4, height: 4, getContext: () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => log.push([name, k, ...a])), set: (o, k, v) => { o[k] = v; if (k === "globalAlpha") log.push([name, "alpha", v]); return true; } }) });
const times = [];
motionBlur(fakeCanvas("target"), fakeCanvas("buffer"), (ctx, t) => times.push(t), 1, { fps: 30, samples: 5 });
assert.ok(near(times[0], 1 - 1 / 120) && near(times[4], 1 + 1 / 120) && near(times[2], 1), "instants span half a frame around t");
assert.deepEqual(log.filter((c) => c[0] === "target" && c[1] === "alpha").map((c) => c[2]), [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5], "a running mean");

// Depth of field and haze per layer
const calls = [], ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])), set: (o, k, v) => { o[k] = v; calls.push(["set", k, v]); return true; } });
const iso = new Iso(ctx, 100, 100), cam = { x: 0, y: 0, z: 0, k: 10 }, box = (i) => i.box(0, 0, 0, 1, 1, 1, "#888888", { cull: false });
drawLayers(iso, cam, cam, [{ depth: 0.2, draw: box }, { depth: 1, draw: box }, { depth: 1.5, draw: box }], { focus: 1, aperture: 10, haze: { color: "#E8EEF2", amount: 0.5 } });
const filters = calls.filter((c) => c[0] === "set" && c[1] === "filter").map((c) => c[2]);
assert.deepEqual(filters, ["blur(8px)", "blur(5px)"], "far and near layers blur by their distance from focus; the subject is sharp");
const alphas = calls.filter((c) => c[0] === "set" && c[1] === "globalAlpha").map((c) => c[2]);
assert.ok(alphas.some((a) => near(a, 0.4)), "haze veils the far layer by amount × (1 − depth)");

// The finish: grade order, seeded grain, bars
const fin = [], mk = (w, h) => ({ width: w, height: h, getContext: () => new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : k === "createImageData" ? (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }) : /^create(Linear|Radial)Gradient$/.test(k) ? () => ({ addColorStop() {} }) : k === "createPattern" ? () => ({}) : (...a) => fin.push([k, ...a])),
  set: (o, k, v) => { o[k] = v; fin.push(["set", k, v]); return true; } }) });
const F = makeFinish(1920, 1080, { canvas: mk }), target = mk(1920, 1080);
const run = (t, o) => { fin.length = 0; F.apply(target, t, o); return fin.slice(); };
const all = run(1, { grade: { contrast: 1.1, saturate: 0.9, warmth: 0.1 }, bloom: 0.3, sweep: { at: 0.5 }, vignette: 0.4, grain: 0.06, bars: { aspect: 2.39 } });
const ops = all.filter((c) => c[0] === "set" && c[1] === "globalCompositeOperation").map((c) => c[2]);
assert.deepEqual(ops, ["soft-light", "screen", "screen", "overlay"], "grade warmth, bloom, sweep, grain, in that order");
const bars = all.filter((c) => c[0] === "fillRect").slice(-2);
assert.ok(near(bars[0][4], (1080 - 1920 / 2.39) / 2, 1e-6), "scope bars at 2.39:1");
const grainAt = (t) => run(t, { grain: 0.05 }).filter((c) => c[0] === "translate");
assert.deepEqual(grainAt(1), grainAt(1), "the same frame, the same grain");
assert.notDeepEqual(grainAt(1), grainAt(1 + 1 / 30), "the next frame, new grain");
assert.equal(run(1, { bars: { amount: 0 } }).filter((c) => c[0] === "fillRect").length, 0, "bars at amount 0 draw nothing");
console.log("iso-cinema ok");
