---
name: dalang
description: Dalang — turn any topic into a finished animated video (narration, free local AI voice, music, sound effects, three.js/HyperFrames visuals) through script → voice → per-word timing → visuals, with an approval gate at each stage. Any topic, language and platform (Shorts, Reels, TikTok, YouTube, Instagram feed), hyperreal or stylized. Use whenever the user asks for a video, animation, explainer or short from a topic, idea, article or notes ("make a video about X", "bikinin video tentang Z"), or to borrow a reference video's style ethically. Not for cutting or subtitling existing footage.
---

# Dalang — from topic to video

This skill sets the order of work, the gates and the quality bar; the animation is built with `/hyperframes`.

## Principles

1. **Words first, pictures last.** Script approved → voice recorded → every word timed → only then visuals.
2. **Every change on screen lands on a word**, from the timing data, never eyeballed.
3. **The subject acts in every shot**: a camera over a still is a slideshow.
4. **Measure, don't guess.** Every reported number comes from a log or a script.
5. **The user approves at every gate** (4). No final-quality render before the last one (Gate 3's style frames and hook sample excepted).
6. **True to reality, in the realism the user picked** (Step 1). Hyperreal: real photo, real footage or a PBR 3D model in three.js, never CSS, SVG or vector; people move only as real footage; a generated still or clip only on request (paid). Stylized: drawn, diorama or toon 3D, one style per film. Both: correct anatomy, parts, proportions, scale and behaviour, checked against a real reference, in a world dressed with what is really there (`references/visual-direction.md` §1).
7. **Top studio, never overdone.** Look development, style frames, blocking and polish, cinematography, a review rubric. Drafts (10 fps, snapshots) iterate; the final is `--quality high` at the brief's frame rate (always pass `--fps`) and passes every check.
8. **Free by default.** Free, preferably local tools (VoiceStudio, three.js, licensed free media). A paid or metered service (ElevenLabs, HeyGen credits, paid APIs) only when the user asks, labelled "paid". Prefer commercial-OK licences; say when one is non-commercial.

**General purpose.** Any topic, language, platform; examples are illustrations. Per-video choices are asked in Step 1 and kept in `BRIEF.md`; nothing carries over from a previous video except a series kit the user picks (`scripts/series.mjs`, `references/brief.md` "Series kit": look, voice, rules, never scene code). `engine/three/` is a toolbox, not a limit: a subject it lacks is modelled from its own law, or shown in a look that needs no 3D.

**Language.** Chat in the user's language (an instruction in context first, else their messages). Narration language is a Step 1 choice: the user's recommended, English always offered. Never infer a language from a name.

## Work fast, spend few tokens

- **One video = one session.** State lives in the project files. Resume: `node <skill-dir>/scripts/state.mjs next`, then `BRIEF.md` and the end of `PRODUCTION.md`; never replay old chat.
- **Lean workspace.** Video sessions start in a folder made lean with `workspace.mjs init` (Step 0, asked in Brief Call 0).
- **Read lazily.** Each step: run `state.mjs next` and read only what it prints (sections as `sed` commands, the step's lessons). "Look up when needed" lines run only when the text sends you there. Never `cat`/`Read` a reference, the engine README or `lessons.md` whole; never re-read a section in context. From `/hyperframes`, only the type guides this video needs.
- **Small tool output.** Filter `--json` in a one-liner; never print `words.json`, `*.response.json` or full logs; `grep` logs; `render --quiet`; background output by bytes (`tail -c 1500 <file>`), never by lines. Scene changes are `Edit` calls, never `sed -i`, an inline script or a whole-file Write (`lint_scene.mjs` catches a swallowed line).
- **Scene code stays in builder subagents.** The main agent never writes, patches or reads `src/` or `assets/*.js` (generated data aside; the Step 5 style frames in `style-frames/src/` are the main agent's own, `look-build.md` §5); it holds the gates, `BRIEF.md`, `storyboard.md`, `SPEC.md`, the beat map and the verdicts. The pilot, each shot group, the assembly and each QC fix round go to a **new** builder (last report + file paths, under the builder budget in `look-build.md`) that returns ≤ 15 lines; `state.mjs log` records each. A 3D builder writes the set and shot list as data for `engine/three/shots.js`. The reviewer is never a builder.
- **Images stay in subagents.** The main agent never `Read`s a still, strip, contact sheet, scope or style frame: every "look at this" is a subagent given the paths and the `state.mjs next` "For the subagent" commands, returning a text verdict. One exception: the author of `style-frames/src/` opens each `review/refs-board-<frame>.jpg` once before its first write.
- **Model per subagent job** (Agent `model`; `"sonnet"` = mid tier, omitted = the session's). Strongest where a verdict judges the film, mid tier for pass/fail or lists; a host without the choice inherits.

| Subagent job | Model |
|---|---|
| Fresh-eyes review, second Realism / Reality check, style-frame check, scopes verdict | strongest (omit `model`) |
| Fix check (pass/fail + one line per fix), asset pair check, media screening of `find_media` candidates and the Step 5 reference boards, contact-sheet triage | mid tier (`model: "sonnet"`) |
| Fact research: ≤ 8 searches and 15 fetches, original sources first; every number with its source, an unsourced one `[unknown]` for Gate 1 | mid tier |
| Planner: Step 5 `SPEC.md` and `storyboard.md` (`look-build.md` Step 5) | strongest |
| Builder: pilot, shot groups, assembly, each QC fix round (Steps 6–7) | strongest |

- **Compact at Gates 2, 3 and 4.** Tell the user once at each that `/compact` (or a new session resumed with `state.mjs next`) is safe: every decision is in the files. You cannot run it yourself.
- **Batch and parallelise.** Independent calls in one message. Step 6: a pilot builder, then the other groups in parallel. Long jobs in the background (you are notified; never poll). Heavy jobs (VoxCPM, render, check) one at a time, chained; queue with `while kill -0 <pid>`, never `pgrep -f`.
- **Use gate waits** for facts, assets, music (after Gate 2) and OBJECTS stills (once `storyboard.md` exists), never scenes.
- **Cheap before expensive.** `--sample` before a full voice; `--from-response` when only `{}` markers move; `--speed`/`--tempo` for misses under 10 %; snapshots while iterating; a physics set baked once per change (`bake.mjs`); a review round's fixes together, then one re-snapshot; QC at `--fps 10 --quality draft`; one high-quality render at the end.
- **Short messages:** what changed, what to decide, file links; at a wait, the clock time of the next gate. A step over ~2 min gets an estimate from its last measured run.

## Project files (`video/<topic-slug>/`)

`BRIEF.md` · `PRODUCTION.md` (`state.mjs log "<step> | <output> | <problems or ->"`) · `script.md` + `narration.txt` (Step 3) · `audio/` (`words.json`, `beats.json`, `beats.js`, `narration.response.json`; Step 4) · `SPEC.md`, `storyboard.md`, `style-frames/` (Step 5) · `reference-measurements.md` (Step 2) · second language: `narration.<lang>.txt`, `audio/<lang>/`, `strings.<lang>.js`, `final.<lang>.mp4`.

The folder **is** the HyperFrames project; run commands from it. Edit only the templates (`src/index.tpl.html`, `src/compositions/<group>.tpl.html`); `node <skill-dir>/scripts/fill_times.mjs src/index.tpl.html index.html` regenerates `index.html` (never by hand, never a second root `.html`); timing via `<script src="audio/beats.js">`; assets in `assets/`; grades with `media-treatment --file <template>`.

## Steps

Before each step run `node <skill-dir>/scripts/state.mjs next`: it prints the sections in the last column with their exact commands and checks.

| Step | Do | Ends with | Read |
|---|---|---|---|
| 0 Setup | `preflight.mjs`; fix only what it reports (ask before installs, with size and licence); create the project folder | `PRODUCTION.md` | `references/brief.md` §0 |
| 1 Brief | Topic first (ask, never guess). Kits exist → "Which series?" first. AskUserQuestion: Call 0 for setup choices preflight left; platform, language, angle, realism; duration, look (4 with previews), energy, audience; voice (Call 3) when there is a real choice | `BRIEF.md` | `references/brief.md` §1 |
| 2 Reference (optional) | Measure a reference's craft, never copy its images or script | `reference-measurements.md` | `references/measure-reference.md` |
| 3 Script | `script.md` + `narration.txt` with `{text\|name}` beats; facts verified, every number tagged `[src]`/`[calc]`/`[assume]`/`[illus]`/`[unknown]`, never invented; `[calc]` from `model.mjs`; `numbers_lint.mjs` clean; `review/quiz.md` | **Gate 1** | `references/script-voice.md` §3 |
| 4 Voice | `tts_timestamps.mjs` (VoiceStudio): `--sample`, same `--seed` for the take, `--retake auto` for every flagged sentence | **Gate 2** | `references/script-voice.md` §4, `references/voice.md` "Use" |
| 5 Look | `SPEC.md` (LOOK, MOTION, OBJECTS with source + reference, BANNED), `storyboard.md` (overlay column; `storyboard_lint.mjs` clean), assets, three style frames, `review/benchmark.md` (Gate 3 refused on a row > 1 point behind) | **Gate 3** | `references/look-build.md` §5 |
| 6 Build | needs Gate 3; `/hyperframes`; every time from `BEATS`/`WORDS`; builders only: pilot, then groups in parallel; blocking, polish, audio mix | `index.html`, `hyperframes lint` + `lint_scene.mjs` clean | `references/look-build.md` §6 |
| 7 QC | check, 10 fps draft, stillness, loudness, `audio_qc.mjs`, `qc.mjs`, `scopes.mjs`, `timing_lint.mjs`, `lint_scene.mjs`, `strips.mjs`, fresh-eyes reviewer, sound-off quiz; a builder per round fixes every P0/P1; `preview` | **Gate 4** | `references/qc.md` §7 |
| 8 Final | `check_assets.mjs`, `render --fps <brief fps> --quality high`, re-check | `final.mp4`, `POST.md`, report; one second-language offer | `references/qc.md` §8 |

At every step: record each gate with `state.mjs approve <n> --by user|agent` (it refuses out of order; a gated file edited later is STALE until re-approved); `BRIEF.md` is the source of truth for format and language; a recorded or cloned voice only with the speaker's permission; snapshots with `--describe false` unless the user agreed to upload frames; browsers only in Claude's built-in browser (`preview --no-open`), never the user's Chrome; log every step and problem in `PRODUCTION.md`; series feedback goes to its kit (`series.mjs note`), never to memory.

## Autonomous mode

If the user gives a topic and leaves, use what they said and these defaults: YouTube landscape 16:9, 60–90 s (Shorts 9:16 when they ask for short or ≤ 60 s); narration in their language; look A for a physical subject (only if Commons and three.js cover it without a stock key, else K for a made thing, C otherwise), H or D with real photos for an abstract or number-led topic; energy "modern balanced"; general audience; VoiceStudio (`STOPPED` → `preflight.mjs --start` unless never launched; `BUSY` → Steps 1–3 first, recheck before Step 4; still not ready, stop and say so). No second-language cut unless `BRIEF.md` names one. Write "defaults used" first in `PRODUCTION.md`, pass gates by your judgement, log each decision, stop at a draft that passes Step 7. A Realism or Reality fail (P0) never ships; a P1 on Realism, Reality or Clarity blocks the final until fixed or two rounds failed, then ships named in the hand-off; an `audio_qc.mjs` exit 2 that stays is named in the hand-off, never a pass; other P1s may ship, listed (`references/qc.md` Step 7). Nobody to ask: skip install offers and "ask first" fixes, log what you would have offered. A DALANG clone behind `origin/main`: `git -C <skill-dir> pull --ff-only` when clean, log it, re-read this file; a pinned release (detached): log the WARN, never pull. You can't hear: pick the voice by pace and zero timing warnings, report "timbre not judged by ear". Render the final only if the user said "just finish it" (any language, e.g. "kerjakan sampai selesai"); at a gate that approves it and makes later gates your logged judgement. The hand-off ends `PRODUCTION.md` with `## Skill feedback` (`references/qc.md` Step 8); never edit the installed skill.

## When something goes wrong

`grep -n -i '<word>' <skill-dir>/references/lessons.md` (never the whole file): earlier failures and why the steps look this way. Changing this skill? Run `references/evals.md` before and after.
