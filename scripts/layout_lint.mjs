#!/usr/bin/env node
// Layout lint (review): text drawn on the film's 2D canvas (engine/three/type.js) is invisible to `hyperframes check`,
// which reads the DOM. type.js layoutFrame() records every caption, label and range card drawn in a frame (its box and
// font size in px) and the hero's box; this lint reads those records and flags, each line carrying its time `t=…s`:
//   - a box outside the format's safe area (type.js safeArea: a caption may use the caption band to its bottom edge);
//   - a caption covering more than 10 % of its own area of the hero (--hero-overlap): of the hero's own pixels (the box's `over`,
//     objectStudio.js) when recorded, else of the hero box (clipped hero = lower bound). A hero filling 65 % of one axis is a
//     close-up: the caption sits over it by design, and labels and cards pinned to a part are not judged;
//   - a label or card under 36 px, a caption under 54 px (--min-label, --min-caption; at 1080 px on the short side, scaled
//     with the canvas; the object-studio kit draws captions at 46 and its smallest label at 22, so express.mjs passes those);
//   - a caption box overlapping a label or card box;
//   - the hero box under 1/3 of the frame on both axes (--min-hero; with --hero-band <top>,<bottom>, fractions of the height such as
//     0.18,0.60, a portrait frame (H > W) measures the hero's height against the band's height, (bottom - top) * H, not H: object-studio's
//     subject box is only that band of a 9:16 frame; a landscape frame ignores the band), or its pixels reaching an edge (`edges`, objectStudio.js;
//     else the box touching one) without filling 65 % of an axis (a clipped box is a lower bound and is not judged for either);
//     a flagged hero line names the largest part of the box (`parts`), so a too-large box can be traced;
//   - the hero's contrast against the ground around it (`contrast`, ΔE*ab, objectStudio.js) under 8 (--min-contrast; a hero at 8–12 read plainly on real films, under 6 it washed out).
//   - more kinds of text on screen at once than --max-text-layers n (off by default; caption, label and card are the three
//     kinds, two labels are one layer): the visual thesis allows two (looks.md object-studio), so express.mjs passes 2 for it.
// --no-safe-area skips the safe-area check (object-studio keeps its own frame zones, object-studio-API.md).
// A hero key that is absent is INFO (overlap not checked); null (the hero is off the frame) has nothing to overlap.
// Records: [{ t, W, H, format, hero?: { x0, y0, x1, y1, clipped?, parts?, edges? } | null, contrast?: number | null, boxes: [{ kind, text, x0, y0, x1, y1, size, over? }] }],
// or { frames: [...] }. strips.mjs writes them to review/strips/layout.json and lints them into review/strips/index.md.
// Usage: node layout_lint.mjs [layout.json | project] [--hero-overlap 0.10] [--min-hero 0.33] [--hero-band 0.18,0.60] [--min-contrast 8] [--min-caption 54] [--min-label 36] [--max-text-layers n] [--no-safe-area]   (default: .; a project = its
// review/strips/layout.json). Exit 1 on a problem, 2 when the records cannot be read or a frame cannot be checked
// (rerun / fix), 0 when clean.
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { safeArea } from '../engine/three/type.js';

const EDGE = 0.5; // px of tolerance at an edge
const EDGE_SHARE = 0.02; // the hero's pixels on at least this share of an edge's length: cut there
const CLOSEUP = 0.65; // a hero filling this share of one axis is a close-up: cut by the frame on purpose, and text sits over it
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const rect = (b) => b && num(b.x0) && num(b.y0) && num(b.x1) && num(b.y1) && b.x1 > b.x0 && b.y1 > b.y0;
const area = (b) => (b.x1 - b.x0) * (b.y1 - b.y0);
const inter = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const r = Math.round;
const show = (b) => `${r(b.x0)},${r(b.y0)}–${r(b.x1)},${r(b.y1)}`;
// the part that drives a hero box (engine/three/camera.js heroBox explain), so a too-large box can be traced to it
const driver = (h) => (h.parts?.[0] ? ` (largest part ${h.parts[0].name}, ${h.parts[0].w} x ${h.parts[0].h} px)` : '');
const name = (b) => `${b.kind} "${String(b.text).replace(/[\r\n|]+/g, ' ').slice(0, 60)}"`;

