import { THREE, EffectComposer, RenderPass, EffectPass, N8AOPostPass, SMAAEffect, DepthOfFieldEffect, ToneMappingEffect, ToneMappingMode, RoomEnvironment } from "./three-vendor.js";
import { M } from "./kit.js";
import { place } from "./camera.js";

// One light and render rig for every set, so a film never hand-writes one and never types its numbers:
//  - the colour pipeline: sRGB out, the tone mapping in the composer (AgX or Neutral; none for a toon look), a stencil
//    buffer for a cutaway, a RoomEnvironment at a stated intensity;
//  - a key, a fill and a rim from a named preset (`warm`, `window`, `overcast`), standing round the set;
//  - the key's shadow frustum is REFITTED to what the camera pose sees (the part of the set inside the frame's pyramid,
//    the ground and props far behind the target included, since a fragment outside the frustum is lit), every frame:
//    one frustum over a whole room has texels of 1-2 mm, so a close-up's contact shadow is as coarse as the wide's. The
//    fit follows the pose, so in a close-up the texel is the visible region over the map, <= 1 mm while the frame sees
//    less than about 4 m of the set; the depth range still spans every caster of the set;
//  - the N8AO radius comes from the scale (`M`) and the size of the view (its half-size / 12, in metres), not a typed
//    number; optional depth of field whose focus follows the pose's target; SMAA last; then the film's `finish`.
// Units: positions are scene units; lengths you type are metres; texelMm and pixelMm are millimetres. `renderer: null`
// builds the rig dry: state(pose) still fits the shadow and computes the AO (a Node check), render() throws.
// Every value is overridable (`preset`, `env`, `tone`, `ao`, `shadow`, `dof`); the defaults are the look's.

const DEG = Math.PI / 180;
const num = (v) => typeof v === "number" && Number.isFinite(v);
const dirOf = (az, el) => new THREE.Vector3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG));
const freeze = (o) => { for (const v of Object.values(o)) if (v && typeof v === "object") freeze(v); return Object.freeze(o); };

// [colour, intensity, azimuth deg around y from +z, elevation deg], around the set's centre, fixed in the world.
export const PRESETS = freeze({
  warm: { key: [0xfff1de, 2.6, -35, 50], fill: [0xdfe8ff, 0.6, 60, 20], rim: [0xffd2a0, 1.0, 170, 35] },
  window: { key: [0xf4f7ff, 3.0, -80, 25], fill: [0xfff0dc, 0.4, 90, 10], rim: [0xe8eeff, 0.6, 180, 30] },
  overcast: { key: [0xeef2f6, 1.4, -20, 70], fill: [0xdfe8f2, 0.9, 140, 40], rim: [0xffffff, 0, 180, 30] },
});
// The looks' defaults (references/looks.md C and I). ao.frac: of the view's half-size; min and max in metres.
export const LOOKS = freeze({
  diorama: { tone: "neutral", env: 0.9, preset: "warm", ao: { frac: 1 / 12, min: 0.004, max: 0.5, falloff: 1, intensity: 2.5 }, shadow: { map: 4096, radius: 12, margin: 1.25, bias: -0.0002 }, dof: false },
  toon: { tone: "none", env: 0, preset: "overcast", ao: false, shadow: { map: 2048, radius: 2, margin: 1.25, bias: -0.0002 }, dof: false },
});

// aoFor(view, ao, mpu): N8AO radius (scene units) and falloff from the view's half-size `view` (units) and the scale
// `mpu` (metres per unit). `metres` is the radius in metres: the same view in metres gives the same metres at any scale.
export function aoFor(view, ao = LOOKS.diorama.ao, mpu = M) {
  if (!(num(view) && view > 0 && num(mpu) && mpu > 0)) throw new Error("aoFor(view, ao, mpu): view (scene units) and mpu (metres per unit) must be > 0");
  const metres = Math.min(ao.max, Math.max(ao.min, ao.frac * view * mpu));
  return { aoRadius: metres / mpu, distanceFalloff: ao.falloff, metres };
}

