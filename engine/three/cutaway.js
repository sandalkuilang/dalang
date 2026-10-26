import { THREE, mergeVertices } from "./three-vendor.js";
import { M } from "./kit.js";

// A section view: an assembly cut open by one plane, so its inside shows (an engine cylinder, a lock, a gearbox, a
// heart valve, a water heater, a pen). Every shot of this kind needs the same four things, and the usual hand-made
// versions each break one of them:
//  - the plane cuts EVERY part, the ones added later too (a lid built after the cut that stays whole overhangs the
//    cut body and reads as a second lid): cutaway() clips every material under `root` and watches the root for new
//    children;
//  - the cut faces are closed with a cap, drawn at the plane. A cap lying exactly on a face under it z-fights into
//    streaks, so every cap is one flat quad on ONE transform (equal depths) pulled ahead by polygonOffset, and a
//    cap never meets another cap's depth;
//  - a hollow part shows its wall, not a disc: a single-surface part (sheet metal, a moulded shell, a thin casing)
//    is flagged `userData.cut = { shell: metres }` and its cap is the ring of that thickness. A part modelled with
//    its inner and outer wall is already a closed solid and needs no flag;
//  - the exterior shot and the section shot are the same set: on(t), off(t) and set(offset, t) switch or slide the
//    cut by time.
// Visual only: colliders and the audit see the whole assembly (pass cut.group in the `exclude` of staticScene).
//
// A part is a closed mesh (the stencil counts its front and back faces); an open one is flagged `shell`. A part that
// must stay whole (a label, a hand reaching in) is `userData.cut = false` (listed in `uncut`). A part that cuts itself
// (a granular fill, grains.js) is `cut = false` with `userData.cutTo(plane | null)`: cutaway() calls it with its plane on
// every frame (null when off) and when it is made, so the part follows on(), off(), set() and a moved root. Instanced, skinned and
// fur meshes are cut but get no cap (`nocap`), as does an all-transparent part. Flags go on before the part is added.
// The renderer needs a stencil buffer: new THREE.WebGLRenderer({ stencil: true }) and EffectComposer(renderer,
// { stencilBuffer: true }); ready(renderer) turns clipping on and fails loudly without it (the caps would vanish).

// A single-surface part made a closed wall d thick (local units) for the stencil count: its surface, the same
// surface moved d inward along its normals with the winding reversed, and a rim joining the two along every open
// edge. A closed, consistently wound wall, so the cap at the cut is the wall's ring, not a disc.
export function thicken(geometry, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", geometry.attributes.position.clone());
  if (geometry.index) g.setIndex(geometry.index.clone());
  const m = mergeVertices(g, d * 1e-2); // positions only, so a lathe's seam and pole merge
  m.computeVertexNormals();
  const p = m.attributes.position.array, nn = m.attributes.normal.array, k = m.attributes.position.count, idx = m.index.array;
  const pos = new Float32Array(k * 6);
  for (let i = 0; i < k * 3; i++) { pos[i] = p[i]; pos[k * 3 + i] = p[i] - nn[i] * d; }
  const tri = [], edges = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    if (a === b || b === c || a === c) continue; // collapsed at a pole
    tri.push(a, b, c, k + a, k + c, k + b);
    for (const [u, v] of [[a, b], [b, c], [c, a]]) edges.set(u + "," + v, [u, v]);
  }
  for (const [u, v] of edges.values()) if (!edges.has(v + "," + u)) tri.push(v, u, k + u, v, k + u, k + v); // open edge: rim
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setIndex(tri);
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

