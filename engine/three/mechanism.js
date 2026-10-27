// Mechanism parts on physics.js: a part that slides or turns between stops, the spring that drives it, the latch that
// holds it until a cue. They are built on a set's sim before bakeCached, run in the same bake as every other body (so
// a slow-motion shot or a replay reads that bake, see slow/replay in physics.js), and are hashed into its cache key.
// Real units: metres, kg, N, N·m; the set's scale M converts. The frame a part moves in is the set (a fixed frame at the
// part's start pose); a part on a moving frame is not covered.
//
//   const part = sim.roundBox(mesh, w, h, d, r, { density: 7850 * M ** 3, name: "plunger" });
//   const j = slide(sim, part, { axis: { x: 0, y: 0, z: 1 }, min: 0, max: 0.03 }); // 3 cm of travel to its stop
//   spring(sim, j, { stiffness: 400, preload: 6 });                                  // N/m, N at the start
//   latch(sim, part, 1.2);                                                           // held until 1.2 s, or (t) => condition
//
// Couplings tie one part's motion to another's at the real ratio, in the same bake (see gear, belt, chain, cam below):
//   const pinion = hinge(sim, p1, { at: c1, axis: Z, min: -Infinity, max: Infinity }), wheel = hinge(sim, p2, { at: c2, axis: Z, min: -Infinity, max: Infinity });
//   gear(sim, pinion, wheel, { teeth: [12, 36] });                     // a clock's train: the wheel turns at 1/3, the other way
//   belt(sim, [{ joint: motor, r: 0.03 }, { joint: drum, r: 0.2 }]);    // a washing machine's drum belt: the drum at 3/20
//   chain(sim, [{ joint: ring, teeth: 42 }, { joint: cog, teeth: 14 }], { pitch: 0.0127, shifts: [{ at: 2, index: 1, teeth: 21 }] });
//   cam(sim, camshaft, valve, (th) => 0.004 * (1 - Math.cos(th)));    // an engine valve: lift 8 mm per turn, 0 at the start
import { RAPIER } from "./rapier.js";
import { M } from "./kit.js";

const unit = (v) => { const l = Math.hypot(v?.x, v?.y, v?.z); if (!(l > 0) || !Number.isFinite(l)) throw new Error("axis must be a non-zero vector {x, y, z}"); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const conj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const mul = (a, b) => ({ w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z, x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x, z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w });
const rot = (q, v) => { const r = mul(mul(q, { x: v.x, y: v.y, z: v.z, w: 0 }), conj(q)); return { x: r.x, y: r.y, z: r.z }; };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const num = (x) => typeof x === "number" && Number.isFinite(x);

// A joint from a fixed frame (no collider, at the part's start pose) to the part: both frames coincide at the start, so
// the slide starts at 0 and the hinge at angle 0 whatever the part's start pose. Limits are the stops.
function joined(sim, part, kind, axis, min, max, at) {
  const b = part?.body;
  if (typeof sim?.part !== "function" || !b?.isDynamic?.()) throw new Error(`${kind}() takes a set's sim and a dynamic part made by roundBox or dynamicHull`);
  const free = kind === "hinge" && min === -Infinity && max === Infinity; // a wheel, a gear, a pulley: no stops, turns any number of times
  if (!free && (!num(min) || !num(max) || !(min <= 0 && max >= 0))) throw new Error(`${kind}(): min and max are numbers with min ≤ 0 ≤ max (the start is inside its stops), or min: -Infinity, max: Infinity for a free axle on a hinge`);
  const a = unit(axis), p0 = { ...b.translation() }, q0 = { ...b.rotation() }, al = rot(conj(q0), a);
  let an = { x: 0, y: 0, z: 0 };
  if (kind === "hinge") {
    if (!num(at?.x) || !num(at?.y) || !num(at?.z)) throw new Error("hinge(): `at` is the point the part turns about, a world position {x, y, z} in scene units");
    an = rot(conj(q0), { x: at.x - p0.x, y: at.y - p0.y, z: at.z - p0.z });
  }
  const frame = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p0.x, p0.y, p0.z).setRotation(q0));
  const data = kind === "slide" ? RAPIER.JointData.prismatic(an, an, al) : RAPIER.JointData.revolute(an, an, al);
  const joint = sim.world.createImpulseJoint(data, frame, b, true);
  if (!free) joint.setLimits(kind === "slide" ? min / M : min, kind === "slide" ? max / M : max); // JointData only carries limits for a prismatic joint: set both after
  const j = { kind, part, joint, frame, axis: a, at: at ? { x: at.x, y: at.y, z: at.z } : null, p0, q0, min, max, free };
  // Hashed: the cache key must change with a stop (physics.js hashes a joint's type, bodies and anchors, not its limits).
  sim.part({ bodies: [b], key: `${kind} ${part.name} ${JSON.stringify({ axis: a, at: j.at, min: free ? "free" : min, max: free ? "free" : max })}`, step() {} });
  return j;
}

