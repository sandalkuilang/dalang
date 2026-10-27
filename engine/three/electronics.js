import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";
import { wire } from "./circuit.js";
import { markings, textSize } from "./markings.js";

// Electronics at their real size: a printed circuit board and parts from a small catalogue, placed by reference
// designator, with the markings they carry in life (ratings, model numbers, silkscreen, colour bands, conductor colours)
// printed through markings.js. Sizes in metres in the catalogue and the options, positions on a board in millimetres from
// its centre (x along w, z along d, the board lies on y = 0), positions in scene units (metres / M) everywhere else.
// Nothing here adds itself to the scene: add `board.group` where it belongs, with its cables.
//
//   const b = board({ at, w: 0.072, d: 0.048 });                                      // FR-4, 1.6 mm, solder mask green
//   b.place("C2", "cap.electrolytic", { size: "10x16", at: [28, -3], print: ["22µF", "400V"] });
//   b.place("R1", "resistor", { size: "0.25W", at: [14, 3], value: 4700 });          // yellow violet red gold
//   b.trace(["C2:1", [20, -3], "R1:2"]);                                              // follows the layout; flow() can run on it
//   scene.add(b.group, ...b.traces.map((w) => w.group));
//
// Every catalogue row names its source: the sizes are the standard case or package sizes of that family, and the table is
// the one place a built size is checked against (selfcheck: every body is within 1 % of it, scaleAudit tol 0.01). A film
// takes the sizes of its own part from its sources and passes them as `size` objects, or adds a row, never these values.
// The part values and prints in examples/psu.js are example values.

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const mm = (v) => v / 1000;

// ---- catalogue ----------------------------------------------------------------------------------------------------
// Metres. Single-size families have the size "std". `pitch` is the lead pitch, `lead` the lead diameter.
export const PARTS = {
  "cap.electrolytic": { source: "standard radial aluminium electrolytic case sizes (diameter x height, e.g. the Nichicon / Panasonic radial series tables)", sizes: {
    "5x11": { d: 0.005, h: 0.011, pitch: 0.002, lead: 0.0005 }, "6.3x11": { d: 0.0063, h: 0.011, pitch: 0.0025, lead: 0.0005 }, "8x11.5": { d: 0.008, h: 0.0115, pitch: 0.0035, lead: 0.0006 },
    "10x16": { d: 0.010, h: 0.016, pitch: 0.005, lead: 0.0006 }, "10x20": { d: 0.010, h: 0.020, pitch: 0.005, lead: 0.0006 }, "12.5x20": { d: 0.0125, h: 0.020, pitch: 0.005, lead: 0.0006 },
    "16x25": { d: 0.016, h: 0.025, pitch: 0.0075, lead: 0.0008 } } },
  "cap.film": { source: "box-type film capacitor datasheets (width x depth x height, lead pitch P)", sizes: {
    P10: { w: 0.013, d: 0.005, h: 0.011, pitch: 0.010 }, P15: { w: 0.018, d: 0.006, h: 0.012, pitch: 0.015 } } },
  resistor: { source: "carbon film resistor datasheets (body length x diameter, lead pitch; e.g. Yageo CFR-25 and CFR-50), colour code IEC 60062", sizes: {
    "0.25W": { l: 0.006, d: 0.0023, pitch: 0.010 }, "0.5W": { l: 0.009, d: 0.003, pitch: 0.0125 } } },
  "ic.dip8": { source: "JEDEC MS-001 8-pin plastic DIP: body 9.27 x 6.35 x 3.3 mm, pin pitch 2.54 mm, row spacing 7.62 mm", sizes: {
    std: { w: 0.00927, d: 0.00635, h: 0.0033, pins: 8, pitch: 0.00254, row: 0.00762 } } },
  "ic.to220": { source: "JEDEC TO-220AB: plastic body 10 x 4.5 mm and tab, 15.5 mm over everything, lead pitch 2.54 mm; the heatsink is a declared size of its own", sizes: {
    std: { w: 0.010, d: 0.0045, h: 0.0155, pins: 3, pitch: 0.00254, heatsink: { w: 0.021, d: 0.012, h: 0.025 } } } },
  relay: { source: "sugar-cube PCB power relay datasheets (19 x 15.5 x 15.3 mm, 5 pins)", sizes: { std: { w: 0.019, d: 0.0155, h: 0.0153, pins: 5 } } },
  "fuse.5x20": { source: "IEC 60127-2 5 x 20 mm cartridge fuse in a PCB holder (the holder is declared on its own)", sizes: {
    std: { l: 0.020, d: 0.005, holder: { w: 0.0225, d: 0.0075, h: 0.0085 } } } },
  varistor: { source: "disc metal-oxide varistor datasheets (disc diameter D, thickness, lead pitch), series 07D and 14D", sizes: {
    "07D": { D: 0.009, t: 0.0045, pitch: 0.005 }, "14D": { D: 0.017, t: 0.006, pitch: 0.0075 } } },
  "terminal.5.08": { source: "5.08 mm pitch PCB screw terminal block datasheets (width = poles x pitch)", sizes: { std: { pitch: 0.00508, d: 0.0095, h: 0.0105 } } },
};

