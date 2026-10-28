#!/usr/bin/env node
// node tests/iso-build.mjs — engine/iso forms, build() and the glTF model loader: forms give closed, finite faces;
// every example spec draws with no NaN and returns its pins; a meshed gear turns at the tooth ratio; the cutaway removes
// a skin; a value drives a size; focus greys the rest; errors name the part; a GLB is read in metres, z up, coloured by
// its material or texture, with back faces culled, and a compressed or too-heavy model is refused.
import assert from "node:assert/strict";
import { Iso } from "../engine/iso/iso.js";
import { lathe, extrude, sweep, gearOutline } from "../engine/iso/forms.js";
import { build } from "../engine/iso/build.js";
import { parseModel, drawModel } from "../engine/iso/model.js";
import * as EX from "../engine/iso/examples.js";

const canvas = () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : (...a) => calls.push([k, ...a])),
    set: (o, k, v) => { o[k] = v; if (k === "fillStyle") calls.push(["fillStyle", v]); return true; },
  });
  return { ctx, calls, fills: () => calls.filter((c) => c[0] === "fillStyle").map((c) => c[1]) };
};
const finite = (faces) => faces.every((f) => f.every((p) => p.every(Number.isFinite)));
const draw = (spec, state, cam = { x: 0, y: 0, z: 0, k: 20 }) => { const c = canvas(), iso = new Iso(c.ctx, 1080, 1920); iso.cam = cam; const out = build(iso, spec, state); iso.flush(); return { ...c, out, iso }; };

// Forms
const L = lathe([[0, 0], [1, 0], [1, 2], [0.5, 3]], { n: 12 });
assert.equal(L.length, 3 * 12 + 1, "lathe: a band per profile step, a cap where the end has r > 0, none on the axis");
assert.ok(finite(L), "lathe faces are finite");
assert.equal(extrude([[0, 0], [1, 0], [1, 1], [0, 1]], { h: 2 }).length, 6, "extrude: two caps and a side per edge");
for (const plane of ["xz", "yz"]) assert.ok(extrude([[0, 0], [1, 0], [0, 1]], { h: 1, plane }).flat().some((p) => p[2] === 1), `extrude on ${plane} stands up`);
const S = sweep([[0, 0, 0], [0, 0, 1], [1, 0, 1]], { r: 0.1, n: 6 });
assert.equal(S.length, 2 * 6 + 2, "sweep: a band per segment and two caps");
assert.ok(finite(S), "sweep faces are finite, a vertical leg included");
const G = gearOutline(12, 0.01);
assert.equal(G.length, 48, "a gear outline has four points a tooth");
const radii = G.map(([x, y]) => Math.hypot(x, y));
assert.ok(Math.abs(Math.max(...radii) - 0.07) < 1e-9 && Math.abs(Math.min(...radii) - 0.0475) < 1e-9, "tips at rp + m, roots at rp − 1.25 m");
assert.throws(() => gearOutline(5, 0.01), /teeth/); assert.throws(() => gearOutline(12, 0), /module/);
assert.throws(() => lathe([[1, 0]]), /two points/); assert.throws(() => extrude([[0, 0], [1, 0]]), /three points/);

// Every example draws, with no NaN in any call, and pins every named part
for (const [name, spec] of Object.entries(EX)) {
  const r = draw(spec, { values: { level: 3, drive: 0.4 } });
  assert.ok(r.fills().length > 10, `${name} paints faces`);
  assert.ok(!JSON.stringify(r.calls).includes("NaN") && !r.calls.flat().some((v) => typeof v === "number" && !Number.isFinite(v)), `${name}: no NaN or Infinity drawn`);
  for (const p of spec.parts) if (!p.array) assert.ok(p.name in r.out.at && r.out.at[p.name].every(Number.isFinite), `${name}: a pin for ${p.name}`);
  const again = draw(spec, { values: { level: 3, drive: 0.4 } });
  assert.deepEqual(again.calls, r.calls, `${name} draws the same frame twice`);
}
assert.ok("windows.2" in draw(EX.tower).out.at && "pane.10" in draw(EX.tower).out.at, "arrays pin each copy as name.k");