// A part on a prismatic joint: it moves along `axis` (world direction) from its start by min..max metres (min ≤ 0 ≤ max).
export const slide = (sim, part, { axis, min = 0, max } = {}) => joined(sim, part, "slide", axis, min, max);
// A part on a revolute joint: it turns about `axis` through the world point `at` (scene units) by min..max radians.
// min: -Infinity, max: Infinity is a free axle (a wheel, a gear, a pulley) for the couplings below; spring() refuses a free axle
// and stops past ±π (it reads the angle within a half turn).
export const hinge = (sim, part, { at, axis, min = 0, max } = {}) => joined(sim, part, "hinge", axis, min, max, at);

// A spring along a slide (N/m, rest in metres from the start, preload in N at the start) or about a hinge (N·m/rad, rest
// in rad, preload in N·m at the start). Give rest or preload (rest = preload / stiffness), not both. damping: N·s/m or
// N·m·s/rad. Applied as an impulse each step, and only while the part is dynamic (a latched part feels nothing).
export function spring(sim, j, { stiffness, rest, preload, damping = 0 } = {}) {
  if (!j?.joint || !j.part?.body) throw new Error("spring() takes what slide() or hinge() returned");
  if (!(num(stiffness) && stiffness > 0)) throw new Error("spring(): stiffness > 0 (N/m, or N·m/rad on a hinge)");
  if ((rest === undefined) === (preload === undefined)) throw new Error("spring(): give rest or preload (rest = preload / stiffness), not both and not neither");
  if (!num(rest ?? preload) || !num(damping) || damping < 0) throw new Error("spring(): rest or preload is a number, damping ≥ 0");
  // The spring reads the hinge angle within a half turn (−π, π]: past it the torque would flip its sign and push on, not back. So a
  // free axle, or stops that reach past a half turn, are refused (a wind-up spring over turns is not covered).
  if (j.kind === "hinge" && (j.free || j.min < -Math.PI || j.max > Math.PI)) throw new Error("spring(): a spring about a hinge needs stops inside a half turn (min ≥ -π, max ≤ π): it reads the angle within a half turn, and a free axle or a wider range would flip its torque past it");
  const body = j.part.body, a = j.axis, k = stiffness, c = damping, r0 = rest ?? preload / stiffness, hinged = j.kind === "hinge", kg = body.mass();
  // Explicit (symplectic Euler at the step): stable while (ω·dt)² < 0.25. A stiffer spring would blow up, not bake.
  const dt = sim.world.timestep;
  let low = kg; // the inertia it answers with: mass (kg) on a slide, inertia about the axis (kg·m²) on a hinge
  if (hinged) {
    const w = body.worldCom(), rv = { x: w.x - j.at.x, y: w.y - j.at.y, z: w.z - j.at.z }, d2 = dot(rv, rv) - dot(rv, a) ** 2, pi = body.principalInertia();
    low = (Math.min(pi.x, pi.y, pi.z) + kg * d2) * M * M;
  }
  if ((k / low) * dt * dt > 0.25) throw new Error(`spring(): stiffness ${k} is too stiff for the ${(1 / dt).toFixed(0)} Hz step on this ${hinged ? "inertia" : "mass"} (${low.toPrecision(3)}): the limit is ${(0.25 * low / (dt * dt)).toPrecision(3)}`);
  const key = `spring ${j.kind} ${j.part.name} ${JSON.stringify({ axis: a, at: j.at, min: j.min, max: j.max, stiffness: k, rest: r0, damping: c })}`;
  const s = { bodies: [body], key,
    step(_t, h) {
      if (!body.isDynamic()) return; // held by a latch: it feels nothing
      if (!hinged) {
        const p = body.translation(), v = body.linvel(), x = ((p.x - j.p0.x) * a.x + (p.y - j.p0.y) * a.y + (p.z - j.p0.z) * a.z) * M, vx = dot(v, a) * M;
        const f = (k * (r0 - x) - c * vx) / M * h; // N → scene units, as an impulse
        body.applyImpulse({ x: a.x * f, y: a.y * f, z: a.z * f }, true);
      } else {
        const qr = mul(body.rotation(), conj(j.q0)), th = 2 * Math.atan2(dot(qr, a), qr.w), wv = dot(body.angvel(), a);
        const f = (k * (r0 - th) - c * wv) / (M * M) * h; // N·m → scene units
        body.applyTorqueImpulse({ x: a.x * f, y: a.y * f, z: a.z * f }, true);
      }
    },
  };
  return sim.part(s);
}

