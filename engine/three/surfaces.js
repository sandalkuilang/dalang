import { THREE } from "./three-vendor.js";
import { M } from "./kit.js";

// Real surfaces are never one flat colour: paint peels, cloth has a weave, a rug a pile, wood a grain, and even
// plastic carries smudges. Each surface here is a tileable map pair baked from seeded noise (no downloads, the
// same every render) and laid on any material by triplanar projection, so it needs no UVs: kit models, rounded
// boxes and lathes all take it. Map A: albedo multiplier (0.5 = unchanged) and, in alpha, where an under-layer
// shows (plaster under peeled paint); map B: normal and a roughness multiplier.

const hash = (x, y, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// Value noise with period p (cells), so a tile wraps without a seam.
function noise(x, y, p, s, q = p) {
  const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  const w = (i, n) => ((i % n) + n) % n, x0 = w(xi, p), x1 = w(xi + 1, p), y0 = w(yi, q), y1 = w(yi + 1, q);
  const n00 = hash(x0, y0, s), n10 = hash(x1, y0, s), n01 = hash(x0, y1, s), n11 = hash(x1, y1, s);
  return n00 + (n10 - n00) * a + (n01 - n00) * b + (n00 - n10 - n01 + n11) * a * b;
}
// u, v in [0, 1); f (fy): cells across (down) the tile at the first octave; fy ≠ f stretches the noise.
export function fbm(u, v, f, s, oct = 5, fy = f) {
  let t = 0, amp = 0.5, sum = 0;
  for (let i = 0; i < oct; i++, f *= 2, fy *= 2, amp *= 0.5) { t += amp * noise(u * f, v * fy, f, s + i * 17, fy); sum += amp; }
  return t / sum;
}
const clamp = (x) => Math.min(1, Math.max(0, x)), sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// fn(u, v) → [albedo r, g, b (0.5 neutral), under 0..1, height, roughness (0.5 neutral)]; bump: normal strength.
function bake(N, bump, fn) {
  const A = new Uint8Array(N * N * 4), B = new Uint8Array(N * N * 4), H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const o = fn(x / N, y / N), i = y * N + x;
    A.set([o[0] * 255, o[1] * 255, o[2] * 255, o[3] * 255], i * 4);
    H[i] = o[4];
    B[i * 4 + 3] = clamp(o[5]) * 255;
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const h = (xx, yy) => H[((yy + N) % N) * N + ((xx + N) % N)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * bump, dy = (h(x, y + 1) - h(x, y - 1)) * bump, l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    B[i] = (-dx / l * 0.5 + 0.5) * 255; B[i + 1] = (-dy / l * 0.5 + 0.5) * 255; B[i + 2] = (1 / l * 0.5 + 0.5) * 255;
  }
  const tex = (d) => { const t = new THREE.DataTexture(d, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true; return t; };
  return { a: tex(A), b: tex(B) };
}

const g = (k) => [0.5 * k, 0.5 * k, 0.5 * k];
export const surfaces = {
  // Old emulsion over plaster, one tile over the whole wall (5 m, world space; floor: the floor's height in scene units): rising damp has lifted the paint
  // in flakes along the skirting and in a few patches higher up; the flakes curl at their edges and a grey line of
  // dirt sits in each break; grime darkens the bottom 30 cm; a roller stipple everywhere.
  // wear (0..1) is the brief's choice: 0 a sound wall (stipple and faint mottling only), 1 an old one.
  plaster: ({ wear = 0, floor = 0 } = {}) => ({ size: 5 / M, under: 0xe7e1d4, ...bake(2048, 9, (u, v) => {
    const y = (v * 5 / M - floor) * M, m = fbm(u, v, 5, 1, 4), fine = fbm(u, v, 300, 2, 2), patch = fbm(u, v, 7, 3, 6);
    const P = patch + 0.3 * Math.exp(-y / 0.18) - 0.08 * sstep(0.6, 1.0, y), T = wear ? 0.68 + 0.12 * (1 - wear) : 9; // y: metres above the floor; at wear 1 ≈ 6 % of the wall, a fifth of the bottom 50 cm
    const under = sstep(T, T + 0.003, P), lip = Math.exp(-(((P - T) / 0.005) ** 2)), crumble = fbm(u, v, 120, 4, 3);
    const k = (0.985 + 0.03 * m) * (1 - 0.35 * lip) * (1 - 0.1 * wear * (1 - sstep(0, 0.3, y))) * (under ? 0.92 + 0.16 * crumble : 1);
    return [...g(k), under, (1 - under) * 0.5 + 0.5 * lip * (1 - under) + 0.06 * fine + under * 0.25 * crumble, 0.5 * (under ? 1.5 : 0.95 + 0.1 * m)];
  }) }),
  // Plain-weave upholstery cloth, 1 mm threads (4 cm tile): warp and weft cross over and under, each thread a
  // little thicker or paler along its length (slub), fibre fuzz on top; the gaps are darker.
  fabric: () => ({ size: 0.04 / M, ...bake(512, 5, (u, v) => {
    const n = 40, fu = u * n, fv = v * n, i = Math.floor(fu), j = Math.floor(fv), a = fu - i, b = fv - j, warp = (i + j) % 2 === 0;
    const across = Math.sin(Math.PI * (warp ? a : b)), along = 0.75 + 0.25 * Math.sin(Math.PI * (warp ? b : a));
    const slub = warp ? fbm(i / n, v, 6, 5, 3) : fbm(u, j / n, 6, 6, 3), fuzz = fbm(u, v, 160, 7, 2);
    const h = across * along * (0.8 + 0.4 * slub) + 0.15 * fuzz, k = 0.82 + 0.2 * h + 0.08 * (slub - 0.5);
    return [...g(k), 0, h, 0.5 * (1.05 - 0.1 * h)];
  }) }),
  // Cotton loop pile (8 cm tile): tufts ~3 mm on a jittered grid, each a soft dome of fibres leaning its own way.
  pile: () => ({ size: 0.08 / M, ...bake(512, 6, (u, v) => {
    const n = 26, fu = u * n, fv = v * n, i = Math.floor(fu), j = Math.floor(fv);
    let h = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = i + di, cj = j + dj, w = (x) => ((x % n) + n) % n;
      const cx = ci + 0.5 + 0.35 * (hash(w(ci), w(cj), 8) - 0.5), cy = cj + 0.5 + 0.35 * (hash(w(ci), w(cj), 9) - 0.5);
      const d = Math.hypot(fu - cx, fv - cy);
      h = Math.max(h, (1 - sstep(0.25, 0.62, d)) * (0.75 + 0.25 * hash(w(ci), w(cj), 10)));
    }
    const ang = fbm(u, v, 8, 11, 2) * 6.28, fib = fbm((u * Math.cos(ang) - v * Math.sin(ang) + 2) % 1, (u * Math.sin(ang) + v * Math.cos(ang) + 2) % 1, 220, 12, 2);
    h = h * (0.8 + 0.3 * fib);
    return [...g(0.78 + 0.28 * h), 0, h, 0.5 * 1.2];
  }) }),
  // Oak (50 cm tile): fine, nearly straight growth lines ~4 mm apart, gently drifting, a little darker late wood,
  // long thin streaks and open pores along the grain. The grain runs along v: up every vertical face (legs,
  // sides, posts), front to back on tops.
  wood: () => ({ size: 0.5 / M, ...bake(1024, 2, (u, v) => {
    const drift = fbm(u, v, 2, 13, 3, 1), ring = Math.sin((u * 120 + drift * 4) * Math.PI), late = sstep(0.4, 1, ring);
    const streak = fbm(u, v, 96, 14, 3, 3), pore = noise(u * 512, v * 48, 512, 18, 48) > 0.86 ? 1 : 0, fig = fbm(u, v, 6, 15, 3, 2);
    const k = (1 - 0.07 * late + 0.06 * (streak - 0.5) + 0.05 * (fig - 0.5)) * (1 - 0.1 * pore);
    return [...g(k), 0, 0.12 * late + 0.1 * streak - 0.3 * pore, 0.5 * (1 + 0.1 * late + 0.15 * pore)];
  }) }),
  // Laminated bamboo (60 cm tile): strips ~2 cm wide glued side by side, each of fine straight fibres a little
  // lighter or darker than its neighbours, and the growth nodes — a darker, slightly raised band every ~30 cm,
  // staggered from strip to strip. Strips run along v, like wood.
  bamboo: () => ({ size: 0.6 / M, ...bake(1024, 2.5, (u, v) => {
    const n = 30, i = Math.floor(u * n), a = u * n - i, strip = hash(i % n, 0, 21), fibre = fbm(u, v, 512, 22, 2, 24);
    const vn = (v * 2 + hash(i % n, 1, 23)) % 1, node = Math.exp(-(((vn - 0.5) / 0.012) ** 2)), seam = 1 - sstep(0, 0.04, Math.min(a, 1 - a));
    const k = (0.96 + 0.08 * strip + 0.06 * (fibre - 0.5)) * (1 - 0.22 * node) * (1 - 0.12 * seam);
    return [...g(k), 0, 0.15 * fibre + 0.35 * node - 0.3 * seam, 0.5 * (1 + 0.1 * node + 0.1 * seam)];
  }) }),
  // Bark (40 cm tile): deep furrows running up the trunk (along v), plates between them broken across now and then,
  // lichen-pale and dark in the cracks.
  bark: () => ({ size: 0.4 / M, ...bake(512, 6, (u, v) => {
    const ridge = fbm(u, v, 24, 30, 4, 3), crack = sstep(0.42, 0.5, ridge), plate = fbm(u, v, 40, 31, 3, 10);
    return [...g(0.75 + 0.35 * crack + 0.08 * (plate - 0.5)), 0, crack * 0.9 + 0.1 * plate, 0.5 * (1.2 - 0.2 * crack)];
  }) }),
  // Stone (30 cm tile): a granular face, grains of a few mm, a few pits, gentle undulation.
  stone: () => ({ size: 0.3 / M, ...bake(512, 4, (u, v) => {
    const big = fbm(u, v, 4, 32, 4), grain = fbm(u, v, 160, 33, 2), pit = fbm(u, v, 60, 34, 2) > 0.74 ? 1 : 0;
    return [...g(0.85 + 0.25 * grain + 0.1 * (big - 0.5) - 0.2 * pit), 0, 0.5 * big + 0.3 * grain - 0.4 * pit, 0.5 * (1.1 + 0.2 * pit)];
  }) }),
  // Soil (25 cm tile): crumbs and clods, a few small stones, darker in the hollows.
  soil: () => ({ size: 0.25 / M, ...bake(512, 5, (u, v) => {
    const clod = fbm(u, v, 20, 35, 4), crumb = fbm(u, v, 120, 36, 2), pebble = fbm(u, v, 30, 37, 2) > 0.78 ? 1 : 0;
    return [...g(0.8 + 0.3 * clod + 0.15 * pebble), 0, 0.6 * clod + 0.2 * crumb + 0.3 * pebble, 0.5 * (1.15 - 0.2 * pebble)];
  }) }),
  // Packed grains (16 grains across a tile; size: one grain's width, m; long: its length / width): plump ellipses
  // on a jittered grid, each its own shade, dark gaps between them. The body under a grains() fill wears it.
  grains: ({ size = 0.005, long = 1 } = {}) => ({ size: (16 * size) / M, ...bake(512, 6, (u, v) => {
    const n = 16, fu = u * n, fv = v * n, i = Math.floor(fu), j = Math.floor(fv), w = (x) => ((x % n) + n) % n;
    let h = 0, tone = 0.5;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ci = w(i + di), cj = w(j + dj), a = hash(ci, cj, 40) * 3.1416, ca = Math.cos(a), sa = Math.sin(a);
      const dx = fu - (i + di + 0.5 + 0.4 * (hash(ci, cj, 41) - 0.5)), dy = fv - (j + dj + 0.5 + 0.4 * (hash(ci, cj, 42) - 0.5));
      const ax = (dx * ca + dy * sa) / (0.55 * Math.sqrt(long)), ay = (-dx * sa + dy * ca) / (0.55 / Math.sqrt(long)), d = Math.hypot(ax, ay);
      const dome = Math.sqrt(Math.max(0, 1 - d * d)); if (dome > h) { h = dome; tone = hash(ci, cj, 43); }
    }
    return [...g((0.55 + 0.45 * Math.min(1, h * 3)) * (0.88 + 0.24 * tone)), 0, h, 0.5 * (1.1 - 0.2 * h)];
  }) }),
  // Everything else (painted metal, plastic, ceramic, paper): no surface is perfectly even; faint smudges in the
  // gloss and a hint of orange peel (30 cm tile).
  micro: () => ({ size: 0.3 / M, ...bake(512, 1.5, (u, v) => {
    const smudge = fbm(u, v, 4, 16, 5), peel = fbm(u, v, 90, 17, 2);
    return [...g(0.985 + 0.03 * smudge), 0, 0.3 * peel, 0.5 * (0.82 + 0.36 * smudge)];
  }) }),
};
const made = {};
export const get = (kind, o) => (made[kind + JSON.stringify(o || {})] ||= surfaces[kind](o));

