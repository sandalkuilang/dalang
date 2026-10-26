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
  if (!num(min) || !num(max) || !(min <= 0 && max >= 0)) throw new Error(`${kind}(): min and max are numbers with min ≤ 0 ≤ max (the start is inside its stops)`);
  const a = unit(axis), p0 = { ...b.translation() }, q0 = { ...b.rotation() }, al = rot(conj(q0), a);
  let an = { x: 0, y: 0, z: 0 };
  if (kind === "hinge") {
    if (!num(at?.x) || !num(at?.y) || !num(at?.z)) throw new Error("hinge(): `at` is the point the part turns about, a world position {x, y, z} in scene units");
    an = rot(conj(q0), { x: at.x - p0.x, y: at.y - p0.y, z: at.z - p0.z });
  }
  const frame = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p0.x, p0.y, p0.z).setRotation(q0));
  const data = kind === "slide" ? RAPIER.JointData.prismatic(an, an, al) : RAPIER.JointData.revolute(an, an, al);
  const joint = sim.world.createImpulseJoint(data, frame, b, true);
  joint.setLimits(kind === "slide" ? min / M : min, kind === "slide" ? max / M : max); // JointData only carries limits for a prismatic joint: set both after
  const j = { kind, part, joint, frame, axis: a, at: at ? { x: at.x, y: at.y, z: at.z } : null, p0, q0, min, max };
  // Hashed: the cache key must change with a stop (physics.js hashes a joint's type, bodies and anchors, not its limits).
  sim.part({ bodies: [b], key: `${kind} ${part.name} ${JSON.stringify({ axis: a, at: j.at, min, max })}`, step() {} });
  return j;
}

// A part on a prismatic joint: it moves along `axis` (world direction) from its start by min..max metres (min ≤ 0 ≤ max).
export const slide = (sim, part, { axis, min = 0, max } = {}) => joined(sim, part, "slide", axis, min, max);
// A part on a revolute joint: it turns about `axis` through the world point `at` (scene units) by min..max radians.
export const hinge = (sim, part, { at, axis, min = 0, max } = {}) => joined(sim, part, "hinge", axis, min, max, at);

// A spring along a slide (N/m, rest in metres from the start, preload in N at the start) or about a hinge (N·m/rad, rest
// in rad, preload in N·m at the start). Give rest or preload (rest = preload / stiffness), not both. damping: N·s/m or
// N·m·s/rad. Applied as an impulse each step, and only while the part is dynamic (a latched part feels nothing).
export function spring(sim, j, { stiffness, rest, preload, damping = 0 } = {}) {
  if (!j?.joint || !j.part?.body) throw new Error("spring() takes what slide() or hinge() returned");
  if (!(num(stiffness) && stiffness > 0)) throw new Error("spring(): stiffness > 0 (N/m, or N·m/rad on a hinge)");
  if ((rest === undefined) === (preload === undefined)) throw new Error("spring(): give rest or preload (rest = preload / stiffness), not both and not neither");
  if (!num(rest ?? preload) || !num(damping) || damping < 0) throw new Error("spring(): rest or preload is a number, damping ≥ 0");
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
