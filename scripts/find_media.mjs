#!/usr/bin/env node
// Free licensed media search for music, sound effects, stills and 3D models: Openverse (audio, images), Wikimedia Commons
// (images), Poly Haven, Smithsonian Open Access 3D, NASA 3D Resources and Kenney (models) and the bundled /media-use SFX library. No key, no dependency
// (Node fetch). It downloads previews, prints one line per result, and --take copies one into the project and appends its
// ASSETS.json row (source, licence, author from the API) so scripts/check_assets.mjs passes without hand-written rows.
//
// Usage:
//   node find_media.mjs --type music|sfx|image --query "<1-2 English words>" --out review/<dir>
//        [--licence cc0,by] [--min-duration <s>] [--max-duration <s>] [--max 8] [--source openverse|commons]
//   node find_media.mjs --type model --query "<1-2 English words>" --out review/models [--max 8] [--source polyhaven|smithsonian|nasa|kenney]
//   node find_media.mjs --type sfx --bundled [--query "<words>"] [--media-use <sfx dir>] --out review/<dir>
//   node find_media.mjs --take review/<dir>/<file> --as assets/<path> [--project .]
//
// --type model: downloads .glb / .gltf (with the textures a .gltf names, kept at their relative paths) or .obj, prints the size
//   on disk, the triangle count, the stated real size (when the source states one) and the licence, and writes contact.jpg from
//   the sources' thumbnails (ffmpeg). The licence is READ from the source, never assumed: Poly Haven from its licence page (no
//   "CC0" there = the source is unreadable, WARN + rerun); Smithsonian from the item's Open Access record (access must say
//   "CC0": "Usage conditions apply" and every other value, or no exact record, drops the item and is counted; several scans or
//   several records sharing the title drop it too, counted apart). A missing unzip (Kenney) is a WARN that says so and that a
//   rerun will not fix it (exit 3 when nothing else was found); installing it is the user's call. --take of a
//   model also copies a .gltf's textures beside it, each with its own ASSETS.json row, and prints the kit.model line to use.
//   An included file with an unsafe path (absolute, "..", a backslash) skips its model: nothing is written outside --out.
//   NASA 3D Resources: the licence is the repo README's own statement ("free and without copyright" = public domain; no such
//   statement = unreadable, WARN + rerun); the file list is GitHub's tree API (60 requests/hour unauthenticated: a 403/429 is a WARN
//   + rerun). A NASA result prints the media-usage note: no NASA logo or insignia may imply endorsement.
//   Kenney (no API): the 3D listing pages are read, a pack is a hit by its name; its page must link the CC0 deed (else not listed,
//   counted); the pack's zip is downloaded to a temp folder and the matching .glb entries are read from it by name (unzip -p to
//   stdout, never extracted to disk; entries with an unsafe path are skipped), at most 3 packs per search.
//   Smithsonian reads Open Access with SI_API_KEY (default DEMO_KEY, api.data.gov's public demo key: no signup, rate-limited).
//
// --licence: comma list of cc0 (CC0 + public domain), by (CC BY), by-sa (CC BY-SA); default cc0,by. NC and ND results are
//   always dropped, and so is a result that needs a credit but names no author. Share-alike is opt-in (by-sa).
//   --bundled applies the same filters to the library's licence (from its CREDITS.md): an NC/ND or out-of-list CC licence, or a CC BY
//   (the library names no creator), lists nothing and says why (exit 1); a custom, non-CC library licence is listed as it is.
// Music is told from SFX by length, not by Openverse category: its CC0 music (Freesound) has category null, so a category
//   filter dropped all of it. --type music therefore defaults to --min-duration 20 (a result of unknown length is kept);
//   --min-duration works for any type, by hand. SFX keeps category=sound_effect.
// --query "a|b|c": one search per query, all at once, into <out>/<query slug>, printed as one block per query; exit 0 when
//   any query found something. Media sources (Openverse, Commons) are asked at once; each source has FIND_MEDIA_SOURCE_S
//   (default 45) seconds in all, past that it is a WARN + rerun.
// Exit: 0 results; 1 every source answered and nothing matched; 2 usage; 3 a source failed and nothing was found, or a local file
//   could not be made, copied or written (rerun).
// A source that fails is a WARN with "rerun", never "nothing matched" (an unreadable answer is not an empty one); neither is a local
// write error, which says nothing about whether media exist.
// 429/503 are retried after Retry-After, else with exponential backoff (FIND_MEDIA_BACKOFF_MS, default 1000), never a fixed sleep.
// Env (tests): OPENVERSE_API, COMMONS_API, MEDIA_USE_SFX, POLYHAVEN_API, POLYHAVEN_LICENSE_URL, SI_3D_API, SI_OA_API, NASA_RAW, NASA_TREE_API, KENNEY_SITE; SI_API_KEY.

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const UA = 'dalang-find-media (https://github.com/sandalkuilang/dalang)';
const OPENVERSE = (process.env.OPENVERSE_API || 'https://api.openverse.org/v1').replace(/\/$/, '');
const COMMONS = process.env.COMMONS_API || 'https://commons.wikimedia.org/w/api.php';
const POLYHAVEN = (process.env.POLYHAVEN_API || 'https://api.polyhaven.com').replace(/\/$/, '');
const POLYHAVEN_LICENSE = process.env.POLYHAVEN_LICENSE_URL || 'https://polyhaven.com/license';
const SI_3D = (process.env.SI_3D_API || 'https://3d-api.si.edu/api/v1.0').replace(/\/$/, '');
const SI_OA = (process.env.SI_OA_API || 'https://api.si.edu/openaccess/api/v1.0').replace(/\/$/, '');
const SI_KEY = process.env.SI_API_KEY || 'DEMO_KEY';
const NASA_RAW = (process.env.NASA_RAW || 'https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master').replace(/\/$/, '');
const NASA_TREE = process.env.NASA_TREE_API || 'https://api.github.com/repos/nasa/NASA-3D-Resources/git/trees/master?recursive=1';
const NASA_LANDING = 'https://github.com/nasa/NASA-3D-Resources/tree/master';
const KENNEY = (process.env.KENNEY_SITE || 'https://kenney.nl').replace(/\/$/, '');
const MODEL_SOURCES = ['polyhaven', 'smithsonian', 'nasa', 'kenney'];   // search order for --type model
const BACKOFF_MS = Number(process.env.FIND_MEDIA_BACKOFF_MS ?? 1000);
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac|aac)$/i;