// A diagonal hatch, drawn into a data texture (no canvas, so it also exists headless).
function hatchTexture() {
  const n = 16, data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = (x + y) % n < 2 ? 70 : 255, i = (y * n + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const smooth = (u) => u * u * (3 - 2 * u);

// cutaway(root, { normal, offset, color, hatch }): normal (world) points INTO the removed half, toward the camera that
// looks into the section (default +z); offset: metres along it from root's world origin (0 cuts through the origin);
// color: a flat tint for every cap (else each part's own colour, darkened); hatch: metres per tile of diagonal lines
// on the caps (off by default). Returns { plane, group, parts, uncut, nocap, add, set, on, off, at, ready }.
export function cutaway(root, { normal = new THREE.Vector3(0, 0, 1), offset = 0, color, hatch } = {}) {
  const n = normal.clone().normalize(), plane = new THREE.Plane(n.clone().negate(), 0); // keeps n·p <= constant
  const group = new THREE.Group(); // the caps and their stencils; never under `root`, so its size and physics stay the assembly's
  group.name = "cutaway"; group.userData.cutaway = true;
  const parts = [], uncut = [], nocap = [], seen = new Set(), watched = new WeakSet(), clones = new WeakSet(), made = new Map(), followers = new Set();
  const capGeo = new THREE.PlaneGeometry(1, 1), capM = new THREE.Matrix4(), tex = hatch ? hatchTexture() : null;
  const quiet = (o) => { o.raycast = () => {}; o.castShadow = o.receiveShadow = false; o.visible = false; o.matrixAutoUpdate = false; o.matrixWorldAutoUpdate = false; o.frustumCulled = false; o.userData.cutaway = true; group.add(o); return o; };
  const keysOffset = [{ t: 0, v: offset }], keysOn = [];

  // The plane goes on a clone of each material: kit materials are shared by name across models, and one set on the
  // original would cut things outside the root. Shell parts show their inside through the cut, so they get a
  // double-sided clone. Off never swaps the planes (their count is part of the shader's key: a swap recompiles
  // mid-shot); it moves the plane far away instead.
  // The render draws the clone, so a set that keeps editing its own reference (a glowing element, a fade, a colour
  // change, a map swap) would see nothing: at() carries every property the original changed since the last frame to
  // the clone (sync), and a ShaderMaterial's uniforms are the original's own object, so its updates land at once. An
  // edit made on mesh.material (the clone) is kept until the original changes that property. Custom keys (a preset an
  // onBeforeCompile hook reads), which clone() does not copy, are carried from the start.
  // put() is the ONLY write onto a clone's key, and it never writes INTO the object the key holds: that object may be
  // the set's own (a texture, a preset colour), shared with materials outside the root. A value object (colour, vector)
  // becomes the clone's own fresh copy; anything else (a texture) is pointed at by reference.
  const pairs = [];
  const skip = new Set(["uuid", "id", "type", "name", "userData", "version", "clippingPlanes", "clipShadows", "onBeforeCompile", "customProgramCacheKey", "uniforms", "uniformsGroups"]);
  const sig = (v) => (v && v.isColor ? v.getHex() : v && typeof v.toArray === "function" ? v.toArray().join() : v);
  const value = (o) => !!o && (o.isColor || o.isVector2 || o.isVector3 || o.isVector4 || o.isEuler || o.isMatrix3 || o.isMatrix4 || o.isQuaternion);
  const put = (clone, k, v) => { clone[k] = value(v) ? v.clone() : v; };
  const props = (m) => Object.keys(m).filter((k) => k[0] !== "_" && !skip.has(k)).concat("alphaTest");
  const snapshot = (m) => { const s = {}; for (const k of props(m)) s[k] = sig(m[k]); return s; };
  const sync = (pr) => {
    const { orig, clone, snap } = pr;
    for (const k of props(orig)) {
      const v = orig[k], g = sig(v);
      if (snap[k] === g) continue;
      snap[k] = g;
      if (k === "side" && pr.both) continue; // a shell part's clone is double-sided
      put(clone, k, v);
    }
    if (orig.version !== pr.version) { pr.version = orig.version; clone.needsUpdate = true; }
  };
  const clip = (m, both) => {
    if (clones.has(m)) return m;
    const key = both && m.side !== THREE.DoubleSide ? "two" : "one";
    if (!made.has(m)) made.set(m, {});
    const mine = made.get(m);
    if (!mine[key]) {
      const c = m.clone();
      Object.assign(c, { onBeforeCompile: m.onBeforeCompile, customProgramCacheKey: m.customProgramCacheKey, clippingPlanes: [...(m.clippingPlanes || []), plane], clipShadows: true }); // clone() drops the surface
      if (m.uniforms) c.uniforms = m.uniforms; // clone() deep-copies them, which would cut the set's updates off
      for (const k of props(m)) if (!(k in c)) put(c, k, m[k]); // custom keys
      if (key === "two") c.side = THREE.DoubleSide;
      clones.add(c);
      pairs.push({ orig: m, clone: c, snap: snapshot(m), version: m.version, both: key === "two" });
      mine[key] = c;
    }
    return mine[key];
  };
  const mats = (o) => [].concat(o.material);

  function take(o) {
    if (typeof o.userData.cutTo === "function") followers.add(o); // a part that cuts itself, rebuilt per plane (grains())
    if (!o.material || o.userData.cutaway) return;
    if (o.userData.cut === false) { if (!uncut.includes(o)) uncut.push(o); return; }
    const shell = o.userData.cut?.shell || 0;
    o.material = Array.isArray(o.material) ? o.material.map((m) => clip(m, shell)) : clip(o.material, shell);
    if (seen.has(o)) return;
    seen.add(o);
    if (!o.isMesh) return;
    if (o.isInstancedMesh || o.isSkinnedMesh || o.userData.fur || mats(o).every((m) => m.transparent)) { nocap.push(o); return; }
    o.updateWorldMatrix(true, false);
    const s = o.matrixWorld.getMaxScaleOnAxis() || 1, geo = shell ? thicken(o.geometry, (shell / M) / s) : o.geometry, order = 10000 + 2 * parts.length; // thickness: metres → the mesh's local units
    const stencil = (side, op) => quiet(Object.assign(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, side, clippingPlanes: [plane], stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilFail: op, stencilZFail: op, stencilZPass: op })), { renderOrder: order }));
    const own = color === undefined && !!mats(o)[0].color, tint = color !== undefined ? new THREE.Color(color) : own ? mats(o)[0].color.clone().multiplyScalar(0.8) : new THREE.Color(0x888888);
    const cap = quiet(new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: tint, map: tex, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4, depthFunc: THREE.LessEqualDepth, stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp })));
    cap.renderOrder = order + 1;
    cap.onAfterRender = (renderer) => renderer.clearStencil(); // each part is counted alone
    parts.push({ mesh: o, stencil: geo, shell, own, back: stencil(THREE.BackSide, THREE.IncrementWrapStencilOp), front: stencil(THREE.FrontSide, THREE.DecrementWrapStencilOp), cap });
  }
  // Every object under `o` is cut, and watched: a child added later to any of them is adopted at once.
  function adopt(o) {
    if (o === group || o.userData.cutaway) return;
    if (!watched.has(o)) { watched.add(o); o.addEventListener("childadded", (e) => adopt(e.child)); }
    take(o);
    o.children.slice().forEach(adopt);
  }
  adopt(root);

  const under = (o) => { for (let x = o; x; x = x.parent) { if (!x.visible) return false; if (x === root) return true; } return false; };
  const stateAt = (t) => {
    if (!keysOn.length) return true;
    let on = !keysOn[0].on;
    for (const k of keysOn) if (k.t <= t) on = k.on;
    return on;
  };
  const offsetAt = (t) => {
    const k = keysOffset;
    if (t <= k[0].t) return k[0].v;
    for (let i = 1; i < k.length; i++) if (t <= k[i].t) return k[i - 1].v + (k[i].v - k[i - 1].v) * smooth((t - k[i - 1].t) / (k[i].t - k[i - 1].t));
    return k.at(-1).v;
  };
  const key = (list, k) => { const i = list.findIndex((x) => x.t === k.t); if (i >= 0) list[i] = k; else list.push(k); list.sort((a, b) => a.t - b.t); };
  const box = new THREE.Box3(), tmp = new THREE.Box3(), sphere = new THREE.Sphere(), ce = new THREE.Vector3(), origin = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 1), gi = new THREE.Matrix4();

  root.updateWorldMatrix(true, false);
  plane.constant = n.dot(root.getWorldPosition(origin)) + offset / M; // right from the first frame, before the first at()
  const follow = (on) => { for (const f of followers) if (under(f)) f.userData.cutTo(on ? plane : null); };
  follow(true);
  const api = {
    plane, group, parts, uncut, nocap,
    // set(offset, t): the cut slides to `offset` (metres) at t, easing from the key before it; it holds after the last
    // key (add a key to hold a position). The offset given to cutaway() is the key at t = 0.
    set(off, t = 0) { key(keysOffset, { t, v: off }); return api; },
    on(t = 0) { key(keysOn, { t, on: true }); return api; },
    off(t = 0) { key(keysOn, { t, on: false }); return api; },
    // add(part, { parent, shell, cut }): the way a set adds a part after the cut; flags it (shell: metres, cut: false)
    // and adds it to `parent` (default the root).
    add(part, { parent = root, shell, cut } = {}) {
      part.traverse((o) => { if (shell !== undefined && o.isMesh) o.userData.cut = { shell }; if (cut === false) o.userData.cut = false; });
      parent.add(part);
      adopt(part);
      return part;
    },
    // at(t): once per frame, after everything is posed and before the render.
    at(t) {
      // The group sits beside the root under the scene's top ancestor, never under the root: a root with no parent yet
      // has no place for it (the group waits), and a root moved to another scene takes it along. A root that is a
      // scene is its own top.
      let top = root; while (top.parent) top = top.parent;
      if (top === root && !root.isScene) group.removeFromParent(); else if (group.parent !== top) top.add(group);
      adopt(root);
      for (const pr of pairs) sync(pr);
      root.updateWorldMatrix(true, true);
      group.updateWorldMatrix(true, false);
      const on = stateAt(t), c = n.dot(root.getWorldPosition(origin)) + offsetAt(t) / M;
      plane.constant = on ? c : 1e9;
      follow(on);
      box.makeEmpty();
      for (const p of parts) if (under(p.mesh)) { if (!p.mesh.geometry.boundingBox) p.mesh.geometry.computeBoundingBox(); box.union(tmp.copy(p.mesh.geometry.boundingBox).applyMatrix4(p.mesh.matrixWorld)); }
      const r = box.isEmpty() ? 1 : box.getBoundingSphere(sphere).radius, span = 2.2 * r;
      box.getCenter(ce);
      capM.compose(ce.addScaledVector(n, c - n.dot(ce)), new THREE.Quaternion().setFromUnitVectors(z, n), new THREE.Vector3(span, span, 1));
      if (tex) tex.repeat.set(span * M / hatch, span * M / hatch);
      gi.copy(group.matrixWorld).invert();
      const place = (o, W) => { o.matrixWorld.copy(W); o.matrix.copy(gi).multiply(W); };
      for (const p of parts) {
        const show = on && under(p.mesh);
        p.back.visible = p.front.visible = p.cap.visible = show;
        if (!show) continue;
        const c0 = mats(p.mesh)[0].color;
        if (p.own && c0) p.cap.material.color.copy(c0).multiplyScalar(0.8); // the cap follows the part's colour
        place(p.back, p.mesh.matrixWorld); place(p.front, p.mesh.matrixWorld); place(p.cap, capM);
      }
    },
    // ready(renderer): turns on the clipping the planes need and checks the stencil buffer the caps need.
    ready(renderer) {
      renderer.localClippingEnabled = true;
      if (!renderer.getContext().getContextAttributes()?.stencil) throw new Error("cutaway: the renderer has no stencil buffer: new THREE.WebGLRenderer({ stencil: true }), and EffectComposer(renderer, { stencilBuffer: true })");
      return api;
    },
  };
  return api;
}
