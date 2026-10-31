// build.js — an object as data, drawn in the Express isometric look (DALANG, MIT). The builder writes a spec from the
// real reference (its parts, sizes in metres, colours) instead of drawing code; build() draws it for frame t, applies
// the cutaway and the focus, turns meshing gears by their tooth ratio, and returns where each named part is, for pins.
//
//   const out = build(iso, spec, { values: { level: 0.6, drive: angle }, cut: p, focus: "pump", models: { crate } });
//   pin(iso, ...out.at.pump, { text: "Pump" });
//
// spec  = { at: [x, y, z], rot: quarter turns, scale, color: base hex, focus, cut, parts: [part, …] }
// spec  … shadow: false (no contact shadow); an array of specs is one WORLD, ordered together
// part  = { name, form, at: [x, y, z] (base centre), color, finish (iso.js FINISH: brushed, knurl, wood, cast, rubber, concrete, tile …; a board's
//          top, each board layer its own), bevel (box: the top edges chamfered, default 8 % of its least side), turn (rad about z), skin: [dx, dy, dz] | true (slides out with
//          cut), group (focus key), array: { count, step: [dx, dy, dz] }, …the form's own fields }
// forms = box { w, d, h } · cyl { r, h, axis 'z'|'x'|'y' } · cone { r, h } · sphere { r } · roof { w, d, h, ridge }
//         lathe { profile: [[r, z], …] } · extrude { outline: [[u, v], …], h, plane } · sweep { path, r }
//         gear { teeth, module, width, mesh: { with, phase } } · wheel { r, width, axis } · board { w, d, layers: [{ h, color }] }
//         figure { h, pose stand|walk|point|carry|reach|sit|crouch|kneel|wave, phase, reach [x,y,z], seat, lean, look, joints,
//                  color (shirt), legs, skinTone, hair, hairStyle, hat 'cap', sleeves, coat, shoes } (figure.js) · model { model: key in state.models, size, max, texels }
//         flat { outline } · line { path, width, dash } · group { parts } · kit { kit, …its fields } (kit.js: components)
//         plate { plate: key in state.plates, w, d, spin, spread, tint, flows, marks } (plate.js: the user's photo, traced)
// Any number field may name a key of state.values instead ("h": "level"), so the timeline drives the spec.
// Parts are painted in an order taken from their boxes (one wholly below, behind or left of another goes first), so a
// thin wide plate never covers what stands on it; parts whose boxes interlock fall back to the engine's depth.
import { TAU } from "./iso.js";
import { solid, lathe, extrude, sweep, gearOutline } from "./forms.js";
import { drawModel } from "./model.js";
import { expandKit } from "./kit.js";
import { figureSolids } from "./figure.js";
import { drawPlate, plateMarks } from "./plate.js";

const FORMS = new Set(["box", "cyl", "cone", "sphere", "roof", "lathe", "extrude", "sweep", "gear", "wheel", "board", "figure", "model", "flat", "line", "group", "kit", "plate"]);
const NEAR = [0.7071, 0.7071, 0]; // a skin with skin: true slides toward the viewer (depth is x + y + z)

// spec may be an array (a whole WORLD): its objects are then ordered together, so a small thing beside a wide floor is
// painted after the floor wherever it stands.
export function build(iso, spec, state = {}) {
  const s = { values: {}, models: {}, cut: 0, ...state }, out = { at: {}, angle: {}, teeth: {} }, list = [];
  const R = (v) => (typeof v === "string" && v in s.values ? s.values[v] : v);
  for (const sp of Array.isArray(spec) ? spec : [spec]) {
    const keep0 = iso.keep, alpha0 = iso.alpha, focus = R(sp.focus ?? s.focus), from = list.length;
    if (focus) iso.desat = R(s.desat ?? 1); // the engine greys at flush: it stays set for this frame, so the rest of the set greys too
    const [x, y, z] = (sp.at || [0, 0, 0]).map(R);
    iso.push(x, y, z, ((R(sp.rot) || 0) * Math.PI) / 2, R(sp.scale) || 1);
    try { parts(iso, sp.parts || [], { s, R, focus, base: sp.color || "#B8B2A6", out, list, alpha0, cut: Math.min(Math.max(R(sp.cut ?? s.cut) || 0, 0), 1) }); }
    finally { iso.pop(); iso.keep = keep0; iso.alpha = alpha0; }
    if (sp.shadow !== false) shadow(iso, list, from);
  }
  order(iso, list);
  return out;
}