export const MASK = { green: 0x1f5a3a, black: 0x1a1c1e, blue: 0x1d3f7a, red: 0x8a1f1f, white: 0xe9e9e4 }; // solder mask
const FR4 = 0xc9b98a, COPPER = 0xb87333; // the laminate seen at the edge; copper is 35 µm thick
// Conductor colours, IEC 60445 for mains in the EU (live brown, neutral blue, earth green-yellow: shown green, the yellow
// stripe is not drawn) and the usual dc pair. A film in another region passes `color` (e.g. black / white / green in the US).
export const CONDUCTOR = { L: 0x6b4226, N: 0x1f4fa0, PE: 0x3d8b37, "+": 0xc0202a, "-": 0x1b1b1b };

// ---- resistor colour code (IEC 60062) -----------------------------------------------------------------------------
const DIGIT = ["black", "brown", "red", "orange", "yellow", "green", "blue", "violet", "grey", "white"];
const TOL = { 1: "brown", 2: "red", 5: "gold", 10: "silver" };
export const BAND_HEX = { black: 0x111111, brown: 0x6b3a1e, red: 0xc0281c, orange: 0xe8731a, yellow: 0xe8c81a, green: 0x2e8b3a, blue: 0x2a4fb0, violet: 0x7a3fa0, grey: 0x8a8a8a, white: 0xf2f2f2, gold: 0xc9a227, silver: 0xc0c0c0 };

// bands(ohms, { tol, count }): the colour names of a resistor's bands, first digit first: count - 2 significant digits, the
// multiplier (gold x0.1, silver x0.01) and the tolerance (%: 1, 2, 5, 10). A value that needs more digits than the code has
// (4750 ohm on 4 bands) is refused: read a 5-band part.
export function bands(ohms, { tol = 5, count = 4 } = {}) {
  if (!(finite(ohms) && ohms > 0)) throw new Error(`bands: ohms must be a finite number > 0, got ${ohms}`);
  if (count !== 4 && count !== 5) throw new Error(`bands: count must be 4 or 5, got ${count}`);
  if (!TOL[tol]) throw new Error(`bands: tol must be one of ${Object.keys(TOL).join(", ")} (%), got ${tol}`);
  const digits = count - 2;
  for (let e = -2; e <= 9; e++) {
    const n = ohms / 10 ** e, r = Math.round(n);
    if (Math.abs(n - r) > 1e-9 * Math.max(1, n) || r < 10 ** (digits - 1) || r >= 10 ** digits) continue;
    return [...String(r)].map((c) => DIGIT[+c]).concat(e === -1 ? "gold" : e === -2 ? "silver" : DIGIT[e], TOL[tol]);
  }
  throw new Error(`bands: ${ohms} ohm does not fit ${digits} significant digits (a ${count}-band code reads ${digits}): use count 5 or a standard value`);
}

// ---- part builders --------------------------------------------------------------------------------------------------
// Each returns { group, body, pins: [[x, z] m], fp: [x0, x1, z0, z1] m, prints: [descriptors], rings? } in the part's own
// frame (x right, y up from the board top, z toward the viewer). `body` declares its real size in userData.real; leads,
// bands, pads and the like are siblings, outside it. A print descriptor is a markings() item with `target` and `at` / `n` in
// this frame (metres), or an icon.
const mesh = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x / M, y / M, z / M); return m; };
const bx = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w / M, h / M, d / M), mat, x, y, z);
const cy = (r, h, mat, x, y, z, axis = "y", seg = 32) => {
  const g = new THREE.CylinderGeometry(r / M, r / M, h / M, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2); else if (axis === "z") g.rotateX(Math.PI / 2);
  return mesh(g, mat, x, y, z);
};
const lines = (v) => (v === undefined || v === null ? [] : [].concat(v).map(String));
// The cap height that makes `lines` fit a face of wMax x hMax (metres): `hCap` unless the face is smaller.
const fit = (ls, wMax, hMax, hCap) => { const s = textSize(ls, hCap); return hCap * Math.min(1, wMax / s.w, hMax / s.hh); };
const printOn = (target, ls, at, n, wMax, hMax, hCap, style, extra = {}) => (ls.length ? [{ target, text: ls, h: fit(ls, wMax, hMax, hCap), at, n, style, ...extra }] : []);
const need = (v, what, ref) => { if (v === undefined) throw new Error(`board.place: ${ref} needs ${what}`); };
const Z = [0, 0, 1], Y = [0, 1, 0];
const STAND = 0.0005; // the gap under a body that stands on its leads, m