const FLAGS = new Set(['bundled']);
const args = {};
{
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) usage(`unexpected argument "${a[i]}"`);
    const k = a[i].slice(2);
    if (FLAGS.has(k)) args[k] = true;
    else if (i + 1 >= a.length || a[i + 1].startsWith('--')) usage(`--${k} needs a value`);
    else args[k] = a[++i];
  }
}
function usage(msg) {
  console.error(`${msg}\nusage: find_media.mjs --type music|sfx|image --query "<q>" --out <dir> [--licence cc0,by] [--min-duration s] [--max-duration s] [--max 8] [--source openverse|commons]\n       find_media.mjs --type model --query "<q>" --out <dir> [--max 8] [--source polyhaven|smithsonian|nasa|kenney]\n       find_media.mjs --type sfx --bundled [--query "<q>"] [--media-use <dir>] --out <dir>\n       find_media.mjs --take <file> --as assets/<path> [--project .]`);
  process.exit(2);
}

// A local file error (mkdir, copy, write) is not "nothing matched" (exit 1): WARN, rerun, exit 3. Anything else that throws
// unexpectedly gets the same answer, never node's own exit 1.
function localFail(what, e) {
  console.log(`WARN: ${what} failed (${e?.code || e?.message || e}) — fix the path or its permissions, then rerun`);
  process.exit(3);
}
const local = (what, fn) => { try { return fn(); } catch (e) { return localFail(what, e); } };
process.on('uncaughtException', e => localFail('unexpected error', e));

const sleep = ms => new Promise(r => setTimeout(r, ms));
// GET with backoff: 429/503 wait Retry-After (cap 30 s) else base * 2^try; anything else non-2xx, or a network error, throws.
async function get(url, { timeout = 20000 } = {}) {
  for (let i = 0; ; i++) {
    let res;
    try { res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(timeout) }); }
    catch (e) { throw new Error(e?.cause?.code || e?.name || String(e)); }
    if (res.ok) return res;
    if ((res.status === 429 || res.status === 503) && i < 3) {
      const ra = Number(res.headers.get('retry-after'));
      const ms = Number.isFinite(ra) && res.headers.get('retry-after') !== null ? Math.min(ra, 30) * 1000 : BACKOFF_MS * 2 ** i;
      console.error(`backing off ${ms / 1000} s (${res.status})`);
      await sleep(ms);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
}
const getJSON = async url => { const r = await get(url); try { return await r.json(); } catch { throw new Error('answer is not JSON'); } };

// ── licences ─────────────────────────────────────────────────────────────────
const LIC_SETS = { cc0: /^(CC0|PD)$/, by: /^CC-BY(-[\d.]+)?$/, 'by-sa': /^CC-BY-SA(-[\d.]+)?$/ };
const wanted = (args.licence ?? 'cc0,by').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
for (const w of wanted) if (!LIC_SETS[w]) usage(`--licence "${w}" is not one of cc0, by, by-sa`);
const licenceOk = l => !!l && wanted.some(w => LIC_SETS[w].test(l));
const needsCredit = l => !/^(CC0|PD)$/.test(l);
const ovLicenceParam = wanted.flatMap(w => ({ cc0: ['cc0', 'pdm'], by: ['by'], 'by-sa': ['by-sa'] })[w]).join(',');
const normOpenverse = (lic, ver) => {
  const v = ver ? `-${ver}` : '';
  switch (String(lic || '').toLowerCase()) { case 'cc0': return 'CC0'; case 'pdm': return 'PD'; case 'by': return `CC-BY${v}`; case 'by-sa': return `CC-BY-SA${v}`; default: return null; }
};
const normCommons = name => {
  const s = String(name || '').trim();
  let m;
  if (/^CC0\b/i.test(s)) return 'CC0';
  if (/^(public domain|PD\b)/i.test(s)) return 'PD';
  if ((m = s.match(/^CC[ -]BY[ -]SA[ -]([\d.]+)/i))) return `CC-BY-SA-${m[1]}`;
  if ((m = s.match(/^CC[ -]BY[ -]([\d.]+)/i))) return `CC-BY-${m[1]}`;
  return null; // NC, ND, GFDL, "attribution"-only and anything unknown: never guessed
};

// ── helpers ──────────────────────────────────────────────────────────────────
const stripHtml = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'item';
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/tiff': 'tif', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav' };
// jpeg is jpg; a provider's "mp32" (Jamendo) and any other mp3* variant is plain mp3.
const normExt = e => (e === 'jpeg' ? 'jpg' : /^mp3/.test(e) ? 'mp3' : e);
const extOf = (filetype, url, mime, type) => {
  const f = String(filetype || '').toLowerCase().replace(/^\./, '');
  if (/^[a-z0-9]{2,5}$/.test(f)) return normExt(f);
  const u = path.extname(new URL(url, 'http://x').pathname).slice(1).toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(u)) return normExt(u);
  return MIME_EXT[mime] || (type === 'image' ? 'jpg' : 'mp3');
};
const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));

// A model's included file (a texture) comes from a remote answer: a relative path that stays inside the folder it is written to.
function safeRel(rel) {
  if (typeof rel !== 'string' || !rel || rel.includes('\\') || rel.includes('\0') || path.posix.isAbsolute(rel)) return false;
  const n = path.posix.normalize(rel);
  return n !== '..' && !n.startsWith('../') && !n.split('/').includes('..') && n !== '.';
}
// An included file is texture or buffer data: a remote answer naming a script or any other kind is refused, so a take cannot drop code beside the model.
const dataRel = rel => safeRel(rel) && /\.(jpe?g|png|webp|bin|ktx2|mtl)$/i.test(rel);
// Triangles and (file-unit) bounding box from the file itself: glTF/GLB per primitive (indices count, else POSITION count; Draco keeps
// the accessor counts), OBJ per face. A file it cannot read is null (printed "?"), never 0.
function gltfJSON(buf, ext) {
  if (ext === 'glb') {
    if (buf.toString('latin1', 0, 4) !== 'glTF') return null;
    const n = buf.readUInt32LE(12);
    return JSON.parse(buf.toString('utf8', 20, 20 + n));
  }
  return JSON.parse(buf.toString('utf8'));
}
function modelStats(buf, ext) {
  try {
    if (ext === 'obj') {
      let t = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const l of buf.toString('utf8').split('\n')) {
        const p = l.trim().split(/\s+/);
        if (p[0] === 'f') t += Math.max(0, p.length - 3);
        else if (p[0] === 'v') for (let i = 0; i < 3; i++) { const v = Number(p[i + 1]); lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }
      }
      return { triangles: t, bbox: lo.every(Number.isFinite) ? hi.map((h, i) => +(h - lo[i]).toFixed(4)) : null };
    }
    const j = gltfJSON(buf, ext), A = j?.accessors ?? [];
    let t = 0, lo = null, hi = null;
    for (const m of j?.meshes ?? []) for (const p of m.primitives ?? []) {
      if ((p.mode ?? 4) !== 4) continue;
      t += Math.floor((A[p.indices]?.count ?? A[p.attributes?.POSITION]?.count ?? 0) / 3);
      const P = A[p.attributes?.POSITION];
      if (P?.min && P?.max) { lo = lo ? lo.map((v, i) => Math.min(v, P.min[i])) : [...P.min]; hi = hi ? hi.map((v, i) => Math.max(v, P.max[i])) : [...P.max]; }
    }
    return { triangles: j ? t : null, bbox: lo ? hi.map((h, i) => +(h - lo[i]).toFixed(4)) : null };
  } catch { return { triangles: null, bbox: null }; }
}