// Gears turn at the tooth ratio
const g = draw(EX.gearbox, { values: { drive: 0.9 } }).out;
assert.ok(Math.abs(g.angle.gear - (-0.9 * 12) / 36) < 1e-12, "the 36-tooth gear turns at −12/36 of the pinion: " + g.angle.gear);
assert.throws(() => build(new Iso(canvas().ctx), { parts: [{ name: "b", form: "gear", teeth: 20, module: 0.01, mesh: { with: "a" } }] }), /meshes with a/);

// The cutaway: the skin slides out, then is gone
const shut = draw(EX.gearbox, { values: { drive: 0 }, cut: 0 }), open = draw(EX.gearbox, { values: { drive: 0 }, cut: 1 }), half = draw(EX.gearbox, { values: { drive: 0 }, cut: 0.5 });
assert.ok("housing" in shut.out.at && !("housing" in open.out.at), "cut 1 removes the skin");
assert.ok(half.out.at.housing[0] > shut.out.at.housing[0] && half.out.at.housing[1] > shut.out.at.housing[1], "a skin slides toward the viewer as it opens");
assert.ok(open.fills().length < shut.fills().length, "the open gearbox paints fewer faces");

// A value drives a size
const low = draw(EX.waterTower, { values: { level: 1 } }).out.at.water, high = draw(EX.waterTower, { values: { level: 4 } }).out.at.water;
assert.ok(Math.abs(high[2] - low[2] - 3) < 1e-9, "values.level raises the water by 3 m");

// Focus greys the rest and restores the engine's state
const plain = draw(EX.truck), focused = draw(EX.truck, { focus: "cab" });
assert.notDeepEqual(focused.fills(), plain.fills(), "focus changes the colours of the rest");
assert.ok(focused.fills().some((f) => plain.fills().includes(f)), "the focused part keeps its own colour");
assert.deepEqual([focused.iso.desat, focused.iso.keep, focused.iso.alpha], [1, false, 1], "focus sets the frame's desat; keep and alpha are restored");

// Errors name the part
assert.throws(() => build(new Iso(canvas().ctx), { parts: [{ name: "x", form: "blob" }] }), /part x has form "blob"/);
assert.throws(() => build(new Iso(canvas().ctx), { parts: [{ name: "x", form: "box", w: 1, d: 1 }] }), /x needs h/);
assert.throws(() => build(new Iso(canvas().ctx), { parts: [{ name: "x", form: "box", w: 1, d: 1, h: "nope" }] }), /h is not a number/);
assert.throws(() => build(new Iso(canvas().ctx), { parts: [{ name: "x", form: "model", model: "crate" }] }), /await loadModel/);

