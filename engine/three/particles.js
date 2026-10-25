import { THREE } from "./three-vendor.js";
import { M, tone } from "./kit.js";

// Particles that live in the set's air (wind.js), simulated before the first frame at 60 Hz and replayed: seeded
// births, the same in every render. All physics in real units:
//   steam  — a warm plume from a cup: lifts by buoyancy that fades as it cools (~0.8 s), drag ties each puff to the
//            air (it bends with any draught), puffs swell from 6 mm to ~7 cm and thin out over ~2 s.
//   smoke  — the same law, hotter and longer: rises ~0.7 m/s, swells to half a metre, grey, ~5 s.
//   dust   — motes filling a volume: they follow the air almost exactly, settle ~3 mm/s, jitter (Brownian), and
//            show only where light passes (lit(p) → 0..1, e.g. inside a lamp's cone or a sunbeam).
//   rain   — drops 1-3 mm across, falling at their terminal speed (Gunn-Kinzer: ~4.5 m/s at 1 mm, ~8 m/s at 3 mm)
//            plus the wind; each hit of the ground is recorded (impacts: x, z, t) for ripples and splashes.
const kinds = {
  steam: { rate: 30, life: [1.5, 2.5], up: 0.15, buoy: 0.5, cool: 0.8, follow: 3, size: [0.006, 0.07], alpha: 0.22, color: 0xf6f6f4 },
  smoke: { rate: 14, life: [4, 6], up: 0.3, buoy: 1.0, cool: 2, follow: 1.5, size: [0.03, 0.5], alpha: 0.2, color: 0x8f8e8b },
  dust: { count: 600, follow: 8, settle: 0.003, jitter: 0.01, size: [0.0008, 0.002], alpha: 0.9, color: 0xfff1d8 },
  rain: { rate: 0, diameter: [1, 3], alpha: 0.35, color: 0xd8e2ea },
};
const terminal = (dmm) => 9.65 - 10.3 * Math.exp(-0.6 * dmm); // m/s, Gunn & Kinzer (1949) fit

