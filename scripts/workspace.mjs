#!/usr/bin/env node
// A lean videos folder. Every model call re-reads each enabled plugin's skills and hooks and every connected MCP server's
// tool definitions; a video run uses none of the deployment, code-index or messaging ones. Claude Code reads project-level
// settings, so a `.claude/settings.json` in the folder where videos are made switches them off for that folder only.
//
// Usage: node workspace.mjs <status|init|undo> [videos-folder] [--keep a,b] [--yes] [--json]
//   status  what is on for the folder (user + project settings), a guessed job per item, and whether it is lean.
//           Exit 1 when a settings file cannot be read: that is "unknown", never "nothing enabled".
//   init    prints the proposal (keep DALANG, HyperFrames, media-use, a browser; everything else off) and writes NOTHING.
//           With --yes it writes or merges ONLY <folder>/.claude/settings.json (`enabledPlugins` false for plugins,
//           `deniedMcpServers` for MCP servers, `skillOverrides` off for user skills, `disableBundledSkills`, and
//           env ENABLE_CLAUDEAI_MCP_SERVERS=false for the account's claude.ai connectors), keeps every other key, and saves the old file once as
//           settings.json.bak (0 bytes = there was no file). User-level files and settings.local.json are never written.
//   undo    puts the file from before init back byte for byte (or removes it when there was none), then drops the .bak.
//   measure the first model call's context (input + cache creation + cache read tokens) from a session transcript (.jsonl)
//           or a `claude -p --output-format json` result; with a second file, the change. Usage that is missing, all 0 or
//           summed over several calls is "could not measure, rerun", never 0. This is how the saving is checked.
//   --keep  more items to leave on (a plugin's `name@marketplace`, or an MCP server's name), comma separated.
//
// A session started inside a git repository also reads settings.local.json at the repository root (Claude Code v2.1.211+,
// the root's value wins; a worktree uses the main checkout's root), so status and init read that file too. A backup is
// trusted only when init wrote it: the sidecar settings.json.bak.dalang holds its SHA-256; any other .bak is refused.
//
// Only plugin and server NAMES are printed, never their env, args, headers or URLs (MCP configs can hold tokens).

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const valueOf = n => { const i = args.indexOf(n), e = args.find(a => a.startsWith(n + '=')); return e ? e.slice(n.length + 1) : i >= 0 ? args[i + 1] : undefined; };
const keepArg = (valueOf('--keep') || '').split(',').map(s => s.trim()).filter(Boolean);
const asJson = flag('--json'), yes = flag('--yes');
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--keep');
const [cmd, dirArg] = positional;
if (!['status', 'init', 'undo', 'measure'].includes(cmd) || (cmd === 'measure' && (positional.length < 2 || positional.length > 3))) {
  console.error('usage: workspace.mjs <status|init|undo> [videos-folder] [--keep a,b] [--yes] [--json]\n       workspace.mjs measure <before> [after] [--json]');
  process.exit(2);
}

// DALANG, /hyperframes, /media-use, and the browser the look may use for references. A name guess: --keep covers the rest.
const KEEP = /dalang|hyperframes|media-use|browser|chrome|preview/i;
const JOBS = [
  [/hyperframes|media-use|dalang/i, 'video (keep)'],
  [/browser|chrome|preview|playwright/i, 'browser (keep)'],
  [/\b(deploy|vercel|netlify|cloudflare|aws|gcp|azure|supabase|firebase|railway|fly)/i, 'deploy / cloud'],
  [/\b(graft|index|lsp|context|search|code)/i, 'code index / search'],
  [/\b(git|github|gitlab|linear|jira)/i, 'code hosting / tickets'],
  [/\b(slack|mail|calendar|notion|drive|docs)/i, 'messaging / documents'],
  [/\b(test|lint|review|forge|sapu|superpowers|skill)/i, 'coding workflow'],
];
const jobOf = name => JOBS.find(([re]) => re.test(name))?.[1] || 'not a video tool (guess)';

class Unread extends Error {}
// ENOENT is a known "no file". Anything else (permissions, invalid JSON, not an object) is unknown: never read as empty.
function readJson(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw new Unread(`${e.code || e.message} in ${file}`); }
  let v;
  try { v = JSON.parse(text); } catch (e) { throw new Unread(`not valid JSON in ${file}`); }
  if (!isObj(v)) throw new Unread(`not a JSON object in ${file}`);
  return v;
}
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const obj = v => (isObj(v) ? v : {});

