# Changelog

All notable changes to this skill are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For a skill,
that reads as:

| Bump | When |
|---|---|
| **MAJOR** | a step, gate or project file is removed or renamed — an in-flight video would break |
| **MINOR** | a new step, option, look, engine or script flag |
| **PATCH** | a fix, a clarification, a tightened rule |

<details>
<summary><b>How a release is cut</b></summary>

<br/>

1. Move the `Unreleased` items into a new `## [x.y.z] - YYYY-MM-DD` section and add its link at the bottom.
2. Do it on a `release/vx.y.z` branch with the README's clone example pinned, and merge its PR (`main` is
   protected). Then tag the merged commit and push:
   ```bash
   git tag -a vx.y.z -m "vx.y.z" origin/main && git push origin vx.y.z
   ```
3. The `release` workflow verifies the scripts, the `SKILL.md` front-matter and that this file
   has a section for the tag — then publishes the GitHub release with generated notes.
   A tag with a suffix (`v1.1.0-rc.1`) is published as a pre-release.

</details>

## [Unreleased]

### Added

- **Review strips**: `scripts/strips.mjs` reads the storyboard's shot table (or `beats.json`), captures N stills per
  shot in one snapshot call and writes numbered sheets (one row per shot) and an index of frame → time → shot.
  `qc.md` and the fresh-eyes review use it instead of hand-tiled contact sheets; `tests/strips.mjs` checks it in
  the gate.
- **Skill feedback in the hand-off**: the agent ends `PRODUCTION.md` with a `## Skill feedback` section of generic
  traps, their cost and a suggested rule, to report upstream; it never edits the installed skill.
- Brief Call 3 asks the voice when more than one sensible choice exists (saved profiles, a designed narrator); the
  recommendation follows the audience (public or brand channel → designed narrator; personal channel → the user's
  own voice).
- `tts_timestamps.mjs --save-profile` takes a `--sample` audition as it is: over 20 s with its `words.json` beside it,
  it is cut at the last word end ≤ 15 s and those words become the ref text (no timing, or a `--ref-text` of its own:
  the 20 s error stays). `tests/save-profile.mjs` in the merge gate.
- `tests/voice-licence.mjs` in the merge gate: the take's model against a mock VoiceStudio, and the narration row
  against the take's recorded model on fixture projects.
- **Cutaway (section view)**: `engine/three/cutaway.js` cuts an assembly open with one clipping plane on every
  material under a root (cloned, so a shared material outside stays whole), parts added later included. Solid parts get
  a stencil cap, all caps on one transform and pulled ahead by `polygonOffset`, so none z-fights a face on the plane;
  a part flagged `userData.cut = { shell: metres }` shows its wall ring instead of a disc, and `userData.cut = false`
  keeps a part whole. `on(t)`, `off(t)` and `set(offset, t)` switch or slide the cut by time without swapping planes
  (no shader recompile). A set's later edits to its own material (glow, fade, colour, map, shader uniforms) reach the
  cut part, custom keys included (a swap points the clone at the new texture or its own copy of the new colour and
  never writes into the shared old one), and the cap
  group is never put under the root (not while the root has no parent). It needs a renderer with
  a stencil buffer. `examples/flask.js` is the ready piece, and the
  self-check asserts the plane on every part (a late one too), the caps' settings and the shell's ring.
  Documented in `engine/three/README.md`, `looks.md` and `camera-motion.md`.