// A soft contact shadow under an object: the footprint of its parts that reach its lowest point, in three widening
// rings, ordered after what it stands on and before the object.
function shadow(iso, list, from) {
  const mine = list.slice(from); if (!mine.length) return;
  const z = Math.min(...mine.map((e) => e.min[2])), low = mine.filter((e) => e.min[2] <= z + 0.03);
  const x0 = Math.min(...low.map((e) => e.min[0])), x1 = Math.max(...low.map((e) => e.max[0])), y0 = Math.min(...low.map((e) => e.min[1])), y1 = Math.max(...low.map((e) => e.max[1]));
  const size = Math.max(x1 - x0, y1 - y0); if (!(size > 0)) return;
  const start = iso.items.length;
  for (const [e, a] of [[0.12, 0.04], [0.06, 0.05], [0.015, 0.08]]) { const m = e * size; iso.flat([[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m]], z, "#1E1A24", { a, layer: 1 }); }
  list.push({ flat: true, start, end: iso.items.length, min: [x0, y0, z + 1e-4], max: [x1, y1, z + 2e-4] });
}

function parts(iso, list, c) {
  for (const p of list) {
    if (!FORMS.has(p.form)) throw new Error(`build: part ${p.name || "?"} has form "${p.form}"; forms: ${[...FORMS].join(", ")}`);
    const n = p.array ? c.R(p.array.count) : 1, step = (p.array?.step || [0, 0, 0]).map(c.R);
    for (let k = 0; k < n; k++) one(iso, p, c, k, n > 1 ? step.map((v) => v * k) : [0, 0, 0], n > 1);
  }
}

function one(iso, p, c, k, off, many) {
  const { R, out } = c, name = many ? `${p.name}.${k}` : p.name, at = (p.at || [0, 0, 0]).map(R);
  let turn = R(p.turn) || 0;
  if (p.form === "gear") {
    out.teeth[p.name] = R(p.teeth);
    if (p.mesh) {
      const drv = p.mesh.with;
      if (!(drv in out.angle)) throw new Error(`build: gear ${p.name} meshes with ${drv}, which must come before it in parts`);
      turn = (-out.angle[drv] * out.teeth[drv]) / R(p.teeth) + (R(p.mesh.phase) || 0); // the ratio decides it, never a second animation
    }
  }
  if (p.name && !many) out.angle[p.name] = turn;
  if (p.skin) {
    if (c.cut >= 1) return;
    const d = p.skin === true ? NEAR : p.skin, away = (R(p.away) ?? 1.5) * c.cut;
    off = [off[0] + d[0] * away, off[1] + d[1] * away, off[2] + d[2] * away];
    iso.alpha = c.alpha0 * (c.cut < 0.7 ? 1 : 1 - (c.cut - 0.7) / 0.3);
  } else iso.alpha = c.alpha0;
  if (c.focus) iso.keep = p.name === c.focus || p.group === c.focus;
  iso.push(at[0] + off[0], at[1] + off[1], at[2] + off[2], turn, R(p.scale) || 1);
  const start = iso.items.length;
  try {
    const [h, b] = draw(iso, p, c, R, p.color ? R(p.color) : c.base);
    if (p.name) out.at[name] = iso.w(0, 0, h);
    if (p.form !== "group" && p.form !== "kit" && iso.items.length > start) { // a group or kit is ordered by its own parts
      const W = [0, 1].flatMap((i) => [0, 1].flatMap((j) => [0, 1].map((q) => iso.w(b[i ? 3 : 0], b[j ? 4 : 1], b[q ? 5 : 2]))));
      c.list.push({ start, end: iso.items.length, min: [0, 1, 2].map((a) => Math.min(...W.map((v) => v[a]))), max: [0, 1, 2].map((a) => Math.max(...W.map((v) => v[a]))) });
    }
  } finally { iso.pop(); }
}

