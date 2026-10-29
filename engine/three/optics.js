import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";
import { cmf } from "./circuit.js";

// Light as a subject: rays traced through the set's surfaces by Snell's law and the Fresnel split, with the index of a CITED
// material, never a typed one. Lenses, mirrors, prisms, a flat interface (a water surface) and any closed mesh from the set
// refract and reflect; a lens's focus and image are traced and reported in metres for the film's numbers model, so the
// narration says the number the picture shows. Wavelengths in nm (a few, for dispersion), geometry in metres inside, positions
// of elements and results in the set's scene units at the boundary (1/M per metre, `kit.js`), except `traceRay`'s low level
// (origin and results in METRES). Nothing here adds itself to the scene: add `group` / `mesh`.
//
//   const glass = lens({ at, axis: new THREE.Vector3(0, 0, 1), R1: 0.1, R2: -0.1, thickness: 0.004, diameter: 0.03, material: "bk7" });
//   const beam = bundle([glass], { source: { at: torchTip, dir: glass.axis, kind: "parallel", radius: 0.01, count: 24 } });
//   const f = beam.image();                          // { point (scene units), focal (m, from the lens centre), spread (m) }
//   const rays = drawRays(beam, { mode: "teach" });  // clean lines and arrowheads on top of the world; rays.reveal(u) grows them
//   // in the world: drawRays(beam, { mode: "world", dust: 0.04 }) are light shafts in dust; caustic(beam, { surface }) the spot.
//
// Rays are drawn the way they are computed: the material of each medium is looked up per wavelength, so a prism spreads a
// beam and a lens focuses blue nearer than red. An element is `{ name, kind, c (centre, m), intersect(o, d), nIn(λ), nOut(λ),
// mesh }`, where a hit is `{ t (m), point, normal (unit, facing against the ray), entering }`. Indices (all at 20 °C, air at
// 15 °C and 101.325 kPa) and their sources are in `MATERIALS`; a fit's range is stated beside it.

const EPS = 1e-9; // m: a hit closer than this to the ray's start is the surface it just left
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const positive = (v) => finite(v) && v > 0;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const vec3 = (v) => v?.isVector3 && finite(v.x + v.y + v.z);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const perpLen = (v, a) => Math.sqrt(Math.max(0, v.lengthSq() - v.dot(a) ** 2)); // distance from the axis through the origin along a

// ---- materials --------------------------------------------------------------------------------------------------------

const sellmeier = (B, C) => (nm) => { const x = (nm / 1000) ** 2; let s = 1; for (let i = 0; i < B.length; i++) s += B[i] * x / (x - C[i]); return Math.sqrt(s); };

export const MATERIALS = {
  // Ciddor 1996, Appl. Opt. 35, 1566: n_D of standard air; its dispersion (about 3e-6 over the visible) is far below what a
  // picture shows.
  air: { name: "air", n: () => 1.000293, source: "Ciddor 1996, Appl. Opt. 35, 1566 (15 °C, 101.325 kPa, n_D)" },
  // Water at 20 °C: a Cauchy fit n = 1.3274 + 0.00195 / λ² (λ in µm) to Hale and Querry 1973, Appl. Opt. 12, 555 (1.337 at
  // 450 nm, 1.333 at 589 nm, 1.332 at 650 nm), good to 5e-4 over 400 to 700 nm.
  water: { name: "water", n: (nm) => 1.3274 + 0.00195 / (nm / 1000) ** 2, source: "Hale and Querry 1973, Appl. Opt. 12, 555 (20 °C), Cauchy fit over 400-700 nm" },
  // Schott N-BK7 datasheet, Sellmeier coefficients (λ in µm); n_d = 1.5168.
  bk7: { name: "BK7", n: sellmeier([1.03961212, 0.231792344, 1.01046945], [0.00600069867, 0.0200179144, 103.560653]), source: "Schott N-BK7 datasheet, Sellmeier (n_d 1.5168)" },
  // Malitson 1965, J. Opt. Soc. Am. 55, 1205 (fused silica at 20 °C); n_d = 1.4585.
  fusedSilica: { name: "fused silica", n: sellmeier([0.6961663, 0.4079426, 0.8974794], [0.0684043 ** 2, 0.1162414 ** 2, 9.896161 ** 2]), source: "Malitson 1965, J. Opt. Soc. Am. 55, 1205 (n_d 1.4585)" },
};
export const WAVELENGTHS = [450, 550, 650]; // nm: the default dispersion set, blue, green, red
const D_LINE = 589.3; // nm: the sodium D line, the default wavelength

// A material by name, or `{ n: number, source }` (no dispersion), or `{ sellmeier: { B, C }, source }`. An index without a
// `source` string is refused: an index is cited, never typed.
export function material(spec) {
  if (typeof spec === "string") {
    if (!MATERIALS[spec]) throw new Error(`material: unknown "${spec}"; the table has ${Object.keys(MATERIALS).join(", ")}, or pass { n, source }`);
    return MATERIALS[spec];
  }
  if (spec && typeof spec === "object") {
    if (typeof spec.source !== "string" || spec.source.length < 3) throw new Error("material: a custom index needs a `source` string (who measured it): an index is cited, never typed");
    if (finite(spec.n) && spec.n >= 1) return { name: spec.name ?? "custom", n: () => spec.n, source: spec.source };
    if (spec.sellmeier?.B?.length && spec.sellmeier.B.length === spec.sellmeier.C?.length) return { name: spec.name ?? "custom", n: sellmeier(spec.sellmeier.B, spec.sellmeier.C), source: spec.source };
  }
  throw new Error(`material: a name, { n >= 1, source } or { sellmeier: { B, C }, source }, got ${JSON.stringify(spec)}`);
}