- **Steam and smoke on a light set**: `wind.js` `draught()` is room air (~0.1 m/s in slow eddies); `particles.js`
  takes a `light` direction and a `shade` (a dense puff's side away from the light greys) and has
  `contrast(kind, ground)` against `READABLE`; the rule in `looks.md` and `camera-motion.md` §5 (a darker ground or a
  side or back light, and moving air); the self-check asserts it.
- **Granular fills**: `engine/three/grains.js` `grains()` fills a container's top with instanced grains at real size
  in jittered layers and, cut, shows whole grains at the cut face, over a body wearing the new `grains` surface;
  presets for lentils, coffee, rice, oats, sugar, sand and gravel; `examples/canister.js`; the rule in `looks.md` (a
  bulk of small things shows its grains; a smooth slab reads as foam or gravel); the self-check asserts counts, real
  size, the kept side and separate grains. The fill's cut is the cutaway's plane in world space (any normal, a
  rotated container too) and follows its timeline (`on`, `off`, `set`) through a `userData.cutTo` hook that
  `cutaway()` calls; a fill shallower than its grains stays above the floor; `max` capping is asserted.

### Changed

- Steam and smoke presets shade their side away from the light by default (`shade` 0.4 and 0.45; `shade: 0` keeps
  the old flat look).

- **Unattended runs: Realism, Reality and Clarity P1s block the final** like a P0 until a round fixed them or two
  rounds failed; a Realism or Reality fail stays a P0 that never ships; cosmetic P1s may ship. The hand-off lists every open P1 and why it stays (`SKILL.md`, `qc.md`,
  `review.md`). `lessons.md` gains the `font:` shorthand and scene-id lessons.

### Fixed

- **The final render ran at 30 fps, not the brief's 24**: `hyperframes render` defaults to 30 fps and the Step 8 and
  style-frame sample commands passed no `--fps`. Every render command now passes the brief's fps (`qc.md`,
  `look-build.md`, `SKILL.md`, `lessons.md`).
- `tts_timestamps.mjs` no longer defaults VoiceStudio to OmniVoice: without `--model` it speaks with VoiceStudio's
  active TTS model (the one preflight reports), prints `Model : <name> — <licence>` and records it; an unreadable
  active model stops the run (rerun or pass `--model`), never a silent default. Dialogue style now reaches VoxCPM2 as
  its `description`. The ElevenLabs take records the plan tier.
- `check_assets.mjs` checks the narration's `ASSETS.json` row against the model its take recorded
  (`audio/<name>.response.json`): a non-commercial voice (OmniVoice, the ElevenLabs free tier; one table in
  `scripts/voice_licences.mjs`) listed under a commercial licence is a problem, and an unreadable response file fails
  closed. A voice the table cannot identify (a model not in it, an ElevenLabs plan that could not be read, a take
  made before the plan was recorded) is a `WARN` naming the response file, to check the model card / plan; never
  read as commercial-OK. A non-commercial take with no `ASSETS.json` row of its name is a `WARN` too. A commercial
  row in that table names who spoke (a model, a plan tier, a stated origin), never the engine alone, and a field the
  take did not record never matches; the table refuses to load otherwise.
- `tts_timestamps.mjs --from-audio` no longer makes every file a commercial-OK "own recording": the script cannot tell
  a human recording from TTS output. `--own-recording` states it (a recording the user may use); without it the take
  keeps the take it was cut from (an OmniVoice take cut and retimed stays CC-BY-NC), and an origin it cannot trace is
  a `WARN` in `check_assets.mjs`.
- `tts_timestamps.mjs --api-url` points the ElevenLabs calls at another base URL (the tests use a mock).
- Brief: a non-commercial voice is stated in Call 0 and at Gate 2 even when the user said not to ask.

## [1.4.0] - 2026-10-26

### Added