const cfg = process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude');
// With CLAUDE_CONFIG_DIR set, Claude Code keeps .claude.json inside it (docs wording; not verified on every version).
const claudeJson = path.join(process.env.CLAUDE_CONFIG_DIR ? cfg : homedir(), '.claude.json');
const dir = path.resolve(dirArg || process.cwd());
const proj = path.join(dir, '.claude', 'settings.json'), local = path.join(dir, '.claude', 'settings.local.json');
const bak = proj + '.bak', bakMark = bak + '.dalang';
// A long film session compacts near this many tokens instead of near the model's whole window (Claude Code clamps the
// value to 100K..the model window, so a 200K model is unchanged). Set by init when no scope sets its own.
const COMPACT_WINDOW = '200000';
let compactSet = false;
let localFiles = []; // the settings.local.json files items() found and read (the folder's and the repository root's)
const sha = b => createHash('sha256').update(b).digest('hex');
const q = s => (/[^\w@%+=:,./-]/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s); // shell-safe in a printed command
const self = fileURLToPath(import.meta.url);
// DALANG's own subagent types (agents/dalang-*.md): a builder, checker or researcher with only the tools it uses starts at
// ~15K tokens of context instead of ~50K for general-purpose, on every turn. init --yes copies them to <folder>/.claude/agents.
const AGENTS = path.join(path.dirname(self), '..', 'agents'), agentDir = path.join(dir, '.claude', 'agents');
const agentNames = existsSync(AGENTS) ? readdirSync(AGENTS).filter(f => /^dalang-.+\.md$/.test(f)) : [];
const agentsStale = () => agentNames.filter(f => !existsSync(path.join(agentDir, f)) || !readFileSync(path.join(agentDir, f)).equals(readFileSync(path.join(AGENTS, f))));

// The git repository a session started in `start` belongs to. Claude Code (v2.1.211+) keeps settings.local.json at its root
// (a worktree: the main checkout's root) and reads it as well as the folder's own. Returns { local, keys } or null:
// `local` = the root whose .claude/settings.local.json is read, `keys` = folders ~/.claude.json may key local-scope
// servers by. null when there is no repository, or the docs' exceptions apply (root is the home directory, Windows, a root
// or its .git / .claude not owned by this user: the file stays with settings.json). A .git that cannot be read or
// understood is Unread: an unknown root is never "no root".
function gitRoot(start) {
  for (let d = start; ; d = path.dirname(d)) {
    const g = path.join(d, '.git'), st = statSync(g, { throwIfNoEntry: false });
    if (st) {
      let root = d, keys = [d];
      if (!st.isDirectory()) {
        let t;
        try { t = readFileSync(g, 'utf8'); } catch (e) { throw new Unread(`${e.code || e.message} in ${g}`); }
        const m = /^gitdir:\s*(.+?)\s*$/m.exec(t);
        if (!m) throw new Unread(`${g} is not a git folder or a "gitdir:" pointer`);
        const wt = /^(.*)[\\/]\.git[\\/]worktrees[\\/][^\\/]+[\\/]?$/.exec(path.resolve(d, m[1])); // a submodule has no such path: its own root
        if (wt) { root = wt[1]; keys = [d, root]; }
      }
      if (root === homedir() || process.platform === 'win32') return null;
      const uid = process.getuid?.();
      for (const x of [root, path.join(root, '.git'), path.join(root, '.claude')]) {
        const s = statSync(x, { throwIfNoEntry: false });
        if (s && uid !== undefined && s.uid !== uid) return null;
      }
      return { local: root, keys };
    }
    if (path.dirname(d) === d) return null;
  }
}