// visiblePoints(view, set, scale): the vertices of the convex region the frame sees inside the set's box (the view's
// pyramid meeting the Box3), found as the corners of ten half-spaces taken three at a time. Empty when the frame sees
// none of the set. `scale`: a length of the scene, for the tolerance.
function visiblePoints(view, set, scale) {
  const fwd = view.target.clone().sub(view.position).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0); // looking straight up or down
  right.normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const tanV = Math.tan((view.fov * DEG) / 2), tanH = tanV * view.aspect;
  const ray = (sx, sy) => fwd.clone().addScaledVector(right, sx * tanH).addScaledVector(up, sy * tanV);
  const ring = [ray(-1, -1), ray(1, -1), ray(1, 1), ray(-1, 1)], planes = []; // [n, b]: n.x <= b
  for (let i = 0; i < 4; i++) {
    const n = new THREE.Vector3().crossVectors(ring[i], ring[(i + 1) % 4]).normalize();
    if (n.dot(fwd) > 0) n.negate();
    planes.push([n, n.dot(view.position)]);
  }
  for (const k of ["x", "y", "z"]) {
    const e = new THREE.Vector3(); e[k] = 1;
    planes.push([e, set.max[k]], [e.clone().negate(), -set.min[k]]);
  }
  const out = [], tol = 1e-6 * scale, m = new THREE.Matrix3();
  for (let i = 0; i < planes.length; i++) for (let j = i + 1; j < planes.length; j++) for (let k = j + 1; k < planes.length; k++) {
    const [a, b, c] = [planes[i], planes[j], planes[k]];
    m.set(a[0].x, a[0].y, a[0].z, b[0].x, b[0].y, b[0].z, c[0].x, c[0].y, c[0].z);
    if (Math.abs(m.determinant()) < 1e-9) continue;
    const p = new THREE.Vector3(a[1], b[1], c[1]).applyMatrix3(m.invert());
    if (planes.every(([n, d]) => n.dot(p) <= d + tol)) out.push(p);
  }
  return out;
}

// fitShadow(light, view, opts): the key's orthographic shadow frustum around what `view` ({ position, target, fov,
// aspect }) sees of the `set` (Box3): the corners of the region the frame's pyramid cuts out of the set's box, so a
// camera that looks down at an angle still has the ground and props far behind its target inside the frustum (three.js
// lights a fragment outside the shadow camera). Its depth range spans the whole set, so every caster stays. A wide that
// sees the whole set gets the set's bounding sphere, no more. Returns { center, radius, half, texelMm, pixelMm }
// (center, radius and half in units: half is the frame's half-size at the target; texelMm is of the window's square).
export function fitShadow(light, view, { set, map = 4096, margin = 1.25, height = 1080, mpu = M } = {}) {
  if (!light?.isDirectionalLight || !light.userData.studioDir) throw new Error("fitShadow(): pass the studio's key (a DirectionalLight with userData.studioDir)");
  if (!set?.isBox3 || set.isEmpty()) throw new Error("fitShadow(): set is the Box3 of the whole set (every caster)");
  const d = view.position.distanceTo(view.target), tanH = Math.tan((view.fov * DEG) / 2);
  const half = d * tanH * Math.max(1, view.aspect); // half the frame's widest side, at the target
  const S = set.getBoundingSphere(new THREE.Sphere()), eps = 0.01 / mpu, reach = S.radius;
  // The light stands over the set's centre, so its depth range is the set's sphere whatever the pose; only the window moves.
  light.position.copy(S.center).addScaledVector(light.userData.studioDir, reach + eps);
  light.target.position.copy(S.center);
  if (light.shadow.mapSize.x !== map) { light.shadow.map?.dispose(); light.shadow.map = null; light.shadow.mapSize.set(map, map); }
  const cam = light.shadow.camera;
  light.updateMatrixWorld(); light.target.updateMatrixWorld(); light.shadow.updateMatrices(light);
  let cx = 0, cy = 0, r = S.radius;
  const pts = visiblePoints(view, set, S.radius + view.position.distanceTo(S.center));
  if (pts.length) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of pts) { const q = p.applyMatrix4(cam.matrixWorldInverse); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
    const fit = Math.max(((x1 - x0) / 2) * margin, ((y1 - y0) / 2) * margin, 0.02 / mpu);
    if (fit < S.radius) { cx = (x0 + x1) / 2; cy = (y0 + y1) / 2; r = fit; }
  }
  Object.assign(cam, { left: cx - r, right: cx + r, top: cy + r, bottom: cy - r, near: eps / 2, far: 2 * reach + 2 * eps });
  cam.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
  const texel = (2 * r) / map;
  light.shadow.normalBias = 1.5 * texel; // acne-free at any fit: the bias follows the texel
  const center = new THREE.Vector3(cx, cy, -(reach + eps)).applyMatrix4(cam.matrixWorld);
  return { center, radius: r, half, texelMm: texel * mpu * 1000, pixelMm: ((2 * d * tanH) / height) * mpu * 1000 };
}

