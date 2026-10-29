---
name: dalang
description: Dalang — turn any topic into a finished animated video (narration, free local AI voice, music, sound effects, HyperFrames visuals): script → voice → per-word timing → visuals, each stage gated by the agent itself. Any topic, language and platform (Shorts, Reels, TikTok, YouTube, Instagram), stylized and true to the real thing. Use whenever the user asks for a video, animation, explainer or short from a topic, idea, article or notes ("make a video about X", "bikinin video tentang Z"), or to borrow a reference video's style ethically. Not for cutting or subtitling existing footage.
---

# Dalang — from topic to video

**Mode and look**, asked in the Brief, locked after it (`references/looks.md`). Mode: **Express** (default; 2.5D in Canvas 2D, `references/express.md`) or **Studio** (precision: three.js, a Blender hero, reference boards, benchmark, review). Look: the isometric family (`isometric-world` main, `cutaway`, `blueprint`) or `object-studio` (clean 3D on a light grey sweep). A 3D look never moves a film to Studio. A look change after Step 6 starts: stop every builder, rewrite `SPEC.md`, restart every group in one message; narration and voice stay.

## Principles

7 is Studio's; the rest hold in both modes.

1. **Words first, pictures last**: script approved → voice → every word timed → visuals.
2. **Every change on screen lands on a word**, from the timing data.
3. **The subject acts in every shot**; a camera over a still is a slideshow.
4. **Measure, don't guess**: every reported number comes from a log or a script.
5. **Every question up front, no user gate.** All questions in Step 1; nothing later waits for the user. Pass each of the 4 gates yourself once its checks pass, say so in one line, run to the finished film. A later change is a new round. No final-quality render before the last (Gate 3's style frames and hook sample excepted).
6. **Stylized, true to reality.** One look per film; no footage, photoreal render or generated image or clip. Parts, proportions, scale and behaviour checked against a real reference (`references/visual-direction.md` §1).
7. **Top studio, never overdone**: look development, style frames, blocking, polish, review rubric. Drafts at 10 fps; the final `--quality high --fps <brief fps>` passes every check.
8. **Free by default.** Paid or metered services (ElevenLabs, HeyGen, paid APIs) only when the user asks, labelled "paid". Prefer commercial-OK licences; say when one is not.

**General purpose.** Any topic, language, platform. Never open another `video/<slug>/` folder; nothing carries over except a series kit the user picks (`references/brief.md` "Series kit"). `engine/three/` is a toolbox, not a limit: a subject it lacks is modelled from its own law, or shown in a look that needs no 3D.

**Language.** Chat in the user's language. **Every AskUserQuestion is in English.** Never infer a language from a name.

## Work fast, spend few tokens

- **One video = one session**; state lives in the files. Resume: `node <skill-dir>/scripts/state.mjs next`, `BRIEF.md`, the end of `PRODUCTION.md`.
- **Subagent types**, when listed: builders and fix rounds `dalang-builder`, every verdict `dalang-checker`, fact strands `dalang-research`; else general-purpose.
- **Skill version**: preflight's DALANG row, never your own `git`.
- **Read lazily**: each step, `state.mjs next --print` and only what it prints; "Look up when needed" only when sent there. Never read a reference, engine README or `lessons.md` whole, or a section twice; of `/hyperframes`, only the guides needed.
- **Small output**: filter `--json`; never print `words.json`, `*.response.json` or full logs; background output by bytes (`tail -c 1500`). Scene changes are `Edit` calls, never `sed -i` or a whole-file Write.
- **Scene code stays in builder subagents.** The main agent never writes or reads `src/` or `assets/*.js` (generated data and its own Step 5 frames in `style-frames/src/` aside). Pilot, each group, assembly and each QC fix round go to a **new** builder (last report + paths, its budget in `look-build.md` / `express.md`), logged with `state.mjs log`. The reviewer is never a builder.
- **Images stay in subagents.** The main agent never `Read`s a still, strip, sheet, scope or style frame: a subagent gets the paths and the `state.mjs next` "For the subagent" commands, returns a text verdict. One exception: the author of `style-frames/src/` opens each `review/refs-board-<frame>.jpg` once before its first write.
- **Model per job, never asked** (top = omit `model`, mid = `"sonnet"`, light = `"haiku"`):

| Subagent job | Model | Effort |
|---|---|---|
| Fresh-eyes review, Set / Reality check, style-frame check, benchmark, sound-off quiz | top | high (quiz: medium) |
| Scopes verdict | top | medium |
| Planner: `SPEC.md` + `storyboard.md` | top | high |
| Studio builder: the pilot | top | high |
| Studio builder: other groups, assembly, each QC fix round | top | medium |
| Express builder and its fix rounds | mid | medium |
| Gate 1 read-through; fact research (≤ 8 searches, 15 fetches) | mid | medium |
| Fix check, asset pair check, contact-sheet triage | mid | low |
| Media screening of `find_media` candidates and the Step 5 reference boards | light | low |

  **Escalate, never repeat.** A job that fails its check (still red, nothing usable, a P0 survives) goes to a new agent one notch up: effort (low → medium → high), then model (light → mid → top). Never down or the same twice; a clean job is never rerun. A fix round of ≤ 3 copy or timing findings drops one effort notch. Log each setting with `state.mjs log`.

- **Compact at Gates 2, 3 and 4**: tell the user once that `/compact` or a new session is safe (you cannot run it).
- **Parallel by default.** Independent jobs start in one message; long ones in the background, never polled; each agent owns its files. Heavy jobs (VoxCPM, render, check, snapshot) one at a time, never beside a model job; queue with `while kill -0 <pid>`. Together: preflight ‖ the topic question; reference ‖ fact strands (≤ 3, Express ≤ 2); after Gate 1 the voice take ‖ facts, assets, never scenes; at Gate 2 planner and music; Step 6 Studio: pilot, then all groups; Express: every group at once, no pilot; Step 7 the draft checks, then reviewer ‖ quiz ‖ Set / Reality check; Step 8 `POST.md` during the render.
- **Cheap before expensive**: `--sample` before a take; `--from-response` when only `{}` moves; snapshots while iterating; fixes batched per round; QC at `--fps 10 --quality draft`; one high-quality render.
- **Short messages**: what changed, what to decide, links; at a wait, the next gate's clock time; a step over ~2 min gets an estimate.

## Project files (`video/<topic-slug>/`)

Log with `state.mjs log "<step> | <output> | <problems or ->"`. The folder **is** the HyperFrames project; run commands from it. Edit only `*.tpl.html`; `node <skill-dir>/scripts/fill_times.mjs src/index.tpl.html index.html` regenerates `index.html` (never by hand, no second root `.html`).

## Steps

| Step | Do | Ends with | Read (`references/`) |
|---|---|---|---|
| 0 Setup | `preflight.mjs`, fix what it reports, project folder | `PRODUCTION.md` | `brief.md` §0 |
| 1 Brief | topic first, every question now | `BRIEF.md` | `brief.md` §1 |
| 2 Reference (optional) | measure craft, never copy | `reference-measurements.md` | `measure-reference.md` |
| 3 Script | script, narration, tags, lints, read-through, quiz | **Gate 1** | `script-voice.md` §3 |
| 4 Voice | sample, take, `--retake auto`, `pad_voice.mjs` | **Gate 2** | `script-voice.md` §4, `voice.md` "Use" |
| 5 Look | `SPEC.md`, hero, storyboard, assets, style frames, benchmark | **Gate 3** | `look-build.md` §5 |
| 6 Build | builders, times from `BEATS`/`WORDS`, audio mix | `index.html`, lints clean | `look-build.md` §6 |
| 7 QC | draft, checks, strips, reviewer, quiz, fix rounds | **Gate 4** | `qc.md` §7 |
| 8 Final | assets check, high render, re-check | `final.mp4`, `POST.md`, report | `qc.md` §8 |

At every step: gates go through `state.mjs approve <n> --by agent` (in order, after the checks; a gated file edited later is STALE until re-approved); `BRIEF.md` rules format and language; a recorded or cloned voice only with the speaker's permission; pages only in Claude's built-in browser, never the user's Chrome; log every step and problem in `PRODUCTION.md`; series feedback via `series.mjs note`, never memory.

## Autonomous mode

If the user gives a topic and leaves, use what they said, else: Express (a 3D ask means `object-studio`); YouTube 16:9, 60–90 s (Shorts 9:16 for short or ≤ 60 s); their language; `isometric-world`; "modern balanced"; general audience; VoiceStudio per `references/brief.md` Step 0 (not ready by Step 4: stop and say so). Write "defaults used" first in `PRODUCTION.md`, log each decision, finish the film. Ship rules: `references/qc.md` "User away" (an `audio_qc.mjs` exit 2 that stays is named in the hand-off, never a pass). Skip install offers; log them. Never edit the installed skill.

## When something goes wrong

`grep -n -i '<word>' <skill-dir>/references/lessons.md`.