// A wavelength's colour (linear sRGB, largest channel 1): the CIE fit of circuit.js, XYZ to sRGB (IEC 61966-2-1).
export function wavelengthColor(nm) {
  const [X, Y, Z] = cmf(nm);
  const r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const mx = Math.max(r, g, b, 1e-9);
  return new THREE.Color().setRGB(Math.max(0, r) / mx, Math.max(0, g) / mx, Math.max(0, b) / mx, THREE.LinearSRGBColorSpace);
}

// ---- the laws ---------------------------------------------------------------------------------------------------------

export const reflect = (dir, normal) => dir.clone().addScaledVector(normal, -2 * dir.dot(normal));

// Snell: the refracted unit direction of `dir` (unit) at a surface with unit `normal` facing against it, from index n1 into
// n2; null past the critical angle (total internal reflection).
export function snell(dir, normal, n1, n2) {
  const eta = n1 / n2, cosI = clamp(-dir.dot(normal), 0, 1), sin2T = eta * eta * (1 - cosI * cosI);
  if (sin2T > 1) return null;
  return dir.clone().multiplyScalar(eta).addScaledVector(normal, eta * cosI - Math.sqrt(1 - sin2T)).normalize();
}

// Fresnel reflectance for unpolarised light, R = (Rs + Rp) / 2, at cos(incidence) cosI from n1 into n2; 1 past the critical angle.
export function fresnel(cosI, n1, n2) {
  const c = clamp(cosI, 0, 1), s2 = (n1 / n2) ** 2 * (1 - c * c);
  if (s2 >= 1) return 1;
  const cosT = Math.sqrt(1 - s2);
  const rs = (n1 * c - n2 * cosT) / (n1 * c + n2 * cosT), rp = (n1 * cosT - n2 * c) / (n1 * cosT + n2 * c);
  return (rs * rs + rp * rp) / 2;
}

// ---- elements ---------------------------------------------------------------------------------------------------------

function where(at, who) {
  if (!vec3(at)) throw new Error(`${who}: at must be a finite THREE.Vector3 in scene units, got ${at}`);
  return at.clone().multiplyScalar(M);
}
function unit(v, who, name) {
  if (!vec3(v) || v.lengthSq() < 1e-18) throw new Error(`${who}: ${name} must be a non-zero THREE.Vector3, got ${v}`);
  return v.clone().normalize();
}
function radius(R, name, who) {
  if (!(typeof R === "number" && !Number.isNaN(R) && R !== 0)) throw new Error(`${who}: ${name} (m, signed radius of curvature, ±Infinity for a flat face) must be a non-zero number, got ${R}`);
}
// Height of a cap of signed radius R at distance rho from the axis, measured from its vertex along +axis (centre at vertex + axis R).
const sag = (R, rho) => (Number.isFinite(R) ? R - Math.sign(R) * Math.sqrt(Math.max(0, R * R - rho * rho)) : 0);

// The hits of a ray with a spherical cap: vertex v, axis a (unit), signed radius R (the centre at v + a R; ±Infinity is the flat
// face), aperture radius rad. Each hit has `sn`, the sphere's unit normal pointing away from its centre (for a flat face, -sign(R) a).
function capHits(o, d, v, a, R, rad) {
  const out = [];
  if (!Number.isFinite(R)) {
    const dn = d.dot(a);
    if (Math.abs(dn) < 1e-15) return out;
    const t = v.clone().sub(o).dot(a) / dn;
    if (t > EPS) { const p = o.clone().addScaledVector(d, t); if (perpLen(p.clone().sub(v), a) <= rad) out.push({ t, point: p, sn: a.clone().multiplyScalar(-Math.sign(R)) }); }
    return out;
  }
  const C = v.clone().addScaledVector(a, R), oc = o.clone().sub(C), b = oc.dot(d), disc = b * b - (oc.lengthSq() - R * R);
  if (disc < 0) return out;
  const s = Math.sqrt(disc);
  for (const t of [-b - s, -b + s]) {
    if (!(t > EPS)) continue;
    const p = o.clone().addScaledVector(d, t), w = p.clone().sub(C);
    if (Math.sign(R) * w.dot(a) < 0 && perpLen(p.clone().sub(v), a) <= rad) out.push({ t, point: p, sn: w.multiplyScalar(1 / Math.abs(R)) });
  }
  return out;
}

function place(mesh, axis, at) { // a mesh built along +Y, turned to `axis`, at `at` (metres) in scene units
  mesh.quaternion.setFromUnitVectors(V(0, 1, 0), axis);
  mesh.position.copy(at).multiplyScalar(1 / M);
  return mesh;
}
function hit(el, d, t, point, outward) {
  const entering = d.dot(outward) < 0;
  return { t, point, normal: entering ? outward.clone() : outward.clone().negate(), entering, el };
}

