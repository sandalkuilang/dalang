import { THREE } from "./three-vendor.js";
import { M, tone } from "./kit.js";

// Invisible fields drawn by their law, in real units: electric (V/m) and magnetic (T) fields of point charges, dipoles,
// straight wires, current loops and bar magnets, superposed. Field lines are traced by RK4 from seeds spaced by FLUX (equal
// flux per line, so how close lines lie means how strong the field is, never a hand-drawn guess), grow on cue
// (`reveal(u)`) and are traced again when a source moves (`at(t)` is a pure function of t, so the render can seek any frame).
// Iron filings and a compass needle line up by the field. Sizes and fields in SI (metres, coulombs, amperes, tesla), the
// scene's positions in scene units (1/M per metre, `kit.js`). Nothing here adds itself to the scene: add `group` / `mesh`.
//
//   const bar = barMagnet({ at, axis: new THREE.Vector3(1, 0, 0), length: 0.05, width: 0.02, depth: 0.01, Br: N.remanence });
//   const B = field([bar]);                                              // B.at(p, t) → tesla; Br is from the film's model
//   const lines = fieldLines(B, { count: 24, mode: "teach" });           // teaching lines drawn on top of the world
//   const dust = filings(B, { at: sheetCentre, w: 0.16, d: 0.1, count: 3000 }); set.add(lines.group, dust.mesh);
//   // each frame: bar.place(t); lines.at(t); dust.at(t); lines.reveal(u) grows the lines from their sources.
//
// A field is invisible: a line is a teaching device. `mode: "teach"` draws clean lines and arrowheads on top of the world;
// `mode: "world"` is depth tested but a real field has no light in it, so the in-world form of a field is the filings and
// the compass, not lines. Constants: CODATA 2018 (Tiesinga et al., Rev. Mod. Phys. 93, 025010).

const EPS0 = 8.8541878128e-12; // vacuum permittivity, F/m
export const MU0 = 1.25663706212e-6; // vacuum permeability, N/A²
const KE = 1 / (4 * Math.PI * EPS0); // Coulomb's constant, N·m²/C²
const GOLDEN = Math.PI * (3 - Math.sqrt(5)); // the golden angle, rad
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const positive = (v) => finite(v) && v > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const vec3 = (v) => v?.isVector3 && finite(v.x + v.y + v.z);

// A position in scene units or a function of film time (a moving source), read in metres. One scratch vector per placement:
// use the result at once, never keep it.
function placement(at, who) {
  const dynamic = typeof at === "function";
  if (!dynamic && !vec3(at)) throw new Error(`${who}: at must be a THREE.Vector3 in scene units, or a function (t) => Vector3 for a moving source, got ${at}`);
  const out = new THREE.Vector3();
  return { dynamic, m(t = 0) {
    const v = dynamic ? at(t) : at;
    if (!vec3(v)) throw new Error(`${who}: at(t) must return a finite THREE.Vector3 in scene units, got ${v} at t = ${t}`);
    return out.copy(v).multiplyScalar(M);
  } };
}

