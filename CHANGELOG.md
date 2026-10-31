# Changelog

All notable changes to this skill are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). For a skill,
that reads as:

| Bump | When | Section in Unreleased |
|---|---|---|
| **MAJOR** | a very large overhaul of the design or the algorithms; rare, the owner's call (`scripts/release.sh --major`); the entry says how to move | `### Redesign` |
| **MINOR** | a medium-to-large overhaul: a step, an engine or a mode rebuilt | `### Rework` |
| **PATCH** | everything else, most releases: bug fixes, improvements, new features, rules, the agent's workflow, internal scripts, docs, removals | `### Added`, `### Changed`, `### Fixed`, `### Removed` |

The bump is never picked by hand: `scripts/release.sh` reads it from the sections above (`next_version.mjs`). The size of
the change sets it, not its kind: a new feature is a PATCH. A release may come whenever there is something in `Unreleased`.
Published versions are never re-tagged.

<details>
<summary><b>How a release is cut</b></summary>

<br/>

1. `scripts/release.sh` cuts it in one go, its version from `Unreleased`: a `release/vx.y.z` branch from `origin/main` with `Unreleased`
   moved into `## [x.y.z] - YYYY-MM-DD`, its link at the bottom and `.claude-plugin/plugin.json`'s version set, a PR merged at
   once, and the tag on the merged commit. Nothing waits on CI; it still runs on `main`.
2. When the release changes how films look, first run `node scripts/golden.mjs --version x.y.z` and commit
   `evals/golden/x.y.z/` (exit 3 blocks the release until explained).
3. The `release` workflow verifies the scripts, the `SKILL.md` front-matter and that this file
   has a section for the tag — then publishes the GitHub release with generated notes.
   A tag with a suffix (`v1.1.0-rc.1`) is published as a pre-release.

</details>

## [Unreleased]

## [4.5.6] - 2026-10-31

### Fixed

- **A final render no longer fails on the layout post** (`engine/three/type.js`, new `engine/three/layout_on.js`,
  `scripts/strips.mjs`, `scripts/express.mjs`). `layoutFrame` posted every frame's boxes to 127.0.0.1:47614 whether or
  not a receiver listened, so `hyperframes check` in `express.mjs final` failed on `request_failed` and agents bypassed
  the gate with a hand-run render. The page now posts only while `assets/layout_on.js` says true, which `strips.mjs`
  sets for its own capture and puts back after; `final` turns off a flag a killed capture left on.

### Changed

- **The DALANG version is shown when the skill runs** (`scripts/state.mjs next`, `SKILL.md`): `next` prints
  `DALANG v<x.y.z>` first, from `.claude-plugin/plugin.json`, and the agent names it in its first reply, so the user
  sees which release a film was made with.
- **The script is sized to the voice that reads it** (`scripts/tts_timestamps.mjs --pace`, `references/script-voice.md`,
  `references/express.md`). Every take and `--sample` records its words/s per engine, voice and language in
  `~/.config/dalang/pace.json`; `--pace --voice <v> --language <l> --length <s>` prints the median pace and the word
  budget, and the writer uses it before the language's starting pace. A script sized at the starting pace came out
  10–20 % short on a faster voice, and its retake cost a whole take.
- **object-studio hero contrast flags under ΔE* 8, not 12** (`scripts/layout_lint.mjs`, `references/express.md`). Heroes at
  8–12 read plainly on real films while the fix round darkened floors into a vignette to clear 12; under 6 they washed
  out. The planner still aims at 12, and the hint now asks for a darker material before a backdrop.

## [4.5.5] - 2026-10-31

### Changed
- **Measured frames are calibrated on a real Express object-studio film, and assemble fails on them again** (`scripts/express.mjs`,
  `scripts/layout_lint.mjs`, `engine/three/{camera,measure,objectStudio}.js`): the lines that were mostly false are now
  close to zero on that film.
  - The hero box and mask leave out whatever is marked `userData.attend = false` or the new `userData.subject = false` on
    the mesh **or any parent** (before, only the mesh itself: a group never took effect). `subject = false` is for a mount,
    board, wall or floor the film shows whose size is not the hero's. The record carries `hero.parts` (the largest meshes,
    parent chain and projected px) and a flagged hero line names the largest, so a box that is too large is traceable.
  - Contrast is ΔE*ab (hue and chroma count, not lightness alone: a green board on brown wood of one lightness is two
    things); the floor stays 12.
  - A caption's overlap is the share on the hero's own pixels (`over`), not its box; a hero is cut where its pixels reach an
    edge (`edges`), not where its box is clamped by a part off the frame. A hero filling 65 % of one axis is a close-up: it may
    be cut and the caption may sit over it. Labels and cards pinned to a part are not judged against the hero.
  - Assemble's measured-frames lines fail the step and go to their group's fixer again; final still prints open lines for the hand-off.

## [4.5.4] - 2026-10-31

### Changed
- DALANG installs as a Claude Code plugin from its own marketplace (`claude plugin marketplace add sandalkuilang/dalang`,
  then `claude plugin install dalang@dalang`); each version is its own folder, so a film in progress keeps its version
  while the repo moves. Preflight reports a plugin copy's version and WARNs when a clone and the plugin are both
  installed; `release.sh` sets `plugin.json`'s version, and the release workflow refuses a tag that differs.
- **Releases are no longer limited to one a week** (`scripts/next_version.mjs`, `scripts/release.sh`): a release may come
  whenever `Unreleased` has an entry; `--urgent` is gone (it only lifted that limit), the bump still comes from the sections.

### Added
- **Gradient glass bands at the top and bottom** (`engine/three/editorial.js` `makeOverlay`, both looks): the picture,
  then a frosted band (backdrop blur, white fading to clear) across the top 27 % of the frame, fading downward, and one
  across the bottom 17 %, fading upward, then the text. The top band fades in and out with the headline, the bottom one
  is always on; nothing above them is semi-transparent, so the blur sees the frame.
- **object-studio frames are measured before the render** (`scripts/express.mjs` assemble and final,
  `engine/three/objectStudio.js`, `engine/three/measure.js`, `scripts/layout_lint.mjs`): each shot is captured and the
  page records the hero's box, every overlay and caption box and the hero's contrast against its ground. Assemble
  reports, as OPEN lines under the group that owns the shot (report only, never a stop, until the checks are calibrated on
  real films): a hero under a third of the frame, a hero cut by a frame edge (a close-up that fills
  the frame is fine), text covering the hero, a hero under 12 ΔL* against its ground. A line that is clearly real goes to
  the one fix round; final measures again and prints what is still open for the hand-off, so no polish round follows the
  render.
  `layout_lint.mjs` gains `--min-hero`, `--min-contrast`, `--min-caption`, `--min-label` and `--no-safe-area`; Express
  measures with the kit's own text sizes (captions 46 px, smallest label 22 px). The hero box is taken from the visible
  meshes only: hidden objects, lights and `attend:false` things such as `backdrop()` never count, in the box or in the
  contrast mask.
- **Too few anatomy pictures: one image prompt for the user** (`references/express.md` Anatomy strand,
  `references/hero-asset.md` §1): fewer than two saved pictures (outside and inside), the agent asks once with a fixed
  prompt for a 2.5D isometric before-and-after (intact, then cut away) on white, which the user runs in their own image
  tool. The pictures are a reference for composition only: never in the film, never traced as an outline, never a part's
  source; the sourced parts table wins.

## [4.5.3] - 2026-10-30

### Fixed
- **Depth of field was 1000 x too shallow** (`engine/three/camera.js` `dofFor`): `focusRange` was divided by 1000 twice,
  so 50 mm f/1.8 at 3 m kept 0.4 mm sharp instead of 0.39 m and a close-up blurred whole, the part named included. The
  range is now the lens chart's depth of field in metres; the self-check holds two lens values.

### Removed
- **three.js `BokehPass`** (`engine/three/bokeh.js`, `detailFocus`): it failed too often (private fields and patched
  shader text that break on a three.js update, a second scene render per frame, halos at sharp edges). The iso hero
  clip's `detail` block now drives postprocessing's `DepthOfFieldEffect`, the one depth of field `studio()` already uses
  (`detail: [{ from, to, node, bokeh, range }]`, `hero-asset.md` §4).

### Changed
- **The size of a change sets the version** (`scripts/next_version.mjs`, the table above): `### Redesign` (a very large
  overhaul of the design or the algorithms) is a MAJOR, only with `scripts/release.sh --major`; `### Rework` (medium to
  large) a MINOR; bug fixes, improvements and new features, `### Added` included, a PATCH.

## [4.5.2] - 2026-10-30

### Added

### Fixed
- `studio.mjs frames` took an arbitrary snapshot dir (uuid names sorted) and printed "FAILED no stills": it now takes
  the newest by mtime and its first stills in numeric order, without HyperFrames' extra tail frame (`scripts/snapshots.mjs`).

### Changed
- **The user's pictures are matched, and measured** (`hero-asset.md` "The user supplies reference images"). When the
  user gives pictures of the subject, the Brief asks "Match the references exactly" or "Inspired by" (`fidelity:
  exact|inspired`). With exact, the outline of each picture is traced as measurement data (pixels, logos and text are
  still never put on the model), curved surfaces are built as curves, and `scripts/silhouette_iou.mjs` compares each
  picture with the hero's mask from its camera (`measure.py` `refs`): one uniform scale so a wrong proportion shows,
  IoU, aspect difference, the worst region and an overlay the user sees before style frames. A view under its
  threshold is a P0 shape item before any polish, and two rounds under it question the method. Gate 3 records the
  IoU and warns when it is missing or low, never blocks.
