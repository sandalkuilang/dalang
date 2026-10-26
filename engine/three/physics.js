import { RAPIER } from "./rapier.js";
import { G, M } from "./kit.js";
import { runBake } from "./bakecore.js";
import { startPool } from "./pool.js";
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
  async function fingerprint(duration, onStep, preroll, opts, isl = []) {
    const h = hasher(), v3 = (v) => { h.num(v.x); h.num(v.y); h.num(v.z); }, q4 = (q) => { v3(q); h.num(q.w); };
    const any = (x) => { if (typeof x === "number" || typeof x === "boolean") h.num(+x); else if (ArrayBuffer.isView(x)) x.forEach((e) => h.num(e)); else if (x && typeof x === "object") Object.keys(x).sort().forEach((k) => { h.str(k); any(x[k]); }); };
    h.str(`format ${BAKE_FORMAT}`); h.num(duration); h.num(preroll); h.num(world.timestep); v3(world.gravity);
    const ip = world.integrationParameters;
    [world.numSolverIterations, ip.numInternalPgsIterations, ip.normalizedAllowedLinearError, ip.contact_natural_frequency, ip.maxCcdSubsteps, ip.normalizedPredictionDistance, ip.numAdditionalFrictionIterations].forEach((x) => h.num(x ?? NaN));
    world.forEachRigidBody((b) => { h.num(b.handle); h.num(b.bodyType()); v3(b.translation()); q4(b.rotation()); v3(b.linvel()); v3(b.angvel()); h.num(b.mass()); v3(b.principalInertia()); h.num(b.linearDamping()); h.num(b.angularDamping()); h.num(b.gravityScale()); h.num(b.isEnabled()); h.num(b.isCcdEnabled()); });
    world.forEachCollider((c) => { h.num(c.handle); h.num(c.parent()?.handle ?? -1); any(c.shape); v3(c.translation()); q4(c.rotation()); h.num(c.friction()); h.num(c.restitution()); h.num(c.density()); h.num(c.collisionGroups()); h.num(c.isSensor()); h.num(c.isEnabled()); });
    world.impulseJoints.forEach((j) => { h.num(j.type()); h.num(j.body1().handle); h.num(j.body2().handle); v3(j.anchor1()); v3(j.anchor2()); });
    held.forEach((u, k) => { h.num(k); h.num(u); });
    if (isl.length) { h.str("islands"); isl.forEach((hs) => { h.num(hs.length); hs.forEach((x) => h.num(x)); }); } // how a bake is split into islands is part of its key
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

  // A bounding sphere per tracked body, in the body's frame (the root's own frame), from the drawn geometry.
  const sphereOf = (t) => {
    const p = localPoints(t.root, null, 0.01 / mpu), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[i + k]); hi[k] = Math.max(hi[k], p[i + k]); }
    if (!p.length) return { c: [0, 0, 0], r: 0 };
    const c = lo.map((x, k) => (x + hi[k]) / 2); let r = 0;
    for (let i = 0; i < p.length; i += 3) r = Math.max(r, Math.hypot(p[i] - c[0], p[i + 1] - c[1], p[i + 2] - c[2]));
    return { c, r };
  };
  // Proof that the islands stayed apart: at every stored step, no body came within 5 mm of a body of another island
  // (main counts as one), judged on the drawn geometry's bounding spheres. A meeting throws: this bake is not the
  // single-world bake. The pre-roll is not covered (it stores no poses): bodies settle where they were placed.
  function crossing(poses, of, n, dt) {
    const sp = tracked.map(sphereOf), margin = 0.005 / mpu, cur = poses.map(() => 0), K = 1 + Math.max(0, ...of.values()), at = tracked.map(() => [0, 0, 0]);
    const isle = tracked.map((t) => of.get(t.body.handle) || 0);
    for (let s = 0; s < n; s++) {
      const lo = Array.from({ length: K }, () => [Infinity, Infinity, Infinity]), hi = Array.from({ length: K }, () => [-Infinity, -Infinity, -Infinity]);
      poses.forEach(({ s: st, p }, i) => {
        while (cur[i] + 1 < st.length && st[cur[i] + 1] <= s) cur[i]++; // a gap between stored steps = at rest
        const o = cur[i] * 7, [x, y, z, qx, qy, qz, qw] = [p[o], p[o + 1], p[o + 2], p[o + 3], p[o + 4], p[o + 5], p[o + 6]], [vx, vy, vz] = sp[i].c;
        const tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx); // c rotated by q, then moved to the body
        at[i] = [x + vx + qw * tx + (qy * tz - qz * ty), y + vy + qw * ty + (qz * tx - qx * tz), z + vz + qw * tz + (qx * ty - qy * tx)];
        const k = isle[i], r = sp[i].r + margin;
        for (let a = 0; a < 3; a++) { lo[k][a] = Math.min(lo[k][a], at[i][a] - r); hi[k][a] = Math.max(hi[k][a], at[i][a] + r); }
      });
      for (let ka = 0; ka < K; ka++) for (let kb = ka + 1; kb < K; kb++) {
        if ([0, 1, 2].some((a) => lo[ka][a] > hi[kb][a] || lo[kb][a] > hi[ka][a])) continue; // the islands' boxes do not even overlap
        for (let i = 0; i < tracked.length; i++) if (isle[i] === ka) for (let j = 0; j < tracked.length; j++) if (isle[j] === kb) {
          const d = Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1], at[i][2] - at[j][2]) - sp[i].r - sp[j].r;
          if (d < margin) throw new Error(`${ka ? `island ${ka}` : "the main island"} and island ${kb} meet: "${tracked[i].name}" and "${tracked[j].name}" come within ${(Math.max(0, d) * mpu * 1000).toFixed(1)} mm at ${(s * dt).toFixed(3)} s — put them in one island (or drop opts.islands) and bake again`);
        }
      }
    }
  }

  // The islands baked apart and merged into one result, the way bake() gives it. Each declared island is a restored copy
  // of the world with every other body off, baked in a worker while this thread bakes the main island (every body not
  // declared: only it runs onStep, the kinematic paths, opts.track and opts.keep). Declared bodies are trapped meanwhile,
  // so a script that reads or pushes one fails instead of seeing a body that is switched off.
  async function bakeIslands(isl, duration, onStep, preroll, opts) {
    const of = new Map(); isl.forEach((hs, k) => hs.forEach((h) => of.set(h, k + 1)));
    const idx = Array.from({ length: isl.length + 1 }, () => []); // the tracked indices of each island, main first
    tracked.forEach((t, i) => idx[of.get(t.body.handle) || 0].push(i));
    const nm = names(), snap = world.takeSnapshot();
    const jobs = isl.map((hs, k) => ({ snap, handles: hs, items: idx[k + 1].map((i) => ({ h: tracked[i].body.handle, name: tracked[i].name, impacts: tracked[i].impacts, soft: tracked[i].soft, until: held.get(tracked[i].body.handle) ?? -Infinity })), duration, preroll, mpu, names: nm }));
    const finish = await startPool(RAPIER, jobs, opts.workers); // every worker has its job before this thread is busy
    const trapped = []; let main;
    try {
      isl.forEach((hs, k) => idx[k + 1].forEach((i) => {
        const t = tracked[i], proto = Object.getPrototypeOf(t.body);
        t.body.setEnabled(false);
        for (const key of Object.getOwnPropertyNames(proto)) {
          if (key === "constructor" || typeof Object.getOwnPropertyDescriptor(proto, key).value !== "function") continue;
          Object.defineProperty(t.body, key, { configurable: true, value() { throw new Error(`"${t.name}" is in island ${k + 1}: onStep, opts.track and opts.keep see only the bodies outside opts.islands`); } });
          trapped.push([t.body, key]);
        }
      }));
      main = runBake(world, idx[0].map((i) => itemOf(tracked[i])), { duration, preroll, mpu, onStep, kin, track: Object.entries(opts.track || {}), keep: opts.keep, names: nm });
    } finally { trapped.forEach(([b, key]) => delete b[key]); }
    const parts = [{ res: main, idx: idx[0] }, ...(await finish()).map((res, k) => ({ res, idx: idx[k + 1] }))];
    parts.forEach(({ res }) => { if (res.n !== main.n || res.dt !== main.dt) throw new Error("islands disagree on the number of steps"); });
    // One result in tracked order: poses by body, the report lists by body, the impacts by time then body (a single world's order).
    const poses = [], list = (key) => parts.flatMap(({ res, idx: ix }) => res.ord[key].map((li, e) => ({ gi: ix[li], v: res.report[key][e] }))).sort((a, b) => a.gi - b.gi).map((x) => x.v);
    parts.forEach(({ res, idx: ix }) => ix.forEach((gi, li) => { poses[gi] = res.poses[li]; }));
    const impacts = parts.flatMap(({ res, idx: ix }) => res.impacts.map((v, e) => ({ gi: ix[res.ord.impacts[e]], v }))).sort((a, b) => a.v.t - b.v.t || a.gi - b.gi).map((x) => x.v);
    const deepest = parts.reduce((d, { res }) => (res.report.deepest.depth > d.depth ? res.report.deepest : d), { depth: 0 });
    crossing(poses, of, main.n, main.dt);
    return baked({ n: main.n, dt: main.dt, series: main.series, kept: main.kept, poses, impacts, report: { penetration_mm: +(deepest.depth * 1000).toFixed(2), deepest, floating: list("floating"), moving: list("moving"), settled: list("settled") } });
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
      if (opts.islands?.length) throw new Error("islands are baked in workers: use bakeCached");
      const { ord, ...data } = runBake(world, tracked.map(itemOf), { duration, preroll, mpu, onStep, kin, track: Object.entries(opts.track || {}), keep: opts.keep, names: names() });
      return baked(data);
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