// Holds a part exactly in place, still colliding (a kinematic body), until `until`: a time in s (≥ 0) or a function
// (t) => boolean read each step from t = 0 (a condition on the set: a trigger body past a mark). Then it is dynamic and the
// joint, spring and gravity move it. Its release time is in the bake (report.latches) so a replay knows it. A latch lets go
// once: a part that must go back needs a visible cause (a drive, a press), never a second hand-written curve.
export function latch(sim, part, until) {
  const b = part?.body;
  if (typeof sim?.part !== "function" || !b?.isDynamic?.()) throw new Error("latch() takes a set's sim and a dynamic part made by roundBox or dynamicHull");
  if (!(typeof until === "function" || (num(until) && until >= 0))) throw new Error("latch(): until is a time in s ≥ 0 or a function (t) => boolean");
  b.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, false);
  let released = null;
  sim.part({ early: true, bodies: [b], key: `latch ${part.name} ${String(until)}`,
    // t is the end of the coming step (runBake calls onStep(s·dt) before the step that ends at s·dt), so it begins at t − dt.
    step(t, dt) {
      if (released !== null || t < 0) return; // the pre-roll (t < 0) is lead-in: the part stays latched
      const start = t - dt;
      if (typeof until === "function" ? !until(start) : start < until - dt / 2) return;
      b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      released = start;
    },
    event: () => ({ name: part.name, t: released }),
  });
  return { part, get released() { return released; } };
}

// ---- Couplings: gears, belts, chains, cams. One part's motion is tied to another's at the real ratio, solved each step in the
// bake (a velocity constraint, with a position term that pulls any drift back), so the ratio never drifts as a hand-animated
// second rotation does, and the load comes back to the driver scaled by the ratio (a driven inertia counts s²·I; a latched or
// kinematic wheel holds the whole train). Metres, kg, N·m; `joint` is what hinge() returned (a free axle: min: -Infinity,
// max: Infinity), a cam's follower what slide() returned. Not covered: bevel and worm gears, a rack, linkages.
const TAU = 2 * Math.PI, BETA = 0.2, PASSES = 4;
const wrap = (th) => ((th % TAU) + TAU) % TAU;
const isHinge = (j) => j?.kind === "hinge" && !!j.part?.body && !!j.joint;
const whole = (z) => Number.isInteger(z) && z >= 6;

