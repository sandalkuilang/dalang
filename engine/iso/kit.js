// kit.js — components every made thing is assembled from (DALANG, MIT). Never a catalogue of finished objects: a
// motorcycle, a pump, a kitchen and a server rack are the same few dozen components at their own sizes. A part
// { form: "kit", kit: "tyre", r: 0.28, width: 0.09 } expands into ordinary build() parts (box, cyl, lathe, extrude, sweep),
// so build(), the cutaway, focus, pins and Anatomy's audit all see real parts. Sizes in metres; the kit's frame is the
// part's (at = base centre, z up); a face component (panel, vent, screen, button, …) stands in the xz plane facing +y
// (face: "x" turns it to face +x). Any number may name a key of values.
//
//   { name: "front", form: "kit", kit: "tyre", at: [0.62, 0, 0], r: 0.27, width: 0.09, spokes: 0, spin: "roll" }

export const STEEL = "#A7AEB4", DARK = "#2C2D31", RUBBER = "#2A2B2F", CHROME = "#D9DEE2", GLASS = "#A9CFE0", WOOD = "#B98B5A";
import { TEMPLATES } from "./templates.js";

const TAU = Math.PI * 2;
const part = (name, form, at, o = {}) => ({ name, form, at, ...o });
const circle = (r, n = 28, cu = 0, cv = 0, a0 = 0) => Array.from({ length: n }, (_, i) => [cu + Math.cos(a0 + (i / n) * TAU) * r, cv + Math.sin(a0 + (i / n) * TAU) * r]);
// a short round stud on a face: centred at `at`, its axis along y (the face's normal), standing proud by h
const stud = (name, at, r, h, color, n = 12) => part(name, "cyl", [at[0], at[1] + h / 2, at[2] - r], { axis: "y", r, h, color, n });