// Each form draws at the part's frame and returns [pin height, local box [x0, y0, z0, x1, y1, z1]].
function draw(iso, p, c, R, col) {
  const num = (f, d) => { const v = R(p[f]); if (v === undefined) { if (d !== undefined) return d; throw new Error(`build: part ${p.name || p.form} needs ${f}`); } if (!Number.isFinite(v)) throw new Error(`build: part ${p.name || p.form}: ${f} is not a number (${JSON.stringify(p[f])})`); return v; };
  const span = (pts, i) => [Math.min(...pts.map((q) => q[i])), Math.max(...pts.map((q) => q[i]))], fin = p.finish;
  switch (p.form) {
    case "box": { const w = num("w"), d = num("d"), h = num("h"); if (h > 0) iso.box(-w / 2, -d / 2, 0, w, d, h, col, { cull: false, bevel: R(p.bevel) ?? Math.min(w, d, h * 0.5, 0.5) * 0.08, finish: fin }); return [h, [-w / 2, -d / 2, 0, w / 2, d / 2, h]]; }
    case "cyl": {
      const r = num("r"), h = num("h"), axis = p.axis || "z"; if (h <= 0) return [0, [0, 0, 0, 0, 0, 0]];
      if (axis === "z") { iso.cyl(0, 0, 0, r, h, col, { cull: false, n: p.n, finish: fin }); return [h, [-r, -r, 0, r, r, h]]; }
      iso.cyl(axis === "x" ? -h / 2 : 0, axis === "y" ? -h / 2 : 0, r, r, h, col, { axis, cull: false, n: p.n, finish: fin });
      return [2 * r, axis === "x" ? [-h / 2, -r, 0, h / 2, r, 2 * r] : [-r, -h / 2, 0, r, h / 2, 2 * r]];
    }
    case "cone": { const r = num("r"), h = num("h"); iso.cone(0, 0, 0, r, h, col, { cull: false, finish: fin }); return [h, [-r, -r, 0, r, r, h]]; }
    case "sphere": { const r = num("r"); iso.sphere(0, 0, r, r, col, { cull: false }); return [2 * r, [-r, -r, 0, r, r, 2 * r]]; }
    case "roof": { const w = num("w"), d = num("d"), h = num("h"); iso.roof(-w / 2, -d / 2, 0, w, d, h, col, { ridge: p.ridge || "x", over: R(p.over) || 0 }); return [h, [-w / 2, -d / 2, 0, w / 2, d / 2, h]]; }
    case "lathe": {
      const pr = p.profile.map(([r, z]) => [R(r), R(z)]), r = Math.max(...pr.map((q) => q[0])), [z0, z1] = span(pr, 1);
      solid(iso, lathe(pr, { n: p.n || 24 }), col, { smooth: true, finish: fin }); return [z1, [-r, -r, z0, r, r, z1]];
    }
    case "extrude": {
      const h = num("h"), plane = p.plane || "xy", F = extrude(p.outline, { h, plane }), all = F.flat();
      solid(iso, F, col, { finish: fin }); const [x0, x1] = span(all, 0), [y0, y1] = span(all, 1), [z0, z1] = span(all, 2); return [z1, [x0, y0, z0, x1, y1, z1]];
    }
    case "sweep": {
      const path = p.path.map((q) => q.map(R)), r = num("r", 0.05); solid(iso, sweep(path, { r, n: p.n || 8, closed: !!p.closed }), col, { smooth: true, finish: fin });
      const [x0, x1] = span(path, 0), [y0, y1] = span(path, 1), [z0, z1] = span(path, 2); return [path[path.length >> 1][2], [x0 - r, y0 - r, z0 - r, x1 + r, y1 + r, z1 + r]];
    }
    case "gear": {
      const w = num("width", 0.01), m = num("module"), ra = (m * num("teeth")) / 2 + m;
      solid(iso, extrude(gearOutline(num("teeth"), m), { h: w }), col, { finish: fin }); return [w, [-ra, -ra, 0, ra, ra, w]];
    }
    case "wheel": {
      const r = num("r"), w = num("width"), axis = p.axis || "y", hub = p.hub ? R(p.hub) : "#CFCABF";
      const at = (len) => (axis === "x" ? [-len / 2, 0, r] : [0, -len / 2, r]);
      iso.cyl(...at(w), r, w, p.color ? col : "#3A3330", { axis, cull: false });
      iso.cyl(...at(w * 1.04), r * 0.5, w * 1.04, hub, { axis, cull: false, bias: 0.01 });
      return [2 * r, axis === "x" ? [-w / 2, -r, 0, w / 2, r, 2 * r] : [-r, -w / 2, 0, r, w / 2, 2 * r]];
    }
    case "board": {
      const w = num("w"), d = num("d"); let z = 0;
      for (const L of p.layers || [{ h: 0.2, color: col }]) { const h = R(L.h); iso.box(-w / 2, -d / 2, z - h, w, d, h, R(L.color) || col, { cull: false, finish: L.finish }); z -= h; }
      // the top over the first layer's own top face (a ground decal under layer 0 would sit under the board and never show)
      const W0 = iso.w(0, 0, -R((p.layers || [{ h: 0.2 }])[0].h) / 2);
      if (p.top) iso.flat([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]], 0.001, R(p.top), { finish: fin, layer: 1, depth: W0[0] + W0[1] + W0[2] + 1e-6 });
      return [0, [-w / 2, -d / 2, z, w / 2, d / 2, 0]];
    }
    case "figure": {
      // a jointed 3D person (figure.js); color is the shirt, legs the trousers, skinTone the skin
      const pt = (v) => (Array.isArray(v) ? v.map(R) : undefined), f = figureSolids({ h: num("h", 1.7), pose: p.pose || "stand", phase: R(p.phase) || 0, reach: pt(p.reach), reachL: pt(p.reachL),
        seat: R(p.seat), lean: R(p.lean), look: R(p.look), joints: p.joints && Object.fromEntries(Object.entries(p.joints).map(([k, v]) => [k, R(v)])),
        skin: p.skinTone, hair: p.hair, hairStyle: p.hairStyle || (p.hat === "cap" ? "cap" : undefined), cap: p.hatColor, shirt: col, sleeves: p.sleeves, pants: p.legs, shoes: p.shoes, coat: p.coat, belt: p.belt });
      for (const q of f.solids) solid(iso, q.faces, q.color, { smooth: q.smooth });
      const hh = num("h", 1.7); return [f.top, [-0.2 * hh, -0.2 * hh, 0, 0.2 * hh, 0.2 * hh, f.top]];
    }
    case "plate": {
      // the user's own thing, traced from their photo (plate.js): upright at the part's point, its layers moved by values
      const t = c.s.plates?.[p.plate];
      if (!t) throw new Error(`build: part ${p.name || "?"} names plate "${p.plate}", not in state.plates (await loadPlates(WORLD) first)`);
      const w = num("w"), hgt = (w * (t.bbox[3] - t.bbox[1])) / (t.bbox[2] - t.bbox[0]), r = R(p.d) ?? w / 2.8;
      iso.bill(0, 0, 0, (g) => drawPlate(g, t, w, { value: (v) => Number(R(v)) || 0, spin: p.spin, spread: p.spread, tint: p.tint, flows: p.flows }), { r: w, cull: false });
      for (const [n, q] of Object.entries(plateMarks(t, w, p.marks))) c.out.at[`${p.name}.${n}`] = iso.w(...q);
      return [hgt, [-r, -r, 0, r, r, hgt]];
    }
    case "model": {
      const m = c.s.models[p.model];
      if (!m) throw new Error(`build: part ${p.name || "?"} names model "${p.model}", not in state.models (await loadModel first)`);
      const r = drawModel(iso, m, { size: R(p.size), scale: R(p.modelScale), color: p.color ? col : undefined, palette: p.palette, max: R(p.max), texels: !!p.texels });
      return [r.h, [-r.w / 2, -r.d / 2, 0, r.w / 2, r.d / 2, r.h]];
    }
    case "flat": {
      const o = p.outline.map((q) => q.map(R)); iso.flat(o, 0.001, col);
      const [x0, x1] = span(o, 0), [y0, y1] = span(o, 1); return [0, [x0, y0, 0, x1, y1, 0.001]];
    }
    case "line": {
      const path = p.path.map((q) => q.map(R)); iso.line3(path, col, R(p.width) || 3, { dash: p.dash });
      const [x0, x1] = span(path, 0), [y0, y1] = span(path, 1), [z0, z1] = span(path, 2); return [path[path.length >> 1][2], [x0, y0, z0, x1, y1, z1]];
    }
    case "group": { parts(iso, p.parts || [], { ...c, base: col }); return [R(p.h) || 0, [0, 0, 0, 0, 0, 0]]; }
    case "kit": { parts(iso, expandKit(p, R, p.name ? `${p.name}.` : ""), { ...c, base: col }); return [R(p.h) || 0, [0, 0, 0, 0, 0, 0]]; }
  }
}

