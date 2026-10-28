import { THREE, RoundedBoxGeometry } from "./three-vendor.js";
import { M } from "./kit.js";

// Parametric machine parts at their standard proportions, so a mechanism (one real mechanism, its housing in
// x-ray) is assembled from parts instead of modelled: bolt, nut, washer (ISO metric), a deep-groove ball bearing, a
// helical compression spring that compresses by its law, a shaft, a control knob, a housing and the x-ray material.
// Gears, belts and chains are transmission.js; boards and cables electronics.js; wires circuit.js.
// Every part is modelled in metres in a group scaled 1/M (place it in scene units), declares its real size for
// scaleAudit, and takes `mat` (default: the look's steel grey; pass the accent for the named part). Axis: +y. A part
// that does not exist in the table (an M7 bolt, a 6305 bearing) is refused with the sizes it knows, never guessed.
// Sources: ISO 261 (coarse pitch), ISO 4017 (hex head s, k), ISO 4032 (nut m), ISO 7089 (washer), ISO 15 / maker
// catalogues (bearing d D B; ball count and size vary a little by maker), Shigley's Mechanical Engineering Design
// (spring rate k = G d^4 / (8 D^3 n), G = 79.3 GPa for music wire).
// ponytail: threads are rings at the real pitch (a lathe), not a helix; a helix when a macro shot turns a bolt.

const DEG = Math.PI / 180;
// size: [d, pitch P, across flats s, head height k, nut height m, washer d1, d2, h] in mm
export const METRIC = Object.freeze({
  M3: [3, 0.5, 5.5, 2, 2.4, 3.2, 7, 0.5], M4: [4, 0.7, 7, 2.8, 3.2, 4.3, 9, 0.8], M5: [5, 0.8, 8, 3.5, 4.7, 5.3, 10, 1],
  M6: [6, 1, 10, 4, 5.2, 6.4, 12, 1.6], M8: [8, 1.25, 13, 5.3, 6.8, 8.4, 16, 1.6], M10: [10, 1.5, 16, 6.4, 8.4, 10.5, 20, 2],
  M12: [12, 1.75, 18, 7.5, 10.8, 13, 24, 2.5], M16: [16, 2, 24, 10, 14.8, 17, 30, 3],
});
// code: [bore d, outside D, width B, balls Z, ball diameter Dw] in mm
export const BEARINGS = Object.freeze({
  608: [8, 22, 7, 7, 3.969], 6000: [10, 26, 8, 7, 4.763], 6200: [10, 30, 9, 7, 4.763], 6201: [12, 32, 10, 7, 5.953],
  6202: [15, 35, 11, 8, 5.953], 6203: [17, 40, 12, 8, 6.747], 6204: [20, 47, 14, 8, 7.938],
});
export const STEEL_G = 79.3e9; // Pa, shear modulus of spring steel (music wire)

const steel = () => new THREE.MeshStandardMaterial({ color: 0xa7a9ab, metalness: 0.6, roughness: 0.42 });
const pick = (table, key, what) => { const v = table[key]; if (!v) throw new Error(`${what} "${key}" is not in the table (${Object.keys(table).join(", ")})`); return v.map((x, i) => (i === 3 && what === "bearing" ? x : x / 1000)); };
const pos = (v, n, f) => { if (!(typeof v === "number" && Number.isFinite(v) && v > 0)) throw new Error(`${f}: ${n} is a length in metres, > 0 (got ${v})`); return v; };
function part(name, real, ...meshes) {
  const g = new THREE.Group();
  g.name = name; g.scale.setScalar(1 / M); g.userData.real = real;
  meshes.forEach((m) => { m.castShadow = m.receiveShadow = true; g.add(m); });
  return g;
}
const lathe = (pts, mat, seg = 64) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
// A hexagon prism with its corners on z (across flats along x), from y0 to y0 + h; hole: a bore radius.
function hex(s, h, y0, mat, hole = 0) {
  const r = s / Math.sqrt(3), sh = new THREE.Shape();
  for (let i = 0; i < 6; i++) { const a = (90 + 60 * i) * DEG; i ? sh.lineTo(r * Math.cos(a), r * Math.sin(a)) : sh.moveTo(r * Math.cos(a), r * Math.sin(a)); }
  if (hole) sh.holes.push(new THREE.Path().absarc(0, 0, hole, 0, Math.PI * 2, true));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 32 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0);
  return new THREE.Mesh(g, mat);
}

