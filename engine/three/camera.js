import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

// One world, one camera, no cut: an explainer that stays inside one persistent set and moves between a few named
// places instead of cutting (a kitchen appliance and its heating element, a bicycle and its freewheel, a hive and one
// brood frame, a server rack and one fan). The viewer never loses their place, because every detail sits visibly
// inside the wide shot. The usual hand-made versions each break one of these:
//  - a camera path that cuts through the set, or jumps between two stations: travel() follows an arc whose middle
//    rises (over the set's top, with `over`), eases in and out, and is a pure function of t (seek anywhere, same
//    pose); route() refuses a leg that starts before the one before it ends;
//  - the speed is not known: every pose carries `speed` in m/s, so the set can add motion blur to a fast leg;
//  - attention: on each beat everything but the subject fades to a pale, desaturated, translucent ghost and the
//    subject alone keeps its colour. attend() does it on CLONED materials (kit materials are shared by name: a write
//    on one would ghost every model that wears it) and puts back the exact original object when released, so colour,
//    opacity, transparent and depthWrite are what they were;
//  - a Short that replays: loopEnd() builds the closing leg back to `home`, so the last pose is the first.
// Units: positions and targets are scene units; lengths you type (`lift`, `clear`) are metres, `speed` is m/s, and
// `fov` is the vertical field of view in degrees. Visual only: nothing here touches physics.

const DEG = Math.PI / 180;
const smooth = (u) => u * u * (3 - 2 * u);
const EASE = { linear: (u) => u, inOut: (u) => u * u * u * (u * (6 * u - 15) + 10), in: (u) => u * u * u, out: (u) => 1 - (1 - u) ** 3 }; // inOut: speed and acceleration are 0 at both ends
const num = (v) => typeof v === "number" && Number.isFinite(v);
const vec = (v, what) => {
  if (v && v.isVector3) { if (!(num(v.x) && num(v.y) && num(v.z))) throw new Error(what + " has a NaN or infinite coordinate"); return v.clone(); }
  if (v && typeof v === "object" && num(v.x) && num(v.y) && num(v.z)) return new THREE.Vector3(v.x, v.y, v.z);
  throw new Error(what + " must be a THREE.Vector3 or { x, y, z } of numbers in scene units");
};
const fovOf = (f, what) => { if (!(num(f) && f > 1 && f < 179)) throw new Error(what + ": fov is the vertical field of view in degrees, between 1 and 179 (got " + f + ")"); return f; };
const station = (name, s) => {
  if (!s || typeof s !== "object") throw new Error('station "' + name + '" must be { position, target, fov }');
  return Object.freeze({ name, position: vec(s.position, 'station "' + name + '" position'), target: vec(s.target, 'station "' + name + '" target'), fov: fovOf(s.fov ?? 30, 'station "' + name + '"') });
};

// stations({ home, ...named }): { name: { name, position, target, fov } }, frozen. `home` is required: it is the
// pose the film opens on and, with loopEnd(), ends on. frame() makes one from an object.
export function stations({ home, ...named } = {}) {
  if (!home) throw new Error('stations() needs a "home": the wide shot the film opens and closes on (frame(world, { fov: 18, elevation: 35 }))');
  const out = { home: station("home", home) };
  for (const [k, v] of Object.entries(named)) out[k] = station(k, v);
  return Object.freeze(out);
}

// frame(objectOrBox3, { fov, aspect, azimuth, elevation, margin }): a station that fits the object's bounding sphere
// inside the smaller half-angle of the lens (the vertical one, or the horizontal one for a tall frame), `margin` times
// over. azimuth: degrees around y from +z (0 looks from the front, toward -z); elevation: degrees above the
// horizon, kept under 89.5 so lookAt never flips on a top shot. A long lens (small fov) stands further back.
export function frame(target, { fov = 30, aspect = 16 / 9, azimuth = 45, elevation = 30, margin = 1.15 } = {}) {
  fovOf(fov, "frame()");
  if (!(num(aspect) && aspect > 0 && num(margin) && margin >= 1 && num(azimuth) && num(elevation))) throw new Error("frame(): aspect > 0, margin >= 1, azimuth and elevation in degrees");
  let box;
  if (target && target.isBox3) box = target.clone();
  else if (target && target.isObject3D) { target.updateWorldMatrix(true, true); box = new THREE.Box3().setFromObject(target); }
  else throw new Error("frame() takes an Object3D or a Box3");
  if (box.isEmpty()) throw new Error("frame(): the object has no geometry (an empty box); add its parts before framing it");
  const s = box.getBoundingSphere(new THREE.Sphere());
  if (!(s.radius > 0)) throw new Error("frame(): the object has no size");
  const half = Math.min((fov * DEG) / 2, Math.atan(Math.tan((fov * DEG) / 2) * aspect)), d = (s.radius * margin) / Math.sin(half);
  const az = azimuth * DEG, el = Math.min(89.5, Math.max(-89.5, elevation)) * DEG;
  return { position: s.center.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(d)), target: s.center.clone(), fov };
}