// ── take ─────────────────────────────────────────────────────────────────────
if (args.take !== undefined) {
  if (!args.as) usage('--take needs --as assets/<path>');
  const as = path.posix.normalize(String(args.as).replace(/\\/g, '/'));
  if (!as.startsWith('assets/') || as.split('/').includes('..') || as.endsWith('/')) { console.error(`--as "${args.as}" must be a file path under assets/ inside the project (no "..", no trailing "/")`); process.exit(2); }
  const proj = path.resolve(args.project ?? '.');
  const src = path.resolve(args.take);
  const resultsFile = path.join(path.dirname(src), 'results.json');
  let results = [];
  try { results = readJSON(resultsFile); } catch { /* handled below */ }
  const hit = Array.isArray(results) ? results.find(r => r.file === path.basename(src)) : null;
  if (!hit || !existsSync(src)) { console.error(`${args.take}: not a find_media result (no results.json row beside it for "${path.basename(src)}") — take a file this script downloaded`); process.exit(2); }
  const manifest = path.join(proj, 'ASSETS.json');
  let rows = [];
  if (existsSync(manifest)) {
    try { rows = readJSON(manifest); } catch { rows = null; }
    if (!Array.isArray(rows)) { console.error(`${manifest} is not a JSON list — fix it first`); process.exit(2); }
  }
  const dest = path.join(proj, as);
  // A model: the extension stays (kit.model reads it), and the textures a .gltf names are copied beside it. Checked before any copy.
  const isModel = hit.kind === 'model';
  const incs = isModel && Array.isArray(hit.includes) ? hit.includes : [];
  if (isModel) {
    if (path.extname(as).toLowerCase() !== path.extname(src).toLowerCase()) { console.error(`--as "${args.as}" must keep the file's extension (${path.extname(src)}): keep the .gltf/.glb/.obj extension`); process.exit(2); }
    for (const rel of incs) {
      if (!dataRel(rel)) { console.error(`${resultsFile}: an included file has an unsafe path or is not texture data ("${rel}") — take refused`); process.exit(2); }
      const to = path.join(path.dirname(dest), rel);
      if (existsSync(to) && !readFileSync(to).equals(readFileSync(path.join(path.dirname(src), rel)))) { console.error(`${args.take}: its included file "${rel}" would replace a different file already at ${to} — take refused (pick another --as folder)`); process.exit(2); }
      if (!existsSync(path.join(path.dirname(src), rel))) { console.error(`${args.take}: its included file "${rel}" is missing beside it — re-download it (rerun the search), then take`); process.exit(2); }
    }
  }
  local(`copying to ${dest}`, () => {
    mkdirSync(path.dirname(dest), { recursive: true }); copyFileSync(src, dest);
    for (const rel of incs) { const d = path.join(path.dirname(dest), rel); mkdirSync(path.dirname(d), { recursive: true }); copyFileSync(path.join(path.dirname(src), rel), d); }
  });
  const who = { source: hit.landing || hit.url, licence: hit.licence, ...(hit.author ? { author: hit.author } : {}) };
  const newRows = [{ file: as, ...who, title: hit.title }, ...incs.map(rel => ({ file: path.posix.join(path.posix.dirname(as), rel), ...who, title: `${hit.title} (texture)` }))];
  rows = rows.filter(r => !newRows.some(n => path.normalize(r.file || '') === path.normalize(n.file)));
  rows.push(...newRows);
  local(`writing ${manifest}`, () => writeFileSync(manifest, JSON.stringify(rows, null, 2) + '\n'));
  console.log(`taken: ${as}\n  ASSETS.json row${newRows.length > 1 ? 's' : ''}: ${newRows.map(r => JSON.stringify(r)).join('\n    ')}\n  next: node <skill-dir>/scripts/check_assets.mjs ${args.project ?? '.'}`);
  if (isModel) {
    const s = hit.size;
    console.log(`  in the build: kit.model("${as}", { palette, kinds${s ? `, real: { h: ${s.h}, w: ${s.w}, d: ${s.d} }` : ''} })`);
    if (!s) console.log('  no stated size: declare real from the source\'s spec or a measured reference, or scaleAudit lists it unchecked');
  }
  process.exit(0);
}