// Field of a straight piece of wire from a to b (metres) carrying I amperes from a toward b, added into `out`: closed-form
// Biot–Savart, B = mu0 I / (4 pi rho) (cos th1 - cos th2), direction u × rho-hat (right-hand rule).
function segmentB(ax, ay, az, bx, by, bz, I, px, py, pz, out) {
  let ux = bx - ax, uy = by - ay, uz = bz - az;
  const L = Math.hypot(ux, uy, uz);
  if (!(L > 0)) return;
  ux /= L; uy /= L; uz /= L;
  const wx = px - ax, wy = py - ay, wz = pz - az, s1 = wx * ux + wy * uy + wz * uz, s2 = s1 - L;
  const rx = wx - s1 * ux, ry = wy - s1 * uy, rz = wz - s1 * uz, rho2 = rx * rx + ry * ry + rz * rz;
  if (rho2 < 1e-24) return; // on the wire's own axis: the field there is not defined, the tracer keeps away
  const rho = Math.sqrt(rho2), f = MU0 * I / (4 * Math.PI * rho) * (s1 / Math.hypot(s1, rho) - s2 / Math.hypot(s2, rho));
  out.x += f * (uy * rz - uz * ry) / rho; out.y += f * (uz * rx - ux * rz) / rho; out.z += f * (ux * ry - uy * rx) / rho;
}
const distToSegment = (a, b, p) => {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx * abx + aby * aby + abz * abz;
  const u = L2 > 0 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L2, 0, 1) : 0;
  return Math.hypot(p.x - a.x - u * abx, p.y - a.y - u * aby, p.z - a.z - u * abz);
};
// n points evenly spread over a sphere (equal solid angle each: equal flux from a point charge), radius r about c.
const fibonacci = (n, r, c) => Array.from({ length: n }, (_, i) => {
  const y = 1 - 2 * (i + 0.5) / n, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * GOLDEN;
  return new THREE.Vector3(c.x + r * rr * Math.cos(a), c.y + r * y, c.z + r * rr * Math.sin(a));
});
// A frame (axis a, width e1, depth e2) right-handed (a × e1 = e2) with e2 the world's up as near as the axis allows.
function frame(axis) {
  const a = axis.clone().normalize(), up = Math.abs(a.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const e2 = up.addScaledVector(a, -up.dot(a)).normalize(), e1 = new THREE.Vector3().crossVectors(e2, a);
  return { a, e1, e2 };
}

// ---- sources ----------------------------------------------------------------------------------------------------------
// Each source is a plain object the field calls: eval(p, t, out) adds its field at p (metres), nearest(p, t) is the distance
// to its nearest singular point or part (the tracer's step is a fraction of it), center(t), and, to seed lines, sign (+1
// emits lines, -1 takes them in, 0 circulates), flux(t) (V·m or Wb: how many lines it gets) and seeds(n, t, ctx).

// A point charge of q coulombs at `at` (scene units, or (t) => Vector3).
export function charge(q, at) {
  if (!finite(q) || q === 0) throw new Error(`charge: q (C) must be a finite number other than 0, got ${q}`);
  const pos = placement(at, "charge");
  return {
    kind: "E", name: "charge", q, dynamic: pos.dynamic, sign: Math.sign(q),
    center: (t = 0) => pos.m(t).clone(),
    eval(p, t, out) {
      const c = pos.m(t), dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, r2 = dx * dx + dy * dy + dz * dz;
      if (r2 < 1e-24) return;
      const f = KE * q / (r2 * Math.sqrt(r2));
      out.x += f * dx; out.y += f * dy; out.z += f * dz;
    },
    nearest: (p, t) => p.distanceTo(pos.m(t)),
    points: (t) => [{ x: pos.m(t).x, y: pos.m(t).y, z: pos.m(t).z, q }],
    flux: () => Math.abs(q) / EPS0,
    seeds: (n, t, { radius }) => fibonacci(n, radius, pos.m(t)),
  };
}

// A dipole of moment p (a Vector3, C·m) at `at`: two charges ±|p|/d a distance d apart (default 1 mm: a point dipole to any
// distance beyond a few d). Returns the two charges as an array, which `field` accepts.
export function dipole(p, at, { d = 0.001 } = {}) {
  if (!vec3(p) || !(p.length() > 0)) throw new Error(`dipole: p must be a THREE.Vector3 moment in C·m other than 0, got ${p}`);
  if (!positive(d)) throw new Error(`dipole: d (m) must be a finite number > 0, got ${d}`);
  placement(at, "dipole");
  const u = p.clone().normalize().multiplyScalar(d / 2 / M), q = p.length() / d, base = typeof at === "function" ? at : () => at;
  return [charge(q, (t) => base(t).clone().add(u)), charge(-q, (t) => base(t).clone().sub(u))];
}

// A straight piece of wire from a to b (scene units or functions of t) carrying I amperes from a toward b. Lines circle it.
export function straightWire(I, a, b) {
  if (!finite(I) || I === 0) throw new Error(`straightWire: I (A) must be a finite number other than 0, got ${I}`);
  const pa = placement(a, "straightWire"), pb = placement(b, "straightWire");
  const len = (t) => pa.m(t).distanceTo(pb.m(t));
  return {
    kind: "B", name: "wire", I, dynamic: pa.dynamic || pb.dynamic, sign: 0,
    center: (t = 0) => pa.m(t).clone().add(pb.m(t)).multiplyScalar(0.5),
    eval(p, t, out) { const A = pa.m(t), B = pb.m(t); segmentB(A.x, A.y, A.z, B.x, B.y, B.z, I, p.x, p.y, p.z, out); },
    nearest: (p, t) => distToSegment(pa.m(t), pb.m(t), p),
    // Flux through the strip from the wire out to 8 inner radii is mu0 I L / 2 pi · ln 8; seeds are spaced evenly in ln(rho),
    // each carrying equal flux, in the plane across the wire's middle.
    flux: (t) => MU0 * Math.abs(I) * len(t) / (2 * Math.PI) * Math.log(8),
    seeds(n, t, { radius }) {
      const A = pa.m(t).clone(), B = pb.m(t).clone(), u = B.clone().sub(A).normalize(), mid = A.clone().add(B).multiplyScalar(0.5);
      const e1 = new THREE.Vector3().crossVectors(u, Math.abs(u.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
      const e2 = new THREE.Vector3().crossVectors(u, e1), r0 = radius ?? Math.max(1e-3, A.distanceTo(B) / 100);
      return Array.from({ length: n }, (_, i) => {
        const r = r0 * 8 ** ((i + 0.5) / n), a = i * GOLDEN;
        return mid.clone().addScaledVector(e1, r * Math.cos(a)).addScaledVector(e2, r * Math.sin(a));
      });
    },
  };
}

// A circular current loop of radius R (m), I amperes counter-clockwise seen from the tip of `normal`, at `at`: Biot–Savart
// over `segments` straight pieces. B along the axis is +normal for I > 0.
export function loop(I, { at, normal, R, segments = 128 } = {}) {
  if (!finite(I) || I === 0) throw new Error(`loop: I (A) must be a finite number other than 0, got ${I}`);
  if (!positive(R)) throw new Error(`loop: R (m) must be a finite number > 0, got ${R}`);
  if (!vec3(normal) || !(normal.length() > 0)) throw new Error(`loop: normal must be a THREE.Vector3 other than 0, got ${normal}`);
  if (!Number.isInteger(segments) || segments < 8) throw new Error(`loop: segments must be an integer ≥ 8, got ${segments}`);
  const pos = placement(at, "loop"), n = normal.clone().normalize(), { e1, e2 } = frame(n);
  const cs = Array.from({ length: segments + 1 }, (_, i) => Math.cos(2 * Math.PI * i / segments)), sn = Array.from({ length: segments + 1 }, (_, i) => Math.sin(2 * Math.PI * i / segments));
  const evalB = (p, t, out) => {
    const c = pos.m(t);
    let ax = c.x + R * (cs[0] * e1.x + sn[0] * e2.x), ay = c.y + R * (cs[0] * e1.y + sn[0] * e2.y), az = c.z + R * (cs[0] * e1.z + sn[0] * e2.z);
    for (let i = 1; i <= segments; i++) {
      const bx = c.x + R * (cs[i] * e1.x + sn[i] * e2.x), by = c.y + R * (cs[i] * e1.y + sn[i] * e2.y), bz = c.z + R * (cs[i] * e1.z + sn[i] * e2.z);
      segmentB(ax, ay, az, bx, by, bz, I, p.x, p.y, p.z, out);
      ax = bx; ay = by; az = bz;
    }
  };
  // Flux through the disc inside the loop (to 0.95 R: the field diverges at the wire), as a cumulative profile in radius.
  const disc = (t) => {
    const K = 200, rmax = 0.95 * R, c = pos.m(t).clone(), cum = [0], o = new THREE.Vector3(), p = new THREE.Vector3();
    for (let j = 0; j < K; j++) {
      const rho = (j + 0.5) / K * rmax;
      p.copy(c).addScaledVector(e1, rho); o.set(0, 0, 0); evalB(p, t, o);
      cum.push(cum[j] + Math.abs(o.dot(n)) * 2 * Math.PI * rho * (rmax / K));
    }
    return { cum, rmax, K, c };
  };
  return {
    kind: "B", name: "loop", I, R, normal: n, dynamic: pos.dynamic, sign: 0,
    center: (t = 0) => pos.m(t).clone(),
    eval: evalB,
    nearest(p, t) { const d = p.clone().sub(pos.m(t)), z = d.dot(n), rho = Math.hypot(d.x - z * n.x, d.y - z * n.y, d.z - z * n.z); return Math.hypot(rho - R, z); },
    flux: (t) => disc(t).cum.at(-1),
    // Seeds across the disc, placed by cumulative flux: each carries 1/n of the flux through the loop. An axisymmetric field,
    // so the azimuth only spreads them (golden angle) unless `azimuth` fixes one plane (the textbook picture).
    seeds(n_, t, { azimuth }) {
      const { cum, rmax, K, c } = disc(t), total = cum[K];
      return Array.from({ length: n_ }, (_, i) => {
        const target = (i + 0.5) / n_ * total;
        let j = 1; while (j < K && cum[j] < target) j++;
        const rho = (j - 1 + (target - cum[j - 1]) / Math.max(cum[j] - cum[j - 1], 1e-300)) / K * rmax, a = azimuth ?? i * GOLDEN;
        return c.clone().addScaledVector(e1, rho * Math.cos(a)).addScaledVector(e2, rho * Math.sin(a));
      });
    },
  };
}

// A bar magnet, uniformly magnetised along `axis` (N at +axis), as two sheets of magnetic charge: M = Br/mu0 on a face is a
// surface pole density of ±M, here grid × grid point poles per face of strength M·dA. Outside the block B = mu0/(4 pi) Σ q r̂/r²
// is exact for a uniform magnetisation (up to the grid); INSIDE the block B is not mu0 H, so the tracer ends a line that
// enters the box at the S face ("sink"). `Br` (tesla, the remanence) has no default: the film's model gives it with its
// source. Typical values: sintered NdFeB (N42) ~1.3 T, alnico ~1.2 T, ferrite ~0.4 T. `mesh` is the block at real size (N half
// red, S half grey); `place(t)` puts it where `at(t)` says.
export function barMagnet({ at, axis, length, width, depth, Br, grid = 6 } = {}) {
  if (!positive(Br)) throw new Error(`barMagnet: Br (T) is the remanence from the film's model with a source (NdFeB ~1.3, alnico ~1.2, ferrite ~0.4); got ${Br}`);
  for (const [k, v] of Object.entries({ length, width, depth })) if (!positive(v)) throw new Error(`barMagnet: ${k} (m) must be a finite number > 0, got ${v}`);
  if (!vec3(axis) || !(axis.length() > 0)) throw new Error(`barMagnet: axis must be a THREE.Vector3 other than 0, got ${axis}`);
  if (!Number.isInteger(grid) || grid < 1) throw new Error(`barMagnet: grid must be an integer ≥ 1, got ${grid}`);
  const pos = placement(at, "barMagnet"), { a, e1, e2 } = frame(axis), s = Br / (4 * Math.PI); // T·m² per m² of pole face
  const dA = width * depth / (grid * grid), poles = []; // [ox, oy, oz, strength] about the centre
  for (const side of [1, -1]) for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const u = ((i + 0.5) / grid - 0.5) * width, v = ((j + 0.5) / grid - 0.5) * depth;
    poles.push([side * length / 2 * a.x + u * e1.x + v * e2.x, side * length / 2 * a.y + u * e1.y + v * e2.y, side * length / 2 * a.z + u * e1.z + v * e2.z, side * s * dA]);
  }
  const mesh = new THREE.Group();
  mesh.name = "bar magnet";
  for (const [side, color, name] of [[1, 0xb3342b, "N pole"], [-1, 0x9aa0a6, "S pole"]]) {
    const half = new THREE.Mesh(new THREE.BoxGeometry(length / 2 / M, width / M, depth / M), new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.45 }));
    half.position.x = side * length / 4 / M; half.name = name; mesh.add(half);
  }
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, e1, e2));
  const dims = [length, width, depth], ext = (i) => Math.abs(a.getComponent(i)) * dims[0] + Math.abs(e1.getComponent(i)) * dims[1] + Math.abs(e2.getComponent(i)) * dims[2];
  mesh.userData.real = { w: ext(0), h: ext(1), d: ext(2) }; // the block's size along the world axes, for scaleAudit
  const place = (t = 0) => { mesh.position.copy(pos.m(t)).multiplyScalar(1 / M); return mesh; };
  place(0);
  const magnet = {
    kind: "B", name: "bar magnet", Br, length, width, depth, axis: a, mesh, place, dynamic: pos.dynamic, sign: 1,
    center: (t = 0) => pos.m(t).clone(),
    eval(p, t, out) {
      const c = pos.m(t);
      for (const [ox, oy, oz, q] of poles) {
        const dx = p.x - c.x - ox, dy = p.y - c.y - oy, dz = p.z - c.z - oz, r2 = dx * dx + dy * dy + dz * dz;
        if (r2 < 1e-24) continue;
        const f = q / (r2 * Math.sqrt(r2));
        out.x += f * dx; out.y += f * dy; out.z += f * dz;
      }
    },
    nearest(p, t) {
      const c = pos.m(t); let best = Infinity;
      for (const [ox, oy, oz] of poles) best = Math.min(best, Math.hypot(p.x - c.x - ox, p.y - c.y - oy, p.z - c.z - oz));
      return best;
    },
    // The point poles, so a line that closes in on the S face ends there ("sink") rather than circling a singular point.
    points(t) { const c = pos.m(t); return poles.map(([ox, oy, oz, q]) => ({ x: c.x + ox, y: c.y + oy, z: c.z + oz, q })); },
    contains(p, t) {
      const c = pos.m(t), dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      return Math.abs(dx * a.x + dy * a.y + dz * a.z) < length / 2 && Math.abs(dx * e1.x + dy * e1.y + dz * e1.z) < width / 2 && Math.abs(dx * e2.x + dy * e2.y + dz * e2.z) < depth / 2;
    },
    flux: () => Br * width * depth, // Wb out of the N face
    // Equal flux per line: a uniform pole sheet, so equal area per seed (a low-discrepancy sequence over the face), one pole
    // spacing out from the face.
    seeds(n, t, { radius }) {
      const c = pos.m(t), off = radius ?? Math.max(1e-4, Math.max(width, depth) / grid), g = 1.32471795724474602596;
      return Array.from({ length: n }, (_, i) => {
        const u = ((0.5 + i / g) % 1 - 0.5) * 0.96 * width, v = ((0.5 + i / (g * g)) % 1 - 0.5) * 0.96 * depth;
        return c.clone().addScaledVector(a, length / 2 + off).addScaledVector(e1, u).addScaledVector(e2, v);
      });
    },
  };
  return magnet;
}

