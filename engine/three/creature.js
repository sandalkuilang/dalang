import { THREE } from "./three-vendor.js";
import { M, G } from "./kit.js";
import { sweep } from "./fur.js";

// Creatures that walk and climb: a gait rig whose feet are planted by raycast on the set's solid surfaces (floors, walls, undersides),
// and a body that follows a curve and lies along the surface normal. Procedural and baked: path() places every foot once, at(t) only
// reads the result, so a planted foot is exactly where it landed and never slides.
//   - gait(): stride length and frequency from size and speed by dynamic similarity (never typed per film): Froude number
//     Fr = v²/(g·h) with h the leg length, stride λ = 2.3·h·Fr^0.3, frequency f = v/λ = Fr^0.2·sqrt(g/h)/2.3
//     (Alexander 1976, Nature 261:129; Alexander & Jayes 1983, J. Zool. 201:135). Fitted on mammals; for a sprawler or an insect h is
//     the leg's reach, an approximation, so no species number is typed anywhere.
//   - GAITS: footfall order and duty factor by name. walk: lateral sequence, duty 0.65 (Hildebrand 1965, Science 150:701), a walk
//     becomes a trot near Fr 0.5 (Alexander 1989, Physiol. Rev. 69:1199). trot: diagonal pairs, duty 0.45. sprawl: a lizard trots in
//     diagonal pairs with the trunk bending side to side, duty 0.6 (Farley & Ko 1997, J. Exp. Biol. 200:2177; on walls too, Autumn et al.
//     2006, J. Exp. Biol. 209:260). tripod: an insect's alternating tripods, duty 0.6 (Wilson 1966, Annu. Rev. Entomol. 11:103; Full & Tu
//     1991, J. Exp. Biol. 156:215).
//   - rig(): the legs (hips, rest feet, 2 or 3 segments) and the spine, drawn on a body from fur.js sweep() (the trunk follows the surface
//     and sways, the chest breathes, the head turns toward a stimulus) with a swept tube per leg segment. path(): footholds, IK (law of
//     cosines), contacts. restingBreath(): a mammal's resting breath rate by mass (Stahl 1967, J. Appl. Physiol. 22:453); a reptile or an
//     insect gets its cited rate from the set, or none.
// Units: everything here is metres. The curve and the set are in scene units: they are multiplied by kit.js M (g = G·M m/s²); a drawn
// creature lives in `group` at scale 1/M. The body frame has +X forward, +Y up (the surface normal), +Z right.
// Not covered: gallop, jumps, flight, people, swimming, a body bending over a corner (the body is one rigid frame plus the trunk's sway,
// so a corner's radius is chosen against the body's length and the legs' reach: examples/lizard.js wallClimb), a surface that moves after the walk was built (feet are placed on the set as it
// is when path() runs; the drawn normals and the fur's comb stay at rest, the sway and the breath being small), a start-up ramp (speed is constant; the legs take one step in place before the walk starts, so start the walk
// before the shot shows it).

const DEG = Math.PI / 180, TAU = 2 * Math.PI;
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const CLING = Math.cos(50 * DEG); // a foothold flatter than this (normal · up) is walkable; steeper needs pads or claws
const STEP = 0.001; // a touchdown that moved less than this (metres) is no step
const POLES = ["forward", "back", "out", "up"];
const num = (x, mm = 1000) => (x * mm).toFixed(1);
// refuse(id, message): the one way this module and the pieces built on it (examples/lizard.js) refuse an input. The Error carries
// `refusal` = the id, a literal, one per site; selfcheck.mjs reads the sources and fails when an id has no case of its own.
export function refuse(id, message) {
  throw Object.assign(new Error(message), { refusal: id });
}
// The trunk's standing wave along x: 1 at the shoulder girdle xF, -1 at the pelvis xH, the head riding with the shoulders and the tail
// carrying the wave on for one more trunk length (then it holds).
const swayShape = (x, xF, xH) => Math.cos(Math.PI * clamp((x - xF) / (xF - xH), -2, 0));
// A mammal's resting breath rate, in Hz, by body mass in kg: 53.5·m^-0.26 breaths a minute (Stahl 1967, J. Appl. Physiol. 22:453).
export const restingBreath = (kg) => {
  if (!fin(kg) || !(kg > 0)) refuse("breath.mass", "restingBreath(): the body mass in kilograms, > 0");
  return (53.5 * kg ** -0.26) / 60;
};
const HEAD_MAX = 70 * DEG; // how far the head turns from the body's line