// bolt({ size, length }): ISO 4017 hex head bolt, threaded to the head, a 45° chamfer at the point. Origin: the
// head's bearing face; the shank runs down to -length, the head up to +k.
export function bolt({ size = "M6", length = 0.03, mat = steel() } = {}) {
  const [d, P, s, k] = pick(METRIC, size, "bolt");
  pos(length, "length", "bolt()");
  const r = d / 2, root = r - 0.6134 * P, prof = [[0, -length], [root, -length], [r, -length + (r - root)]];
  for (let y = -length + (r - root) + P / 2; y < -P / 2; y += P) prof.push([root, y], [r, y + P / 2]); // the thread, one ring per pitch
  prof.push([r, 0], [0, 0]);
  return part(`bolt ${size}x${(length * 1000).toFixed(0)}`, { h: length + k, w: s }, lathe(prof, mat, 48), hex(s, k, 0, mat));
}
// nut({ size }): ISO 4032 hex nut, height m, its bore the bolt's major diameter (its thread is inside, not drawn).
export function nut({ size = "M6", mat = steel() } = {}) {
  const [d, , s, , m] = pick(METRIC, size, "nut");
  return part(`nut ${size}`, { h: m, w: s }, hex(s, m, 0, mat, d / 2));
}
// washer({ size }): ISO 7089 plain washer.
export function washer({ size = "M6", mat = steel() } = {}) {
  const [, , , , , d1, d2, h] = pick(METRIC, size, "washer");
  return part(`washer ${size}`, { h, w: d2, d: d2 }, lathe([[d1 / 2, 0], [d1 / 2, h], [d2 / 2, h], [d2 / 2, 0], [d1 / 2, 0]], mat));
}

// bearing({ code }): a deep-groove ball bearing: inner and outer rings with their raceway grooves (radius 0.52 Dw,
// the usual conformity), the balls on the pitch circle in them. Origin: the centre of one side face; width up +y.
// spin(angle): the inner ring turns by angle and the balls roll at the cage's speed, (1 - Dw/Dpw) / 2 of it.
export function bearing({ code = 608, mat = steel(), ballMat = mat } = {}) {
  const [d, D, B, Z, Dw] = pick(BEARINGS, code, "bearing"), Dpw = (d + D) / 2, rho = 0.52 * Dw, land = 0.35 * Dw;
  const phi0 = Math.acos(land / rho), groove = (sgn) => { const out = []; for (let i = 0; i <= 16; i++) { const p = -phi0 + (2 * phi0 * i) / 16; out.push([Dpw / 2 + sgn * rho * Math.cos(p), B / 2 + rho * Math.sin(p) * (sgn < 0 ? 1 : -1)]); } return out; };
  const inner = lathe([[d / 2, B], [d / 2, 0], [Dpw / 2 - land, 0], ...groove(-1), [Dpw / 2 - land, B], [d / 2, B]], mat);
  const outer = lathe([[D / 2, 0], [D / 2, B], [Dpw / 2 + land, B], ...groove(1), [Dpw / 2 + land, 0], [D / 2, 0]], mat);
  inner.name = "inner ring"; outer.name = "outer ring";
  const balls = new THREE.Group(), ball = new THREE.SphereGeometry(Dw / 2, 24, 16);
  for (let i = 0; i < Z; i++) { const b = new THREE.Mesh(ball, ballMat), a = (i / Z) * Math.PI * 2; b.position.set((Dpw / 2) * Math.cos(a), B / 2, (Dpw / 2) * Math.sin(a)); b.castShadow = true; balls.add(b); }
  const g = part(`bearing ${code}`, { h: B, w: D, d: D }, inner, outer);
  g.add(balls);
  g.userData.bearing = { d, D, B, Z, Dw, Dpw, groove: rho };
  g.spin = (angle) => { inner.rotation.y = angle; balls.rotation.y = (angle * (1 - Dw / Dpw)) / 2; return g; };
  return g;
}

// spring({ wire, mean, coils, free }): a helical compression spring, closed ends (one dead coil at each end, not
// ground). wire and mean (coil diameter to the wire's centre) in metres, coils the total count. Its length is set by
// setLength(L), between solid (coils + 1) x wire and free: the active coils share the travel evenly, as a real spring
// compresses. rate (N/m) = G d^4 / (8 D^3 n_active); force(L) = rate x (free - L).
export function spring({ wire = 0.001, mean = 0.008, coils = 8, free = 0.03, G = STEEL_G, mat = steel() } = {}) {
  [wire, mean, free].forEach((v, i) => pos(v, ["wire", "mean", "free"][i], "spring()"));
  if (!(Number.isInteger(coils) && coils >= 3)) throw new Error("spring(): coils is the total count, a whole number >= 3");
  const na = coils - 2, solid = (coils + 1) * wire;
  if (mean <= wire) throw new Error("spring(): the mean diameter is larger than the wire");
  if (free <= solid) throw new Error(`spring(): free length ${free * 1000} mm is at or under solid ${(solid * 1000).toFixed(2)} mm`);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat), rate = (G * wire ** 4) / (8 * mean ** 3 * na);
  mesh.castShadow = mesh.receiveShadow = true;
  const g = part("spring", { h: free, w: mean + wire, d: mean + wire }, mesh);
  let length = free;
  g.setLength = (L) => {
    if (!(L >= solid - 1e-9 && L <= free + 1e-9)) throw new Error(`spring.setLength(${L}): between solid ${(solid * 1000).toFixed(2)} mm and free ${(free * 1000).toFixed(2)} mm`);
    length = L;
    const pa = (L - 3 * wire) / na, n = coils * 48, pts = [];
    for (let i = 0; i <= n; i++) {
      const c = (i / n) * coils, y = wire / 2 + Math.min(c, 1) * wire + Math.max(0, Math.min(c - 1, na)) * pa + Math.max(0, c - 1 - na) * wire; // dead coil, active coils, dead coil
      pts.push(new THREE.Vector3((mean / 2) * Math.cos(c * 2 * Math.PI), y, (mean / 2) * Math.sin(c * 2 * Math.PI)));
    }
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, wire / 2, 10);
    g.userData.real.h = L;
    return g;
  };
  g.force = (L = length) => rate * (free - L);
  g.userData.spring = { wire, mean, coils, active: na, free, solid, rate };
  return g.setLength(free);
}