// A flat boundary between two media: an infinite plane (a water surface, a window face) with `below` on the -normal side. `size`
// (m) is only the drawn sheet.
function interfaceAt({ at, normal, below = "water", above = "air", size = 1 } = {}) {
  const c = where(at, "interface"), n = unit(normal, "interface", "normal"), lo = material(below), hi = material(above);
  if (!positive(size)) throw new Error(`interface: size (m, the drawn sheet) must be > 0, got ${size}`);
  const mesh = place(new THREE.Mesh(new THREE.PlaneGeometry(size / M, size / M).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfe3ee, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false })), n, c.clone().multiplyScalar(1 / M));
  mesh.name = "interface";
  return { name: "interface", kind: "dielectric", c, plane: { c, n }, below: lo, above: hi, nIn: lo.n, nOut: hi.n, mesh, intersect(o, d) {
    const dn = d.dot(n);
    if (Math.abs(dn) < 1e-15) return null;
    const t = c.clone().sub(o).dot(n) / dn;
    return t > EPS ? hit(this, d, t, o.clone().addScaledVector(d, t), n) : null;
  } };
}
export { interfaceAt as interface };

// A lens of two spherical caps and a cylindrical rim, axis `axis` (light travels along +axis). `at` is the middle of the centre
// thickness; R1 is the face the light meets first and R2 the one it leaves by, signed as in the lensmaker's formula (R > 0:
// the centre of curvature on the outgoing side; ±Infinity is a flat face). `thickness` is on the axis. Real size on `mesh`.
//   focal(λ)  thick-lens focal length f, 1/f = (n-1) [1/R1 - 1/R2 + (n-1) d / (n R1 R2)]       (m)
//   bfd(λ)    back focal distance from the rear vertex, f (1 - (n-1) d / (n R1))                 (m)
//   thin(λ)   the thin-lens focal length, 1/f = (n-1) (1/R1 - 1/R2)                              (m)
export function lens({ at, axis, R1, R2, thickness, diameter, material: mat = "bk7", outside = "air" } = {}) {
  radius(R1, "R1", "lens"); radius(R2, "R2", "lens");
  if (!positive(thickness)) throw new Error(`lens: thickness (m, on the axis) must be > 0, got ${thickness}`);
  if (!positive(diameter)) throw new Error(`lens: diameter (m) must be > 0, got ${diameter}`);
  const rad = diameter / 2, c = where(at, "lens"), a = unit(axis, "lens", "axis"), mt = material(mat), out = material(outside);
  for (const [k, R] of [["R1", R1], ["R2", R2]]) if (Number.isFinite(R) && Math.abs(R) < rad) throw new Error(`lens: diameter ${diameter} m is wider than the sphere of ${k} = ${R} m (|R| must be at least the half diameter)`);
  const zf = (rho) => -thickness / 2 + sag(R1, rho), zb = (rho) => thickness / 2 + sag(R2, rho);
  if (!(zb(rad) - zf(rad) > 0)) throw new Error(`lens: the thickness ${thickness} m leaves no glass at the rim of a ${diameter} m lens with R1 ${R1} and R2 ${R2}: the faces cross; thicken it or narrow the diameter`);
  const v1 = c.clone().addScaledVector(a, -thickness / 2), v2 = c.clone().addScaledVector(a, thickness / 2);
  const profile = [];
  const N = 20;
  for (let i = 0; i <= N; i++) { const rho = rad * i / N; profile.push(new THREE.Vector2(rho, zf(rho))); }
  for (let i = N; i >= 0; i--) { const rho = rad * i / N; profile.push(new THREE.Vector2(rho, zb(rho))); }
  const geo = new THREE.LatheGeometry(profile, 64).scale(1 / M, 1 / M, 1 / M);
  const mesh = place(new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: mt.n(D_LINE), thickness: thickness / M, roughness: 0.02, side: THREE.DoubleSide })), a, c);
  mesh.name = "lens";
  const ext = Math.max(zb(0), zb(rad)) - Math.min(zf(0), zf(rad)); // extent along the axis
  const along = ["x", "y", "z"].map((k) => Math.abs(a[k]));
  const real = { w: diameter, h: diameter, d: diameter };
  const k = along.findIndex((v) => v > 0.999999);
  if (k >= 0) { real[["w", "h", "d"][k]] = ext; mesh.userData.real = real; } // a tilted lens has no axis-aligned size to audit
  const inv = (R) => (Number.isFinite(R) ? 1 / R : 0);
  const focal = (nm = D_LINE) => { const n = mt.n(nm); return 1 / ((n - 1) * (inv(R1) - inv(R2) + (n - 1) * thickness / n * inv(R1) * inv(R2))); };
  return { name: "lens", kind: "dielectric", c, axis: a, R1, R2, thickness, diameter, material: mt, nIn: mt.n, nOut: out.n, mesh,
    focal, thin: (nm = D_LINE) => 1 / ((mt.n(nm) - 1) * (inv(R1) - inv(R2))),
    bfd: (nm = D_LINE) => focal(nm) * (1 - (mt.n(nm) - 1) * thickness / mt.n(nm) * inv(R1)),
    intersect(o, d) {
      const cand = [];
      for (const h of capHits(o, d, v1, a, R1, rad)) cand.push({ t: h.t, point: h.point, out: h.sn.clone().multiplyScalar(Math.sign(R1)) });
      for (const h of capHits(o, d, v2, a, R2, rad)) cand.push({ t: h.t, point: h.point, out: h.sn.clone().multiplyScalar(-Math.sign(R2)) });
      { // the rim: the infinite cylinder of radius rad about the axis, valid between the two faces there
        const q = o.clone().sub(c), qp = q.clone().addScaledVector(a, -q.dot(a)), dp = d.clone().addScaledVector(a, -d.dot(a)), A = dp.lengthSq();
        if (A > 1e-18) {
          const B = qp.dot(dp), disc = B * B - A * (qp.lengthSq() - rad * rad);
          if (disc >= 0) for (const t of [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A]) {
            if (!(t > EPS)) continue;
            const p = o.clone().addScaledVector(d, t), w = p.clone().sub(c), z = w.dot(a);
            if (z >= zf(rad) && z <= zb(rad)) cand.push({ t, point: p, out: w.addScaledVector(a, -z).normalize() });
          }
        }
      }
      let best = null;
      for (const h of cand) if (!best || h.t < best.t) best = h;
      return best ? hit(this, d, best.t, best.point, best.out) : null;
    } };
}