const leg4 = (LF, RF, LH, RH) => ({ LF, RF, LH, RH });
export const GAITS = {
  walk: { phases: leg4(0.25, 0.75, 0, 0.5), duty: 0.65, maxFr: 0.6, sway: 0, next: "trot" },
  trot: { phases: leg4(0, 0.5, 0.5, 0), duty: 0.45, maxFr: 3, sway: 0, next: "a gallop (not here yet)" },
  sprawl: { phases: leg4(0, 0.5, 0.5, 0), duty: 0.6, maxFr: 3, sway: 12, next: "a gallop (not here yet)" }, // sway: the trunk's bend, degrees
  tripod: { phases: { L1: 0, R2: 0, L3: 0, R1: 0.5, L2: 0.5, R3: 0.5 }, duty: 0.6, maxFr: 3, sway: 0, next: "a gallop (not here yet)" },
};

// The gait of an animal with legs h long (metres) going at v (m/s): its Froude number, stride length and frequency.
export function gait(name, { h, v, duty } = {}) {
  const def = GAITS[name];
  if (!def) refuse("gait.name", `gait(): "${name}" is not a gait here: ${Object.keys(GAITS).join(", ")}`);
  if (!fin(h) || !(h > 0)) refuse("gait.h", "gait(): h is the leg length, in metres, > 0 (hip to the foot at rest)");
  if (!fin(v) || !(v > 0)) refuse("gait.v", "gait(): v is the speed, in metres per second, > 0");
  if (duty !== undefined && !(fin(duty) && duty >= 0.2 && duty <= 0.9)) refuse("gait.duty", "gait(): duty is the part of a stride a foot is on the ground, 0.2 to 0.9");
  const g = G * M;
  if (!(g > 0)) refuse("gait.gravity", "gait(): no gravity in this set, so a gait has no Froude number (a creature walks by its weight)");
  const Fr = (v * v) / (g * h);
  if (Fr > def.maxFr) refuse("gait.froude", `gait(): ${name} at Fr ${Fr.toFixed(2)} (${v} m/s on ${h} m legs) is faster than a ${name} goes: use ${def.next}, or slow down`);
  const stride = 2.3 * h * Fr ** 0.3;
  return { name, Fr, stride, f: v / stride, duty: duty ?? def.duty, phases: { ...def.phases }, sway: def.sway };
}

