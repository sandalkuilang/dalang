import { RAPIER } from "./rapier.js";
import { G, M } from "./kit.js";
import { runBake } from "./bakecore.js";
import { startPool } from "./pool.js";
export { RAPIER };

// Time remaps for a shot that shows a baked event slowed or again: tau(t) maps the shot's time to the bake's time, so
// every view reads the one bake (apply(tau(t)), pose(i, tau(t)), travel(t, fps, tau)), never a second bake.
// slow: real time until t0, then `rate` (1/50 = fifty times slower) for `hold` s, then back to real time linearly over `rampOut` s.
export function slow(t0, rate, rampOut, hold = 0) {
  if (!Number.isFinite(t0) || !(rate > 0 && rate <= 1)) throw new Error("slow(t0, rate, rampOut, hold): t0 is a time in s and the rate is in (0, 1] (1/50 = fifty times slower)");
  if (!(rampOut >= 0) || !(hold >= 0)) throw new Error("slow(t0, rate, rampOut, hold): rampOut and hold are s ≥ 0");
  const t1 = t0 + hold, t2 = t1 + rampOut, at2 = t0 + rate * hold + (rampOut * (1 + rate)) / 2;
  return (t) => {
    if (t < t0) return t;
    if (t < t1) return t0 + rate * (t - t0);
    if (t < t2) { const u = t - t1; return t0 + rate * hold + rate * u + ((1 - rate) * u * u) / (2 * rampOut); }
    return at2 + (t - t2);
  };
}
// replay: the bake's event at tEvent plays again from the shot's time tShot (a later shot, another angle). Slow-motion
// replay composes the two: (t) => replay(tEvent, tShot)(slow(tShot, 1 / 50, 0.4)(t)).
export function replay(tEvent, tShot) {
  if (!Number.isFinite(tEvent) || !Number.isFinite(tShot)) throw new Error("replay(tEvent, tShot): two times in s");
  return (t) => tEvent + (t - tShot);
}

const BAKE_FORMAT = 1; // bump when the stored layout or what a bake means changes: every older cache file then misses

// 64-bit string/number hash (two 32-bit lanes, cyrb53-style): a cache key, not a security boundary.
function hasher() {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  const f64 = new Float64Array(1), u32 = new Uint32Array(f64.buffer), mix = (x) => { h1 = Math.imul(h1 ^ x, 2654435761); h2 = Math.imul(h2 ^ x, 1597334677); };
  return {
    num(x) { f64[0] = x; mix(u32[0]); mix(u32[1]); },
    str(s) { s = String(s); for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); mix(s.length); },
    hex() {
      const a = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909), b = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
      return (b >>> 0).toString(16).padStart(8, "0") + (a >>> 0).toString(16).padStart(8, "0");
    },
  };
}

// The set's own code and the narration's timing: every .js/.mjs/.json the page loaded from assets/ (where this module
// lives; bake files aside) and the beats.js globals. A change to the set or its timeline changes the hash even where
// onStep's source does not. Inline scripts are left out: the renderer rewrites them, so a snapshot and a render would
// never share a bake — a value an inline script feeds the bake goes in opts.key. Empty outside a browser.
// Engine files the page loads only when something happens at run time, so they are in one page load's resource timeline
// and not in the next one's (the bake worker: spawned on a cache miss, and a dedicated worker's script is listed in its
// creator's timeline). They decide nothing a hashed file does not: the worker runs bakecore.js, which every page loads.
const LAZY = ["bake-worker.js"];
async function sources() {
  if (typeof document === "undefined" || typeof performance === "undefined") return "";
  const root = new URL("./", import.meta.url).href;
  const urls = [...new Set(performance.getEntriesByType("resource").map((e) => e.name.split(/[?#]/)[0]))].filter((u) => u.startsWith(root) && /\.(m?js|json)$/.test(u) && !u.startsWith(root + "bake/") && !LAZY.includes(u.slice(root.length))).sort();
  const texts = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text()).catch(() => "")));
  const g = globalThis, timing = JSON.stringify([g.BEATS, g.WORDS, g.SECTIONS, g.NARRATION_DURATION]);
  return urls.map((u) => u.slice(root.length)).concat(texts, timing).join("\n");
}

// Fences an object: each of its methods (own and inherited) is shadowed by one that calls refuse(key, args) first when
// active() says so, then runs the original. Methods in `allow` stay as they are. Returns the function that lifts the fence.
function fence(obj, active, refuse, allow = []) {
  const proto = Object.getPrototypeOf(obj), keys = new Set();
  for (let p = proto; p && p !== Object.prototype; p = Object.getPrototypeOf(p))
    for (const k of Object.getOwnPropertyNames(p)) if (k !== "constructor" && !allow.includes(k) && typeof Object.getOwnPropertyDescriptor(p, k).value === "function") keys.add(k);
  keys.forEach((k) => Object.defineProperty(obj, k, { configurable: true, value(...a) { if (active()) refuse(k, a); return proto[k].apply(this, a); } }));
  return () => keys.forEach((k) => delete obj[k]);
}

// Locks an object against change: each method whose name says it changes something (set…, enable…, add…, create…) is
// shadowed by one that calls refuse(key, args) first when active() says so, and so is each property with a setter.
// Reads stay open. A key the object already shadows (a fence) is left to that. Returns the function that lifts the lock.
const CHANGES = /^(set|enable|lock|restrict|add|apply|reset|remove|create|configure)[A-Z]|^(step|sleep|wakeUp|recompute\w*|switchTo\w*|finalizeDeserialization)$/;
// The collider changes that leave where it can touch as it is (material, mass, filters, on/off: an island bake counts
// every collider, on or off, sensor or not). Any other change of a main-island collider is refused while islands bake.
const REACH_KEEPS = new Set(["setFriction", "setRestitution", "setFrictionCombineRule", "setRestitutionCombineRule", "setDensity", "setMass", "setMassProperties", "setEnabled", "setSensor", "setCollisionGroups", "setSolverGroups", "setActiveCollisionTypes", "setActiveEvents", "setActiveHooks", "setContactForceEventThreshold"]);
function lock(obj, active, refuse) {
  const done = new Set();
  for (let p = Object.getPrototypeOf(obj); p && p !== Object.prototype; p = Object.getPrototypeOf(p))
    for (const k of Object.getOwnPropertyNames(p)) {
      const d = Object.getOwnPropertyDescriptor(p, k);
      if (k === "constructor" || Object.hasOwn(obj, k) || done.has(k)) continue;
      if (typeof d.value === "function" && CHANGES.test(k)) Object.defineProperty(obj, k, { configurable: true, value(...a) { if (active()) refuse(k, a); return d.value.apply(this, a); } });
      else if (d.set) Object.defineProperty(obj, k, { configurable: true, get: d.get && function () { return d.get.call(this); }, set(v) { if (active()) refuse(k, [v]); d.set.call(this, v); } });
      else continue;
      done.add(k);
    }
  return () => done.forEach((k) => delete obj[k]);
}

// Cache file: "DLB1", header length, JSON header, then per body its stored steps (u32) and poses (7 × f32), then each
// tracked series (n × f32). Little-endian, as every machine that renders this is.
function encode(d, hash) {
  const names = Object.keys(d.series), head = new TextEncoder().encode(JSON.stringify({ format: BAKE_FORMAT, hash, n: d.n, dt: d.dt, counts: d.poses.map((x) => x.s.length), series: names, impacts: d.impacts, report: d.report, kept: d.kept }));
  const off = 8 + head.length + ((4 - (head.length % 4)) % 4), size = d.poses.reduce((a, x) => a + x.s.byteLength + x.p.byteLength, 0) + names.length * d.n * 4;
  const out = new Uint8Array(off + size), bytes = (a) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  out.set([0x44, 0x4c, 0x42, 0x31]); new DataView(out.buffer).setUint32(4, head.length, true); out.set(head, 8);
  let o = off;
  for (const x of d.poses) { out.set(bytes(x.s), o); o += x.s.byteLength; out.set(bytes(x.p), o); o += x.p.byteLength; }
  for (const k of names) { out.set(bytes(d.series[k]), o); o += d.series[k].byteLength; }
  return out;
}
function decode(buf, hash, bodies) {
  try { // a truncated or foreign file is a miss (bake again), never a crash
    if (!buf || buf.byteLength < 8) return null;
    const u8 = new Uint8Array(buf), dv = new DataView(buf), len = dv.getUint32(4, true);
    if (String.fromCharCode(...u8.subarray(0, 4)) !== "DLB1" || 8 + len > buf.byteLength) return null;
    const h = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + len)));
    if (h.format !== BAKE_FORMAT || h.hash !== hash || h.counts.length !== bodies) return null;
    let o = 8 + len + ((4 - (len % 4)) % 4);
    if (o + h.counts.reduce((a, c) => a + c * 32, 0) + h.series.length * h.n * 4 !== buf.byteLength) return null;
    const poses = h.counts.map((c) => { const s = new Uint32Array(buf, o, c); o += c * 4; const p = new Float32Array(buf, o, c * 7); o += c * 28; return { s, p }; });
    const series = Object.fromEntries(h.series.map((k) => { const a = new Float32Array(buf, o, h.n); o += h.n * 4; return [k, a]; }));
    return { n: h.n, dt: h.dt, poses, series, impacts: h.impacts, report: h.report, kept: h.kept };
  } catch { return null; }
}

