// isoWorld.js — the isometric-world look's set written as data, on the three.js iso rig (camera.js isoCamera, studio.js
// isoLook). A PROTOTYPE for running Express on this engine: the builder places and poses, it never sculpts.
//
//   const models = await loadModels({ sofa: "models/loungeSofa.glb", guide: "models/character-female-a.glb" });
//   const W = buildWorld(WORLD, { models, palette, roles });   // scene.add(W.root); W.at.pump -> a Vector3 for pins
//   placeIso(camera, isoPose({ x, y, z, k }), isoOrbit(t, { start: 0, dur: 30, deg: 8 }));
//
// Coordinates are engine/iso's (metres, z up, the viewer at +x +y), so a world.js spec reads the same in both engines:
// iso (x, y, z) is three (x, z, y). k is engine/iso's px per metre (isoPose converts it: three's true iso shows a metre
// at sqrt(2/3) of engine/iso's 2:1 length).
// entry = { name, at: [x, y, z] (base centre), face: "+x"|"-x"|"+y"|"-y" (where its front looks), color, shadow, ...one of:
//   model: key in models, h (real height, m), roles: { materialName: colour }   (a ready CC0 model, recoloured)
//   figure: key in models, h, pose: "stand"|"point", look: [x, y] (turns to face it; "point" aims the right arm at it)
//   form: box { w, d, h } · cyl { r, h, axis: z|x|y } · sweep { path: [[x, y, z], …], r } (a pipe, bends at 3 r) · lathe { profile:
//         [[r, z], …] } · extrude { outline: [[x, y], …], h }  (only for topic mechanisms and cutaways) }
// Colour: roles[material name] > entry.color (its first material) > the nearest colour of `palette` (textures snapped
// texel by texel), each on studio.js isoMaterial: three tones by face, no light. A soft contact shadow sits under every
// model and figure (shadow: false drops it).

import { THREE, GLTFLoader } from "./three-vendor.js";
import { isoMaterial } from "./studio.js";
import { place } from "./camera.js";

const V3 = ([x, y, z]) => new THREE.Vector3(x, z, y); // iso (z up) -> three (y up)
const FACE = { "+y": 0, "+x": Math.PI / 2, "-y": Math.PI, "-x": -Math.PI / 2 }; // a glTF front looks down +Z (iso +y)
export const ISO_K = Math.sqrt(3 / 2); // three k per engine/iso k

export async function loadModels(urls) {
  const loader = new GLTFLoader(), out = {};
  await Promise.all(Object.entries(urls).map(async ([k, u]) => { out[k] = (await loader.loadAsync(u)).scene; }));
  return out;
}

// nearest(colour, palette): the palette colour closest to it (weighted RGB, sRGB), as a THREE.Color
const rgb = (c) => new THREE.Color(c);
export function nearest(c, palette) {
  const a = rgb(c).convertLinearToSRGB(); let best = null, bd = Infinity;
  for (const p of palette) { const b = rgb(p).convertLinearToSRGB(), dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b, d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (d < bd) { bd = d; best = p; } }
  return rgb(best);
}
// ponytail: texels snapped on a 2D canvas (the browser); in Node a textured material keeps its map.
function snapTexture(tex, palette) {
  const img = tex?.image; if (!img || typeof document === "undefined") return tex;
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), memo = new Map();
  for (let i = 0; i < d.data.length; i += 4) {
    const key = (d.data[i] << 16) | (d.data[i + 1] << 8) | d.data[i + 2];
    if (!memo.has(key)) { const n = nearest(new THREE.Color().setRGB(d.data[i] / 255, d.data[i + 1] / 255, d.data[i + 2] / 255, THREE.SRGBColorSpace), palette).convertLinearToSRGB(); memo.set(key, [n.r * 255, n.g * 255, n.b * 255]); }
    [d.data[i], d.data[i + 1], d.data[i + 2]] = memo.get(key);
  }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = tex.flipY; t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}
// recolour(root, { palette, roles, color }): every material onto the iso material in the film's colours
export function recolour(root, { palette, roles = {}, color } = {}) {
  if (!palette?.length) throw new Error("recolour(): palette is the film's colours, a non-empty list");
  const memo = new Map(); let first = null;
  const conv = (m) => {
    if (memo.has(m)) return memo.get(m);
    first ??= m.name;
    const own = roles[m.name] ?? (color && m.name === first ? color : null);
    const out = m.map && !own ? isoMaterial(0xffffff, { map: snapTexture(m.map, palette), side: m.side })
      : isoMaterial(own ? rgb(own) : nearest(m.color ?? 0xffffff, palette), { side: m.side, transparent: m.transparent, opacity: m.opacity });
    out.name = m.name; memo.set(m, out); return out;
  };
  root.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); });
  return root;
}

