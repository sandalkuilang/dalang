#!/usr/bin/env node
// node tests/iso-cinema.mjs — engine/iso/cinema.js and the lens options of parallax.drawLayers: keyed camera moves
// (held outside, eased, zoom in log), no handheld, speed ramps that integrate without a jump, whip pans that blur
// most in the middle, motion blur as a running mean over the shutter, depth of field and haze per layer, and the finish
// in grade order, its grain the same for the same frame.
import assert from "node:assert/strict";
import { Iso } from "../engine/iso/iso.js";
import { drawLayers, isoLayer } from "../engine/iso/parallax.js";
import * as cinema from "../engine/iso/cinema.js";
import { EASE, camAt, ramp, whip, motionBlur, makeFinish, orbit25, crane25, dollyZoom25, drone25, bokeh, discs, hold, focusRing } from "../engine/iso/cinema.js";

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
for (const [n, f] of Object.entries(EASE)) assert.ok(near(f(0), 0) && near(f(1), 1), `ease ${n} runs 0 → 1`);

const keys = [{ t: 1, x: 0, y: 0, z: 0, k: 10 }, { t: 3, x: 10, y: -4, z: 2, k: 40, ease: "linear" }];
assert.deepEqual(camAt(0, keys), { x: 0, y: 0, z: 0, k: 10 }, "held before the first key");
assert.deepEqual(camAt(9, keys), { x: 10, y: -4, z: 2, k: 40 }, "held after the last");
const mid = camAt(2, keys);
assert.ok(near(mid.x, 5) && near(mid.k, 20), "halfway: half the pan, the geometric mean of the zoom");
assert.throws(() => camAt(0, []), /no keys/); assert.throws(() => camAt(2, [keys[1], keys[0]]), /sorted/);

