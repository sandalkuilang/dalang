#!/usr/bin/env node
// node tests/iso-build.mjs — engine/iso forms, build() and the glTF model loader: forms give closed, finite faces;
// every fixture spec draws with no NaN and returns its pins; a meshed gear turns at the tooth ratio; the cutaway removes
// a skin; a value drives a size; focus greys the rest; errors name the part; a GLB is read in metres, z up, coloured by
// its material or texture, with back faces culled, and a compressed or too-heavy model is refused.
import assert from "node:assert/strict";
import { Iso } from "../engine/iso/iso.js";
import { lathe, extrude, sweep, gearOutline } from "../engine/iso/forms.js";
import { build } from "../engine/iso/build.js";
import { parseModel, drawModel } from "../engine/iso/model.js";
import { KIT, expandKit } from "../engine/iso/kit.js";
import { TEMPLATES } from "../engine/iso/templates.js";
import { figureSolids } from "../engine/iso/figure.js";
import { auditWorld } from "../engine/anatomy/world.mjs";

// Neutral fixtures, in metres: nested arrays on a layered board; a value-driven size under a skin; a meshed gear pair
// under a skin; boxes, wheels and a figure for focus.
const EX = {
  arrays: { color: "#CFCABF", parts: [
    { name: "ground", form: "board", w: 30, d: 30, top: "#7BA75F", layers: [{ h: 0.6, color: "#5E8C4A" }, { h: 2, color: "#A77850" }] },
    { name: "base", form: "box", w: 14, d: 14, h: 5, color: "#D9C8A9" },
    { name: "block", form: "extrude", at: [0, 0, 5], outline: [[-6, -6], [6, -6], [6, 2], [2, 2], [2, 6], [-6, 6]], h: 36 },
    { name: "rows", form: "group", at: [6, 0.5, 0], array: { count: 3, step: [0, -3, 0] }, parts: [
      { name: "cell", form: "box", at: [0, 0, 6.5], w: 0.12, d: 1.6, h: 1.8, color: "#5A9BCB", array: { count: 11, step: [0, 0, 3.2] } },
    ] },
    { name: "top", form: "box", at: [-2, -2, 41], w: 6, d: 6, h: 2, color: "#948E83" },
    { name: "rod", form: "cyl", at: [-2, -2, 43], r: 0.2, h: 6, color: "#8C2620" },
  ] },
  level: { color: "#B8B2A6", parts: [
    { name: "pad", form: "box", w: 9, d: 9, h: 0.3, color: "#CFCABF" },
    { name: "legA", form: "cyl", at: [-2.4, -2.4, 0.3], r: 0.18, h: 11.7, array: { count: 2, step: [4.8, 0, 0] } },
    { name: "legB", form: "cyl", at: [-2.4, 2.4, 0.3], r: 0.18, h: 11.7, array: { count: 2, step: [4.8, 0, 0] } },
    { name: "fill", form: "cyl", at: [0, 0, 12.2], r: 3.05, h: "level", color: "#5A9BCB" },
    { name: "shell", form: "lathe", at: [0, 0, 0], skin: true, color: "#D9C8A9", profile: [[0, 12], [3.2, 12], [3.2, 17.2], [2.4, 18.2], [0.4, 18.8], [0, 18.8]] },
    { name: "pipe", form: "sweep", r: 0.15, color: "#948E83", path: [[0, 0, 12], [0, 0, 1.2], [0, 3.5, 1.2], [0, 3.5, 0.3]] },
  ] },
  gears: { color: "#B8B2A6", parts: [
    { name: "base", form: "box", at: [0.12, 0, 0], w: 0.7, d: 0.45, h: 0.04, color: "#948E83" },
    { name: "a", form: "gear", at: [0, 0, 0.12], teeth: 12, module: 0.01, width: 0.03, turn: "drive", color: "#CF5140" },
    { name: "b", form: "gear", at: [0.24, 0, 0.12], teeth: 36, module: 0.01, width: 0.03, mesh: { with: "a" }, color: "#E9BE5C" },
    { name: "shaftA", form: "cyl", at: [0, 0, 0.04], r: 0.012, h: 0.3 },
    { name: "shaftB", form: "cyl", at: [0.24, 0, 0.04], r: 0.016, h: 0.2 },
    { name: "part", form: "cyl", at: [0, 0, 0.34], r: 0.06, h: 0.12, color: "#3C7FB1" },
    { name: "cover", form: "box", at: [0.12, 0, 0.04], w: 0.62, d: 0.4, h: 0.3, skin: true, color: "#D9C8A9" },
  ] },
  focus: { color: "#CFCABF", parts: [
    { name: "base", form: "box", at: [0.4, 0, 0.55], w: 7, d: 2, h: 0.3, color: "#4A3A36" },
    { name: "b", form: "box", at: [-1, 0, 0.85], w: 5, d: 2.4, h: 2.6, color: "#FBF4E6" },
    { name: "a", form: "box", at: [2.6, 0, 0.85], w: 1.8, d: 2.3, h: 2.1, color: "#CF5140" },
    { name: "wheelL", form: "wheel", at: [2.4, 1.05, 0], r: 0.5, width: 0.35, array: { count: 2, step: [-3.6, 0, 0] } },
    { name: "wheelR", form: "wheel", at: [2.4, -1.05, 0], r: 0.5, width: 0.35, array: { count: 2, step: [-3.6, 0, 0] } },
    { name: "person", form: "figure", at: [4.6, 2.2, 0], h: 1.75, pose: "point", color: "#3C7FB1" },
  ] },
};

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
// Ink (iso.meshNow): a box inks its silhouette dark and its lit top rim light, a smooth lathe never its facets;
// iso.ink = null draws the vendor's flat faces; a bevel adds chamfer faces
{
  const strokes = (f) => { const c = canvas(), iso = new Iso(c.ctx, 1080, 1920); iso.cam = { x: 0, y: 0, z: 0, k: 200 }; f(iso); iso.flush(); return c.calls.filter((q) => q[0] === "stroke").length; };
  const box = strokes((iso) => iso.box(-0.5, -0.5, 0, 1, 1, 1, "#3C7FB1"));
  assert.ok(box >= 9 && box <= 14, `a box inks its outline and three top-front edges, got ${box}`);
  assert.equal(strokes((iso) => { iso.ink = null; iso.box(-0.5, -0.5, 0, 1, 1, 1, "#3C7FB1"); }), 0, "ink off: the vendor's flat look");
  const oct = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4) * 0.5, Math.sin(i * Math.PI / 4) * 0.5]);
  const pot = strokes((iso) => iso.cyl(0, 0, 0, 0.5, 1, "#3C7FB1", { n: 8 })), post = strokes((iso) => iso.prism(oct, 0, 1, "#3C7FB1"));
  assert.ok(pot < post, `a smooth cylinder inks no seam between its facets, an octagonal post does (${pot} < ${post})`);
  const fillsOf = (o) => { const c = canvas(), iso = new Iso(c.ctx, 1080, 1920); iso.cam = { x: 0, y: 0, z: 0, k: 200 }; iso.box(-0.5, -0.5, 0, 1, 1, 1, "#3C7FB1", o); iso.flush(); return c.fills().length; };
  assert.equal(fillsOf({ bevel: 0.05 }) - fillsOf({}), 2, "a bevel shows its two front chamfers (the back two face away)");
}
// A WORLD array is ordered as one: a small crate at the far corner of a wide floor paints after the floor
{
  const W = [{ name: "floor", parts: [{ name: "slab", form: "box", at: [0, 0, -0.2], w: 10, d: 10, h: 0.2, color: "#3C7FB1" }] },
    { name: "crate", at: [-4, -4, 0], parts: [{ name: "crate", form: "box", w: 0.5, d: 0.5, h: 0.5, color: "#CF5140" }] }];
  const rgbOf = (f) => f.match(/[\d.]+/g).map(Number), red = (f) => { const [r, , b] = rgbOf(f); return r > b + 40; }, blue = (f) => { const [r, , b] = rgbOf(f); return b > r + 40; };
  const f = draw(W, {}).fills().filter((x) => x.startsWith("rgb") && (red(x) || blue(x)));
  assert.ok(f.findIndex(red) > f.findLastIndex(blue), "the crate paints after the whole floor when the WORLD is built as one");
  const sh = draw(W, {}).calls.filter((q) => q[0] === "fillStyle" && /rgba\(30,26,36/.test(q[1])).length;
  assert.equal(sh, 6, "each object gets a three-ring contact shadow");
  // a cycle elsewhere in the world (two parts each inside the other's box) never undoes the floor-first order
  const cyc = [...W, { name: "pair", at: [3, 3, 0], parts: [{ name: "a", form: "box", w: 1, d: 1, h: 1, color: "#5E8C4A" }, { name: "b", form: "box", w: 1, d: 1, h: 1, color: "#5E8C4A" }] }];
  const fc = draw(cyc, {}).fills().filter((x) => x.startsWith("rgb") && (red(x) || blue(x)));
  assert.ok(fc.findIndex(red) > fc.findLastIndex(blue), "a cycle elsewhere keeps the crate after the floor");
  assert.equal(draw([{ ...W[1], shadow: false }], {}).calls.filter((q) => q[0] === "fillStyle" && /rgba\(30,26,36/.test(q[1])).length, 0, "shadow: false");
}
// Kits: every component draws finite, names its parts under the kit part (pins read front.rim), and stands proven on a
// slab (Anatomy: nothing floats, sinks or is passed through); a path component (pipe, hose, cable) and a handle land on
// what the film mounts them on, so they are left out of the standing proof
{
  const path = [[-0.3, 0, 0.2], [0, 0, 0.2], [0, 0.2, 0.3]];
  for (const k of Object.keys(KIT)) {
    const p = { name: "it", form: "kit", kit: k, ...(["pipe", "hose", "cable"].includes(k) ? { path } : {}) };
    const r = draw([{ name: "x", parts: [p] }], {}, { x: 0, y: 0, z: 0, k: 400 });
    assert.ok(r.fills().length > 0 && !JSON.stringify(r.calls).includes("NaN"), `kit ${k} draws, finite`);
    assert.ok(Object.keys(r.out.at).some((n) => n.startsWith("it.")), `kit ${k}: parts named under the kit part`);
    if (["pipe", "hose", "cable", "handle"].includes(k)) continue;
    // the kit's own parts, proven one by one (the world audit sees a kit as one rigid assembly)
    const W = [{ name: "set", parts: [{ name: "slab", form: "box", at: [0, 0, -0.05], w: 4, d: 4, h: 0.05 }] }, { name: "o", parts: [{ name: "it", form: "group", parts: expandKit(p) }] }];
    assert.deepEqual(auditWorld(W, { ground: ["set"] }).problems.map((q) => q.text), [], `kit ${k} stands proven`);
  }
  assert.throws(() => draw([{ parts: [{ form: "kit", kit: "nope" }] }], {}), /kits: bolt/, "an unknown kit names the kits");
  // a kit is ordered by its own parts: a table at the far corner of a floor paints after the floor
  const tb = draw([{ name: "f", shadow: false, parts: [{ name: "slab", form: "box", at: [0, 0, -0.1], w: 6, d: 6, h: 0.1, color: "#3C7FB1" }] }, { name: "t", at: [-2, -2, 0], parts: [{ name: "t", form: "kit", kit: "table", top: "#CF5140", legs: "#CF5140" }] }], {}).fills().filter((x) => x.startsWith("rgb"));
  const isRed = (f) => { const [r, , b] = f.match(/[\d.]+/g).map(Number); return r > b + 40; }, isBlue = (f) => { const [r, , b] = f.match(/[\d.]+/g).map(Number); return b > r + 40; };
  assert.ok(tb.findIndex(isRed) > tb.findLastIndex(isBlue), "a kit at a floor's far corner paints after the floor");
  const turned = draw([{ parts: [{ name: "v", form: "kit", kit: "vent", face: "x" }] }], {}).out.at;
  assert.ok("v.face" in turned, "face: x turns a face component as one group");
}
// Templates: each style draws finite and, as one assembly, stands on a slab in the world audit
for (const [k, o] of [["car", {}], ["car", { style: "hatch" }], ["car", { style: "van" }], ["room", {}], ["appliance", {}], ["appliance", { kind: "washer" }], ["appliance", { kind: "server" }], ["tree", {}], ["tree", { kind: "pine" }]]) {
  const p = { name: "it", form: "kit", kit: k, ...o }, r = draw([{ name: "x", parts: [p] }], {}, { x: 0, y: 0, z: 0, k: 100 });
  assert.ok(r.fills().length > 10 && !JSON.stringify(r.calls).includes("NaN"), `template ${k} ${o.style || o.kind || ""} draws, finite`);
  const W = [{ name: "set", parts: [{ name: "slab", form: "box", at: [0, 0, -0.05], w: 9, d: 9, h: 0.05 }] }, { name: "o", parts: [p] }];
  assert.deepEqual(auditWorld(W, { ground: ["set"] }).problems.map((q) => q.text), [], `template ${k} stands as one assembly`);
}
assert.ok(Object.keys(TEMPLATES).every((k) => !(k in KIT)), "a template never shadows a kit");
// Figure: a jointed person; feet on the ground in every pose, a seat under the thighs, a hand on its reach target
{
  const zs = (f) => f.solids.flatMap((q) => q.faces.flat().map((p) => p[2]));
  for (const pose of ["stand", "walk", "point", "carry", "crouch", "kneel", "wave"]) {
    const f = figureSolids({ h: 1.7, pose, phase: 0.3 }), z = zs(f);
    assert.ok(Math.abs(Math.min(...z)) < 0.005 && z.every(Number.isFinite), `figure ${pose}: feet on the ground (${Math.min(...z).toFixed(3)})`);
    if (pose === "stand") assert.ok(Math.abs(f.top - 1.7) < 0.05, `a standing figure is its height tall (${f.top.toFixed(2)})`);
  }
  const sit = figureSolids({ h: 1.7, pose: "sit", seat: 0.45 });
  assert.ok(Math.abs(Math.min(...zs(sit))) < 0.005 && sit.top < 1.45, "seated: feet on the floor, the head lower");
  const T = [0.45, -0.15, 0.95], hand = figureSolids({ h: 1.7, pose: "reach", reach: T }).solids.filter((q) => q.color === "#C98B62").at(-3);
  const c = hand.faces.flat().reduce((a, p) => a.map((v, i) => v + p[i] / hand.faces.flat().length), [0, 0, 0]);
  assert.ok(Math.hypot(c[0] - T[0], c[1] - T[1], c[2] - T[2]) < 0.08, "the right hand reaches its target");
  const r = draw([{ parts: [{ name: "mech", form: "figure", h: 1.7, pose: "point", hat: "cap", coat: "#E8E6E1" }] }], {});
  assert.ok(r.fills().length > 40 && Math.abs(r.out.at.mech[2] - 1.7) < 0.08, "build draws the figure in solids, its pin at the head");
}
const S = sweep([[0, 0, 0], [0, 0, 1], [1, 0, 1]], { r: 0.1, n: 6 });
assert.equal(S.length, 2 * 6 + 2, "sweep: a band per segment and two caps");
assert.ok(finite(S), "sweep faces are finite, a vertical leg included");
const G = gearOutline(12, 0.01);
assert.equal(G.length, 48, "a gear outline has four points a tooth");
const radii = G.map(([x, y]) => Math.hypot(x, y));
assert.ok(Math.abs(Math.max(...radii) - 0.07) < 1e-9 && Math.abs(Math.min(...radii) - 0.0475) < 1e-9, "tips at rp + m, roots at rp − 1.25 m");
assert.throws(() => gearOutline(5, 0.01), /teeth/); assert.throws(() => gearOutline(12, 0), /module/);
assert.throws(() => lathe([[1, 0]]), /two points/); assert.throws(() => extrude([[0, 0], [1, 0]]), /three points/);

// Every fixture draws, with no NaN in any call, and pins every named part
for (const [name, spec] of Object.entries(EX)) {
  const r = draw(spec, { values: { level: 3, drive: 0.4 } });
  assert.ok(r.fills().length > 10, `${name} paints faces`);
  assert.ok(!JSON.stringify(r.calls).includes("NaN") && !r.calls.flat().some((v) => typeof v === "number" && !Number.isFinite(v)), `${name}: no NaN or Infinity drawn`);
  for (const p of spec.parts) if (!p.array) assert.ok(p.name in r.out.at && r.out.at[p.name].every(Number.isFinite), `${name}: a pin for ${p.name}`);
  const again = draw(spec, { values: { level: 3, drive: 0.4 } });
  assert.deepEqual(again.calls, r.calls, `${name} draws the same frame twice`);
}
assert.ok("rows.2" in draw(EX.arrays).out.at && "cell.10" in draw(EX.arrays).out.at, "arrays pin each copy as name.k");

// Gears turn at the tooth ratio
const g = draw(EX.gears, { values: { drive: 0.9 } }).out;
assert.ok(Math.abs(g.angle.b - (-0.9 * 12) / 36) < 1e-12, "the 36-tooth gear turns at −12/36 of the 12-tooth one: " + g.angle.b);
assert.throws(() => build(new Iso(canvas().ctx), { parts: [{ name: "b", form: "gear", teeth: 20, module: 0.01, mesh: { with: "a" } }] }), /meshes with a/);

// The cutaway: the skin slides out, then is gone
const shut = draw(EX.gears, { values: { drive: 0 }, cut: 0 }), open = draw(EX.gears, { values: { drive: 0 }, cut: 1 }), half = draw(EX.gears, { values: { drive: 0 }, cut: 0.5 });
assert.ok("cover" in shut.out.at && !("cover" in open.out.at), "cut 1 removes the skin");
assert.ok(half.out.at.cover[0] > shut.out.at.cover[0] && half.out.at.cover[1] > shut.out.at.cover[1], "a skin slides toward the viewer as it opens");
assert.ok(open.fills().length < shut.fills().length, "the open gear pair paints fewer faces");

// A value drives a size
const low = draw(EX.level, { values: { level: 1 } }).out.at.fill, high = draw(EX.level, { values: { level: 4 } }).out.at.fill;
assert.ok(Math.abs(high[2] - low[2] - 3) < 1e-9, "values.level raises the fill by 3 m");

// Focus greys the rest and restores the engine's state
const plain = draw(EX.focus), focused = draw(EX.focus, { focus: "a" });
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
