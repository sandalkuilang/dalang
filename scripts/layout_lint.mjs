#!/usr/bin/env node
// Layout lint (review): text drawn on the film's 2D canvas (engine/three/type.js) is invisible to `hyperframes check`,
// which reads the DOM. type.js layoutFrame() records every caption, label and range card drawn in a frame (its box and
// font size in px) and the hero's box; this lint reads those records and flags, each line carrying its time `t=…s`:
//   - a box outside the format's safe area (type.js safeArea: a caption may use the caption band to its bottom edge);
//   - a text box covering more than 10 % of its own area of the hero box (--hero-overlap; clipped hero = lower bound);
//   - a label or card under 36 px, a caption under 54 px (at 1080 px on the short side, scaled with the canvas);
//   - a caption box overlapping a label or card box.
// A hero key that is absent is INFO (overlap not checked); null (the hero is off the frame) has nothing to overlap.
// Records: [{ t, W, H, format, hero?: { x0, y0, x1, y1, clipped? } | null, boxes: [{ kind, text, x0, y0, x1, y1, size }] }],
// or { frames: [...] }. strips.mjs writes them to review/strips/layout.json and lints them into review/strips/index.md.
// Usage: node layout_lint.mjs [layout.json | project] [--hero-overlap 0.10]   (default: .; a project = its
// review/strips/layout.json). Exit 1 on a problem, 2 when the records cannot be read or a frame cannot be checked
// (rerun / fix), 0 when clean.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeArea } from '../engine/three/type.js';

const MIN_CAPTION = 54, MIN_LABEL = 36, EDGE = 0.5; // px at 1080 on the short side; px of tolerance at an edge
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const rect = (b) => b && num(b.x0) && num(b.y0) && num(b.x1) && num(b.y1) && b.x1 > b.x0 && b.y1 > b.y0;
const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const r = Math.round;
const show = (b) => `${r(b.x0)},${r(b.y0)}–${r(b.x1)},${r(b.y1)}`;
const name = (b) => `${b.kind} "${String(b.text).replace(/[\r\n|]+/g, ' ').slice(0, 60)}"`;

export function lintLayout(frames, { heroOverlap = 0.10 } = {}) {
  const problems = [], warns = [], infos = [];
  if (!Array.isArray(frames) || !frames.length) {
    warns.push('no layout recorded (the composition does not call layoutFrame)');
    return { problems, warns, infos };
  }
  frames.forEach((f, i) => {
    const at = num(f?.t) ? `t=${f.t}s` : `frame ${i + 1}`;
    const P = (m) => problems.push(`${at} ${m}`), W_ = (m) => warns.push(`${at} ${m}`);
    let area_;
    if (!num(f?.t) || !(f.W > 0) || !(f.H > 0) || !Array.isArray(f.boxes)) return W_('cannot check this frame (t, W, H or boxes missing) — rerun the capture');
    try { area_ = safeArea(f.format, f.W, f.H); } catch (e) { return W_(`cannot check this frame (format ${JSON.stringify(f.format)}: ${e.message})`); }
    const s = Math.min(f.W, f.H) / 1080;
    const boxes = [];
    f.boxes.forEach((b, k) => {
      if (!rect(b) || !num(b.size) || !['caption', 'label', 'card'].includes(b?.kind)) W_(`box ${k + 1} cannot be read (kind, x0, y0, x1, y1 or size) — skipped`);
      else boxes.push(b);
    });
    const hasHero = Object.hasOwn(f, 'hero');
    let hero = null;
    if (hasHero && f.hero !== null) {
      if (rect(f.hero)) hero = f.hero;
      else W_('hero box cannot be read — overlap not checked');
    }
    if (!hasHero && boxes.length) infos.push(`${at} no hero box given: overlap not checked`);

    for (const b of boxes) {
      // The caption may use the caption zone below the text area (reels end it at 82 % of the height).
      const z = b.kind === 'caption' ? { ...area_.text, y1: Math.max(area_.text.y1, area_.caption.y1) } : area_.text;
      const out = Math.max(z.x0 - b.x0, z.y0 - b.y0, b.x1 - z.x1, b.y1 - z.y1);
      if (out > EDGE) P(`${name(b)} ${show(b)} leaves the ${f.format} safe area ${show(z)} by ${r(out)} px`);
      if (hero) {
        const share = inter(b, hero) / area(b);
        if (share > heroOverlap) P(`${name(b)} ${show(b)} covers ${r(share * 100)} % of the hero box ${show(hero)}${hero.clipped ? ' (hero box clipped: a lower bound)' : ''}`);
      }
      const min = (b.kind === 'caption' ? MIN_CAPTION : MIN_LABEL) * s;
      if (b.size < min - 1e-6) P(`${name(b)} is ${r(b.size * 10) / 10} px, under the ${r(min)} px minimum`);
    }
    for (const c of boxes.filter((b) => b.kind === 'caption'))
      for (const l of boxes.filter((b) => b.kind !== 'caption'))
        if (inter(c, l) > 0) P(`${name(c)} ${show(c)} overlaps ${name(l)} ${show(l)}`);
  });
  return { problems, warns, infos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const hi = args.indexOf('--hero-overlap');
  const hoArg = hi >= 0 ? (args.splice(hi, 2)[1] ?? '') : null; // a flag with no value is a usage WARN below, never a crash
  const target = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');
  let frames = null, count = 0;
  const warns = [], problems = [], infos = [];
  const ho = hoArg === null ? 0.10 : Number(hoArg);
  if (hoArg !== null && !(hoArg.trim() !== '' && ho >= 0 && ho <= 1)) warns.push(`--hero-overlap ${hoArg}: use a share between 0 and 1`);
  else {
    let file = target;
    try { if (statSync(target).isDirectory()) file = path.join(target, 'review', 'strips', 'layout.json'); } catch { /* read below */ }
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      frames = Array.isArray(j) ? j : j?.frames;
    } catch (e) {
      warns.push(e.code === 'ENOENT' ? `no layout.json: run strips.mjs (${file})` : e instanceof SyntaxError ? `${file}: not valid JSON (${e.message}) — rerun strips.mjs` : `${file}: cannot read (${e.code ?? e.message}) — rerun`);
    }
    if (!warns.length) {
      const res = lintLayout(frames, { heroOverlap: ho });
      problems.push(...res.problems); warns.push(...res.warns); infos.push(...res.infos);
      count = Array.isArray(frames) ? frames.length : 0;
    }
  }
  console.log(`Layout lint: ${count} frames`);
  for (const p of problems) console.log(`  PROBLEM  : ${p}`);
  for (const w of warns) console.log(`  WARN     : ${w}`);
  for (const n of infos) console.log(`  INFO     : ${n}`);
  console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? `  Result   : ${warns.length} warning(s) — rerun or fix, then lint again` : '  Result   : OK');
  process.exit(problems.length ? 1 : warns.length ? 2 : 0);
}
