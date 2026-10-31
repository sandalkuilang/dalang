#!/usr/bin/env node
// The top glass band (.ov-glass, engine/three/editorial.js) draws no horizontal line on a RENDERED frame: its row-mean
// luminance is read from a headless-Chromium screenshot, on every kind of ground (light sky, paper, pale sweep, dark
// blueprint) and at the opacities the headline envelope gives while it fades in and out (the compositor may redraw the
// blur's box edge there). The static CSS check in engine/three/selfcheck.mjs cannot see either. Runs only where a
// headless Chromium is found (DALANG_CHROME, hyperframes' or Playwright's cache, or a chrome on PATH): without one it says
// so and exits 0 on a developer machine (not run is not failed). Where the check must run (the CI merge gate sets
// DALANG_REQUIRE_CHROME=1) a missing or broken browser FAILS, so a green gate means it really looked. Optional argument:
// another editorial.js to test (to prove the check fails on a line or a step).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const here = path.dirname(fileURLToPath(import.meta.url));
const editorial = path.resolve(process.argv[2] || path.join(here, "..", "engine", "three", "editorial.js"));

// ---- a headless Chromium, if there is one ----
const home = os.homedir();
const latest = (dir, sub) => { try { return fs.readdirSync(dir).sort().reverse().map((d) => path.join(dir, d, ...sub)).find((p) => fs.existsSync(p)); } catch { return undefined; } };
const onPath = (names) => (process.env.PATH || "").split(path.delimiter).filter(Boolean).flatMap((d) => names.map((n) => path.join(d, n))).find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
const REQUIRE = !!process.env.DALANG_REQUIRE_CHROME;
// not run is a WARN where the browser is optional and a failure where the gate requires it
const notRun = (why) => {
  if (REQUIRE) { console.error(`FAIL: ${why} (DALANG_REQUIRE_CHROME is set: the rendered glass-band check must run)`); process.exit(1); }
  console.log(`WARN: ${why}: the rendered glass-band check was not run, rerun where one is installed`); process.exit(0);
};
// an explicit DALANG_CHROME is the only candidate (a wrong path is not silently replaced by another browser)
const candidates = process.env.DALANG_CHROME ? [process.env.DALANG_CHROME] : [
  latest(path.join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"]),
  latest(path.join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), ["chrome-headless-shell-linux64", "chrome-headless-shell"]),
  latest(path.join(home, "Library", "Caches", "ms-playwright"), ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"]),
  latest(path.join(home, ".cache", "ms-playwright"), ["chrome-linux", "headless_shell"]),
  onPath(["chrome-headless-shell", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]),
].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) notRun("no headless Chromium found (set DALANG_CHROME)");
// a full Chrome or Chromium needs --headless to run without a window; chrome-headless-shell is headless already
const headlessFlag = /headless/i.test(path.basename(chrome)) ? [] : ["--headless=new"];

// ---- the real CSS and the real envelope, through the overlay's own code ----
const ED = await import(pathToFileURL(editorial).href);
const fake = () => ({ children: [], style: { setProperty(k, v) { this[k] = v; } }, attrs: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } });
const doc = { head: fake(), getElementById: () => null, createElement: fake, createElementNS: fake, createTextNode: fake };
const root = fake(); root.ownerDocument = doc;
// the frosted grain is a fixed speckle (a 160 px tile): its row means wobble by a level or two, which is noise, not geometry, so
// the render leaves it out and reads the tint, the mask and the blur
const NO_GRAIN = "linear-gradient(transparent,transparent)";
const cssText =(g) => { const d = { ...doc, head: fake() }; const r = fake(); r.ownerDocument = d; const o = ED.makeOverlay(r, { prefix: "g", ground: g }); return { css: d.head.children.find((c) => c.id === "ov-style").textContent.replace(/url\("data:image\/svg\+xml[^"]*"\)/, NO_GRAIN), tint: o.layer.style["--ov-glass"], h: parseInt(o.glass.style.height, 10) }; };

// the grounds a film has: light sky, paper, pale sweep, dark blueprint (the glass tint follows the ground)
const GROUNDS = { sky: "#E8EDEF", paper: "#F4EFE4", sweep: "#EDEDED", blueprint: "#123A66" };
// the opacities the headline envelope gives the glass: in and out, sampled the way ov.update does
const from = 2, to = 6, inDur = ED.IN_DUR.hl ?? 0.25;
const ts = [from + 0.04, from + 0.08, from + 0.14, from + 0.24, from + 1, to - 0.14, to - 0.07, to - 0.03];
const OPAC = ts.map((t) => +ED.envelope(t, from, to, { inDur }).a.toFixed(3)).filter((a) => a > 0.02 && a < 1).concat(1);
assert.ok(OPAC.length >= 5, "the envelope gives fractional opacities to test: " + OPAC);

// ---- a PNG's luminance rows, no dependency ----
function rowMeans(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "a PNG");
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < png.length) { const n = png.readUInt32BE(p), type = png.toString("latin1", p + 4, p + 8); if (type === "IHDR") { w = png.readUInt32BE(p + 8); h = png.readUInt32BE(p + 12); assert.equal(png[p + 16], 8, "8-bit"); ct = png[p + 17]; assert.equal(png[p + 20], 0, "not interlaced"); } else if (type === "IDAT") idat.push(png.subarray(p + 8, p + 8 + n)); p += 12 + n; }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; assert.ok(bpp, "RGB or RGBA");
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, o = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[o + i - bpp] : 0, b = y ? px[o - stride + i] : 0, c = i >= bpp && y ? px[o - stride + i - bpp] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      px[o + i] = (raw[src + i] + pred) & 255;
    }
  }
  return { w, h, lum: (x0, x1, y) => { let s = 0; for (let x = x0; x < x1; x++) { const i = y * stride + x * bpp; s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; } return s / (x1 - x0); } };
}

