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
//  - a real lens (Studio's perspective camera): fovFromMm(mm) turns a focal length into the fov, dofFor({ mm, fstop,
//    focusM }) turns lens, f-stop and focus distance into studio()'s `dof`, and orbit / crane / dollyZoom / drone are
//    camera moves as pure functions of t, each returning { position, target, fov } for place() or studio().render().
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
const kOf = (k, what) => { if (!(num(k) && k > 0)) throw new Error(what + ": k is the zoom in px per scene unit, > 0 (got " + k + ")"); return k; };
const station = (name, s) => {
  if (!s || typeof s !== "object") throw new Error('station "' + name + '" must be { position, target, fov } or an iso { target, k }');
  if (s.k !== undefined) return Object.freeze({ name, target: vec(s.target, 'station "' + name + '" target'), k: kOf(s.k, 'station "' + name + '"') });
  return Object.freeze({ name, position: vec(s.position, 'station "' + name + '" position'), target: vec(s.target, 'station "' + name + '" target'), fov: fovOf(s.fov ?? 30, 'station "' + name + '"') });
};
export const poseOf = (s) => (s.k !== undefined ? { target: s.target.clone(), k: s.k } : { position: s.position.clone(), target: s.target.clone(), fov: s.fov });

// The isometric-world view (references/looks.md): one true-isometric direction for every film, Express's projection
// in 3D. An OrthographicCamera whose frustum is the frame in px, so `k` (zoom) is px per scene unit, like engine/iso's
// cam.k. The view never tilts or turns: a pose is { target, k } and the camera only pans and zooms (zoom in log).
// Seen from +x +y +z: the top (+y) is the lightest face, the left (+z) mid, the right (+x) the darkest.
export const ISO = Object.freeze({ azimuth: 45, elevation: Math.atan(Math.SQRT1_2) / DEG, far: 100 }); // 35.264 deg; far: scene units
const isoAxes = () => {
  const back = new THREE.Vector3(1, 1, 1).normalize(); // toward the camera: azimuth 45, elevation 35.264
  const right = new THREE.Vector3(1, 0, -1).normalize();
  return { back, right, up: back.clone().cross(right) };
};
// ponytail: the camera stands ISO.far/2 units from its target; a set over ~50 units (100 m at M = 2) needs a larger ISO.far.
export function isoCamera(W, H) {
  if (!(num(W) && W > 0 && num(H) && H > 0)) throw new Error("isoCamera(W, H): the frame in px");
  const c = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, ISO.far);
  c.userData.iso = true;
  return c;
}
// isoFrame(objectOrBox3, { W, H, margin }): the iso station { target, k } that fits the object's projected box in a W x H
// frame, `margin` times over, centred.
export function isoFrame(target, { W, H, margin = 1.15 } = {}) {
  if (!(num(W) && W > 0 && num(H) && H > 0 && num(margin) && margin >= 1)) throw new Error("isoFrame(): W and H in px, margin >= 1");
  let box;
  if (target && target.isBox3) box = target.clone();
  else if (target && target.isObject3D) { target.updateWorldMatrix(true, true); box = new THREE.Box3().setFromObject(target); }
  else throw new Error("isoFrame() takes an Object3D or a Box3");
  if (box.isEmpty()) throw new Error("isoFrame(): the object has no geometry (an empty box)");
  const { right, up } = isoAxes(), v = new THREE.Vector3();
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
    const r = v.dot(right), u = v.dot(up);
    r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
  }
  if (!(r1 - r0 > 0 || u1 - u0 > 0)) throw new Error("isoFrame(): the object has no size");
  const c = box.getCenter(new THREE.Vector3());
  const k = Math.min(W / ((r1 - r0) * margin || Infinity), H / ((u1 - u0) * margin || Infinity));
  return { target: c.addScaledVector(right, (r0 + r1) / 2 - c.dot(right)).addScaledVector(up, (u0 + u1) / 2 - c.dot(up)), k };
}

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
  if (from?.k !== undefined || to?.k !== undefined) { // iso: the target pans, k zooms in log, the direction never changes
    for (const [n, s] of [["from", from], ["to", to]]) if (!s?.target?.isVector3 || !(num(s.k) && s.k > 0)) throw new Error("travel(): " + n + " is not an iso station { target, k } (both ends of a leg are iso, or neither)");
    const at = (x) => {
      const raw = Math.min(1, Math.max(0, (x - start) / dur)), u = raw <= 0 ? 0 : raw >= 1 ? 1 : f(raw);
      if (u === 1) return { u, target: to.target.clone(), k: to.k };
      return { u, target: from.target.clone().lerp(to.target, u), k: Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * u) };
    };
    const pose = at(t), t0 = Math.max(start, t - 1e-3), t1 = Math.min(start + dur, t + 1e-3);
    pose.speed = t < start || t > start + dur || !(t1 > t0) ? 0 : (at(t1).target.distanceTo(at(t0).target) / (t1 - t0)) * M; // m/s
    return pose;
  }
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
  const hold = (name, leg) => ({ u: 1, ...poseOf(st[name]), speed: 0, leg, station: name });
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

