---
name: dalang
description: Dalang — turn any topic into a finished animated video (narration, free local AI voice, music, sound effects, three.js/HyperFrames visuals) through script → voice → per-word timing → visuals, with an approval gate at each stage. Any topic, language and platform (Shorts, Reels, TikTok, YouTube, Instagram feed), in a stylized look true to the real thing. Use whenever the user asks for a video, animation, explainer or short from a topic, idea, article or notes ("make a video about X", "bikinin video tentang Z"), or to borrow a reference video's style ethically. Not for cutting or subtitling existing footage.
---

# Dalang — from topic to video

This skill sets the order of work, the gates and the quality bar; the animation is built with `/hyperframes`.

**Two modes, asked first in Step 1, one family of looks.** **Two looks, either mode, asked in the Brief** (`references/looks.md`): the isometric family (`isometric-world` the main language, flat drawing that reads as 3D through layers and colour, the subject a small world on a floating slab; `cutaway` on the beats that open a thing up, `blueprint` only on beats that need engineering-grade detail) or `object-studio` (the real object as clean 3D on a light grey studio sweep, x-ray, editorial cards; `engine/three`). Mode is the workflow, look is the drawing; both are locked after the Brief, so a 3D look never moves a film to Studio. A look change after Step 6 starts: stop every builder, rewrite `SPEC.md`, start every group again in one message; narration and voice stay. The agent plans the camera (`references/camera-motion.md`). **Express (default):** a 2.5D illustrated film in 20 minutes of work at most, one builder, no stop after the Brief (the agent passes every gate) (`references/express.md`; `state.mjs next` gives its sections). **Studio:** the same world built in three.js 3D (real parts, section views, motion posed from its cause), reference boards, benchmark and review; everything below. Principles 1–4, 6 and 8 hold in both.

## Principles

1. **Words first, pictures last.** Script approved → voice recorded → every word timed → only then visuals.
2. **Every change on screen lands on a word**, from the timing data, never eyeballed.
3. **The subject acts in every shot**: a camera over a still is a slideshow.
4. **Measure, don't guess.** Every reported number comes from a log or a script.
5. **No user gate, in either mode; every question up front.** All questions are asked once, at the very start (Step 1), so the user can leave after answering; nothing later waits for them. After the Brief the agent runs to the finished film: it passes each of the 4 gates itself (`state.mjs approve <n> --by agent`, after that gate's checks pass) and tells the user in one line, never waiting. Wherever a reference says to show the user, ask for approval or wait at a gate, do this instead; the user gets the film, and a change they ask for afterwards is a new round. No final-quality render before the last one (Gate 3's style frames and hook sample excepted).
6. **Stylized, and true to reality.** Every film is drawn, diorama, x-ray or toon 3D, one style per film; no filmed footage, no photoreal render, no generated still or clip. Correct anatomy, parts, proportions, scale and behaviour, checked against a real reference, in a world dressed with what is really there (`references/visual-direction.md` §1).
7. **Top studio, never overdone.** Look development, style frames, blocking and polish, cinematography, a review rubric. Drafts (10 fps, snapshots) iterate; the final is `--quality high` at the brief's frame rate (always pass `--fps`) and passes every check.
8. **Free by default.** Free, preferably local tools (VoiceStudio, three.js, licensed free media). A paid or metered service (ElevenLabs, HeyGen credits, paid APIs) only when the user asks, labelled "paid". Prefer commercial-OK licences; say when one is non-commercial.

**General purpose.** Any topic, language, platform; examples are illustrations. Per-video choices are asked in Step 1 and kept in `BRIEF.md`; nothing carries over from a previous video (no agent opens another `video/<slug>/` folder) except a series kit the user picks (`scripts/series.mjs`, `references/brief.md` "Series kit": look, voice, rules, never scene code). `engine/three/` is a toolbox, not a limit: a subject it lacks is modelled from its own law, or shown in a look that needs no 3D.

