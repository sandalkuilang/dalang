#!/usr/bin/env node
// Step 0 in one call: every tool, voice engine and media source dalang needs, checked in parallel.
// Prints one compact line per item (OK / MISSING / WARN + the fix), so the agent reads ~15 lines
// instead of running a dozen commands. Never prints secrets.
//
// Usage: node preflight.mjs [--vs-url http://localhost:3900] [--json]

import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
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
    ['  TTS model', ttsOk ? 'OK' : 'MISSING', ttsOk ? `${tts.model || 'k2-fsa/OmniVoice'}` : 'install with consent (references/voice.md "Models")'],
    ['  ASR (word timing)', asrOk ? 'OK' : 'MISSING', asrOk ? `${asr.engine} ${asrRepo}` : `active: ${asr.engine || 'none'} ${asrRepo || ''} not installed — install faster-whisper turbo + tier "balanced" (references/voice.md)`],
    ['  AudioSeal watermark', sealOk ? 'OK' : 'MISSING', sealOk ? '' : 'pre-download outside the backend before the first generation (references/voice.md)'],
  ];
}

async function elevenlabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return [['ElevenLabs', 'WARN', 'no key — fine, use VoiceStudio']];
  const s = await get('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } });
  if (!s || s.status !== 200) return [['ElevenLabs', 'WARN', `key rejected (${s?.status ?? 'network'}) — check permissions`]];
  const b = s.body;
  return [['ElevenLabs', 'OK', `tier ${b.tier}, ${b.character_count}/${b.character_limit} characters used${b.tier === 'free' ? ' — free: non-commercial, no cloning/library voices' : ''}`]];
}

async function media() {
  const [r, mflux] = await Promise.all([run('npx', ['--yes', 'hyperframes', 'media-use', 'resolve', '--doctor'], 120000), run('mflux-generate', ['--help'], 15000)]);
  const lines = (r.out + r.err).split('\n');
  const heygen = lines.some(l => /^✓.*heygen/i.test(l)) && !lines.some(l => /^✗.*heygen/i.test(l));
  const stale = lines.find(l => /skill.*(out of date|missing)/i.test(l));
  const out = [
    ['Images (photoreal)', heygen || mflux.ok ? 'OK' : 'WARN', heygen || mflux.ok ? [heygen && 'HeyGen', mflux.ok && 'mflux'].filter(Boolean).join(' + ') : 'no generator — use user photos or CC0/CC BY photos, or offer HeyGen sign-in / mflux (references/visual-direction.md §1)'],
    ['Music', heygen ? 'OK' : 'WARN', heygen ? 'HeyGen' : 'no generator — offer HeyGen sign-in or local MusicGen; 19 bundled SFX still work'],
  ];
  if (stale) out.push(['HyperFrames skills', 'WARN', `${stale.trim()} — npx hyperframes skills update (ask first)`]);
  return out;
}

const groups = await Promise.all([tools(), voicestudio(), elevenlabs(), media()]);
const rows = groups.flat();
if (asJson) console.log(JSON.stringify(rows.map(([item, status, note]) => ({ item, status, note }))));
else for (const [item, status, note] of rows) console.log(`${status.padEnd(7)} ${item.padEnd(22)} ${note}`);
const voiceOk = rows.some(([i, s]) => i === '  ASR (word timing)' && s === 'OK') || rows.some(([i, s]) => i === 'ElevenLabs' && s === 'OK');
if (!asJson) console.log(voiceOk ? '\nVoice: ready.' : '\nVoice: no engine ready yet — fix VoiceStudio (free) or set an ElevenLabs key.');