// kind: one of the above; at (units): the source (steam, smoke), or box { x0, x1, y0, y1, z0, z1 } (dust, and rain
// falls from its top onto ground y); radius (m): the source's size; rate: births per second (rain: per m² per s,
// ~300 for steady rain); lit(p): light at a point, 0..1 (dust); ground: the height rain stops at (units), or
// ground(x, z) for uneven ground (a pond's surface below the lawn).
export function particles(k, { kind, at, box, radius = 0.03, field, rate, lit = () => 1, ground = 0, seed = 7, max, ...over }) {
  const K = { ...kinds[kind], ...over }, rnd = ((i) => () => tone(i++, seed))(1), V = new THREE.Vector3(), A = new THREE.Vector3();
  const area = box ? (box.x1 - box.x0) * (box.z1 - box.z0) * M * M : 0, perSec = kind === "rain" ? (rate ?? 300) * area : rate ?? K.rate;
  const n = max ?? (kind === "dust" ? K.count : Math.ceil(perSec * (kind === "rain" ? ((box.y1 - box.y0) * M) / 4 + 0.5 : K.life[1]) * 1.2));
  const P = new Float32Array(n * 3), U = new Float32Array(n * 3), age = new Float32Array(n).fill(-1), life = new Float32Array(n), D = new Float32Array(n);
  const impacts = [], frames = [], fps = 24, dt = 1 / 60, floorAt = typeof ground === "function" ? ground : () => ground;
  let born = 0;
  function spawn(i, t) {
    age[i] = 0;
    if (kind === "rain") {
      D[i] = K.diameter[0] + (K.diameter[1] - K.diameter[0]) * rnd() ** 2; life[i] = Infinity;
      P.set([box.x0 + (box.x1 - box.x0) * rnd(), box.y1, box.z0 + (box.z1 - box.z0) * rnd()], i * 3);
      if (field) field.at(V.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), t, A).multiplyScalar(M); else A.set(0, 0, 0);
      U.set([A.x, A.y - terminal(D[i]), A.z], i * 3); // it has fallen a long way already: at its terminal speed, moving with the wind
    } else if (kind === "dust") {
      life[i] = Infinity; D[i] = K.size[0] + (K.size[1] - K.size[0]) * rnd();
      P.set([box.x0 + (box.x1 - box.x0) * rnd(), box.y0 + (box.y1 - box.y0) * rnd(), box.z0 + (box.z1 - box.z0) * rnd()], i * 3); U.set([0, 0, 0], i * 3);
    } else {
      const a = rnd() * 6.283, r = (radius / M) * Math.sqrt(rnd());
      life[i] = K.life[0] + (K.life[1] - K.life[0]) * rnd();
      P.set([at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r], i * 3); U.set([0, K.up, 0], i * 3);
    }
  }
  return {
    impacts, count: n, frames, // frames: per stored frame, 8 floats a particle (position, velocity m/s, size, alpha)
    bake(duration, preroll = kind === "dust" ? 0.5 : 3) {
      if (kind === "dust") for (let i = 0; i < n; i++) spawn(i, -preroll);
      const steps = Math.round((preroll + duration) / dt), every = Math.round(1 / (fps * dt));
      for (let s = 0; s <= steps; s++) {
        const t = s * dt - preroll;
        if (kind !== "dust") for (; born < (t + preroll) * perSec; born++) { let i = age.findIndex((a) => a < 0); if (i < 0) break; spawn(i, t); }
        for (let i = 0; i < n; i++) {
          if (age[i] < 0) continue;
          const j = i * 3;
          field ? field.at(V.set(P[j], P[j + 1], P[j + 2]), t, A).multiplyScalar(M) : A.set(0, 0, 0); // the air, m/s
          if (kind === "rain") { const g = 9.81 / terminal(D[i]); U[j] += g * (A.x - U[j]) * dt; U[j + 1] += (-9.81 + g * (A.y - U[j + 1])) * dt; U[j + 2] += g * (A.z - U[j + 2]) * dt; }
          else if (kind === "dust") { U[j] = A.x + K.jitter * (rnd() - 0.5) * 2; U[j + 1] = A.y - K.settle + K.jitter * (rnd() - 0.5) * 2; U[j + 2] = A.z + K.jitter * (rnd() - 0.5) * 2; }
          else { const b = K.buoy * Math.exp(-age[i] / K.cool); U[j] += K.follow * (A.x - U[j]) * dt; U[j + 1] += (b + K.follow * (A.y - U[j + 1])) * dt; U[j + 2] += K.follow * (A.z - U[j + 2]) * dt; }
          P[j] += (U[j] / M) * dt; P[j + 1] += (U[j + 1] / M) * dt; P[j + 2] += (U[j + 2] / M) * dt;
          age[i] += dt;
          if (kind === "rain" && P[j + 1] <= floorAt(P[j], P[j + 2])) { if (t >= 0) impacts.push({ x: P[j], z: P[j + 2], t, d: D[i] }); age[i] = -1; } // the slot is free: births keep the rate
          else if (kind === "dust") { // the volume wraps: what drifts out one side comes back the other
            for (const [c, lo, hi] of [[0, box.x0, box.x1], [1, box.y0, box.y1], [2, box.z0, box.z1]]) if (P[j + c] < lo) P[j + c] += hi - lo; else if (P[j + c] > hi) P[j + c] -= hi - lo;
          } else if (age[i] > life[i]) age[i] = -1;
        }
        if (t >= 0 && s % every === 0) {
          const f = new Float32Array(n * 8); // position, velocity (m/s), size (units), alpha
          for (let i = 0; i < n; i++) {
            const j = i * 3, o = i * 8, u = age[i] < 0 ? 0 : Math.min(1, age[i] / (life[i] || 1));
            f.set([P[j], P[j + 1], P[j + 2], U[j], U[j + 1], U[j + 2]], o);
            if (age[i] < 0) { f[o + 6] = 0; f[o + 7] = 0; continue; }
            if (kind === "rain") { f[o + 6] = D[i] / 1000 / M; f[o + 7] = K.alpha; }
            else if (kind === "dust") { f[o + 6] = D[i] / M; f[o + 7] = K.alpha * lit(V.set(P[j], P[j + 1], P[j + 2])); }
            else { f[o + 6] = (K.size[0] + (K.size[1] - K.size[0]) * Math.sqrt(u)) / M; f[o + 7] = K.alpha * Math.min(1, age[i] / 0.15) * (1 - u) ** 1.5; }
          }
          frames.push(f);
        }
      }
      return this;
    },
    // The drawable: soft sprites (steam, smoke, dust) or streaks (rain: each drop drawn as the line it travels in
    // half a frame, as a 180° shutter records it). apply(t, camera, heightPx) every frame.
    object() {
      const geo = new THREE.BufferGeometry(), color = new THREE.Color(K.color);
      if (kind === "rain") {
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 6), 3));
        geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 8), 4));
        this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
      } else {
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
        geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
        geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1));
        this.uniforms = { uScale: { value: 1000 }, uColor: { value: color }, uPuff: { value: kind === "dust" ? 0 : 1 } };
        this.mesh = new THREE.Points(geo, new THREE.ShaderMaterial({
          uniforms: this.uniforms, transparent: true, depthWrite: false, blending: kind === "dust" ? THREE.AdditiveBlending : THREE.NormalBlending,
          vertexShader: "attribute float aSize, aAlpha; uniform float uScale, uPuff; varying float vA, vSeed; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float px = aSize * uScale / -mv.z; gl_PointSize = max(1.0, px); vA = aAlpha * (uPuff > 0.5 ? min(1.0, px) : clamp(px * 3.0, 0.35, 1.0)); vSeed = fract(float(gl_VertexID) * 0.6180339); }", // a mote below a pixel still shows as a 1-px glint: it scatters the light it is in
          fragmentShader: "uniform vec3 uColor; uniform float uPuff; varying float vA, vSeed; float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); } float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); } void main() { vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0; vec2 q = gl_PointCoord * 3.0 + vSeed * 17.0; float puff = uPuff * 0.45 * (0.65 * vn(q) + 0.35 * vn(q * 2.3) - 0.5); float a = vA * smoothstep(1.0, 0.0, r + puff) * (uPuff > 0.5 ? 1.0 - 0.6 * r * r : 1.0); if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }", // soft wisps: smooth noise eats into each puff edge, a different one per particle
        }));
      }
      this.mesh.frustumCulled = false;
      this.mesh.name = kind;
      this.mesh.renderOrder = 2;
      k.scene.add(this.mesh);
      return this.mesh;
    },
    apply(t, camera, heightPx = 1080) {
      if (!frames.length) return;
      const x = Math.min(frames.length - 1.001, Math.max(0, t * fps)), i0 = Math.floor(x), q = x - i0, a = frames[i0], b = frames[i0 + 1], attr = this.mesh.geometry.attributes;
      for (let i = 0; i < n; i++) {
        const o = i * 8, jump = Math.abs(b[o + 1] - a[o + 1]) > 0.5 / M ? 1 : 0, w = jump ? (q < 0.5 ? 0 : 1) : q, L = (y) => a[o + y] + (b[o + y] - a[o + y]) * w; // a respawn is not a path
        if (kind === "rain") {
          const p = [L(0), L(1), L(2)], v = [L(3), L(4), L(5)], s = 0.5 / fps / M, al = Math.min(a[o + 7], b[o + 7]);
          attr.position.array.set([p[0], p[1], p[2], p[0] - v[0] * s, p[1] - v[1] * s, p[2] - v[2] * s], i * 6);
          attr.color.array.set([0.85, 0.89, 0.93, al, 0.85, 0.89, 0.93, 0], i * 8);
        } else {
          attr.position.array.set([L(0), L(1), L(2)], i * 3);
          attr.aSize.array[i] = L(6); attr.aAlpha.array[i] = Math.min(a[o + 7], b[o + 7]) > 0 ? L(7) : 0;
        }
      }
      for (const k2 in attr) attr[k2].needsUpdate = true;
      if (this.uniforms && camera) this.uniforms.uScale.value = heightPx / (2 * Math.tan((camera.fov * Math.PI) / 360));
    },
  };
}