// glTF / GLB
const glb = (json, bin) => {
  const pad = (b, f) => { const n = (4 - (b.length % 4)) % 4; return Buffer.concat([b, Buffer.alloc(n, f)]); };
  const J = pad(Buffer.from(JSON.stringify(json)), 0x20), B = bin ? pad(Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength), 0) : null;
  const chunk = (d, t) => { const h = Buffer.alloc(8); h.writeUInt32LE(d.length, 0); h.writeUInt32LE(t, 4); return Buffer.concat([h, d]); };
  const body = Buffer.concat([chunk(J, 0x4e4f534a), ...(B ? [chunk(B, 0x004e4942)] : [])]), head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + body.length, 8);
  return new Uint8Array(Buffer.concat([head, body]));
};
// One triangle facing up in glTF (+y), counter-clockwise from above, with a uv in the image's right half.
const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, -1]), uv = new Float32Array([0.8, 0.5, 0.9, 0.5, 0.85, 0.6]), idx = new Uint16Array([0, 1, 2, 0]);
const bin = new Uint8Array(pos.byteLength + uv.byteLength + idx.byteLength);
bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(uv.buffer), 36); bin.set(new Uint8Array(idx.buffer), 60);
const base = (extra = {}) => ({
  asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [0, 2, 0] }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ name: "paint", pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }],
  buffers: [{ byteLength: bin.byteLength }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 60, byteLength: 8 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }],
  ...extra,
});
const m = await parseModel(glb(base(), bin));
assert.equal(m.tris.length, 9, "one triangle");
assert.deepEqual(Array.from(m.tris), [0, 0, 2, 1, 0, 2, 0, 1, 2], "glTF y up → iso z up, the node's 2 m lift applied");
assert.deepEqual([m.col[0], m.materials[0].name], ["#ff0000", "paint"], "colour from the material's base colour (linear → sRGB)");
assert.deepEqual(m.box.min, [0, 0, 2], "bounding box");
const paint = (model, o) => { const c = canvas(), iso = new Iso(c.ctx); iso.cam = { x: 0, y: 0, z: 0, k: 40 }; const r = drawModel(iso, model, o); iso.flush(); return { fills: c.fills(), r }; };
const up = paint(m);
assert.equal(up.fills.length, 1, "a face toward the viewer is painted");
assert.ok(Math.abs(up.r.h) < 1e-9 && Math.abs(up.r.w - 1) < 1e-9, "drawModel returns the drawn size in metres");
assert.equal(paint(m, { size: 2 }).r.w, 2, "size fits the longest side");
assert.equal(paint(m, { palette: { paint: "#00ff00" } }).fills.length, 1, "a palette entry by material name draws");
const flip = await parseModel(glb(base({ accessors: [base().accessors[0], { ...base().accessors[1], byteOffset: 2, count: 3 }] }), bin));
assert.deepEqual(Array.from(flip.tris.slice(0, 3)), [1, 0, 2], "indices read at their offset");
const down = { ...m, tris: Float32Array.from([0, 0, 0, 0, 1, 0, 1, 0, 0]) };
assert.equal(paint(down).fills.length, 0, "a face turned away is culled");
assert.throws(() => paint(m, { max: 0 }), /over 0/, "a model over the triangle budget is refused");
const tex = base({
  meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 }] }],
  materials: [{ name: "atlas", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
  textures: [{ source: 0 }], images: [{ bufferView: 0, mimeType: "image/png" }],
});
const img = { width: 2, height: 1, data: new Uint8ClampedArray([10, 20, 30, 255, 200, 100, 50, 255]) };
const textured = await parseModel(glb(tex, bin), { decodeImage: async () => img });
assert.equal(textured.col[0], "#c86432", "a textured face takes the texel at its uv centre");
assert.equal(textured.materials[0].color, "#c86432", "a textured material's colour is its faces' mean texel");
assert.equal((await parseModel(glb(tex, bin))).col[0], "#ffffff", "no decoder: the material's factor");
await assert.rejects(parseModel(glb(base({ extensionsRequired: ["KHR_draco_mesh_compression"] }), bin)), /compressed/);
await assert.rejects(parseModel(new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "a.bin", byteLength: 1 }] }))), /fetchBuffer/);
console.log("iso-build ok");

// palette.js: triad() keeps three faces apart at any base (tri() collapses a dark or pale one), hue kept, deterministic
{
  const { triad, toOklab } = await import("../engine/iso/palette.js");
  const { tri } = await import("../engine/iso/iso.js");
  const L = (h) => toOklab(h)[0], hue = (h) => { const [, a, b] = toOklab(h); return Math.atan2(b, a); };
  for (const base of ["#22333B", "#0B0B0B", "#F7F5EF", "#FFFFFF", "#009B7D", "#D9503F", "#4A55C8", "#B57300", "#B8C2C6"]) {
    const [t, l, r] = triad(base);
    assert.ok(L(t) - L(l) > 0.07 && L(l) - L(r) > 0.09, `triad(${base}): top > left > right by a readable step: ${[t, l, r]}`);
    if (Math.hypot(...toOklab(base).slice(1)) > 0.05) assert.ok(Math.abs(hue(t) - hue(base)) < 0.2 && Math.abs(hue(r) - hue(base)) < 0.2, `triad(${base}) keeps the hue`);
  }
  const [, , rInk] = tri("#22333B");
  assert.ok(L("#22333B") - L(rInk) < 0.07, "tri() itself collapses a dark base (why triad exists): " + rInk);
  assert.deepEqual(triad("#009B7D"), triad("#009B7D"), "pure");
  assert.throws(() => triad("teal"), /#rrggbb/, "a colour name is refused");
  console.log("palette ok: triad keeps three readable faces at any base");
}