export const KIT = {
  // fasteners
  bolt: ({ r = 0.006, color = STEEL }) => [part("washer", "cyl", [0, 0, 0], { r: r * 2.1, h: r * 0.3, color, n: 16 }), part("head", "cyl", [0, 0, r * 0.3], { r: r * 1.7, h: r * 0.9, color, n: 6 })],
  rivets: ({ count = 4, step = 0.05, r = 0.004, color = STEEL }) => [stud("rivet", [0, 0, r], r, r * 0.8, color, 8)].map((p) => ({ ...p, array: { count, step: [step, 0, 0] } })),
  // faces: a plate with its seam and corner screws, louvres, a screen in its bezel, controls, a label
  panel: ({ w = 0.4, h = 0.3, d = 0.012, color = "#D9D6CF", screws = true, seams = 0 }) => {
    const m = Math.min(w, h) * 0.08, r = Math.min(w, h) * 0.018, out = [part("plate", "box", [0, 0, 0], { w, d, h, color, bevel: d * 0.4 })];
    if (screws) for (const [x, z] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) out.push(stud(`screw${out.length}`, [x * (w / 2 - m), d / 2, z ? h - m : m], r, r * 0.6, STEEL, 8));
    for (let i = 1; i <= seams; i++) out.push(part(`seam${i}`, "box", [-w / 2 + (i * w) / (seams + 1), d / 2 + 0.0005, h * 0.02], { w: Math.max(0.002, w * 0.006), d: 0.001, h: h * 0.96, color: DARK, bevel: 0 }));
    return out;
  },
  vent: ({ w = 0.3, h = 0.15, slots = 6, color = "#BFC3C7" }) => {
    const out = [part("frame", "box", [0, 0, 0], { w, d: 0.01, h, color, bevel: 0.003 })], g = (h * 0.8) / slots;
    for (let i = 0; i < slots; i++) out.push(part(`slot${i}`, "box", [0, 0.006, h * 0.1 + i * g + g * 0.2], { w: w * 0.84, d: 0.004, h: g * 0.45, color: DARK, bevel: 0 }), part(`lip${i}`, "box", [0, 0.009, h * 0.1 + i * g + g * 0.62], { w: w * 0.84, d: 0.006, h: g * 0.22, color, bevel: 0 }));
    return out;
  },
  grille: ({ w = 0.2, h = 0.2, r = 0.006, color = DARK, plate = "#BFC3C7" }) => {
    const out = [part("plate", "box", [0, 0, 0], { w, d: 0.008, h, color: plate, bevel: 0.002 })], s = r * 3, nx = Math.max(1, Math.floor((w - s) / s)), nz = Math.max(1, Math.floor((h - s) / s));
    out.push({ ...stud("hole", [-((nx - 1) * s) / 2, 0.004, (h - (nz - 1) * s) / 2], r, 0.001, color, 8), array: { count: nx, step: [s, 0, 0] } });
    return out.concat(Array.from({ length: nz - 1 }, (_, j) => ({ ...stud(`hole_${j}`, [-((nx - 1) * s) / 2, 0.004, (h - (nz - 1) * s) / 2 + (j + 1) * s], r, 0.001, color, 8), array: { count: nx, step: [s, 0, 0] } })));
  },
  screen: ({ w = 0.3, h = 0.2, color = DARK, glass = "#3B5568", glow = null }) => [
    part("bezel", "box", [0, 0, 0], { w, d: 0.014, h, color, bevel: 0.004 }),
    part("glass", "box", [0, 0.008, h * 0.07], { w: w * 0.9, d: 0.002, h: h * 0.86, color: glow || glass, bevel: 0 }),
    part("glare", "box", [-w * 0.22, 0.0095, h * 0.5], { w: w * 0.18, d: 0.001, h: h * 0.38, color: "#7A93A3", bevel: 0 }),
  ],
  button: ({ r = 0.012, color = "#CF5140" }) => [stud("ring", [0, 0, r * 1.4], r * 1.4, r * 0.4, DARK, 16), stud("cap", [0, r * 0.4, r * 1.4], r, r * 0.6, color, 16)],
  knob: ({ r = 0.015, color = DARK }) => [stud("knob", [0, 0, r], r, r * 1.2, color, 16), part("mark", "box", [0, r * 1.2 + 0.0005, r * 1.3], { w: r * 0.18, d: 0.001, h: r * 0.7, color: "#F2EFE8", bevel: 0 })],
  led: ({ r = 0.004, color = "#7BD88F" }) => [stud("led", [0, 0, r], r, r * 0.8, color, 10)],
  handle: ({ w = 0.12, r = 0.007, reach = 0.035, color = STEEL }) => [part("grip", "sweep", [0, 0, 0], { r, color, n: 8, path: [[-w / 2, 0, 0], [-w / 2, reach, 0], [w / 2, reach, 0], [w / 2, 0, 0]] })].map((p) => ({ ...p, at: [0, 0, r] })),
  label: ({ w = 0.12, h = 0.06, color = "#F2EFE8", ink = "#3A3A3F", lines = 3 }) => [part("plate", "box", [0, 0, 0], { w, d: 0.002, h, color, bevel: 0 }),
    ...Array.from({ length: lines }, (_, i) => part(`line${i}`, "box", [-(w * (i ? 0.1 : 0)), 0.0012, h * (0.68 - i * 0.22)], { w: w * (i ? 0.6 : 0.8), d: 0.0005, h: h * 0.08, color: ink, bevel: 0 }))],
  hinge: ({ h = 0.08, r = 0.008, color = STEEL }) => [part("leaf", "box", [0, 0, 0], { w: r * 3, d: 0.003, h, color, bevel: 0 }), part("knuckle", "cyl", [0, 0.003 + r, 0], { r, h, color, n: 10 })],
  // flow: pipes with flanges, hoses with fittings, cables; any path, any direction
  pipe: ({ path, r = 0.03, color = STEEL, flanges = true }) => {
    const out = [part("pipe", "sweep", [0, 0, 0], { path, r, color, n: 14 })];
    if (flanges) for (const [i, j] of [[0, 1], [path.length - 1, path.length - 2]]) { const a = path[i], b = path[j], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, t = Math.min(r * 0.5, L / 4), u = (b[0] - a[0]) / L, v = (b[1] - a[1]) / L, w = (b[2] - a[2]) / L; out.push(part(`flange${i}`, "sweep", [0, 0, 0], { r: r * 1.6, n: 14, color, path: [a, [a[0] + u * t, a[1] + v * t, a[2] + w * t]] })); }
    return out;
  },
  hose: ({ path, r = 0.012, color = RUBBER, fitting = CHROME }) => {
    const out = [part("hose", "sweep", [0, 0, 0], { path, r, color, n: 12 })];
    for (const [i, j] of [[0, 1], [path.length - 1, path.length - 2]]) { const a = path[i], b = path[j], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1, t = Math.min(r * 2.2, L / 3); out.push(part(`fitting${i}`, "sweep", [0, 0, 0], { r: r * 1.3, n: 8, color: fitting, path: [a, [a[0] + ((b[0] - a[0]) / L) * t, a[1] + ((b[1] - a[1]) / L) * t, a[2] + ((b[2] - a[2]) / L) * t]] })); }
    return out;
  },
  cable: ({ path, r = 0.004, color = DARK }) => [part("cable", "sweep", [0, 0, 0], { path, r, color, n: 6 })],
  // motion: a tyre with its tread, rim, hub and spokes; a coil spring; cooling fins
  tyre: ({ r = 0.3, width = 0.1, axis = "y", color = RUBBER, rim = "#C9CED3", spokes = 5, tread = true, spin = 0 }) => {
    // coaxial discs, each a little prouder on the seen (+y or +x) side than the one before it, so they paint in order
    const plane = axis === "x" ? "yz" : "xz", at = axis === "x" ? [-width / 2, 0, 0] : [0, -width / 2, 0], ring = (rr, n = 36) => circle(rr, n, 0, r, spin);
    const blocks = Math.max(16, Math.round(r * 100)), treadO = Array.from({ length: blocks * 4 }, (_, i) => { const a = spin + (i / (blocks * 4)) * TAU, q = i % 4 < 2 ? r : r * 0.975; return [Math.cos(a) * q, r + Math.sin(a) * q]; });
    const disc = (name, rr, proud, colr, n) => part(name, "extrude", at, { plane, h: width + proud, color: colr, outline: rr === r ? (tread ? treadO : ring(r, 40)) : ring(rr, n) });
    const out = [disc("tyre", r, 0, color), disc("wall", r * 0.84, 0.003, "#3A3B40"), disc("rim", r * 0.66, 0.006, rim), disc("hub", r * 0.16, 0.02, "#8A9198", 16)];
    // spokes: thin plates standing on the rim's face, from the hub to the rim
    const hw = r * 0.03, at2 = axis === "x" ? [width / 2 + 0.006, 0, 0] : [0, width / 2 + 0.006, 0];
    for (let i = 0; i < spokes; i++) { const a = spin + (i / spokes) * TAU, c = Math.cos(a), s = Math.sin(a), q0 = r * 0.16, q1 = r * 0.62; out.push(part(`spoke${i}`, "extrude", at2, { plane, h: 0.005, color: rim, outline: [[c * q0 - s * hw, r + s * q0 + c * hw], [c * q1 - s * hw, r + s * q1 + c * hw], [c * q1 + s * hw, r + s * q1 - c * hw], [c * q0 + s * hw, r + s * q0 - c * hw]] })); }
    return out;
  },
  spring: ({ r = 0.03, h = 0.15, turns = 6, wire = 0.004, color = "#C9A04A" }) => {
    const n = Math.round(turns * 14), path = Array.from({ length: n + 1 }, (_, i) => [Math.cos((i / 14) * TAU) * r, Math.sin((i / 14) * TAU) * r, wire + (i / n) * (h - 2 * wire)]);
    return [part("seat", "cyl", [0, 0, 0], { r: r + wire, h: wire * 0.6, color: DARK }), part("coil", "sweep", [0, 0, 0], { path, r: wire, color, n: 6 }), part("cap", "cyl", [0, 0, h - wire * 0.6], { r: r + wire, h: wire * 0.6, color: DARK })];
  },
  fins: ({ w = 0.2, d = 0.2, h = 0.15, count = 8, round = false, color = "#B9BEC2", core = round ? w * 0.3 : w * 0.6 }) => {
    const t = (h / count) * 0.35, g = h / count, out = [];
    out.push(round ? part("core", "cyl", [0, 0, 0], { r: core, h, color: DARK, n: 24 }) : part("core", "box", [0, 0, 0], { w: core, d: core, h, color: DARK, bevel: 0 }));
    for (let i = 0; i < count; i++) out.push(round ? part(`fin${i}`, "cyl", [0, 0, i * g + (g - t) / 2], { r: w / 2, h: t, color, n: 28 }) : part(`fin${i}`, "box", [0, 0, i * g + (g - t) / 2], { w, d, h: t, color, bevel: t * 0.3 }));
    return out;
  },
  // containers
  bottle: ({ h = 0.25, r = 0.04, color = "#D9A53A", cap = DARK, label = "#F2EFE8" }) => [
    part("body", "lathe", [0, 0, 0], { color, n: 24, profile: [[0, 0], [r * 0.92, 0], [r, r * 0.12], [r, h * 0.62], [r * 0.82, h * 0.74], [r * 0.38, h * 0.84], [r * 0.38, h * 0.9], [0, h * 0.9]] }),
    part("label", "cyl", [0, 0, h * 0.22], { r: r * 1.006, h: h * 0.3, color: label, n: 24 }),
    part("cap", "cyl", [0, 0, h * 0.9], { r: r * 0.44, h: h * 0.1, color: cap, n: 16 }),
  ],
  drum: ({ r = 0.29, h = 0.88, color = "#3C7FB1" }) => [part("drum", "cyl", [0, 0, 0], { r, h, color, n: 32 }),
    ...[0.02, h * 0.33, h * 0.66, h - 0.025].map((z, i) => part(`rib${i}`, "cyl", [0, 0, z], { r: r * 1.02, h: 0.012, color, n: 32 })),
    part("bung", "cyl", [r * 0.55, 0, h], { r: r * 0.09, h: 0.012, color: STEEL, n: 12 })],
  pan: ({ r = 0.2, h = 0.08, color = "#2C2D31", fill = null, level = 0.5 }) => [part("pan", "lathe", [0, 0, 0], { color, n: 28, profile: [[0, 0], [r * 0.8, 0], [r, h], [r * 1.05, h], [r * 0.95, h * 1.02], [r * 0.76, h * 0.12], [r * 0.76 - 0.001, h * 0.12]] }),
    ...(fill ? [part("fill", "cyl", [0, 0, h * 0.12], { r: r * (0.78 + 0.16 * level), h: Math.max(0.002, h * 0.88 * level), color: fill, n: 28 })] : [])],
  can: ({ w = 0.18, d = 0.1, h = 0.26, color = "#CF5140" }) => [part("body", "box", [0, 0, 0], { w, d, h, color, bevel: Math.min(w, d) * 0.12 }),
    part("grip", "sweep", [0, 0, 0], { r: 0.008, n: 8, color, path: [[-w * 0.3, 0, h], [-w * 0.3, 0, h + 0.04], [w * 0.1, 0, h + 0.04], [w * 0.1, 0, h]] }),
    part("spout", "cyl", [w * 0.32, 0, h], { r: 0.014, h: 0.03, color: DARK, n: 12 })],
  crate: ({ w = 0.5, d = 0.4, h = 0.3, color = WOOD, slats = 3 }) => { const out = [part("base", "box", [0, 0, 0], { w, d, h: 0.02, color })], s = h / slats; for (let i = 0; i < slats; i++) for (const [n, y, ww, dd] of [["f", d / 2 - 0.01, w, 0.02], ["b", -d / 2 + 0.01, w, 0.02]]) out.push(part(`${n}${i}`, "box", [0, y, 0.02 + i * s], { w: ww, d: dd, h: s * 0.7, color })); for (const x of [-1, 1]) out.push(part(`end${x}`, "box", [x * (w / 2 - 0.01), 0, 0.02], { w: 0.02, d: d - 0.04, h: h - 0.02, color })); return out; },
  carton: ({ w = 0.4, d = 0.3, h = 0.3, color = "#C9A274", tape = "#E8D9B5" }) => [part("box", "box", [0, 0, 0], { w, d, h, color, bevel: 0.004 }), part("tape", "box", [0, 0, h], { w: w * 1.0, d: d * 0.16, h: 0.002, color: tape, bevel: 0 })],
  // places: windows, doors, furniture, plants, lamps
  window: ({ w = 1.0, h = 1.2, frame = "#F2EFE8", glass = GLASS }) => [
    part("frame", "box", [0, 0, 0], { w, d: 0.06, h, color: frame, bevel: 0.01 }),
    part("glass", "box", [0, 0.026, h * 0.06], { w: w * 0.88, d: 0.012, h: h * 0.88, color: glass, bevel: 0 }),
    part("mullion", "box", [0, 0.034, h * 0.06], { w: 0.03, d: 0.012, h: h * 0.88, color: frame, bevel: 0 }),
    part("glare", "box", [-w * 0.24, 0.0335, h * 0.4], { w: w * 0.1, d: 0.002, h: h * 0.4, color: "#D7EAF2", bevel: 0 }),
    part("sill", "box", [0, 0.04, -0.03], { w: w * 1.08, d: 0.1, h: 0.03, color: frame, bevel: 0.006 }),
  ],
  door: ({ w = 0.9, h = 2.05, color = "#C99A6A", frame = "#F2EFE8" }) => [part("frame", "box", [0, 0, 0], { w: w + 0.1, d: 0.05, h: h + 0.05, color: frame, bevel: 0.008 }), part("leaf", "box", [0, 0.02, 0], { w, d: 0.04, h, color, bevel: 0.006 }),
    part("panelA", "box", [0, 0.041, h * 0.55], { w: w * 0.7, d: 0.004, h: h * 0.36, color, bevel: 0.004 }), part("panelB", "box", [0, 0.041, h * 0.08], { w: w * 0.7, d: 0.004, h: h * 0.36, color, bevel: 0.004 }),
    part("knob", "sphere", [w * 0.38, 0.055, h * 0.47], { r: 0.03, color: CHROME })],
  table: ({ w = 1.2, d = 0.7, h = 0.75, top = WOOD, legs = "#3A3B40" }) => [part("top", "box", [0, 0, h - 0.04], { w, d, h: 0.04, color: top, bevel: 0.01 }), part("apron", "box", [0, 0, h - 0.12], { w: w - 0.12, d: d - 0.12, h: 0.08, color: legs, bevel: 0 }),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => part(`leg${i}`, "box", [x * (w / 2 - 0.06), y * (d / 2 - 0.06), 0], { w: 0.045, d: 0.045, h: h - 0.04, color: legs, bevel: 0.006 }))],
  chair: ({ h = 0.45, color = "#3A3B40", seat = "#CF5140" }) => [part("seat", "box", [0, 0, h - 0.04], { w: 0.44, d: 0.42, h: 0.05, color: seat, bevel: 0.015 }), part("back", "box", [-0.2, 0, h + 0.01], { w: 0.03, d: 0.4, h: 0.4, color: seat, bevel: 0.01 }),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => part(`leg${i}`, "cyl", [x * 0.18, y * 0.17, 0], { r: 0.014, h: h - 0.04, color, n: 10 }))],
  shelf: ({ w = 0.9, d = 0.3, h = 1.8, levels = 4, color = "#8A9096", board = WOOD }) => [...[-1, 1].flatMap((x) => [-1, 1].map((y) => part(`post${x}${y}`, "box", [x * (w / 2 - 0.02), y * (d / 2 - 0.02), 0], { w: 0.03, d: 0.03, h, color, bevel: 0.004 }))),
    ...Array.from({ length: levels }, (_, i) => part(`board${i}`, "box", [0, 0, 0.08 + (i * (h - 0.12)) / (levels - 1)], { w, d, h: 0.025, color: board, bevel: 0.005 }))],
  plant: ({ h = 0.6, pot = "#C8674A", leaf = "#5E8C4A" }) => [part("pot", "lathe", [0, 0, 0], { color: pot, n: 20, profile: [[0, 0], [h * 0.16, 0], [h * 0.21, h * 0.3], [h * 0.23, h * 0.3], [h * 0.23, h * 0.34], [0, h * 0.34]] }),
    // leaves in a clump, each resting on the soil or on the one below it
    ...[[0, 0, 0.34, 0.17], [-0.1, 0.06, 0.34, 0.11], [0.1, -0.05, 0.34, 0.12], [0.03, 0.04, 0.6, 0.1]].map(([x, y, z, r], i) => part(`leaf${i}`, "sphere", [x * h, y * h, z * h], { r: r * h, color: leaf }))],
  lamp: ({ h = 0.5, color = "#2C2D31", glow = "#FFE7A3" }) => [part("base", "cyl", [0, 0, 0], { r: h * 0.16, h: h * 0.05, color, n: 20 }), part("stem", "cyl", [0, 0, h * 0.05], { r: h * 0.02, h: h * 0.62, color, n: 8 }),
    part("shade", "lathe", [0, 0, h * 0.62], { color, n: 20, profile: [[h * 0.22, 0], [h * 0.1, h * 0.3], [0, h * 0.3]] }), part("bulb", "sphere", [0, 0, h * 0.6], { r: h * 0.07, color: glow })],
  // tools on a bench
  wrench: ({ l = 0.2, color = CHROME }) => { const w = l * 0.12; return [part("wrench", "extrude", [0, 0, 0], { h: w * 0.25, color, outline: [[-l / 2, -w * 0.3], [l / 2 - w, -w * 0.3], [l / 2 - w * 0.6, -w], [l / 2 + w * 0.3, -w * 0.7], [l / 2 + w * 0.1, -w * 0.15], [l / 2 + w * 0.5, w * 0.1], [l / 2 + w * 0.3, w * 0.7], [l / 2 - w * 0.6, w], [l / 2 - w, w * 0.3], [-l / 2, w * 0.3]] })]; },
  screwdriver: ({ l = 0.2, color = "#CF5140" }) => [part("grip", "cyl", [-l * 0.25, 0, 0], { axis: "x", r: l * 0.07, h: l * 0.45, color, n: 8 }), part("shaft", "cyl", [l * 0.22, 0, l * 0.07 - l * 0.016], { axis: "x", r: l * 0.016, h: l * 0.5, color: CHROME, n: 8 })],
  funnel: ({ r = 0.08, color = "#E9BE5C" }) => [part("funnel", "lathe", [0, 0, 0], { color, n: 20, profile: [[0, 0], [r * 0.15, 0], [r * 0.15, r * 0.8], [r, r * 1.6], [0, r * 1.6]] }), part("mouth", "cyl", [0, 0, r * 1.6], { r: r * 0.92, h: 0.002, color: DARK, n: 20 })],
  cone: ({ h = 0.5, color = "#E8712F" }) => [part("base", "box", [0, 0, 0], { w: h * 0.62, d: h * 0.62, h: h * 0.05, color: DARK, bevel: 0.005 }), part("cone", "cone", [0, 0, h * 0.05], { r: h * 0.24, h: h * 0.95, color, n: 20 }), part("band", "cyl", [0, 0, h * 0.42], { r: h * 0.15, h: h * 0.12, color: "#F2EFE8", n: 20 })],
};

// one kit part → its parts, each name under prefix (build() passes "front." so pins read front.rim); face: "x" turns a
// face component to face +x
export function expandKit(p, R = (v) => v, prefix = "") {
  const make = KIT[p.kit] || TEMPLATES[p.kit];
  if (!make) throw new Error(`kit: "${p.kit}" is not a kit; kits: ${Object.keys(KIT).join(", ")}; templates: ${Object.keys(TEMPLATES).join(", ")}`);
  const o = {};
  for (const [k, v] of Object.entries(p)) if (!["name", "form", "kit", "at", "turn", "face", "array", "skin", "group", "scale"].includes(k)) o[k] = Array.isArray(v) ? v.map((q) => (Array.isArray(q) ? q.map(R) : R(q))) : R(v);
  const parts = make(o).map((q) => ({ ...q, name: prefix + q.name }));
  return p.face === "x" ? [{ name: `${prefix}face`, form: "group", turn: -Math.PI / 2, parts }] : parts;
}
