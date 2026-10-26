import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";

// Twin sets for an A/B comparison (visual-direction.md §13): one set built twice, the same room, props, light and
// camera, differing only in the one variable compared, side by side so that the same event plays in both at once.
// build(group, value, index) builds one set in scene units around its own origin; the two are placed `gap` m apart
// (between their bounding boxes) along `axis`, the gap centred on `at`. On 9:16, `axis: "y"` stacks them (A on top).
//
//   const { a, b } = twinSets(kit, (g, kW) => { g.add(kettle(kit, { power: kW })); }, { values: [N.powerA, N.powerB] });
export function twinSets(k, build, { values, at = new THREE.Vector3(), gap = 0.3, axis = "x" } = {}) {
  if (!Array.isArray(values) || values.length !== 2) throw new Error("twinSets: values is [a, b], the one variable that differs");
  if (!["x", "y", "z"].includes(axis)) throw new Error('twinSets: axis is "x", "y" or "z"');
  const sets = values.map((v, i) => {
    const g = new THREE.Group();
    g.name = i ? "set B" : "set A";
    build(g, v, i);
    g.updateMatrixWorld(true);
    return g;
  });
  const boxes = sets.map((g) => new THREE.Box3().setFromObject(g)), half = gap / M / 2;
  const sign = axis === "y" ? -1 : 1; // stacked: A on top
  sets.forEach((g) => { g.position.copy(at); });
  if (sign > 0) { sets[0].position[axis] = at[axis] - half - boxes[0].max[axis]; sets[1].position[axis] = at[axis] + half - boxes[1].min[axis]; }
  else { sets[0].position[axis] = at[axis] + half - boxes[0].min[axis]; sets[1].position[axis] = at[axis] - half - boxes[1].max[axis]; }
  for (const g of sets) k.scene.add(g);
  return { a: sets[0], b: sets[1], gap };
}
