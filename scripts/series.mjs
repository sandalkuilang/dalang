#!/usr/bin/env node
// Series kit: a channel's look, HUD, captions, voice and rules, saved once; each new video of the series starts from it.
// Opt-in: a video outside a series carries nothing over (SKILL.md "General purpose"). A kit is a folder
// ~/.config/dalang/series/<name>/ (DALANG_SERIES_DIR overrides the root) with SERIES.md (the channel-level Brief lines,
// the file list, the Channel rules) and files/ (the reusable files: overlay / HUD module, caption config, tag
// vocabulary, palette tokens).
//   save <name> --from <project> [--file <rel>]... [--force]   channel-level BRIEF.md lines + the named files -> the kit
//   list                                                        the kits, one line each
//   apply <name> [project] [--force]                            kit files -> project, BRIEF.md pre-filled, rules printed
//   note <name> "<rule>"                                        append a channel-level rule to SERIES.md
// Never in a kit: scene code (a module that builds a scene or imports the engine's 3D / physics: heuristic, see
// isScene), per-video files (script, storyboard, audio, BRIEF.md ...), the engine copy, env files, anything outside
// the project, symlinks. The real guarantee: save copies only the files named with --file, apply copies only files/.
// Exit 0 ok, 1 refused / problem (nothing written), 2 cannot read (WARN: rerun; never read as "no kits").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.env.DALANG_SERIES_DIR || path.join(os.homedir(), '.config', 'dalang', 'series');
const out = s => process.stdout.write(s + '\n');
const die = (code, kind, msg) => { out(`  ${kind.padEnd(9)}: ${msg}`); process.exit(code); };
const problem = msg => die(1, 'PROBLEM', msg);
const warn = (msg) => die(2, 'WARN', `${msg} — rerun`);

// ---- args
const argv = process.argv.slice(2);
const pos = [], files = [];
let from = '.', force = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--from') from = argv[++i] ?? problem('--from needs a project folder');
  else if (a === '--file') files.push(argv[++i] ?? problem('--file needs a path'));
  else if (a === '--force') force = true;
  else if (a.startsWith('--')) problem(`unknown option ${a}`);
  else pos.push(a);
}
const [cmd, name, arg3] = pos;

// ---- Brief lines
const CHANNEL = new Set(['platform', 'ratio & resolution', 'ratio', 'resolution', 'fps', 'narration language', 'language', 'realism',
  'look', 'visual style', 'energy', 'audience', 'voice engine', 'voice model', 'voice', 'signoff', 'sign-off']);
const ALIAS = { ratio: 'ratio & resolution', resolution: 'ratio & resolution', language: 'narration language', 'visual style': 'look', 'sign-off': 'signoff' };
const keyOf = line => {
  const m = line.match(/^\s*(?:[-*+]\s+)?(?:\*\*)?([A-Za-z][^:|*]*?)(?:\*\*)?\s*:(?:\*\*)?\s*\S/)
    ?? line.match(/^\s*\|\s*(?:\*\*)?([A-Za-z][^|*]*?)(?:\*\*)?\s*\|\s*[^|\s-]/);
  if (!m) return null;
  const k = m[1].trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  return ALIAS[k] ?? k;
};
const valueOf = line => /^\s*\|/.test(line) ? (line.split('|')[2] ?? '').trim() : line.replace(/^\s*(?:[-*+]\s+)?(?:\*\*)?[^:]*?:(?:\*\*)?\s*/, '').trim();
const briefLines = text => text.split('\n').filter(l => { const k = keyOf(l); return k && CHANNEL.has(k); }).map(l => l.replace(/\s+$/, ''));

// ---- SERIES.md sections ("## " headings)
const section = (text, title) => {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.trim().toLowerCase() === `## ${title}`.toLowerCase());
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return { lines, start, end };
};
const sectionLines = (text, title) => { const s = section(text, title); return s ? s.lines.slice(s.start + 1, s.end) : []; };
const kitBrief = text => briefLines(sectionLines(text, 'Brief').join('\n'));
const kitRules = text => sectionLines(text, 'Channel rules').filter(l => /^- /.test(l));