// ---- field ------------------------------------------------------------------------------------------------------------

// The superposition of sources of one kind: E (V/m) or B (T). `at(p, t, out)`: p in scene units, t film time (default 0).
export function field(sources) {
  const list = (Array.isArray(sources) ? sources : [sources]).flat();
  if (!list.length) throw new Error("field: needs at least one source (charge, dipole, straightWire, loop, barMagnet)");
  if (!list.every((s) => s && typeof s.eval === "function" && (s.kind === "E" || s.kind === "B"))) throw new Error("field: every source comes from charge, dipole, straightWire, loop or barMagnet");
  const kinds = new Set(list.map((s) => s.kind));
  if (kinds.size > 1) throw new Error("field: sources of kind E and kind B cannot be mixed in one field");
  const tmp = new THREE.Vector3();
  const F = {
    kind: list[0].kind, sources: list, dynamic: list.some((s) => s.dynamic),
    // In metres; adds into a zeroed `out`.
    eval(p, t, out) { for (const s of list) s.eval(p, t, out); return out; },
    at(p, t = 0, out = new THREE.Vector3()) { tmp.copy(p).multiplyScalar(M); out.set(0, 0, 0); return F.eval(tmp, t, out); },
    nearest(p, t) { let d = Infinity; for (const s of list) d = Math.min(d, s.nearest(p, t)); return d; },
    contains(p, t) { return list.some((s) => s.contains?.(p, t)); },
    points(t) { return list.flatMap((s) => s.points?.(t) ?? []); },
  };
  return F;
}

