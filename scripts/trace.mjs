#!/usr/bin/env node
// The user's own thing, from their photo, as exact vector layers: the background cut away (a plain one, flood-filled
// from the borders, seen-through pockets and the floor shadow too), the rest traced by vtracer (visioncortex, MIT:
// colour regions as spline paths, stacked) at the photo's own detail. Nothing is invented or generated: every path is
// the photo's. Layers for the film to move: a part inside an ellipse (a fan, a wheel) on its own layer, turned by
// build()'s plate; a colour selection (copper pipes, a heating element) on its own layer, tinted by a value.
//   node trace.mjs <photo> --out <dir> [--width 1600] [--detail high|mid] [--crop x,y,w,h (fractions: a caption off)]
//                  [--part name=cx,cy,rx,ry,deg[,front|back[,pick]]] [--select name=pick] …
// pick: #rrggbb,tol (one colour), hue:a-b,minSat% (a material across light and shade: copper hue:10-40,35) or
// hsv:h0-h1/s0-s1/v0-v1 (a pale plastic: hsv:20-60/0.03-0.35/0.5-1); a part
// with a pick takes only those pixels inside its ellipse (a fan's blades, not the coil seen between them)
// cx, cy, rx, ry: fractions of the photo (rx of its width, ry of its height); deg its tilt; back: drawn behind the body
// (a wheel behind a fork), else in front of it (a fan before a coil: the body under it is filled with its surroundings).
// Writes <dir>/<layer>.svg and <dir>/trace.json { w, h, bbox, layers: [{ name, kind, … }] }.
// Exit 0 traced; 2 a WARN: no vtracer (preflight's "Photo tracer" row says how, asked first), the photo unreadable, or
// no plain background (retake it on a plain wall). Never a guessed drawing.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args.splice(i, 2)[1]; };
const many = (k) => { const out = []; for (let i; (i = args.indexOf(k)) >= 0;) out.push(args.splice(i, 2)[1]); return out; };
const parts = many("--part"), selects = many("--select");
const out = opt("--out"), W = Number(opt("--width", 1600)), detail = opt("--detail", "high"), crop = opt("--crop"), src = args[0];
const warn = (m) => { console.log(`WARN trace: ${m}`); process.exit(2); };
if (!src || !out) { console.error("Usage: node trace.mjs <photo> --out <dir> [--width 1600] [--detail high|mid] [--part name=cx,cy,rx,ry,deg[,back]] [--select name=#rrggbb,tol]"); process.exit(1); }
const PY = process.env.DALANG_VTRACER_PY || path.join(os.homedir(), ".cache", "dalang", "vtracer", "bin", "python");
if (!existsSync(PY)) warn(`vtracer is not installed (${PY}): preflight's "Photo tracer" row says how; install only with the user's yes`);

// pixels: scaled, a light median against JPEG noise, raw RGB
const cut = crop ? (([x, y, w, h]) => `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y},`)(crop.split(",").map(Number)) : "";
const r = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-vf", `${cut}scale=${W}:-2,median=radius=1`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 1 << 28 });
if (r.status !== 0 || !r.stdout?.length) warn(`ffmpeg could not read ${src}: ${String(r.stderr).trim().slice(0, 200)}`);
const px = r.stdout, H = px.length / 3 / W, N = W * H;
const rgb = (i) => [px[3 * i], px[3 * i + 1], px[3 * i + 2]], d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const nb = (i) => { const x = i % W; return [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W].filter((j) => j >= 0 && j < N); };