- **Islands baked in parallel**: `bakeCached(…, { islands: [[a, b], [c]] })` bakes groups of bodies that never touch
  for the whole shot as separate worlds, each in a worker (Web Worker in a page, `worker_threads` in Node, in the
  calling thread when none starts) beside the main island, which alone keeps `onStep`, kinematic paths, `track` and
  `keep`. The result and the cache file are the same as a single world's (the self-check compares them exactly); a
  body of one island meeting another's (in the pre-roll too, where loose pieces settle; between two steps too, but not along a script's teleport; a body moving over 10 mm in one step (about 4.8 m/s, a free fall of about 1.2 m) refuses the island bake, which is for sets that settle slowly; judged on every collider a body
  has, not only on what is drawn, and a script cannot grow, move or skin a collider while islands bake), a script reaching a declared
  body (its methods, a world query such as `castRay` or `contactPairsWith`, a lookup of its handle), a kinematic body,
  a joint across islands or one impact name on bodies of two islands throw instead of baking something different. While islands are declared, `onStep`,
  `track` and `keep` read main-island bodies through their own methods; world-wide queries refuse. They also cannot
  change what every island world shares with the main one (gravity, solver settings, fixed bodies and static
  colliders, joints inside an island, an extra world step): those calls throw, a change that slips past is caught
  after the bake, and a refused bake is never saved. The cache key ignores the lazily loaded bake worker, so a
  page that spawned one hashes the next sim like a page that did not.

- **A real merge gate**: `scripts/gate.sh` (`--fast`: syntax, `SKILL.md` front-matter, diagrams; full: also the
  engine build and self-check and `tests/preflight-mock.mjs`, preflight against a mock VoiceStudio in 29 cases).
  CI runs the full gate on every push and pull request.
- **`CLAUDE.md`**: the rules for changing the skill (generic, docs in step, physical motion, never "unknown" read
  as "missing", installs only with consent, personal account, no AI attribution).

### Changed

- The step loop of a bake moved from `physics.js` to `bakecore.js` (with `pool.js` and `bake-worker.js` for the
  workers). Same behaviour; the engine sources change, so every cached bake is computed once more.
- `main` is protected: every change, a release included, goes in through a PR (`CLAUDE.md`, the release steps above).

## [1.3.0] - 2026-10-26

### Added

- **VoiceStudio states in preflight**, each with its fix: `STOPPED` (macOS app installed, closed; "never launched"
  when the first launch would download its runtime), `BUSY` (running but not answering, or restarting its backend:
  never restarted), `DOWN` (Linux/Windows or another local port), `UNREACHABLE` (a remote `--vs-url`), `CONFLICT`
  (something else on the port), and an Intel-Mac `MISSING` that points to a remote backend. Apple silicon is read
  from the hardware, so an x64 Node under Rosetta still counts. A remote backend that refuses reads (API key or
  loopback-only settings) says so instead of "busy".
- **`preflight.mjs --start`** opens a stopped app, waits ≤ 60 s and checks VoiceStudio only, so the run stays inside
  a default 120 s tool timeout and the agent never writes its own polling loop. `--vs-url=<url>` works too.
- **Saved voices in preflight**: a `Voices` line lists the VoiceStudio profiles (quoted name = id); a voice named in
  the request is matched there and saved as `voice` in `BRIEF.md`, never searched for in earlier videos.
- **Brief Call 0**: setup choices preflight leaves (HyperFrames skills, a free stock-footage key, the voice engine,
  which moved here from Call 2) are asked before Call 1, so they have an answer path and the Realism recommendation
  knows its sources.
- **Bake once, replay everywhere**: `physics.bakeCached()` stores a bake in `assets/bake/<hash>.bin` (the hash covers
  every collider and body, solver settings, onStep, kinematic paths, holds, the set's modules and the narration timing) and
  `engine/three/bake.mjs <project>` writes it once; snapshots, the preview and every render worker replay it instead
  of simulating again on each page load. `track` keeps per-step values onStep computed (`baked.at(name, t)`).
- **`sim.hold(body, t)`** keeps a body out of the solver until its cue, instead of teleporting it every step.
- **Working-speed rules**: verification loops in a subagent, `/compact` offered at Gates 3 and 4, Edit over
  whole-file Write, a review round's fixes then one re-snapshot, estimates from measured times.

### Changed

- **Cheaper bakes, same result**: poses are stored only while a body moves (float32, so a live bake and its replay
  match), and a resting body's contacts are audited every 10 ms instead of every step (moving bodies still every
  step, all at the last step). Solver settings are unchanged.

### Fixed