function electrolytic(sz, o) {
  const { d, h, pitch } = sz, r = d / 2, g = new THREE.Group();
  const body = cy(r, h, [std(o.color ?? 0x1d2a4a, { roughness: 0.45 }), std(0xb9bcc0, { metalness: 0.8, roughness: 0.35 }), std(0x222222)], 0, h / 2, 0, "y", 48);
  body.name = "electrolytic"; body.userData.real = { w: d, h, d };
  g.add(body);
  const ls = lines(o.print ?? o.value), prints = printOn(body, ls, [0, h / 2, r], Z, 0.8 * d, 0.6 * h, 0.002, "pad");
  prints.push(...printOn(body, ["−", "−"], [r, h / 2, 0], [1, 0, 0], 0.8 * d, 0.6 * h, 0.0015, "pad")); // the polarity stripe on the side of the minus lead
  if (d >= 0.0063) prints.push({ target: body, icon: "vent", size: 0.6 * d, h: 0.0003, at: [0, h, 0], n: Y, style: "pad", ink: 0x44484c }); // the vent cross scored in the top
  // pin 1 is the plus lead (-x), pin 2 the minus lead (+x): the stripe above is on the +x side
  return { group: g, body, pins: [[-pitch / 2, 0], [pitch / 2, 0]], polarity: ["+", "-"], fp: [-r, r, -r, r], prints };
}

function film(sz, o) {
  const { w, d, h, pitch } = sz, g = new THREE.Group(), y0 = STAND;
  const body = bx(w, h, d, std(0xd98a1f, { roughness: 0.4 }), 0, y0 + h / 2, 0); body.name = "film capacitor"; body.userData.real = { w, h, d };
  g.add(body);
  for (const s of [-1, 1]) g.add(cy(0.0003, y0 + 0.002, std(0xc8c8c8, { metalness: 1, roughness: 0.3 }), s * pitch / 2, (y0 + 0.002) / 2, 0));
  return { group: g, body, pins: [[-pitch / 2, 0], [pitch / 2, 0]], fp: [-w / 2, w / 2, -d / 2, d / 2], prints: printOn(body, lines(o.print ?? o.value), [0, y0 + h / 2, d / 2], Z, 0.8 * w, 0.7 * h, 0.0012, "pad") };
}

function resistor(sz, o, ref) {
  need(o.value, "value (ohms) for its colour bands", ref);
  const { l, d, pitch } = sz, g = new THREE.Group(), yc = STAND + d / 2, lead = std(0xc8c8c8, { metalness: 1, roughness: 0.3 });
  const body = cy(d / 2, l, std(0xcdb98a, { roughness: 0.6 }), 0, yc, 0, "x");
  body.name = "resistor"; body.userData.real = { w: l, h: d, d };
  g.add(body);
  for (const s of [-1, 1]) { // a lead runs out along x to the pin, then down into the board
    const run = pitch / 2 - l / 2;
    g.add(cy(0.00028, run, lead, s * (l / 2 + run / 2), yc, 0, "x", 8), cy(0.00028, yc, lead, s * pitch / 2, yc / 2, 0, "y", 8));
  }
  const names = bands(o.value, { tol: o.tol ?? 5, count: o.bands ?? 4 }), rings = [];
  names.forEach((nm, i) => { // the digits close together at one end, the tolerance band at the other
    const x = i === names.length - 1 ? l / 2 - 0.0009 : -l / 2 + 0.0009 + i * 0.0007;
    const ring = cy(d / 2 + 0.00003, 0.0005, std(BAND_HEX[nm], { roughness: 0.5 }), x, yc, 0, "x");
    ring.name = "band " + nm; rings.push(ring); g.add(ring);
  });
  return { group: g, body, pins: [[-pitch / 2, 0], [pitch / 2, 0]], fp: [-pitch / 2 - 0.0004, pitch / 2 + 0.0004, -d / 2, d / 2], prints: [], rings };
}