// A hinge's unwrapped angle since its start; read() once or more per step (idempotent within a step).
function turn(j) {
  const b = j.part.body, a = j.axis; let th = 0, prev = 0;
  return { b, a, name: j.part.name, joint: j,
    read() { const qr = mul(b.rotation(), conj(j.q0)), now = 2 * Math.atan2(dot(qr, a), qr.w); th += now - prev - TAU * Math.round((now - prev) / TAU); prev = now; return th; },
    vel: () => dot(b.angvel(), a),
    inv() { // 1 / inertia about the axis (kg·unit²), 0 for a body that holds still (latched, kinematic)
      if (!b.isDynamic()) return 0;
      const l = rot(conj(mul(b.rotation(), b.principalInertiaLocalFrame())), a), p = b.principalInertia();
      return l.x * l.x / p.x + l.y * l.y / p.y + l.z * l.z / p.z;
    },
    push(l) { if (b.isDynamic()) b.applyTorqueImpulse({ x: a.x * l, y: a.y * l, z: a.z * l }, true); } };
}
// A slide's coordinate from its start, in scene units.
function travel(j, g) {
  const b = j.part.body, a = j.axis;
  return { b, a, name: j.part.name, joint: j,
    read() { const p = b.translation(); return (p.x - j.p0.x) * a.x + (p.y - j.p0.y) * a.y + (p.z - j.p0.z) * a.z; },
    // vel(h): the velocity the body will have after this step's gravity (the world step adds it after the parts), so the constraint holds at the end of the step
    vel: (h = 0) => dot(b.linvel(), a) + (b.isDynamic() ? dot(g, a) * b.gravityScale() * h : 0), inv: () => (b.isDynamic() ? 1 / b.mass() : 0),
    push(l) { if (b.isDynamic()) b.applyImpulse({ x: a.x * l, y: a.y * l, z: a.z * l }, true); } };
}
// One row: B follows A with dB = s·dA (s may change between steps: a shift). The position error is accumulated from each
// step's increments, so a ratio that changes never makes it jump.
function row(A, B, s0) {
  let e = 0, pa = 0, pb = 0, last = 0;
  return { s: s0, get impulse() { return last; },
    measure() { const a = A.read(), b = B.read(); e += (b - pb) - this.s * (a - pa); pa = a; pb = b; last = 0; },
    solve(h) {
      const k = B.inv() + this.s * this.s * A.inv(); if (!(k > 0)) return;
      const l = -(B.vel() - this.s * A.vel() + BETA * e / h) / k;
      B.push(l); A.push(-this.s * l); last += l;
    } };
}
// A cam row: the follower's coordinate is the profile at the cam's angle (positional, recomputed each step).
function camRow(C, F, profile) {
  let c = 0, slope = 0, last = 0;
  return { get impulse() { return last; }, get slope() { return slope; },
    // The slope is read half a step ahead (midpoint): the follower then lands on the profile to second order at any speed.
    measure(h) { const th = C.read(), eps = 1e-4, mid = th + C.vel() * h / 2; c = F.read() - profile(wrap(th)) / M; slope = (profile(wrap(mid + eps)) - profile(wrap(mid - eps))) / (2 * eps) / M; last = 0; },
    solve(h) {
      const k = F.inv() + slope * slope * C.inv(); if (!(k > 0)) return;
      const l = -(F.vel(h) - slope * C.vel() + c / h) / k; // gain 1: the position is absolute, not accumulated, so one step returns it to the profile
      F.push(l); C.push(-slope * l); last += l;
    } };
}
// One part for the whole coupling: set the ratios of this step, measure every row, then a few Gauss-Seidel passes. It runs
// after the other parts (a drive, a spring) pushed this step, and not `early`: a latch releases first.
// The report is read from what the bake stored (snap() at its end, handed back by load() on a live bake and on a cache hit
// alike), never from this closure, which a replay never steps: both give the same numbers. null until a bake has run.
function couple(sim, trackers, rows, key, before, snap) {
  let h0 = 0, final = null;
  sim.part({ bodies: [...new Set(trackers.map((x) => x.b))], key,
    step(t, h) { h0 = h; if (before) before(t, h); rows.forEach((r) => r.measure(h)); for (let i = 0; i < PASSES; i++) rows.forEach((r) => r.solve(h)); },
    record: () => JSON.parse(JSON.stringify(snap(h0))), // plain JSON: it is stored in the bake (a -0 or a NaN would not survive it, so it never differs)
    load(r) { final = r; } });
  return { rows, final: () => final };
}
// What a gear, belt or chain reports at the end of the bake: each wheel's signed ratio, the torque of the last step, the driver's angle.
const snapRows = (A, rows) => (h) => ({ ratio: rows.map((r) => r.s), angle: A.read(), torque: rows.map((r) => { const driven = r.impulse / (h || 1) * M * M; return { driver: -r.s * driven, driven }; }) });
const parallel = (A, B, what) => {
  const d = dot(A.a, B.a);
  if (Math.abs(d) < 1 - 1e-6) throw new Error(`${what}(): the axes must be parallel (bevel and worm gears are not covered)`);
  return d > 0 ? 1 : -1;
};
function wheelsOf(list, what) {
  if (!Array.isArray(list) || list.length < 2) throw new Error(`${what}(): ${what === "belt" ? "pulleys" : "sprockets"} is a list of at least 2 wheels [{ joint, ${what === "belt" ? "r | teeth" : "teeth"}, inside }]`);
  const T = list.map((w) => { if (!isHinge(w?.joint)) throw new Error(`${what}(): every wheel's joint is what hinge() returned`); return turn(w.joint); });
  if (new Set(T.map((x) => x.b)).size !== T.length) throw new Error(`${what}(): every wheel is a different part`);
  return T;
}
// The report every coupling gives, read after the bake (bake or bakeCached, live or replayed, the same numbers): the signed
// ratio of wheel i to wheel 0 the bake ended on, the torque (N·m) it passed on in the last step (driven = what wheel i took,
// driver = what the driver gave up, −s × that), and the driver's unwrapped angle. Before a bake: the first ratio, no torque, angle 0.
function report(kind, c, rows) {
  const start = rows.map((r) => r.s), row_ = (i) => { if (!rows[i - 1]) throw new Error(`${kind}(): no wheel ${i}`); return i - 1; };
  return { kind, ratio: (i = 1) => (c.final()?.ratio ?? start)[row_(i)], angle: () => c.final()?.angle ?? 0,
    torque: (i = 1) => ({ ...(c.final()?.torque[row_(i)] ?? { driver: 0, driven: 0 }) }) };
}

