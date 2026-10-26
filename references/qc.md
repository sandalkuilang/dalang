# Steps 7–8: quality check, final render, hand-off

## Step 7 — Quality check → GATE 4

Review like someone else's code — the goal is to find bugs:

```bash
npx hyperframes check --snapshots
node <skill-dir>/scripts/lint_scene.mjs     # no code swallowed by a mid-line // comment (exit 1: file:line), before the draft
npx hyperframes render --fps 10 --quality draft --quiet --output draft.mp4   # run in the background
node <skill-dir>/scripts/stillness.mjs draft.mp4    # target ≤ 10 %, no still stretch > 1.5 s (planned pauses: --allow a-b)
node <skill-dir>/scripts/loudness.mjs draft.mp4     # target ≈ −14 LUFS, true peak ≤ −1 dBTP
node <skill-dir>/scripts/audio_qc.mjs . --mix draft.mp4   # bed 8–25 dB under the voice, no click, dropout or off-pitch sentence; exit 2 = a check could not run (never OK; declared mix only: a `data-fx-chain`, a repeated or unlisted attribute, a sub-composition or a script with `volume`, `muted`, `playbackRate`, `gain` or `fx` = judge by ear; obfuscated writes: out of scope); other bed names, a `loop` clip or an unmuted `<video>`: `--music <id>` per bed
node <skill-dir>/scripts/qc.mjs draft.mp4 --size <WxH from BRIEF.md>   # black frames, clipping, silences, ends before the narration, codec and colour tags
node <skill-dir>/scripts/timing_lint.mjs    # every picture cut between words, no scene under 1 s
npx hyperframes snapshot --review --describe false
node <skill-dir>/scripts/strips.mjs --crops   # 3 stills per shot on numbered sheets, a subject crop per shot, index.md
node <skill-dir>/scripts/scopes.mjs draft.mp4 --png   # exposure and hue per cut
```

