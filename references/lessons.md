# Lessons from real runs

Each line is a failure that happened, tagged with its steps (`[5]`, `[5,6]`) and, when it holds in one mode only, that mode (`[6|studio]`, `[3|express]`); `state.mjs next` prints a step's headlines for the film's mode; an untagged line fails the gate. Never read this file whole: `grep -n -i '<word>'` it. The fixes are already in the rules; a line says why.

## Script and facts
- [1,6] **A 3D-looking look moved the film to Studio on its own** (the pilot kept two builders waiting ~20 min). Mode and look are both asked in the Brief and locked; Express starts every group at once.
- [5] **A title block on 9:16 read as coursework.** Sheet furniture only on 16:9.
- [1,5] **The look was guessed, never asked** (four looks, ~2.5 h of rebuilds). The Brief asks one of two; a reference gives palette, type and overlays.
- [3] **Numbers measured by different methods were compared** into a "narrow win". A small gap across methods is a tie.
- [1] **The format was never asked.** Platform always goes through AskUserQuestion.
- [1] **The script was rewritten five times** because duration and language were settled late. Ask everything in Step 1.

## Voice and timing
- [4] **A warning that says "listen" is not actionable.** Every warning names a command (`--retake auto|<n,…>|changed` re-speaks and splices only those sentences).
- [4] **Per-sentence timing ≠ per-word timing** (~1/6 s off). Use `words.json`.
- [4] **A number-heavy section misjudged the pace** (2.09 vs 2.30 words/s). Re-check the real duration after the full take.
- [4] **Accent tags changed the pace** (2.30 → 2.57 words/s). Calibrate with the tags you will use; small misses with `--speed`.
- [0,4] **Account errors (401, 400 `paid_plan_required`) surfaced late.** `preflight.mjs` shows the tier first.
- [0] **VoiceStudio "loaded forever"** while the backend downloaded AudioSeal inline. Pre-download outside the backend (`voice.md`).
- [0] **A wait loop trusted `installed: true`** mid-download and hung the worker 30 min. Wait for `incomplete: false`.
- [4] **Transcription ignored the installed MLX turbo model.** Use faster-whisper turbo through the balanced tier (`voice.md`).
- [4] **"Use the voice from this voice note" stalled Step 4** (~10 calls). `voice.md` "Clone".
- [1,4] **Three voices were auditioned before asking** — the user wanted their saved profile. Ask which saved profile first (`script-voice.md` §4).
- [1] **A saved clone went to a public channel unasked.** The Brief asks the voice by audience (`brief.md` Call 3); `--save-profile` cuts an audition at a word end.
- [4] **A clone spoke slower than its sample,** held ~1 s room-tone pauses and dropped a word. Measure pace on the clone, rephrase a dropped line, cut pauses on `words.json` gaps, retime with `--from-audio` (without `--own-recording`).

## Visuals
- [5|studio] **The film looked generated:** skipped SPEC/LOOK, a hero from SVG primitives, banned defaults, nine scenes before one finished frame. `SPEC.md`, true shapes, style frames, blocking and polish passes.
- [5,6] **Half the film was still** because only mouths moved (a good reference is ~5 % still).
- [5] **A generic vector animal passed every check.** Set and Reality tests apply to every look.
- [1,5] **Candy pastels on a coloured backdrop read cheap.** Stylized means designed, not loud (calm palette, few accents).
- [1,5] **A palette took three rounds.** Same-value hero and ground merged; measure from a liked reference (rubric Figure-ground).
- [5,6] **People looked stiff.** A stylized figure with the mitten rule, or faceless (`visual-direction.md` §1 "People").
- [1] **Calm cinematic was 24 % still.** Calm needs real motion (`visual-direction.md` §3 "Minimum motion").
- [1] **A Step 1 preview promised banned defaults.** Previews follow the banned list.
- [6] **Half a character vanished:** SVG inside `<template>` doesn't draw. Keep it in `<defs>` and clone with `<use>` or JS.
- [6] **A crossfade showed the same hero twice.** Same hero across a seam → match cut.
- [6] **`mix-blend-mode` on an SVG `<rect>` rendered opaque.** Use a CSS `filter` on the wrapper.
- [6] **Text rendered in a fallback font** (the `font:` shorthand is skipped by the subsetter). Set `font-family` alone.
- [6] **An animation moved an object in another scene** (a shared `id`). Prefix every `id` with its scene.
- [5|studio] **A licensed "documentary" clip was a cartoon** (37 MB wasted). Contact sheet before downloading (`visual-direction.md` §1 "Sourcing").
- [6] **Missing GSAP and a timed `<video>` in a timed wrapper** each cost a round (`look-build.md` Step 6 item 4).
- [5|studio] **Non-English catalog queries** return nothing.
- [5] **A machine had a part outside its body,** checked from memory. Compare against downloaded photos (`visual-direction.md` §1 "Machines", "Reality check").

