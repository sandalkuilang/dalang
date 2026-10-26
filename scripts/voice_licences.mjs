// The licence of what each voice model generates, in one place: tts_timestamps.mjs prints it, check_assets.mjs
// checks the narration's ASSETS.json row against it. nc = the output is non-commercial. Add a model here, never inline.
// A voice is commercial-OK only when a row here says so. Not in the table (a new model, a plan that could not be read,
// a take made before the tier was recorded, a --from-audio file whose origin was not stated) = unknown:
// check_assets.mjs says so (WARN), it never reads it as OK.
//
// The rule that keeps "unknown" from ever reading as commercial-OK (checkRows enforces it when this file loads):
// - a row matches on the values a take recorded in its _meta: every key of `match` must be recorded and equal (a list:
//   one of; a RegExp: tests a recorded string). A field the take did not record (missing, null, "") never matches.
// - a commercial row (nc: false) names WHO spoke, a model, a plan tier or a stated origin, never the engine alone:
//   an engine (VoiceStudio, ElevenLabs, a --from-audio file) says how the take was made, not whose voice it is.
// ElevenLabs paid plans (the API's tier names): commercial use is part of the plan; "free" is non-commercial.
const ELEVENLABS_PAID = ['starter', 'creator', 'pro', 'scale', 'business', 'growing_business', 'enterprise'];
const WHO = ['model', 'tier', 'origin'];
export const checkRows = rows => {
  for (const r of rows) {
    if (!r.match || typeof r.match !== 'object' || !Object.keys(r.match).length) throw new Error(`voice_licences.mjs: row "${r.name}" has no match`);
    if (r.nc !== true && !WHO.some(k => k in r.match)) throw new Error(`voice_licences.mjs: commercial row "${r.name}" must match on who spoke (${WHO.join(', ')}), never the engine alone`);
  }
  return rows;
};
export const VOICE_MODELS = checkRows([
  { name: 'OmniVoice', licence: 'CC-BY-NC-4.0', nc: true, match: { model: /omnivoice/i } },
  { name: 'VoxCPM2', licence: 'Apache-2.0', nc: false, match: { model: /voxcpm/i } },
  { name: 'ElevenLabs free tier', licence: 'ElevenLabs free tier: non-commercial, attribution', nc: true, match: { engine: 'elevenlabs', tier: 'free' } },
  { name: 'ElevenLabs paid plan', licence: 'ElevenLabs paid plan: commercial use', nc: false, match: { engine: 'elevenlabs', tier: ELEVENLABS_PAID } },
  // Stated only by tts_timestamps.mjs --from-audio --own-recording: a human recording the user may use.
  { name: 'a recording the user may use', licence: 'user', nc: false, match: { engine: 'user-audio', origin: 'own-recording' } },
]);

const recorded = v => typeof v === 'string' && v !== '';
const fits = (want, got) => !recorded(got) ? false
  : want instanceof RegExp ? want.test(got) : Array.isArray(want) ? want.includes(got) : want === got;
const row = meta => VOICE_MODELS.find(v => Object.entries(v.match).every(([k, want]) => fits(want, meta?.[k]))) || null;

// meta = a take's _meta ({ engine, model, tier, origin, from }). null = unknown, which is never read as commercial-OK.
// A --from-audio take without a stated origin keeps the take it was cut from (`from`) only when that take is
// non-commercial: a commercial take does not vouch for a file the script cannot trace back to it.
export const voiceModel = meta => {
  const v = row(meta);
  if (v || meta?.engine !== 'user-audio' || !meta.from) return v;
  const src = voiceModel(meta.from);
  return src?.nc ? src : null;
};

// What to check when a take's voice is unknown (printed by tts_timestamps.mjs and check_assets.mjs).
export const unknownVoice = meta => meta?.engine === 'elevenlabs'
  ? `ElevenLabs plan ${meta.tier ? `"${meta.tier}" is not in scripts/voice_licences.mjs` : 'could not be read'}: check the plan's terms before treating the narration as commercial`
  : meta?.engine === 'user-audio'
    ? `the --from-audio file's origin was not stated: if it is a human recording the user may use (the speaker gave permission), retime it with --own-recording; if it is TTS output, that model's licence applies: check its model card before treating the narration as commercial`
    : `model ${meta?.model ? `"${meta.model}"` : '(none recorded)'} is not in scripts/voice_licences.mjs: check its model card before treating the narration as commercial`;

// VoiceStudio names its TTS weights by repo id ("k2-fsa/OmniVoice") or by bare name ("voxcpm2"); the speech API
// takes the bare lower-case name.
export const vsModelName = id => String(id).split('/').pop().toLowerCase();
