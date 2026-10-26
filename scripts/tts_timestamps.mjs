#!/usr/bin/env node
// Generate narration, then compute the timing of every word and every {beat}.
// Two engines:
//   voicestudio  (free, local VoiceStudio app, default) — timing comes from transcribing the audio
//                back with word timestamps, matched word by word to the narration
//   elevenlabs   (paid API, only with --engine elevenlabs) — timing from the API's character alignment
//
// Usage:
//   node tts_timestamps.mjs [--engine elevenlabs] --list-voices
//   node tts_timestamps.mjs --input narration.txt --out audio --voice default --language en --sample \
//        --instructions "female, young adult, low pitch" [--seed 42]
//                              -> designed voice; the same --seed gives the same timbre in the full take
//   node tts_timestamps.mjs --input narration.txt --out audio --voice <profile> --language en
//   node tts_timestamps.mjs --engine elevenlabs --input narration.txt --out audio --voice "Chris" --language en
//   node tts_timestamps.mjs --input narration.txt --out audio --from-response audio/narration.response.json
//                              -> re-time after moving {} markers, no new audio (language read from the response)
//   node tts_timestamps.mjs --input dialogue.txt --out audio --from-audio recording.mp4 --language en --own-recording
//                              -> the user's own recording is the voice track (VoiceStudio only transcribes it).
//                                 --own-recording states it is a human recording the user may use; without it the
//                                 file's origin is unknown and the take keeps the take it was cut from (a TTS take
//                                 retimed after editing stays that model's licence)
//   node tts_timestamps.mjs --input dialogue.txt --out audio --voices <name>=<voice>,<name>=<voice>
//                              -> multi-voice dialogue, one voice per speaker
//   node tts_timestamps.mjs --save-profile "<name>" --ref clip.wav [--ref-text "<words>"] --language en
//        [--instructions "..."] [--seed 42]
//                              -> VoiceStudio profile from a clean 3–10 s single-speaker clip (an approved
//                                 sample, or a voice whose owner gave permission); prints the id for --voice.
//                                 A --sample audition over 20 s is cut at its last word end <= 15 s when its
//                                 <name>.words.json is next to it (those words become the ref text).
//
//   node tts_timestamps.mjs --input narration.txt --out audio --voice <profile> --language en --retake auto
//                              -> after the take, every sentence with a low alignment run, an untimed word or heard words
//                                 that differ from the script is re-spoken alone (same voice and settings; the second try
//                                 with seed + 1), spliced in at the pauses around it (10 ms equal-power crossfade, never
//                                 inside a word), and the whole file is transcribed and timed again. At most two tries per
//                                 sentence, then a WARNING naming it. VoiceStudio single-voice takes only.
//   node tts_timestamps.mjs --input narration.txt --out audio --retake 3,5 [--from-response audio/narration.response.json]
//                              -> re-speak sentences 3 and 5 of the take on disk (no full take); --retake auto with
//                                 --from-response fixes that take instead of making a new one
//
// Dialogue files: every spoken line is "Speaker: text"; a line "(1.5)" is 1.5 s of silence; a leading
// [tag] on a line becomes that line's style hint. Output adds window.LINES (speaker, text, start, end).
//
// narration.txt format:
//   # Opening                  -> section marker (not spoken, its time is recorded)
//   A plain sentence, then {the beat words|beat_name}.
//                              -> {text} = beat, {text|name} = named beat (always name them)
//   [excited] ElevenLabs expression tags are allowed (stripped for voicestudio; use --instructions there).
//
// --language takes an ISO 639-1 code (en, id, es, ja, ...). Omit it to let the model auto-detect.
// --speed: ElevenLabs 0.7–1.2, VoiceStudio 0.25–4. --vs-url defaults to http://localhost:3900.
// --api-url (ElevenLabs, default https://api.elevenlabs.io): another base URL, for a test against a mock. The API key is sent there.
// --seed (VoiceStudio, default 42): fixed sampling seed, so an approved sample and the full take match.
// --align auto|off: off skips forced alignment (on by default when align.py, its Python deps and a model for
// --language are present; else timing comes from transcribing the audio).
// --model: VoiceStudio speaks with its active TTS model (the one preflight reports) unless --model names another. The take
// prints "Model : <name> — <licence>" and records the model in <name>.response.json _meta; scripts/check_assets.mjs
// checks the narration's ASSETS.json licence against it (scripts/voice_licences.mjs is the one table).
// DALANG_VS_BUSY_WAIT_S (env, default 180): seconds to wait after a VoiceStudio 503 (a job ran over its compute limit and
// still holds the device) before the one retry. Still busy: "WARN … rerun in a few minutes" and exit code 3 (never FAILED).
// --steps (VoiceStudio OmniVoice, default 32 = the model's documented quality preset; the app default is 16; 32 takes longer).
// Outputs: <out>/words.json ({ i, text, start, end, est?, score? } — est = timing estimated), beats.json,
// beats.js (BEATS, BEATS_LIST, SECTIONS, WORDS, NARRATION_DURATION[, LINES]), narration.srt (sidecar subtitles). The last line is "DONE <audio>".
// The ElevenLabs key is read from env ELEVENLABS_API_KEY and is never printed.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { voiceModel, unknownVoice, vsModelName } from './voice_licences.mjs';

let API = 'https://api.elevenlabs.io'; // --api-url replaces it (a mock in tests/voice-licence.mjs)
const MAX_CHARS = { elevenlabs: 9500, voicestudio: 4000 };
// ISO 639-1 → Whisper language code, only where they differ.
const WHISPER_LANG = { jv: 'jw', iw: 'he', 'zh-tw': 'zh', 'zh-cn': 'zh', 'pt-br': 'pt' };

function parseArgs(argv) {
  const a = { engine: 'voicestudio', out: 'audio', model: null, language: null, name: 'narration', format: null, vsUrl: 'http://localhost:3900', seed: 42, steps: 32, align: 'auto' };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) die(`Option ${k} needs a value.`);
      return v;
    };
    switch (k) {
      case '--input': a.input = next(); break;
      case '--out': a.out = next(); break;
      case '--voice': a.voice = next(); break;
      case '--voice-id': a.voiceId = next(); break;
      case '--model': a.model = next(); break;
      case '--language': a.language = next(); break;
      case '--no-language': a.language = null; break;
      case '--name': a.name = next(); break;
      case '--format': a.format = next(); break;
      case '--speed': a.speed = parseFloat(next()); break;
      case '--engine': a.engine = next(); break;
      case '--vs-url': a.vsUrl = next().replace(/\/+$/, ''); break;
      case '--api-url': API = next().replace(/\/+$/, ''); break;
      case '--instructions': a.instructions = next(); break;
      case '--sample': a.sample = true; break;
      case '--list-voices': a.listVoices = true; break;
      case '--from-response': a.fromResponse = next(); break;
      case '--from-audio': a.fromAudio = next(); break;
      case '--own-recording': a.ownRecording = true; break;
      case '--voices': a.voices = next().toLowerCase(); break;
      case '--seed': a.seed = parseInt(next(), 10); if (!Number.isInteger(a.seed)) die('--seed needs an integer'); break;
      case '--steps': a.steps = parseInt(next(), 10); break;
      case '--align': a.align = next(); if (!['auto', 'off'].includes(a.align)) die('--align takes auto or off'); break;
      case '--retake': a.retake = next(); if (!/^(auto|changed|\d+(,\d+)*)$/.test(a.retake)) die('--retake takes auto, changed or sentence numbers like 3,5'); break;
      case '--save-profile': a.saveProfile = next(); break;
      case '--ref': a.ref = next(); break;
      case '--ref-text': a.refText = next(); break;
      case '-h': case '--help': a.help = true; break;
      default: die(`Unknown option: ${k} (see --help)`);
    }
  }
  if (!['elevenlabs', 'voicestudio'].includes(a.engine)) die(`Unknown --engine ${a.engine}. Use elevenlabs or voicestudio.`);
  if (a.retake && a.engine === 'elevenlabs') die('--retake re-speaks with VoiceStudio; an ElevenLabs take is regenerated whole.');
  a.modelFrom = a.model ? '--model' : null;
  if (a.engine === 'elevenlabs') a.model ??= 'eleven_v4'; // VoiceStudio: the active model, read in main()
  if (a.engine === 'voicestudio') a.format = 'wav'; // parts are joined losslessly, then measured
  a.format ??= 'mp3_44100_128';
  return a;
}

function die(msg, code = 1) {
  console.error(`FAILED: ${msg}`);
  process.exit(code);
}

function apiKey() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) die('ELEVENLABS_API_KEY is not set. Set it in your own terminal: export ELEVENLABS_API_KEY=... (never in a project file).');
  return k;
}