// the contact shadow: one soft disc texture, ink at the centre fading out (pure data, so Node can build it too)
let disc = null;
function shadowTex() {
  if (disc) return disc;
  const n = 64, a = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const r = Math.hypot(i - n / 2 + 0.5, j - n / 2 + 0.5) / (n / 2); a[(j * n + i) * 4 + 3] = 255 * Math.max(0, 1 - r) ** 1.6; }
  disc = new THREE.DataTexture(a, n, n); disc.magFilter = disc.minFilter = THREE.LinearFilter; disc.needsUpdate = true;
  return disc;
}
export function contactShadow(box, { ink = "#22333B", opacity = 0.28 } = {}) {
  const s = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const m = new THREE.Mesh(new THREE.PlaneGeometry(s.x * 1.3 + 0.1, s.z * 1.3 + 0.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: ink, map: null, alphaMap: shadowTex(), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.material.alphaMap.colorSpace = THREE.NoColorSpace;
  m.position.set(c.x, box.min.y + 0.004, c.z); m.renderOrder = -1; m.userData.shadow = true;
  return m;
}

// a pipe: straight runs joined by bends of radius 3 r (never a kink), as one tube
function pipe(path, r) {
  const P = path.map(V3), cp = new THREE.CurvePath(), R = 3 * r;
  let from = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i].clone().sub(P[i - 1]), b = P[i + 1].clone().sub(P[i]), ra = Math.min(R, a.length() / 2), rb = Math.min(R, b.length() / 2);
    const p0 = P[i].clone().addScaledVector(a.normalize(), -ra), p1 = P[i].clone().addScaledVector(b.normalize(), rb);
    cp.add(new THREE.LineCurve3(from, p0)); cp.add(new THREE.QuadraticBezierCurve3(p0, P[i].clone(), p1)); from = p1;
  }
  cp.add(new THREE.LineCurve3(from, P[P.length - 1]));
  return new THREE.TubeGeometry(cp, 24 * P.length, r, 12, false);
}
function form(e) {
  const need = (...ks) => { for (const k of ks) if (!Number.isFinite(e[k])) throw new Error(`buildWorld(): ${e.name || e.form} needs ${k} (m)`); };
  switch (e.form) {
    case "box": need("w", "d", "h"); return new THREE.BoxGeometry(e.w, e.h, e.d).translate(0, e.h / 2, 0);
    case "cyl": { // axis z stands on at; axis x or y lies on it, centred
      need("r", "h"); const g = new THREE.CylinderGeometry(e.r, e.r, e.h, 32);
      return !e.axis || e.axis === "z" ? g.translate(0, e.h / 2, 0) : (e.axis === "x" ? g.rotateZ(Math.PI / 2) : g.rotateX(Math.PI / 2)).translate(0, e.r, 0);
    }
    case "sweep": need("r"); return pipe(e.path, e.r);
    case "lathe": return new THREE.LatheGeometry(e.profile.map(([r, z]) => new THREE.Vector2(r, z)), 32);
    case "extrude": { need("h"); const s = new THREE.Shape(e.outline.map(([x, y]) => new THREE.Vector2(x, -y))); return new THREE.ExtrudeGeometry(s, { depth: e.h, bevelEnabled: false }).rotateX(-Math.PI / 2); }
  }
  throw new Error(`buildWorld(): ${e.name || "an entry"} has form "${e.form}" (box, cyl, sweep, lathe, extrude)`);
}

