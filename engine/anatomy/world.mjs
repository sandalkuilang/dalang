// world.mjs — DALANG's own (MIT): engine/iso build() specs checked by Anatomy's geometry audit (audit.mjs, vendored
// unchanged beside it). An Express world is data, so its true shapes can be proved before a frame is drawn:
//
//   const r = auditWorld(WORLD, { values: VALUES, ground: ["slab"], pins: PINS, cut });   // r.ok, r.problems, r.text
//
// It proves, on the real shapes (not boxes): nothing floats (every part rests on a chain of parts down to the ground),
// no object is sunk into another object, no pipe (a sweep) passes through a solid, and every pipe end lands on a part.
// With `pins` (the part names overlays label), each names one part whose pin point the iso camera sees (no other part
// in front of it); with `cut: 1` the skins are off, as in a cutaway beat. A spec with `hero: true` needs at least
// HERO_PARTS parts.
// Parts of one spec may overlap (an object is built of nested parts); two specs may only touch.
// Ground: parts of form board, parts with `ground: true`, and parts or specs named in `ground`. With `floor: z`, a
// plane at that height holds whatever stands on it.
// Unchecked: flat, line and model parts (a model has no shape here), skins with cut > 0. Lengths become audit units
// so the world's longest side is about 100 units: the audit's tolerances (touch 0.15, sunk 0.5) are then 0.15 % and
// 0.5 % of the set. ponytail: one scale per world; split a huge set with a tiny mechanism into two audits.
import * as A from "./audit.mjs";
import { expandKit } from "../iso/kit.js";

const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

// a frame: world = o + rotZ(local * k, a)
const frame = (o, a, k) => ({ o, a, k, at: (p) => add(o, rotZ(mul(p, k), a)), dir: (d) => rotZ(d, a) });
const inside = (F, at, turn, k) => frame(F.at(at), F.a + turn, F.k * k);

// the pin point build() gives a named part: its frame's (0, 0, h), h the form's pin height (null: no pin known)
function pinHeight(p, num, R) {
  const axis = p.axis || (p.form === "wheel" ? "y" : "z");
  switch (p.form) {
    case "box": case "cone": case "figure": return num(p, "h", 1.7);
    case "cyl": return axis === "z" ? num(p, "h") : 2 * num(p, "r");
    case "wheel": case "sphere": return 2 * num(p, "r");
    case "gear": return num(p, "width", 0.01);
    case "lathe": return Math.max(...p.profile.map((q) => R(q[1])));
    case "extrude": return (p.plane || "xy") === "xy" ? num(p, "h") : Math.max(...p.outline.map((q) => R(q[1])));
    case "board": return 0;
    case "sweep": return R(p.path[p.path.length >> 1][2]);
    case "group": return R(p.h) || 0;
    default: return null;
  }
}

