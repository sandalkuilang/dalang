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
        EX["express.mjs · studio.mjs · film_gate.mjs<br/>iso_audit.mjs · scaffold.mjs · music.mjs"]
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
| `scripts/preflight.mjs` | environment check, only the rows that need action plus one OK line; names the default voice among the saved profiles; `--start` opens an installed VoiceStudio; reports when the skill's own clone is behind `origin/main` (fetch only) | install anything, print secrets, pull or update on its own |
| `scripts/workspace.mjs` | lean videos folder: lists the plugins and MCP servers that are on, proposes the video set; with `--yes` writes only `<folder>/.claude/settings.json` (backup, `undo`); `measure` reads the first-call tokens of a session; preflight's `Workspace` row reads it | touch user-level settings, write without `--yes`, print a server's env or headers |
| `scripts/tts_timestamps.mjs` | narration audio, `words.json`, `beats.json/js` | decide the look |
| `scripts/kokoro_tts.py` | optional Kokoro-82M speech (Apache-2.0), one sentence per call | reach the network or start a program without `--download` (one audit-hook guard refuses it, whatever library asks, by address and not by host name, a multiprocessing child included: weights, the spaCy English model); it speaks only en and en-gb and refuses any other language, or fetch without the user's consent |
| `scripts/align.py` | word timing against the known script (Apache-2.0 CTC models) | download a model without asking |
| `scripts/stillness.mjs`, `loudness.mjs`, `audio_qc.mjs`, `qc.mjs`, `scopes.mjs`, `timing_lint.mjs` (all with `lint_scene.mjs` in one call: `qc_all.mjs`, one line per check) | measured QC (stillness, LUFS / true peak, bed level under the voice, clicks, voice drift, black frames, colour tags, exposure and hue per cut, cuts inside words) | judge taste |
| `scripts/tokens.mjs` | tokens per agent (turns, total, largest context) read from Claude Code's transcripts, a WARN per builder over the budget and for a main agent over its turns (Express 30, Studio 100); `state.mjs approve` records it at every gate; says "not counted" when subagent transcripts are missing, never 0 | block a gate, or read "no transcript" as "no tokens" |
| `scripts/next_version.mjs`, `release.sh` | the release's version read from CHANGELOG's Unreleased (`### Redesign` MAJOR only with `--major`, `### Rework` MINOR, everything else PATCH), whenever `Unreleased` has an entry | pick a version by hand, or release per PR |
| `scripts/wait.mjs` | the barrier after a fan-out: last in the message that starts N subagents, it returns when the N newest have finished, so their replies arrive in one main turn; still running at its timeout: exit 3, run again | wait for a job started earlier, or start a job again |
| `scripts/lint_scene.mjs` | flags a mid-line `//` comment that swallows the code after it (`file:line`, the swallowed text), and an overlay anchored to typed numbers instead of `PIN.<part>` | rewrite the code |
| `scripts/iso_audit.mjs` | an Express world's true shapes (Anatomy's audit, `engine/anatomy/`): a part that floats, two objects sunk into each other, a pipe through a solid or ending in mid-air, a label (`PINS`) on a missing, shared or hidden part, a hero under 15 parts, each named; exit 2 is a WARN | judge contacts by eye, read an unreadable world as clean |
| `scripts/film_gate.mjs` | an Express film measured from each group's own module run in Node on a stub page: a jump or a turn back at a cut, a close-up past the drawing's detail, a part that floats or sinks only while the world moves, an overlay too short for its words (FAILED); a dead stop at a cut, 3 s with nothing changing (NOTE); run by `express.mjs assemble`, exit 2 is a WARN | a subagent looking at seam snapshots, read an unrun group as clean; `--group` gives one group's lines, run by its builder and its fixer |
| `scripts/trace.mjs` | the user's photo of their own thing traced exactly into vtracer layers (plain background cut; a moving part by ellipse and its own colour, the body under it painted in; a material by hue) for build()'s `plate`; a busy background or no vtracer is a WARN | a builder guessing the user's machine from a description; a hand-made trace (it lost the dark parts' structure) |
| `scripts/numbers_lint.mjs` | Gate 1: each narration beat named after a model number (`name`, further mentions `name__suffix`) holds a mention of its `numbers.json` value in a declared form (its `say`, or a figure after the spoken rounding, alone or in the say's place; other beats are not read), each `[calc: name]` is in `numbers.json`, `numbers.json` is not older than `model.mjs` (`file:line`, spoken, model value) | compute the numbers (the project's `model.mjs` does) |
| `scripts/narration_lint.mjs` | Gate 1: narration is followable by ear: a `;` `:` `( )` or `/` in spoken text, a sentence over 22 words, a `script.md` without its `Promise:` and `Takeaway:` lines, a letter code with no `say.txt` line, two commas or more outside a list closed by "and"/"then", a sentence in lower case (`file:line`; dialogue keeps `name:`; an unreadable file is a warning to rerun) | rewrite the narration |
| `scripts/beats_lint.mjs` | second-language cut: both narrations hold the same named beats in the same order (a beat missing, renamed, extra, out of order, unnamed, with an invalid or repeated name, or an unbalanced brace is `file:line`; an unreadable file is a warning to rerun, never "not found") | translate the narration or touch the first one |
| `scripts/fill_times.mjs` | `{{beat}}` times in the HTML template; `--lang <code>` for the cut: times from `audio/<code>/`, each local `src` / `href` switched to its language variant (`audio/x` → `audio/<code>/x`, a missing one fails; `name.ext` → `name.<code>.ext` when it exists, a missing one fails for `narration.*` / `strings.*`); without `--lang` only the times change | pick a language or write a variant |
| `scripts/studio.mjs` | Studio's mechanical steps as one call each, so the main session only orchestrates: `after-voice` (express.mjs's), `frames` (style-frame stills on one sheet, the moving sample, `hook.mp4`), `qc` (puts the last round's verdicts aside, then check, the draft, `qc_all`, strips, the cut sheet; a film without a music bed fails), `fixes` (`fix_ledger.mjs` decides the round, then one fixer prompt per group with a blocking finding in its reviewer-written `review/fixes-<group>.md`), `final` (express.mjs final at high quality, then `qc_all` on the final) | a hand-written chain, a poll or a retyped verdict in the main session |
| `scripts/fix_ledger.mjs` | the fix loop's stop rule: this round's `review/fixes-<group>.md` recorded in `review/fix-ledger.json`; only a P0 or a Set / Reality / Clarity P1 starts a round, a round with no fewer of them than the last stops, a finding open two rounds running is REROUTE, three rounds at most; a fixes file it cannot read is a WARN | fix rounds that never end, or a round spent on taste |
| `scripts/fixcheck.mjs` | a fixer's proof in one call: the group built fresh, its checks, stills at the findings' times (`t=` seconds or m:ss, or `--at`), one LOOK line per finding | a fix judged on the old build, or reported "unverified" |
| `scripts/music.mjs` | the bundled public-domain / CC0 bed (`engine/music`) copied as `assets/music.mp3` with its licence row; offline, a film's own bed kept | a film without music because a media site was down |
| `scripts/express.mjs` | Express's mechanical steps as one call each: `after-voice` (the newest take log's warnings, or with `voice: none` `silent_take.mjs` first and no take log; padding, captions, Gates 1–2; run by `tts_timestamps.mjs` itself after a clean Express take), `scaffold` (the planner's last call: storyboard lint, then `scaffold.mjs` from `SPEC.md`'s `SCAFFOLD:` line), `assemble` (a stub world fails, the voice step's files and globals checked (beats.js, captions.js), `hyperframes check` errors only before Gate 3, the tokens spent so far decide the fix round, fill every template, every lint, Gate 3, failures per group, the world and every group recorded by sha256), `final` (the files changed since assemble, hyperframes check and check_assets first, then render, Gate 4, metrics) | approve a gate over a failed check or a WARNING in the take |
| `scripts/cues.mjs` | the builder's cue table: one line per beat, each word as its `w("word", n)` call (n film-wide, as the engine counts) with its start; `--beats` for one group | print `words.json` or anything but the table |
| `scripts/storyboard_lint.mjs` | Step 5: the shot table of `storyboard.md` against the energy's limits (`visual-direction.md` §3): an empty Subject action or Camera cell, 3+ rows with the same size and angle, the share of text-only rows, the average shot (`storyboard.md:line row N`); `state.mjs approve 3` records its result | judge taste, edit the storyboard |
| `scripts/hero_shots.mjs` | Studio Step 5: `review/hero-shots.json` (the planner's rows of the shots that show the Blender hero) against `storyboard.md`: shot, side word, az inside the side, lens, distance, focal, need (`hero-asset.md` §3) |
| `scripts/silhouette_iou.mjs` | Studio, `fidelity: exact`: each picture the user gave against the hero's mask from that picture's camera (`measure.py` `refs`): one uniform scale, IoU, aspect difference, the worst ninth, a two-colour overlay; a busy background is WARN, never a guess |
| `scripts/snapshots.mjs` | the newest `hyperframes snapshot` dir by mtime and its first n stills in numeric order (`studio.mjs frames`) |
| `scripts/strips.mjs` | review strips: stills per storyboard shot on numbered sheets + frame index; `--crops` adds a subject crop per shot; `--against` diffs two rounds (unchanged / changed (targeted) / changed (not targeted)); the layout numbers of the canvas text per frame (records posted by `layoutFrame` to a local receiver, `--layout <file>`; `--expect-layout` captures once more when none arrived) | judge the frames |
| `scripts/layout_lint.mjs` | canvas text boxes per frame (caption, label, card, hero): outside the safe area, over the hero by more than 10 %, a label or card over the hero's lowest tenth, hero contrast read from its outline too, under the minimum size, caption over a label, more kinds of text at once than `--max-text-layers` (2 for the object-studio thesis), each with its time; run by `strips.mjs` into `index.md`, and by the gate on fixtures | judge text placement by eye alone, read a missing record as "no faults" |
| `scripts/find_media.mjs` | free licensed media search (Openverse, Commons, bundled SFX; `--type model`: Poly Haven, Smithsonian Open Access 3D, NASA 3D Resources, Kenney, with triangles, stated size and a contact sheet): previews, then `--take` copies one (a glTF with its textures) and writes its `ASSETS.json` row from the source's own licence | use NC / ND media, need a key, report a failed source as "nothing found" |
| `scripts/state.mjs`, `check_assets.mjs` | gate approvals (stale on change; Gate 1 also hashes `model.mjs` and `numbers.json`; Gate 3 refuses without `review/benchmark.md` or with a row > 1 point behind), `next` prints each step's reading list from one table (`--sub`: a subagent's own sections, read in its context, never the main agent's) and `reading` checks it (headings, 8 KB per section, 60 KB for Steps 0–8), licence gate + `CREDITS.md`; reads the engine build's `.engine.json` so engine files are never hand-listed, checks joined licences (`A AND B`, `A + B`, `A, B` ...) part by part, a CC BY part anywhere gets its credit | approve on the user's behalf outside autonomous mode |
| `scripts/scaffold.mjs` | the film's frame written by code: the engine into `assets/` (with `.engine.json` licences), the host, one template per group, the shared isometric world; `--music <mood>` copies a bed | write scene content |
| `scripts/pad_voice.mjs` | room around the voice: `audio/voice.wav` with 1.45 s before and 1.35 s after (0.2 s each when `BRIEF.md`'s duration is under 10 s; notes on that line are ignored), every timing file moved to match; the take untouched | edit the take |
| `scripts/silent_take.mjs` | the voice-none "take" (`BRIEF.md` `voice: none`): `audio/beats.json`, `words.json`, `beats.js` and a silent `narration.wav`, timed by reading time (0.3 s a word; a beat holds max(2, 0.3 s a word + 1.2) s) | decide anything a voice would |
| `scripts/captions.mjs` | caption phrases from `narration.txt` and `words.json` into `audio/captions.js`, each `say.txt` word in its written form (`say.mjs`, as the SRT) | write captions by hand, or show a respelling |
| `scripts/series.mjs` | a series kit (look, HUD, captions, voice, rules) saved once and loaded by each video of the series; opt-in | carry anything into a video outside a series |
| `scripts/voice_licences.mjs` | the voice licence table behind `check_assets.mjs --commercial`; a model not in it is unknown, never commercial-OK | guess a licence |
| `scripts/score_run.mjs` | the scorecard of a finished or drafted project, run on each golden brief (`references/evals.md`) after a skill change | judge taste |
| `engine/iso/` | Express's renderer, Canvas 2D with no three.js: `iso.js` (vendored, MIT; every solid inked at its silhouette and creases, boxes bevelled), `build.js` (a world as data: forms, arrays, cutaway skins, focus, meshing gears by tooth ratio, contact shadows, each named part's pin point), `kit.js` (parts) and `templates.js` (whole objects), `figure.js` (a person), `plate.js` (the user's traced photo), `parallax.js` (depth layers), `cinema.js` (keyed camera, one-way orbit, motion blur, the frame finish), group and world templates in `templates/` | know a topic, draw with three.js, move anything without a cue |
| `engine/anatomy/` | the geometry audit `iso_audit.mjs` runs on an Express world (Anatomy, vendored unchanged, MIT; `world.mjs` reads `build()` specs as true shapes) | draw anything |
| `engine/epic/` | the three design languages both lanes use (`languages/`: `isometric-world`, `cutaway`, `blueprint`) and their composition and chart rules (vendored, MIT) | render or animate (HyperFrames renders; motion is the GSAP timeline or the three.js set's function of t) |
| `engine/music/` | three free music beds (CC0 / public domain, `CREDITS.md`), copied into a film by `scaffold.mjs --music` | carry a licence that needs a credit or forbids monetising |
| `engine/three/` | Studio's generic 3D systems (real scale and settling, air jets, granular fills, cutaways, Studio's isometric look (`isoCamera` and `isoFrame` in `camera.js`: true isometric, pan and zoom only; `isoLook`, `blueprintLook`, `inkLines` and `isoStudio` in `studio.js`: three tones per face or linework, no lights), the perspective render rig (`studio.js`) behind the `object-studio` look (`objectStudio.js`: the real object on a light grey sweep, x-ray, editorial cards; `editorial.js` is the overlay layer both lanes use), captions, pinned labels and the engineering text band in `type.js`, quantities shown in the world (flow arrows and tile fills in `quantity.js`, range cards in `type.js`), dimension lines drawn on the frame over the parts (`quantity.js`), circuits and signals (current flow in the waveform's shape, heat glow, lamps and arcs in `circuit.js`, live instruments in `instruments.js`), fields (field lines seeded by flux, filings and compasses in `fields.js`) and optics (rays by Snell and Fresnel through lenses, mirrors and prisms with dispersion, the focus reported, shafts and caustics in `optics.js`), camera stations and attention by ghosting, and `shots.js`, the runner that plays a film's shot list: times from beats, no overshoot, labels on the frame), each with a self-check; ready pieces in `examples/` | know a scene, a topic or a list of objects |
| `engine/blender/` | Studio's precision lane: a hero asset read from the user's 2D pictures into a parts sheet and modelled once by a Blender Python script (`references/hero-asset.md`), then reused: `parts.py` (a generic part library in real units: mesh builder and path helpers, axial fan, motor, cuttable housing, pipe, wires, fasteners; a part a film needs is added there, generic) and `templates/hero.clip.tpl.html` (the motion recipe as data); each assembly lives in the owner's `<videos>/library/hero/<name>/`, outside the skill; Blender is a tool on the machine, never shipped | primitives for a hero seen close; reference pixels projected or baked |
| `engine/blender/measure.py` | the hero's measured acceptance: a flat object-ID pass per hero shot, key and state at the film's lens, readable instances, occlusion (soft foreground at half), section-cap share, state move and base-colour contrast, a phi with its history (a stall stops the loop) and the explore class of a failing row (legal, decision, model) |
| fresh-eyes reviewer (`references/review.md`) | a defect list from a subagent with no build history, on the strongest model, sheets and crops first and full-res only for a doubt; a sound-off quiz answered from the strips alone | fix anything |
| benchmark reviewer (`references/review.md` "Benchmark review") | Gate 3: a fresh subagent scores the style frames against the reference board (or, with no reference video, the look's rules in `looks.md` as a text rubric) on seven rows, text only; a row > 1 point behind is a fix before the build | build anything, open the images in the main context |
| builder subagents (`references/look-build.md` "Parallel build", `review.md` §3) | all of the film's scene code (the Step 5 style frames stay with the main agent): the pilot (a film under 3 groups whole; Express: no pilot, every group at once), each shot group, the assembly, each QC fix round; a report of at most 15 lines | approve a gate, review their own work |
| HyperFrames skills | scene building, preview, render | pick the script or voice |
| Project files | all state (one video = one session) | live in the skill repo |

## Design decisions

- **State in files, not chat.** Resume from `BRIEF.md` + last lines of `PRODUCTION.md`; keeps sessions short and cheap.
- **Lean `SKILL.md`, details in `references/`.** Each step names the one § it needs.
- **Measure, don't guess.** Duration, cost, stillness and loudness come from script output, never from memory.
- **Secrets stay in the shell.** The ElevenLabs key is read from `ELEVENLABS_API_KEY`, never printed or written to a project file.
- **Two lanes.** Express (the default) is one Canvas 2D builder pass in 20 minutes of work; Studio is the precision lane: the same three languages in three.js and a hero modelled once from 2D pictures. The look (`isometric-world` or `object-studio`) is chosen apart from the lane; its recommended value follows the lane: `object-studio` for Express, `isometric-world` for Studio.
- **The engines grow by behaviours, not objects.** Any motion is a pure function of t from its cause (a ratio, a law, a cue): no physics engine, no bake. A new law (a liquid level, an orbit, an ion in a field) is built generic, self-checked, proved in a render, then added; a hero seen close is modelled once in `engine/blender`, never rebuilt from boxes.
- **Engines are swappable.** Both voice engines produce the same outputs, so later steps don't care which one ran.

See [`references/lessons.md`](../references/lessons.md) for the real failures that shaped each rule.
