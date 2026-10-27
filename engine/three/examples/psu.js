import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { board, cable } from "../electronics.js";

// An opened small power supply: the board of a mains-to-dc converter lying on y = 0, with the parts a "how it works / why
// it broke" film opens one up to show. It is an example of how to build a made device with `electronics.js` and
// `markings.js`: a film copies the pattern with its own board, parts and values from its sources, never these (the parts,
// their places and their printed values are example values; the sizes come from the catalogue's sources). Every part is
// placed by reference designator at its real size and carries the print it has in life: ratings on the capacitors and the
// varistor, a model text on the relay and the ICs, colour bands on the resistors, the silkscreen reference beside every part,
// a high-voltage sticker, and cores in their conductor colours (mains brown / blue in, dc red / black out).
//
//   const psu = openPsu(null, { at, prints: { C2: ["47µF", "450V"] } });
//   scene.add(psu.group);                                       // the board with its parts, traces and cables
//   // a macro: placeCamera(cam, frame(psu.parts.C2.body, { fov: 15.19, azimuth: 0, elevation: 20 }));
//   // glyphPx(psu.parts.C2.marks.find((m) => m.h === 0.002), cam, 1080) >= READ_PX
//
// `k` is the kit, unused here (kept for the examples' signature). `prints` replaces a part's printed lines by reference.
// Returns { group, board, parts, marks (every marking, for the detail check), cables, traces }.
export function openPsu(k, { at = new THREE.Vector3(), mask = "green", prints = {} } = {}) {
  const b = board({ at, w: 0.072, d: 0.048, mask, name: "power supply" });
  const P = (ref, type, o) => b.place(ref, type, { ...o, print: prints[ref] ?? o.print });
  // A 72 x 48 mm board, mm from its centre. Mains comes in at the back left, dc leaves at the back right.
  P("J1", "terminal.5.08", { at: [-29, -16], poles: 2 });
  P("F1", "fuse.5x20", { at: [-18, -4], print: ["T1A", "250V"] });
  P("RV1", "varistor", { size: "07D", at: [-31, 3], print: ["07D471K"] });
  P("C1", "cap.film", { size: "P15", at: [0, -17.5], print: ["0.1µF X2", "275VAC"] });
  P("U1", "ic.dip8", { at: [20, -16], print: ["PWM", "CTRL"] });
  P("C2", "cap.electrolytic", { size: "10x16", at: [28, -3], print: ["22µF", "400V"] });
  P("Q1", "ic.to220", { at: [5, 21.5], heatsink: true, print: ["SW", "FET"] });
  P("K1", "relay", { at: [-16, 15], print: ["12VDC", "10A 250VAC"] });
  P("C3", "cap.electrolytic", { size: "8x11.5", at: [28, 14], print: ["1000µF", "16V"] });
  P("R1", "resistor", { size: "0.25W", at: [14, 3], value: 4700 });
  P("R2", "resistor", { size: "0.25W", at: [0, 3], value: 220 });
  P("R3", "resistor", { size: "0.5W", at: [24, 22.5], value: 1e6 });
  P("J2", "terminal.5.08", { at: [30.5, -16], poles: 2 });

  // The warning sticker (ISO 7010 W012) in the free patch between the fuse and the film capacitor.
  b.print({ icon: "W012", text: ["HIGH", "VOLTAGE"], h: 0.0015, style: "sticker", at: [2.5, -6.5] });

  // Copper traces along the layout, from pin to pin (the first leg runs on the board, a free point makes the corner). An
  // electrolytic's pin 1 is its plus lead and pin 2 its minus (the stripe side): C3's plus goes to the dc plus terminal.
  const traces = [b.trace(["J1:1", [-31.5, -8], "F1:1"]), b.trace(["F1:2", "RV1:1"]), b.trace(["C2:1", [20, -3], "R1:2"]), b.trace(["C3:1", "J2:1"])];

  // Cables: out of the back of each terminal block, over the board edge, never lower than the board's top.
  const u = 1 / M, v = (x, y, z) => new THREE.Vector3(x * 0.001 * u, y * 0.001 * u, z * 0.001 * u);
  const lead = (ref, n, conductor, run) => {
    const p = b.parts[ref].footprint, pin = b.pin(ref, n);
    const local = b.group.worldToLocal(pin.clone()), x = local.x * M * 1000, z = p.z0 * 1000;
    const curve = new THREE.CatmullRomCurve3([v(x, 5, z), v(x, 6, z - 6), v(x + run * 0.4, 9, z - 15), v(x + run, 12, z - 26)]);
    const c = cable(curve, { conductor }); b.group.add(c.group);
    c.pin = `${ref}:${n}`; // for polarityClashes()
    return c;
  };
  // J2 pin 1 is the dc plus, the pin C3's plus lead (pin 1) is traced to above; pin 2 the dc minus.
  const cables = [lead("J1", 1, "L", -16), lead("J1", 2, "N", -6), lead("J2", 1, "+", 6), lead("J2", 2, "-", 16)];
  return { group: b.group, board: b, parts: b.parts, marks: b.marks, cables, traces };
}