function dip8(sz, o) {
  const { w, d, h, pins, pitch, row } = sz, g = new THREE.Group(), y0 = STAND, per = pins / 2, metal = std(0xc8c8c8, { metalness: 1, roughness: 0.3 });
  const body = bx(w, h, d, std(0x1d1d1f, { roughness: 0.45 }), 0, y0 + h / 2, 0); body.name = "dip"; body.userData.real = { w, h, d };
  g.add(body);
  const pp = [];
  for (let n = 1; n <= pins; n++) { // pin 1 at the front left, counting along the front row, back along the rear
    const front = n <= per, x = ((front ? n : pins + 1 - n) - (per + 1) / 2) * pitch, z = front ? row / 2 : -row / 2, s = front ? 1 : -1;
    pp.push([x, z]);
    g.add(bx(0.0005, 0.0014, 0.00025, metal, x, 0.0007, z), bx(0.0005, 0.00025, Math.abs(z) - d / 2 + 0.0004, metal, x, 0.00115, s * (Math.abs(z) + d / 2 - 0.0004) / 2));
  }
  const prints = printOn(body, lines(o.print ?? o.value), [0, y0 + h, 0], Y, 0.8 * w, 0.6 * d, 0.0012, "laser");
  prints.push({ target: body, icon: "dot", h: 0.0003, at: [-w / 2 + 0.0012, y0 + h, d / 2 - 0.0012], n: Y, style: "laser" }); // the pin 1 dimple
  return { group: g, body, pins: pp, fp: [-w / 2, w / 2, -row / 2 - 0.0004, row / 2 + 0.0004], prints };
}

function to220(sz, o) {
  const { w, d, h, pins, pitch } = sz, g = new THREE.Group(), y0 = 0.0035, tabH = 0.0053, tabT = 0.0013, hp = h - tabH;
  const metal = std(0xb4b7ba, { metalness: 0.9, roughness: 0.35 }), body = new THREE.Group(), plastic = bx(w, hp, d, std(0x1b1b1d, { roughness: 0.5 }), 0, y0 + hp / 2, 0);
  body.add(plastic, bx(w, tabH, tabT, metal, 0, y0 + hp + tabH / 2, -d / 2 + tabT / 2));
  body.name = "to-220"; body.userData.real = { w, h, d };
  g.add(body);
  const pp = [];
  for (let n = 1; n <= pins; n++) { const x = (n - (pins + 1) / 2) * pitch; pp.push([x, 0]); g.add(bx(0.0008, y0 + 0.0005, 0.0005, metal, x, (y0 + 0.0005) / 2, 0)); }
  const hs = o.heatsink ? { ...sz.heatsink, ...(o.heatsink === true ? {} : o.heatsink) } : null;
  if (hs) { // an extruded block behind the tab: a back plate and fins reaching away from the viewer
    const hg = new THREE.Group(), al = std(0xa8abae, { metalness: 0.85, roughness: 0.4 }), plate = 0.003, fw = 0.0015, fd = hs.d - plate, y1 = 0.001;
    hg.add(bx(hs.w, hs.h, plate, al, 0, y1 + hs.h / 2, -d / 2 - plate / 2));
    for (let i = 0; i < 5; i++) hg.add(bx(fw, hs.h, fd, al, (i - 2) * (hs.w - fw) / 4, y1 + hs.h / 2, -d / 2 - plate - fd / 2));
    hg.name = "heatsink"; hg.userData.real = { w: hs.w, h: hs.h, d: hs.d };
    g.add(hg);
  }
  const fw = hs ? Math.max(w, hs.w) : w;
  return { group: g, body, pins: pp, fp: [-fw / 2, fw / 2, -d / 2 - (hs ? hs.d : 0), d / 2], prints: printOn(plastic, lines(o.print ?? o.value), [0, y0 + hp / 2, d / 2], Z, 0.8 * w, 0.5 * hp, 0.0014, "laser") };
}