// A mirror: a plane (R = Infinity) or a spherical cap of signed radius R (R > 0 concave, the centre of curvature on the side of
// `normal`, which points to the light), diameter `diameter`. `reflect` is the coating's reflectance (1 ideal; a real silver
// coating ~0.95, cite it). Only the front reflects: rays reaching the back pass.
export function mirror({ at, normal, R = Infinity, diameter, reflect: refl = 1 } = {}) {
  radius(R, "R", "mirror");
  if (!positive(diameter)) throw new Error(`mirror: diameter (m) must be > 0, got ${diameter}`);
  if (!(finite(refl) && refl > 0 && refl <= 1)) throw new Error(`mirror: reflect (the coating's reflectance) must be in (0, 1], got ${refl}`);
  const rad = diameter / 2, c = where(at, "mirror"), n = unit(normal, "mirror", "normal");
  if (Number.isFinite(R) && Math.abs(R) < rad) throw new Error(`mirror: diameter ${diameter} m is wider than the sphere of R = ${R} m`);
  const prof =[new THREE.Vector2(0, sag(R, 0) - 0.003), new THREE.Vector2(rad, sag(R, rad) - 0.003)];
  for (let i = 20; i >= 0; i--) { const rho = rad * i / 20; prof.push(new THREE.Vector2(rho, sag(R, rho))); }
  const mesh = place(new THREE.Mesh(new THREE.LatheGeometry(prof, 64).scale(1 / M, 1 / M, 1 / M), new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.03, side: THREE.DoubleSide })), n, c);
  mesh.name = "mirror";
  return { name: "mirror", kind: "mirror", c, normal: n, R, reflectance: refl, mesh, nIn: () => 1, nOut: () => 1, intersect(o, d) {
    let best = null;
    for (const h of capHits(o, d, c, n, R, rad)) {
      const front = h.sn.clone().multiplyScalar(-Math.sign(R)); // toward the light
      if (d.dot(front) < 0 && (!best || h.t < best.t)) best = { t: h.t, point: h.point, front };
    }
    return best ? { t: best.t, point: best.point, normal: best.front, entering: true, el: this } : null;
  } };
}

// A convex solid from planes with outward normals: `planes` is [{ n, p }] (p a point on it, metres).
function convex(planes, o, d, el) {
  let tIn = -Infinity, tOut = Infinity, nIn = null, nOut = null;
  for (const { n, p } of planes) {
    const denom = d.dot(n), num = p.clone().sub(o).dot(n);
    if (Math.abs(denom) < 1e-15) { if (num < 0) return null; continue; }
    const t = num / denom;
    if (denom < 0) { if (t > tIn) { tIn = t; nIn = n; } } else if (t < tOut) { tOut = t; nOut = n; }
  }
  if (tIn > tOut) return null;
  if (tIn > EPS && nIn) return hit(el, d, tIn, o.clone().addScaledVector(d, tIn), nIn);
  if (tOut > EPS && nOut && Number.isFinite(tOut)) return hit(el, d, tOut, o.clone().addScaledVector(d, tOut), nOut);
  return null;
}

// An isosceles triangular prism: apex angle `apex` (rad), `height` from base to apex (m), `length` along the apex edge (m).
// The edge runs along `edge` (default +Y) and the apex points along `facing` (default +Z); `at` is the middle of the
// cross-section's centroid. The usual dispersing prism: apex 60°.
export function prism({ at, apex, height, length, material: mat = "bk7", outside = "air", edge = V(0, 1, 0), facing = V(0, 0, 1) } = {}) {
  if (!(positive(apex) && apex < Math.PI)) throw new Error(`prism: apex (rad) must be in (0, pi), got ${apex}`);
  if (!positive(height) || !positive(length)) throw new Error(`prism: height and length (m) must be > 0, got ${height}, ${length}`);
  const c = where(at, "prism"), e = unit(edge, "prism", "edge"), f0 = unit(facing, "prism", "facing"), f = f0.clone().addScaledVector(e, -f0.dot(e)).normalize();
  if (!(f.lengthSq() > 0.5)) throw new Error("prism: facing must not run along the edge");
  const s = new THREE.Vector3().crossVectors(e, f), mt = material(mat), out = material(outside), h = height, ca = Math.cos(apex / 2), sa = Math.sin(apex / 2);
  const at3 = (x, y, z) => c.clone().addScaledVector(s, x).addScaledVector(f, y).addScaledVector(e, z);
  const planes = [
    { n: f.clone().negate(), p: at3(0, -h / 3, 0) },
    { n: s.clone().multiplyScalar(ca).addScaledVector(f, sa), p: at3(0, 2 * h / 3, 0) },
    { n: s.clone().multiplyScalar(-ca).addScaledVector(f, sa), p: at3(0, 2 * h / 3, 0) },
    { n: e.clone(), p: at3(0, 0, length / 2) }, { n: e.clone().negate(), p: at3(0, 0, -length / 2) }];
  const b2 = h * Math.tan(apex / 2), shape = new THREE.Shape([new THREE.Vector2(-b2, -h / 3), new THREE.Vector2(b2, -h / 3), new THREE.Vector2(0, 2 * h / 3)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false }).translate(0, 0, -length / 2).scale(1 / M, 1 / M, 1 / M);
  const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 1, ior: mt.n(D_LINE), thickness: h / M, roughness: 0.02 }));
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(s, f, e.clone().negate())); mesh.position.copy(c).multiplyScalar(1 / M); mesh.name = "prism";
  return { name: "prism", kind: "dielectric", c, material: mt, nIn: mt.n, nOut: out.n, mesh, intersect(o, d) { return convex(planes, o, d, this); } };
}

