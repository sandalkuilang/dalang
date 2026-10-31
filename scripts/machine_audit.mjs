#!/usr/bin/env node
// Machine audit (object-studio, express.mjs assemble): the film's assets/machine.js proved to run. Imports it, runs
// drive.js audit(MODEL, AUDIT) (rigid links, gear ratios and bevel pairs' cones, contact gaps over the whole input) and poses build(mat)'s
// parts (mat: assets/objectStudio.js's kit) at the audit's start, a third and the middle: a part pose() never moves is
// not a mechanism. A stub (STUB still exported), a missing export or an AUDIT with no joint is a problem.
// Usage: node machine_audit.mjs [project]
// Exit 1 on a problem (fix the geometry or the model, never loosen the audit), 2 when the module cannot be loaded or
// run (WARN: rerun or fix, then audit again; never "clean"), 0 clean.
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const dir = path.resolve(process.argv[2] ?? '.'), file = path.join(dir, 'assets/machine.js');
const problems = [], infos = [];
const out = (code, warn) => {
  console.log('Machine audit (assets/machine.js)');
  for (const p of problems) console.log(`  PROBLEM  : ${p}`);
  if (warn) console.log(`  WARN     : ${warn}`);
  for (const i of infos) console.log(`  INFO     : ${i}`);
  console.log(`  Result   : ${code === 0 ? 'OK' : code === 1 ? `${problems.length} problem(s)` : 'not checked — rerun or fix, then audit again'}`);
  process.exit(code);
};
const first = (e) => String(e?.message ?? e).split('\n')[0];
if (!existsSync(file)) out(2, 'assets/machine.js not found (scaffold.mjs writes its stub for object-studio)');
let M, A, mat = {};
try { M = await import(pathToFileURL(file).href); }
catch (e) {
  if (/^drive:/.test(first(e))) { problems.push(first(e)); out(1); } // drive() ran its hand check or purity check at load and it failed: a wrong number, not an unknown
  out(2, `assets/machine.js cannot be loaded (${first(e)})`);
}
if (M.STUB) { problems.push('assets/machine.js is still the stub: the first group builds the machine before any shot'); out(1); }
try {
  A = await import(pathToFileURL(path.join(dir, 'assets/drive.js')).href);
  const kit = path.join(dir, 'assets/objectStudio.js');
  if (existsSync(kit)) mat = (await import(pathToFileURL(kit).href)).mat ?? {};
} catch (e) { out(2, `the engine in assets/ cannot be loaded (${first(e)}): rebuild it (engine/three/build.mjs)`); }
const missing = [['MODEL', typeof M.MODEL?.state === 'function'], ['AUDIT', M.AUDIT && typeof M.AUDIT === 'object'], ['build', typeof M.build === 'function'], ['pose', typeof M.pose === 'function']]
  .filter(([, ok]) => !ok).map(([k]) => k);
if (missing.length) { problems.push(`assets/machine.js does not export ${missing.join(', ')} (MODEL = drive(...), AUDIT, build(mat), pose(parts, s))`); out(1); }
let r;
try { r = A.audit(M.MODEL, M.AUDIT); }
catch (e) {
  if (/^audit:/.test(first(e))) { problems.push(`AUDIT: ${first(e).replace(/^audit:\s*/, '')}`); out(1); } // the spec itself is wrong: a problem, not unknown
  out(2, `the machine could not be audited (${first(e)})`);
}
problems.push(...r.problems);
infos.push(`${r.checked} joint samples checked`);
try {
  const { root, parts } = M.build(mat);
  const names = Object.keys(parts ?? {}), [u0, u1] = M.AUDIT.u;
  const snap = (u) => { M.pose(parts, M.MODEL.state(u)); return names.map((k) => { parts[k].updateMatrix(); return parts[k].matrix.elements.join(','); }); };
  const a = snap(u0), b = snap((u0 + u1) / 2), c = snap(u0 + (u1 - u0) / 3);
  const moving = names.filter((_, i) => a[i] !== b[i] || a[i] !== c[i]);
  let meshes = 0; root?.traverse?.((o) => { if (o.isMesh) meshes++; });
  infos.push(`${meshes} meshes; ${moving.length} of ${names.length} parts move (${moving.join(', ') || 'none'})`);
  if (moving.length < 2) problems.push(`${moving.length} of ${names.length} parts move over the input: a mechanism needs at least two parts posed by pose()`);
} catch (e) { out(2, `the machine could not be built or posed (${first(e)})`); }
out(problems.length ? 1 : 0);