- **`tts_timestamps.mjs` sent VoiceStudio a profile's name**, which it does not match, so the default voice spoke
  with no error; names now resolve to their id, and an unknown voice stops the run.
- **Preflight read an installed VoxCPM2 as `MISSING`**: VoiceStudio selects some engines by bare name (`voxcpm2`),
  not repo id; a bare name now matches the repo's own name, case aside, and the row prints the repo id.

- **Stale generator promises**: Principle 6 and the Brief's Angle and Realism options no longer offer generated
  stills or clips as a default Hyperreal source, nor do look C, the storyboard checks or the A-roll list; they
  are a paid, on-request exception. The brief's "generators get
  machine anatomy wrong" reason for asking for machine photos is gone.
- **Unreadable read as missing**: a timed-out, failed or empty `/models`, profile or voices read is a `WARN … rerun`,
  never `MISSING … install` or "no saved profile".
- **Filtered preflight reads**: the `Voice:` summary repeats the VoiceStudio fix, the rows to fix, a missing AudioSeal
  watermark and the CC-BY-NC caveat.
- **hyperframes `MISSING` when Docker was off**: Docker only serves `render --docker`, which dalang never uses.
- **Hyperreal with no footage source**: with no stock key and no user material, the Realism option names where
  the moving subject comes from (Commons, three.js), and autonomous mode picks look A only when those cover it.
- `--vs-url` without a URL exits with a message instead of a crash; a rejected ElevenLabs key says why.

### Removed

- **Local image and music generators:** `mflux` (Z-Image Turbo, SeedVR2) and ACE-Step
  (`scripts/music_acestep.py`) are gone from the skill. Stills, footage and music come from real licensed
  sources and three.js; a generated still only on request through a paid service.

## [1.2.0] - 2026-10-25

### Added

- **Nature in the engine**: one shared air field with a breeze (log-law profile, gusts carried downwind) and fans;
  trees, grass and kit plants bending by drag-driven oscillators; steam, smoke, dust and rain particles in the air
  (rain at terminal speed, its impacts ringing on water); wind-driven water (fetch-limited waves, capillary-gravity
  speeds); each with self-checks against its physics.
- **three.js engine** (`engine/three/`): the proven modules as a generic library — real scale, procedural
  surfaces, lowest-point settling, Rapier physics with reports and audit, a caster-chair rig and loose soft props,
  PBD cloth, a fan's air jet with obstacles and leaf sway, shell fur, American-Japandi props, the frame finish —
  with a pinned bundle build (`build.mjs`) and a self-check that fails on the traps met so far.
- **Real scale and interior direction** (`looks.md`, `brief.md`): metres per unit measured from known objects,
  props modelled in metres, physics in real units; a `condition` (lived-in by default; worn only when the topic is
  about age) and an `interior` style (American-Japandi by default) recorded in the brief; soft things stuffed and
  dented, loose cushions settled by simulation, every prop resting on its own lowest points.
- **True shapes and surfaces in 3D** (`looks.md`): soft and organic kit models subdivided (Loop, hard furniture
  kept crisp); procedural triplanar surfaces with no UVs — worn paint flaking off plaster, woven cloth with sheen,
  cotton pile, fine wood grain, micro-smudges; animals swept from their anatomy at real size and given shell fur
  combed along the body; lamps that light the room with inverse-square falloff (drum-shade cones, a glowing
  screen); displays fitted to the model's own screen face.
- **Air and cloth** (`camera-motion.md` §5): a fan is a turbulent round jet that sweeps with its oscillating head
  and is blocked by what stands in its way; curtains are simulated cloth moved by its drag; the fan is heard.
- **Emotion-driven cinematography** (`camera-motion.md` §12): an emotion → size, angle, lens, focus, move,
  light ratio, colour, shutter and frame-ratio table; every shot names its emotion and a motivation for each choice;
  the SPEC rulebook with logged rule breaks at turning points; short-side motivated light with Kelvin → three.js
  colours; headroom, negative space and rhyming final image; frame-ratio masks for 16:9; finishing order with
  halation; approach presets from award-winning indie films; waveform, vectorscope and cut-sheet checks in Step 7.