function relay(sz, o) {
  const { w, d, h } = sz, g = new THREE.Group(), y0 = STAND, metal = std(0xc8c8c8, { metalness: 1, roughness: 0.3 });
  const body = bx(w, h, d, std(0x2a5da8, { roughness: 0.35 }), 0, y0 + h / 2, 0); body.name = "relay"; body.userData.real = { w, h, d };
  g.add(body);
  const pp = [[-0.0075, -0.005], [-0.0075, 0.005], [0.0075, -0.005], [0.0075, 0], [0.0075, 0.005]]; // coil, coil, common, normally open, normally closed
  for (const [x, z] of pp) g.add(cy(0.0004, y0 + 0.001, metal, x, (y0 + 0.001) / 2, z, "y", 8));
  return { group: g, body, pins: pp, fp: [-w / 2, w / 2, -d / 2, d / 2], prints: printOn(body, lines(o.print ?? o.value), [0, y0 + h, 0], Y, 0.8 * w, 0.6 * d, 0.0013, "pad") };
}

function fuse(sz, o) {
  const { l, d, holder: hd } = sz, g = new THREE.Group(), r = d / 2, plastic = std(0x2e2e30, { roughness: 0.6 }), brass = std(0xc9a24a, { metalness: 0.9, roughness: 0.35 });
  const holder = new THREE.Group(), base = 0.002, yc = base + r, capL = 0.004;
  holder.add(bx(hd.w, base, hd.d, plastic, 0, base / 2, 0));
  for (const s of [-1, 1]) {
    holder.add(bx((hd.w - l) / 2, hd.h, hd.d, plastic, s * (l / 2 + (hd.w - l) / 4), hd.h / 2, 0)); // the end stops
    for (const z of [-1, 1]) holder.add(bx(capL, 0.0062 - base, 0.0008, plastic, s * (l / 2 - capL / 2), (0.0062 + base) / 2, z * (r + 0.0004))); // the clips either side of each cap
  }
  holder.name = "fuse holder"; holder.userData.real = { w: hd.w, h: hd.h, d: hd.d };
  const f = new THREE.Group(), glass = std(0xcfe6ee, { transparent: true, opacity: 0.35, roughness: 0.1 });
  const cap = cy(r, capL, brass, -(l / 2 - capL / 2), yc, 0, "x");
  f.add(cy(r, l - 2 * capL, glass, 0, yc, 0, "x"), cap, cy(r, capL, brass, l / 2 - capL / 2, yc, 0, "x"), cy(0.00012, l - 2 * capL, std(0xb0b0b0, { metalness: 1 }), 0, yc, 0, "x", 6));
  f.name = "fuse"; f.userData.real = { w: l, h: d, d };
  g.add(holder, f);
  const px = hd.w / 2 - 0.001;
  return { group: g, body: holder, extra: f, pins: [[-px, 0], [px, 0]], fp: [-hd.w / 2, hd.w / 2, -hd.d / 2, hd.d / 2], prints: printOn(cap, lines(o.print ?? o.value), [-(l / 2 - capL / 2), yc, r], Z, 0.8 * capL, 0.75 * d, 0.0013, "laser") };
}

function varistor(sz, o) {
  const { D, t, pitch } = sz, g = new THREE.Group(), y0 = 0.0035, yc = y0 + D / 2, metal = std(0xc8c8c8, { metalness: 1, roughness: 0.3 });
  const body = cy(D / 2, t, std(0x2c5aa0, { roughness: 0.4 }), 0, yc, 0, "z", 48); body.name = "varistor"; body.userData.real = { w: D, h: D, d: t };
  g.add(body);
  for (const s of [-1, 1]) g.add(cy(0.0003, y0 + 0.002, metal, s * pitch / 2, (y0 + 0.002) / 2, 0, "y", 8));
  return { group: g, body, pins: [[-pitch / 2, 0], [pitch / 2, 0]], fp: [-D / 2, D / 2, -t / 2, t / 2], prints: printOn(body, lines(o.print ?? o.value), [0, yc, t / 2], Z, 0.7 * D, 0.4 * D, 0.0013, "pad") };
}

function terminal(sz, o) {
  const { pitch, d, h } = sz, poles = o.poles ?? 2, g = new THREE.Group();
  if (!Number.isInteger(poles) || poles < 1) throw new Error(`board.place: poles must be an integer >= 1, got ${o.poles}`);
  const w = poles * pitch, body = bx(w, h, d, std(0x1f8a4c, { roughness: 0.5 }), 0, h / 2, 0); body.name = "terminal"; body.userData.real = { w, h, d };
  g.add(body);
  const pp = [], prints = [];
  for (let i = 0; i < poles; i++) { const x = (i - (poles - 1) / 2) * pitch; pp.push([x, 0]); prints.push({ target: body, icon: "screw", size: 0.0038, h: 0.0002, at: [x, h, 0], n: Y, style: "pad", ink: 0xa5a5a0 }); }
  return { group: g, body, pins: pp, fp: [-w / 2, w / 2, -d / 2, d / 2], prints };
}