**Language.** Chat in the user's language (an instruction in context first, else their messages). **Every AskUserQuestion is in English** (question, header, options, previews), whatever the chat language. Narration language is a Step 1 choice: the user's recommended, English always offered. Never infer a language from a name.

## Work fast, spend few tokens

- **One video = one session.** State lives in the project files. Resume: `node <skill-dir>/scripts/state.mjs next`, then `BRIEF.md` and the end of `PRODUCTION.md`; never replay old chat.
- **Lean workspace.** Video sessions start in a folder made lean with `workspace.mjs init` (Step 0, asked in Brief Call 0).
- **Read lazily.** Each step: run `state.mjs next` and read only what it prints (sections as `sed` commands, the step's lessons). "Look up when needed" lines run only when the text sends you there. Never `cat`/`Read` a reference, the engine README or `lessons.md` whole; never re-read a section in context. From `/hyperframes`, only the type guides this video needs.
- **Small tool output.** Filter `--json` in a one-liner; never print `words.json`, `*.response.json` or full logs; `grep` logs; `render --quiet`; background output by bytes (`tail -c 1500 <file>`), never by lines. Scene changes are `Edit` calls, never `sed -i`, an inline script or a whole-file Write (`lint_scene.mjs` catches a swallowed line).
- **Scene code stays in builder subagents.** The main agent never writes, patches or reads `src/` or `assets/*.js` (generated data aside; the Step 5 style frames in `style-frames/src/` are the main agent's own, `look-build.md` §5); it holds the gates, `BRIEF.md`, `storyboard.md`, `SPEC.md`, the beat map and the verdicts. The pilot, each shot group, the assembly and each QC fix round go to a **new** builder (last report + file paths, under the builder budget in `look-build.md`) that returns ≤ 15 lines; `state.mjs log` records each. A 3D builder writes the set and shot list as data for `engine/three/shots.js`. The reviewer is never a builder.
- **Images stay in subagents.** The main agent never `Read`s a still, strip, contact sheet, scope or style frame: every "look at this" is a subagent given the paths and the `state.mjs next` "For the subagent" commands, returning a text verdict. One exception: the author of `style-frames/src/` opens each `review/refs-board-<frame>.jpg` once before its first write.
- **Model and effort per subagent job: picked from this table, never asked.** Pass the row's Agent `model` and `effort` (top = omit `model`, the session's strongest; mid = `"sonnet"`; light = `"haiku"`); a host without either inherits. Strongest where a verdict judges the film, cheaper where the job is pass/fail, a list or code from a finished spec.

| Subagent job | Model | Effort |
|---|---|---|
| Fresh-eyes review, second Set / Reality check, style-frame check, Gate 3 benchmark, sound-off quiz | top | high (quiz: medium) |
| Scopes verdict | top | medium |
| Planner: Step 5 `SPEC.md` and `storyboard.md` (`look-build.md` Step 5) | top | high |
| Studio builder: the pilot (it sets the pattern) | top | high |
| Studio builder: other shot groups, assembly, each QC fix round | top | medium |
| Express builder (the whole film, or each group; `express.md`) | mid | medium |
| Narration read-through at Gate 1 (`narration.txt` only) | mid | medium |
| Fact research: ≤ 8 searches and 15 fetches, original sources first; every number with its source, an unsourced one `[unknown]` for Gate 1 | mid | medium |
| Fix check (pass/fail + one line per fix), asset pair check, contact-sheet triage | mid | low |
| Media screening of `find_media` candidates and the Step 5 reference boards (text only) | light | low |

  **Escalate, never repeat.** A job that fails its own check (a builder still red after its report, a reviewer with nothing usable, a P0 that survives a fix round) is replaced by a new agent one notch up: effort first (low → medium → high), then model (light → mid → top). Never down, never the same setting twice, and a job that came back clean is never rerun higher. A fix round of at most 3 findings that are all copy or timing drops one effort notch. Log the setting with the delegation (`state.mjs log`).

- **Compact at Gates 2, 3 and 4.** Tell the user once at each that `/compact` (or a new session resumed with `state.mjs next`) is safe: every decision is in the files. You cannot run it yourself.
- **Parallel by default.** A job with no input from another job starts in the same message as it; long jobs run in the background (you are notified; never poll). Each parallel agent owns its own files and nobody edits another's. Heavy jobs (VoxCPM, render, check, snapshot) stay one at a time, chained, with no model job running beside a render; queue with `while kill -0 <pid>`, never `pgrep -f`.

| Step | Runs together, in one message |
|---|---|
| 0–1 | `preflight.mjs` in the background ‖ the first Brief question (the topic) |
| 2–3 | reference measurement ‖ fact research; research split into strands (≤ 3, Express ≤ 2), one mid-tier agent per strand, the search and fetch budget divided between them |
| After Gate 1 | the voice take (the one heavy job) ‖ `SPEC.md` + `storyboard.md` (Express now; Studio's planner needs `beats.json`, so it starts at Gate 2) ‖ facts, assets, music (after Gate 2) and OBJECTS stills (once `storyboard.md` exists), never scenes |
| 6 | Studio: pilot, then every other group at once. Express: every group at once, no pilot: one builder, or 2–3 from 6 beats or 45 s (`express.md`) |
| 7 | after the draft: stillness, loudness, `audio_qc.mjs`, `qc.mjs`, `scopes.mjs`, `timing_lint.mjs`, `lint_scene.mjs` in one message; once the strips exist: fresh-eyes reviewer ‖ sound-off quiz ‖ second Set / Reality check |
| 8 | `POST.md` written while the final render runs |

- **Cheap before expensive.** `--sample` before a full voice; `--from-response` when only `{}` markers move; `--speed`/`--tempo` for misses under 10 %; snapshots while iterating; a review round's fixes together, then one re-snapshot; QC at `--fps 10 --quality draft`; one high-quality render at the end.
- **Short messages:** what changed, what to decide, file links; at a wait, the clock time of the next gate. A step over ~2 min gets an estimate from its last measured run.

## Project files (`video/<topic-slug>/`)

`BRIEF.md` · `PRODUCTION.md` (`state.mjs log "<step> | <output> | <problems or ->"`) · `script.md` + `narration.txt` (Step 3) · `audio/` (`words.json`, `beats.json`, `beats.js`, `narration.response.json`; Step 4) · `SPEC.md`, `storyboard.md`, `style-frames/` (Step 5) · `reference-measurements.md` (Step 2) · second language: `narration.<lang>.txt`, `audio/<lang>/`, `strings.<lang>.js`, `final.<lang>.mp4`.

The folder **is** the HyperFrames project; run commands from it. Edit only the templates (`src/index.tpl.html`, `src/compositions/<group>.tpl.html`); `node <skill-dir>/scripts/fill_times.mjs src/index.tpl.html index.html` regenerates `index.html` (never by hand, never a second root `.html`); timing via `<script src="audio/beats.js">`; assets in `assets/`; grades with `media-treatment --file <template>`.

## Steps

Before each step run `node <skill-dir>/scripts/state.mjs next`: it prints the sections in the last column with their exact commands and checks.

| Step | Do | Ends with | Read |
|---|---|---|---|
| 0 Setup | `preflight.mjs`; fix only what it reports (installs and first launches are Call 0 questions, with size and licence); create the project folder | `PRODUCTION.md` | `references/brief.md` §0 |
| 1 Brief | Topic first (ask, never guess). Kits exist → "Which series?" first. AskUserQuestion, all of it now and in English: Call 0 for setup choices and consents preflight left; platform, language, angle; duration, energy, audience; voice (Call 3) when there is a real choice; Call 4 extras (second-language cut, photos, recording permission) | `BRIEF.md` | `references/brief.md` §1 |
| 2 Reference (optional) | Measure a reference's craft, never copy its images or script | `reference-measurements.md` | `references/measure-reference.md` |
| 3 Script | `script.md` + `narration.txt` with `{text\|name}` beats; facts verified, every number tagged `[src]`/`[calc]`/`[assume]`/`[illus]`/`[unknown]`, never invented; `[calc]` from `model.mjs`; `numbers_lint.mjs` clean; `Promise:` + `Takeaway:` lines, `narration_lint.mjs` clean, read-through; `review/quiz.md` | **Gate 1** | `references/script-voice.md` §3 |
| 4 Voice | `tts_timestamps.mjs` (VoiceStudio): `--sample`, same `--seed` for the take, `--retake auto` for every flagged sentence | **Gate 2** | `references/script-voice.md` §4, `references/voice.md` "Use" |
| 5 Look | `SPEC.md` (LOOK, CAMERA plan, MOTION, OBJECTS with source + reference, BANNED), `storyboard.md` (overlay column; `storyboard_lint.mjs` clean), assets, three style frames, `review/benchmark.md` (Gate 3 refused on a row > 1 point behind) | **Gate 3** | `references/look-build.md` §5 |
| 6 Build | needs Gate 3; `/hyperframes`; every time from `BEATS`/`WORDS`; builders only: Studio a pilot, then groups at once; Express every group at once, no pilot; blocking, polish, audio mix | `index.html`, `hyperframes lint` + `lint_scene.mjs` clean | `references/look-build.md` §6 |
| 7 QC | check, 10 fps draft, stillness, loudness, `audio_qc.mjs`, `qc.mjs`, `scopes.mjs`, `timing_lint.mjs`, `lint_scene.mjs`, `strips.mjs`, fresh-eyes reviewer, sound-off quiz; a builder per round fixes every P0/P1; `preview` | **Gate 4** | `references/qc.md` §7 |
| 8 Final | `check_assets.mjs`, `render --fps <brief fps> --quality high`, re-check | `final.mp4`, `POST.md`, report; the second-language cut when the Brief named one | `references/qc.md` §8 |

At every step: record each gate with `state.mjs approve <n> --by agent` (it refuses out of order; a gated file edited later is STALE until re-approved); `BRIEF.md` is the source of truth for format and language; a recorded or cloned voice only with the speaker's permission; snapshots with `--describe false` unless the user agreed to upload frames; browsers only in Claude's built-in browser (`preview --no-open`), never the user's Chrome; log every step and problem in `PRODUCTION.md`; series feedback goes to its kit (`series.mjs note`), never to memory.

## Autonomous mode

If the user gives a topic and leaves, use what they said and these defaults: Express mode unless they asked for 3D or Studio; YouTube landscape 16:9, 60–90 s (Shorts 9:16 when they ask for short or ≤ 60 s); narration in their language; the look `isometric-world` (`cutaway` for the inside of one thing, `blueprint` for very detailed data); energy "modern balanced"; general audience; VoiceStudio (`STOPPED` → `preflight.mjs --start` unless never launched; `BUSY` → Steps 1–3 first, recheck before Step 4; still not ready, stop and say so). No second-language cut unless `BRIEF.md` names one. Write "defaults used" first in `PRODUCTION.md`, log each decision, and finish the film (principle 5). A Set or Reality fail (P0) never ships; a P1 on Set, Reality or Clarity blocks the final until fixed or two rounds failed, then ships named in the hand-off; an `audio_qc.mjs` exit 2 that stays is named in the hand-off, never a pass; other P1s may ship, listed (`references/qc.md` Step 7). Nobody to ask: skip install offers and "ask first" fixes, log what you would have offered. A DALANG clone behind `origin/main`: `git -C <skill-dir> pull --ff-only` when clean, log it, re-read this file; a pinned release (detached): log the WARN, never pull. You can't hear: pick the voice by pace and zero timing warnings, report "timbre not judged by ear". The hand-off ends `PRODUCTION.md` with `## Skill feedback` (`references/qc.md` Step 8); never edit the installed skill.

## When something goes wrong

`grep -n -i '<word>' <skill-dir>/references/lessons.md` (never the whole file): earlier failures and why the steps look this way. Changing this skill? Run `references/evals.md` before and after.