export function lintLayout(frames, { heroOverlap = 0.10, minHero = 1 / 3, heroBand = null, minContrast = 8, minCaption = 54, minLabel = 36, maxTextLayers = null, safe = true } = {}) {
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
    if (safe) try { area_ = safeArea(f.format, f.W, f.H); } catch (e) { return W_(`cannot check this frame (format ${JSON.stringify(f.format)}: ${e.message})`); }
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
    if (hero && !hero.clipped) {
      const hh = (hero.y1 - hero.y0) / f.H, hw = (hero.x1 - hero.x0) / f.W;
      const band = heroBand && f.H > f.W ? (heroBand[1] - heroBand[0]) * f.H : f.H; // the subject box's height on a portrait frame
      const hb = (hero.y1 - hero.y0) / band; // the size test only: the close-up and cut tests below keep the frame's share
      // ponytail: the larger share decides, so a wide subject in a tall frame passes on its width
      if (Math.max(hb, hw) < minHero) P(`hero box ${show(hero)}${driver(hero)} fills ${r(hb * 100)} % of the ${band === f.H ? 'frame' : 'subject band'} height and ${r(hw * 100)} % of its width, under ${r(minHero * 100)} %: move the camera in or take a longer lens`);
      // the hero's pixels at an edge (`edges`, objectStudio.js; at least EDGE_SHARE of its length) say where it is cut; without them, its box
      const cut = hero.edges ? ['left', 'top', 'right', 'bottom'].filter((k) => hero.edges[k] >= EDGE_SHARE)
        : [['left', hero.x0 <= EDGE], ['top', hero.y0 <= EDGE], ['right', hero.x1 >= f.W - EDGE], ['bottom', hero.y1 >= f.H - EDGE]].filter(([, on]) => on).map(([s]) => s);
      // a close-up fills the frame on one axis at least; touching an edge otherwise, the frame cuts the subject
      if (cut.length && Math.max(hh, hw) < CLOSEUP) P(`hero box ${show(hero)}${driver(hero)} is cut by the frame's ${cut.join(' and ')} edge: frame the whole subject, or go in until it fills the frame`);
    }
    if (num(f.contrast) && f.contrast < minContrast) P(`hero reads at ΔE* ${f.contrast} against the ground around it, under ${minContrast}: a darker material on the hero first (a darkened floor reads as a vignette), else a backdrop() behind it`);

    for (const b of boxes) {
      if (safe) {
        // The caption may use the caption zone below the text area (reels end it at 82 % of the height).
        const z = b.kind === 'caption' ? { ...area_.text, y1: Math.max(area_.text.y1, area_.caption.y1) } : area_.text;
        const out = Math.max(z.x0 - b.x0, z.y0 - b.y0, b.x1 - z.x1, b.y1 - z.y1);
        if (out > EDGE) P(`${name(b)} ${show(b)} leaves the ${f.format} safe area ${show(z)} by ${r(out)} px`);
      }
      // pinned labels and cards sit on the parts they name, and a close-up's caption sits over the subject: only a caption over a hero that is not a close-up is judged
      if (hero && b.kind === 'caption' && Math.max((hero.y1 - hero.y0) / f.H, (hero.x1 - hero.x0) / f.W) < CLOSEUP) {
        // `over` (objectStudio.js): the share of the box on the hero's own pixels; without it, the share of the hero's box
        const share = num(b.over) ? b.over : inter(b, hero) / area(b);
        if (share > heroOverlap) P(`${name(b)} ${show(b)} covers ${r(share * 100)} % of the hero ${num(b.over) ? 'pixels' : 'box'} ${show(hero)}${driver(hero)}${hero.clipped ? ' (hero box clipped: a lower bound)' : ''}`);
      }
      const min = (b.kind === 'caption' ? minCaption : minLabel) * s;
      if (b.size < min - 1e-6) P(`${name(b)} is ${r(b.size * 10) / 10} px, under the ${r(min)} px minimum`);
    }
    const kinds = ['caption', 'label', 'card'].filter((k) => boxes.some((b) => b.kind === k));
    if (maxTextLayers != null && kinds.length > maxTextLayers) P(`${kinds.length} text layers at once (${kinds.join(', ')}), over ${maxTextLayers}: drop one (a label into the caption's words, a card to its own beat)`);
    for (const c of boxes.filter((b) => b.kind === 'caption'))
      for (const l of boxes.filter((b) => b.kind !== 'caption'))
        if (inter(c, l) > 0) P(`${name(c)} ${show(c)} overlaps ${name(l)} ${show(l)}`);
  });
  return { problems, warns, infos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const take = (k) => { const i = args.indexOf(k); return i >= 0 ? (args.splice(i, 2)[1] ?? '') : null; }; // no value: a usage WARN below, never a crash
  const hoArg = take('--hero-overlap'), mhArg = take('--min-hero'), mcArg = take('--min-contrast'), cpArg = take('--min-caption'), lbArg = take('--min-label'), hbArg = take('--hero-band'), tlArg = take('--max-text-layers');
  const safe = !(args.includes('--no-safe-area') && args.splice(args.indexOf('--no-safe-area'), 1));
  const mh = mhArg === null ? 1 / 3 : Number(mhArg), mc = mcArg === null ? 8 : Number(mcArg);
  const cp = cpArg === null ? 54 : Number(cpArg), lb = lbArg === null ? 36 : Number(lbArg), tl = tlArg === null ? null : Number(tlArg);
  const target = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');
  let frames = null, count = 0;
  const warns = [], problems = [], infos = [];
  const ho = hoArg === null ? 0.10 : Number(hoArg);
  const hb = hbArg === null ? null : hbArg.split(',').map((v) => (v.trim() === '' ? NaN : Number(v)));
  if (hoArg !== null && !(hoArg.trim() !== '' && ho >= 0 && ho <= 1)) warns.push(`--hero-overlap ${hoArg}: use a share between 0 and 1`);
  else if (mhArg !== null && !(mhArg.trim() !== '' && mh > 0 && mh <= 1)) warns.push(`--min-hero ${mhArg}: use a share between 0 and 1`);
  else if (hb && !(hb.length === 2 && hb[0] >= 0 && hb[1] <= 1 && hb[0] < hb[1])) warns.push(`--hero-band ${hbArg}: use <top>,<bottom> as fractions of the height, top under bottom (0.18,0.60)`);
  else if (mcArg !== null && !(mcArg.trim() !== '' && mc >= 0)) warns.push(`--min-contrast ${mcArg}: use a ΔE* of 0 or more`);
  else if (cpArg !== null && !(cpArg.trim() !== '' && cp > 0)) warns.push(`--min-caption ${cpArg}: use a size in px above 0`);
  else if (lbArg !== null && !(lbArg.trim() !== '' && lb > 0)) warns.push(`--min-label ${lbArg}: use a size in px above 0`);
  else if (tlArg !== null && !(tlArg.trim() !== '' && Number.isInteger(tl) && tl >= 1)) warns.push(`--max-text-layers ${tlArg}: use a whole number of 1 or more`);
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
      const res = lintLayout(frames, { heroOverlap: ho, minHero: mh, heroBand: hb, minContrast: mc, minCaption: cp, minLabel: lb, maxTextLayers: tl, safe });
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
