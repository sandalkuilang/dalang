#!/usr/bin/env node
// Step 0 in one call: every tool, voice engine and media source dalang needs, checked in parallel.
// Prints one compact line per item (OK / MISSING / WARN / INFO / PAID / SKIP, and for VoiceStudio also
// STOPPED / BUSY / DOWN / UNREACHABLE / CONFLICT, + the fix), so the agent reads ~15 lines instead of running a
// dozen commands. Never prints secrets.
//
// Usage: node preflight.mjs [--vs-url http://localhost:3900] [--json] [--start] [--check-skill] [--skill-dir PATH]
//   --check-skill  only the DALANG clone check (is the installed skill behind origin/main?): fetch only, never pulls.
//                  --skill-dir points it at another folder.
//   --start  VoiceStudio STOPPED (macOS app installed, not running): open it and wait ≤ 60 s for the backend.
//            Checks VoiceStudio only (the rest was just checked), so the run stays inside a 120 s tool timeout.

import { execFile } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const vsArg = args.indexOf('--vs-url');
const vsEq = args.find(a => a.startsWith('--vs-url='));
const vsRaw = vsEq ? vsEq.slice('--vs-url='.length) : vsArg >= 0 ? args[vsArg + 1] : 'http://localhost:3900';
if (!/^https?:\/\//.test(vsRaw || '')) { console.error('--vs-url needs a URL, e.g. http://192.168.1.20:3900'); process.exit(2); }
const vsUrl = vsRaw.replace(/\/+$/, '');
const asJson = args.includes('--json');
const start = args.includes('--start');
const checkSkill = args.includes('--check-skill');
const sdArg = args.indexOf('--skill-dir'), sdEq = args.find(a => a.startsWith('--skill-dir='));
const sdRaw = sdEq ? sdEq.slice('--skill-dir='.length) : sdArg >= 0 ? args[sdArg + 1] : fileURLToPath(new URL('..', import.meta.url));
if (!sdRaw) { console.error('--skill-dir needs a path'); process.exit(2); }
const skillDir = path.resolve(sdRaw);

const run = (cmd, argv, timeout = 60000, env) => new Promise(res =>
  execFile(cmd, argv, { timeout, maxBuffer: 8 << 20, env: { ...process.env, ...env } }, (err, stdout, stderr) => res({ ok: !err, killed: !!err?.killed, out: String(stdout || ''), err: String(stderr || err?.message || '') })));
// Never null: a failure keeps why it failed, because a refused port (nothing running) and a timeout
// (running but busy) need opposite fixes, and "couldn't read" must never read as "none".
const get = (url, init = {}, ms = 8000) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
  .then(async r => ({ status: r.status, body: await r.json().catch(() => null) }))
  .catch(e => ({ status: 0, body: null, err: e.name === 'TimeoutError' ? 'timeout'
    // localhost tries ::1 and 127.0.0.1; one refusal among mixed errnos (IPv6 off) still means nothing listens.
    : e.cause?.code === 'ECONNREFUSED' || e.cause?.errors?.some(x => x.code === 'ECONNREFUSED') ? 'ECONNREFUSED'
    : (e.cause?.code || e.message) }));
const why = r => r.err || (r.status === 200 ? 'unexpected reply' : `HTTP ${r.status}`);
const denied = r => r.status === 401 || r.status === 403;
const deniedNote = r => `backend refused the read (${why(r)}: auth or loopback-only) — dalang sends no API key; open that backend to this machine without a key, or run dalang where it runs`;

async function tools() {
  const [ff, fp, hf] = await Promise.all([run('ffmpeg', ['-version']), run('ffprobe', ['-version']), run('npx', ['--yes', 'hyperframes', 'doctor', '--json'], 120000)]);
  const major = Number(process.versions.node.split('.')[0]);
  // `ok` turns false for optional extras (whisper-cpp, Kokoro); only required checks count.
  let hfOk = false;
  try {
    const d = JSON.parse(hf.out.slice(hf.out.indexOf('{')));
    // Docker only serves `render --docker`, which dalang never uses.
    hfOk = (d.checks || []).every(c => c.ok || /optional/i.test(`${c.detail} ${c.hint || ''}`) || /docker/i.test(c.name || ''));
  } catch { /* npx or hyperframes missing */ }
  return [
    ['node', major >= 22 ? 'OK' : 'MISSING', `v${process.versions.node}${major >= 22 ? '' : ' — needs 22+'}`],
    ['ffmpeg/ffprobe', ff.ok && fp.ok ? 'OK' : 'MISSING', ff.ok && fp.ok ? '' : 'install ffmpeg (macOS: brew install ffmpeg)'],
    ['hyperframes', hfOk ? 'OK' : 'MISSING', hfOk ? '' : 'asked in Brief Call 0: npx hyperframes skills update, then restart Claude'],
  ];
}

const vsU = (() => { try { return new URL(vsUrl); } catch { return null; } })();
const vsLocal = !!vsU && ['localhost', '127.0.0.1', '[::1]'].includes(vsU.hostname);
const appPort = vsU?.port === '3900'; // the app always serves :3900; another local port is some other backend
const mac = process.platform === 'darwin';
// Hardware, not the Node binary: an x64 Node under Rosetta still runs on Apple silicon. Intel Macs get the UI only.
const appleSilicon = mac && (await run('/usr/sbin/sysctl', ['-n', 'hw.optional.arm64'], 5000)).out.trim() === '1';
// ponytail: macOS app paths only; Linux/Windows report DOWN ("open it or install it"), with no --start path.
const vsApp = vsLocal && appPort && appleSilicon ? ['/Applications/VoiceStudio.app', path.join(homedir(), 'Applications/VoiceStudio.app')].find(existsSync) : undefined;
// Its venv exists only once the first launch finished downloading the runtime.
const vsPython = path.join(homedir(), 'Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python');
const START_WAIT_MS = 60000; // instant refused probe + 60 s + one 6 s poll + 8 s reads ≈ 75 s < 120 s tool timeout
const waitS = `${START_WAIT_MS / 1000} s`;
const isVs = h => h.status === 200 && h.body?.version != null;

function vsDown(h, opened, appRunning) {
  if (!vsLocal) return ['UNREACHABLE', h.err === 'ECONNREFUSED'
    ? `nothing listens at ${vsUrl} — ask the user to start it on that machine; install nothing here`
    : `backend at ${vsUrl} not answering (${why(h)}): busy or unreachable — ask the user; never restart a backend that may be running a job; install nothing here`];
  if (h.status === 200 || (h.status >= 400 && h.status < 500)) return ['CONFLICT', `something else answers at ${vsUrl} (${why(h)}) — not VoiceStudio: free the port or pass --vs-url`];
  // A timeout, 5xx or reset is a running backend that is busy or starting: never restart it.
  if (h.err !== 'ECONNREFUSED') return ['BUSY', opened
    ? `opened; backend up but still starting (${why(h)}) — rerun preflight in a minute, no --start needed`
    : `backend up but not answering /health (${why(h)}): an inline download or another session's job — wait a minute and rerun; never restart or reinstall it`];
  // Refused: nothing listens. The app may still be running while it restarts its backend (it does every ~60 s when stuck).
  if (appRunning) return ['BUSY', 'app running, backend (re)starting — rerun preflight in a minute; never restart or reinstall it'];
  if (!vsApp) {
    if (!mac || !appPort) return ['DOWN', `nothing at ${vsUrl} — if VoiceStudio (or the backend on that port) is installed, open it and rerun preflight; otherwise install it with consent (references/voice.md "Setup")`];
    if (!appleSilicon) return ['MISSING', 'Intel Mac: the app has no local backend — pass --vs-url <remote backend>; install nothing'];
    return ['MISSING', `not in /Applications — install it with consent (references/voice.md "Setup")`];
  }
  const firstLaunch = !existsSync(vsPython);
  if (!opened) return ['STOPPED', firstLaunch
    ? 'installed, never launched: its first launch downloads a runtime (several GB, 10+ min) — ask the user first, then --start'
    : `installed, not running — rerun with --start (opens it, waits ≤ ${waitS})`];
  if (!opened.ok) return ['STOPPED', `could not open ${vsApp} (${opened.err.trim().slice(0, 120)}) — ask the user to open it`];
  return ['STOPPED', firstLaunch
    ? 'opened; first launch is downloading its runtime (several GB, 10+ min) — rerun --start every few minutes, never your own polling loop'
    : `opened, but no backend within ${waitS} — rerun --start once; still down → ask the user to look at the app window`];
}

async function voicestudio() {
  let health = await get(`${vsUrl}/health`);
  let opened = null, appRunning = false;
  if (!isVs(health) && health.err === 'ECONNREFUSED' && vsApp) {
    // Anchored to the start of the command line: another shell whose arguments mention the path can't match.
    appRunning = (await run('pgrep', ['-f', `^${vsApp}/Contents/MacOS/`], 5000)).ok;
    if (start && !appRunning) {
      opened = await run('open', [vsApp]);
      if (opened.ok) for (const t0 = Date.now(); Date.now() - t0 < START_WAIT_MS; await new Promise(r => setTimeout(r, 3000))) {
        health = await get(`${vsUrl}/health`, {}, 3000);
        if (isVs(health)) break;
      }
    }
  }
  if (!isVs(health)) return [['VoiceStudio', ...vsDown(health, opened, appRunning)]];
  const readMs = opened ? 8000 : 20000; // keeps a --start run inside the tool timeout
  const [models, prof, voices] = await Promise.all(['/models', '/api/settings/performance-profile', '/v1/audio/voices'].map(u => get(vsUrl + u, {}, readMs)));
  // Saved profiles, so a voice the user names in the request is matched here, not searched for elsewhere.
  // Names are quoted: a name holding "; " or a newline can't fake another entry or row.
  const vlist = voices.status === 200 && Array.isArray(voices.body?.voices) ? voices.body.voices : null;
  const saved = (vlist || []).filter(v => v.type === 'profile').map(v => `${JSON.stringify(String(v.name))} = ${v.voice_id}${v.language ? ` (${v.language})` : ''}`);
  // A real list always carries the built-in aliases: an empty or unknown-shaped one is unreadable, not "none".
  const oddTypes = !vlist?.length || vlist.some(v => !['profile', 'openai_alias', 'default'].includes(v.type));
  const voicesRow = denied(voices) ? ['  Voices', 'WARN', deniedNote(voices)]
    : !vlist ? ['  Voices', 'WARN', `could not list saved profiles (${why(voices)}) — rerun preflight; never assume none exist`]
    : saved.length ? ['  Voices', 'INFO', `saved profiles: ${saved.join('; ')}`]
    : oddTypes ? ['  Voices', 'WARN', 'voice list empty or of unknown shape — check `tts_timestamps.mjs --list-voices`; never assume none exist']
    : ['  Voices', 'INFO', 'no saved profile — design or clone one in Step 4 (references/voice.md)'];
  const vsOk = ['VoiceStudio', 'OK', `v${health.body.version} on ${health.body?.device ?? '?'}`];
  // Unreadable state is not missing state: a busy backend must never send the agent to reinstall GB of models.
  // An empty catalogue is a backend still loading (the real one lists every model it knows), not missing models.
  const list = Array.isArray(models.body) ? models.body : models.body?.models;
  const unread = models.status !== 200 || !Array.isArray(list) || !list.length ? models : prof.status !== 200 || !prof.body?.selections ? prof : null;
  if (unread) return [vsOk, ...['  TTS model', '  ASR (word timing)'].map(i => [i, 'WARN', denied(unread) ? deniedNote(unread) : `could not read model state (${why(unread)}) — backend busy; rerun preflight, install nothing`]), voicesRow];
  // A selection names its weights by repo id ("k2-fsa/OmniVoice") or, for some engines, by bare name ("voxcpm2"):
  // a bare name matches the repo's own name, case aside ("openbmb/VoxCPM2").
  const entry = id => list.find(x => x.repo_id === id) || (!String(id).includes('/') && list.find(x => String(x.repo_id).split('/').pop().toLowerCase() === String(id).toLowerCase()));
  const ready = id => { const m = entry(id); return !!m && m.installed && !m.incomplete; };
  const tts = prof.body.selections?.tts || {};
  const asr = prof.body.selections?.asr || {};
  const ttsOk = ready(tts.model || 'k2-fsa/OmniVoice');
  // mlx-whisper's "model" is the engine name; its real weights default to whisper-large-v3-mlx.
  const asrRepo = asr.engine === 'mlx-whisper' && !String(asr.model).includes('/') ? 'mlx-community/whisper-large-v3-mlx' : asr.model;
  const asrOk = !!asrRepo && ready(asrRepo);
  const sealDir = path.join(process.env.AUDIOSEAL_CACHE_DIR || path.join(homedir(), '.cache'), 'audioseal');
  let sealOk = false;
  try { sealOk = readdirSync(sealDir).some(f => !f.includes('.partial') && statSync(path.join(sealDir, f)).size > 50e6); } catch { /* no cache */ }
  return [
    vsOk,
    ['  TTS model', ttsOk ? 'OK' : 'MISSING', ttsOk ? `${entry(tts.model || 'k2-fsa/OmniVoice').repo_id}${/omnivoice/i.test(tts.model || 'omnivoice') ? ' — weights CC-BY-NC: non-commercial videos only (references/voice.md "Licence")' : ''}` : 'install with consent (references/voice.md "Models")'],
    ['  ASR (word timing)', asrOk ? 'OK' : 'MISSING', asrOk ? `${asr.engine} ${asrRepo}` : `active: ${asr.engine || 'none'} ${asrRepo || ''} not installed — install faster-whisper turbo + tier "balanced" (references/voice.md)`],
    // The watermark cache lives beside the backend: a local check says nothing about a remote one.
    !vsLocal ? ['  AudioSeal watermark', 'INFO', 'remote backend: pre-download it on that machine (references/voice.md)']
      : ['  AudioSeal watermark', sealOk ? 'OK' : 'MISSING', sealOk ? '' : 'pre-download outside the backend before the first generation (references/voice.md)'],
    voicesRow,
  ];
}

async function elevenlabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  // Paid service: reported, never required, never used unless the user asks.
  if (!key) return [['ElevenLabs (paid)', 'SKIP', 'no key — not needed, free VoiceStudio is the default']];
  const s = await get('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
  if (s.status !== 200) return [['ElevenLabs (paid)', 'SKIP', `key rejected or unreachable (${why(s)}) — not needed`]];
  const b = s.body;
  return [['ElevenLabs (paid)', 'PAID', `optional, only if the user asks — tier ${b.tier}, ${b.character_count}/${b.character_limit} characters used${b.tier === 'free' ? '; free tier: non-commercial, no cloning/library voices' : ''}`]];
}

async function media() {
  const [r, sk] = await Promise.all([run('npx', ['--yes', 'hyperframes', 'media-use', 'resolve', '--doctor'], 120000), run('npx', ['--yes', 'hyperframes', 'skills', 'check', '--json'], 60000)]);
  const lines = (r.out + r.err).split('\n');
  const heygen = lines.some(l => /^✓.*heygen/i.test(l)) && !lines.some(l => /^✗.*heygen/i.test(l));
  // Name the stale skills; optional skills that were never installed don't matter.
  let stale = null;
  try {
    const s = JSON.parse(sk.out.slice(sk.out.indexOf('{'))).skills || [];
    const used = ['hyperframes', 'hyperframes-cli', 'hyperframes-registry', 'media-use']; // what dalang loads
    const bad = s.filter(x => x.status === 'outdated' || (x.status === 'missing' && used.includes(x.name))).map(x => `${x.name} ${x.status}`);
    if (bad.length) stale = bad.join(', ');
  } catch { stale = lines.find(l => /skill.*(out of date|missing)/i.test(l))?.trim() || null; }
  const out = [
    // No image or music generator in the default path (references/brief.md): footage, photos, three.js and licensed tracks. HeyGen spends metered credits, so it is listed as paid.
    // Real motion footage: Pexels and Pixabay have free APIs (commercial-OK licences) but need a key the user signs up for.
    ['Stock video', process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY ? 'OK' : 'WARN', process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY ? `${['PEXELS_API_KEY', 'PIXABAY_API_KEY'].filter(k => process.env[k]).join(', ')} set (free, real motion footage)` : 'no key — asked in Brief Call 0: a free PEXELS_API_KEY (pexels.com/api) or PIXABAY_API_KEY; real footage is the cheapest way to make the subject move (references/visual-direction.md §1 rung 2)'],
    ...(heygen ? [['HeyGen (paid)', 'PAID', 'signed in — metered credits; optional, only if the user asks']] : []),
  ];
  // Forced aligner (tts_timestamps.mjs): which languages have a local model.
  const root = process.env.ALIGN_MODELS || path.join(homedir(), '.cache', 'dalang', 'align');
  let langs = []; try { langs = readdirSync(root).filter(l => existsSync(path.join(root, l, 'config.json'))); } catch {}
  const py = process.env.DALANG_PYTHON || vsPython;
  if (langs.length && !existsSync(py)) langs = []; // a model without its Python can't run
  out.push(['Word aligner', langs.length ? 'OK' : 'INFO', langs.length ? `local models: ${langs.join(', ')} (sharper word timing)` : 'no local model — timing from transcript; optional download per language (references/voice.md "Forced alignment")']);
  if (stale) out.push(['HyperFrames skills', 'WARN', `${stale} — asked in Brief Call 0: npx hyperframes skills update`]);
  if (process.env.GEMINI_API_KEY) out.push(['Snapshots', 'WARN', 'GEMINI_API_KEY is set — `hyperframes snapshot` uploads frames to Gemini unless you pass --describe false']);
  return out;
}

// The skill's own clone, read-only except the fetch (which writes inside its .git): behind origin/main means fixes
// the run would miss. Every unknown is a WARN to rerun, never "up to date", never "not a clone", never a reason to install.
// A pinned install (README: a tag clone, or a checkout of a tag) is detached: it moves by release, never by a pull.
//
// The one rule, enforced in one place: a row states a known fact only from git reads that succeeded. Every read goes
// through `g`, which throws Unread on any failure (an exit, a timeout, output of an unexpected shape), and skillClone
// turns every throw into "could not check". "Not a clone" is a known fact too: notClone() needs proof that no .git
// is here, and a .git it cannot rule out (present, or unreadable) makes it Unread as well.
const clean = t => String(t).replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, 80); // remote text printed to the agent
class Unread extends Error {}
const gitWhy = r => r.killed ? 'timeout' : clean(String(r.err).split('\n')[0]) || 'git failed';
async function skillClone() {
  const item = 'DALANG skill', dir = skillDir;
  try { return await readClone(item, dir); }
  catch (e) { return [[item, 'WARN', `could not check (${e instanceof Unread ? e.message : clean(e.message) || 'error'}) — rerun preflight; this is not "up to date"`]]; }
}
async function readClone(item, dir) {
  const q = /[^\w@%+=:,./-]/.test(dir) ? `'${dir.replace(/'/g, `'\\''`)}'` : dir; // shell-safe in the printed fix
  const exec = (...a) => run('git', ['-C', dir, ...a], 20000, { GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes', LC_ALL: 'C' });
  const g = async (...a) => { const r = await exec(...a); if (!r.ok) throw new Unread(gitWhy(r)); return r.out.trim(); };
  // A plain copy, proven: no .git entry here. A .git that git cannot read or skips (another owner, a corrupt HEAD
  // inside a repo higher up) is a clone whose state is unknown.
  const notClone = reason => {
    try { lstatSync(path.join(dir, '.git')); } catch (e) {
      if (e.code === 'ENOENT') return [[item, 'INFO', 'not a git clone — no update check; to update, clone the repo again (README "Install")']];
      throw new Unread(clean(e.message));
    }
    throw new Unread(reason);
  };
  const top = await exec('rev-parse', '--show-toplevel');
  if (!top.ok) { if (!top.killed && /not a git repository/i.test(top.err)) return notClone(gitWhy(top)); throw new Unread(gitWhy(top)); }
  // A copy or zip of the skill (or a folder inside some other repo) has no clone of its own to compare.
  if (realpathSync(top.out.trim()) !== realpathSync(dir)) return notClone('.git here is not the clone git reads');
  const [branch, status] = await Promise.all([g('rev-parse', '--abbrev-ref', 'HEAD'), g('status', '--porcelain', '--untracked-files=no')]);
  const dirty = status !== '', pl = n => n === 1 ? 'commit' : 'commits';
  if (branch === 'HEAD') return pinnedClone(g, item, q, dirty);
  if (branch !== 'main') return [[item, 'INFO', `on branch ${clean(branch)}, not main — no update check against origin/main; ask the user before switching branches`]];
  // The explicit refspec writes origin/main even in a single-branch clone, where a bare "origin main" only writes FETCH_HEAD.
  await g('fetch', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main');
  const [c, sj] = await Promise.all([g('rev-list', '--left-right', '--count', 'HEAD...origin/main'), g('log', '-1', '--format=%h %s', 'origin/main')]);
  const m = /^(\d+)\s+(\d+)$/.exec(c), [sha, ...subj] = sj.split(' ');
  if (!m || !/^[0-9a-f]{4,}$/.test(sha)) throw new Unread('unexpected git output for origin/main');
  const ahead = +m[1], behind = +m[2], latest = clean(subj.join(' '));
  if (behind > 0 && ahead > 0) return [[item, 'WARN', `diverged: ${behind} ${pl(behind)} behind and ${ahead} ahead of origin/main — cannot fast-forward; tell the user, never pull or reset on your own`]];
  if (behind > 0 && dirty) return [[item, 'WARN', `${behind} ${pl(behind)} behind (latest: ${latest}) but the clone has uncommitted changes — a pull may refuse; ask the user, never stash or reset on your own`]];
  if (behind > 0) return [[item, 'WARN', `${behind} ${pl(behind)} behind (latest: ${latest}) — asked in Brief Call 0: git -C ${q} pull --ff-only, then re-read SKILL.md`]];
  if (ahead > 0) return [[item, 'INFO', `${ahead} ${pl(ahead)} ahead of origin/main (local work) — nothing to pull`]];
  return [[item, 'OK', `up to date with origin/main (${sha})${dirty ? '; uncommitted local changes' : ''}`]];
}

// A detached HEAD is a pinned release: compare it with the newest release tag on origin (ls-remote writes nothing).
// "pull --ff-only" fails there ("not currently on a branch"), and the pin is the user's choice, so the note names the
// README update (fetch tags, check out the newest) and never moves to main. HEAD's tags come from `tag --points-at`,
// which succeeds with an empty list on an untagged commit: "not a release tag" is git's answer, never a failed read.
async function pinnedClone(g, item, q, dirty) {
  const semver = t => (/^v(\d+)\.(\d+)\.(\d+)$/.exec(t) || []).slice(1).map(Number);
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  const releases = list => list.filter(t => t && semver(t).length).sort((x, y) => cmp(semver(y), semver(x)));
  const [lt, here, sha] = await Promise.all([g('ls-remote', '--tags', '--refs', 'origin'), g('tag', '--points-at', 'HEAD'), g('rev-parse', '--short', 'HEAD')]);
  if (!/^[0-9a-f]{4,}$/.test(sha)) throw new Unread('unexpected git output for HEAD');
  const tags = releases(lt.split('\n').map(l => /\trefs\/tags\/(\S+)$/.exec(l)?.[1]));
  if (!tags.length) return [[item, 'INFO', 'detached HEAD and origin has no release tag (vX.Y.Z) — no update check']];
  const newest = tags[0], fix = `git -C ${q} fetch --tags origin && git -C ${q} checkout ${newest}`;
  const tag = releases(here.split('\n'))[0];
  if (!tag) return [[item, 'INFO', `detached at ${sha} (not a release tag), newest release is ${newest} — no update check; to move to it: ${fix}, then re-read SKILL.md`]];
  if (cmp(semver(tag), semver(newest)) >= 0) return [[item, 'OK', `pinned at ${tag} (detached), the newest release${dirty ? '; uncommitted local changes' : ''}`]];
  if (dirty) return [[item, 'WARN', `pinned at ${tag} (detached), newest release is ${newest} but the clone has uncommitted changes — a checkout may refuse; ask the user, never stash or reset on your own`]];
  return [[item, 'WARN', `pinned at ${tag} (detached), newest release is ${newest} — asked in Brief Call 0: ${fix}, then re-read SKILL.md; a pinned clone moves by release, not by a pull from main`]];
}

const groups = await Promise.all(checkSkill ? [skillClone()] : start ? [voicestudio()] : [skillClone(), tools(), voicestudio(), elevenlabs(), media()]);
const rows = groups.flat();
if (asJson) console.log(JSON.stringify(rows.map(([item, status, note]) => ({ item, status, note }))));
else for (const [item, status, note] of rows) console.log(`${status.padEnd(11)} ${item.padEnd(22)} ${note}`);
if (checkSkill) process.exit(0);
const voiceOk = ['  ASR (word timing)', '  TTS model'].every(n => rows.some(([i, s]) => i === n && s === 'OK'));
const nc = rows.some(([i, , n]) => i === '  TTS model' && /CC-BY-NC/.test(n));
// The summary repeats the fix that matters, so a filtered read still gets it.
const [, vsStatus, vsNote] = rows.find(([i]) => i === 'VoiceStudio');
const ttsRow = rows.find(([i]) => i === '  TTS model');
const unreadable = ttsRow?.[1] === 'WARN';
const sealMissing = rows.some(([i, s]) => i === '  AudioSeal watermark' && s === 'MISSING');
const missing = rows.filter(([i, s]) => ['  TTS model', '  ASR (word timing)', '  AudioSeal watermark'].includes(i) && s === 'MISSING').map(([i]) => i.trim());
const caveat = nc ? '; OmniVoice weights CC-BY-NC — tell the user before a monetised video' : '';
if (!asJson) console.log('\nVoice: ' + (voiceOk ? `ready (free, VoiceStudio${caveat})${sealMissing ? ' — but pre-download the AudioSeal watermark before the first generation (references/voice.md)' : ''}.`
  : vsStatus !== 'OK' ? `VoiceStudio ${vsStatus} — ${vsNote}. A paid engine only if the user asks.`
  : unreadable ? `VoiceStudio state unreadable — ${ttsRow[2]}.`
  : `VoiceStudio not ready — fix ${missing.join(' and ')} (free, references/voice.md "Setup")${caveat}; a paid engine only if the user asks.`));