function items() {
  let repo;
  try { repo = gitRoot(dir); } catch (e) { throw e instanceof Unread ? e : new Unread(`${e.code || e.message} while looking for the git root of ${dir}`); }
  const root = repo && repo.local !== dir ? repo.local : null;
  const user = readJson(path.join(cfg, 'settings.json')), p = readJson(proj), l = readJson(local);
  const rl = root ? readJson(path.join(root, '.claude', 'settings.local.json')) : null; // wins over the folder's own file
  const installed = readJson(path.join(cfg, 'plugins', 'installed_plugins.json'));
  const cj = readJson(claudeJson);
  const mjs = [dir, root].filter(Boolean).map(d => readJson(path.join(d, '.mcp.json')));
  localFiles = [[local, l], [root && path.join(root, '.claude', 'settings.local.json'), rl]].filter(([f, v]) => f && v).map(([f]) => f);
  const scopes = [['local', rl], ['local', l], ['project', p], ['user', user]];
  const out = [];
  const names = new Set([...Object.keys(obj(installed?.plugins)), ...scopes.flatMap(([, s]) => Object.keys(obj(s?.enabledPlugins)))]);
  for (const name of names) {
    const hit = scopes.find(([, s]) => typeof obj(s?.enabledPlugins)[name] === 'boolean');
    const on = hit ? obj(hit[1].enabledPlugins)[name] : true; // installed with no entry anywhere: on
    out.push({ kind: 'plugin', name, from: hit ? hit[0] : 'installed', on, video: KEEP.test(name) || keepArg.includes(name), job: jobOf(name), overridden: on && p?.enabledPlugins?.[name] === false });
  }
  const deny = new Set(scopes.flatMap(([, s]) => (Array.isArray(s?.deniedMcpServers) ? s.deniedMcpServers : []).map(x => x?.serverName).filter(Boolean)));
  const mcp = new Map();
  // Local-scope servers sit in ~/.claude.json under a project folder: the folder itself and, in a repository, its root (how
  // Claude Code keys a subfolder session is not documented, so both are read; denying a server that is not loaded is harmless).
  const keyed = [...new Set([dir, ...(repo ? repo.keys : [])])].map(k => ['local', obj(cj?.projects)[k]?.mcpServers]);
  for (const [from, src] of [...mjs.map(m => ['.mcp.json', m?.mcpServers]), ...keyed, ['user', cj?.mcpServers]])
    for (const name of Object.keys(obj(src))) mcp.set(name, from);
  for (const [name, from] of mcp) out.push({ kind: 'mcp', name, from, on: !deny.has(name), video: KEEP.test(name) || keepArg.includes(name), job: jobOf(name), overridden: false });
  // Every call also lists each user skill (~/.claude/skills), the CLI's bundled skills and the account's claude.ai connectors.
  const ovr = Object.assign({}, ...[...scopes].reverse().map(([, s]) => obj(s?.skillOverrides)));   // the first scope wins
  let skills = [];
  try { skills = readdirSync(path.join(cfg, 'skills'), { withFileTypes: true }).filter(d => d.isDirectory() || d.isSymbolicLink()).map(d => d.name); }
  catch (e) { if (e.code !== 'ENOENT') throw new Unread(`${e.code || e.message} reading ${path.join(cfg, 'skills')}`); }
  for (const name of skills) out.push({ kind: 'skill', name, from: 'user', on: ovr[name] !== 'off', video: KEEP.test(name) || keepArg.includes(name), job: jobOf(name), overridden: false });
  const first = get => scopes.map(([, s]) => get(s)).find(v => v !== undefined);
  const set = (name, on, job) => out.push({ kind: 'set', name, from: 'cli', on, video: keepArg.includes(name), job, overridden: false });
  set('bundled-skills', first(s => s?.disableBundledSkills) !== true, 'CLI built-in skills (loop, schedule, …)');
  compactSet = first(s => obj(s?.env).CLAUDE_CODE_AUTO_COMPACT_WINDOW) !== undefined || process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW !== undefined;
  set('claudeai-connectors', String(first(s => obj(s?.env).ENABLE_CLAUDEAI_MCP_SERVERS) ?? process.env.ENABLE_CLAUDEAI_MCP_SERVERS) !== 'false', 'account connectors (deploy, docs, …)');
  return out;
}

const line = (i, tag = i.on ? 'on' : 'off') => `${tag.padEnd(7)} ${i.kind.padEnd(6)} ${i.name}  (${i.job}; ${i.from})`;
const fail = (e, what = 'settings', not = '"nothing enabled"') => {
  if (!(e instanceof Unread)) throw e;
  if (asJson) console.log(JSON.stringify({ error: e.message }));
  else console.error(`could not read ${what}: ${e.message} — rerun; this is not ${not}`);
  process.exit(1);
};
const refuse = msg => { if (asJson) console.log(JSON.stringify({ error: msg })); else console.error(msg); process.exit(1); };

// Is the .claude/settings.json.bak init's own? 'none' | 'own' | 'foreign'. Own = the sidecar written with it holds the
// SHA-256 of exactly these bytes. A .bak left by a person or an editor, or edited since, is foreign: never adopted, restored or deleted.
function bakState() {
  if (!existsSync(bak)) return 'none';
  let bytes, mark;
  try { bytes = readFileSync(bak); } catch (e) { throw new Unread(`${e.code || e.message} in ${bak}`); }
  try { mark = JSON.parse(readFileSync(bakMark, 'utf8')); } catch { return 'foreign'; }
  return isObj(mark) && mark.sha256 === sha(bytes) ? 'own' : 'foreign';
}
const foreignMsg = `${bak} was not written by init (or was edited since): move it away, or delete it if you do not need it, then rerun. Nothing was changed.`;

