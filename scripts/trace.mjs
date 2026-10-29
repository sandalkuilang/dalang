#!/usr/bin/env node
// A photo of the user's own thing traced into a flat inked illustration (SVG layers), so the film shows that thing, not
// a guess at it: the background cut away (a plain one, flood-filled from the borders), the colours taken from the photo
// as a few materials, each redrawn in the engine's three tones), smooth paths, ink on the silhouette and where
// materials meet. Moving parts (a wheel)
// go to their own layer, named by an ellipse, so build()'s plate turns them. Deterministic, ffmpeg and Node only: no
// model, nothing generated; a stylized drawing of the user's material.
//   node trace.mjs <photo> --out <dir> [--width 1200] [--materials 5] [--part name=cx,cy,rx,ry,deg …]
// part: an ellipse in fractions of the photo (cx, cy, rx, ry of its width and height; deg its tilt), e.g. a wheel.
// Writes <dir>/body.svg, <dir>/<part>.svg (one canvas, so they stack), <dir>/trace.json { w, h, bbox, palette, parts }.
// Exit 0 traced; 2 the photo could not be read or has no plain background (a WARN: retake it on a plain wall).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const parts = []; for (let i; (i = args.indexOf("--part")) >= 0;) parts.push(args.splice(i, 2)[1]);
const out = opt("--out"), W = Number(opt("--width", 1200)), K = Number(opt("--materials", 5)), src = args[0];
const warn = (m) => { console.log(`WARN trace: ${m}`); process.exit(2); };
if (!src || !out) { console.error("Usage: node trace.mjs <photo> --out <dir> [--width 1200] [--materials 5] [--part name=cx,cy,rx,ry,deg]"); process.exit(1); }

// pixels: scaled, a light median against JPEG noise, raw RGB
const r = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-vf", `scale=${W}:-2,median=radius=2`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 28 });
if (r.status !== 0 || !r.stdout?.length) warn(`ffmpeg could not read ${src}: ${String(r.stderr).trim().slice(0, 200)}`);
const px = r.stdout, H = px.length / 3 / W, N = W * H;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), rgb = (i) => [px[3 * i], px[3 * i + 1], px[3 * i + 2]], d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// background: the corners agree on one colour; everything joined to the border within reach of it is cut away
const corner = (x0, y0) => { const s = [0, 0, 0]; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rgb((y0 + y) * W + x0 + x).forEach((v, i) => (s[i] += v / 64)); return s; };
const C = [corner(0, 0), corner(W - 8, 0), corner(0, H - 8), corner(W - 8, H - 8)], bg = C.reduce((a, c) => a.map((v, i) => v + c[i] / 4), [0, 0, 0]);
if (C.some((c) => d2(c, bg) > 30 ** 2)) warn("the corners differ: the photo needs a plain background (a wall, a sheet), the thing whole in the frame");
const fg = new Uint8Array(N).fill(1), TOL = 62 ** 2, q = [];
for (let x = 0; x < W; x++) q.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) q.push(y * W, y * W + W - 1);
while (q.length) { const i = q.pop(); if (!fg[i] || d2(rgb(i), bg) > TOL) continue; fg[i] = 0; const x = i % W; if (x > 0) q.push(i - 1); if (x < W - 1) q.push(i + 1); if (i >= W) q.push(i - W); if (i < N - W) q.push(i + W); }

// the background seen through the thing (between spokes, under a seat): a small pocket the colour of the wall
{ const seen = new Uint8Array(N), lim = N * 0.004;
  for (let s0 = 0; s0 < N; s0++) { if (!fg[s0] || seen[s0] || d2(rgb(s0), bg) > 24 ** 2) continue;
    const st = [s0], cells = []; seen[s0] = 1;
    while (st.length) { const i = st.pop(); cells.push(i); const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && fg[j] && !seen[j] && d2(rgb(j), bg) <= 24 ** 2) { seen[j] = 1; st.push(j); } }
    if (cells.length < lim) for (const i of cells) fg[i] = 0; } }
// a soft floor shadow under the thing: a pale grey band on the photo's lowest rows, cut too
{ let y1 = 0; for (let i = 0; i < N; i++) if (fg[i]) y1 = Math.floor(i / W);
  for (let y = Math.max(0, y1 - Math.round(H * 0.14)); y <= y1; y++) for (let x = 0; x < W; x++) { const i = y * W + x, c = rgb(i); if (fg[i] && Math.min(...c) > 165 && Math.max(...c) - Math.min(...c) < 16) fg[i] = 0; } }