// background: the corners agree on one colour; everything joined to the border within reach of it is cut away
const corner = (x0, y0) => { const s = [0, 0, 0]; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rgb((y0 + y) * W + x0 + x).forEach((v, i) => (s[i] += v / 64)); return s; };
const C = [corner(0, 0), corner(W - 8, 0), corner(0, H - 8), corner(W - 8, H - 8)], bg = C.reduce((a, c) => a.map((v, i) => v + c[i] / 4), [0, 0, 0]);
if (C.some((c) => d2(c, bg) > 30 ** 2)) warn("the corners differ: the photo needs a plain background (a wall, a sheet), the thing whole in the frame");
const fg = new Uint8Array(N).fill(1), q = [];
for (let x = 0; x < W; x++) q.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) q.push(y * W, y * W + W - 1);
while (q.length) { const i = q.pop(); if (!fg[i] || d2(rgb(i), bg) > 40 ** 2) continue; fg[i] = 0; q.push(...nb(i)); }
// the wall seen through the thing (between spokes, fins): a small pocket of its colour
{ const seen = new Uint8Array(N), lim = N * 0.004;
  for (let s0 = 0; s0 < N; s0++) { if (!fg[s0] || seen[s0] || d2(rgb(s0), bg) > 22 ** 2) continue;
    const st = [s0], cells = []; seen[s0] = 1;
    while (st.length) { const i = st.pop(); cells.push(i); for (const j of nb(i)) if (fg[j] && !seen[j] && d2(rgb(j), bg) <= 22 ** 2) { seen[j] = 1; st.push(j); } }
    if (cells.length < lim) for (const i of cells) fg[i] = 0; } }
// a soft floor shadow: pale, colourless pixels on the lowest rows
{ let yb = 0; for (let i = 0; i < N; i++) if (fg[i]) yb = Math.floor(i / W);
  for (let y = Math.max(0, yb - Math.round(H * 0.1)); y <= yb; y++) for (let x = 0; x < W; x++) { const i = y * W + x, c = rgb(i); if (fg[i] && Math.min(...c) > 170 && Math.max(...c) - Math.min(...c) < 14 && d2(c, bg) < 60 ** 2) fg[i] = 0; } }
let x0 = W, y0 = H, x1 = 0, y1 = 0, count = 0;
for (let i = 0; i < N; i++) if (fg[i]) { const x = i % W, y = (i - x) / W; x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); count++; }
if (count < N * 0.02) warn("almost nothing stands off the background: fill the frame with the thing");

// layers: parts by ellipse, selections by colour; the body keeps everything else (and its own copy under a selection)
const inside = (e, x, y) => { const a = (-e.deg * Math.PI) / 180, u = (x - e.cx) * Math.cos(a) - (y - e.cy) * Math.sin(a), v = (x - e.cx) * Math.sin(a) + (y - e.cy) * Math.cos(a); return (u / e.rx) ** 2 + (v / e.ry) ** 2 <= 1; };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// hue:a-b,minSat% picks a material across its light and shade (copper hue:10-40,35); #rrggbb,tol one colour
const picker = (what, tol) => {
  if (what.startsWith("hsv:")) { const [h, sv, vv] = what.slice(4).split("/").map((r) => r.split("-").map(Number)); return (c) => { const [a, b, d] = hsv(c); return a >= h[0] && a <= h[1] && b >= sv[0] && b <= sv[1] && d >= vv[0] && d <= vv[1]; }; }
  if (what.startsWith("hue:")) { const [a, b] = what.slice(4).split("-").map(Number), m = Number(tol ?? 30) / 100; return (c) => { const [h, sat, val] = hsv(c); return h >= a && h <= b && sat >= m && val >= 0.2; }; }
  const want = hexRgb(what), t = Number(tol ?? 40) ** 2; return (c) => d2(c, want) <= t; };
const hsv = ([r, g, b]) => { const M = Math.max(r, g, b), m = Math.min(r, g, b), d = M - m; let h = 0; if (d) h = M === r ? ((g - b) / d) % 6 : M === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, M ? d / M : 0, M / 255]; };
const L = [{ name: "body", kind: "body" },
  ...parts.map((s) => { const [name, v] = s.split("="), [cx, cy, rx, ry, deg = 0, order = "front", what, tol] = v.split(",");
    return { name, kind: "part", e: { cx: cx * W, cy: cy * H, rx: rx * W, ry: ry * H, deg: Number(deg), back: order === "back" }, only: what && picker(what, tol) }; }),
  ...selects.map((s) => { const [name, v] = s.split("="), [what, tol] = v.split(","); return { name, kind: "select", color: what, pick: picker(what, tol) }; })];