// ---- tracing ----------------------------------------------------------------------------------------------------------

// A line of force from `seed` (a Vector3 in METRES), along the field (dir +1) or against it (-1), by RK4 on the unit field
// direction, so s is arc length in metres. The step is 5 % of the distance to the nearest source (clamped to [minStep, step]),
// so it shrinks into a source and stretches far away. Ends: "sink" (it entered a magnet's box, or came within `sinkRadius` of
// a charge it flows into), "stop" (stop(p) was true), "closed" (it came back to its seed), "length" (maxLength m or maxSteps
// used) or "singular" (the field is not finite or is zero). Returns { points (metres), ended, length }.
export function trace(F, seed, { t = 0, dir = 1, step = 0.02, minStep = 1e-5, maxLength = 1, maxSteps = 20000, stop, sinkRadius = 1e-4 } = {}) {
  if (!vec3(seed)) throw new Error(`trace: seed must be a THREE.Vector3 in metres, got ${seed}`);
  if (dir !== 1 && dir !== -1) throw new Error(`trace: dir must be 1 or -1, got ${dir}`);
  for (const [k, v] of Object.entries({ step, minStep, maxLength, sinkRadius })) if (!positive(v)) throw new Error(`trace: ${k} must be a finite number > 0, got ${v}`);
  const p = seed.clone(), pts = [p.clone()], k1 = new THREE.Vector3(), k2 = new THREE.Vector3(), k3 = new THREE.Vector3(), k4 = new THREE.Vector3(), q = new THREE.Vector3();
  const sinks = F.points(t).filter((s) => s.q * dir < 0);
  const dirAt = (x, o) => { o.set(0, 0, 0); F.eval(x, t, o); const m = o.length(); if (!(m > 1e-300) || !Number.isFinite(m)) return false; o.multiplyScalar(dir / m); return true; };
  let L = 0, ended = "length";
  for (let i = 0; i < maxSteps; i++) {
    if (L >= maxLength) break;
    const h = Math.min(clamp(0.05 * F.nearest(p, t), minStep, step), maxLength - L);
    if (!dirAt(p, k1) || !dirAt(q.copy(p).addScaledVector(k1, h / 2), k2) || !dirAt(q.copy(p).addScaledVector(k2, h / 2), k3) || !dirAt(q.copy(p).addScaledVector(k3, h), k4)) { ended = "singular"; break; }
    p.addScaledVector(k1, h / 6).addScaledVector(k2, h / 3).addScaledVector(k3, h / 3).addScaledVector(k4, h / 6);
    if (!finite(p.x + p.y + p.z)) { ended = "singular"; break; }
    L += h; pts.push(p.clone());
    if (F.contains(p, t) || sinks.some((s) => Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z) < sinkRadius)) { ended = "sink"; break; }
    if (stop?.(p)) { ended = "stop"; break; }
    if (L > 20 * h && p.distanceTo(seed) < 1.5 * h) { pts.push(seed.clone()); ended = "closed"; break; }
  }
  return { points: pts, ended, length: L };
}

