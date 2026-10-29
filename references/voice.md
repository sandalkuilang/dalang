# Voice engines: setup and use

**Setup** when `preflight.mjs` reports a voice item MISSING (`STOPPED` needs only `preflight.mjs --start`, `BUSY` only waiting); **Use** at Step 4.

| Engine | Cost | Timing source | When |
|---|---|---|---|
| **VoiceStudio** (local app, [github.com/debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio)) | free, local | transcribes its own audio with word timestamps | default |
| **Kokoro-82M** (local, `scripts/kokoro_tts.py`) | free, Apache-2.0 (commercial OK) | forced alignment (`align.py`) | en / en-gb only, when the video is monetised and VoxCPM2 is too slow |
| **ElevenLabs** (cloud API) — **paid** | free tier tiny and non-commercial | character alignment from the API | only when the user asks |

## Setup — VoiceStudio

- **Install** (ask first). macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/debpalash/VoiceStudio/main/scripts/install.sh | sh`; Windows: `irm https://voicestudio.sh/install | iex`. Start it: macOS `node <skill-dir>/scripts/preflight.mjs --start` (waits ≤ 60 s); elsewhere open the app, then rerun preflight. The first launch downloads a Python runtime (several GB, 10+ min): rerun preflight every few minutes until OK, never your own polling loop. Leave the analytics consent prompt to the user. Intel Macs get only the UI: they need a remote backend (`--vs-url http://<host>:3900` on every preflight and `tts_timestamps.mjs` call), which must accept this machine without an API key (dalang sends none; else reads come back "refused").
- **Models.** `GET http://localhost:3900/models`. Ready = `"installed": true` **and** `"incomplete": false` (`installed` alone flips true mid-download). A missing model: state size and licence, get consent, then `POST /models/install` with `{"repo_id": "…"}` and poll `GET /models/install/status`. Both a TTS and a speech-to-text model are needed.
- **Recommended models:** TTS `k2-fsa/OmniVoice` (3.3 GB, 600+ languages, cloning from a 3–10 s clip); ASR `deepdml/faster-whisper-large-v3-turbo-ct2` (1.6 GB, MIT) on every platform (`mlx-community/whisper-large-v3-turbo` installs but is never selected).
- **Activate the speech-to-text model**, else transcription answers `asr_model_missing`: `PUT http://localhost:3900/api/settings/performance-profile` with `{"tier":"balanced"}`; check `selections.asr` in the response.
- **Download big files outside the backend** (an inline download stops `/health`, the app restarts the backend and the download starts over). Use VoiceStudio's own Python (macOS: `~/Library/Application Support/VoiceStudio/runtime/project/.venv/bin/python`, run from that `project` folder), in the background:
  - TTS watermark (58 MB, needed before the first generation): `python -c 'from audioseal import AudioSeal; AudioSeal.load_generator("audioseal_wm_16bits")'`
  - A model that keeps failing in the app: `python -c 'from huggingface_hub import snapshot_download; snapshot_download("<repo_id>")'`
- **Languages.** Check the narration language's training hours in VoiceStudio's `docs/languages.md`; warn the user when they are thin.
- **Licence.** The app is AGPL-3.0; each model's weights and output terms are separate. **OmniVoice's weights are CC-BY-NC** (non-monetised videos only): tell the user before they plan to monetise. `tts_timestamps.mjs` speaks with VoiceStudio's active TTS model unless `--model` names another, prints `Model : <name> — <licence>` and records it in `<name>.response.json` `_meta.model`. The narration's `ASSETS.json` licence is that model's output licence (OmniVoice `CC-BY-NC-4.0`, VoxCPM2 `Apache-2.0`, ElevenLabs free tier non-commercial); `check_assets.mjs` fails a mismatch (table: `scripts/voice_licences.mjs`). A take whose model or plan the table cannot identify is a `WARN`, never commercial-OK.
- **VoxCPM2** (free, commercial-OK, Indonesian and ~30 other languages; Apache-2.0, ~5 GB): `openbmb/VoxCPM2` weights plus `uv pip install --python <venv>/bin/python voxcpm` (added packages only, no upgrades) in VoiceStudio's venv, with consent. Make it the active model or pass `--model voxcpm2`; `--instructions` becomes its `description`. About 22× slower than real time (a 60 s narration ≈ 25 min), so the script sends ~120-character chunks; run it alone. The script checks `/health` first (no answer: `WARN … rerun`, exit 3) and free memory (< 4 GB: 60-character chunks), shrinks chunks that near the compute limit and retries a `503` chunk in halves. Audition it against OmniVoice.