assert.equal(cinema.handheld, undefined, "no handheld shake: a camera's life is a one-way orbit");
// a move goes one way: right then straight back left with no hold is refused; a hold between, or a zoom, is fine
const L = (t, x, y, k = 200) => ({ t, x, y, z: 0, k });
assert.throws(() => camAt(0, [L(0, 0, 0), L(1, 1, -1), L(2, 0, 0)]), /turns back/, "right then left with no hold is a wobble");
assert.doesNotThrow(() => camAt(0, [L(0, 0, 0), L(1, 1, -1), L(2, 1, -1), L(3, 0, 0)]), "a 1 s hold before turning back");
assert.doesNotThrow(() => camAt(0, [L(0, 0, 0), L(1, 1, -1), L(2, 2, -2, 500)]), "one way, pushing in");
assert.doesNotThrow(() => camAt(0, [L(0, 0, 0), L(1, 0, 0, 600), L(2, 0, 0, 200)]), "a zoom in and out does not travel sideways");

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
// 2.5D moves: pure functions of t whose layers move against each other by depth.
const rest25 = { x: 0, y: 0, z: 1, k: 20 };
{
  const o = orbit25(3, { rest: rest25, dur: 4 }), l = (f) => isoLayer(o, o.rest, f);
  assert.deepEqual(o, orbit25(3, { rest: rest25, dur: 4 }), "orbit25 is a pure function of t");
  assert.ok(near(l(1).x, 0) && near(l(1).y, 0), "orbit: the subject plane (depth 1) stays centred");
  assert.ok(l(0.3).x * l(1.5).x < 0, "orbit: far and near layers slide opposite ways");
  assert.ok(Math.abs(l(0.3).x) > Math.abs(l(0.8).x), "orbit: the farther the layer, the more it slides");
  const a = orbit25(0, { rest: rest25 }), b = orbit25(9, { rest: rest25 });
  assert.ok(near(isoLayer(a, a.rest, 0).x, -isoLayer(b, b.rest, 0).x), "orbit sweeps symmetrically about the rest");
  const c0 = crane25(0, { rest: rest25 }), c1 = crane25(9, { rest: rest25, rise: 3 });
  assert.deepEqual(c0, rest25, "crane starts on the rest"); assert.ok(near(c1.z, 4) && c1.k < rest25.k, "crane rises and widens");
  assert.ok(Math.abs(isoLayer(c1, rest25, 0.3).z - 1) < Math.abs(isoLayer(c1, rest25, 1.5).z - 1), "crane: far layers move less than near ones");
  assert.ok(crane25(9, { rest: rest25, rise: -3 }).k > rest25.k, "a lowering crane closes in");
  const d = dollyZoom25(9, { rest: rest25, strength: 0.5 });
  assert.deepEqual(d.cam, rest25); assert.ok(near(d.dolly, 1.5), "dolly zoom ends at (1 + strength)");
  assert.equal(dollyZoom25(0, { rest: rest25 }).dolly, 1);
  const ks = (f) => isoLayer(d.cam, rest25, f, d.dolly).k;
  assert.ok(near(ks(1), rest25.k) && ks(0.3) > rest25.k && ks(1.5) < rest25.k, "dolly zoom: the subject holds, the far world swells, the near world shrinks");
  const r0 = drone25(0, { rest: rest25 }), r1 = drone25(9, { rest: rest25 });
  assert.deepEqual(r1, rest25, "drone lands exactly on the rest"); assert.ok(near(r0.k, rest25.k / 2.2) && r0.z > rest25.z && r0.x > 0, "and starts wide, high and offset");
}
const f12 = bokeh(1.2), f56 = bokeh(5.6);
assert.ok(near(f12.aperture, 18) && f12.aperture > 4 * f56.aperture && f56.aperture > 3, "bokeh: f1.2 melts, f5.6 nearly sharp");
assert.ok(bokeh(2.8, { mm: 85 }).aperture > bokeh(2.8, { mm: 24 }).aperture && f12.focus === 1, "bokeh: a longer lens blurs more");
assert.throws(() => bokeh(0), /fstop/); assert.throws(() => bokeh(2, { mm: -1 }), /mm/);
{
  const calls = [], g = new Proxy({}, { get: (_, k) => (...a) => { calls.push([k, ...a]); return { addColorStop: (...s) => calls.push(["stop", ...s]) }; }, set: (_, k, v) => { calls.push(["set", k, v]); return true; } });
  discs(g, [{ x: 10, y: 20 }, { x: 30, y: 40, a: 0.5 }], { radius: 30, color: "#ff8800" });
  assert.equal(calls.filter((c) => c[0] === "arc").length, 2, "one disc per light");
  assert.ok(calls.some((c) => c[0] === "set" && c[2] === "lighter") && calls.some((c) => c[0] === "stop" && /255,136,0/.test(c[2])), "added to the frame, in the light's colour");
}
// Arrive and orbit: a zoom lands, the orbit leaves the arrival pose with no jump, the blur window follows both.
{
  const o0 = orbit25(5, { rest: rest25, start: 5, dur: 4, from: 0, to: 1 });
  assert.ok(near(isoLayer(o0, o0.rest, 0.3).x, 0), "orbit from 0: at its start it is still on the arrival pose");
  const o1 = orbit25(9, { rest: rest25, start: 5, dur: 4, from: 0, to: -1 }), o2 = orbit25(9, { rest: rest25, start: 5, dur: 4, from: 0, to: 1 });
  assert.ok(isoLayer(o1, o1.rest, 0.3).x * isoLayer(o2, o2.rest, 0.3).x < 0, "to −1 orbits the other way");
  assert.ok(near(isoLayer(orbit25(9, { rest: rest25 }), orbit25(9, { rest: rest25 }).rest, 0.3).x, -isoLayer(orbit25(0, { rest: rest25 }), orbit25(0, { rest: rest25 }).rest, 0.3).x), "default orbit unchanged");
  const w = (t) => hold(t, 1, 2, 5, 7);
  assert.ok(w(0.5) === 0 && w(1) === 0 && w(2) === 1 && w(4) === 1 && w(5) === 1 && w(7) === 0 && w(9) === 0 && w(1.5) > 0 && w(1.5) < 1 && w(6) > 0 && w(6) < 1, "hold: up, held, down");
  assert.ok(hold(3, 3, 3, 8, 8) === 1 && hold(2.9, 3, 3, 8, 8) === 0 && hold(8.1, 3, 3, 8, 8) === 0, "hold: a step when the ramps are zero");
}
{
  const draws = [], mk = (name) => { const c = { width: 192, height: 108 }; c.getContext = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => { draws.push([name, k, ...a]); return { addColorStop: (...s) => draws.push([name, "stop", ...s]) }; }), set: (o, k, v) => { o[k] = v; draws.push([name, "set", k, v]); return true; } }); return c; };
  const T = mk("t"), B = mk("b");
  focusRing(T, B, { cx: 96, cy: 54, fstop: 1.2, amount: 0 }); assert.equal(draws.length, 0, "amount 0 draws nothing");
  focusRing(T, B, { cx: 96, cy: 54, fstop: 1.2 });
  assert.ok(draws.some((c) => c[1] === "set" && c[2] === "filter" && c[3] === "blur(14.4px)"), "f1.2 blurs 14 px");
  const grad = draws.find((c) => c[1] === "createRadialGradient"); assert.ok([96, 54, 27, 96, 54, 59.4].every((v, i) => near(v, grad[i + 2])), "clear disc then soft edge, in frame heights");
  assert.ok(draws.some((c) => c[1] === "set" && c[2] === "globalCompositeOperation" && c[3] === "destination-out") && draws.at(-1)[0] === "t" && draws.at(-1)[1] === "drawImage", "the centre erased from the blurred copy, then laid over the frame");
  draws.length = 0; focusRing(T, B, { cx: 0, cy: 0, fstop: 5.6 }); assert.ok(draws.some((c) => c[2] === "filter" && /^blur\(3\.0\d*px\)$/.test(c[3])), "f5.6 blurs far less");
}
console.log("iso-cinema ok");