// Seed points (METRES) for `count` lines spaced by flux: every emitting source (positive charge, N face) gets lines in
// proportion to its flux, and the seeds within a source are spaced to carry equal flux. Sources that only circulate (a loop,
// a wire) are seeded across the flux through them. When nothing emits (only negative charges) the lines run backward from
// the sinks (`dir` -1). Returns { points, dir, sinkRadius }; `seedRadius` (m) overrides the default of 1/20 of the distance to
// the nearest other source (at least 0.1 mm) for a charge's sphere, and the offset of a magnet's seeds from its face.
export function seeds(F, { count, seedRadius, t = 0, azimuth } = {}) {
  if (!Number.isInteger(count) || count < 1) throw new Error(`seeds: count must be a whole number ≥ 1, got ${count}`);
  if (seedRadius !== undefined && !positive(seedRadius)) throw new Error(`seeds: seedRadius (m) must be a finite number > 0, got ${seedRadius}`);
  let emitters = F.sources.filter((s) => s.sign >= 0), dir = 1;
  if (!F.sources.some((s) => s.sign > 0) && !F.sources.some((s) => s.sign === 0)) { emitters = F.sources.filter((s) => s.sign < 0); dir = -1; }
  const flux = emitters.map((s) => s.flux(t)), total = flux.reduce((a, b) => a + b, 0);
  if (!(total > 0)) throw new Error("seeds: the sources have no flux to seed lines from");
  const exact = flux.map((f) => f / total * count), n = exact.map(Math.floor);
  let rest = count - n.reduce((a, b) => a + b, 0);
  exact.map((e, i) => [e - n[i], i]).sort((x, y) => y[0] - x[0]).slice(0, rest).forEach(([, i]) => n[i]++);
  const points = []; let sinkRadius = Infinity;
  emitters.forEach((s, i) => {
    if (!n[i]) return;
    const c = s.center(t), others = F.sources.filter((o) => o !== s).map((o) => o.nearest(c, t)), near = Math.min(...others);
    const auto = Math.max(1e-4, (Number.isFinite(near) ? near : 0.01) / 20), radius = seedRadius ?? (s.name === "charge" ? auto : undefined);
    points.push(...s.seeds(n[i], t, { radius, azimuth }));
    if (s.name === "charge") sinkRadius = Math.min(sinkRadius, 0.5 * (radius ?? auto));
  });
  return { points, dir, sinkRadius: Number.isFinite(sinkRadius) ? sinkRadius : 1e-4 };
}

