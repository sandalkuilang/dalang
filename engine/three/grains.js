import { THREE, mergeVertices } from "./three-vendor.js";
import { M, tone } from "./kit.js";
import { surface } from "./surfaces.js";

// A bulk of small things (rice in a jar, coffee in a sack, lentils in a pot, sand in a pit, gravel on a path) reads by
// its separate grains, at the surface and at a cut. A smooth slab with a noise texture reads as foam or gravel, and
// capsules read as pills. Grains here are plump ellipsoids (angular stones for sugar, sand and gravel) at their real
// size, in two or more jittered layers, each its own tone, over a body whose faces wear the same packed-grain texture
// (surfaces.js `grains`). It is static dressing, not a pour or a spill.
//
// grains(k, { preset | l, t, w, shape, colors, rough, at, radius | width + depth, bottom, height, layers = 2,
//   jitter = 0.5, cut: { normal, offset }, instances = true, max = 40000, seed = 9 })
//   → { group, body, mesh, counts: { top, face }, capped, preset, cutTo(plane | null) }
// Everything is modelled in metres inside `group` (scaled 1/M, placed with `at`, the fill's bottom centre in units); the
// caller adds the group to the scene like a kit prop. To nest it in a group already modelled in metres, set its scale
// to 1 and its position in metres. The body is a column of the footprint (circle `radius`,
// or `width` × `depth`) up to the grains' lowest layer, tapering to `bottom` (radius at the base) for a bowl or a
// flowerpot; the top is `layers` jittered grids of grains, each layer half a cell off the one below.
// `cut` shows the inside: the same `{ normal, offset }` cutaway() takes, in WORLD space with all three components
// (the normal points INTO the removed half, offset in metres from `at`), so pass one object to both. The body stops at
// the plane (any plane, tilted or horizontal too: the solid is clipped and capped) and whole grains (not sliced ones, as
// loose grain really shows) line the face, so both are flagged `userData.cut = false` and the cutaway's clipping plane
// never touches them. Instead the fill follows the cutaway: cutaway() finds `group.userData.cutTo` and calls it with its
// plane on every frame (and once when it is made), so a rotated container, a slid cut (`set`) and an exterior shot
// (`off`: the whole fill, no face) match the wall. Without a cutaway, call `result.cutTo(plane)` (a world-space
// THREE.Plane keeping n·p <= c, as cutaway().plane) after placing the group, or `cutTo(null)` for the whole fill. The
// plane is read in the group's own frame at each call and the fill rebuilt only when it changed.
// A fill shallower than its grains (`height` under about 1.3 grain thicknesses) is one layer resting on the floor: no
// grain is ever below y = 0, so it stands a little above `height`.
// `instances: false` (sugar or sand in a wide shot, grains under ~3 px) builds the body alone: its texture is the
// grains. Above `max` grains the rest are dropped (`capped`, `counts` follow what is built) with a warning: shrink the
// area or drop the instances.
// A look that needs its own materials swaps `body.material` and `mesh.material` for its own; the shapes stay.

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