// Any CLOSED mesh from the set, as a refracting solid: the ray is cast against its triangles (both sides), the surface normal
// is the mesh's own, interpolated between vertices and carried through the mesh's transform. Winding must be outward.
// `inside` and `outside` are materials (names or cited objects).
export function surfaceFromMesh(mesh, { inside, outside } = {}) {
  if (!mesh?.isMesh) throw new Error("surfaceFromMesh: needs a THREE.Mesh (a closed solid)");
  if (inside === undefined || outside === undefined) throw new Error("surfaceFromMesh: both `inside` and `outside` materials are required (an index is cited, never assumed)");
  const mi = material(inside), mo = material(outside), probe = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), rc = new THREE.Raycaster();
  rc.near = 0; rc.far = Infinity;
  const c = new THREE.Box3().setFromObject(mesh).getCenter(V()).multiplyScalar(M);
  return { name: mesh.name || "mesh", kind: "dielectric", c, material: mi, nIn: mi.n, nOut: mo.n, mesh, intersect(o, d) {
    mesh.updateWorldMatrix(true, false); probe.matrixWorld.copy(mesh.matrixWorld);
    rc.set(o.clone().multiplyScalar(1 / M), d);
    const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    for (const h of rc.intersectObject(probe, false)) {
      const t = h.distance * M;
      if (!(t > EPS)) continue;
      const geom = h.face.normal.clone().applyMatrix3(nm).normalize(); // outward, by the winding
      let smooth = h.normal ? h.normal.clone().applyMatrix3(nm).normalize() : geom.clone();
      if (smooth.dot(geom) < 0) smooth.negate();
      return outwardHit(this, d, t, o, geom, smooth);
    }
    return null;
  } };
}
function outwardHit(el, d, t, o, geom, smooth) { // entering is read from the face (exact), the normal used is the smooth one
  const entering = d.dot(geom) < 0;
  return { t, point: o.clone().addScaledVector(d, t), normal: entering ? smooth : smooth.clone().negate(), entering, el };
}

// ---- tracing ----------------------------------------------------------------------------------------------------------

// Trace one ray through `elements` (METRES: origin, results). At each surface the power splits by Fresnel into a reflected and
// a refracted branch (a mirror reflects its coating's share; total internal reflection reflects it all); branches under
// `minPower` (a share of the source `power`, default 0.01) are dropped, and a ray stops after `maxDepth` surfaces. The medium on each side is the element's own (`nIn` /
// `nOut`), so elements must not overlap. Returns { segments: [{ a, b, power, λ, depth, s0 }] (s0: path length at the start),
// rays: the escaping rays [{ origin, dir, power, λ }] (each also drawn `escape` metres long), power (the source's), length }.
export function traceRay(elements, { origin, dir, λ = D_LINE, power = 1, maxDepth = 8, minPower = 0.01, escape = 1 } = {}) {
  if (!Array.isArray(elements) || !elements.length) throw new Error("traceRay: elements is a non-empty array of lens / mirror / prism / interface / surfaceFromMesh");
  if (!vec3(origin)) throw new Error(`traceRay: origin must be a finite THREE.Vector3 (metres), got ${origin}`);
  if (!vec3(dir) || dir.lengthSq() < 1e-18) throw new Error(`traceRay: dir must be a non-zero THREE.Vector3, got ${dir}`);
  if (!positive(λ)) throw new Error(`traceRay: λ (nm) must be > 0, got ${λ}`);
  if (!positive(power)) throw new Error(`traceRay: power (the source's, relative) must be > 0, got ${power}`);
  if (!positive(escape)) throw new Error(`traceRay: escape (m, how far an escaping ray is drawn) must be > 0, got ${escape}`);
  const segments = [], rays = [], floor = minPower * power; // `minPower` is a share of the source power: a beam of power 2 keeps the same branches as one of power 1
  const go = (o, d, p, depth, s0) => {
    let best = null;
    for (const el of elements) { const h = el.intersect(o, d); if (h && (!best || h.t < best.t)) best = h; }
    if (!best) {
      segments.push({ a: o.clone(), b: o.clone().addScaledVector(d, escape), power: p, λ, depth, s0 });
      rays.push({ origin: o.clone(), dir: d.clone(), power: p, λ });
      return;
    }
    segments.push({ a: o.clone(), b: best.point.clone(), power: p, λ, depth, s0 });
    if (depth >= maxDepth) return;
    const el = best.el, s1 = s0 + best.t;
    if (el.kind === "mirror") { if (p * el.reflectance >= floor) go(best.point, reflect(d, best.normal), p * el.reflectance, depth + 1, s1); return; }
    const n1 = best.entering ? el.nOut(λ) : el.nIn(λ), n2 = best.entering ? el.nIn(λ) : el.nOut(λ);
    const R = fresnel(-d.dot(best.normal), n1, n2), t = snell(d, best.normal, n1, n2);
    if (R * p >= floor) go(best.point, reflect(d, best.normal), p * R, depth + 1, s1);
    if (t && (1 - R) * p >= floor) go(best.point, t, p * (1 - R), depth + 1, s1);
  };
  go(origin.clone(), dir.clone().normalize(), power, 0, 0);
  return { segments, rays, power, length: segments.reduce((m, s) => Math.max(m, s.s0 + s.a.distanceTo(s.b)), 0) };
}

