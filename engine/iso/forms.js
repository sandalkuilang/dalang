// forms.js — shape families for the Express isometric look (DALANG, MIT). Any object is built from a few generators,
// never drawn object by object: lathe (a profile turned about z), extrude (an outline pushed through a plane), sweep
// (a section along a path), gear (a real involute-free spur outline at a module). Each returns faces: local 3D
// polygons in metres, z up, that solid() queues as one painter's item shaded by the 3-tone rule.
import { tri, TAU } from "./iso.js";

const cen = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Queue faces as one item (iso.meshNow): sorted far → near inside it, each oriented away from the solid's centre, so its
// normal picks the tone (top lightest, left mid, right darkest), back faces drop out and the feature edges are inked;
// o.smooth (a lathe, a sweep) inks only its silhouette and its sharp turns, never the facets.
export function solid(iso, faces, color, o = {}) {
  if (!faces.length) return;
  const t3 = typeof color === "string" ? tri(color) : color, c = cen(faces.flat()), W = iso.w(c[0], c[1], c[2]);
  iso.add(W[0] + W[1] + W[2] + (o.bias || 0), () => {
    iso.meshNow(faces.map((f) => ({ pts: f, out: sub(cen(f), c), color: o.faceColor, smooth: o.smooth })), t3);
  }, o.layer ?? 1);
}

// profile: [[r, z], …] bottom to top (a bottle, a tank, a lamp, a pillar). An end with r > 0 gets a cap.
export function lathe(profile, { n = 24 } = {}) {
  if (profile.length < 2) throw new Error("lathe: a profile needs two points or more");
  const R = profile.map(([r, z]) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r, z]));
  const F = [];
  for (let k = 0; k + 1 < R.length; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]]); }
  if (profile[0][0] > 0) F.push(R[0].slice().reverse());
  if (profile.at(-1)[0] > 0) F.push(R.at(-1));
  return F;
}

// outline: [[u, v], …] closed. plane 'xy' lies on the ground (pushed up z by h), 'xz' stands facing +y (pushed along +y),
// 'yz' stands facing +x (pushed along +x). A building's footprint, a gear, a letter, a bracket.
export function extrude(outline, { h = 1, plane = "xy" } = {}) {
  if (outline.length < 3) throw new Error("extrude: an outline needs three points or more");
  const P = plane === "xy" ? (u, v, w) => [u, v, w] : plane === "xz" ? (u, v, w) => [u, w, v] : (u, v, w) => [w, u, v];
  const A = outline.map(([u, v]) => P(u, v, 0)), B = outline.map(([u, v]) => P(u, v, h)), n = outline.length, F = [A.slice().reverse(), B];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([A[i], A[j], B[j], B[i]]); }
  return F;
}

// path: [[x, y, z], …]; a round section of radius r (n sides) or section: [[u, v], …]. A pipe, a cable, a road, a rail.
export function sweep(path, { r = 0.05, n = 8, section, closed = false } = {}) {
  if (path.length < 2) throw new Error("sweep: a path needs two points or more");
  const S = section || Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU) * r, Math.sin((i / n) * TAU) * r]), m = path.length;
  const rings = path.map((p, k) => {
    const a = path[closed ? (k - 1 + m) % m : Math.max(k - 1, 0)], b = path[closed ? (k + 1) % m : Math.min(k + 1, m - 1)];
    const T = unit(sub(b, a)), up = Math.abs(T[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], N = unit(cross(up, T)), B = cross(T, N);
    return S.map(([u, v]) => [p[0] + N[0] * u + B[0] * v, p[1] + N[1] * u + B[1] * v, p[2] + N[2] * u + B[2] * v]);
  });
  const F = [], q = S.length;
  for (let k = 0; k < (closed ? m : m - 1); k++) { const R0 = rings[k], R1 = rings[(k + 1) % m]; for (let i = 0; i < q; i++) { const j = (i + 1) % q; F.push([R0[i], R0[j], R1[j], R1[i]]); } }
  if (!closed) F.push(rings[0].slice().reverse(), rings[m - 1]);
  return F;
}

// A spur gear outline at a real module (metres) and tooth count: pitch radius m·z/2, tips at +m, roots at −1.25·m,
// tooth and gap of equal width on the pitch circle. Two gears mesh at a centre distance of m·(z1 + z2)/2.
export function gearOutline(teeth, module) {
  if (!Number.isInteger(teeth) || teeth < 6) throw new Error("gear: a whole number of teeth, 6 or more");
  if (!(module > 0)) throw new Error("gear: a module in metres (2 mm is 0.002)");
  const rp = (module * teeth) / 2, ra = rp + module, rf = rp - 1.25 * module, step = TAU / teeth, pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [f, r] of [[0, rf], [0.15, ra], [0.35, ra], [0.5, rf]]) pts.push([Math.cos(a + f * step) * r, Math.sin(a + f * step) * r]);
  }
  return pts;
}
