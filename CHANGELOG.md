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

- **Real scale and interior direction** (`looks.md`, `brief.md`): metres per unit measured from known objects,
  props modelled in metres, physics in real units; a `condition` (lived-in by default; worn only when the topic is
  about age) and an `interior` style (American-Japandi by default) recorded in the brief; soft things stuffed and
  dented, loose cushions settled by simulation, every prop resting on its own lowest points.
- **True shapes and surfaces in 3D** (`looks.md`): soft and organic kit models subdivided (Loop, hard furniture
  kept crisp); procedural triplanar surfaces with no UVs — worn paint flaking off plaster, woven cloth with sheen,
  cotton pile, fine wood grain, micro-smudges; animals swept from their anatomy at real size and given shell fur
  combed along the body; lamps that light the room with inverse-square falloff (drum-shade cones, a glowing
  screen); displays fitted to the model's own screen face.
- **Air and cloth** (`camera-motion.md` §5): a fan is a turbulent round jet that sweeps with its oscillating head
  and is blocked by what stands in its way; curtains are simulated cloth moved by its drag; the fan is heard.
- **Emotion-driven cinematography** (`camera-motion.md` §12): an emotion → size, angle, lens, focus, move,
  light ratio, colour, shutter and frame-ratio table; every shot names its emotion and a motivation for each choice;
  the SPEC rulebook with logged rule breaks at turning points; short-side motivated light with Kelvin → three.js
  colours; headroom, negative space and rhyming final image; frame-ratio masks for 16:9; finishing order with
  halation; approach presets from award-winning indie films; waveform, vectorscope and cut-sheet checks in Step 7.
- **Real physics in 3D**: objects that touch, fall or collide are simulated with Rapier and baked per step
  (deterministic, seekable; verified identical across two renders); the whole set collides, colliders match the
  drawn shapes (round cuboids, hulls, per-leg hulls, caster balls), pushed things are dynamic with real mass and
  rolling resistance, jointed parts are joints; a stiff solver, a settling pre-roll and a per-bake report
  (penetration, floating, still moving, drift); impacts drive sound and reactions — each sound placed on its bake
  time, a rolling sound following the speed, contact gains on a perceptual curve, verified by onset rise and a
  null test against an offline mix; motion blur from the bake.
  Resting props are dropped onto their real support and audited; rugs have thickness, cables lie on the floor
  and end in sockets. Ambient motion at its real amount. A Craft review test checks contacts, causes and floating props.
- **Set dressing**: every 3D set is dressed with the small true-to-life things that would be there, plus a few small
  life motions; it decides whether a stylized set reads as real or as a toy. A `looks.md` recipe (CC0 kits
  recoloured into the palette, creased normals, real-leaf plants, canvas textures, a light probe, ≥ 2 cm detail rule)
  and a Realism review test.
- `state.mjs log "<step> | <output> | <problems>"` writes a `PRODUCTION.md` line whose start is the previous
  line's end, so steps get real durations (`score_run.mjs` `logged_minutes` was 0) and ETAs can be given.
- `scripts/key_white.py`: cut a product generated on a white light box (flood-fill key, `--holes` for a handle).
- **Realism is a Step 1 choice**: hyperreal (looks like real footage) or stylized (a premium animated film: easy to
  watch, reads at a glance, renders in seconds), explained with a per-topic preview. Stylized subjects are drawn on
  purpose but still pass the Reality check against a real reference. New look I (toon explainer); look C is now the studio diorama (muted palette, one accent, grey void, three-quarter view), the default for stylized.
- `looks.md` three.js recipes, verified by render: hyperreal (real HDRI rotated so a softbox edge sweeps the
  hero, soft key shadow and rim, N8AO, gentle DOF, AgX, per-surface finishes) stylized toon (3-step ramp,
  inverted-hull ink outline on smoothed normals, no tone mapping) and studio diorama (an approximated bake: RoomEnvironment
  light, rounded matte parts, shadow-catcher ground, N8AO, neutral tone mapping; candy pastels read cheap). Path tracing was unreliable in the capture browser.
- **Motion is three.js, not a video model:** local image-to-video (LTX-2, Wan) is dropped from the default path —
  too heavy for a laptop; a subject that must act and has no footage is built in three.js. A generated clip only
  as a paid exception the user asks for.

### Changed