// ---- the lens and the moves of a real camera (all pure functions of t: no state, no randomness, a seek renders the same frame) ----
// fovFromMm(mm, sensorH = 24): the vertical fov in degrees of a focal length `mm` on a sensor `sensorH` mm tall (full frame
// is 24 mm tall: 50 mm -> 26.99 deg, 24 mm -> 53.1 deg, 85 mm -> 16.1 deg).
export function fovFromMm(mm, sensorH = 24) {
  if (!(num(mm) && mm > 0)) throw new Error("fovFromMm(): mm is the focal length in millimetres, > 0 (got " + mm + ")");
  if (!(num(sensorH) && sensorH > 0)) throw new Error("fovFromMm(): sensorH is the sensor height in millimetres, > 0 (got " + sensorH + ")");
  return (2 * Math.atan(sensorH / (2 * mm))) / DEG;
}

// dofFor({ mm, fstop, focusM, mpu }): studio()'s `dof` option ({ focusRange, bokehScale }) for a lens, an f-stop and a
// focus distance `focusM` (metres, from the camera to the subject). Full-frame sensor, 24 mm tall. The thin-lens blur
// circle of a point at infinity is c = mm^2 / (N * (focus - mm)) on the sensor (mm).
//  - bokehScale = 100 * c / 24: the blur as a percentage of the frame height, which is what the effect's bokehScale
//    scales (studio's default 2 is 50 mm f/1.8 focused at 3 m: c = 0.47 mm, 2.0). Linear in c, so wider aperture,
//    longer lens and nearer focus all blur more; f/1.2 is 1.5 x f/1.8 and 4.7 x f/5.6 at the same lens and distance.
//  - focusRange (metres) = the depth of field, 2 * N * z * focus^2 / mm^2 with the full-frame circle of confusion
//    z = 0.03 mm (valid well inside the hyperfocal distance): the range over which the effect ramps to full blur.
//    With focus in metres and mm in millimetres that is 2 * N * z * focusM^2 * 1000 / mm^2 metres (50 mm f/1.8 at 3 m: 0.39 m).
//    Shallower for a wider aperture, a longer lens and a nearer focus; always finite and > 0.
// `mpu` is accepted and checked but not needed: both outputs are in metres and studio() converts to scene units.
export function dofFor({ mm, fstop, focusM, mpu = M } = {}) {
  if (!(num(mm) && mm > 0)) throw new Error("dofFor(): mm is the focal length in millimetres, > 0 (got " + mm + ")");
  if (!(num(fstop) && fstop > 0)) throw new Error("dofFor(): fstop is the f-number (1.2, 1.8, 5.6 ...), > 0 (got " + fstop + ")");
  if (!(num(focusM) && focusM * 1000 > mm)) throw new Error("dofFor(): focusM is the focus distance in metres and must be beyond the lens's focal length (got " + focusM + ")");
  if (!(num(mpu) && mpu > 0)) throw new Error("dofFor(): mpu is metres per scene unit, > 0 (got " + mpu + ")");
  const c = (mm * mm) / (fstop * (focusM * 1000 - mm)); // blur circle on the sensor, mm
  return { focusRange: (2 * fstop * 0.03 * focusM * focusM * 1000) / (mm * mm), bokehScale: (100 * c) / 24 }; // metres: 50 mm f/1.8 at 3 m -> 0.39
}