- **Real physics in 3D**: objects that touch, fall or collide are simulated with Rapier and baked per step
  (deterministic, seekable; verified identical across two renders); the whole set collides, colliders match the
  drawn shapes (round cuboids, hulls, per-leg hulls, caster balls), pushed things are dynamic with real mass and
  rolling resistance, jointed parts are joints; a stiff solver, a settling pre-roll and a per-bake report
  (penetration, floating, still moving, drift); impacts drive sound and reactions — each sound placed on its bake
  time, a rolling sound following the speed, contact gains on a perceptual curve, verified by onset rise and a
  null test against an offline mix; motion blur from the bake.
  Resting props are dropped onto their real support and audited; rugs have thickness, cables lie on the floor
  and end in sockets. Ambient motion at its real amount. A Craft review test checks contacts, causes and floating props.
- **Set dressing**: every 3D set is dressed with the small true-to-life things that would be there, plus a few small
  life motions; it decides whether a stylized set reads as real or as a toy. A `looks.md` recipe (CC0 kits
  recoloured into the palette, creased normals, real-leaf plants, canvas textures, a light probe, ≥ 2 cm detail rule)
  and a Realism review test.
- `state.mjs log "<step> | <output> | <problems>"` writes a `PRODUCTION.md` line whose start is the previous
  line's end, so steps get real durations (`score_run.mjs` `logged_minutes` was 0) and ETAs can be given.
- `scripts/key_white.py`: cut a product generated on a white light box (flood-fill key, `--holes` for a handle).
- **Realism is a Step 1 choice**: hyperreal (looks like real footage) or stylized (a premium animated film: easy to
  watch, reads at a glance, renders in seconds), explained with a per-topic preview. Stylized subjects are drawn on
  purpose but still pass the Reality check against a real reference. New look I (toon explainer); look C is now the studio diorama (muted palette, one accent, grey void, three-quarter view), the default for stylized.
- `looks.md` three.js recipes, verified by render: hyperreal (real HDRI rotated so a softbox edge sweeps the
  hero, soft key shadow and rim, N8AO, gentle DOF, AgX, per-surface finishes) stylized toon (3-step ramp,
  inverted-hull ink outline on smoothed normals, no tone mapping) and studio diorama (an approximated bake: RoomEnvironment
  light, rounded matte parts, shadow-catcher ground, N8AO, neutral tone mapping; candy pastels read cheap). Path tracing was unreliable in the capture browser.
- **Motion is three.js, not a video model:** local image-to-video (LTX-2, Wan) is dropped from the default path —
  too heavy for a laptop; a subject that must act and has no footage is built in three.js. A generated clip only
  as a paid exception the user asks for.

### Changed

- **Subjects beyond the engine** (`SKILL.md`, `looks.md`, `camera-motion.md` §5, `engine/three/README.md`): the
  engine is a toolbox, not the limit. Any subject moves by its own law (orbits, ions drifting and diffusing, heat,
  rhythms) with real constants from a cited source, a scale changed on purpose and shown, and a self-check; built
  generic, then brought back to the engine. Set dressing, scale and sound examples cover more than rooms.
- **Engine defaults assume no kit or style:** `makeKit` dresses materials only from the `palette` and `kinds` a set
  passes (`kits.furniture`, `palettes.americanJapandi`); unmapped materials stay as they came. Placement
  in `camera-motion.md` §5 now matches the engine's lowest-points `settle()`. The place's gravity is an option
  (`makeKit({ gravity })`: the Moon, orbit); every engine tolerance is in metres, so a set in centimetres or
  kilometres audits and settles correctly (self-checked);
  `model(..., { crease: false })` keeps a scan's own normals; plaster, grain and cloth defaults no longer assume a
  worn room, a film look or a 1 m unit.