// ── search ───────────────────────────────────────────────────────────────────
const type = args.type;
if (!['music', 'sfx', 'image', 'model'].includes(type)) usage('--type must be music, sfx, image or model');
if (!args.out) usage('--out <dir> is required');
if (!args.bundled && !args.query) usage('--query "<English words>" is required');
if (args.bundled && type !== 'sfx') usage('--bundled is for --type sfx');
// --query "a|b|c": one search per query, all at once, each into <out>/<query slug>; exit 0 when any found something.
if (!args.bundled && args.query.includes('|')) {
  const qs = [...new Set(args.query.split('|').map(q => q.trim()).filter(Boolean))];
  const rest = process.argv.slice(2).filter((v, i, a) => v !== '--query' && a[i - 1] !== '--query' && v !== '--out' && a[i - 1] !== '--out');
  const { spawn } = await import('node:child_process');
  const runs = await Promise.all(qs.map(q => new Promise(done => {
    const p = spawn(process.execPath, [process.argv[1], ...rest, '--query', q, '--out', path.join(args.out, slug(q))]);
    let text = ''; p.stdout.on('data', d => { text += d; }); p.stderr.on('data', d => { text += d; });
    p.on('close', code => done({ q, code, text }));
  })));
  for (const r of runs) console.log(`── "${r.q}" (exit ${r.code})\n${r.text.trimEnd()}`);
  process.exit(runs.some(r => r.code === 0) ? 0 : Math.max(...runs.map(r => r.code ?? 3)));
}
const query = args.query ?? '';
const out = path.resolve(args.out);
const max = Math.max(1, Number(args.max ?? 8) || 8);
const maxDur = args['max-duration'] !== undefined ? Number(args['max-duration']) : null;
if (maxDur !== null && !(maxDur > 0)) usage('--max-duration must be a number of seconds');
const DEFAULT_MIN_MUSIC = 20;
const minDurGiven = args['min-duration'] !== undefined;
const minDur = minDurGiven ? Number(args['min-duration']) : type === 'music' && (maxDur === null || maxDur >= DEFAULT_MIN_MUSIC) ? DEFAULT_MIN_MUSIC : null;   // the default never clashes with a --max-duration the user gave
if (minDurGiven && !(minDur > 0)) usage('--min-duration must be a number of seconds');
if (minDur !== null && maxDur !== null && minDur > maxDur) usage('--min-duration is longer than --max-duration');
const hint = `take one: node <skill-dir>/scripts/find_media.mjs --take ${path.join(args.out, '<file>')} --as assets/${type === 'model' ? 'models/<name>.<glb|gltf|obj>' : '<path>'}`;
const warnsOut = [];   // notes a source adds while it answers (NASA's truncated list)
let kenneyDropped = 0;   // Kenney packs whose page does not link the CC0 deed: counted, never listed
let siDropped = 0;   // Smithsonian items whose Open Access record is not CC0 (or was not found): counted, never listed
let siAmbiguous = 0;   // Smithsonian items whose title does not name ONE record (or one scan): the licence cannot be joined, counted, never listed
let siUnknown = 0;   // Smithsonian items whose Open Access answer states no full count: uniqueness unreadable, a WARN to rerun, never listed
const toolWarns = new Set();   // WARNs for a missing local tool: rerunning cannot fix them, so they never count as "a source did not answer"

// contact.jpg from the models' thumbnails: ffmpeg, no shell. Tiles are normalised to 256 px squares first.
function contactSheet(rows) {
  const thumbs = rows.filter(r => r.thumb);
  if (!thumbs.length) return;
  const ff = (a) => spawnSync('ffmpeg', ['-y', '-v', 'error', ...a], { timeout: 60000 });
  const bad = r => r.error ? (r.error.code === 'ENOENT' ? 'ENOENT' : r.error.code || r.error.message) : r.status !== 0 ? `exit ${r.status}${r.stderr?.length ? `: ${String(r.stderr).trim().split('\n').pop()}` : ''}` : null;
  let n = 0;
  for (const r of thumbs) {
    n++;
    const res = ff(['-i', path.join(out, r.thumb), '-vf', 'scale=256:256:force_original_aspect_ratio=decrease,pad=256:256:(ow-iw)/2:(oh-ih)/2:white', '-frames:v', '1', '-q:v', '3', path.join(out, 'thumbs', `tile-${String(n).padStart(2, '0')}.jpg`)]);
    const b = bad(res);
    if (b === 'ENOENT') { console.log(`no contact sheet: ffmpeg not found (thumbnails in ${path.join(args.out, 'thumbs')})`); return; }
    if (b) { n--; console.log(`WARN: thumbnail ${r.thumb} could not be read by ffmpeg (${b}) — left out of the contact sheet`); }
  }
  if (!n) return;
  const res = ff(['-start_number', '1', '-i', path.join(out, 'thumbs', 'tile-%02d.jpg'), '-vf', `tile=4x${Math.ceil(n / 4)}:padding=4:margin=4:color=white`, '-frames:v', '1', '-q:v', '3', path.join(out, 'contact.jpg')]);
  const b = bad(res);
  if (b === 'ENOENT') console.log(`no contact sheet: ffmpeg not found (thumbnails in ${path.join(args.out, 'thumbs')})`);
  else if (b) console.log(`WARN: contact sheet failed (${b}) — rerun`);
  else console.log(`contact sheet: ${path.join(args.out, 'contact.jpg')}`);
}

