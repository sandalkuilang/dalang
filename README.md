<div align="center">

<img alt="Dalang — any topic becomes a finished animated video. A puppet master's strings are tied to spoken words, and each one runs straight down to the start of a scene." src="docs/assets/banner.svg" width="100%">

<h3>Script, AI voice, per-word timing, music and animated visuals —<br/>directed end to end, and stopped four times for your approval.</h3>

[![Release](https://img.shields.io/github/v/release/sandalkuilang/dalang?sort=semver&color=d97757&style=for-the-badge)](https://github.com/sandalkuilang/dalang/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/sandalkuilang/dalang/ci.yml?branch=main&label=CI&style=for-the-badge)](https://github.com/sandalkuilang/dalang/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-black.svg?style=for-the-badge)](LICENSE)
[![Claude Code skill](https://img.shields.io/badge/Claude_Code-skill-d97757.svg?style=for-the-badge)](https://claude.com/claude-code)
[![Any language](https://img.shields.io/badge/narration-any_language-4c9a2a.svg?style=for-the-badge)](#-any-topic-any-language-any-platform)

<h4>
  <a href="#-install">Install</a> &nbsp;·&nbsp;
  <a href="#-how-it-works">How it works</a> &nbsp;·&nbsp;
  <a href="docs/workflow.md">Workflow</a> &nbsp;·&nbsp;
  <a href="docs/architecture.md">Architecture</a> &nbsp;·&nbsp;
  <a href="CHANGELOG.md">Changelog</a>
</h4>

</div>

---

A *dalang* is the puppet master of Javanese shadow theatre: **one person who tells the story and moves every puppet.** That is the job this skill takes.

You bring a topic. It writes the script, records the voice, finds out when every single **word** is spoken, then builds the animation on top of that timing — so nothing on screen is ever eyeballed. Pictures are built by the HyperFrames skills; the voice by a free local engine (ElevenLabs only if you ask). Every tool on the default path is free and runs on your machine. Dalang owns the part nobody else does: **the order of work, the approval gates, and the quality bar.**

> It was distilled from real runs. The biggest lesson: *"make it like that one"* is useless. *"Cut here, it appears exactly on this word, the hero fills 45 % of the frame"* works.

<br/>

## ⚡ Install

```bash
git clone https://github.com/sandalkuilang/dalang ~/.claude/skills/dalang
```

<details>
<summary>Pin to a release, or update later</summary>

<br/>

```bash
# pin to a tagged release instead of main
git clone --branch v1.8.0 --depth 1 https://github.com/sandalkuilang/dalang ~/.claude/skills/dalang

# update an existing install to the newest release
cd ~/.claude/skills/dalang && git fetch --tags && git checkout "$(git describe --tags --abbrev=0 origin/main)"
```

Versions follow [semver](CHANGELOG.md): a **major** bump means a step, gate or project file changed name — an in-flight video would break.

</details>

Restart Claude Code. Then just ask, in any language:

```
"make a 45 s YouTube Short about why cats land on their feet"
"bikinin video penjelasan tentang uang kas"
"haz un video de 90 s sobre la fotosíntesis"
```

Check your machine once — one call, a few seconds, never prints secrets:

```bash
node ~/.claude/skills/dalang/scripts/preflight.mjs
```

It reports Node, ffmpeg, HyperFrames, this skill's own clone (behind `origin/main`? update with `git -C ~/.claude/skills/dalang pull --ff-only`; pinned to an older release? the note gives the fetch-tags and checkout command above), the voice engines (model state, quota, tier; Kokoro optional) and your stock-video key, each as `OK` / `MISSING` / `WARN` / `INFO` / `PAID` / `SKIP` (VoiceStudio also `STOPPED` / `BUSY` / `DOWN` / `UNREACHABLE` / `CONFLICT`) **with the fix**. VoiceStudio installed but closed? `--start` opens it and waits. It also says when the folder you make videos in loads plugins or MCP servers a video never uses (they are re-read on every model call): `node ~/.claude/skills/dalang/scripts/workspace.mjs init <folder>` proposes switching them off for that folder only. It asks first, writes only `<folder>/.claude/settings.json` with `--yes` (your user settings are never touched), and `undo` restores the old file.

<br/>

## 🎬 How it works

**Two modes, asked first.** **Express** (the default): a 2.5D illustrated film in about 20 minutes, each beat a finished infographic in one design language picked by subject (cutaway, isometric, blueprint, park poster, naturalist plate…), one builder, and no stop after the Brief: you get the finished film (`references/express.md`). Isometric objects are written as data from shape families (turned, extruded, swept, gears, wheels, figures) or taken from CC0 models, so no object is drawn from scratch (`engine/iso/`). **Studio**: the full pipeline below, three.js 3D, every check. Neither mode stops for you after the Brief: the agent passes the gates itself and hands you the film.

Nine steps, four gates. **Nothing renders at final quality before the last one.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/pipeline.dark.svg">
  <img alt="Brief, Script, Voice, Look, Build, Render — with four approval gates, each able to send the work back one stage" src="docs/assets/pipeline.light.svg" width="100%">
</picture>

Each **gate** is a full stop where you, not the machine, decide it is good: **read the script · hear the narration · approve three real stills · watch the draft.** A failed one sends the work back exactly one stage — never to the start. The [step-by-step workflow](docs/workflow.md) has the rest.

<table>
<tr><td width="50%" valign="top">

**🗣️ Words first, pictures last**

The voice is recorded *before* a single frame exists. Every change on screen is pinned to `BEATS.hook.start`, never to a hard-coded second. Rewrite a line → regenerate → the visuals move with it.

</td><td width="50%" valign="top">

**📏 Measure, don't guess**

Every number reported — duration, cost, stillness %, LUFS, bed level — comes from a script's output, not from memory. A good reference film is ~5 % still; your draft gets measured against that.

</td></tr>
<tr><td width="50%" valign="top">

**🚦 Four gates, zero surprises**

Script → voice → look → draft. The look is approved as **three real stills at final quality** before nine scenes get built on top of a guess.

</td><td width="50%" valign="top">

**💸 Cheap before expensive**

`--sample` before a full voice. Snapshots instead of renders. `--quality draft` until the end. Sheets and crops before full-res stills; a test run gets one review round. One video = one session, because all state lives in files. The film's scene code never enters the main thread (the Step 5 style frames do): a builder subagent builds a pilot shot group (or a short film whole), checked against the style frames, then one builder per group builds the rest and each QC fix round goes to a builder too; the main thread holds the gates and the verdicts. The strongest model judges the film; a mid-tier model does the pass/fail fix checks, asset pair checks, media screening (and the Step 5 reference boards the style frames are built from) and research.

</td></tr>
</table>

<br/>

## 🎯 The part nothing else does

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/timing.dark.svg">
  <img alt="The narration waveform, every word boxed with its own start and end, and scenes that begin exactly on a named beat" src="docs/assets/timing.light.svg" width="100%">
</picture>

<p align="center"><i>Scene C does not start at “about 6.4 seconds”. It starts at <code>BEATS.proof.start</code>.</i></p>

The voice is recorded **before a single frame exists**, then timed word by word — by forced alignment against the script where a model for the language is installed, else by transcription. Named beats in the script (`{so here is the catch|proof}`) become exact timestamps, and every scene, cut and title references `BEATS.<name>.start`.

Rewrite a sentence, regenerate, and the whole film re-times itself. A sentence the voice got wrong is re-spoken alone and spliced in at its pauses (`--retake auto`, or `--retake changed` after an edit), never the whole take. A take stopped by a busy backend resumes from the chunks already spoken. A calmer or faster delivery of an approved take is `--tempo` (ffmpeg `atempo`; the take keeps its model and licence). No scene ever holds a hard-coded second.

<br/>

## 🌍 Any topic, any language, any platform

|  | Options |
|---|---|
| **Topic** | science · history · products · tutorials · stories · finance · health · sport — nothing here is tied to one subject, including what no camera can film (molecules, orbits, the inside of a machine) |
| **Narration** | any language. Pace is calibrated per language (EN 2.4–2.7 w/s, ID 2.2–2.5, JA 6–8 char/s …), then measured from the real take |
| **Platform** | YouTube Shorts 9:16 · Reels · TikTok · YouTube landscape 16:9 · Instagram feed 4:5 — safe zones and hook timing follow the pick; 30 fps by default (the platforms play at 30), 24 is a film-look choice and gets motion blur on every camera move |
| **Look** | always stylized and true to how the subject really works: technical clean x-ray, toon explainer, engineering cutaway, stylised 3D diorama, ink & watercolour, editorial type, dimensional data — easy to watch, renders in seconds; never footage or a photoreal render |
| **3D** | three.js with a bundled engine of generic systems: real scale, machine parts and transmissions (gears, belts, chains at real tooth ratios), air jets, granular fills, fields and optics (field lines, filings, rays through lenses), section views, electronics with printed markings at real size, camera stations and attention by ghosting — every motion a pure function of t from its cause, so every render is identical. A subject the engine lacks is modelled from its own law (orbits, ions, heat) with real constants, the scale changes shown on screen |
| **Camera** | film grammar: shot size, angle and lens chosen by each shot's job, motivated moves, a held axis, cuts on the story word, physically timed motion |
| **Voice** | VoiceStudio (free, local; OmniVoice or VoxCPM2) — or Kokoro-82M (free, local, Apache-2.0) for English (en, en-gb) — or **your own recording**, timed at zero cost. ElevenLabs (paid) only on request |
| **Sound** | music is a licensed free track (your own, then Openverse CC0 first, then CC BY with a visible credit the user places), never generated; sound effects (bundled library, Openverse CC0; both found with `find_media.mjs`) sit on the actions they belong to, timed from the cause where things collide (the computed contact time) |
| **Series** | save a channel's kit once (`series.mjs`): its next videos start from it with the same look, HUD, captions, voice and rules, and fewer questions; never scene code |

<br/>

## 🧩 What's in here

```
SKILL.md          the skill — principles, steps 0–8, the gates (kept lean on purpose)
references/       one § at a time: `state.mjs next` prints each step's § commands; the gate keeps each ≤ 8 KB
  brief.md             steps 0–2: setup, the brief questions, a reference
  script-voice.md      steps 3–4: writing for the ear, number provenance, arc templates, voice audition
  look-build.md        steps 5–6: SPEC, storyboard, style frames, build
  qc.md · review.md    steps 7–8: checks, fresh-eyes reviewer, Gate 3 benchmark, sound-off quiz, final, hand-off (incl. `POST.md`, the post description)
  visual-direction.md  true-shape sourcing, restraint, composition, review rubric, information layers, showing a quantity
  looks.md             the eleven looks, how to offer them, three.js recipes
  camera-motion.md     film camera grammar, physical timing, design in time
  craft-rules.md       boil, push-ins, beats, motion budget, on-screen text
  voice.md             engine setup, cloning, forced alignment, the traps
  measure-reference.md how to borrow craft from a reference — legally
  lessons.md           every real failure, tagged by step, and why a rule exists
  evals.md             golden briefs to run before and after changing the skill
scripts/
  preflight.mjs        whole environment in one call
  workspace.mjs        lean video folder: plugins / MCP servers a video never uses off (project settings, undo; `measure` compares first-call tokens)
  tts_timestamps.mjs   narration → words.json + beats.js + narration.srt
  align.py             forced aligner (Apache-2.0 CTC models) for sharp word timing
  fill_times.mjs       {{beat}} expressions in the template → index.html; --lang for a second-language cut
  state.mjs            gate approvals, stale when files change; Gate 3 needs the benchmark verdict; `next`: the step's reading list
  tokens.mjs           tokens per agent from Claude Code's transcripts, a WARN per builder over budget (recorded at every gate)
  stillness.mjs        is the film secretly a slideshow?
  loudness.mjs         LUFS / true peak, with --fix
  audio_qc.mjs         music bed under the voice, clicks, dropouts, voice drift per sentence
  qc.mjs               black frames, clipping, silences, codec + colour tags
  scopes.mjs           exposure and hue as numbers per cut; PNGs only for a flagged cut
  timing_lint.mjs      every cut between words, no flicker scenes
  lint_scene.mjs       code swallowed by a mid-line // comment (file:line), before every render
  numbers_lint.mjs     spoken model numbers = numbers.json, [calc: name] tags in it (Gate 1)
  beats_lint.mjs       a second-language narration keeps every named beat, in order (second-language cut)
  storyboard_lint.mjs  slideshow risk in the storyboard: empty cells, repeated shots, text-only rows, shot length (Step 5)
  series.mjs           series kit: save a channel's look, HUD, captions, voice and rules once; apply to each new video (never scene code)
  strips.mjs           review strips: stills per shot on numbered sheets + index + layout numbers; --crops adds a subject crop per shot; --against labels what changed since the last round
  layout_lint.mjs      canvas text boxes per strip frame: safe area, hero overlap, minimum size, caption over label (strips.mjs runs it)
  golden.mjs           golden scene rendered per version: metrics + sheet + diff against the previous (release time)
  captions.mjs         narration + words.json → caption phrases (audio/captions.js)
  find_media.mjs       free media search (Openverse, Commons, bundled SFX, CC0 3D models) → previews + ASSETS.json row
  check_assets.mjs     licence gate for every asset (engine files via .engine.json) → CREDITS.md
  score_run.mjs        one project's scorecard for evals (incl. the quiz score)
  measure_reference.sh cuts, boil rate, contact sheets, palette, reference board
  palette.mjs          dominant colours of a video (% of frame, OKLCH L); --compare for figure-ground
  gate.sh              the repo's gate (--fast static, reading budget included; full adds the engine self-check and tests/)
engine/three/     the three.js engine for 3D sets: generic systems (real scale, surfaces, machine parts and transmissions,
                  air jets, grains, fields and optics (field
                  lines, filings, rays through lenses), cutaways, captions and labels,
                  printed markings and electronics, standard machine parts and the x-ray housing (parts.js),
                  quantities (flow arrows, tile fills, range cards), camera stations and
                  attention, shots from data: shots.js plays a shot list) with a self-check; examples/ ready pieces
engine/iso/       the Express isometric look: iso.js (vendored), shape families (forms.js), objects as data
                  (build.js), CC0 glTF/GLB models drawn flat (model.js), camera parallax by layer depth
                  (parallax.js), film camera and finish (cinema.js), example specs
examples/golden/  the fixed golden scene for release evals (engine parts only)
evals/golden/     committed per-release golden results: frames, sheet, metrics
tests/            preflight against a mock VoiceStudio, a Kokoro take, review strips, palette, scene lint, series kit, lean workspace, Gate 3 benchmark, golden (run by the gate)
docs/             workflow + architecture, with diagrams
CLAUDE.md         rules for changing the skill
```

<details>
<summary><b>📁 Where your video files live</b></summary>

<br/>

Not in this repo — in **your** project, one folder per video:

```
video/<slug>/
├── BRIEF.md          every Step 1 decision (format, language, look, energy, sign-off, series)
├── PRODUCTION.md     work log, one line per step — the source of every number
├── script.md         for humans: sections, visual notes, every number tagged with its source
├── narration.txt     only the spoken words + {beat|name} markers
├── model.mjs         when the script computes: named inputs → numbers + state(t); writes numbers.json
├── audio/            narration, words.json, beats.json, beats.js
├── SPEC.md           the LOOK in numbers · OBJECTS · BANNED defaults
├── storyboard.md     colour script + shot table with overlays, times from beats.json
└── style-frames/     three stills, approved before anything is built
```

State lives in files, so a session can die and you resume with `node <skill-dir>/scripts/state.mjs next`, `BRIEF.md` and the last lines of `PRODUCTION.md`.

</details>

<details>
<summary><b>🔧 Requirements</b></summary>

<br/>

| Needed | For | Notes |
|---|---|---|
| Node.js · ffmpeg | everything | `preflight.mjs` says what's missing |
| HyperFrames skills | the build step | `npx hyperframes skills update` |
| VoiceStudio | narration + word timing | free, local; ElevenLabs (paid) is optional |
| three 0.186.1 (pinned, in `engine/three/vendor`) | 3D sets | free, MIT; `build.mjs` installs them once and bundles them into each project |
| Kokoro-82M (`pip install kokoro soundfile torchaudio`, own Python via `DALANG_PYTHON`) | optional commercial-OK local voice (`--engine kokoro`) | the pip install pulls torch, transformers, spaCy and the rest: ~0.3 GB on macOS arm64, ~3 GB on Linux with CUDA wheels; then ~330 MB of weights (+ the ~13 MB spaCy English text model). Apache-2.0, en and en-gb only, asked first |
| Python + torch (VoiceStudio's venv) · an aligner model | sharper word timing | optional, ~0.6 GB per language |

The ElevenLabs key is read from `ELEVENLABS_API_KEY` **in your own shell** — never printed, never written to a project file.

</details>

<details>
<summary><b>🤖 Autonomous mode</b></summary>

<br/>

Give it a topic and walk away: it defaults to 16:9, 60–90 s (9:16 when you ask for a short), your language, modern balanced energy, writes `defaults used` on line 1 of `PRODUCTION.md`, passes the gates on its own judgement, logs every decision — and, with nobody to accept a known defect, holds the final until every Set, Reality or Clarity P1 is fixed (or two fix rounds failed on it, and the hand-off names it) — and **stops at a draft**. The final render only happens if you said *"just finish it"* (in any language). The hand-off lists what is still open and ends `PRODUCTION.md` with `## Skill feedback`: generic traps to report upstream.

</details>

<br/>

## ⚖️ Ethics

Borrowing the **craft** of a video you admire — section lengths, cut rhythm, camera moves — is fair, and there's a whole script for measuring it. Reusing its **images, script or voice** is not. A recorded voice is used only with the speaker's permission.

<br/>

## 📄 Licence

[MIT](LICENSE) — do what you like with the skill.

Not ours to license: VoiceStudio's default **OmniVoice** weights (CC-BY-NC) and the **ElevenLabs free tier** are non-commercial; **VoxCPM2** and **Kokoro-82M** are Apache-2.0. That limit follows the audio they generate, not this repo. `check_assets.mjs --commercial` fails any non-commercial asset before a monetised render, and `check_assets.mjs` checks the narration's licence against the model that spoke it (`scripts/voice_licences.mjs`); a voice that table cannot identify is a `WARN`, never read as commercial-OK.

Parts of `references/camera-motion.md` paraphrase [smixs/visual-skills](https://github.com/smixs/visual-skills) by Serge Shima (CC BY 4.0) and [iart-ai motion skills](https://github.com/iart-ai/motion-skills) (MIT); see [NOTICE](NOTICE).

<div align="center"><br/><sub>Built because "make it like that one" is not a brief.</sub></div>