## Setup — ElevenLabs (paid, optional)

- **No key?** Use VoiceStudio; never suggest ElevenLabs unprompted. If the user wants it, they set `ELEVENLABS_API_KEY` themselves. Never show, print or save the key. A key pasted into the chat is never used: ask the user to revoke it and store a new one in a real terminal tab (`read -s` gets no input in the chat box).
- Tier `free`: ~10,000 characters a month, **no cloning, Voice Library or Voice Design over the API** (402 / 403), non-commercial with attribution; an accent only through an accent tag on a stock voice (e.g. `[strong Scottish accent]`).

## Setup — Kokoro (free, commercial-OK, optional)

Kokoro-82M: Apache-2.0 weights, fast on a laptop CPU. **The install is far larger than the weights:** `pip install kokoro soundfile torchaudio` pulls torch, transformers, spaCy and the rest, about 0.3 GB on macOS arm64 and about 3 GB on Linux with the default CUDA wheels (CPU-only torch avoids that), then ~330 MB of weights, ~0.5 MB a voice and ~13 MB for spaCy `en_core_web_sm`. **Ask first**, stating all of that and the licence. Preflight's `Kokoro (voice)` row: OK / MISSING / WARN (WARN = rerun, never install).

- **A separate Python, never VoiceStudio's venv:** install there (plus `espeak-ng`; macOS `brew install espeak-ng`; `align.py` needs the same Python). Point `DALANG_PYTHON` at it; unset, Kokoro is MISSING.
- **Weights once**, with the user's go-ahead: `$DALANG_PYTHON <skill-dir>/scripts/kokoro_tts.py --download --lang <a|b> --voice <name>` (a en-US, b en-GB; also fetches the spaCy model). Without `--download` it never reaches the network: a missing file stops the take with the command.
- **en and en-gb only.** Every other language is refused before anything runs, naming VoiceStudio (no MISSING, no download offer).
- **Timing needs the aligner model for the language**; without it the take stops with its note.
- Source: huggingface.co/hexgrad/Kokoro-82M.

## Use (Step 4)

`<lang>` and the engine come from `BRIEF.md`. One script serves every engine and writes the same files. Commands: `script-voice.md` §4.

- **Kokoro:** `--engine kokoro --language en|en-gb [--voice af_heart]`; no `--instructions`, clone, dialogue or `--tempo`.
- **Audition:** `--sample` speaks ~300 characters of whole sentences and prints words/s. `--speed`: ElevenLabs 0.7–1.2, VoiceStudio 0.25–4. Accent or style tags change the pace: audition with the exact tags you will use.
- **Calmer or faster approved take:** `--tempo <0.8–1.2> --from-response audio/narration.response.json`; `_meta.model` stays and `--retake` keeps the tempo. Never ffmpeg + `--from-audio` on a TTS take (it loses the model).
- **VoiceStudio voices:** `--list-voices` shows saved profiles plus `default`. No voice for the language: **design** one with `--voice default --instructions "female, young adult, low pitch, calm"` (gender, age, pitch, accent, style). Same instructions + `--seed` = same timbre: vary between samples, never between sample and full take.
- **One tone for the whole film.** VoiceStudio strips narration `[tags]`, so mood comes from sentence shape; the voice is one `--instructions` line. For an explainer: a teacher talking to one person ("calm, warm, conversational, even energy, steady pace"), never "dramatic" or "announcer".
- **ElevenLabs:** stock voices only on free. A rejected `language_code`: rerun without `--language`.

### Clone (VoiceStudio, free, local)

Only with clear permission from the voice's owner. A clip from someone else's video or chat is not permission.