- **Engine core is behaviours only:** the pieces from earlier sets (caster chair, fan, cat, American-Japandi
  interior pieces and kit presets) moved to `engine/three/examples/`; the fan's air became a generic `jet()` for
  any outlet (self-checked: 1/x decay, obstacles shadow it). Objects are never declared: any model is a body from
  its own mesh and its looked-up mass and friction.
- **Generality pass on the docs:** scale changes for unseeable subjects are the fewest needed, each shown; set
  dressing and the Realism review judge the true context at its real density (space nearly empty, a cell
  crowded), with type and data shots exempt; D and H fit either realism and lead for ideas with no physical
  subject; look C sits on a seamless sweep (no void contradiction); test-set numbers became looked-up examples;
  `condition` covers any made thing; a fifth golden eval brief for a subject outside the engine.

- **No image or music generator in the default path.** `mflux` stills and ACE-Step music are heavy local
  installs that load a laptop; they run only when the user asks. Music is a licensed free track (Openverse
  CC0 / CC BY, no key, then Commons), looped and faded to the film's length; stills come from real sources and
  three.js. Preflight no longer probes either generator and asks for a free stock-video key instead.

### Fixed

- Queued heavy jobs deadlocked on `pgrep -f` matching their own shell; SKILL.md now chains them or waits on a PID.
- Reality check names where the action happens (a generated action landed on the wrong part); `tts_timestamps.mjs` explains the
  clone-profile 500 and `--save-profile` refuses references over 20 s.