export function shapesOf(world, { values = {}, ground = [], floor, cut = 0 } = {}) {
  const R = (v) => (typeof v === "string" && v in values ? values[v] : v);
  const num = (p, f, d) => { const v = R(p[f]); if (v === undefined && d !== undefined) return d; if (!Number.isFinite(v)) throw new Error(`auditWorld: part ${p.name || p.form} needs ${f} (got ${JSON.stringify(p[f])})`); return v; };
  const solids = [], tubes = [], skipped = [], pins = [], isGround = (p, spec) => p.form === "board" || p.ground === true || ground.includes(p.name) || ground.includes(spec.name);
  const put = (shape, p, spec, owner, name) => { shape.name = (isGround(p, spec) ? "stand." : "") + name; shape.owner = owner; solids.push(shape); };
  function parts(list, F, spec, owner, prefix) {
    for (const p of list) {
      const n = p.array ? R(p.array.count) : 1, step = (p.array?.step || [0, 0, 0]).map(R);
      for (let i = 0; i < n; i++) one(p, F, spec, owner, `${prefix}${p.name || p.form}${n > 1 ? "." + i : ""}`, mul(step, i), p.name && (n > 1 ? `${p.name}.${i}` : p.name));
    }
  }
  function one(p, F0, spec, owner, name, off, pinName) {
    if (p.skin && (R(spec.cut ?? cut) || 0) > 0) return skipped.push(name);
    const F = inside(F0, add((p.at || [0, 0, 0]).map(R), off), R(p.turn) || 0, R(p.scale) || 1), k = F.k, z = [0, 0, 1];
    const ph = pinName ? pinHeight(p, num, R) : null;
    if (ph !== null) pins.push({ name: pinName, owner, shape: name, at: F.at([0, 0, ph]) });
    const axes = [F.dir([1, 0, 0]), F.dir([0, 1, 0]), z];
    const up = () => ({ o: F.at([0, 0, 0]), a: z, u: axes[0], v: axes[1] });
    const disc = (o, a, s0, s1, r) => { const u = Math.abs(a[2]) > 0.9 ? axes[0] : z; return A.disc({ o, a, u, v: crossV(a, u) }, s0, s1, r); };
    switch (p.form) {
      case "box": { const w = num(p, "w"), d = num(p, "d"), h = num(p, "h"); if (h > 0) put(A.orientedBox(F.at([0, 0, h / 2]), axes, [w / 2 * k, d / 2 * k, h / 2 * k]), p, spec, owner, name); return; }
      case "cyl": case "wheel": {
        const r = num(p, "r"), h = p.form === "wheel" ? num(p, "width") : num(p, "h"), axis = p.axis || (p.form === "wheel" ? "y" : "z");
        if (h <= 0) return;
        if (axis === "z") return put(disc(F.at([0, 0, 0]), z, 0, h * k, r * k), p, spec, owner, name);
        return put(disc(F.at([0, 0, r]), F.dir(axis === "x" ? [1, 0, 0] : [0, 1, 0]), -h / 2 * k, h / 2 * k, r * k), p, spec, owner, name);
      }
      case "cone": { const r = num(p, "r"), h = num(p, "h"); return put(A.body(up(), [[0, 0], [0, r * k], [h * k, 0]]), p, spec, owner, name); }
      case "sphere": { const r = num(p, "r"); return put(A.ball(F.at([0, 0, r]), r * k), p, spec, owner, name); }
      case "gear": { const m = num(p, "module"), ra = (m * num(p, "teeth")) / 2 + m; return put(disc(F.at([0, 0, 0]), z, 0, num(p, "width", 0.01) * k, ra * k), p, spec, owner, name); }
      case "lathe": { const pr = p.profile.map(([r, h]) => [R(h) * k, R(r) * k]); return put(A.solid(up(), pr), p, spec, owner, name); }
      case "extrude": {
        const h = num(p, "h"), plane = p.plane || "xy", B = { xy: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], xz: [[1, 0, 0], [0, 0, 1], [0, 1, 0]], yz: [[0, 1, 0], [0, 0, 1], [1, 0, 0]] }[plane];
        return put(A.prism({ o: F.at([0, 0, 0]), u: F.dir(B[0]), v: F.dir(B[1]), a: F.dir(B[2]) }, p.outline.map(([u, v]) => [R(u) * k, R(v) * k]), 0, h * k), p, spec, owner, name);
      }
      case "board": { const w = num(p, "w"), d = num(p, "d"), h = (p.layers || [{ h: 0.2 }]).reduce((s, L) => s + R(L.h), 0); return put(A.orientedBox(F.at([0, 0, -h / 2]), axes, [w / 2 * k, d / 2 * k, h / 2 * k]), p, spec, owner, name); }
      case "figure": { const h = num(p, "h", 1.7); return put(A.orientedBox(F.at([0, 0, h / 2]), axes, [0.2 * h * k, 0.2 * h * k, h / 2 * k]), p, spec, owner, name); }
      case "sweep": { const t = A.tube(p.path.map((q) => F.at(q.map(R))), num(p, "r", 0.05) * k, { name, owner: name, object: owner }); /* owner: the pipe's own fittings, so it may land on its own object */ t.tips = [t.points[0], t.points.at(-1)]; t.tipAxes = [unitV(sub(t.points[1], t.points[0])), unitV(sub(t.points.at(-2), t.points.at(-1)))]; t.tipRims = [t.radii[0], t.radii.at(-1)]; t.free = [false, false]; tubes.push(t); return; }
      case "group": return parts(p.parts || [], F, spec, owner, name + ".");
      case "kit": return parts(expandKit(p, R), F, spec, owner, name + ".");
      default: skipped.push(name); // flat, line, model: no solid to prove
    }
  }
  world.forEach((spec, i) => { const owner = spec.name || `spec${i}`; parts(spec.parts || [], frame((spec.at || [0, 0, 0]).map(R), ((R(spec.rot) || 0) * Math.PI) / 2, R(spec.scale) || 1), spec, owner, owner + "."); });
  return { solids, tubes, skipped, pins, floor };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unitV = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// metres -> audit units, every shape (the audit's tolerances are absolute)
function scaled(shape, s) {
  const S = { ...shape };
  delete S._b; // boundsOf caches the box on the shape, in the old units
  if (S.o) S.o = mul(S.o, s);
  if (S.half) S.half = mul(S.half, s);
  if (S.r !== undefined) S.r *= s;
  if (S.F) S.F = { ...S.F, o: mul(S.F.o, s) };
  if (S.poly) S.poly = S.poly.map(([a, b]) => [a * s, b * s]);
  if (S.s0 !== undefined) (S.s0 *= s), (S.s1 *= s);
  if (S.points) S.points = S.points.map((p) => mul(p, s));
  if (S.radii) S.radii = S.radii.map((r) => r * s);
  if (S.tips) S.tips = S.tips.map((p) => p && mul(p, s));
  if (S.tipRims) S.tipRims = S.tipRims.map((r) => r * s);
  return S;
}
const boundsAll = (shapes) => shapes.map(A.boundsOf).reduce((a, b) => ({ min: a.min.map((v, i) => Math.min(v, b.min[i])), max: a.max.map((v, i) => Math.max(v, b.max[i])) }));

