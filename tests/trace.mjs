#!/usr/bin/env node
// node tests/trace.mjs — scripts/trace.mjs turns a photo on a plain wall into vtracer layers (the wall cut away, a part
// by its ellipse and colour, a selection by hue), a busy background is a WARN (exit 2), never a drawing; without vtracer
// it is a WARN that names preflight. build()'s plate stands a trace up: a part turned (and blurred by its spread), a
// selection tinted, a flow drawn, marks as pins. The vtracer half runs where vtracer is installed (DALANG_VTRACER_PY or
// ~/.cache/dalang/vtracer); the plate half always.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Iso } from "../engine/iso/iso.js";
import { build } from "../engine/iso/build.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-trace-"));
const run = (env, ...a) => spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/trace.mjs", import.meta.url)), ...a], { encoding: "utf8", env: { ...process.env, ...env } });
const ff = (out, filter) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", out]).status, 0, "ffmpeg makes the test photo");
const PY = process.env.DALANG_VTRACER_PY || path.join(os.homedir(), ".cache", "dalang", "vtracer", "bin", "python");
try {
  // a grey body, a pale blade in a dark ring (a fan before a coil), a copper bar, on a white wall
  const photo = path.join(tmp, "thing.png");
  ff(photo, "color=c=white:s=400x300,drawbox=x=40:y=40:w=320:h=200:c=0x8A9096:t=fill,drawbox=x=80:y=80:w=120:h=120:c=0x2A2A2E:t=fill,drawbox=x=120:y=90:w=40:h=100:c=0xE2D8C4:t=fill,drawbox=x=250:y=100:w=80:h=20:c=0xB8703F:t=fill");
  const r0 = run({ DALANG_VTRACER_PY: path.join(tmp, "none", "python") }, photo, "--out", path.join(tmp, "x"));
  assert.equal(r0.status, 2, "no vtracer: a WARN"); assert.match(r0.stdout, /preflight's "Photo tracer"/);
  if (fs.existsSync(PY)) {
    const out = path.join(tmp, "plate"), r = run({ DALANG_VTRACER_PY: PY }, photo, "--out", out, "--width", "400", "--part", "fan=0.35,0.47,0.15,0.2,0,front,hsv:20-60/0.03-0.4/0.6-1", "--select", "pipes=hue:12-38,35");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const t = JSON.parse(fs.readFileSync(path.join(out, "trace.json"), "utf8"));
    assert.deepEqual(t.layers.map((l) => `${l.name}:${l.kind}`), ["body:body", "fan:part", "pipes:select"]);
    assert.ok(Math.abs(t.bbox[0] - 40) <= 2 && Math.abs(t.bbox[2] - 360) <= 2, `the box is the thing, not the wall: ${t.bbox}`);
    for (const l of t.layers) assert.match(fs.readFileSync(path.join(out, `${l.name}.svg`), "utf8"), /<path/, `${l.name} traced`);
    const fan = Number(/fan (\d+) px/.exec(r.stdout)?.[1]);
    assert.ok(fan > 3500 && fan < 4300, `the fan layer is the pale blade (40×100) only, not the dark ring around it: ${fan}`);
    const busy = path.join(tmp, "busy.png"); ff(busy, "testsrc=s=400x300");
    assert.equal(run({ DALANG_VTRACER_PY: PY }, busy, "--out", path.join(tmp, "busy")).status, 2, "a busy background is a WARN");
  } else console.log("SKIP   vtracer not installed here: the trace half is unchecked (the plate half runs)");

  // the plate: upright at its point; the fan turned (and drawn 12 times when spread), the pipes tinted, a flow, pins
  const t = { w: 400, h: 300, bbox: [40, 40, 360, 240], layers: [{ name: "body", kind: "body" }, { name: "fan", kind: "part", cx: 140, cy: 140, rx: 60, ry: 60, deg: 0, back: false }, { name: "pipes", kind: "select", color: "hue:12-38" }] };
  const draw = (values) => { const calls = [], ctx = new Proxy({}, { get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])), set: (o, k, v) => { o[k] = v; return true; } });
    const iso = new Iso(ctx, 1080, 1920), W = [{ name: "o", parts: [{ name: "unit", form: "plate", plate: "ac", w: 0.9, spin: { fan: "fan" }, spread: { fan: "blur" }, tint: { pipes: { color: "#E0523A", amount: "hot" } }, flows: [{ path: [[0.6, 0.3], [0.8, 0.3]], at: "flow" }], marks: { valve: [0.85, 0.7] } }] }];
    const o = build(iso, W, { plates: { ac: { ...t, img: { body: {}, fan: {}, pipes: {} } } }, values }); iso.flush(); return { calls, o }; };
  const still = draw({ fan: 0, blur: 0, hot: 0, flow: 0 }), spun = draw({ fan: 1.2, blur: 1, hot: 1, flow: 0.5 });
  assert.equal(still.calls.filter((c) => c[0] === "drawImage").length, 2, "at rest: the body and the fan");
  assert.ok(spun.calls.some((c) => c[0] === "rotate" && Math.abs(c[1] - 1.2) < 1e-9), "the fan turns by its value");
  assert.equal(spun.calls.filter((c) => c[0] === "drawImage").length, 1 + 12, "spread: the fan drawn as a motion-blurred disc (the tint needs a page)");
  assert.ok(spun.calls.some((c) => c[0] === "setLineDash"), "the flow runs as a dashed line");
  assert.ok(Math.abs(still.o.at.unit[2] - 0.9 * 200 / 320) < 1e-6, "the plate is its traced height tall");
  assert.ok(still.o.at["unit.fan"] && still.o.at["unit.valve"][2] > 0, "a part and a mark are pins");
  assert.throws(() => build(new Iso(new Proxy({}, { get: () => () => 0 }), 1080, 1920), [{ parts: [{ name: "u", form: "plate", plate: "ac", w: 1 }] }], {}), /await loadPlates/, "a plate not loaded says how to load it");
  console.log("ok  trace: vtracer layers from a plain-wall photo (a part by ellipse and colour, a selection by hue), WARNs without vtracer or on a busy wall; the plate turns, blurs, tints, flows and pins");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
