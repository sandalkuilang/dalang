---
name: dalang
description: Dalang — turn any topic into a complete animated video (narration, AI voice, music, sound effects, animated visuals) with HyperFrames plus a voice engine — free local VoiceStudio or paid ElevenLabs — following a script → voice → per-word timing → visuals pipeline with an approval gate at every stage. General purpose: any topic, any narration language, any platform (YouTube Shorts, Instagram Reels, TikTok, YouTube landscape, Instagram feed), any visual style from photoreal to stylised 3D, motion design or documentary collage. Use it whenever the user asks for a video, short film, cartoon, animation, explainer, educational clip, or YouTube/Shorts/Reels/TikTok content from a topic, idea, article, or notes — e.g. "make a video about X", "create an animation explaining Y", "bikinin video tentang Z", "haz un video sobre W" — even if they never mention HyperFrames, VoiceStudio, or ElevenLabs. Also use it when the user wants to borrow the style or rhythm of a reference video ethically. Do not use it just to cut or subtitle existing footage.
---

# Dalang — from topic to video

A *dalang* is the puppet master of Javanese shadow theatre (wayang): one person who **tells the story and moves every puppet**. This skill plays that role. The technical work of building the animation is handed to the official HyperFrames skills (`/hyperframes` and friends); this skill decides *the order of work*, *when to stop for approval*, and *the quality bar*.

It was distilled from real runs. The biggest lesson: "make it like that one" is useless; a measurable instruction works — "cut here, it appears exactly on this word, the hero fills 45 % of the frame". The pipeline turns a vague topic into clear measurements.

## Principles

1. **Words first, pictures last.** Script approved → voice recorded → timing of every word known → only then visuals. Visuals follow the voice.
2. **Every change on screen lands on a word**, pinned to the timing data, never eyeballed.
3. **Something moves every second** — the camera, the light, or the subject acting; never only a mouth.
4. **Measure, don't guess.** Every number reported (duration, render time, cost, stillness, loudness) comes from a log or a script's output.
5. **The user approves at every gate** (4 gates). Never render final quality before the last one.
6. **Direct it like a top studio, not a slide deck.** Look development, style frames, a blocking pass and a polish pass, cinematography, a review rubric. A physical subject comes from a photo, footage, a generated photoreal still or clip, or 3D — never CSS or SVG primitives. Modern and top-notch, never overdone. Details: `references/visual-direction.md`.

**General purpose.** Any topic — science, history, products, tutorials, stories, opinion, news, finance, health, sport. Nothing in this skill is tied to one topic, language, or platform; examples are illustrations only. Every per-video decision is asked in Step 1 and stored in `video/<slug>/BRIEF.md`. Never carry a previous video's topic, language, look, or platform into a new one.

**Language.** Find the user's language without asking: first an instruction already in your context (CLAUDE.md or Claude's memory, e.g. "always answer in Indonesian"), else the language of their messages. Chat in it. The narration language is a separate Step 1 choice: the user's language is the recommended option and **English is always an option** (if the user's language is English, offer the most likely other language instead). You have no location data; never infer a language from a name.

## Work fast, spend few tokens

- **One video = one session.** All state lives in the project files. To resume, read `BRIEF.md` and the last lines of `PRODUCTION.md`; don't replay old chat.
- **Read lazily.** Load a reference only at the step that names it, and only the § it names. Never re-read a file already in context. From `/hyperframes`, read only the type guides this video needs.
- **Keep tool output small.** Use `--json` and filter it in a one-liner; never print `words.json`, `*.response.json`, or full logs — compute what you need from them. `tail` and `grep` logs.
- **Batch and parallelise.** Independent tool calls go in one message. Long jobs (installs, model downloads, full TTS, renders) run in the background while you do the next independent thing. Independent research (fact-checking several sources, finding licensed photos, catalog searches) can go to subagents that return a short summary.
- **Use the waiting time at gates, without building ahead.** While the user reads the script, verify facts and find hero assets; while TTS runs, draft `SPEC.md`. Never build scenes before the gate that allows them.
- **Cheap before expensive.** `--sample` before a full voice; `--from-response` when only `{}` markers move; `--speed` for misses under 10 %; snapshots at beat times instead of full renders while iterating; `--quality draft` until Gate 4.
- **Short messages to the user:** what changed, what they must decide, links to files. No file dumps.

## Project files

Every video lives in `video/<topic-slug>/`:

| File | What it is |
|---|---|
| `BRIEF.md` | Step 1 decisions: topic, platform, ratio & resolution, duration, narration language (ISO code), angle, look, energy, audience, voice engine |
| `PRODUCTION.md` | Work log, one line per step: `HH:MM–HH:MM \| step \| output \| problems (or "-")` |
| `script.md` / `narration.txt` | Script for humans (sections, visual notes, sources) / only the spoken words plus markers (Step 3) |
| `audio/` | `narration.wav` or `.mp3`, `words.json`, `beats.json`, `beats.js`, `narration.response.json` (Step 4) |
| `SPEC.md` | LOOK in numbers, OBJECTS with their asset source, BANNED defaults (Step 5) |
| `storyboard.md` | Colour script per section + shot table, times from `audio/beats.json` (Step 5) |
| `style-frames/` | Three stills at final quality, approved before the build (Step 5) |
| `reference-measurements.md` | Optional (Step 2) |

## Step 0 — Setup (once)

```bash
node <skill-dir>/scripts/preflight.mjs
```

One call, ~3 s: Node, ffmpeg, HyperFrames, VoiceStudio (backend, TTS model, speech-to-text model, watermark), ElevenLabs (tier and quota, never the key), and image and music sources. `<skill-dir>` is this skill's folder. Fix only what it reports:

- **Voice MISSING** → `references/voice.md` "Setup" (VoiceStudio install, models, the outside-the-backend download, activating speech-to-text; ElevenLabs key rules). Ask before installing anything; state sizes and licences.
- **HyperFrames MISSING / out of date** → ask, then `npx hyperframes skills update` (the plugin route has failed with "repository not found"). New skills load after Claude restarts.
- **Images WARN** → realistic looks will need the user's photos, CC0/CC BY photos, or a free source (HeyGen sign-in, `mflux`). Say so before Step 1 (`visual-direction.md` §1). **Music WARN** → offer HeyGen sign-in or local MusicGen.
- **Licences to mention once:** the ElevenLabs free tier and VoiceStudio's default OmniVoice model are both non-commercial.

Create `video/<topic-slug>/` and `PRODUCTION.md`, and log the preflight result in one line.

## Step 1 — Brief (always via AskUserQuestion)

**Topic first.** If the user named none, ask in plain text. Never guess a topic.

**The user may bring material** — a finished script, a voice recording, photos, a reference video. Use what they bring and skip the questions it already answers: a script replaces Step 3's writing (still convert it to `narration.txt` and show it at Gate 1); a recording replaces the voice question and Step 4's generation (`--from-audio`, below). Before using someone's recorded voice, confirm the speaker gave permission. A video from someone else's channel is only a reference to measure (Step 2), never material to reuse.

Then AskUserQuestion calls back to back. Ask about the platform **even if the user named one** ("YouTube" can be Shorts or landscape); put what they said first, marked "(Recommended)".

**Call 1**
1. **Platform** — YouTube Shorts (9:16, 1080×1920, ≤ 3 min, hook in 1–2 s) · Instagram Reels (9:16, ≤ 3 min, taller bottom overlay) · YouTube landscape (16:9, 1920×1080) · Instagram feed (4:5, 1080×1350, ≤ 60 s, often muted). TikTok and 1:1 via "Other".
2. **Duration** — fit to the likely platform: 9:16 → 30–45 s, 60 s, 90–120 s, 2.5–3 min; 16:9 → 60–90 s, 2–3 min, 5 min. Narrative pacing is strongest at 30–90 s; above 3 min, one composition per section.
3. **Language** — the user's language (from the rule above) "(Recommended)", English, and one other likely language for this topic or audience; the rest via "Other". Store the ISO 639-1 code.
4. **Angle** — **built from the topic**, 3 options, e.g. "Question answered with data", "Myth vs fact", "Story with a character", "Dialogue scene between characters (no narrator)", "Step by step", "A vs B", "Recommendation per type of person".

**Call 2**
5. **Visual style** — read `visual-direction.md` §2. Offer the **4 looks that best fit this topic** and the sources preflight found, recommended first; name the others in the question text so "Other" reaches them. Every option gets a `preview`: a short sketch of one frame of *this* topic in that look (what is in frame, light, type, motion). If no image source exists, say in the realistic options that they need the user's photos or a free sign-in.
6. **Energy** — "Modern balanced (Recommended)", "Calm cinematic", "Punchy social" (`visual-direction.md` §3; recommend Punchy first for 9:16 under 60 s).
7. **Audience** — General public, one main idea "(Recommended)"; Students; Professionals/enthusiasts.