async function api(pathname, { method = 'GET', body } = {}) {
  const res = await fetch(API + pathname, {
    method,
    headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) die(`ElevenLabs answered ${res.status}: ${text.slice(0, 600)}`);
  try { return JSON.parse(text); } catch { die(`ElevenLabs response is not JSON: ${text.slice(0, 200)}`); }
}

// ── VoiceStudio (local, OpenAI-compatible API) ──────────────────────────────
async function vs(a, pathname, init = {}, retried = false) {
  let res;
  try { res = await fetch(a.vsUrl + pathname, init); }
  catch (e) {
    const code = e.cause?.code || '';
    if (code === 'ECONNREFUSED') die(`VoiceStudio is not running at ${a.vsUrl}. Open the VoiceStudio app and wait until GET ${a.vsUrl}/health answers.`);
    if (code === 'UND_ERR_HEADERS_TIMEOUT') die(`VoiceStudio took over 5 minutes on ${pathname}. A first run may still be downloading a model; check the app, then retry.`);
    die(`VoiceStudio dropped the request on ${pathname} (${code || e.message}). The app restarts its backend when it stops answering — usually a model still downloading. Check the app, then retry.`);
  }
  if (!res.ok) {
    const body = await res.text();
    // 503: the server abandoned a job that ran over its compute limit and keeps the device until it finishes, so an
    // immediate retry competes with it. That is BUSY, not a failure: wait, retry once, then say "rerun" (exit 3).
    if (res.status === 503) {
      const short = body.replace(/\s+/g, ' ').slice(0, 200);
      if (!retried) {
        const s = Number(process.env.DALANG_VS_BUSY_WAIT_S ?? 180);
        console.log(`\nBUSY       : VoiceStudio answered 503 on ${pathname} (${short}) — waiting ${s} s for the device to finish its job, then retrying once.`);
        await new Promise(r => setTimeout(r, s * 1000));
        return vs(a, pathname, init, true);
      }
      console.error(`WARN: VoiceStudio is still busy on ${pathname} (${short}) — it is still finishing an abandoned job; rerun in a few minutes. Nothing is missing: do not restart VoiceStudio, install nothing, keep the engine.`);
      process.exit(3);
    }
    let detail = null; try { detail = JSON.parse(body).detail; } catch { /* not JSON */ }
    if (detail?.error === 'asr_model_missing') {
      const rec = detail.recommended || {};
      die(`VoiceStudio has no usable speech-to-text model for word timing. It wants ${rec.repo_id || detail.missing_repo_id} (${rec.size_gb ?? '?'} GB): get the user's consent, then POST ${a.vsUrl}/models/install {"repo_id":"${rec.repo_id || detail.missing_repo_id}"}.`);
    }
    // A clone profile made in the app from a long clip without a transcript: the engine can't crop or transcribe it.
    if (/reference transcription needs/i.test(body)) die(`VoiceStudio can't use this clone profile: its reference has no transcript (often a clip over 20 s made in the app) and no speech-to-text model is selected. Re-save it: cut 3–10 s of clean speech (ffmpeg -ss <start> -t 8 -i <clip> -vn -ac 1 ref.wav), then --save-profile "<name>" --ref ref.wav --language <lang> --ref-text "<exact words>" (references/voice.md "Clone").`);
    die(`VoiceStudio answered ${res.status} on ${pathname}: ${body.slice(0, 600)}`);
  }
  return res;
}

// Split text into chunks of whole lines (whole sentences when a line is too long), each well under
// VoiceStudio's 4,096-character cap and its 300 s compute limit per request. VoxCPM2 on a 16 GB Mac
// runs ~22× slower than real time, so its chunks stay near 120 characters (~9 s of speech) and never over: a sentence
// still longer than the limit splits after a comma (or another clause mark), then at a space.
const chunkMax = model => /voxcpm/i.test(model || '') ? 120 : 700;
function fit(s, max) {
  if (s.length <= max) return [s];
  const out = [];
  const add = piece => { if (out.length && (out[out.length - 1] + ' ' + piece).length <= max) out[out.length - 1] += ' ' + piece; else out.push(piece); };
  for (const clause of s.split(/(?<=[,;:—–、，；])\s*/).map(c => c.trim()).filter(Boolean)) {
    if (clause.length <= max) { add(clause); continue; }
    for (const w of clause.split(/\s+/)) {
      if (w.length <= max) add(w);
      else for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max)); // no space to cut at (CJK): every max characters
    }
  }
  return out;
}
function chunkLines(text, max = 700) {
  const out = [];
  const units = text.split('\n').map(l => l.trim()).filter(Boolean)
    .flatMap(l => l.length <= max ? [l] : (l.match(/[^.!?…。！？]+[.!?…。！？]*\s*/g) || [l]).map(s => s.trim()).filter(Boolean))
    .flatMap(u => fit(u, max));
  for (const line of units) {
    if (out.length && (out[out.length - 1] + ' ' + line).length <= max) out[out.length - 1] += ' ' + line;
    else out.push(line);
  }
  return out;
}

async function vsListVoices(a) {
  const data = await (await vs(a, '/v1/audio/voices')).json();
  for (const v of data.voices || []) console.log(`${String(v.name).padEnd(28)} ${String(v.voice_id).padEnd(24)} ${v.type}${v.language ? `, ${v.language}` : ''}`);
  if (data.engines) console.log(`\nEngines: ${JSON.stringify(data.engines).slice(0, 400)}`);
  console.log(`\nUse --voice "<name or voice_id>". Saved/cloned profiles give the most repeatable narration.`);
}

// A --sample audition is ~300 characters, longer than a profile reference. Its words.json (written next to it) says
// where words end: cut at the last timed word ending by 15 s, so the clip ends on a word and its text is known.
// null = no words file (the caller keeps the plain "too long" error); a file that cannot be used stops here.
function refCut(ref, dur) {
  const file = path.join(path.dirname(ref), `${path.parse(ref).name}.words.json`);
  if (!existsSync(file)) return null;
  let words;
  try { words = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { die(`reference is ${dur} s, over the engine's 20 s, and ${file} is not readable JSON (${e.message}). Cut 3–10 s of clean speech first.`); }
  if (!Array.isArray(words)) die(`reference is ${dur} s, over the engine's 20 s, and ${file} is not a word list. Cut 3–10 s of clean speech first.`);
  let k = -1;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w && !w.est && Number.isFinite(w.end) && w.end >= 3 && w.end <= 15) k = i;
  }
  if (k < 0) die(`reference is ${dur} s, over the engine's 20 s, and ${file} has no timed word ending between 3 and 15 s to cut at. Cut 3–10 s of clean speech first.`);
  const next = words[k + 1];
  // A small tail keeps the last phoneme; never past the next word's start nor past 15 s.
  const at = round(Math.min(words[k].end + 0.15, Number.isFinite(next?.start) ? next.start : Infinity, 15));
  return { at, n: k + 1, file, text: words.slice(0, k + 1).map(w => w.text).join(' ') };
}

// Save a clean clip as a VoiceStudio profile (clone). Without --ref-text the clip is transcribed.
async function vsSaveProfile(a) {
  if (!a.ref) die('--save-profile needs --ref <clean 3–10 s clip of one speaker>');
  const wav = path.join(a.out, `${a.saveProfile.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ref.wav`);
  await mkdir(a.out, { recursive: true });
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a.ref, '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav]); }
  catch (e) { die(`ffmpeg could not read ${a.ref}: ${e.message}`); }
  let dur = probeDuration(wav);
  if (dur > 20) {
    // Only without --ref-text: a text given for the whole clip cannot be cut to match.
    const cut = !a.refText && refCut(a.ref, dur);
    if (!cut) die(`reference is ${dur} s; the engine takes at most 20 s. Cut 3–10 s of clean speech first.`);
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a.ref, '-t', String(cut.at), '-vn', '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', wav]); }
    catch (e) { die(`ffmpeg could not cut ${a.ref}: ${e.message}`); }
    a.refText = cut.text;
    console.log(`Cut      : ${a.ref} (${dur} s) at ${cut.at} s, the first ${cut.n} words of ${cut.file} → ${wav}`);
    dur = probeDuration(wav);
  }
  if (dur && (dur < 3 || dur > 15)) console.warn(`WARNING: reference is ${dur} s; 3–10 s of clean speech clones best.`);
  const refText = a.refText || (await vsTranscribe(a, wav, '')).transcript.text.trim();
  const form = new FormData();
  form.append('name', a.saveProfile);
  form.append('ref_audio', new Blob([await readFile(wav)]), path.basename(wav));
  form.append('ref_text', refText);
  if (a.language) form.append('language', a.language);
  if (a.instructions) form.append('instruct', a.instructions);
  if (Number.isInteger(a.seed)) form.append('seed', String(a.seed));
  const p = await (await vs(a, '/profiles', { method: 'POST', body: form })).json();
  console.log(`Profile  : ${a.saveProfile} → id ${p.id ?? p.profile_id ?? JSON.stringify(p).slice(0, 200)}`);
  console.log(`Ref text : "${refText.slice(0, 120)}"`);
  console.log(`DONE use --voice ${p.id ?? p.profile_id ?? '<id>'}`);
}

