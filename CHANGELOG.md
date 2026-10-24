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