const BUILD = { "cap.electrolytic": electrolytic, "cap.film": film, resistor, "ic.dip8": dip8, "ic.to220": to220, relay, "fuse.5x20": fuse, varistor, "terminal.5.08": terminal };

// ---- board ----------------------------------------------------------------------------------------------------------
const UPV = new THREE.Vector3(0, 1, 0);

// board({ at, w, d, t, mask, name }): a bare FR-4 board lying on y = 0 (x along w, z along d), t thick (1.6 mm), its solder
// mask a MASK key or a hex. Returns { group, mesh, parts, traces, marks, place, pin, trace, print, silk }. Use `mesh`, not
// `group`, as a markings() target: the group also holds the parts. Coordinates are mm from the board centre.
export function board({ at = new THREE.Vector3(), w, d, t = 0.0016, mask = "green", name = "board" } = {}) {
  if (!(finite(w) && w > 0 && finite(d) && d > 0)) throw new Error(`board: w and d (metres) must be finite numbers > 0, got ${w} x ${d}`);
  if (!(finite(t) && t > 0)) throw new Error(`board: t (metres) must be a finite number > 0, got ${t}`);
  const maskColor = typeof mask === "number" ? mask : MASK[mask];
  if (maskColor === undefined) throw new Error(`board: mask must be one of ${Object.keys(MASK).join(", ")} or a hex colour, got ${mask}`);
  const group = new THREE.Group(), face = std(maskColor, { roughness: 0.45 }), edge = std(FR4, { roughness: 0.8 });
  group.name = name; group.position.copy(at);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w / M, t / M, d / M), [edge, edge, face, face, edge, edge]); // +x -x +y -y +z -z
  mesh.position.y = t / 2 / M; mesh.name = name + " laminate"; mesh.userData.real = { w, h: t, d };
  mesh.receiveShadow = true; group.add(mesh);
  const parts = {}, traces = [], marks = [], taken = [], pinsB = {}, copper = std(COPPER, { metalness: 1, roughness: 0.35 });
  const padGeo = new THREE.CylinderGeometry(0.0009 / M, 0.0009 / M, 0.000035 / M, 16);
  const inside = (r) => r.x0 >= -w / 2 - 1e-9 && r.x1 <= w / 2 + 1e-9 && r.z0 >= -d / 2 - 1e-9 && r.z1 <= d / 2 + 1e-9;
  const clash = (r) => taken.find((o) => r.x0 < o.x1 - 1e-9 && r.x1 > o.x0 + 1e-9 && r.z0 < o.z1 - 1e-9 && r.z1 > o.z0 + 1e-9);
  const topAt = (x, z) => group.localToWorld(new THREE.Vector3(x / M, t / M, z / M)); // x, z in metres from the centre

  // print(item): a marking on the board's top; item.at = [x, z] mm. Returns the markings() item.
  function print(item) {
    group.updateWorldMatrix(true, true);
    const [x, z] = item.at ?? [];
    if (!(finite(x) && finite(z))) throw new Error("board.print: at is [x, z] in mm from the board centre");
    const it = markings(mesh, [{ ...item, at: topAt(mm(x), mm(z)), normal: UPV }]).items[0];
    const sideways = it.up.x * it.up.x > 0.5, hw = (sideways ? it.hh : it.w) / 2, hh = (sideways ? it.w : it.hh) / 2;
    taken.push({ x0: mm(x) - hw, x1: mm(x) + hw, z0: mm(z) - hh, z1: mm(z) + hh, what: "a marking" });
    marks.push(it);
    return it;
  }
  // silk(text, [x, z], { h, up }): free silkscreen text (1 mm, a typical height).
  const silk = (text, at2, { h = 0.001, up } = {}) => print({ text, h, up, style: "silkscreen", at: at2 });

  // The reference beside a footprint: the first of in front, behind, right, left that is on the board and clear.
  function refText(ref, r, ax, az) {
    const s = textSize([ref], 0.001, STYLE_PAD), gap = 0.0007, w2 = s.w / 2, h2 = s.hh / 2;
    for (const [cx, cz] of [[ax, r.z1 + gap + h2], [ax, r.z0 - gap - h2], [r.x1 + gap + w2, az], [r.x0 - gap - w2, az]]) {
      const rect = { x0: cx - w2, x1: cx + w2, z0: cz - h2, z1: cz + h2 };
      if (inside(rect) && !clash(rect)) return print({ text: ref, h: 0.001, style: "silkscreen", at: [cx * 1000, cz * 1000] });
    }
    return null;
  }

  // place(ref, type, { size, value, print, at: [x, z] mm, rot (multiple of 90), heatsink, poles, silk }): a catalogue part by
  // reference designator. A footprint must lie on the board and clear of the others' (and of the markings).
  function place(ref, type, o = {}) {
    if (typeof ref !== "string" || !ref || parts[ref]) throw new Error(`board.place: ref must be a non-empty reference designator not used yet, got ${JSON.stringify(ref)}`);
    const fam = PARTS[type];
    if (!fam) throw new Error(`board.place: ${ref}: "${type}" is not in the catalogue (${Object.keys(PARTS).join(", ")})`);
    const keys = Object.keys(fam.sizes), size = o.size ?? (keys.length === 1 ? keys[0] : undefined);
    if (size === undefined) throw new Error(`board.place: ${ref}: ${type} needs a size (${keys.join(", ")})`);
    const sz = fam.sizes[size];
    if (!sz) throw new Error(`board.place: ${ref}: "${size}" is not a ${type} size in the catalogue (${keys.join(", ")})`);
    const rot = o.rot ?? 0;
    if (!(finite(rot) && Number.isInteger(rot / 90))) throw new Error(`board.place: ${ref}: rot must be a multiple of 90 degrees, got ${rot}`);
    const [x, z] = o.at ?? [0, 0];
    if (!(finite(x) && finite(z))) throw new Error(`board.place: ${ref}: at is [x, z] in mm from the board centre`);
    const ax = mm(x), az = mm(z), rad = (rot * Math.PI) / 180, part = BUILD[type](sz, o, ref);
    const turn = (px, pz) => new THREE.Vector3(px, 0, pz).applyAxisAngle(UPV, rad);
    const cs = [turn(part.fp[0], part.fp[2]), turn(part.fp[1], part.fp[2]), turn(part.fp[0], part.fp[3]), turn(part.fp[1], part.fp[3])];
    const r = { x0: ax + Math.min(...cs.map((c) => c.x)), x1: ax + Math.max(...cs.map((c) => c.x)), z0: az + Math.min(...cs.map((c) => c.z)), z1: az + Math.max(...cs.map((c) => c.z)), what: ref };
    if (!inside(r)) throw new Error(`board.place: ${ref} (${type} ${size}) would hang off the board: its footprint spans x ${(r.x0 * 1000).toFixed(1)}..${(r.x1 * 1000).toFixed(1)} mm, z ${(r.z0 * 1000).toFixed(1)}..${(r.z1 * 1000).toFixed(1)} mm`);
    const c = clash(r);
    if (c) throw new Error(`board.place: ${ref} overlaps ${c.what}: move it or turn it`);
    taken.push(r);
    const g = part.group;
    if (((rot / 90) % 2 + 2) % 2 === 1) g.traverse((n) => { const re = n.userData.real; if (re && re.w !== undefined && re.d !== undefined) n.userData.real = { ...re, w: re.d, d: re.w }; }); // declared sizes are in world axes
    g.name = ref; g.position.set(ax / M, t / M, az / M); g.rotation.y = rad;
    group.add(g); group.updateWorldMatrix(true, true);
    const local = part.pins.map(([px, pz]) => { const v = turn(px, pz); return new THREE.Vector3((ax + v.x) / M, t / M, (az + v.z) / M); });
    pinsB[ref] = local;
    for (const p of local) { const pad = new THREE.Mesh(padGeo, copper); pad.position.set(p.x, p.y + 0.0000175 / M, p.z); pad.name = "pad " + ref; group.add(pad); }
    const partMarks = [];
    for (const { target, n, at: pa, ...item } of part.prints) {
      const wp = g.localToWorld(new THREE.Vector3(pa[0] / M, pa[1] / M, pa[2] / M)), wn = new THREE.Vector3(...n).transformDirection(g.matrixWorld);
      const flat = Math.abs(n[1]) > 0.99, up = flat ? new THREE.Vector3(0, 0, -1).transformDirection(g.matrixWorld) : undefined; // a print on a top face turns with the part
      partMarks.push(markings(target, [{ ...item, at: wp, normal: wn, up }], { wear: o.wear ?? 0 }).items[0]);
    }
    marks.push(...partMarks);
    if (o.silk !== false) { const s = refText(ref, r, ax, az); if (s) partMarks.push(s); }
    parts[ref] = { ref, group: g, body: part.body, extra: part.extra, type, size, value: o.value, rot, get pins() { group.updateWorldMatrix(true, false); return local.map((p) => group.localToWorld(p.clone())); }, polarity: part.polarity ?? null, marks: partMarks, rings: part.rings, footprint: r };
    return parts[ref];
  }

  // polarity(ref, n): "+" or "-" for a pin of a polarised part (an electrolytic: pin 1 is plus, pin 2 minus, the stripe on
  // the minus side), null for a part without polarity.
  function polarity(ref, n) {
    pin(ref, n);
    return parts[ref].polarity?.[n - 1] ?? null;
  }

  // pin(ref, n): the world position of pin n (1-based) on the board's top.
  function pin(ref, n) {
    const p = pinsB[ref];
    if (!p) throw new Error(`board.pin: no part "${ref}" has been placed`);
    if (!Number.isInteger(n) || n < 1 || n > p.length) throw new Error(`board.pin: ${ref} has pins 1..${p.length}, got ${n}`);
    group.updateWorldMatrix(true, false);
    return group.localToWorld(p[n - 1].clone());
  }

  // trace(points, { width }): a copper trace through pins ("C2:1") and free points ([x, z] mm); wire() of kind "trace", so flow()
  // can run on it. Returns the wire and adds its group to the board.
  function trace(points, { width = 0.0008 } = {}) {
    if (!Array.isArray(points) || points.length < 2) throw new Error("board.trace: points is an array of at least 2 \"REF:n\" pins or [x, z] mm points");
    const path = points.map((q) => {
      if (typeof q === "string") {
        const [ref, n] = q.split(":"), p = pinsB[ref], i = Number(n);
        if (!p || !Number.isInteger(i) || i < 1 || i > p.length) throw new Error(`board.trace: pin "${q}" is not a placed part's pin (REF:n)`);
        return p[i - 1].clone().setY((t + width / 2) / M);
      }
      if (!Array.isArray(q) || !finite(q[0]) || !finite(q[1])) throw new Error("board.trace: a free point is [x, z] in mm");
      return new THREE.Vector3(mm(q[0]) / M, (t + width / 2) / M, mm(q[1]) / M);
    });
    const w2 = wire(path, { kind: "trace", radius: width / 2 });
    w2.pins = points.filter((q) => typeof q === "string"); // the pins it joins, "REF:n", for polarityClashes()
    group.add(w2.group); traces.push(w2);
    return w2;
  }
  return { group, mesh, parts, traces, marks, place, pin, polarity, trace, print, silk };
}

