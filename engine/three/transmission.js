import { THREE } from "./three-vendor.js";

// Geometry of transmissions: gears, belts and chains drawn at the real size, and the ratios that drive them: a part's
// angle comes from its driver's by the tooth ratio (angleOf, phaseOf), so a train turns as one, never animated wheel by wheel.
//   - involute() / meshing() / gearGeometry(): a spur gear at a real module and tooth count, and the centre distance and phase at
//     which two of them mesh (an interfering pair is refused, with the fix named).
//   - loopPath() / openLength() / centreFor() / linkPoses(): the closed path of a belt or chain around its wheels, the centre
//     distance for a whole number of links, and the links placed along it.
//   - angleOf() / phaseOf(): where the links are, read from the driver wheel's replayed pose alone.
// All lengths are metres (scale a mesh by 1/M, as examples/fan.js does). 2D is the plane normal to the axle: x, y right-handed
// with the axle along +z. Gears are not covered: bevel, worm, helical, rack.

const TAU = 2 * Math.PI, DEG = Math.PI / 180;
const wrap = (a) => a - TAU * Math.round(a / TAU); // (-π, π]
const fin = (v) => typeof v === "number" && Number.isFinite(v);

// An involute spur gear: tooth 0 is centred on +x, the outline runs counter-clockwise. rp = m·z/2 is the pitch radius, rb = rp·cos α
// the base circle the flank unrolls from, ra = rp + m the tip, rf = rp − 1.25·m the root. `backlash` (× m) is the total thinning of
// each tooth on the pitch circle; below the base circle the flank is radial. steps: points along a flank.
export function involute({ module: m, teeth: z, pressure = 20, backlash = 0.04, steps = 8 } = {}) {
  if (!fin(m) || !(m > 0)) throw new Error("involute(): module is the pitch diameter over the teeth, in metres, > 0 (a 2 mm module, not 2)");
  if (!Number.isInteger(z) || z < 6) throw new Error("involute(): teeth is a whole number, 6 or more");
  if (!fin(pressure) || !(pressure > 0 && pressure < 45)) throw new Error("involute(): pressure is the pressure angle in degrees (20 or 25), between 0 and 45");
  if (!fin(backlash) || !(backlash >= 0 && backlash < 0.5)) throw new Error("involute(): backlash is a part of the module, 0 to 0.5");
  if (!Number.isInteger(steps) || steps < 2) throw new Error("involute(): steps is a whole number, 2 or more");
  const alpha = pressure * DEG, rp = (m * z) / 2, rb = rp * Math.cos(alpha), ra = rp + m, rf = rp - 1.25 * m;
  const inv = (x) => Math.tan(x) - x, sp = (Math.PI * m) / 2 - backlash * m; // sp: tooth thickness on the pitch circle
  const psi = (r) => sp / (2 * rp) + inv(alpha) - inv(Math.acos(Math.min(1, rb / r))); // half the tooth's angle at radius r (radial flank below rb)
  const pa = psi(ra), pr = psi(rf);
  if (!(pa > 0)) throw new Error(`involute(): a pointed tooth (${z} teeth at ${pressure} degrees): fewer teeth need a lower pressure angle, or less backlash`);
  if (!(TAU / z - 2 * pr > 0)) throw new Error("involute(): the teeth touch at the root: fewer teeth at this pressure angle need a deeper gap");
  const radii = []; // root to tip, along a flank
  if (rf < rb) radii.push(rf);
  const r0 = Math.max(rf, rb);
  for (let i = 0; i <= steps; i++) radii.push(r0 + ((ra - r0) * i) / steps);
  const at = (r, a) => [r * Math.cos(a), r * Math.sin(a)], outline = [];
  for (let k = 0; k < z; k++) {
    const c = (TAU * k) / z;
    for (const r of radii) outline.push(at(r, c - psi(r)));
    for (let i = 1; i < 4; i++) outline.push(at(ra, c - pa + (2 * pa * i) / 4));
    for (let i = radii.length - 1; i >= 0; i--) outline.push(at(radii[i], c + psi(radii[i])));
    for (let i = 1; i < 4; i++) outline.push(at(rf, c + pr + ((TAU / z - 2 * pr) * i) / 4));
  }
  return { m, z, pressure, backlash, rp, rb, ra, rf, outline };
}

