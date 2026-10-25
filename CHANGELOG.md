# Changelog

All notable changes to this skill are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For a skill,
that reads as:

| Bump | When |
|---|---|
| **MAJOR** | a step, gate or project file is removed or renamed — an in-flight video would break |
| **MINOR** | a new step, option, look, engine or script flag |
| **PATCH** | a fix, a clarification, a tightened rule |

<details>
<summary><b>How a release is cut</b></summary>

<br/>

1. Move the `Unreleased` items into a new `## [x.y.z] - YYYY-MM-DD` section and add its link at the bottom.
2. Commit, then tag and push:
   ```bash
   git tag -a vx.y.z -m "vx.y.z" && git push origin vx.y.z
   ```
3. The `release` workflow verifies the scripts, the `SKILL.md` front-matter and that this file
   has a section for the tag — then publishes the GitHub release with generated notes.
   A tag with a suffix (`v1.1.0-rc.1`) is published as a pre-release.

</details>

## [Unreleased]

### Added

- **Router SKILL.md** (≤ 10 KB, survives auto-compaction intact) with the step details split into
  `references/brief.md`, `script-voice.md`, `look-build.md`, `qc.md`; looks moved to `looks.md`.
- **Fresh-eyes reviewer** (`references/review.md`) — a new subagent finds P0/P1/P2 defects into
  `QC-REVIEW.md` before Gate 4; in autonomous mode its P0 list replaces the human eye.
- **Moving sample at Gate 3** — the hook scene rendered with its narration next to the style frames.
- **`references/camera-motion.md`** — film camera grammar (size, angle and lens by the shot's job,
  motivated moves, axis and eyelines, Murch's cutting order, rhythm staircase), story shape and
  faceless staging, physical timing (springs, gravity, mass, √distance, motion blur), compositing
  (levels, light wrap, occlusion, 2.5D from one photo), design in time, and photoreal still prompts.
- Storyboard columns for the shot's job, size · angle · lens, camera reason and J/L; a shot-grammar
  check at Gate 3; MOTION and ANCHORS lines in `SPEC.md`; rubric rows Consistency and Camera.
- **Forced alignment** (`scripts/align.py`) — word timing against the known script with Apache-2.0
  CTC models; on by default when a model for the language is installed, else transcript timing.
  Words get a `score`; low-score runs are flagged as "the voice may not say the script".
- `scripts/fill_times.mjs` (`{{beat}}` expressions in the template), `state.mjs` (gate approvals,
  stale on change), `qc.mjs` (black frames, clipping, silences, codec and colour tags),
  `timing_lint.mjs` (cuts inside words, flicker scenes), `check_assets.mjs` (licence gate,
  `CREDITS.md`), `score_run.mjs` + `references/evals.md` (golden briefs and a scorecard).
- `audio/narration.srt` sidecar subtitles from the word timing.
- VoiceStudio: `--steps` (default 32), `--seed` (default 42), `--save-profile` / `--ref` cloning,
  VoxCPM2 (Apache-2.0) documented as the commercial-OK voice.

### Changed

- **Free tools by default**: VoiceStudio is the default engine; ElevenLabs and HeyGen are labelled
  paid and used only on request; music offers ACE-Step 1.5 (MIT), never MusicGen; stills via `mflux`
  with Apache-2.0 models only.
- **Hyperreal subject in every look**; people only as real or generated footage, never puppets.
- Sync means the value is readable on the word (lead / sync / wait per element).
- Banned list extended with the dated 2026 tells (text scramble, RGB split, liquid blobs, isometric,
  white flash, AI-gloss, …); one "wow" per film.
- Scripts are written for the ear (spoken register, round numbers, at most one exact number per sentence).

### Fixed

- Style frames have one home (`style-frames/src/`, `look-build.md` §5); the hook sample is the one
  allowed high-quality render before Gate 4.
- Step 7 no longer edits `SPEC.md` (it made Gate 3 stale and blocked Gate 4); defaults go to `PRODUCTION.md`.
- Every file in `assets/` (narration, music, SFX too) goes into `ASSETS.json`; `check_assets.mjs` no
  longer reads "Licence" as non-commercial, fails ND licences, and survives entries without `file`.
- `tts_timestamps.mjs`: `--from-response` reads the language from the response (alignment no longer
  skipped silently); `--sample` never cuts inside a `{beat}`; punctuation-only tokens are not words;
  `[tag]Word` keeps the word; SRT cues never end before they start; SRT for dialogue too; audio paths
  with spaces; sample names hash the full instructions.
- `fill_times.mjs`: untimed beats fail instead of becoming 0; beat names like `new` no longer break it.
- `align.py` keeps accented letters the model knows (ñ, ä, й).
- `score_run.mjs`: a crashed check reads `error`, not 0; open P0/P1 only; logged minutes as a union; no
  side effects. `state.mjs`: every earlier gate must be approved; `check` without a gate. `stillness.mjs`
  subtracts `--allow` ranges. `qc.mjs` flags black over 1 s at the start or end. `loudness.mjs` refuses
  `--fix` onto its own input. `timing_lint.mjs` reads single-quoted attributes. `preflight.mjs`: aligner
  row checks the model and Python; "Voice: ready" needs TTS and ASR.
- Docs: drift vs stillness, cut density and push-in numbers agree across files; HeyGen is paid everywhere;
  the arc and beat map live in Step 3; fps stored in `BRIEF.md`; `approve 4 --by`; ~3 KB of duplicated or
  dead text removed.
- `loudness.mjs --fix` overshooting true peak (−0.5 dB headroom, honest "still off" message).
- `stillness.mjs` lists the longest still stretches on a fail.
- Estimated word timings are marked `est: true` and beats on them are warned.
- Audition samples no longer overwrite each other (name per voice, style and seed).

## [1.0.0] - 2026-10-24

First public release. The pipeline is stable: the steps, the four gates and the project
file layout are what every later version is measured against.

### Added

- **The skill** (`SKILL.md`) — steps 0–8 with four approval gates, the "words first,
  pictures last" rule, autonomous mode, and a token budget for long runs.
- **Voice + per-word timing** (`scripts/tts_timestamps.mjs`) — ElevenLabs or local
  VoiceStudio behind one interface; emits `words.json`, `beats.json` and `beats.js` so
  every animation time references `BEATS.<name>.start` instead of a hard-coded second.
  Supports dialogue (one voice per character) and `--from-audio` for the user's own
  recording, transcribed for timing at zero cost.
- **Environment preflight** (`scripts/preflight.mjs`) — Node, ffmpeg, HyperFrames, both
  voice engines (model state, tier, quota) and image/music sources in one ~3 s call.
  Never prints secrets.
- **Measured QC** — `scripts/stillness.mjs` (the film is not secretly a slideshow) and
  `scripts/loudness.mjs` (LUFS / true peak, with `--fix`).
- **Reference measuring** (`scripts/measure_reference.sh` + `references/measure-reference.md`)
  — borrow a video's rhythm as numbers, never its material.
- **Craft references** — `visual-direction.md` (looks, realism ladder, cinematography,
  review rubric), `craft-rules.md`, `voice.md`, and `lessons.md`, each loaded one section
  at a time by the step that needs it.
- **Docs** — README, [workflow](docs/workflow.md) and [architecture](docs/architecture.md)
  with diagrams.
- **CI** — syntax check on every script and `SKILL.md` front-matter validation on each
  push and pull request.

[Unreleased]: https://github.com/sandalkuilang/dalang/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/sandalkuilang/dalang/releases/tag/v1.0.0