// The time part of a move: validates start/dur/ease the way travel() does, returns the eased u in 0..1 at t (exactly 0
// before `start` and exactly 1 after `start + dur`, whatever a custom ease returns at the ends).
const moveU = (fn, t, { start = 0, dur, ease = "inOut" }) => {
  if (!(num(t) && num(start))) throw new Error(fn + "(): t and start must be numbers (seconds)");
  if (!(num(dur) && dur > 0)) throw new Error(fn + "(): dur (seconds) must be greater than 0 (got " + dur + ")");
  const f = typeof ease === "function" ? ease : EASE[ease];
  if (!f) throw new Error(fn + '(): unknown ease "' + ease + '" (use ' + Object.keys(EASE).join(", ") + " or a function u -> u)");
  const raw = Math.min(1, Math.max(0, (t - start) / dur));
  return raw <= 0 ? 0 : raw >= 1 ? 1 : f(raw);
};
const need = (fn, name, v) => { if (!(num(v))) throw new Error(fn + "(): " + name + " is a number (got " + v + ")"); return v; };
const dist = (fn, v) => { if (!(num(v) && v > 0)) throw new Error(fn + "(): a distance is in scene units, > 0 (got " + v + ")"); return v; };
// The point at `d` from `c`, seen from azimuth/elevation degrees (the convention of frame(): azimuth 0 is +z, 90 is +x).
const around = (c, d, az, el) => { const a = az * DEG, e = Math.min(89.5, Math.max(-89.5, el)) * DEG; return c.clone().add(new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(d)); };

// orbit(t, { center, radius, from, to, elevation = 20, fov = 30, start, dur, ease }): the camera circles `center` from
// azimuth `from` to `to` (degrees; more than 360 is more than a turn) at a constant `radius` (scene units) and
// `elevation` (degrees above the horizon), aimed at `center`.
export function orbit(t, { center, radius, from, to, elevation = 20, fov = 30, ...time } = {}) {
  const c = vec(center, "orbit(): center"), u = moveU("orbit", t, time);
  dist("orbit", radius); need("orbit", "from (degrees)", from); need("orbit", "to (degrees)", to); need("orbit", "elevation (degrees)", elevation);
  return { position: around(c, radius, from + (to - from) * u, elevation), target: c, fov: fovOf(fov, "orbit()") };
}

// crane(t, { target, from, to, azimuth = 45, distance, fov = 30, start, dur, ease }): a boom arm. The camera sits at
// the end of an arm `distance` long (scene units) pivoting at `target`: its elevation goes from `from` to `to` degrees
// (-89.5..89.5) at a fixed `azimuth`, so it rises or falls on an arc, always aimed at `target`, at constant distance.
// (A straight vertical lift would change the distance and the tilt together; the arm keeps the framing of the subject.)
export function crane(t, { target, from, to, azimuth = 45, distance, fov = 30, ...time } = {}) {
  const c = vec(target, "crane(): target"), u = moveU("crane", t, time);
  dist("crane", distance); need("crane", "from (degrees)", from); need("crane", "to (degrees)", to); need("crane", "azimuth (degrees)", azimuth);
  return { position: around(c, distance, azimuth, from + (to - from) * u), target: c, fov: fovOf(fov, "crane()") };
}

