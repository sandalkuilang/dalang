#!/usr/bin/env node
// Silhouette IoU (Studio, BRIEF.md `fidelity: exact`): how closely the hero's outline matches each picture of the subject
// the user gave (hero-asset.md "The user supplies reference images"). Per view: the reference's mask is what differs from
// its border colour (or its alpha), holes filled; the render's mask is its bright pixels (engine/blender/measure.py renders
// it from the reference's camera). The render is scaled by ONE factor (bbox height) and centred on the reference's bbox,
// never stretched per axis, so a wrong proportion shows as a lower IoU and an aspect difference.
// Prints per view: IoU against its threshold, the aspect difference, the worst ninth of the reference bbox and what is
// wrong there; --overlay writes the reference outline (red) over the aligned render outline (blue) on white.
// Usage: node silhouette_iou.mjs --ref <image> --render <png> [--name <view>] [--ortho] [--overlay <png>]
//        node silhouette_iou.mjs --list <views.json>   ([{ name, ref, render, ortho, overlay }], paths relative to it)
//        [--photo <min, 0.85>] [--ortho-min <min, 0.92>] [--json]   (thresholds: starting values, calibrate per film)
// Exit 1 when a view is under its threshold, 2 when a picture cannot be read or its background gives no clean mask (ask
// the user for one on a plain background: never a guess, never FAILED), 0 when every view passes. Needs ffmpeg/ffprobe.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const PHOTO = Number(opt('--photo', 0.85)), ORTHO = Number(opt('--ortho-min', 0.92)), JSON_OUT = args.includes('--json');

let views;
if (opt('--list')) {
  const list = opt('--list'), base = path.dirname(path.resolve(list));
  views = JSON.parse(readFileSync(list, 'utf8')).map(v => ({ ...v, ref: path.resolve(base, v.ref), render: path.resolve(base, v.render), overlay: v.overlay && path.resolve(base, v.overlay) }));
} else if (opt('--ref') && opt('--render')) {
  views = [{ name: opt('--name', 'view'), ref: opt('--ref'), render: opt('--render'), ortho: args.includes('--ortho'), overlay: opt('--overlay') }];
} else {
  console.error('usage: silhouette_iou.mjs --ref <image> --render <png> [--name n] [--ortho] [--overlay o.png] | --list views.json'); process.exit(2);
}

// A picture as 8-bit grey (or its alpha when it has one): { w, h, px }, null when ffmpeg cannot read it.
function load(file) {
  const p = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h, fmt = ''] = (p.stdout || '').trim().split(',');
  const W = Number(w), H = Number(h);
  if (!(W > 0 && H > 0)) return null;
  const alpha = /^(rgba|bgra|argb|abgr|ya\d|yuva|gbrap)/.test(fmt); // 'gray' has an a in it, so a prefix list
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', ...(alpha ? ['-vf', 'alphaextract'] : []), '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: W * H + 1e6 });
  return r.status === 0 && r.stdout.length >= W * H ? { w: W, h: H, px: r.stdout, alpha } : null;
}

