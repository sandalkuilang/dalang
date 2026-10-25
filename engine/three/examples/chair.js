import { THREE } from "../three-vendor.js";
import { RAPIER } from "../rapier.js";
import { M } from "../kit.js";

// A ready rig built on physics.js; every number is real (metres, kg, m/s²) and converted with the set's scale M.

// An office chair on casters: a star base (one hull per leg plus the column, so the gaps between legs stay open)
// standing on a small frictionless ball at each caster (found from the model's lowest vertices), and the seat as
// its own body on a revolute joint at the top of the column (a kinematic seat would crush what it meets).
// seat: the seat's node in the model, its origin on the column; wheel: caster diameter (m). step(t, dt) applies, every step, at rest too:
// the casters' rolling resistance to the whole chair (both bodies: the free one would carry its momentum through
// the joint), the base's resistance to spinning, and the column's friction on the swivel. push(v, spin) shoves it.
export function casterChair(sim, chair, seat, { baseKg = 6, seatKg = 6, roll = 0.3, yaw = 6, column = 3.2, wheel = 0.066, name = "chair" } = {}) {
  const seatParts = new Set();
  seat.traverse((o) => seatParts.add(o));
  const col = seat.position.clone(), r = wheel / M / 2;
  // Casters: lowest vertices of the base (within twice a wheel's height), clustered within 8 cm, away from the column.
  const low = sim.points(chair, (v, m) => !seatParts.has(m) && v.y < 2 * r * 1.05), wheels = [];
  for (let i = 0; i < low.length; i += 3) {
    const p = new THREE.Vector3(low[i], 0, low[i + 2]);
    if (p.distanceTo(new THREE.Vector3(col.x, 0, col.z)) < 0.1 / M) continue;
    const w = wheels.find((c) => c.at.distanceTo(p) < 0.08 / M);
    if (w) { w.sum.add(p); w.n++; w.at.copy(w.sum).divideScalar(w.n); } else wheels.push({ at: p.clone(), sum: p.clone(), n: 1 });
  }
  const casters = wheels.map((w) => ({ desc: RAPIER.ColliderDesc.ball(r).setTranslation(w.at.x, r, w.at.z).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), friction: 0, restitution: 0, group: 1 }));
  const base = sim.dynamicHull(chair, { name, mass: baseKg, friction: 0.4, group: 1, impacts: false, filter: (v, m) => !seatParts.has(m) && v.y > 2.3 * r, spokes: { x: col.x, z: col.z, core: 0.06 / M, bins: 20 }, extra: casters });
  const top = sim.dynamicHull(seat, { name: name + " seat", mass: seatKg, friction: 0.4, group: 1, impacts: false });
  sim.world.createImpulseJoint(RAPIER.JointData.revolute({ x: col.x, y: col.y, z: col.z }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }), base.body, top.body, true);
  let stopped = null, pushedAt = null;
  return {
    base, top, wheels: wheels.length,
    get stopped() { return stopped; },
    push(t, dir, speed, spin = 0) { // dir: a horizontal unit vector; speed m/s; spin rad/s on the seat
      [base, top].forEach((b) => b.body.setLinvel({ x: (dir.x * speed) / M, y: 0, z: (dir.z * speed) / M }, true));
      const wb = base.body.angvel();
      top.body.setAngvel({ x: wb.x, y: wb.y + spin, z: wb.z }, true);
      pushedAt = t;
    },
    step(t, dt) {
      const v = base.body.linvel(), s = Math.hypot(v.x, v.z), cut = Math.min(s, (roll / M) * dt);
      if (pushedAt !== null && stopped === null && t > pushedAt && s < 0.005 / M) stopped = t;
      if (s > 0) [base, top].forEach((b) => { const u = b.body.linvel(); b.body.setLinvel({ x: u.x - (v.x / s) * cut, y: u.y, z: u.z - (v.z / s) * cut }, true); });
      const w = base.body.angvel(), ny = Math.sign(w.y) * Math.max(0, Math.abs(w.y) - yaw * dt);
      base.body.setAngvel({ x: w.x, y: ny, z: w.z }, true);
      const ws = top.body.angvel(), rel = ws.y - ny, nrel = Math.sign(rel) * Math.max(0, Math.abs(rel) - column * dt);
      top.body.setAngvel({ x: ws.x, y: ny + nrel, z: ws.z }, true);
    },
  };
}
