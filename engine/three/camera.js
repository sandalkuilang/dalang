import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";
import { readTime } from "./type.js";

// One world, one camera, no cut: an explainer that stays inside one persistent set and moves between a few named
// places instead of cutting (a kitchen appliance and its heating element, a bicycle and its freewheel, a hive and one
// brood frame, a server rack and one fan). The viewer never loses their place, because every detail sits visibly
// inside the wide shot. The usual hand-made versions each break one of these:
//  - a camera path that cuts through the set, or jumps between two stations: travel() follows an arc whose middle
//    rises (over the set's top, with `over`), eases in and out, and is a pure function of t (seek anywhere, same
//    pose); route() refuses a leg that starts before the one before it ends;
//  - cues and shots share one frame grid: snap/shotAt/overlayWindow snap a cue the way a cut is snapped (a raw cue
//    against a snapped cut lands in the previous shot by up to half a frame); windowProblems names every overlay
//    window that is empty or shorter than its read time;
//  - the speed is not known: every pose carries `speed` in m/s, so the set can add motion blur to a fast leg;
//  - attention: on each beat everything but the subject fades to a pale, desaturated, translucent ghost and the
//    subject alone keeps its colour. attend() does it on CLONED materials (kit materials are shared by name: a write
//    on one would ghost every model that wears it) and puts back the exact original object when released, so colour,
//    opacity, transparent and depthWrite are what they were;
//  - a Short that replays: loopEnd() builds the closing leg back to `home`, so the last pose is the first;
//  - text over the subject is judged by eye: heroBox() projects an object's bounding box to px, for type.js layoutFrame.
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
// `lift` (metres) sets it (0 is a straight push); `over` (a Box3: the set's box, or the envelope of a moving part's
// travel) raises it until the middle clears its top by `clear` metres (default 10 cm). A Box3 and not an object, so the
// path never follows whatever posed the world last. The target and fov blend on the eased u. Returns
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
    if (!over.isBox3) throw new Error("travel(): over is a Box3 (new THREE.Box3().setFromObject(world), or the envelope of a moving part's travel); an Object3D's box would follow the world's pose and the path would stop being a function of t. route() takes an Object3D and measures it once, when the route is built");
    if (!over.isEmpty()) h = Math.max(h, over.max.y + clear / M - mid.y);
  }
  const p1 = mid.clone(); p1.y += 2 * h; // a quadratic Bezier's middle rises half its control point's offset
  const at = (x) => {
    const raw = Math.min(1, Math.max(0, (x - start) / dur)), u = raw <= 0 ? 0 : raw >= 1 ? 1 : f(raw); // the ends are the stations themselves, whatever a custom ease returns at 0 and 1
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
// jump: that would be a cut). A leg's `over` (an Object3D or a Box3) is measured once, when the route is built. Returns { legs, end, at(t) }. at(t): holds `home` before the first leg and each
// station after its leg. The pose carries `leg` (the leg in flight, else the last one finished; -1 before the first)
// and `station` (its name while holding, null in flight).
export function route(st, legs) {
  if (!st || !st.home) throw new Error("route() needs stations() made with a home");
  if (!Array.isArray(legs)) throw new Error("route(): legs is an array of { to, start, dur }");
  const out = []; let from = "home", free = -Infinity;
  // `over` as an Object3D is measured ONCE, here, so the path stays a function of t when a part of the set moves later
  // (a lid opening, a ball bouncing): it is the set as it stands when the route is built (pose it first, or pass a Box3
  // covering the motion).
  const measure = (over) => {
    if (!over) return over;
    if (over.isBox3) return over.clone();
    if (over.isObject3D) { over.updateWorldMatrix(true, true); return new THREE.Box3().setFromObject(over); }
    throw new Error("route(): over is an Object3D or a Box3");
  };
  legs.forEach((l, i) => {
    if (!l || !Object.hasOwn(st, l.to)) throw new Error("route(): leg " + i + ' goes to "' + l?.to + '", not a station (' + Object.keys(st).join(", ") + ")");
    if (!num(l.start)) throw new Error("route(): leg " + i + " needs a start time (seconds)");
    if (!(num(l.dur) && l.dur > 0)) throw new Error("route(): leg " + i + " needs dur > 0 seconds");
    if (l.start < free - 1e-9) throw new Error("route(): leg " + i + " starts at " + l.start + " s, before the leg before it ends at " + free + " s; a leg cannot jump (that is a cut)");
    out.push({ ...l, over: measure(l.over), from, end: l.start + l.dur });
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

// heroBox(camera, object, W, H): the object's box on screen in px (a W x H frame), from the 8 corners of its world
// bounding box, clamped to the frame. null: an empty box, every corner behind the camera, or off the frame.
// clipped: true when some corner is behind the camera (the box is then from the corners in front: a lower bound).
// Pass it to type.js layoutFrame(ctx, t, { hero }) so the review can tell whether text covers the subject.
export function heroBox(camera, object, W, H) {
  camera.updateMatrixWorld();
  const b = new THREE.Box3().setFromObject(object, true);
  if (b.isEmpty()) return null;
  const v = new THREE.Vector3(), r1 = (x) => Math.round(x * 10) / 10, cl = (x, a, z) => Math.min(Math.max(x, a), z);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, clipped = false;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
    if (v.clone().applyMatrix4(camera.matrixWorldInverse).z > -camera.near) { clipped = true; continue; }
    v.project(camera);
    const x = ((v.x + 1) / 2) * W, y = ((1 - v.y) / 2) * H;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x0 === Infinity) return null;
  const box = { x0: r1(cl(x0, 0, W)), y0: r1(cl(y0, 0, H)), x1: r1(cl(x1, 0, W)), y1: r1(cl(y1, 0, H)) };
  if (box.x1 <= box.x0 || box.y1 <= box.y0) return null;
  return clipped ? { ...box, clipped: true } : box;
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
// before the render. It swaps each ghosted mesh's material for a ghost of it, made once per mesh and original material
// (two parts on one shared material fade at their own weights) and repainted from the original every frame (a set that animates a colour still shows through), and, at weight 0, puts
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
  const keys = [], ghosts = new WeakMap(), origOf = new WeakMap(), skipped = [], skippedSeen = new Set(), hsl = {};
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
          let mine = ghosts.get(o); if (!mine) ghosts.set(o, mine = new Map());
          if (!mine.has(orig)) mine.set(orig, make(orig)); // one ghost per mesh and material: parts sharing a material sit at different weights
          const gm = mine.get(orig);
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

// Cues and shots on one frame grid. A cut is snapped to a frame (Math.round(t * fps) / fps); a cue read raw against a
// snapped cut lands in the shot before it when the cut rounds later (up to half a frame). Everything below works on
// whole frame numbers, so there is no epsilon. Times are seconds, fps is frames per second.
const fr = (t, fps) => Math.round(t * fps);
const fpsOf = (fn, o) => {
  const fps = o?.fps;
  if (!(num(fps) && fps > 0)) throw new Error(fn + "(): fps must be a number greater than 0 (got " + fps + ")");
  return fps;
};
const timeOf = (fn, t, what) => { if (!num(t)) throw new Error(fn + "(): " + what + " must be a number of seconds (got " + t + ")"); return t; };
const checkShots = (fn, shots) => {
  if (!Array.isArray(shots)) throw new Error(fn + "(): shots is an array of { start, end, name } in seconds");
  let prev = -Infinity;
  shots.forEach((s, i) => {
    const id = '"' + (s?.name ?? "shot " + i) + '"';
    if (!s || !num(s.start) || !num(s.end)) throw new Error(fn + "(): " + id + " needs a start and an end (seconds)");
    if (!(s.end > s.start)) throw new Error(fn + "(): " + id + " ends at " + s.end + " s, not after its start " + s.start + " s");
    if (s.start < prev) throw new Error(fn + "(): " + id + " starts before the shot before it; list shots in time order");
    prev = s.start;
  });
};

// The time of the frame nearest `t`: how a cut is snapped, so snap a cue the same way.
export function snap(t, fps) {
  timeOf("snap", t, "t"); fpsOf("snap", { fps });
  return fr(t, fps) / fps;
}

// Index of the shot that holds the frame of `t` (a shot spans frames [snapped start, snapped end)), else -1.
export function shotAt(t, shots, o) {
  const fps = fpsOf("shotAt", o); timeOf("shotAt", t, "t"); checkShots("shotAt", shots);
  const f = fr(t, fps);
  return shots.findIndex((s) => fr(s.start, fps) <= f && f < fr(s.end, fps));
}

// The window an overlay cued at `cue` has: from its snapped cue to the snapped end of its shot. No shot holds the cue:
// index -1 and dur 0 (windowProblems reports it). Never throws on a cue outside the shots.
export function overlayWindow(cue, shots, o) {
  const fps = fpsOf("overlayWindow", o); timeOf("overlayWindow", cue, "cue");
  const index = shotAt(cue, shots, { fps }), from = snap(cue, fps);
  if (index < 0) return { index: -1, name: undefined, from, to: from, dur: 0 };
  const s = shots[index], f = fr(cue, fps), e = fr(s.end, fps);
  return { index, name: s.name, from, to: e / fps, dur: (e - f) / fps };
}

// Problems (strings, each naming the item) for overlay or label windows that are empty, in no shot, or shorter than
// their read time. items: { name, cue, text?, end?, min? }: `end` gives an explicit window, else the cue's shot decides;
// `min` (item, else option, else readTime(text)) is the shortest window in seconds. [] when all is well; the caller
// throws on a non-empty list.
export function windowProblems(items, shots, o = {}) {
  const fps = fpsOf("windowProblems", o); checkShots("windowProblems", shots);
  if (!Array.isArray(items)) throw new Error("windowProblems(): items is an array of { name, cue, text, end, min }");
  if (o.min !== undefined && !num(o.min)) throw new Error("windowProblems(): the option min is a number of seconds, got " + JSON.stringify(o.min));
  const out = [], r3 = (x) => Math.round(x * 1000) / 1000;
  const lastEnd = shots.length ? Math.max(...shots.map((s) => fr(s.end, fps))) / fps : 0;
  items.forEach((it, i) => {
    const name = it?.name ?? "item " + i;
    if (!it || !num(it.cue)) { out.push(name + ": needs a cue (seconds)"); return; }
    let from = snap(it.cue, fps), to, dur;
    if (it.end !== undefined) {
      if (!num(it.end)) { out.push(name + ": end must be a number of seconds"); return; }
      to = snap(it.end, fps); dur = (fr(it.end, fps) - fr(it.cue, fps)) / fps;
    } else {
      const w = overlayWindow(it.cue, shots, { fps });
      if (w.index < 0) { out.push(name + ": cue " + it.cue + " s is in no shot (shots end at " + r3(lastEnd) + " s)"); return; }
      to = w.to; dur = w.dur;
    }
    if (dur <= 0) { out.push(name + ": window is zero or negative (cue " + it.cue + " s -> " + r3(to) + " s at " + fps + " fps)"); return; }
    if (it.min !== undefined && !num(it.min)) { out.push(name + ": min must be a number of seconds"); return; }
    const need = it.min ?? o.min ?? (it.text !== undefined ? readTime(it.text) : 0);
    if (dur < need) out.push(name + ": window " + r3(dur) + " s is under its minimum read time " + r3(need) + " s");
  });
  return out;
}