export const HERO_PARTS = 15;
export function auditWorld(world, opts = {}) {
  const { solids, tubes, skipped, pins, floor } = shapesOf(world, opts);
  if (!solids.length) throw new Error("auditWorld: the world has no solid part to check");
  const b0 = boundsAll([...solids, ...tubes]), extent = Math.max(...b0.max.map((v, i) => v - b0.min[i])) || 1, s = 100 / extent;
  const S = solids.map((x) => scaled(x, s)), T = tubes.map((x) => scaled(x, s));
  if (Number.isFinite(floor)) S.push(A.box([b0.min[0] * s - 10, b0.min[1] * s - 10, floor * s - 1], [b0.max[0] * s + 10, b0.max[1] * s + 10, floor * s], { name: "stand.floor", owner: "stand.floor" }));
  const held = A.supports(S, T);
  // parts of one object (one spec) may nest; only a sinking between two objects is a fault
  const sunk = held.sunk.filter((d) => { const own = (n) => S.find((x) => x.name === n)?.owner; return own(d.a) !== own(d.b) && !(d.a.startsWith("stand.") && d.b.startsWith("stand.")); });
  const through = T.length ? A.clearances(T, S, { only: "through" }) : [];
  const ends = T.length ? A.terminals(T, S) : [];
  const m = (v) => (v / s).toFixed(3) + " m";
  // pins: the parts an overlay labels (PINS in world.js) exist once and are seen from the iso camera: a ray from the pin
  // toward the viewer (+x +y +z, engine/iso's depth) meets no other part on its way out
  const named = new Map(); for (const q of pins) named.set(q.name, [...(named.get(q.name) ?? []), q]);
  const view = unitV([1, 1, 1]), hidden = [];
  for (const want of opts.pins ?? []) {
    const q = named.get(want);
    if (!q) { hidden.push({ kind: "pin", part: want, text: `pin ${want}: no part has that name (a label would point at nothing)` }); continue; }
    if (q.length > 1) { hidden.push({ kind: "pin", part: want, text: `pin ${want}: ${q.length} parts share the name (${q.map((x) => x.owner).join(", ")}); a label needs one` }); continue; }
    const p0 = mul(q[0].at, s), by = S.find((x) => x.name !== q[0].shape && x.name.replace(/^stand\./, "") !== q[0].shape && [0.6, 1, 2, 4, 8, 16, 32, 64].some((d) => A.sdf(x, add(p0, mul(view, d))) < -0.15));
    if (by) hidden.push({ kind: "pin", part: want, other: by.name, text: `pin ${want} is hidden behind ${by.name.replace(/^stand\./, "")}: its label would point at something the viewer cannot see${opts.cut ? "" : " (a cutaway beat: audit with --cut 1)"}` });
  }
  // a hero object (hero: true) is built of its real parts: at least HERO_PARTS solids and pipes
  const thin = world.map((sp, i) => [sp, sp.name || `spec${i}`]).filter(([sp]) => sp.hero).map(([sp, own]) => [own, [...S, ...T].filter((x) => (x.object ?? x.owner) === own).length]).filter(([, n]) => n < HERO_PARTS);
  const problems = [
    ...held.loose.map((n) => ({ kind: "floats", part: n, text: `${n} floats: it rests on nothing that reaches the ground` })),
    ...held.hanging.map((n) => ({ kind: "floats", part: n, text: `pipe ${n} hangs: nothing holds it` })),
    ...sunk.map((d) => ({ kind: "sunk", part: d.a, other: d.b, text: `${d.a} is sunk ${m(d.depth)} into ${d.b} (two objects drawing through each other)` })),
    ...through.map((c) => ({ kind: "through", part: c.tube, other: c.other, text: `pipe ${c.tube} passes through ${c.other}` })),
    ...ends.map((e) => ({ kind: "loose end", part: e.tube, text: `pipe ${e.tube} ${e.end} lands on nothing (nearest: ${String(e.nearest).replace(/^stand\./, "")})` })),
    ...hidden,
    ...thin.map(([own, n]) => ({ kind: "thin", part: own, text: `hero ${own} has ${n} parts: build it from its real parts (at least ${HERO_PARTS}: base, structure, mechanism, controls, the subject)` })),
  ];
  const text = problems.length ? problems.map((p) => "  " + p.text).join("\n") : "  ok: nothing floats, sinks into another object or passes through";
  return { ok: !problems.length, problems, skipped, text: `iso audit: ${solids.length} solids, ${tubes.length} pipes, ${skipped.length} unchecked\n${text}` };
}
