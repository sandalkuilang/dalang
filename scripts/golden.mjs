#!/usr/bin/env node
// Golden scene evals: one fixed scene (examples/golden/) rendered by every skill version, so a visual regression
// shows up as a number and a picture instead of in the viewer's eyes. It builds the scene into a temp project, renders
// ONE clip, cuts the three style frames (wide, medium, macro) out of it, measures, writes evals/golden/<version>/
// (wide/medium/macro.jpg, sheet.jpg, metrics.json, diff.md, compare.jpg) and diffs against the previous version.
//
// Usage: node golden.mjs [--version x.y.z] [--out evals/golden] [--against <version>] [--explained "<why>"]
//                        [--keep] [--timeout <ms>]                                  (full run: build, render, measure)
//        node golden.mjs --frames <dir> --clip <mp4> --render-seconds <n> --stations <file.json> [--size WxH] [--fps n]
//                        [same flags]                                               (measure only: no engine, no Chrome)
//   --version    default: the first `## [x.y.z]` heading of CHANGELOG.md (never "Unreleased")
//   --against    baseline version (default: the highest version already in --out, other than this one)
//   --explained  a FLAG stands, but its cause is recorded in metrics.json and the run exits 0
//   --frames     wide.jpg medium.jpg macro.jpg; --stations is {"wide":{"t":1,"texelMm":1.2},"medium":{...},"macro":{...}}
//   --keep       keep the temp project and print its path
// Measured: render time (the render command only), stillness of the clip, detail density per frame (the macro one is
// gated), shadow texel size per station, per-frame perceptual difference (SSIM) against the baseline.
// Tolerances (TOL): render time +25 %, macro detail -15 %, shadow texel +25 %, stillness +5 points. A frame that
// changed is information, never a FLAG: a look change is the point of a release.
// Exit 0: done (no baseline, nothing flagged, or every FLAG explained). Exit 1: usage. Exit 2: build, render or ffmpeg
// failed (WARN: rerun). Exit 3: a FLAG, or something could not be compared (unreadable baseline, other size or fps,
// a metric that could not be read): WARN, rerun; never read as "no difference".
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.]+))?$/;
const STATIONS = ['wide', 'medium', 'macro'];
const SCENE_STATION = { wide: 'home', medium: 'medium', macro: 'macro' }; // the scene's own station names
export const TOL = { render: 0.25, detail: 0.15, texel: 0.25, still: 5, frame: 0.5 };

export const topVersion = (text) => text.match(/^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\]/m)?.[1] ?? null;

export function semverCmp(a, b) {
  const [x, y] = [a, b].map((v) => v.match(SEMVER));
  for (let i = 1; i <= 3; i++) if (+x[i] !== +y[i]) return +x[i] - +y[i];
  if (!x[4] && !y[4]) return 0;
  if (!x[4]) return 1;
  if (!y[4]) return -1;
  const [p, q] = [x[4].split('.'), y[4].split('.')];
  for (let i = 0; i < Math.max(p.length, q.length); i++) {
    if (p[i] === undefined) return -1;
    if (q[i] === undefined) return 1;
    const [n, m] = [/^\d+$/.test(p[i]), /^\d+$/.test(q[i])];
    if (n && m) { if (+p[i] !== +q[i]) return +p[i] - +q[i]; } else if (n !== m) return n ? -1 : 1; else if (p[i] !== q[i]) return p[i] < q[i] ? -1 : 1;
  }
  return 0;
}

// Mean standard deviation (0..255) of the 16x16 blocks inside the central half of the frame: the in-focus subject.
export function detailDensity(gray, w, h) {
  const x0 = Math.floor(w / 4), x1 = Math.floor((w * 3) / 4), y0 = Math.floor(h / 4), y1 = Math.floor((h * 3) / 4);
  let sum = 0, n = 0;
  for (let by = y0; by + 16 <= y1; by += 16) for (let bx = x0; bx + 16 <= x1; bx += 16) {
    let s = 0, s2 = 0;
    for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) { const v = gray[y * w + x]; s += v; s2 += v * v; }
    const mean = s / 256;
    sum += Math.sqrt(Math.max(0, s2 / 256 - mean * mean)); n++;
  }
  return n ? sum / n : 0;
}

export function parseStillness(text) {
  const t = String(text).match(/Total still\s*:\s*[\d.]+ s = ([\d.]+)%/), l = String(text).match(/Longest still\s*:\s*([\d.]+) s/);
  return t && l ? { pct: +t[1], longest: +l[1] } : null;
}