function finish(results, warns) {
  for (const w of warns) console.log(`WARN: ${w}`);
  if (kenneyDropped) console.log(`${kenneyDropped} Kenney pack(s) dropped: licence not CC0 or not readable`);
  if (siDropped) console.log(`${siDropped} Smithsonian item(s) dropped: licence not CC0 or not readable`);
  if (siAmbiguous) console.log(`${siAmbiguous} Smithsonian item(s) dropped: several records or scans share a title (or too many to check), so the licence cannot be matched to the scan`);
  if (!results.length) {
    if (warns.some(w => !toolWarns.has(w))) { console.log('Nothing was found, and a source did not answer — that is not "no results". Rerun in a minute.'); process.exit(3); }
    if (warns.length) { console.log('Nothing was found, and a source cannot run on this machine (a tool is missing) — that is not "no results", and rerunning will not change it. Use another source.'); process.exit(3); }
    console.log(`nothing matched "${query}" — try other English words (1-2 words work best)${args.licence ? '' : ', or widen --licence'}${minDur !== null && !minDurGiven ? ` (music is kept at ${minDur} s or longer: --min-duration <s> to change)` : ''}`);
    process.exit(1);
  }
  local(`writing ${path.join(out, 'results.json')}`, () => writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n'));
  for (const r of results) {
    if (r.kind === 'model') {
      const sz = r.size ? `${r.size.w}×${r.size.h}×${r.size.d} m (stated)` : 'unchecked (no stated size)';
      const bb = r.bbox ? ` · bbox≈${r.bbox.join('×')} (file units, approx)` : '';
      console.log(`${r.file} · ${r.title} · ${r.licence} · ${r.author || '-'} · ${r.bytes >= 1e5 ? `${(r.bytes / 1e6).toFixed(1)} MB` : `${Math.ceil(r.bytes / 1e3)} KB`} · ${r.triangles ?? '?'} tris · size ${sz}${bb}${r.draco ? ' · Draco' : ''} · ${r.landing || r.url}`);
    } else console.log(`${r.file} · ${r.title} · ${r.licence} · ${r.author || '-'} · ${r.duration != null ? `${r.duration} s` : '-'} · ${r.landing || r.url}`);
  }
  if (type === 'model') contactSheet(results);
  if (results.some(r => r.provider === 'nasa')) console.log('NASA: no NASA logo or insignia may imply endorsement (NASA media usage guidelines)');
  console.log(hint);
  process.exit(0);
}

// Bundled /media-use SFX library: the licence is read from the library's own CREDITS.md, never assumed.
function bundled() {
  const home = os.homedir();
  const npx = path.join(home, '.npm', '_npx');
  const guesses = args['media-use'] ? [args['media-use']] : process.env.MEDIA_USE_SFX ? [process.env.MEDIA_USE_SFX] : [
    path.join(home, '.claude', 'skills', 'media-use', 'audio', 'assets', 'sfx'),
    ...(existsSync(npx) ? readdirSync(npx).map(d => path.join(npx, d, 'node_modules', 'hyperframes', 'dist', 'skills', 'media-use', 'audio', 'assets', 'sfx')) : []),
  ];
  const lib = guesses.find(d => existsSync(d));
  const warn = why => finish([], [`bundled /media-use SFX: ${why} — pass --media-use <sfx dir>; rerun`]);
  if (!lib) return warn('library folder not found');
  let credits = '';
  try { credits = readFileSync(path.join(lib, 'CREDITS.md'), 'utf8'); } catch { /* handled below */ }
  const m = credits.match(/\bunder the \[([^\]]+)\]\(([^)]+)\)/);
  if (!m) return warn(`${lib}: no licence readable in its CREDITS.md`);
  const [, licence, source] = m;
  // The same licence filters as the search path: NC/ND never, CC only inside --licence, CC BY needs a creator (the library names none).
  const refusal = bundledRefusal(licence);
  if (refusal) {
    console.log(`bundled /media-use SFX are under "${licence}" — refused: ${refusal}. Use another source (Openverse CC0: --type sfx --licence cc0).`);
    process.exit(1);
  }
  let meta = {};
  try { meta = readJSON(path.join(lib, 'manifest.json')); } catch { /* optional */ }
  const entries = Array.isArray(meta) ? meta : Object.values(meta);
  const byFile = new Map(entries.filter(e => e?.file).map(e => [e.file, e]));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const found = readdirSync(lib).filter(f => AUDIO_EXT.test(f)).sort().map(f => {
    const e = byFile.get(f) ?? {}, name = path.parse(f).name, hay = `${name} ${e.description ?? ''}`.toLowerCase();
    return { f, e, name, score: words.length ? words.filter(w => hay.includes(w)).length : 1 };
  }).filter(x => x.score > 0 && (maxDur === null || x.e.duration == null || x.e.duration <= maxDur) && (!minDurGiven || x.e.duration == null || x.e.duration >= minDur)).sort((a, b) => b.score - a.score).slice(0, max);
  local(`making ${out}`, () => mkdirSync(out, { recursive: true }));
  finish(found.map(x => {
    local(`copying ${x.f} to ${out}`, () => copyFileSync(path.join(lib, x.f), path.join(out, x.f)));
    return { file: x.f, title: x.name, licence, author: '', duration: x.e.duration ?? null, landing: source, url: path.join(lib, x.f), provider: 'bundled /media-use', query };
  }), []);
}

function bundledRefusal(lic) {
  if (/\b(NC|ND)\b|non-?commercial|no-?deriv/i.test(lic)) return 'NC and ND licences are never used';
  const n = normCommons(lic);
  if (n) return !licenceOk(n) ? `outside --licence ${wanted.join(',')}` : needsCredit(n) ? 'a credit is required and the library names no creator' : null;
  if (/\bCC\b|creative commons|attribution|share-?alike/i.test(lic)) return 'a Creative Commons licence this search cannot read exactly';
  return null; // a custom library licence (not Creative Commons): listed as it is, check_assets.mjs decides
}

async function openverse(page = 1) {
  const kind = type === 'image' ? 'images' : 'audio';
  const p = new URLSearchParams({ q: query, license: ovLicenceParam, page_size: '20' });
  // Music is NOT filtered by category: Freesound CC0 tracks carry category null, so category=music returned none of them.
  // Music is kept apart from SFX by duration in the candidate loop instead.
  if (type === 'sfx') p.set('category', 'sound_effect');
  if (page > 1) p.set('page', String(page));
  const j = await getJSON(`${OPENVERSE}/${kind}/?${p}`);
  if (!Array.isArray(j?.results)) throw new Error('answer has no results list');
  return j.results.map(r => ({
    title: stripHtml(r.title) || 'untitled', licence: normOpenverse(r.license, r.license_version), author: stripHtml(r.creator),
    duration: typeof r.duration === 'number' ? Math.round(r.duration / 100) / 10 : null, landing: r.foreign_landing_url || '', url: r.url,
    ext: extOf(r.filetype, r.url || '', '', type), provider: r.provider || 'openverse',
  }));
}

