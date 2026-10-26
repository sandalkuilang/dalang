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
git clone --branch v1.4.0 --depth 1 https://github.com/sandalkuilang/dalang ~/.claude/skills/dalang

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

It reports Node, ffmpeg, HyperFrames, both voice engines (model state, quota, tier) and your stock-video key, each as `OK` / `MISSING` / `WARN` / `INFO` / `PAID` / `SKIP` (VoiceStudio also `STOPPED` / `BUSY` / `DOWN` / `UNREACHABLE` / `CONFLICT`) **with the fix**. VoiceStudio installed but closed? `--start` opens it and waits.

<br/>

## 🎬 How it works

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

Every number reported — duration, cost, stillness %, LUFS — comes from a script's output, not from memory. A good reference film is ~5 % still; your draft gets measured against that.

</td></tr>
<tr><td width="50%" valign="top">

**🚦 Four gates, zero surprises**

Script → voice → look → draft. The look is approved as **three real stills at final quality** before nine scenes get built on top of a guess.

</td><td width="50%" valign="top">

**💸 Cheap before expensive**

`--sample` before a full voice. Snapshots instead of renders. `--quality draft` until the end. One video = one session, because all state lives in files.

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

Rewrite a sentence, regenerate, and the whole film re-times itself. No scene ever holds a hard-coded second.

<br/>

## 🌍 Any topic, any language, any platform

|  | Options |
|---|---|
| **Topic** | science · history · products · tutorials · stories · finance · health · sport — nothing here is tied to one subject, including what no camera can film (molecules, orbits, the inside of a machine) |
| **Narration** | any language. Pace is calibrated per language (EN 2.4–2.7 w/s, ID 2.2–2.5, JA 6–8 char/s …), then measured from the real take |
| **Platform** | YouTube Shorts 9:16 · Reels · TikTok · YouTube landscape 16:9 · Instagram feed 4:5 — safe zones and hook timing follow the pick |
| **Look** | first a realism choice — **hyperreal** (cinematic photoreal, premium 3D, documentary collage, real subject + motion graphics, data: real footage and photos, or PBR 3D — **never** CSS shapes or puppeted people) or **stylized** (toon explainer, stylised 3D, ink & watercolour: easy to watch, renders in seconds) — both true to how the subject really works |
| **3D** | three.js with a bundled engine of generic systems: real scale, simulated physics (Rapier) with mechanisms (stops, springs, latches), cloth, one air field, plants, particles, granular fills, water, fur, section views — baked so every render is identical. A subject the engine lacks is modelled from its own law (orbits, ions, heat) with real constants, the scale changes shown on screen |
| **Camera** | film grammar: shot size, angle and lens chosen by each shot's job, motivated moves, a held axis, cuts on the story word, physically timed motion |
| **Voice** | VoiceStudio (free, local; OmniVoice or VoxCPM2) — or **your own recording**, timed at zero cost. ElevenLabs (paid) only on request |
| **Sound** | music is a licensed free track (your own, then Openverse CC0 / CC BY, credited), never generated; sound effects (bundled library, Openverse CC0; both found with `find_media.mjs`) sit on the actions they belong to, timed from the physics where things collide |

<br/>

## 🧩 What's in here

```
SKILL.md          the skill — principles, steps 0–8, the gates (kept lean on purpose)
references/       loaded one § at a time, only at the step that needs it
  brief.md             steps 0–2: setup, the brief questions, a reference
  script-voice.md      steps 3–4: writing for the ear, number provenance, voice audition
  look-build.md        steps 5–6: SPEC, storyboard, style frames, build
  qc.md · review.md    steps 7–8: checks, fresh-eyes reviewer, final, hand-off
  visual-direction.md  realism ladder, restraint, composition, review rubric
  looks.md             the nine looks, how to offer them, three.js recipes
  camera-motion.md     film camera grammar, physical timing, compositing, stills prompts
  craft-rules.md       boil, push-ins, beats, motion budget, on-screen text
  voice.md             engine setup, cloning, forced alignment, the traps
  measure-reference.md how to borrow craft from a reference — legally
  lessons.md           every real failure, and why a rule exists
  evals.md             golden briefs to run before and after changing the skill
scripts/
  preflight.mjs        whole environment in one call
  tts_timestamps.mjs   narration → words.json + beats.js + narration.srt
  align.py             forced aligner (Apache-2.0 CTC models) for sharp word timing
  fill_times.mjs       {{beat}} expressions in the template → index.html
  state.mjs            gate approvals, stale when files change
  stillness.mjs        is the film secretly a slideshow?
  loudness.mjs         LUFS / true peak, with --fix
  qc.mjs               black frames, clipping, silences, codec + colour tags
  timing_lint.mjs      every cut between words, no flicker scenes
  strips.mjs           review strips: stills per shot on numbered sheets + index
  captions.mjs         narration + words.json → caption phrases (audio/captions.js)
  find_media.mjs       free media search (Openverse, Commons, bundled SFX) → previews + ASSETS.json row
  check_assets.mjs     licence gate for every asset (engine files via .engine.json) → CREDITS.md
  score_run.mjs        one project's scorecard for evals
  measure_reference.sh cuts, boil rate, contact sheets
  gate.sh              the repo's gate (--fast static; full adds the engine self-check and tests/)
engine/three/     the three.js engine for 3D sets: generic systems (real scale, surfaces, physics, mechanisms,
                  cloth, air, plants, particles, grains, water, fur, cutaways, captions and labels) with a self-check; bake.mjs caches a
                  physics bake once for every snapshot and render; examples/ ready pieces
tests/            preflight against a mock VoiceStudio, review strips (run by the gate)
docs/             workflow + architecture, with diagrams
CLAUDE.md         rules for changing the skill
```

