// Bodies that come to rest by simulation, built on physics.js. Every number is real (metres, kg, m/s²) and
// converted with the set's scale M. A rig for one kind of object (a caster chair) is in examples/.

// Loose soft props (cushions, a dropped coat) are not placed: each is a dynamic hull (~0.45 kg, cloth friction) that
// falls and leans in the pre-roll (give it ≥ 1.2 s). Exclude them from the static set: sim.staticScene(scene, [...]).
export function loose(sim, objects, { kg = 0.45, friction = 0.9 } = {}) {
  // Soft: it swallows its energy where it lands — a rigid stuffed shape would rock on its bulging faces for seconds.
  return objects.map((o) => sim.dynamicHull(o, { name: o.name, mass: kg, friction, restitution: 0, impacts: false, soft: true, angularDamping: 5, linearDamping: 1 }));
}
