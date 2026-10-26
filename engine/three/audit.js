// audit.js — two checks on a built set, in metres at any scale (kit.js M). Neither moves anything.
//  - scaleAudit(root): a prop declares its real size in userData.real = { h, w, d } (metres, from the model's source or a
//    cited size; h = world Y, w = world X, d = world Z: a prop turned about Y swaps w and d, so declare h or both).
//    Off by more than tol -> reported. No declared size, at any depth in the tree -> "unchecked", never passed.
//  - zFight(root, { cameras }): coplanar-ish faces of two meshes closer than the depth buffer can tell apart at the
//    camera depth z-fight. Depth step (m) = z² (far - near) / (far · near · 2^bits), a lower bound: a gap a few steps
//    wide can still fight on a real GPU.
import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

const AXIS = { w: "x", h: "y", d: "z" };
const label = (o) => o.name || (o.parent && o.parent.name ? o.parent.name + " " : "") + o.type;
const some = (o, f) => { let hit = false; o.traverse((x) => { if (f(x)) hit = true; }); return hit; };

export function scaleAudit(root, { tol = 0.15, mpu = M } = {}) {
  if (!(typeof tol === "number" && tol > 0)) throw new Error("scaleAudit(): tol is a positive fraction (got " + tol + ")");
  root.updateMatrixWorld(true);
  const off = [], bad = [], unchecked = []; let checked = 0;
  root.traverse((o) => {
    const real = o.userData.real;
    if (real === undefined) return;
    const keys = real && typeof real === "object" ? Object.keys(real) : [];
    if (!keys.length || keys.some((k) => !(k in AXIS))) { bad.push(label(o) + ": userData.real is { h, w, d } in metres"); return; }
    const box = new THREE.Box3().setFromObject(o, true);
    if (box.isEmpty()) { bad.push(label(o) + ": declares a size but has no geometry to measure"); return; }
    const size = box.getSize(new THREE.Vector3());
    for (const k of keys) {
      if (!(typeof real[k] === "number" && real[k] > 0 && Number.isFinite(real[k]))) { bad.push(label(o) + ": real." + k + " is a positive number of metres (got " + real[k] + ")"); continue; }
      const m = size[AXIS[k]] * mpu, ratio = m / real[k];
      checked++;
      if (Math.abs(ratio - 1) > tol) off.push({ name: label(o), axis: k, declared: real[k], measured: +m.toFixed(4), ratio: +ratio.toFixed(2) });
    }
  });
  // Unchecked unit: the highest node with a mesh and no declared size at or under it, or a mesh whose own size is undeclared
  // while a part of it declares one; a node that declares a size covers everything under it.
  const walk = (o) => {
    if (o.userData.real !== undefined) return;
    if (!some(o, (x) => x.userData.real !== undefined)) { if (some(o, (x) => x.isMesh)) unchecked.push(label(o)); return; }
    if (o.isMesh) unchecked.push(label(o));
    o.children.forEach(walk);
  };
  root.children.forEach(walk);
  const problems = [...off.map((p) => `${p.name}: ${p.axis} measures ${p.measured} m, declared ${p.declared} m (x${p.ratio})`), ...bad];
  return { ok: problems.length === 0, checked, off, unchecked, bad, problems };
}

// The planes of a mesh in world space: normal (facing as the winding says), offset in metres, and the box of its triangles.
function faces(mesh, mpu) {
  const g = mesh.geometry, pos = g.attributes.position, idx = g.index, n = idx ? idx.count : pos.count;
  const flip = mesh.matrixWorld.determinant() < 0 ? -1 : 1, out = new Map(), groups = g.groups || [];
  const matOf = (i) => { for (const gr of groups) if (i >= gr.start && i < gr.start + gr.count) return gr.materialIndex || 0; return 0; };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nm = new THREE.Vector3(), e = new THREE.Vector3();
  for (let i = 0; i + 2 < n; i += 3) {
    const at = (j) => (idx ? idx.getX(i + j) : i + j);
    a.fromBufferAttribute(pos, at(0)).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(pos, at(1)).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(pos, at(2)).applyMatrix4(mesh.matrixWorld);
    nm.subVectors(c, b); e.subVectors(a, b); nm.cross(e);
    if (nm.lengthSq() < 1e-18) continue;
    nm.normalize().multiplyScalar(flip);
    const d = nm.dot(a) * mpu, key = [nm.x, nm.y, nm.z].map((v) => Math.round(v * 1e4)).join() + "|" + Math.round(d * 1e6);
    let f = out.get(key);
    if (!f) out.set(key, f = { n: nm.clone(), d, box: new THREE.Box3(), mats: new Set() });
    f.mats.add(matOf(i));
    f.box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  }
  return [...out.values()];
}

