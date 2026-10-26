#!/usr/bin/env node
// Dominant colours of a video, measured: one frame every --every s, shrunk to 64×64 (shares of the area are kept),
// each channel quantised to bins of --step, the --top colours per frame and overall, with % of frame and OKLCH
// lightness L (0..1). The colours steer your own palette: never a logo or a brand's colour scheme to copy.
//
// Usage:
//   node palette.mjs <video> [--every 1] [--top 6] [--step 16]
//   node palette.mjs --compare <#hex> <#hex>   lightness gap of two colours (figure-ground: ≥ 0.20 separates)
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SIDE = 64, FIGURE_GROUND = 0.2, MAX_BUFFER = 1024 ** 3;

// OKLab L of an sRGB colour (Björn Ottosson, https://bottosson.github.io/posts/oklab/).
export function oklchL([r, g, b]) {
  const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}
export const hex = (rgb) => '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('');
export const parseHex = (h) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};

// Colour counts of rgb24 pixels, quantised to bin centres; added into `into` when given.
export function count(buf, step = 16, into = new Map()) {
  const q = (v) => Math.min(255, Math.floor(v / step) * step + (step >> 1));
  for (let i = 0; i + 2 < buf.length; i += 3) {
    const k = (q(buf[i]) << 16) | (q(buf[i + 1]) << 8) | q(buf[i + 2]);
    into.set(k, (into.get(k) || 0) + 1);
  }
  return into;
}
// Top colours of a count map: [{ hex, rgb, pct, L }], pct of all counted pixels.
export function top(counts, n = 6) {
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => {
    const rgb = [k >> 16, (k >> 8) & 255, k & 255];
    return { hex: hex(rgb), rgb, pct: (100 * c) / total, L: oklchL(rgb) };
  });
}
export const dominant = (buf, { step = 16, top: n = 6 } = {}) => top(count(buf, step), n);
const line = (cs) => cs.map((c) => `${c.hex} ${c.pct.toFixed(1)} % L ${c.L.toFixed(2)}`).join(' · ');
// The one place an OS error (a stat, a spawn) becomes words: nothing else in this script may say "not found".
// Only ENOENT is missing; every other code, or none, is an unknown state: name the code and say what to rerun.
export function osProblem(err, what, { where = '', rerun = 'check the permissions and rerun' } = {}) {
  const code = (err && err.code) || 'unknown error';
  if (code === 'ENOENT') return `${what} not found${where}`;
  return `${what} could not be checked or run (${code})${where}, which does not mean it is missing: ${rerun}`;
}
// A spawn error of ffmpeg (ENOBUFS: the raw frames passed the buffer, so a larger --every).
export function spawnProblem(err, every) {
  if (err && err.code === 'ENOBUFS') return `ffmpeg ran, but its frames passed the ${MAX_BUFFER / 2 ** 30} GiB buffer (ENOBUFS): rerun with a larger --every (now ${every})`;
  return osProblem(err, 'ffmpeg', { where: ' on PATH', rerun: 'check the permissions and rerun, or with a larger --every' });
}
const fail = (msg) => { console.error(`FAILED: ${msg}`); process.exit(1); };

function main(argv) {
  if (argv[0] === '--compare') {
    const [a, b] = [parseHex(argv[1]), parseHex(argv[2])];
    if (!a || !b) fail('--compare needs two colours like #f4f4f4 #303030');
    const [La, Lb] = [oklchL(a), oklchL(b)], d = Math.abs(La - Lb), ok = d >= FIGURE_GROUND;
    console.log(`${hex(a)} L ${La.toFixed(2)} · ${hex(b)} L ${Lb.toFixed(2)} · ΔL ${d.toFixed(2)} — `
      + (ok ? `separates (≥ ${FIGURE_GROUND})` : `merges (< ${FIGURE_GROUND}): darken the hero's parts or its shadow`));
    process.exit(ok ? 0 : 3);
  }
  const o = { every: 1, top: 6, step: 16 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--every' || k === '--top' || k === '--step') o[k.slice(2)] = Number(argv[++i]);
    else if (!o.file && !k.startsWith('--')) o.file = k;
    else fail(`unknown option: ${k}`);
  }
  if (!o.file) fail('usage: node palette.mjs <video> [--every 1] [--top 6] [--step 16] | --compare <#hex> <#hex>');
  if (!(o.every > 0 && o.top >= 1 && o.step >= 1 && o.step <= 128)) fail('--every, --top and --step must be positive numbers (--step ≤ 128)');
  try { statSync(o.file); } catch (e) {
    fail(osProblem(e, 'file', { where: `: ${o.file}`, rerun: 'check the permissions of the file and its folders, then rerun' }));
  }
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', o.file, '-map', '0:v:0', '-vf',
    `fps=1/${o.every},scale=${SIDE}:${SIDE}:flags=area,format=rgb24`, '-f', 'rawvideo', '-'],
    { maxBuffer: MAX_BUFFER });
  if (r.error) fail(spawnProblem(r.error, o.every));
  if (r.status === null) fail(`ffmpeg was stopped by signal ${r.signal}; rerun`);
  if (r.status !== 0) fail(`ffmpeg could not read ${o.file}: ${String(r.stderr).trim().split('\n').pop()}`);
  const size = SIDE * SIDE * 3, frames = Math.floor(r.stdout.length / size);
  if (!frames) fail(`no frames decoded from ${o.file}; rerun, or check the file plays`);
  console.log(`Palette: ${o.file} (a frame every ${o.every} s, bins of ${o.step}, % of frame, OKLCH L)`);
  const all = new Map();
  for (let f = 0; f < frames; f++) {
    const buf = r.stdout.subarray(f * size, (f + 1) * size);
    count(buf, o.step, all);
    console.log(`  ${String(f + 1).padStart(4, '0')}  ~${(f * o.every).toFixed(0)} s  ${line(dominant(buf, o))}`);
  }
  console.log(`Overall (${frames} frames):`);
  for (const c of top(all, o.top)) console.log(`  ${c.hex}  ${c.pct.toFixed(1).padStart(5)} %  L ${c.L.toFixed(2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