async function commons() {
  const p = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${query} filetype:bitmap`, gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|extmetadata|mime', iiurlwidth: '1920' });
  const j = await getJSON(`${COMMONS}?${p}`);
  // A search that matches nothing is {"batchcomplete":""} (formatversion 1) or {"batchcomplete":true}: no query block, and an answer.
  // Only a reply that is no MediaWiki query reply at all (an error object, {}, a list, null) is an outage.
  if (!j || typeof j !== 'object' || Array.isArray(j) || !('query' in j || 'batchcomplete' in j || 'continue' in j)) throw new Error('answer is not a search reply');
  const pages = Object.values(j?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return pages.map(pg => {
    const ii = pg.imageinfo?.[0] ?? {}, x = ii.extmetadata ?? {};
    const url = ii.thumburl || ii.url;
    return {
      title: String(pg.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]{2,5}$/i, '') || 'untitled', licence: normCommons(x.LicenseShortName?.value),
      author: stripHtml(x.Artist?.value), duration: null, landing: ii.descriptionurl || '', url, ext: url ? extOf('', url, ii.mime, 'image') : 'jpg', provider: 'commons',
    };
  });
}

// Poly Haven (all assets CC0): the licence is read from its licence page. No "CC0" there = the page changed or did not load
// right: the source is unreadable (WARN + rerun), never listed under a guessed licence. Dimensions are millimetres, Blender axes
// [x, y, z] = [width, depth, height].
async function polyhaven() {
  const page = await (await get(POLYHAVEN_LICENSE)).text();
  if (!/\bCC0\b/.test(page)) throw new Error('its licence page names no CC0');
  const j = await getJSON(`${POLYHAVEN}/assets?type=models`);
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('answer is not an asset list');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = Object.entries(j).map(([id, a]) => {
    const hay = `${id} ${a?.name ?? ''} ${[].concat(a?.tags ?? [], a?.categories ?? []).join(' ')}`.toLowerCase().replace(/[_-]/g, ' ');
    return { id, a: a ?? {}, score: words.filter(w => hay.includes(w)).length };
  }).filter(x => x.score > 0).sort((x, y) => y.score - x.score).slice(0, max);
  const rank = k => parseFloat(k) * (/k$/i.test(k) ? 1000 : 1);
  const found = [];
  for (const { id, a } of hits) {
    const f = await getJSON(`${POLYHAVEN}/files/${encodeURIComponent(id)}`);
    const keys = Object.keys(f?.gltf ?? {}).filter(k => f.gltf[k]?.gltf?.url).sort((x, y) => rank(x) - rank(y));
    const g = f?.gltf?.[keys.includes('1k') ? '1k' : keys[0]]?.gltf;
    if (!g) continue;
    const d = Array.isArray(a.dimensions) && a.dimensions.length === 3 && a.dimensions.every(v => Number.isFinite(v) && v > 0) ? a.dimensions : null;
    const r = v => Math.round(v) / 1000;
    found.push({
      title: stripHtml(a.name) || id, licence: 'CC0', author: Object.keys(a.authors ?? {}).join(', '), duration: null,
      landing: `https://polyhaven.com/a/${id}`, url: g.url, ext: 'gltf', provider: 'polyhaven', thumb: a.thumbnail_url || null,
      includes: Object.entries(g.include ?? {}).map(([rel, v]) => ({ rel, url: v?.url })), size: d ? { w: r(d[0]), d: r(d[1]), h: r(d[2]) } : null,
    });
  }
  return found;
}

// The ONE place a licence record is joined to an item by a key that is not unique (a title). It returns the record only when the
// join is proven one-to-one: ONE item with that key on our side, ONE record with it in the answer, and an answer that states its
// full match count as a whole number equal to the rows it sent (so no record with the same key lies past the window). Anything
// else is a verdict, never a record: 'ambiguous' (several items or records share the key, or the count says the window is short),
// 'unknown' (no count, or one that is not a whole number or is below the rows sent: completeness cannot be read, so rerun),
// 'none' (a complete answer with no record of that key). A record is never picked by position: order never decides a licence.
function joinOneToOne({ itemsWithKey, answer, key, keyOf }) {
  if (itemsWithKey !== 1) return { verdict: 'ambiguous' };
  const rows = answer?.rows;
  if (!Array.isArray(rows)) throw new Error('licence answer has no rows list');
  const same = rows.filter(x => keyOf(x) === key);
  if (same.length > 1) return { verdict: 'ambiguous' };
  const count = answer.rowCount;
  if (!Number.isSafeInteger(count) || count < rows.length) return { verdict: 'unknown' };
  if (count > rows.length) return { verdict: 'ambiguous' };
  return same.length === 1 ? { verdict: 'one', rec: same[0] } : { verdict: 'none' };
}

// Smithsonian Open Access 3D: the 3D API carries no licence, so each item's licence comes from its Open Access record, matched by
// exact title through joinOneToOne (a CC0 record of another object could otherwise license a scan whose own record says "Usage
// conditions apply"): several scans or records with one title, or a window too short, drop the item (siAmbiguous); an answer that
// states no full count drops it as unknown, a WARN to rerun (siUnknown). Only access "CC0" counts; "Usage conditions apply", any
// other value or no exact record drops the item (counted). Each lookup uses the (rate-limited) api.data.gov key, so at most 20
// items are checked per search.
async function smithsonian() {
  const j = await getJSON(`${SI_3D}/content/file/search?${new URLSearchParams({ q: query, file_type: 'glb', rows: '50' })}`);
  if (!Array.isArray(j?.rows)) throw new Error('answer has no rows list');
  const groups = new Map();
  for (const r of j.rows) {
    const c = r?.content;
    if (!c?.uri || (c.file_type && String(c.file_type).toLowerCase() !== 'glb')) continue;
    const key = c.model_url || c.uri;
    if (!groups.has(key)) groups.set(key, { title: stripHtml(r.title), files: {} });
    if (!groups.get(key).files[c.quality]) groups.get(key).files[c.quality] = c;
  }
  const scansByTitle = new Map();
  for (const g of groups.values()) scansByTitle.set(g.title, (scansByTitle.get(g.title) ?? 0) + 1);
  const found = [];
  let checked = 0;
  for (const [key, g] of groups) {
    const file = g.files.Medium ?? g.files.Low ?? g.files.High;
    if (!file || !g.title) continue;
    if (checked++ >= 20 || found.length >= max) break;
    const itemsWithKey = scansByTitle.get(g.title);
    const o = itemsWithKey === 1 ? await getJSON(`${SI_OA}/search?${new URLSearchParams({ q: `"${g.title.replace(/"/g, '')}"`, rows: '100', api_key: SI_KEY })}`) : null;
    const { verdict, rec } = joinOneToOne({ itemsWithKey, answer: o?.response, key: g.title, keyOf: x => x?.title ?? x?.content?.descriptiveNonRepeating?.title?.content });
    if (verdict === 'ambiguous') { siAmbiguous++; continue; }
    if (verdict === 'unknown') { siUnknown++; continue; }
    const d = rec?.content?.descriptiveNonRepeating;
    if (d?.metadata_usage?.access !== 'CC0') { siDropped++; continue; }
    const media = (d.online_media?.media ?? []).find(m => typeof m?.thumbnail === 'string');
    found.push({
      title: g.title, licence: 'CC0', author: rec.content?.freetext?.dataSource?.[0]?.content || d.unit_code || 'Smithsonian Institution', duration: null,
      landing: d.record_link || d.guid || (/^https?:/.test(key) ? key : file.uri), url: file.uri, ext: 'glb', provider: 'smithsonian',
      thumb: media?.thumbnail ?? null, includes: [], size: null, draco: !!file.draco_compressed,
    });
  }
  if (siUnknown) warnsOut.push(`Smithsonian Open Access stated no full result count for ${siUnknown} item(s), so their title could not be proven to name one record and their licence was not joined — rerun`);
  return found;
}