// The depth shift a face's materials give it as [factor, units]: only when every material it is drawn with offsets (a
// polygonOffset flag with factor and units 0 shifts nothing); [0, 0] otherwise.
function shift(mesh, f) {
  const mats = [].concat(mesh.material); let out = null;
  for (const i of f.mats) {
    const m = mats.length === 1 ? mats[0] : mats[i];
    const v = m && m.polygonOffset && (m.polygonOffsetFactor || m.polygonOffsetUnits) ? [m.polygonOffsetFactor || 0, m.polygonOffsetUnits || 0] : null;
    if (!v || (out && (out[0] !== v[0] || out[1] !== v[1]))) return [0, 0];
    out = v;
  }
  return out || [0, 0];
}

export function zFight(root, { cameras, bits = 24, mpu = M, reach = 0.05, maxFaces = 4000 } = {}) {
  const cams = [].concat(cameras || []);
  if (!cams.length || !cams.every((c) => c && c.isPerspectiveCamera)) throw new Error("zFight(): cameras is a PerspectiveCamera or an array of them, each placed at a station the film uses");
  if (!(Number.isInteger(bits) && bits > 0)) throw new Error("zFight(): bits is a positive integer (got " + bits + ")");
  root.updateMatrixWorld(true);
  const eyes = cams.map((c) => {
    c.updateMatrixWorld(true); c.updateProjectionMatrix();
    return { c, fr: new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)) };
  });
  const skipped = [], meshes = [];
  const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible || p.userData.cutaway) return false; return true; };
  root.traverse((o) => {
    if (!o.isMesh || !shown(o)) return;
    if (o.isInstancedMesh || o.isSkinnedMesh || o.userData.fur) { skipped.push({ name: label(o), why: "not probed" }); return; }
    const f = faces(o, mpu);
    if (f.length > maxFaces) { skipped.push({ name: label(o), why: "too many faces (" + f.length + ")" }); return; }
    const mats = [].concat(o.material);
    meshes.push({ o, f, mats, box: new THREE.Box3().setFromObject(o, true).expandByScalar(reach / mpu / 2) });
  });
  const pairs = []; let unseen = 0, mitigated = 0;
  const centre = new THREE.Vector3();
  for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) {
    const A = meshes[i], B = meshes[j];
    if (!A.box.intersectsBox(B.box)) continue;
    const dbl = A.mats.concat(B.mats).some((m) => m && m.side === THREE.DoubleSide);
    let best = null, seen = false, held = false;
    for (const fa of A.f) for (const fb of B.f) {
      const dot = fa.n.dot(fb.n);
      if (!(dot > 0.9999 || (dot < -0.9999 && dbl))) continue;
      const gap = Math.abs(fa.d - (dot > 0 ? 1 : -1) * fb.d);
      if (gap > reach) continue;
      // the boxes meet along the face, not at an edge or a corner: positive extent on every axis the normal does not own
      const slide = new THREE.Vector3(Math.abs(fa.n.x), Math.abs(fa.n.y), Math.abs(fa.n.z)).multiplyScalar(gap / mpu);
      const lap = fa.box.clone().intersect(new THREE.Box3(fb.box.min.clone().sub(slide), fb.box.max.clone().add(slide)));
      if (lap.isEmpty()) continue;
      const ext = lap.getSize(new THREE.Vector3());
      if (["x", "y", "z"].some((k) => Math.abs(fa.n[k]) < 0.9999 && !(ext[k] > 1e-6))) continue;
      lap.getCenter(centre);
      let worst = -1, depth = 0;
      for (const { c, fr } of eyes) {
        if (!fr.containsPoint(centre)) continue;
        const z = -centre.clone().applyMatrix4(c.matrixWorldInverse).z * mpu, nr = c.near * mpu, fa2 = c.far * mpu;
        const step = z * z * (fa2 - nr) / (fa2 * nr * 2 ** bits);
        if (step > worst) { worst = step; depth = z; }
      }
      if (worst < 0) { seen = true; continue; }
      if (!(gap < worst)) continue;
      const sa = shift(A.o, fa), sb = shift(B.o, fb);
      if (sa[0] !== sb[0] || sa[1] !== sb[1]) { held = true; continue; }
      if (!best || gap < best.gap) best = { gap, worst, depth };
    }
    if (best) {
      pairs.push({
        a: label(A.o), b: label(B.o), gap_mm: +(best.gap * 1000).toFixed(3), step_mm: +(best.worst * 1000).toFixed(3), depth_m: +best.depth.toFixed(2),
        suggest: `polygonOffset (factor -1, units -1) on the material of whichever should show in front, or lift it ${Math.ceil(best.worst * 2000 * 100) / 100} mm along the face normal`,
      });
    } else if (held) mitigated++;
    else if (seen) unseen++;
  }
  return { pairs, unseen, mitigated, skipped, meshes: meshes.length };
}
