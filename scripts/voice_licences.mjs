// The licence of what each voice model generates, in one place: tts_timestamps.mjs prints it, check_assets.mjs
// checks the narration's ASSETS.json row against it. nc = the output is non-commercial. Add a model here, never inline.
// A voice is commercial-OK only when a row here says so. Not in the table (a new model, a plan that could not be read,
// a take made before the tier was recorded) = unknown: check_assets.mjs says so (WARN), it never reads it as OK.
// ElevenLabs paid plans (the API's tier names): commercial use is part of the plan; "free" is non-commercial.
const ELEVENLABS_PAID = ['starter', 'creator', 'pro', 'scale', 'business', 'growing_business', 'enterprise'];
export const VOICE_MODELS = [
  { name: 'OmniVoice', licence: 'CC-BY-NC-4.0', nc: true, test: m => /omnivoice/i.test(m.model || '') },
  { name: 'VoxCPM2', licence: 'Apache-2.0', nc: false, test: m => /voxcpm/i.test(m.model || '') },
  { name: 'ElevenLabs free tier', licence: 'ElevenLabs free tier: non-commercial, attribution', nc: true, test: m => m.engine === 'elevenlabs' && m.tier === 'free' },
  { name: 'ElevenLabs paid plan', licence: 'ElevenLabs paid plan: commercial use', nc: false, test: m => m.engine === 'elevenlabs' && ELEVENLABS_PAID.includes(m.tier) },
  { name: 'your own recording', licence: 'user', nc: false, test: m => m.engine === 'user-audio' },
];

// meta = a take's _meta ({ engine, model, tier }). null = not in the table: unknown, which is never read as commercial-OK.
export const voiceModel = meta => VOICE_MODELS.find(v => v.test(meta || {})) || null;

// What to check when a take's voice is unknown (printed by tts_timestamps.mjs and check_assets.mjs).
export const unknownVoice = meta => meta?.engine === 'elevenlabs'
  ? `ElevenLabs plan ${meta.tier ? `"${meta.tier}" is not in scripts/voice_licences.mjs` : 'could not be read'}: check the plan's terms before treating the narration as commercial`
  : `model ${meta?.model ? `"${meta.model}"` : '(none recorded)'} is not in scripts/voice_licences.mjs: check its model card before treating the narration as commercial`;

// VoiceStudio names its TTS weights by repo id ("k2-fsa/OmniVoice") or by bare name ("voxcpm2"); the speech API
// takes the bare lower-case name.
export const vsModelName = id => String(id).split('/').pop().toLowerCase();