// A gear pair: b turns at |za/zb| the speed of a, the other way (an internal gear the same way). Give teeth: [za, zb] (whole
// numbers ≥ 6) or ratio (ωb/ωa > 0). Both wheels turn about parallel axles and share a collision group (dynamicHull's group
// option), so their hulls never collide: the coupling, not contact, carries the motion. The involute is drawn by the caller.
export function gear(sim, a, b, { teeth, ratio, internal = false } = {}) {
  if (!isHinge(a) || !isHinge(b)) throw new Error("gear(): takes two hinge() results (a gear turns on an axle)");
  if (a.part.body === b.part.body) throw new Error("gear(): the two wheels are different parts");
  if ((teeth === undefined) === (ratio === undefined)) throw new Error("gear(): give teeth: [za, zb] or ratio (ωb/ωa), not both and not neither");
  if (teeth !== undefined && !(Array.isArray(teeth) && teeth.length === 2 && teeth.every(whole))) throw new Error("gear(): teeth are two whole numbers ≥ 6, [za, zb]");
  if (ratio !== undefined && !(num(ratio) && ratio > 0)) throw new Error("gear(): ratio is ωb/ωa, a number > 0 (the turning direction follows from the axles)");
  const A = turn(a), B = turn(b), d = parallel(A, B, "gear");
  const nA = a.part.body.numColliders(), nB = b.part.body.numColliders();
  for (let i = 0; i < nA; i++) for (let k = 0; k < nB; k++) {
    const ga = a.part.body.collider(i).collisionGroups(), gb = b.part.body.collider(k).collisionGroups();
    if (((ga >>> 16) & (gb & 0xffff)) && ((gb >>> 16) & (ga & 0xffff))) throw new Error("gear(): meshing gears share a collision group (group: n on both dynamicHull calls), or their hulls collide");
  }
  const mag = ratio ?? teeth[0] / teeth[1], s = -mag * d * (internal ? -1 : 1), r = row(A, B, s);
  const c = couple(sim, [A, B], [r], `gear ${a.part.name} ${b.part.name} ${JSON.stringify({ teeth: teeth ?? null, ratio: ratio ?? null, internal, axes: [A.a, B.a] })}`, null, snapRows(A, [r]));
  return report("gear", c, [r]);
}