- Gate waits queue music and all stills; saved voice profiles are offered before auditioning; SFX sources named;
  messages give the clock time of the next gate. ([#2](https://github.com/sandalkuilang/dalang/issues/2))
- **No more slideshows.** The subject acts in every shot; a drifting still is a ≤ 1.5 s breath, ≤ 15 % of the
  runtime (the old rule let a ≥ 30 px/s drift count as motion, and a film of drifting stills passed at 0.8 %
  "still"). Storyboard gains a "Subject action (+ source)" column, a shot-count floor from the energy and a
  mechanism shot for every "why"; the Gate 3 sample includes the hardest action shot; reviewer Action test (P0).
- **Browser isolation:** `hyperframes preview` always with `--no-open` (it opened the user's own Chrome); the Studio
  URL opens only in Claude's isolated built-in browser, never the system browser or Claude in Chrome.
- **Cinematography with real cameras** (`camera-motion.md` §10): A-roll (the explanation) and B-roll (short cinematic
  shots with a real move) in a set pattern; every perceptible move from footage, a 3D rig camera (focal length,
  damped look-at, bokeh, sub-frame motion blur) or a generated clip, never CSS on a still; 24 fps / 180° for a
  film look; real slow motion and speed ramps from high-fps sources; one wow shot on the impact; a CAMERA line in SPEC.
- **Cinematographer's toolbox** (`camera-motion.md` §11): light (contrast ratios, colour-temperature contrast,
  practicals, light as the event), lens (wide close, telephoto, macro/probe, split diopter, tilt-shift, focus as
  narration), movement (reveal, push-through, crane, tracking, orbit, oner, motion-control repeat, frozen moment),
  time (slow motion, timelapse, freeze-and-annotate), editing (cross-cutting, collision montage, graphic match,
  invisible cut) and explainer signatures (scale journey, x-ray shell, cutaway, exploded view, world-space labels).
  Each film picks a 6–10 technique palette on SPEC's CAMERA line.
- The 3D rig recipes in `camera-motion.md` §10 are verified by a render on 16 GB (orbit, x-ray shell, push-through,
  motion-control repeat, freeze-and-annotate, speed ramp), with timings and the three.js / canvas-font gotchas.
- Preflight reports a free stock-video key (Pexels / Pixabay) for real motion footage; local LTX-2 image-to-video
  is listed as an optional install.
- Asset pass (`review.md`): a fresh reviewer compares every generated still with its real reference before Gate 3
  and before blocking, so Reality fails cost one regeneration instead of a rebuild and re-render.
- Build scaffold: plate drift, scene-prefixed ids and overlapping whip pans from the first draft (each cost a
  re-render); `check`, snapshots and renders never run beside a model job.
- Machines and mechanisms start from the user's photos or Commons stills, not the generator (generated machines
  put parts in impossible places); the Reality check compares against a downloaded reference photo.

## [1.1.0] - 2026-10-25

### Added

- **Router SKILL.md** (≤ 10 KB, survives auto-compaction intact) with the step details split into
  `references/brief.md`, `script-voice.md`, `look-build.md`, `qc.md`; looks moved to `looks.md`.
- **Fresh-eyes reviewer** (`references/review.md`) — a new subagent finds P0/P1/P2 defects into
  `QC-REVIEW.md` before Gate 4; in autonomous mode its P0 list replaces the human eye.
- **Moving sample at Gate 3** — the hook scene rendered with its narration next to the style frames.
- **`references/camera-motion.md`** — film camera grammar (size, angle and lens by the shot's job,
  motivated moves, axis and eyelines, Murch's cutting order, rhythm staircase), story shape and
  faceless staging, physical timing (springs, gravity, mass, √distance, motion blur), compositing
  (levels, light wrap, occlusion, 2.5D from one photo), design in time, and photoreal still prompts.
- Storyboard columns for the shot's job, size · angle · lens, camera reason and J/L; a shot-grammar
  check at Gate 3; MOTION and ANCHORS lines in `SPEC.md`; rubric rows Consistency and Camera.
- **Forced alignment** (`scripts/align.py`) — word timing against the known script with Apache-2.0
  CTC models; on by default when a model for the language is installed, else transcript timing.
  Words get a `score`; low-score runs are flagged as "the voice may not say the script".
- `scripts/fill_times.mjs` (`{{beat}}` expressions in the template), `state.mjs` (gate approvals,
  stale on change), `qc.mjs` (black frames, clipping, silences, codec and colour tags),
  `timing_lint.mjs` (cuts inside words, flicker scenes), `check_assets.mjs` (licence gate,
  `CREDITS.md`), `score_run.mjs` + `references/evals.md` (golden briefs and a scorecard).
- `audio/narration.srt` sidecar subtitles from the word timing.
- Free local generators, measured on a 16 GB M5: `mflux` + Z-Image Turbo (`--low-ram`, ~100 s per
  1024² still), SeedVR2 upscale (~110 s for 2×), and `scripts/music_acestep.py` for ACE-Step 1.5
  (~8 min per 30 s); preflight detects them properly (`mflux-generate-z-image-turbo --help`, `ACESTEP_DIR`).
- VoiceStudio: `--steps` (default 32), `--seed` (default 42), `--save-profile` / `--ref` cloning.
- VoxCPM2 (Apache-2.0) as the commercial-OK voice: `--model voxcpm2` sends `--instructions` as its
  `description` and ~120-character chunks (it runs ~22× slower than real time on a 16 GB Mac, and
  VoiceStudio abandons requests over 300 s of compute).

### Changed

- **Free tools by default**: VoiceStudio is the default engine; ElevenLabs and HeyGen are labelled
  paid and used only on request; music offers ACE-Step 1.5 (MIT), never MusicGen; stills via `mflux`
  with Apache-2.0 models only.
- **Hyperreal subject in every look**; people only as real or generated footage, never puppets.
- Sync means the value is readable on the word (lead / sync / wait per element).
- Banned list extended with the dated 2026 tells (text scramble, RGB split, liquid blobs, isometric,
  white flash, AI-gloss, …); one "wow" per film.
- Scripts are written for the ear (spoken register, round numbers, at most one exact number per sentence).

### Fixed

- Style frames have one home (`style-frames/src/`, `look-build.md` §5); the hook sample is the one
  allowed high-quality render before Gate 4.
- Step 7 no longer edits `SPEC.md` (it made Gate 3 stale and blocked Gate 4); defaults go to `PRODUCTION.md`.
- Every file in `assets/` (narration, music, SFX too) goes into `ASSETS.json`; `check_assets.mjs` no
  longer reads "Licence" as non-commercial, fails ND licences, and survives entries without `file`.
- `tts_timestamps.mjs`: `--from-response` reads the language from the response (alignment no longer
  skipped silently); `--sample` never cuts inside a `{beat}`; punctuation-only tokens are not words;
  `[tag]Word` keeps the word; SRT cues never end before they start; SRT for dialogue too; audio paths
  with spaces; sample names hash the full instructions.
- `fill_times.mjs`: untimed beats fail instead of becoming 0; beat names like `new` no longer break it.
- `align.py` keeps accented letters the model knows (ñ, ä, й).
- `score_run.mjs`: a crashed check reads `error`, not 0; open P0/P1 only; logged minutes as a union; no
  side effects. `state.mjs`: every earlier gate must be approved; `check` without a gate. `stillness.mjs`
  subtracts `--allow` ranges. `qc.mjs` flags black over 1 s at the start or end. `loudness.mjs` refuses
  `--fix` onto its own input. `timing_lint.mjs` reads single-quoted attributes. `preflight.mjs`: aligner
  row checks the model and Python; "Voice: ready" needs TTS and ASR.
- Docs: drift vs stillness, cut density and push-in numbers agree across files; HeyGen is paid everywhere;
  the arc and beat map live in Step 3; fps stored in `BRIEF.md`; `approve 4 --by`; ~3 KB of duplicated or
  dead text removed.
- `loudness.mjs --fix` overshooting true peak (−0.5 dB headroom, honest "still off" message).
- `stillness.mjs` lists the longest still stretches on a fail.
- Estimated word timings are marked `est: true` and beats on them are warned.
- Audition samples no longer overwrite each other (name per voice, style and seed).

## [1.0.0] - 2026-10-24

First public release. The pipeline is stable: the steps, the four gates and the project
file layout are what every later version is measured against.

### Added

- **The skill** (`SKILL.md`) — steps 0–8 with four approval gates, the "words first,
  pictures last" rule, autonomous mode, and a token budget for long runs.
- **Voice + per-word timing** (`scripts/tts_timestamps.mjs`) — ElevenLabs or local
  VoiceStudio behind one interface; emits `words.json`, `beats.json` and `beats.js` so
  every animation time references `BEATS.<name>.start` instead of a hard-coded second.
  Supports dialogue (one voice per character) and `--from-audio` for the user's own
  recording, transcribed for timing at zero cost.
- **Environment preflight** (`scripts/preflight.mjs`) — Node, ffmpeg, HyperFrames, both
  voice engines (model state, tier, quota) and image/music sources in one ~3 s call.
  Never prints secrets.
- **Measured QC** — `scripts/stillness.mjs` (the film is not secretly a slideshow) and
  `scripts/loudness.mjs` (LUFS / true peak, with `--fix`).
- **Reference measuring** (`scripts/measure_reference.sh` + `references/measure-reference.md`)
  — borrow a video's rhythm as numbers, never its material.
- **Craft references** — `visual-direction.md` (looks, realism ladder, cinematography,
  review rubric), `craft-rules.md`, `voice.md`, and `lessons.md`, each loaded one section
  at a time by the step that needs it.
- **Docs** — README, [workflow](docs/workflow.md) and [architecture](docs/architecture.md)
  with diagrams.
- **CI** — syntax check on every script and `SKILL.md` front-matter validation on each
  push and pull request.

[Unreleased]: https://github.com/sandalkuilang/dalang/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/sandalkuilang/dalang/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/sandalkuilang/dalang/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/sandalkuilang/dalang/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sandalkuilang/dalang/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sandalkuilang/dalang/releases/tag/v1.0.0
