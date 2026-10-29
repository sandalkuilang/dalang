#!/usr/bin/env node
// node tests/trace.mjs — scripts/trace.mjs turns a photo on a plain wall into inked SVG layers: the wall cut away (also
// seen through a gap), a named wheel ellipse on its own layer, trace.json with the box and the palette; a busy
// background is a WARN (exit 2), never a drawing. build()'s plate stands the trace up and turns the wheel layer.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Iso } from "../engine/iso/iso.js";
import { build } from "../engine/iso/build.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-trace-"));
const run = (...a) => spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/trace.mjs", import.meta.url)), ...a], { encoding: "utf8" });
const ff = (out, filter) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", out]).status, 0, "ffmpeg makes the test photo");
try {
  // a red body with a black wheel (a white hole in it: the wall seen through) on a white wall
  const photo = path.join(tmp, "thing.png");
  ff(photo, "color=c=white:s=400x300,drawbox=x=60:y=60:w=220:h=110:c=0xC0303A:t=fill,drawbox=x=220:y=150:w=110:h=110:c=0x202020:t=fill,drawbox=x=267:y=197:w=16:h=16:c=white:t=fill");
  const out = path.join(tmp, "plate"), r = run(photo, "--out", out, "--width", "400", "--materials", "3", "--part", "wheel=0.69,0.68,0.16,0.21,0");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const t = JSON.parse(fs.readFileSync(path.join(out, "trace.json"), "utf8"));
  assert.deepEqual(t.layers, ["body", "wheel"]);
  assert.ok(Math.abs(t.bbox[0] - 60) <= 2 && Math.abs(t.bbox[2] - 330) <= 2 && Math.abs(t.bbox[3] - 260) <= 2, `the box is the thing, not the wall: ${t.bbox}`);
  const body = fs.readFileSync(path.join(out, "body.svg"), "utf8"), wheel = fs.readFileSync(path.join(out, "wheel.svg"), "utf8");
  const red = [...body.matchAll(/fill="#([0-9a-f]{6})"/g)].map((m) => [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)));
  assert.ok(red.some(([r, g, b]) => r > 170 && g < 70 && b < 80), "the body keeps its red");
  assert.match(wheel, /fill="#[12][0-9a-f][12][0-9a-f][12][0-9a-f]"/, "the wheel is its own layer");
  assert.ok(!/fill="#f[a-f0-9]f[a-f0-9]f[a-f0-9]"/.test(wheel), "the wall seen through the wheel is cut away");
  // a busy background: no drawing
  const busy = path.join(tmp, "busy.png");
  ff(busy, "testsrc=s=400x300");
  assert.equal(run(busy, "--out", path.join(tmp, "busy")).status, 2, "a busy background is a WARN");

  // the plate: upright at its point, the wheel layer turned by its value, a pin on the wheel's centre
  const calls = [], ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])), set: (o, k, v) => { o[k] = v; return true; } });
  const iso = new Iso(ctx, 1080, 1920), img = { body: {}, wheel: {} };
  const W = [{ name: "o", parts: [{ name: "bike", form: "plate", plate: "thing", w: 1.8, spin: { wheel: "roll" } }] }];
  const o = build(iso, W, { plates: { thing: { ...t, img } }, values: { roll: 1.2 } }); iso.flush();
  assert.equal(calls.filter((c) => c[0] === "drawImage").length, 2, "both layers drawn");
  assert.ok(calls.some((c) => c[0] === "rotate" && Math.abs(c[1] - 1.2) < 1e-9), "the wheel turns by its value");
  assert.ok(Math.abs(o.at.bike[2] - 1.8 * (t.bbox[3] - t.bbox[1]) / (t.bbox[2] - t.bbox[0])) < 1e-6, "the plate is its traced height tall");
  assert.ok(o.at["bike.wheel"][2] > 0, "the wheel layer has a pin");
  assert.throws(() => build(new Iso(ctx, 1080, 1920), W, {}), /await loadPlates/, "a plate not loaded says how to load it");
  console.log("ok  trace: a plain-wall photo becomes inked layers, the wall cut away, a wheel on its own layer; a busy background WARNs; the plate stands it up and turns the wheel");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