// materials, not lighting: k-means on colour with lightness damped (one red panel in light and in shade is one red),
// seeded so one photo always gives one drawing; then each material is redrawn in the engine's three tones (tri():
// light, mid, dark) by the photo's lightness, so the thing is lit like the world it stands in, not like the studio
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const lab = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; });
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116), X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
const feat = (c) => { const [L, A, B] = lab(c); return [L * 0.45, A, B]; };
const sample = []; for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 30000))) if (fg[i]) sample.push(i);
if (sample.length < 200) warn("almost nothing stands off the background: fill the frame with the thing");
const F = sample.map((i) => feat(rgb(i))), M = [F[Math.floor(rnd() * F.length)]];
while (M.length < K) { const d = F.map((s) => Math.min(...M.map((c) => d2(s, c)))), t = d.reduce((a, b) => a + b, 0) * rnd(); let acc = 0, j = 0; for (; j < d.length - 1 && (acc += d[j]) < t; j++); M.push(F[j]); }
const near = (f) => { let b = 0; for (let k = 1; k < M.length; k++) if (d2(f, M[k]) < d2(f, M[b])) b = k; return b; };
for (let it = 0; it < 16; it++) { const sum = M.map(() => [0, 0, 0, 0]); for (const f of F) { const b = near(f); sum[b][0] += f[0]; sum[b][1] += f[1]; sum[b][2] += f[2]; sum[b][3]++; } sum.forEach((v, k) => { if (v[3]) M[k] = [v[0] / v[3], v[1] / v[3], v[2] / v[3]]; }); }
// each material's base colour (its middle third of lightness) and the lightness that splits its three tones
const mats = M.map(() => ({ Ls: [], rgb: [] }));
sample.forEach((i, n) => { const m = near(F[n]); mats[m].Ls.push(F[n][0]); mats[m].rgb.push(rgb(i)); });
// a dark material (black plastic, rubber) reflects the studio in streaks: one base tone and only its brightest tenth lit
const tone = mats.map((m) => { const L = m.Ls.slice().sort((a, b) => a - b), q = (p) => L[Math.floor(p * (L.length - 1))] ?? 0, dark = q(0.5) < 0.45 * 35, t1 = dark ? -1 : q(0.3), t2 = q(dark ? 0.9 : 0.72);
  const mid = m.rgb.filter((_, k) => m.Ls[k] >= t1 && m.Ls[k] <= t2), base = (mid.length ? mid : m.rgb).reduce((a, c, _, all) => a.map((v, j) => v + c[j] / all.length), [0, 0, 0]);
  return { t1, t2, base }; });
const tri = (c) => [mix(c, [35, 26, 44], 0.22), c, mix(c, [255, 247, 230], 0.2)];
const P = tone.flatMap((t) => tri(t.base)), MAT = (k) => Math.floor(k / 3);
const label = new Int16Array(N).fill(-1);
for (let i = 0; i < N; i++) if (fg[i]) { const f = feat(rgb(i)), m = near(f), t = tone[m]; label[i] = m * 3 + (f[0] < t.t1 ? 0 : f[0] > t.t2 ? 2 : 1); }
// three passes of a 5×5 majority: the studio's speckle and glints go, shapes stay
for (let pass = 0; pass < 3; pass++) { const L = label.slice(); for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { const i = y * W + x; if (L[i] < 0) continue; const n = new Map(); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const v = L[i + dy * W + dx]; if (v >= 0) n.set(v, (n.get(v) || 0) + 1); } let best = L[i], bc = 0; for (const [v, c] of n) if (c > bc) (best = v), (bc = c); label[i] = best; } }

// regions: 4-connected runs of one label; a region under minArea joins its commonest neighbour
const comp = new Int32Array(N).fill(-1), regions = [], minArea = Math.max(12, Math.round(N * 0.00015));
const flood = (s, id) => { const st = [s], cells = []; comp[s] = id; while (st.length) { const i = st.pop(); cells.push(i); const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && comp[j] < 0 && label[j] === label[s]) { comp[j] = id; st.push(j); } } return cells; };
for (let i = 0; i < N; i++) if (label[i] >= 0 && comp[i] < 0) regions.push({ id: regions.length, k: label[i], cells: flood(i, regions.length) });
for (const R of regions) if (R.cells.length < minArea) { const n = new Map(); for (const i of R.cells) { const x = i % W; for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) if (j >= 0 && j < N && label[j] >= 0 && comp[j] !== R.id) n.set(label[j], (n.get(label[j]) || 0) + 1); } let b = -1, bc = 0; for (const [v, c] of n) if (c > bc) (b = v), (bc = c); if (b >= 0) for (const i of R.cells) label[i] = b; }
comp.fill(-1); regions.length = 0;
for (let i = 0; i < N; i++) if (label[i] >= 0 && comp[i] < 0) regions.push({ id: regions.length, k: label[i], cells: flood(i, regions.length) });

