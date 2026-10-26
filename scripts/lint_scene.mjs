#!/usr/bin/env node
// Scene lint: a `//` comment written in the middle of a line turns the rest of that line into comment text. The file
// stays valid JavaScript, so `node --check` passes, and the swallowed scale, shadow setting, `add` or comma ships.
// Scans the film's own code: assets/**/*.js|mjs, src/** and style-frames/src/** (.html: only <script> content), never a
// folder with .engine.json (the engine copy, engine/three/build.mjs), node_modules or *.min.js.
// Usage: node lint_scene.mjs [project|file ...]   (default: .)
// Exit 1 when a comment swallows code (file:line + the swallowed text), 2 when nothing could be linted or a file could
// not be read (rerun), 0 when clean.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const warns = [], problems = [];
const isScene = p => /\.(m?js|html?)$/i.test(p) && !/\.min\.js$/i.test(p);
const walk = d => {
  let names;
  try { names = readdirSync(d); } catch (e) { if (e.code !== 'ENOENT') warns.push(`${d}: cannot read (${e.code}) — rerun`); return []; }
  if (names.includes('.engine.json')) return []; // an engine build: not this film's code
  return names.filter(n => n !== 'node_modules').flatMap(n => {
    const p = path.join(d, n);
    try { return statSync(p).isDirectory() ? walk(p) : isScene(p) ? [p] : []; }
    catch (e) { warns.push(`${p}: cannot read (${e.code}) — rerun`); return []; }
  });
};

// Every `//` comment outside strings, block comments and (for .html) outside <script>: { line, code, text }.
function comments(src, html) {
  const out = []; let st = html ? 'html' : 'code', line = 1, lineStart = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; lineStart = i + 1; if (st === "'" || st === '"') st = 'code'; continue; }
    if (st === 'html') { // enter code after the `>` of an opening <script ...>
      if (/^<script\b/i.test(src.slice(i, i + 8))) {
        const e = src.indexOf('>', i); if (e < 0) break;
        for (let k = i; k < e; k++) if (src[k] === '\n') { line++; lineStart = k + 1; }
        i = e; st = 'code';
      }
      continue;
    }
    if (st === 'block') { if (c === '*' && n === '/') { st = 'code'; i++; } continue; }
    if (c === '\\') { i++; continue; }                 // an escape, in a string or a regex (`/\/\//`)
    if (st !== 'code') { if (c === st) st = 'code'; continue; }
    if (html && c === '<' && /^<\/script/i.test(src.slice(i, i + 8))) { st = 'html'; continue; }
    if (c === "'" || c === '"' || c === '`') { st = c; continue; }
    if (c === '/' && n === '*') { st = 'block'; i++; continue; }
    if (c === '/' && n === '/') {
      let e = src.indexOf('\n', i); if (e < 0) e = src.length;
      out.push({ line, code: src.slice(lineStart, i), text: src.slice(i + 2, e) });
      i = e - 1; continue;                             // the newline is handled by the next turn
    }
  }
  return out;
}

const ID = '[A-Za-z_$][\\w$]*', MEMBER = `${ID}(?:\\.${ID}|\\[[^\\]]*\\])+`;
const STATEMENT = [
  new RegExp(`${MEMBER}\\s*[-+*/%|&]?=(?![=>])`),   // obj.scale.y = 0.04
  new RegExp(`${ID}(?:\\.${ID})+\\(`),              // parent.add(child)
  new RegExp(`\\b(?:const|let|var)\\s+${ID}\\s*=`), // const y = …
  new RegExp(`${ID}\\s*[-+*/%]?=(?![=>])[^;]*;`),   // y = 2;
  new RegExp(`${ID}\\([^()]*\\)\\s*;`),             // update();
];

function lint(file, rel) {
  let src;
  try { src = readFileSync(file, 'utf8'); } catch (e) { warns.push(`${rel}: cannot read (${e.code}) — rerun`); return; }
  const html = /\.html?$/i.test(file);
  for (const { line, code: raw, text } of comments(src, html)) {
    const code = html ? raw.replace(/^.*<script\b[^>]*>/i, '') : raw;
    if (code.trim() === '') continue;                  // a whole-line comment: commented-out code is a choice
    const t = text.trim(), shown = t.length > 80 ? t.slice(0, 77) + '…' : t, where = `${rel}:${line}`;
    if (/[\]})]\s*$/.test(code) && /,\s*$/.test(text)) problems.push(`${where}  the comma after "${code.trim().slice(-1)}" is inside the // comment, so the next entry joins this one: "${shown}"`);
    else if (STATEMENT.some(r => r.test(t))) problems.push(`${where}  code after the // comment never runs: "${shown}"`);
  }
}

const args = process.argv.slice(2), targets = args.length ? args : ['.'];
const rel = p => path.relative(process.cwd(), p) || p;
const files = []; let notFound = false;
for (const t of targets) {
  let st;
  try { st = statSync(t); } catch (e) {
    if (e.code === 'ENOENT') { console.error(`${t}: not found`); notFound = true; } else warns.push(`${t}: cannot read (${e.code}) — rerun`);
    continue;
  }
  if (st.isDirectory()) {
    const found = ['assets', 'src', path.join('style-frames', 'src')].flatMap(r => walk(path.join(t, r)));
    if (!found.length && !warns.length) console.error(`No scene files in ${t} (assets/, src/, style-frames/src/).`);
    files.push(...found);
  } else files.push(t);
}
for (const f of files) lint(f, rel(f));

console.log(`Scene lint: ${files.length} file(s)`);
for (const p of problems) console.log(`  PROBLEM  : ${p}`);
for (const w of warns) console.log(`  WARN     : ${w}`);
if (problems.length) console.log(`  Result   : ${problems.length} problem(s): move each comment to the true end of its line (patch with Edit, never sed -i)`);
else if (warns.length || notFound || !files.length) console.log('  Result   : not linted completely (see above)');
else console.log('  Result   : OK');
process.exit(problems.length ? 1 : warns.length || notFound || !files.length ? 2 : 0);