// NASA 3D Resources: the licence is the repo README's statement, read each run. The catalogue's meta.json names a code licence
// (NOSA) that is not the models' release, so it is not used. Models are .glb (preferred) or .obj under "3D Models/<folder>/";
// the folder name is the title, a .jpg/.png beside them is the thumbnail.
async function nasa() {
  const readme = await (await get(`${NASA_RAW}/README.md`)).text();
  if (!/free and without copyright/i.test(readme)) throw new Error('its README states no public-domain release');
  const j = await getJSON(NASA_TREE);
  if (!Array.isArray(j?.tree)) throw new Error('answer has no file tree');
  if (j.truncated) warnsOut.push('NASA list truncated — some models not searched');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const folders = new Map();
  for (const t of j.tree) {
    if (t?.type !== 'blob' || typeof t.path !== 'string' || !t.path.startsWith('3D Models/') || !safeRel(t.path) || t.path.split('/').some(seg => seg === '..' || seg === '.')) continue;   // safeRel normalises: "3D Models/../x" would pass, and the URL would leave "3D Models/"
    const dir = path.posix.dirname(t.path), ext = path.posix.extname(t.path).slice(1).toLowerCase();
    if (!folders.has(dir)) folders.set(dir, { glb: null, obj: null, img: null });
    const f = folders.get(dir);
    if (ext === 'glb' || ext === 'obj') f[ext] ??= t.path;
    else if (ext === 'jpg' || ext === 'png') f.img ??= t.path;
  }
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  return [...folders].map(([dir, f]) => {
    const file = f.glb ?? f.obj;
    const hay = (dir + ' ' + (file ?? '')).toLowerCase().replace(/[_-]/g, ' ');
    return { dir, f, file, score: words.filter(w => hay.includes(w)).length };
  }).filter(x => x.file && x.score > 0).sort((x, y) => y.score - x.score).slice(0, max).map(({ dir, f, file }) => ({
    title: dir.split('/').pop(), licence: 'PD', author: 'NASA', duration: null, landing: `${NASA_LANDING}/${enc(dir)}`,
    url: `${NASA_RAW}/${enc(file)}`, ext: path.posix.extname(file).slice(1).toLowerCase(), provider: 'nasa',
    thumb: f.img ? `${NASA_RAW}/${enc(f.img)}` : null, includes: [], size: null }));
}