// ---- one page per case: a column per opacity, the band over a striped ground (vertical stripes, so the ground's own row
// mean is flat and any row-to-row step is the band's), the page cut 140 px below the band ----
const COL = 1080, tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dalang-glass-"));
// a line is a row that stands out of its neighbours (3 to 10 rows either side) by 3 or more of 255 levels. Measured on a
// real render: the smooth band wobbles by up to 1.8 (8-bit gradient steps), the old 2 px lip stood out by 8.5 to 90
const T = 3;
// a step is a jump of the fitted fade (see stepAt). Measured: the smooth band's worst is 2.7, the 4.5-level sharp step reads
// 4.3 to 5.4 and the same step spread over 4 rows 4.05 to 5.35; the limit sits between them (a step of about 1.3 % is the
// least this render can tell from the gradient's own dither)
const TS = 3.3;
// a case's worst row: the one that stands out of its neighbours the most (from row 30: the blur's page-edge falloff is not the band's)
const standout = (P) => {
  let w = 0, at = -1;
  for (let y = 30; y < P.length - 12; y++) {
    const nb = []; for (let d = 3; d <= 10; d++) { if (y - d >= 30) nb.push(P[y - d]); if (y + d < P.length) nb.push(P[y + d]); }
    const dev = Math.abs(P[y] - nb.reduce((s, v) => s + v, 0) / nb.length);
    if (dev > w) { w = dev; at = y; }
  }
  return { w, at };
};
// a step is a jump in an otherwise smooth run. At each boundary b (between rows b-1 and b) one smooth curve (a parabola: the
// fade's slope and bend) plus a step term at b is fitted by least squares to the 20 rows before it (b-24..b-5) and the 20
// after it (b+2..b+21), leaving out the 6 rows next to b (an edge the blur has softened); the step term is the jump. The
// fade's slope and bend cancel (the curve carries them), a step of S levels reads as S whole (not S/2, as against the plain
// mean of the neighbours), and the row-to-row wobble (gradient dither, up to 1 level) averages out over 40 rows.
const solve = (m, v) => { // Gauss elimination with pivoting
  const n = v.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]]; [v[c], v[p]] = [v[p], v[c]];
    for (let r = c + 1; r < n; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k < n; k++) m[r][k] -= f * m[c][k]; v[r] -= f * v[c]; }
  }
  const s = Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let a = v[r]; for (let k = r + 1; k < n; k++) a -= m[r][k] * s[k]; s[r] = a / m[r][r]; }
  return s;
};
const stepAt = (P, b) => {
  const m = Array.from({ length: 4 }, () => Array(4).fill(0)), v = Array(4).fill(0);
  const add = (i) => { const t = (i - b) / 10, q = [1, t, t * t, i >= b ? 1 : 0]; for (let r = 0; r < 4; r++) { v[r] += q[r] * P[i]; for (let c = 0; c < 4; c++) m[r][c] += q[r] * q[c]; } };
  for (let i = b - 24; i <= b - 5; i++) add(i);
  for (let i = b + 2; i <= b + 21; i++) add(i);
  return solve(m, v)[3];
};
const jump = (P) => {
  let w = 0, at = -1;
  for (let b = 54; b + 21 < P.length; b++) { const d = Math.abs(stepAt(P, b)); if (d > w) { w = d; at = b; } }
  return { w, at };
};
// a case = { name, ground, ctl }: ctl injects a fault the check must see, so a green run proves the eyes work.
//   lip       a 2 px light line at 70 % of the band (the old design)
//   step      a sharp 4.5-level step at the box's bottom edge: the tint or blur ends there and the ground goes on (about 2 %,
//             a seam on a flat light ground); constant at every opacity, as the lip is not
//   soft-step the same step spread over 4 rows (the blur softens a real edge)
const STEP = 4.5; // levels of 255
const CASES = [...Object.entries(GROUNDS).map(([name, ground]) => ({ name, ground })),
  { name: "control-lip", ground: GROUNDS.sky, ctl: "lip" },
  { name: "control-step-sweep", ground: GROUNDS.sweep, ctl: "step" },
  { name: "control-step-sky", ground: GROUNDS.sky, ctl: "step" },
  { name: "control-soft-step-sweep", ground: GROUNDS.sweep, ctl: "soft-step" }];