// A bundle from a source with real geometry, each ray traced at each wavelength. `source`: { at (scene units), dir, kind:
// "parallel" (a collimated beam of `radius` m: a torch, the Sun) | "point" (a cone of `halfAngle` rad from `at`), count }.
// Returns { segments, rays, wavelengths, area (m², the beam's cross-section, 0 for a point), rayRadius (m), length, power (each ray's start power, a unit for brightness), image(λ) }.
// `image(λ)` is where the main escaping rays converge: the point minimising the summed squared distance to their lines, as
// { point (scene units), pointM (m), spread (RMS distance of the lines to it, m), focal (m, along the source direction from the
// first element's centre) } (point null and focal Infinity for parallel rays), the numbers the narration says.
export function bundle(elements, { source, wavelengths = WAVELENGTHS, power = 1, ...opts } = {}) {
  if (!source || typeof source !== "object") throw new Error("bundle: source is { at, dir, kind: 'parallel' | 'point', radius | halfAngle, count }");
  const kind = source.kind, count = source.count ?? 24, dir = unit(source.dir, "bundle", "source.dir"), at = where(source.at, "bundle");
  if (kind !== "parallel" && kind !== "point") throw new Error(`bundle: source.kind must be "parallel" or "point", got ${kind}`);
  if (!Number.isInteger(count) || count < 1) throw new Error(`bundle: source.count must be a whole number >= 1, got ${count}`);
  if (kind === "parallel" && !positive(source.radius)) throw new Error(`bundle: a parallel source needs radius (m) > 0, got ${source.radius}`);
  if (kind === "point" && !(positive(source.halfAngle) && source.halfAngle < Math.PI / 2)) throw new Error(`bundle: a point source needs halfAngle (rad) in (0, pi/2), got ${source.halfAngle}`);
  if (!Array.isArray(wavelengths) || !wavelengths.length || !wavelengths.every(positive)) throw new Error("bundle: wavelengths is a non-empty array of nm");
  const u = Math.abs(dir.x) < 0.9 ? V(1, 0, 0) : V(0, 1, 0);
  u.addScaledVector(dir, -u.dot(dir)).normalize();
  const w = new THREE.Vector3().crossVectors(dir, u), starts = [];
  for (let i = 0; i < count; i++) {
    const q = Math.sqrt((i + 0.5) / count), th = i * GOLDEN, ring = u.clone().multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th));
    if (kind === "parallel") starts.push({ o: at.clone().addScaledVector(ring, source.radius * q), d: dir });
    else { const ang = source.halfAngle * q; starts.push({ o: at.clone(), d: dir.clone().multiplyScalar(Math.cos(ang)).addScaledVector(ring, Math.sin(ang)) }); }
  }
  const segments = [], rays = [];
  starts.forEach((s, i) => {
    for (const λ of wavelengths) {
      const r = traceRay(elements, { origin: s.o, dir: s.d, λ, power, ...opts });
      for (const g of r.segments) segments.push({ ...g, ray: i });
      for (const g of r.rays) rays.push({ ...g, ray: i });
    }
  });
  const area = kind === "parallel" ? Math.PI * source.radius ** 2 : 0, mid = wavelengths[Math.floor(wavelengths.length / 2)];
  const length = segments.reduce((m, s) => Math.max(m, s.s0 + s.a.distanceTo(s.b)), 0);
  const mainRays = (λ) => { const by = new Map(); for (const r of rays) if (r.λ === λ && (!by.has(r.ray) || r.power > by.get(r.ray).power)) by.set(r.ray, r); return [...by.values()]; };
  const api = { segments, rays, wavelengths, area, rayRadius: kind === "parallel" ? source.radius / Math.sqrt(count) : 0.0005, length, count, power, elements, mainRays, mid,
    image(λ = mid) {
      const main = mainRays(λ);
      if (!main.length) throw new Error("bundle.image: no ray escaped the elements at this wavelength");
      const A = new THREE.Matrix3(), a = [0, 0, 0, 0, 0, 0, 0, 0, 0], b = V();
      for (const r of main) {
        const P = [1 - r.dir.x * r.dir.x, -r.dir.x * r.dir.y, -r.dir.x * r.dir.z, -r.dir.y * r.dir.x, 1 - r.dir.y * r.dir.y, -r.dir.y * r.dir.z, -r.dir.z * r.dir.x, -r.dir.z * r.dir.y, 1 - r.dir.z * r.dir.z];
        for (let i = 0; i < 9; i++) a[i] += P[i];
        b.x += P[0] * r.origin.x + P[1] * r.origin.y + P[2] * r.origin.z; b.y += P[3] * r.origin.x + P[4] * r.origin.y + P[5] * r.origin.z; b.z += P[6] * r.origin.x + P[7] * r.origin.y + P[8] * r.origin.z;
      }
      A.set(...a);
      const det = A.determinant();
      if (!(Math.abs(det) > 1e-9 * main.length ** 3)) return { point: null, pointM: null, spread: 0, focal: Infinity };
      const pointM = b.applyMatrix3(A.invert());
      let ss = 0;
      for (const r of main) { const d = pointM.clone().sub(r.origin); ss += perpLen(d, r.dir) ** 2; }
      return { point: pointM.clone().multiplyScalar(1 / M), pointM, spread: Math.sqrt(ss / main.length), focal: pointM.clone().sub(elements[0].c).dot(dir) };
    } };
  return api;
}