// dollyZoom(t, { target, subjectSize, near, far, fov = 30, azimuth = 45, elevation = 20, start, dur, ease }): the
// vertigo shot. The camera moves along its view axis from distance `near` to `far` (scene units) from `target` while
// the fov changes as fov = 2 * atan(tan(fov0 / 2) * near / d), so a subject at `target` keeps the same size in the
// frame and the background closes in or opens out. `fov` is the fov at `near`; `subjectSize` (the subject's width in
// scene units) must fit the frame there. Throws if the fov would leave 1..179 degrees at either end.
export function dollyZoom(t, { target, subjectSize, near, far, fov = 30, azimuth = 45, elevation = 20, ...time } = {}) {
  const c = vec(target, "dollyZoom(): target"), u = moveU("dollyZoom", t, time);
  dist("dollyZoom", subjectSize); dist("dollyZoom", near); dist("dollyZoom", far); need("dollyZoom", "azimuth (degrees)", azimuth); need("dollyZoom", "elevation (degrees)", elevation);
  const k = Math.tan((fovOf(fov, "dollyZoom()") * DEG) / 2) * near; // half the frame height at the subject, constant along the move
  if (subjectSize / 2 > k) throw new Error("dollyZoom(): the subject (" + subjectSize + " wide) does not fit a frame " + 2 * k + " tall at the subject; widen fov or move near back");
  const d = near + (far - near) * u, f = (2 * Math.atan(k / d)) / DEG;
  fovOf(f, "dollyZoom() at distance " + d);
  fovOf((2 * Math.atan(k / far)) / DEG, "dollyZoom() at far");
  return { position: around(c, d, azimuth, elevation), target: c, fov: f };
}

// drone(t, { from, to, start, dur, ease }): a flight from a station `from` (high and wide) to `to` (low and close), or
// the other way. travel() with no lift (the eased straight line, aim and fov blended) plus a gentle sweep to the side:
// the path bows sideways by 10 % of its length (horizontally, perpendicular to the flight, zero at both ends), so it
// curves like a pilot's turn instead of a rail. Both ends are exactly the stations. Returns { position, target, fov }.
export function drone(t, { from, to, ...time } = {}) {
  moveU("drone", t, time);
  const p = travel(t, from, to, { ...time, lift: 0 }), chord = to.position.clone().sub(from.position);
  const side = new THREE.Vector3().crossVectors(chord, new THREE.Vector3(0, 1, 0)); // horizontal, perpendicular to the flight; 0 for a vertical drop
  if (p.u > 0 && p.u < 1 && side.lengthSq() > 1e-12) p.position.addScaledVector(side.normalize(), 0.1 * chord.length() * Math.sin(Math.PI * p.u));
  return { position: p.position, target: p.target, fov: p.fov };
}

// place(camera, pose): the camera onto a pose: position, fov (the projection updates only when it changed), aim.
// Aspect is the set's own. Returns the camera.
export function place(camera, pose) {
  if (pose.k !== undefined) { // iso: stand back along the one iso direction, zoom = k
    if (!camera.isOrthographicCamera) throw new Error("place(): an iso pose { target, k } needs isoCamera(W, H)");
    camera.position.copy(pose.target).addScaledVector(isoAxes().back, ISO.far / 2);
    camera.up.set(0, 1, 0);
    camera.lookAt(pose.target);
    if (camera.zoom !== pose.k) { camera.zoom = pose.k; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    return camera;
  }
  camera.position.copy(pose.position);
  if (camera.fov !== pose.fov) { camera.fov = pose.fov; camera.updateProjectionMatrix(); }
  camera.lookAt(pose.target);
  camera.updateMatrixWorld();
  return camera;
}

// heroBox(camera, object, W, H): the object's box on screen in px (a W x H frame), from the 8 corners of its world
// bounding box, clamped to the frame. The box is from the visible meshes only (traverseVisible) that attend
// (`userData.attend !== false`): lights, emitters, hidden meshes and the backdrop() pool never count. null: an empty box, every corner behind the camera, or off the frame.
// clipped: true when some corner is behind the camera (the box is then from the corners in front: a lower bound).
// Pass it to type.js layoutFrame(ctx, t, { hero }) so the review can tell whether text covers the subject.
export function heroBox(camera, object, W, H) {
  camera.updateMatrixWorld();
  object.updateMatrixWorld(true);
  const b = new THREE.Box3(), mb = new THREE.Box3();
  object.traverseVisible((o) => {
    if (!o.isMesh || o.userData.attend === false || !o.geometry) return;
    // an InstancedMesh's template (often a unit box scaled per instance) is not its extent: its instances are
    if (o.isInstancedMesh) o.computeBoundingBox();
    const gb = o.isInstancedMesh ? o.boundingBox : (o.geometry.boundingBox ?? (o.geometry.computeBoundingBox(), o.geometry.boundingBox));
    if (!gb || gb.isEmpty()) return;
    b.union(mb.copy(gb).applyMatrix4(o.matrixWorld));
  });
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