// The first model call's context. Missing, all 0 or summed over several calls is Unread, never 0.
function firstCall(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch (e) { throw new Unread(`${e.code || e.message} in ${file}`); }
  let recs;
  try { const v = JSON.parse(text); recs = Array.isArray(v) ? v : [v]; }
  catch { recs = text.split('\n').filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch { return null; } }); }
  for (const r of recs) {
    if (!isObj(r)) continue;
    let u;
    if (r.type === 'result' && isObj(r.usage)) {
      if (r.num_turns !== 1) throw new Unread(`${file} sums ${r.num_turns ?? 'an unknown number of'} model calls, not the first (use a one-turn -p run or a session transcript)`);
      u = r.usage;
    } else if (r.type === 'assistant' && !r.isSidechain && isObj(r.message?.usage)) u = r.message.usage;
    if (!u) continue;
    const parts = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].map(k => (Number.isFinite(u[k]) ? u[k] : 0));
    const tokens = parts.reduce((a, b) => a + b, 0);
    if (tokens === 0) throw new Unread(`${file} has usage but every input count is 0 (the call failed, e.g. not signed in)`);
    return { tokens, parts };
  }
  throw new Unread(`no model call with usage in ${file}`);
}

if (cmd === 'measure') {
  let runs;
  try { runs = positional.slice(1).map(f => ({ file: path.resolve(f), ...firstCall(path.resolve(f)) })); } catch (e) { fail(e, 'the first-call context', '0 tokens'); }
  const [a, b] = runs;
  if (asJson) console.log(JSON.stringify(b ? { before: a.tokens, after: b.tokens, percent: Math.round((b.tokens / a.tokens) * 100) } : { tokens: a.tokens }));
  else {
    const show = (r, tag) => console.log(`${tag}first-call context: ${r.tokens} tokens (input ${r.parts[0]} + cache creation ${r.parts[1]} + cache read ${r.parts[2]})`);
    show(a, b ? 'before: ' : '');
    if (b) { show(b, 'after:  '); console.log(`after is ${Math.round((b.tokens / a.tokens) * 100)}% of before (${b.tokens - a.tokens} tokens)`); }
  }
  process.exit(0);
}

if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) { console.error(`${dir} is not a folder`); process.exit(2); }

if (cmd === 'status') {
  let list;
  try { list = items(); } catch (e) { fail(e); }
  const toOff = list.filter(i => i.on && !i.video), lean = toOff.length === 0 && compactSet;
  if (asJson) console.log(JSON.stringify({ dir, lean, items: list, overridden: list.filter(i => i.overridden).map(i => i.name), agentsMissing: agentsStale() }));
  else {
    for (const i of list) console.log(line(i));
    console.log(`Lean: ${lean ? 'yes' : 'no'} — ${toOff.length} item${toOff.length === 1 ? '' : 's'} a video never uses ${toOff.length === 1 ? 'is' : 'are'} on`);
    console.log(`Auto-compact window: ${compactSet ? 'set' : `not set (init --yes sets ${COMPACT_WINDOW})`}`);
    const stale = agentsStale();
    console.log(`Agents: ${stale.length ? `${stale.join(', ')} not installed or out of date (init --yes installs them)` : 'dalang-* installed'}`);
  }
}

