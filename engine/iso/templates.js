// templates.js — the made things films need most, as parametric assemblies of kit components (DALANG, MIT): a two-
// wheeler, a car, a single-cylinder engine that runs and opens, a room, appliances, a tree. Written in a spec like a kit
// ({ form: "kit", kit: "motorbike", style: "scooter", color: "#…" }); each is a function of its sizes, so one template
// is many real models. Facing +x, base centre at the part's at, metres. A thing with no template is assembled from
// kits the same way.
import { STEEL, DARK, RUBBER, CHROME } from "./kit.js";

const part = (name, form, at, o = {}) => ({ name, form, at, ...o });
const kit = (name, k, at, o = {}) => ({ name, form: "kit", kit: k, at, ...o });
const arc = (cx, cz, r, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; });
// a side profile (x, z) pushed across y, centred
const side = (name, outline, width, color, y = 0) => part(name, "extrude", [0, y - width / 2, 0], { plane: "xz", h: width, color, outline });

export const TEMPLATES = {
  // a two-wheeler: style scooter (a step-through body, a floorboard) or underbone (an open frame, a lighter body)
  motorbike: ({ style = "scooter", color = "#E8E6E1", trim = DARK, seat = "#2A2B2F", r = 0.27, spin = 0, lit = 0 }) => {
    const fx = 0.64, rx = -0.6, open = style === "underbone", out = [
      kit("rear", "tyre", [rx, 0, 0], { r, width: 0.1, spokes: 0, spin, rim: "#8A9198" }),
      kit("front", "tyre", [fx, 0, 0], { r: r * 0.95, width: 0.08, spokes: 5, spin, rim: "#C9CED3" }),
      // frame, fork, handlebar with grips and mirrors, headlamp
      part("frame", "sweep", [0, 0, 0], { r: 0.022, color: open ? "#C9CED3" : DARK, n: 8, path: [[0.46, 0, 0.86], [0.3, 0, 0.48], [0.08, 0, 0.3], [-0.3, 0, 0.36], [-0.5, 0, 0.6]] }),
      ...[-1, 1].map((s) => part(`fork${s}`, "sweep", [0, 0, 0], { r: 0.017, color: CHROME, n: 8, path: [[0.47, s * 0.055, 0.95], [fx, s * 0.055, r * 0.95]] })),
      part("bar", "sweep", [0, 0, 0], { r: 0.012, color: CHROME, n: 8, path: [[0.38, -0.32, 1.04], [0.43, -0.2, 1.03], [0.46, 0, 1.0], [0.43, 0.2, 1.03], [0.38, 0.32, 1.04]] }),
      ...[-1, 1].map((s) => part(`grip${s}`, "cyl", [0.38, s * 0.33 - (s > 0 ? 0.04 : 0), 1.04 - 0.017], { axis: "y", r: 0.017, h: 0.1, color: RUBBER, n: 10 })),
      ...[-1, 1].map((s) => part(`mirrorStem${s}`, "sweep", [0, 0, 0], { r: 0.006, color: DARK, n: 6, path: [[0.42, s * 0.24, 1.03], [0.4, s * 0.28, 1.2]] })),
      ...[-1, 1].map((s) => part(`mirror${s}`, "cyl", [0.4, s * 0.28, 1.2 - 0.04], { axis: "x", r: 0.04, h: 0.02, color: DARK, n: 14 })),
      part("cowl", "extrude", [0, -0.09, 0], { plane: "xz", h: 0.18, color, outline: [[0.42, 0.95], [0.6, 0.98], [0.62, 0.86], [0.5, 0.7], [0.36, 0.68], [0.38, 0.92]] }),
      part("lamp", "cyl", [0.6, 0, 0.9 - 0.05], { axis: "x", r: 0.05, h: 0.05, color: lit ? "#FFF3B8" : "#F4F1E6", n: 16 }),
      part("fender", "extrude", [0, -0.06, 0], { plane: "xz", h: 0.12, color, outline: [...arc(fx, r * 0.95, r * 1.08, Math.PI * 0.15, Math.PI * 0.85), ...arc(fx, r * 0.95, r * 1.0, Math.PI * 0.85, Math.PI * 0.15)] }),
      // the body: leg shield, floorboard and the rear body over the engine (scooter); a slimmer cover (underbone)
      side("shield", open ? [[0.38, 0.88], [0.46, 0.88], [0.36, 0.42], [0.28, 0.42]] : [[0.36, 0.92], [0.48, 0.9], [0.4, 0.42], [0.3, 0.32], [0.2, 0.32], [0.28, 0.6]], open ? 0.12 : 0.36, color),
      ...(open ? [] : [part("floor", "box", [-0.05, 0, 0.3], { w: 0.5, d: 0.34, h: 0.04, color: trim, bevel: 0.01 })]),
      side("body", open ? [[-0.25, 0.62], [-0.72, 0.68], [-0.8, 0.62], [-0.62, 0.5], [-0.2, 0.42]] : [[-0.28, 0.34], [-0.2, 0.62], [-0.55, 0.72], [-0.82, 0.68], [-0.86, 0.56], [-0.7, 0.42], [-0.38, 0.34]], open ? 0.22 : 0.34, color),
      part("seat", "extrude", [0, -0.14, 0], { plane: "xz", h: 0.28, color: seat, outline: [[-0.18, 0.66], [-0.2, 0.74], [-0.4, 0.78], [-0.68, 0.76], [-0.74, 0.7], [-0.6, 0.68], [-0.3, 0.64]] }),
      part("tail", "box", [-0.84, 0, 0.6], { w: 0.04, d: 0.14, h: 0.05, color: "#CF5140", bevel: 0.006 }),
      // engine, exhaust and the rear shock
      part("crankcase", "box", [-0.32, -0.02, 0.18], { w: 0.28, d: 0.22, h: 0.16, color: "#8A9096", bevel: 0.02 }),
      kit("barrel", "fins", [-0.2, -0.02, 0.34], { w: 0.14, d: 0.14, h: 0.1, count: 5, color: "#B9BEC2" }),
      kit("exhaust", "pipe", [0, 0, 0], { r: 0.022, flanges: false, color: "#8A9096", path: [[-0.18, -0.08, 0.36], [-0.12, -0.14, 0.2], [-0.4, -0.16, 0.18], [-0.62, -0.17, 0.3]] }),
      part("muffler", "cyl", [-0.95, -0.17, 0.3 - 0.05], { axis: "x", r: 0.05, h: 0.36, color: "#5A6066", n: 14 }),
      kit("shock", "spring", [-0.56, 0.1, 0.28], { r: 0.022, h: 0.3, turns: 7, wire: 0.004 }),
      part("stand", "sweep", [0, 0, 0], { r: 0.01, color: DARK, n: 6, path: [[-0.2, 0.12, 0.2], [-0.24, 0.24, 0.0]] }),
    ];
    return out;
  },
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
  // a single-cylinder engine: crankcase, finned barrel (a skin the cutaway slides off), head, spark plug; the piston and
  // connecting rod follow the crank angle (crank, rad), the crankcase and barrel are skins the cutaway slides off, the
  // sump holds oil (oil: colour, level: 0–1), a dipstick on top
  engine: ({ bore = 0.052, stroke = 0.058, crank = 0, color = "#B9BEC2", case: cs = "#8A9096", oil = "#C8902A", level = 0.6 }) => {
    const rc = stroke / 2, rod = stroke * 1.8, zc = 0.16, pin = [rc * Math.sin(crank), zc + rc * Math.cos(crank)], pz = zc + rc * Math.cos(crank) + Math.sqrt(rod * rod - (rc * Math.sin(crank)) ** 2);
    const top = zc + rc + rod + 0.04 + 0.03, wc = 0.17;
    return [
      { ...side("crankcase", [[-0.1, 0], [0.1, 0], [0.135, 0.04], [0.14, 0.17], [0.1, 0.235], [-0.1, 0.235], [-0.14, 0.17], [-0.135, 0.04]], wc, cs), skin: [0, 1, 0] },
      part("sumpOil", "box", [0, 0, 0.005], { w: 0.24, d: wc - 0.03, h: Math.max(0.002, 0.07 * level), color: oil, bevel: 0 }),
      part("crankDisc", "cyl", [0, -0.03, zc - 0.07], { axis: "y", r: 0.07, h: 0.04, color: STEEL, n: 24 }),
      part("crankPin", "cyl", [pin[0], 0.0, pin[1] - 0.012], { axis: "y", r: 0.012, h: 0.04, color: CHROME, n: 12 }),
      part("rod", "sweep", [0, 0, 0], { r: 0.009, color: CHROME, n: 8, path: [[pin[0], 0.03, pin[1]], [0, 0.03, pz]] }),
      part("piston", "cyl", [0, 0.03, pz - 0.02], { r: bore / 2, h: 0.045, color: "#D9DEE2", n: 20 }),
      part("ring", "cyl", [0, 0.03, pz + 0.012], { r: bore / 2 + 0.0008, h: 0.004, color: "#5A6066", n: 20 }),
      { ...kit("barrel", "fins", [0, 0.03, 0.24], { w: bore * 2.4, d: bore * 2.4, h: top - 0.27, count: 7, round: true, core: bore * 0.62, color }), skin: [0, 1, 0] },
      part("head", "box", [0, 0.03, top - 0.03], { w: bore * 2.2, d: bore * 2.2, h: 0.05, color, bevel: 0.008 }),
      part("plug", "cyl", [0.02, 0.03, top + 0.02], { r: 0.008, h: 0.04, color: CHROME, n: 8 }),
      part("plugCap", "cyl", [0.02, 0.03, top + 0.06], { r: 0.012, h: 0.035, color: DARK, n: 10 }),
      part("dipstick", "cyl", [-0.08, 0, 0.235], { r: 0.012, h: 0.03, color: "#E9BE5C", n: 12 }),
    ];
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
  // appliances: kind fridge, washer, ac (a wall unit), server (a rack)
  appliance: ({ kind = "fridge", color = "#E8E6E1" }) => {
    if (kind === "washer") return [part("body", "box", [0, 0, 0], { w: 0.6, d: 0.6, h: 0.85, color, bevel: 0.02 }),
      part("drumRing", "cyl", [0, 0.3 + 0.01, 0.42 - 0.2], { axis: "y", r: 0.2, h: 0.03, color: "#C9CED3", n: 28 }), part("drumGlass", "cyl", [0, 0.3 + 0.025, 0.42 - 0.15], { axis: "y", r: 0.15, h: 0.02, color: "#5D7F95", n: 28 }),
      { ...kit("display", "screen", [0.12, 0.3, 0.74], { w: 0.14, h: 0.06, glow: "#7FC4D8" }) }, kit("dial", "knob", [-0.16, 0.3, 0.75], { r: 0.03, color: "#C9CED3" }), kit("start", "button", [0.24, 0.3, 0.75], { r: 0.012 })];
    if (kind === "ac") return [part("body", "box", [0, 0, 0], { w: 0.9, d: 0.22, h: 0.3, color, bevel: 0.04 }), kit("vent", "vent", [0, 0.11, 0.03], { w: 0.75, h: 0.08, slots: 3, color }), kit("led", "led", [0.36, 0.11, 0.22], {})];
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
