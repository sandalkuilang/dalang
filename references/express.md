# Express mode (the default)

Express makes a 30–90 s film in **20 minutes of work at most** (the user's replies at Gate 1 and Gate 4 not counted). It is the default answer to Brief Call 1's "Mode"; Studio (three.js, physics, reference boards, benchmark, reviewer) is the other answer. `BRIEF.md` says `mode: express`. Every rule of SKILL.md still holds unless this file says otherwise: words first, every change on a word, facts sourced, true shapes, free tools.

| Minute | Work | Who |
|---|---|---|
| 0–2 | preflight, folder, one Brief call | main |
| 2–5 | facts (≤ 4 searches, ≤ 6 fetches, 3 min) → `script.md` + `narration.txt` → **Gate 1** (user) | research subagent (`model: "sonnet"`), main |
| 5–12 | voice take, and at the same time the build | background job + one builder |
| 12–16 | build finishes, lints | builder |
| 16–20 | one render at `--quality looks` → **Gate 4** (user) | main |

Over budget at a step: say so with the clock time, cut scope (fewer shots, shorter film), never skip a fact check or the timing.

## Express Steps 3–4 — Script and voice

- Script as in `script-voice.md` Step 3 (beats `{text|name}`, provenance tags, `numbers_lint.mjs`), at most 8 beats. No quiz, no arc template look-ups. The research brief: ≤ 4 searches and ≤ 6 page fetches, original sources first; an unsourced number comes back `[unknown]`.
- Right after Gate 1, in one message: start the full take in the background (`tts_timestamps.mjs … --retake auto`, the voice from `BRIEF.md`; `--sample` only when the user has not heard this voice before), write `SPEC.md` (LOOK, MOTION, OBJECTS: 3–6 lines each, BANNED) and `storyboard.md` (one row per beat: beat name, what is on screen, the overlay text), and start the builder. The builder needs beat names, not times: every time is read from `audio/beats.js` at runtime.
- Gate 2 is the agent's: approve it (`state.mjs approve 2 --by agent`) when the take ends with no WARNING left; a sentence still flagged after `--retake auto` is respelled once (`--retake changed`), then shown to the user at Gate 4.

## Express Step 5 — Look in one frame

- One builder (`model: "sonnet"`, a new one) writes the whole film. No asset search, no reference board, no style-frame check, no benchmark.
- **2.5D look:** flat illustration drawn in inline SVG and HTML, made deep by layers: background, mid and foreground planes moving at different rates on a slow camera push (parallax), soft contact shadows under every object, one key light direction kept on every layer (a gradient lit side, a rim on the far edge), a cutaway or exploded view to show inside. One palette of 4–6 colours, one type family.
- **True shapes still:** each object drawn with its real parts, proportions and order of layers; labels name real parts. Never a generic icon for a thing the film explains.
- The builder's first output, once `audio/beats.js` exists, is one frame: `npx hyperframes snapshot --at <the hook beat's seconds> --no-end --describe false -o style-frames/`. The main agent approves Gate 3 itself (`state.mjs approve 3 --by agent`, Express needs no benchmark) and the builder continues; it never waits for the user.

## Express Step 6 — Build (one builder)

Builder brief: `BRIEF.md`, `SPEC.md`, `storyboard.md`, `narration.txt`, the `/hyperframes` skill, this section. Return ≤ 10 lines.

- One composition per film (`src/index.tpl.html` → `fill_times.mjs` → `index.html`), GSAP timelines from `BEATS`/`WORDS` only; nothing timed by hand.
- **Motion has a cause:** an arrow, a flow, a glow or a hand makes each move; nothing floats, drifts or loops. A fall eases in (`power2.in`), lands with a short squash and a sound; a push eases out. Every shot keeps one continuous motion (camera push, flow, the subject acting).
- On-screen text: the headline per beat from `storyboard.md`, numbers as digits, captions from `WORDS`.
- Audio: the narration; music and SFX only from the bundled `/media-use` library (`find_media.mjs --type sfx --bundled`), music ducked under the voice. No web search for media.
- Checks before returning: `npx hyperframes lint`, `node <skill-dir>/scripts/lint_scene.mjs`, `node <skill-dir>/scripts/timing_lint.mjs`; fix what they report.
- Log the build: `state.mjs log "6 Build | index.html | <problems or ->"`.

## Express Step 7 — Render → GATE 4

- One render: `npx hyperframes render --fps <brief fps> --quality looks --quiet`, then `npx hyperframes check` on it. No 10 fps draft, no strips, no reviewer, no quiz.
- Send the file to the user: that is **Gate 4**. A change they ask for goes to a new builder with the list; render again.
- Approved: `state.mjs approve 4 --by user`; `--quality high` only when the user asks for it. Hand-off: `POST.md` and two lines in `PRODUCTION.md` (time spent, tokens from `review/tokens.json`).