// Paint order from the parts' world boxes: A goes before B when A lies wholly on the far side of B along an axis (the
// viewer looks down −(1, 1, 1)) or inside B (a closed housing covers what it holds), which the centre depth alone gets
// wrong for a wide flat plate under a small part. Kahn's
// order, ties by centre depth; each part's items keep their own order and get depths that respect the part order.
function order(iso, list) {
  const n = list.length; if (n < 2) return;
  // a shadow (flat) is never "inside": it lies on what it falls on
  const eps = 1e-6, far = (A, B) => [0, 1, 2].some((a) => A.max[a] <= B.min[a] + eps) || (!A.flat && [0, 1, 2].every((a) => A.min[a] >= B.min[a] - eps && A.max[a] <= B.max[a] + eps));
  const centre = list.map((e) => (e.min[0] + e.max[0] + e.min[1] + e.max[1] + e.min[2] + e.max[2]) / 2);
  const after = list.map(() => []), deg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && far(list[i], list[j]) && (!far(list[j], list[i]) ? true : centre[i] < centre[j])) { after[i].push(j); deg[j]++; }
  const done = new Array(n).fill(false), seq = [];
  while (seq.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && deg[i] === 0 && (pick < 0 || centre[i] < centre[pick])) pick = i;
    // a cycle: break it where the fewest parts still wait to go first (ties by centre depth), so one cycle never undoes
    // the order of the rest of the world
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || deg[i] < deg[pick] || (deg[i] === deg[pick] && centre[i] < centre[pick]))) pick = i;
    done[pick] = true; seq.push(pick); for (const j of after[pick]) deg[j]--;
  }
  let d = -Infinity;
  for (const i of seq) {
    const items = iso.items.slice(list[i].start, list[i].end).sort((a, b) => a.d - b.d || a.s - b.s);
    d = Math.max(centre[i], d + 1e-3);
    items.forEach((it, k) => { it.d = d + k * 1e-9; });
  }
}