// Speak with VoiceStudio, transcribe it back with word timestamps, and turn the words into
// an ElevenLabs-shaped character alignment so the rest of the pipeline stays the same.
// VoiceStudio matches a profile by voice_id only: an unknown name silently falls back to the default voice.
let vsVoices;
async function vsVoiceId(a, v) {
  if (!v || v === 'default') return 'default';
  vsVoices ??= (await (await vs(a, '/v1/audio/voices')).json()).voices || [];
  const want = v.trim().toLowerCase();
  const hit = vsVoices.find(x => String(x.voice_id).toLowerCase() === want) || vsVoices.find(x => String(x.name).toLowerCase() === want);
  if (!hit) die(`VoiceStudio has no voice "${v}" (it would silently use the default voice). List them with --list-voices`);
  return hit.voice_id;
}

// VoiceStudio's active TTS model, read as preflight reads it, so the take is spoken by the model the user was told
// about. Unreadable is not "none": stop and say so, never fall back to a default model.
async function vsActiveModel(a) {
  let sel, why = 'unexpected reply';
  try {
    const res = await fetch(`${a.vsUrl}/api/settings/performance-profile`, { signal: AbortSignal.timeout(30000) });
    if (res.ok) sel = (await res.json())?.selections; else why = `HTTP ${res.status}`;
  } catch (e) { why = e.cause?.code || e.name || 'no answer'; }
  if (!sel || typeof sel !== 'object') die(`could not read VoiceStudio's active TTS model (${why} from ${a.vsUrl}/api/settings/performance-profile) — rerun when the backend answers, or pass --model <name> (references/voice.md "Licence"). Nothing is missing; install nothing.`);
  return vsModelName(sel.tts?.model || 'k2-fsa/OmniVoice'); // no selection = the app default, as preflight reads it
}

// One line per generation: which model speaks, under which licence, and where the choice came from.
function modelLine(a, meta, from) {
  const v = voiceModel(meta);
  const lic = v ? `${v.licence}${v.nc ? ' — non-commercial: tell the user; ASSETS.json lists the narration so' : ''}` : `licence unknown (${unknownVoice(meta)})`;
  console.log(`Model      : ${meta.model}${meta.tier ? ` (plan ${meta.tier})` : ''} — ${lic} — ${from}`);
}

async function vsGenerate(a, text, audioPath) {
  await vsSpeak(a, text, audioPath);
  return vsTranscribe(a, audioPath, text);
}

