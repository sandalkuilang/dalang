# Architecture

Dalang is orchestration, not rendering. It owns the *process*; specialist tools own the *pixels* and the *voice*.

```mermaid
flowchart LR
    U(["User"]) <--> CC["Claude Code"]
    CC --> SK["dalang skill<br/>SKILL.md"]

    SK -. loads lazily .-> REF["references/<br/>one file per step +<br/>visual-direction, camera-motion,<br/>looks, voice, lessons"]
    SK --> SC["scripts/"]
    SK --> EN["engine/three/<br/>three.js + Rapier systems<br/>with a self-check"]

    subgraph SCR["scripts/"]
        PF["preflight.mjs"]
        TTS["tts_timestamps.mjs"]
        ST["stillness.mjs"]
        LD["loudness.mjs"]
        AL["align.py"]
        QC["qc.mjs · timing_lint.mjs<br/>state.mjs · check_assets.mjs"]
        MR["measure_reference.sh · palette.mjs"]
    end
    SC --- SCR

    TTS --> VS["VoiceStudio<br/>local, free"]
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
| `scripts/preflight.mjs` | environment check, ~15 lines of output; `--start` opens an installed VoiceStudio | install anything, print secrets |
| `scripts/tts_timestamps.mjs` | narration audio, `words.json`, `beats.json/js` | decide the look |
| `scripts/align.py` | word timing against the known script (Apache-2.0 CTC models) | download a model without asking |
| `scripts/stillness.mjs`, `loudness.mjs`, `qc.mjs`, `timing_lint.mjs` | measured QC (stillness, LUFS / true peak, black frames, colour tags, cuts inside words) | judge taste |
| `scripts/strips.mjs` | review strips: stills per storyboard shot on numbered sheets + frame index | judge the frames |
| `scripts/find_media.mjs` | free licensed media search (Openverse, Commons, bundled SFX): previews, then `--take` copies one and writes its `ASSETS.json` row from the API | use NC / ND media, need a key, report a failed source as "nothing found" |
| `scripts/state.mjs`, `check_assets.mjs` | gate approvals (stale on change), licence gate + `CREDITS.md`; reads the engine build's `.engine.json` so engine files are never hand-listed, checks joined licences (`A AND B`, `A + B`, `A, B` ...) part by part, a CC BY part anywhere gets its credit | approve on the user's behalf outside autonomous mode |
| `engine/three/` | generic 3D systems (real scale and settling, surfaces, physics and mechanisms, cloth, air, plants, particles, granular fills, water, fur, cutaways, captions and pinned labels in `type.js`, camera stations and attention by ghosting), each with a self-check; `bake.mjs` stores a physics bake once for every snapshot and render worker (groups that never touch bake in parallel workers); ready pieces in `examples/` | know a scene, a topic or a list of objects |
| fresh-eyes reviewer (`references/review.md`) | a defect list from a subagent with no build history | fix anything |
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