## Audio and reference
- [7,8] **The first render was ~8 dB too quiet.** Always `loudness.mjs`, before the mix.
- [7] **`hyperframes preview` opened the user's Chrome.** Always `--no-open` (and in the `dev` script); open the URL in Claude's built-in browser (`qc.md` §7).
- [5,7] **`snapshot` sends frames to Gemini** when `GEMINI_API_KEY` is set. Pass `--describe false`.
- [6] **No music source left Step 6 undefined.** `find_media.mjs --type music` (`look-build.md` "Sound effects and music"); nothing fits → narration + SFX, said.
- [2] **YouTube auto-captions had gaps.** Transcribe a reference again, to the end.
- [2] **The assistant studying a video cannot hear.** SFX read from images are guesses; mark them.
- [6] **`media-use resolve --type sfx` found no provider.** Use `find_media.mjs --type sfx`.

## Working speed
- [0,1] **A 242k-token session** carried detours and five drafts. One session per video; resume from `BRIEF.md` + `PRODUCTION.md`.
- [1] **24 fps looked choppy on a 30 fps platform.** Default 30; 24 is a chosen look that blurs moves (`camera-motion.md` §8).
- [7|studio] **A draft render took 39 min** (the next under 3). Far slower than the last → stop and find the cause.
- [7|studio] **A 10 fps draft gave the same verdicts in half the time.** QC renders at 10 fps.
- [7|studio] **An unattended run shipped known P1s.** Set, Reality and Clarity P1s block the final (`qc.md` Step 7).
- [8] **Build traps went into the user's private memory.** The hand-off's `## Skill feedback` carries them upstream (`qc.md` Step 8).
- [4] **Whisper timed sentence starts early** (up to 0.7 s). Forced alignment against the script.
- [4] **VoxCPM2 timed out** beside other model jobs. Heavy model jobs one at a time; VoxCPM2 in ~120-character chunks.
- [5,6] **Two jobs waited 25 min on `pgrep -f`** matching their own shells. Chain heavy jobs or wait on a PID.
- [5] **The machine sat idle through a 58 min gate wait.** Free local jobs a "no" only discards run during the wait.
- [5] **The film read as a slideshow** (drifting stills, no mechanism). The subject acts in every shot, camera-only ≤ 15 %, a mechanism shot per "why", the Action test (`visual-direction.md` §3, §8, §11).
- [5] **Every "camera move" was CSS on a still.** Real rig moves, A/B roll, one wow shot (`camera-motion.md` §8).
- [7|studio] **Rework, not rendering, was the slow part** (5 of 7 P0s were asset defects). Scene-prefixed ids and overscanned whips from the first draft, the asset pass before building (`review.md`), browser steps never beside a model job.
- [5,6] **A stylized room read as a toy.** Dense small props and small life motions lift it most (`looks.md` set dressing).
- [6] **A chair swivelled round a corner on an endless sine.** Motion has a cause; find the real pivot (`camera-motion.md` §5).
- [5,6|studio] **A cozy room read as boxy CG.** Subdivide soft goods only, drawn surfaces, lamps that light, a screen fitted to its model (`looks.md` true shapes).
- [6|studio] **Two black frames** from a swept tube's zero normals. Set them to the tube's axis.
- [6|studio] **A fan's wind passed through a monitor.** The jet is blocked by objects (`air.js`).
- [6] **A whole set ran at the wrong scale** (kit unit 1.95 m: falls 1.4× too fast). Measure metres per unit first.
- [6|studio] **Placement looked fine and was wrong in four ways** (centre-ray drop, edge hang, overlap, sinking). Lowest-points settling and its report.
- [6|studio] **A decal scaled flat sank under its surface.** Flatten in geometry or offset along the normal.
- [7] **A stale preview iframe gave identical numbers.** Read the newest (`_t=` in its URL).
- [6,7] **Context grew to ~590k tokens:** full-size snapshots and logs stayed in it. Verification runs in a subagent returning text; `/compact` is safe at Gates 3 and 4.
- [6] **Scene files were patched with inline scripts** (~50 patches, two swallowed code). Scene changes are `Edit` calls.
- [6,7|express] **A measured-frames run said "not measured" at final, OK at assemble, same composition.** The layout records reach `strips.mjs`'s receiver by one post per frame, and with none the file is never written and `layout_lint.mjs` cannot read it. Cause, reproduced in `tests/strips.mjs`: the receiver sat on one fixed port, 127.0.0.1:47614, shared by every capture and every page on the machine. A second capture holding it (another session's round, the gate's own `tests/strips.mjs`) left this one with zero records and exit 0, which `express.mjs` printed only as "could not read the records"; a rerun once the other was done measured OK. The other way round, a page of another film posting there fed foreign records in: a test capture whose page posted nothing received one valid record while another film rendered on the same machine (an older engine copy posts on every frame). Fixed at the root: each capture opens a port of its own and writes its URL into `assets/layout_on.js`, the page posts only there (`tests/strips.mjs` holds 47614 and posts on it during a capture: the capture still records its own, first time). A film whose engine copy predates this keeps 47614 and says `port 47614 is busy`. Also done: posts in flight finish before the receiver closes, the capture retries once, and the WARN prints what the receiver saw (`saw N post(s) in 2 capture(s), V valid, …`: 0 posts = the page posted nothing, posts but none matching = a time mismatch, `cut at the close` = posts lost in flight). The WARN names the command that was run (`express.mjs assemble`, `express.mjs final`, or `studio.mjs final` for a Studio film).
