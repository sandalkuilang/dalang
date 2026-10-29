// figure.js — a person as a jointed 3D body (DALANG, MIT), drawn in the ink look like any solid: an ellipsoid head with
// hair, eyes and a neck, a torso lofted from hips to shoulders, arms and legs as tapered limbs bent at elbows and knees,
// hands, shoes. About 7.5 heads tall, real proportions. Posed by joint angles (or a preset), a hand can reach a point
// (two-bone IK), and the feet are always set on the ground (or the pelvis on a seat), so a person never floats.
//
//   figureSolids({ h: 1.7, pose: "reach", reach: [0.45, -0.1, 0.9], shirt: "#3C7FB1", pants: "#2C2D31" })
//   → [{ faces, color, smooth }], in the figure's frame: feet on z = 0, facing +x (turn the part to face elsewhere)
//
// o: h · pose stand|walk|point|carry|reach|sit|crouch|kneel|wave · phase (walk, 0–1) · reach / reachL [x, y, z] (a hand to
//    that point) · seat (sit: the seat's height) · lean (rad, the torso forward) · look (rad, the head turned) ·
//    joints { hip, knee, hipL, kneeL, arm, elbow, armL, elbowL, out, outL } (rad, override the preset) ·
//    skin · hair · hairStyle short|long|bald|cap · cap · shirt · sleeves short|long · pants · shoes · coat (a long coat)
const TAU = Math.PI * 2;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]), unit = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// rings of ellipses up z: [{ z, rx, ry, x, y, tilt }] (tilt raises the ring's front, +x); closed by caps
function loft(rings, n = 14) {
  const R = rings.map((q) => Array.from({ length: n }, (_, i) => { const a = (i / n) * TAU, c = Math.cos(a); return [(q.x || 0) + c * q.rx, (q.y || 0) + Math.sin(a) * q.ry, q.z + c * (q.tilt || 0)]; }));
  const F = [];
  for (let k = 0; k + 1 < R.length; k++) for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]]); }
  if (rings[0].rx > 0) F.push(R[0].slice().reverse());
  if (rings.at(-1).rx > 0) F.push(R.at(-1));
  return F;
}
// an ellipsoid as a loft (z from c[2] - rz to c[2] + rz); from/to (−1…1) keep a band of it (a cap of hair)
function ellipsoid(c, rx, ry, rz, { from = -1, to = 1, tilt = 0, n = 14, m = 8 } = {}) {
  const rings = [];
  for (let k = 0; k <= m; k++) { const t = from + ((to - from) * k) / m, s = Math.sqrt(Math.max(0, 1 - t * t)); rings.push({ z: c[2] + t * rz, rx: rx * s, ry: ry * s, x: c[0], y: c[1], tilt: tilt * (1 - Math.abs(t)) }); }
  return loft(rings, n);
}
// a limb from a to b, radius r0 → r1, as a tapered tube with flat ends (the next segment overlaps the joint)
function limb(a, b, r0, r1, n = 10) {
  const T = unit(sub(b, a)), up = Math.abs(T[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1], N = unit(cross(up, T)), B = cross(T, N);
  const ring = (p, r) => Array.from({ length: n }, (_, i) => { const q = (i / n) * TAU; return add(p, add(mul(N, Math.cos(q) * r), mul(B, Math.sin(q) * r))); });
  const A = ring(sub(a, mul(T, r0 * 0.6)), r0), Z = ring(add(b, mul(T, r1 * 0.6)), r1), F = [];
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; F.push([A[i], A[j], Z[j], Z[i]]); }
  F.push(A.slice().reverse(), Z);
  return F;
}

const POSES = {
  stand: {}, point: { arm: 1.45, elbow: 0.05, out: 0.1 }, carry: { arm: 0.55, elbow: 1.2, armL: 0.55, elbowL: 1.2 },
  reach: {}, wave: { arm: 0.2, out: 1.2, elbow: 1.9 }, sit: { hip: 1.5, knee: 1.5, hipL: 1.5, kneeL: 1.5, arm: 0.35, elbow: 0.9, armL: 0.35, elbowL: 0.9 },
  crouch: { hip: 1.7, knee: 2.3, hipL: 1.5, kneeL: 2.2, lean: 0.5, arm: 0.7, elbow: 0.6, armL: 0.5, elbowL: 0.7 },
  kneel: { hip: 0.1, knee: 1.55, hipL: 1.55, kneeL: 1.55, lean: 0.15, arm: 0.6, elbow: 0.7 },
};

