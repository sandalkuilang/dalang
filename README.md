<div align="center">

# 🎭 Dalang

### Any topic → a finished animated video.

Script, AI voice, per-word timing, music, sound effects, animated visuals.<br/>
One skill that directs the whole thing — and stops for your approval four times.

[![CI](https://github.com/sandalkuilang/dalang/actions/workflows/ci.yml/badge.svg)](https://github.com/sandalkuilang/dalang/actions/workflows/ci.yml)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-black.svg)](LICENSE)
[![Claude Code skill](https://img.shields.io/badge/Claude_Code-skill-d97757.svg)](https://claude.com/claude-code)
[![Any language](https://img.shields.io/badge/narration-any_language-4c9a2a.svg)](#-any-topic-any-language-any-platform)

[**Install**](#-install) · [**How it works**](#-how-it-works) · [**Workflow**](docs/workflow.md) · [**Architecture**](docs/architecture.md)

</div>

---

A *dalang* is the puppet master of Javanese shadow theatre: **one person who tells the story and moves every puppet.** That is the job this skill takes.

You bring a topic. It writes the script, records the voice, finds out when every single **word** is spoken, then builds the animation on top of that timing — so nothing on screen is ever eyeballed. Pictures are built by the HyperFrames skills; the voice by a local engine (free) or ElevenLabs (paid). Dalang owns the part nobody else does: **the order of work, the approval gates, and the quality bar.**

> It was distilled from real runs. The biggest lesson: *"make it like that one"* is useless. *"Cut here, it appears exactly on this word, the hero fills 45 % of the frame"* works.

<br/>

## ⚡ Install

```bash
git clone https://github.com/sandalkuilang/dalang ~/.claude/skills/dalang
```

Restart Claude Code. Then just ask, in any language:

```
"make a 45 s YouTube Short about why cats land on their feet"
"bikinin video penjelasan tentang uang kas"
"haz un video de 90 s sobre la fotosíntesis"
```

Check your machine once — one call, ~3 s, never prints secrets:

```bash
node ~/.claude/skills/dalang/scripts/preflight.mjs
```

It reports Node, ffmpeg, HyperFrames, both voice engines (model state, quota, tier) and your image/music sources, each as `OK` / `MISSING` / `WARN` **with the fix**.

<br/>

## 🎬 How it works

Nine steps, four gates. **Nothing renders at final quality before the last one.**

```mermaid
flowchart LR
    B["📋 Brief"] --> S["✍️ Script"]
    S ==>|"GATE 1"| V["🎙️ Voice"]
    V ==>|"GATE 2"| L["🎨 Look"]
    L ==>|"GATE 3"| A["🏗️ Build"]
    A ==>|"GATE 4"| R["🎥 Render"]

    style B fill:#1f2328,stroke:#656c76,color:#e6edf3
    style S fill:#1f2328,stroke:#656c76,color:#e6edf3
    style V fill:#1f2328,stroke:#656c76,color:#e6edf3
    style L fill:#1f2328,stroke:#656c76,color:#e6edf3
    style A fill:#1f2328,stroke:#656c76,color:#e6edf3
    style R fill:#d97757,stroke:#8a3d22,color:#fff
    linkStyle 1,2,3,4 stroke:#d97757,stroke-width:3px
```

Each **gate** is a full stop: you see the script, hear the narration, approve three real stills, then watch the draft. Fail one and it loops back — the [full diagram](docs/workflow.md) has every return path.

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

## 🌍 Any topic, any language, any platform

|  | Options |
|---|---|
| **Topic** | science · history · products · tutorials · stories · finance · health · sport — nothing here is tied to one subject |
| **Narration** | any language. Pace is calibrated per language (EN 2.4–2.7 w/s, ID 2.2–2.5, JA 6–8 char/s …), then measured from the real take |
| **Platform** | YouTube Shorts 9:16 · Reels · TikTok · YouTube landscape 16:9 · Instagram feed 4:5 — safe zones and hook timing follow the pick |
| **Look** | cinematic photoreal · stylised 3D · 2D motion design · documentary collage · ink & watercolour — a physical hero comes from a real photo, **never** CSS shapes |
| **Voice** | VoiceStudio (free, local) or ElevenLabs (cloud) — or **your own recording**, transcribed for timing at zero cost |

<br/>

## 🧩 What's in here

```
SKILL.md          the skill — principles, steps 0–8, the gates (kept lean on purpose)
references/       loaded one § at a time, only at the step that needs it
  voice.md             engine setup + the traps that cost hours
  visual-direction.md  looks, realism ladder, cinematography, review rubric
  craft-rules.md       boil, push-ins, motion budget, on-screen text
  measure-reference.md how to borrow craft from a reference — legally
  lessons.md           every real failure, and why a rule exists
scripts/
  preflight.mjs        whole environment in one call
  tts_timestamps.mjs   narration → words.json + beats.js
  stillness.mjs        is the film secretly a slideshow?
  loudness.mjs         LUFS / true peak, with --fix
  measure_reference.sh cuts, boil rate, contact sheets
docs/             workflow + architecture, with diagrams
```

<details>
<summary><b>📁 Where your video files live</b></summary>

<br/>

Not in this repo — in **your** project, one folder per video:

```
video/<slug>/
├── BRIEF.md          every Step 1 decision (format, language, look, energy)
├── PRODUCTION.md     work log, one line per step — the source of every number
├── script.md         for humans: sections, visual notes, sources
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
| VoiceStudio **or** ElevenLabs | narration + word timing | VoiceStudio is free and runs locally |

The ElevenLabs key is read from `ELEVENLABS_API_KEY` **in your own shell** — never printed, never written to a project file.

</details>

<details>
<summary><b>🤖 Autonomous mode</b></summary>

<br/>

Give it a topic and walk away: it defaults to 16:9, 60–90 s, your language, modern balanced energy, writes `defaults used` on line 1 of `PRODUCTION.md`, passes the gates on its own judgement, logs every decision — and **stops at a draft**. The final render only happens if you said *"just finish it"* up front.

</details>

<br/>

## ⚖️ Ethics

Borrowing the **craft** of a video you admire — section lengths, cut rhythm, camera moves — is fair, and there's a whole script for measuring it. Reusing its **images, script or voice** is not. A recorded voice is used only with the speaker's permission.

<br/>

## 📄 Licence

[MIT](LICENSE) — do what you like with the skill.

One thing that is *not* ours to license: the **ElevenLabs free tier** and **VoiceStudio's default model** are non-commercial. That limit follows the audio they generate, not this repo.

<div align="center"><br/><sub>Built because "make it like that one" is not a brief.</sub></div>
