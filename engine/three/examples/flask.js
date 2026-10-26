import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { cutaway } from "../cutaway.js";

// A vacuum flask cut in half, the kind of shot a "how does it work inside" explainer is built on: two thin steel
// shells with the vacuum gap between them (the gap is what keeps heat in, so the section must show it), a solid ring
// joining them at the neck, a solid stopper, and a screw cup added AFTER the cut, the way a set adds a late part,
// which is cut too. Modelled in metres (30 cm tall), scaled by 1/M. The shells are single surfaces flagged
// `userData.cut = { shell }`, so their cut shows a thin wall ring, not a disc; the neck ring and stopper are closed
// solids, so theirs is a disc. cut: options for cutaway() (normal, offset, color, hatch).
export function makeFlask(k, { at, height = 0.3, cut = {} }) {
  const { scene, mat } = k, group = new THREE.Group(), steel = mat(0xc9ccce, 0.3), plastic = mat(0x2f3a40, 0.55);
  steel.metalness = 0.6;
  group.name = "flask";
  group.position.copy(at);
  group.scale.setScalar(1 / M);
  scene.add(group);
  const lathe = (pts, m, shell) => {
    const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y * height / 0.3)), 64), m);
    o.castShadow = o.receiveShadow = true;
    if (shell) o.userData.cut = { shell };
    return o;
  };
  const outer = lathe([[0, 0], [0.036, 0], [0.038, 0.004], [0.038, 0.21], [0.03, 0.235], [0.0225, 0.245]], steel, 0.0006); // body, open at the neck
  const inner = lathe([[0, 0.012], [0.031, 0.012], [0.033, 0.016], [0.033, 0.205], [0.026, 0.228], [0.02, 0.242]], steel, 0.0005); // vessel: ~4.5 mm of vacuum between it and the body
  const neck = lathe([[0.02, 0.242], [0.0228, 0.242], [0.0228, 0.25], [0.02, 0.25], [0.02, 0.242]], steel); // the solid ring joining the two at the mouth
  const stopper = lathe([[0, 0.222], [0.0185, 0.222], [0.0195, 0.252], [0.024, 0.254], [0.024, 0.266], [0, 0.266]], plastic);
  group.add(outer, inner, neck, stopper);
  const c = cutaway(group, { normal: new THREE.Vector3(0, 0, 1), offset: 0, ...cut });
  const cup = lathe([[0.0395, 0.215], [0.041, 0.217], [0.041, 0.296], [0.039, 0.3], [0, 0.3]], plastic); // the screw cup, open at the bottom
  c.add(cup, { shell: 0.0015 });
  k.rest(group, "flask");
  return { group, cut: c, parts: { outer, inner, neck, stopper, cup } };
}