<details>
<summary><b>📁 Where your video files live</b></summary>

<br/>

Not in this repo — in **your** project, one folder per video:

```
video/<slug>/
├── BRIEF.md          every Step 1 decision (format, language, look, energy)
├── PRODUCTION.md     work log, one line per step — the source of every number
├── script.md         for humans: sections, visual notes, every number tagged with its source
├── narration.txt     only the spoken words + {beat|name} markers
├── audio/            narration, words.json, beats.json, beats.js
├── SPEC.md           the LOOK in numbers · OBJECTS · BANNED defaults
├── storyboard.md     colour script + shot table, times from beats.json
└── style-frames/     three stills, approved before anything is built
```

State lives in files, so a session can die and you resume from `BRIEF.md` + the last lines of `PRODUCTION.md`.

</details>

<details>
<summary><b>🔧 Requirements</b></summary>

<br/>

| Needed | For | Notes |
|---|---|---|
| Node.js · ffmpeg | everything | `preflight.mjs` says what's missing |
| HyperFrames skills | the build step | `npx hyperframes skills update` |
| VoiceStudio | narration + word timing | free, local; ElevenLabs (paid) is optional |
| three 0.186.1 · Rapier 0.14.0 (pinned, in `engine/three/vendor`) | 3D sets and physics | free, MIT / Apache-2.0; `build.mjs` installs them once and bundles them into each project |
| Python + torch (VoiceStudio's venv) · an aligner model | sharper word timing | optional, ~0.6 GB per language |

The ElevenLabs key is read from `ELEVENLABS_API_KEY` **in your own shell** — never printed, never written to a project file.

</details>

<details>
<summary><b>🤖 Autonomous mode</b></summary>

<br/>

Give it a topic and walk away: it defaults to 16:9, 60–90 s (9:16 when you ask for a short), your language, modern balanced energy, writes `defaults used` on line 1 of `PRODUCTION.md`, passes the gates on its own judgement, logs every decision — and, with nobody to accept a known defect, holds the final until every Realism, Reality or Clarity P1 is fixed (or two fix rounds failed on it, and the hand-off names it) — and **stops at a draft**. The final render only happens if you said *"just finish it"* (in any language). The hand-off lists what is still open and ends `PRODUCTION.md` with `## Skill feedback`: generic traps to report upstream.

</details>

<br/>

## ⚖️ Ethics

Borrowing the **craft** of a video you admire — section lengths, cut rhythm, camera moves — is fair, and there's a whole script for measuring it. Reusing its **images, script or voice** is not. A recorded voice is used only with the speaker's permission.

<br/>

## 📄 Licence

[MIT](LICENSE) — do what you like with the skill.

Not ours to license: VoiceStudio's default **OmniVoice** weights (CC-BY-NC) and the **ElevenLabs free tier** are non-commercial; **VoxCPM2** is Apache-2.0. That limit follows the audio they generate, not this repo. `check_assets.mjs --commercial` fails any non-commercial asset before a monetised render, and `check_assets.mjs` checks the narration's licence against the model that spoke it (`scripts/voice_licences.mjs`); a voice that table cannot identify is a `WARN`, never read as commercial-OK.

Parts of `references/camera-motion.md` paraphrase [smixs/visual-skills](https://github.com/smixs/visual-skills) by Serge Shima (CC BY 4.0) and [iart-ai motion skills](https://github.com/iart-ai/motion-skills) (MIT); see [NOTICE](NOTICE).

<div align="center"><br/><sub>Built because "make it like that one" is not a brief.</sub></div>