// studio(renderer, scene, camera, { look, preset, route, set, env, tone, ao, shadow, dof, finish, mpu, height, stencil })
//   look: "diorama" | "toon"; preset: a name in PRESETS or { key, fill, rim }; route: anything with at(t) giving
//   { position, target, fov } (a camera.js route), used by render(t) without a pose; set: the Object3D or Box3 of
//   everything that casts a shadow (default: the scene, measured once before the lights go in; a part that later moves
//   outside it needs a Box3 covering its travel); env: RoomEnvironment intensity (0 = none); tone: "agx" | "neutral" |
//   "none"; ao: false or { frac, min, max, falloff, intensity }; shadow: { map, radius, margin, bias }; dof: true or
//   { focusRange (metres, default 3; the effect gets it in units), bokehScale }; finish: (canvas, t) => void, called after the composer; stencil: false when the
//   renderer has none (no cutaway); mpu: metres per unit (default: the live kit scale); height: the frame's px height.
// Returns { composer, render(t, pose), frame(t, pose), state(pose), camera, key, lights: { key, fill, rim }, set, look }.
// render and frame place `camera` at the pose; the frame is always that camera's (the composer is bound to it).
// state(pose) is a function of the pose and the camera's aspect: { texelMm, pixelMm, radius, ao, focus, focusRange }.
export function studio(renderer, scene, camera, opts = {}) {
  const name = opts.look ?? "diorama", look = LOOKS[name];
  if (!look) throw new Error('studio(): unknown look "' + name + '" (' + Object.keys(LOOKS).join(", ") + ")");
  if (!scene?.isScene) throw new Error("studio(): scene is the THREE.Scene the lights go into");
  if (!camera?.isPerspectiveCamera) throw new Error("studio(): camera is the set's PerspectiveCamera");
  const preset = typeof opts.preset === "object" && opts.preset ? opts.preset : PRESETS[opts.preset ?? look.preset];
  if (!preset?.key || !preset.fill || !preset.rim) throw new Error('studio(): unknown preset "' + opts.preset + '" (' + Object.keys(PRESETS).join(", ") + ", or { key, fill, rim })");
  const ao = opts.ao === false ? null : look.ao || opts.ao ? { ...LOOKS.diorama.ao, ...(look.ao || {}), ...(opts.ao || {}) } : null;
  const shadow = { ...look.shadow, ...(opts.shadow || {}) }, tone = opts.tone ?? look.tone, env = opts.env ?? look.env;
  const dofOpt = opts.dof ?? look.dof;
  let dofCfg = null; // focusRange in METRES, like every length you type; state() turns it into units
  if (dofOpt) {
    const d = dofOpt === true ? {} : dofOpt, range = d.focusRange ?? 3;
    if (!(num(range) && range > 0)) throw new Error("studio(): dof.focusRange is a length in metres, > 0 (got " + range + ")");
    dofCfg = { metres: range, bokeh: d.bokehScale ?? 2 };
  }
  if (!["agx", "neutral", "none"].includes(tone)) throw new Error('studio(): tone is "agx", "neutral" or "none"');
  const measure = (s) => { if (s?.isBox3) return s.clone(); if (s?.isObject3D) { s.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(s); } throw new Error("studio(): set is an Object3D or a Box3"); };
  const set = measure(opts.set ?? scene); // ONCE, before the lights go in
  if (set.isEmpty()) throw new Error("studio(): the set has no geometry; add its parts before studio()");
  const S = set.getBoundingSphere(new THREE.Sphere());
  const light = ([color, intensity, az, el]) => {
    const l = new THREE.DirectionalLight(color, intensity), dir = dirOf(az, el).normalize();
    l.userData.studioDir = dir; l.position.copy(S.center).addScaledVector(dir, 3 * S.radius); l.target.position.copy(S.center);
    if (intensity > 0) scene.add(l, l.target);
    return l;
  };
  const key = light(preset.key), fill = light(preset.fill), rim = light(preset.rim);
  key.castShadow = true; key.shadow.radius = shadow.radius; key.shadow.bias = shadow.bias;
  key.shadow.mapSize.set(shadow.map, shadow.map); // at build, so a reader before the first state() sees the real size
  const size = renderer ? renderer.getDrawingBufferSize(new THREE.Vector2()) : null;
  const height = opts.height ?? (size ? size.y : 1080);
  const mpu = () => opts.mpu ?? M; // live: makeKit sets M
  const check = (pose) => { if (!pose?.position?.isVector3 || !pose?.target?.isVector3 || !num(pose.fov)) throw new Error("studio.state(pose): pose is { position, target, fov } (route.at(t))"); };
  function state(pose) {
    check(pose);
    const fit = fitShadow(key, { position: pose.position, target: pose.target, fov: pose.fov, aspect: camera.aspect }, { set, map: shadow.map, margin: shadow.margin, height, mpu: mpu() });
    return { texelMm: fit.texelMm, pixelMm: fit.pixelMm, radius: fit.radius, ao: ao ? aoFor(fit.half, ao, mpu()) : null, focus: pose.target.clone(), focusRange: dofCfg ? dofCfg.metres / mpu() : null };
  }
  // frame(t, pose): puts the camera at the pose (without a pose: route.at(t)) and returns state(pose). The shadow is then
  // fitted to the frame that is rendered, with this camera's aspect. render() calls it; a dry rig can too.
  function frame(t, pose) {
    if (!pose) { if (!opts.route) throw new Error("studio.render(t, pose): pass the pose (route.at(t)) or build with { route }"); pose = opts.route.at(t); }
    check(pose);
    place(camera, pose);
    return state(pose);
  }
  let composer = null, aoPass = null, dof = null;
  if (renderer) {
    if (opts.stencil !== false && !renderer.getContext().getContextAttributes()?.stencil) throw new Error("studio(): the renderer has no stencil buffer, which a cutaway needs; build it with new THREE.WebGLRenderer({ stencil: true }), or pass { stencil: false } when the film has no cutaway");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping; // the composer tones once
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap is gone in this three; shadow.radius softens PCF
    if (env > 0) {
      scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = env;
    }
    composer = new EffectComposer(renderer, { stencilBuffer: true, multisampling: 0 });
    composer.addPass(new RenderPass(scene, camera));
    if (ao) {
      aoPass = new N8AOPostPass(scene, camera, size.x, size.y);
      aoPass.configuration.intensity = ao.intensity;
      aoPass.configuration.halfRes = false;
      composer.addPass(aoPass);
    }
    const effects = [];
    if (dofCfg) {
      dof = new DepthOfFieldEffect(camera, { focusDistance: 0, focusRange: dofCfg.metres / mpu(), bokehScale: dofCfg.bokeh }); // the effect reads WORLD units
      effects.push(dof);
    }
    if (tone !== "none") effects.push(new ToneMappingEffect({ mode: tone === "agx" ? ToneMappingMode.AGX : ToneMappingMode.NEUTRAL }));
    if (effects.length) composer.addPass(new EffectPass(camera, ...effects));
    composer.addPass(new EffectPass(camera, new SMAAEffect()));
  }
  // render(t, pose): frame(t, pose) (the camera is placed at the pose), the AO and the DOF to that pose, render the
  // camera the rig was built with (the composer's passes are bound to it), then the film's finish.
  function render(t, pose) {
    if (!composer) throw new Error("studio.render(): built without a renderer (studio(null, ...) computes state() only, for a Node check)");
    const s = frame(t, pose);
    if (aoPass) { aoPass.configuration.aoRadius = s.ao.aoRadius; aoPass.configuration.distanceFalloff = s.ao.distanceFalloff; }
    if (dof) { dof.target = s.focus; dof.cocMaterial.focusRange = s.focusRange; }
    composer.render();
    if (opts.finish) opts.finish(renderer.domElement, t);
    return s;
  }
  return { composer, render, frame, state, camera, key, lights: { key, fill, rim }, set, look: name };
}
