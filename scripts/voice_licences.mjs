// The licence of what each voice model generates, in one place: tts_timestamps.mjs prints it, check_assets.mjs
// checks the narration's ASSETS.json row against it. nc = the output is non-commercial. Add a model here, never inline.
export const VOICE_MODELS = [
  { name: 'OmniVoice', licence: 'CC-BY-NC-4.0', nc: true, test: m => /omnivoice/i.test(m.model || '') },
  { name: 'VoxCPM2', licence: 'Apache-2.0', nc: false, test: m => /voxcpm/i.test(m.model || '') },
  { name: 'ElevenLabs free tier', licence: 'ElevenLabs free tier: non-commercial, attribution', nc: true, test: m => m.engine === 'elevenlabs' && m.tier === 'free' },
];

// meta = a take's _meta ({ engine, model, tier }). null = not in the table: unknown, which is never read as commercial-OK.
export const voiceModel = meta => VOICE_MODELS.find(v => v.test(meta || {})) || null;

// VoiceStudio names its TTS weights by repo id ("k2-fsa/OmniVoice") or by bare name ("voxcpm2"); the speech API
// takes the bare lower-case name.
export const vsModelName = id => String(id).split('/').pop().toLowerCase();
