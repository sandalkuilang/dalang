import { THREE, GLTFLoader, DRACOLoader, OBJLoader, RoundedBoxGeometry, toCreasedNormals, LoopSubdivision } from "./three-vendor.js";
import { surface } from "./surfaces.js";

export const deg = Math.PI / 180;
export const tone = (k, s) => { const x = Math.sin(k * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); }; // seeded
// The set's real scale, set by makeKit({ mpu }): metres per scene unit, measured from things of known size (a desk
// top 0.75 m, a door 2.03 m; kit models are rarely 1 unit = 1 m). G is gravity in scene units/s². Every module reads
// these live: motion in real units, new props modelled in metres and scaled by 1/M.
export let M = 1, G = 9.81;

// A model's materials are dressed by name: `palette` maps a name to a colour ("*" for any name it lacks; without
// one a material keeps its own colour), `kinds` maps names to surfaces (cloth weave with sheen, the kit's wood
// grain, the wall's plaster, lit lamp shades, glass; soft: meshes subdivided). Nothing is assumed: a set passes its kit's
// preset (examples/interior.js: the CC0 furniture kits) or its own maps.

// The set's building blocks: models dressed by `palette` and `kinds`, rounded boxes, cylinders, canvas textures,
// placement. mpu: metres per unit; wear: the brief's condition (0 lived-in or new, 1 worn: flaking paint, grime);
// grain: the surface kind for `kinds.wood` ("wood" or "bamboo"); gravity: the place's, m/s² (9.81 on Earth, 1.62 on
// the Moon, 0 in orbit; at molecular scale it is negligible and fields and diffusion drive the motion).
export function makeKit(scene, { mpu = 1, floor = 0, wear = 0, palette = {}, kinds = {}, grain = "wood", gravity = 9.81 } = {}) { // floor: its height, in units
  const is = (re, name) => !!re && re.test(name);
  M = mpu; G = gravity / mpu;
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff4e4, emissive: 0xffdcae, emissiveIntensity: 1.9, roughness: 0.6 }); // a lit shade at 2700 K reads warm white; a saturated orange blooms toward pink
  // A look is the maps a model is dressed by and the materials built from them (shared by name, so a set's parts
  // match). The kit has one; a found model may bring its own (model(path, { palette, kinds })), which never leaks
  // into the kit's.
  const base = { palette, kinds, shared: {} };
  function tune(m, { palette, kinds, shared }) {
    if (is(kinds.glow, m.name)) return glow;
    if (is(kinds.glass, m.name)) return new THREE.MeshStandardMaterial({ color: 0xd4e6e4, transparent: true, opacity: 0.25, roughness: 0.05 });
    const key = palette[m.name] !== undefined ? m.name : m.name.replace(/\.\d+$/, "");
    let c = palette[key] ?? palette["*"];
    if (c === undefined && !["cloth", "wood", "wall"].some((n) => is(kinds[n], key))) return m; // a model's own material, as it came
    if (!shared[key]) {
      if (c === undefined) c = m.color ? m.color.getHex() : 0xffffff;
      if (is(kinds.cloth, key)) shared[key] = cloth(c);
      else if (is(kinds.wood, key)) shared[key] = surface(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }), grain);
      else if (is(kinds.wall, key)) shared[key] = surface(new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }), "plaster", { world: true, wear, floor }); // the walls
      else shared[key] = surface(new THREE.MeshStandardMaterial({ color: c, roughness: 0.62, metalness: is(kinds.metal, key) ? 0.3 : 0 }), "micro");
      shared[key].name = key;
    }
    return shared[key];
  }
  // Kit models are low-poly: faceted curves read as toy blocks. Soft and organic things (upholstery, cushions,
  // leaves) get two Loop subdivisions, coplanar faces split first so they stay flat: a sofa turns plump, a leaf
  // curved. Hard furniture keeps its crisp corners (a Loop pass melts a desk into clay); round hard things
  // (pots, vases) take one pass. smooth: the passes, by default from the materials.
  function dress(g, s, smooth, crease = true, look = base) {
    g.traverse((o) => {
      if (!o.isMesh) return;
      const n = smooth ?? ([].concat(o.material).every((m) => is(look.kinds.soft, m.name)) ? 2 : 0);
      if (n) o.geometry = LoopSubdivision.modify(o.geometry, n, { split: true, maxTriangles: 40000 });
      if (n || crease) o.geometry = toCreasedNormals(o.geometry, (n ? 60 : 32) * deg); // soft shading on bevels, crisp on real corners (crease: false keeps a detailed model's own normals)
      o.material = Array.isArray(o.material) ? o.material.map((m) => tune(m, look)) : tune(o.material, look);
      o.castShadow = o.receiveShadow = !(o.material.transparent); // glass lets the sun through
    });
    if (s) g.scale.multiplyScalar(s);
    return g;
  }
  // Draco-compressed glTF (a museum scan, a CC0 scan library) decodes with the wasm decoder build.mjs copies to draco/;
  // a worker starts only when a model carries KHR_draco_mesh_compression.
  const draco = new DRACOLoader().setDecoderPath(new URL("./draco/", import.meta.url).href); // wasm unless the browser has none
  const gltf = new GLTFLoader().setDRACOLoader(draco), obj = new OBJLoader(), cache = {}, resting = [];
  // rest(o): o stands on whatever is under it. settle() then drops every resting object onto the real surface
  // under it, as gravity would from any height (a ball dropped in a bin lands on its bottom), lowest first so supports land before what they carry.
  // Placement by hand-typed heights left props floating or sunk by millimetres; this makes contact exact.
  // foot: the part that touches the support when it is not the lowest part (a pot whose vines hang below its shelf).
  const rest = (o, name, foot) => { if (name) o.name = name; if (foot) o.userData.foot = foot; resting.push(o); return o; };
  function settle(skip = []) {
    const rc = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), misses = [];
    const box = (o) => new THREE.Box3().setFromObject(o.userData.foot || o, true); // from the vertices
    const rootOf = (x) => { while (x.parent && x.parent !== scene) x = x.parent; return x; };
    const solid = (h) => h.object.visible && !h.object.material.transparent && !h.object.material.isShadowMaterial;
    const bottoms = new Map(), minY = (r) => (bottoms.has(r) ? bottoms.get(r) : bottoms.set(r, new THREE.Box3().setFromObject(r, true).min.y).get(r));
    resting.filter((o) => !skip.includes(o)).map((o) => ({ o, y: box(o).min.y })).sort((a, b) => a.y - b.y).forEach(({ o }) => {
      scene.updateMatrixWorld(true);
      const b = box(o), own = new Set(), part = [];
      o.traverse((x) => own.add(x));
      (o.userData.foot || o).traverse((x) => x.isMesh && part.push(x));
      const below = (x) => minY(rootOf(x)) < b.min.y - 0.001 / M; // only what is lower can carry it (tolerances in metres / M)
      // Its lowest points, the lowest vertex in each cell of a 6 × 6 grid over its footprint (a leg, a corner, a seam:
      // wherever it can touch), each tested against the surface under it. It drops by the smallest gap, so it lands
      // on its first point of contact as a rigid thing does (a leaning cushion on a back or a seat, a desk on its
      // legs); a point below a surface means it was placed into it, and it lifts out by the deepest one.
      const low = new Map(), v = new THREE.Vector3(), cell = (a, lo, hi) => Math.min(5, Math.max(0, Math.floor(((a - lo) / (hi - lo || 1)) * 6)));
      part.forEach((m) => { const p = m.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 6000)); for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); const key = cell(v.x, b.min.x, b.max.x) * 6 + cell(v.z, b.min.z, b.max.z); if (!low.has(key) || v.y < low.get(key).y) low.set(key, v.clone()); } });
      let drop = Infinity, lift = 0, any = null;
      for (const q of low.values()) {
        rc.set(new THREE.Vector3(q.x, b.max.y + 0.02 / M, q.z), down);
        for (const h of rc.intersectObjects(scene.children, true)) {
          if (own.has(h.object) || !solid(h) || !below(h.object)) continue;
          if (h.point.y > q.y + 0.0004 / M) { lift = Math.max(lift, h.point.y - q.y); any = h; break; } // a surface above this point: sunk
          drop = Math.min(drop, q.y - h.point.y); break; // the first surface under it
        }
      }
      bottoms.delete(o);
      if (lift > 0 && lift <= 0.03 / M) o.position.y += lift; // lifts out of a surface up to 3 cm (a typed height a little low); deeper is reported
      else if (lift > 0.03 / M) misses.push((o.name || o.type) + ` (placed ${(lift * M * 1000).toFixed(0)} mm inside ${rootOf(any ? any.object : o).name || "something"})`);
      else if (drop < Infinity) o.position.y -= drop; // falls any distance, as gravity would
      else misses.push((o.name || o.type) + " (nothing below)");
    });
    scene.updateMatrixWorld(true);
    return misses;
  }
  // group(name, ...meshes): parts of one prop become one object, so it rests and is audited as a whole.
  function group(name, ...parts) { const g = new THREE.Group(); g.name = name; scene.add(g); parts.forEach((p) => g.attach(p)); return g; }
  async function load(path) {
    if (!cache[path]) cache[path] = /\.obj$/.test(path) ? obj.loadAsync(path) : gltf.loadAsync(path).then((r) => r.scene);
    return (await cache[path]).clone(true);
  }
  function footprint(g, cx, y, cz) {
    const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3());
    g.position.set(cx - c.x, y - b.min.y, cz - c.z);
    scene.add(g);
    return g;
  }
  // model(path, opts): a kit model (.glb or .obj), dressed. at: "origin" places it by its own origin (Kenney),
  // "footprint" by the centre of its footprint (Quaternius); x, y, z, ry, scale; smooth: Loop passes (default from
  // the materials); crease: false keeps the model's own normals (a detailed PBR scan); rest: false for things that are not set down (walls). Every model is rested by default.
  // palette, kinds: this model's own look, merged over the kit's (a found model's material names are its author's, not
  // the set's). real: { h, w, d } in metres, the size its source states (find_media prints it); scaleAudit then checks
  // the box against it, and a model with none is listed unchecked, never passed.
  async function model(path, { x = 0, y = 0, z = 0, ry = 0, scale, smooth, crease, at = "origin", rest: r = true, palette: P, kinds: Kd, real } = {}) {
    const look = P || Kd ? { palette: { ...palette, ...P }, kinds: { ...kinds, ...Kd }, shared: {} } : base;
    const g = dress(await load(path), scale, smooth, crease, look);
    g.name = path.split("/").pop().replace(/\.\w+$/, "");
    if (real) g.userData.real = real;
    if (r) resting.push(g);
    g.rotation.y = ry;
    if (at === "footprint") return footprint(g, x, y, z);
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  }
  function paint(g, map) {
    g.traverse((o) => {
      if (!o.isMesh) return;
      o.material = (Array.isArray(o.material) ? o.material : [o.material]).map((m) => {
        if (map[m.name] === undefined) return m;
        const c = m.clone();
        c.color.set(map[m.name]);
        if (c.sheenColor) c.sheenColor.copy(c.color).lerp(new THREE.Color(0xffffff), 0.35);
        Object.assign(c, { onBeforeCompile: m.onBeforeCompile, customProgramCacheKey: m.customProgramCacheKey }); // clone() drops the surface
        return c;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    return g;
  }
  const mat = (hex, r) => surface(new THREE.MeshStandardMaterial({ color: hex, roughness: r || 0.65 }), "micro");
  // Cloth: a woven surface with sheen, the soft bright rim real fabric has at grazing angles.
  function cloth(hex, kind = "fabric", r = 0.9, map) { // map: a woven pattern (plaid, stripes) on the cloth's own uv
    const c = new THREE.Color(hex), m = new THREE.MeshPhysicalMaterial({ map, color: c, roughness: r, sheen: 1, sheenRoughness: 0.55, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.35) });
    return surface(m, kind);
  }
  function put(o, x, y, z, parent) {
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    (parent || scene).add(o);
    return o;
  }
  const box = (w, h, d, m, x, y, z, parent) => put(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, Math.min(w, h, d) * 0.3), m), x, y, z, parent);
  function cyl(r, h, m, x, y, z, rx, rz, r2) {
    const o = put(new THREE.Mesh(new THREE.CylinderGeometry(r, r2 === undefined ? r : r2, h, 64), m), x, y, z);
    if (rx) o.rotation.x = rx;
    if (rz) o.rotation.z = rz;
    return o;
  }
  function canvasTex(w, h, draw, srgb) {
    if (typeof document === "undefined") return new THREE.Texture(); // headless (node checks): no canvas
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    draw(cv.getContext("2d"));
    const t = new THREE.CanvasTexture(cv);
    if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  // A display on a kit model: the picture laid exactly on the model's own screen face (found by its material) a
  // hair in front of it, so it never floats beside or in front of the bezel. Returns the frame on that face.
  function screenOn(model, matName, material) {
    model.updateMatrixWorld(true);
    let face;
    model.traverse((o) => { if (o.isMesh && [].concat(o.material).some((m) => m.name === matName)) face = o; });
    const p = face.geometry.attributes.position, pts = [];
    for (let i = 0; i < p.count; i++) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(face.matrixWorld));
    const n = new THREE.Vector3().fromBufferAttribute(face.geometry.attributes.normal, 0).transformDirection(face.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).projectOnPlane(n).normalize(), right = new THREE.Vector3().crossVectors(up, n);
    let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
    pts.forEach((q) => { const d = q.clone().sub(pts[0]); r0 = Math.min(r0, d.dot(right)); r1 = Math.max(r1, d.dot(right)); u0 = Math.min(u0, d.dot(up)); u1 = Math.max(u1, d.dot(up)); });
    const w = r1 - r0, h = u1 - u0, at = pts[0].clone().addScaledVector(right, (r0 + r1) / 2).addScaledVector(up, (u0 + u1) / 2);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    plane.position.copy(at).addScaledVector(n, 0.0008);
    scene.add(plane);
    model.attach(plane); // part of the device: it moves and is checked with it
    return { plane, w, h, at, right, up, n };
  }
  // A cable along points; floor (a height) flattens it where it lies, so the curve never dips through the floor.
  function tube(pts, r, m, floor) {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), 64, r, 6), p = g.attributes.position;
    if (floor !== undefined) { for (let i = 0; i < p.count; i++) if (p.getY(i) < floor) p.setY(i, floor); g.computeVertexNormals(); }
    return put(new THREE.Mesh(g, m), 0, 0, 0);
  }
  return { scene, glow, mat, cloth, surface, screenOn, box, cyl, put, tube, canvasTex, model, paint, rest, settle, group, V: (x, y, z) => new THREE.Vector3(x, y, z) };
}