export function figureSolids(o = {}) {
  const h = o.h || 1.7, u = h / 7.5, P = { ...POSES[o.pose] || {} };
  if (o.pose === "walk") { const s = Math.sin((o.phase || 0) * TAU), c = Math.cos((o.phase || 0) * TAU); Object.assign(P, { hip: 0.42 * s, hipL: -0.42 * s, knee: 0.35 * Math.max(0, -c), kneeL: 0.35 * Math.max(0, c), arm: -0.35 * s, armL: 0.35 * s, elbow: 0.25, elbowL: 0.25 }); }
  const J = { hip: 0, knee: 0.04, hipL: 0, kneeL: 0.04, arm: 0.06, elbow: 0.12, armL: 0.06, elbowL: 0.12, out: 0.08, outL: 0.08, lean: 0, ...P, ...(o.joints || {}) };
  const lean = o.lean ?? J.lean, look = o.look || 0;
  const skin = o.skin || "#C98B62", shirt = o.shirt || "#3C7FB1", pants = o.pants || "#2C2D31", shoes = o.shoes || "#26272B", hair = o.hair || "#2A211C";
  // proportions (fractions of h): hip joint .5, knee .27, ankle .045, shoulder .815, neck .845, head centre .935
  const thigh = 0.235 * h, shin = 0.225 * h, upper = 0.165 * h, fore = 0.15 * h, hipW = 0.052 * h, shW = 0.118 * h;
  const leg = (side, hip, knee) => { const H = [0, side * hipW, 0], d1 = [Math.sin(hip), 0, -Math.cos(hip)], K = add(H, mul(d1, thigh)), d2 = [Math.sin(hip - knee), 0, -Math.cos(hip - knee)]; return { H, K, A: add(K, mul(d2, shin)) }; };
  const ankle = 0.045 * h, seated = o.seat != null && (o.pose === "sit" || o.joints?.seat);
  let R = leg(-1, J.hip, J.knee), L = leg(1, J.hipL, J.kneeL);
  // the pelvis height: the lower ankle at shoe height, or (seated) the thighs on the seat with each foot set on the floor
  const pz = seated ? o.seat + 0.065 * h : ankle - Math.min(R.A[2], L.A[2]);
  if (seated) {
    const ground = (side, hip) => {
      const reach = (hp) => pz - thigh * Math.cos(hp) - ankle; // the knee's height over the ankle
      if (reach(hip) > shin) hip = Math.acos(Math.min(1, Math.max(-1, (pz - ankle - shin) / thigh)));
      const H = [0, side * hipW, 0], K = [Math.sin(hip) * thigh, side * hipW, -Math.cos(hip) * thigh], c = Math.min(1, (K[2] + pz - ankle) / shin), f = Math.acos(c);
      return { H, K, A: add(K, [Math.sin(f) * shin * 0.6, 0, -c * shin]) };
    };
    R = ground(-1, J.hip); L = ground(1, J.hipL);
  }
  const lift = (p) => [p[0], p[1], p[2] + pz];
  // the upper body turns forward about the pelvis by lean
  const bend = (p) => { const c = Math.cos(lean), s = Math.sin(lean); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };
  const up = (z) => z - 0.5 * h, chestAt = (x, y, z) => lift(bend([x, y, up(z)]));
  const out = [], put = (faces, color, smooth = true) => out.push({ faces, color, smooth });
  // legs and shoes
  for (const [S, side] of [[R, -1], [L, 1]]) {
    const H = lift(S.H), K = lift(S.K), A = lift(S.A);
    put(limb(H, K, 0.06 * h, 0.042 * h), pants); put(limb(K, A, 0.042 * h, 0.03 * h), pants);
    const sx = A[0], sy = A[1], sz = Math.max(0, A[2] - ankle);
    put(loft([{ z: sz, rx: 0.075 * h, ry: 0.033 * h, x: sx + 0.035 * h, y: sy }, { z: sz + 0.03 * h, rx: 0.07 * h, ry: 0.032 * h, x: sx + 0.03 * h, y: sy }, { z: sz + 0.055 * h, rx: 0.035 * h, ry: 0.028 * h, x: sx, y: sy }], 12), shoes);
    void side;
  }
  // torso: hips → waist → chest → shoulders, a little deeper at the chest; a coat hangs from the chest to the knees
  const T = (z, rx, ry, x = 0) => { const p = chestAt(x, 0, z); return { z: p[2], rx, ry, x: p[0], y: p[1] }; };
  put(loft([T(0.47 * h, 0.085 * h, 0.115 * h), T(0.56 * h, 0.08 * h, 0.105 * h), T(0.62 * h, 0.075 * h, 0.1 * h), T(0.72 * h, 0.085 * h, 0.122 * h, 0.006 * h), T(0.79 * h, 0.075 * h, 0.128 * h), T(0.815 * h, 0.062 * h, 0.115 * h), T(0.835 * h, 0.042 * h, 0.08 * h), T(0.845 * h, 0.03 * h, 0.04 * h)], 16), shirt);
  put(loft([T(0.555 * h, 0.083 * h, 0.108 * h), T(0.57 * h, 0.083 * h, 0.108 * h)], 16), o.belt || "#3A2E26");
  if (o.coat) put(loft([T(0.3 * h, 0.1 * h, 0.13 * h), T(0.56 * h, 0.088 * h, 0.115 * h), T(0.75 * h, 0.092 * h, 0.128 * h), T(0.81 * h, 0.074 * h, 0.134 * h)], 16), o.coat);
  // head: neck, an ellipsoid, hair as a cap tilted up at the brow, two eyes
  const neckA = chestAt(0, 0, 0.82 * h), neckB = chestAt(0.005 * h, 0, 0.875 * h), hc = add(neckB, [0.006 * h, 0, 0.06 * h]);
  put(limb(neckA, neckB, 0.03 * h, 0.028 * h, 8), skin);
  const turn = (p) => { const c = Math.cos(look), s = Math.sin(look), d = sub(p, hc); return add(hc, [d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]]); };
  put(ellipsoid(hc, 0.058 * h, 0.05 * h, 0.066 * h).map((f) => f.map(turn)), skin);
  const style = o.hairStyle || "short";
  if (style !== "bald") put(ellipsoid(add(hc, [-0.006 * h, 0, 0.004 * h]), 0.062 * h, 0.054 * h, 0.068 * h, { from: style === "long" ? -0.55 : -0.05, to: 1, tilt: 0.03 * h, m: 6 }).map((f) => f.map(turn)), hair);
  if (style === "cap" || o.cap) { const cc = o.cap || "#CF5140"; put(ellipsoid(add(hc, [-0.002 * h, 0, 0.012 * h]), 0.064 * h, 0.056 * h, 0.064 * h, { from: 0.15, to: 1, m: 5 }).map((f) => f.map(turn)), cc); put(loft([{ z: hc[2] + 0.022 * h, rx: 0.045 * h, ry: 0.04 * h, x: hc[0] + 0.05 * h, y: hc[1] }, { z: hc[2] + 0.027 * h, rx: 0.045 * h, ry: 0.04 * h, x: hc[0] + 0.05 * h, y: hc[1] }], 12).map((f) => f.map(turn)), cc); }
  for (const y of [-0.019, 0.019]) put(ellipsoid(add(hc, [0.053 * h, y * h, 0.008 * h]), 0.006 * h, 0.006 * h, 0.008 * h, { n: 8, m: 4 }).map((f) => f.map(turn)), "#22201F", false);
  // arms: from the shoulder (moved by lean), by angles or by reach (two-bone IK toward the target, elbow down and out)
  for (const side of [-1, 1]) {
    const k = side < 0 ? "" : "L", S = chestAt(0, side * shW, 0.8 * h), target = side < 0 ? o.reach : o.reachL;
    let E, W;
    if (target) {
      const Tg = [target[0], target[1], target[2]], d = Math.min(len(sub(Tg, S)), (upper + fore) * 0.999), dir = unit(sub(Tg, S)), a = (upper * upper - fore * fore + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, upper * upper - a * a));
      const pole = unit(sub([-0.3, side * 0.5, -1], mul(dir, dot([-0.3, side * 0.5, -1], dir))));
      E = add(add(S, mul(dir, a)), mul(pole, hgt)); W = add(S, mul(dir, d));
    } else {
      const sw = J["arm" + k], ab = J["out" + k], d1 = unit([Math.sin(sw) * Math.cos(ab), side * Math.sin(ab), -Math.cos(sw) * Math.cos(ab)]);
      E = add(S, mul(d1, upper));
      const f = sw + J["elbow" + k], d2 = unit([Math.sin(f) * Math.cos(ab), side * Math.sin(ab) * 0.6, -Math.cos(f) * Math.cos(ab)]);
      W = add(E, mul(d2, fore));
    }
    const long = o.sleeves === "long";
    put(limb(S, E, 0.036 * h, 0.03 * h), o.coat || shirt); put(limb(E, W, 0.028 * h, 0.022 * h), long ? o.coat || shirt : skin);
    const dir = unit(sub(W, E));
    put(ellipsoid(add(W, mul(dir, 0.035 * h)), 0.026 * h, 0.018 * h, 0.034 * h, { n: 10, m: 5 }), skin);
  }
  // where the top of the head is, for the pin
  const top = Math.max(...out.flatMap((s) => s.faces.flat().map((p) => p[2])));
  return { solids: out, top };
}
