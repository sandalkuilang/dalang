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