// ---- paths and scene detection
const PER_VIDEO = new Set(['brief.md', 'production.md', 'script.md', 'narration.txt', 'spec.md', 'storyboard.md', 'state.json', 'index.html',
  'src/index.tpl.html', 'model.mjs', 'numbers.json', 'assets.json', 'credits.md', 'reference-measurements.md', 'series.md']);
const checkRel = rel => {
  if (!rel || path.isAbsolute(rel)) return 'must be a path relative to the project';
  const n = path.posix.normalize(rel.split(path.sep).join('/'));
  if (n === '..' || n.startsWith('../') || n === '.') return 'leaves the project';
  const l = n.toLowerCase();
  if (/(^|\/)\.env/.test(l)) return 'an env file (secrets never go into a kit)';
  if (PER_VIDEO.has(l) || /^(audio|style-frames|renders|review|\.git|node_modules|assets\/engine)\//.test(l)) return 'a per-video file or the engine copy';
  return null;
};
const ENGINE_3D = /(?:from|import)\s*\(?\s*['"][^'"]*\/(?:three-vendor|rapier|physics|bake|bakecore|bodies|mechanism|camera|cloth|water|air|wind|fur|grains|particles|plants|pool|cutaway|surfaces|finish|kit|examples\/[^'"]+)(?:\.m?js)?['"]/;
const SCENE_CODE = /\bnew\s+(?:THREE\.)?(?:Scene|WebGLRenderer|PerspectiveCamera)\b|\bbakeCached\s*\(/;
const isScene = (rel, text) => /\.(m?js|html)$/i.test(rel) && (ENGINE_3D.test(text) || SCENE_CODE.test(text))
  ? 'a scene module (builds a scene or imports the engine\'s 3D / physics): scene code stays per video' : null;
const checkName = n => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(n ?? '') ? null : `series name "${n ?? ''}": letters, digits, - and _ (start with a letter or digit)`;

// ---- fs helpers: every read error that is not "missing" is WARN, never a verdict
const code = e => e?.code ?? 'error';
const tryRead = (f, enc = 'utf8') => { try { return fs.readFileSync(f, enc); } catch (e) { return { err: e }; } };
const isErr = v => v && typeof v === 'object' && 'err' in v;
// the deepest existing ancestor of target, resolved, must stay inside base (no symlinked directory leads out)
const inside = (base, target) => {
  let p = target;
  for (;;) {
    try { const real = fs.realpathSync(p); const b = fs.realpathSync(base); return real === b || real.startsWith(b + path.sep); } catch (e) { if (e.code !== 'ENOENT') return false; }
    const up = path.dirname(p); if (up === p) return false; p = up;
  }
};
const walk = (dir, rel = '') => {
  const res = [];
  for (const d of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) res.push(...walk(dir, r)); else res.push({ rel: r, link: d.isSymbolicLink(), file: d.isFile() });
  }
  return res.sort((a, b) => a.rel.localeCompare(b.rel));
};
const readKit = nm => {
  const bad = checkName(nm); if (bad) problem(bad);
  const t = tryRead(path.join(ROOT, nm, 'SERIES.md'));
  if (isErr(t)) { if (code(t.err) === 'ENOENT') problem(`no series "${nm}": node series.mjs list`); warn(`cannot read ${path.join(ROOT, nm, 'SERIES.md')} (${code(t.err)})`); }
  return t;
};

// ---- save
const save = () => {
  const bad = checkName(name); if (bad) problem(bad);
  const proj = path.resolve(from);
  const b = tryRead(path.join(proj, 'BRIEF.md'));
  if (isErr(b)) { if (code(b.err) === 'ENOENT') problem(`BRIEF.md not found in ${proj}: finish Step 1 first`); warn(`cannot read BRIEF.md (${code(b.err)})`); }
  const lines = briefLines(b);
  if (!lines.length) problem('no channel-level lines in BRIEF.md (platform, look, voice ...): nothing to keep');
  const rels = [...new Set(files.map(f => f.split(path.sep).join('/')))];
  const picked = [];
  for (const rel of rels) { // validate everything before writing anything
    const why = checkRel(rel); if (why) problem(`${rel}: ${why}`);
    const abs = path.join(proj, rel);
    let st; try { st = fs.lstatSync(abs); } catch (e) { problem(`${rel}: ${code(e) === 'ENOENT' ? 'not found in the project' : `cannot read (${code(e)})`}`); }
    if (st.isSymbolicLink()) problem(`${rel}: a symlink`);
    if (!st.isFile()) problem(`${rel}: not a regular file`);
    if (!inside(proj, abs)) problem(`${rel}: leaves the project (a symlinked folder)`);
    const t = tryRead(abs); if (isErr(t)) warn(`cannot read ${rel} (${code(t.err)})`);
    const sc = isScene(rel, t); if (sc) problem(`${rel}: ${sc}`);
    picked.push({ rel, abs });
  }
  const kit = path.join(ROOT, name);
  let keep = [];
  if (fs.existsSync(kit)) {
    if (!force) problem(`series ${name} exists: --force replaces its brief and files and keeps its Channel rules`);
    const old = tryRead(path.join(kit, 'SERIES.md')); if (!isErr(old)) keep = kitRules(old);
  }
  try {
    fs.rmSync(path.join(kit, 'files'), { recursive: true, force: true });
    fs.mkdirSync(path.join(kit, 'files'), { recursive: true });
    for (const { rel, abs } of picked) { const d = path.join(kit, 'files', rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(abs, d); }
    const md = [`# Series kit: ${name}`, '',
      `Saved ${new Date().toISOString().slice(0, 10)}. \`series.mjs apply ${name}\` writes the Brief lines into a new video's BRIEF.md and copies`,
      'the Files into its project. Scene code, script, storyboard and QC stay per video.', '',
      '## Brief', ...lines, '', '## Files', ...(rels.length ? rels.map(r => `- ${r}`) : ['- none']), '',
      '## Channel rules', 'One line each: music licence policy (e.g. CC0 only), caption / label / card style, what this channel never does.', ...keep, ''].join('\n');
    fs.writeFileSync(path.join(kit, 'SERIES.md'), md);
  } catch (e) { warn(`cannot write ${kit} (${code(e)})`); }
  out(`Saved series ${name}: ${lines.length} brief line(s), ${picked.length} file(s) -> ${path.join(kit, 'SERIES.md')}`);
  out('Show SERIES.md to the user and fill its Channel rules with them (series.mjs note).');
};

// ---- list
const list = () => {
  let ents;
  try { ents = fs.readdirSync(ROOT, { withFileTypes: true }); } catch (e) {
    if (code(e) === 'ENOENT') { out(`No series kits yet (${ROOT})`); return; }
    warn(`cannot read ${ROOT} (${code(e)})`);
  }
  const kits = ents.filter(d => d.isDirectory()).map(d => d.name).sort();
  if (!kits.length) { out(`No series kits yet (${ROOT})`); return; }
  let bad = false;
  for (const k of kits) {
    const t = tryRead(path.join(ROOT, k, 'SERIES.md'));
    if (isErr(t)) { out(`  WARN     : ${k}: ${code(t.err) === 'ENOENT' ? 'no SERIES.md' : `cannot read SERIES.md (${code(t.err)})`}`); bad = true; continue; }
    const lines = kitBrief(t);
    const v = key => { const l = lines.find(x => keyOf(x) === key); return l ? valueOf(l) : '-'; };
    let n = 0; try { n = walk(path.join(ROOT, k, 'files')).length; } catch { /* no files/ folder: 0 files */ }
    out(`  ${k}  ${v('platform')} · ${v('look')} · ${v('voice')} · ${n} file(s)`);
  }
  if (bad) { out('  WARN     : a kit above could not be read — rerun'); process.exit(2); }
};

// ---- apply
const apply = () => {
  const text = readKit(name);
  const proj = path.resolve(arg3 ?? '.');
  const kitFiles = path.join(ROOT, name, 'files');
  let found = [];
  try { found = walk(kitFiles); } catch (e) { if (code(e) !== 'ENOENT') warn(`cannot read ${kitFiles} (${code(e)})`); }
  const plan = [];
  for (const f of found) { // a hand-edited kit must not slip a scene module, an env file or a link in
    if (f.link || !f.file) problem(`kit file ${f.rel}: a symlink or not a regular file`);
    const why = checkRel(f.rel); if (why) problem(`kit file ${f.rel}: ${why}`);
    const src = path.join(kitFiles, f.rel);
    const t = tryRead(src); if (isErr(t)) warn(`cannot read kit file ${f.rel} (${code(t.err)})`);
    const sc = isScene(f.rel, t); if (sc) problem(`kit file ${f.rel}: ${sc}`);
    const dst = path.join(proj, f.rel);
    if (!inside(proj, dst)) problem(`${f.rel}: would land outside the project (a symlinked folder)`);
    let st = null; try { st = fs.lstatSync(dst); } catch (e) { if (code(e) !== 'ENOENT') warn(`cannot read ${dst} (${code(e)})`); }
    if (st) {
      if (st.isSymbolicLink() || !st.isFile()) { problem(`${f.rel}: exists and is not a regular file`); }
      if (fs.readFileSync(dst).equals(fs.readFileSync(src))) continue;
      plan.push({ f, src, dst, differs: true });
    } else plan.push({ f, src, dst });
  }
  const clash = plan.filter(p => p.differs);
  if (clash.length && !force) problem(`already in the project and different (nothing written; --force overwrites): ${clash.map(p => p.f.rel).join(', ')}`);
  // BRIEF.md
  const lines = kitBrief(text);
  const bp = path.join(proj, 'BRIEF.md');
  const cur = tryRead(bp);
  if (isErr(cur) && code(cur.err) !== 'ENOENT') warn(`cannot read BRIEF.md (${code(cur.err)})`);
  const have = isErr(cur) ? null : cur;
  const keys = new Set(have ? have.split('\n').map(keyOf).filter(Boolean) : []);
  const add = [], infos = [];
  if (!keys.has('series')) add.push(`- series: ${name}`);
  for (const l of lines) { const k = keyOf(l); if (keys.has(k)) infos.push(`BRIEF.md keeps its own ${k}`); else { keys.add(k); add.push(l); } }
  try {
    for (const p of plan) { fs.mkdirSync(path.dirname(p.dst), { recursive: true }); fs.copyFileSync(p.src, p.dst); }
    if (have === null) fs.mkdirSync(proj, { recursive: true });
    fs.writeFileSync(bp, have === null ? `# Brief\n\n${add.join('\n')}\n` : have.replace(/\n*$/, '\n') + (add.length ? add.join('\n') + '\n' : ''));
  } catch (e) { warn(`cannot write into ${proj} (${code(e)})`); }
  for (const i of infos) out(`  INFO     : ${i}`);
  out(`Applied series ${name}: ${plan.length} file(s) written (${found.length - plan.length} already identical), ${add.length} brief line(s) added -> BRIEF.md`);
  const rules = kitRules(text);
  out('Channel rules:'); out(rules.length ? rules.join('\n') : '- none yet');
  out('Ask only what BRIEF.md still lacks (topic, angle, duration ...).');
};

// ---- note
const note = () => {
  const rule = (arg3 ?? '').replace(/\s+/g, ' ').trim();
  if (!rule) problem('note needs the rule text: series.mjs note <name> "<rule>"');
  const text = readKit(name);
  const file = path.join(ROOT, name, 'SERIES.md');
  let s = section(text, 'Channel rules'), lines;
  if (!s) { lines = text.replace(/\n*$/, '\n').split('\n'); lines.push('## Channel rules', ''); s = section(lines.join('\n'), 'Channel rules'); }
  lines = s.lines;
  let at = s.end; while (at > s.start + 1 && lines[at - 1].trim() === '') at--;
  lines.splice(at, 0, `- ${rule}`);
  try { fs.writeFileSync(file, lines.join('\n').replace(/\n*$/, '\n')); } catch (e) { warn(`cannot write ${file} (${code(e)})`); }
  out(`Added to ${file}: - ${rule}`);
  out('Show the user this line (channel-level feedback goes to the kit, never to private memory).');
};

const cmds = { save, list, apply, note };
if (!cmds[cmd]) problem('usage: series.mjs save <name> --from <project> [--file <rel>]... [--force] | list | apply <name> [project] [--force] | note <name> "<rule>"');
if (cmd !== 'list' && name === undefined) problem(`${cmd} needs a series name`);
cmds[cmd]();