// polarityClashes(board, cables): the polarity mistakes of a board as sentences (an empty array = none). `cables` are the
// cable() cores with a `pin` ("REF:n", the pin each leaves from; set by the caller) or { pin, conductor }. A trace joins its
// pins into one net: a polarised pin (an electrolytic's plus or minus) and a dc cable core ("+" / "-") on it must all be of
// the same sign; mains cores (L, N, PE) have none.
export function polarityClashes(b, cables = []) {
  const sign = (pinRef) => {
    const [ref, n] = pinRef.split(":"), own = b.parts[ref] ? b.polarity(ref, Number(n)) : null;
    return [own, ...cables.filter((c) => c.pin === pinRef).map((c) => (c.conductor === "+" || c.conductor === "-" ? c.conductor : null))].filter(Boolean);
  };
  const out = [];
  for (const t of b.traces) {
    const seen = t.pins.flatMap((p) => sign(p).map((s) => [p, s]));
    if (new Set(seen.map(([, s]) => s)).size > 1) out.push(`trace ${t.pins.join(" - ")} joins both poles: ${seen.map(([p, s]) => `${p} is ${s}`).join(", ")}`);
  }
  return out;
}
const STYLE_PAD = 0.1; // the silkscreen margin (markings.js STYLES.silkscreen.pad)

// cable(points, { conductor, color, radius }): an insulated core along `points` (scene units, ≥ 2 Vector3, or a Curve) in the
// colour of its conductor (CONDUCTOR); a wire() of kind "wire" that remembers its `conductor`.
export function cable(points, { conductor = "L", color, radius = 0.0015 } = {}) {
  if (color === undefined && CONDUCTOR[conductor] === undefined) throw new Error(`cable: conductor must be one of ${Object.keys(CONDUCTOR).join(", ")} (or pass a color), got ${conductor}`);
  const w2 = wire(points, { kind: "wire", radius, color: color ?? CONDUCTOR[conductor] });
  w2.conductor = conductor;
  return w2;
}
