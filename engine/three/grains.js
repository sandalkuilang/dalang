import { THREE, mergeVertices } from "./three-vendor.js";
import { M, tone } from "./kit.js";
import { surface } from "./surfaces.js";

// A bulk of small things (rice in a jar, coffee in a sack, lentils in a pot, sand in a pit, gravel on a path) reads by
// its separate grains, at the surface and at a cut. A smooth slab with a noise texture reads as foam or gravel, and
// capsules read as pills. Grains here are plump ellipsoids (angular stones for sugar, sand and gravel) at their real
// size, in two or more jittered layers, each its own tone, over a body whose faces wear the same packed-grain texture
// (surfaces.js `grains`). It is static dressing: a pour or a spill is a Rapier bake of a few hundred grains, not this.
//
// grains(k, { preset | l, t, w, shape, colors, rough, at, radius | width + depth, bottom, height, layers = 2,
//   jitter = 0.5, cut: { normal, offset }, instances = true, max = 40000, seed = 9 })
//   → { group, body, mesh, counts: { top, face }, capped, preset }
// Everything is modelled in metres inside `group` (scaled 1/M, placed with `at`, the fill's bottom centre in units); the
// caller adds the group to the scene like a kit prop. To nest it in a group already modelled in metres, set its scale
// to 1 and its position in metres (examples/canister.js does). The body is a column of the footprint (circle `radius`,
// or `width` × `depth`) up to the grains' lowest layer, tapering to `bottom` (radius at the base) for a bowl or a
// flowerpot; the top is `layers` jittered grids of grains, each layer half a cell off the one below.
// `cut` shows the inside: the same `{ normal, offset }` cutaway() takes (the normal points INTO the removed half,
// offset in metres from `at`), so pass one object to both. The fill is built already cut: the body stops at the plane
// and whole grains (not sliced ones, as loose grain really shows) line the face, so both are flagged
// `userData.cut = false` and a cutaway on the container does not clip them again. A tapered fill cut off the axis leans
// its face slightly (the approximation is exact through the axis).
// `instances: false` (sugar or sand in a wide shot, grains under ~3 px) builds the body alone: its texture is the
// grains. Above `max` grains the rest are dropped (`capped`) with a warning: shrink the area or drop the instances.
// A toon set swaps `body.material` and `mesh.material` for its own; the shapes stay.

export const presets = { // real sizes (m): l length, t thickness, w width; shape; colours; roughness
  lentil: { l: 0.005, t: 0.0022, w: 0.005, shape: "lens", colors: [0x8b7240, 0x7a6436, 0x9a8250], rough: 0.6 },
  coffee: { l: 0.010, t: 0.006, w: 0.008, shape: "bean", colors: [0x4a2c1a, 0x3b2214, 0x5a3520], rough: 0.4 },
  rice: { l: 0.007, t: 0.002, w: 0.002, shape: "lens", colors: [0xf3f0e6, 0xebe6d8, 0xf7f4ec], rough: 0.45 },
  oats: { l: 0.009, t: 0.001, w: 0.007, shape: "lens", colors: [0xd9c49a, 0xcdb688, 0xe2cfa6], rough: 0.7 },
  sugar: { l: 0.0006, t: 0.0005, w: 0.0006, shape: "stone", colors: [0xf8f8f6, 0xf2f2ee], rough: 0.25 },
  sand: { l: 0.0005, t: 0.0004, w: 0.0005, shape: "stone", colors: [0xdcc49a, 0xcdb084, 0xe6d3ae], rough: 0.9 },
  gravel: { l: 0.012, t: 0.008, w: 0.010, shape: "stone", colors: [0x8d8a84, 0x6f6b66, 0xa59e94], rough: 0.85 },
};

// One shared grain: unit-ish shape scaled to (l, t, w). Lens and bean are smooth; stone is faceted. mergeVertices on a
// copy without uv and normal makes the seams and poles one vertex, so smooth normals have no crease line.
function grainGeometry(P, seed) {
  const prep = (geo) => { geo.deleteAttribute("uv"); geo.deleteAttribute("normal"); return mergeVertices(geo); };
  let geo;
  if (P.shape === "stone") {
    geo = prep(new THREE.IcosahedronGeometry(0.5, 1));
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const s = 0.85 + 0.3 * tone(i, seed); pos.setXYZ(i, pos.getX(i) * s * P.l, pos.getY(i) * s * P.t, pos.getZ(i) * s * P.w); }
    geo = geo.toNonIndexed();
  } else {
    geo = prep(new THREE.SphereGeometry(0.5, 14, 10));
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) * P.t;
      const z = pos.getZ(i) * P.w;
      if (P.shape === "bean" && y > 0) y -= P.t * 0.25 * Math.exp(-((z / (0.12 * P.w)) ** 2)); // the crease along the bean
      pos.setXYZ(i, pos.getX(i) * P.l, y, z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Sutherland-Hodgman against one half-plane x*nx + z*nz <= c.
function clip(poly, nx, nz, c) {
  const out = [], d = (p) => p[0] * nx + p[1] * nz - c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = d(a), db = d(b);
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const u = da / (da - db); out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  }
  return out;
}

