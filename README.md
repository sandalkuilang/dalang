# Dalang

> Turn any topic into a finished animated video — script, AI voice, per-word timing, music, sound effects and animated visuals — with an approval gate at every stage.

A *dalang* is the puppet master of Javanese shadow theatre: one person who tells the story and moves every puppet. This is a [Claude Code](https://claude.com/claude-code) **skill** that plays that role. It decides the *order of work*, *when to stop for approval* and the *quality bar*; the actual animation is built by the official HyperFrames skills, and the voice comes from a local ([VoiceStudio](https://github.com/debpalash/VoiceStudio), free) or cloud ([ElevenLabs](https://elevenlabs.io), paid) engine.

General purpose: any topic, any narration language, any platform (YouTube Shorts / landscape, Instagram Reels / feed, TikTok), any look from photoreal to stylised 3D or motion design.

## How it works

```
Topic → Brief → Script ─▶ Gate 1 → Voice + timing ─▶ Gate 2 → Look + storyboard ─▶ Gate 3 → Build → QC ─▶ Gate 4 → Final render
```

Words first, pictures last: visuals are pinned to the **per-word timing** of the recorded voice, so every change on screen lands exactly on a word. Full diagrams: [docs/workflow.md](docs/workflow.md) and [docs/architecture.md](docs/architecture.md).

## Install

```bash
git clone https://github.com/sandalkuilang/dalang ~/.claude/skills/dalang
```

Restart Claude Code, then ask for a video in plain language:

> "make a 45 s YouTube Short about why cats land on their feet"
> "bikinin video penjelasan tentang uang kas"

Check your machine once (Node, ffmpeg, HyperFrames, voice engines, image/music sources — never prints secrets):

```bash
node ~/.claude/skills/dalang/scripts/preflight.mjs
```

## Requirements

| Needed | For | Notes |
|---|---|---|
| Node.js, ffmpeg | everything | `preflight.mjs` reports what is missing |
| HyperFrames skills | the build step | `npx hyperframes skills update` |
| VoiceStudio **or** ElevenLabs | narration + word timing | VoiceStudio is free and local; set `ELEVENLABS_API_KEY` in your own shell only |

Licence note: this skill is [MIT](LICENSE), but the ElevenLabs free tier and VoiceStudio's default model are both non-commercial — that limit follows the audio they produce, not this repo.

## Repo layout

| Path | What |
|---|---|
| `SKILL.md` | The skill: principles, steps 0–8, gates (kept lean) |
| `references/` | Loaded lazily, one section at a time: `voice.md`, `visual-direction.md`, `craft-rules.md`, `measure-reference.md`, `lessons.md` |
| `scripts/` | `preflight`, `tts_timestamps` (voice + word timing), `stillness` and `loudness` (QC), `measure_reference.sh` |
| `docs/` | [Workflow](docs/workflow.md), [architecture](docs/architecture.md) |

## Per-video files

Each video lives in `video/<slug>/` of *your* project (not in this repo): `BRIEF.md`, `PRODUCTION.md`, `script.md`, `narration.txt`, `audio/`, `SPEC.md`, `storyboard.md`, `style-frames/`. State lives in files, so one video = one session and a run can resume from `BRIEF.md` + `PRODUCTION.md`.

## Ethics

Borrowing the *craft* of a reference video (section lengths, cuts, camera moves) is fine; reusing its images, script or voice is not. A recorded voice is only used with the speaker's permission.