if (cmd === 'init') {
  let list;
  try { list = items(); } catch (e) { fail(e); }
  const toOff = list.filter(i => i.on && !i.video);
  for (const i of list) console.log(line(i, !i.on ? 'was off' : i.video ? 'keep' : 'off'));
  const stale = agentsStale();
  if (stale.length) console.log(`agents  ${stale.join(', ')} → ${agentDir} (lean subagent types)`);
  if (!compactSet) console.log(`set     env CLAUDE_CODE_AUTO_COMPACT_WINDOW=${COMPACT_WINDOW} (a long session compacts near 200K)`);
  if (!toOff.length && !stale.length && compactSet) { console.log('already lean: nothing to switch off.'); process.exit(0); }
  const apply = `node ${q(self)} init ${q(dir)}${keepArg.length ? ` --keep ${q(keepArg.join(','))}` : ''} --yes`;
  if (!yes) { console.log(`\nNothing written. Ask the user; to apply (only ${path.join(dir, '.claude', 'settings.json')}${stale.length ? ' and the dalang-*.md agents' : ''} change): ${apply}`); process.exit(0); }
  if (stale.length) { mkdirSync(agentDir, { recursive: true }); for (const f of stale) copyFileSync(path.join(AGENTS, f), path.join(agentDir, f)); console.log(`Installed ${stale.length} agent type(s) in ${agentDir}.`); }
  if (!toOff.length && compactSet) { console.log(`Takes effect in the next Claude session started in ${dir}.`); process.exit(0); }
  let cur;
  try { cur = readJson(proj); } catch (e) { fail(e); }
  if (cur && ((cur.enabledPlugins !== undefined && !isObj(cur.enabledPlugins)) || (cur.deniedMcpServers !== undefined && !Array.isArray(cur.deniedMcpServers))))
    fail(new Unread(`enabledPlugins is not an object or deniedMcpServers is not a list in ${proj}`));
  let owned;
  try { owned = bakState(); } catch (e) { fail(e); }
  if (owned === 'foreign') refuse(foreignMsg);
  mkdirSync(path.dirname(proj), { recursive: true });
  // The first backup init wrote holds the state before DALANG touched it: never overwrite it. 0 bytes = there was no file.
  // The sidecar with its hash is what makes it init's own; written after it, so a crash between them leaves a foreign-looking .bak (refused, never adopted).
  if (owned === 'none') {
    if (cur) copyFileSync(proj, bak); else writeFileSync(bak, '');
    writeFileSync(bakMark, JSON.stringify({ sha256: sha(readFileSync(bak)) }) + '\n');
  }
  const next = { ...(cur || {}), enabledPlugins: { ...obj(cur?.enabledPlugins) }, deniedMcpServers: [...(Array.isArray(cur?.deniedMcpServers) ? cur.deniedMcpServers : [])] };
  for (const i of toOff) {
    if (i.kind === 'plugin') next.enabledPlugins[i.name] = false;
    else if (i.kind === 'skill') next.skillOverrides = { ...obj(next.skillOverrides), [i.name]: 'off' };
    else if (i.name === 'bundled-skills') next.disableBundledSkills = true;
    else if (i.name === 'claudeai-connectors') next.env = { ...obj(next.env), ENABLE_CLAUDEAI_MCP_SERVERS: 'false' };
    else if (!next.deniedMcpServers.some(x => x?.serverName === i.name)) next.deniedMcpServers.push({ serverName: i.name });
  }
  if (!compactSet) next.env = { ...obj(next.env), CLAUDE_CODE_AUTO_COMPACT_WINDOW: COMPACT_WINDOW };
  if (!toOff.some(i => i.kind === 'plugin') && !cur?.enabledPlugins) delete next.enabledPlugins;
  if (!next.deniedMcpServers.length) delete next.deniedMcpServers;
  writeFileSync(proj, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nWrote ${proj} (${toOff.length} switched off${compactSet ? '' : `, auto-compact window ${COMPACT_WINDOW}`}).`);
  let still = [];
  try { still = items().filter(i => i.on && !i.video).map(i => i.name); } catch { /* the write itself succeeded */ }
  if (still.length) console.log(`still on: ${still.join(', ')} — settings.local.json turns them on (${localFiles.join(', ') || 'a local file'}); edit that file to switch them off`);
  console.log(`Takes effect in the next Claude session started in ${dir}. Undo: node ${q(self)} undo ${q(dir)}`);
}

if (cmd === 'undo') {
  const ours = agentNames.filter(f => existsSync(path.join(agentDir, f)));
  ours.forEach(f => rmSync(path.join(agentDir, f)));
  if (ours.length) console.log(`removed ${ours.length} dalang agent type(s) from ${agentDir}`);
  let owned;
  try { owned = bakState(); } catch (e) { fail(e); }
  if (owned === 'none') { console.log('nothing to undo (no .claude/settings.json.bak)'); process.exit(0); }
  if (owned === 'foreign') refuse(foreignMsg);
  if (statSync(bak).size === 0) { rmSync(proj, { force: true }); console.log(`removed ${proj}: there was no settings file before init`); }
  else { copyFileSync(bak, proj); console.log(`restored ${proj} from before init; edits made since are gone`); }
  rmSync(bak);
  rmSync(bakMark, { force: true });
}