// a ready model at its real height, footprint centred on the origin, resting on y = 0
function fit(src, h, clone = true) {
  const o = clone ? src.clone(true) : src, box = new THREE.Box3().setFromObject(o), s = box.getSize(new THREE.Vector3());
  if (!(s.y > 0)) throw new Error("buildWorld(): a model with no height");
  const k = h / s.y, c = box.getCenter(new THREE.Vector3()), g = new THREE.Group();
  o.scale.multiplyScalar(k); o.position.set(-c.x * k, -box.min.y * k, -c.z * k); g.add(o);
  return g;
}
// ponytail: "point" is one fixed arm pose; add an IK aim if a beat needs the arm on a moving or high target.
// Poses as bone turns from the rig's rest, which for Kenney Mini Characters is a T (arms out along -x / +x): stand
// drops both arms; point swings the right arm forward (+Z, where the figure looks) and 20 deg down, at a thing on the ground.
// ponytail: Kenney's bone names and rest pose; map another pack's rig here when a film needs it.
const DOWN = { "arm-right": [0, 0, Math.PI / 2], "arm-left": [0, 0, -Math.PI / 2] };
const POSES = { stand: DOWN, point: { ...DOWN, "arm-right": [0, Math.PI / 2, 0.35] } };
function pose(root, name) {
  const p = POSES[name ?? "stand"]; if (!p) throw new Error(`buildWorld(): pose "${name}" (stand, point)`);
  for (const [bone, r] of Object.entries(p)) { const b = root.getObjectByName(bone); if (!b) throw new Error(`buildWorld(): the figure has no "${bone}"`); b.rotation.set(...r); }
}

export function buildWorld(world, { models = {}, palette, roles = {}, ink } = {}) {
  const root = new THREE.Group(), at = {}, parts = {}, used = new Set();
  for (const e of world) {
    let o;
    const key = e.model ?? e.figure;
    if (key !== undefined) {
      const src = models[key]; if (!src) throw new Error(`buildWorld(): ${e.name || key} names model "${key}", not loaded`);
      let skinned = false; src.traverse((m) => { skinned ||= !!m.isSkinnedMesh; });
      if (skinned && used.has(key)) throw new Error(`buildWorld(): a rigged model ("${key}") is placed once; load it again for a second figure`);
      used.add(key);
      if (!Number.isFinite(e.h) || e.h <= 0) throw new Error(`buildWorld(): ${e.name || key} needs h, its real height (m)`);
      o = fit(src, e.h, !skinned); // a rigged model is used as loaded: a clone loses its skeleton
      recolour(o, { palette, roles: { ...roles, ...e.roles }, color: e.color });
      if (e.figure) pose(o, e.pose);
    } else {
      o = new THREE.Mesh(form(e), isoMaterial(rgb(e.color ?? palette[0]))); // a sweep's path is in world coordinates: leave at out
    }
    const look = e.look ? Math.atan2(e.look[0] - e.at[0], e.look[1] - e.at[1]) : null; // three rotation.y turning +Z toward look
    o.rotation.y = look ?? FACE[e.face ?? "+y"] ?? (() => { throw new Error(`buildWorld(): face is +x, -x, +y or -y (got ${e.face})`); })();
    o.position.copy(V3(e.at ?? [0, 0, 0]));
    root.add(o);
    if (e.shadow ?? key !== undefined) { o.updateWorldMatrix(true, true); root.add(contactShadow(new THREE.Box3().setFromObject(o), { ink })); }
    if (e.name) { parts[e.name] = o; o.updateWorldMatrix(true, true); const b = new THREE.Box3().setFromObject(o); at[e.name] = new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2); }
  }
  return { root, at, parts };
}

// isoPose({ x, y, z, k }): engine/iso's cam (a world point at the frame's centre, px per metre) as a three iso pose
export const isoPose = ({ x, y, z, k }) => ({ target: V3([x, y, z]), k: k * ISO_K });
// isoOrbit(t, { start, dur, deg, dir }): the film's one slow orbit, degrees of azimuth, eased in and out, one way only
export function isoOrbit(t, { start = 0, dur, deg = 8, dir = 1 } = {}) {
  if (!(dur > 0) || !(Math.abs(dir) === 1)) throw new Error("isoOrbit(): dur > 0 s and dir 1 or -1 (one way for the whole film)");
  const u = Math.min(1, Math.max(0, (t - start) / dur));
  return dir * deg * u * u * (3 - 2 * u);
}
// placeIso(camera, pose, azimuthDeg): place() turned about the vertical through the target. The matcap reads view
// normals, so a turn of a few degrees shifts the side tones a little, as a turning world does.
// ponytail: tones follow the view; shade by world normal (a custom shader) if an orbit grows past ~15 deg.
export function placeIso(camera, p, azimuthDeg = 0) {
  place(camera, p);
  if (azimuthDeg) { camera.position.sub(p.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), (azimuthDeg * Math.PI) / 180).add(p.target); camera.lookAt(p.target); camera.updateMatrixWorld(); }
  return camera;
}