// travel(t, from, to, { start, dur, ease, lift, over, clear }): the pose between two stations at time t, a pure
// function of t. The position follows a quadratic Bezier whose middle rises `h`: by default a quarter of the chord;
// `lift` (metres) sets it (0 is a straight push); `over` (an Object3D or Box3) raises it until the middle clears the
// object's top by `clear` metres (default 10 cm). The target and fov blend on the eased u. Returns
// { u, position, target, fov, speed } with speed in m/s (0 outside the leg). Before `start` the pose is `from`, after
// the leg it is `to` exactly. ease: "linear", "inOut" (default), "in", "out", or a function u -> u.
export function travel(t, from, to, { start = 0, dur, ease = "inOut", lift, over, clear = 0.1 } = {}) {
  if (!(num(t) && num(start))) throw new Error("travel(): t and start must be numbers (seconds)");
  if (!(num(dur) && dur > 0)) throw new Error("travel(): dur (seconds) must be greater than 0, or the leg is a cut (got " + dur + ")");
  const f = typeof ease === "function" ? ease : EASE[ease];
  if (!f) throw new Error('travel(): unknown ease "' + ease + '" (use ' + Object.keys(EASE).join(", ") + " or a function u -> u)");
  for (const [n, s] of [["from", from], ["to", to]]) if (!s || !s.position?.isVector3 || !s.target?.isVector3 || !num(s.fov)) throw new Error("travel(): " + n + " is not a station { position, target, fov }");
  if (lift !== undefined && !num(lift)) throw new Error("travel(): lift is a number of metres");
  const p0 = from.position, p2 = to.position, mid = p0.clone().add(p2).multiplyScalar(0.5);
  let h = lift !== undefined ? lift / M : 0.25 * p0.distanceTo(p2);
  if (over) {
    if (!over.isBox3 && !over.isObject3D) throw new Error("travel(): over is an Object3D or a Box3");
    if (over.isObject3D) over.updateWorldMatrix(true, true);
    const b = over.isBox3 ? over : new THREE.Box3().setFromObject(over);
    if (!b.isEmpty()) h = Math.max(h, b.max.y + clear / M - mid.y);
  }
  const p1 = mid.clone(); p1.y += 2 * h; // a quadratic Bezier's middle rises half its control point's offset
  const at = (x) => {
    const u = f(Math.min(1, Math.max(0, (x - start) / dur)));
    if (u === 1) return { u, position: p2.clone(), target: to.target.clone(), fov: to.fov }; // exactly the station: no drift, so a loop closes
    const a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u;
    return { u, position: new THREE.Vector3().addScaledVector(p0, a).addScaledVector(p1, b).addScaledVector(p2, c), target: from.target.clone().lerp(to.target, u), fov: from.fov + (to.fov - from.fov) * u };
  };
  const pose = at(t);
  if (t < start || t > start + dur) pose.speed = 0;
  else {
    const t0 = Math.max(start, t - 1e-3), t1 = Math.min(start + dur, t + 1e-3);
    pose.speed = t1 > t0 ? (at(t1).position.distanceTo(at(t0).position) / (t1 - t0)) * M : 0; // m/s
  }
  return pose;
}