- **Scopes as numbers**: `scopes.mjs` prints YMIN/YMAX, YLOW/YHIGH, SATAVG, HUEAVG per cut. Outside a band: crushed blacks = YLOW at the floor (16; 0 full range); clipped whites = YHIGH at the ceiling (235 / 255); hue jump = over 40° between adjacent cuts that both have SATAVG ≥ 20. All inside: no PNG, no subagent. Outside: a strongest-model subagent opens only the `--png` PNGs, text verdict (no clipped hero or face highlights; crushed blacks only if the look wants them; skin on the skin-tone line; no accidental orange-and-teal).
- **Contact sheet of every cut** (palette, ratio, composition): `ffmpeg -i draft.mp4 -vf "select='eq(n\,0)+gt(scene\,0.3)',scale=480:-2,tile=4x3" -frames:v 1 -fps_mode vfr review/cuts.png`
- `--describe false` on every snapshot: with `GEMINI_API_KEY` set, snapshot uploads frames to Gemini otherwise; drop it only if the user agreed.
- **Fresh-eyes review** by a new strongest-model subagent on the sheets (`review.md`); fix every P0 and P1 it writes to `QC-REVIEW.md`. Lean review only if the user calls the run a test or draft (log `lean review: user said test` atop `PRODUCTION.md`): reviewer and quiz run once; open P0/P1 go in the hand-off. Never unattended (topic only); "just finish it" ends it.
- **Sound-off quiz** (`review.md`): a fresh subagent answers `quiz.md` from the strips; wrong = Clarity P1.
- **Numbers keep their provenance** (Gate 1's tags, `script-voice.md` §3): in the review strips, every number on screen shows the form its tag decides (`[src]` evidence card, `[calc]` calculation card with `[assume]` inputs labelled, `[illus]` tag, `[unknown]` admission). A number in none of those forms is a Clarity P1, an invented one a Reality P0.
- **Review material comes from `strips.mjs`**, every round: one snapshot call for every shot's stills, written as `review/strips/strip-NN.jpg` (a row per shot: 10 %, 50 %, 90 %) and `index.md` (frame → sheet, row, column → time → shot). Never tile by hand. Rerun after fixes (`--against`, `review.md` step 4); `--per-shot 5` on a long shot.
- **User away (autonomous mode):** a Realism or Reality fail of the subject or a shot is a P0, never shipped (next bullet). A Realism, Reality or Clarity P1 (one detail off the real thing, the narrated cause shown only in part) blocks the final like a P0 until a round fixes it or two rounds fail on it; then it ships as a known bug, named in the hand-off with why. An `audio_qc.mjs` flag is such a P1 too. Other P1s (craft, composition, transition) may ship, listed in the hand-off. With the user present, Gate 4 is theirs.
- The reviewer runs the rubric; you compare the review sheet's beat frames with the approved style frames (the film must look like them, not drift back to defaults) and a second strongest-model subagent checks Realism and Reality on full-resolution snapshots of every shot with the subject (people judged in motion), a text verdict per shot; you never open the stills yourself; a Realism or Reality fail (P0) is fixed before Gate 4; a lesser detail (P1) follows the user-away rule.
- A fix check between rounds: a mid-tier subagent (`model: "sonnet"`) gets the `changed (targeted)` stills and the finding to confirm gone.
- Too quiet → raise the narration in the mix. Bed flagged → its `data-volume` or lane; a click or an off sentence → `tts_timestamps.mjs --retake <n>`. Too still → add motion where the script points. `stillness.mjs` counts a drifting still as motion: it catches frozen frames, not slideshows (the Action test).
- Run `check`, snapshots and renders with no model job running: next to a model job one `check` took 121–149 s instead of 13–18 s.
- A render far slower than the last one (over 3×) → stop it and look for a cause (`--debug`, other Chrome processes, a heavy filter) instead of waiting.
- Log every problem in `PRODUCTION.md`.
- **Strobing check** (24 fps brief with 3D camera moves or fast bodies): snapshot two adjacent frames across the fastest move and the fastest body; sharp doubles instead of a smear = P1 "strobing on camera moves". The 10 fps draft cannot show it.

Then `npx hyperframes preview --background --no-open` (without `--no-open` it launches the user's own Chrome) and show the Studio URL **only in Claude's isolated built-in browser** (the Browser pane, `preview_start`). Never the system browser, `open <url>`, or Claude in Chrome (the user's real Chrome); no built-in browser → give the URL as text. Then **wait for approval** (changes → Steps 6–7). After approval:

## Step 8 — Final render

```bash
node <skill-dir>/scripts/state.mjs approve 4 --by <user|agent> && node <skill-dir>/scripts/check_assets.mjs . [--commercial]   # both must pass
npx hyperframes render --fps <fps from BRIEF.md> --quality high --quiet --output final.mp4
node <skill-dir>/scripts/qc.mjs final.mp4 --size <WxH> --fps <fps> && node <skill-dir>/scripts/loudness.mjs final.mp4 && node <skill-dir>/scripts/stillness.mjs final.mp4 && node <skill-dir>/scripts/audio_qc.mjs . --mix final.mp4
```

`--commercial` when the video will be monetised (fails non-commercial licences). Loudness still off on the final → `loudness.mjs final.mp4 --fix final-14lufs.mp4` and deliver that file.

A clean final encode can measure stiller than the draft; over target → add motion and render again.

## Step 8 — Hand-off

Deliver `final.mp4` with `audio/narration.srt` (sidecar subtitles; upload it as the caption track), `CREDITS.md` and `POST.md`, the post description (`qc.md`, "Post description (POST.md)"; the report links it, an upload pastes it as is). Report in plain language, every number from `PRODUCTION.md`: final file, duration, platform and format; time per stage and render time; revision rounds; cost (0 unless the user chose a paid service); licences that limit use (e.g. a non-commercial voice model); **known bugs**, honestly; the one improvement with the biggest impact.

**Open P1s:** list every P1 still open in `QC-REVIEW.md` with its rubric test and why it stays (cosmetic, or two rounds failed on it).

**Skill feedback:** end `PRODUCTION.md` with a `## Skill feedback` section: each trap any video could hit (a build, render or tool trap, not a taste call), what it cost (minutes, a render, a round) and the rule you suggest, in generic words: no topic, names, assets or numbers that identify this video. Tell the user in one line that it is there to report upstream (an issue on the skill's repository). Never edit the installed skill; your own memory is not the place either: another user or project never sees it.

### Post description (POST.md)

A companion to the film, written at the hand-off from `script.md` (plus `numbers.json` / `model.mjs` when there is one), in the narration language: not a second script, no new fact. At most about 1,800 characters (Reels and TikTok allow 2,200, Shorts 5,000; the platform is in `BRIEF.md`), no emoji walls. Six parts, in order:

1. The hook as a question, with the short answer, in one line.
2. The model in plain sentences: the example case and its spec, the rule of thumb, the adjustments. A number that changes over time is dated where it is stated ("as of <month year>": a tariff, a price, a standard's edition), and a computed result is labelled "our model, not a measurement".
3. Both failure modes, one line each (too little and too much, or the two ways the thing goes wrong).
4. A self-check the viewer can do with their own numbers: "<your measure> x <rule>, add for <conditions>, compare with the figure on the label, the bill or the gauge".
5. One save or share call to action ("save this for later, or send it to a friend who is deciding"), then one comment question that asks for the next topic.
6. One sources line (publishers only, no wall of URLs), then 4-5 hashtags.

A film with no model, no failure modes or no number the viewer can check drops the parts it lacks and keeps the rest: never invent a formula to fill part 4. Every number is the film's (`script.md` tags, `numbers.json`); the part 4 formula, run on the film's example inputs, gives the film's number.

Credits: a CC0 or public-domain asset needs no line. A CC BY asset gets one plain credit line only if the user chose CC BY at Gate 2 and chose the description as its place (`look-build.md` Step 6, item 7). No meta lines about tools, models or AI unless the user asks; the platform's own AI label is an upload toggle, asked at upload. User away (autonomous mode): write it anyway and link it in the report.
