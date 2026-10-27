# Express mode (the default)

Express makes a 30–90 s film in **20 minutes of work at most** and **no stop after the Brief**: the agent passes every gate itself (`state.mjs approve <n> --by agent`) and hands over the finished film. It is the default answer to Brief Call 1's "Mode"; Studio (three.js, physics, reference boards, benchmark, reviewer) is the other answer. `BRIEF.md` says `mode: express`. Every rule of SKILL.md still holds unless this file says otherwise: words first, every change on a word, facts sourced, true shapes, free tools.

| Minute | Work | Who |
|---|---|---|
| 0–2 | preflight, folder, one Brief call | main |
| 2–5 | facts (≤ 4 searches, ≤ 6 fetches, 3 min) → `script.md` + `narration.txt` → Gate 1 (agent) | research subagent (`model: "sonnet"`), main |
| 5–12 | voice take, and at the same time the build | background job + one builder |
| 12–16 | build finishes, lints | builder |
| 16–20 | one render at `--quality looks` → Gate 4 (agent) → the film to the user | main |

Over budget at a step: say so with the clock time, cut scope (fewer shots, shorter film), never skip a fact check or the timing.

## Express Steps 3–4 — Script and voice

- Script as in `script-voice.md` Step 3 (beats `{text|name}`, provenance tags, `numbers_lint.mjs`), at most 8 beats. No quiz, no arc template look-ups. The research brief: ≤ 4 searches and ≤ 6 page fetches, original sources first; an unsourced number comes back `[unknown]`.
- Approve Gate 1 yourself once `numbers_lint.mjs` is clean (`state.mjs approve 1 --by agent`), then in one message: start the full take in the background (`tts_timestamps.mjs … --retake auto`, the voice from `BRIEF.md`; `--sample` only when the user has not heard this voice before), write `SPEC.md` (LOOK, MOTION, OBJECTS: 3–6 lines each, BANNED) and `storyboard.md` (one row per beat: beat name, what is on screen, the overlay text), and start the builder. The builder needs beat names, not times: every time is read from `audio/beats.js` at runtime.
- Gate 2 is the agent's: approve it (`state.mjs approve 2 --by agent`) when the take ends with no WARNING left; a sentence still flagged after `--retake auto` is respelled once (`--retake changed`), then named in the hand-off.

## Express Step 5 — Look in one frame

- One builder (`model: "sonnet"`, a new one) writes the whole film. No asset search, no reference board, no style-frame check, no benchmark.
- **The look is the isometric infographic** (grammar after lemo-opuscar's `iso-infographic`, MIT; engine `engine/iso/iso.js`, Canvas 2D, no three.js): the subject as a small diorama on a floating board with a cut edge, on a pale ground.
  - **True isometric, never perspective:** axes at 30°, the projection never tilts or rotates; the camera only pans and zooms (zoom interpolated in log).
  - **Three tones per face, no outlines:** top lightest, left mid, right darkest, all from one base colour (`tri()`); solids are told apart by tone alone.
  - **Colour is a legend:** a pale ground, 5–7 hues, one ink; one hue per material or role for the whole film; the subject's hue is reserved, and to point at it everything else greys out (focus + context).
  - **Infographic furniture lives in the world:** label pins (dot → leader → rule → text) that never cover the subject, dashed cut lines, hatched section faces, a route line, a "you are here" ring, a circular inset for a close-up.
  - **Numbers are drawn, not said:** Isotype rows of identical icons that add up to the figure on screen.
  - **True shapes still:** each object built from its real parts and proportions (boxes, prisms, cylinders, `shape()` for an outline); a machine gets its tell-tale parts, never a generic block. A cutaway shows the real inside.
- The builder's first output, once `audio/beats.js` exists, is one frame: `npx hyperframes snapshot --at <the hook beat's seconds> --no-end --describe false -o style-frames/`. The main agent approves Gate 3 itself (`state.mjs approve 3 --by agent`, Express needs no benchmark) and the builder continues; it never waits for the user.

## Express Step 6 — Build (one builder)

Builder brief: `BRIEF.md`, `SPEC.md`, `storyboard.md`, `narration.txt`, the `/hyperframes` skill, this section and Step 5's look. Return ≤ 10 lines.

- `cp <skill-dir>/engine/iso/iso.js assets/iso.js` (its API: the comment block at its top and `<skill-dir>/engine/iso/README.md`). One composition (`src/index.tpl.html` → `fill_times.mjs` → `index.html`) with one full-frame `<canvas>`; a GSAP timeline, built from `BEATS`/`WORDS` only, holds the animated values, and its `onUpdate` redraws the canvas from those values (`iso.cam`, then the primitives, then `iso.flush()`), so a seek renders the same frame every time.
- **Motion has a cause, led by a line:** a route or leader line draws a little ahead of what moves; a cutaway is cut line (~0.3 s) → near skin slides out along its normal (~0.35 s, ease-out) → hatched rims. Solids arrive by moving in, never by fading (a see-through block reads as a ghost); landing squash ~18 % and a small bounce; a fall eases in. Isotype icons pop with an overshoot, one per beat subdivision, the count-up number in step. Every shot keeps one continuous motion.
- Camera moves from the menu that fits the story: follow a route (cause → effect), hold wide with an inset, push through nested cutaways, a fast pull-out to the whole infographic, a locked frame while things pile up, a tilt down through strata. The subject ≥ 1/3 of frame height at its key moments.
- Text: one geometric sans the project loads (set `FONT` in `assets/iso.js`), titles in caps with tracking, big numbers with half-size units, every text with a ground-colour halo; captions from `WORDS` as a pale map-label card at the bottom (keep that zone clear).
- Pitfalls: give every face an outward hint (else it is culled), draw a composite as one ordered item, leave clearance between a wheel and the floor, skip small detail when zoomed in close.
- Audio: the narration; music and SFX only from the bundled `/media-use` library (`find_media.mjs --type sfx --bundled`), light and acoustic, ducked under the voice. No web search for media.
- Checks before returning: `npx hyperframes lint`, `node <skill-dir>/scripts/lint_scene.mjs`, `node <skill-dir>/scripts/timing_lint.mjs`; fix what they report.
- Log the build: `state.mjs log "6 Build | index.html | <problems or ->"`.

## Express Step 7 — Render → GATE 4

- One render: `npx hyperframes render --fps <brief fps> --quality looks --quiet`, then `npx hyperframes check` on it. No 10 fps draft, no strips, no reviewer, no quiz.
- Approve Gate 4 yourself (`state.mjs approve 4 --by agent`) once `check` passes, and send the film. A change the user asks for afterwards goes to a new builder with the list; render again.
- `--quality high` only when the user asks for it. Hand-off: `POST.md` and two lines in `PRODUCTION.md` (time spent, tokens from `review/tokens.json`).