// Kenney (kenney.nl, no API): the 3D listing pages name the packs; a pack's own page must link the CC0 deed. The pack's zip is
// downloaded to a temp folder; the .glb entries that match the query by name (else the first few) are read with `unzip -p` (to
// stdout: nothing is extracted, so an entry name cannot place a file), the zip is deleted. At most 3 packs per search.
const unzipArg = e => e.replace(/[\\*?[\]]/g, '\\$&');
function unzip(args, what) {
  const r = spawnSync('unzip', args, { maxBuffer: 512 * 1024 * 1024, timeout: 120000 });
  if (r.error?.code === 'ENOENT') throw Object.assign(new Error('unzip is not on PATH'), { missingTool: 'unzip' });
  if (r.error || r.status !== 0) throw new Error(`${what} failed (${r.error?.code || `exit ${r.status}`})`);
  return r.stdout;
}
async function kenney() {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const packs = new Map();
  const scan = html => { for (const m of html.matchAll(/<a href=['"][^'"]*?\/assets\/([a-z0-9][a-z0-9-]*)['"][^>]*>([^<]+)<\/a>/gi)) if (!packs.has(m[1])) packs.set(m[1], stripHtml(m[2])); };
  const first = await (await get(`${KENNEY}/assets/category:3D`)).text();
  scan(first);
  const last = Math.min(6, Math.max(1, ...[...first.matchAll(/category:3D\/page:(\d+)/g)].map(m => Number(m[1]))));
  for (let p = 2; p <= last; p++) scan(await (await get(`${KENNEY}/assets/category:3D/page:${p}`)).text());
  if (!packs.size) throw new Error('the 3D listing names no pack (page layout changed?)');
  const hits = [...packs].map(([slug, title]) => ({ slug, title, score: words.filter(w => `${slug} ${title}`.toLowerCase().replace(/-/g, ' ').includes(w)).length }))
    .filter(x => x.score > 0).sort((x, y) => y.score - x.score).slice(0, 3);
  const found = [], tmp = mkdtempSync(path.join(os.tmpdir(), 'dalang-kenney-'));
  try {
    for (const h of hits) {
      const url = `${KENNEY}/assets/${h.slug}`;
      const page = await (await get(url)).text();
      if (!/creativecommons\.org\/publicdomain\/zero\/1\.0/i.test(page)) { kenneyDropped++; continue; }
      const z = page.match(/['"]([^'"\s]*\/media\/pages\/assets\/[^'"\s]+\.zip)['"]/i);
      if (!z) throw new Error(`${h.slug}: its page links no zip`);
      const thumb = page.match(/og:image['"]\s+content=['"]([^'"]+)['"]/i)?.[1] ?? null;
      const zipFile = path.join(tmp, `${h.slug}.zip`);
      const bytes = Buffer.from(await (await get(new URL(z[1], url).href, { timeout: 300000 })).arrayBuffer());
      writeFileSync(zipFile, bytes);
      console.log(`Kenney: ${h.title} pack is ${(bytes.length / 1e6).toFixed(1)} MB (read in a temp folder, deleted after)`);
      const entries = unzip(['-Z1', zipFile], 'listing the zip').toString('utf8').split('\n').map(s => s.replace(/\r$/, '')).filter(e => /\.glb$/i.test(e) && safeRel(e));
      const named = entries.filter(e => words.some(w => path.posix.basename(e).toLowerCase().includes(w)));
      for (const e of (named.length ? named : entries).slice(0, named.length ? max : Math.min(max, 4))) {
        const buf = unzip(['-p', zipFile, unzipArg(e)], `reading ${e}`);
        const base = path.posix.basename(e, path.posix.extname(e));
        found.push({ title: `${h.title}: ${base}`, licence: 'CC0', author: 'Kenney (kenney.nl)', duration: null, landing: url, url: `${url}#${e}`, ext: 'glb',
          provider: 'kenney', thumb, includes: [], size: null, data: buf });
      }
      rmSync(zipFile, { force: true });
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  return found;
}

// Downloads one model candidate into out: the file, the texture files a .gltf names (each at its relative path), the thumbnail.
// An unsafe included path skips the model before anything is written. Returns the results row, or null with a WARN.
async function downloadModel(c, n, warns) {
  const bad = c.includes.find(i => !dataRel(i.rel) || !i.url);
  if (bad) { warns.push(`"${c.title}": an included file has an unsafe path ("${bad.rel}") — skipped`); return null; }
  const file = `${String(n).padStart(2, '0')}-${slug(c.title)}.${c.ext}`;
  const written = [];
  try {
    const buf = c.data ?? Buffer.from(await (await get(c.url, { timeout: 120000 })).arrayBuffer());
    writeFileSync(path.join(out, file), buf); written.push(file);
    let bytes = buf.length;
    for (const i of c.includes) {
      const dest = path.resolve(out, i.rel);
      if (!dest.startsWith(out + path.sep)) throw new Error(`"${i.rel}" leaves the output folder`);
      const b = Buffer.from(await (await get(i.url, { timeout: 120000 })).arrayBuffer());
      mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, b); written.push(i.rel); bytes += b.length;
    }
    const st = modelStats(buf, c.ext);
    let thumb = null;
    if (c.thumb) {
      try {
        const t = `thumbs/${String(n).padStart(2, '0')}.${extOf('', c.thumb, '', 'image')}`;
        mkdirSync(path.join(out, 'thumbs'), { recursive: true });
        writeFileSync(path.join(out, t), Buffer.from(await (await get(c.thumb, { timeout: 60000 })).arrayBuffer())); thumb = t;
      } catch (e) { warns.push(`"${c.title}": thumbnail did not download (${e.message})`); }
    }
    return { file, title: c.title, licence: c.licence, author: c.author, duration: null, landing: c.landing, url: c.url, provider: c.provider, query, kind: 'model', bytes, triangles: st.triangles, bbox: st.bbox, size: c.size, includes: c.includes.map(i => i.rel), thumb, ...(c.draco ? { draco: true } : {}) };
  } catch (e) {
    for (const w of written) rmSync(path.join(out, w), { force: true });
    warns.push(`"${c.title}" did not download (${e.message}) — rerun to get it`);
    return null;
  }
}

if (args.bundled) bundled();
else {
  const SOURCES = { openverse, commons, polyhaven, smithsonian, nasa, kenney };
  const order = args.source ? [args.source] : type === 'model' ? MODEL_SOURCES : type === 'image' ? ['commons', 'openverse'] : ['openverse'];
  if (type === 'model') { for (const s of order) if (!MODEL_SOURCES.includes(s)) usage(`--source "${s}" is not available for --type model (${MODEL_SOURCES.join(', ')})`); }
  else for (const s of order) if (!['openverse', 'commons'].includes(s) || (s === 'commons' && type !== 'image')) usage(`--source "${s}" is not available for --type ${type} (openverse: music, sfx, image; commons: image)`);
  const warns = warnsOut, cands = [], seen = new Set();
  // Each source gets SOURCE_S seconds in all (pages, retries): a slow one is a WARN + rerun, never a stalled search.
  // Media sources are asked at once and read in order; model sources stay one after another (rate limits, zip downloads).
  const SOURCE_MS = Number(process.env.FIND_MEDIA_SOURCE_S ?? 45) * 1000;
  const within = p => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(`no answer in ${SOURCE_MS / 1000} s`)), SOURCE_MS).unref())]);
  const pagesOf = s => within((async () => {
    // Without a category filter page one can be all short clips: a music search reads up to 3 pages.
    const pages = type === 'music' && s === 'openverse' ? 3 : 1, all = [];
    for (let page = 1; page <= pages; page++) { const raw = await SOURCES[s](page); all.push(raw); if (raw.length < 20) break; }   // a short page is the last one
    return all;
  })());
  const asked = type === 'model' ? null : order.map(s => pagesOf(s).catch(e => e));
  for (const [k, s] of order.entries()) {
    if (cands.length >= max) break;
    try {
      const got = asked ? await asked[k] : await pagesOf(s);
      if (got instanceof Error) throw got;
      for (const raw of got) {
        if (cands.length >= max) break;
        for (const c of raw) {
          if (!c.url || seen.has(c.url) || !licenceOk(c.licence)) continue;
          if (needsCredit(c.licence) && !c.author) continue;       // CC BY with no author: no credit possible
          if (maxDur !== null && c.duration != null && c.duration > maxDur) continue;
          if (minDur !== null && c.duration != null && c.duration < minDur) continue;   // unknown length is kept
          seen.add(c.url); cands.push(c);
        }
      }
    } catch (e) {
      if (e.missingTool) {
        const w = `${s} needs ${e.missingTool}, which is not on PATH, so it cannot be searched on this machine — rerunning will not help. Use another source (--source polyhaven|smithsonian|nasa); installing ${e.missingTool} is the user's decision: ask the user before installing anything`;
        toolWarns.add(w); warns.push(w);
      } else warns.push(`${s} did not answer (${e.message}) — rerun`);
    }
  }
  local(`making ${out}`, () => mkdirSync(out, { recursive: true }));
  const results = [];
  if (type === 'model') local(`clearing ${path.join(out, 'thumbs')}`, () => { rmSync(path.join(out, 'thumbs'), { recursive: true, force: true }); rmSync(path.join(out, 'contact.jpg'), { force: true }); });
  for (const c of cands.slice(0, max)) {
    if (type === 'model') { const r = await downloadModel(c, results.length + 1, warns); if (r) results.push(r); continue; }
    const file = `${String(results.length + 1).padStart(2, '0')}-${slug(c.title)}.${c.ext}`;
    try { writeFileSync(path.join(out, file), Buffer.from(await (await get(c.url, { timeout: 60000 })).arrayBuffer())); }
    catch (e) { warns.push(`"${c.title}" did not download (${e.message}) — rerun to get it`); continue; }
    results.push({ file, title: c.title, licence: c.licence, author: c.author, duration: c.duration, landing: c.landing, url: c.url, provider: c.provider, query });
  }
  finish(results, warns);
}
