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
- **Time lost on account issues:** 401 (key permission) and 400 `paid_plan_required` surfaced only after a clone sample was prepared. `preflight.mjs` shows the tier first.
- **VoiceStudio "loaded forever"** on the first generation: the backend downloaded the AudioSeal watermark inline, stopped answering `/health`, and the app restarted it every ~60 s. Pre-download outside the backend (`voice.md`).
- **A wait loop trusted `installed: true`** while a model was still downloading; the first request hung the single Apple Silicon worker for 30 minutes. Wait for `incomplete: false`.
- **The transcription endpoint ignored the installed MLX turbo model** and demanded a 3 GB one. Activate faster-whisper turbo through the balanced tier (`voice.md`).
- **"Use the voice from this chat voice note" stalled Step 4** for ~10 tool calls: no clone path was written down. Now `voice.md` "Clone".
- **A clone profile made in the app (60 s clip, no transcript) answered a raw 500** and cost ~6 calls to diagnose. `tts_timestamps.mjs` now names the fix (re-save 3–10 s with `--ref-text`) and `--save-profile` refuses clips over 20 s.
- **Three voices were auditioned before anyone asked** — the user wanted their own saved profile. Ask which saved profile to try first (`script-voice.md` §4).

## Visuals
- **The animation looked cheap and generated:** "the brief is settled, don't re-ask" made `/hyperframes` skip its SPEC/LOOK step; the hero (a vehicle) was drawn from SVG primitives; banned defaults appeared (cream ground, pill chips, side-by-side panels on 9:16, the same pop-in everywhere, a small hero in an empty frame); nine scenes were built before anyone saw one finished frame. Fixed by `SPEC.md`, the realism ladder, style frames, and blocking/polish passes.
- **Half the film was still** because only mouths moved. A good reference film is ~5 % still.
- **A vector animal passed every check** because the illustrated look allowed rung 6 and the Realism test was "N/A". The user's bar is a hyperreal, true-to-life subject in every film: the subject is never drawn, and Realism + Reality apply to every look.
- **People looked stiff** — poses and movement read as puppets, far from real. A person on screen moves only as real or generated footage, never as an animated cutout or rig (`visual-direction.md` §1 "People").
- **Calm cinematic built to its numbers was 24 % still.** Calm needs real continuous motion too (`visual-direction.md` §3 "Minimum motion").
- **Step 1 preview promised banned defaults** (navy gradient + starfield) and the user picked it. Previews now follow the banned list.
- **Half a character vanished:** SVG parts inside `<template>` parse as HTML (self-closing `<path/>` is ignored, shapes nest and don't draw). Keep reusable SVG in `<defs>` and clone it with `<use>` or JS.
- **A crossfade between two shots of the same hero showed two of it** for 0.3 s. Same hero across a seam → match cut (same screen position and size), never a crossfade.
- **`mix-blend-mode` on an SVG `<rect>` rendered opaque** and hid the hero. Use a CSS `filter` on the shot wrapper.
- **A template beside `index.html` failed `check`** (`multiple_root_compositions`), and `media-treatment` patched the file `fill_times` regenerates. Template lives at `src/index.tpl.html` (SKILL.md "Project files").
- **A licensed Commons "documentary" clip was a cartoon** (37 MB downloaded for nothing). Look at posters on a contact sheet before downloading (`visual-direction.md` §1 "Sourcing").
- **Missing GSAP include and a timed `<video>` inside a timed wrapper** each cost a check round (`look-build.md` §6.4).
- **Non-English catalog queries** return zero results.
- **A generated action happened in the wrong place three times** (the right action on the wrong part of the object) — the stills passed a Reality check that looked at materials, not at where the action happens. The check now names the location (`visual-direction.md` §1).
- **A generated machine had a major part outside its body**, then on the wrong component; four Z-Image stills, no real photo searched (only Commons video), the reference "checked" from memory. Machines start at rung 1–2 and the Reality check compares against a downloaded photo (`visual-direction.md` §1 "Machines").
- **`remove-background` holed a product label** (it is a person-segmentation model) and a green screen keyed a dark product; ~10 calls went into a hand-written key. Products are generated on a white light box and cut with `scripts/key_white.py`.

## Audio and reference
- **The first render was ~8 dB too quiet.** Always run `loudness.mjs`; normalising the narration before the mix gets it right first time.
- **Lint flagged 45 "duplicate audio tracks":** SFX `<audio>` without `data-duration` count as playing to the end of the film.
- **`hyperframes preview` opened the user's own Chrome**: its `--open` defaults to true. Always `--no-open`, then the URL in Claude's isolated built-in browser (`qc.md` §7). HyperFrames' headless render Chrome is its own bundled copy and is fine.
- **`snapshot` sends frames to Gemini** whenever `GEMINI_API_KEY` is set. Pass `--describe false`.
- **No music source** left Step 6 undefined. Offer the free local ACE-Step once at Step 0 (never MusicGen: non-commercial weights); otherwise deliver narration + SFX and say so.
- **YouTube auto-captions had gaps**, including in the key sentence. Transcribe a reference again and read it to the end.
- **The assistant studying a video cannot hear.** Sound effects read from images are guesses; mark them.
- **`media-use resolve --type sfx` found no provider**; the free sources are the bundled `/media-use` library and Openverse CC0 (`look-build.md` §6.7).

## Working speed
- **A 242k-token session**: one long conversation carried a voice-clone detour, five script drafts, and two copies of the skill. State lives in files — start one session per video and resume from `BRIEF.md` + `PRODUCTION.md`.
- **A 30 fps draft render took 39 min** (the next took under 3): nobody stopped it. A render far slower than the last → stop and look for the cause.
- **A 10 fps draft rendered in half the time** and gave the same stillness and loudness verdicts. QC renders run at 10 fps; the user reviews in `preview`.
- **Background TTS was polled** by reading its output file. Background jobs notify on exit; the scripts end with `DONE`.
- **Whisper timed sentence starts early** (it counts the pause as part of the next word, up to 0.7 s). Forced alignment against the known script fixed it — beats on sentence starts land on the voice.
- **VoxCPM2 timed out** (300 s compute limit) on its first call while OmniVoice and a benchmark held the memory; alone it worked at ~22× real time. Heavy model jobs run one at a time; VoxCPM2 gets ~120-character chunks.
- **Two queued jobs waited on `pgrep -f mflux-generate` for 25 min with nothing running**: each waiting shell's own command line matched. Chain heavy jobs in one background command, or wait on a PID (SKILL.md).
- **The machine sat idle through a 58 min gate wait**, then remaining stills and music ran serially after it. Free local jobs that a "no" only discards run during the wait.
- **The film read as a PowerPoint slideshow:** 14 drifting stills with text in 61 s (Punchy energy wants ≥ 34 shots), the key action a frozen photo, nothing shown of the mechanism the narration explained. `stillness.mjs` said 0.8 % still because the rule let a ≥ 30 px/s drift count as motion. Now the subject must act in every shot, camera-only plates are ≤ 15 %, every "why" gets a mechanism shot, and the reviewer runs an Action test (`visual-direction.md` §3, §8, §11).
- **Every "camera move" was CSS on a still** (pushes and drifts on 14 stills): no tracking, no orbit, no slow motion, no B-roll — the film had no cinematography to speak of. Real moves come from footage, a 3D rig camera or a generated clip, cut as A-roll and B-roll with one wow shot (`camera-motion.md` §10).
- **Rework, not rendering, was the slow part** of a 3 h 43 min run: a 27 % stillness fail (static plates) cost a 7.5 min re-render; 5 of the reviewer's 7 P0s were asset defects found after the full build; `check` next to mflux took 9× longer. Now: drift, scene-prefixed ids and overlapping whips from the first draft (`look-build.md` §6.4), an asset pass before building (`review.md`), browser steps never beside a model job.
- **`PRODUCTION.md` logged every step as `HH:MM–HH:MM` with start = end** (both written at the end), so `logged_minutes` was 0 and no ETA could be given; the user asked "how long?" three times. `state.mjs log` takes the start from the previous line.
