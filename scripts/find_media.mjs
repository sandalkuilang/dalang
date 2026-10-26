#!/usr/bin/env node
// Free licensed media search for music, sound effects and stills: Openverse (audio, images), Wikimedia Commons (images)
// and the bundled /media-use SFX library. No key, no dependency (Node fetch). It downloads previews, prints one line per
// result, and --take copies one into the project and appends its ASSETS.json row (source, licence, author from the API)
// so scripts/check_assets.mjs passes without hand-written rows.
//
// Usage:
//   node find_media.mjs --type music|sfx|image --query "<1-2 English words>" --out review/<dir>
//        [--licence cc0,by] [--max-duration <s>] [--max 8] [--source openverse|commons]
//   node find_media.mjs --type sfx --bundled [--query "<words>"] [--media-use <sfx dir>] --out review/<dir>
//   node find_media.mjs --take review/<dir>/<file> --as assets/<path> [--project .]
//
// --licence: comma list of cc0 (CC0 + public domain), by (CC BY), by-sa (CC BY-SA); default cc0,by. NC and ND results are
//   always dropped, and so is a result that needs a credit but names no author. Share-alike is opt-in (by-sa).
//   --bundled applies the same filters to the library's licence (from its CREDITS.md): an NC/ND or out-of-list CC licence, or a CC BY
//   (the library names no creator), lists nothing and says why (exit 1); a custom, non-CC library licence is listed as it is.
// Exit: 0 results; 1 every source answered and nothing matched; 2 usage; 3 a source failed and nothing was found, or a local file
//   could not be made, copied or written (rerun).
// A source that fails is a WARN with "rerun", never "nothing matched" (an unreadable answer is not an empty one); neither is a local
// write error, which says nothing about whether media exist.
// 429/503 are retried after Retry-After, else with exponential backoff (FIND_MEDIA_BACKOFF_MS, default 1000), never a fixed sleep.
// Env (tests): OPENVERSE_API, COMMONS_API, MEDIA_USE_SFX.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UA = 'dalang-find-media (https://github.com/sandalkuilang/dalang)';
const OPENVERSE = (process.env.OPENVERSE_API || 'https://api.openverse.org/v1').replace(/\/$/, '');
const COMMONS = process.env.COMMONS_API || 'https://commons.wikimedia.org/w/api.php';
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
  console.error(`${msg}\nusage: find_media.mjs --type music|sfx|image --query "<q>" --out <dir> [--licence cc0,by] [--max-duration s] [--max 8] [--source openverse|commons]\n       find_media.mjs --type sfx --bundled [--query "<q>"] [--media-use <dir>] --out <dir>\n       find_media.mjs --take <file> --as assets/<path> [--project .]`);
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
const extOf = (filetype, url, mime, type) => {
  const f = String(filetype || '').toLowerCase().replace(/^\./, '');
  if (/^[a-z0-9]{2,5}$/.test(f)) return f === 'jpeg' ? 'jpg' : f;
  const u = path.extname(new URL(url, 'http://x').pathname).slice(1).toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(u)) return u === 'jpeg' ? 'jpg' : u;
  return MIME_EXT[mime] || (type === 'image' ? 'jpg' : 'mp3');
};
const readJSON = p => JSON.parse(readFileSync(p, 'utf8'));

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
  local(`copying to ${dest}`, () => { mkdirSync(path.dirname(dest), { recursive: true }); copyFileSync(src, dest); });
  const row = { file: as, source: hit.landing || hit.url, licence: hit.licence, ...(hit.author ? { author: hit.author } : {}), title: hit.title };
  rows = rows.filter(r => path.normalize(r.file || '') !== path.normalize(as));
  rows.push(row);
  local(`writing ${manifest}`, () => writeFileSync(manifest, JSON.stringify(rows, null, 2) + '\n'));
  console.log(`taken: ${as}\n  ASSETS.json row: ${JSON.stringify(row)}\n  next: node <skill-dir>/scripts/check_assets.mjs ${args.project ?? '.'}`);
  process.exit(0);
}

// ── search ───────────────────────────────────────────────────────────────────
const type = args.type;
if (!['music', 'sfx', 'image'].includes(type)) usage('--type must be music, sfx or image');
if (!args.out) usage('--out <dir> is required');
if (!args.bundled && !args.query) usage('--query "<English words>" is required');
if (args.bundled && type !== 'sfx') usage('--bundled is for --type sfx');
const query = args.query ?? '';
const out = path.resolve(args.out);
const max = Math.max(1, Number(args.max ?? 8) || 8);
const maxDur = args['max-duration'] !== undefined ? Number(args['max-duration']) : null;
if (maxDur !== null && !(maxDur > 0)) usage('--max-duration must be a number of seconds');
const hint = `take one: node <skill-dir>/scripts/find_media.mjs --take ${path.join(args.out, '<file>')} --as assets/<path>`;

function finish(results, warns) {
  for (const w of warns) console.log(`WARN: ${w}`);
  if (!results.length) {
    if (warns.length) { console.log('Nothing was found, and a source did not answer — that is not "no results". Rerun in a minute.'); process.exit(3); }
    console.log(`nothing matched "${query}" — try other English words (1-2 words work best)${args.licence ? '' : ', or widen --licence'}`);
    process.exit(1);
  }
  local(`writing ${path.join(out, 'results.json')}`, () => writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n'));
  for (const r of results) console.log(`${r.file} · ${r.title} · ${r.licence} · ${r.author || '-'} · ${r.duration != null ? `${r.duration} s` : '-'} · ${r.landing || r.url}`);
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
  }).filter(x => x.score > 0 && (maxDur === null || x.e.duration == null || x.e.duration <= maxDur)).sort((a, b) => b.score - a.score).slice(0, max);
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

async function openverse() {
  const kind = type === 'image' ? 'images' : 'audio';
  const p = new URLSearchParams({ q: query, license: ovLicenceParam, page_size: '20' });
  if (type !== 'image') p.set('category', type === 'music' ? 'music' : 'sound_effect');
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

if (args.bundled) bundled();
else {
  const SOURCES = { openverse, commons };
  const order = args.source ? [args.source] : type === 'image' ? ['commons', 'openverse'] : ['openverse'];
  for (const s of order) if (!SOURCES[s] || (s === 'commons' && type !== 'image')) usage(`--source "${s}" is not available for --type ${type} (openverse: music, sfx, image; commons: image)`);
  const warns = [], cands = [], seen = new Set();
  for (const s of order) {
    if (cands.length >= max) break;
    try {
      for (const c of await SOURCES[s]()) {
        if (!c.url || seen.has(c.url) || !licenceOk(c.licence)) continue;
        if (needsCredit(c.licence) && !c.author) continue;       // CC BY with no author: no credit possible
        if (maxDur !== null && c.duration != null && c.duration > maxDur) continue;
        seen.add(c.url); cands.push(c);
      }
    } catch (e) { warns.push(`${s} did not answer (${e.message}) — rerun`); }
  }
  local(`making ${out}`, () => mkdirSync(out, { recursive: true }));
  const results = [];
  for (const c of cands.slice(0, max)) {
    const file = `${String(results.length + 1).padStart(2, '0')}-${slug(c.title)}.${c.ext}`;
    try { writeFileSync(path.join(out, file), Buffer.from(await (await get(c.url, { timeout: 60000 })).arrayBuffer())); }
    catch (e) { warns.push(`"${c.title}" did not download (${e.message}) — rerun to get it`); continue; }
    results.push({ file, title: c.title, licence: c.licence, author: c.author, duration: c.duration, landing: c.landing, url: c.url, provider: c.provider, query });
  }
  finish(results, warns);
}
