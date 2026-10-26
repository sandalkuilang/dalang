import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { cutaway } from "../cutaway.js";
import { grains } from "../grains.js";

// An open canister filled with grains: the top shows two jittered layers of grains at their real size, a cut shows
// whole grains in its face. Any bulk: a jar of rice, a sack of coffee, a pot of lentils, a bin of oats. Modelled in
// metres (16 cm tall, 11 cm across), scaled by 1/M. The wall is a single surface flagged `userData.cut = { shell }`, so
// its cut is a thin ring; the base is a closed solid. The fill is cut by hand (grains.js, whole grains in its face) and
// follows the cutaway: the same `{ normal, offset }` goes to grains() and to cutaway(), and cutaway() drives the fill
// (`cut.off`, `cut.set` and a rotated canister move the fill with the wall).
// fill: a grains() preset; level: how full (0..1) of the height; cut: options for cutaway() (normal, offset, color,
// hatch); without it the canister is whole.
export function makeCanister(k, { at, height = 0.16, radius = 0.055, fill = "coffee", level = 0.75, cut } = {}) {
  const { scene, mat } = k, group = new THREE.Group(), glaze = mat(0xd9d4cc, 0.5).clone();
  glaze.side = THREE.DoubleSide; // an open wall is seen from inside too
  group.name = "canister";
  group.position.copy(at);
  group.scale.setScalar(1 / M);
  scene.add(group);
  const lathe = (pts, m, shell) => {
    const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 64), m);
    o.castShadow = o.receiveShadow = true;
    if (shell) o.userData.cut = { shell };
    return o;
  };
  const wall = lathe([[radius, 0.004], [radius, height]], glaze, 0.0015); // open at the top
  const base = lathe([[0, 0], [radius, 0], [radius, 0.004], [0, 0.004]], glaze);
  group.add(wall, base);
  const normal = cut?.normal ?? new THREE.Vector3(0, 0, 1), offset = cut?.offset ?? 0;
  const f = grains(k, { preset: fill, at: new THREE.Vector3(), radius: radius - 0.0018, height: level * height, cut: cut && { normal, offset } });
  f.group.scale.setScalar(1); // already inside a group in metres
  f.group.position.set(0, 0.004, 0);
  group.add(f.group);
  const c = cut ? cutaway(group, { normal: new THREE.Vector3(0, 0, 1), offset: 0, ...cut }) : null;
  k.rest(group, "canister");
  return { group, fill: f, cut: c, parts: { wall, base } };
}
