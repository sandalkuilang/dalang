import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";
export { sweep, coat }; // a swept tube with a skin laid out for fur, and the fur itself: any animal, any limb

// Animals from their anatomy: every part swept along its own centre line with its real girth (no spheres glued
// together), then carrying fur: shells of real strands at the species' spacing and length, darker at the root,
// drooping a little under their weight. examples/cat.js builds a curled sleeping cat with them.

// A tube along pts with radius r(s) (s 0..1), its cross-section squashed vertically by squash, ends rounded;
// colour(s, a) per vertex, a the angle round the section (0 on top, π underneath). It also lays out the skin for
// the fur: uv in metres along and round the tube, and the way the hair is combed (flow: +1 toward the end of the
// curve, -1 toward its start).
function sweep(pts, r, { squash = 1, seg = 64, rad = 28, colour, flow = -1 }) {
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal"), pos = [], col = [], uv = [], comb = [], idx = [], up = new THREE.Vector3(0, 1, 0);
  const L = curve.getLength(), C = Math.round(2 * Math.PI * Math.max(...[0, 0.25, 0.5, 0.75, 1].map(r)) / 0.0011) * 0.0011;
  for (let i = 0; i <= seg; i++) {
    const s = i / seg, c = curve.getPointAt(s), T = curve.getTangentAt(s), B = new THREE.Vector3().crossVectors(T, up).normalize(), N = new THREE.Vector3().crossVectors(B, T).normalize();
    const e = Math.min(s, 1 - s) / 0.08, cap = e < 1 ? Math.sqrt(1 - (1 - e) ** 2) : 1, rr = r(s) * cap; // rounded ends
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * Math.PI * 2, v = c.clone().addScaledVector(N, Math.cos(a) * rr * squash).addScaledVector(B, Math.sin(a) * rr);
      pos.push(v.x, v.y, v.z);
      uv.push(s * L, (j / rad) * C);
      comb.push(T.x * flow, T.y * flow, T.z * flow);
      const k = colour(s, a);
      col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = a + rad + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); } // outward-facing
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("comb", new THREE.Float32BufferAttribute(comb, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal, t0 = curve.getTangentAt(0), t1 = curve.getTangentAt(1);
  for (let i = 0; i < nr.count; i++) if (Math.hypot(nr.getX(i), nr.getY(i), nr.getZ(i)) < 1e-6) { const t = i < nr.count / 2 ? t0.clone().negate() : t1; nr.setXYZ(i, t.x, t.y, t.z); } // the closed tips: a zero normal is NaN in the shader, and bloom spreads it over the frame
  return g;
}

// Fur: shells sharing the part's geometry, each pushed out along the normal and, more and more toward the tip,
// along the comb (hair lies down the body, it does not stand up); a fragment is kept only where a strand passes:
// one per ~0.7 mm cell of the skin's own uv (no 3D grid, so no rings), jittered, its own length, thinner at the tip.
function coat(mesh, { length = 0.008, shells = 32, density = 1500, droop = 0.003, uvScale = [1, 1] } = {}) {
  for (let i = 1; i <= shells; i++) {
    const h = i / shells, m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.furH = { value: h };
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float furH; attribute vec3 comb; varying vec2 vSkin;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>\nvSkin = uv * vec2(${uvScale.join(", ")}); transformed += objectNormal * ${length.toFixed(4)} * 0.55 * furH + comb * ${length.toFixed(4)} * 0.9 * furH * furH; transformed.y -= ${droop.toFixed(4)} * furH * furH;`);
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float furH; varying vec2 vSkin;\nfloat furHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }")
        .replace("#include <color_fragment>", `#include <color_fragment>
          vec2 q = vSkin * ${density.toFixed(1)}, cell = floor(q), f = fract(q) - 0.5 - 0.5 * (vec2(furHash(cell + 3.1), furHash(cell + 7.7)) - 0.5);
          float len = 0.35 + 0.65 * furHash(cell);
          if (furH > len || length(f) > 0.55 * (1.0 - furH / len)) discard;
          diffuseColor.rgb *= mix(0.5, 1.08, furH / len); // the root is in the shadow of the coat`);
    };
    m.customProgramCacheKey = () => "fur";
    const s = new THREE.Mesh(mesh.geometry, m);
    s.receiveShadow = true;
    s.userData.fur = true; // physics and placement ignore the coat: it is not solid
    mesh.add(s);
  }
}