- **Hype edit, a fourth energy** for 9:16 and 4:5 (the Brief's Energy question, which Express now asks too): the
  short-form beat-cut edit, 0.4–1.0 s shots cut on the voice's stressed words, a velocity ramp per shot that slows or
  freezes on the action's physical key pose, beat punch-ins under 1.2×, whip smears that may roll the frame ≤ 8°, a motif
  framing that returns, shallow focus on every close shot, and a whoosh or hit on each cut. Handheld shake, flash frames and footage stay out.
  `storyboard_lint.mjs` checks its 1.0 s average shot (`--energy hype`, or `energy: hype` in `BRIEF.md`).
- **Express researches the inside of the object a film explains** (`express.md` Steps 3–4, the anatomy strand): the facts job also
  reads the user's documents, the maker's manual or datasheet, a patent or a teardown, saves 2–3 pictures to `refs/`
  and writes `research/anatomy.md`, a sourced parts table down to fasteners (15 rows or more, generic structure rows
  allowed). `express.mjs scaffold` refuses a `hero: true` object without a row in it, the planner and the world builder build the hero from it row for row, and an anatomy check beside `assemble`
  sends its P0 rows to the fix round. The Brief also asks for the exact model name and takes documents (`brief.md`
  Call 4; `model:`, `docs:`).
- **Anatomy explainer arc** (`script-voice.md` "Arc templates"): "how does X work inside" in eight beats, from a hook
  with its signature sound through the hidden part and a caused chain to a last line that loops into the hook. A parts
  table numbers every named part once; that number is its cutaway callout (`looks.md`), its label and its `POST.md` line
  (`qc.md`).
- **Colour roles are fixed across films** (`visual-direction.md` §5): red heat or current, green safe, blue cold or
  fluid, violet a field, yellow the focus, orange glow over the limit; a role never changes hue and a hue never means two.
- `SKILL.md`: a skill rule that defeats what the user asked for is flagged to the user in one line, never passed on
  silently.
- **Bokeh is real optics, always** (`camera-motion.md` §9.2 "Real lens"): blur only from the shot's lens, f-stop and
  focus distance (`dofFor`, `bokeh`), growing with depth in front and behind, a punch-in scaling the same blur, discs
  only on real lights or speculars, the explained part sharp through its hold.
- **A Studio hero is accepted by measurement, shot by shot** (`hero-asset.md` §3). The planner writes
  `review/hero-shots.json` (each shot that shows the hero: the film's camera, focal parts, states, what must read),
  checked by `scripts/hero_shots.mjs`; modelling waits for it. `engine/blender/measure.py` renders a flat object-ID
  pass per shot at the film's lens and measures readable instances, occlusion (a defocused foreground counts half), the
  section face toward the camera, the state move and base-colour contrast against the part holding it (a misspelt part
  name fails by name), with a phi the builder lowers inside its job (two runs without progress stop it). A failing row is
  classified by trying cameras and, when the asset can turn it, the cut: a legal variant, a camera decision for the main agent, or the model. The hero check
  judges only what numbers cannot (shape, parts, counts against the pictures; stylized, never hyperreal), from round 2
  only the open items. Fix rounds are one builder each. Escalation stops at top · high: a P0 that survives is
  classified, never pushed to xhigh or max.

## [4.5.1] - 2026-10-30

### Changed
- **Versioning follows usual practice** (the table at the top): MAJOR only with a `### Breaking` entry, MINOR only
  for a capability the user sees (`### Added`), everything else PATCH; `scripts/release.sh` reads the bump from
  Unreleased (`next_version.mjs`), refuses a given version that differs, and refuses a second release within a week
  unless `--urgent` (a PATCH only). 33 releases and 4 majors in the first week are what this ends.
- **The version is said at the start**: preflight's DALANG row names the release the clone is on and the newest one
  (`DALANG v4.5.0`, `newest release v4.6.0`, `+n` commits after a release), and the agent's first line to the user
  says it (`brief.md` Step 0).
- `state.mjs next --step <n> --sub`: a subagent reads its step's sections with its own call, as text; the main agent's
  view carries one command line instead of the sections or their `sed` ranges.
- **`wait.mjs`, the barrier after a fan-out**: sent last in the message that starts N subagents (`--expect N`,
  foreground), it returns when the N newest have finished (`finished` in their transcripts' meta), so their replies
  arrive in that one turn instead of waking the main agent N times; one line to the user for the round. A job started
  earlier is never waited for; still running at the timeout: exit 3, run it again. `studio.mjs fixes` and
  `scaffold.mjs` print it with the right N. (A Studio QC round woke the main agent about 10 times at 400K+ context.)
- **Written ≠ spoken (`say.txt`, `say.mjs`)**: one `written = spoken` line per word ("DNA = de en a"). `narration.txt` keeps
  how the voice says it; captions and the SRT show the written form; the heard-vs-script check takes a transcript's
  written form as the spoken words. `narration_lint` (Gate 1) refuses a letter code ("DNA", "USB-C", "3D", "CO2") with no
  line, so how it is said is decided before the first take.
- **Steps 3–4 are jobs, not main-session work** (both modes): one fact-research job for every strand, a script writer
  (`dalang-builder`, top · high: writes from `BRIEF.md`, `research/` and `refs/`, runs the lints, never approves),
  the read-through, then one voice job (`dalang-builder`, top · medium: sample, take, retakes and respells in its own
  context, every call in the foreground). Same models as before, so no quality traded: the jobs know only the
  files, so a wish said only in chat or held in memory goes into `BRIEF.md` (`notes:`) first. The main agent reads only its part (`script-voice.md` "Step 3/4, the main agent's part", `express.md`
  Steps 3–4): Steps 3–4 now cost the main context 3.4 KB instead of 10.1 KB (the Studio path 41.1 → 34.5 KB, Express 32.7 →
  24.7 KB), and the write ↔ lint and
  take ↔ retake loops no longer re-read the whole session on every turn. Express `next` at Step 5 prints Step 6 too.
- **Runners in the foreground when short**: `after-voice`, `frames` and `fixes` run with `timeout: 600000`, their
  result in the same turn; only `qc` and `final` run in the background (a background run costs a wake-up turn and a
  turn to read it).
- `tokens.mjs`: the Result line (recorded at every gate) names the main agent's turns, and a Studio main agent over
  100 turns is a WARN, like Express's 30.

- **Punctuation for the ear** (`script-voice.md` "Write for the ear", `narration_lint` at Gate 1): at most one comma a
  sentence unless a list is closed by "and"/"then" (two clauses joined by a comma, an aside between commas and a bare
  list were heard as a flat list, the point lost), and no sentence in lower case (a "…" or a line break had split it:
  the voice, and a retake, restarted the intonation mid-thought). Read against four finished films' narrations, the
  check names exactly the sentences that confused by ear and none that did not. The odd rise and fall of the voice
  comes from the commas: measured on four finished takes and an A/B of the same text (one voice, three seeds, two
  speeds, with and without style instructions), the voice lifts its pitch 3–8 semitones at every comma (up to 13 in a
  take), and 9 of 18 statements with two commas or more ended rising against 1 of 17 written with one comma at most;
  speed and instructions made no steady difference.

### Fixed
- **A retake is spliced at its neighbours' level**: a sentence said again alone came back louder (measured on a
  finished take: retaken sentences off by 1.6 dB on average against 0.8 dB, one +3.3 dB), heard as a jump in the
  voice. `tts_timestamps.mjs` now brings each re-spoken piece to the active speech level of the kept speech beside it,
  within ±6 dB.
- A respelling made for the voice (a letter code spelled as it is said) reached the captions and the SRT, and from
  there `script.md` and the storyboard; found only by the viewer at QC, it cost a new take, a retime and a redraft.
  The screen now keeps the written word.

## [4.5.0] - 2026-10-30

### Added
- **Closer = orbit-in** (`camera-motion.md`, the Express planner card): a move that closes in on a subject (a push, zoom or dive of 1.2× or more, or one size step tighter) turns the view while the frame tightens, in the film's one orbit direction, never a straight push; accent pushes under 1.2×, the one dolly zoom and the one crash zoom are exempt. `storyboard_lint` fails a Camera cell that closes in with no orbit word. "Arrive and orbit" is no longer limited to three a film.

### Removed
- The on-screen illustration label ("ILLUSTRATION", "not to scale"): `ov.chip`, the `illustration` option of `makeOverlay`, `scaffold.mjs --illustration` and the `__ILLUSTRATION__` template slot are gone; a `[illus]` number gets no label (the voice says "roughly").

### Fixed
- `tts_timestamps.mjs`: a VoiceStudio `429` (GPU worker pool saturated, often by queued jobs whose client was stopped) is BUSY like a `503`: wait, retry once, then `WARN … rerun` and exit 3, never `FAILED`.

## [4.4.0] - 2026-10-30

### Added
- `scripts/studio.mjs`: Studio's mechanical steps as one call each (`after-voice`, `frames`, `qc`, `fixes`, `final`), run in the background, so the main session only decides, spawns and reads short verdicts instead of writing chains, polling and retyping verdicts.
- `scripts/music.mjs`: the bundled public-domain / CC0 music bed for every film, offline; Studio runs it at Gate 2 and `studio.mjs qc` fails a film without a bed (unless the Brief says `music: none`). A searched track is only for when the user asks.
- `workspace.mjs init` sets an auto-compact window of 200K (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`) in the videos folder, so a long film session compacts itself instead of growing toward the model's whole window.
- `tokens.mjs` WARNs when the main session carries Agent prompts or subagent replies over 2,500 characters.

### Changed
- The main agent orchestrates, never does the work (SKILL.md): Agent prompts are the job and file paths; checkers write their own verdict files (`QC-REVIEW.md` and one `review/fixes-<group>.md` per group, `review/benchmark.md`, `review/style-frame-check.md`), builders `review/reports/<job>.md`, and both reply in a few lines; `state.mjs log` rides on the step's command. Style frames are always written by a builder.
- `express.mjs final --quality looks|high` (Studio passes high).

### Fixed
- Studio films shipped without music when a media site did not answer: the bundled bed is now the default.
- The run metrics table ends with a **Total tokens** line (main + subagents, main model, what "inherited" effort means), and the hand-off must paste the whole table into the final message, not only name `review/metrics.md`.

## [4.3.0] - 2026-10-29

### Added

- Detail focus for the Studio iso lane (`engine/three/bokeh.js`): three.js's `BokehPass` as a pass of the pmndrs composer
  (`detailFocus`: `focusOn(point)`, `set({ blur, range })`, 0 = off), with a depth pass that keeps the section's clipping
  planes and leaves out ink lines and glass, correct for the iso orthographic camera, alpha-preserving. The hero clip template
  takes `detail` windows (from, to, node, blur, range); the agent decides when: a detail beat only, never the wide.
- `scripts/vendor_latest.mjs`: keeps three.js and its add-ons (`engine/three/vendor/package.json`) on their latest releases. One
  line per package (`ok`, `behind x → y`, `capped` when `postprocessing`'s three peer range stops a newer three, `unknown` when
  npm is unreachable); `--update` bumps and installs. `release.sh` prints a behind or capped line first.

### Changed

- The hero clip template's composer ends with SMAA after the AO, as `studio.js` does.
- A hard cut changes the view, not only the size: two shots of one subject cut together differ in angle by 60° or more (front,
  a side, the back); the same view at a new zoom is a jump cut, so the move continues instead. The storyboard's `Size · angle ·
  lens` cell names the view; `storyboard_lint.mjs` fails a hard cut that keeps it (a match cut and a cut to a `new subject`
  are exempt), `camera-motion.md` §2, `look-build.md` and the Express planner's card say so. The `shots.js` runner refuses a `"cut"` shot
  that turns the view under 60° (`view` in degrees on the shot; `newSubject: true` for a cut to another subject).
- One typeface for every film (`engine/three/font.js`): Kohinoor Bangla when the machine has it, else Helvetica. Only the
  weight changes, by role: title Bold, heading Semibold, sub-heading Medium, body Regular. Overlays, captions, canvas text,
  the host and the hero clip template read it; the per-language fonts, the web-font links and the `fonts` option of
  `makeOverlay` are gone, and `tests/font.mjs` (in the gate) fails on any other family.
- README: what Express and Studio each ask for, their steps and what each hands over, with an animated swimlane diagram
  of both lanes: one row per engine (Claude Code, subagents, voice, Blender, three.js, Canvas 2D, HyperFrames, checks,
  reviewer), one column per step, the gates marked (`docs/assets/lanes.*.svg`, light derived from dark).

## [4.2.0] - 2026-10-29

### Removed

- Every sample and topic-locked piece: the README's Samples section and `docs/assets/samples/`; `engine/iso/examples.js`
  (builder briefs now read only `iso-API.md` and its kit and template lists); `engine/three/examples/` (`flask.js`,
  `oner.js`, `twin.js`; the one-take and A/B patterns are stated in one line in `engine/three/README.md`,
  `camera-motion.md` and `visual-direction.md`, and `selfcheck.mjs` keeps their engine coverage on inline neutral
  fixtures); the `motorbike` and `engine` templates and the `ac` appliance kind. With no reference video, the Gate 3
  benchmark scores the style frames against the look's rules in `looks.md` as a text rubric, not sample images.
- The `engine/blender/parts.py` parts born from one subject, with the helpers and materials only they used; the
  library keeps the mesh builder, helpers, fan, motor, pipe, wires and fasteners, and gains a generic cuttable `housing` (`cut=True` exports `<prefix>.quarter`). The demo fixture, its test and the clip
  template's data name only those parts.

## [4.1.0] - 2026-10-29

### Added

- `express.mjs scaffold`: the planner lints the storyboard and scaffolds the groups itself and returns the builders'
  `next:` line. `qc_all.mjs <draft.mp4>`: Studio's seven Step 7 checks in one call, one line each, details only on a
  failure. `state.mjs models`: the model and effort table.

### Changed

- Express reuses a hero already in the owner's library (object-studio places its GLB; the isometric look draws to its
  proportions); only Studio models a new one.
- Version rule: MAJOR only when a project from the previous version cannot continue or the way to ask for a video
  changes; internal removals are MINOR; at most one release a week.
- Fast path: `state.mjs approve <n>` runs its gate's checks itself (Gate 1 the lints, Gate 2 the padding), refuses with
  every problem, and on success prints the next step's reading, so the agent spends no turn on `next` (Express Steps 3–4
  and 5–6 read as one); a clean Express take runs `after-voice` by itself. Measured on a fixture: Express 15 → 6 calls,
  Studio 16 → 8.
- Less standing text: lesson headlines are tagged by mode and print only on their path; the model table lives in
  `state.mjs` (`next` prints it beside each subagent); Step 1's look-ups skip Call 0 when preflight left no choice and
  series rows when there are no kits; preflight prints only the rows that need action plus one OK line (`--all` prints
  every row). The Express planner reads one 3 KB camera and storyboard card instead of 20 KB of look-build and
  camera-motion (30 → 10 KB). SKILL.md's budget is 9.5 KB.
- Token-lean skill text: SKILL.md 17.4 → 9.0 KB (re-sent on every turn), the Express path's reading 51 → 31 KB, the
  Studio path's 51 → 40 KB, Step 7's subagent reading 23 → 17 KB; references, engine READMEs and API cards
  (engine/three/README 37 → 12 KB) cut to the instructions, one home per rule. `state.mjs reading` enforces SKILL.md ≤
  10 KB, Express ≤ 45 KB, Studio ≤ 60 KB.
- Lean script output: `state.mjs next` about half the size (one header for the look-up lines), one line per result in
  preflight, the take summary, captions, stillness, loudness and scopes; builder briefs 5.4 → 3.2 KB with each group's
  checks in one `review/check-<group>.sh`. The Express hand-off pastes the metrics `express.mjs final` printed instead
  of running them again.
- `camera-motion.md` and `craft-rules.md` are numbered without gaps (camera-motion §6–10, craft-rules §1–6), every pointer
  rewritten to match.
- With no reference video, Gate 3's benchmark board is the skill's own samples (`docs/assets/samples/`), not a golden sheet. A hero's stills are snapshots of its clip page.

### Fixed

- Object-studio builders were sent to `assets/examples.js`, which only the isometric look installs.

### Removed

- The two Studio sample stills of the removed subject-specific asset from the README.
- The one subject-specific hero asset and its clip page from `engine/blender/assemblies/`: hero assets live in the
  owner's `<videos>/library/hero/<name>/`, outside the skill; the repo keeps the generic `parts.py` and a clip template
  (`engine/blender/templates/hero.clip.tpl.html`) whose data block a film fills.
- The 18 lessons kept only "for grep" (each is now a failing script), dead pointers to deleted epic files, history
  notes in READMEs, and the `isoMaterial` export.
- The golden eval: `examples/golden/`, `evals/golden/3.0.0/`, `scripts/golden.mjs` and its two tests (unused since
  3.0.0, and it covered one Studio scene only).
- `engine/blender/assemblies/condensing_unit.shot.html` (the clip page gives the same stills).
- engine/three modules whose job is now the Blender lane's or a look that no longer exists: `parts.js`,
  `electronics.js`, `markings.js`, `transmission.js`, `surfaces.js`, `examples/interior.js`, `circuit.js` `failure()`,
  `kit.js` `floor`/`wear`/`grain`/`surface`; the self-check shrinks to match (2313 → 1881 lines). Kept: fields, optics,
  circuit, instruments and air, which draw what neither the Blender hero nor engine/iso can.
- Script flags nothing documented: `tts_timestamps.mjs` `--name`/`--format`, `loudness.mjs` `--lra`/`--tolerance`;
  `measure_reference.sh`'s boil rate; unused imports and exports.

## [4.0.0] - 2026-10-29

### Added

- The user's own thing in the film, exactly as their photo shows it: `scripts/trace.mjs` cuts the plain background
  away and traces the rest with vtracer (visioncortex, MIT; optional, installed only on the user's yes, preflight's
  "Photo tracer" row) into spline layers: a moving part by its ellipse and its own colour (the body under it painted in
  from its surroundings), a material by hue. build()'s `plate` form (`engine/iso/plate.js`) stands it in the world at
  its real size: a part turned and, with `spread`, blurred like a fast fan; a material tinted (copper running hot);
  flows drawn along paths on the photo; marks as label pins. Nothing generated, nothing guessed. Express only, for a
  supporting object or the user's own thing; a precision-lane hero is never traced.
- `film_gate.mjs` fails a close-up past the drawing's detail: the world's parts (a kit's own parts too) are projected by
  each frame's camera, and one part over half the frame or three over three quarters is a FAILED that names them and the
  widest zoom that reads (`k ≤ …`). Kits and templates are the other way out.
- `engine/iso/templates.js`: parametric assemblies of kits for the things films need most: a two-wheeler (scooter or
  underbone), a car (sedan, hatch, van), a single-cylinder engine (piston and rod follow the crank angle, crankcase and
  barrel slide off with the cutaway, oil in the sump), a room, appliances (fridge, washer, wall AC, server rack) and
  trees. Written as `{ form: "kit", kit: "car", style: "hatch" }`; the world audit treats a kit or template as one
  rigid assembly (its insides are proven in the tests), a path kit (pipe, hose, cable) still lands its ends.
- A person is a jointed 3D body (`engine/iso/figure.js`), not a flat pictogram: real proportions, head with hair
  and eyes, torso, elbows, hands, knees and shoes; poses stand, walk, point, carry, reach, sit, crouch, kneel and wave,
  any joint by angle, a hand placed on a point by IK (`reach: [x, y, z]`), feet always on the ground and a seated
  pelvis on its seat; clothes by colour (shirt, trousers, long sleeves, a coat, a cap, long hair).
- `engine/iso/kit.js`: about forty components every made thing is assembled from (bolts, panels with screws and seams,
  vents, grilles, screens, buttons, knobs, handles, labels, hinges, pipes with flanges, hoses with fittings, cables,
  tyres with tread, rim and spokes, springs, cooling fins, bottles, drums, pans, cans, crates, cartons, windows, doors,
  tables, chairs, shelves, plants, lamps, tools), written in a spec as `{ form: "kit", kit, …sizes }`. Each expands into
  ordinary parts, so pins, the cutaway, focus and Anatomy's audit see them; each stands proven on a slab in the test.
- `engine/blender/`: hero machine assets modelled once by script and reused, instead of rebuilt from boxes in every
  film. `parts.py` is a generic library in real units (finned coil with real fins, hairpins and return bends; twisted
  axial fan; motor and bracket; rotary compressor with stator, windings, rotor, crankshaft, rolling piston and vane,
  and a section quarter per part; accumulator; pipes with filleted bends; insulation; flare nuts; service and
  expansion valves; sheet casing with grille and louvres; wall bracket; fasteners). `assemblies/condensing_unit.py`
  builds a refrigeration condensing unit from it in a few seconds (63 named nodes, about 240k triangles; the seen
  end fins punched with tube collars, sheet edges rounded) and `condensing_unit.shot.html` renders its cutaway in the
  iso look with a softer, graded matcap and a thin ambient occlusion (blue x-ray casing with a thin wire, opened unit,
  sectioned compressor, the coil's end with its tube sheet off, context in calm greys, refrigerant as colour code, the fan turned from its motor speed, numbered pins on leader lines). Blender (GPL) runs on the machine
  only; `tests/blender-parts.mjs` builds and reads the asset where it is installed.
- `references/hero-asset.md`: the hero subject goes from the user's 2D pictures (photos, cutaway diagram, manual page,
  sketch) to a Blender-scripted model once: the pictures read into a parts sheet with tagged sizes, library parts
  first, the still checked against the pictures, then the motion recipe (graded matcap and ink, x-ray shell, a
  sweeping clip-plane section, a blur disc for a fast rotor, a fluid coded along its whole loop, labelled pins kept in
  frame; the composer's autoClear trap; snapshots before any render). `condensing_unit.clip.html` is its 7 s example.
- Preflight's `Blender` row (`--check-blender`): the version when installed; not there is MISSING with the consent note
  Brief Call 0 asks (optional, Studio's hero asset only, about 1 GB, GPL); a timeout, crash or odd reply is WARN
  "rerun". The gate's syntax step also checks `engine/iso`, `engine/anatomy` and `scripts/*.py`.

### Changed

- README samples show the Studio precision lane: two stills of the Blender hero in the three.js iso look (x-ray with the
  coded loop, the compressor's section).
- The hero subject is modelled from pictures into `engine/blender/` instead of taken as a CC0 model; CC0 models stay
  the first route for supporting objects. The Brief asks for any 2D pictures of the subject, not only photos of the
  user's own machine.
- The Express look draws like an illustration, not a block game: every solid is one mesh whose silhouette and creases
  are inked and whose lit top edges carry a light rim; a box's top edges are chamfered (`bevel`, 8 % of its least side
  by default); spheres get an outline; each object stands on a soft contact shadow (`shadow: false` turns it off).
  `iso.ink = null` gives the old flat look.
- Express builders and fixers run `film_gate.mjs . --group <group>` before they report: their seams, the world in motion and
  reading time are caught in the build, not first at `assemble`, and a fix that clears one float but raises another is
  seen by its fixer. A seam FAILED goes to the later group's fixer.
- The builder brief asks for the first CAMERA key as `{ t: 0, ...OPEN }` and the last as `...CLOSE`, nothing overridden
  and no zoom unit of its own, and for every edit of one round of checks in one message.
- A film_gate jump names both poses (where the earlier group ends, where the later one opens).
- One home per rule: the slow one-way orbit (`camera-motion.md` §2), the technique count per mode (its intro: Studio
  6–10, Express 4–6), contact squash ≤ 4 % (§5.2), parallax depths (`express.md` Step 6), builder budgets (Express in
  `express.md`, Studio in `look-build.md`); the other files point to them. In a Studio isometric film the subject turns
  under a fixed view; lens, angle and light apply to `object-studio` only.
- Every gate is the agent's in the references too (`state.mjs approve <n> --by agent`); no step waits for the user.
  `SKILL.md`, `CLAUDE.md` and the docs describe Express as Canvas 2D (`engine/iso`, the fast lane) and Studio as the
  precision lane (three.js with the hero modelled once in `engine/blender`); `docs/architecture.md` shows every engine.
- `state.mjs reading` counts Steps 0–8 without the optional Step 2, printed on its own line (50.7 KB of 60 KB); lessons
  whose fix is a failing script move to "Enforced by scripts", outside the per-step headlines.
- One narration parser: `audio_qc.mjs` and `scaffold.mjs` use `tts_timestamps.mjs`'s `parseNarration` (speaker names in
  a dialogue are not words). `pad_voice.mjs` pads by the fixed 1.45 s / 1.35 s only. The benchmark row "Overlays caused
  by physics" is "Overlays caused by motion".
- README: the two lanes, Blender and vtracer as optional tools asked first, samples re-rendered with the current Express
  engine and alt texts that say only what each image shows. NOTICE credits the vendored MIT code and the bundled music.
  `.gitignore` ignores Blender output.

### Removed

- Engine examples nothing pointed to (`torch`, `torch-shots`, `magnet`, `straw`, `supply`, `psu`, `canister`, `fan`; the
  self-check keeps their coverage on inline fixtures), `engine/epic` `data-vocabulary.md` and
  `illustration-and-texture.md`, the `toon` studio look, unused exports (`rng`, `ease3`, vendor `HDRLoader`,
  `RectAreaLightUniformsLib`, `BloomEffect`) and `userData.fur` handling.
- Leftovers of removed features: `craft-rules.md` §1 (line boil), the drifting-plate trick, old look letters and words,
  six physics-engine lessons, `series.mjs`'s physics-bake check, `Pexels` as an allowed licence, the no-op
  `--no-language` flag, `pad_voice.mjs` `--lead`/`--tail`, and `evals/golden/1.6.0` (scene revision 1, not comparable
  with any later version).

### Fixed

- Objects of one `WORLD` were painted object by object, so a wide floor or wall could cover small objects beside it.
  `build()` now takes the whole `WORLD` and orders all its parts together; the group template calls it that way.
- `express.mjs assemble` could drop a seam FAILED under a long list of findings (it kept the last 12 lines, and the
  seams print first). film_gate now prints its FAILED lines last and assemble keeps 24.
- A Studio project now gets `cinema.js` and `parallax.js` (`build.mjs` ships them; `isoStudio`'s finish needs them).
  `series.mjs` also refuses Express scene modules as scene code. Dead pointers in the references, `iso-API.md` without
  `loadPlates`, engine READMEs (install path, render step, `palette.js`), the gate header and CI comment.

## [3.10.0] - 2026-10-29

### Added

- `scripts/film_gate.mjs`: an Express film measured instead of looked at. Each group's own module runs in Node on a stub page (no browser, seconds) and its camera, world values and overlays are read over time. FAILED (exit 3): a jump, a turn back or a flipped zoom at a cut (idea after HeyGen hyperframes' seam gate, Apache-2.0, no code taken); a part that floats, sinks or is passed through only while the world moves (Anatomy's audit at every new set of values, against the world at rest on its lowest face); an overlay settled under max(0.8 s, 0.3 s a word) (after latent-spaces/brag, MIT). NOTE: a dead stop or start from rest at a cut, 3 s with nothing moving, changing or entering. WARN (exit 2): a group it could not run. `express.mjs assemble` runs it, replacing the seam subagent. `tests/film-gate.mjs`.
- **An Express world is proved before it is drawn** (`scripts/iso_audit.mjs`, `engine/anatomy/`). The geometry audit
  of Anatomy (MIT, vendored unchanged: `audit.mjs` with its `iso-kit.mjs`, `lathe.mjs`, `tube.mjs`) runs on the true
  shapes of every `build()` spec, through DALANG's adapter `engine/anatomy/world.mjs`. It names:
  - a part that floats;
  - two objects sunk into each other;
  - a pipe that passes through a solid or ends in mid-air.

  The first builder runs it after writing `assets/world.js` and fixes the geometry until it exits 0 (`express.md`,
  `iso-API.md`, the builder brief). Exit 2 is a WARN, never clean. On a test set it caught a sofa built 10 cm above the
  floor that no still had shown. Checked in `tests/iso-audit.mjs`.
- **Labels land on parts the viewer can see** (`world.js` `PINS`, the group template's `PIN`, `lint_scene.mjs`). Overlays
  anchor to `PIN.<part>`, filled from `build()` every frame. `iso_audit.mjs` refuses a label:
  - whose part does not exist;
  - whose part name is shared;
  - whose part is hidden behind another object (`--cut 1` checks a cutaway beat with the skins off).

  `lint_scene.mjs` flags an overlay anchored to typed numbers.
- **The hero object is built from its real parts.** It is marked `hero: true` and has 15 or more parts, grouped base,
  structure, mechanism, controls and the subject (planner OBJECTS, builder brief, audit). Its inside comes from the same
  object under its skin, and an inner part no source shows is drawn plain and called generic (`cutaway.md`,
  `express-planner.md`).
- **`triad(hex)`** (`engine/iso/palette.js`) gives a part three readable faces at any base colour. It steps lightness in
  OKLab (the idea is from Teddarific/skills anatomy-asset, MIT); `tri()` collapses a dark or pale base.
- **Lines mean one thing** (`cutaway.md`, `blueprint.md`):
  - dashed is only a real hidden edge;
  - dash-dot is an axis or centre line;
  - a detail drawn larger than scale says "NTS".

### Changed

- `express.mjs final` lays the poster over frame 0: the hook beat's last frame as `poster.jpg`, so every platform's thumbnail is the hook (after latent-spaces/brag, MIT); length and audio unchanged.
- Express builders never load the `/hyperframes` skill (the template meets the render contract; the planner owns the story and shots), one skill context fewer per builder. The planner holds each overlay settled for max(0.8 s, 0.3 s a word) and writes text colours in hex or rgb.
- Express prompts cleaned: `express.md` no longer repeats or contradicts the builder brief (stale single-composition build, a one-frame first look, a 10-line report, a builder waiting on the voice it never waits on, a builder reading language files only the planner reads); the pure-function-of-t rule (no CSS keyframes, `requestAnimationFrame` or timers) moved onto the iso API card the builder reads; the world template imports `triad`.
- **Builders report evidence, not "done"** (the builder brief, `express.md`). Each check is reported as one of:
  - PASS, with its command's result line;
  - FAIL;
  - UNVERIFIED, when it was not run or its output was unreadable.

  A missing result is never a PASS, and a PASS from before the last edit of that file does not count.
- **A recurring defect gets a different route.** The same defect twice means another form, a simpler part or a changed
  shot, never a third try of the same fix. This caps fix rounds. A builder stops once every check passes.
- **The seam check is not led.** Its reviewer gets the frames and storyboard rows only, never a builder's report or a list
  of what to look for.
- **The fix round's changes are listed** (`express.mjs`). `assemble` records the world and every group by sha256 in
  `review/assembled.json`. `final` names each file changed since then, the world flagged as its owner's only, for the
  main agent to check against the round's assignments. No record is a WARN, never "nothing changed".

  These working rules come from elithrar/dotfiles' engineering-drawings and animated-sprites skills (MIT); only the
  ideas are used.
- **Overlay motion** (`engine/three/editorial.js`):
  - Each overlay enters on a strong ease-out (`EASE.in`, cubic-bezier 0.23, 1, 0.32, 1).
  - The entrance grows with its size (`IN_DUR`): chip 0.2 s, pill 0.25, card 0.3, headline 0.4, never over 0.8.
  - The exit takes 0.7 of the entrance, accelerating away (`EASE.out`), and shrinks back toward 0.96, so it leaves the
    way it came. Before, every overlay faded linearly in and out over the same 0.2 s.
  - `bezier()` gives any CSS curve as a pure function of progress.
- **Seams and timing** (`camera-motion.md` §3 and §7, `express-planner.md` MOTION):
  - A cut keeps the motion going on both sides, and a zoom keeps its sign across it.
  - One seam direction per film, with up, push-through and pull-back kept for their meaning.
  - Two or three seam types per film.
  - The planner writes a SEAMS row per cut and names what owns each phase, and the pause before an impact is
    0.3–0.75 s.
  - Overlays never appear from nothing, recurring furniture gets the quietest entrance, and a two-state crossfade takes
    2–5 px of blur at its middle.

  These rules come from emilkowalski/skills (MIT) and HyperFrames' motion-doctrine (Apache-2.0); only the ideas are
  used, and no code is copied.

## [3.9.1] - 2026-10-29

### Fixed

- The Express planner's brief carries the rules a pale, cropped test film lacked: figure-ground first (the subject 25 L*
  or more from what is behind it, light objects on mid-dark grounds and walls, each ground's L* written beside its hex),
  one headline system for the whole film (a card in one fixed place on every claim beat, the key word at 160 px or
  more), every section opening on a shot of the whole place before its close shots, close shots framing one focal part,
  and fonts only from the language's `## Typography` (another face has no `@font-face` and fails `hyperframes lint`).
- Express fix rounds stop at 10 turns, effort medium, with no escalation (two 20-turn rounds at high effort cost as
  much as the build), and an error every group shares is one fix for all groups.

## [3.9.0] - 2026-10-29

### Added

- `references/express-planner.md`: Express has a planner again (top, high). Once the take is final and `after-voice`
  passes, one subagent writes `SPEC.md` and a shot-by-shot `storyboard.md` from a fixed brief, so the main agent sends
  one line. The brief holds the film's quality rules in writing: shot 1 hooks with a close or medium shot and its words
  on screen, shots of 2–3 s whose sizes vary, the subject a third of the frame height or more, the mechanism drawn and
  moving, overlay sizes in px (labels 40, headlines 64, big words 160 on the 1080 px canvas), each card with its
  source, each place with 6 or more props, focus that greys the context and never the subject.

### Changed

- Express aims at quality first: a film is 10M tokens (was 4M). On a test film the 4M design, one storyboard row per
  beat written by the main agent and builders held to 15 turns, came out with a weak hook, one shot size for half the
  film, unreadable labels and no visible mechanism. The cuts that were pure waste stay: the right subagent types, one
  shared world, briefs written by `scaffold.mjs`, the wait for the world, one fix round with the world's owner first,
  `final` checking before it renders.
- Budgets: main agent 2M, planner 3M, each builder 1.5M (about 25 turns, 30 at most, context under 150K; a fix round
  10 turns). `tokens.mjs` flags an Express builder over 30 turns or 150K and a film over 10M; `express.mjs assemble`
  skips the fix round over 8M.
- Builders may read `assets/examples.js` (finished specs, for their density and part count), snapshot every one of
  their storyboard rows (3 rounds at most) and check each frame against its row: its size and move, overlay text at its
  SPEC size and contrast, no frame greyed whole. The `dalang-builder` agent type plans as well as builds.

## [3.8.4] - 2026-10-28

### Fixed

- Express fix rounds stop eating the budget. There is one fix round, one fixer per group. A fix that changes
  `assets/world.js` goes to the world's owner first, alone, and the other groups' fixers start after it reports.
  Before, a fixer framed its camera on a world that another fixer was moving, and its whole round was thrown away.
  `express.mjs assemble` prints the tokens the session has spent so far: over 3M it prints SKIP, and the film goes
  straight to `final` with the findings named in the hand-off.

## [3.8.3] - 2026-10-28

### Fixed

- `express.mjs final` runs `hyperframes check` and `check_assets` before the render, and renders only when both pass:
  check reads the composition, so a group whose script throws (and draws nothing for its whole run) now fails in one
  check instead of after a full render. The check's own ✗ lines are printed, not its progress lines, so the failure
  names its cause.
- Express Step 15 runs `final` with the Bash tool's `run_in_background`, never `nohup` or `&`: a detached job never
  wakes the agent, so a FAILED result could go unread and a broken film reach the user.
- `scaffold.mjs` lists the film's `assets/world.js` in the engine manifest (`licence: own`), so `check_assets` no longer
  fails on the file it wrote itself.
- `check_assets` accepts the SIL Open Font License (`OFL`, `OFL-1.1`), which lets a font be embedded in any work.

## [3.8.2] - 2026-10-28

### Fixed

- Express: no group snapshots an empty world. `assets/world.js` starts with a `STUB` line; the builders of the other
  groups write their templates, then wait for the first group's Write to remove that line before they snapshot.
  `express.mjs assemble` fails when the world is still the stub. Before, a second group could finish and report without
  ever seeing a frame.
- Express: the world is furnished and true, not a bare slab with plain boxes. The first builder's brief sets the bar
  (6 or more set props per place, each made object built from the parts that make it known, every person the narration
  names a `figure`), SPEC OBJECTS lists each place's props, each object's telling parts and each person, and every
  builder's look check also names a subject under a third of the frame, bare ground over half of it, a missing person
  and a moving thing that does not stand off its ground.
- `express.mjs after-voice` reads the newest `voice-*.log` (the last retake's) unless `--log` names one; it no longer
  fails on a first take's warnings that a retake already fixed.

## [3.8.1] - 2026-10-28

### Fixed

- **Every orbit in a film goes the same way.** `filmOrbit(1)` (right) or `filmOrbit(-1)` (left), set by every group
  template from SPEC CAMERA, locks the direction: an `orbit25` against it, a shot's arrive-and-orbit included, throws,
  and so does a group that sets the other direction. A shot could orbit left over the film's slow orbit right, which
  read as the camera swinging back and forth.

## [3.8.0] - 2026-10-28

### Added

- **`scripts/express.mjs`: Express's mechanical steps as one call each.** `after-voice` (the take's WARNING lines,
  padding, captions in the brief's format, Gates 1–2), `assemble` (every template filled, every lint, Gate 3, a
  failure printed under its group) and `final` (render at the brief's fps, `hyperframes check`, `check_assets.mjs`,
  Gate 4, the metrics table). The main agent's run is about 16 messages, and no assembly builder is started.

### Changed

- **An Express film has a budget of 4M tokens**, main agent and subagents together, and `tokens.mjs` names a film
  over it: the main agent ≤ 1.5M (≤ 30 turns), each builder ≤ 0.7M (about 15 turns, 20 at most, context under 80K;
  was 40 turns and 150K), research ≤ 0.3M. A measured 52 s Express film had used 24M: three builders at up to 260K
  context for 20 turns each, the main agent at 190K for 63 turns.
- **Builders per Express film:** one under 45 s, 2 from 45 s, 3 only above 75 s (was 2–3 from 6 beats or 45 s). Each
  extra builder reads the brief, SPEC, API card and world again.

### Fixed

- **The Express camera no longer wobbles left and right on a close-up.** `handheld()` shook in world units, so a push
  from 100 to 560 px per metre made the same shake five times bigger on screen. **Handheld is removed:** a camera's
  life is now a slow orbit in one direction for the whole film (the group template's `ORBIT`, 1 right or -1 left, the
  same in every group and on film time, so it keeps one way across seams); tension is a faster orbit, shorter shots
  and whips, never a shake (`camera-motion.md`, `iso-API.md`). And `camAt` refuses keys that travel right and then left (or
  the reverse) with no hold ≥ 0.5 s between: a move, and an orbit round a subject, goes one way. The rule is in
  `iso-API.md` and `camera-motion.md` "Orbit".
- **Builders no longer write the world once per group.** The isometric look's world (palette, every object as
  `build()` specs, resting values) is one file, `assets/world.js`, written by `scaffold.mjs`, filled once by the first
  group's builder and imported by every group template. Each group's builder had rebuilt the whole world in its own
  file, with hand-drawn code beside `build()`, so three builders wrote three copies (most of their output) and read
  the engine sources to do it.
- **The builder's brief is written by `scaffold.mjs`**, `review/builder-<group>.md`: its beats, what to read and
  nothing else (no engine source, README, `references/` or `words.json`), its cue table, its part of the world, the
  exact check chain and snapshot command, at most 2 look rounds. The main agent sends one line per builder. A
  hand-written brief had sent builders to engine sources and the camera reference, named a snapshot flag that does not
  exist and a sheet command that did not match, each costing turns.
- `iso-API.md` no longer tells the first builder to copy the engine and write the host: `scaffold.mjs` already has.
- **The bundled music beds ship with the skill.** `.gitignore`'s `*.mp3` had kept `engine/music/*.mp3` out of the
  repository, so `scaffold.mjs --music` found no track in an installed copy and films went out with no music.

## [3.7.1] - 2026-10-28

### Added

- **`scripts/cues.mjs`: the builder's cue table.** One line per beat, each word as its `w("word", n)` call (n counted
  film-wide, as the engine does) with its start; `--beats` for one group. The Express builder brief names it, so no
  builder prints or parses `words.json` to find a word's index.

### Changed

- **The lean-workspace question is asked in plain words** (`brief.md` "Lean workspace"): "Turn off the tools videos
  don't need, in this folder only?", with what it saves, that only this folder changes and can be undone, and that it
  loads in a new session. No "lean", "workspace", "plugins" or "MCP" in the question.
- **A yes to it ends the session before the Brief.** The settings and DALANG's lean subagent types load only when a
  session starts, so a run that went on after `init` built the whole film on the heavy setup with general-purpose
  agents. The agent now asks the user to open a new session in the folder and send the request again.
- **Express has no planner.** The main agent writes the short `SPEC.md` (4 KB at most) and `storyboard.md` (one row per
  beat, `| # | Beat | Subject action | Camera | Overlay |`, so `storyboard_lint.mjs` reads it) from the Express Step 5
  text and the language's palette and type, and opens no other reference. The Studio planner and its ~100 KB of
  reading had been run for Express films too (SKILL.md's model table named it without a mode), at several times the
  output of the rest of the run.

## [3.7.0] - 2026-10-28

### Added

- **Narration craft** (`script-voice.md` "Narration craft", read at Step 3 in both modes): narration a viewer follows on
  one hearing, however short the film. One idea per film (a takeaway with no "and"), a word budget of length × pace ×
  0.85 so the picture has silence to speak in, the shape of a short film as shares of its length (hook, context,
  mechanism, payoff, takeaway), the picture shows what while the voice says why, one new term per minute explained at
  once, concrete before abstract, a chain of causes instead of a list, and a cut test per sentence.

### Changed

- The Gate 1 read-through also returns each term it could not explain.

## [3.6.0] - 2026-10-28

### Added

- **Arrive and orbit** (`camera-motion.md` §11.3): a zoom in or out that lands on a subject hands over to a slow orbit at
  once, the edges blurred and the centre clear while it travels and orbits. The agent picks the side (toward the open
  side of the frame, alternating between arrivals) or a rise or dip; at most three per film.
- **Aperture points at the part** (`camera-motion.md` §11.2): a close part named in the narration gets f1.2–2.8 with the
  focus on it and the rest melting into bokeh, racked to the next part on the next word. The beat table has both rows.
- **Express engine** (`engine/iso/cinema.js`): `focusRing` (blur around a clear centre, scaled by the f-stop) and
  `hold` (its 0–1 window); `orbit25` takes `from`/`to` so an orbit can start on the pose a zoom landed on. Checked in
  `tests/iso-cinema.mjs`.

## [3.5.0] - 2026-10-28

### Added

- **A music bed in every film** (`engine/music/`, `scaffold.mjs --music calm|bright|tense|none`): three public-domain /
  CC0 recordings from Wikimedia Commons (Musopen), free for any use, bundled so no search, network or listening is
  needed; the bed is copied with its ASSETS.json row and placed at 0.14 under the voice with fades. Express films had
  none: the bundled `/media-use` library holds only sound effects, and the Openverse audio search often times out.
- **Room around the voice** (`scripts/pad_voice.mjs`): `audio/voice.wav` is the take with 1.45 s of silence before the
  first word and 1.35 s after the last, and every time (words, beats, `beats.js`, subtitles, captions) moves with it;
  the take itself is untouched, so a retake still works, and a second run changes nothing. The host plays
  `audio/voice.wav`; `fill_times.mjs` refuses a template that plays the unpadded take with padded times, and warns
  when the voice has no room yet (`tests/pad-voice.mjs`).
- **`find_media.mjs` search with `--as`** takes the first result at once, licence row included; another audio format
  is converted with ffmpeg, never renamed.

### Changed

- **README is short and shows samples**: five English frames rendered by the skill's own engine and templates
  (`docs/assets/samples/`), install, how it works in four lines, requirements and licence; the rest lives in `docs/`.

### Fixed

- **An isometric film's engine files pass `check_assets.mjs`**: `scaffold.mjs` writes their origin and licence to
  `assets/.engine.json`, as `engine/three/build.mjs` does for its own.
- **The object-studio group template passes `hyperframes lint`**: it loads the bundled `assets/three-vendor.js` as a
  script (the same module `objectStudio.js` imports), so `missing_three_script` no longer fails a scaffolded film.


## [3.4.0] - 2026-10-28

### Added

- **Run metrics at the hand-off** (`state.mjs metrics`, `qc.md` Step 8, `express.md` Step 7): start, end and total time,
  minutes per step from `PRODUCTION.md`, the output folder and its final files, and each subagent's job, model, effort and tokens; `tokens.mjs` now records the
  effort each subagent was asked for and its clock times (`tests/tokens.mjs`).
- **Lean subagent types** (`agents/dalang-{builder,checker,research}.md`, installed by `workspace.mjs init --yes`, removed
  by `undo`): each has only the tools its job uses, so every turn starts at ~15K tokens of context instead of ~50K for a
  general-purpose subagent (measured: 14.4K vs 48–58K). The builder's working rules live in its definition, so briefs
  stay short. `SKILL.md` uses them whenever they are listed.
- **`scaffold.mjs`: the film's frame is written by code, not a model.** From `narration.txt`'s beat names, before the
  voice is done: the engine into `assets/`, the host with every group on the narration's times (the first from 0, the
  last to the end), each group's template with its beats filled. Builders only Edit their group's data, none writes
  boilerplate or waits on another to copy the engine (`tests/scaffold.mjs`).
- **Isometric templates and API card** (`engine/iso/templates/iso-group.tpl.html`, `iso-API.md`): the main look now has
  what object-studio has, a working group (world as `build()` specs, keyed camera, parallax layers, finish, overlays
  anchored to world points, timeline) and every signature on one page. Builders of a test film each read the engine
  sources and the `/hyperframes` skill, then wrote 20–32 KB groups from scratch; a fix round later read all three whole.
  The host template is shared by both looks (`engine/three/templates/host.tpl.html`, was `object-studio-host`).
- **Overlay fonts per language** (`editorial.js`): `makeOverlay` and `captions` take `fonts: { display, body, mono }`;
  left out, the object-studio type is unchanged.
- **`state.mjs next --print`** prints the step's sections as text in one call; the main agent of a test film spent 14 of
  its 58 turns reading sections one `sed` at a time and checking the skill version by hand.

### Changed

- **object-studio subject box** (`looks.md`): on 9:16 the subject and its action stay between 18 % and 60 % of the
  height, above the caption band; cards beside it, never over it.
- **Material effects get two snapshot passes**, then are logged and left.
- **Aperture follows the shot size** (`camera-motion.md`, `looks.md`): a wide at f5.6, a zoom-in or macro at f1.2–2.8 with
  the background blurred as the lens would.
- **Builders spend far fewer tokens** (`express.md` Step 6, `tokens.mjs`, `engine/three/templates/`): measured on a test
  film, two builders spent 21M tokens: a third on engine and example sources printed in their first turns and carried
  through every later one, a third on the ~50K session base paid by each of 115 turns, a fifth on files written whole
  and rewritten, 3 % on screenshots. Now: a one-page `object-studio-API.md` holds every kit signature (no source is
  read), host and group templates, about 25 turns (40 at most, `tokens.mjs` WARNs from BRIEF.md `mode: express`),
  150K context, write once then edit, one Bash per check round with outputs cut to errors, stills as one contact sheet.
  Fix rounds, which cost more than the builds: one per group, every finding of the round at once, all groups in
  parallel, 12 turns, only the changed lines read; Express fix rounds stay on the mid model.
- **Seams by construction** (`express.md` Parallel build): `SPEC.md` gives each group's first and last camera pose and
  one `build()` spec per shared object, so groups meet without an assembly builder reading every group.
- **Few turns in the main agent too** (`SKILL.md`, `express.md`): calls that do not need each other's output go in one
  message, the skill version comes from preflight, and Express has a turn schedule, about 25 and 40 at most
  (`tokens.mjs` WARNs); the main agent of a test film took 58 and was two thirds of the remaining cost.
- **Preflight offers the lean subagent types** even in a folder already lean (`workspace.mjs status --json` gives
  `agentsMissing`).

## [3.3.0] - 2026-10-28

### Added

- **Two looks, asked in the Brief, in either mode** (`brief.md` Call 1 item 0b, `looks.md`, `express.md`, `SKILL.md`):
  the isometric family (`isometric-world` the main language, flat drawing that reads as 3D through layers and colour, with
  `cutaway` and `blueprint` on the beats that need them, now combined in one film) or the new `object-studio` (the
  real object as clean 3D on a light grey studio sweep, x-ray, editorial cards, karaoke captions; `engine/three`, real
  lens and camera moves). Express builds `object-studio` too, with the engine's object-studio kit (`engine/three/objectStudio.js`,
  `editorial.js`, checked in the selfcheck) as the shared set and overlay. A look outside the two is answered in one line; a reference gives only palette, type and overlays.
- **A reference given as a link** (`measure-reference.md`): a subagent watches it in the built-in browser and writes
  `reference-measurements.md` (craft only).

### Fixed

- **Gate 3 in Express** (`state.mjs`): no longer refused for missing `style-frames` (Express makes none); Studio still
  needs them (`tests/benchmark.mjs`).
- **object-studio kit, from the first test film**: `set.shots(list, set, { moves })` (and `withMoves`) play camera.js's
  orbit, crane, dolly zoom and drone inside a shot window, so builders no longer patch the runner; `mat.chrome`; the
  illustration chip needs its label in the narration language (no English default); `looks.md` keeps every macro and
  x-ray shot recognisable (silhouette or inset in frame) and one overlay voice.

### Changed

- **Mode is the workflow, look is the drawing; both locked after the Brief**: a 3D look never moves a film to Studio. A
  look change after Step 6 starts stops every builder, rewrites `SPEC.md` and starts every group again; narration and
  voice stay. Express starts every group at once with no pilot (SKILL.md Step 6 and the parallel table).
- **Captions split a long run at the speaker's breath** (`engine/three/type.js` `phrases`, `captions.mjs`): with no
  0.3 s pause, the longest gap of 0.12 s or more decides, so a phrase no longer ends mid-clause on an even word count.
- **No title block on 9:16 or 4:5** (`looks.md`): sheet furniture only on 16:9.

## [3.2.0] - 2026-10-28

### Added

- **Cinematography the agent plans itself** (`camera-motion.md` intro, both modes): Step 5 writes a camera plan on the
  SPEC CAMERA line, a technique per beat job (drone or crane to open, orbit through the context, push and rack focus on
  the mechanism, one dolly zoom on the Crack, whip and handheld to accelerate, shallow macro on the Impact, crane up to
  close), never asked. Studio (`engine/three/camera.js`): a real perspective camera with `fovFromMm`, `dofFor` (f-stop
  and focal length into `studio({ dof })`), `orbit`, `crane`, `dollyZoom`, `drone`. Express (`engine/iso/cinema.js`,
  `parallax.js`): the same moves as 2.5D layer motion, `orbit25`, `crane25`, `dollyZoom25` (`drawLayers` option
  `dolly`), `drone25`, `bokeh(fstop)` and `discs`. Selfchecks and `tests/iso-*.mjs` cover each.

### Changed

- **"Isometric always" is gone**: the languages stay (`isometric-world`, `cutaway`, `blueprint`) but the camera is
  cinematic by default; true isometric (pan and zoom only) is for `blueprint` and diagram-dense films.

## [3.1.0] - 2026-10-28

### Added

- **Narration a viewer can follow** (`script-voice.md` Step 3, `scripts/narration_lint.mjs`): `script.md` opens with a
  `Promise:` (the question the film opens) and a `Takeaway:` (its answer in one sentence); the hook says the promise, one
  sentence names the parts before the first Pressure beat, `impact` and the last beat say the takeaway. A text-only
  read-through (a fresh subagent given `narration.txt` alone) must report the same topic and learning, in Express too.
  The lint fails a `;` `:` `( )` or `/` in spoken text and a sentence over 22 words.

### Changed

- **Write for the ear** is stricter: one idea per sentence, a beat wraps a whole clause, a section's first sentence says
  what it answers, no pronoun reaching back past one sentence. `voice.md`: one `--instructions` tone for the whole film
  (a teacher talking to one person), since VoiceStudio strips narration `[tags]`.
- **README and `docs/workflow.md` match the no-user-gate rule**: the agent passes each gate itself and finishes the film
  (they still said the user approves every gate and that autonomous mode stops at a draft); the Brief no longer lists a
  look question.

## [3.0.0] - 2026-10-28

### Added

- **The iso look in three.js** (`engine/three/camera.js`, `studio.js`, `references/looks.md`): `isoCamera(W, H)` (an
  orthographic camera looking along (−1, −1, −1), `k` px per unit), `isoFrame()` stations `{ target, k }` that
  `stations`, `route`, `travel`, `place` and `shots.js` play (the target pans, zoom in log, the view never tilts);
  `isoLook()` (three tones per face from one shared matcap, colour and clipping kept), `blueprintLook()` (faces in the
  ground colour, data marks kept) and `inkLines()` (edge lines that share the cut's planes) for `blueprint` and
  `cutaway`, `isoStudio()` (no lights, shadow, AO, tone mapping or DOF) and `cutaway(..., { flat })` for unlit caps. `selfcheck.mjs` proves the direction
  never changes along a route, the tone order, a cutaway on the iso material, ink lines cut with their mesh, blueprint faces and the dry rig.
- **Parallel lanes** (`SKILL.md` "Parallel by default", `docs/workflow.md`): which jobs start in one message at each
  step: preflight beside the topic question, reference measurement beside research (split into strands, one agent
  each), the voice take beside `SPEC.md`, `storyboard.md`, assets and music, the Step 7 scripts together, then the
  reviewer, the sound-off quiz and the second Set / Reality check together.
- **Express parallel build** (`express.md`): from 6 beats or 45 s, 2–3 builders write contiguous beat groups at once as
  sub-compositions, `SPEC.md` as the shared contract and no pilot; one seam check before the lints.
- **Automatic model and effort** (`SKILL.md` "Work fast"): one table gives every subagent job its `model` and `effort`
  (top / mid / light), and a job that fails its own check is replaced one notch up, effort first, then model.

### Removed

- **Studio's looks K, C, J, I, G, D and H** (breaking: `BRIEF.md` `look:` now holds a language name, a MAJOR bump).
  Studio uses Express's three languages instead (`references/looks.md`): C and I live on in `isometric-world`, K and
  J in `cutaway`, H in `blueprint` and the data furniture, D in the type. The Brief's look question (Call 2 item 5) and
  "More looks" are gone: the language is picked from the subject; a series kit's older look letter reads as
  `isometric-world`. Perspective lens sets, orbits, top shots and dolly-zooms are gone from `camera-motion.md`; look
  G's watercolour palette from `craft-rules.md`.
- **Nine Express design languages** (`engine/epic/languages/`): `retro-print`, `park-poster`, `naturalist-plate`,
  `hand-drawn`, `dark-glass`, `editorial`, `swiss`, `corporate-clean` and `neo-brutalist`. Express keeps `cutaway`,
  `isometric-world` (wide 16:9 and story 9:16) and `blueprint`; the picker falls back to `isometric-world` where
  `editorial` was the fallback, so every topic still gets a language.
- Leftovers of those languages: the retro-print misregistration recipe and swiss/brutalist/corporate notes in
  `engine/epic/illustration-and-texture.md` and `composition.md`; README's "eleven looks" (there are seven) and its
  missing `engine/epic/` line.
- Stale pointers: `look-build.md` to SKILL.md "Batch and parallelise" (now "Parallel by default"), `tokens.mjs` to
  "Compact at Gates 3 and 4" (now 2, 3 and 4), `camera-motion.md` §6.8 (that section is gone), `look-build.md` §7 (now
  "Sound effects and music"). `docs/workflow.md` said CI only checks syntax; it runs the merge gate.
- `tests/iso.mjs` existed but no gate step ran it; `gate.sh` runs it now.
- "isometric 3D" is no longer on Studio's banned list (`visual-direction.md` §1): Studio is to share Express's
  taste (blueprint, isometric-world, cutaway).

### Fixed

- `scripts/release.sh` tags the merged commit on `origin/main` instead of switching to `main`, which failed in a git
  worktree while another checkout held `main`.
- **Express no longer idles on the voice** (`express.md`): the builder writes its template from beat names at once and
  only the snapshot, `fill_times.mjs` and the lints wait for `audio/beats.js` (a watched run lost ~6 min to an
  `until` loop before the first write). Research is one round of up to 2 parallel agents with ≤ 6 searches and ≤ 8
  fetches each, briefed with the claim the film turns on (a thin 4/6 round forced a second, sequential one).
  No agent reads another video's folder (builders and the script alike).

### Changed

- **Golden eval 3.0.0** (`evals/golden/3.0.0/`): Every film is true isometric now (isometric-world first): the golden
  scene is revision 2, the flask on an iso slab, so 1.6.0 is not comparable.
- **Isometric always, `isometric-world` first, in Express and Studio** (`SKILL.md`, `references/looks.md`,
  `express.md`, `brief.md`, `camera-motion.md`, `visual-direction.md`, README, docs): `isometric-world` by default,
  `cutaway` (its close relative) when the film is about the inside of one thing, `blueprint` only when it rests on very
  detailed data; true isometric in all three (pan and zoom only). Studio builds them in three.js. In 9:16 the frustum
  follows the frame, sizes scale by min(W, H) / 1080 and a story path climbs the frame. The golden scene
  (`examples/golden/`, revision 2) is the flask on an iso slab with a flat hatched section; the next release's golden
  eval is a new baseline (not comparable with 1.6.0).
- **Every question is asked up front, in English** (`SKILL.md` principle 5 and "Language", `brief.md` Step 1): all
  AskUserQuestion text (question, header, options, previews) is English whatever the chat language, and the whole run's
  questions come in the Brief's back-to-back calls, so the user answers once and can leave. New Call 4 (extras): the
  second-language cut (no longer offered at the hand-off), photos of the user's own machine, permission for a recording
  or a cloned voice. Call 0 now also carries every install or first-launch consent and a voice fallback when VoiceStudio
  is not ready. Step 4 never asks which voice to audition and a missing asset is decided and logged, not offered; a
  question that still comes up later takes its default and is logged as "would have asked".
- The model table now carries an effort column; Studio builders run at high effort for the pilot and medium for the
  groups, assembly and fix rounds. Express builders, research and fix checks stay on the mid tier; text-only media
  screening moves to the light tier.

## [2.0.0] - 2026-10-28

### Added

- **Express objects without drawing code** (`engine/iso/`, DALANG's own, MIT). `forms.js`: shape families in metres
  (`lathe`, `extrude`, `sweep`, `gearOutline`, `solid`). `build.js`: an object written as data from its reference,
  parts of 16 forms at real size with `array` copies, a `skin` the cutaway slides off, `focus`, meshed gears turned by
  their tooth ratio, numbers driven by the timeline's `values`, pins returned per part, and a paint order taken from the
  parts' boxes so a plate never covers what stands on it. `model.js`: a CC0 `.glb` / `.gltf` (its `.bin` and textures,
  no dependency) drawn flat in three tones, one colour per material, sorted with the set; compressed meshes and
  models over 4000 triangles are refused. `examples.js`: four specs. `express.md` Step 5–6 tell the builder to write
  specs (or take one CC0 model) and to copy the whole folder; `tests/iso-build.mjs` runs in the gate.
- **Camera parallax in Express** (`engine/iso/parallax.js`): layers move by their depth factor with the camera, pan by
  depth × the move and zoom by the ratio to the power of depth, in the isometric canvas (`drawLayers`, one pan and zoom
  per layer, never a tilt) and in SVG / HTML (`applyLayers` on `data-depth` wrappers). `express.md` Step 6 sets 3–4
  layers, motion only with the camera, and the near layer as the occlusion wipe; `tests/iso-parallax.mjs` runs in the gate.
- **Cinematography for Canvas 2D** (`engine/iso/cinema.js`): keyed camera moves (`camAt`, eased, zoom in log),
  seeded `handheld`, speed ramps as story time (`ramp`), whip pans (`whip`) with shutter motion blur (`motionBlur`), and
  the finish in grade order (`makeFinish`: contrast, saturation, warmth, bloom, a light sweep, vignette, seeded grain,
  scope bars). `drawLayers` gains depth of field (`focus`, `aperture`, for a rack focus) and atmospheric `haze`.
  `express.md` Step 6 has the builder pick 4–6 techniques, each with a story job; `tests/iso-cinema.mjs` runs in the gate.

### Removed

- **Hyperrealism.** The Step 1 Realism question is gone; every film is stylized and true to how the subject looks
  and works. Looks A (cinematic photoreal), B (premium 3D studio), E (documentary collage) and F (real subject +
  motion graphics) are removed from `looks.md`, with the hyperreal light-and-material recipe; the letters of the
  remaining looks keep their names. `visual-direction.md` §1 loses the sourcing ladder for photos, footage and
  generated stills or clips, and its people-as-footage rule. `camera-motion.md` loses §6 (photo cut-out compositing,
  2.5D from one photo) and §9 (prompting generated stills); the other section numbers are unchanged, and §10 now
  takes every camera move from the 3D rig. Preflight no longer checks for a stock-video key (`PEXELS_API_KEY`,
  `PIXABAY_API_KEY`). `scripts/key_white.py` (keying product photos) and `evals/golden/1.5.0` (superseded by 1.6.0)
  are deleted. The camera toolbox drops its footage **[F]** and generated-clip **[G]** source tags, and the
  storyboard lint no longer accepts "footage" or "stock" as a real source.
- **The heavy Studio engine.** No physics engine and no bake: `physics.js`, `bakecore.js`, `bake-worker.js`,
  `bake.mjs`, `pool.js`, `bodies.js`, `mechanism.js` and the Rapier bundle (`rapier.js`, `@dimforge/rapier3d-compat`)
  are removed, with the bake-driven sound effects (`sfx.js`, `sfx.mjs`, `tests/sfx.mjs`). The organic systems go too:
  `fur.js`, `creature.js`, `cloth.js`, `water.js`, `wind.js`, `plants.js`, `particles.js`, and the examples `cat.js`,
  `lizard.js`, `chair.js` and `drivetrain.js`. An installed engine drops from about 4 MB to 2 MB. `selfcheck.mjs`
  keeps every check of the remaining modules, the transmission geometry included.

### Changed

- **Motion is posed from its cause.** Every 3D motion is a pure function of t: a fall from the place's gravity with an
  eased landing and contact squash, a push decelerating at μ·g, a part clamped to its stops, a driven wheel at the
  tooth ratio (`transmission.js`). `camera-motion.md` §5.2 is now "Contact is caused" and §5.3 "Hits, sound, blur"
  (sound on the computed contact time); the rubric's Craft test, `looks.md`, `look-build.md`, the engine README,
  `CLAUDE.md`, `README.md` and `docs/architecture.md` follow. Studio is offered as three.js 3D without "physics".

- The review rubric test "Realism" is now "Set" (the world around the subject at its real density, one style in
  every shot); "Reality" is unchanged. `qc.md`, `review.md`, `evals.md`, `lessons.md`, `README.md`, `CLAUDE.md` and
  `docs/workflow.md` follow. Autonomous defaults pick K for a made thing, C otherwise, H or D for an abstract topic.
- A series kit's `realism` line is no longer a channel field (`series.mjs`).

## [1.8.0] - 2026-10-28

### Added

- Express design languages: each beat is designed as a finished editorial infographic in one of nine scene-native languages (cutaway, isometric-world, blueprint, park-poster, naturalist-plate, retro-print, hand-drawn, dark-glass, editorial), picked by subject, with EpicInfographics' composition, data-vocabulary and chart rules (MIT, vendored unchanged in `engine/epic/`). The frame is a place, one object carries the data, one named composition pattern, an anti-slop look at the first frame, and a build order per beat (place, structure, data, hero last) with truthful motion. `isometric-world` stays on `engine/iso/iso.js`; the rest is inline SVG/HTML tweened by the GSAP timeline.

## [1.7.0] - 2026-10-27

### Added

- **No user gate, in either mode** (`SKILL.md` principle 5): after the Brief the agent passes Gates 1–4 itself
  (`--by agent`, once each gate's checks pass) and hands over the finished film; a change asked afterwards is a new
  round. The gates stay as the agent's checkpoints (order, staleness, Studio's benchmark).
- **Express mode, the default** (`references/express.md`, Brief Call 1 "Mode", `state.mjs`): a 30–90 s film in 20
  minutes of work at most. 2.5D illustration in HTML/SVG (layered planes, parallax, contact shadows, one key light,
  cutaways) instead of three.js; one builder that starts while the voice records; no asset search, reference board,
  style-frame check, benchmark, reviewer or 10 fps draft; every gate is the agent's, the user gets the finished
  film. Facts, provenance tags, per-word timing and true shapes stay. `BRIEF.md`
  `mode: express` makes `state.mjs next` print express.md for Steps 5–7 and Gate 3 skip the benchmark. Studio is the
  other answer, unchanged.
- **Express look: the isometric infographic** (`references/express.md` Steps 5–6, `engine/iso/`): true isometric,
  three tones per face and no outlines, colour as a legend, label pins, cutaways, Isotype numbers, motion led by a line;
  drawn with lemo-opuscar's dependency-free Canvas 2D engine, vendored unchanged with its MIT licence
  (`engine/iso/iso.js`, `tests/iso.mjs`), redrawn from the GSAP timeline on every seek. No three.js in Express.

### Changed

- **SKILL.md a third shorter** (18.4 → 12.8 KB, the description too): the same rules, gates and model table in fewer
  words; it rides along on every call of a film and its description in every session's skill list.
- **Step 5 planner subagent** (`look-build.md` Step 5, `SKILL.md` model table): a new subagent on the strongest model
  reads the look, direction, craft and camera rules and writes `SPEC.md` and `storyboard.md`; the main agent reads only
  those files, so ~100 KB of rules no longer ride along on every later call. Same rules, same model, same output.
- **A leaner videos folder** (`workspace.mjs init`): besides plugins and MCP servers it switches off, in the folder's
  `.claude/settings.json` only, the user skills a video never uses (`skillOverrides`), the CLI's bundled skills
  (`disableBundledSkills`) and the account's claude.ai connectors (`env.ENABLE_CLAUDEAI_MCP_SERVERS=false`); `status`
  lists them, `--keep` keeps any, `undo` restores the file. The saving is checked with `workspace.mjs measure`.

- **Releases in one command, no waiting** (`scripts/release.sh x.y.z`, `CLAUDE.md`, the release notes above): it moves
  `Unreleased` into the version, pins the README, merges the release PR at once and tags it; no local gate and no CI
  wait (CI still runs on `main`, the `release` workflow still refuses a broken tag). The golden eval runs only when a
  release changes how films look.

### Fixed

- **Background output read by bytes** (`SKILL.md` "Small tool output"): `tail -c 1500 <file>`, never `tail -5`; one
  progress-bar line turned a five-line tail into ~7k tokens that every later call re-read.
- **Fact research on the mid tier, always** (`SKILL.md` model table): a technical topic no longer moves it to the
  strongest model; sources come back with every number and Gate 1 settles a contested one.
- **A flagged sentence names its words** (`tts_timestamps.mjs`): `heard ≠ script: heard "…" missing "…"` in the take
  log and the retake warnings, so a respelling needs no look into `narration.response.json` or `words.json`.
- **Media search no longer stalls a film** (`find_media.mjs`, `look-build.md` Step 5): `--query "a|b|c"` runs every
  query at once, each into its own folder, instead of one call per query in a shell loop; Openverse and Commons are
  asked at once; each source has `FIND_MEDIA_SOURCE_S` (default 45) seconds in all, then a WARN + rerun.
- **Fact research has a budget** (`SKILL.md` model table): at most 8 searches and 15 page fetches; a number still
  unsourced comes back `[unknown]` for Gate 1 instead of more fetching.
- **Compact at Gate 2 too** (`SKILL.md`): research, script and take fill the context before the look and the build
  start re-reading it on every call.

## [1.6.0] - 2026-10-27

### Added

- `evals/golden/1.6.0/`: the golden release eval against 1.5.0, 0 flags: render time, detail, shadow texel and stillness unchanged, the three frames identical (this release does not touch the golden scene).
- **Machine parts** (`engine/three/parts.js`): a mechanism for look K assembled from parts at their standard
  proportions instead of modelled: bolt (ISO 4017, ISO 261 pitch), nut (ISO 4032), washer (ISO 7089), deep-groove ball
  bearings 608 and 6000-6204 (raceway grooves, balls rolling at the cage speed), a compression spring that compresses
  its active coils evenly between solid and free with its rate from G d^4 / 8 D^3 n, a shaft, a control knob, a
  housing, and `xray()`, look K's shell (its own transparent material, drawn after the parts, silhouette edges, left
  alone by attention ghosting). A size outside the tables is refused. Self-check: table sizes at two scales, a nut
  clearing its bolt, balls in their grooves without overlap, the spring's limits and length, a shared material never
  turned into a shell, a rounded housing keeping its outline (RoundedBoxGeometry steps under the edge threshold lost
  it). The builder brief orders a made thing's sources: engineering data, a found model, these parts, custom geometry
  last.

- **Look K, Technical clean** (`looks.md` row K and its recipe, `brief.md`, `SKILL.md` autonomous mode): a real mechanism
  at real proportions with its housing in x-ray instead of a cut, near-monochrome greys and one accent on the part the
  narration names, soft studio light and a contact shadow on a light sweep, no textures, wear or set dressing; one model
  carries many shots and 2D cards carry the facts. It is the first, recommended stylized look for a made thing (how a
  machine, tool or device works, what is inside, why it fails) and the autonomous default there: clearer to read and far
  cheaper to build than a dressed set. It keeps real shapes, scale and physical motion. Look J's overlay details moved to
  its recipe so the look table stays in its reading budget.
- **Shots from data** (`engine/three/shots.js`, `examples/torch-shots.js`, self-check): a film's builders write the set
  and one shot per storyboard row as data (beat, action, transition, camera keys, cut, highlight, text band, labels,
  dimension lines, a `custom` hook as the escape hatch); one tested runner plays it. Every time is a beat or word cue,
  never seconds; a missing beat, an overshooting camera key, a label or dimension off the frame, a window under its read
  time and a shot where the subject does nothing are refused before a frame is drawn; physics stays the bake's. The
  torch's three style frames rebuilt from data give the same camera and the same draw calls as the hand-written frame.
  `look-build.md` Step 6 ("Shot data first", builder budget "Data before code"), `SKILL.md`, `README.md` and `docs/` in step.
- **Token report at every gate** (`scripts/tokens.mjs`, `state.mjs approve`, `tests/tokens.mjs`): turns, tokens and the
  largest context of the main agent and of each subagent, read from Claude Code's own transcripts (no new dependency),
  written to `review/tokens.json` and recorded in `state.json` with each approval. A builder over the budget (default
  120 turns or 250K context) is a WARN row and exit 3; a main context over it says /compact is safe. A session run in a
  parent folder counts only the subagents that name this project. No transcript, or none readable, is NOT CHECKED
  (exit 2), never "no tokens"; it never blocks a gate.
- **A stopped voice take resumes** (`scripts/tts_timestamps.mjs`, `voice.md`, `script-voice.md` §4,
  `tests/retake.mjs`): every chunk is kept in `audio/.tts-parts/` under a hash of its text and settings, beside the chunk
  plan, until the take is transcribed, so rerunning the same command after a 503, a dropped request or a closed laptop
  speaks only what is not on disk. Before, a slow model's take that stopped near the end started over, and agents
  wrote their own resumable generation scripts, which cost hours per film.
- **Heavy-model take check** (VoxCPM2): before a take the backend must answer `/health` (no answer: another job holds
  it, `WARN … rerun`, exit 3, nothing spoken) and free memory is read (under 4 GB: a WARN and 60-character chunks;
  unreadable: a WARN, never MISSING). During the take: minutes left, the remaining chunks shrunk after one took over
  half the compute limit (`DALANG_VS_LIMIT_S`, default 300 s), a chunk that answered 503 retried in halves.
- **Clipped sentence starts are flagged** ("clipped start"): a generated take is also transcribed once without the
  script as prompt, because the prompt makes Whisper hear a stray syllable or a lost first consonant as the written
  word. `--retake auto` re-speaks those sentences with the others, in one batch.

### Changed

- **Room in the 60 KB reading budget** (`scripts/state.mjs` reading list, `script-voice.md`, `look-build.md`): Steps
  0–8 read 60.0 KB, so any added line in a step's text failed the gate. Two blocks that only matter when used move to
  look-up sections the step points to, with their text unchanged: Step 4's voice sources and outputs (no saved profile,
  a voice from a clip, dialogue, the user's own recording, the output files) to "Voice sources and outputs", and Step 6
  item 7's sound-effect and music sources, licences and fitting to "Sound effects and music". Steps 0–8 now read 56.4 KB.
- **Builder budget** (`SKILL.md`, `look-build.md` "Builder budget", `review.md` §3): every job gets a new builder briefed
  with the last report, never a resumed one, because each turn re-reads the builder's whole context and a long-lived
  builder was what burned a film's tokens (hundreds of turns at half a million tokens each). Every builder brief carries
  the budget: a round's edits batched in one message then one snapshot, at most 3 snapshot rounds per job, a round's
  stills read as one `strips.mjs --frames` sheet, no file read twice.
- **Every look one click away** (`brief.md` item 6, `looks.md`): AskUserQuestion holds 4 options, so the visual-style
  question offers the 3 best-fitting looks and "More looks", which opens a second question with the rest; before, the
  others were only named in the question text and easy to miss. A stylized slate for a made thing always holds J.
- **A dropped VoiceStudio request is BUSY, not FAILED** (`tts_timestamps.mjs`): a reset or no answer in 5 minutes is
  retried once, then `WARN … rerun` and exit 3, like a 503. Before, it failed the take and agents restarted the app.
- **A new take keeps the last one**: before a full take overwrites the narration, the previous audio and its response
  move to `audio/takes/<n>/`.

### Fixed

- **Kokoro guard on older Pythons** (`scripts/kokoro_tts.py`): Python 3.12 (the Linux CI's) starts a multiprocessing
  child through `_posixsubprocess.fork_exec` with no audit event, so a spawn or forkserver child slipped past the guard
  and the gate failed on `main`. The helper now raises that event itself before the real call; `tests/kokoro-helper.mjs`
  passes on 3.12, 3.13 and 3.14.
- **Joining parts of different sample rates** (`tts_timestamps.mjs`): each part is resampled to 24 kHz mono before
  the concat, which read every part at the first one's rate, so a 48 kHz speech part beside 24 kHz silence (a dialogue
  pause) played at the wrong speed.

## [1.5.0] - 2026-10-27

### Added

- `evals/golden/1.5.0/`: the first committed golden release eval (frames, `sheet.jpg`, `metrics.json`, `diff.md`) of the fixed golden scene; later releases compare against it. No earlier version, so nothing flagged.
- **Fields and optics** (`engine/three/fields.js`, `optics.js`, `examples/magnet.js`, `examples/straw.js`): invisible physics
  drawn by its law and never by hand. `fields.js` holds static electric and magnetic fields in SI units from point
  charges, dipoles, straight wires, current loops and bar magnets (a uniformly magnetised block as two pole sheets, `Br`
  from the film's model with a source and no default), superposed. `fieldLines` traces lines by RK4 from seeds spaced by
  flux (a Fibonacci sphere round a charge, equal area on the N face, equal flux across a loop's disc), so in the 3D set
  line density is field strength; a hand-picked or planar set shows direction only and says so. Lines grow on cue
  (`reveal(u)`), are traced again when a source moves (`at(t)`, pure of t) and draw as `teach` (on top of the world, with
  arrowheads) or `world`. `filings` lie along the field's in-sheet component and a `compass` needle turns by the field's
  torque with inertia and damping (a fixed-step cache, so `at(t)` is order-independent). The self-check asserts the
  share of a dipole's lines crossing its equatorial plane beyond a radius against the flux law and the density falling as
  1/r³, Coulomb's field, a loop on its axis, a long wire with the right-hand rule, a bar magnet's far field as a dipole
  of moment (Br/μ0)·V, filings along the field (parallel to the axis on the equator), a compass settling along B and
  the same value whichever time is asked first, a moving source re-traced, lines revealed on cue, and the refusals.
  `optics.js` (`examples/straw.js`) makes light a subject: rays traced through lenses, mirrors, prisms, a flat interface
  and any closed mesh of the set by Snell's law with the Fresnel split and total internal reflection, the index of each
  medium from a cited table per wavelength (air, water, BK7, fused silica; a custom index is refused without a source),
  so a prism spreads a beam and a lens focuses blue nearer than red. `bundle` traces a real beam (a torch, the Sun) and
  reports the focal length and image point in metres for the film's numbers model; `apparent` gives where a submerged
  point is seen through a flat surface. `drawRays` draws `teach` rays (clean tubes and arrowheads on top of the world,
  growing on cue) or `world` light shafts in dust (which need a stated `dust` fraction, else no shaft) and `caustic` the
  bright spot where a lens concentrates a beam, as bright as the light is concentrated (the source power is a unit: a
  beam of power 2 looks like the same beam of power 1, and `minPower` is a share of it). The straw example draws a
  glass of water bending a straw at the position the eye sees it, from the same law, and refuses a view through the
  side wall. The self-check asserts air into water at 30° against asin(sin 30°/n) (to 0.1° and exactly with the same
  index), the Fresnel share at normal incidence and at 30°, total internal reflection past the critical angle, a thin
  and a thick lens's traced focus against the lensmaker's and thick-lens formulas, blue focusing nearer than red, a
  mirror's focus at R/2, a prism's minimum deviation 2 asin(n sin A/2) − A and its dispersion, a ball traced through a
  moved (across the ray too) and scaled mesh against the analytic deviation, apparent depth (a point on the surface
  that rounds a hair above it included), faces that cross at the rim and a view through the straw glass's side wall
  refused, the source power cancelling out of the caustic and the drawn rays, rays growing on cue, a caustic smallest and
  brightest at the focus, the straw drawn at its apparent position, and the refusals.

- **One light and render rig** (`engine/three/studio.js`): `studio(renderer, scene, camera, { look, route })` sets the
  colour pipeline (sRGB, AgX or Neutral, stencil for cutaways), a RoomEnvironment, key/fill/rim from a preset (`warm`,
  `window`, `overcast`), N8AO, optional depth of field and SMAA, replacing the rig each film wrote by hand. The key's
  shadow frustum is refitted every frame to what the camera sees (the part of the set inside the frame's pyramid, the
  ground and props far behind the target included, since a fragment outside the shadow camera is lit), so a close-up's
  contact shadow is as fine as the region it shows (texel <= 1 mm while the frame sees under about 4 m of the set) while
  every caster stays in range; the AO radius and the DOF `focusRange` (typed in metres) come from the scale, never as
  typed units. `render`/`frame` place the camera at the pose and the frame is the rig's own camera (`oner.render`
  refuses another). `examples/oner.js` takes `studio` and renders through it; Step 6 says to use it.
- **Creatures that walk and climb** (`engine/three/creature.js`, `examples/lizard.js`): an animal acting by its own
  anatomy. `gait(name, { h, v })` gives the stride and its frequency by dynamic similarity (Froude number, never typed
  per film) for four named gaits with cited footfall orders and duty factors: `walk`, `trot`, `sprawl` (a lizard's
  trunk bends side to side) and `tripod` (an insect). `rig(body, { legs, spine, cling, head, breath })` puts 2- or
  3-segment IK legs on a `fur.js` `sweep` body (swept tubes, trunk sway, breathing, a head on a pivot), and
  `path(creature, curve, { scene, speed, gait })` plants every foot by raycast on the set's own solids: floors, and
  walls and undersides for an animal that clings. A foot never slides while loaded, the body lies along the surface
  normal, and a leg that cannot reach, a missing surface or a steep one without `cling` is refused with the fix named.
  The walk reports its contacts: `steps` (touchdown time, leg and object, for sound cues), `touching(t)`,
  `together(a, b)` (the first t of the walk two objects are touched at once, for the model; the walk's own start when the
  first steps are already on both; `null` if never) and `look(target, t0)` for the head. The footholds' times are finite,
  inside the walk.
  `fur.js` `sweep` now records its spine for a rig. Self-check: a planted foot drifts under 1 mm, the stride
  frequency halves at four times the leg length, a creature crossing from a floor to a wall keeps every planted foot
  on a collider; every refusal (a leg that cannot reach during the walk, a foot that finds no surface where the body
  does, normals that cancel, a curve into the surface, more than 5000 strides, `gait`, `look`, `rig`, `wallClimb`
  inputs) has a case with its legitimate counterpart. The module and the example refuse only through `refuse(id,
  message)` (the Error's `refusal` is the id), and the self-check reads both sources: a throw outside it, an id on two
  sites or an id without its own case fails the gate. Not covered: gallop, jumps, flight, people, swimming, the body bending over a corner. Docs in step:
  engine README (module, example, usage), README, `docs/architecture.md`, `camera-motion.md` §5, `looks.md`.

- **Look J, Engineering cutaway** (`looks.md`, Step 1 in `brief.md`): a stylized technical-illustration look with its own design system for "how it works / why it breaks / what is inside" topics: a real engineered thing opened at real size on a light-grey ground and a gridded mat, the engineering lens set (70, 100, 135 mm on a 36 mm gauge, 3/4 high angle, subject low), a fixed text band, yellow pill labels (at most 3 a frame), dimension lines (drawn on the frame over the parts, so nothing hides them), accents with one meaning for the whole film, and current drawn in the world (a nearer part hides it). Rules in step: `visual-direction.md` §5 (the label pills are not chips; the look's hue legend), §12 (text band, pill labels) and §13 (dimension lines); `camera-motion.md` §11.2 (the lens set); reference piece `engine/three/examples/torch.js`.

- **Engineering-cutaway toolkit in the engine** (`type.js`, `quantity.js`, `examples/torch.js`): `dimension(ctx, a, b,
  { camera, text })` draws a drafting-style dimension line (extension lines, arrowheads, a monospace value that never
  reads upside down) inside the label safe area: it stands off on the other side, then closer, and when neither fits it
  draws nothing and says why; `pinLabel` takes `{ pill }` (dark text on a coloured pill, a dark leader ending in a
  ringed dot) and `{ top }` (stay under the text band); `textBand()` draws a tracked monospace kicker, a bold headline
  and a status tag on a light scrim, all in the label zone at the minimum sizes; `recordBox()` lets another module's
  text reach `layoutFrame`. `examples/torch.js` is the reference piece of the look: an opened small device at real
  size, cut along its axis, with a dc flow caused by the model, the look's lens set (70, 100, 135 mm on a 36 mm gauge),
  three style frames and the view offset that sets the subject low. The self-check proves every text of the three
  frames is inside the safe area.

- **A CC0 3D-model source rung** (`find_media.mjs --type model`): real anatomy fast instead of modelling a made object
  part by part. It searches Poly Haven, Smithsonian Open Access 3D (CC0 items only, joined by exact title to the Open
  Access record, and only when that title is one-to-one: several scans or several records sharing a title are dropped
  and counted apart, never licensed by another object's record; the join is one check, and it holds only in an answer
  that states its full match count as the rows it sent, so an answer with no count, or a count it cannot read, is a WARN
  to rerun, never a listed CC0), NASA 3D Resources (public domain, read from the repo's own README) and Kenney (CC0, read from the pack
  page; the `.glb` entries are read out of the pack's zip by name, nothing is extracted to disk). Each licence is read
  from its source, never assumed: NC, ND, "usage conditions" and unknown are dropped, an unreadable source is a WARN to
  rerun (exit 3), never "nothing matched"; a missing `unzip` (Kenney) is said as a missing tool that a rerun will not fix
  (exit 3 when nothing else was found), with use another source or ask the user before installing, never "did not answer".
  It prints the size on disk, the triangle count and the size the source
  states, and makes a contact sheet from the sources' thumbnails; an included file with an unsafe path, or one that is not texture data (jpg, png, webp, bin, ktx2, mtl), skips its model,
  and `--take` refuses an include that would replace a different file already in the project.
  `--take ... --as assets/models/<name>.glb` writes the `ASSETS.json` rows (a `.gltf`'s textures each get one) and
  prints the `kit.model` line. `kit.model(path, { palette, kinds, real })` gives a found model its own palette and
  surface kinds, merged over the kit's, and its stated size, which `scaleAudit` checks (none: listed unchecked);
  Draco-compressed glTF loads (Smithsonian ships only that; the decoder is copied by `build.mjs` and listed in
  `.engine.json`, Apache-2.0). `visual-direction.md` sourcing ladder: a made object with internal anatomy tries a CC0
  model before modelling by hand. Cases 20-27 of `tests/find-media.mjs`; a self-check case for the engine side.
- **Gate 3 benchmark** (`review.md` "Benchmark review", `measure_reference.sh` reference board, `state.mjs approve 3`):
  the style frames are scored side by side against a reference board by a fresh subagent, 1-5 on seven rows (detail
  density, material truth, light and shadow, text system, overlays caused by physics, framing, macro quality), text
  only. The board is `measure/reference-board.jpg` (8 stills on one sheet, from `measure_reference.sh`; local only,
  never published or committed; two references: one folder each, `measure/<name>/`, since a run first clears the
  frames, contact sheets, board and Node measurements an earlier run left, so a shorter film is never boarded with the
  leftover stills of a longer one); with no reference it is the golden sheet. A row more than 1 point behind is a fix
  before the build. `state.mjs approve 3` refuses (user and agent alike) without `review/benchmark.md`, with a row
  behind, a row absent, twice or with a score it cannot read, and with a verdict older than the style frames; it
  records the scores in `state.json`, and the main agent logs them in `PRODUCTION.md`. An approval given before this
  stays fresh. `qc.md` keeps the defect review separate. Gate step `tests/benchmark.mjs`.
- **Transmissions** in the engine (`mechanism.js`, `transmission.js`): `gear` (tooth counts or ratio, internal), `belt`
  (radii or teeth, slip, an idler on the back), `chain` (tooth counts, shifts to another cog at a cue) and `cam` (a lift
  profile, the follower held on it) tie one part's motion to another's at the real ratio in the same bake, hashed into
  its cache key, so a film never hand-animates the second rotation off the real ratio. Two-way: a driven inertia comes
  back to the driver as s²·I, `torque()` reports N·m, a latched wheel holds the train. `hinge` takes `min: -Infinity,
  max: Infinity` for a free axle. `transmission.js` draws them at real size: involute spur gears at a real module and
  tooth count that mesh at the centre distance (an interfering pair is refused with the fix named), belt and chain
  loops, the centre for a whole number of links, links placed at the phase the driver's replayed pose gives.
  `examples/drivetrain.js`: a bicycle drivetrain changing gear under the rider's pedal torque. Self-check: 12:36 turns
  at exactly 1/3 the other way, links move at ω·r, meshing gears never interpenetrate over a turn, the 42:14 wheel
  turns 3 times as fast as the cranks and 2 after the shift to 21, identical across two bakes. Not covered: bevel and
  worm gears, a rack, linkages. A coupling's `ratio()`, `angle()` and `torque()` are stored with the bake
  (`report.couplings`) and read from it, so they match on a cache hit and on a live bake; a cam profile is hashed by its
  values as well as its source (a profile closing over a lift is not stale); `spring` refuses a free axle and stops past
  a half turn.
- **Second-language cut** (`scripts/beats_lint.mjs`, `fill_times.mjs --lang <code>`): every animation time is a named
  beat, so a second narration with the same beat names re-times the film from the same storyboard. `beats_lint.mjs
  narration.txt narration.<lang>.txt` exits 1 with `file:line` when a beat is missing, renamed, extra, out of the
  first narration's order, unnamed, has an invalid or repeated name, or a brace is unbalanced (words, sections and line
  breaks may differ); an unreadable file is a warning (exit 2, rerun), never "not found". `fill_times.mjs --lang <code>`
  takes the times from `audio/<code>/` and switches each local `src` / `href` to its language variant (`audio/x` →
  `audio/<code>/x`, a missing one fails; `name.ext` → `name.<code>.ext` when it exists, and a missing one fails for
  `narration.*` and `strings.*`, the narration the film plays and the on-screen words); without `--lang` the output is
  unchanged. Both have a gate step (`tests/beats-lint.mjs`, `tests/fill-times.mjs`). The steps: `BRIEF.md`
  `second_language` (optional; the hand-off offers it once, never in autonomous mode unless named), Step 3b (translate
  `narration.txt` for the ear into `narration.<lang>.txt`, same beats), Step 4 again into `audio/<lang>`, Step 6 with
  `strings.<lang>.js` for on-screen words and `fill_times.mjs --lang`, a draft QC (timing lint, captions, loudness; no
  re-review of the look) and `final.<lang>.mp4` + `narration.<lang>.srt`. Described in new sections of
  `script-voice.md`, `look-build.md` and `qc.md`, which the reading list indexes (Steps 1, 6 and 8, outside the 60 KB);
  the hand-off gains one sentence.
- **Layout numbers for canvas text** (`scripts/layout_lint.mjs`; `engine/three/type.js` `layoutFrame`, `camera.js`
  `heroBox`; `strips.mjs` `--layout`; `references/review.md` step 2): captions, labels and range cards are drawn on the
  film's 2D canvas, which `hyperframes check` (it reads the DOM) cannot see, so overlap, edge clipping and size were
  judged by eye from stills. `type.js` now records the boxes it drew (kind, text, px box, font size) and `camera.js`
  projects the hero's bounding box; the composition calls `layoutFrame(ctx, t, { format, hero })` last in its frame
  function. During its capture `strips.mjs` receives the records on a local port (127.0.0.1:47614, as `bake.mjs`),
  writes `review/strips/layout.json` and adds a `## Layout` section to `index.md`: one line per box per frame, then
  the lint. The lint flags, each with its time: a box outside the format's safe area, a text box covering more than
  10 % of the hero box (`--hero-overlap`), a label under 36 px or a caption under 54 px (at 1080 px on the short side),
  and a caption over a label. Frames with no record are listed as not recorded, never as clean; a busy port or an
  unreadable file is a WARN. The reviewer reads the numbers before the stills. A fixture test runs in the gate.
  The build step (`look-build.md` Step 6 and its parallel build, `craft-rules.md` §6) tells the builder to call
  `layoutFrame` last in the frame function, and the ready example `examples/golden/index.html` does, so a film built
  from the skill reaches review with numbers. `--hero-overlap` with no value, and `strips.mjs --layout` with no file,
  are usage messages (a WARN, and exit 1), not a crash or a silent fallback.

- **Lean video workspace** (`scripts/workspace.mjs`; `brief.md` Step 0 "Lean workspace" and Call 0; preflight's
  `Workspace` row; `SKILL.md` "Work fast"): plugins and MCP servers a video never uses are re-read on every model call.
  `workspace.mjs init <folder>` lists what is on (a guessed job each) and proposes the video set (DALANG, HyperFrames,
  media-use, a browser; `--keep a,b` keeps more). It writes nothing without `--yes`; with it, only
  `<folder>/.claude/settings.json` (`enabledPlugins` false, `deniedMcpServers`), unknown keys kept, old file saved as
  `.claude/settings.json.bak` (plus a `.bak.dalang` hash file: a `.bak` that `init` did not write is refused, never
  adopted, restored or deleted); `undo` restores it byte for byte, `status` shows the state. In a git repository it also
  reads the repository root's `.claude/settings.local.json` (and a worktree's main checkout), which can turn items back
  on. Preflight reports a folder that is not lean as INFO (asked in Call 0) and settings it cannot read as WARN, never
  as "nothing enabled". `workspace.mjs measure <before> [after]` reads the first model call's context from a session
  transcript or a one-turn `claude -p --output-format json` result, so the saving of a lean folder can be measured
  (not yet measured: the ~85k figure is from the heavy setups of the runs that prompted this). Gate step
  `tests/workspace.mjs`.

- **Kokoro-82M, a light commercial-OK local voice** (`voice.md` "Setup — Kokoro"): `tts_timestamps.mjs --engine kokoro
  --language <en|en-gb>` speaks one sentence per call through `scripts/kokoro_tts.py`
  (Apache-2.0 weights), joins them with pauses and takes every word time from `align.py` forced alignment (no
  estimate ships; a language without an aligner model stops with its note). Only en and en-gb: their text front end is
  the one proven to fetch nothing on first use. Every other language (es, fr, it, pt-br, ja, zh, hi) is refused with a
  message naming VoiceStudio, before anything runs: never MISSING, never a download offer. ja, zh and hi are a recorded
  follow-up. `--retake changed|<n>|auto` work as on a
  VoiceStudio take. It never downloads or installs on its own: outside `--download` one audit hook in the helper refuses every network
  reach and child process, whatever library asks (misaki would pip-install the spaCy model unasked), exit 6. A host counts as local by its address (a loopback literal, or the name `localhost`), never by how a name looks (`127.mirror.example` or `x.localhost` can resolve to a public address), and a child started through multiprocessing (spawn, forkserver, a process pool) is refused too: it is an unguarded Python. The weights
  and the ~13 MB spaCy `en_core_web_sm` text model come once with `--download`, only with the user's consent, who is told the whole install first (`pip install kokoro soundfile torchaudio` pulls torch and the rest: ~0.3 GB on macOS arm64, ~3 GB on Linux with CUDA wheels, plus the ~330 MB weights);
  `--check` and preflight report the text model. Kokoro lives in a separate `DALANG_PYTHON`, never VoiceStudio's venv (unset = MISSING; the venv is recognised through a symlinked folder too). Exit 5
  (not installed) is only a missing `kokoro` / `soundfile`, exit 4 only a weights miss: a broken torch, an unreadable
  cache or a missing libsndfile is exit 1, WARN "rerun". Preflight
  gains a `Kokoro (voice)` row and `--check-kokoro` (MISSING with size and licence, WARN "rerun" when unreadable),
  `voice_licences.mjs` a Kokoro-82M row, and Brief Call 0 offers it next to VoxCPM2 for English and a
  monetised channel. Checks: `tests/kokoro.mjs`, `tests/kokoro-helper.mjs` (the real helper vs fake packages), `tests/preflight-mock.mjs`.
- **Pilot, then shot groups in parallel** (`look-build.md` "Parallel build"; `SKILL.md` "Batch and parallelise"): a film
  of 3 or more shot groups builds its first group (the pilot) in the main context, renders it as a 10 fps draft and has
  a subagent check it against the style frames; then one subagent per other group, all in one message, gets `SPEC.md`,
  its storyboard rows, the pilot's files (read-only) and the set modules, and returns paths and a verdict, never code.
  Shots that share one physics bake or one continuous camera move are one group. Each group is a HyperFrames
  sub-composition (`src/compositions/<group>.tpl.html` -> `fill_times.mjs` -> `compositions/<group>.html`, local
  times); the main context only assembles the hosts, order and audio, and reads a group's code only when its check
  fails. `evals.md` gains a 6-group golden brief.
- **`strips.mjs --crops`** and `--crop X,Y,W,H`: one zoomed subject crop per shot (`crop-NN.jpg`, 640 px wide) cut by
  ffmpeg from the shot's middle still, listed in `index.md` under `Subject crops`. The box is a fraction of the frame
  (default the centre half); a shot without a still gets no crop, a `WARN` and exit 3. Stale crops are removed on a
  rerun; `--dry-run` writes none. Check: `tests/strips.mjs`.
- **`scripts/scopes.mjs`**: per cut, YMIN / YMAX / YLOW / YHIGH / SATAVG / HUEAVG from ffmpeg `signalstats` over the
  middle 60 % of the cut, bands for crushed blacks, clipped whites and hue jumps, `--cuts`, `--scene`, `--limits
  tv|pc`, `--png [dir]` (PNGs for flagged cuts only). Exit 0 inside the bands, 3 a cut is flagged, 2 unreadable (WARN,
  rerun), 1 usage. Check: `tests/scopes.mjs`, a gate step.
- **Golden scene evals**: `examples/golden/` is one fixed scene built only from engine parts (an opened flask at real
  size, three stations: wide, medium with a flow arrow, macro with depth of field, plus caption, labels and a
  dimension line). `scripts/golden.mjs` renders one 6 s / 30 fps clip, cuts the three frames from it, records render
  time, stillness, detail density in the macro and the shadow texel size per station, writes
  `evals/golden/<version>/` (frames, `sheet.jpg`, `metrics.json`, `diff.md`) and diffs against the previous version
  (per-frame difference, metric deltas). Worse beyond tolerance (render time +25 %, detail -15 %, shadow texel +25 %,
  stillness +5 points) is a FLAG: exit 3 blocks the release until explained (`--explained "<why>"`); a baseline of
  another size or fps is "not comparable", not "no change". The release checklist (`CLAUDE.md`) runs it; the render
  is release-time, the gate runs only the Chrome-free `tests/golden.mjs` and `tests/golden-scene.mjs`.
- **`POST.md`, the post description** (`qc.md` Step 8, "Post description (POST.md)"): the hand-off writes a companion
  post text from the script and model: the hook as a question with the short answer, the model in plain sentences
  (numbers dated, a result labelled "our model, not a measurement"), both failure modes, a self-check the viewer can
  do, one save/share call to action and a next-topic question, one sources line and 4-5 hashtags, in the narration
  language, at most about 1,800 characters. A CC BY credit line only if the user chose it; no meta lines about tools
  or AI. `evals.md` checks that its formula reproduces the film's number.
- **Review strips diff between rounds** (Step 7): `scripts/strips.mjs --against <previous round dir> --targets
  <shots|beats> [--threshold <pct>]` compares each still with the one at the same time in the previous round and
  labels it in `index.md` (`Change` and `Diff` columns, plus a block listing possible regressions and targeted shots
  with no change): `unchanged` (the earlier verdict stands, the reviewer skips it), `changed (targeted)` (re-review)
  or `changed (not targeted)` (a possible regression, also a `FLAG:` line). Heuristic: both stills as 64x36 gray via
  ffmpeg, changed from a score of 1 % (mean difference, or a quarter of the worst 8x9 block's, so a small local change
  counts); an unreadable or earlier-less still is never `unchanged`. A regression does not change the exit code; a
  still that cannot be compared exits 3. Each kept round gets its own number (`mv review/strips review/strips-<n>`); a `--against` folder that holds an older round with the last one nested inside (a repeated `mv` onto an existing name) is refused. `review.md` §How step 4 and `qc.md` Step 7 use it. Test: `tests/strips.mjs`.
- **Series kit** (`scripts/series.mjs save|list|apply|note`, opt-in): a channel's look, voice and rules are saved once and each
  new video of the series starts from them. `save <name> --from <project> [--file <rel>]...` writes
  `~/.config/dalang/series/<name>/` (`DALANG_SERIES_DIR` overrides the root) with `SERIES.md` (the channel-level `BRIEF.md`
  lines: platform, fps, realism, look, energy, audience, voice, sign-off; the file list; the Channel rules) and the named reusable
  files (overlay / HUD module, caption config, tag vocabulary, palette tokens). It refuses scene modules, per-video files, env
  files, paths outside the project and symlinks. `apply <name> [project]` copies the files, pre-fills `BRIEF.md` (`series` plus
  the kit's lines it does not already have) and prints the Channel rules; a differing file needs `--force`, and a scene module is
  never copied, even from a hand-edited kit. `note <name> "<rule>"` records channel-level feedback in `SERIES.md`, not in the user's
  private memory. Every subcommand reads the file system through one choke point: anything it cannot read (a locked
  folder, a file it may not open) is WARN + rerun (exit 2), never "no series", "not found", "0 files" or a refusal. Brief Step 1 asks "Which series?"
  first when kits exist; a video outside a series still carries nothing over. Test: `tests/series.mjs`, in the merge gate.
- **Storyboard lint** (Step 5, before Gate 3): `scripts/storyboard_lint.mjs [project] [--energy calm|balanced|punchy]`
  reads the shot table of `storyboard.md` and flags, each at `storyboard.md:line row N`: an empty "Subject action" or
  "Camera" cell, 3 or more rows in a row with the same size and angle, the share of rows whose focal point is text only
  over the energy's limit (Calm 10 %, Modern balanced 15 %, Punchy social 25 %; a heuristic) and an average shot over
  the energy's limit (`visual-direction.md` §3). Exit 1 = a flag, 2 = cannot check (WARN, never OK), 0 = OK. Test:
  `tests/storyboard-lint.mjs`, in the merge gate.
- **Choice-explainer arc** (`script-voice.md` "Arc templates"): the eight beats of a "which size, plan or option to
  pick" film (hook with an open loop, the misread unit, a unit ladder, a rule applied to the viewer's own case with
  one adjustment per condition, both failure modes by physical cause, a payoff that answers the hook, the decision as
  conditions, a reframe that returns to the first frame). Step 3 gains the spoken-number habits (round in speech and
  exact on screen, one number per clause, every number with its comparison, the viewer's case before the general
  rule) and a Gate 1 check for any arc: each number has its comparison (the checks that the hook is answered and the
  reframe restated stay in the choice explainer's own Gate 1 line, so "hook + open end" and the failure explainer
  are not forced to close a loop or add a reframe). Brief Step 1 gains an optional series sign-off (`signoff` in
  `BRIEF.md`: from the request, never invented), said once after the hook. `evals.md` gains a golden brief for it.
- **Sound-off quiz** (Clarity as a number): Gate 1 writes `review/quiz.md` (5 questions with a key from the script's
  claims); at Step 7 a fresh subagent answers from the strips alone, each answer is scored correct / partly correct /
  wrong into `review/quiz-result.md`, and each wrong answer is a Clarity P1 at its beat. `score_run.mjs` reports
  `quiz_score` and `quiz_pct` (`error` for an unreadable result, never 0); `evals.md` tracks it per skill version; new
  test `tests/score-run.mjs` in the merge gate.
- **Failure-explainer arc** (`script-voice.md` "Arc templates"): the seven beats of a "why does X break" film (cold
  open with a quoted verdict, follow the path, a thesis with N enemies, N enemies each built as name → mechanism →
  one tagged number → visible cause, cost asymmetry, checklist, bookend), with its Gate 1 checks (every enemy has its
  tagged number and visible cause, the bookend shows the opening setting working). "Two beliefs, tested" moves into
  the same section, now a look-up in the step-3 index (the reading budget is full). `camera-motion.md` §11.1 gains
  story-vs-explanation grading (night for the story parts, bright neutral for the explanation); `evals.md` gains a
  golden brief for it.
- **Engine: impacts drive the SFX** (`engine/three/sfx.js`, CLI `sfx.mjs`): `impactSounds` maps a bake's impacts (and `report.latches`,
  plus fracture / splash events) to `<audio>` rows. Material pair + weight pick a sample tag (`wood-on-wood light`,
  `metal-on-stone heavy`, `glass-shatter`, `cloth-soft`, `water-splash`, `latch-click`) from the project's sample library;
  gain = 0.5 × (dv / 1.2)^0.6, capped; contacts under 40 ms apart merge into the hardest; under 0.15 m/s they are dropped;
  `data-start` is the impact time. An unknown material is `unplaced`, a tag with no sample is `missing`, a sample whose
  `ASSETS.json` row is missing, or one `check_assets.mjs` would refuse (no source or licence, ND, unlisted licence, NC under `--commercial`,
  CC BY without author) is a problem, not a row; a fracture without a known material is `unplaced`. It prints the table to approve in `PRODUCTION.md`. `tests/sfx.mjs` is a gate step
  (it runs `check_assets.mjs` on the picked files).
- **Numbers model and numbers lint** (Step 3, Gate 1): when the script computes, the project's `model.mjs` is the one
  source of every `[calc]` number. Plain JS with named `[src]`/`[assume]` inputs; it exports `numbers` (each result by
  name, `{ value, say }`, `say` computed from `value` in the narration language) and, for a process over time,
  `state(t)` (counters, on/off states, levels); `node model.mjs` prints the calculation card's lines and writes
  `numbers.json`. `script.md` tags a model number `[calc: name]`, the narration stays words and speaks it in a beat of
  that name (a further mention in `<name>__<suffix>`), and the build reads `numbers` / `state(t)` (no number typed into the composition).
  `scripts/numbers_lint.mjs [project]` fails (exit 1, `file:line`, spoken value, model value) on a beat named after a
  model number that holds no mention of it in a declared form (its `say`, whole words, case, punctuation and hyphens
  ignored; or a figure equal to the value after the spoken rounding, decimals, significant figures, thousands
  separators, alone in the beat or in the place of the say's number; anything else in the beat is not read), a beat
  name used twice, a `[calc: name]` missing from `numbers.json`, or a `numbers.json` older than `model.mjs`; a beat of
  another name, or of none, is never flagged; an unreadable `numbers.json` or a beat in words with no `say` is a WARN
  (exit 2), never "not found" and never OK; hand
  arithmetic `[calc: a × b = c]` is listed, not checked. Docs: `script-voice.md` "Numbers model",
  `visual-direction.md` §12, `look-build.md` Step 6. Test: `tests/numbers-lint.mjs`, in the merge gate. `state.mjs`: Gate 1's approval also hashes
  `model.mjs` and `numbers.json` when they exist, so a changed input or a rerun that moves a number makes it stale.
- **Time-compressed paired run and status tag vocabulary** (`visual-direction.md` §12): two identical sets that differ
  in one variable run on the model's `state(t)`, with live A/B counters and status flips, tagged SPED UP and a
  footnote naming the inputs; the headline's status tag reads ILLUSTRATION (`[illus]`), SPED UP or OUR MODEL
  (`[calc]`), one colour per tag for the film, in the narration language.

- **Engine runtime scale audit and z-fight probe** (`engine/three/audit.js`). `scaleAudit(root, { tol })` measures every object that declares `userData.real = { h, w, d }` (metres, world axes) and names those off by more than 15 %; a prop with no declared size, in a group or not, is listed `unchecked`, never passed, and a bad declaration is reported. `zFight(root, { cameras, bits, heightPx })` reports overlapping parallel faces less than one depth step apart at a camera, step z² (far − near) / (far · near · 2^bits) at the cameras' depth (worst over all stations), with a `polygonOffset` or lift to apply; cutaway caps are skipped, a pair is mitigated only when its polygonOffset keeps the faces a step apart at every camera, measured as the GPU applies it (factor × the face's depth slope per pixel + units × one step: a factor alone shifts nothing head-on, zero or equal offsets cancel, every material on the face counts), faces that only touch at an edge are not overlapping, faces no camera sees are counted. Self-check: a 10x prop flagged and a correct one passing, coplanar quads flagged while a 1 mm offset passes near and fights far, back-to-back, mirrored, hidden and unseen cases, factor-only offsets head-on and at an angle. A camera aspect that is not a finite number above 0 is refused, and a looked-at pair whose depth cannot be computed (edge-on, degenerate) is counted in `unseen`, never passed; the depth step assumes a standard (non-log, non-reversed) depth buffer.
- **Audio QC** (`scripts/audio_qc.mjs`, Node + ffmpeg, no Python): the music bed's level under the narration at the gain the composition gives it (flagged when more than 25 dB or less than 8 dB below), clicks and digital dropouts with their time, and voice drift per sentence (median pitch more than 3 semitones or centroid more than 25 % from the take). Every music cue is measured (anchored names such as `music`, `bgm-2`, or the one `--music` names; the `src` may sit on a `<source>` child; `data-start`, `data-media-start` and `data-duration` are honoured); "no bed in the film" needs every other `<audio>` to be an SFX of at most 10 s and the page to pass the script rule below (a script, handler or local frame can make an `<audio>` or change an SFX's `src` or `data-duration` at run time, so it is NOT CHECKED, never "no bed"), and a longer, looping (`loop` without a `data-duration` of at most 10 s) or unreadable one is NOT CHECKED until `--music` names it; `--music` is repeated once per bed, every tag is still classified, and one that nothing names keeps the bed NOT CHECKED. A `loop` bed is repeated across the film before its level is read. The render inputs HyperFrames applies to the mix are applied or reported, never left out: an `<hf-audio-group>` bus `data-volume` multiplies its members' gain (also the narration's), `data-end` (which wins over `data-duration`) cuts a clip, `data-fade-in` / `data-fade-out` are linear fades (a fade-out needs a clip end), and a tag HyperFrames does not render (`data-hidden`, a hidden bus, a `data-duration` of 0, a `data-end` at or before the start) is not a bed; every `<video>` that is not `muted` and has no `data-has-audio` other than `"true"` mixes its sound (HyperFrames' compile step gives it an id and the flag), so it is an unknown source of sound until `--music` names it. The check is bounded to the declared mix on purpose (the allowlist is written once in the script's header): every attribute of a media tag or bus is either modelled or known not to change the mix, and any other one, the same attribute twice (the first value is read, like the DOM), a `data-hidden` or `<template>` ancestor, a lane other than a straight volume lane in HyperFrames' format, a gain it clamps, or any script that is not the engine library makes the bed NOT CHECKED, never a pass. THE SCRIPT RULE (owner's decision): a page that loads ANY script other than the engine library is NOT CHECKED ("page runs a script that is not the engine library; check the bed by ear on the draft; with nobody to listen, name "bed level not checked" in the hand-off as a known bug"). Because every film loads GSAP and its own timeline script, an unattended run meets this exit 2 in nearly every film: it is never a pass (the Result text, `references/qc.md` Step 7 user-away rule and `SKILL.md` autonomous mode say so): the draft passes Step 7 only with "music bed level not checked" named among the hand-off's known bugs, while an `audio_qc.mjs` flag (exit 3) still blocks the final. A script is a `<script>` of any type a browser runs (such as `application/x-javascript` or `text/jscript`, or with only a `language` attribute), inline or by `src` or an SVG `<script href>`, and script text in an attribute (an `on*` handler such as `onload` or `onerror` on any element, a `javascript:` URL); a remote library, a project file, an inline module that imports the engine and a script made at run time are all scripts that are not the engine. The engine library is a local file that the `.engine.json` beside it lists (`engine/three/build.mjs` writes it), loaded by a `<script src>`; a manifest that is missing or unreadable lists nothing. No script text is read and no JavaScript is parsed (there is no word list to get around), so most films with a scripted timeline read "check the bed by ear on the draft" instead of a measured level: that is the point, a bed whose gain a script can change is unknown. A page with a `<base href>` or a `<script type="importmap">` changes what a name loads, so it is NOT CHECKED too ("page loads scripts the check does not resolve; check the bed by ear on the draft"); an iframe `srcdoc` is read as a document like the page (its scripts judged by the same rule, its own media NOT CHECKED), and any other local document an `<iframe>`, `<frame>`, `<object>` or `<embed>` opens is NOT CHECKED. A commented-out tag is not a tag. A bed whose level it cannot compute (unreadable or absent `index.html` without `--music`, no `src`, a `data-volume` or lane that does not parse, a `data-playback-rate` other than 1, a `data-fx-chain` such as a gain or a carve on the bed, the narration, its bus or the composition root, a bus lane, a `data-composition-src` sub-composition, a narration with `data-media-start` or `loop`) and a voice check with fewer than 3 voiced sentences are NOT CHECKED (exit 2), never "no bed" and never OK: the Result is OK only when the bed, clicks and voice each have an outcome. A flag is a P1 that blocks an unattended final; Step 7 and Step 8 run it, and the gate runs `tests/audio-qc.mjs`.
- **Preflight checks the skill's own clone** (row `DALANG skill`): a `fetch` (20 s cap, the only write, inside the
  clone's `.git`) then behind/ahead against `origin/main`: `N commits behind (latest: …) — pull --ff-only`; dirty and
  diverged clones are named without pull advice; a failed fetch, or a clone git cannot read (another owner, no `git`, a timeout, a `.git` git skips inside a parent repo), is `could not check — rerun` (never
  "up to date", never "not a clone"): every git read goes through one check, and any read that fails or answers in an
  unexpected shape makes the row `could not check`, so a known state comes only from reads that succeeded; a
  folder without a `.git` is INFO; a pinned clone (detached HEAD, e.g. a tag clone) is compared with the newest release tag
  on origin and told to fetch tags and check it out, never to pull; a branch other than `main` is INFO. `--check-skill` runs only this row, `--skill-dir` points it at another folder. It
  never pulls. Brief Call 0 asks the update; an unattended run pulls a clean fast-forwardable clone, logs it and
  re-reads `SKILL.md`. Test: fixture clones and remotes in `tests/preflight-mock.mjs`.
- **`state.mjs next` prints a step's reading list** (`node scripts/state.mjs next [dir] [--step 0-8]`): it works out
  where the video stands from its files and prints that step's sections as ready `sed` commands with absolute paths,
  from one table that mirrors `SKILL.md`'s step table, plus the headlines of the step's lessons, a "look up when needed"
  index (one heading and exact command per section the step's text points to, no body printed) and what a subagent
  reads. `state.mjs reading` checks the table (every heading exists, every section, indexed ones included, is at most
  8 KB; what is printed to read, sections and lesson headlines, is at most 60 KB for Steps 0–8; the index and the
  subagent list are outside that total); `scripts/gate.sh --fast` runs it and `tests/reading.mjs`, which proves it
  fails on an oversized section, a missing heading, a bad lesson tag, an untagged lesson line and an over-budget
  total. Every line in `lessons.md` carries a step tag; a line without one fails the gate instead of being dropped
  or guessed to hold everywhere. The test also fails when a section of any reference (`lessons.md` aside) is over
  8 KB whether the table lists it or not, when a pointer in a step's "Read now" text (`file.md` §N, `file.md` "Name")
  has no line in that step's index, and when Step 5's or 6's index lacks the three.js engine install. The `looks.md`
  "three.js recipes" section is split into four `###` parts (install the engine, light and material per look, set
  dressing / scale / interior / condition, true shapes and surfaces), all in the Step 5 and 6 index.
- **Cues and shots on one frame grid** (`camera.js`, `type.js`): `snap`, `shotAt`, `overlayWindow`, `windowProblems` and
  `readTime`. A cue is snapped the way a cut is, so a cue just before a frame-rounded cut finds its own shot instead of the
  one before; an overlay window that is empty, in no shot or shorter than its read time is named. The self-check covers a
  cue 10 ms before a cut, a zero-length window and the read time. `camera-motion.md` §5.4 and `lessons.md` (this trap, and a
  thin decal scaled flat that sinks under its surface) say so.
- **Camera stations and attention** (`engine/three/camera.js`): `stations`, `frame`, `travel` (an arc over the set, eased,
  with `speed` in m/s for motion blur), `route` (a leg that starts before the one before ends is refused: no hard cut),
  `loopEnd` (the last pose is the first, for a Short that replays), `place`, and `attend`, attention by ghosting keyed by
  time like the cutaway (everything outside the beat's subject fades to a light, desaturated, translucent ghost on cloned
  materials, one ghost per mesh so parts sharing a material fade at their own weights; the exact original comes back by reference on release; optional fresnel `edge`). `examples/oner.js`: home,
  dive, push-through, home. The self-check asserts determinism, units, the arc over the set, no jump beyond the reported
  speed, a path that does not follow a moving part (`over` is a Box3; a route measures an object once), the loop pose to 1e-6, a last frame that is solid (`oner` refuses a `look.dur` over 2.5 s), the exact restore of every material, ghosting with a cutaway, and the edge hook.
  `camera-motion.md` §11 gains *Home shot + dives*, *Attention by ghosting* and *Loop end (9:16 Shorts)*; the engine README,
  README and `docs/architecture.md` list the module. Cutaway fix: `cut.at()` no longer clones a ghost made by `attend`.
- **Palette measurement in Step 2** (`scripts/palette.mjs`, run by `measure_reference.sh` into `measure/palette.txt`): the
  dominant colours of a frame every second (quantised, % of frame, OKLCH lightness L) and an overall list;
  `reference-measurements.md` gains a `## Palette` section (ground, floor, hero and its dark parts, accents with their job,
  type and caption treatment). `palette.mjs --compare <#hex> <#hex>` gives the lightness gap for figure-ground.
  Only a missing video or ffmpeg (ENOENT) says "not found"; any other error (permissions, a symlink loop, a full
  buffer) names its code and says to rerun. `tests/palette.mjs` joins the merge gate.
- **Sentence retake**: `tts_timestamps.mjs --retake auto` re-speaks, alone and with the take's own voice and settings,
  every sentence with a low alignment run, an untimed word or heard words that differ from `narration.txt`, splices
  each in at the measured pauses around it (10 ms equal-power crossfade, never inside a word), then transcribes and
  times the whole file again and rewrites `words.json`, beats, subtitles and the response. At most two tries per
  sentence (the second with another seed, also when every clip of the first came back without words), then a WARNING
  naming it; a sentence still flagged that the run did not target is named too. The audio and its response are swapped
  together only after the new transcript is in hand, so a stop (a second 503, no words) leaves the old pair and
  removes the temp files; `words.json` and beats follow each splice. `--retake <n,…>` re-speaks numbered sentences and
  `--retake changed` only those that differ from the text of the take on disk (a new sentence is added, a removed one
  is cut out); both work on the take that exists, with no full take. VoiceStudio single-voice narration only
  (ElevenLabs, `--sample`, `--from-audio` and dialogue are refused). `voice.md`, `script-voice.md`, `SKILL.md` step 4.
  `tests/retake.mjs` (a mock VoiceStudio whose audio the mock can hear again) is in the merge gate.
- **Number provenance in the script**: every number in `script.md` carries `[src: …]`, `[calc: …]`, `[assume: …]` (a stated
  assumption, only as a `[calc]` input), `[illus]` or `[unknown]`; section durations, a source's own year or page and
  visual-note specs are not numbers, so Gate 1's list can be empty, the tag decides its on-screen form (evidence card, calculation card, illustration tag, shown
  admission), and Gate 1 lists any untagged number (`script-voice.md` §3, `SKILL.md`, `qc.md` Step 7). The arc list
  gains **two beliefs, tested**, with its beat map, and an uncertainty rule: never invent the missing number, say
  what is not known, then what is certain.
- **Free media search**: `scripts/find_media.mjs` (Node `fetch`, no dependency) searches Openverse (music, SFX,
  images), Wikimedia Commons (images) and the bundled `/media-use` SFX library, downloads previews and prints one line
  per result; `--take <file> --as assets/<path>` copies the pick into the project and appends its `ASSETS.json` row
  with source, licence and author from the API, so `check_assets.mjs` passes without hand-written rows. NC and ND
  results and a CC BY with no creator are dropped; a 429/503 is retried after `Retry-After` (else exponential), never
  with fixed sleeps; a source that fails is a WARN to rerun, never "nothing found"; the bundled library's licence is read
  from its own `CREDITS.md` and gets the same filters (NC/ND, `--licence`, CC BY without a creator); an empty
  Commons answer (`{"batchcomplete":""}`) is "nothing matched", not an outage; the music fit in `look-build.md` §7
  writes over the taken path so the row stays true; a local file error (make, copy or write failing) is a WARN to
  rerun with exit 3, never exit 1 ("nothing matched"), and a `--as` ending in `/` is a usage error (exit 2).
  `look-build.md` §5 and §7, `lessons.md`, `visual-direction.md` and `looks.md` use it.
  `tests/find-media.mjs` (against a mock API) and `tests/assets.mjs` (unknown file, wrong licences, the engine
  manifest) are in the merge gate.
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
- **Mechanism parts and time remap** in the engine: `mechanism.js` `slide` and `hinge` (limits are the stops),
  `spring` (stiffness, rest or preload, damping, real units) and `latch` (holds a part, still colliding, until a time
  or a condition), baked and hashed with the set (release times in `report.latches`, refused in `opts.islands`);
  `physics.js` `slow` and `replay` return a `tau(t)` for `apply`, `pose` and `travel`, so slow motion and a replay read
  the one bake. `camera-motion.md` §5: mechanisms use these parts, never a custom integrator or a per-phase time
  function; `lessons.md`; the self-check asserts the stop time against the analytic one, that a released part stays at
  its stop through every remap, and the cache and island rules.
- **Captions and pinned labels** in the engine: `engine/three/type.js` (no imports, browser and Node) has
  `phrases(narration, words)` (a narration line end or speaker change, sentence ends, `,` `:` after 3 words, a run over
  7 words at its longest speech pause in `words.json` (at least 0.3 s, 2 words on each side) and, with no pause, split
  balanced, 16 characters for CJK split by character, an ellipsis, a phrase held through the pause that follows),
  `drawCaption` (fixed in the platform's safe zone and never drawn outside it: a phrase that does not fit in two lines
  at 54 px shrinks below it and reports `shrunk`, ink chosen every frame from the luminance under its own box with a
  halo, an optional accent box on the word being spoken that switches on its start, an optional dark pill per line),
  `pinLabel` (projects a world point, flips side and clamps inside the label zone above the caption, wraps a label
  wider than the zone at its spaces, at least 36 px unless one word is wider than the zone, leader and dot, nothing
  when the point is behind the camera or off the frame), `repeats(captions, labels)` (warns when a caption says what a visible
  label says), plus `safeArea`, `luminance` and `inkFor`. `scripts/captions.mjs` writes `audio/captions.json` and
  `audio/captions.js` from `narration.txt` and `words.json` (a narration from another take is refused). `craft-rules.md`
  §6, `visual-direction.md` §5 and §9, `look-build.md` Step 6, the engine README and `lessons.md` point to them. The
  self-check asserts the splits in English, Spanish, with an ellipsis and dialogue, and in Japanese; light ink on a dark
  box and dark ink on a light one, including a frame dark only under the box; the active word switching within one
  frame; a label at the frame edge staying inside the safe area at every t; a long phrase, a long label and one long
  word drawn inside their zones (the drawn glyphs, not the returned box); breaks at speech pauses and at line ends; and
  the repeat rules.
- **Scene lint** (`scripts/lint_scene.mjs [project]`): flags a `//` comment written mid-line that silently swallows
  the code after it (a member assignment or call, `const`/`let`/`var`, `x = …;`, `fn(…);`) and a `]`, `}` or `)`
  whose comma sits inside the comment, with `file:line` and the swallowed text, exit 1. It reads the film's own code
  (`assets/`, `src/`, `style-frames/src/`; `.html` only inside `<script>`), never the files an engine copy lists in its
  `.engine.json` (the engine installs into `assets/`, beside the film's own modules, which are linted), and ignores
  end-of-line comments, whole-line comments and `//` inside strings; exit 2 when nothing could be linted.
  Run after every patch and before every snapshot or draft render (`look-build.md` §6.8) and in the Step 7 QC block
  (`qc.md`); `lessons.md` says why; `tests/lint-scene.mjs` joins the merge gate.
- **Information layers for explainers** (`visual-direction.md` §12): a claim headline (kicker, headline, status
  tag), data cards anchored beside their subject, world labels and captions, each with one job, plus evidence,
  calculation, running-tally, impact-numeral and recap-checklist cards; sizes and positions per 9:16, 4:5 and
  16:9, at most 3 cards besides the caption, sides and hues fixed, one fact in one layer, and an accent budget
  that keeps §5's one accent per shot (headline key term in ink; the impact numeral takes the accent, and the
  caption's active word stays in ink while it shows). The storyboard's shot
  table has an Overlay column that Step 6 builds text from; the review rubric adds Sound off and No repeat.
- **`tts_timestamps.mjs --tempo <0.8-1.2>`** on an approved take (`--from-response`, default
  `<out>/<name>.response.json`): ffmpeg `atempo` (pitch kept) changes the speed, the word times are scaled, nothing is
  re-spoken. The take keeps `_meta.model` and the voice, so the licence cross-check in `check_assets.mjs` keeps
  working, and records `_meta.tempo` (the running total; each call is relative to the take on disk, the total stays
  0.8-1.2). `--retake` on a tempo-changed take applies the same tempo to the sentence it re-speaks. Refused with
  `--retake`, `--sample`, `--from-audio`, `--speed` and on ElevenLabs takes. `voice.md` says: slower or faster
  approved take = `--tempo`, regenerating = `--speed`, never ffmpeg + `--from-audio` on a TTS take. Test:
  `tests/retake.mjs`.
- **Showing a quantity** (`visual-direction.md` §13, Steps 5–7): six devices that show a compared number in the world
  before it is said: twin sets for an A/B, flow arrows whose width is their value, the formula on the set (dimension
  tags, a tile fill, a range card with the option that fits), condition tags, a sound word on a physical event, a
  macro insert to a real instrument. Engine: `quantity.js` (`flowArrow`, `tileFill`), `rangeBar` in `type.js`,
  `examples/twin.js` (`twinSets`); the self-check asserts the arrow width ratio equals the value ratio, the tile
  count and area, the range card's fill and fit, the twin gap. Review rubric: a `Quantity` row (§11), a compared
  quantity shown only in text is a P1.
- **Electricity and signals** (`engine/three/circuit.js`, `instruments.js`, `examples/supply.js`; `camera-motion.md`
  "Any subject moves by its own law"): current made visible, caused by the film's numbers model and never keyframed.
  `wire` (trace, wire, busbar) and `flow` (pulses at a stated visualisation speed, their SHAPE the waveform: ac sine,
  dc straight, pwm blocks, three phases; width and brightness follow |current|; mains frequency slowed by a shown
  `timeScale`, a shown rate under 4 frames a period refused as `/alias/`); `glow` (black-body colour from heat, a bad power, h or emissivity refused with its field named, nothing
  under the Draper point), `lamp` (light from the supply voltage by the lamp type's cited curve or a datasheet table),
  `arc` (a seeded branching discharge that lights the scene only for its frames, ballistic sparks, an `sfx.js` event
  row; energy and efficacy have no default); `failure` (a bulged or vented capacitor, a blown fuse wire with a gap and a
  soot mark, a charred resistor, a melted connector, switched at the model's event time). Widgets for the text band or a
  device screen: `scope`, `meter`, `gauge`, `bar`, each with units and a label (refused without) and `--`, never 0,
  for a value it cannot read. `examples/supply.js` (`supplyChain`): plug to motor, every value from `state(t)`. The
  self-check asserts the ac period in the pulse shape, the alias refusal, the lamp falling with voltage by its curve,
  the arc's light only in its frames, each failure variant, the scope showing two periods of 50 Hz over 40 ms, and the
  chain's fuse, arc, lamp and shaft angle (an integral, the same for any order of frames).
- **Made things carry their real markings** (`engine/three/markings.js`, `electronics.js`, `examples/psu.js`;
  `references/looks.md`). `markings(target, items)` prints text, standard symbols (ISO 7010 W012, IEC 60417 earth and
  class II) and stickers on any mesh at their real size in mm: a decal built by casting a grid of points onto the
  surface, lifted along the surface normal by the print's thickness (pad print, silkscreen, laser etch, paper sticker with
  a curled corner, never above 1.5 mm), so it follows a cylinder and is never flattened by the target's non-uniform scale;
  a print that overhangs the surface or wraps round an edge is refused; `wear` 0..1 rubs and chips it. `glyphPx(item,
  camera, H)` is the on-screen cap height in px (0 for a print facing away, or not wholly inside the frame; read where its mesh is now) and `READ_PX` (12) the floor under which text
  does not read; every print declares `userData.marking` for the detail check. `electronics.js`: `board()` (FR-4
  1.6 mm, a solder-mask colour, copper pads and traces built with `wire()`, silkscreen references), a `PARTS` catalogue at
  real dimensions with its source (radial electrolytic and film capacitors, resistors with `bands(ohms)` per IEC 60062,
  DIP-8 and TO-220 with its heatsink, a relay, a fuse in its holder, a disc varistor, screw terminals), parts placed by
  reference designator on the board (off the board, overlapping and a bad rotation refused), `pin()`, `trace()` through
  pins, `cable()` with the IEC 60445 conductor colours. `examples/psu.js` (`openPsu`): an opened small power supply.
  `scaleAudit` measures a part without the ink printed on it. The self-check asserts a 2 mm print reads at least 12 px tall at a
  macro station at 1080 px and not from 2 m, not when it is out of the frame or on a board flipped or moved after it was printed, the size under a non-uniform parent scale, the lift, the wrap on a cylinder,
  every refusal, the icons and wear drawing through a recording canvas, every catalogue size within 1 % upright and
  turned, the colour codes, placement, pins and traces, the capacitor polarity (pin 1 plus, the stripe on the minus lead, `polarityClashes` over `board.nets()`: copper that touches is one net across traces, through a shared pin, a free point, a crossing or a pad run over, and a cable on a pin no trace reaches), and the opened supply's references, sticker and cable colours.
  The reading floor and the proportions of a sans font are decisions, not standards.

### Changed

- **Style frames are built from their reference** (`look-build.md` Step 5, `review.md` "Asset pass", `evals.md`): for an
  object modelled in code the reference is a build input, not only a check after. The style frames wait for their OBJECTS
  stills; the mid-tier media screening writes one `review/refs-board-<frame>.jpg` per frame (one ffmpeg `tile`
  command) and a parts line per modelled object for SPEC OBJECTS (3–6 things the reference shows: count, side, orientation,
  layer order); the author of `style-frames/src/` (or a builder whose brief names the boards) opens the board once
  before its first write, and fix rounds reuse it. Full-size stills stay with the reviewer, who grades the parts lines.
  Hyperreal assets stay "check after". A transcript check in `evals.md` (tested in `tests/build-docs.mjs`) flags a
  style-frame write before a board read and a builder started before the board existed; every call counts only once its
  own result came back without error (a failed read, write, edit or board command counts as no call; a style-frame builder is judged when it starts, whatever its result). A background
  board command counts once its completion notification is in the transcript before the builder, read by its `<status>` tag
  (and for a Bash command the trailer `completed (exit code N)` ending its `<summary>`, N other than 0 = failed); a completed Agent's free text never counts ("exit code 1" in its `<result>` changes nothing). Each board command's state
  is set once at one place, made, none or unknown, and "none" needs evidence (an error result, `<status>failed`); a board
  command still running or never reported, a status it cannot read, and a missing or half-written
  transcript, exit 2 (unknown), never 1. `SKILL.md` "Images stay in subagents" and `docs/workflow.md` name the board as the one
  image the author of `style-frames/src/` opens, so they no longer contradict Step 5. Step 5's reading does not grow
  (7357 to 7356 bytes).
- **Scene code only in builder subagents** (`look-build.md` "Parallel build", `review.md` §3, `qc.md` Step 7,
  `SKILL.md` "Work fast"): the main agent never writes, patches or reads the film's `src/` or `assets/*.js` (the Step 5 style frames in
  `style-frames/src/` stay the main agent's); the pilot (the
  whole film under 3 groups), the groups, the assembly and each QC fix round go to a builder subagent that returns at
  most 15 lines (a fix round: fixed / not fixed per finding), logged with `state.mjs log` and resumable with
  SendMessage. `evals.md` gains a 2-group golden brief and a transcript check (no main-thread Write/Edit, or any
  tool given a path but Read, to scene code; a path is the film's when it or a folder above it is the same file on
  disk as the film's folder `<project>` or a folder in its `src/` or `assets/`, so a parent folder named `src` flags
  nothing and a symlink, other letter case or a symlinked `src/` still matches; clean needs evidence: exit 0 with
  nothing printed only when the transcripts hold a builder's write to the scene code, else exit 2, so another film's
  session or a session before the build never passes; it takes every session of the run and the subagent files;
  peak and total cache-read of the main context). Check: `tests/build-docs.mjs`.
- **Sheets first, full-res on doubt** (`review.md`, Step 7): the fresh-eyes reviewer gets the strip sheets, `index.md`
  and the subject crops, and opens a full-res still only for a frame where those leave a doubt, listing each under
  `Opened full-res:` in `QC-REVIEW.md`. The second Realism / Reality check still reads full-res stills.
  `state.mjs reading` counts the reviewer's headings of `review.md` for Step 7, not the Asset pass.
- **Lean review for a test run** (`qc.md` Step 7, `review.md`): only when the user calls the run a test or a draft,
  the fresh-eyes review and the quiz run once, with no repeat round. Autonomous mode alone never turns it on, and a
  final render ends it.
- **Scopes as numbers** (`qc.md` Step 7): exposure and hue come from `scripts/scopes.mjs` as text per cut. The
  waveform and vectorscope PNGs are made, and a subagent opens them, only for a cut outside its band (crushed
  blacks, clipped whites, a hue jump of more than 40 degrees); inside all bands no PNG is made.
- **Hand-off deliverables** (`qc.md` Step 8): `final.mp4`, `narration.srt`, `CREDITS.md` and `POST.md`. The credit
  rule for the upload text moved into the Post description section (rule unchanged: no credit line unless the user
  chose one).
- **Model per subagent job** (`SKILL.md` "Work fast", `review.md`, `qc.md`): a table says which model each subagent
  uses. The fresh-eyes review, the second Realism / Reality check, the style-frame check and the scopes verdict keep the
  session's (strongest) model; fix checks, asset pair checks, media screening and fact research (strongest when the
  topic is technical or contested) run on the mid tier (`model: "sonnet"`). A host with no model choice inherits.
- **Sound from the bake** (`camera-motion.md` §5.3, `look-build.md` §7, `craft-rules.md` §7): the merge window of near-simultaneous
  contacts is 40 ms (was ~30), the pitched-up variant for lighter contacts is gone (a lighter contact takes the lighter weight
  tag), and "sparingly, key beats only" now scopes to non-physical sounds (pop, whoosh); a sound with a physical cause is placed
  from the bake and may be dense.
- **`state.mjs` and the storyboard**: `log` refuses a Step 6 (build) line while `storyboard.md` is missing or Gate 3
  is not approved and fresh; `approve 3` runs the storyboard lint and records its result in the approval (`lint`),
  without blocking it. `look-build.md` Step 5 runs the lint; its shot-count clause moves into the lint's average-shot check.
- **`[calc]` names a model number** (`script-voice.md` Step 3): `[calc: name]` points into `numbers.json` and the
  calculation card shows the lines `node model.mjs` prints, instead of arithmetic written by hand in the tag; the old
  `[calc: a × b = c]` form still reads, and the numbers lint lists it as not checked. Step 3 and Step 6 index the
  "Numbers model" section; Step 6 item 4 adds "never hard-code numbers". Two redundant phrases in Step 3 (a repeat of
  the provenance rule's headline, two of the six two-beliefs examples) were cut to keep the 60 KB reading budget.
- **Default fps follows the platform: 30** for Shorts, Reels, TikTok, feed and landscape (they play at 30, so 24 repeats one
  frame in four and judders); 24 only as a film look the user picks (on YouTube landscape, its own fourth Energy option "Calm cinematic, film look (24 fps)"), and then every camera move and fast body gets
  motion blur (`camera-motion.md` §10), because rendered 3D has no natural blur and strobes. Never 60 (double render time,
  re-encoded to 30). Rubric: "strobing on camera moves" is a P1 (`visual-direction.md` §11, `review.md`, `qc.md`).
- **Reading is mechanical, images stay in subagents, scenes are patched with `Edit`** (`SKILL.md` "Work fast"): the
  agent reads only what `state.mjs next` prints and never a reference, the engine README or `lessons.md` whole (a run
  read about three quarters of the docs into the main context); the main agent never `Read`s a still, strip, contact
  sheet or scope, every "look at this", fix checks between QC rounds included, is a subagent with a text verdict
  (`qc.md`, `look-build.md`); scene changes are `Edit` calls, never `python3 - <<EOF`, `sed -i` or an inline script.
  `lessons.md` is tagged by step. Brief Step 1's calls, `camera-motion.md` §5, §11 and §12 and `visual-direction.md` §1
  are split into `###` sections and `qc.md` gets `## Step 8 — Final render`, so every section a step reads is at most
  8 KB. README and `docs/` in step.
- **Look C's default ground is light and warm; the hero separates by value** ("light set, dark detail"): dark functional
  parts, AO and a contact shadow give at least ~0.2 OKLCH L between the hero and the ground behind it; a dark or saturated
  full-frame ground only when the user or a measured reference asks. The §11 rubric gains a **Figure-ground** test (P1,
  P0 when the hero merges into its ground; `review.md` severity follows), and the Step 1 look previews name the ground
  colour and how the hero separates from it.
- **`tts_timestamps.mjs` warnings name a command, not "listen"**: the alignment, word-count and estimated-beat
  warnings say `--retake auto`, and a take with a flagged sentence prints the command that fixes it; `voice.md` and
  `script-voice.md` say an unattended run never delivers a take with an open flag.
- **A VoiceStudio `503` is BUSY, not FAILED**: the script waits (`DALANG_VS_BUSY_WAIT_S`, default 180 s) and retries
  once; still busy it prints `WARN … rerun in a few minutes` and exits 3. It never says to restart the app or switch
  engines. Any other error still fails with exit 1.
- **Caption position per format** (`craft-rules.md` §6, `visual-direction.md` rubric, `review.md`, `look-build.md`,
  `engine/three/type.js`): captions get a target, not only a keep-out, as fractions of the frame height: 9:16 Reels and
  TikTok block top 72-76 %, bottom at most ~82 %; Shorts as low as its band allows (bottom 69 %); 4:5 bottom 92 %; 16:9
  the bottom 15 %. The trade-off is said once: the lowest lines may brush the platform overlay, so check the phone sheet,
  never lift captions toward the middle. A 9:16 caption block whose top edge is above ~70 % of the height (Reels, TikTok) or whose bottom edge is above ~65 % (Shorts) is a P1 ("captions too
  high, compete with the hero"). The engine's Reels caption zone now ends at 82 % (was 75 %); Shorts is unchanged, and
  TikTok moves from the Shorts line to the Reels line.
- **VoxCPM2 chunks never exceed 120 characters**: a sentence longer than that splits at a comma, then at a space
  (a text with no spaces every 120 characters); light engines keep ~700.
- Music source order is CC0 first, then CC BY with a plain visible-credit note at Gate 2; the upload caption the agent
  drafts carries no credit or licence line unless the user chose one (`look-build.md` §7, `qc.md`, `lessons.md`, README).
- Steam and smoke presets shade their side away from the light by default (`shade` 0.4 and 0.45; `shade: 0` keeps
  the old flat look).
- **The engine's files are listed by the build, not by hand**: `engine/three/build.mjs` writes `.engine.json` next to
  them with each file's real origin and licence (the repo's MIT for engine and examples; each vendored package, with
  version and licence, for the bundles). `check_assets.mjs` reads every `.engine.json` under `assets/` (an unreadable one
  or a row outside its folder is a problem, fail closed), checks a licence `A AND B` part by part (also `A + B`, `A / B`, `A, B`, `A OR B`, brackets; each part is matched
  whole, so `MIT GPL-3.0` fails; SPDX ids such as `CC0-1.0`, `CC-BY-4.0 International` and a lone credit note such as
  `attribution` in the ElevenLabs free-tier string still pass), asks an author and writes a `CREDITS.md` line for a CC BY
  part wherever it stands, and allows Zlib, ISC and BSD-2/3-Clause. The narration cross-check reads engine-manifest rows
  as well as `ASSETS.json` rows, so a non-commercial voice cannot be listed commercial through a `.engine.json`.
- **Unattended runs: Realism, Reality and Clarity P1s block the final** like a P0 until a round fixed them or two
  rounds failed; a Realism or Reality fail stays a P0 that never ships; cosmetic P1s may ship. The hand-off lists every open P1 and why it stays (`SKILL.md`, `qc.md`,
  `review.md`). `lessons.md` gains the `font:` shorthand and scene-id lessons.
- **Anchored side cards are allowed on 9:16** (`visual-direction.md` §7): two subjects may each carry a data
  card beside them (≤ 30 % of the width); side-by-side columns of prose stay banned. §5's one-text-block rule
  becomes one headline and at most 3 cards; §8 pairs physical comparisons with a running tally.

### Fixed

- `circuit.js` `wire()` now accepts a `THREE.Curve` as its docs said: it tested for an `isCurve` flag three.js does not
  set, so any curve was refused as a bad path.
- `timing_lint.mjs` (and `score_run.mjs`'s `timing_problems`) now follow each host of a shot-group film
  (`data-composition-src`) into `compositions/<group>.html` and add the host's start to the group's local times: a cut
  inside a word or a clip under 1 s inside a group no longer passes as OK because `index.html` holds only the hosts.
  A group file that cannot be read, an unfilled `{{placeholder}}` or a host loop is exit 1, never OK. Step 5 and Step 6
  item 4 of `look-build.md` no longer send a group subagent to the shared `src/index.tpl.html` or to absolute times;
  `tests/timing-lint.mjs` and `tests/build-docs.mjs` run in the gate.
- `find_media.mjs --type music --licence cc0` no longer always says "nothing matched": the `category=music` filter
  dropped Openverse's CC0 music, which has no category. Music is now kept apart from SFX by `--min-duration` (default
  20 s unless a smaller `--max-duration` is given, also a flag for any type, unknown lengths kept), and a music search reads up to 3 result pages. A provider's
  `mp32` filetype is saved as `.mp3`.
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

[Unreleased]: https://github.com/sandalkuilang/dalang/compare/v4.5.6...HEAD
[4.5.6]: https://github.com/sandalkuilang/dalang/compare/v4.5.5...v4.5.6
[4.5.5]: https://github.com/sandalkuilang/dalang/compare/v4.5.4...v4.5.5
[4.5.4]: https://github.com/sandalkuilang/dalang/compare/v4.5.3...v4.5.4
[4.5.3]: https://github.com/sandalkuilang/dalang/compare/v4.5.2...v4.5.3
[4.5.2]: https://github.com/sandalkuilang/dalang/compare/v4.5.1...v4.5.2
[4.5.1]: https://github.com/sandalkuilang/dalang/compare/v4.5.0...v4.5.1
[4.5.0]: https://github.com/sandalkuilang/dalang/compare/v4.4.0...v4.5.0
[4.4.0]: https://github.com/sandalkuilang/dalang/compare/v4.3.0...v4.4.0
[4.3.0]: https://github.com/sandalkuilang/dalang/compare/v4.2.0...v4.3.0
[4.2.0]: https://github.com/sandalkuilang/dalang/compare/v4.1.0...v4.2.0
[4.1.0]: https://github.com/sandalkuilang/dalang/compare/v4.0.0...v4.1.0
[4.0.0]: https://github.com/sandalkuilang/dalang/compare/v3.10.0...v4.0.0
[3.10.0]: https://github.com/sandalkuilang/dalang/compare/v3.9.1...v3.10.0
[3.9.1]: https://github.com/sandalkuilang/dalang/compare/v3.9.0...v3.9.1
[3.9.0]: https://github.com/sandalkuilang/dalang/compare/v3.8.4...v3.9.0
[3.8.4]: https://github.com/sandalkuilang/dalang/compare/v3.8.3...v3.8.4
[3.8.3]: https://github.com/sandalkuilang/dalang/compare/v3.8.2...v3.8.3
[3.8.2]: https://github.com/sandalkuilang/dalang/compare/v3.8.1...v3.8.2
[3.8.1]: https://github.com/sandalkuilang/dalang/compare/v3.8.0...v3.8.1
[3.8.0]: https://github.com/sandalkuilang/dalang/compare/v3.7.1...v3.8.0
[3.7.1]: https://github.com/sandalkuilang/dalang/compare/v3.7.0...v3.7.1
[3.7.0]: https://github.com/sandalkuilang/dalang/compare/v3.6.0...v3.7.0
[3.6.0]: https://github.com/sandalkuilang/dalang/compare/v3.5.0...v3.6.0
[3.5.0]: https://github.com/sandalkuilang/dalang/compare/v3.4.0...v3.5.0
[3.4.0]: https://github.com/sandalkuilang/dalang/compare/v3.3.0...v3.4.0
[3.3.0]: https://github.com/sandalkuilang/dalang/compare/v3.2.0...v3.3.0
[3.2.0]: https://github.com/sandalkuilang/dalang/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/sandalkuilang/dalang/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/sandalkuilang/dalang/compare/v2.0.0...v3.0.0
[2.0.0]: https://github.com/sandalkuilang/dalang/compare/v1.8.0...v2.0.0
[1.8.0]: https://github.com/sandalkuilang/dalang/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/sandalkuilang/dalang/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/sandalkuilang/dalang/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/sandalkuilang/dalang/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/sandalkuilang/dalang/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/sandalkuilang/dalang/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/sandalkuilang/dalang/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/sandalkuilang/dalang/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/sandalkuilang/dalang/releases/tag/v1.0.0