const worst = [], fails = [];
try {
  for (const { name, ground, ctl } of CASES) {
    const lip = ctl === "lip";
    const { css, tint, h } = cssText(ground), H = h + 140;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16)), dk = `rgb(${r * 0.9 | 0},${g * 0.9 | 0},${b * 0.9 | 0})`, lt = `rgb(${Math.min(255, r * 1.06) | 0},${Math.min(255, g * 1.06) | 0},${Math.min(255, b * 1.06) | 0})`;
    // the step is a black veil over the band's box that takes STEP levels off the ground's mean luminance
    const alpha = (STEP / (0.2126 * r + 0.7152 * g + 0.0722 * b)).toFixed(4), soft = ctl === "soft-step" ? 4 : 0;
    const veil = `<div style="position:absolute;left:0;top:0;width:100%;height:${h}px;background:linear-gradient(180deg,rgba(0,0,0,${alpha}) calc(100% - ${soft}px),rgba(0,0,0,0))"></div>`;
    const extra = lip ? `<div style="position:absolute;left:0;top:${Math.round(h * 0.7)}px;width:100%;height:2px;background:rgba(255,255,255,.85)"></div>` : "";
    const veilOnly = ctl === "step" || ctl === "soft-step" ? veil : "";
    const cols = OPAC.map((o, k) => `<div style="position:absolute;left:${k * COL}px;top:0;width:${COL}px;height:${H}px;background:repeating-linear-gradient(90deg,${dk} 0 45px,${lt} 45px 90px)"><div class="ov" style="--ov-glass:${tint};width:${COL}px;height:${H}px"><div class="ov-glass" style="height:${h}px;opacity:${o}"></div>${extra.replace("top:", `opacity:${o};top:`)}${veilOnly}</div></div>`).join("");
    const file = path.join(tmp, name + ".html"), png = path.join(tmp, name + ".png");
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}${css}</style><div style="position:relative;width:${COL * OPAC.length}px;height:${H}px">${cols}</div>`);
    const run = spawnSync(chrome, [...headlessFlag, "--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${COL * OPAC.length},${H}`, `--screenshot=${png}`, "--virtual-time-budget=1000", pathToFileURL(file).href], { encoding: "utf8", timeout: 60000 });
    if (run.error || !fs.existsSync(png)) { fs.rmSync(tmp, { recursive: true, force: true }); notRun(`the browser did not render ${name} (${run.error?.message || (run.stderr || "").slice(-200)})`); }
    if (process.env.DALANG_KEEP) fs.copyFileSync(png, path.join(process.env.DALANG_KEEP, name + ".png")); // stills, on request
    const img = rowMeans(fs.readFileSync(png));
    assert.ok(img.w >= COL * OPAC.length && img.h >= H, `${name}: screenshot ${img.w}x${img.h}`);
    OPAC.forEach((o, k) => {
      const P = Array.from({ length: H }, (_, y) => img.lum(k * COL + 8, k * COL + COL - 8, y));
      // the band must show at all (else the check proves nothing): the top rows differ from the bare ground
      assert.ok(Math.abs(P[4] - P[H - 4]) > (o > 0.3 ? 2 : 0.3), `${name} @${o}: the band is on the frame (top ${P[4].toFixed(1)} vs ground ${P[H - 4].toFixed(1)})`);
      const ln = standout(P), st = jump(P), seen = ln.w >= T || st.w >= TS;
      worst.push(`${name} @${o}: line ${ln.w.toFixed(2)} (row ${ln.at}), step ${st.w.toFixed(2)} (row ${st.at})`);
      if (ctl) assert.ok(seen, `control ${ctl}: ${name} at opacity ${o} must be seen (line ${ln.w.toFixed(2)} of ${T}, step ${st.w.toFixed(2)} of ${TS})`);
      else if (seen) fails.push(`a horizontal line or step on the rendered glass band: ${name} at opacity ${o}: ${ln.w >= T ? `row ${ln.at} stands out by ${ln.w.toFixed(2)} levels (limit ${T})` : `a ${st.w.toFixed(2)}-level step at row ${st.at} (limit ${TS})`}`);
    });
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (process.env.DALANG_VERBOSE) console.log(worst.join("\n"));
assert.deepEqual(fails, [], fails.join("; "));
console.log(`glass band render: no line on ${Object.keys(GROUNDS).length} grounds x ${OPAC.length} opacities (${OPAC.join(", ")}); a 2 px lip and a ${STEP}-level step (sharp and soft) are seen`);