// Speak `text` into `audioPath` (chunked for the engine, joined). `seed` lets a retake try another voice sample.
async function vsSpeak(a, text, audioPath, seed = a.seed) {
  const chunks = chunkLines(text, chunkMax(a.model));
  const parts = [];
  const voice = await vsVoiceId(a, a.voiceId || a.voice);
  for (const [k, input] of chunks.entries()) {
    const body = { model: a.model, input, voice, response_format: 'wav' };
    if (a.language) body.language = a.language;
    if (a.speed) body.speed = a.speed;
    // VoxCPM2 designs a voice from `description`; OmniVoice reads `instructions`.
    if (a.instructions) body[/voxcpm/i.test(a.model || '') ? 'description' : 'instructions'] = a.instructions;
    if (Number.isInteger(seed)) body.seed = seed;
    if (Number.isInteger(a.steps)) body.num_step = a.steps;
    const res = await vs(a, '/v1/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if ((res.headers.get('content-type') || '').includes('json')) die(`VoiceStudio returned JSON instead of audio: ${(await res.text()).slice(0, 400)}`);
    const part = chunks.length === 1 ? audioPath : `${audioPath}.part${k}.wav`;
    await writeFile(part, Buffer.from(await res.arrayBuffer()));
    parts.push(part);
    if (chunks.length > 1) process.stdout.write(`${k + 1}/${chunks.length} `);
  }
  if (parts.length > 1) await joinWavs(parts, audioPath);
}

async function joinWavs(parts, audioPath) {
  const list = `${audioPath}.parts.txt`;
  await writeFile(list, parts.map(p => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`).join('\n'));
  // Re-encode so parts with different rates or channel counts (speech vs generated silence) still join.
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', audioPath]); }
  catch (e) { die(`ffmpeg could not join the ${parts.length} audio parts: ${e.message}`); }
  await Promise.all([list, ...parts].map(f => rm(f, { force: true })));
}

// Dialogue: each line in its speaker's voice, "(1.5)" lines as real silence, then one transcription.
async function vsDialogue(a, seq, audioPath, text) {
  const voices = Object.fromEntries((a.voices || '').split(',').filter(Boolean).map(p => p.split('=').map(s => s.trim())));
  const parts = [];
  for (const [k, item] of seq.entries()) {
    const part = `${audioPath}.part${k}.wav`;
    if (item.pause) {
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(item.pause), part]);
    } else {
      const voice = voices[item.speaker.toLowerCase()] && await vsVoiceId(a, voices[item.speaker.toLowerCase()]);
      if (!voice) die(`No voice for speaker "${item.speaker}". Pass --voices ${[...new Set(seq.filter(s => s.speaker).map(s => s.speaker.toLowerCase()))].map(s => `${s}=<voice>`).join(',')}`);
      const body = { model: a.model, input: item.text, voice, response_format: 'wav' };
      if (a.language) body.language = a.language;
      if (a.speed) body.speed = a.speed;
      // VoxCPM2 designs a voice from `description`; OmniVoice reads `instructions`.
      if (item.style || a.instructions) body[/voxcpm/i.test(a.model || '') ? 'description' : 'instructions'] = [item.style, a.instructions].filter(Boolean).join(', ');
      if (Number.isInteger(a.seed)) body.seed = a.seed;
      if (Number.isInteger(a.steps)) body.num_step = a.steps;
      const res = await vs(a, '/v1/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if ((res.headers.get('content-type') || '').includes('json')) die(`VoiceStudio returned JSON instead of audio: ${(await res.text()).slice(0, 400)}`);
      await writeFile(part, Buffer.from(await res.arrayBuffer()));
    }
    parts.push(part);
    process.stdout.write(`${k + 1}/${seq.length} `);
  }
  await joinWavs(parts, audioPath);
  return vsTranscribe(a, audioPath, text);
}

// Transcribe an audio file back with word timestamps and turn the words into an
// ElevenLabs-shaped character alignment, so the rest of the pipeline stays the same.
async function vsTranscribe(a, audioPath, text, soft = false) {
  const form = new FormData();
  form.append('file', new Blob([await readFile(audioPath)]), path.basename(audioPath));
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  // Whisper spells a few languages differently from ISO 639-1; translate those, pass the rest through.
  if (a.language) form.append('language', WHISPER_LANG[a.language.toLowerCase()] || a.language.toLowerCase().split('-')[0]);
  // The narration as prompt nudges Whisper to spell words as written (numbers stay words),
  // so more words match exactly instead of being interpolated. Whisper keeps ~224 tokens.
  form.append('prompt', text.replace(/\s+/g, ' ').slice(0, 600));
  const tr = await (await vs(a, '/v1/audio/transcriptions', { method: 'POST', body: form })).json();
  const words = (tr.words || []).filter(w => Number.isFinite(w.start) && Number.isFinite(w.end));
  if (!words.length && soft) return null; // a retake's clip with no words: that try failed, the caller keeps the old audio
  if (!words.length) die('VoiceStudio transcription returned no word timestamps. Check that a speech-to-text model is installed (GET /models).');

  const characters = [], starts = [], ends = [];
  words.forEach((w, k) => {
    const chars = [...String(w.word).trim()];
    const step = (w.end - w.start) / Math.max(chars.length, 1);
    chars.forEach((c, j) => { characters.push(c); starts.push(round(w.start + j * step)); ends.push(round(w.start + (j + 1) * step)); });
    if (k < words.length - 1) { characters.push(' '); starts.push(w.end); ends.push(words[k + 1].start); }
  });
  return {
    audio_file: path.basename(audioPath),
    alignment: { characters, character_start_times_seconds: starts, character_end_times_seconds: ends },
    transcript: { text: tr.text, language: tr.language, words },
  };
}

async function listVoices() {
  const data = await api('/v1/voices');
  const voices = data.voices || [];
  for (const v of voices) {
    const l = v.labels || {};
    const info = [l.gender, l.age, l.accent, l.description || l.descriptive, l.use_case || l.use_cases].filter(Boolean).join(', ');
    console.log(`${v.name.padEnd(28)} ${v.voice_id}  ${info}`);
  }
  console.log(`\n${voices.length} voices. Use --voice "<name>" or --voice-id <id>.`);
}

async function resolveVoiceId(a) {
  if (a.voiceId) return a.voiceId;
  if (!a.voice) die('Pick a voice with --voice "<name>" or --voice-id <id>. List them with --list-voices');
  const data = await api('/v1/voices');
  const want = a.voice.trim().toLowerCase();
  const voices = data.voices || [];
  const hit = voices.find(v => v.name.toLowerCase() === want)
    || voices.find(v => v.name.toLowerCase().startsWith(want))
    || voices.find(v => v.name.toLowerCase().includes(want));
  if (!hit) die(`Voice "${a.voice}" not found. List them with --list-voices`);
  return hit.voice_id;
}

// Turn the raw narration into the clean text sent to the API,
// recording where each {beat} and # section marker sits.
const SPEAKER_RE = /^([\p{L}][\p{L}\p{N} _.'-]{0,30}):\s+(.+)$/u;
const PAUSE_RE = /^\(\s*(\d+(?:\.\d+)?)\s*s?\s*\)$/;

function parseNarration(raw, sample) {
  let lines = raw.replace(/\r\n/g, '\n').split('\n');
  const sectionsPending = [];
  let spokenLines = [];
  const seq = []; // dialogue order: { speaker, line } or { pause }
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('#')) { sectionsPending.push({ title: t.replace(/^#+\s*/, ''), lineIndex: spokenLines.length }); continue; }
    const p = t.match(PAUSE_RE);
    if (p) { seq.push({ pause: parseFloat(p[1]) }); continue; }
    seq.push({ line: spokenLines.length });
    spokenLines.push(t);
  }
  // Dialogue when every spoken line is "Speaker: text" (at least two lines).
  const dialogue = spokenLines.length >= 2 && spokenLines.every(l => SPEAKER_RE.test(l));
  const speakers = [];
  if (dialogue) {
    spokenLines = spokenLines.map(l => { const m = l.match(SPEAKER_RE); speakers.push(m[1].trim()); return m[2].trim(); });
  } else if (seq.some(s => s.pause)) {
    die('Pause lines like "(1.5)" only work in dialogue files, where every spoken line is "Speaker: text".');
  }
  let spoken = spokenLines.join('\n');
  if (sample) {
    // Whole sentences until about 300 spoken characters: long enough to measure pace,
    // still cheap. Two sentences (8 words) proved too short to calibrate.
    const flat = spoken.replace(/\n/g, ' ');
    const sentences = flat.match(/[^.!?…。！？]+[.!?…。！？]+\s*/g) || [flat];
    let out = '';
    // Never stop inside a {beat}: an unclosed brace fails the parse below.
    for (const s of sentences) { out += s; if (stripTags(out.replace(/[{}]|\|[^}]*\}/g, '')).length >= 300 && !/\{[^}]*$/.test(out)) break; }
    spoken = out.trim() || flat.slice(0, 300);
  }

  // Start of each line in the clean text (for section markers)
  let clean = '';
  const beats = [];
  const lineStartsClean = [];
  let inBeat = null;
  lineStartsClean.push(0);
  for (let i = 0; i < spoken.length; i++) {
    const ch = spoken[i];
    if (ch === '{') {
      if (inBeat) die('Found { inside { } — braces cannot be nested.');
      inBeat = { cs: clean.length };
      continue;
    }
    if (ch === '}') {
      if (!inBeat) die('Found } without a matching {.');
      // {text|name}: the |name part is not spoken
      beats.push({ cs: inBeat.cs, ce: clean.length, label: inBeat.label || null, text: clean.slice(inBeat.cs) });
      inBeat = null;
      continue;
    }
    if (ch === '|' && inBeat) {
      const close = spoken.indexOf('}', i);
      if (close === -1) die('Found {...| without a closing }.');
      inBeat.label = spoken.slice(i + 1, close).trim();
      i = close - 1; // the loop picks up the '}' next
      continue;
    }
    clean += ch;
    if (ch === '\n') lineStartsClean.push(clean.length);
  }
  if (inBeat) die('Found a { that is never closed with }.');
  const sections = sample ? [] : sectionsPending.map(s => ({ title: s.title, cleanIndex: lineStartsClean[s.lineIndex] ?? clean.length }));
  // Each dialogue line's span in the clean text, plus the order with pauses for multi-voice TTS.
  const dlines = dialogue && !sample ? speakers.map((speaker, k) => {
    const cs = lineStartsClean[k], ce = k + 1 < lineStartsClean.length ? lineStartsClean[k + 1] - 1 : clean.length;
    return { speaker, cs, ce, text: clean.slice(cs, ce) };
  }) : [];
  const order = dlines.length ? seq.map(s => s.pause ? { pause: s.pause } : (() => {
    const l = dlines[s.line];
    const style = (l.text.match(/^\s*\[([^\]]+)\]/) || [])[1]; // a leading [tag] becomes a style hint
    return { speaker: l.speaker, text: stripTags(l.text), style };
  })()) : [];
  // Lines that follow a written pause: their words cannot start before the pause is over.
  const gaps = [];
  seq.forEach((s, k) => { if (s.pause && seq[k + 1]?.line !== undefined && dlines[seq[k + 1].line]) gaps.push({ cs: dlines[seq[k + 1].line].cs, pause: s.pause }); });
  return { clean, beats, sections, dlines, order, gaps };
}

function buildLines(dlines, words) {
  return dlines.map(l => {
    const inside = words.filter(w => w._s < l.ce && w._e > l.cs);
    return { speaker: l.speaker, text: stripTags(l.text), start: inside.length ? inside[0].start : null, end: inside.length ? inside[inside.length - 1].end : null };
  });
}

// Map clean-text character index -> [start, end] from the ElevenLabs alignment.
function mapTimes(clean, alignment) {
  const chars = alignment.characters || [];
  const st = alignment.character_start_times_seconds || [];
  const en = alignment.character_end_times_seconds || [];
  const times = new Array(clean.length).fill(null);
  const joined = chars.join('');
  // owner[x] = alignment element index for code unit x of `joined` (safe for emoji etc.)
  const owner = [];
  chars.forEach((c, k) => { for (let u = 0; u < c.length; u++) owner.push(k); });
  if (joined === clean) {
    for (let i = 0; i < clean.length; i++) times[i] = [st[owner[i]], en[owner[i]]];
    return { times, exact: true };
  }
  // Common case: [tags] are missing from the alignment. Retry with tags dropped.
  for (const re of [/\[[^\]]*\]\s?/g, /\[[^\]]*\]/g, /\s?\[[^\]]*\]/g]) {
    const drop = new Array(clean.length).fill(false);
    for (const m of clean.matchAll(re)) for (let i = m.index; i < m.index + m[0].length; i++) drop[i] = true;
    const keep = [];
    for (let i = 0; i < clean.length; i++) if (!drop[i]) keep.push(i);
    if (keep.map(i => clean[i]).join('') === joined) {
      keep.forEach((ci, k) => { times[ci] = [st[owner[k]], en[owner[k]]]; });
      return { times, exact: true };
    }
  }
  // Fallback: match per WORD (like `diff`), so one word spelled differently
  // (e.g. number normalisation) does not shift every word after it.
  // Unmatched words stay empty and are interpolated in buildWords.
  const tokens = (str, skipTags) => {
    const out = [];
    const isWordChar = i => /[\p{L}\p{N}]/u.test(str[i]);
    const inTag = skipTags ? tagMask(str) : [];
    for (const m of str.matchAll(/\S+/g)) {
      if (skipTags && inTag[m.index]) continue;
      const s = m.index, e = m.index + m[0].length - 1;
      let a = s; while (a <= e && !isWordChar(a)) a++;
      let b = e; while (b >= s && !isWordChar(b)) b--;
      if (a > b) { a = s; b = e; }
      out.push({ norm: (stripPunct(m[0]) || m[0]).toLowerCase(), a, b });
    }
    return out;
  };
  const cw = tokens(clean, true);
  const aw = tokens(joined, false);
  const n = cw.length, m = aw.length;
  const pairs = [];
  if (n * m <= 30e6) {
    const W = m + 1;
    const dp = new Int32Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i * W + j] = cw[i].norm === aw[j].norm
          ? dp[(i + 1) * W + j + 1] + 1
          : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
      }
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (cw[i].norm === aw[j].norm) { pairs.push([i, j]); i++; j++; }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
      else j++;
    }
  } else {
    let j = 0;
    for (let i = 0; i < n; i++) {
      for (let k = j; k < Math.min(m, j + 8); k++) {
        if (cw[i].norm === aw[k].norm) { pairs.push([i, k]); j = k + 1; break; }
      }
    }
  }
  for (const [i, j] of pairs) {
    times[cw[i].a] = [st[owner[aw[j].a]], en[owner[aw[j].a]]];
    times[cw[i].b] = [st[owner[aw[j].b]], en[owner[aw[j].b]]];
  }
  return { times, exact: false };
}

// Character mask of every [tag] span. Tags can contain spaces ("[strong Scottish accent]"),
// so whitespace-split tokens can't be tested one by one.
const tagMask = str => {
  const m = new Array(str.length).fill(false);
  for (const t of str.matchAll(/\[[^\]]*\]/g)) for (let i = t.index; i < t.index + t[0].length; i++) m[i] = true;
  return m;
};
const stripTags = str => str.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
const stripPunct = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const round = x => Math.round(x * 1000) / 1000;

// Silent stretches (≥ 0.4 s) in the audio, so untimed words are not placed inside a pause.
function silences(file) {
  try {
    const r = execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'silencedetect=noise=-35dB:d=0.4', '-f', 'null', '-'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return parseSilences(r);
  } catch (e) { return parseSilences(String(e.stderr || '')); }
}
function parseSilences(log) {
  const out = []; let s = null;
  for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    if (m[1] === 'start') s = parseFloat(m[2]); else if (s !== null) { out.push([s, parseFloat(m[2])]); s = null; }
  }
  return out;
}

function buildWords(clean, times, quiet = [], gaps = []) {
  const words = [];
  const inTag = tagMask(clean);
  for (const m of clean.matchAll(/\S+/g)) {
    // "[excited]Hello" keeps "Hello"; a token of punctuation only ("—", "...") is not a word.
    let s = m.index; const e = m.index + m[0].length;
    while (s < e && inTag[s]) s++;
    const w = clean.slice(s, e);
    if (!w || !/[\p{L}\p{N}]/u.test(w)) continue;
    let t0 = null, t1 = null;
    for (let i = s; i < e; i++) if (times[i] && /[\p{L}\p{N}]/u.test(clean[i])) { t0 = times[i][0]; break; }
    for (let i = e - 1; i >= s; i--) if (times[i] && /[\p{L}\p{N}]/u.test(clean[i])) { t1 = times[i][1]; break; }
    if (t0 === null) for (let i = s; i < e; i++) if (times[i]) { t0 = times[i][0]; break; }
    if (t1 === null) for (let i = e - 1; i >= s; i--) if (times[i]) { t1 = times[i][1]; break; }
    words.push({ i: words.length, text: stripPunct(w) || w, start: t0, end: t1, _s: s, _e: e });
  }
  // Fill gaps: spread each run of untimed words evenly over the gap between its timed neighbours
  // (piling them on one instant would put a beat on the wrong moment). A run at the very start
  // ends at the next timed word; a run at the very end gets ~0.35 s a word.
  let missing = 0;
  const timed = w => w.start !== null && w.end !== null;
  for (let k = 0; k < words.length; k++) {
    if (timed(words[k])) continue;
    let j = k; while (j < words.length && !timed(words[j])) j++;
    const n = j - k;
    const prev = k > 0 ? words[k - 1] : null, next = j < words.length ? words[j] : null;
    const b = next ? next.start : (prev ? prev.end : 0) + 0.35 * n;
    let a = prev ? prev.end : Math.max(0, b - 0.35 * n);
    // A pause inside the gap means the missing words come after it.
    const pause = quiet.filter(([s, e]) => s >= a - 0.05 && e < b - 0.15 * n).pop();
    if (pause) a = pause[1];
    // A pause written in the script ("(1.5)") right before this run: start after it.
    const gap = gaps.find(g => words.findIndex(w => w._s >= g.cs) === k); // first spoken word of that line
    if (gap && prev) a = Math.min(Math.max(a, prev.end + gap.pause), b - 0.15 * n);
    const step = Math.max(0, b - a) / n;
    for (let m = 0; m < n; m++) Object.assign(words[k + m], { start: a + m * step, end: a + (m + 1) * step, est: true });
    missing += n;
    k = j - 1;
  }
  for (const w of words) { w.start = round(w.start); w.end = round(w.end); }
  return { words, missing };
}

// Beat timing comes from character times first, so it is exact even in languages
// written without spaces (ja, zh, th), where one "word" can be a whole sentence.
// Forced alignment: when the script is known, time each word against the audio with a CTC model
// (align.py, Apache-2.0 models only) instead of trusting the transcript. Sharper starts after pauses
// and no rewritten numbers. Falls back silently to transcribe-and-match: no Python deps, no model
// for the language, or the model not downloaded. Overwrites word times and the char times beats use.
const VS_PY = path.join(process.env.HOME || '', 'Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python');
function forceAlign(a, audioPath, clean, words, times) {
  const tmp = path.join(a.out, '_align');
  try {
    mkdirSync(tmp, { recursive: true });
    const txt = path.join(tmp, 'text.txt'), out = path.join(tmp, 'aligned.json');
    writeFileSync(txt, words.map(w => clean.slice(w._s, w._e)).join(' '));
    execFileSync(process.env.DALANG_PYTHON || VS_PY, [fileURLToPath(new URL('align.py', import.meta.url)), '--audio', audioPath, '--text', txt, '--lang', a.language.toLowerCase().split('-')[0], '--out', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    const al = JSON.parse(readFileSync(out, 'utf8'));
    if (al.length !== words.length) return { note: `aligner returned ${al.length} words for ${words.length}; kept transcript timing` };
    words.forEach((w, k) => {
      const x = al[k];
      w.score = x.score;
      // A low score with a transcript time: trust the transcript (names, loanwords the model can't spell).
      if ((x.score === null || x.score < 0.1) && !w.est) return;
      w.start = x.start; w.end = x.end;
      if (x.score === null || x.score < 0.1) w.est = true; else delete w.est;
      for (let i = w._s; i < w._e; i++) times[i] = [x.start, x.end];
    });
    return { ok: true };
  } catch (e) {
    const code = e.status;
    return { note: code === 3 ? `no commercial-OK alignment model for "${a.language}"` : code === 4 ? `alignment model for "${a.language}" not downloaded (once: python align.py --download ..., ~0.4–1.3 GB, Apache-2.0)` : `aligner unavailable (${String(e.stderr || e.message).trim().split('\n').pop().slice(0, 120)})` };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

function buildBeats(beats, words, times, clean) {
  const used = new Set();
  const isChar = i => /[\p{L}\p{N}]/u.test(clean[i]);
  return beats.map((b, n) => {
    const inside = words.filter(w => w._s < b.ce && w._e > b.cs);
    let name = b.label || `b${n + 1}`;
    if (!/^[A-Za-z_$][\w$]*$/.test(name)) name = `b${n + 1}`;
    while (used.has(name)) name = `${name}_${n + 1}`;
    used.add(name);
    if (!inside.length) return { name, text: b.text.trim(), start: null, end: null, warning: 'no matching word found' };
    let start = null, end = null;
    for (let i = b.cs; i < b.ce; i++) if (times[i] && isChar(i)) { start = round(times[i][0]); break; }
    for (let i = b.ce - 1; i >= b.cs; i--) if (times[i] && isChar(i)) { end = round(times[i][1]); break; }
    return { name, text: b.text.trim(), start: start ?? inside[0].start, end: end ?? inside[inside.length - 1].end, word_index: inside[0].i };
  });
}

// Sidecar subtitles for the upload (burned-in captions alone don't reach screen readers or translation):
// cues of ≤ 2 lines × 42 characters, broken at sentence ends and pauses, each ≥ 1 s and gone before the next.
function buildSrt(words, clean) {
  const cues = []; let cur = [];
  const flush = () => { if (cur.length) cues.push(cur); cur = []; };
  words.forEach((w, k) => {
    const tok = clean.slice(w._s, w._e);
    const text = [...cur.map(x => x.tok), tok].join(' ');
    if (cur.length && (text.length > 84 || w.start - cur[cur.length - 1].end > 0.5)) flush();
    cur.push({ tok, start: w.start, end: w.end });
    if (/[.!?…]["')\]]*$/.test(tok)) flush();
  });
  flush();
  const ts = t => new Date(Math.max(0, t) * 1000).toISOString().slice(11, 23).replace('.', ',');
  return cues.map((c, i) => {
    const next = cues[i + 1]?.[0].start ?? Infinity;
    const end = Math.max(c[0].start + 0.04, Math.min(Math.max(c[c.length - 1].end, c[0].start + 1), next - 0.05));
    let text = c.map(x => x.tok).join(' ');
    if (text.length > 42) { const mid = text.lastIndexOf(' ', Math.ceil(text.length / 2)); if (mid > 0) text = `${text.slice(0, mid)}\n${text.slice(mid + 1)}`; }
    return `${i + 1}\n${ts(c[0].start)} --> ${ts(end)}\n${text}\n`;
  }).join('\n');
}

function buildSections(sections, words) {
  return sections.map(s => {
    const w = words.find(x => x._s >= s.cleanIndex);
    return { title: s.title, start: w ? w.start : null };
  });
}

function probeDuration(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    const d = parseFloat(out.trim());
    return Number.isFinite(d) ? round(d) : null;
  } catch { return null; }
}

// Timing of one take: the transcript's character times matched to the narration, then (when it can) forced alignment.
// `align` lets a caller time a take without running the aligner.
function timeTake(a, response, clean, gaps, audioPath, align = a.align) {
  const alignment = response.alignment || response.normalized_alignment;
  const { times, exact } = mapTimes(clean, alignment);
  let { words, missing } = buildWords(clean, times, response.transcript ? silences(audioPath) : [], gaps);
  // ElevenLabs returns exact character times; only transcribed timing benefits from alignment.
  const aligned = !response.transcript || align === 'off' ? null
    : a.language ? forceAlign(a, audioPath, clean, words, times) : { note: 'no --language, so no alignment model' };
  if (aligned?.ok) { missing = words.filter(w => w.est).length; for (const w of words) { w.start = round(w.start); w.end = round(w.end); } }
  return { times, exact, words, missing, aligned };
}

// ── Sentence retake ─────────────────────────────────────────────────────────
// A sentence the voice got wrong is re-spoken alone and spliced into the take at the pauses around it; the whole
// file is then transcribed and timed again. Flagged = a low alignment run, an untimed word, or heard words that
// differ from the script.
const RATE = 24000;
const XFADE = 240; // 10 ms at 24 kHz: the equal-power crossfade at each splice, always inside a pause
const SENTENCE_SEP = /(?<=[.!?…。！？]["'”’)\]]*)[ \t]+|\n+/g;
const NO_SPACES = /^(ja|zh|th|lo|km|my)(-|$)/i; // one "word" is a whole sentence there: heard-vs-script words cannot be compared

// The sentences of the clean text that hold a spoken word: { n (1-based), cs, ce, text, words }.
function sentencesOf(clean, words) {
  const spans = []; let cs = 0;
  for (const m of clean.matchAll(SENTENCE_SEP)) { spans.push([cs, m.index]); cs = m.index + m[0].length; }
  spans.push([cs, clean.length]);
  const out = [];
  for (const [s, e] of spans) {
    const ws = words.filter(w => w._s >= s && w._s < e);
    if (ws.length) out.push({ n: out.length + 1, cs: s, ce: e, text: stripTags(clean.slice(s, e)).trim(), words: ws });
  }
  return out;
}

// Where each sentence's audio starts and ends: the cut between two sentences is the middle of the longest silence
// between the last word of one and the first of the next (else the middle of that gap), so a splice never lands in a word.
function regionsOf(sents, quiet, dur) {
  const cut = (prev, next) => {
    const lo = prev.words[prev.words.length - 1].end, hi = next.words[0].start;
    if (!(hi > lo)) return (lo + hi) / 2;
    let best = null;
    for (const [x, y] of quiet) {
      const s = Math.max(x, lo), e = Math.min(y, hi);
      if (e - s > 0.02 && (!best || e - s > best[1] - best[0])) best = [s, e];
    }
    return best ? (best[0] + best[1]) / 2 : (lo + hi) / 2;
  };
  const cuts = sents.slice(1).map((s, k) => cut(sents[k], s));
  return sents.map((s, k) => {
    const A = k === 0 ? 0 : cuts[k - 1], B = k === sents.length - 1 ? dur : cuts[k];
    const first = s.words[0], last = s.words[s.words.length - 1];
    return { a: A, b: B, lead: Math.max(0, first.start - A), trail: Math.max(0, B - last.end) };
  });
}

// Why a sentence is flagged (an empty list = fine).
function flagsOf(a, sents, regions, transcriptWords, aligned) {
  const heardAll = (transcriptWords || []).map(w => ({ t: stripPunct(String(w.word).trim()).toLowerCase(), mid: (w.start + w.end) / 2 })).filter(w => w.t);
  return sents.map((s, k) => {
    const why = [];
    if (s.words.some(w => w.est)) why.push('untimed words');
    if (aligned?.ok) {
      let run = 0, hit = false;
      for (const w of s.words) { run = w.score !== undefined && (w.score === null || w.score < 0.3) ? run + 1 : 0; if (run >= 3) hit = true; }
      if (hit) why.push('low alignment score');
    }
    if (transcriptWords && !(a.language && NO_SPACES.test(a.language))) {
      const heard = heardAll.filter(w => w.mid >= regions[k].a && w.mid < regions[k].b).map(w => w.t);
      const script = s.words.map(w => w.text.toLowerCase());
      const minus = (xs, ys) => { const left = [...ys]; return xs.filter(x => { const i = left.indexOf(x); if (i < 0) return true; left.splice(i, 1); return false; }); };
      const extra = minus(heard, script), missing = minus(script, heard);
      // digits heard for a spelled-out number are harmless (the existing word-count warning says so)
      if (extra.some(t => !/\d/.test(t)) || (missing.length && !extra.length)) why.push('heard ≠ script');
    }
    return why;
  });
}

// 24 kHz mono 16-bit PCM, no dependency. A take that is not that is normalised with ffmpeg first (normalisePcm).
function readPcm(file) {
  const b = readFileSync(file);
  let p = 12, fmt = null;
  while (p + 8 <= b.length) {
    const id = b.toString('latin1', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), rate: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') {
      if (!fmt || fmt.tag !== 1 || fmt.ch !== 1 || fmt.rate !== RATE || fmt.bits !== 16) die(`${file} is not 24 kHz mono 16-bit PCM, which the splice needs.`);
      const len = Math.floor(Math.min(n, b.length - p - 8) / 2), out = new Int16Array(len);
      for (let i = 0; i < len; i++) out[i] = b.readInt16LE(p + 8 + i * 2);
      return out;
    }
    p += 8 + n + (n & 1);
  }
  return die(`${file} has no audio data.`);
}
function writePcm(file, samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(samples[i], 44 + i * 2);
  writeFileSync(file, b);
}
function normalisePcm(src, dst) {
  try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', String(RATE), '-c:a', 'pcm_s16le', dst]); }
  catch (e) { die(`ffmpeg could not read ${src}: ${e.message}`); }
  return readPcm(dst);
}

// The new take: `pieces` in order, each { keep: k } (the old take's region k) or { clip, r0, r1, lead, trail } (a re-spoken
// sentence: its words run r0..r1 in the clip, and it gets the old region's pause before and after it, padded with silence).
// Consecutive kept regions stay one stretch of the old audio; every other join is an equal-power crossfade of XFADE samples.
function assemble(take, regions, pieces) {
  const parts = [];
  for (const p of pieces) {
    if (p.keep !== undefined) {
      const r = regions[p.keep], last = parts[parts.length - 1];
      if (last && last.keep !== undefined && last.keep + 1 === p.keep) { last.to = Math.round(r.b * RATE); last.keep = p.keep; }
      else parts.push({ keep: p.keep, from: Math.round(r.a * RATE), to: Math.round(r.b * RATE) });
    } else {
      const from = Math.round((p.r0 - p.lead) * RATE), to = Math.round((p.r1 + p.trail) * RATE);
      const out = new Int16Array(Math.max(0, to - from));
      for (let i = 0; i < out.length; i++) { const j = from + i; if (j >= 0 && j < p.clip.length) out[i] = p.clip[j]; }
      parts.push({ samples: out });
    }
  }
  let out = new Int16Array(0);
  for (const part of parts) {
    const B = part.samples || take.subarray(part.from, Math.min(part.to, take.length));
    if (out.length < XFADE || B.length < XFADE) { const j = new Int16Array(out.length + B.length); j.set(out); j.set(B, out.length); out = j; continue; }
    const j = new Int16Array(out.length + B.length - XFADE);
    j.set(out.subarray(0, out.length - XFADE));
    for (let i = 0; i < XFADE; i++) {
      const t = (i + 0.5) / XFADE;
      j[out.length - XFADE + i] = Math.round(out[out.length - XFADE + i] * Math.cos(t * Math.PI / 2) + B[i] * Math.sin(t * Math.PI / 2));
    }
    j.set(B.subarray(XFADE), out.length);
    out = j;
  }
  return out;
}

// --retake: re-speak the flagged sentences (auto) or the numbered ones, splice them in, time the file again.
// At most two tries per sentence (the second with seed + 1), then a WARNING that names it.
async function retake(a, ctx) {
  let { response, t } = ctx;
  const { clean, gaps, audioPath } = ctx;
  if (a.retake === 'changed') die('--retake changed is not available yet.');
  const dir = path.join(a.out, '_retake');
  const jsonPath = a.fromResponse || path.join(a.out, `${ctx.base}.response.json`);
  const dur = () => probeDuration(audioPath) ?? (t.words.length ? t.words[t.words.length - 1].end : 0);
  const survey = () => {
    const sents = sentencesOf(clean, t.words);
    const regions = regionsOf(sents, silences(audioPath), dur());
    return { sents, regions, flags: flagsOf(a, sents, regions, response.transcript?.words, t.aligned) };
  };
  let { sents, regions, flags } = survey();
  const flagged = () => sents.filter((s, k) => flags[k].length).map(s => s.n);
  console.log(`Sentences  : ${sents.length}${flagged().length ? ` (flagged: ${flagged().join(', ')})` : ''}`);
  let targets;
  if (a.retake === 'auto') targets = flagged();
  else {
    targets = [...new Set(a.retake.split(',').map(Number))].sort((x, y) => x - y);
    const bad = targets.filter(n => n < 1 || n > sents.length);
    if (bad.length) die(`--retake: the take has ${sents.length} sentences; ${bad.join(', ')} ${bad.length > 1 ? 'are' : 'is'} not one of them.`);
  }
  const why = new Map(targets.map(n => [n, flags[n - 1].length ? flags[n - 1].join(', ') : 'asked for']));
  const tries = new Map();
  const short = s => s.text.length > 40 ? `${s.text.slice(0, 40)}…` : s.text;
  mkdirSync(dir, { recursive: true });
  try {
    for (let round = 1; round <= 2 && targets.length; round++) {
      const seed = round === 1 ? a.seed : a.seed + 1;
      const old = normalisePcm(audioPath, path.join(dir, 'take.wav'));
      const pieces = sents.map((s, k) => ({ keep: k }));
      let spliced = 0;
      for (const n of targets) {
        const s = sents[n - 1], r = regions[n - 1];
        const raw = path.join(dir, `s${n}.raw.wav`);
        await vsSpeak(a, s.text, raw, seed);
        tries.set(n, round);
        const heard = await vsTranscribe(a, raw, s.text, true);
        const ws = heard?.transcript.words;
        if (!ws?.length) { console.log(`Retake     : sentence ${n} "${short(s)}" came back without words (try ${round}, seed ${seed}); the old audio stays.`); continue; }
        pieces[n - 1] = { clip: normalisePcm(raw, path.join(dir, `s${n}.wav`)), r0: ws[0].start, r1: ws[ws.length - 1].end, lead: r.lead, trail: r.trail };
        spliced++;
        console.log(`Retake     : sentence ${n} "${short(s)}" re-spoken (try ${round}, seed ${seed}) — ${why.get(n)}`);
      }
      if (!spliced) break;
      writePcm(audioPath, assemble(old, regions, pieces));
      const meta = response._meta;
      response = await vsTranscribe(a, audioPath, stripTags(clean));
      response._meta = { ...meta, text: clean, characters: stripTags(clean).length, steps: a.steps, created: new Date().toISOString(), retakes: [...tries].map(([n, k]) => ({ n, tries: k, reasons: why.get(n) })) };
      await writeFile(jsonPath, JSON.stringify(response));
      t = timeTake(a, response, clean, gaps, audioPath);
      ({ sents, regions, flags } = survey());
      targets = targets.filter(n => flags[n - 1].length);
    }
    for (const n of targets) {
      if (tries.get(n) === 2) console.log(`WARNING    : sentence ${n} "${short(sents[n - 1])}" still ${flags[n - 1].join(', ')} after 2 tries — do not deliver this take: respell the sentence in narration.txt, then --retake changed.`);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  return { response, t };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.help) {
    const src = (await readFile(new URL(import.meta.url), 'utf8')).split('\n');
    console.log(src.slice(1, src.findIndex(l => l.startsWith('import'))).map(l => l.replace(/^\/\/ ?/, '')).join('\n').trim());
    return;
  }
  if (a.listVoices) return a.engine === 'voicestudio' ? vsListVoices(a) : listVoices();
  if (a.saveProfile) return vsSaveProfile(a);
  if (!a.input) die('Needs --input narration.txt');

  const raw = await readFile(a.input, 'utf8');
  const { clean, beats, sections, dlines, order, gaps } = parseNarration(raw, a.sample);
  if (!clean.trim()) die('Narration is empty after dropping # lines and blank lines.');
  const limit = MAX_CHARS[a.engine];
  if (a.ownRecording && !a.fromAudio) die('--own-recording states the origin of a --from-audio file; it needs --from-audio.');
  if (!a.fromAudio && !order.length && clean.length > limit) die(`Narration is ${clean.length} characters, over the ${a.engine} limit of ${limit}. Split it into one file per section.`);
  if (order.length && !a.fromAudio && !a.fromResponse && !a.sample && a.engine !== 'voicestudio') die('Multi-voice dialogue is generated with --engine voicestudio --voices name=voice,...; or record it and pass --from-audio.');
  if (a.retake && (a.sample || a.fromAudio || order.length)) die('--retake works on a single-voice VoiceStudio narration take, not on a sample, a --from-audio file or a dialogue.');
  if (a.retake && a.retake !== 'auto') {
    // a numbered or changed retake works on the take that is on disk: no full take
    a.fromResponse ??= path.join(a.out, `${a.name}.response.json`);
    if (!existsSync(a.fromResponse)) die(`--retake ${a.retake} works on an existing take: ${a.fromResponse} not found. Make the take first (add --retake auto to fix it as it is made).`);
  }
  const unnamed = beats.filter(b => !b.label).length;
  if (unnamed && !a.sample) console.warn(`WARNING: ${unnamed} beat(s) have no |name and get auto names (b1, b2, ...) that shift when beats are added. Use {text|name}.`);

  await mkdir(a.out, { recursive: true });
  const ext = f => f.startsWith('mp3') ? 'mp3' : f.startsWith('pcm') ? 'pcm' : f.startsWith('opus') ? 'opus' : f.startsWith('wav') ? 'wav' : f.startsWith('flac') ? 'flac' : 'audio';
  // Samples get a name per voice + style + seed, so auditions of one voice never overwrite each other.
  const slug = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  const baseFor = id => !a.sample ? a.name
    : a.name !== 'narration' ? `sample-${slug(a.name)}`
    : ['sample', a.voice || id || 'voice', a.instructions && `${slug(a.instructions).slice(0, 24)}-${createHash('sha1').update(a.instructions).digest('hex').slice(0, 6)}`, a.engine === 'voicestudio' && `s${a.seed}`, a.speed && `x${a.speed}`].filter(Boolean).map(slug).join('-');
  let response;
  let voiceId = null;
  if (a.engine === 'voicestudio' && !a.fromResponse && !a.fromAudio) {
    if (!a.model) { a.model = await vsActiveModel(a); a.modelFrom = "VoiceStudio's active TTS model"; }
    modelLine(a, { engine: 'voicestudio', model: a.model }, a.modelFrom);
  }
  if (a.fromResponse) {
    response = JSON.parse(await readFile(a.fromResponse, 'utf8'));
    voiceId = response._meta?.voice_id ?? null;
    a.language ??= response._meta?.language ?? null;
    if (a.retake) {
      // the sentences are re-spoken by the voice and settings that made the take
      const m = response._meta || {};
      if (m.engine !== 'voicestudio') die('--retake re-speaks with VoiceStudio; this take was not made by it (an ElevenLabs or recorded take is regenerated whole).');
      a.model = m.model ?? a.model;
      if (!a.model) die('--retake: the take does not record its model; pass --model <name>.');
      a.voice = m.voice_id ?? a.voice; a.voiceId = null;
      a.instructions ??= m.instructions;
      if (Number.isInteger(m.seed)) a.seed = m.seed;
      if (a.speed === undefined && m.speed && m.speed !== 1) a.speed = m.speed;
      if (Number.isInteger(m.steps)) a.steps = m.steps;
      modelLine(a, { engine: 'voicestudio', model: a.model }, 'the take being retaken');
    }
    if (response._meta?.text && response._meta.text !== clean && a.retake !== 'changed') {
      console.warn('WARNING: the narration words differ from when this response was made. Timing may be off; regenerate the audio if the words changed.');
    }
  } else if (a.fromAudio) {
    // A recording (the user's, or a take cut and retimed): keep it as the voice track, get word timing by transcribing it.
    // The script cannot tell a human recording from TTS output: --own-recording states it. Without it, the take keeps
    // what spoke before, the source file's own take or the take this one replaces (read before it is overwritten),
    // so a non-commercial voice stays non-commercial (scripts/voice_licences.mjs).
    const metaOf = f => { try { const m = JSON.parse(readFileSync(f, 'utf8'))._meta; return m && typeof m === 'object' ? m : null; } catch { return null; } };
    const keep = m => m && { engine: m.engine, model: m.model, tier: m.tier, origin: m.origin, source: m.source, from: keep(m.from) };
    const src = path.parse(a.fromAudio);
    const from = a.ownRecording ? null : keep(metaOf(path.join(src.dir, `${src.name}.response.json`)) ?? metaOf(path.join(a.out, `${a.name}.response.json`)));
    const audioPath = path.join(a.out, `${a.name}.wav`);
    try { execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a.fromAudio, '-vn', '-c:a', 'pcm_s16le', audioPath]); }
    catch (e) { die(`ffmpeg could not read the audio in ${a.fromAudio}: ${e.message}`); }
    process.stdout.write(`Transcribing ${path.basename(a.fromAudio)} with VoiceStudio for word timing... `);
    response = await vsTranscribe(a, audioPath, stripTags(clean));
    console.log('done.');
    response._meta = { engine: 'user-audio', origin: a.ownRecording ? 'own-recording' : null, ...(from && { from }), source: path.basename(a.fromAudio), language: a.language, text: clean, characters: 0, created: new Date().toISOString() };
    const v = voiceModel(response._meta);
    console.log(`Voice      : ${v ? `${v.name} — ${v.licence}${v.nc ? ' — non-commercial (the take it was cut from): tell the user; ASSETS.json lists the narration so' : ''}` : `licence unknown (${unknownVoice(response._meta)})`}`);
  } else if (a.engine === 'voicestudio' && order.length && !a.sample) {
    const audioPath = path.join(a.out, `${a.name}.wav`);
    process.stdout.write(`Generating ${order.filter(o => !o.pause).length} dialogue lines with VoiceStudio (${a.voices || 'no --voices'}), then transcribing for word timing... `);
    response = await vsDialogue(a, order, audioPath, stripTags(clean));
    console.log('done.');
    response._meta = { engine: 'voicestudio', voices: a.voices, seed: a.seed, model: a.model, language: a.language, speed: a.speed ?? 1, text: clean, characters: stripTags(clean).length, created: new Date().toISOString() };
  } else if (a.engine === 'voicestudio') {
    voiceId = a.voiceId || a.voice || 'default';
    const spoken = stripTags(clean);
    if (spoken !== clean.trim()) console.warn('Note: [tags] are ElevenLabs-only and were not sent to VoiceStudio. Use --instructions "..." for style.');
    const audioPath = path.join(a.out, `${baseFor(voiceId)}.${ext(a.format)}`);
    process.stdout.write(`Requesting audio from VoiceStudio (${spoken.length} characters, model ${a.model}${a.language ? `, language ${a.language}` : ''}), then transcribing it back for word timing... `);
    response = await vsGenerate(a, spoken, audioPath);
    console.log('done.');
    response._meta = { engine: 'voicestudio', voice_id: voiceId, instructions: a.instructions, seed: a.seed, steps: a.steps, model: a.model, language: a.language, speed: a.speed ?? 1, text: clean, characters: spoken.length, created: new Date().toISOString() };
  } else {
    voiceId = await resolveVoiceId(a);
    // The plan decides the output licence (free tier: non-commercial); unreadable = unknown, never "free".
    const tier = await fetch(`${API}/v1/user/subscription`, { headers: { 'xi-api-key': apiKey() }, signal: AbortSignal.timeout(15000) })
      .then(r => r.ok ? r.json() : null).then(b => b?.tier ?? null).catch(() => null);
    modelLine(a, { engine: 'elevenlabs', model: a.model, tier }, a.modelFrom || 'default');
    const body = { text: clean, model_id: a.model };
    if (a.language) body.language_code = a.language;
    if (a.speed) body.voice_settings = { speed: a.speed }; // ElevenLabs accepts 0.7–1.2
    const q = new URLSearchParams({ output_format: a.format });
    process.stdout.write(`Requesting audio from ElevenLabs (${clean.length} characters, model ${a.model}${a.language ? `, language ${a.language}` : ''})... `);
    response = await api(`/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?${q}`, { method: 'POST', body });
    console.log('done.');
    response._meta = { engine: 'elevenlabs', voice_id: voiceId, model: a.model, tier, language: a.language, speed: a.speed ?? 1, text: clean, characters: clean.length, created: new Date().toISOString() };
  }

  const alignment = response.alignment || response.normalized_alignment;
  if (!alignment) die('Response has no alignment (timing) data. Try another model with --model.');

  // Re-timing a sample keeps that sample's own name, not one rebuilt from today's flags.
  const base = a.fromResponse && a.sample && response.audio_file ? path.parse(response.audio_file).name : baseFor(voiceId);
  let audioPath;
  if (response.audio_base64) {
    audioPath = path.join(a.out, `${base}.${ext(response._meta?.engine === 'voicestudio' ? 'wav' : a.format)}`);
    await writeFile(audioPath, Buffer.from(response.audio_base64, 'base64'));
  } else if (response.audio_file) {
    audioPath = path.join(a.fromResponse ? path.dirname(a.fromResponse) : a.out, response.audio_file); // VoiceStudio: audio already on disk
  } else die('Response has neither audio_base64 nor audio_file.');
  if (!existsSync(audioPath)) die(`Audio file ${audioPath} is missing; timing needs it.`);
  if (!a.fromResponse) await writeFile(path.join(a.out, `${base}.response.json`), JSON.stringify(response));

  let t = timeTake(a, response, clean, gaps, audioPath);
  if (a.retake) ({ response, t } = await retake(a, { response, clean, gaps, audioPath, base, t }));
  const { times, exact, words, missing, aligned } = t;
  const beatList = buildBeats(beats, words, times, clean);
  const sectionList = buildSections(sections, words);
  const lineList = buildLines(dlines, words);
  const lastEnd = words.length ? words[words.length - 1].end : 0;
  const duration = probeDuration(audioPath) ?? lastEnd;

  const publicWords = words.map(({ _s, _e, ...w }) => w);
  await writeFile(path.join(a.out, a.sample ? `${base}.words.json` : 'words.json'), JSON.stringify(publicWords, null, 2));

  if (!a.sample) {
    const payload = { duration, audio_file: path.basename(audioPath), beats: beatList, sections: sectionList, ...(lineList.length && { lines: lineList }) };
    await writeFile(path.join(a.out, 'beats.json'), JSON.stringify(payload, null, 2));
    const byName = Object.fromEntries(beatList.map(b => [b.name, { text: b.text, start: b.start, end: b.end }]));
    const js = `// Generated by tts_timestamps.mjs — do not edit by hand.\n` +
      `// Use: BEATS.<name>.start (seconds). Ordered list: BEATS_LIST. Sections: SECTIONS.\n` +
      `window.BEATS = ${JSON.stringify(byName, null, 2)};\n` +
      `window.BEATS_LIST = ${JSON.stringify(beatList)};\n` +
      `window.SECTIONS = ${JSON.stringify(sectionList)};\n` +
      `// Every spoken word, for changes on words that are not beats: WORDS[i].start (i from words.json).\n` +
      `window.WORDS = ${JSON.stringify(publicWords.map(({ text, start, end }) => ({ text, start, end })))};\n` +
      `window.NARRATION_DURATION = ${duration};\n` +
      (lineList.length ? `// Dialogue: who speaks when — drives cuts, close-ups and mouth movement.\nwindow.LINES = ${JSON.stringify(lineList)};\n` : '');
    await writeFile(path.join(a.out, 'beats.js'), js);
    await writeFile(path.join(a.out, 'narration.srt'), buildSrt(words, clean));
  }

  const nWords = publicWords.length;
  console.log(`\nAudio      : ${audioPath} (${duration} s)`);
  console.log(`Words      : ${nWords} spoken words (tags excluded), ${(nWords / Math.max(duration, 0.001)).toFixed(2)} words/s, ${(stripTags(clean).replace(/\s/g, '').length / Math.max(duration, 0.001)).toFixed(2)} chars/s`);
  if (!a.sample) console.log(`Beats      : ${beatList.length} | Sections: ${sectionList.length}${lineList.length ? ` | Dialogue lines: ${lineList.length} (${[...new Set(lineList.map(l => l.speaker))].join(', ')})` : ''}`);
  if (!a.fromResponse) console.log(a.fromAudio || a.engine === 'voicestudio' ? 'Billed     : 0 (local)' : `Billed     : ${clean.length} ElevenLabs characters`);
  const silent = lineList.filter(l => l.start === null);
  if (silent.length) console.log(`WARNING    : ${silent.length} dialogue line(s) matched no word in the audio: ${silent.map(l => `${l.speaker}: "${l.text.slice(0, 30)}"`).join('; ')}`);
  if (response.transcript) {
    const heard = response.transcript.words.length;
    if (Math.abs(heard - nWords) > Math.max(2, nWords * 0.05)) console.log(`WARNING    : the transcript heard ${heard} words but the narration has ${nWords}. Often a spelled-out number heard as digits (harmless if the words below are timed); otherwise a skipped or misread word — --retake auto re-speaks the sentences that differ.`);
  }
  if (aligned?.ok) {
    console.log('Timing     : forced alignment against the script (score per word in words.json).');
    // Three or more low-score words in a row: the voice did not say what the script says.
    let run = [];
    for (const w of [...publicWords, { score: 1 }]) {
      if (w.score !== undefined && (w.score === null || w.score < 0.3)) { run.push(w); continue; }
      if (run.length >= 3) console.log(`WARNING    : low alignment score on "${run.map(x => x.text).join(' ')}" (${run[0].start.toFixed(2)}s) — the voice may not say the script there; --retake auto re-speaks that sentence.`);
      run = [];
    }
  } else if (aligned?.note) console.log(`Timing     : transcript (${aligned.note}).`);
  if (!exact && !aligned?.ok) console.log('Note       : spelling in the timing data differs from the narration (e.g. numbers rewritten); matched per word.');
  if (missing) {
    const est = publicWords.filter(w => w.est);
    console.log(`WARNING    : ${missing} word(s) had no timing and were estimated (est: true in words.json): ${est.slice(0, 12).map(w => `#${w.i} "${w.text}" ${w.start.toFixed(2)}s`).join(', ')}${est.length > 12 ? ', …' : ''}`);
    const hit = beatList.filter(b => b.word_index !== undefined && publicWords[b.word_index]?.est);
    if (hit.length) console.log(`WARNING    : beat(s) starting on an estimated word: ${hit.map(b => b.name).join(', ')} — --retake auto, or check them in words.json.`);
  }
  if (!a.retake && !a.sample && !a.fromAudio && !order.length && response._meta?.engine === 'voicestudio' && response.transcript) {
    const sents = sentencesOf(clean, words);
    const regions = regionsOf(sents, silences(audioPath), duration);
    const flags = flagsOf(a, sents, regions, response.transcript.words, aligned);
    const hit = sents.filter((s, k) => flags[k].length);
    if (hit.length) console.log(`Retake     : sentence${hit.length > 1 ? 's' : ''} ${hit.map(s => s.n).join(', ')} may not say the script (${[...new Set(hit.flatMap(s => flags[s.n - 1]))].join(', ')}) — run again with --retake auto --from-response ${a.fromResponse || path.join(a.out, `${base}.response.json`)}: only those are re-spoken.`);
  }
  const bad = beatList.filter(b => b.start === null);
  if (bad.length) console.log(`WARNING    : ${bad.length} beat(s) matched no word: ${bad.map(b => b.text).join(', ')}`);
  if (!a.sample) {
    for (const b of beatList) if (b.start !== null) console.log(`  ${String(b.start.toFixed(2)).padStart(7)}s  ${b.name.padEnd(16)} "${b.text}"`);
  }
  console.log(`DONE ${audioPath}`);
}

main().catch(e => die(e.stack || String(e)));