// ---- drawing the lines ------------------------------------------------------------------------------------------------

// Resample a polyline to at most `max` points, evenly by arc length (a long trace keeps its shape and the tube stays light).
function resample(points, max) {
  if (points.length <= max) return points;
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + points[i].distanceTo(points[i - 1]));
  const out = []; let j = 1;
  for (let k = 0; k < max; k++) {
    const s = cum.at(-1) * k / (max - 1);
    while (j < points.length - 1 && cum[j] < s) j++;
    const span = cum[j] - cum[j - 1] || 1, u = clamp((s - cum[j - 1]) / span, 0, 1);
    out.push(points[j - 1].clone().lerp(points[j], u));
  }
  return out;
}

// Lines of force of F, traced from flux-spaced seeds (or `seeds`: Vector3[] in scene units, or (t) => Vector3[], traced with
// `dir`), drawn as tubes of radius `width` (m, default 0.4 mm) with arrowheads along F (one per line at 55 % of its length, or
// every `arrowEvery` m). `count` is the total, shared out by flux, so line density is field strength in a 3D picture. A
// planar cut through a 3D set of lines is NOT flux-spaced: a hand-picked planar set shows direction, not strength.
// Returns { group, lines: [{ points (metres), ended, length, seed }], tubes, arrows (InstancedMesh), seeds, reveal(u), at(t) }.
// `reveal(u)` (0..1) grows every line from its start, arrowheads showing once the line reaches them; `at(t)` traces again
// when a source moves (nothing to do for a static field), pure of t and keeping the last `reveal`.
export function fieldLines(F, { count = 24, seedRadius, seeds: explicit, dir: dirOpt = 1, azimuth, t = 0, mode = "teach", color = 0xffd23f, width = 0.0004, arrowEvery, maxLength = 2, step = 0.02, stop } = {}) {
  if (mode !== "teach" && mode !== "world") throw new Error(`fieldLines: mode must be "teach" or "world", got ${mode}`);
  if (!positive(width)) throw new Error(`fieldLines: width (m, the tube radius) must be a finite number > 0, got ${width}`);
  if (arrowEvery !== undefined && !positive(arrowEvery)) throw new Error(`fieldLines: arrowEvery (m) must be a finite number > 0, got ${arrowEvery}`);
  if (explicit === undefined && (!Number.isInteger(count) || count < 1)) throw new Error(`fieldLines: count must be a whole number ≥ 1, got ${count}`);
  const teach = mode === "teach", group = new THREE.Group(), r = width / M, perLine = arrowEvery ? 64 : 1;
  group.name = "field lines";
  const material = teach ? new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true })
    : new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 });
  const trace1 = (t0) => {
    const given = typeof explicit === "function" ? explicit(t0) : explicit;
    const sd = given ? { points: given.map((v) => v.clone().multiplyScalar(M)), dir: dirOpt, sinkRadius: 1e-4 } : seeds(F, { count, seedRadius, t: t0, azimuth });
    return sd.points.map((s) => {
      const tr = trace(F, s, { t: t0, dir: sd.dir, step, maxLength, stop, sinkRadius: sd.sinkRadius });
      if (sd.dir < 0) tr.points.reverse(); // always drawn along F
      return { points: tr.points, ended: tr.ended, length: tr.length, seed: s };
    });
  };
  const lines = trace1(t), tubes = [];
  const cone = new THREE.ConeGeometry(3 * r, 8 * r, 10).translate(0, 4 * r, 0); // base at the origin, tip along +Y
  const arrows = new THREE.InstancedMesh(cone, material, Math.max(1, lines.length * perLine));
  arrows.name = "arrowheads"; arrows.frustumCulled = false;
  const marks = []; // [{ frac, matrix }] per arrowhead, in line order
  let u = 1;
  const rebuild = () => {
    marks.length = 0;
    lines.forEach((line, i) => {
      const pts = resample(line.points.map((p) => p.clone().multiplyScalar(1 / M)), 240);
      if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(1e-6, 0, 0)));
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal"), geo = new THREE.TubeGeometry(curve, clamp(pts.length - 1, 2, 240), r, 5, false);
      let tube = tubes[i];
      if (!tube) { tube = new THREE.Mesh(geo, material); tube.renderOrder = teach ? 10 : 0; tube.name = "field line"; tubes.push(tube); group.add(tube); }
      else { tube.geometry.dispose(); tube.geometry = geo; }
      const total = curve.getLength() * M, fracs = [];
      if (arrowEvery) for (let s = arrowEvery / 2; s < total && fracs.length < perLine; s += arrowEvery) fracs.push(s / total);
      else fracs.push(0.55);
      for (const frac of fracs) {
        const tangent = curve.getTangentAt(frac).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
        marks.push({ frac, matrix: new THREE.Matrix4().compose(curve.getPointAt(frac), q, new THREE.Vector3(1, 1, 1)) });
      }
      line.seed = line.seed.clone();
    });
    api.seeds = lines.map((l) => l.seed);
    reveal(u);
  };
  function reveal(v) {
    u = clamp(Number.isFinite(v) ? v : 1, 0, 1);
    for (const tube of tubes) { const n = tube.geometry.index.count; tube.geometry.setDrawRange(0, Math.round(u * n / 3) * 3); }
    let k = 0;
    for (const mk of marks) if (mk.frac <= u && k < arrows.instanceMatrix.count) arrows.setMatrixAt(k++, mk.matrix);
    arrows.count = k; arrows.instanceMatrix.needsUpdate = true;
  }
  const dynamic = F.dynamic || typeof explicit === "function";
  const api = { group, lines, tubes, arrows, seeds: [], reveal, at(t1) {
    if (dynamic) { lines.splice(0, lines.length, ...trace1(t1)); rebuild(); }
    return api;
  } };
  group.add(arrows);
  arrows.renderOrder = teach ? 10 : 0;
  rebuild();
  return api;
}