// Rigid-body physics (Rapier, deterministic), baked once before the first frame: the shot is simulated at 480 Hz
// and every body's pose is stored whenever it moved, so any time — including motion-blur sub-frames — can be seeked.
// bakeCached() stores the result in assets/bake/: later snapshots, the preview and every render worker replay it.
//
// Accuracy rules this module enforces:
// - the whole static set collides (a triangle mesh per scene mesh), not a hand-picked few boxes;
// - colliders match what is drawn (a rounded box gets a round cuboid with the same radius, a model its convex hull);
// - after the bake it reports the deepest penetration, bodies left floating and bodies still moving.
export async function makeSim(THREE, g = G, mpu = M) { // g in units/s², mpu metres per unit (the kit's by default); reports in real mm and m/s
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -g, z: 0 }); // g in the scene's units per s²
  world.timestep = 1 / 480; // 480 Hz: a hard knock between books stays under 2 mm of overlap
  // Stiff, exact contacts: Rapier's defaults (4 iterations, 1 mm allowed error, 30 Hz contacts) let a stack of seven
  // books sink ~3.5 mm into each other and a 12 kg chair leg dig 6 mm into a book.
  world.numSolverIterations = 16;
  world.integrationParameters.numInternalPgsIterations = 2;
  world.integrationParameters.normalizedAllowedLinearError = 0.0002;
  world.integrationParameters.contact_natural_frequency = 60;
  world.integrationParameters.maxCcdSubsteps = 4;
  const tracked = [], kin = [], held = new Map(), owner = new Map(); let replayed = false; // owner: collider handle → the object it was built from
  const mech = []; // mechanism parts (mechanism.js): { bodies, key, step(t, dt), event() }: stepped before onStep, hashed, kept out of islands
  const dt0 = world.timestep; // taken here: inside an island bake's script a part must not read the fenced world
  const withParts = (onStep) => (mech.length ? (t) => { mech.forEach((p) => p.step(t, dt0)); if (onStep) onStep(t); } : onStep);
  const events = () => mech.map((p) => p.event?.()).filter(Boolean);
  // o.group (1–15): parts of one object (a chair's seat and base) share a collision group and never collide with each other.
  const surface = (c, o) => { c.setFriction(o.friction ?? 0.55).setRestitution(o.restitution ?? 0.15).setDensity(o.density ?? 600); if (o.group) c.setCollisionGroups(((1 << o.group) << 16) | (0xffff & ~(1 << o.group))); return c; };
  const tmp = new THREE.Vector3();

  function localPoints(root, filter, cell = 0.001 / mpu) { // vertices of every mesh under root, in root's own frame; filter(v, mesh)
    root.updateMatrixWorld(true);
    const inv = root.matrixWorld.clone().invert(), pts = [];
    root.traverse((m) => {
      if (!m.isMesh) return;
      const p = m.geometry.attributes.position, mat = inv.clone().multiply(m.matrixWorld);
      for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).applyMatrix4(mat); if (!filter || filter(tmp, m)) pts.push(tmp.x, tmp.y, tmp.z); }
    });
    // One point per cell (0.5 mm by default): meshes repeat a vertex on every face that meets there, and Rapier's
    // hull builder aborts (wasm "unreachable") on such coincident or crowded, nearly coplanar points.
    const seen = new Set(), out = [];
    for (let i = 0; i < pts.length; i += 3) { const key = Math.round(pts[i] / cell) + "," + Math.round(pts[i + 1] / cell) + "," + Math.round(pts[i + 2] / cell); if (!seen.has(key)) { seen.add(key); out.push(pts[i], pts[i + 1], pts[i + 2]); } }
    return new Float32Array(out);
  }
  // Rapier aborts (wasm "unreachable") on a flat or degenerate point set instead of returning null: build a hull only
  // from points that enclose a real volume (a tetrahedron ≥ 1 mm in every direction).
  function solid(pts) {
    const P = (i) => new THREE.Vector3(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]), n = pts.length / 3;
    if (n < 4) return false;
    const a = P(0); let b = a, c = a, best = 0;
    for (let i = 1; i < n; i++) { const d = P(i).distanceTo(a); if (d > best) { best = d; b = P(i); } }
    if (best < 0.002 / mpu) return false;
    const ab = b.clone().sub(a).normalize(); best = 0;
    for (let i = 0; i < n; i++) { const v = P(i).sub(a), d = v.sub(ab.clone().multiplyScalar(v.dot(ab))).length(); if (d > best) { best = d; c = P(i); } }
    if (best < 0.002 / mpu) return false;
    const nrm = b.clone().sub(a).cross(c.clone().sub(a)).normalize(); best = 0;
    for (let i = 0; i < n; i++) best = Math.max(best, Math.abs(P(i).sub(a).dot(nrm)));
    return best >= 0.002 / mpu;
  }
  function bodyAt(desc, root) {
    root.updateMatrixWorld(true);
    const p = root.getWorldPosition(new THREE.Vector3()), q = root.getWorldQuaternion(new THREE.Quaternion());
    return world.createRigidBody(desc.setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  }
  function track(root, body, o) { const t = { root, body, start: { ...body.translation() }, q0: { ...body.rotation() }, impacts: o.impacts !== false, soft: !!o.soft, name: o.name || root.name || "body" }; tracked.push(t); return t; }

  // A bake's result, live or replayed: interpolated poses at any time t (sub-frames included) from the sparse store.
  function baked(data, hash, cached = false) {
    const { n, dt, poses, series, impacts, report, kept } = data;
    const pose = (i, t) => { // interpolated pose of tracked body i at time t
      const { s, p } = poses[i], u = Math.min(n - 1, Math.max(0, t / dt));
      let lo = 0, hi = s.length - 1; // the last stored step at or before u
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= u) lo = m; else hi = m - 1; }
      const f = lo + 1 < s.length && s[lo + 1] === s[lo] + 1 ? u - s[lo] : 0, a = lo * 7, b = f ? a + 7 : a; // a gap between stored steps = at rest
      const qa = new THREE.Quaternion(p[a + 3], p[a + 4], p[a + 5], p[a + 6]), qb = new THREE.Quaternion(p[b + 3], p[b + 4], p[b + 5], p[b + 6]);
      return { p: new THREE.Vector3(p[a] + (p[b] - p[a]) * f, p[a + 1] + (p[b + 1] - p[a + 1]) * f, p[a + 2] + (p[b + 2] - p[a + 2]) * f), q: qa.slerp(qb, f) };
    };
    return {
      impacts, report, pose, hash, cached, data, kept,
      series,
      at(name, t) { const a = series[name]; if (!a) throw new Error(`no tracked series "${name}" (opts.track)`); const u = Math.min(n - 1, Math.max(0, t / dt)), s0 = Math.floor(u), s1 = Math.min(n - 1, s0 + 1); return a[s0] + (a[s1] - a[s0]) * (u - s0); },
      // Fastest tracked point speed around t (m per video frame): decides whether the frame needs motion blur.
      // A remapped shot (slow, replay) passes its tau, so the blur follows what the frame shows.
      travel(t, fps, tau = (x) => x) {
        let m = 0;
        tracked.forEach((b, i) => { m = Math.max(m, pose(i, tau(t + 0.5 / fps)).p.distanceTo(pose(i, tau(t - 0.5 / fps)).p)); });
        return m;
      },
      apply(t) {
        tracked.forEach((b, i) => {
          if (b.root.userData.noApply) return;
          const { p, q } = pose(i, t), par = b.root.parent;
          if (par && !par.isScene) { // a part of a moving object: convert to its parent's frame
            par.updateMatrixWorld(true);
            b.root.position.copy(par.worldToLocal(p));
            b.root.quaternion.copy(par.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(q));
          } else {
            b.root.position.copy(p);
            b.root.quaternion.copy(q);
          }
        });
      },
    };
  }
  const solverOf = () => { const ip = world.integrationParameters; return [world.numSolverIterations, ip.numInternalPgsIterations, ip.normalizedAllowedLinearError, ip.contact_natural_frequency, ip.maxCcdSubsteps, ip.normalizedPredictionDistance, ip.numAdditionalFrictionIterations]; };
  // What every island world shares with this one, as one hash: gravity, the solver, every fixed body, every collider that
  // belongs to no body or to a fixed one, and how many bodies, colliders and joints there are. Taken before the main
  // island's bake and after it: a script that changed any of it (by a call the fence did not know) never reached the
  // island worlds, which restored the world as it was before.
  function sharedState() {
    const h = hasher(), v3 = (v) => { h.num(v.x); h.num(v.y); h.num(v.z); }, q4 = (q) => { v3(q); h.num(q.w); };
    v3(world.gravity); h.num(world.timestep); solverOf().forEach((x) => h.num(x ?? NaN));
    world.forEachRigidBody((b) => { if (b.isFixed()) { h.num(b.handle); h.num(b.isEnabled()); v3(b.translation()); q4(b.rotation()); } });
    world.forEachCollider((c) => { const p = c.parent(); if (!p || p.isFixed()) { h.num(c.handle); h.num(c.parent()?.handle ?? -1); h.num(c.shapeType()); v3(c.translation()); q4(c.rotation()); h.num(c.friction()); h.num(c.restitution()); h.num(c.density()); h.num(c.collisionGroups()); h.num(c.isSensor()); h.num(c.isEnabled()); } });
    h.num(world.bodies.len()); h.num(world.colliders.len()); h.num(world.impulseJoints.len()); h.num(world.multibodyJoints.len?.() ?? 0);
    return h.hex();
  }

  // Everything that decides a bake's result, hashed (64-bit). Shapes are read field by field, so any collider counts.
  async function fingerprint(duration, onStep, preroll, opts, isl = []) {
    const h = hasher(), v3 = (v) => { h.num(v.x); h.num(v.y); h.num(v.z); }, q4 = (q) => { v3(q); h.num(q.w); };
    const any = (x) => { if (typeof x === "number" || typeof x === "boolean") h.num(+x); else if (ArrayBuffer.isView(x)) x.forEach((e) => h.num(e)); else if (x && typeof x === "object") Object.keys(x).sort().forEach((k) => { h.str(k); any(x[k]); }); };
    h.str(`format ${BAKE_FORMAT}`); h.num(duration); h.num(preroll); h.num(world.timestep); v3(world.gravity);
    solverOf().forEach((x) => h.num(x ?? NaN));
    world.forEachRigidBody((b) => { h.num(b.handle); h.num(b.bodyType()); v3(b.translation()); q4(b.rotation()); v3(b.linvel()); v3(b.angvel()); h.num(b.mass()); v3(b.principalInertia()); h.num(b.linearDamping()); h.num(b.angularDamping()); h.num(b.gravityScale()); h.num(b.isEnabled()); h.num(b.isCcdEnabled()); });
    world.forEachCollider((c) => { h.num(c.handle); h.num(c.parent()?.handle ?? -1); any(c.shape); v3(c.translation()); q4(c.rotation()); h.num(c.friction()); h.num(c.restitution()); h.num(c.density()); h.num(c.collisionGroups()); h.num(c.isSensor()); h.num(c.isEnabled()); });
    world.impulseJoints.forEach((j) => { h.num(j.type()); h.num(j.body1().handle); h.num(j.body2().handle); v3(j.anchor1()); v3(j.anchor2()); });
    held.forEach((u, k) => { h.num(k); h.num(u); });
    if (isl.length) { h.str("islands"); isl.forEach((hs) => { h.num(hs.length); hs.forEach((x) => h.num(x)); }); } // how a bake is split into islands is part of its key
    mech.forEach((p) => h.str(p.key));
    kin.forEach((k) => { h.str(k.pose); for (let i = 0; i <= 16; i++) { const { p, q } = k.pose(-preroll + ((duration + preroll) * i) / 16); v3(p); if (q) q4(q); } });
    h.str(onStep || ""); h.str(opts.keep || ""); Object.entries(opts.track || {}).forEach(([k, fn]) => { h.str(k); h.str(fn); });
    h.str(JSON.stringify(opts.key ?? "")); h.str(await sources());
    return h.hex();
  }

  // What a bake records for one tracked body, and the names of the objects the colliders were built from (a contact partner's name).
  const itemOf = (b) => ({ body: b.body, name: b.name, impacts: b.impacts, soft: b.soft, until: held.get(b.body.handle) ?? -Infinity });
  const names = () => Object.fromEntries([...owner].map(([h, r]) => [h, r.name || ""]));

  // Islands: opts.islands = [[a, b], [c]] lists bodies (what roundBox and dynamicHull return) that never touch another
  // island's bodies for the whole shot. Returns each island's body handles, empty ones dropped; everything else is the main island.
  function islandsOf(list) {
    if (!Array.isArray(list) || list.some((l) => !Array.isArray(l))) throw new Error("opts.islands is a list of lists of bodies: [[a, b], [c]]");
    const seen = new Set(), out = list.map((l) => l.map((x) => {
      const b = x?.body || x, t = tracked.find((e) => e.body === b);
      if (!t) throw new Error("opts.islands takes bodies made by roundBox or dynamicHull");
      if (kin.some((e) => e.body === b)) throw new Error(`"${t.name}" is kinematic: a body moved by a path stays in the main island`);
      if (mech.some((p) => p.bodies.includes(b))) throw new Error(`"${t.name}" is moved by a mechanism part (a spring or a latch): it stays in the main island`);
      if (seen.has(b.handle)) throw new Error(`"${t.name}" is in two islands (or listed twice)`);
      seen.add(b.handle);
      return b.handle;
    }).sort((p, q) => p - q)).filter((hs) => hs.length).sort((p, q) => p[0] - q[0]);
    const of = new Map(); out.forEach((hs, k) => hs.forEach((h) => of.set(h, k + 1)));
    world.impulseJoints.forEach((j) => { if ((of.get(j.body1().handle) || 0) !== (of.get(j.body2().handle) || 0)) throw new Error("a joint ties bodies of two islands: they cannot be baked apart"); });
    const byName = new Map(); // a name shared across islands would make one island's impacts suppress the other's: the single-world bake does exactly that
    tracked.forEach((t) => { if (!t.impacts) return; const k = of.get(t.body.handle) || 0; if (byName.has(t.name) && byName.get(t.name) !== k) throw new Error(`"${t.name}" names bodies in two islands: give each its own name (opts.name)`); byName.set(t.name, k); });
    return out;
  }

  // A body's reach: one bounding sphere, in the body's frame (the root's own frame), around everything of it that can
  // touch: each of its colliders (its shape, where it sits on the body, its contact skin) and the drawn geometry.
  // Rapier's contacts come from the colliders, and a collider can reach past what is drawn (a roundBox built wider than
  // its mesh, an extra collider beside a hull): the island proof judges this, never the drawn geometry alone. A shape it
  // cannot bound is refused. Read with every collider where its body is (propagateModifiedBodyPositionsToColliders first).
  const rot = (q, [x, y, z]) => { const tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x); return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)]; };
  function reachOf(t) {
    const S = RAPIER.ShapeType, pts = [], d = localPoints(t.root, null, 0.01 / mpu); // pts: [x, y, z, radius around it]
    for (let i = 0; i < d.length; i += 3) pts.push([d[i], d[i + 1], d[i + 2], 0]);
    const bp = t.body.translation(), bq = t.body.rotation(), inv = { x: -bq.x, y: -bq.y, z: -bq.z, w: bq.w };
    for (let k = 0; k < t.body.numColliders(); k++) {
      const c = t.body.collider(k), ty = c.shapeType(), cp = c.translation(), cq = c.rotation(), box = (x, y, z) => [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-1, 1].map((e) => [a * x, b * y, e * z])));
      let local, r = c.contactSkin() + ([S.RoundCuboid, S.RoundCylinder, S.RoundCone, S.RoundConvexPolyhedron].includes(ty) ? c.roundRadius() : 0);
      if (ty === S.Ball) { local = [[0, 0, 0]]; r += c.radius(); }
      else if (ty === S.Capsule) { local = [[0, -c.halfHeight(), 0], [0, c.halfHeight(), 0]]; r += c.radius(); }
      else if (ty === S.Cuboid || ty === S.RoundCuboid) { const h = c.halfExtents(); local = box(h.x, h.y, h.z); }
      else if ([S.Cylinder, S.RoundCylinder, S.Cone, S.RoundCone].includes(ty)) local = box(c.radius(), c.halfHeight(), c.radius());
      else if ([S.ConvexPolyhedron, S.RoundConvexPolyhedron, S.TriMesh, S.Polyline].includes(ty)) { const v = c.vertices(); local = []; for (let i = 0; i < v.length; i += 3) local.push([v[i], v[i + 1], v[i + 2]]); }
      else throw new Error(`opts.islands: "${t.name}" has a collider (shape type ${ty}) whose reach the island proof cannot bound: give it a ball, box, capsule, cylinder, cone or hull collider (or drop opts.islands)`);
      local.forEach((v) => { const w = rot(cq, v), p = rot(inv, [w[0] + cp.x - bp.x, w[1] + cp.y - bp.y, w[2] + cp.z - bp.z]); pts.push([...p, r]); });
    }
    const m = t.body.localCom(), com = [m.x, m.y, m.z]; // m: the centre of mass, read with the reach (a script may change mass later)
    if (!pts.length) return { c: [0, 0, 0], r: 0, com };
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k] - p[3]); hi[k] = Math.max(hi[k], p[k] + p[3]); }
    const c = lo.map((x, k) => (x + hi[k]) / 2); let r = 0;
    for (const p of pts) r = Math.max(r, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) + p[3]);
    return { c, r, com };
  }
  // Proof that the islands stayed apart: at every pre-roll step, every stored step and on the path between two, no body came within 5 mm of a
  // body of another island (main counts as one), judged on each body's reach (reachOf: its colliders and drawn geometry). A meeting throws:
  // this bake is not the single-world bake. The pre-roll counts as much as the shot: it is where loose pieces drop and
  // settle, and each island's world bakes it without the others' bodies, so a piece that would have landed on a
  // declared body falls through its place and ends far from it, with nothing left to see at t = 0. pre: each body's
  // pose before every pre-roll step (7 floats each); poses: the stored steps of the shot; sp: each body's reach.
  // Islands are for sets that settle slowly. Inside a step, Rapier's CCD can stop a fast body, pass a hit on to another
  // and bounce it back before the step ends: motion no traced pose or speed shows. So a body moving over 10 mm in one
  // step (its speed plus spin times its lever from the centre of mass, or its actual move) refuses the island bake:
  // that set bakes as one world. Below that, each step is judged as a capsule: a path of length ℓ from S to E stays
  // within √(ℓ² − |SE|²)/2 of the segment SE, ℓ the step's largest traced speed times dt (run; at least ℓ itself, for a
  // bounce inside the step), and two bodies are judged segment to segment, whenever in the step each was where. A script's teleport between two steps (jumps) is
  // not a path: the step is judged from where the body was put. A NaN pose is refused.
  const segs = (p0, p1, q0, q1) => { // closest distance between segments p0p1 and q0q1
    const d1 = [0, 1, 2].map((k) => p1[k] - p0[k]), d2 = [0, 1, 2].map((k) => q1[k] - q0[k]), r = [0, 1, 2].map((k) => p0[k] - q0[k]);
    const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), clamp = (x) => Math.min(1, Math.max(0, x));
    let s = 0, t = 0;
    if (a <= 1e-18 && e <= 1e-18) { s = t = 0; }
    else if (a <= 1e-18) { t = clamp(f / e); }
    else {
      const c = dot(d1, r);
      if (e <= 1e-18) s = clamp(-c / a);
      else {
        const b = dot(d1, d2), den = a * e - b * b;
        s = den > 1e-18 ? clamp((b * f - c * e) / den) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
      }
    }
    return Math.hypot(r[0] + s * d1[0] - t * d2[0], r[1] + s * d1[1] - t * d2[1], r[2] + s * d1[2] - t * d2[2]);
  };
  function crossing(poses, pre, jumps, run, of, n, dt, sp) {
    const margin = 0.005 / mpu, fast = 0.01 / mpu, cur = poses.map(() => 0), K = 1 + Math.max(0, ...of.values());
    const isle = tracked.map((t) => of.get(t.body.handle) || 0), P = pre.length ? pre[0].length / 7 : 0;
    const lever = sp.map((x) => Math.hypot(x.c[0] - x.com[0], x.c[1] - x.com[1], x.c[2] - x.com[2]));
    const centre = (i, [x, y, z, qx, qy, qz, qw]) => {
      const [vx, vy, vz] = sp[i].c, tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx); // c rotated by q, then moved to the body
      return [x + vx + qw * tx + (qy * tz - qz * ty), y + vy + qw * ty + (qz * tx - qx * tz), z + vz + qw * tz + (qx * ty - qy * tx)];
    };
    let at = tracked.map(() => null), k = 0;
    const frame = (pose, when) => {
      const from = [], bend = []; // from: each reach centre where this step began (the step before, or where a script put it); bend: how far its path can stray from the segment
      const lo = Array.from({ length: K }, () => [Infinity, Infinity, Infinity]), hi = Array.from({ length: K }, () => [-Infinity, -Infinity, -Infinity]);
      tracked.forEach((_, i) => {
        const j = jumps[i]?.get(k), before = at[i];
        at[i] = centre(i, pose(i)); from[i] = j ? centre(i, j) : before || at[i];
        const len = (run[i][k * 2] + run[i][k * 2 + 1] * lever[i]) * dt, se = Math.hypot(at[i][0] - from[i][0], at[i][1] - from[i][1], at[i][2] - from[i][2]);
        if (k && !(Math.max(len, se) <= fast)) throw new Error(`opts.islands: "${tracked[i].name}" moves ${(Math.max(len, se) * mpu * 1000).toFixed(2)} mm in one step at ${when}: over 10 mm a step, a body can move inside a step in ways the island proof cannot see. Islands are for sets that settle slowly: bake this one as one world (drop opts.islands)`);
        bend[i] = k ? Math.max(len, len > se ? Math.sqrt(len * len - se * se) / 2 : 0) : 0; // len too: a thin collider's CCD can bounce it inside even a slow step
        const ki = isle[i], r = sp[i].r + bend[i] + margin, w = from[i];
        for (let a = 0; a < 3; a++) { lo[ki][a] = Math.min(lo[ki][a], at[i][a] - r, w[a] - r); hi[ki][a] = Math.max(hi[ki][a], at[i][a] + r, w[a] + r); }
      });
      for (let ka = 0; ka < K; ka++) for (let kb = ka + 1; kb < K; kb++) {
        if ([0, 1, 2].some((a) => lo[ka][a] > hi[kb][a] || lo[kb][a] > hi[ka][a])) continue; // the islands' boxes do not even overlap
        for (let i = 0; i < tracked.length; i++) if (isle[i] === ka) for (let j = 0; j < tracked.length; j++) if (isle[j] === kb) {
          const d = segs(from[i], at[i], from[j], at[j]) - sp[i].r - sp[j].r - bend[i] - bend[j];
          if (!(d >= margin)) throw new Error(`${ka ? `island ${ka}` : "the main island"} and island ${kb} meet: "${tracked[i].name}" and "${tracked[j].name}" come within ${(Math.max(0, d || 0) * mpu * 1000).toFixed(1)} mm at ${when} — put them in one island (or drop opts.islands) and bake again`);
        }
      }
      k++;
    };
    for (let f = 0; f < P; f++) frame((i) => pre[i].subarray(f * 7, f * 7 + 7), `${((f - P) * dt).toFixed(3)} s (pre-roll)`);
    for (let s = 0; s < n; s++) {
      frame((i) => { const { s: st, p } = poses[i]; while (cur[i] + 1 < st.length && st[cur[i] + 1] <= s) cur[i]++; return p.subarray(cur[i] * 7, cur[i] * 7 + 7); }, `${(s * dt).toFixed(3)} s`); // a gap between stored steps = at rest
    }
  }

  // The islands baked apart and merged into one result, the way bake() gives it. Each declared island is a restored copy
  // of the world with every other body off, baked in a worker while this thread bakes the main island (every body not
  // declared: only it runs onStep, the kinematic paths, opts.track and opts.keep). Declared bodies and every world query are fenced meanwhile,
  // so a script that reaches a declared body fails instead of seeing a body that is switched off. What the island worlds
  // share with this one (gravity, solver, fixed bodies, static colliders, joints) cannot be changed by a script either. Each world also bakes
  // its pre-roll without the others: crossing() proves from the pre-roll poses (pre) that they never met.
  async function bakeIslands(isl, duration, onStep, preroll, opts) {
    const of = new Map(); isl.forEach((hs, k) => hs.forEach((h) => of.set(h, k + 1)));
    const idx = Array.from({ length: isl.length + 1 }, () => []); // the tracked indices of each island, main first
    tracked.forEach((t, i) => idx[of.get(t.body.handle) || 0].push(i));
    const own = new Set(tracked.map((t) => t.body.handle)), stray = []; // a body the sim did not make is switched off in every island world: it would never meet a declared body
    world.forEachRigidBody((b) => { if (!b.isFixed() && !own.has(b.handle)) stray.push(b.handle); });
    if (stray.length) throw new Error(`opts.islands: body ${stray[0]} is neither fixed nor made by roundBox, dynamicHull or kinematicHull: the island worlds switch it off, so it would never touch their bodies (or drop opts.islands)`);
    // Each body's reach, read once with every collider where its body is (a body placed by hand since the last step
    // moves its colliders only at the next one, which would then do the same): crossing() judges these, and the lock
    // below keeps them as they are while the set's scripts run.
    world.propagateModifiedBodyPositionsToColliders();
    const reach0 = tracked.map(reachOf);
    const nm = names(), snap = world.takeSnapshot(), shared0 = sharedState();
    const jobs = isl.map((hs, k) => ({ snap, handles: hs, items: idx[k + 1].map((i) => ({ h: tracked[i].body.handle, name: tracked[i].name, impacts: tracked[i].impacts, soft: tracked[i].soft, until: held.get(tracked[i].body.handle) ?? -Infinity })), duration, preroll, mpu, names: nm }));
    const finish = await startPool(RAPIER, jobs, opts.workers); // every worker has its job before this thread is busy
    // The set's own scripts (onStep, a kinematic pose, opts.track, opts.keep) run inside script(): while one runs, nothing
    // that could see a declared body answers. Those bodies are switched off in this world, parked where they were
    // placed, so a query would get nothing, or stale numbers, and the bake would quietly stop matching the single world.
    // Fenced: the bodies and their colliders (every method), the world's queries and listings (castRay, intersectionsWith…,
    // contactPairsWith, forEachCollider…), and lookups by a declared handle (getCollider, getRigidBody, bodies.get…).
    // A main-island body is read through its own methods, which stay open.
    let colliderProto = null, scripted = 0; const lift = [], hid = new Map(), hidCol = new Map(); // handle -> "name" + island, for the body and for each of its colliders
    const script = (fn) => { scripted++; try { return fn(); } finally { scripted--; } }, live = () => scripted > 0;
    let main;
    try {
      isl.forEach((hs, k) => idx[k + 1].forEach((i) => {
        const t = tracked[i], label = `"${t.name}" is in island ${k + 1}`, cols = Array.from({ length: t.body.numColliders() }, (_, c) => t.body.collider(c));
        if (cols.length) colliderProto ??= Object.getPrototypeOf(cols[0]);
        t.body.setEnabled(false);
        hid.set(t.body.handle, label); cols.forEach((c) => hidCol.set(c.handle, label));
        const refuse = () => { throw new Error(`${label}: onStep, opts.track and opts.keep see only the bodies outside opts.islands`); };
        lift.push(fence(t.body, live, refuse), ...cols.map((c) => fence(c, live, refuse)));
      }));
      const reach = (what) => (key) => { throw new Error(`${what}.${key}() sees every body, and the bodies of opts.islands are baked in other worlds: onStep, opts.track and opts.keep read a main-island body through its own methods (or leave this island out of opts.islands)`); };
      const only = (set, key) => (k, [h]) => { if (set.has(h)) throw new Error(`${set.get(h)}: ${key} reads a body of an island, which onStep, opts.track and opts.keep cannot see`); };
      lift.push(
        fence(world, live, reach("world"), ["step", "free", "takeSnapshot", "createRigidBody", "createCollider", "createImpulseJoint", "createMultibodyJoint", "getImpulseJoint", "getMultibodyJoint", "updateSceneQueries", "propagateModifiedBodyPositionsToColliders", "switchToStandardPgsSolver", "switchToSmallStepsPgsSolver", "switchToSmallStepsPgsSolverWithoutWarmstart", "getRigidBody", "getCollider"]),
        fence(world.narrowPhase, live, reach("world.narrowPhase"), ["free"]),
        fence(world.queryPipeline, live, reach("world.queryPipeline"), ["free", "update"]),
        fence(world.bodies, live, reach("world.bodies"), ["free", "finalizeDeserialization", "createRigidBody", "remove", "unmap", "len", "contains", "get"]),
        fence(world.colliders, live, reach("world.colliders"), ["free", "finalizeDeserialization", "createCollider", "castClosure", "remove", "unmap", "len", "contains", "get"]),
      );
      // A lookup by handle is open, but not for a declared body or collider.
      const byHandle = [[world, "getRigidBody", hid], [world.bodies, "get", hid], [world, "getCollider", hidCol], [world.colliders, "get", hidCol]];
      byHandle.forEach(([obj, key, set]) => lift.push(fence(obj, live, only(set, key), Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter((k) => k !== key))));
      // A main collider can also be handed a declared one (kept from before the bake): contactCollider and castCollider read it.
      if (colliderProto) ["contactCollider", "castCollider"].forEach((key) => {
        const orig = colliderProto[key], had = Object.prototype.hasOwnProperty.call(colliderProto, key);
        colliderProto[key] = function (...a) { const h = a.find((x) => x && typeof x === "object" && hidCol.has(x.handle)); if (live() && h) throw new Error(`${hidCol.get(h.handle)}: ${key} reads a body of an island, which onStep, opts.track and opts.keep cannot see`); return orig.apply(this, a); };
        lift.push(() => { if (had) colliderProto[key] = orig; else delete colliderProto[key]; });
      });
      // What the island worlds share with this one (gravity, the solver, the fixed bodies and static colliders, the joints)
      // was fixed by the snapshot: a script that changes it here changes only this world. Refused too; the hash below
      // catches a change by a call no fence knew.
      const wasFixed = (c) => { const p = c.parent(); return !p || p.isFixed(); }, keeps = (what) => (key) => { throw new Error(`${what}.${key}() changes what every island world shares with this one, and the island worlds never see it: onStep, opts.track and opts.keep may change the bodies outside opts.islands only (or leave this out of opts.islands)`); };
      const bodies = [], colliders = [];
      world.forEachRigidBody((b) => { if (b.isFixed()) bodies.push(b); });
      world.forEachCollider((c) => { if (wasFixed(c)) colliders.push(c); });
      lift.push(
        lock(world, live, keeps("world")), lock(world.integrationParameters, live, keeps("world.integrationParameters")),
        ...bodies.map((b) => lock(b, live, keeps(`fixed body ${b.handle}`))), ...colliders.map((c) => lock(c, live, keeps(`static collider ${c.handle}`))),
      );
      // A main-island collider's reach (its shape, where it sits on its body, its contact skin) is what crossing() proved
      // apart from the other islands: a script may change its material, mass and filters, never where it can touch.
      // Deny by default: every change but those in REACH_KEEPS is refused (the check after the bake catches one no lock knew).
      const reachKept = (name) => (key) => { if (!REACH_KEEPS.has(key)) throw new Error(`opts.islands: ${key}() on a collider of "${name}" changes where it can touch, and the islands were proved apart on the colliders as they were when the bake started: change it before the bake (or drop opts.islands)`); };
      idx[0].forEach((i) => { const t = tracked[i]; for (let c = 0; c < t.body.numColliders(); c++) lift.push(lock(t.body.collider(c), live, reachKept(t.name))); });
      let gv = world.gravity; const guard = (v) => new Proxy(v, { set(o, k, x) { if (live()) keeps("world")("gravity"); return Reflect.set(o, k, x); } });
      let gp = guard(gv);
      Object.defineProperty(world, "gravity", { configurable: true, enumerable: true, get: () => gp, set(v) { if (live()) keeps("world")("gravity"); gv = v; gp = guard(v); } });
      lift.push(() => Object.defineProperty(world, "gravity", { configurable: true, enumerable: true, writable: true, value: gv }));
      // A joint inside an island is a joint of bodies that are switched off here: reached through a joint set, it is fenced like its bodies.
      [world.impulseJoints, world.multibodyJoints].forEach((set) => set.forEach?.((j) => {
        const label = hid.get(j.body1().handle);
        if (label) lift.push(fence(j, live, () => { throw new Error(`${label}: its joint cannot be reached by onStep, opts.track or opts.keep, which see only the bodies outside opts.islands`); }));
      }));
      main = runBake(world, idx[0].map((i) => itemOf(tracked[i])), { duration, preroll, mpu, onStep: withParts(onStep), kin, track: Object.entries(opts.track || {}), keep: opts.keep, names: nm, script, trace: true });
    } finally { lift.reverse().forEach((undo) => undo()); }
    if (sharedState() !== shared0) throw new Error("opts.islands: gravity, the solver, a fixed body, a static collider or a joint changed during the bake, and the island worlds never saw it: change them before the bake, or leave the bodies they touch out of opts.islands");
    world.propagateModifiedBodyPositionsToColliders(); // the bake is over: read every collider where its body is
    tracked.forEach((t, i) => {
      const a = reach0[i], b = reachOf(t);
      if (Math.hypot(b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]) + b.r > a.r + 1e-4 / mpu) throw new Error(`opts.islands: a collider of "${t.name}" reaches further after the bake than when it started (changed by a call no lock knew), and the islands were proved apart on the colliders as they were: change it before the bake (or drop opts.islands)`);
    });
    const parts = [{ res: main, idx: idx[0] }, ...(await finish()).map((res, k) => ({ res, idx: idx[k + 1] }))];
    parts.forEach(({ res }) => { if (res.n !== main.n || res.dt !== main.dt) throw new Error("islands disagree on the number of steps"); });
    // One result in tracked order: poses by body, the report lists by body, the impacts by time then body (a single world's order).
    const poses = [], pre = [], jumps = [], run = [], list = (key) => parts.flatMap(({ res, idx: ix }) => res.ord[key].map((li, e) => ({ gi: ix[li], v: res.report[key][e] }))).sort((a, b) => a.gi - b.gi).map((x) => x.v);
    parts.forEach(({ res, idx: ix }) => ix.forEach((gi, li) => { poses[gi] = res.poses[li]; pre[gi] = res.pre[li]; jumps[gi] = res.jumps?.[li] || new Map(); run[gi] = res.run[li]; }));
    const impacts = parts.flatMap(({ res, idx: ix }) => res.impacts.map((v, e) => ({ gi: ix[res.ord.impacts[e]], v }))).sort((a, b) => a.v.t - b.v.t || a.gi - b.gi).map((x) => x.v);
    const deepest = parts.reduce((d, { res }) => (res.report.deepest.depth > d.depth ? res.report.deepest : d), { depth: 0 });
    crossing(poses, pre, jumps, run, of, main.n, main.dt, reach0);
    return baked({ n: main.n, dt: main.dt, series: main.series, kept: main.kept, poses, impacts, report: { penetration_mm: +(deepest.depth * 1000).toFixed(2), deepest, floating: list("floating"), moving: list("moving"), settled: list("settled"), ...(mech.length ? { latches: events() } : {}) } });
  }

  const sim = {
    world,
    points: localPoints,
    // Every mesh in the scene except the excluded subtrees becomes a fixed triangle mesh, in world space.
    staticScene(scene, exclude) {
      scene.updateMatrixWorld(true);
      const skip = new Set();
      exclude.forEach((r) => r.traverse((o) => skip.add(o)));
      let tris = 0;
      scene.traverse((m) => {
        if (!m.isMesh || skip.has(m) || !m.visible || m.userData.fur || m.material.isShadowMaterial || m.material.transparent) return; // glass, steam, shadow catchers, a coat of fur
        const g = m.geometry, p = g.attributes.position, v = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); v[i * 3] = tmp.x; v[i * 3 + 1] = tmp.y; v[i * 3 + 2] = tmp.z; }
        const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: p.count }, (_, i) => i);
        const c = world.createCollider(RAPIER.ColliderDesc.trimesh(v, idx).setFriction(0.55).setRestitution(0.15));
        let r = m; while (r.parent && r.parent !== scene) r = r.parent;
        owner.set(c.handle, r);
        tris += idx.length / 3;
      });
      return tris;
    },
    // A dynamic rounded box: the collider has the drawn geometry's corner radius, so edges touch where they are drawn.
    roundBox(mesh, w, h, d, r, o = {}) {
      const body = bodyAt(RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0.05).setAngularDamping(0.1).setCanSleep(false).setCcdEnabled(true), mesh);
      owner.set(world.createCollider(surface(RAPIER.ColliderDesc.roundCuboid(w / 2 - r, h / 2 - r, d / 2 - r, r), o), body).handle, mesh);
      return track(mesh, body, o);
    },
    // A dynamic body shaped by the convex hull of an object's own vertices (optionally a filtered part of them),
    // plus extra colliders [{ desc, ...surface }] in the same frame.
    // o.mass (kg): densities are scaled so the colliders weigh that much, keeping a real inertia (it can tilt).
    dynamicHull(root, o = {}) {
      const desc = RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true).setAngularDamping(o.angularDamping ?? 0.2).setLinearDamping(o.linearDamping ?? 0);
      if (o.lockRotations) desc.lockRotations();
      const body = bodyAt(desc, root), dens = o.mass ? { density: 1 } : {}, pts = localPoints(root, o.filter, o.spokes ? 0.001 / mpu : 0.006 / mpu); // a single hull from points ~6 mm apart (tolerances in metres / mpu)
      // o.spokes = { x, z, core, bins }: a radial object (a star base) is split into a core hull around the axis and
      // one hull per angular bin, so the gaps between legs stay empty instead of filled by one big hull.
      const groups = [];
      if (o.spokes) {
        const { x: cx, z: cz, core, bins } = o.spokes, sets = Array.from({ length: bins + 1 }, () => []);
        for (let i = 0; i < pts.length; i += 3) {
          const dx = pts[i] - cx, dz = pts[i + 2] - cz;
          sets[Math.hypot(dx, dz) < core ? bins : Math.min(bins - 1, Math.floor(((Math.atan2(dz, dx) + Math.PI) / (2 * Math.PI)) * bins))].push(pts[i], pts[i + 1], pts[i + 2]);
        }
        sets.forEach((s) => { if (solid(s)) groups.push(new Float32Array(s)); });
      } else if (solid(pts)) groups.push(pts);
      groups.forEach((g) => { const hull = RAPIER.ColliderDesc.convexHull(g); if (hull) owner.set(world.createCollider(surface(hull, { ...o, ...dens }), body).handle, root); });
      (o.extra || []).forEach((e) => owner.set(world.createCollider(surface(e.desc, { ...e, ...dens }), body).handle, root));
      if (o.mass) {
        body.recomputeMassPropertiesFromColliders();
        const k = o.mass / body.mass();
        for (let c = 0; c < body.numColliders(); c++) body.collider(c).setDensity(k);
        body.recomputeMassPropertiesFromColliders();
      }
      return track(root, body, o);
    },
    // A kinematic body shaped by an object's hull, moved each step by pose(t) → { p: {x,y,z}, q: {x,y,z,w} }.
    kinematicHull(root, pose, o = {}) {
      const body = bodyAt(RAPIER.RigidBodyDesc.kinematicPositionBased(), root);
      owner.set(world.createCollider(surface(RAPIER.ColliderDesc.convexHull(localPoints(root)), o), body).handle, root);
      kin.push({ body, pose });
      return track(root, body, { ...o, impacts: false });
    },
    // Keep a body out of the solver until t = until (a piece held off-frame until its cue): while held it is neither
    // stepped, recorded nor audited; it is switched on just before onStep(until). Place or hide it yourself.
    hold(x, until) {
      const b = x.body || x;
      if (!tracked.some((e) => e.body === b)) throw new Error("hold() takes a body made by roundBox, dynamicHull or kinematicHull");
      held.set(b.handle, until); return x;
    },
    // A mechanism part (mechanism.js): stepped before onStep every step (the pre-roll too), its key hashed into the bake,
    // its bodies refused in opts.islands; event() → { name, t } goes in report.latches. early: true runs it before the other
    // parts (a latch releases first, so its spring acts on the very step after the release).
    part(p) {
      if (replayed) throw new Error("mechanism parts are added before bakeCached");
      (p.early ? mech.unshift(p) : mech.push(p)); return p;
    },
    // Simulate [0, duration] after a pre-roll that lets everything settle onto its real support (a rug's thickness,
    // a soft seat), so frame 0 shows bodies already at rest. onStep(t) runs before each step (pushes, resistance).
    // opts.track = { name: () => number } samples a value after every recorded step (a liquid level): baked.at(name, t).
    // opts.keep = () => JSON stores what onStep built for later (a stop time, events): baked.kept.
    // Mechanism parts (mechanism.js) run before onStep; their release times come back in report.latches.
    bake(duration, onStep, preroll = 0.5, opts = {}) {
      if (replayed && !opts.fromCache) throw new Error("bake after bakeCached: a cached replay leaves the world at its start — bake everything in one bakeCached");
      if (opts.islands?.length) throw new Error("islands are baked in workers: use bakeCached");
      const { ord, pre, ...data } = runBake(world, tracked.map(itemOf), { duration, preroll, mpu, onStep: withParts(onStep), kin, track: Object.entries(opts.track || {}), keep: opts.keep, names: names() });
      if (mech.length) data.report.latches = events(); // when each latch let go: stored with the bake, so a replay knows it
      return baked(data);
    },
    // bake(), stored once in assets/bake/<hash>.bin and replayed from there by every later page load (a snapshot, the
    // preview, each render worker). The hash covers everything that decides the result: every collider and body, the
    // solver settings, duration and pre-roll, onStep's and opts.track's source, the kinematic paths (sampled), holds,
    // the set's modules in assets/, the narration timing (beats.js) and opts.key — put in key anything else onStep reads.
    // A page cannot write files: a miss is posted to engine/three/bake.mjs when it runs; otherwise it is just baked.
    // After a cached bake the Rapier world is not at the shot's end: read only the returned object.
    // opts.islands = [[a, b], [c]]: groups that never touch for the whole shot, baked as separate worlds in workers
    // beside the main island (every body not listed, the only one that runs onStep, kinematic paths, track and keep).
    async bakeCached(duration, onStep, preroll = 0.5, opts = {}) {
      if (replayed) throw new Error("one bakeCached per sim: a shot that continues another is part of the same bake");
      replayed = true;
      const isl = opts.islands ? islandsOf(opts.islands) : [], hash = await fingerprint(duration, onStep, preroll, opts, isl), t0 = Date.now();
      const load = opts.load || ((name) => fetch(new URL(`./bake/${name}.bin`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
      const save = opts.save || ((name, bytes) => fetch(`${opts.receiver || "http://127.0.0.1:47613"}/bake/${name}`, { method: "POST", mode: "no-cors", body: bytes }).catch(() => null));
      const d = decode(await load(hash), hash, tracked.length);
      if (d) { console.info(`[physics] bake ${hash} read from cache`); return baked(d, hash, true); }
      const r = isl.length ? await bakeIslands(isl, duration, onStep, preroll, opts) : sim.bake(duration, onStep, preroll, { ...opts, islands: undefined, fromCache: true });
      console.info(`[physics] bake ${hash} computed in ${((Date.now() - t0) / 1000).toFixed(1)} s${isl.length ? ` (main + ${isl.length} islands)` : ""}`);
      await save(hash, encode(r.data, hash));
      return Object.assign(r, { hash });
    },
    // Contact audit for props placed by hand: the gap (+) or overlap (−) between each object's lowest point and the
    // surface under its centre, in mm. A near miss (0.5–30 mm either way) is a placement error.
    audit(objects) {
      if (replayed) throw new Error("audit before bakeCached: after a cached replay the bodies are not where the live bake left them");
      world.updateSceneQueries?.();
      const out = [], v = new THREE.Vector3(), bottoms = new Map();
      objects.forEach((o) => {
        const b = new THREE.Box3().setFromObject(o, true); // from the vertices: a rotated mesh's own box overstates it
        if (b.isEmpty()) return;
        const own = new Set(); o.traverse((x) => own.add(x));
        // Ignore itself and anything resting on top of it: only what is below can be its support.
        const below = (col) => { const r = owner.get(col.handle); if (!r || own.has(r)) return false; if (!bottoms.has(r)) bottoms.set(r, new THREE.Box3().setFromObject(r, true).min.y); return bottoms.get(r) < b.min.y - 0.001 / mpu; };
        // The gap under each of its lowest points (one per cell of a 6 × 6 grid over its footprint); the smallest is
        // where it rests: it should be ~0 (touching), not a few mm of air or a few mm into its support.
        const low = new Map(), cell = (a, lo, hi) => Math.min(5, Math.max(0, Math.floor(((a - lo) / (hi - lo || 1)) * 6)));
        o.traverse((m) => { if (!m.isMesh || !m.visible || m.userData.fur) return; const p = m.geometry.attributes.position, step = Math.max(1, Math.floor(p.count / 6000)); for (let i = 0; i < p.count; i += step) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); const k = cell(v.x, b.min.x, b.max.x) * 6 + cell(v.z, b.min.z, b.max.z); if (!low.has(k) || v.y < low.get(k).y) low.set(k, v.clone()); } });
        let best = null;
        for (const q of low.values()) {
          const hit = world.castRay(new RAPIER.Ray({ x: q.x, y: q.y + 0.1 / mpu, z: q.z }, { x: 0, y: -1, z: 0 }), 0.4 / mpu, true, undefined, undefined, undefined, undefined, below);
          if (hit && (!best || hit.timeOfImpact < best.hit.timeOfImpact)) best = { hit, q };
        }
        if (!best) return;
        const gap = (best.hit.timeOfImpact - 0.1 / mpu) * 1000 * mpu;
        if (Math.abs(gap) >= 0.5 && Math.abs(gap) <= 30) out.push({ name: o.name || o.type, at: best.q.toArray().map((x) => +x.toFixed(3)), gap_mm: +gap.toFixed(1), on: (owner.get(best.hit.collider.handle) || {}).name || "?" });
      });
      return out;
    },
  };
  return sim;
}