// route(st, legs): a film's whole camera path. legs: [{ to, start, dur, ease, lift, over, clear }] in time order;
// each leg leaves from the one before's `to` (the first from `home`), and may not start before it ends (a leg cannot
// jump: that would be a cut). Returns { legs, end, at(t) }. at(t): holds `home` before the first leg and each
// station after its leg. The pose carries `leg` (the leg in flight, else the last one finished; -1 before the first)
// and `station` (its name while holding, null in flight).
export function route(st, legs) {
  if (!st || !st.home) throw new Error("route() needs stations() made with a home");
  if (!Array.isArray(legs)) throw new Error("route(): legs is an array of { to, start, dur }");
  const out = []; let from = "home", free = -Infinity;
  legs.forEach((l, i) => {
    if (!l || !Object.hasOwn(st, l.to)) throw new Error("route(): leg " + i + ' goes to "' + l?.to + '", not a station (' + Object.keys(st).join(", ") + ")");
    if (!num(l.start)) throw new Error("route(): leg " + i + " needs a start time (seconds)");
    if (!(num(l.dur) && l.dur > 0)) throw new Error("route(): leg " + i + " needs dur > 0 seconds");
    if (l.start < free - 1e-9) throw new Error("route(): leg " + i + " starts at " + l.start + " s, before the leg before it ends at " + free + " s; a leg cannot jump (that is a cut)");
    out.push({ ...l, from, end: l.start + l.dur });
    from = l.to; free = l.start + l.dur;
  });
  const opts = (l) => ({ start: l.start, dur: l.dur, ease: l.ease, lift: l.lift, over: l.over, clear: l.clear });
  const hold = (name, leg) => { const s = st[name]; return { u: 1, position: s.position.clone(), target: s.target.clone(), fov: s.fov, speed: 0, leg, station: name }; };
  const api = {
    legs: out, end: out.length ? out.at(-1).end : 0,
    at(t) {
      if (!num(t)) throw new Error("route.at(t): t is a number of seconds");
      let i = -1;
      for (let k = 0; k < out.length; k++) if (t >= out[k].start) i = k;
      if (i < 0) return hold("home", -1);
      const l = out[i];
      if (t >= l.end) return hold(l.to, i);
      return { ...travel(t, st[l.from], st[l.to], opts(l)), leg: i, station: null };
    },
  };
  return api;
}

// loopEnd(st, { end, dur, ...travel options }): the leg that closes a Short: it arrives at `home` exactly at `end`,
// the film's last frame time ((frames - 1) / fps), so route.at(end) equals route.at(0). Put it last in the route's legs.
export function loopEnd(st, { end, dur = 1.5, ...opts } = {}) {
  if (!st || !st.home) throw new Error("loopEnd() needs stations() made with a home");
  if (!num(end)) throw new Error("loopEnd(): pass { end }, the film's last frame time in seconds ((frames - 1) / fps)");
  if (!(num(dur) && dur > 0)) throw new Error("loopEnd(): dur must be greater than 0 seconds");
  if (end - dur < 0) throw new Error("loopEnd(): the film is " + end + " s long, shorter than the " + dur + " s closing leg; shorten dur");
  return { ...opts, to: "home", start: end - dur, dur };
}

// place(camera, pose): the camera onto a pose: position, fov (the projection updates only when it changed), aim.
// Aspect is the set's own. Returns the camera.
export function place(camera, pose) {
  camera.position.copy(pose.position);
  if (camera.fov !== pose.fov) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  return camera;
}

const frac = (v, n) => { if (!(num(v) && v >= 0 && v <= 1)) throw new Error("attend(): " + n + " is a fraction between 0 and 1 (got " + v + ")"); return v; };
const objects = (s) => {
  const list = Array.isArray(s) ? s : [s];
  if (!list.length || !list.every((o) => o && o.isObject3D)) throw new Error("attend(): subjects are an Object3D or an array of them");
  return list;
};