// Where two involute gears of the same module and pressure angle mesh: the second at (centre, 0) turned by phase2 − φ·z1/z2 meshes
// with the first turned by φ (they turn opposite ways). Refuses interference (a tip digging into the other's root) and a contact
// ratio under 1 (a tooth would let go before the next takes the load).
export function meshing(g1, g2) {
  if (!g1?.outline || !g2?.outline) throw new Error("meshing(): takes what involute() returned");
  if (Math.abs(g1.m - g2.m) > 1e-9 * g1.m) throw new Error("meshing(): gears mesh only at the same module");
  if (g1.pressure !== g2.pressure) throw new Error("meshing(): gears mesh only at the same pressure angle");
  const alpha = g1.pressure * DEG, centre = (g1.m * (g1.z + g2.z)) / 2, line = centre * Math.sin(alpha); // line: the stretch of the line of action between the base circles
  for (const [a, b, i] of [[g1, g2, 1], [g2, g1, 2]])
    if (b.ra > Math.sqrt(b.rb ** 2 + line ** 2)) // the tip of b would dig below the base circle of a
      throw new Error(`meshing(): interference: the tips of the ${b.z}-tooth gear dig into the roots of the ${a.z}-tooth gear (gear ${i}); fewer teeth need a larger pressure angle (25 degrees) or a profile shift`);
  const contact = (Math.sqrt(g1.ra ** 2 - g1.rb ** 2) + Math.sqrt(g2.ra ** 2 - g2.rb ** 2) - line) / (Math.PI * g1.m * Math.cos(alpha));
  if (contact < 1) throw new Error("meshing(): the contact ratio is under 1: a tooth lets go before the next takes the load (more teeth, or a larger pressure angle)");
  return { centre, phase2: Math.PI - Math.PI / g2.z, ratio: g1.z / g2.z, contact };
}

// The solid: the outline extruded `width` along the axle (z), centred on z = 0, in metres, with a round hole when bore > 0.
export function gearGeometry(g, { width, bore = 0 } = {}) {
  if (!g?.outline) throw new Error("gearGeometry(): takes what involute() returned");
  if (!fin(width) || !(width > 0)) throw new Error("gearGeometry(): width is the thickness along the axle, in metres, > 0");
  if (!fin(bore) || !(bore >= 0 && bore < g.rf)) throw new Error("gearGeometry(): bore is the hole's radius in metres, 0 up to the root circle");
  const shape = new THREE.Shape(g.outline.map(([x, y]) => new THREE.Vector2(x, y)));
  if (bore > 0) shape.holes.push(new THREE.Path().absarc(0, 0, bore, 0, TAU, true));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 32 });
  geo.translate(0, 0, -width / 2);
  return geo;
}

// A chain on a sprocket or a toothed belt on a pulley rides on the pitch circle, where one tooth is one pitch of arc: the
// sprocket's radius from its teeth. (A real chain sits a little higher, chordal: about 1 % on a small cog.)
export function pitchRadius(teeth, pitch) {
  if (!Number.isInteger(teeth) || teeth < 2) throw new Error("pitchRadius(): teeth is a whole number");
  if (!fin(pitch) || !(pitch > 0)) throw new Error("pitchRadius(): pitch is the distance between links, in metres, > 0");
  return (teeth * pitch) / TAU;
}