// outlines: every pixel edge between a region and the rest, linked into closed loops (outer and holes; even-odd fill),
// simplified (Ramer–Douglas–Peucker) so a staircase reads as a drawn line
function loops(cells, inside) {
  const next = new Map(), key = (x, y) => y * (W + 1) + x;
  const edge = (x0, y0, x1, y1) => { const k = key(x0, y0); if (!next.has(k)) next.set(k, []); next.get(k).push([x1, y1]); };
  for (const i of cells) { const x = i % W, y = (i - x) / W;
    if (y === 0 || !inside((y - 1) * W + x)) edge(x, y, x + 1, y); if (x === W - 1 || !inside(y * W + x + 1)) edge(x + 1, y, x + 1, y + 1);
    if (y === H - 1 || !inside((y + 1) * W + x)) edge(x + 1, y + 1, x, y + 1); if (x === 0 || !inside(y * W + x - 1)) edge(x, y + 1, x, y); }
  const out = [];
  for (const [k0, list] of next) while (list.length) {
    let [x, y] = [k0 % (W + 1), Math.floor(k0 / (W + 1))]; const pts = [[x, y]];
    let [nx, ny] = list.pop();
    while (!(nx === pts[0][0] && ny === pts[0][1])) { pts.push([nx, ny]); const l = next.get(key(nx, ny)); if (!l?.length) break; [nx, ny] = l.pop(); }
    if (pts.length > 3) out.push(chaikin(chaikin(rdp(pts, 1.3))));
  }
  return out;
}
// a closed loop's corners cut twice (Chaikin): a drawn curve, not a pixel staircase
function chaikin(p) { const o = []; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } return o; }
function rdp(p, e) { if (p.length < 3) return p; const [a, b] = [p[0], p.at(-1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; let m = 0, im = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs(dy * p[i][0] - dx * p[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > m) (m = d), (im = i); } return m > e ? [...rdp(p.slice(0, im + 1), e).slice(0, -1), ...rdp(p.slice(im), e)] : [a, b]; }
const d = (ls) => ls.map((l) => `M${l.map(([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`).join("L")}Z`).join("");
const hex = (c) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const INK = [30, 26, 36];

// parts: regions whose centre lies in a named ellipse go to that layer
const PARTS = parts.map((s) => { const [name, v] = s.split("="), [cx, cy, rx, ry, deg = 0] = v.split(",").map(Number); return { name, cx: cx * W, cy: cy * H, rx: rx * W, ry: ry * H, deg }; });
const inEllipse = (e, x, y) => { const a = (-e.deg * Math.PI) / 180, u = (x - e.cx) * Math.cos(a) - (y - e.cy) * Math.sin(a), v = (x - e.cx) * Math.sin(a) + (y - e.cy) * Math.cos(a); return (u / e.rx) ** 2 + (v / e.ry) ** 2 <= 1; };
const layer = new Map([["body", []], ...PARTS.map((e) => [e.name, []])]);
for (const R of regions) { let sx = 0, sy = 0; for (const i of R.cells) (sx += i % W), (sy += Math.floor(i / W)); const cx = sx / R.cells.length, cy = sy / R.cells.length; layer.get(PARTS.find((e) => inEllipse(e, cx, cy))?.name ?? "body").push(R); }

mkdirSync(out, { recursive: true });
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" stroke-linejoin="round" stroke-linecap="round">${body}</svg>\n`;
const lw = Math.max(1, W / 900);
for (const [name, rs] of layer) {
  rs.sort((a, b) => b.cells.length - a.cells.length);
  let body = "";
  for (const R of rs) { const set = new Set(R.cells), c = P[R.k]; body += `<path fill-rule="evenodd" fill="${hex(c)}" stroke="${hex(c)}" stroke-width="${(lw * 1.2).toFixed(2)}" d="${d(loops(R.cells, (i) => set.has(i)))}"/>`; }
  // ink: where one material meets another (a panel's edge, a seat on a body), then the silhouette, heavier
  for (let m = 0; m < M.length; m++) { const cells = rs.filter((R) => MAT(R.k) === m).flatMap((R) => R.cells); if (!cells.length) continue; const set = new Set(cells); body += `<path fill="none" stroke="${hex(mix(tone[m].base, INK, 0.6))}" stroke-width="${(lw * 1.5).toFixed(2)}" d="${d(loops(cells, (i) => set.has(i)))}"/>`; }
  const cells = rs.flatMap((R) => R.cells), all = new Set(cells);
  if (all.size) body += `<path fill="none" stroke="${hex(INK)}" stroke-width="${(lw * 2.6).toFixed(2)}" d="${d(loops(cells, (i) => all.has(i)))}"/>`;
  writeFileSync(path.join(out, `${name}.svg`), svg(body));
}
let x0 = W, y0 = H, x1 = 0, y1 = 0; for (let i = 0; i < N; i++) if (label[i] >= 0) { const x = i % W, y = Math.floor(i / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); }
writeFileSync(path.join(out, "trace.json"), JSON.stringify({ w: W, h: H, bbox: [x0, y0, x1, y1], palette: P.map(hex), layers: [...layer.keys()], parts: Object.fromEntries(PARTS.map(({ name, ...e }) => [name, e])) }, null, 1) + "\n");
console.log(`OK     traced ${path.basename(src)}: ${regions.length} regions, ${K} materials in three tones, layers ${[...layer.keys()].join(", ")} → ${out}`);
