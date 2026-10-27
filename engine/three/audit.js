// audit.js — two checks on a built set, in metres at any scale (kit.js M). Neither moves anything.
//  - scaleAudit(root): a prop declares its real size in userData.real = { h, w, d } (metres, from the model's source or a
//    cited size; h = world Y, w = world X, d = world Z: a prop turned about Y swaps w and d, so declare h or both).
//    Off by more than tol -> reported. No declared size, at any depth in the tree -> "unchecked", never passed. A printed
//    marking (markings.js) is ink on a surface, not part of the body: a prop is measured without it.
//  - zFight(root, { cameras }): coplanar-ish faces of two meshes closer than the depth buffer can tell apart at the
//    camera depth z-fight. Depth step (m) = z² (far - near) / (far · near · 2^bits), a lower bound: a gap a few steps
//    wide can still fight on a real GPU. A polygonOffset counts only by the window depth it shifts at each camera
//    (depthAt(), the one place a depth is decided): never by its settings being present.
import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

const AXIS = { w: "x", h: "y", d: "z" };
const label = (o) => o.name || (o.parent && o.parent.name ? o.parent.name + " " : "") + o.type;
const some = (o, f) => { let hit = false; o.traverse((x) => { if (f(x)) hit = true; }); return hit; };

// The box of a prop's own geometry. A printed marking (markings.js, userData.marking) is ink or paper on the surface, tens
// of micrometres to a millimetre thick: it is not part of the body, so a subtree that carries one is measured without it.
const measure = (o) => {
  let marked = false;
  o.traverse((x) => { if (x.userData.marking) marked = true; });
  if (!marked) return new THREE.Box3().setFromObject(o, true);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  o.traverse((x) => {
    const p = x.isMesh && !x.userData.marking && x.geometry?.attributes.position;
    if (p) for (let i = 0; i < p.count; i++) box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(x.matrixWorld));
  });
  return box;
};