- **No image or music generator in the default path.** `mflux` stills and ACE-Step music are heavy local
  installs that load a laptop; they run only when the user asks. Music is a licensed free track (Openverse
  CC0 / CC BY, no key, then Commons), looped and faded to the film's length; stills come from real sources and
  three.js. Preflight no longer probes either generator and asks for a free stock-video key instead.

### Fixed

- Queued heavy jobs deadlocked on `pgrep -f` matching their own shell; SKILL.md now chains them or waits on a PID.
- Reality check names where the action happens (a generated action landed on the wrong part); `tts_timestamps.mjs` explains the
  clone-profile 500 and `--save-profile` refuses references over 20 s.
- Gate waits queue music and all stills; saved voice profiles are offered before auditioning; SFX sources named;
  messages give the clock time of the next gate. ([#2](https://github.com/sandalkuilang/dalang/issues/2))
- **No more slideshows.** The subject acts in every shot; a drifting still is a ≤ 1.5 s breath, ≤ 15 % of the
  runtime (the old rule let a ≥ 30 px/s drift count as motion, and a film of drifting stills passed at 0.8 %
  "still"). Storyboard gains a "Subject action (+ source)" column, a shot-count floor from the energy and a
  mechanism shot for every "why"; the Gate 3 sample includes the hardest action shot; reviewer Action test (P0).
- **Browser isolation:** `hyperframes preview` always with `--no-open` (it opened the user's own Chrome); the Studio
  URL opens only in Claude's isolated built-in browser, never the system browser or Claude in Chrome.
- **Cinematography with real cameras** (`camera-motion.md` §10): A-roll (the explanation) and B-roll (short cinematic
  shots with a real move) in a set pattern; every perceptible move from footage, a 3D rig camera (focal length,
  damped look-at, bokeh, sub-frame motion blur) or a generated clip, never CSS on a still; 24 fps / 180° for a
  film look; real slow motion and speed ramps from high-fps sources; one wow shot on the impact; a CAMERA line in SPEC.
- **Cinematographer's toolbox** (`camera-motion.md` §11): light (contrast ratios, colour-temperature contrast,
  practicals, light as the event), lens (wide close, telephoto, macro/probe, split diopter, tilt-shift, focus as
  narration), movement (reveal, push-through, crane, tracking, orbit, oner, motion-control repeat, frozen moment),
  time (slow motion, timelapse, freeze-and-annotate), editing (cross-cutting, collision montage, graphic match,
  invisible cut) and explainer signatures (scale journey, x-ray shell, cutaway, exploded view, world-space labels).
  Each film picks a 6–10 technique palette on SPEC's CAMERA line.
- The 3D rig recipes in `camera-motion.md` §10 are verified by a render on 16 GB (orbit, x-ray shell, push-through,
  motion-control repeat, freeze-and-annotate, speed ramp), with timings and the three.js / canvas-font gotchas.
- Preflight reports a free stock-video key (Pexels / Pixabay) for real motion footage; local LTX-2 image-to-video
  is listed as an optional install.
- Asset pass (`review.md`): a fresh reviewer compares every generated still with its real reference before Gate 3
  and before blocking, so Reality fails cost one regeneration instead of a rebuild and re-render.
- Build scaffold: plate drift, scene-prefixed ids and overlapping whip pans from the first draft (each cost a
  re-render); `check`, snapshots and renders never run beside a model job.
- Machines and mechanisms start from the user's photos or Commons stills, not the generator (generated machines
  put parts in impossible places); the Reality check compares against a downloaded reference photo.

## [1.1.0] - 2026-10-25

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
- Free local generators, measured on a 16 GB M5: `mflux` + Z-Image Turbo (`--low-ram`, ~100 s per
  1024² still), SeedVR2 upscale (~110 s for 2×), and `scripts/music_acestep.py` for ACE-Step 1.5
  (~8 min per 30 s); preflight detects them properly (`mflux-generate-z-image-turbo --help`, `ACESTEP_DIR`).
- VoiceStudio: `--steps` (default 32), `--seed` (default 42), `--save-profile` / `--ref` cloning.
- VoxCPM2 (Apache-2.0) as the commercial-OK voice: `--model voxcpm2` sends `--instructions` as its
  `description` and ~120-character chunks (it runs ~22× slower than real time on a 16 GB Mac, and
  VoiceStudio abandons requests over 300 s of compute).

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

[Unreleased]: https://github.com/sandalkuilang/dalang/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/sandalkuilang/dalang/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sandalkuilang/dalang/releases/tag/v1.0.0