// Where a submerged `point` appears to a viewer at `eye` looking down through a flat `surface` (an `interface`): both in scene
// units. The sight line is bent at the surface by Snell's law (found by bisection: the bend is monotonic), and the image is
// where that line, drawn straight on, meets the vertical (surface-normal) line through the point: the textbook apparent
// depth, depth x n_above / n_below near the normal. Returns { through (where the sight line crosses the surface), image }.
export function apparent(point, eye, surface, { λ = D_LINE } = {}) {
  if (!surface?.plane) throw new Error("apparent: surface is an interface() element");
  if (!vec3(point) || !vec3(eye)) throw new Error("apparent: point and eye are finite THREE.Vector3 in scene units");
  const { c, n } = surface.plane, P = point.clone().multiplyScalar(M), E = eye.clone().multiplyScalar(M);
  const he = E.clone().sub(c).dot(n), hp = -P.clone().sub(c).dot(n);
  if (!(he > 0)) throw new Error("apparent: the eye must be above the surface (on the side of its normal)");
  if (!(hp >= -1e-9)) throw new Error("apparent: the point must be below the surface"); // a nanometre of slack: a point meant to sit on the surface may round a hair above it
  const na = surface.nOut(λ), nb = surface.nIn(λ);
  const foot = E.clone().addScaledVector(n, -he), toP = P.clone().addScaledVector(n, hp).sub(foot), s = toP.length();
  const hdir = s > 1e-12 ? toP.clone().multiplyScalar(1 / s) : V();
  if (hp < 1e-12) return { through: point.clone(), image: point.clone() }; // on the surface itself
  if (s < 1e-12) return { through: foot.clone().multiplyScalar(1 / M), image: P.clone().addScaledVector(n, hp - hp * na / nb).multiplyScalar(1 / M) }; // straight down
  const f = (x) => na * x / Math.hypot(x, he) - nb * (s - x) / Math.hypot(s - x, hp);
  let lo = 0, hi = s;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid; }
  const x = (lo + hi) / 2, X = foot.clone().addScaledVector(hdir, x), depth = he * (s - x) / x;
  return { through: X.clone().multiplyScalar(1 / M), image: P.clone().addScaledVector(n, hp - depth).multiplyScalar(1 / M) };
}

// ---- drawing ----------------------------------------------------------------------------------------------------------