**Call 3** (only when both voice engines are ready; otherwise name the engine in the intro text)
8. **Voice** — "VoiceStudio — free, runs locally (Recommended)"; "ElevenLabs — cloud, paid for real use" (first only on a paid tier).

Mention in the intro text: no reference video unless they have one (then Step 2); the voice itself is picked by audition in Step 4.

Save everything in `BRIEF.md`. Every later step reads format and language from it, not from memory; a mid-way change updates `BRIEF.md` first.

## Step 2 — (Optional) Measure a reference: borrow the craft, not the work

Copying a film's images or its script is theft. Measuring how it is built (section lengths, cuts, camera moves, beats, motion) and using the numbers for your own story is allowed. Follow `references/measure-reference.md`; `scripts/measure_reference.sh` does the mechanical part. `reference-measurements.md` holds numbers only.

## Step 3 — Script → GATE 1

Write in the narration language from `BRIEF.md`:

- `script.md`: title, sections with target durations, visual notes per section (numbers as digits — what appears on screen), and sources.
- `narration.txt`: **only the spoken words**, plus markers:
  - `{text|name}` — a beat: words that trigger a change on screen. **Always name it** (letters, digits, underscore; English names so code reads the same everywhere). Unnamed beats get `b1, b2, …`, which shift when a beat is inserted.
  - `# Section` lines — not spoken; their time is recorded.
  - `[tag]` — a delivery hint, sparingly (ElevenLabs reads it; for VoiceStudio a tag at the start of a dialogue line becomes that line's style).
  - **Dialogue** (characters, no narrator): every spoken line is `name: text`, and a line `(1.5)` is 1.5 s of silence. The output then also has `window.LINES` — who speaks when — for cuts, close-ups, and mouths.

Rules:
- **Length** — starting pace, calibrated in Step 4: English 2.4–2.7 words/s; Indonesian/Malay 2.2–2.5; Spanish/Portuguese/Italian 2.5–2.9; French 2.4–2.8; German/Dutch 2.0–2.4; Japanese 6–8 characters/s; Mandarin 4–5 characters/s. Other languages: write the opening section, audition it in Step 4, measure, then write the rest. Count words; never guess.
- **Hook** — a question, surprise, or confession; landing in 1–2 s on 9:16, 5 s on 16:9.
- **Numbers spoken as words** in `narration.txt`, in the narration language.
- **One beat every 2–4 s**, each with a visual partner later.
- **Facts must be right.** Verify against original sources; list them. Never invent numbers. Different measuring methods or a tiny gap → "about the same", never a "winner".
- Short sentences that are easy to say.

Show the script and **wait for approval**.

## Step 4 — Voice + per-word timing → GATE 2

Read `references/voice.md` "Use". In short:

```bash
node <skill-dir>/scripts/tts_timestamps.mjs --engine <engine> --list-voices
node <skill-dir>/scripts/tts_timestamps.mjs --engine <engine> --input narration.txt --out audio --voice "<voice>" --language <lang> --sample
node <skill-dir>/scripts/tts_timestamps.mjs --engine <engine> --input narration.txt --out audio --voice "<pick>" --language <lang> [--speed 1.0]
```

- Audition 2–3 voices that suit the narration language with `--sample`; the script prints the pace. More than 10 % off the target → adjust the script; less → `--speed`.
- **Dialogue:** one voice per character with `--engine voicestudio --voices name=<voice>,name=<voice>`.
- **The user's own recording** (any audio or video file, narration or dialogue): `--from-audio <file> --language <lang>` keeps it as the voice track and gets the timing by transcribing it (needs VoiceStudio's speech-to-text). No audition, no generation, no cost.
- Outputs: the narration audio; `words.json` (`{ i, text, start, end }`); `beats.json` and `beats.js` (`window.BEATS.<name>.start`, `BEATS_LIST`, `SECTIONS`, `NARRATION_DURATION`); `narration.response.json` (keep it for `--from-response`).
- Act on every warning (words heard ≠ words written, estimated words, unnamed beats) before the storyboard. Log characters billed (0 for VoiceStudio).

Play the narration to the user and **wait for approval**. Mispronounced word → respell it in `narration.txt` and regenerate.

## Step 5 — Look, storyboard, style frames → GATE 3

Read `references/visual-direction.md` (§1–3, §5–8, §10) and `references/craft-rules.md` (§2–4, §6). Write:

- `SPEC.md` (template: `/hyperframes` `references/spec.md`): the LOOK line (the chosen look and energy in numbers — palette hex, faces and weights, light direction, grain, average shot length), OBJECTS (each physical thing and its asset rung), BANNED. Never skip it: without it every gap falls back to the generated default look.
- `storyboard.md`: a colour-script line per section, then the shot table, times from `beats.json`:

