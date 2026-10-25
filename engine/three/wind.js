import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

// One air field for the set. Every source (a fan's jet, a breeze, a draught from a window) adds its velocity at a
// point; everything light reads the sum: cloth, leaves, grass, steam, smoke, dust, rain, the water's waves. So two
// things in the same air move together, as they do. Velocities are in scene units/s (m/s divided by M).
export function makeWind() {
  const sources = [], tmp = new THREE.Vector3();
  const field = {
    add(source) { sources.push(source); return field; }, // source(p, t, out) → out
    at(p, t, out = new THREE.Vector3()) { out.set(0, 0, 0); for (const s of sources) out.add(s(p, t, tmp)); return out; },
  };
  field.source = (p, t, out) => field.at(p, t, out); // a field is itself a source (for cloth.js's wind:)
  return field;
}

// Smooth seeded 3D value noise in [0, 1].
const hash3 = (x, y, z, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(s + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function noise3(x, y, z, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = x - xi, v = y - yi, w = z - zi;
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v), c = w * w * (3 - 2 * w), H = (i, j, k) => hash3(xi + i, yi + j, zi + k, s);
  const l = (p, q, t) => p + (q - p) * t;
  return l(l(l(H(0, 0, 0), H(1, 0, 0), a), l(H(0, 1, 0), H(1, 1, 0), a), b), l(l(H(0, 0, 1), H(1, 0, 1), a), l(H(0, 1, 1), H(1, 1, 1), a), b), c);
}

// Outdoor wind: speed (m/s) at ref metres above the ground (y = ground, units), slower near the ground by the log
// law of the surface layer (z0: roughness, 3 cm for grass and low plants), with gusts: frozen turbulence carried
// downwind at the mean speed (Taylor's hypothesis), eddies ~size metres, ±gust of the mean along the wind and half
// that across and up. Calm air is speed 0.
export function breeze({ dir = [1, 0, 0], speed = 3, ground = 0, z0 = 0.03, ref = 2, gust = 0.3, size = 4, seed = 1 } = {}) {
  const d = new THREE.Vector3(dir[0], 0, dir[2]).normalize(), side = new THREE.Vector3(-d.z, 0, d.x), U = speed / M, L = size / M;
  return (p, t, out) => {
    const h = Math.max(z0 * 1.5, (p.y - ground) * M), prof = Math.log(h / z0) / Math.log(ref / z0);
    const x = (p.x - d.x * U * t) / L, y = p.y / L, z = (p.z - d.z * U * t) / L;
    const along = noise3(x, y, z, seed) - 0.5 + 0.5 * (noise3(x * 4, y * 4, z * 4, seed + 7) - 0.5);
    const u = U * prof * (1 + 2 * gust * along), cross = U * prof * gust * (noise3(x + 31.7, y, z, seed + 1) - 0.5), up = 0.5 * U * prof * gust * (noise3(x, y + 17.3, z, seed + 2) - 0.5);
    return out.copy(d).multiplyScalar(u).addScaledVector(side, cross).setY(up);
  };
}

// A damped oscillator per flexible thing (a blade, a branch, a stem), driven by the drag of the air on it, baked at
// 120 Hz over the shot and stored per frame: bend(i, t) is its deflection (radians, x and z) at time t, the same in
// every render. f: natural frequency (Hz), zeta: damping ratio, lean: steady deflection (rad) at v_ref m/s (drag
// grows as v²), at(i): the point the air acts on.
export function bakeBend({ count, at, f, zeta = 0.2, lean, vRef = 10, field, duration, preroll = 2, fps = 24, sample = 1 }) { // sample: read the air every n steps (many cheap blades)
  const dt = 1 / 120, steps = Math.round((preroll + duration) / dt), every = Math.round(1 / (fps * dt)) || 1, frames = [];
  const th = new Float32Array(count * 2), om = new Float32Array(count * 2), air = new Float32Array(count * 2), v = new THREE.Vector3(), p = new THREE.Vector3();
  const w = Float32Array.from({ length: count }, (_, i) => 2 * Math.PI * (typeof f === "function" ? f(i) : f)), c = Float32Array.from({ length: count }, (_, i) => ((typeof lean === "function" ? lean(i) : lean) * w[i] * w[i]) / (vRef * vRef));
  for (let s = 0; s <= steps; s++) {
    const t = s * dt - preroll;
    for (let i = 0; i < count; i++) {
      if (s % sample === 0) { field.at(at(i, p), t, v); air[i * 2] = v.x * M; air[i * 2 + 1] = v.z * M; }
      const vx = air[i * 2], vz = air[i * 2 + 1], sp = Math.hypot(vx, vz);
      for (let k = 0; k < 2; k++) { // semi-implicit Euler: θ'' = c|v|v − 2ζωθ' − ω²θ
        const j = i * 2 + k, force = c[i] * sp * (k ? vz : vx);
        om[j] += (force - 2 * zeta * w[i] * om[j] - w[i] * w[i] * th[j]) * dt;
        th[j] += om[j] * dt;
      }
    }
    if (t >= 0 && s % every === 0) frames.push(th.slice());
  }
  return {
    frames,
    bend(t, out = new Float32Array(count * 2)) { // interpolated between stored frames
      const x = Math.min(frames.length - 1.001, Math.max(0, t * fps)), i = Math.floor(x), q = x - i, A = frames[i], B = frames[i + 1];
      for (let k = 0; k < out.length; k++) out[k] = A[k] + (B[k] - A[k]) * q;
      return out;
    },
  };
}
