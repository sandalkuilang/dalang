import { RAPIER } from "./rapier.js";
import { G, M } from "./kit.js";
export { RAPIER };

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
async function sources() {
  if (typeof document === "undefined" || typeof performance === "undefined") return "";
  const root = new URL("./", import.meta.url).href;
  const urls = [...new Set(performance.getEntriesByType("resource").map((e) => e.name.split(/[?#]/)[0]))].filter((u) => u.startsWith(root) && /\.(m?js|json)$/.test(u) && !u.startsWith(root + "bake/")).sort();
  const texts = await Promise.all(urls.map((u) => fetch(u).then((r) => r.text()).catch(() => "")));
  const g = globalThis, timing = JSON.stringify([g.BEATS, g.WORDS, g.SECTIONS, g.NARRATION_DURATION]);
  return urls.map((u) => u.slice(root.length)).concat(texts, timing).join("\n");
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
      travel(t, fps) {
        let m = 0;
        tracked.forEach((b, i) => { m = Math.max(m, pose(i, t + 0.5 / fps).p.distanceTo(pose(i, t - 0.5 / fps).p)); });
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
  // Everything that decides a bake's result, hashed (64-bit). Shapes are read field by field, so any collider counts.
  async function fingerprint(duration, onStep, preroll, opts) {
    const h = hasher(), v3 = (v) => { h.num(v.x); h.num(v.y); h.num(v.z); }, q4 = (q) => { v3(q); h.num(q.w); };
    const any = (x) => { if (typeof x === "number" || typeof x === "boolean") h.num(+x); else if (ArrayBuffer.isView(x)) x.forEach((e) => h.num(e)); else if (x && typeof x === "object") Object.keys(x).sort().forEach((k) => { h.str(k); any(x[k]); }); };
    h.str(`format ${BAKE_FORMAT}`); h.num(duration); h.num(preroll); h.num(world.timestep); v3(world.gravity);
    const ip = world.integrationParameters;
    [world.numSolverIterations, ip.numInternalPgsIterations, ip.normalizedAllowedLinearError, ip.contact_natural_frequency, ip.maxCcdSubsteps, ip.normalizedPredictionDistance, ip.numAdditionalFrictionIterations].forEach((x) => h.num(x ?? NaN));
    world.forEachRigidBody((b) => { h.num(b.handle); h.num(b.bodyType()); v3(b.translation()); q4(b.rotation()); v3(b.linvel()); v3(b.angvel()); h.num(b.mass()); v3(b.principalInertia()); h.num(b.linearDamping()); h.num(b.angularDamping()); h.num(b.gravityScale()); h.num(b.isEnabled()); h.num(b.isCcdEnabled()); });
    world.forEachCollider((c) => { h.num(c.handle); h.num(c.parent()?.handle ?? -1); any(c.shape); v3(c.translation()); q4(c.rotation()); h.num(c.friction()); h.num(c.restitution()); h.num(c.density()); h.num(c.collisionGroups()); h.num(c.isSensor()); h.num(c.isEnabled()); });
    world.impulseJoints.forEach((j) => { h.num(j.type()); h.num(j.body1().handle); h.num(j.body2().handle); v3(j.anchor1()); v3(j.anchor2()); });
    held.forEach((u, k) => { h.num(k); h.num(u); });
    kin.forEach((k) => { h.str(k.pose); for (let i = 0; i <= 16; i++) { const { p, q } = k.pose(-preroll + ((duration + preroll) * i) / 16); v3(p); if (q) q4(q); } });
    h.str(onStep || ""); h.str(opts.keep || ""); Object.entries(opts.track || {}).forEach(([k, fn]) => { h.str(k); h.str(fn); });
    h.str(JSON.stringify(opts.key ?? "")); h.str(await sources());
    return h.hex();
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
    // Simulate [0, duration] after a pre-roll that lets everything settle onto its real support (a rug's thickness,
    // a soft seat), so frame 0 shows bodies already at rest. onStep(t) runs before each step (pushes, resistance).
    // opts.track = { name: () => number } samples a value after every recorded step (a liquid level): baked.at(name, t).
    // opts.keep = () => JSON stores what onStep built for later (a stop time, events): baked.kept.
    bake(duration, onStep, preroll = 0.5, opts = {}) {
      if (replayed && !opts.fromCache) throw new Error("bake after bakeCached: a cached replay leaves the world at its start — bake everything in one bakeCached");
      const dt = world.timestep, n = Math.ceil(duration / dt) + 1, impacts = [], hist = [], win = Math.round(0.0125 / dt);
      const every = Math.max(1, Math.round(0.01 / dt)); // a resting body's contacts are audited every 10 ms, a moving one's every step
      const track = Object.entries(opts.track || {}), series = Object.fromEntries(track.map(([k]) => [k, new Float32Array(n)]));
      let deepest = { depth: 0 };
      const until = tracked.map((b) => held.get(b.body.handle) ?? -Infinity), on = tracked.map(() => true);
      const gate = (t) => until.forEach((u, i) => { const v = t >= u; if (v !== on[i]) { on[i] = v; tracked[i].body.setEnabled(v); } });
      // Sparse poses: a body's pose is stored when it moved ≥ 0.01 mm or turned ≥ ~1e-5 rad since the last stored one,
      // as float32 so a live bake and its cached replay give the same numbers. The rest pose right before a body
      // moves again is stored too, so a gap between two stored steps always means "at rest".
      const eps = 1e-5 / mpu, S = tracked.map(() => ({ s: [], p: [] })), last = tracked.map(() => null), prev = tracked.map(() => null), f = new Float32Array(7);
      const record = (s) => tracked.forEach((b, i) => {
        const p = b.body.translation(), q = b.body.rotation();
        f[0] = p.x; f[1] = p.y; f[2] = p.z; f[3] = q.x; f[4] = q.y; f[5] = q.z; f[6] = q.w;
        const cur = Array.from(f), L = last[i];
        if (!L || s === n - 1 || Math.hypot(cur[0] - L[0], cur[1] - L[1], cur[2] - L[2]) >= eps || Math.max(...[3, 4, 5, 6].map((k) => Math.abs(cur[k] - L[k]))) >= 5e-6) {
          const st = S[i];
          if (st.s.length && st.s[st.s.length - 1] < s - 1) { st.s.push(s - 1); st.p.push(...prev[i]); }
          st.s.push(s); st.p.push(...cur); last[i] = cur;
        }
        prev[i] = cur;
      });
      const sample = (s) => track.forEach(([k, fn]) => { series[k][s] = fn(); });
      tracked.forEach((b) => { b.com0 = { ...b.body.worldCom() }; b.q0 = { ...b.body.rotation() }; }); // pre-roll drift is measured at the centre of mass
      for (let s = Math.round(preroll / dt); s > 0; s--) {
        const t = -s * dt;
        gate(t);
        if (onStep) onStep(t);
        kin.forEach((k) => { const { p, q } = k.pose(t); k.body.setNextKinematicTranslation(p); if (q) k.body.setNextKinematicRotation(q); });
        world.step();
      }
      const settled = tracked.map((b) => {
        const c = b.body.worldCom(), d = ['x', 'y', 'z'].map((k) => +((c[k] - b.com0[k]) * 1000 * mpu).toFixed(1)), q = b.body.rotation();
        const q0 = new THREE.Quaternion(b.q0.x, b.q0.y, b.q0.z, b.q0.w), q1 = new THREE.Quaternion(q.x, q.y, q.z, q.w), up = new THREE.Vector3(0, 1, 0);
        const tilt = new THREE.Vector3(0, 1, 0).applyQuaternion(q1).angleTo(up.clone().applyQuaternion(q0)) * 180 / Math.PI, turn = (2 * Math.acos(Math.min(1, Math.abs(q0.dot(q1)))) * 180) / Math.PI;
        return { name: b.name, mm: +Math.hypot(...d).toFixed(1), xyz: d, deg: +turn.toFixed(2), tilt: +tilt.toFixed(2) };
      }).filter((e) => e.mm > 1 || e.deg > 0.2);
      gate(0); record(0); sample(0);
      for (let s = 1; s < n; s++) {
        const t = s * dt;
        gate(t);
        if (onStep) onStep(t);
        kin.forEach((k) => { const { p, q } = k.pose(t); k.body.setNextKinematicTranslation(p); if (q) k.body.setNextKinematicRotation(q); });
        world.step();
        record(s); sample(s);
        hist.push(tracked.map((b) => b.body.linvel()));
        if (hist.length > win + 1) hist.shift();
        tracked.forEach((b, i) => {
          if (!b.impacts || hist.length < win + 1) return;
          const v = hist[win][i], v0 = hist[0][i], dv = Math.hypot(v.x - v0.x, v.y - v0.y, v.z - v0.z) * mpu; // m/s, over 12.5 ms: stiff contacts spread a hit across steps
          const last = impacts.findLast((e) => e.name === b.name);
          if (dv >= 0.15 && !(last && t - last.t < 0.12)) impacts.push({ t: t - (win - 1) * dt, name: b.name, dv }); // ≥ 0.15 m/s is audible: a soft landing still gets its (quieter) sound
        });
        // Deepest penetration between any tracked body and anything else: every step for a moving body (a knock
        // peaks within a few steps), every 10 ms for a resting one (a slow sink), and all of them at the last step.
        const vel = hist[hist.length - 1], all = s % every === 0 || s === n - 1, turning = all ? null : tracked.map((b) => { const w = b.body.angvel(); return Math.hypot(w.x, w.y, w.z) >= 0.2; });
        tracked.forEach((b, i) => {
          if (b.soft || !on[i]) return; // a soft thing gives where it lands: its overlap is compression, not an error
          if (!all && Math.hypot(vel[i].x, vel[i].y, vel[i].z) * mpu < 0.02 && !turning[i]) return; // resting: neither sliding (2 cm/s) nor turning (0.2 rad/s)
          for (let c = 0; c < b.body.numColliders(); c++) {
            const col = b.body.collider(c);
            world.contactPairsWith(col, (other) => world.contactPair(col, other, (m) => {
              for (let i = 0; i < m.numContacts(); i++) {
                const d = -m.contactDist(i) * mpu;
                if (d > deepest.depth) deepest = { depth: d, t, a: b.name, b: (owner.get(other.handle) || {}).name || "?" };
              }
            }));
          }
        });
      }
      // End state: resting bodies must touch something; anything still moving is reported. A body still held is neither.
      const floating = [], moving = [], jointed = new Set(); // a body on a joint hangs from it, it does not float
      world.impulseJoints.forEach((j) => { jointed.add(j.body1().handle); jointed.add(j.body2().handle); });
      tracked.forEach((b, i) => {
        if (!on[i]) return;
        const v = b.body.linvel(), speed = Math.hypot(v.x, v.y, v.z) * mpu;
        let touching = false;
        for (let c = 0; c < b.body.numColliders(); c++) {
          const col = b.body.collider(c);
          world.contactPairsWith(col, (other) => world.contactPair(col, other, (m) => { for (let i = 0; i < m.numContacts(); i++) if (m.contactDist(i) * mpu <= 0.002) touching = true; }));
        }
        if (speed > 0.01) moving.push({ name: b.name, speed: +speed.toFixed(3) });
        else if (!touching && b.body.isDynamic() && !jointed.has(b.body.handle)) floating.push(b.name);
      });
      return baked({
        n, dt, series, impacts,
        poses: S.map((st) => ({ s: Uint32Array.from(st.s), p: Float32Array.from(st.p) })),
        kept: opts.keep ? JSON.parse(JSON.stringify(opts.keep())) : undefined, // what onStep built that the set reads later (a stop time)
        report: { penetration_mm: +(deepest.depth * 1000).toFixed(2), deepest, floating, moving, settled }, // settled: how far a body moved in the pre-roll (a big number = it was placed wrong)
      });
    },
    // bake(), stored once in assets/bake/<hash>.bin and replayed from there by every later page load (a snapshot, the
    // preview, each render worker). The hash covers everything that decides the result: every collider and body, the
    // solver settings, duration and pre-roll, onStep's and opts.track's source, the kinematic paths (sampled), holds,
    // the set's modules in assets/, the narration timing (beats.js) and opts.key — put in key anything else onStep reads.
    // A page cannot write files: a miss is posted to engine/three/bake.mjs when it runs; otherwise it is just baked.
    // After a cached bake the Rapier world is not at the shot's end: read only the returned object.
    async bakeCached(duration, onStep, preroll = 0.5, opts = {}) {
      if (replayed) throw new Error("one bakeCached per sim: a shot that continues another is part of the same bake");
      replayed = true;
      const hash = await fingerprint(duration, onStep, preroll, opts), t0 = Date.now();
      const load = opts.load || ((name) => fetch(new URL(`./bake/${name}.bin`, import.meta.url)).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null));
      const save = opts.save || ((name, bytes) => fetch(`${opts.receiver || "http://127.0.0.1:47613"}/bake/${name}`, { method: "POST", mode: "no-cors", body: bytes }).catch(() => null));
      const d = decode(await load(hash), hash, tracked.length);
      if (d) { console.info(`[physics] bake ${hash} read from cache`); return baked(d, hash, true); }
      const r = sim.bake(duration, onStep, preroll, { ...opts, fromCache: true });
      console.info(`[physics] bake ${hash} computed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
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