export function scaleAudit(root, { tol = 0.15, mpu = M } = {}) {
  if (!(typeof tol === "number" && tol > 0)) throw new Error("scaleAudit(): tol is a positive fraction (got " + tol + ")");
  root.updateMatrixWorld(true);
  const off = [], bad = [], unchecked = []; let checked = 0;
  root.traverse((o) => {
    const real = o.userData.real;
    if (real === undefined) return;
    const keys = real && typeof real === "object" ? Object.keys(real) : [];
    if (!keys.length || keys.some((k) => !(k in AXIS))) { bad.push(label(o) + ": userData.real is { h, w, d } in metres"); return; }
    const box = measure(o);
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

// The polygonOffset settings a face is drawn with, one [factor, units] per distinct material on it ([0, 0] for a material
// that does not offset). Settings only: what they shift is measured at each camera by depthAt(), never read from them here.
function offsets(mesh, f) {
  const mats = [].concat(mesh.material), out = new Map();
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  for (const i of f.mats) {
    const m = mats.length === 1 ? mats[0] : mats[i];
    const v = m && m.polygonOffset ? [num(m.polygonOffsetFactor), num(m.polygonOffsetUnits)] : [0, 0];
    out.set(v.join(), v);
  }
  return out.size ? [...out.values()] : [[0, 0]];
}

// The one place a depth is decided: the window depth (0..1) a face writes at the pixel that sees point p, its
// polygonOffset applied as the GPU applies it: factor x the face's depth slope per pixel + units x one step (2^-bits).
// A face square to the view has slope 0, so its factor shifts nothing there. null when the face is edge-on or behind.
function depthAt(eye, f, p, [factor, units], mpu) {
  const { c, o, H, W, r } = eye, u = new THREE.Vector3().subVectors(p, o).normalize(), nu = f.n.dot(u);
  if (Math.abs(nu) < 1e-9) return null;
  const t = (f.d / mpu - f.n.dot(o)) / nu;
  if (!(t > 0)) return null;
  const hit = o.clone().addScaledVector(u, t);
  const win = (q) => { const v = q.clone().project(c); return [(v.x + 1) / 2 * W, (v.y + 1) / 2 * H, (v.z + 1) / 2]; };
  const t1 = new THREE.Vector3(1, 0, 0).cross(f.n); if (t1.lengthSq() < 1e-6) t1.set(0, 1, 0).cross(f.n);
  t1.normalize(); const t2 = new THREE.Vector3().crossVectors(f.n, t1);
  const s = t * 0.01, w0 = win(hit), w1 = win(hit.clone().addScaledVector(t1, s)), w2 = win(hit.clone().addScaledVector(t2, s));
  const x1 = w1[0] - w0[0], y1 = w1[1] - w0[1], z1 = w1[2] - w0[2], x2 = w2[0] - w0[0], y2 = w2[1] - w0[1], z2 = w2[2] - w0[2];
  const det = x1 * y2 - x2 * y1;
  if (Math.abs(det) < 1e-12) return null;
  const slope = Math.max(Math.abs((z1 * y2 - z2 * y1) / det), Math.abs((x1 * z2 - x2 * z1) / det)); // max(|dz/dx|, |dz/dy|)
  return w0[2] + factor * slope + units * r;
}

// Depth steps between two faces at the pixel that sees p, the least over every pairing of their materials; null = not drawn.
function apart(eye, fa, fb, p, oa, ob, mpu) {
  let least = null;
  for (const sa of oa) for (const sb of ob) {
    const za = depthAt(eye, fa, p, sa, mpu), zb = depthAt(eye, fb, p, sb, mpu);
    if (za === null || zb === null) return null;
    const steps = Math.abs(za - zb) / eye.r;
    if (least === null || steps < least) least = steps;
  }
  return least;
}

const FIGHT = 1 - 1e-9; // less than one depth step apart: the buffer cannot order the two faces
const FLAT = [[0, 0]];

export function zFight(root, { cameras, bits = 24, mpu = M, reach = 0.05, maxFaces = 4000, heightPx = 1080 } = {}) {
  const cams = [].concat(cameras || []);
  if (!cams.length || !cams.every((c) => c && c.isPerspectiveCamera)) throw new Error("zFight(): cameras is a PerspectiveCamera or an array of them, each placed at a station the film uses");
  if (!(Number.isInteger(bits) && bits > 0)) throw new Error("zFight(): bits is a positive integer (got " + bits + ")");
  if (!(typeof heightPx === "number" && heightPx > 0 && Number.isFinite(heightPx))) throw new Error("zFight(): heightPx is the render height in pixels (got " + heightPx + ")");
  for (const c of cams) if (!(typeof c.aspect === "number" && c.aspect > 0 && Number.isFinite(c.aspect))) throw new Error("zFight(): a camera's aspect is a finite number above 0 (got " + c.aspect + ")");
  root.updateMatrixWorld(true);
  const eyes = cams.map((c) => {
    c.updateMatrixWorld(true); c.updateProjectionMatrix();
    return {
      c, o: c.getWorldPosition(new THREE.Vector3()), H: heightPx, W: heightPx * c.aspect, r: 2 ** -bits,
      fr: new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)),
    };
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
    let best = null, seen = false, held = false, blind = false;
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
      // Both verdicts come from apart(), so an offset counts only by the depth it shifts: would fight = under one step
      // with no offset at some camera; fights = under one step with the materials' offsets at some camera. Mitigated =
      // would fight, and the offsets keep the faces at least a step apart at every camera that sees them.
      const oa = offsets(A.o, fa), ob = offsets(B.o, fb);
      let looked = false, would = false, fight = null;
      for (const eye of eyes) {
        if (!eye.fr.containsPoint(centre)) continue;
        looked = true;
        const raw = apart(eye, fa, fb, centre, FLAT, FLAT, mpu), eff = apart(eye, fa, fb, centre, oa, ob, mpu);
        // a depth that cannot be computed (edge-on, degenerate, NaN) decides nothing: the pair is unseen, never passed
        if (!Number.isFinite(raw) || !Number.isFinite(eff)) { blind = true; continue; }
        if (raw < FIGHT) would = true;
        if (eff < FIGHT) {
          const z = -centre.clone().applyMatrix4(eye.c.matrixWorldInverse).z * mpu, nr = eye.c.near * mpu, fr = eye.c.far * mpu;
          const step = z * z * (fr - nr) / (fr * nr * 2 ** bits);
          if (!fight || step > fight.worst) fight = { worst: step, depth: z };
        }
      }
      if (!looked) { seen = true; continue; }
      if (blind && !fight) continue;
      if (fight) { if (!best || gap < best.gap) best = { gap, ...fight }; }
      else if (would) held = true;
    }
    if (best) {
      pairs.push({
        a: label(A.o), b: label(B.o), gap_mm: +(best.gap * 1000).toFixed(3), step_mm: +(best.worst * 1000).toFixed(3), depth_m: +best.depth.toFixed(2),
        suggest: `polygonOffset with units (-1 or more; a factor alone shifts nothing on a face seen head-on) on the material of whichever should show in front, or lift it ${Math.ceil(best.worst * 2000 * 100) / 100} mm along the face normal`,
      });
    } else if (blind) unseen++;
    else if (held) mitigated++;
    else if (seen) unseen++;
  }
  return { pairs, unseen, mitigated, skipped, meshes: meshes.length };
}