// Clip a closed convex solid (non-indexed triangles, outward winding) to the half-space nl·p <= c and close it with a
// flat cap at the plane. nl null (or c = Infinity) leaves it whole. Flat normals, like the extrusion it clips.
function clipSolid(src, nl, c) {
  const P = src.attributes.position.array, tris = [], ring = [], d = (p) => (nl ? nl.x * p[0] + nl.y * p[1] + nl.z * p[2] - c : -1);
  const emit = (poly) => { for (let i = 1; i < poly.length - 1; i++) tris.push(poly[0], poly[i], poly[i + 1]); };
  for (let i = 0; i < P.length; i += 9) {
    const v = [[P[i], P[i + 1], P[i + 2]], [P[i + 3], P[i + 4], P[i + 5]], [P[i + 6], P[i + 7], P[i + 8]]], poly = [];
    for (let j = 0; j < 3; j++) {
      const a = v[j], b = v[(j + 1) % 3], da = d(a), db = d(b);
      if (da <= 0) poly.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const u = da / (da - db); poly.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]); }
    }
    if (poly.length >= 3) { emit(poly); if (nl) for (const p of poly) if (Math.abs(d(p)) < 1e-9) ring.push(p); }
  }
  if (nl && ring.length >= 3) { // the cap: the section of a convex solid is a convex polygon, fanned from its centre
    const [th, tv] = planeBasis(nl), seen = new Set(), pts = [];
    for (const p of ring) { const key = p.map((x) => Math.round(x * 1e7)).join(); if (!seen.has(key)) { seen.add(key); pts.push(p); } }
    if (pts.length >= 3) {
      const ctr = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
      const ang = (p) => Math.atan2((p[0] - ctr[0]) * tv.x + (p[1] - ctr[1]) * tv.y + (p[2] - ctr[2]) * tv.z, (p[0] - ctr[0]) * th.x + (p[1] - ctr[1]) * th.y + (p[2] - ctr[2]) * th.z);
      pts.sort((a, b) => ang(a) - ang(b));
      for (let i = 0; i < pts.length; i++) tris.push(ctr, pts[i], pts[(i + 1) % pts.length]);
    }
  }
  const pos = new Float32Array(tris.length * 3), nor = new Float32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, e] = [tris[i], tris[i + 1], tris[i + 2]], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = e[0] - a[0], wy = e[1] - a[1], wz = e[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let j = 0; j < 3; j++) { pos.set(tris[i + j], (i + j) * 3); nor.set([nx, ny, nz], (i + j) * 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  return geo;
}

// Two unit vectors spanning the plane with normal nl: th horizontal (any, for a horizontal plane), tv = nl × th (up the
// slope; th × tv = nl, so a fan ordered by angle in (th, tv) faces along nl).
function planeBasis(nl) {
  const th = Math.hypot(nl.x, nl.z) > 1e-6 ? new THREE.Vector3(nl.z, 0, -nl.x).normalize() : new THREE.Vector3(1, 0, 0);
  return [th, new THREE.Vector3().crossVectors(nl, th)];
}

const positive = (v, name, min = 0, strict = false) => { if (!(Number.isFinite(v) && (strict ? v > min : v >= min))) throw new Error("grains: " + name + " must be a number " + (strict ? "above " : "of at least ") + min + ", got " + v); };

export function grains(k, { preset, at = new THREE.Vector3(), radius, width, depth, bottom, height = 0.05, layers = 2, jitter = 0.5, cut, instances = true, max = 40000, seed = 9, ...over } = {}) {
  const P = { ...presets[preset], ...over };
  if (!P.l || !P.t || !P.w || !P.colors) throw new Error("grains: a preset (" + Object.keys(presets).join(", ") + ") or l, t, w, shape and colors");
  const round = radius !== undefined, W = width ?? 2 * (radius ?? 0.05), D = depth ?? 2 * (radius ?? 0.05);
  if (!round && (width === undefined || depth === undefined)) throw new Error("grains: radius, or width and depth");
  if (round) positive(radius, "radius", 0, true); else { positive(width, "width", 0, true); positive(depth, "depth", 0, true); }
  if (bottom !== undefined) positive(bottom, "bottom");
  positive(height, "height"); positive(layers, "layers", 1); positive(jitter, "jitter"); positive(max, "max");
  const R0 = bottom ?? radius, rAt = (y, yb) => (round ? R0 + (radius - R0) * (yb > 0 ? Math.min(1, y / yb) : 0) : 0); // radius at height y
  const group = new THREE.Group();
  group.name = "grains";
  group.position.copy(at);
  group.scale.setScalar(1 / M);

  // The body's top; the top layer lands at `height`. A fill shallower than its grains has none: it is one layer of grains
  // resting on the floor (their lowest point, tilt and size included, never under y = 0).
  const yb = Math.max(0, instances ? height - P.t * (0.85 + 0.45 * (layers - 1)) : height);
  const jf = 1 + 0.15 * jitter, ss = P.shape === "stone" ? 1.15 : 1, tilt = jitter * 0.45;
  const floorTop = ss * jf * Math.hypot(P.t / 2, (Math.sin(tilt) * P.l) / 2, (Math.sin(tilt) * P.w) / 2), floorFace = (ss * jf * Math.max(P.l, P.t, P.w)) / 2; // a face grain turns freely

  // The whole body: the footprint extruded up to yb (tapered to `bottom`), clipped per cut in build().
  const bodyMat = surface(new THREE.MeshStandardMaterial({ color: P.colors[0], roughness: P.rough }), "grains", { size: P.w, long: P.l / P.w });
  let whole = null;
  if (yb > 0) {
    const poly = round ? Array.from({ length: 64 }, (_, i) => [radius * Math.cos((i / 64) * 2 * Math.PI), radius * Math.sin((i / 64) * 2 * Math.PI)]) : [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    whole = new THREE.ExtrudeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))), { depth: yb, bevelEnabled: false }).rotateX(-Math.PI / 2);
    if (round && R0 !== radius) {
      const pos = whole.attributes.position;
      for (let i = 0; i < pos.count; i++) { const f = rAt(pos.getY(i), yb) / radius; pos.setX(i, pos.getX(i) * f); pos.setZ(i, pos.getZ(i) * f); }
    }
  }

  const s = 0.92 * Math.sqrt(P.l * P.w), pj = 0.7 * jitter;
  const hx = round ? radius : W / 2, hz = round ? radius : D / 2;
  const inside = (x, z, y, yTop) => (round ? Math.hypot(x, z) <= rAt(y, yTop) - P.w / 2 : Math.abs(x) <= W / 2 - P.w / 2 && Math.abs(z) <= D / 2 - P.w / 2);
  const api = { group, body: null, mesh: null, counts: { top: 0, face: 0 }, capped: false, preset, cutTo };
  let gGeo = null, gMat = null, cutKey;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, "YXZ"), col = new THREE.Color(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), inv = new THREE.Matrix4();

  // One build for one cut: nl the unit normal of the removed half (the group's own frame, metres), c the plane's offset.
  function build(nl, c) {
    if (whole) {
      const geo = clipSolid(whole, nl, nl ? c - 0.2 * P.t : Infinity);
      if (!api.body) {
        api.body = new THREE.Mesh(geo, bodyMat);
        api.body.name = "grains-body";
        api.body.castShadow = api.body.receiveShadow = true;
        api.body.userData.cut = false; // the fill follows the cutaway through cutTo(), never a clipping plane
        group.add(api.body);
      } else { api.body.geometry.dispose(); api.body.geometry = geo; }
      api.body.visible = geo.attributes.position.count > 0;
    }
    const list = [];
    let n = 0, top = 0, face = 0;
    if (instances) {
      const rnd = () => tone(n++, seed), pose = (x, y, z, rx, ry, rz) => list.push([x, y, z, rx, ry, rz, 1 + jitter * 0.3 * (rnd() - 0.5)]);
      for (let i = 0; i < layers; i++) {
        const y = Math.max(yb + P.t * (0.35 + 0.45 * i), floorTop + 0.45 * P.t * i);
        for (let x0 = -hx + (i * s) / 2; x0 < hx; x0 += s) for (let z0 = -hz + (i * s) / 2; z0 < hz; z0 += s) {
          const x = x0 + s / 2 + (rnd() - 0.5) * 2 * pj * s, z = z0 + s / 2 + (rnd() - 0.5) * 2 * pj * s;
          if (!inside(x, z, yb, yb) || (nl && nl.x * x + nl.y * y + nl.z * z > c - 0.3 * P.w)) continue;
          pose(x, y, z, (rnd() - 0.5) * 2 * tilt, rnd() * 2 * Math.PI, (rnd() - 0.5) * 2 * tilt);
        }
      }
      top = list.length;
      if (nl && yb >= floorFace) { // whole grains lie on the plane, over the container's extent along it
        const [th, tv] = planeBasis(nl), k0 = c - 0.35 * P.t, upright = Math.abs(nl.y) < 1e-6;
        let u0m = Infinity, u1m = -Infinity, v0m = Infinity, v1m = -Infinity;
        for (const x of [-hx, hx]) for (const y of [0, yb]) for (const z of [-hz, hz]) {
          const u = x * th.x + y * th.y + z * th.z, v = x * tv.x + y * tv.y + z * tv.z;
          u0m = Math.min(u0m, u); u1m = Math.max(u1m, u); v0m = Math.min(v0m, v); v1m = Math.max(v1m, v);
        }
        for (let v0 = v0m + P.t / 2; v0 < v1m; v0 += 0.8 * s) for (let u0 = u0m; u0 < u1m; u0 += s) {
          const u = u0 + s / 2 + (rnd() - 0.5) * 0.6 * s, v = v0 + (rnd() - 0.5) * 0.6 * s;
          const x = nl.x * k0 + th.x * u + tv.x * v, z = nl.z * k0 + th.z * u + tv.z * v;
          let y = nl.y * k0 + th.y * u + tv.y * v;
          if (upright) y = Math.min(yb, Math.max(floorFace, y)); // a vertical plane: v is height, keep the row inside the fill
          else if (y < floorFace || y > yb) continue;
          if (!inside(x, z, y, yb)) continue;
          pose(x, y, z, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI, rnd() * 2 * Math.PI);
        }
        face = list.length - top;
      }
    }
    let capped = false;
    if (list.length > max) {
      if (!api.capped) console.warn("grains: " + list.length + " grains of " + (preset || "this size") + " is past the cap of " + max + "; kept the first " + max + ". Use instances: false, or a smaller area.");
      list.length = max; capped = true;
      top = Math.min(top, max); face = list.length - top;
    }
    api.capped = capped; api.counts.top = top; api.counts.face = face;

    if (list.length && !api.mesh) {
      gGeo = grainGeometry(P, seed);
      gMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: P.rough });
      api.mesh = new THREE.InstancedMesh(gGeo, gMat, list.length);
      api.mesh.name = "grains-mesh";
      api.mesh.castShadow = api.mesh.receiveShadow = true;
      api.mesh.userData.cut = false;
      group.add(api.mesh);
    }
    const mesh = api.mesh;
    if (!mesh) return;
    if (list.length > mesh.instanceMatrix.count) { // a cut taken away needs room for the whole top
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 16), 16);
      mesh.instanceColor = null;
    }
    mesh.count = list.length;
    mesh.visible = list.length > 0;
    list.forEach(([x, y, z, rx, ry, rz, sc], i) => {
      e.set(rx, ry, rz); q.setFromEuler(e);
      mesh.setMatrixAt(i, m4.compose(pv.set(x, y, z), q, sv.set(sc, sc, sc)));
      mesh.setColorAt(i, col.set(P.colors[Math.floor(tone(n++, seed) * P.colors.length)]).multiplyScalar(0.9 + 0.2 * tone(n++, seed)));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.boundingSphere = null; mesh.boundingBox = null; // the grains moved: the culling bounds are recomputed
  }

  // cutTo(plane | null): the fill follows a cutaway. `plane` is a THREE.Plane in WORLD space keeping the half n·p <= c
  // (cutaway().plane is one; normal = -n); null is the whole fill. It is read in the group's own frame on every call, so a
  // rotated or moved container cuts the fill exactly where it cuts the wall. Rebuilds only when the plane changed.
  function cutTo(plane) {
    let nl = null, c = 0, key = "whole";
    if (plane) {
      group.updateWorldMatrix(true, false);
      const lp = plane.clone().applyMatrix4(inv.copy(group.matrixWorld).invert());
      nl = lp.normal.clone().negate().normalize(); c = lp.constant;
      key = [nl.x, nl.y, nl.z, c].map((x) => Math.round(x * 1e6)).join();
    }
    if (key === cutKey) return api;
    cutKey = key;
    build(nl, c);
    return api;
  }
  group.userData.cutTo = cutTo; // cutaway() calls it on every frame for any fill under its root

  let first = null; // `cut`: { normal, offset } in world space, as cutaway() takes it (offset in metres from `at`)
  if (cut) {
    const nw = cut.normal ? new THREE.Vector3(cut.normal.x ?? 0, cut.normal.y ?? 0, cut.normal.z ?? 0) : new THREE.Vector3(0, 0, 1);
    if (!(nw.length() > 0) || !Number.isFinite(nw.length())) throw new Error("grains: cut.normal must be a non-zero vector");
    nw.normalize();
    group.updateWorldMatrix(true, false);
    first = new THREE.Plane(nw.clone().negate(), nw.dot(group.getWorldPosition(new THREE.Vector3())) + (cut.offset ?? 0) / M);
  }
  cutTo(first);
  return api;
}