// ---- iron filings and a compass ---------------------------------------------------------------------------------------

// Iron filings sprinkled on a flat sheet (normal +Y) of w × d metres centred at `at` (scene units): `count` thin cylinders
// (4 mm long, 0.3 mm across, the real size of a filing) scattered by the seeded `tone` (same layout every run), each
// lying along the field's component IN the sheet, as a filing on tapped paper settles (the paper is tapped, so they settle
// within a frame or two: `at(t)` re-aligns them at once). Where that component is under a thousandth of the sheet's median
// there is no direction to follow, and the filing keeps its random one. Returns { mesh, at(t), dirs (unit vectors in the
// sheet), points (scene units) }.
export function filings(F, { at, w, d, count, length = 0.004, radius = 0.00015, seed = 1, t = 0, color = 0x2a2a2e } = {}) {
  if (!vec3(at)) throw new Error(`filings: at must be a THREE.Vector3 in scene units (the sheet's centre), got ${at}`);
  for (const [k, v] of Object.entries({ w, d, length, radius })) if (!positive(v)) throw new Error(`filings: ${k} (m) must be a finite number > 0, got ${v}`);
  if (!Number.isInteger(count) || count < 1) throw new Error(`filings: count must be a whole number ≥ 1, got ${count}`);
  const geo = new THREE.CylinderGeometry(radius / M, radius / M, length / M, 6).rotateZ(Math.PI / 2); // lying along +X
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.45 }), count);
  mesh.name = "iron filings"; mesh.frustumCulled = false;
  const points = Array.from({ length: count }, (_, i) => new THREE.Vector3(at.x + (tone(i, seed * 3 + 1) - 0.5) * w / M, at.y + radius / M, at.z + (tone(i, seed * 3 + 2) - 0.5) * d / M));
  const dirs = points.map(() => new THREE.Vector3(1, 0, 0)), rnd = points.map((_, i) => tone(i, seed * 3 + 3) * Math.PI), mag = new Float64Array(count);
  const B = new THREE.Vector3(), o = new THREE.Object3D();
  const align = (t1) => {
    const bh = points.map((p, i) => { F.at(p, t1, B); dirs[i].set(B.x, 0, B.z); return (mag[i] = Math.hypot(B.x, B.z)); });
    const median = [...bh].sort((x, y) => x - y)[count >> 1], floor = 1e-3 * median;
    points.forEach((p, i) => {
      if (!(mag[i] > floor)) dirs[i].set(Math.cos(rnd[i]), 0, -Math.sin(rnd[i])); else dirs[i].multiplyScalar(1 / mag[i]);
      o.position.copy(p); o.rotation.set(0, Math.atan2(-dirs[i].z, dirs[i].x), 0); o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  align(t);
  return { mesh, points, dirs, at(t1) { align(t1); return this; } };
}

// A compass: a steel needle (length 1.6 r, 1/12 as wide, 0.3 mm thick) on a pivot at `at` (scene units), in the horizontal
// plane (normal +Y). It turns by the torque of the field's horizontal part on its moment m, I θ'' = m B_h sin(φ − θ) − c θ',
// where φ is the field's direction and θ the needle's (angle from +X toward -Z, as `filings` and rotation.y), integrated at a fixed
// 1/2400 s from t0 into a cache that grows on demand: `at(t)` is a pure function of t and order-independent, like the supply
// chain's shaft. Defaults from the needle's size, an ASSUMPTION a film overrides with its own needle: steel 7850 kg/m³,
// magnetisation 8e5 A/m (a hard-magnetised needle) for m; `damping` is the damping ratio ζ (default 0.5, a liquid-filled
// capsule), c = 2 ζ sqrt(I m B0) with B0 the field's horizontal part at t0. Returns { group, needle, at(t) → { angle } }.
export function compass(F, { at, r = 0.02, I, m, damping = 0.5, t0 = 0, angle0 = 0 } = {}) {
  if (!vec3(at)) throw new Error(`compass: at must be a THREE.Vector3 in scene units, got ${at}`);
  if (!positive(r)) throw new Error(`compass: r (m) must be a finite number > 0, got ${r}`);
  if (!finite(damping) || damping < 0) throw new Error(`compass: damping (the damping ratio) must be a finite number ≥ 0, got ${damping}`);
  if (!finite(t0) || !finite(angle0)) throw new Error("compass: t0 (s) and angle0 (rad) must be finite numbers");
  const L = 1.6 * r, wd = L / 12, th = 0.0003, vol = L * wd * th;
  const J = I ?? 7850 * vol * L * L / 12, mom = m ?? 8e5 * vol;
  if (!positive(J) || !positive(mom)) throw new Error(`compass: I (kg·m²) and m (A·m²) must be finite numbers > 0, got ${I}, ${m}`);
  const B = new THREE.Vector3(), dt = 1 / 2400, Bh = (t) => { F.at(at, t, B); return [B.x, B.z]; };
  const [bx0, bz0] = Bh(t0), c = 2 * damping * Math.sqrt(J * mom * Math.max(Math.hypot(bx0, bz0), 1e-5));
  const theta = [angle0]; let omega = 0;
  const grow = (n) => {
    while (theta.length <= n) {
      const k = theta.length - 1, [bx, bz] = Bh(t0 + k * dt), th0 = theta[k];
      omega += (mom * Math.hypot(bx, bz) * Math.sin(Math.atan2(-bz, bx) - th0) - c * omega) / J * dt; // semi-implicit Euler
      theta.push(th0 + omega * dt);
    }
  };
  const group = new THREE.Group(), U = 1 / M;
  group.name = "compass"; group.position.copy(at);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(r * U, r * U, 0.003 * U, 40), new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.6 }));
  face.position.y = 0.0015 * U; group.add(face);
  const needle = new THREE.Group();
  for (const [side, col] of [[1, 0xc0392b], [-1, 0xf4f4f4]]) { // red N end toward +X at angle 0
    const half = new THREE.Mesh(new THREE.ConeGeometry(wd / 2 * U, L / 2 * U, 8).rotateZ(-side * Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4 }));
    half.position.x = side * L / 4 * U; needle.add(half);
  }
  needle.position.y = (0.003 + th / 2) * U; group.add(needle);
  group.userData.real = { w: 2 * r, d: 2 * r };
  const angleAt = (t) => {
    const u = Math.max(0, (t - t0) / dt), n = Math.floor(u);
    grow(n + 1);
    return theta[n] + (theta[n + 1] - theta[n]) * (u - n);
  };
  const api = { group, needle, at(t) { const angle = angleAt(t); needle.rotation.y = angle; return { angle }; } };
  api.at(t0);
  return api;
}