// The closed path of a belt or chain around its wheels, `wheels` = [{ x, y, r, inside }] in travel order. The loop runs counter-
// clockwise: an outside wheel has its centre on the left of travel; an inside wheel (an idler on the back of the belt, a tensioner)
// has it on the right and turns the other way. s = 0 is where the path leaves wheel 0. Returns { length, at(s) → { x, y, angle (the
// travel direction) } with s wrapped, segments: [{ kind: "line" | "arc", wheel, s0, length }] }.
export function loopPath(wheels) {
  if (!Array.isArray(wheels) || wheels.length < 2) throw new Error("loopPath(): takes at least 2 wheels, [{ x, y, r, inside }]");
  wheels.forEach((w, i) => { if (!fin(w?.x) || !fin(w?.y) || !fin(w?.r) || !(w.r > 0)) throw new Error(`loopPath(): wheel ${i} needs x, y and r > 0 in metres`); });
  const n = wheels.length, rho = wheels.map((w) => (w.inside ? -w.r : w.r)), nu = [];
  for (let i = 0; i < n; i++) { // nu[i]: the left normal of the straight run from wheel i to the next
    const j = (i + 1) % n, dx = wheels[j].x - wheels[i].x, dy = wheels[j].y - wheels[i].y, D = Math.hypot(dx, dy), c = (rho[j] - rho[i]) / D;
    if (!(D > 0) || !(Math.abs(c) < 1)) throw new Error(`loopPath(): wheels ${i} and ${j} have no tangent between them (one sits inside the other, or they overlap)`);
    const s = Math.sqrt(1 - c * c), ex = dx / D, ey = dy / D;
    nu.push([c * ex - s * ey, c * ey + s * ex]);
  }
  const pieces = []; let total = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, [nx, ny] = nu[i], wi = wheels[i], wj = wheels[j];
    const p = [wi.x - rho[i] * nx, wi.y - rho[i] * ny], q = [wj.x - rho[j] * nx, wj.y - rho[j] * ny], len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    pieces.push({ kind: "line", wheel: i, s0: total, length: len, p, angle: Math.atan2(-nx, ny) }); total += len; // t = (ny, -nx)
    const [ox, oy] = nu[j], aIn = Math.atan2(-rho[j] * ny, -rho[j] * nx), aOut = Math.atan2(-rho[j] * oy, -rho[j] * ox);
    let sweep = wheels[j].inside ? -(((aIn - aOut) % TAU) + TAU) % TAU : (((aOut - aIn) % TAU) + TAU) % TAU;
    if (Math.abs(sweep) > TAU - 1e-9) sweep = 0;
    const alen = wj.r * Math.abs(sweep);
    pieces.push({ kind: "arc", wheel: j, s0: total, length: alen, c: [wj.x, wj.y], r: wj.r, aIn, sweep }); total += alen;
  }
  const at = (s) => {
    const u = s - total * Math.floor(s / total);
    let k = pieces.length - 1;
    for (let i = 0; i < pieces.length; i++) if (u < pieces[i].s0 + pieces[i].length) { k = i; break; }
    const pc = pieces[k], d = Math.min(u - pc.s0, pc.length);
    if (pc.kind === "line") return { x: pc.p[0] + Math.cos(pc.angle) * d, y: pc.p[1] + Math.sin(pc.angle) * d, angle: pc.angle };
    const th = pc.aIn + (pc.length > 0 ? (pc.sweep * d) / pc.length : 0);
    return { x: pc.c[0] + pc.r * Math.cos(th), y: pc.c[1] + pc.r * Math.sin(th), angle: th + (pc.sweep >= 0 ? Math.PI / 2 : -Math.PI / 2) };
  };
  return { length: total, at, segments: pieces.map(({ kind, wheel, s0, length }) => ({ kind, wheel, s0, length })) };
}

// The length of an open belt (both runs outside) over two wheels r1, r2 at a centre distance C.
export function openLength(r1, r2, C) {
  if (!fin(r1) || !fin(r2) || !fin(C) || !(r1 > 0) || !(r2 > 0) || !(C > Math.abs(r1 - r2))) throw new Error("openLength(): r1, r2 > 0 and a centre distance beyond |r1 − r2|");
  const d = r1 - r2;
  return 2 * Math.sqrt(C * C - d * d) + Math.PI * (r1 + r2) + 2 * d * Math.asin(d / C);
}

