---
name: dalang
description: Dalang — turn any topic into a complete animated video (narration, AI voice, music, sound effects, animated visuals) with HyperFrames and free local tools (VoiceStudio voice; paid services only on request), following a script → voice → per-word timing → visuals pipeline with an approval gate at every stage. General purpose: any topic, any narration language, any platform (YouTube Shorts, Instagram Reels, TikTok, YouTube landscape, Instagram feed), any visual style (cinematic photoreal, premium 3D, kinetic type, documentary collage, data, motion graphics) always with a hyperreal, true-to-life subject. Use it whenever the user asks for a video, short film, cartoon, animation, explainer, educational clip, or YouTube/Shorts/Reels/TikTok content from a topic, idea, article, or notes — e.g. "make a video about X", "create an animation explaining Y", "bikinin video tentang Z", "haz un video sobre W" — even if they never mention HyperFrames or VoiceStudio. Also use it when the user wants to borrow the style or rhythm of a reference video ethically. Do not use it just to cut or subtitle existing footage.
---

# Dalang — from topic to video

This skill decides the order of work, when to stop for approval, and the quality bar; the animation is built with the HyperFrames skills (`/hyperframes` and friends).

## Principles

1. **Words first, pictures last.** Script approved → voice recorded → every word timed → only then visuals.
2. **Every change on screen lands on a word**, pinned to the timing data, never eyeballed.
3. **Something moves every second** — camera, light, or the subject acting; never only a mouth.
4. **Measure, don't guess.** Every reported number comes from a log or a script's output.
5. **The user approves at every gate** (4 gates). Never render final quality before the last one (Gate 3's style frames and hook sample excepted).
6. **The subject is hyperreal and true to reality.** Every physical subject (animal, person, product, vehicle, food, place, machine, body part) is a real photo or footage, a generated photoreal still or clip, or a PBR 3D model — in every look, never CSS, SVG or vector shapes — with correct anatomy, proportions, materials, scale and behaviour. People move only as real or generated footage, never as animated cutouts or rigs. Illustration only for what has no real appearance (diagrams, data, maps, abstract ideas, type); a cartoon subject only when the user asks. `references/visual-direction.md` §1.
7. **Top studio, not slide deck.** Look development, style frames, blocking and polish passes, cinematography, a review rubric. Modern and top-notch, never overdone. Speed shortcuts (10 fps drafts, snapshots) are for iterating only: the final is full frame rate at `--quality high` and passes every check again.
8. **Free by default.** Every tool in the default path is free and preferably local (VoiceStudio, mflux, ACE-Step, licensed free footage). Never call a paid or metered service (ElevenLabs, HeyGen credits, codex/ChatGPT, paid APIs) unless the user explicitly asks; label it "paid" whenever you mention it. Prefer commercial-OK licences and say when one is non-commercial.

**General purpose.** Any topic, language, platform; examples are illustrations only. Every per-video decision is asked in Step 1 and stored in `video/<slug>/BRIEF.md`. Never carry a previous video's topic, language, look or platform into a new one.

**Language.** Chat in the user's language: an instruction in your context (CLAUDE.md, memory) first, else the language of their messages. The narration language is a Step 1 choice: the user's language recommended, **English always offered** (if the user's language is English, offer the most likely other). Never infer a language from a name.

## Work fast, spend few tokens

- **One video = one session.** State lives in the project files. To resume, run `node <skill-dir>/scripts/state.mjs` and read `BRIEF.md` and the end of `PRODUCTION.md`; don't replay old chat.
- **Read lazily.** At each step read only the reference file the table below names (and only the § it names); never re-read a file already in context. From `/hyperframes`, only the type guides this video needs.
- **Small tool output.** `--json` filtered in a one-liner; never print `words.json`, `*.response.json` or full logs; `tail`/`grep` logs; `render --quiet`. Scan frames on snapshot's contact sheet; open full-size stills only to judge the subject's realism, zoomed.
- **Batch and parallelise.** Independent calls in one message. Long jobs (installs, downloads, TTS, renders) in the background; you are notified when they exit — never poll (scripts end with `DONE`/`Result`). Independent research can go to subagents returning a short summary.
- **Use gate waits without building ahead.** While the user reads, verify facts and find assets; while TTS runs, draft `SPEC.md`. Never build scenes before the gate that allows them.
- **Cheap before expensive.** `--sample` before a full voice; `--from-response` when only `{}` markers move; `--speed` for misses under 10 %; snapshots instead of renders while iterating; QC renders at `--fps 10 --quality draft`; the user reviews in `preview`; one high-quality render at the end.
- **Short messages:** what changed, what they must decide, file links.

## Project files (`video/<topic-slug>/`)

`BRIEF.md` (Step 1 decisions) · `PRODUCTION.md` (one line per step: `HH:MM–HH:MM | step | output | problems or "-"`, under a `## YYYY-MM-DD` heading per day) · `script.md` + `narration.txt` (Step 3) · `audio/` (narration, `words.json`, `beats.json`, `beats.js`, `narration.response.json`; Step 4) · `SPEC.md`, `storyboard.md`, `style-frames/` (Step 5) · `reference-measurements.md` (optional, Step 2).

The folder **is** the HyperFrames project; run every command from it: edit only the template `src/index.tpl.html`; `node <skill-dir>/scripts/fill_times.mjs src/index.tpl.html index.html` regenerates `index.html` (never edit it by hand; never keep a second root `.html` beside it); load timing with `<script src="audio/beats.js">`; assets in `assets/`; grades with `media-treatment --file src/index.tpl.html`.

## Steps

`<skill-dir>` is this skill's folder. Before each step, read the file in the last column; it holds the exact commands and checks.

| Step | Do | Ends with | Read |
|---|---|---|---|
| 0 Setup | `node <skill-dir>/scripts/preflight.mjs`; fix only what it reports (ask before installs, state sizes and licences); create the project folder | `PRODUCTION.md` | `references/brief.md` §0 |
| 1 Brief | Topic first (ask if none, never guess). Two AskUserQuestion calls: platform (always asked), language, angle, audience; then duration, visual style (4 looks with previews, real subjects, no banned defaults), energy, voice | `BRIEF.md` | `references/brief.md` §1 |
| 2 Reference (optional) | Measure a reference's craft, never copy its images or script | `reference-measurements.md` | `references/measure-reference.md` |
| 3 Script | `script.md` + `narration.txt` with named `{text\|name}` beats; facts verified, numbers never invented | **Gate 1** | `references/script-voice.md` §3 |
| 4 Voice | `scripts/tts_timestamps.mjs` (free VoiceStudio by default): audition with `--sample`, same `--seed` for the full take, act on every warning | **Gate 2** | `references/script-voice.md` §4, `references/voice.md` "Use" |
| 5 Look | `SPEC.md` (LOOK, MOTION, OBJECTS with real source + reference, BANNED), `storyboard.md`, assets, three style frames | **Gate 3** | `references/look-build.md` §5 |
| 6 Build | `/hyperframes` with its design steps; every time from `BEATS`/`WORDS` (`fill_times.mjs` for attributes); blocking pass, then polish; audio mix | `index.html`, lint clean | `references/look-build.md` §6 |
| 7 QC | check, 10 fps draft, stillness, loudness, `qc.mjs`, `timing_lint.mjs`, fresh-eyes reviewer (rubric); fix every P0/P1 and Realism/Reality fail; `preview` | **Gate 4** | `references/qc.md` §7, `references/review.md` |
| 8 Final + hand-off | gate 4 recorded + `check_assets.mjs` pass, `render --quality high`, re-check | `final.mp4`, report | `references/qc.md` §7–8 |

Rules that hold at every step: record each gate with `scripts/state.mjs approve <n> --by user|agent` (it refuses a gate whose predecessors aren't approved; editing a gated file makes it STALE: re-approve with the user); `BRIEF.md` is the source of truth for format and language (a mid-way change updates it first); the user's recorded voice or a cloned voice only with the speaker's permission; snapshots always with `--describe false` unless the user agreed to upload frames; log every step and every problem in `PRODUCTION.md`.

## Autonomous mode

If the user gives a topic and leaves, use what they said and these defaults for the rest: YouTube landscape 16:9, 60–90 s — but YouTube Shorts 9:16 when they ask for a short video or ≤ 60 s; narration in the user's language, look A (cinematic photoreal) for a physical subject, look H or D with real photos for an abstract or number-led topic, energy "modern balanced", general audience, VoiceStudio (no paid engine; if it is not ready, stop and say so), the angle that fits. Write "defaults used" on the first line of `PRODUCTION.md`, pass the gates with your best judgement, log each decision, and stop at a draft that passes Step 7. Nobody to ask: skip install offers and "ask first" fixes, log what you would have offered, continue with what exists. You can't hear: pick the voice by pace within the target band and zero timing warnings, and report "timbre not judged by ear". Render the final only if the user said "just finish it" (in any language, e.g. "kerjakan sampai selesai", "termínalo"); said at a gate, that approves the gate and turns every later gate into your judgement (logged), the final render included.

## When something goes wrong

Read `references/lessons.md`: every failure from earlier runs and why the steps look the way they do.

Changing this skill? Run the evals in `references/evals.md` before and after.
