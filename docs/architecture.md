# Architecture

Dalang is orchestration, not rendering. It owns the *process*; specialist tools own the *pixels* and the *voice*.

```mermaid
flowchart LR
    U(["User"]) <--> CC["Claude Code"]
    CC --> SK["dalang skill<br/>SKILL.md"]

    SK -. state.mjs next: one § at a time .-> REF["references/<br/>one file per step +<br/>express, hero-asset, looks,<br/>visual-direction, camera-motion,<br/>voice, lessons"]
    SK --> SC["scripts/"]
    SK -- Express, default --> EI["engine/iso/<br/>Canvas 2D isometric:<br/>kits, templates, cinema"]
    SK -- Studio, precision --> EN["engine/three/<br/>three.js iso look +<br/>object-studio, self-check"]
    EN --- EB["engine/blender/<br/>hero modelled once<br/>from 2D pictures (local Blender)"]
    EI --- EA["engine/anatomy/<br/>world audit"]
    SK -. both lanes .-> EP["engine/epic/<br/>isometric-world · cutaway · blueprint"]
    SK --> MU["engine/music/<br/>CC0 / public-domain beds"]

    subgraph SCR["scripts/"]
        PF["preflight.mjs"]
        TTS["tts_timestamps.mjs"]
        ST["stillness.mjs"]
        LD["loudness.mjs · audio_qc.mjs"]
        AL["align.py"]
        QC["qc.mjs · timing_lint.mjs · lint_scene.mjs<br/>state.mjs · check_assets.mjs"]
        EX["express.mjs · film_gate.mjs · iso_audit.mjs<br/>trace.mjs · scaffold.mjs · pad_voice.mjs"]
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
    EI -- scaffold.mjs copies into assets/ --> PROJ
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
| `scripts/tokens.mjs` | tokens per agent (turns, total, largest context) read from Claude Code's transcripts, a WARN per builder over the budget; `state.mjs approve` records it at every gate | block a gate, or read "no transcript" as "no tokens" |
| `scripts/lint_scene.mjs` | flags a mid-line `//` comment that swallows the code after it (`file:line`, the swallowed text), and an overlay anchored to typed numbers instead of `PIN.<part>` | rewrite the code |
| `scripts/iso_audit.mjs` | an Express world's true shapes (Anatomy's audit, `engine/anatomy/`): a part that floats, two objects sunk into each other, a pipe through a solid or ending in mid-air, a label (`PINS`) on a missing, shared or hidden part, a hero under 15 parts, each named; exit 2 is a WARN | judge contacts by eye, read an unreadable world as clean |
| `scripts/film_gate.mjs` | an Express film measured from each group's own module run in Node on a stub page: a jump or a turn back at a cut, a close-up past the drawing's detail, a part that floats or sinks only while the world moves, an overlay too short for its words (FAILED); a dead stop at a cut, 3 s with nothing changing (NOTE); run by `express.mjs assemble`, exit 2 is a WARN | a subagent looking at seam snapshots, read an unrun group as clean; `--group` gives one group's lines, run by its builder and its fixer |
| `scripts/trace.mjs` | the user's photo of their own thing traced exactly into vtracer layers (plain background cut; a moving part by ellipse and its own colour, the body under it painted in; a material by hue) for build()'s `plate`; a busy background or no vtracer is a WARN | a builder guessing the user's machine from a description; a hand-made trace (it lost the dark parts' structure) |
| `scripts/numbers_lint.mjs` | Gate 1: each narration beat named after a model number (`name`, further mentions `name__suffix`) holds a mention of its `numbers.json` value in a declared form (its `say`, or a figure after the spoken rounding, alone or in the say's place; other beats are not read), each `[calc: name]` is in `numbers.json`, `numbers.json` is not older than `model.mjs` (`file:line`, spoken, model value) | compute the numbers (the project's `model.mjs` does) |
| `scripts/narration_lint.mjs` | Gate 1: narration is followable by ear: a `;` `:` `( )` or `/` in spoken text, a sentence over 22 words, a `script.md` without its `Promise:` and `Takeaway:` lines (`file:line`; dialogue keeps `name:`; an unreadable file is a warning to rerun) | rewrite the narration |
| `scripts/beats_lint.mjs` | second-language cut: both narrations hold the same named beats in the same order (a beat missing, renamed, extra, out of order, unnamed, with an invalid or repeated name, or an unbalanced brace is `file:line`; an unreadable file is a warning to rerun, never "not found") | translate the narration or touch the first one |
| `scripts/fill_times.mjs` | `{{beat}}` times in the HTML template; `--lang <code>` for the cut: times from `audio/<code>/`, each local `src` / `href` switched to its language variant (`audio/x` → `audio/<code>/x`, a missing one fails; `name.ext` → `name.<code>.ext` when it exists, a missing one fails for `narration.*` / `strings.*`); without `--lang` only the times change | pick a language or write a variant |
| `scripts/express.mjs` | Express's mechanical steps as one call each: `after-voice` (the newest take log's warnings, padding, captions, Gates 1–2), `assemble` (a stub world fails, the tokens spent so far decide the fix round, fill every template, every lint, Gate 3, failures per group, the world and every group recorded by sha256), `final` (the files changed since assemble, hyperframes check and check_assets first, then render, Gate 4, metrics) | approve a gate over a failed check or a WARNING in the take |
| `scripts/cues.mjs` | the builder's cue table: one line per beat, each word as its `w("word", n)` call (n film-wide, as the engine counts) with its start; `--beats` for one group | print `words.json` or anything but the table |
| `scripts/storyboard_lint.mjs` | Step 5: the shot table of `storyboard.md` against the energy's limits (`visual-direction.md` §3): an empty Subject action or Camera cell, 3+ rows with the same size and angle, the share of text-only rows, the average shot (`storyboard.md:line row N`); `state.mjs approve 3` records its result | judge taste, edit the storyboard |
| `scripts/strips.mjs` | review strips: stills per storyboard shot on numbered sheets + frame index; `--crops` adds a subject crop per shot; `--against` diffs two rounds (unchanged / changed (targeted) / changed (not targeted)); the layout numbers of the canvas text per frame (records posted by `layoutFrame` to a local receiver, `--layout <file>`) | judge the frames |
| `scripts/layout_lint.mjs` | canvas text boxes per frame (caption, label, card, hero): outside the safe area, over the hero by more than 10 %, under the minimum size, caption over a label, each with its time; run by `strips.mjs` into `index.md`, and by the gate on fixtures | judge text placement by eye alone, read a missing record as "no faults" |
| `scripts/find_media.mjs` | free licensed media search (Openverse, Commons, bundled SFX; `--type model`: Poly Haven, Smithsonian Open Access 3D, NASA 3D Resources, Kenney, with triangles, stated size and a contact sheet): previews, then `--take` copies one (a glTF with its textures) and writes its `ASSETS.json` row from the source's own licence | use NC / ND media, need a key, report a failed source as "nothing found" |
| `scripts/state.mjs`, `check_assets.mjs` | gate approvals (stale on change; Gate 1 also hashes `model.mjs` and `numbers.json`; Gate 3 refuses without `review/benchmark.md` or with a row > 1 point behind), `next` prints each step's reading list from one table and `reading` checks it (headings, 8 KB per section, 60 KB for Steps 0–8), licence gate + `CREDITS.md`; reads the engine build's `.engine.json` so engine files are never hand-listed, checks joined licences (`A AND B`, `A + B`, `A, B` ...) part by part, a CC BY part anywhere gets its credit | approve on the user's behalf outside autonomous mode |
| `scripts/scaffold.mjs` | the film's frame written by code: the engine into `assets/` (with `.engine.json` licences), the host, one template per group, the shared isometric world; `--music <mood>` copies a bed | write scene content |
| `scripts/pad_voice.mjs` | room around the voice: `audio/voice.wav` with 1.45 s before and 1.35 s after, every timing file moved to match; the take untouched | edit the take |
| `scripts/captions.mjs` | caption phrases from `narration.txt` and `words.json` into `audio/captions.js` | write captions by hand |
| `scripts/series.mjs` | a series kit (look, HUD, captions, voice, rules) saved once and loaded by each video of the series; opt-in | carry anything into a video outside a series |
| `scripts/voice_licences.mjs` | the voice licence table behind `check_assets.mjs --commercial`; a model not in it is unknown, never commercial-OK | guess a licence |
| `scripts/score_run.mjs` | the scorecard of a finished or drafted project, run on each golden brief (`references/evals.md`) after a skill change | judge taste |
| `scripts/golden.mjs` | release evals: renders the fixed golden scene (`examples/golden/`), records render time, stillness, macro detail and shadow texel per station into `evals/golden/<version>/`, diffs against the previous version and FLAGs a regression beyond tolerance | judge the frames |
| `engine/iso/` | Express's renderer, Canvas 2D with no three.js: `iso.js` (vendored, MIT; every solid inked at its silhouette and creases, boxes bevelled), `build.js` (a world as data: forms, arrays, cutaway skins, focus, meshing gears by tooth ratio, contact shadows, each named part's pin point), `kit.js` (parts) and `templates.js` (whole objects), `figure.js` (a person), `plate.js` (the user's traced photo), `parallax.js` (depth layers), `cinema.js` (keyed camera, one-way orbit, motion blur, the frame finish), group and world templates in `templates/` | know a topic, draw with three.js, move anything without a cue |
| `engine/anatomy/` | the geometry audit `iso_audit.mjs` runs on an Express world (Anatomy, vendored unchanged, MIT; `world.mjs` reads `build()` specs as true shapes) | draw anything |
| `engine/epic/` | the three design languages both lanes use (`languages/`: `isometric-world`, `cutaway`, `blueprint`) and their composition and chart rules (vendored, MIT) | render or animate (HyperFrames renders; motion is the GSAP timeline or the three.js set's function of t) |
| `engine/music/` | three free music beds (CC0 / public domain, `CREDITS.md`), copied into a film by `scaffold.mjs --music` | carry a licence that needs a credit or forbids monetising |
| `engine/three/` | Studio's generic 3D systems (real scale and settling, surfaces, machine parts and transmissions, air jets, granular fills, cutaways, Studio's isometric look (`isoCamera` and `isoFrame` in `camera.js`: true isometric, pan and zoom only; `isoLook`, `blueprintLook`, `inkLines` and `isoStudio` in `studio.js`: three tones per face or linework, no lights), the perspective render rig (`studio.js`) behind the `object-studio` look (`objectStudio.js`: the real object on a light grey sweep, x-ray, editorial cards; `editorial.js` is the overlay layer both lanes use), captions, pinned labels and the engineering text band in `type.js`, quantities shown in the world (flow arrows and tile fills in `quantity.js`, range cards in `type.js`), dimension lines drawn on the frame over the parts (`quantity.js`), printed markings at real size and electronics parts placed by reference designator (`markings.js`, `electronics.js`), standard machine parts and an x-ray housing (`parts.js`), circuits and signals (current flow in the waveform's shape, heat glow, lamps, arcs and failure states in `circuit.js`, live instruments in `instruments.js`), fields (field lines seeded by flux, filings and compasses in `fields.js`) and optics (rays by Snell and Fresnel through lenses, mirrors and prisms with dispersion, the focus reported, shafts and caustics in `optics.js`), camera stations and attention by ghosting, and `shots.js`, the runner that plays a film's shot list: times from beats, no overshoot, labels on the frame), each with a self-check; ready pieces in `examples/` | know a scene, a topic or a list of objects |
| `engine/blender/` | Studio's precision lane: a hero asset read from the user's 2D pictures into a parts sheet and modelled once by a Blender Python script (`references/hero-asset.md`), then reused: `parts.py` (finned coils, axial fans, motors, a rotary compressor with its inside and a section, pipes, insulation, flare nuts, service and expansion valves, sheet casings, brackets, fasteners) and `assemblies/` (a condensing unit, with its cutaway still in the iso look); Blender is a tool on the machine, never shipped | primitives for a hero seen close; reference pixels projected or baked |
| fresh-eyes reviewer (`references/review.md`) | a defect list from a subagent with no build history, on the strongest model, sheets and crops first and full-res only for a doubt; a sound-off quiz answered from the strips alone | fix anything |
| benchmark reviewer (`references/review.md` "Benchmark review") | Gate 3: a fresh subagent scores the style frames against the reference board (or the golden sheet) on seven rows, text only; a row > 1 point behind is a fix before the build | build anything, open the images in the main context |
| builder subagents (`references/look-build.md` "Parallel build", `review.md` §3) | all of the film's scene code (the Step 5 style frames stay with the main agent): the pilot (a film under 3 groups whole; Express: no pilot, every group at once), each shot group, the assembly, each QC fix round; a report of at most 15 lines | approve a gate, review their own work |
| HyperFrames skills | scene building, preview, render | pick the script or voice |
| Project files | all state (one video = one session) | live in the skill repo |

## Design decisions

- **State in files, not chat.** Resume from `BRIEF.md` + last lines of `PRODUCTION.md`; keeps sessions short and cheap.
- **Lean `SKILL.md`, details in `references/`.** Each step names the one § it needs.
- **Measure, don't guess.** Duration, cost, stillness and loudness come from script output, never from memory.
- **Secrets stay in the shell.** The ElevenLabs key is read from `ELEVENLABS_API_KEY`, never printed or written to a project file.
- **Two lanes.** Express (the default) is one Canvas 2D builder pass in 20 minutes of work; Studio is the precision lane: the same three languages in three.js and a hero modelled once from 2D pictures. The look (`isometric-world` or `object-studio`) is chosen apart from the lane.
- **The engines grow by behaviours, not objects.** Any motion is a pure function of t from its cause (a ratio, a law, a cue): no physics engine, no bake. A new law (a liquid level, an orbit, an ion in a field) is built generic, self-checked, proved in a render, then added; a hero seen close is modelled once in `engine/blender`, never rebuilt from boxes.
- **Engines are swappable.** Both voice engines produce the same outputs, so later steps don't care which one ran.

See [`references/lessons.md`](../references/lessons.md) for the real failures that shaped each rule.
