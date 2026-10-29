// templates.js — common made things as parametric assemblies of kit components (DALANG, MIT): a car, a room, appliances,
// a tree. Written in a spec like a kit ({ form: "kit", kit: "car", style: "hatch", color: "#…" }); each is a function
// of its sizes, so one template
// is many real models. Facing +x, base centre at the part's at, metres. A thing with no template is assembled from
// kits the same way.
import { DARK, CHROME } from "./kit.js";

const part = (name, form, at, o = {}) => ({ name, form, at, ...o });
const kit = (name, k, at, o = {}) => ({ name, form: "kit", kit: k, at, ...o });
const arc = (cx, cz, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });
// a side profile (x, z) pushed across y, centred
const side = (name, outline, width, color, y = 0) => part(name, "extrude", [0, y - width / 2, 0], { plane: "xz", h: width, color, outline });

export const TEMPLATES = {
  // a car: style sedan, hatch or van; the body is its side profile with the wheel arches cut, the glasshouse above it
  car: ({ style = "sedan", color = "#CF5140", glass = "#3B5568", w = 1.75, r = 0.31, spin = 0, lit = 0 }) => {
    const L = style === "van" ? 4.6 : style === "hatch" ? 3.9 : 4.6, f = L / 2, wb = style === "hatch" ? 2.45 : 2.75, ax = [wb / 2, -wb / 2], ar = r * 1.18, sill = 0.3;
    const body = [[f, 0.36], [f, 0.72], [f - 0.15, 0.8], ...(style === "van" ? [[f - 0.55, 0.92]] : [[f - 0.9, 0.88]]), [-f + 0.2, 0.92], [-f, 0.82], [-f, 0.38],
      [-f + 0.12, sill], ...arc(ax[1], r, ar, Math.PI, 0, 10).slice(1, -1), ...[[ax[1] + ar, sill], [ax[0] - ar, sill]], ...arc(ax[0], r, ar, Math.PI, 0, 10).slice(1, -1), [ax[0] + ar, sill], [f - 0.12, sill]];
    const roof = style === "van" ? [[f - 0.55, 0.92], [f - 0.95, 1.75], [-f + 0.1, 1.78], [-f + 0.05, 0.92]] : style === "hatch" ? [[f - 0.95, 0.88], [f - 1.55, 1.42], [-f + 0.35, 1.44], [-f + 0.1, 0.92]] : [[f - 1.0, 0.88], [f - 1.65, 1.4], [-f + 1.15, 1.42], [-f + 0.45, 0.92]];
    const out = [
      side("body", body.reverse(), w, color),
      side("glass", roof, w - 0.12, glass),
      part("roof", "box", [(roof[1][0] + roof[2][0]) / 2, 0, roof[1][1]], { w: Math.abs(roof[1][0] - roof[2][0]), d: w - 0.14, h: 0.05, color, bevel: 0.02 }),
      part("pillar", "box", [(roof[0][0] + roof[1][0] + roof[2][0] + roof[3][0]) / 4 - 0.05, 0, 0.88], { w: 0.08, d: w - 0.1, h: roof[1][1] - 0.88, color, bevel: 0 }),
      part("bumperF", "box", [f, 0, 0.36], { w: 0.08, d: w * 0.98, h: 0.16, color: DARK, bevel: 0.02 }),
      part("bumperR", "box", [-f, 0, 0.36], { w: 0.08, d: w * 0.98, h: 0.16, color: DARK, bevel: 0.02 }),
      ...[-1, 1].map((s) => part(`lamp${s}`, "box", [f + 0.005, s * (w / 2 - 0.2), 0.6], { w: 0.02, d: 0.3, h: 0.1, color: lit ? "#FFF3B8" : "#F4F1E6", bevel: 0.01 })),
      ...[-1, 1].map((s) => part(`tail${s}`, "box", [-f - 0.005, s * (w / 2 - 0.18), 0.66], { w: 0.02, d: 0.26, h: 0.1, color: "#B3352B", bevel: 0.01 })),
      part("grille", "box", [f + 0.004, 0, 0.5], { w: 0.01, d: w * 0.4, h: 0.12, color: DARK, bevel: 0 }),
      ...[-1, 1].map((s) => part(`mirror${s}`, "box", [f - 1.0, s * (w / 2 + 0.06), 0.95], { w: 0.08, d: 0.12, h: 0.08, color, bevel: 0.015 })),
      part("seam", "box", [0, w / 2 + 0.0005, 0.4], { w: 0.006, d: 0.001, h: 0.48, color: DARK, bevel: 0 }),
      ...[-0.15, 0.85].map((x, i) => part(`handle${i}`, "box", [x - 0.4, w / 2 + 0.006, 0.78], { w: 0.12, d: 0.012, h: 0.025, color: CHROME, bevel: 0.004 })),
    ];
    for (const [i, x] of ax.entries()) for (const s of [-1, 1]) out.push(kit(`wheel${i}${s > 0 ? "L" : "R"}`, "tyre", [x, s * (w / 2 - 0.12), 0], { r, width: 0.2, spokes: 5, spin, rim: "#B9BEC2" }));
    return out;
  },
  // a room: floor, two back walls with skirting, a window and a door (use shadow: false on the room's spec)
  room: ({ w = 4, d = 3.5, h = 2.6, floor = "#C9A27A", wall = "#E9E4DA", wall2 = "#DDD6C8", window = true, door = true }) => [
    part("floor", "board", [0, 0, 0], { w, d, layers: [{ h: 0.12, color: floor }, { h: 0.08, color: "#8A7058" }] }),
    part("wallBack", "box", [0, -d / 2 + 0.05, 0], { w, d: 0.1, h, color: wall, bevel: 0 }),
    part("wallLeft", "box", [-w / 2 + 0.05, 0.05, 0], { w: 0.1, d: d - 0.1, h, color: wall2, bevel: 0 }),
    part("skirtBack", "box", [0, -d / 2 + 0.11, 0], { w: w - 0.1, d: 0.02, h: 0.1, color: "#F6F3EC", bevel: 0.004 }),
    part("skirtLeft", "box", [-w / 2 + 0.11, 0.06, 0], { w: 0.02, d: d - 0.12, h: 0.1, color: "#F6F3EC", bevel: 0.004 }),
    ...(window ? [kit("window", "window", [w * 0.12, -d / 2 + 0.1, 0.9], { w: Math.min(1.4, w * 0.35), h: 1.2 })] : []),
    ...(door ? [kit("door", "door", [-w / 2 + 0.1, d * 0.15, 0], { face: "x" })] : []),
  ],
  // appliances: kind fridge, washer, server (a rack)
  appliance: ({ kind = "fridge", color = "#E8E6E1" }) => {
    if (kind === "washer") return [part("body", "box", [0, 0, 0], { w: 0.6, d: 0.6, h: 0.85, color, bevel: 0.02 }),
      part("drumRing", "cyl", [0, 0.3 + 0.01, 0.42 - 0.2], { axis: "y", r: 0.2, h: 0.03, color: "#C9CED3", n: 28 }), part("drumGlass", "cyl", [0, 0.3 + 0.025, 0.42 - 0.15], { axis: "y", r: 0.15, h: 0.02, color: "#5D7F95", n: 28 }),
      { ...kit("display", "screen", [0.12, 0.3, 0.74], { w: 0.14, h: 0.06, glow: "#7FC4D8" }) }, kit("dial", "knob", [-0.16, 0.3, 0.75], { r: 0.03, color: "#C9CED3" }), kit("start", "button", [0.24, 0.3, 0.75], { r: 0.012 })];
    if (kind === "server") return [part("rack", "box", [0, 0, 0], { w: 0.6, d: 0.8, h: 1.9, color: DARK, bevel: 0.01 }),
      ...Array.from({ length: 9 }, (_, i) => [kit(`unit${i}`, "panel", [0, 0.4, 0.12 + i * 0.19], { w: 0.52, h: 0.16, d: 0.01, color: "#3A3B40", screws: true }), kit(`led${i}`, "led", [0.2, 0.41, 0.12 + i * 0.19 + 0.06], { color: i % 3 ? "#7BD88F" : "#E9BE5C" })]).flat()];
    return [part("body", "box", [0, 0, 0], { w: 0.7, d: 0.68, h: 1.8, color, bevel: 0.03 }), part("seam", "box", [0, 0.34 + 0.0005, 1.2], { w: 0.66, d: 0.002, h: 0.006, color: DARK, bevel: 0 }),
      kit("handleTop", "handle", [0.28, 0.34, 1.45], { w: 0.2, color: "#C9CED3" }), kit("handleLow", "handle", [0.28, 0.34, 0.95], { w: 0.2, color: "#C9CED3" })];
  },
  // a tree: kind round (a broadleaf) or pine; a trunk, and a crown that rests on it
  tree: ({ h = 4, kind = "round", leaf = "#5E8C4A", bark = "#7A5A40" }) => kind === "pine"
    ? [part("trunk", "cyl", [0, 0, 0], { r: h * 0.03, h: h * 0.3, color: bark, n: 10 }), ...[0, 1, 2].map((i) => part(`tier${i}`, "cone", [0, 0, h * (0.2 + i * 0.22)], { r: h * (0.26 - i * 0.06), h: h * (0.42 - i * 0.06), color: leaf, n: 16 }))]
    : [part("trunk", "lathe", [0, 0, 0], { color: bark, n: 12, profile: [[0, 0], [h * 0.05, 0], [h * 0.035, h * 0.15], [h * 0.03, h * 0.5], [0, h * 0.5]] }),
      ...[[0, 0, 0.4, 0.26], [-0.14, 0.1, 0.48, 0.18], [0.15, -0.08, 0.5, 0.19], [0.03, 0.04, 0.7, 0.2]].map(([x, y, z, r], i) => part(`crown${i}`, "sphere", [x * h, y * h, z * h], { r: r * h, color: leaf }))],
};
