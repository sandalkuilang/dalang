// drive({ input, state, checks }): the film's one-input model. input(t) maps narration seconds to the mechanism's one
// input u (a crank angle, a stroke, a flow); state(u) returns every pose and every readout as plain numbers. Parts,
// instruments, labels and cards all read at(t), so nothing on screen can disagree with the motion and nothing is
// keyframed by hand. checks are the SPEC's MODEL "Check:" lines in code ({ name, u, got(state), want, tol }), run once
// at load: a miss throws with both numbers, so a wrong real number stops the build, not the viewer.
//
//   const model = drive({ input: (t) => crankDeg(t), state: (th) => ({ piston: slider(th), lift: valve(th) }), checks });
//   set.at = (t) => { const s = model.at(t); piston.position.y = s.piston; };   // and chart(ctx, { u: model.input(t), ... })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function drive({ input, state, checks = [] } = {}) {
  if (typeof input !== "function" || typeof state !== "function") throw new Error("drive: input(t) and state(u) must be functions");
  for (const c of checks) {
    const s = state(c.u);
    if (!same(s, state(c.u))) throw new Error(`drive: state(${c.u}) changed between two calls: state must be pure (no memory between frames)`);
    const got = c.got(s), tol = c.tol ?? 1e-9 * Math.max(1, Math.abs(c.want));
    if (!Number.isFinite(got) || Math.abs(got - c.want) > tol) throw new Error(`drive: check "${c.name}" got ${got}, want ${c.want} ± ${tol}`);
  }
  const at = (t) => {
    const u = input(t);
    if (!Number.isFinite(u)) throw new Error(`drive: input(${t}) is ${u}, not a finite number`);
    return state(u);
  };
  return { at, input, state };
}

// audit(model, { u: [u0, u1], samples, rigid, mesh, gaps, tol }): the machine proved to run over its whole input, at
// `samples` evenly spaced u (ends included). rigid: [{ name, a(s), b(s), len }] two joint points ([x, y, z] m) a rigid
// link holds at len; mesh: [{ name, a: { angle(s), z }, b: { angle(s), z } }] two meshing gears (angles in degrees, z
// teeth): for an external pair a.angle·a.z + b.angle·b.z stays constant (a slip changes it); gaps: [{ name, gap(s),
// max }] a contact (a follower on its cam, a part on its seat) whose gap (m) never passes max. tol: metres for rigid,
// degrees·teeth for mesh. A bevel pair (axes meeting at an angle) adds to a and b `cone` (its bevelGear's
// userData.bevel), `axis(s)` (the gear's own +z in world, pointing to its apex) and `apex(s)` ([x, y, z] m); angles are
// measured about that axis, so the ratio check is the same, and its contact is checked too: the axes at the sum of the
// two pitch angles (radians, within tol), the apexes together (m), one module and one cone distance. A hypoid (offset
// axes) is audited as a plain mesh (ratio only). Returns { problems: [line, ...] (the worst sample of each failing joint), checked }.
export function audit(model, { u, samples = 181, rigid = [], mesh = [], gaps = [], tol = 1e-6 } = {}) {
  if (!Array.isArray(u) || !Number.isFinite(u[0]) || !Number.isFinite(u[1]) || !(u[1] > u[0])) throw new Error("audit: u is [u0, u1] with u0 < u1");
  if (!(Number.isInteger(samples) && samples >= 2)) throw new Error("audit: samples is an integer of at least 2 (both ends)");
  if (!rigid.length && !mesh.length && !gaps.length) throw new Error("audit: nothing to audit (no rigid link, gear mesh or contact gap): a machine with no audited joint proves nothing");
  const us = Array.from({ length: samples }, (_, i) => u[0] + ((u[1] - u[0]) * i) / (samples - 1)), states = us.map((x) => model.state(x));
  const problems = [], d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const worstAt = (errs) => { let k = 0; errs.forEach((e, i) => { if (!(errs[k] >= e)) k = i; }); return k; }; // NaN wins: an unreadable joint is never hidden
  const worst = (name, what, errs, limit) => { const k = worstAt(errs); if (!(errs[k] <= limit)) problems.push(`${name}: ${what} off by ${errs[k]} at u = ${us[k]}`); };
  for (const j of rigid) worst(j.name, `length (${j.len} m)`, states.map((s) => Math.abs(d(j.a(s), j.b(s)) - j.len)), tol);
  const ang = (p, q) => Math.acos(Math.max(-1, Math.min(1, (p[0] * q[0] + p[1] * q[1] + p[2] * q[2]) / (Math.hypot(...p) * Math.hypot(...q)))));
  for (const g of mesh) {
    const c0 = g.a.angle(states[0]) * g.a.z + g.b.angle(states[0]) * g.b.z;
    worst(g.name, `ratio (${g.a.z}:${g.b.z} teeth)`, states.map((s) => Math.abs(g.a.angle(s) * g.a.z + g.b.angle(s) * g.b.z - c0)), tol);
    if (!g.a.cone && !g.b.cone) continue;
    for (const e of [g.a, g.b]) if (!(e.cone && Number.isFinite(e.cone.module) && Number.isFinite(e.cone.pitchAngle) && typeof e.axis === "function" && typeof e.apex === "function"))
      throw new Error(`audit: bevel mesh "${g.name}" needs cone (its bevelGear's userData.bevel), axis(s) and apex(s) on both gears`);
    const R = (e) => (e.cone.module * e.z) / (2 * Math.sin(e.cone.pitchAngle)), sum = g.a.cone.pitchAngle + g.b.cone.pitchAngle;
    for (const e of [g.a, g.b]) if (e.cone.teeth !== undefined && e.cone.teeth !== e.z) problems.push(`${g.name}: z ${e.z} but its gear has ${e.cone.teeth} teeth`);
    if (!(Math.abs(g.a.cone.module - g.b.cone.module) <= tol)) problems.push(`${g.name}: module ${g.a.cone.module} m against ${g.b.cone.module} m (bevel gears mesh at one module)`);
    else if (!(Math.abs(R(g.a) - R(g.b)) <= tol)) problems.push(`${g.name}: cone distance ${R(g.a)} m against ${R(g.b)} m (pitch angles wrong for ${g.a.z}:${g.b.z} teeth: bevelAngles)`);
    worst(g.name, `shaft angle (${(sum * 180) / Math.PI} deg, the two pitch angles)`, states.map((s) => Math.abs(ang(g.a.axis(s), g.b.axis(s)) - sum)), tol);
    worst(g.name, "apex (the two pitch cones meet at one point)", states.map((s) => d(g.a.apex(s), g.b.apex(s))), tol);
  }
  for (const c of gaps) { const errs = states.map((s) => c.gap(s) - c.max), k = worstAt(errs); if (!(errs[k] <= 0)) problems.push(`${c.name}: gap over ${c.max} m by ${errs[k]} at u = ${us[k]}`); }
  return { problems, checked: (rigid.length + mesh.length + gaps.length) * samples };
}