1. **Get 3–10 s of one speaker, no music.** Multi-speaker file → ask which speaker, find a clean window in its transcript (`--from-audio` on a copy, or `POST /v1/audio/transcriptions`), cut it: `ffmpeg -ss <start> -t 8 -i <file> -vn -ac 1 ref.wav`. Music or noise under it → `POST /clean-audio` first.
2. **Save:** `node <skill-dir>/scripts/tts_timestamps.mjs --save-profile "<name>" --ref ref.wav --language <lang> [--ref-text "<exact words>"]` (transcribes the clip without `--ref-text`; prints the profile id). An approved designed sample is saved the same way with its `--instructions` and `--seed`. A `--sample` clip over 20 s with its `.words.json` is cut at the last word end ≤ 15 s (pass no `--ref-text`); any other clip over 20 s fails: cut 3–10 s.
3. **Use:** `--voice <id>`, audition with `--sample`. Not the user's own voice: record consent (`POST /profiles/{id}/consent`).

### Timing, warnings and retakes (Step 4, look up when needed)

- **Dialogue:** `name: text` lines with `(seconds)` pause lines; `--engine voicestudio --voices <name>=<voice>,<name>=<voice>` (a leading `[tag]` is the line's style). Output: `window.LINES = [{ speaker, text, start, end }]` for close-up cuts, mouths between `start` and `end`, and listener reactions. ElevenLabs has no multi-voice path: VoiceStudio or a recording.
- **The user's recording:** `--from-audio <file> --own-recording` (wav, mp3, m4a or a video) keeps the track untouched and transcribes it; narration or dialogue. A warning lists dialogue lines that matched no word. Without `--own-recording` the origin is unknown and the take keeps its source's licence.
- **Timing:** VoiceStudio speaks ~700-character chunks of whole lines (VoxCPM2: 120), transcribes them with the narration as prompt and matches words to `narration.txt`; a second pass without the prompt flags a "clipped start". Spelled-out numbers heard as digits give a harmless "heard N words" warning when the beat words are timed.
- **Forced alignment** (on when ready): `scripts/align.py` times each script word with a CTC model (Apache-2.0 models only). Needs Python with torch, torchaudio, transformers, soundfile (VoiceStudio's venv, or `DALANG_PYTHON`) and a model for the language, downloaded once with permission: `<python> <skill-dir>/scripts/align.py --download --lang <code> --audio audio/narration.wav --text narration.txt --out /tmp/a.json` (id ~1.3 GB download, en ~0.4 GB; ~3 GB RAM). Without a model, transcript timing stays; `--align off` skips it. ja/zh unsupported.
- **Warnings to act on:** "low alignment score", "transcript heard N words", "words had no timing", "clipped start", an unnamed beat. `--retake auto` (plus `--from-response audio/narration.response.json` for an existing take) re-speaks only the flagged sentences (second try with another seed), splices them in at the pauses and retimes everything. It names any sentence still flagged after two tries: respell it, then `--retake changed`. Never deliver a take with an open flag. Only `{}` markers moved: `--from-response`, no new generation.
- **Editing a few sentences:** `--retake changed` re-speaks the sentences that differ from the take on disk; `--retake 3,5` those numbers. VoiceStudio or Kokoro single-voice narration only; an ElevenLabs take, a sample, a recording or a dialogue is regenerated whole.
- **`503` from VoiceStudio:** the script waits (`DALANG_VS_BUSY_WAIT_S`, default 180 s), retries once, then prints `WARN … rerun in a few minutes` and exits 3, never `FAILED`. Rerun later. Never restart the app or switch engines for it: BUSY means wait.
- **A stopped take resumes**: chunks stay in `audio/.tts-parts/`, so the same command speaks only the missing ones. Never write your own chunked generation, never restart VoiceStudio to unstick a take.
- **A new take keeps the last one** in `audio/takes/<n>/`; swap back by moving the pair, then `--from-response`.
- **Neither engine available** (an Intel Mac without a remote backend, no ElevenLabs): `--engine kokoro` (en / en-gb); else the voice path in `/media-use` (HeyGen is paid: only if the user asks; autonomous stops), its transcription for timing, beat words matched by hand, the word count checked against `narration.txt`.