const fin = Number.isFinite;
const pc = (a, b) => (b - a) / a * 100;
const sgn = (v, d = 0) => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`;

// base and cur are metrics.json objects. flags = regressions; warns = what could not be compared or was left out;
// hard = the warns that block like a flag (the answer is unknown, so it is not "no difference").
export function compare(base, cur, tol = TOL) {
  const r = { flags: [], warns: [], hard: [], rows: [] };
  const warn = (m, hard = true) => { r.warns.push(m); if (hard) r.hard.push(m); };
  const row = (metric, before, after, delta, verdict) => r.rows.push({ metric, before, after, delta, verdict });
  if (base.revision !== cur.revision) { warn(`not comparable: scene revision ${base.revision ?? 'unknown'} vs ${cur.revision ?? 'unknown'} (examples/golden/scene.js changed, or the baseline predates revisions); this run is the new baseline, the next version compares against it`, false); return r; }
  if (base.size !== cur.size || base.fps !== cur.fps) { warn(`not comparable: ${base.size} at ${base.fps} fps vs ${cur.size} at ${cur.fps} fps; rerun against a baseline of the same size and fps`); return r; }
  const miss = (name) => { warn(`${name} could not be compared (not read on one side); rerun`); row(name, '?', '?', '', 'unknown'); };
  // render time: only on the same machine
  const [rb, rc] = [base.render?.seconds, cur.render?.seconds];
  const hostOf = (h) => `${h?.model}|${h?.cpus}|${h?.platform}`;
  if (!fin(rb) || !fin(rc)) miss('render time');
  else if (hostOf(base.host) !== hostOf(cur.host)) { warn('render time not compared: another machine (compare runs from one machine)', false); row('render time', rb, rc, '', 'not compared'); }
  else {
    const bad = rc > rb * (1 + tol.render);
    row('render time', rb, rc, `${sgn(pc(rb, rc))} %`, bad ? 'FLAG' : 'ok');
    if (bad) r.flags.push(`render time ${rb.toFixed(1)} s -> ${rc.toFixed(1)} s (${sgn(pc(rb, rc))} %, limit +${tol.render * 100} %)`);
  }
  // detail: the macro one is gated, the others are reported
  for (const s of STATIONS) {
    const [a, b] = [base.detail?.[s], cur.detail?.[s]];
    if (!fin(a) || !fin(b)) { if (s === 'macro') miss(`detail (${s})`); else row(`detail (${s})`, a ?? '?', b ?? '?', '', 'unknown'); continue; }
    const bad = s === 'macro' && b < a * (1 - tol.detail);
    row(`detail (${s})`, a.toFixed(1), b.toFixed(1), `${sgn(pc(a, b))} %`, bad ? 'FLAG' : s === 'macro' ? 'ok' : 'info');
    if (bad) r.flags.push(`detail (${s}) ${a.toFixed(1)} -> ${b.toFixed(1)} (${sgn(pc(a, b))} %, limit -${tol.detail * 100} %)`);
  }
  // shadow texel: a bigger texel is a coarser shadow
  for (const s of STATIONS) {
    const [a, b] = [base.shadow?.[s]?.texelMm, cur.shadow?.[s]?.texelMm];
    if (!fin(a) || !fin(b)) { miss(`shadow texel (${s})`); continue; }
    const bad = b > a * (1 + tol.texel);
    row(`shadow texel (${s}) mm`, a.toFixed(2), b.toFixed(2), `${sgn(pc(a, b))} %`, bad ? 'FLAG' : 'ok');
    if (bad) r.flags.push(`shadow texel (${s}) ${a.toFixed(2)} mm -> ${b.toFixed(2)} mm (${sgn(pc(a, b))} %, limit +${tol.texel * 100} %)`);
  }
  // stillness
  const [sa, sb] = [base.stillness?.pct, cur.stillness?.pct];
  if (!fin(sa) || !fin(sb)) miss('stillness');
  else {
    const bad = sb - sa > tol.still;
    row('stillness %', sa.toFixed(1), sb.toFixed(1), `${sgn(sb - sa, 1)} points`, bad ? 'FLAG' : 'ok');
    if (bad) r.flags.push(`stillness ${sa.toFixed(1)} % -> ${sb.toFixed(1)} % (${sgn(sb - sa, 1)} points, limit +${tol.still})`);
  }
  return r;
}

// ---- the tool: only when executed, so tests can import the functions above ----
class Stop extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const tail = (s) => String(s ?? '').trim().split('\n').slice(-12).join('\n');
const ff = (cmd, args, opt = {}) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26, ...opt });
const ffFail = (what, r) => new Stop(2, `${what} failed (${r.error?.message ?? `exit ${r.status}`}); rerun:\n${tail(r.stderr)}`);

const VALUE = ['--version', '--out', '--against', '--explained', '--timeout', '--frames', '--clip', '--render-seconds', '--stations', '--size', '--fps', '--revision'];
const BOOL = ['--keep'];
const USAGE = 'Usage: node golden.mjs [--version x.y.z] [--out dir] [--against version] [--explained "why"] [--keep] [--timeout ms]\n       node golden.mjs --frames dir --clip mp4 --render-seconds n --stations file.json [--size WxH] [--fps n] [--revision n] [same flags]';

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (BOOL.includes(k)) o[k] = true;
    else if (VALUE.includes(k)) { if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Stop(1, `${k} needs a value.\n${USAGE}`); o[k] = argv[++i]; }
    else throw new Stop(1, `Unknown argument ${k}.\n${USAGE}`);
  }
  return o;
}

const grayOf = (file) => {
  const p = ff('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  const [w, h] = (p.stdout ?? '').trim().split(',').map(Number);
  if (p.status !== 0 || !(w > 0 && h > 0)) return null;
  const g = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 28 });
  return g.status === 0 && g.stdout.length === w * h ? { buf: g.stdout, w, h } : null;
};

const ssimDiff = (a, b) => { // % difference, or null when unknown
  const r = ff('ffmpeg', ['-i', a, '-i', b, '-lavfi', 'ssim', '-f', 'null', '-']);
  const m = r.status === 0 ? String(r.stderr).match(/All:(\d(?:\.\d+)?)/) : null;
  return m ? (1 - +m[1]) * 100 : null;
};

const tile = (inputs, cols, rows, out, tmp) => {
  const d = mkdtempSync(path.join(tmp, 'tile-'));
  inputs.forEach((f, i) => symlinkSync(path.resolve(f), path.join(d, `f-${i + 1}.jpg`)));
  const r = ff('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(d, 'f-%d.jpg'), '-vf', `scale=640:-2,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', out]);
  if (r.status !== 0) throw ffFail('ffmpeg (sheet)', r);
};