// attend(root, { ghost, desat, light, dur, edge, keep }): attention by ghosting, keyed by time like cutaway's on()/off(),
// so a seek to any t gives the same frame. focus(subjects, t) fades every mesh under `root` that is not inside a
// subject (a descendant of a subject is inside) to a ghost over `dur` seconds; focus again at a later t moves the
// attention; release(t) brings everything back. Both return the api, so they chain.
//  ghost: the opacity left (0.25); desat: how much colour goes (0.85); light: how far toward white (0.35);
//  edge: a fresnel rim on a lit ghost (0 is off; about 0.3 to 0.8 reads as an x-ray); keep: objects that never ghost
//  (the floor or sweep: without it the world shows the void under the set).
// Never ghosted: a mesh in `keep` or inside one, `userData.attend = false` (on it or a parent), and the cutaway's own
// parts (`userData.cutaway`: caps and stencils keep their colour). A material without a `.color` (a ShaderMaterial:
// particles, water) is left as it is and listed once in `skipped`. Ghosted meshes still cast their shadow.
// at(t): once per frame, AFTER every other at() (cut.at(t) included: the frame order is cut, then attention) and
// before the render. It swaps each ghosted mesh's material for a ghost of it, made once per original material and
// repainted from the original every frame (a set that animates a colour still shows through), and, at weight 0, puts
// the ORIGINAL object back (the same reference, never a copy). A set that swaps in a new material while a mesh is not
// ghosted is picked up. Make a cutaway before the first at(): the cut clones the materials it finds, and a ghost it
// finds first would be read as the part's own transparent material (no cap).
// weight(object, t) is a mesh's ghost weight at t, 0 to 1.
export function attend(root, { ghost = 0.25, desat = 0.85, light = 0.35, dur = 0.5, edge = 0, keep = [] } = {}) {
  if (!root || !root.isObject3D) throw new Error("attend(root): root is the Object3D (the world) whose meshes fade");
  frac(ghost, "ghost"); frac(desat, "desat"); frac(light, "light");
  if (!(num(dur) && dur > 0)) throw new Error("attend(): dur must be greater than 0 seconds");
  if (!(num(edge) && edge >= 0)) throw new Error("attend(): edge is 0 (off) or a positive strength");
  const keepSet = new Set([].concat(keep).length ? objects(keep) : []); // nothing kept is allowed
  const keys = [], ghosts = new Map(), origOf = new WeakMap(), skipped = [], skippedSeen = new Set(), hsl = {};
  const key = (k) => { const i = keys.findIndex((x) => x.t === k.t); if (i >= 0) keys[i] = k; else keys.push(k); keys.sort((a, b) => a.t - b.t); };
  const within = (o, set) => { for (let x = o; x; x = x.parent) if (set.has(x)) return true; return false; };
  const kept = (o) => { for (let x = o; x; x = x.parent) if (keepSet.has(x) || x.userData.attend === false || x.userData.cutaway) return true; return false; };
  const weight = (o, t) => {
    if (kept(o)) return 0;
    let w = 0;
    for (let i = 0; i < keys.length && keys[i].t <= t; i++) {
      const k = keys[i], e = i + 1 < keys.length && keys[i + 1].t <= t ? keys[i + 1].t : t, goal = k.subjects && !within(o, k.subjects) ? 1 : 0;
      w += (goal - w) * smooth(Math.min(1, (e - k.t) / dur));
    }
    return w;
  };
  const make = (m) => {
    const g = m.clone();
    g.clippingPlanes = m.clippingPlanes; // the SAME array: Material.copy clones the planes, which would freeze a cutaway's moving plane
    if (m.uniforms) g.uniforms = m.uniforms;
    const u = { value: 0 };
    g.onBeforeCompile = function (shader, renderer) {
      if (m.onBeforeCompile) m.onBeforeCompile.call(this, shader, renderer);
      if (!(edge > 0) || !/#include <opaque_fragment>/.test(shader.fragmentShader) || !/vViewPosition/.test(shader.fragmentShader)) return;
      shader.uniforms.uGhostEdge = u;
      shader.fragmentShader = "uniform float uGhostEdge;\n" + shader.fragmentShader.replace("#include <opaque_fragment>", "outgoingLight += vec3(uGhostEdge) * pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);\n#include <opaque_fragment>");
    };
    g.customProgramCacheKey = () => (m.customProgramCacheKey ? m.customProgramCacheKey() : "") + (edge > 0 ? "|ghost-edge" : "");
    g.transparent = true; g.depthWrite = false; // from creation: transparent is part of the program key, never toggled on a live material
    g.userData = { ghost: true };
    origOf.set(g, m);
    return { g, u };
  };
  const paint = ({ g, u }, m, w) => {
    m.color.getHSL(hsl);
    g.color.setHSL(hsl.h, hsl.s * (1 - desat * w), hsl.l + (1 - hsl.l) * light * w);
    g.opacity = m.opacity * (1 - (1 - ghost) * w);
    g.map = m.map; if (m.emissive && g.emissive) { g.emissive.copy(m.emissive); g.emissiveIntensity = m.emissiveIntensity; }
    u.value = edge * w;
  };
  const api = {
    skipped, weight,
    focus(subjects, t = 0) {
      if (!num(t)) throw new Error("attend().focus(subjects, t): t is a number of seconds");
      key({ t, subjects: new Set(objects(subjects)) });
      return api;
    },
    release(t = 0) {
      if (!num(t)) throw new Error("attend().release(t): t is a number of seconds");
      key({ t, subjects: null });
      return api;
    },
    at(t) {
      root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const w = weight(o, t), one = (cur) => {
          const orig = origOf.get(cur) || cur;
          if (w === 0) return orig;
          if (!orig.color) {
            if (!skippedSeen.has(orig)) { skippedSeen.add(orig); skipped.push((o.name || o.type) + ": " + (orig.name || orig.type) + " has no .color, left as it is"); }
            return orig;
          }
          if (!ghosts.has(orig)) ghosts.set(orig, make(orig));
          const gm = ghosts.get(orig);
          paint(gm, orig, w);
          return gm.g;
        };
        if (!Array.isArray(o.material)) { const n = one(o.material); if (n !== o.material) o.material = n; return; }
        const n = o.material.map(one);
        if (n.some((m, i) => m !== o.material[i])) o.material = n;
      });
    },
  };
  return api;
}
