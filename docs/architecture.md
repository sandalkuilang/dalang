# Architecture

Dalang is orchestration, not rendering. It owns the *process*; specialist tools own the *pixels* and the *voice*.

```mermaid
flowchart LR
    U(["User"]) <--> CC["Claude Code"]
    CC --> SK["dalang skill<br/>SKILL.md"]

    SK -. state.mjs next: one § at a time .-> REF["references/<br/>one file per step +<br/>visual-direction, camera-motion,<br/>looks, voice, lessons"]
    SK --> SC["scripts/"]
    SK --> EN["engine/three/<br/>three.js + Rapier systems<br/>with a self-check"]

    subgraph SCR["scripts/"]
        PF["preflight.mjs"]
        TTS["tts_timestamps.mjs"]
        ST["stillness.mjs"]
        LD["loudness.mjs · audio_qc.mjs"]
        AL["align.py"]
        QC["qc.mjs · timing_lint.mjs · lint_scene.mjs<br/>state.mjs · check_assets.mjs"]
        MR["measure_reference.sh · palette.mjs"]
    end
    SC --- SCR

    TTS --> VS["VoiceStudio<br/>local, free"]
    TTS -. en, en-gb .-> KO["Kokoro-82M<br/>local, Apache-2.0"]
    TTS --> AL
    TTS -. only on request .-> EL["ElevenLabs<br/>cloud, paid"]

    SK -- hands off build --> HF["HyperFrames skills<br/>HTML to video"]
    HF --> FF["ffmpeg"]
    ST --> FF
    LD --> FF
    MR --> FF

    SK --> PROJ[("video/slug/<br/>BRIEF, PRODUCTION,<br/>script, audio, SPEC,<br/>storyboard")]
    EN -- build.mjs copies into assets/ --> PROJ
```

## Responsibilities

| Component | Owns | Does not |
|---|---|---|
| `SKILL.md` | order of work, gates, quality bar | build animations |
| `references/` | craft knowledge, read one § at a time | get loaded wholesale |
| `scripts/preflight.mjs` | environment check, ~15 lines of output; `--start` opens an installed VoiceStudio; reports when the skill's own clone is behind `origin/main` (fetch only) | install anything, print secrets, pull or update on its own |
| `scripts/workspace.mjs` | lean videos folder: lists the plugins and MCP servers that are on, proposes the video set; with `--yes` writes only `<folder>/.claude/settings.json` (backup, `undo`); `measure` reads the first-call tokens of a session; preflight's `Workspace` row reads it | touch user-level settings, write without `--yes`, print a server's env or headers |
| `scripts/tts_timestamps.mjs` | narration audio, `words.json`, `beats.json/js` | decide the look |
| `scripts/kokoro_tts.py` | optional Kokoro-82M speech (Apache-2.0), one sentence per call | reach the network or start a program without `--download` (one audit-hook guard refuses it, whatever library asks, by address and not by host name, a multiprocessing child included: weights, the spaCy English model); it speaks only en and en-gb and refuses any other language, or fetch without the user's consent |
| `scripts/align.py` | word timing against the known script (Apache-2.0 CTC models) | download a model without asking |
| `scripts/stillness.mjs`, `loudness.mjs`, `audio_qc.mjs`, `qc.mjs`, `scopes.mjs`, `timing_lint.mjs` | measured QC (stillness, LUFS / true peak, bed level under the voice, clicks, voice drift, black frames, colour tags, exposure and hue per cut, cuts inside words) | judge taste |
| `scripts/lint_scene.mjs` | flags a mid-line `//` comment that swallows the code after it (`file:line`, the swallowed text) | rewrite the code |
| `scripts/numbers_lint.mjs` | Gate 1: each narration beat named after a model number (`name`, further mentions `name__suffix`) holds a mention of its `numbers.json` value in a declared form (its `say`, or a figure after the spoken rounding, alone or in the say's place; other beats are not read), each `[calc: name]` is in `numbers.json`, `numbers.json` is not older than `model.mjs` (`file:line`, spoken, model value) | compute the numbers (the project's `model.mjs` does) |
| `scripts/storyboard_lint.mjs` | Step 5: the shot table of `storyboard.md` against the energy's limits (`visual-direction.md` §3): an empty Subject action or Camera cell, 3+ rows with the same size and angle, the share of text-only rows, the average shot (`storyboard.md:line row N`); `state.mjs approve 3` records its result | judge taste, edit the storyboard |
| `scripts/strips.mjs` | review strips: stills per storyboard shot on numbered sheets + frame index; `--crops` adds a subject crop per shot; `--against` diffs two rounds (unchanged / changed (targeted) / changed (not targeted)) | judge the frames |
| `scripts/find_media.mjs` | free licensed media search (Openverse, Commons, bundled SFX): previews, then `--take` copies one and writes its `ASSETS.json` row from the API | use NC / ND media, need a key, report a failed source as "nothing found" |
| `scripts/state.mjs`, `check_assets.mjs` | gate approvals (stale on change; Gate 1 also hashes `model.mjs` and `numbers.json`), `next` prints each step's reading list from one table and `reading` checks it (headings, 8 KB per section, 60 KB for Steps 0–8), licence gate + `CREDITS.md`; reads the engine build's `.engine.json` so engine files are never hand-listed, checks joined licences (`A AND B`, `A + B`, `A, B` ...) part by part, a CC BY part anywhere gets its credit | approve on the user's behalf outside autonomous mode |
| `scripts/golden.mjs` | release evals: renders the fixed golden scene (`examples/golden/`), records render time, stillness, macro detail and shadow texel per station into `evals/golden/<version>/`, diffs against the previous version and FLAGs a regression beyond tolerance | judge the frames |
| `engine/three/` | generic 3D systems (real scale and settling, surfaces, physics and mechanisms, cloth, air, plants, particles, granular fills, water, fur, cutaways, captions and pinned labels in `type.js`, quantities shown in the world (flow arrows and tile fills in `quantity.js`, range cards in `type.js`), camera stations and attention by ghosting), each with a self-check; `bake.mjs` stores a physics bake once for every snapshot and render worker (groups that never touch bake in parallel workers); ready pieces in `examples/` | know a scene, a topic or a list of objects |
| fresh-eyes reviewer (`references/review.md`) | a defect list from a subagent with no build history, on the strongest model, sheets and crops first and full-res only for a doubt; a sound-off quiz answered from the strips alone | fix anything |
| builder subagents (`references/look-build.md` "Parallel build", `review.md` §3) | all scene code: the pilot (a film under 3 groups whole), each shot group, the assembly, each QC fix round; a report of at most 15 lines | approve a gate, review their own work |
| HyperFrames skills | scene building, preview, render | pick the script or voice |
| Project files | all state (one video = one session) | live in the skill repo |

## Design decisions

- **State in files, not chat.** Resume from `BRIEF.md` + last lines of `PRODUCTION.md`; keeps sessions short and cheap.
- **Lean `SKILL.md`, details in `references/`.** Each step names the one § it needs.
- **Measure, don't guess.** Duration, cost, stillness and loudness come from script output, never from memory.
- **Secrets stay in the shell.** The ElevenLabs key is read from `ELEVENLABS_API_KEY`, never printed or written to a project file.
- **The 3D engine grows by behaviours, not objects.** Any model is a body from its own mesh and its looked-up mass and friction; a new law (a liquid, an orbit, an ion in a field) is built generic, self-checked, proved in a render, then added.
- **Engines are swappable.** Both voice engines produce the same outputs, so later steps don't care which one ran.

See [`references/lessons.md`](../references/lessons.md) for the real failures that shaped each rule.
