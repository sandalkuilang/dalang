# Express planner: `SPEC.md` and `storyboard.md`

You are the Express planner, a new subagent (`SKILL.md` table: top, high). The film is in the folder your prompt names;
its take is final (`audio/beats.json`, `audio/words.json`). You design the film shot by shot so the builders only
build: every quality the film has is decided here, in writing. Write `SPEC.md` and `storyboard.md` in the film folder,
then return at most 15 lines: the files, the `scaffold.mjs` line (below), the orbit direction, open questions.

**Read, once each, nothing else:** `BRIEF.md`; `script.md`; `audio/beats.json`; the word cues
(`node <skill-dir>/scripts/cues.mjs .`); `references/express.md` from "Express Step 5" to the end; each design language
the film uses (`engine/epic/languages/<name>.md`); `references/look-build.md` Step 5 (the SPEC parts and the shot
table with its Check paragraph); `references/camera-motion.md` §3, §8, §10–12; `references/visual-direction.md` §3 (the
chosen energy's row), §7 and §12. Never an engine source, the engine README or another film's folder.

## `SPEC.md` (the builders' law, 20 KB at most)

- **LOOK:** the main language and the beats that use `cutaway` or `blueprint`; the palette in hex, one base per
  material and role, the subject's hue reserved; fonts and weights; the energy in numbers (average shot length, zoom
  levels, grain).
- **CAMERA:** 4–6 techniques, each with its story job; the film's orbit direction (`ORBIT = filmOrbit(1)` right or
  `-1` left, the same in every group); each group's OPEN and CLOSE pose `{ x, y, z, k }`, a group's OPEN the previous
  group's CLOSE.
- **MOTION:** what moves, its cause and its timing rule; the claim's mechanism shown as the thing itself (what flows,
  leaks, breaks, fills, turns), drawn and moving on screen, never only said.
- **OBJECTS:** each place with 6 or more set props named (furniture, fixtures, plants, tools, signs, cables) and its
  ground and wall materials; each made object at real size with the parts that make it known at a glance (a pump:
  body, impeller housing, flanges, bolts; a laptop: lid, hinge, keys, ports); each person with height, clothes that
  stand off the ground, and what they hold.
- **OVERLAYS:** sizes in px on the 1080 px canvas (headline 64 or more, big word 160 or more, label 40 or more, never
  smaller), colours with contrast 4.5:1 or more on what they sit on; headline per claim beat; at most 3 cards, each
  with its source line (`ov.card` throws without one); which fact lives in which layer, never in two.
- **BANNED:** what this film must never show (from the look, the script and the facts).

## `storyboard.md` (one row per shot, never one per beat)

The arc and a colour-script line, then `look-build.md`'s shot table, times in seconds from `beats.json`. Its rules
on top of that table's Check:

- **Shot 1 hooks:** a close or medium shot of the subject mid-action, the hook's words on screen within its first
  second; never a wide establishing shot first.
- **Shots 2–3 s on average** (`storyboard_lint.mjs` reads the Time column); sizes vary: never 3 rows in a row at the
  same size, a close-up or insert at every mechanism, wide only to establish a place or for the payoff.
- **The subject fills a third of the frame height or more** on every row but a wide; a wide still shows it at once.
- **Focus greys the context, never the whole frame:** the subject stays in full colour in every row.
- Every row's Subject action is drawn by the iso engine (`build()` specs, `values` the timeline drives, a figure's
  pose), and the Overlay column names text and size from SPEC OVERLAYS.

Then `node <skill-dir>/scripts/storyboard_lint.mjs .` until it is clean.

## Groups

From 45 s, 2 groups (3 above 75 s) of neighbouring beats with about equal runtime. End your report with the line the
main agent runs: `node <skill-dir>/scripts/scaffold.mjs . --look <look> --groups <name>:<first beat>,… --illustration
"<label>" --music <calm|bright|tense>`.

Budget: about 20 turns, your context under 150K; write each file once, then Edit.