// Draw a trace (`traceRay` or `bundle` result). mode "teach": clean tubes (width = the radius at full power, m; thinner for
// weaker branches) and arrowheads on top of the world, coloured by wavelength when more than one was traced. mode "world":
// light shafts in dust, additive and depth tested; a beam shows only as much as the dust scatters, so `dust` (the scattered
// fraction, 0..1) is required: no dust, no visible shaft. `reveal(u)` (0..1) grows every ray along its path from the source
// (a branch starts where its parent ends); `visible` counts the segments showing. Returns { group, rays, arrows, reveal(u), visible, length }.
export function drawRays(result, { mode = "teach", width, arrowEvery, dust, colorBy = "wavelength", color = 0xffffff } = {}) {
  if (mode !== "teach" && mode !== "world") throw new Error(`drawRays: mode must be "teach" or "world", got ${mode}`);
  if (!result?.segments) throw new Error("drawRays: result is a traceRay() or bundle() result");
  if (mode === "world" && !(finite(dust) && dust > 0 && dust <= 1)) throw new Error("drawRays: dust (the fraction of light the air scatters, 0..1) is required in world mode: with no dust a beam has no visible shaft");
  if (width !== undefined && !positive(width)) throw new Error(`drawRays: width (m, the tube radius) must be > 0, got ${width}`);
  if (arrowEvery !== undefined && !positive(arrowEvery)) throw new Error(`drawRays: arrowEvery (m) must be > 0, got ${arrowEvery}`);
  const teach = mode === "teach", S = result.segments, rm = width ?? (teach ? 0.0004 : Math.max(result.rayRadius ?? 0.001, 0.0003)), r = rm / M;
  const many = new Set(S.map((s) => s.λ)).size > 1, group = new THREE.Group(); group.name = "rays";
  const mat = teach ? new THREE.MeshBasicMaterial({ depthTest: false, depthWrite: false, transparent: true })
    : new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const rays = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, teach ? 8 : 12, 1, true), mat, Math.max(1, S.length));
  rays.name = "ray segments"; rays.frustumCulled = false; rays.renderOrder = teach ? 10 : 0;
  const tint = new THREE.Color(color), col = new THREE.Color();
  const p0 = positive(result.power) ? result.power : 1; // a branch's share of what the source carried, so the source's own power is not a brightness
  const colorOf = (s) => { col.copy(many && colorBy === "wavelength" ? wavelengthColor(s.λ) : tint); if (!teach) col.multiplyScalar(dust * s.power / p0); return col; };
  S.forEach((s, i) => rays.setColorAt(i, colorOf(s)));
  // Arrowheads on the middle wavelength's strong segments (one per segment at 55 %, or every `arrowEvery` m).
  const wl = [...new Set(S.map((s) => s.λ))].sort((a, b) => a - b), mid = wl[Math.floor(wl.length / 2)], top = S.reduce((m, s) => Math.max(m, s.power), 0);
  const marks = [];
  if (teach) S.forEach((s, i) => {
    const len = s.a.distanceTo(s.b);
    if (s.λ !== mid || s.power < 0.2 * top || len < 24 * rm) return;
    if (arrowEvery) for (let k = arrowEvery / 2, n = 0; k < len && n < 64; k += arrowEvery, n++) marks.push({ i, frac: k / len });
    else marks.push({ i, frac: 0.55 });
  });
  const cone = new THREE.ConeGeometry(3 * r, 8 * r, 10).translate(0, 4 * r, 0);
  const arrows = new THREE.InstancedMesh(cone, mat, Math.max(1, marks.length));
  arrows.name = "arrowheads"; arrows.frustumCulled = false; arrows.renderOrder = rays.renderOrder; arrows.count = 0;
  for (let k = 0; k < Math.max(1, marks.length); k++) arrows.setColorAt(k, marks[k] ? colorOf(S[marks[k].i]) : tint);
  const length = result.length ?? S.reduce((m, s) => Math.max(m, s.s0 + s.a.distanceTo(s.b)), 0), Y = V(0, 1, 0), q = new THREE.Quaternion(), mtx = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const api = { group, rays, arrows, length, visible: 0, reveal(u) {
    const front = clamp(Number.isFinite(u) ? u : 1, 0, 1) * length;
    let seen = 0;
    S.forEach((s, i) => {
      const len = s.a.distanceTo(s.b), shown = clamp(front - s.s0, 0, len);
      if (!(shown > 0) || len < 1e-12) { rays.setMatrixAt(i, zero); return; }
      const d = s.b.clone().sub(s.a).multiplyScalar(1 / len), rr = teach ? r * Math.sqrt(clamp(s.power / p0, 0.05, 1)) : r;
      q.setFromUnitVectors(Y, d);
      mtx.compose(s.a.clone().addScaledVector(d, shown / 2).multiplyScalar(1 / M), q, V(rr, shown / M, rr));
      rays.setMatrixAt(i, mtx); seen++;
    });
    let k = 0;
    for (const mk of marks) {
      const s = S[mk.i], len = s.a.distanceTo(s.b);
      if (front - s.s0 < mk.frac * len) continue;
      const d = s.b.clone().sub(s.a).multiplyScalar(1 / len);
      q.setFromUnitVectors(Y, d);
      mtx.compose(s.a.clone().addScaledVector(d, mk.frac * len).multiplyScalar(1 / M), q, V(1, 1, 1));
      arrows.setMatrixAt(k++, mtx);
    }
    arrows.count = k; arrows.instanceMatrix.needsUpdate = true; rays.instanceMatrix.needsUpdate = true; rays.instanceColor.needsUpdate = true; arrows.instanceColor.needsUpdate = true;
    api.visible = seen;
    return api;
  } };
  group.add(rays, arrows);
  api.reveal(1);
  return api;
}

// The bright spot a bundle leaves on a receiving plane `surface` = { at (scene units), normal }: a disc where the main escaping
// rays land, centred on their mean, of radius sqrt(2) x their RMS spread (the radius of a uniform disc with that spread; never
// under half a millimetre), brightness = base x transmittance x (beam area / spot area), the concentration of the light, clamped
// to 1. `base` is how bright the unconcentrated beam looks on that surface (a look choice, default 0.1). A disc decal, additive,
// lifted off the surface by polygonOffset like a tile fill. userData: { radius (m), concentration, brightness, centre }.
export function caustic(result, { surface, base = 0.1, wavelength } = {}) {
  if (!surface || !vec3(surface.at) || !vec3(surface.normal)) throw new Error("caustic: surface is { at (scene units), normal }, the plane that receives the light");
  if (!positive(result?.area)) throw new Error("caustic: needs a bundle with a parallel source (a beam area to concentrate)");
  const n = unit(surface.normal, "caustic", "surface.normal"), c = surface.at.clone().multiplyScalar(M), main = result.mainRays(wavelength ?? result.mid), hits = [];
  let power = 0;
  for (const ray of main) {
    const dn = ray.dir.dot(n);
    if (Math.abs(dn) < 1e-12) continue;
    const t = c.clone().sub(ray.origin).dot(n) / dn;
    if (t > 0) { hits.push(ray.origin.clone().addScaledVector(ray.dir, t)); power += ray.power; }
  }
  if (!hits.length) throw new Error("caustic: no ray reaches the receiving surface");
  const mean = hits.reduce((a, p) => a.add(p), V()).multiplyScalar(1 / hits.length);
  const rms = Math.sqrt(hits.reduce((a, p) => a + p.distanceToSquared(mean), 0) / hits.length), rad = Math.max(Math.SQRT2 * rms, 0.0005);
  const concentration = result.area / (Math.PI * rad * rad), transmittance = power / (result.count * (result.power ?? 1)), brightness = clamp(base * transmittance * concentration, 0, 1);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(rad / M, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(brightness, brightness, brightness * 0.95, THREE.LinearSRGBColorSpace), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  disc.quaternion.setFromUnitVectors(V(0, 0, 1), n);
  disc.position.copy(mean).addScaledVector(n, 0.0002).multiplyScalar(1 / M);
  disc.name = "caustic"; disc.userData = { radius: rad, concentration, brightness, centre: mean.clone().multiplyScalar(1 / M) };
  return disc;
}