// The centre distance at which a loop over two wheels is exactly `links` pitches long (a chain with no slack takes a whole number
// of links; the centre is solved, not guessed). Refuses a chain too short to go round the wheels.
export function centreFor({ links, pitch, r1, r2 } = {}) {
  if (!Number.isInteger(links) || links < 4) throw new Error("centreFor(): links is a whole number");
  if (!fin(pitch) || !(pitch > 0)) throw new Error("centreFor(): pitch is the distance between links, in metres, > 0");
  if (!fin(r1) || !fin(r2) || !(r1 > 0) || !(r2 > 0)) throw new Error("centreFor(): r1 and r2 are the wheels' radii in metres, > 0");
  const want = links * pitch;
  let lo = Math.max(Math.abs(r1 - r2) * 1.0001, 1e-9), hi = want;
  if (openLength(r1, r2, lo) > want || openLength(r1, r2, hi) < want) throw new Error(`centreFor(): no centre distance fits ${links} links of ${pitch} m round these wheels (too short to go round them, or too long for any centre)`);
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (openLength(r1, r2, mid) < want) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

// Links along a loopPath: link k at s = k·pitch + phase, with the travel direction. The loop must be a whole number of pitches.
export function linkPoses(path, { pitch, phase = 0 } = {}) {
  if (typeof path?.at !== "function" || !fin(path.length)) throw new Error("linkPoses(): takes what loopPath() returned");
  if (!fin(pitch) || !(pitch > 0) || !fin(phase)) throw new Error("linkPoses(): pitch is the distance between links, in metres, > 0; phase in metres");
  const n = Math.round(path.length / pitch);
  if (n < 1 || Math.abs(n * pitch - path.length) > 1e-6 * path.length) throw new Error(`linkPoses(): the loop is not a whole number of links (${(path.length / pitch).toFixed(3)} pitches): solve the centre with centreFor, or take up the slack with a tensioner`);
  return Array.from({ length: n }, (_, k) => path.at(k * pitch + phase));
}

// The turn (rad, in (−π, π]) of quaternion q relative to q0 about a world axis; q and q0 are { x, y, z, w } (a THREE.Quaternion works).
export function angleOf(q, q0, axis) {
  const l = Math.hypot(axis?.x, axis?.y, axis?.z);
  if (!(l > 0) || !fin(q?.w) || !fin(q0?.w)) throw new Error("angleOf(): takes two quaternions and a world axis { x, y, z }");
  const a = [axis.x / l, axis.y / l, axis.z / l], c = { x: -q0.x, y: -q0.y, z: -q0.z, w: q0.w }; // qr = q · q0⁻¹
  const qr = { x: q.w * c.x + q.x * c.w + q.y * c.z - q.z * c.y, y: q.w * c.y - q.x * c.z + q.y * c.w + q.z * c.x, z: q.w * c.z + q.x * c.y - q.y * c.x + q.z * c.w, w: q.w * c.w - q.x * c.x - q.y * c.y - q.z * c.z };
  return wrap(2 * Math.atan2(qr.x * a[0] + qr.y * a[1] + qr.z * a[2], qr.w));
}

// Where the links are, in [0, pitch): the driver wheel's turn from its start pose, times its pitch radius, folded into one pitch.
// One full turn moves the chain `teeth` pitches, so the fold loses nothing: a replayed frame needs no unwrapped history and works in
// any frame order (render workers). It advances when the wheel turns positive about `axis`; pass the opposite axis when the loop
// runs the other way round the wheel.
export function phaseOf(q, q0, axis, teeth, pitch) {
  const p = angleOf(q, q0, axis) * pitchRadius(teeth, pitch);
  return p - pitch * Math.floor(p / pitch);
}