| # | Time | Beat | Shot size | What we see | Camera | Continuous motion | Transition out | SFX |
|---|---|---|---|---|---|---|---|---|
| 1 | 0.00–3.40 | `hook` | close-up | The hero, sharp, on a lit set; the hook word lands as the title | dolly 1.00→1.04 | light sweeping across the hero | rack focus | low whoosh |

Check: every beat visualises its claim, not just its words; continuous motion in every row; few hard cuts; the hero fills ≥ 45 % of the frame height or 70 % of its width; one hero move per shot; shot sizes vary and screen direction holds; text in the format's safe zone and in the narration language; characters follow the mitten rule; a reference's numbers are used (Step 2).

Then get the hero assets (resolve, ingest, cut out every OBJECTS item) and build **three style frames** at final quality (hook, one explanation beat, payoff) into `style-frames/`. Show `storyboard.md`, `SPEC.md` and the three stills together and **wait for approval** — the look is cheapest to change here.

## Step 6 — Build (hand off to /hyperframes)

1. Load `/hyperframes` and only the type guides this video needs (`types/explainer.md`, `types/character.md`, `types/data.md`, `types/3d.md`, plus `types/vertical.md` for 9:16). Answer its opening questions from `BRIEF.md`, `script.md`, `storyboard.md`, `SPEC.md` without re-asking the user — but **do not skip its design steps**: it follows the LOOK, OBJECTS and BANNED lines.
2. The approved style frames are the reference for every scene.
3. Search the catalog before building an effect; queries **in English** (others return nothing): `npx hyperframes catalog --query "<what the beat needs>"`, then `npx hyperframes add <name>`.
4. Load `audio/beats.js`; **every** animation time references `BEATS.<name>.start`. Never hard-code seconds.
5. **Blocking pass (animatic):** every scene at final timing with rough motion. Render a draft once, watch it against the narration — rhythm, shot variety, colour script. Fix structure now.
6. **Polish pass:** craft (`visual-direction.md` §4), finish (§9: contact shadows, one light direction, grade and grain through `media-treatment`), depth and parallax (§6).
7. Audio: narration, music ducking under it (`/media-use` `references/mixing.md`; tempo from the energy), sound effects on key beats only.
8. `npx hyperframes lint` after each major section.

## Step 7 — Quality check → GATE 4

Review like someone else's code — the goal is to find bugs:

```bash
npx hyperframes check --snapshots
npx hyperframes render --quality draft --output draft.mp4
node <skill-dir>/scripts/stillness.mjs draft.mp4    # target ≤ 10 %, no still stretch > 1.5 s (planned pauses: --allow a-b)
node <skill-dir>/scripts/loudness.mjs draft.mp4     # target ≈ −14 LUFS, true peak ≤ −1 dBTP
npx hyperframes snapshot --review --at <beat times>
```

- Run the **visual rubric** (`visual-direction.md` §11) on every beat frame and compare with the approved style frames: the film must look like them, not drift back to defaults.
- Too quiet → raise the narration in the mix; still off → `loudness.mjs final.mp4 --fix final-14lufs.mp4`. Too still → add motion where the script points.
- Log every problem in `PRODUCTION.md`.

Then `npx hyperframes preview --background`, give the URL, and **wait for approval** (changes → Steps 6–7). After approval:

```bash
npx hyperframes render --quality high --output final.mp4
ffprobe -v error -show_entries format=duration -of csv=p=0 final.mp4 && node <skill-dir>/scripts/loudness.mjs final.mp4
```

## Step 8 — Hand-off

Report in plain language, every number from `PRODUCTION.md`: final file, duration, platform and format; time per stage and render time; revision rounds; cost (ElevenLabs characters, or "0"); **known bugs**, honestly; the one improvement with the biggest impact.

## Autonomous mode

If the user gives a topic and leaves: defaults are YouTube landscape 16:9, 60–90 s, narration in the user's language, look A (cinematic photoreal) for a physical subject when photos or an image source exist, else look F (modern 2D motion design), energy "modern balanced", general audience, VoiceStudio if ready (else ElevenLabs), and the angle that fits. Write "defaults used" on the first line of `PRODUCTION.md`, pass the gates with your best judgement, log each decision, and stop at a draft that passes Step 7. Render the final only if the user said "just finish it" up front.

## When something goes wrong

Read `references/lessons.md`: every failure from earlier runs and why the steps above look the way they do.