// Holes filled: every pixel not reachable from the border through background is part of the shape.
function fill(mask, w, h) {
  const seen = new Uint8Array(w * h), q = new Int32Array(w * h);
  let n = 0;
  const push = i => { if (!mask[i] && !seen[i]) { seen[i] = 1; q[n++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  for (let k = 0; k < n; k++) {
    const i = q[k], x = i % w;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (i >= w) push(i - w); if (i < w * (h - 1)) push(i + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = seen[i] ? 0 : 1;
  return out;
}

// The reference's mask, or { why } when its background is not plain enough to separate the subject.
function refMask(img) {
  const { w, h, px } = img;
  if (img.alpha) return { m: fill(px.map(v => (v > 127 ? 1 : 0)), w, h) };
  const border = [];
  for (let x = 0; x < w; x++) border.push(px[x], px[(h - 1) * w + x]);
  for (let y = 0; y < h; y++) border.push(px[y * w], px[y * w + w - 1]);
  border.sort((a, b) => a - b);
  const bg = border[border.length >> 1], spread = border.reduce((s, v) => s + Math.abs(v - bg), 0) / border.length;
  if (spread > 18) return { why: `busy background (border spread ${spread.toFixed(0)}): ask for a picture on a plain background` };
  const m = fill(px.map(v => (Math.abs(v - bg) > 30 ? 1 : 0)), w, h);
  const share = m.reduce((s, v) => s + v, 0) / (w * h);
  if (share < 0.02 || share > 0.9) return { why: `no clean subject (${(share * 100).toFixed(0)} % of the frame): ask for a picture on a plain background` };
  return { m };
}

function box(m, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < w * h; i++) if (m[i]) { const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

function writeOverlay(file, w, h, a, b) {
  const rgb = Buffer.alloc(w * h * 3, 255);
  const edge = (m, i) => m[i] && ((i % w > 0 && !m[i - 1]) || (i % w < w - 1 && !m[i + 1]) || (i >= w && !m[i - w]) || (i < w * (h - 1) && !m[i + w]));
  for (let i = 0; i < w * h; i++) {
    if (edge(b, i)) rgb.set([30, 110, 255], i * 3);
    if (edge(a, i)) rgb.set([230, 40, 40], i * 3);
  }
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-i', '-', '-frames:v', '1', file], { input: rgb });
  return r.status === 0;
}

const ROWS = ['top', 'middle', 'bottom'], COLS = ['left', 'centre', 'right'];
function compare(v) {
  const ri = load(v.ref), ni = load(v.render);
  if (!ri || !ni) return { name: v.name, status: 'WARN', why: `cannot read ${!ri ? v.ref : v.render} — rerun` };
  const rm = refMask(ri);
  if (rm.why) return { name: v.name, status: 'WARN', why: rm.why };
  const nm = fill(ni.px.map(x => (x > 127 ? 1 : 0)), ni.w, ni.h);
  const A = box(rm.m, ri.w, ri.h), B = box(nm, ni.w, ni.h);
  if (!B) return { name: v.name, status: 'WARN', why: 'the render mask is empty: the camera misses the hero — check the ref row' };
  const s = A.h / B.h, { w, h } = ri, mapped = new Uint8Array(w * h), cells = Array.from({ length: 9 }, () => [0, 0]);
  let inter = 0, union = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const rx = Math.round((x - A.cx) / s + B.cx), ry = Math.round((y - A.cy) / s + B.cy);
    const i = y * w + x, b = rx >= 0 && ry >= 0 && rx < ni.w && ry < ni.h ? nm[ry * ni.w + rx] : 0, a = rm.m[i];
    mapped[i] = b;
    if (a && b) inter++;
    if (a || b) union++;
    if (a !== b) {
      const c = Math.min(2, Math.max(0, Math.floor(((x - A.x0) / A.w) * 3))) + 3 * Math.min(2, Math.max(0, Math.floor(((y - A.y0) / A.h) * 3)));
      cells[c][a ? 0 : 1]++;
    }
  }
  const iou = union ? inter / union : 0, min = v.ortho ? ORTHO : PHOTO;
  const worstI = cells.reduce((bi, c, i) => (c[0] + c[1] > cells[bi][0] + cells[bi][1] ? i : bi), 0), wc = cells[worstI];
  const worst = `${ROWS[(worstI / 3) | 0]} ${COLS[worstI % 3]}, render ${wc[0] >= wc[1] ? 'missing here' : 'extra here'}`;
  const aspect = (A.w / A.h) / (B.w / B.h) - 1;
  if (v.overlay) writeOverlay(v.overlay, w, h, rm.m, mapped);
  return { name: v.name, status: iou >= min ? 'PASS' : 'FAIL', iou: Number(iou.toFixed(3)), min, aspect: Number(aspect.toFixed(3)), worst, overlay: v.overlay ?? null };
}

const res = views.map(compare);
if (JSON_OUT) console.log(JSON.stringify({ views: res }, null, 1));
else {
  console.log('Silhouette IoU (uniform scale, centred)');
  for (const r of res) console.log(r.status === 'WARN' ? `WARN ${r.name}  ${r.why}`
    : `${r.status} ${r.name}  IoU ${r.iou.toFixed(3)} / ${r.min}  aspect ${r.aspect >= 0 ? '+' : ''}${(r.aspect * 100).toFixed(0)} %  worst: ${r.worst}${r.overlay ? `  overlay ${r.overlay}` : ''}`);
}
process.exit(res.some(r => r.status === 'WARN') ? 2 : res.some(r => r.status === 'FAIL') ? 1 : 0);