// A belt over pulleys: every wheel after the first follows the first at the ratio of the radii, (1 − slip) for a flat or V
// belt that creeps. pulleys: [{ joint, r }] (metres) or, for a toothed belt, [{ joint, teeth }] with pitch (metres per tooth;
// no slip). inside: true for a wheel that runs on the back of the belt (an idler): it turns the other way.
export function belt(sim, pulleys, { slip = 0, pitch } = {}) {
  const T = wheelsOf(pulleys, "belt");
  if (!(num(slip) && slip >= 0 && slip < 1)) throw new Error("belt(): slip is a number in [0, 1) (0: the belt does not creep)");
  const toothed = pulleys.map((w) => w.teeth !== undefined);
  if (toothed.some((x) => x) && !toothed.every((x) => x)) throw new Error("belt(): give every pulley r (metres) or every pulley teeth (with pitch), not a mix");
  if (toothed[0]) {
    if (!(num(pitch) && pitch > 0)) throw new Error("belt(): a toothed belt takes its pitch (metres per tooth)");
    if (slip !== 0) throw new Error("belt(): a toothed belt does not slip (slip: 0)");
    if (!pulleys.every((w) => whole(w.teeth))) throw new Error("belt(): teeth are whole numbers ≥ 6");
  }
  const rad = pulleys.map((w) => (toothed[0] ? (w.teeth * pitch) / TAU : w.r));
  if (!rad.every((r) => num(r) && r > 0)) throw new Error("belt(): every pulley has r > 0 (metres)");
  const sign = pulleys.map((w) => (w.inside ? -1 : 1)), rows = T.slice(1).map((B, i) => row(T[0], B, (rad[0] / rad[i + 1]) * parallel(T[0], B, "belt") * sign[i + 1] * sign[0] * (1 - slip)));
  const c = couple(sim, T, rows, `belt ${T.map((x) => x.name).join(" ")} ${JSON.stringify({ rad, sign, slip, pitch: pitch ?? null, axes: T.map((x) => x.a) })}`, null, snapRows(T[0], rows));
  return report("belt", c, rows);
}