for (const l of L) l.a = new Uint8Array(N);
const body = L[0];
for (let i = 0; i < N; i++) {
  if (!fg[i]) continue;
  const x = i % W, y = (i - x) / W, part = L.find((l) => l.e && inside(l.e, x, y) && (!l.only || l.only(rgb(i))));
  if (part) part.a[i] = 1; else body.a[i] = 1;
  if (!part) for (const l of L) if (l.pick?.(rgb(i))) l.a[i] = 1;
}
// under a part drawn in front, the body is painted in from what surrounds it (each hole pixel, ring by ring from the
// edge, the mean of its already known neighbours), so a turning blade uncovers the bracket and coil behind it, not a hole
const fill = new Map(), front = new Uint8Array(N);
for (const l of L) if (l.e && !l.e.back) for (let i = 0; i < N; i++) if (l.a[i]) front[i] = 1;
{ const known = (i) => fg[i] && !front[i] || fill.has(i);
  let ring = []; for (let i = 0; i < N; i++) if (front[i] && nb(i).some((j) => fg[j] && !front[j])) ring.push(i);
  while (ring.length) {
    const next = new Set(), done = [];
    for (const i of ring) { const x = i % W, s3 = [0, 0, 0]; let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dy * W + dx; if ((dx || dy) && j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && known(j)) { const c = fill.get(j) || rgb(j); s3[0] += c[0]; s3[1] += c[1]; s3[2] += c[2]; n++; } }
      if (n) done.push([i, s3.map((v) => v / n)]); else next.add(i); }
    for (const [i, c] of done) { fill.set(i, c); body.a[i] = 1; for (const j of nb(i)) if (front[j] && !fill.has(j)) next.add(j); }
    if (!done.length) break;
    ring = [...next];
  } }

// each layer: an RGBA picture (transparent elsewhere), traced by vtracer into spline paths
mkdirSync(out, { recursive: true });
const tmp = path.join(os.tmpdir(), `dalang-trace-${process.pid}`); mkdirSync(tmp, { recursive: true });
const SET = detail === "mid" ? [5, 6, 16] : [3, 7, 10]; // filter_speckle, color_precision, layer_difference
for (const l of L) {
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) if (l.a[i]) { const c = (l === body && fill.get(i)) || rgb(i); rgba[4 * i] = c[0]; rgba[4 * i + 1] = c[1]; rgba[4 * i + 2] = c[2]; rgba[4 * i + 3] = 255; }
  const png = path.join(tmp, `${l.name}.png`);
  const e = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${W}x${H}`, "-i", "-", png], { input: rgba });
  if (e.status !== 0) warn(`ffmpeg could not write the ${l.name} layer: ${String(e.stderr).trim().slice(0, 160)}`);
  // positional arguments: vtracer's keyword binding crashes on some Pythons (3.14 seen)
  const v = spawnSync(PY, ["-c", `import vtracer,sys; vtracer.convert_image_to_svg_py(sys.argv[1], sys.argv[2], "color", "stacked", "spline", ${SET[0]}, ${SET[1]}, ${SET[2]}, 60, 4.0, 10, 45, 3)`, png, path.join(out, `${l.name}.svg`)], { encoding: "utf8", timeout: 180000 });
  if (v.status !== 0) warn(`vtracer failed on the ${l.name} layer (${v.signal || v.status}): ${String(v.stderr).trim().slice(-200)}; rerun`);
}
spawnSync("rm", ["-rf", tmp]);
const meta = L.map((l) => (l.e ? { name: l.name, kind: "part", ...l.e } : l.pick ? { name: l.name, kind: "select", color: l.color } : { name: "body", kind: "body" }));
writeFileSync(path.join(out, "trace.json"), JSON.stringify({ w: W, h: H, bbox: [x0, y0, x1, y1], layers: meta }, null, 1) + "\n");
console.log(`OK     traced ${path.basename(src)} with vtracer (${detail}): ${L.map((l) => `${l.name} ${l.a.reduce((s, v) => s + v, 0)} px`).join(", ")} → ${out}`);
