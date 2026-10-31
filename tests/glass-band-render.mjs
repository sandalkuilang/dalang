#!/usr/bin/env node
// The top glass band (.ov-glass, engine/three/editorial.js) draws no horizontal line on a RENDERED frame: its row-mean
// luminance is read from a headless-Chromium screenshot, on every kind of ground (light sky, paper, pale sweep, dark
// blueprint) and at the opacities the headline envelope gives while it fades in and out (the compositor may redraw the
// blur's box edge there). The static CSS check in engine/three/selfcheck.mjs cannot see either. Runs only where a
// headless Chromium is found (DALANG_CHROME, hyperframes' or Playwright's cache, or PATH): without one it says so and
// exits 0 (not run is not failed). Optional argument: another editorial.js to test (to prove the check fails on a line).
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
const candidates = [
  process.env.DALANG_CHROME,
  latest(path.join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"]),
  latest(path.join(home, ".cache", "hyperframes", "chrome", "chrome-headless-shell"), ["chrome-headless-shell-linux64", "chrome-headless-shell"]),
  latest(path.join(home, "Library", "Caches", "ms-playwright"), ["chrome-headless-shell-mac-arm64", "chrome-headless-shell"]),
  latest(path.join(home, ".cache", "ms-playwright"), ["chrome-linux", "headless_shell"]),
].filter(Boolean);
const chrome = candidates.find((p) => fs.existsSync(p));
if (!chrome) { console.log("WARN: no headless Chromium found (set DALANG_CHROME): the rendered glass-band check was not run, rerun where one is installed"); process.exit(0); }

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
// a case = { name, ground, lip }: lip injects a 2 px light line at 70 % of the band (the old design), the control that
// proves this check can see a line at all
const CASES = [...Object.entries(GROUNDS).map(([name, ground]) => ({ name, ground })), { name: "control-lip", ground: GROUNDS.sky, lip: true }];
const worst = [], fails = [];
try {
  for (const { name, ground, lip } of CASES) {
    const { css, tint, h } = cssText(ground), H = h + 140;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(ground.slice(i, i + 2), 16)), dk = `rgb(${r * 0.9 | 0},${g * 0.9 | 0},${b * 0.9 | 0})`, lt = `rgb(${Math.min(255, r * 1.06) | 0},${Math.min(255, g * 1.06) | 0},${Math.min(255, b * 1.06) | 0})`;
    const extra = lip ? `<div style="position:absolute;left:0;top:${Math.round(h * 0.7)}px;width:100%;height:2px;background:rgba(255,255,255,.85)"></div>` : "";
    const cols = OPAC.map((o, k) => `<div style="position:absolute;left:${k * COL}px;top:0;width:${COL}px;height:${H}px;background:repeating-linear-gradient(90deg,${dk} 0 45px,${lt} 45px 90px)"><div class="ov" style="--ov-glass:${tint};width:${COL}px;height:${H}px"><div class="ov-glass" style="height:${h}px;opacity:${o}"></div>${extra.replace("top:", `opacity:${o};top:`)}</div></div>`).join("");
    const file = path.join(tmp, name + ".html"), png = path.join(tmp, name + ".png");
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#000}${css}</style><div style="position:relative;width:${COL * OPAC.length}px;height:${H}px">${cols}</div>`);
    const run = spawnSync(chrome, ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${COL * OPAC.length},${H}`, `--screenshot=${png}`, "--virtual-time-budget=1000", pathToFileURL(file).href], { encoding: "utf8", timeout: 60000 });
    if (run.error || !fs.existsSync(png)) { console.log(`WARN: the browser did not render ${name} (${run.error?.message || (run.stderr || "").slice(-200)}): rendered glass-band check not run, rerun`); process.exit(0); }
    if (process.env.DALANG_KEEP) fs.copyFileSync(png, path.join(process.env.DALANG_KEEP, name + ".png")); // stills, on request
    const img = rowMeans(fs.readFileSync(png));
    assert.ok(img.w >= COL * OPAC.length && img.h >= H, `${name}: screenshot ${img.w}x${img.h}`);
    OPAC.forEach((o, k) => {
      const P = Array.from({ length: H }, (_, y) => img.lum(k * COL + 8, k * COL + COL - 8, y));
      // the band must show at all (else the check proves nothing): the top rows differ from the bare ground
      assert.ok(Math.abs(P[4] - P[H - 4]) > (o > 0.3 ? 2 : 0.3), `${name} @${o}: the band is on the frame (top ${P[4].toFixed(1)} vs ground ${P[H - 4].toFixed(1)})`);
      const { w, at } = standout(P);
      worst.push(`${name} @${o}: worst row ${at} stands out by ${w.toFixed(2)}`);
      if (lip) { assert.ok(w >= T, `control: a 2 px lip at opacity ${o} must be seen as a line (row ${at}, ${w.toFixed(2)})`); }
      else if (w >= T) fails.push(`a horizontal line on the rendered glass band: ${name} at opacity ${o}, row ${at} stands out by ${w.toFixed(2)} levels (limit ${T})`);
    });
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (process.env.DALANG_VERBOSE) console.log(worst.join("\n"));
assert.deepEqual(fails, [], fails.join("; "));
console.log(`glass band render: no line on ${Object.keys(GROUNDS).length} grounds x ${OPAC.length} opacities (${OPAC.join(", ")}); a 2 px lip control is seen`);
