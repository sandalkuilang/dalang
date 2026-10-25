import { THREE } from "../three-vendor.js";
import { M } from "../kit.js";
import { sweep, coat } from "../fur.js";

// A real cat, asleep in the classic curl: spine bent into a C, haunch on top, chest and neck, the head resting on
// its folded front paws, the tail wrapped round the front to the nose. Orange tabby coat, cream chest and paws.
// Every part is swept along its own centre line (no spheres glued together), then carries fur: shells of real
// strands ~0.7 mm apart, 3-10 mm long, darker at the root, drooping a little under their weight.

const tabby = new THREE.Color(0xd8904f), stripe = new THREE.Color(0xa45a2a), cream = new THREE.Color(0xf3e2c6);

// size: across the curl, in metres (an adult ≈ 0.37); modelled at 0.26 m and scaled into the set by 1/M.
export function makeCat({ size = 0.37 } = {}) {
  const root = new THREE.Group(), skin = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  root.name = "cat";
  const part = (g, parent = root, fur) => { const m = new THREE.Mesh(g, skin); m.castShadow = m.receiveShadow = true; parent.add(m); coat(m, fur); return m; };
  const R = 0.075, y0 = 0.05, at = (deg, rr = R, y = y0) => new THREE.Vector3(Math.cos(deg * Math.PI / 180) * rr, y, Math.sin(deg * Math.PI / 180) * rr);
  // Body: hips at 200°, round the ring counter-clockwise to the neck at 450° (= 90°).
  const spine = [200, 250, 300, 350, 400, 450].map((d) => at(d)), girth = (s) => 0.05 + 0.008 * Math.sin(Math.PI * Math.min(1, s / 0.8)) - 0.022 * Math.max(0, (s - 0.8) / 0.2);
  const coatColour = (s, a) => { // stripes over the back, fading down the flanks; cream underneath and on the chest
    const back = Math.max(0, Math.cos(a)), band = 0.5 + 0.5 * Math.sin(s * Math.PI * 2 * 9 + 0.6 * Math.sin(a * 3));
    const c = tabby.clone().lerp(stripe, back * Math.pow(band, 3) * 0.85);
    return c.lerp(cream, Math.max(0, -Math.cos(a)) * 0.9 + (s > 0.75 ? (s - 0.75) * 2.4 * Math.max(0, -Math.cos(a) + 0.6) : 0));
  };
  const body = part(sweep(spine, girth, { squash: 0.82, colour: coatColour }));
  part(sweep([at(212, R + 0.012, y0 + 0.025), at(232, R + 0.02, y0 + 0.035), at(252, R + 0.012, y0 + 0.03)], (s) => 0.034, { colour: (s, a) => tabby.clone().lerp(stripe, 0.4 * Math.max(0, Math.cos(a)) * (0.5 + 0.5 * Math.sin(s * 18))) }), body); // the haunch over the folded hind leg
  // Front paws, folded under the chest and reaching toward the tail.
  [[418, 0.02], [432, -0.012]].forEach(([d, dy]) => part(sweep([at(d, R - 0.005, 0.022 + dy * 0.3), at(d + 40, R - 0.03, 0.02), at(d + 70, R - 0.04, 0.018)], (s) => 0.016 - 0.003 * s, { flow: 1, colour: (s) => tabby.clone().lerp(cream, Math.min(1, s * 1.6)) }), body, { length: 0.004 }));
  // Tail: from the hips round the outside of the curl, low, to rest along the front under the chin.
  const tailPts = [at(196, R, 0.035), at(178, R + 0.045, 0.02), at(150, R + 0.06, 0.018), at(120, R + 0.05, 0.018), at(95, R + 0.03, 0.02)];
  const tailG = new THREE.Group();
  tailG.position.copy(tailPts[0]);
  root.add(tailG);
  part(sweep(tailPts.map((p) => p.clone().sub(tailPts[0])), (s) => 0.017 - 0.007 * s, { colour: (s, a) => tabby.clone().lerp(stripe, (0.5 + 0.5 * Math.sin(s * Math.PI * 2 * 7)) ** 2 * 0.8 * (0.6 + 0.4 * Math.cos(a))), flow: 1 }), tailG, { length: 0.01 });
  // Head: on a pivot at the neck, facing along the curl and down onto the paws; a broad skull, cheeks, whisker
  // pads, nose, closed eyes, ears folded back a little in sleep.
  const neck = at(450), face = new THREE.Vector3(-1, 0, 0), headBase = new THREE.Group(), head = new THREE.Group();
  headBase.position.copy(neck);
  headBase.rotation.y = Math.atan2(-face.z, face.x) - 0.5; // turned in toward the tail
  root.add(headBase);
  headBase.add(head);
  const hc = (x, y, z) => new THREE.Vector3(x, y, z);
  const skull = part(sweep([hc(0.0, -0.004, 0), hc(0.022, -0.008, 0), hc(0.044, -0.014, 0), hc(0.06, -0.02, 0)], (s) => 0.038 * Math.sin(Math.PI * (0.25 + 0.75 * s)) ** 0.6, { squash: 0.88, rad: 32, colour: (s, a) => {
    const top = Math.max(0, Math.cos(a)), m = 0.5 + 0.5 * Math.sin(a * 7); // the forehead "M" and cheek lines
    return tabby.clone().lerp(stripe, top * (s < 0.5 ? m * 0.7 : 0)).lerp(cream, Math.max(0, -Math.cos(a)) * 0.8 + (s > 0.82 ? 0.55 * Math.max(0, 0.3 - Math.cos(a)) : 0)); // white chin and muzzle, orange nose bridge
  } }), head, { length: 0.005 });
  [-1, 1].forEach((side) => {
    for (let w = 0; w < 4; w++) { // whiskers: fine white hairs fanning out from either side of the muzzle
      const a = (w - 1.5) * 0.18, wh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(hc(0.058, -0.026 + w * 0.0015, side * 0.011), hc(0.07, -0.026 + a * 0.02, side * 0.04), hc(0.074, -0.03 + a * 0.04, side * 0.062)), 8, 0.00025, 3), new THREE.MeshStandardMaterial({ color: 0xf6f1e8, roughness: 0.4 }));
      wh.userData.fur = true;
      head.add(wh);
    }
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.019, 0.028, 24, 1, false), skin);
    const eg = ear.geometry, ec = [];
    for (let i = 0; i < eg.attributes.position.count; i++) { const y = eg.attributes.position.getY(i); const c = tabby.clone().lerp(stripe, 0.3 + 0.4 * (y + 0.015) / 0.03); ec.push(c.r, c.g, c.b); }
    eg.setAttribute("color", new THREE.Float32BufferAttribute(ec, 3));
    ear.geometry.translate(0, 0.014, 0); // pivot at the base
    ear.scale.set(1, 1, 0.42);
    ear.position.set(0.006, 0.022, side * 0.021);
    ear.rotation.set(side * 0.45, 0, 0.35); // relaxed in sleep: tipped out and back
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.02, 20).translate(0, 0.01, 0), new THREE.MeshStandardMaterial({ color: 0xe0a896, roughness: 0.8 }));
    inner.position.set(0.004, 0.002, 0);
    inner.scale.set(1, 1, 0.5);
    ear.add(inner);
    ear.castShadow = true;
    head.add(ear);
    coat(ear, { length: 0.003, shells: 12, uvScale: [0.05, 0.03] });
    const lid = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0012, 6, 16, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.6 }));
    lid.position.set(0.045, -0.002, side * 0.017);
    lid.rotation.set(Math.PI / 2, 0.3 * side, Math.PI + 0.1);
    head.add(lid);
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 16, 12), new THREE.MeshStandardMaterial({ color: 0xc98a7a, roughness: 0.45 }));
  nose.scale.set(0.8, 0.6, 1);
  nose.position.set(0.072, -0.02, 0);
  head.add(nose);
  head.rotation.z = -0.25; // chin down on the paws
  head.userData.rest = head.rotation.clone();
  root.scale.setScalar(size / 0.26 / M);
  return { root, body, head, tail: tailG, skull };
}
