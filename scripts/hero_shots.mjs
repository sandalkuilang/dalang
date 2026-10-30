#!/usr/bin/env node
// Hero shots lint (Studio Step 5, before the hero is modelled): review/hero-shots.json, the planner's structured list of
// every storyboard shot that shows the hero, which engine/blender/measure.py measures (hero-asset.md §3). Each row must
// be a shot of storyboard.md's table, its side word the storyboard's (front, front-left, left, back-left, back,
// back-right, right, front-right), every key's az inside that side (± 22.5°; az 0 = the asset's front, 90 = its left),
// lens (mm) and distance (m) real, focal named, need numbers positive, need.move with two states or more. Each `refs`
// view (a picture the user gave, fidelity exact): a name, its image under the film folder, az, and ortho or a lens and distance.
// Usage: node hero_shots.mjs [project]   (default: .)
// Exit 1 on a problem, 2 when a file cannot be read or is not written yet (rerun / write it), 0 when clean.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) ?? '.');
const SIDES = { front: 0, 'front-left': 45, left: 90, 'back-left': 135, back: 180, 'back-right': 225, right: 270, 'front-right': 315 };
const problems = [], warns = [];
const done = () => {
  for (const p of problems) console.log(`  PROBLEM  : ${p}`);
  for (const w of warns) console.log(`  WARN     : ${w}`);
  console.log(problems.length ? `  Result   : ${problems.length} problem(s)` : warns.length ? '  Result   : not checked — see WARN' : '  Result   : OK');
  process.exit(problems.length ? 1 : warns.length ? 2 : 0);
};
const read = rel => {
  try { return readFileSync(path.join(dir, rel), 'utf8'); }
  catch (e) { warns.push(e.code === 'ENOENT' ? `${rel} not written yet: the planner writes it (hero-asset.md §3)` : `${rel}: cannot read (${e.code}) — rerun`); return null; }
};
console.log('Hero shots lint');
const text = read('review/hero-shots.json'), sb = read('storyboard.md');
if (text == null || sb == null) done();
let spec;
try { spec = JSON.parse(text); } catch (e) { problems.push(`review/hero-shots.json is not valid JSON (${e.message})`); done(); }

// storyboard shot -> its side word (the longest side word in the Size · angle cell)
const cells = l => l.trim().split(/(?<!\\)\|/).slice(1, -1).map(c => c.trim());
const L = sb.replace(/\r/g, '').split('\n');
const hi = L.findIndex(l => l.trim().startsWith('|') && /subject action/i.test(l));
if (hi < 0) { warns.push("storyboard.md has no shot table (a header with 'Subject action')"); done(); }
const sizeCol = cells(L[hi]).findIndex(h => /size/i.test(h));
const shots = new Map();
for (let i = hi + 2; i < L.length && L[i].trim().startsWith('|'); i++) {
  const c = cells(L[i]), cell = (c[sizeCol] ?? '').toLowerCase();
  const side = Object.keys(SIDES).sort((a, b) => b.length - a.length).find(s => new RegExp(`(^|[^a-z-])${s}([^a-z-]|$)`).test(cell));
  if (/^\d+$/.test(c[0] ?? '')) shots.set(Number(c[0]), side ?? null);
}

const num = (x, min = 0) => typeof x === 'number' && Number.isFinite(x) && x > min;
const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(x => typeof x === 'number' && Number.isFinite(x));
if (!vec(spec.frame, 2)) problems.push('frame: [width, height] in px, from BRIEF.md');
if (spec.front !== undefined && !vec(spec.front, 3)) problems.push('front: the asset\'s facing direction, [x, y, z]');
if (!Array.isArray(spec.rows) || !spec.rows.length) { problems.push('rows: one per storyboard shot that shows the hero'); done(); }
spec.rows.forEach((r, i) => {
  const at = `row ${i + 1}`;
  if (!shots.has(r.shot)) return problems.push(`${at}: shot ${r.shot} is not in storyboard.md`);
  if (!(r.side in SIDES)) problems.push(`${at}: side "${r.side}" is not one of ${Object.keys(SIDES).join(', ')}`);
  const sbSide = shots.get(r.shot);
  if (sbSide && r.side !== sbSide) problems.push(`${at}: shot ${r.shot} is "${r.side}" here but "${sbSide}" in storyboard.md`);
  if (!(typeof r.target === 'string' && r.target) && !vec(r.target, 3)) problems.push(`${at}: target is a node name or [x, y, z]`);
  if (!Array.isArray(r.focal) || !r.focal.length || !r.focal.every(f => typeof f === 'string' && f)) problems.push(`${at}: focal names the parts that must read (node-name prefixes)`);
  if (r.soft !== undefined && !(Array.isArray(r.soft) && r.soft.every(f => typeof f === 'string' && f))) problems.push(`${at}: soft names the defocused foreground (node-name prefixes)`);
  if (r.states !== undefined && !Array.isArray(r.states)) problems.push(`${at}: states is a list of the asset's states`);
  if (!Array.isArray(r.keys) || !r.keys.length) problems.push(`${at}: keys, one camera per key ({ az, el, mm, dist })`);
  (r.keys ?? []).forEach((k, j) => {
    if (!num(k.mm)) problems.push(`${at}: key ${j + 1} mm is the lens in millimetres, > 0`);
    if (!num(k.dist)) problems.push(`${at}: key ${j + 1} dist is the camera distance in metres, > 0`);
    const d = Math.abs(((k.az - SIDES[r.side]) % 360 + 540) % 360 - 180);
    if (r.side in SIDES && !(d <= 22.5)) problems.push(`${at}: key ${j + 1} az ${k.az} is not "${r.side}" (${SIDES[r.side]} ± 22.5)`);
  });
  for (const [k, v] of Object.entries(r.need ?? {})) if (!num(v)) problems.push(`${at}: need.${k} must be a number > 0`);
  if (r.need?.move && (r.states ?? []).length < 2) problems.push(`${at}: need.move needs two states or more`);
});
(spec.refs ?? []).forEach((v, i) => {
  const at = `refs ${i + 1}`;
  if (!(typeof v.name === 'string' && v.name)) problems.push(`${at}: name the view (side, front, top…)`);
  if (!(typeof v.image === 'string' && existsSync(path.join(dir, v.image)))) problems.push(`${at}: image ${v.image} is not a file under the film folder`);
  if (typeof v.az !== 'number') problems.push(`${at}: az, the view's angle from the asset's front`);
  if (!v.ortho && !(num(v.mm) && num(v.dist))) problems.push(`${at}: ortho: true for a blueprint, else the photo's estimated mm and dist`);
});
done();
