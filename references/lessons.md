# Lessons from real runs

Each line is a failure that already happened. Read this file when something goes wrong, or before a step the line names. The fixes are already built into `SKILL.md`; this file says why.

## Script and facts
- **Comparing numbers measured by different methods** and turning a tiny gap into a "narrow win" twist. A small gap with different methods is a tie.
- **The format was never asked**, so the user wanted a vertical short but the brief stayed 16:9. Platform always goes through AskUserQuestion.
- **The script was rewritten five times** because the brief (duration, language) was settled late. Ask everything in Step 1, before the first draft.

## Voice and timing
- **Per-sentence timing ≠ per-word timing.** A per-sentence transcript is accurate only to ~1/6 s. Use `words.json`.
- **One number-heavy section is not a representative pace sample** (2.09 vs 2.30 words/s for the full script, same voice). After the full generation, re-check the real duration.
- **Accent tags changed the pace** (2.30 → 2.57 words/s; 134 s against a 150 s target). Calibrate with the tags you will use; fix small misses with `--speed`.
- **Words inside `[tags]` were counted as spoken words**, inflating the pace. Fixed in the script.
- **Time lost on account issues:** 401 (key permission) and 400 `paid_plan_required` surfaced only after a clone sample was prepared. `preflight.mjs` shows the tier first.
- **VoiceStudio "loaded forever"** on the first generation: the backend downloaded the AudioSeal watermark inline, stopped answering `/health`, and the app restarted it every ~60 s. Pre-download outside the backend (`voice.md`).
- **A wait loop trusted `installed: true`** while a model was still downloading; the first request hung the single Apple Silicon worker for 30 minutes. Wait for `incomplete: false`.
- **The transcription endpoint ignored the installed MLX turbo model** and demanded a 3 GB one. Activate faster-whisper turbo through the balanced tier (`voice.md`).

## Visuals
- **The animation looked cheap and generated:** "the brief is settled, don't re-ask" made `/hyperframes` skip its SPEC/LOOK step; the hero (a vehicle) was drawn from SVG primitives; banned defaults appeared (cream ground, pill chips, side-by-side panels on 9:16, the same pop-in everywhere, a small hero in an empty frame); nine scenes were built before anyone saw one finished frame. Fixed by `SPEC.md`, the realism ladder, style frames, and blocking/polish passes.
- **Half the film was still** because only mouths moved. A good reference film is ~5 % still.
- **Non-English catalog queries** return zero results.

## Audio and reference
- **The first render was ~8 dB too quiet.** Always run `loudness.mjs`.
- **YouTube auto-captions had gaps**, including in the key sentence. Transcribe a reference again and read it to the end.
- **The assistant studying a video cannot hear.** Sound effects read from images are guesses; mark them.

## Working speed
- **A 242k-token session**: one long conversation carried a voice-clone detour, five script drafts, and two copies of the skill. State lives in files — start one session per video and resume from `BRIEF.md` + `PRODUCTION.md`.