export function grains(k, { preset, at = new THREE.Vector3(), radius, width, depth, bottom, height = 0.05, layers = 2, jitter = 0.5, cut, instances = true, max = 40000, seed = 9, ...over } = {}) {
  const P = { ...presets[preset], ...over };
  if (!P.l || !P.t || !P.w || !P.colors) throw new Error("grains: a preset (" + Object.keys(presets).join(", ") + ") or l, t, w, shape and colors");
  const round = radius !== undefined, W = width ?? 2 * (radius ?? 0.05), D = depth ?? 2 * (radius ?? 0.05);
  if (!round && (width === undefined || depth === undefined)) throw new Error("grains: radius, or width and depth");
  const R0 = bottom ?? radius, rAt = (y, yb) => (round ? R0 + (radius - R0) * Math.min(1, y / yb) : 0); // radius at height y
  const group = new THREE.Group();
  group.name = "grains";
  group.position.copy(at);
  group.scale.setScalar(1 / M);

  const n2 = cut ? (() => { const x = cut.normal?.x ?? 0, z = cut.normal?.z ?? 1, l = Math.hypot(x, z) || 1; return { x: x / l, z: z / l }; })() : null, off = cut ? (cut.offset ?? 0) : 0;
  const dot = (x, z) => x * n2.x + z * n2.z;
  const yb = instances ? height - P.t * (0.85 + 0.45 * (layers - 1)) : height; // the body's top; the top layer lands at `height`

  // Body: the footprint, clipped at the cut, extruded up to yb.
  let poly = round ? Array.from({ length: 64 }, (_, i) => [radius * Math.cos((i / 64) * 2 * Math.PI), radius * Math.sin((i / 64) * 2 * Math.PI)]) : [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  if (cut) poly = clip(poly, n2.x, n2.z, off - 0.2 * P.t);
  const bodyMat = surface(new THREE.MeshStandardMaterial({ color: P.colors[0], roughness: P.rough }), "grains", { size: P.w, long: P.l / P.w });
  let body = null;
  if (poly.length >= 3 && yb > 0) {
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: yb, bevelEnabled: false }).rotateX(-Math.PI / 2);
    if (round && R0 !== radius) {
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) { const f = rAt(pos.getY(i), yb) / radius; pos.setX(i, pos.getX(i) * f); pos.setZ(i, pos.getZ(i) * f); }
    }
    geo.computeVertexNormals();
    body = new THREE.Mesh(geo, bodyMat);
    body.name = "grains-body";
    body.castShadow = body.receiveShadow = true;
    if (cut) body.userData.cut = false;
    group.add(body);
  }

  // Grains.
  const s = 0.92 * Math.sqrt(P.l * P.w), pj = 0.7 * jitter, tilt = jitter * 0.45;
  let n = 0;
  const rnd = () => tone(n++, seed), list = [], inside = (x, z, y, yTop) => (round ? Math.hypot(x, z) <= rAt(y, yTop) - P.w / 2 : Math.abs(x) <= W / 2 - P.w / 2 && Math.abs(z) <= D / 2 - P.w / 2);
  const pose = (x, y, z, rx, ry, rz) => list.push([x, y, z, rx, ry, rz, 1 + jitter * 0.3 * (rnd() - 0.5)]);
  let top = 0, face = 0;
  if (instances) {
    const hx = round ? radius : W / 2, hz = round ? radius : D / 2;
    for (let i = 0; i < layers; i++) {
      const y = yb + P.t * (0.35 + 0.45 * i);
      for (let x0 = -hx + (i * s) / 2; x0 < hx; x0 += s) for (let z0 = -hz + (i * s) / 2; z0 < hz; z0 += s) {
        const x = x0 + s / 2 + (rnd() - 0.5) * 2 * pj * s, z = z0 + s / 2 + (rnd() - 0.5) * 2 * pj * s;
        if (!inside(x, z, yb, yb) || (cut && dot(x, z) > off - 0.3 * P.w)) continue;
        pose(x, y, z, (rnd() - 0.5) * 2 * tilt, rnd() * 2 * Math.PI, (rnd() - 0.5) * 2 * tilt);
      }
    }
    top = list.length;
    if (cut) {
      const t2 = { x: -n2.z, z: n2.x }, R = Math.max(hx, hz), cx = n2.x * (off - 0.35 * P.t), cz = n2.z * (off - 0.35 * P.t);
      for (let y0 = P.t / 2; y0 < yb; y0 += 0.8 * s) for (let u0 = -R; u0 < R; u0 += s) {
        const u = u0 + s / 2 + (rnd() - 0.5) * 0.6 * s, y = Math.min(yb, Math.max(P.t / 2, y0 + (rnd() - 0.5) * 0.6 * s)), x = cx + t2.x * u, z = cz + t2.z * u;
        if (!inside(x, z, y, yb)) continue;
        pose(x, y, z, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI);
      }
      face = list.length - top;
    }
  }
  let capped = false;
  if (list.length > max) {
    console.warn("grains: " + list.length + " grains of " + (preset || "this size") + " is past the cap of " + max + "; kept the first " + max + ". Use instances: false, or a smaller area.");
    list.length = max; capped = true;
    top = Math.min(top, max); face = list.length - top;
  }

  let mesh = null;
  if (list.length) {
    mesh = new THREE.InstancedMesh(grainGeometry(P, seed), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: P.rough }), list.length);
    mesh.name = "grains-mesh";
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), c = new THREE.Color();
    list.forEach(([x, y, z, rx, ry, rz, sc], i) => {
      e.set(rx, ry, rz); q.setFromEuler(e);
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sc, sc, sc)));
      mesh.setColorAt(i, c.set(P.colors[Math.floor(rnd() * P.colors.length)]).multiplyScalar(0.9 + 0.2 * rnd()));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (cut) mesh.userData.cut = false;
    group.add(mesh);
  }
  return { group, body, mesh, counts: { top, face }, capped, preset };
}