// A rig: legs = [{ name, hip: [x, y, z], foot: [x, z], segments: [l1, l2] or [l1, l2, l3], bend, ankle, radius }] in metres in the
// body frame (hip y above the surface the body rides on, the rest foot at y 0; z > 0 is the right side). bend: which way the knee
// points, "out" (sprawled), "forward", "back" or "up". A third segment is the foot: it meets the surface at `ankle` radians (45
// degrees) from the normal. radius: the leg's thickness at the hip and at the foot, [top, tip] or one number (metres). spine =
// { length, sway } (sway: the trunk's bend in degrees, the gait's own when not given; length is the body's own along x when there is one).
// cling: true for an animal that grips a steep surface (pads, claws); without it a wall or a ceiling is refused.
// Drawing: body is a mesh from fur.js sweep() (its vertices follow the trunk's sway and the breath), or null for a bare rig that
// draws nothing. It is modelled in the body frame (+X forward, +Y up) and carries the colours of its skin; `parts` (ears, crest) and
// `head` (an Object3D pivoting at the neck: rotation.y turns it) ride with it. Each leg segment is a swept tube in `material`
// (the body's by default) coloured `colour` (a THREE.Color or (s, a) => Color; the body's mean colour by default).
// breath: { rate (Hz), depth = 0.02 }: the chest's girth swells and shrinks by depth, also while standing.
export function rig(body, { legs, spine = {}, cling = false, head = null, breath = null, parts = [], material, colour } = {}) {
  if (body !== null && !(body?.isMesh && body.geometry?.userData?.sweep)) refuse("rig.body", "rig(): body is a mesh from fur.js sweep(), or null for a bare rig");
  if (!Array.isArray(legs) || !legs.length) refuse("rig.legs", "rig(): legs is a list of { name, hip, foot, segments }, at least one");
  let length = spine?.length;
  if (body && length === undefined) { body.geometry.computeBoundingBox(); const b = body.geometry.boundingBox; length = b.max.x - b.min.x; }
  if (!fin(length) || !(length > 0)) refuse("rig.length", "rig(): spine.length is the body's length, in metres, > 0");
  if (spine.sway !== undefined && !fin(spine.sway)) refuse("rig.sway", "rig(): spine.sway is the trunk's bend in degrees");
  if (breath && (!fin(breath.rate) || !(breath.rate > 0) || (breath.depth !== undefined && !(fin(breath.depth) && breath.depth > 0 && breath.depth <= 0.2)))) refuse("rig.breath", "rig(): breath is { rate: breaths per second, > 0, depth: the girth's swell, 0 to 0.2 (0.02) }");
  const seen = new Set(), out = legs.map((l) => {
    const n = l?.name;
    if (typeof n !== "string" || !n) refuse("rig.leg.name", "rig(): every leg has a name (LF, RF, LH, RH; L1..R3 for an insect)");
    if (seen.has(n)) refuse("rig.leg.twice", `rig(): leg ${n} is given twice`);
    seen.add(n);
    const { hip, foot, segments: sg, bend = "out", ankle = 45 * DEG, radius = 0.001 } = l;
    if (!Array.isArray(sg) || (sg.length !== 2 && sg.length !== 3) || !sg.every((x) => fin(x) && x > 0)) refuse("rig.leg.segments", `rig(): leg ${n}: segments is 2 or 3 lengths in metres, > 0 (upper, lower, foot)`);
    if (!Array.isArray(hip) || hip.length !== 3 || !hip.every(fin) || !(hip[1] > 0)) refuse("rig.leg.hip", `rig(): leg ${n}: hip is [x, y, z] in metres with y > 0 (above the surface)`);
    if (!Array.isArray(foot) || foot.length !== 2 || !foot.every(fin)) refuse("rig.leg.foot", `rig(): leg ${n}: foot is [x, z], where the foot rests (y is 0)`);
    if (!POLES.includes(bend)) refuse("rig.leg.bend", `rig(): leg ${n}: bend is one of ${POLES.join(", ")}`);
    if (!fin(ankle) || !(ankle > 0 && ankle < Math.PI / 2)) refuse("rig.leg.ankle", `rig(): leg ${n}: ankle is an angle in radians, between 0 and a quarter turn`);
    const rr = Array.isArray(radius) ? radius : [radius, radius];
    if (rr.length !== 2 || !rr.every((x) => fin(x) && x > 0)) refuse("rig.leg.radius", `rig(): leg ${n}: radius is the thickness in metres, > 0: one number or [at the hip, at the foot]`);
    const len = Math.hypot(hip[0] - foot[0], hip[1], hip[2] - foot[1]), reach = sg.reduce((a, b) => a + b, 0);
    if (!(len < reach)) refuse("rig.leg.reach", `rig(): leg ${n}: the rest foot is ${num(len)} mm from the hip, beyond its reach of ${num(reach)} mm`);
    return { name: n, hip: hip.slice(), foot: foot.slice(), segments: sg.slice(), bend, ankle, radius: rr, len };
  });
  const h = out.reduce((a, l) => a + l.len, 0) / out.length;
  const group = new THREE.Group(); group.scale.setScalar(1 / M); group.name = "creature";
  const c = { legs: out, spine: { length, sway: spine.sway }, cling: !!cling, head, breath: breath ? { rate: breath.rate, depth: breath.depth ?? 0.02 } : null, h, group, root: null, body: null, headRest: null, limbs: {}, apply: () => {} };
  if (!body) return c;

  // The body under a root that carries the pose; the head and the parts ride on it, shifted with the trunk's sway at their own x.
  const root = new THREE.Group(); root.name = "creature body"; group.add(root); root.add(body);
  const riders = [...parts, ...(head ? [head] : [])].map((o) => { root.add(o); return { o, rest: o.position.clone() }; });
  const { seg, rad, pts } = body.geometry.userData.sweep, pos = body.geometry.attributes.position, rest = Float32Array.from(pos.array);
  const spineCurve = new THREE.CatmullRomCurve3(pts, false, "centripetal"), centres = Array.from({ length: seg + 1 }, (_, i) => spineCurve.getPointAt(i / seg)); // ring i's rest centre, as sweep() laid it
  const hx = out.map((l) => l.hip[0]), xF = Math.max(...hx), xH = Math.min(...hx);
  const chest = new Float32Array(pos.count); // 1 between the pelvis and the shoulders, easing to 0 over a tenth of the body's length beyond
  for (let v = 0; v < pos.count; v++) { const x = rest[v * 3]; chest[v] = 1 - smooth(Math.max(0, xH - x, x - xF) / (0.1 * length)); }
  body.traverse((o) => { o.frustumCulled = false; }); // vertices move every frame; the fur shells share the geometry
  if (head) head.traverse((o) => { o.frustumCulled = false; });

  // The limbs: a tube per segment in world orientation (metres), on the body's material.
  const mat = material || body.material;
  let ink = colour;
  if (!ink) { // the body's mean colour
    const k = body.geometry.attributes.color, m = new THREE.Color(1, 1, 1);
    if (k) { m.set(0); for (let v = 0; v < k.count; v++) { m.r += k.getX(v); m.g += k.getY(v); m.b += k.getZ(v); } m.multiplyScalar(1 / k.count); }
    ink = m;
  }
  const paint = typeof ink === "function" ? ink : () => ink;
  out.forEach((l) => {
    const total = l.segments.reduce((a, b) => a + b, 0);
    let from = 0;
    c.limbs[l.name] = l.segments.map((len, j) => {
      const r0 = l.radius[0] + (l.radius[1] - l.radius[0]) * (from / total), r1 = l.radius[0] + (l.radius[1] - l.radius[0]) * ((from + len) / total);
      const g = sweep([new THREE.Vector3(0, 0, 0), new THREE.Vector3(len / 2, 0, 0), new THREE.Vector3(len, 0, 0)], (u) => r0 + (r1 - r0) * u, { seg: 8, rad: 12, colour: paint });
      const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; m.userData.length = len; m.name = `${l.name} ${j + 1}`;
      group.add(m); from += len;
      return m;
    });
  });

  const qa = new THREE.Quaternion(), X = new THREE.Vector3(1, 0, 0), d = new THREE.Vector3();
  // State -> drawing: the pose, the sway and the breath on the body's vertices, the head, each limb segment on its two joints. The normals
  // are left as they were modelled: the sway and the breath are a few degrees, a recompute per frame is not worth the cost.
  c.root = root; c.body = body; c.headRest = head ? head.position.clone() : null;
  c.apply = (state) => {
    root.position.fromArray(state.body.p); root.quaternion.fromArray(state.body.q);
    const sw = state.sway, a = sw && sw.amp ? sw.amp * Math.sin(TAU * sw.f * sw.tau) * sw.w : 0, b = c.breath ? c.breath.depth * state.breath : 0, arr = pos.array;
    for (let v = 0; v < pos.count; v++) {
      const x = rest[v * 3], y = rest[v * 3 + 1], z = rest[v * 3 + 2], ctr = centres[Math.floor(v / (rad + 1))], k = b * chest[v];
      arr[v * 3] = x + (x - ctr.x) * k; arr[v * 3 + 1] = y + (y - ctr.y) * k;
      arr[v * 3 + 2] = z + (z - ctr.z) * k + (a ? a * swayShape(x, sw.xF, sw.xH) : 0);
    }
    pos.needsUpdate = true;
    for (const r of riders) { r.o.position.copy(r.rest); if (a) r.o.position.z += a * swayShape(r.rest.x, sw.xF, sw.xH); }
    if (head) head.rotation.y = state.head || 0;
    for (const lg of state.legs) c.limbs[lg.name].forEach((m, j) => {
      m.position.fromArray(lg.joints[j]);
      d.fromArray(lg.joints[j + 1]).sub(m.position);
      m.quaternion.copy(d.lengthSq() > 1e-18 ? qa.setFromUnitVectors(X, d.normalize()) : qa.identity());
    });
  };
  return c;
}

