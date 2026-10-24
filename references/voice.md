# Voice engines: setup and use

Read the part you need: **Setup** when `preflight.mjs` reports a voice item as MISSING, **Use** at Step 4. Free comes first: most users won't subscribe to a paid TTS.

| Engine | Cost | Timing source | When |
|---|---|---|---|
| **VoiceStudio** (local app, [github.com/debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio)) | free, on the user's machine | transcribes its own audio back with word timestamps | default |
| **ElevenLabs** (cloud API) | free tier is tiny and non-commercial; paid otherwise | exact character alignment from the API | the user already pays, or wants its voices |

## Setup — VoiceStudio

- **Install** (ask first). macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/debpalash/VoiceStudio/main/scripts/install.sh | sh`; Windows: `irm https://voicestudio.sh/install | iex`. It verifies the release checksum and installs the desktop app. Then open it (`open /Applications/VoiceStudio.app` on macOS). First launch downloads a Python runtime (several GB, 10+ minutes): wait in the background until `GET http://localhost:3900/health` answers. Leave the analytics consent prompt to the user. Intel Macs only get the UI; they need a remote backend.
- **Models.** `GET http://localhost:3900/models`. Ready means `"installed": true` **and** `"incomplete": false` — `installed` alone flips true while weights are still downloading. For a missing model, tell the user its size and licence and get consent before `POST /models/install` with `{"repo_id": "…"}`; poll `GET /models/install/status`. A TTS model and a speech-to-text model are both needed (the second gives the word timing).
- **Recommended models:** TTS `k2-fsa/OmniVoice` (3.3 GB, 600+ languages, zero-shot cloning from a 3–10 s clip); ASR `deepdml/faster-whisper-large-v3-turbo-ct2` (1.6 GB, upstream MIT) on every platform, because the balanced tier activates it. (`mlx-community/whisper-large-v3-turbo` installs but the transcription endpoint won't select it; it wants the 3 GB `whisper-large-v3-mlx`.)
- **Activate the speech-to-text model.** Installing is not enough: transcription answers `asr_model_missing` until a tier selects it. After the faster-whisper model is installed: `PUT http://localhost:3900/api/settings/performance-profile` with `{"tier":"balanced"}` (same as "Install Balanced pack" in the app's wizard). Check `selections.asr` in the response.
- **Download big files outside the backend.** While the backend downloads something inline, it stops answering `/health`; after ~60 s the app kills and restarts it, the download starts over, and generation "loads forever". Fetch with VoiceStudio's own Python (macOS: `~/Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python`, run from that `project` folder), in the background:
  - TTS watermark (58 MB, needed before the first generation): `python -c 'from audioseal import AudioSeal; AudioSeal.load_generator("audioseal_wm_16bits")'`
  - A model that keeps failing in the app: `python -c 'from huggingface_hub import snapshot_download; snapshot_download("<repo_id>")'`
- **Languages.** Quality follows training data: check the hours for the narration language in VoiceStudio's `docs/languages.md` (widely spoken languages have thousands of hours, many regional ones only a few) and warn the user when it is thin.
- **Licence.** The app is AGPL-3.0; model weights and generated-output terms are separate per model (VoiceStudio's Model Manager). The default TTS model **OmniVoice is recorded as non-commercial** in VoiceStudio's own model inventory, and no model there is yet cleared for commercial use. Like the ElevenLabs free tier, it suits learning and non-monetised videos. Tell the user before they plan to monetise.

## Setup — ElevenLabs

- **No key?** Fine — use VoiceStudio. Only if the user wants ElevenLabs, ask them to set `ELEVENLABS_API_KEY` themselves. Never show, print, or save the key to a project file. Never use a key pasted into the chat: ask the user to revoke it and store a new one in a real terminal tab (not the chat box — `read -s` gets no input there).
- `preflight.mjs` prints the tier and characters used. Tier `free`: about 10,000 characters a month (one 2–3 minute video plus auditions), **no cloning, no Voice Library voices and no Voice Design over the API** (402 / 403), non-commercial with attribution. On free, a regional accent is only reachable with an accent tag on a stock voice (e.g. `[strong Scottish accent]`) — or use VoiceStudio.

## Use (Step 4)

`<lang>` and `<engine>` come from `BRIEF.md`. One script serves both engines and writes the same files.

```bash
node <skill-dir>/scripts/tts_timestamps.mjs --engine <engine> --list-voices
node <skill-dir>/scripts/tts_timestamps.mjs --engine <engine> --input narration.txt --out audio --voice "<voice>" --language <lang> --sample
node <skill-dir>/scripts/tts_timestamps.mjs --engine <engine> --input narration.txt --out audio --voice "<pick>" --language <lang> [--speed 1.0]
```

- **Audition:** `--sample` speaks ~300 characters of whole sentences, enough to measure pace; it prints words/s and chars/s. More than 10 % off the target duration → adjust the script first. Under 10 % → `--speed` (ElevenLabs 0.7–1.2, VoiceStudio 0.25–4). Accent or style tags change the pace: calibrate with the exact tags you will use.
- **VoiceStudio voices:** `--list-voices` shows saved profiles plus `default` (OpenAI names like `alloy` are aliases for the default, not different voices). For a distinct voice, the user designs or saves a profile in the app, then you pass its name or `voice_id`. Style hints go in `--instructions "calm, warm, slow"`; `[tags]` are ElevenLabs-only and are stripped.
- **ElevenLabs voices:** stock voices; library voices, design and cloning need a paid plan over the API. If it rejects `language_code` for the model, rerun without `--language`.
- **Own voice / clone (either engine):** only with clear permission from the voice's owner. VoiceStudio clones free and locally from a clean 3–10 s reference.
- **Dialogue (two or more characters):** write `narration.txt` as `name: text` lines with `(seconds)` pause lines. `--engine voicestudio --voices <name>=<voice>,<name>=<voice>` speaks each line in its character's voice (a leading `[tag]` becomes the style hint), inserts real silence for the pauses, joins everything, and transcribes it once. ElevenLabs has no multi-voice path here: use VoiceStudio or a recording.
- **The user's recording:** `--from-audio <file>` (wav, mp3, m4a, or a video — the audio is extracted) keeps their voice track untouched and transcribes it for timing. Works for narration and dialogue. Untimed words (whispers, words drowned by music) are spread over their gap, and they never start inside a pause written in the script or a silence found in the audio. A warning lists any dialogue line that matched no word. Confirm the speakers gave permission.
- **Dialogue output:** `beats.json` gets `lines` and `beats.js` gets `window.LINES = [{ speaker, text, start, end }]`. Use it to cut to the speaker's close-up on `start`, to move mouths only between `start` and `end`, and to give the listener a reaction.
- **How VoiceStudio timing works:** the script speaks the narration in ~700-character chunks of whole lines (no 5-minute request timeout, no 4,096-character cap), joins them losslessly, then transcribes the audio with word timestamps — the narration goes in as Whisper's `prompt`, so numbers stay spelled as written — and matches the words to `narration.txt`. It translates the few ISO codes Whisper spells differently (`jv` → `jw`, `iw` → `he`). About 30 s of processing per 12 s of audio on an M5 after warm-up.
- **Warnings to act on:** "transcript heard N words", "words had no timing", or an unnamed beat. Listen to those spots — a gap can mean the voice really dropped a word — and fix before the storyboard. Moving only `{}` markers? Recompute with `--from-response audio/narration.response.json`: no new generation, no charge.
- **Neither engine available** (an Intel Mac without a remote backend and no ElevenLabs): use the voice path in `/media-use` (free HeyGen or local Kokoro — check the language), get word timing through `/media-use` transcription, match beat words by hand, and compare the transcript's word count with `narration.txt`.