async function fullRun(o, tmp, cfg) { // build the scene into tmp, render the clip, cut the frames; returns the measure inputs
  const log = (m) => console.log(m);
  cpSync(path.join(ROOT, 'examples', 'golden', 'index.html'), path.join(tmp, 'index.html'));
  mkdirSync(path.join(tmp, 'src'), { recursive: true });
  cpSync(path.join(ROOT, 'examples', 'golden', 'scene.js'), path.join(tmp, 'src', 'scene.js'));
  try { execFileSync(process.execPath, [path.join(ROOT, 'engine', 'three', 'build.mjs'), path.join(tmp, 'assets', 'engine')], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { throw new Stop(2, `engine build failed; rerun:\n${tail(e.stderr?.toString() ?? e.message)}`); }
  const S = await import(pathToFileURL(path.join(tmp, 'src', 'scene.js')).href);
  const C = S.CONFIG;
  const scene = S.buildScene({ aspect: C.width / C.height });
  const stations = Object.fromEntries(STATIONS.map((s) => [s, { t: C.frameTimes[s], texelMm: scene.texelMm(SCENE_STATION[s]) }]));
  const clip = path.join(tmp, 'clip.mp4');
  ff('npx', ['--yes', 'hyperframes', '--version']); // warms the npx cache: a download is not render time
  log('Rendering the golden clip (this takes a while)...');
  const t0 = process.hrtime.bigint();
  const r = ff('npx', ['--yes', 'hyperframes', 'render', tmp, '--fps', String(C.fps), '--quality', 'high', '--quiet', '--no-browser-gpu', '--output', clip],
    o['--timeout'] ? { timeout: +o['--timeout'] } : {});
  const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
  if (r.status !== 0 || !existsSync(clip)) throw ffFail('render', r);
  const dur = ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]);
  if (dur.status !== 0 || Math.abs(+dur.stdout - C.duration) > 0.1) throw new Stop(2, `the rendered clip is ${dur.stdout.trim() || 'unreadable'} s, expected ${C.duration} s; rerun`);
  const fdir = path.join(tmp, 'frames'); mkdirSync(fdir);
  for (const s of STATIONS) {
    const x = ff('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(stations[s].t), '-i', clip, '-frames:v', '1', '-q:v', '2', path.join(fdir, `${s}.jpg`)]);
    if (x.status !== 0) throw ffFail(`frame cut (${s})`, x);
  }
  return { frames: fdir, clip, seconds, stations, revision: C.revision, size: `${C.width}x${C.height}`, fps: C.fps, duration: C.duration };
}

async function main(argv) {
  const o = parse(argv);
  const version = o['--version'] ?? topVersion(existsSync(path.join(ROOT, 'CHANGELOG.md')) ? readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8') : '');
  if (!version) throw new Stop(1, `No --version and no released heading in CHANGELOG.md.\n${USAGE}`);
  if (!SEMVER.test(version)) throw new Stop(1, `--version "${version}" is not x.y.z (or x.y.z-pre): it names the folder.\n${USAGE}`);
  const against = o['--against'];
  if (against !== undefined && !SEMVER.test(against)) throw new Stop(1, `--against "${against}" is not x.y.z.\n${USAGE}`);
  const measureOnly = o['--frames'] !== undefined;
  if (measureOnly) for (const k of ['--clip', '--render-seconds', '--stations']) if (o[k] === undefined) throw new Stop(1, `--frames needs ${k}.\n${USAGE}`);
  if (!measureOnly) for (const k of ['--clip', '--render-seconds', '--stations', '--size', '--fps', '--revision']) if (o[k] !== undefined) throw new Stop(1, `${k} goes with --frames (measure only).\n${USAGE}`);
  const out = path.resolve(o['--out'] ?? path.join(ROOT, 'evals', 'golden'));
  const versions = existsSync(out) ? readdirSync(out).filter((d) => SEMVER.test(d)) : [];
  if (against !== undefined && !versions.includes(against)) throw new Stop(1, `--against ${against}: no such version in ${out} (found: ${versions.sort(semverCmp).join(', ') || 'none'}).`);
  const baseV = against ?? versions.filter((v) => v !== version).sort(semverCmp).at(-1) ?? null;

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'dalang-golden-'));
  try {
    let src;
    if (measureOnly) {
      let st; try { st = JSON.parse(readFileSync(path.resolve(o['--stations']), 'utf8')); } catch (e) { throw new Stop(1, `--stations: ${e.message}`); }
      for (const s of STATIONS) if (!fin(st?.[s]?.texelMm)) throw new Stop(1, `--stations: ${s}.texelMm must be a number.`);
      const secs = +o['--render-seconds'];
      if (!(secs > 0)) throw new Stop(1, '--render-seconds must be a number above 0.');
      const size = o['--size'] ?? '1280x720', fps = o['--fps'] ? +o['--fps'] : 30;
      if (!/^\d+x\d+$/.test(size) || !(fps > 0)) throw new Stop(1, '--size must be WxH and --fps a number above 0.');
      const rv = o['--revision'] ?? String(readFileSync(path.join(ROOT, 'examples', 'golden', 'scene.js'), 'utf8').match(/revision:\s*(\d+)/)?.[1]);
      if (!/^[1-9]\d*$/.test(rv)) throw new Stop(1, '--revision must be a whole number above 0 (default: CONFIG.revision in examples/golden/scene.js).');
      const clip = path.resolve(o['--clip']);
      const d = ff('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]);
      src = { frames: path.resolve(o['--frames']), revision: +rv, clip, seconds: secs, stations: st, size, fps, duration: d.status === 0 && fin(+d.stdout) ? Math.round(+d.stdout * 10) / 10 : null };
    } else src = await fullRun(o, tmp);

    for (const s of STATIONS) if (!existsSync(path.join(src.frames, `${s}.jpg`))) throw new Stop(2, `No ${s}.jpg in ${src.frames}; rerun the capture.`);
    const cpus = os.cpus();
    const m = { version, tree: null, node: process.version, host: { platform: process.platform, arch: process.arch, cpus: cpus.length, model: cpus[0]?.model ?? null },
      revision: src.revision, size: src.size, fps: src.fps, duration: src.duration, render: { seconds: Math.round(src.seconds * 10) / 10 }, stillness: null, detail: {}, shadow: {} };
    const git = ff('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']);
    m.tree = git.status === 0 ? git.stdout.trim() : null;
    const measureWarns = [];
    const still = ff(process.execPath, [path.join(ROOT, 'scripts', 'stillness.mjs'), src.clip, '--target', '100', '--max-still', '1000']);
    m.stillness = still.status === 0 ? parseStillness(still.stdout) : null;
    if (!m.stillness) measureWarns.push('stillness could not be read from the clip; rerun');
    for (const s of STATIONS) {
      const g = grayOf(path.join(src.frames, `${s}.jpg`));
      m.detail[s] = g ? Math.round(detailDensity(g.buf, g.w, g.h) * 100) / 100 : null;
      if (!g) measureWarns.push(`detail (${s}) could not be read from the frame; rerun`);
      m.shadow[s] = { texelMm: src.stations[s].texelMm, t: src.stations[s].t };
    }
    if (o['--explained'] !== undefined) m.explained = o['--explained'];

    // the baseline is copied away first: --against can name the folder this run replaces
    let base = null, baseDir = null, baseWarn = null;
    if (baseV) {
      baseDir = path.join(tmp, 'base');
      cpSync(path.join(out, baseV), baseDir, { recursive: true });
      try { base = JSON.parse(readFileSync(path.join(baseDir, 'metrics.json'), 'utf8')); if (typeof base !== 'object' || !base) throw new Error('not an object'); }
      catch (e) { base = null; baseWarn = `baseline ${baseV}: metrics.json is unreadable (${String(e.message).split('\n')[0]}); rerun, or restore it`; }
    }
    const cmp = base ? compare(base, m, TOL) : { flags: [], warns: [], hard: [], rows: [] };
    if (baseWarn) { cmp.warns.push(baseWarn); cmp.hard.push(baseWarn); }
    for (const w of measureWarns) { cmp.warns.push(w); cmp.hard.push(w); }

    const dest = path.join(out, version);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const s of STATIONS) copyFileSync(path.join(src.frames, `${s}.jpg`), path.join(dest, `${s}.jpg`));
    tile(STATIONS.map((s) => path.join(dest, `${s}.jpg`)), 3, 1, path.join(dest, 'sheet.jpg'), tmp);

    const frameRows = [];
    if (baseDir) {
      const olds = STATIONS.map((s) => path.join(baseDir, `${s}.jpg`));
      for (const s of STATIONS) {
        const b = path.join(baseDir, `${s}.jpg`);
        const d = existsSync(b) ? ssimDiff(b, path.join(dest, `${s}.jpg`)) : null;
        if (d === null) { frameRows.push({ s, text: 'unknown (could not compare)' }); const w = `frame ${s} could not be compared with ${baseV}; rerun`; cmp.warns.push(w); cmp.hard.push(w); }
        else frameRows.push({ s, text: d < TOL.frame ? `unchanged (${d.toFixed(3)} %)` : `changed (${d.toFixed(1)} %)` });
      }
      if (olds.every(existsSync)) tile([...olds, ...STATIONS.map((s) => path.join(dest, `${s}.jpg`))], 3, 2, path.join(dest, 'compare.jpg'), tmp);
    }

    const explained = o['--explained'];
    const open = cmp.flags.length && explained === undefined;
    const md = [`# Golden scene ${version}`, '', `Baseline: ${baseV ?? 'none (first run)'}${baseV && !base ? ' (unreadable)' : ''}`, '',
      ...(cmp.rows.length ? ['| Metric | Before | After | Delta | Verdict |', '|---|---|---|---|---|', ...cmp.rows.map((r) => `| ${r.metric} | ${r.before} | ${r.after} | ${r.delta} | ${r.verdict} |`), ''] : []),
      ...(frameRows.length ? ['| Frame | Difference |', '|---|---|', ...frameRows.map((r) => `| ${r.s} | ${r.text} |`), ''] : []),
      ...cmp.flags.map((f) => `${explained !== undefined ? 'EXPLAINED' : 'FLAG'}: ${f}`), ...cmp.warns.map((w) => `WARN: ${w}`),
      ...(explained !== undefined && cmp.flags.length ? ['', `Explained: ${explained}`] : []), '',
      'Paste the sheet and the larger changes into the release notes.', ''].join('\n');
    writeFileSync(path.join(dest, 'diff.md'), md);
    writeFileSync(path.join(dest, 'metrics.json'), `${JSON.stringify(m, null, 2)}\n`);

    if (!baseV) console.log('Golden: no earlier version, nothing to compare.');
    for (const f of cmp.flags) console.log(`${explained !== undefined ? 'EXPLAINED' : 'FLAG'}: ${f}`);
    for (const w of cmp.warns) console.log(`WARN: ${w}`);
    console.log(`Golden ${version}: ${cmp.flags.length} flag(s), ${cmp.warns.length} warning(s) -> ${path.relative(process.cwd(), dest) || dest}/`);
    return open || cmp.hard.length ? 3 : 0;
  } finally {
    if (argv.includes('--keep')) console.log(`Temp project kept: ${tmp}`); else rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => {
    if (e instanceof Stop) { console.error(e.message); process.exitCode = e.code; } else { console.error(`golden failed: ${e.stack ?? e}`); process.exitCode = 2; }
  });
}