// A creature along a curve (scene units, anything with getPointAt, getTangentAt and getLength) over the solids of `scene`
// (every visible, opaque mesh not under `exclude`, the same ones the physics turns into colliders). speed: m/s; gait: a name of GAITS;
// start: the time the walk begins. The feet are placed here, all of them, and every check runs here: a leg that cannot reach, a surface
// that is not there, a steep surface for an animal that does not cling are refused with the fix named.
export function path(creature, curve, { scene, exclude = [], speed, gait: gaitName, start = 0, duty } = {}) {
  if (!creature?.legs || !creature.group) refuse("path.rig", "path(): the first argument is what rig() returned");
  if (!curve || ["getPointAt", "getTangentAt", "getLength"].some((m) => typeof curve[m] !== "function")) refuse("path.curve", "path(): curve has getPointAt, getTangentAt and getLength (a THREE curve, a CurvePath)");
  if (!scene?.traverse) refuse("path.scene", "path(): scene is the THREE.Scene the creature walks on");
  if (!fin(start)) refuse("path.start", "path(): start is a time in seconds");
  const gt = gait(gaitName, { h: creature.h, v: speed, duty }), { f, duty: beta, phases } = gt, v = speed;
  const names = creature.legs.map((l) => l.name), want = Object.keys(phases);
  if (names.some((n) => !want.includes(n)) || want.some((n) => !names.includes(n))) refuse("path.legs", `path(): ${gaitName} needs the legs ${want.join(", ")}; the rig has ${names.join(", ")}`);
  const sway = (creature.spine.sway ?? gt.sway) * DEG, len = creature.spine.length;

  // The set: the solids the physics would collide with, by raycast.
  scene.updateMatrixWorld(true);
  const skip = new Set();
  [...exclude, creature.group].forEach((r) => r.traverse((o) => skip.add(o)));
  const meshes = [];
  scene.traverse((m) => { if (m.isMesh && !skip.has(m) && m.visible && !m.userData.fur && !m.material.isShadowMaterial && !m.material.transparent) meshes.push(m); });
  const rc = new THREE.Raycaster(), nm = new THREE.Matrix3();
  const AXES = []; // the six axes and the twelve edge diagonals
  for (const a of [0, 1, 2]) for (const s of [1, -1]) AXES.push(new THREE.Vector3(...[0, 1, 2].map((i) => (i === a ? s : 0))));
  for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (const sa of [1, -1]) for (const sb of [1, -1]) AXES.push(new THREE.Vector3(...[0, 1, 2].map((i) => (i === a ? sa : i === b ? sb : 0))).normalize());
  // cast(o, d, far): the nearest surface along d from o (metres), or null: { p, n (facing o), on (the name of the object, as the physics reports it), dist }.
  function cast(o, d, far) {
    rc.set(o.clone().divideScalar(M), d); rc.near = 0; rc.far = far / M;
    const h = rc.intersectObjects(meshes, false)[0];
    if (!h) return null;
    const n = h.face.normal.clone().applyMatrix3(nm.getNormalMatrix(h.object.matrixWorld)).normalize();
    if (n.dot(d) > 0) n.negate();
    let r = h.object; while (r.parent && r.parent !== scene) r = r.parent;
    return { p: h.point.multiplyScalar(M), n, on: r.name || "unnamed", dist: h.distance * M };
  }
  // probe(o, far): the nearest surface in the six axis directions and the twelve edge diagonals. The rays start a hair behind o so a
  // curve lying on a surface still hits it.
  const BACK = 5e-4, probe = (o, far) => {
    let best = null;
    for (const d of AXES) { const h = cast(o.clone().addScaledVector(d, -BACK), d, far + BACK); if (h && (!best || h.dist < best.dist)) best = h; }
    return best;
  };

  // The body's path: samples of the curve with the surface normal under them, smoothed over one body length.
  const Lm = curve.getLength() * M;
  if (!(Lm > 0)) refuse("path.length", "path(): the curve has no length");
  const reach = Math.max(...creature.legs.map((l) => l.segments.reduce((a, b) => a + b, 0))), hipMax = Math.max(...creature.legs.map((l) => l.hip[1]));
  const ds = Math.min(Lm / 16, 0.005), n = Math.ceil(Lm / ds) + 1, pts = [], tans = [], raw = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), p = curve.getPointAt(u).multiplyScalar(M);
    pts.push(p); tans.push(curve.getTangentAt(u).normalize());
    const h = probe(p, 2 * hipMax + reach);
    if (!h) refuse("path.body.surface", `path(): no surface within the legs' reach of the curve at s = ${num(u * Lm, 1)} mm: the curve leaves the set`);
    raw.push(h.n);
  }
  const frames = pts.map((p, i) => {
    const up = new THREE.Vector3(), s = (i / (n - 1)) * Lm;
    for (let j = 0; j < n; j++) if (Math.abs((j / (n - 1)) * Lm - s) <= len / 2 + 1e-9) up.add(raw[j]);
    if (up.lengthSq() < 1e-12) refuse("path.normals", `path(): the surface normals cancel out at s = ${num(s, 1)} mm (the body is longer than the gap it crosses)`);
    up.normalize();
    const fw = tans[i].clone().addScaledVector(up, -tans[i].dot(up));
    if (fw.lengthSq() < 1e-8) refuse("path.dive", `path(): the curve runs straight into the surface at s = ${num(s, 1)} mm: the body needs a direction along it`);
    fw.normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(fw, up, new THREE.Vector3().crossVectors(fw, up)));
    return { p, q };
  });
  const pose = (s) => { // linear in position, slerp in rotation
    const x = (clamp(s, 0, Lm) / Lm) * (n - 1), i = Math.min(n - 2, Math.floor(x)), w = x - i;
    return { p: frames[i].p.clone().lerp(frames[i + 1].p, w), q: frames[i].q.clone().slerp(frames[i + 1].q, w) };
  };

  // The trunk's standing wave: the shoulder and pelvis girdles swing opposite ways, the node mid-trunk, at the stride frequency. The bend
  // angle at the node is `sway`; it ramps in over the first stride and out over the last, and is nil standing.
  const hx = creature.legs.map((l) => l.hip[0]), xF = Math.max(...hx), xH = Math.min(...hx), T = Lm / v;
  const amp = xF - xH > 1e-9 ? (Math.tan(sway) * (xF - xH)) / Math.PI : 0;
  const ramp = (tau) => smooth(tau * f) * smooth((T - tau) * f);
  const swayAt = (x, tau) => (amp ? amp * swayShape(x, xF, xH) * Math.sin(TAU * f * tau) * ramp(tau) : 0);

  // Footholds. Stance k of a leg runs from (k + phase)/f for a duty of `beta`, and is placed under the body at its middle.
  const cosA = (a, b, c) => clamp((a * a + b * b - c * c) / (2 * a * b), -1, 1);
  const fromBody = (po, x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(po.q).add(po.p);
  if (T * f > 5000) refuse("path.strides", "path(): more than 5000 strides: a faster speed or a shorter curve");
  const holds = {};
  creature.legs.forEach((l) => {
    const stances = [], ph = phases[l.name], far = 3 * l.hip[1] + l.segments.reduce((a, b) => a + b, 0);
    for (let k = -2; ; k++) {
      const t0 = (k + ph) / f, mid = clamp(v * (t0 + beta / (2 * f)), 0, Lm), po = pose(mid);
      const anchor = fromBody(po, l.foot[0], l.hip[1], l.foot[1]), down = new THREE.Vector3(0, -1, 0).applyQuaternion(po.q);
      let hit = cast(anchor, down, far) || probe(anchor, far);
      if (hit) { // in a corner straight down can be out of reach: the foot then takes the surface nearest the hip
        const hipW = fromBody(po, l.hip[0], l.hip[1], l.hip[2]), sum = l.segments.reduce((a, b) => a + b, 0);
        if (hipW.distanceTo(hit.p) > 0.85 * sum) { const alt = probe(hipW, sum); if (alt && alt.dist < hipW.distanceTo(hit.p)) hit = alt; }
      }
      if (!hit) refuse("path.foot.surface", `path(): leg ${l.name} finds no surface near s = ${num(mid, 1)} mm: the curve leaves the set`);
      if (hit.n.y < CLING && !creature.cling) refuse("path.cling", `path(): leg ${l.name} lands on a surface tilted ${Math.round(Math.acos(clamp(hit.n.y, -1, 1)) / DEG)} degrees (${hit.on}): only an animal that clings (pads, claws) holds there: pass cling: true for one, or route the path over walkable ground`);
      stances.push({ k, t0: start + t0, t1: start + t0 + beta / f, p: hit.p, n: hit.n, on: hit.on });
      if (t0 > T + 1 / f) break;
    }
    stances[0].t0 = -Infinity; stances[stances.length - 1].t1 = Infinity;
    holds[l.name] = stances;
  });

  // One leg at time t: where its foot is (planted on a foothold, or swinging between two) and the joints that put it there.
  function legAt(l, po, tau, t) {
    const S = holds[l.name], kmin = S[0].k, kmax = S[S.length - 1].k, c = tau * f - phases[l.name];
    let k = Math.floor(c), fr = c - k;
    if (k < kmin) { k = kmin; fr = 0; } else if (k >= kmax) { k = kmax; fr = 0; }
    const a = S[k - kmin], b = S[k - kmin + 1] || a;
    let foot = a.p.clone(), nrm = a.n, planted = true, on = a.on;
    if (fr >= beta) {
      const u = (fr - beta) / (1 - beta), e = u * u * (3 - 2 * u), step = a.p.distanceTo(b.p);
      nrm = a.n.clone().lerp(b.n, e).normalize();
      if (step < STEP) foot.lerp(b.p, e);
      else { foot.lerp(b.p, e).addScaledVector(a.n.clone().add(b.n).normalize(), 0.15 * creature.h * Math.sin(Math.PI * u)); planted = false; on = null; }
    }
    const H = fromBody(po, l.hip[0], l.hip[1], l.hip[2] + swayAt(l.hip[0], tau));
    let T3 = foot;
    if (l.segments.length === 3) {
      const toHip = H.clone().sub(foot); toHip.addScaledVector(nrm, -toHip.dot(nrm));
      if (toHip.lengthSq() < 1e-12) { toHip.set(1, 0, 0).applyQuaternion(po.q); toHip.addScaledVector(nrm, -toHip.dot(nrm)); } // hip right above the foot: lean along the body
      T3 = foot.clone().addScaledVector(nrm.clone().multiplyScalar(Math.cos(l.ankle)).addScaledVector(toHip.normalize(), Math.sin(l.ankle)).normalize(), l.segments[2]);
    }
    const [l1, l2] = l.segments, dv = T3.clone().sub(H), d = dv.length();
    const ok = d <= 0.999 * (l1 + l2) && d >= 1.001 * Math.abs(l1 - l2) && d > 1e-9;
    const dir = dv.clone().divideScalar(d || 1);
    const F = new THREE.Vector3(1, 0, 0).applyQuaternion(po.q), U = new THREE.Vector3(0, 1, 0).applyQuaternion(po.q), R = new THREE.Vector3(0, 0, 1).applyQuaternion(po.q);
    const pole = l.bend === "forward" ? F : l.bend === "back" ? F.clone().negate() : l.bend === "up" ? U : R.clone().multiplyScalar(l.hip[2] < 0 ? -1 : 1).add(U).normalize();
    const perp = pole.clone().addScaledVector(dir, -pole.dot(dir));
    if (perp.lengthSq() < 1e-12) perp.copy(U).addScaledVector(dir, -U.dot(dir));
    if (perp.lengthSq() < 1e-12) perp.copy(R).addScaledVector(dir, -R.dot(dir));
    perp.normalize();
    const ca = cosA(l1, d || 1, l2), knee = H.clone().addScaledVector(dir, l1 * ca).addScaledVector(perp, l1 * Math.sqrt(1 - ca * ca));
    const joints = l.segments.length === 3 ? [H, knee, T3, foot] : [H, knee, foot];
    return { name: l.name, joints: joints.map((j) => j.toArray()), planted, on, k, ok, d, t };
  }

  // The head: it turns toward a stimulus on a call to look() and only then. The yaw is the target's bearing in the body frame (seen from
  // the neck), at most HEAD_MAX either way, eased with a smoothstep over `dur` from where the head was when the call took effect; the
  // latest call at or before t rules, and the head keeps watching the target as the body walks on.
  const looks = [], inv = new THREE.Quaternion();
  const yawTo = (aim, t) => {
    const po = pose(v * (t - start)), p = aim.clone().multiplyScalar(M).sub(po.p).applyQuaternion(inv.copy(po.q).invert());
    if (creature.headRest) p.sub(creature.headRest);
    return Math.hypot(p.x, p.z) < 1e-9 ? 0 : clamp(Math.atan2(-p.z, p.x), -HEAD_MAX, HEAD_MAX);
  };
  const headAt = (t, i = looks.length - 1) => {
    while (i >= 0 && looks[i].t0 > t) i--;
    if (i < 0) return 0;
    const lk = looks[i], from = headAt(lk.t0, i - 1);
    return from + (yawTo(lk.aim, t) - from) * smooth((t - lk.t0) / lk.dur);
  };

  function at(t) {
    const tau = t - start, po = pose(v * tau);
    return {
      t, body: { p: po.p.toArray(), q: po.q.toArray() },
      legs: creature.legs.map((l) => { const { ok, d, ...r } = legAt(l, po, tau, t); return r; }),
      sway: { amp, xF, xH, f, tau, w: ramp(tau) }, head: headAt(t), breath: creature.breath ? Math.sin(TAU * creature.breath.rate * t) : 0,
    };
  }

  // Every leg reaches its foot at every moment of the walk, or it is refused.
  for (let t = start; t <= start + T + 1e-9; t += 1 / (f * 10)) {
    const po = pose(v * (t - start));
    for (const l of creature.legs) {
      const r = legAt(l, po, t - start, t);
      if (!r.ok) refuse("path.reach", `path(): leg ${l.name} cannot reach its foothold at t = ${t.toFixed(2)} s (stride ${num(gt.stride)} mm, reach ${num(l.segments[0] + l.segments[1])} mm, needs ${num(r.d)} mm): a slower speed, a longer leg, or a route nearer the surfaces (a rounded corner lifts the body about a quarter of its radius off both)`);
    }
  }

  // Contacts: the real steps (a foot that moved), what each foot touches, when two things are touched together.
  const steps = [];
  for (const l of creature.legs) holds[l.name].forEach((s, i, S) => { if (i && s.p.distanceTo(S[i - 1].p) >= STEP) steps.push({ t: s.t0, leg: l.name, on: s.on, at: s.p.toArray() }); });
  steps.sort((a, b) => a.t - b.t || (a.leg < b.leg ? -1 : 1));
  const all = creature.legs.flatMap((l) => holds[l.name].map((s) => ({ leg: l.name, ...s })));
  // The first and last stance reach past the walk (-Infinity, Infinity, inside this module only): what is handed out is cut to the walk, finite.
  const last = start + T, inWalk = (x) => clamp(x, start, last);
  const plain = Object.fromEntries(Object.entries(holds).map(([n, S]) => [n, S.map((s) => ({ k: s.k, t0: inWalk(s.t0), t1: inWalk(s.t1), p: s.p.toArray(), n: s.n.toArray(), on: s.on }))]));
  const walk = {
    gait: gt, duration: start + T, footholds: plain, steps, at,
    touching: (t) => [...new Set(at(t).legs.filter((l) => l.planted).map((l) => l.on))].sort(),
    together(a, b) { // the first t of the walk when one planted foot is on a and another on b, or null
      let first = null;
      for (const x of all) if (x.on === a) for (const y of all) if (y.on === b && y.leg !== x.leg) {
        const lo = Math.max(x.t0, y.t0, start); // a first stance reaches back before the walk: its own start is the earliest answer
        if (lo <= Math.min(x.t1, y.t1, last) && (first === null || lo < first)) first = lo;
      }
      return first;
    },
    // look(target, t0, { dur }): from t0 the head turns toward target (scene units, a Vector3 or [x, y, z]) over dur seconds (0.25).
    look(target, t0, { dur = 0.25 } = {}) {
      const aim = Array.isArray(target) ? new THREE.Vector3(...target) : target?.isVector3 ? target.clone() : null;
      if (!aim || ![aim.x, aim.y, aim.z].every(fin)) refuse("look.target", "look(): target is a point in scene units, a Vector3 or [x, y, z]");
      if (!fin(t0)) refuse("look.t0", "look(): t0 is the time the head starts to turn, in seconds");
      if (!fin(dur) || !(dur > 0)) refuse("look.dur", "look(): dur is how long the turn takes, in seconds, > 0 (0.25)");
      let i = looks.length; while (i > 0 && looks[i - 1].t0 > t0) i--;
      looks.splice(i, 0, { aim, t0, dur });
      return this;
    },
    apply(t) { creature.apply(this.at(t)); },
  };
  return walk;
}