// Lay a surface on a MeshStandard/Physical material. world: project in world space (fixed set pieces, so one
// wall-sized tile runs across neighbouring wall panels); otherwise in the object's own space in metres, so the
// texture moves with a moving body. amount scales the effect.
export function surface(mat, kind, { world = false, amount = 1, ...o } = {}) {
  const s = get(kind, o);
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tpA: { value: s.a }, tpB: { value: s.b }, tpS: { value: 1 / s.size }, tpK: { value: amount }, tpUnder: { value: new THREE.Color(s.under ?? 0xffffff) } });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vTpP, vTpN, vTpX, vTpY, vTpZ;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n" + (world
        ? "vTpP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTpN = normalize(mat3(modelMatrix) * objectNormal); vTpX = mat3(viewMatrix) * vec3(1.,0.,0.); vTpY = mat3(viewMatrix) * vec3(0.,1.,0.); vTpZ = mat3(viewMatrix) * vec3(0.,0.,1.);"
        : "vTpP = transformed * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz)); vTpN = objectNormal; vTpX = normalMatrix * vec3(1.,0.,0.); vTpY = normalMatrix * vec3(0.,1.,0.); vTpZ = normalMatrix * vec3(0.,0.,1.);"));
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tpA, tpB; uniform float tpS, tpK; uniform vec3 tpUnder;\nvarying vec3 vTpP, vTpN, vTpX, vTpY, vTpZ;")
      .replace("#include <map_fragment>", `#include <map_fragment>
        vec3 tpN = normalize(vTpN), tpW = pow(abs(tpN), vec3(4.0)); tpW /= tpW.x + tpW.y + tpW.z;
        vec2 tpUx = vTpP.zy * tpS, tpUy = vTpP.xz * tpS, tpUz = vTpP.xy * tpS; // on a vertical face v runs up it
        vec4 tpa = texture2D(tpA, tpUx) * tpW.x + texture2D(tpA, tpUy) * tpW.y + texture2D(tpA, tpUz) * tpW.z;
        vec4 tbx = texture2D(tpB, tpUx), tby = texture2D(tpB, tpUy), tbz = texture2D(tpB, tpUz);
        diffuseColor.rgb = mix(diffuseColor.rgb, tpUnder, tpa.a) * mix(vec3(1.0), tpa.rgb * 2.0, tpK);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * mix(1.0, 2.0 * (tbx.a * tpW.x + tby.a * tpW.y + tbz.a * tpW.z), tpK), 0.03, 1.0);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          vec3 Nn = tpN;
          #ifdef DOUBLE_SIDED
            Nn *= faceDirection;
          #endif
          vec3 nx = tbx.xyz * 2.0 - 1.0, ny = tby.xyz * 2.0 - 1.0, nz = tbz.xyz * 2.0 - 1.0;
          nx.xy *= tpK; ny.xy *= tpK; nz.xy *= tpK;
          nx = vec3(nx.xy + Nn.zy, abs(nx.z) * Nn.x); ny = vec3(ny.xy + Nn.xz, abs(ny.z) * Nn.y); nz = vec3(nz.xy + Nn.xy, abs(nz.z) * Nn.z);
          vec3 No = normalize(nx.zyx * tpW.x + ny.xzy * tpW.y + nz * tpW.z); // whiteout blend, back into object axes
          normal = normalize(mat3(vTpX, vTpY, vTpZ) * No);
        }`);
  };
  mat.customProgramCacheKey = () => "tp" + (world ? 1 : 0);
  return mat;
}
