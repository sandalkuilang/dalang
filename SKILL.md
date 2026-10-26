---
name: dalang
description: Dalang — turn any topic into a complete animated video (narration, AI voice, music, sound effects, animated visuals) with HyperFrames and free local tools (VoiceStudio voice; paid services only on request), following a script → voice → per-word timing → visuals pipeline with an approval gate at every stage. General purpose: any topic, any narration language, any platform (YouTube Shorts, Instagram Reels, TikTok, YouTube landscape, Instagram feed), hyperreal or stylized (the user picks), in any look, always true to how the subject really looks and works. Use it whenever the user asks for a video, short film, cartoon, animation, explainer, educational clip, or YouTube/Shorts/Reels/TikTok content from a topic, idea, article, or notes — e.g. "make a video about X", "create an animation explaining Y", "bikinin video tentang Z", "haz un video sobre W" — even if they never mention HyperFrames or VoiceStudio. Also use it when the user wants to borrow the style or rhythm of a reference video ethically. Do not use it just to cut or subtitle existing footage.
---

# Dalang — from topic to video

This skill decides the order of work, when to stop for approval, and the quality bar; the animation is built with the HyperFrames skills (`/hyperframes` and friends).

## Principles

1. **Words first, pictures last.** Script approved → voice recorded → every word timed → only then visuals.
2. **Every change on screen lands on a word**, pinned to the timing data, never eyeballed.
3. **The subject acts in every shot** — a camera moving over a still is a slideshow.
4. **Measure, don't guess.** Every reported number comes from a log or a script's output.
5. **The user approves at every gate** (4 gates). Never render final quality before the last one (Gate 3's style frames and hook sample excepted).
6. **The subject is true to reality, in the realism the user picked** (Step 1). Hyperreal: every physical subject is a real photo, real footage or a PBR 3D model in three.js, never CSS, SVG or vector; people move only as real footage. A generated still or clip only when the user asks for one (paid). Stylized: drawn, diorama or toon 3D, one style per film. Both: correct anatomy, parts, proportions, scale and behaviour, checked against a real reference, in a world dressed with the small things really there. `references/visual-direction.md` §1.
7. **Top studio, not slide deck.** Look development, style frames, blocking and polish passes, cinematography, a review rubric. Modern and top-notch, never overdone. Shortcuts (10 fps drafts, snapshots) are for iterating; the final is `--quality high` at the brief's frame rate (`--fps` is always passed: the render default is 30) and passes every check.
8. **Free by default.** Every tool in the default path is free and preferably local (VoiceStudio, three.js, licensed free footage and music). Never call a paid or metered service (ElevenLabs, HeyGen credits, codex/ChatGPT, paid APIs) unless the user asks; label it "paid". Prefer commercial-OK licences and say when one is non-commercial.

**General purpose.** Any topic, language, platform; examples are illustrations only. Per-video decisions are asked in Step 1 and stored in `BRIEF.md`. Never carry a previous video's topic, language, look or platform into a new one. The three.js engine (`engine/three/`) is a toolbox of what earlier films proved, not the edge of what a film can show: a subject it lacks is modelled from its own law, or shown in a look that needs no 3D (`references/looks.md`, three.js recipes).

**Language.** Chat in the user's language: an instruction in your context (CLAUDE.md, memory) first, else the language of their messages. The narration language is a Step 1 choice: the user's language recommended, **English always offered** (if the user's language is English, offer the most likely other). Never infer a language from a name.

## Work fast, spend few tokens

- **One video = one session.** State lives in the project files. To resume, run `node <skill-dir>/scripts/state.mjs next` (it says where the video stands and prints that step's reading list), then read `BRIEF.md` and the end of `PRODUCTION.md`; don't replay old chat.
- **Read lazily, mechanically.** At each step run `node <skill-dir>/scripts/state.mjs next` and read what it prints, nothing else: the step's sections as `sed` commands with absolute paths (they work from any folder), and the headlines of its lessons. It also lists, under "Look up when needed", one line per section the step's text points to (its heading and its exact command): run a line only when the text sends you there, never all of them. Never `cat` or `Read` a reference, the engine README or `lessons.md` whole; never re-read a section already in context. From `/hyperframes`, only the type guides this video needs.
- **Small tool output.** `--json` filtered in a one-liner; never print `words.json`, `*.response.json` or full logs; `tail`/`grep` logs; `render --quiet`. Scene changes are `Edit` calls: never `python3 - <<EOF`, `sed -i` or an inline script on a scene module or the template (an inline comment can swallow the code after it); never a whole-file Write.
- **Images stay in subagents.** The main agent never `Read`s a still, strip, contact sheet, scope or style frame: every "look at this" (a fix check between QC rounds, a style-frame check, a realism check, the fresh-eyes review) is a subagent given the image paths and the `state.mjs next` "For the subagent" commands, returning a text verdict per item. The stills and logs stay out of this context, which every later call re-reads.
- **Compact at Gates 3 and 4.** Tell the user once, at each, that `/compact` (or a fresh session resumed with `state.mjs next`) is safe now — every decision is in the project files — and makes the remaining steps cheaper. You cannot run it yourself.
- **Batch and parallelise.** Independent calls in one message; research to subagents. Long jobs in the background; you are notified on exit — never poll. Heavy jobs (VoxCPM, render, check, a model the user asked for) one at a time, chained in one command; to queue behind one, `while kill -0 <pid>` — never `pgrep -f <name>` (it matches the waiting shell).
- **Busy machine at gate waits, no scenes ahead.** While the user reads: verify facts, find assets; pick music after Gate 2; fetch all OBJECTS stills once `storyboard.md` exists (a "no" discards them).
- **Cheap before expensive.** `--sample` before a full voice; `--from-response` when only `{}` markers move; `--speed` for misses under 10 %; snapshots instead of renders while iterating; a physics set baked once per change (`engine/three/bake.mjs`), never per snapshot; a review round's fixes made together, then one re-snapshot; QC renders at `--fps 10 --quality draft`; the user reviews in `preview`; one high-quality render at the end.
- **Short messages:** what changed, what they must decide, file links; at a wait, the clock time of the next gate and the final. A step over ~2 min gets an estimate from its last measured run (the bake's time, the render's frames per second), never a guess.

## Project files (`video/<topic-slug>/`)

`BRIEF.md` (Step 1 decisions) · `PRODUCTION.md` (one line per step via `state.mjs log "<step> | <output> | <problems or ->"`, which writes `HH:MM–HH:MM` from the previous line's end) · `script.md` + `narration.txt` (Step 3) · `audio/` (narration, `words.json`, `beats.json`, `beats.js`, `narration.response.json`; Step 4) · `SPEC.md`, `storyboard.md`, `style-frames/` (Step 5) · `reference-measurements.md` (optional, Step 2).

The folder **is** the HyperFrames project; run every command from it: edit only the template `src/index.tpl.html`; `node <skill-dir>/scripts/fill_times.mjs src/index.tpl.html index.html` regenerates `index.html` (never edit it by hand; never keep a second root `.html` beside it); load timing with `<script src="audio/beats.js">`; assets in `assets/`; grades with `media-treatment --file src/index.tpl.html`.

## Steps

`<skill-dir>` is this skill's folder. Before each step, run `node <skill-dir>/scripts/state.mjs next`: it prints the sections in the last column (and the step's lessons); they hold the exact commands and checks.

| Step | Do | Ends with | Read |
|---|---|---|---|
| 0 Setup | `node <skill-dir>/scripts/preflight.mjs`; fix only what it reports (ask before installs, state sizes and licences); create the project folder | `PRODUCTION.md` | `references/brief.md` §0 |
| 1 Brief | Topic first (ask if none, never guess). AskUserQuestion: Call 0 only for setup choices preflight left (skills update, stock key, voice engine); then platform (always asked), language, angle, realism; then duration, visual style (4 looks with previews, real subjects, no banned defaults), energy, audience; then the voice when more than one sensible choice exists (Call 3, recommended by audience) | `BRIEF.md` | `references/brief.md` §1 |
| 2 Reference (optional) | Measure a reference's craft, never copy its images or script | `reference-measurements.md` | `references/measure-reference.md` |
| 3 Script | `script.md` + `narration.txt` with named `{text\|name}` beats; facts verified, every number tagged `[src]`/`[calc]`/`[assume]`/`[illus]`/`[unknown]` and none untagged, never invented | **Gate 1** | `references/script-voice.md` §3 |
| 4 Voice | `scripts/tts_timestamps.mjs` (free VoiceStudio by default): audition with `--sample`, same `--seed` for the full take, fix every flagged sentence with `--retake auto` | **Gate 2** | `references/script-voice.md` §4, `references/voice.md` "Use" |
| 5 Look | `SPEC.md` (LOOK, MOTION, OBJECTS with real source + reference, BANNED), `storyboard.md`, assets, three style frames | **Gate 3** | `references/look-build.md` §5 |
| 6 Build | `/hyperframes` with its design steps; every time from `BEATS`/`WORDS` (`fill_times.mjs` for attributes); blocking pass, then polish; audio mix | `index.html`, lint clean | `references/look-build.md` §6 |
| 7 QC | check, 10 fps draft, stillness, loudness, `qc.mjs`, `timing_lint.mjs`, review strips (`scripts/strips.mjs`), fresh-eyes reviewer (rubric); fix every P0/P1 and Realism/Reality fail; `preview` | **Gate 4** | `references/qc.md` §7 (`review.md` and the rubric go to the reviewer subagent) |
| 8 Final + hand-off | gate 4 recorded + `check_assets.mjs` pass, `render --fps <brief fps> --quality high`, re-check | `final.mp4`, report | `references/qc.md` §8 (Final render, Hand-off) |

Rules that hold at every step: record each gate with `scripts/state.mjs approve <n> --by user|agent` (it refuses a gate whose predecessors aren't approved; editing a gated file makes it STALE: re-approve with the user); `BRIEF.md` is the source of truth for format and language (a mid-way change updates it first); a recorded or cloned voice only with the speaker's permission; snapshots always with `--describe false` unless the user agreed to upload frames; browsers only in Claude's isolated built-in browser (`preview --no-open`), never the user's Chrome; log every step and every problem in `PRODUCTION.md`.

## Autonomous mode

If the user gives a topic and leaves, use what they said and these defaults for the rest: YouTube landscape 16:9, 60–90 s — but YouTube Shorts 9:16 when they ask for a short video or ≤ 60 s; narration in the user's language, look A (cinematic photoreal) for a physical subject — with no stock key and no user material only if Commons and three.js cover it, else look C — look H or D with real photos for an abstract or number-led topic, energy "modern balanced", general audience, VoiceStudio (no paid engine; `STOPPED` → `preflight.mjs --start` first, unless its note says never launched (an install: skip); `BUSY` → Steps 1–3 first, recheck before Step 4; still not ready, stop and say so), the angle that fits. Write "defaults used" on the first line of `PRODUCTION.md`, pass the gates with your best judgement, log each decision, and stop at a draft that passes Step 7. Nobody is there to accept a known defect: a Realism or Reality fail (P0) never ships; a P1 whose rubric test is Realism, Reality or Clarity blocks the final like a P0 until a round fixed it or two rounds failed on it, then ships named in the hand-off; other P1s may ship, each listed in the hand-off with why (`references/qc.md` Step 7). Nobody to ask: skip install offers and "ask first" fixes, log what you would have offered, continue with what exists. You can't hear: pick the voice by pace within the target band and zero timing warnings, and report "timbre not judged by ear". Render the final only if the user said "just finish it" (in any language, e.g. "kerjakan sampai selesai"); said at a gate, that approves the gate and turns every later gate into your judgement (logged), the final render included. The hand-off ends `PRODUCTION.md` with `## Skill feedback` (`references/qc.md` Step 8); never edit the installed skill.

## When something goes wrong

`grep -n -i '<word>' <skill-dir>/references/lessons.md` for the failure at hand (never the whole file): every failure from earlier runs and why the steps look the way they do. Each step's lessons come with `state.mjs next`.

Changing this skill? Run the evals in `references/evals.md` before and after.