// shaft({ d, length }): a ground shaft with a chamfer at each end (5 % of d, at most 1 mm).
export function shaft({ d = 0.008, length = 0.1, mat = steel() } = {}) {
  pos(d, "d", "shaft()"); pos(length, "length", "shaft()");
  const c = Math.min(0.001, 0.05 * d), r = d / 2;
  return part("shaft", { h: length, w: d, d }, lathe([[0, 0], [r - c, 0], [r, c], [r, length - c], [r - c, length], [0, length]], mat));
}

// knob({ d, h, flutes }): a fluted control knob with a domed top and a pointer line (instrument knobs 20-40 mm).
export function knob({ d = 0.03, h = 0.018, flutes = 24, mat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.55 }), pointer = 0xd9d9d6 } = {}) {
  pos(d, "d", "knob()"); pos(h, "h", "knob()");
  const r = d / 2, prof = [[0, 0], [r * 0.97, 0], [r, h * 0.08]];
  for (let i = 1; i <= 8; i++) prof.push([r * (1 - 0.06 * (i / 8)), h * (0.08 + 0.72 * (i / 8))]); // a slight taper
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push([r * 0.94 * Math.cos(a) + 0.0001, h * 0.8 + h * 0.2 * Math.sin(a)]); } // the dome
  const body = lathe(prof, mat, 96), p = body.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < h * 0.8 && y > h * 0.1) { const a = Math.atan2(p.getZ(i), p.getX(i)), f = 1 - 0.035 * Math.max(0, Math.cos(a * flutes)); p.setX(i, p.getX(i) * f); p.setZ(i, p.getZ(i) * f); } }
  body.geometry.computeVertexNormals();
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0004, r * 0.7), new THREE.MeshStandardMaterial({ color: pointer, roughness: 0.5 }));
  line.position.set(0, h + 0.0001, r * 0.45);
  return part("knob", { h, w: d, d }, body, line);
}

// housing({ w, h, d, r }): a box housing with rounded edges, in x-ray (a see-through shell). Origin: its bottom centre.
// One segment per rounded edge (RoundedBoxGeometry turns it in two 45° steps): with more, every step is under the
// 30° edge threshold and the shell loses its outline.
export function housing({ w, h, d, r = 0.004, ...look } = {}) {
  [w, h, d].forEach((v, i) => pos(v, ["w", "h", "d"][i], "housing()"));
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 1, Math.min(r, w / 2, h / 2, d / 2)));
  m.position.y = h / 2;
  return xray(part("housing", { h, w, d }, m), look);
}

// xray(object, { color, opacity, edge, edgeColor, threshold }): every mesh under object becomes a see-through shell
// (x-ray): its own transparent material (never the shared one, so other parts stay solid), depthWrite off, drawn
// after the solid parts inside (renderOrder), no shadow of its own; plus its silhouette edges (EdgesGeometry above
// threshold degrees) so the shape still reads. Marked userData.attend = false: attention ghosting leaves it alone.
export function xray(object, { color = 0xd9dde0, opacity = 0.15, edge = 0.35, edgeColor = 0x3a3d40, threshold = 30 } = {}) {
  if (!object?.isObject3D) throw new Error("xray(object): an Object3D whose meshes become the shell");
  if (!(opacity > 0 && opacity < 1 && edge >= 0 && edge <= 1)) throw new Error("xray(): opacity in (0, 1), edge in [0, 1]");
  const meshes = [];
  object.traverse((o) => { if (o.isMesh) meshes.push(o); });
  if (!meshes.length) throw new Error("xray(): no mesh under " + (object.name || object.type));
  for (const o of meshes) {
    o.material = new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity, depthWrite: false, roughness: 0.15, metalness: 0, side: THREE.DoubleSide });
    o.renderOrder = 10; o.castShadow = false; o.receiveShadow = false; o.userData.attend = false;
    if (edge > 0) {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, threshold), new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edge, depthWrite: false }));
      e.renderOrder = 11; e.userData.attend = false; e.name = "x-ray edges";
      o.add(e);
    }
  }
  object.userData.xray = true;
  return object;
}