// A chain over sprockets: every sprocket after the first follows the first at the tooth ratio z0/zi (a chain does not slip;
// pitch is metres per link, 0.0127 for a bicycle chain). shifts: [{ at, index, teeth }]: from time `at` (s) the chain runs on
// a sprocket with `teeth` teeth at that index (a derailleur moving it to another cog of the same wheel). The ratio changes at
// once and the speeds follow (a shift is inelastic); the angle does not jump.
export function chain(sim, sprockets, { pitch, shifts = [] } = {}) {
  const T = wheelsOf(sprockets, "chain");
  if (!(num(pitch) && pitch > 0)) throw new Error("chain(): pitch is the link pitch in metres (0.0127 for a bicycle chain)");
  if (!sprockets.every((w) => whole(w.teeth))) throw new Error("chain(): teeth are whole numbers ≥ 6");
  if (!Array.isArray(shifts)) throw new Error("chain(): shifts is a list [{ at, index, teeth }]");
  shifts.forEach((x) => {
    if (!(num(x?.at) && x.at >= 0)) throw new Error("chain(): a shift's `at` is a time in s ≥ 0");
    if (!(Number.isInteger(x.index) && x.index >= 1 && x.index < sprockets.length)) throw new Error("chain(): a shift's index is 1 or more and a sprocket of the chain (the driver does not shift)");
    if (!whole(x.teeth)) throw new Error("chain(): a shift's teeth are a whole number ≥ 6");
  });
  const sorted = [...shifts].sort((p, q) => p.at - q.at), sign = sprockets.map((w) => (w.inside ? -1 : 1)), teeth = sprockets.map((w) => w.teeth);
  const rows = T.slice(1).map((B, i) => row(T[0], B, 0)), axis = T.slice(1).map((B) => parallel(T[0], B, "chain"));
  const set = (teethNow) => rows.forEach((r, i) => { r.s = (teethNow[0] / teethNow[i + 1]) * axis[i] * sign[i + 1] * sign[0]; });
  set(teeth);
  const c = couple(sim, T, rows, `chain ${T.map((x) => x.name).join(" ")} ${JSON.stringify({ teeth, sign, pitch, shifts: sorted, axes: T.map((x) => x.a) })}`, (t, h) => {
    const now = [...teeth], start = t - h;
    if (t >= 0) sorted.forEach((x) => { if (start >= x.at - h / 2) now[x.index] = x.teeth; }); // from the step that begins at the cue, as latch
    set(now);
  }, snapRows(T[0], rows));
  return report("chain", c, rows);
}

// A cam and its follower: profile(θ) is the lift in metres along the follower's slide for the cam angle θ (rad, read mod 2π,
// from the cam's start). The follower stays on the profile both ways (as if held by a spring or a groove). The profile is 0 at
// the start, repeats each turn and stays inside the follower's stops; it is hashed by its source and by its values every quarter
// degree (a profile that closes over a value, a factory or a constant of the scene script, has the same source for another lift).
export function cam(sim, camJoint, followerJoint, profile) {
  if (!isHinge(camJoint) || followerJoint?.kind !== "slide" || !followerJoint.part?.body) throw new Error("cam(): takes a hinge() cam and a slide() follower");
  if (typeof profile !== "function") throw new Error("cam(): profile is a function (θ in rad) => lift in metres");
  if (!(Math.abs(profile(0)) < 1e-9)) throw new Error("cam(): profile(0) must be 0 (the start is on the profile)");
  if (!(Math.abs(profile(TAU) - profile(0)) < 1e-6)) throw new Error("cam(): the profile must repeat each turn (profile(2π) = profile(0))");
  const lifts = [];
  for (let i = 0; i < 1440; i++) {
    const v = profile((i * TAU) / 1440);
    if (!num(v) || v < followerJoint.min - 1e-9 || v > followerJoint.max + 1e-9) throw new Error(`cam(): the profile reaches ${v} m at ${i / 4}°, outside the follower's stops (${followerJoint.min}..${followerJoint.max} m)`);
    lifts.push(v);
  }
  const C = turn(camJoint), F = travel(followerJoint, sim.world.gravity), r = camRow(C, F, profile);
  const c = couple(sim, [C, F], [r], `cam ${C.name} ${F.name} ${JSON.stringify({ cam: [C.a, camJoint.at], follower: [F.a, followerJoint.min, followerJoint.max] })} ${lifts.join(",")} ${String(profile)}`, null,
    (h) => { const f = r.impulse / (h || 1); return { angle: C.read(), torque: { driver: -r.slope * f * M * M, driven: f * M } }; });
  // After the bake (live or replayed, the same numbers): the cam's unwrapped angle at the end; torque(): driven is the force on
  // the follower (N), driver the torque the cam gave up (N·m), in the last step. Before a bake: angle 0, no torque.
  return { kind: "cam", angle: () => c.final()?.angle ?? 0, torque: () => ({ ...(c.final()?.torque ?? { driver: 0, driven: 0 }) }) };
}
