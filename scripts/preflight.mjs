#!/usr/bin/env node
// Step 0 in one call: every tool, voice engine and media source dalang needs, checked in parallel.
// Prints one compact line per item (OK / MISSING / WARN + the fix), so the agent reads ~15 lines
// instead of running a dozen commands. Never prints secrets.
//
// Usage: node preflight.mjs [--vs-url http://localhost:3900] [--json]

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const vsArg = args.indexOf('--vs-url');
const vsUrl = (vsArg >= 0 ? args[vsArg + 1] : 'http://localhost:3900').replace(/\/+$/, '');
const asJson = args.includes('--json');

const run = (cmd, argv, timeout = 60000) => new Promise(res =>
  execFile(cmd, argv, { timeout, maxBuffer: 8 << 20 }, (err, stdout, stderr) => res({ ok: !err, out: String(stdout || ''), err: String(stderr || err?.message || '') })));
const get = (url, init = {}, ms = 8000) => fetch(url, { ...init, signal: AbortSignal.timeout(ms) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => null);

async function tools() {
  const [ff, fp, hf] = await Promise.all([run('ffmpeg', ['-version']), run('ffprobe', ['-version']), run('npx', ['--yes', 'hyperframes', 'doctor', '--json'], 120000)]);
  const major = Number(process.versions.node.split('.')[0]);
  // `ok` turns false for optional extras (whisper-cpp, Kokoro); only required checks count.
  let hfOk = false;
  try {
    const d = JSON.parse(hf.out.slice(hf.out.indexOf('{')));
    hfOk = (d.checks || []).every(c => c.ok || /optional/i.test(`${c.detail} ${c.hint || ''}`));
  } catch { /* npx or hyperframes missing */ }
  return [
    ['node', major >= 22 ? 'OK' : 'MISSING', `v${process.versions.node}${major >= 22 ? '' : ' — needs 22+'}`],
    ['ffmpeg/ffprobe', ff.ok && fp.ok ? 'OK' : 'MISSING', ff.ok && fp.ok ? '' : 'install ffmpeg (macOS: brew install ffmpeg)'],
    ['hyperframes', hfOk ? 'OK' : 'MISSING', hfOk ? '' : 'npx hyperframes skills update (ask first), then restart Claude'],
  ];
}

async function voicestudio() {
  const health = await get(`${vsUrl}/health`);
  if (!health || health.status !== 200) return [['VoiceStudio', 'MISSING', `backend not answering at ${vsUrl} — install/open the app (references/voice.md)`]];
  const [models, prof] = await Promise.all([get(`${vsUrl}/models`, {}, 20000), get(`${vsUrl}/api/settings/performance-profile`)]);
  const list = Array.isArray(models?.body) ? models.body : (models?.body?.models || []);
  const ready = id => { const m = list.find(x => x.repo_id === id); return !!m && m.installed && !m.incomplete; };
  const tts = prof?.body?.selections?.tts || {};
  const asr = prof?.body?.selections?.asr || {};
  const ttsOk = ready(tts.model || 'k2-fsa/OmniVoice');
  // mlx-whisper's "model" is the engine name; its real weights default to whisper-large-v3-mlx.
  const asrRepo = asr.engine === 'mlx-whisper' && !String(asr.model).includes('/') ? 'mlx-community/whisper-large-v3-mlx' : asr.model;
  const asrOk = !!asrRepo && ready(asrRepo);
  const sealDir = path.join(process.env.AUDIOSEAL_CACHE_DIR || path.join(homedir(), '.cache'), 'audioseal');
  let sealOk = false;
  try { sealOk = readdirSync(sealDir).some(f => !f.includes('.partial') && statSync(path.join(sealDir, f)).size > 50e6); } catch { /* no cache */ }
  return [
    ['VoiceStudio', 'OK', `v${health.body?.version ?? '?'} on ${health.body?.device ?? '?'}`],
    ['  TTS model', ttsOk ? 'OK' : 'MISSING', ttsOk ? `${tts.model || 'k2-fsa/OmniVoice'}${/omnivoice/i.test(tts.model || 'omnivoice') ? ' — weights CC-BY-NC: non-commercial videos only (references/voice.md "Licence")' : ''}` : 'install with consent (references/voice.md "Models")'],
    ['  ASR (word timing)', asrOk ? 'OK' : 'MISSING', asrOk ? `${asr.engine} ${asrRepo}` : `active: ${asr.engine || 'none'} ${asrRepo || ''} not installed — install faster-whisper turbo + tier "balanced" (references/voice.md)`],
    ['  AudioSeal watermark', sealOk ? 'OK' : 'MISSING', sealOk ? '' : 'pre-download outside the backend before the first generation (references/voice.md)'],
  ];
}

async function elevenlabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  // Paid service: reported, never required, never used unless the user asks.
  if (!key) return [['ElevenLabs (paid)', 'SKIP', 'no key — not needed, free VoiceStudio is the default']];
  const s = await get('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
  if (!s || s.status !== 200) return [['ElevenLabs (paid)', 'SKIP', `key rejected (${s?.status ?? 'network'}) — not needed`]];
  const b = s.body;
  return [['ElevenLabs (paid)', 'PAID', `optional, only if the user asks — tier ${b.tier}, ${b.character_count}/${b.character_limit} characters used${b.tier === 'free' ? '; free tier: non-commercial, no cloning/library voices' : ''}`]];
}

// ACE-Step 1.5 has no CLI on PATH: its checkout is ACESTEP_DIR, or one of the usual clone places.
const aceDir = () => [process.env.ACESTEP_DIR, path.join(homedir(), 'ACE-Step-1.5'), path.join(homedir(), 'tools', 'ACE-Step-1.5')].find(d => d && existsSync(path.join(d, 'checkpoints', 'acestep-v15-turbo')) && existsSync(path.join(d, '.venv', 'bin', 'python')));
const aceReady = () => Boolean(aceDir());

async function media() {
  const [r, mflux, ace, sk] = await Promise.all([run('npx', ['--yes', 'hyperframes', 'media-use', 'resolve', '--doctor'], 120000), run('mflux-generate-z-image-turbo', ['--help'], 15000), Promise.resolve({ ok: aceReady() }), run('npx', ['--yes', 'hyperframes', 'skills', 'check', '--json'], 60000)]);
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
    // Free path only: mflux (stills; `--help` also catches a broken Pillow) and ACE-Step (music: no CLI, found by its checkout). HeyGen spends metered credits, so it is listed as paid.
    ['Images (photoreal)', mflux.ok ? 'OK' : 'WARN', mflux.ok ? 'mflux + Z-Image Turbo (free, local)' : 'no free generator — real subjects come from user photos/footage or free licensed photos/video; offer local mflux (free; ask before installing) (references/visual-direction.md §1)'],
    ['Music', ace.ok ? 'OK' : 'WARN', ace.ok ? `ACE-Step 1.5 (free, local, MIT) at ${aceDir()}` : 'no free generator (or ACESTEP_DIR unset) — offer local ACE-Step 1.5 (MIT, ~8.5 GB; ask before installing); never MusicGen (non-commercial weights); 19 bundled SFX still work'],
    ...(heygen ? [['HeyGen (paid)', 'PAID', 'signed in — metered credits; optional, only if the user asks']] : []),
  ];
  // Forced aligner (tts_timestamps.mjs): which languages have a local model.
  const root = process.env.ALIGN_MODELS || path.join(homedir(), '.cache', 'dalang', 'align');
  let langs = []; try { langs = readdirSync(root).filter(l => existsSync(path.join(root, l, 'config.json'))); } catch {}
  const py = process.env.DALANG_PYTHON || path.join(homedir(), 'Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python');
  if (langs.length && !existsSync(py)) langs = []; // a model without its Python can't run
  out.push(['Word aligner', langs.length ? 'OK' : 'INFO', langs.length ? `local models: ${langs.join(', ')} (sharper word timing)` : 'no local model — timing from transcript; optional download per language (references/voice.md "Forced alignment")']);
  if (stale) out.push(['HyperFrames skills', 'WARN', `${stale} — npx hyperframes skills update (ask first)`]);
  if (process.env.GEMINI_API_KEY) out.push(['Snapshots', 'WARN', 'GEMINI_API_KEY is set — `hyperframes snapshot` uploads frames to Gemini unless you pass --describe false']);
  return out;
}

const groups = await Promise.all([tools(), voicestudio(), elevenlabs(), media()]);
const rows = groups.flat();
if (asJson) console.log(JSON.stringify(rows.map(([item, status, note]) => ({ item, status, note }))));
else for (const [item, status, note] of rows) console.log(`${status.padEnd(7)} ${item.padEnd(22)} ${note}`);
const voiceOk = ['  ASR (word timing)', '  TTS model'].every(n => rows.some(([i, s]) => i === n && s === 'OK'));
if (!asJson) console.log(voiceOk ? '\nVoice: ready (free, VoiceStudio).' : '\nVoice: VoiceStudio not ready — fix it (free, references/voice.md "Setup"); a paid engine only if the user asks.');
