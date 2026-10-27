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
//           `deniedMcpServers` for MCP servers), keeps every other key, and saves the old file once as
//           settings.json.bak (0 bytes = there was no file). User-level files and settings.local.json are never written.
//   undo    puts the file from before init back byte for byte (or removes it when there was none), then drops the .bak.
//   --keep  more items to leave on (a plugin's `name@marketplace`, or an MCP server's name), comma separated.
//
// Only plugin and server NAMES are printed, never their env, args, headers or URLs (MCP configs can hold tokens).

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
if (!['status', 'init', 'undo'].includes(cmd)) { console.error('usage: workspace.mjs <status|init|undo> [videos-folder] [--keep a,b] [--yes] [--json]'); process.exit(2); }

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
const mcpJson = path.join(dir, '.mcp.json'), bak = proj + '.bak';
const q = s => (/[^\w@%+=:,./-]/.test(s) ? `'${s.replace(/'/g, `'\\''`)}'` : s); // shell-safe in a printed command
const self = fileURLToPath(import.meta.url);

function items() {
  const user = readJson(path.join(cfg, 'settings.json')), p = readJson(proj), l = readJson(local);
  const installed = readJson(path.join(cfg, 'plugins', 'installed_plugins.json'));
  const cj = readJson(claudeJson), mj = readJson(mcpJson);
  const scopes = [['local', l], ['project', p], ['user', user]];
  const out = [];
  const names = new Set([...Object.keys(obj(installed?.plugins)), ...scopes.flatMap(([, s]) => Object.keys(obj(s?.enabledPlugins)))]);
  for (const name of names) {
    const hit = scopes.find(([, s]) => typeof obj(s?.enabledPlugins)[name] === 'boolean');
    const on = hit ? obj(hit[1].enabledPlugins)[name] : true; // installed with no entry anywhere: on
    out.push({ kind: 'plugin', name, from: hit ? hit[0] : 'installed', on, video: KEEP.test(name) || keepArg.includes(name), job: jobOf(name), overridden: on && p?.enabledPlugins?.[name] === false });
  }
  const deny = new Set(scopes.flatMap(([, s]) => (Array.isArray(s?.deniedMcpServers) ? s.deniedMcpServers : []).map(x => x?.serverName).filter(Boolean)));
  const mcp = new Map();
  for (const [from, src] of [['.mcp.json', mj?.mcpServers], ['local', obj(cj?.projects)[dir]?.mcpServers], ['user', cj?.mcpServers]])
    for (const name of Object.keys(obj(src))) mcp.set(name, from);
  for (const [name, from] of mcp) out.push({ kind: 'mcp', name, from, on: !deny.has(name), video: KEEP.test(name) || keepArg.includes(name), job: jobOf(name), overridden: false });
  return out;
}

const line = (i, tag = i.on ? 'on' : 'off') => `${tag.padEnd(7)} ${i.kind.padEnd(6)} ${i.name}  (${i.job}; ${i.from})`;
const fail = e => {
  if (!(e instanceof Unread)) throw e;
  if (asJson) console.log(JSON.stringify({ error: e.message }));
  else console.error(`could not read settings: ${e.message} — rerun; this is not "nothing enabled"`);
  process.exit(1);
};

if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) { console.error(`${dir} is not a folder`); process.exit(2); }

if (cmd === 'status') {
  let list;
  try { list = items(); } catch (e) { fail(e); }
  const toOff = list.filter(i => i.on && !i.video), lean = toOff.length === 0;
  if (asJson) console.log(JSON.stringify({ dir, lean, items: list, overridden: list.filter(i => i.overridden).map(i => i.name) }));
  else {
    for (const i of list) console.log(line(i));
    console.log(`Lean: ${lean ? 'yes' : 'no'} — ${toOff.length} item${toOff.length === 1 ? '' : 's'} a video never uses ${toOff.length === 1 ? 'is' : 'are'} on`);
  }
}

if (cmd === 'init') {
  let list;
  try { list = items(); } catch (e) { fail(e); }
  const toOff = list.filter(i => i.on && !i.video);
  for (const i of list) console.log(line(i, !i.on ? 'was off' : i.video ? 'keep' : 'off'));
  if (!toOff.length) { console.log('already lean: nothing to switch off.'); process.exit(0); }
  const apply = `node ${q(self)} init ${q(dir)}${keepArg.length ? ` --keep ${q(keepArg.join(','))}` : ''} --yes`;
  if (!yes) { console.log(`\nNothing written. Ask the user; to apply (only ${path.join(dir, '.claude', 'settings.json')} changes): ${apply}`); process.exit(0); }
  let cur;
  try { cur = readJson(proj); } catch (e) { fail(e); }
  if (cur && ((cur.enabledPlugins !== undefined && !isObj(cur.enabledPlugins)) || (cur.deniedMcpServers !== undefined && !Array.isArray(cur.deniedMcpServers))))
    fail(new Unread(`enabledPlugins is not an object or deniedMcpServers is not a list in ${proj}`));
  mkdirSync(path.dirname(proj), { recursive: true });
  // The first backup holds the state before DALANG touched it: never overwrite it. 0 bytes = there was no file.
  if (!existsSync(bak)) { if (cur) copyFileSync(proj, bak); else writeFileSync(bak, ''); }
  const next = { ...(cur || {}), enabledPlugins: { ...obj(cur?.enabledPlugins) }, deniedMcpServers: [...(Array.isArray(cur?.deniedMcpServers) ? cur.deniedMcpServers : [])] };
  for (const i of toOff) {
    if (i.kind === 'plugin') next.enabledPlugins[i.name] = false;
    else if (!next.deniedMcpServers.some(x => x?.serverName === i.name)) next.deniedMcpServers.push({ serverName: i.name });
  }
  if (!toOff.some(i => i.kind === 'plugin') && !cur?.enabledPlugins) delete next.enabledPlugins;
  if (!next.deniedMcpServers.length) delete next.deniedMcpServers;
  writeFileSync(proj, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nWrote ${proj} (${toOff.length} switched off).`);
  let still = [];
  try { still = items().filter(i => i.on && !i.video).map(i => i.name); } catch { /* the write itself succeeded */ }
  if (still.length) console.log(`still on: ${still.join(', ')} — .claude/settings.local.json turns them on; edit that file to switch them off`);
  console.log(`Takes effect in the next Claude session started in ${dir}. Undo: node ${q(self)} undo ${q(dir)}`);
}

if (cmd === 'undo') {
  if (!existsSync(bak)) { console.log('nothing to undo (no .claude/settings.json.bak)'); process.exit(0); }
  if (statSync(bak).size === 0) { rmSync(proj, { force: true }); console.log(`removed ${proj}: there was no settings file before init`); }
  else { copyFileSync(bak, proj); console.log(`restored ${proj} from before init; edits made since are gone`); }
  rmSync(bak);
}
