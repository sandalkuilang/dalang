# Steps 7–8: quality check, final render, hand-off

## Step 7 — Quality check → GATE 4

Review like someone else's code — the goal is to find bugs:

```bash
npx hyperframes check --snapshots
node <skill-dir>/scripts/lint_scene.mjs     # no code swallowed by a mid-line // comment (exit 1: file:line), before the draft
npx hyperframes render --fps 10 --quality draft --quiet --output draft.mp4   # run in the background
node <skill-dir>/scripts/stillness.mjs draft.mp4    # target ≤ 10 %, no still stretch > 1.5 s (planned pauses: --allow a-b)
node <skill-dir>/scripts/loudness.mjs draft.mp4     # target ≈ −14 LUFS, true peak ≤ −1 dBTP
node <skill-dir>/scripts/audio_qc.mjs . --mix draft.mp4   # bed 8–25 dB under the voice, no click, dropout or off pitch; exit 2 = not checked
node <skill-dir>/scripts/qc.mjs draft.mp4 --size <WxH from BRIEF.md>   # black frames, clipping, silences, ends before the narration, codec and colour tags
node <skill-dir>/scripts/timing_lint.mjs    # every picture cut between words, no scene under 1 s
npx hyperframes snapshot --review --describe false
node <skill-dir>/scripts/strips.mjs --crops   # 3 stills per shot on numbered sheets, a subject crop per shot, index.md
node <skill-dir>/scripts/scopes.mjs draft.mp4 --png   # exposure and hue per cut
```

- **Scopes as numbers**: `scopes.mjs` prints YMIN/YMAX, YLOW/YHIGH, SATAVG, HUEAVG per cut. Outside a band: crushed blacks = YLOW at the floor (16; 0 full range); clipped whites = YHIGH at the ceiling (235 / 255); hue jump = over 40° between adjacent cuts that both have SATAVG ≥ 20. All inside: no PNG, no subagent. Outside: a strongest-model subagent opens only the `--png` PNGs, text verdict (no clipped hero or face highlights; crushed blacks only if the look wants them; skin on the skin-tone line; no accidental orange-and-teal).
- **Contact sheet of every cut**: `ffmpeg -i draft.mp4 -vf "select='eq(n\,0)+gt(scene\,0.3)',scale=480:-2,tile=4x3" -frames:v 1 -fps_mode vfr review/cuts.png`
- `--describe false` on every snapshot: with `GEMINI_API_KEY` set, snapshot uploads frames to Gemini otherwise; drop it only if the user agreed.
- **Fresh-eyes review** (defects only) by a new strongest-model subagent on the sheets (`review.md`); a builder subagent fixes every P0 and P1 it writes to `QC-REVIEW.md`. Lean review only if the user calls it a test or draft (log `lean review: user said test` atop `PRODUCTION.md`): reviewer and quiz run once; open P0/P1 go in the hand-off. Never unattended (topic only); "just finish it" ends it.
- **Sound-off quiz** (`review.md`): a fresh subagent answers `quiz.md` from the strips; wrong = Clarity P1.
- **Numbers keep their provenance** (Gate 1's tags, `script-voice.md` §3): in the review strips, every number on screen shows the form its tag decides (`[src]` evidence card, `[calc]` calculation card with `[assume]` inputs labelled, `[illus]` tag, `[unknown]` admission). A number in none of those forms is a Clarity P1, an invented one a Reality P0.
- **Review material comes from `strips.mjs`**, every round: one snapshot call, written as `review/strips/strip-NN.jpg` (a row per shot: 10 %, 50 %, 90 %) and `index.md` (frame → sheet, row, column → time → shot; `## Layout`: canvas text boxes + lint). Rerun after fixes (`--against`, `review.md` step 4); `--per-shot 5` on a long shot.
- **User away (autonomous mode):** a Set or Reality fail of the subject or a shot is a P0, never shipped (next bullet). A Set, Reality or Clarity P1 (one detail off the real thing, the narrated cause shown only in part) blocks the final like a P0 until a round fixes it or two rounds fail on it; then it ships as a known bug, named in the hand-off. So is an `audio_qc.mjs` flag (exit 3); its exit 2 (a page script beyond the engine library, GSAP's CDN too) is never a pass: fix what you can, else the hand-off's known bugs name "music bed level not checked". Other P1s may ship, listed in the hand-off. With the user present, Gate 4 is theirs.
- The reviewer runs the rubric; you compare the review sheet's beat frames with the approved style frames and a second strongest-model subagent checks Set and Reality on full-resolution snapshots of every shot with the subject (people judged in motion), a text verdict per shot; you never open the stills yourself; a Set or Reality fail (P0) is fixed before Gate 4; a lesser detail (P1) follows the user-away rule.
- **In parallel (`SKILL.md` "Parallel by default"):** the read-only scripts on `draft.mp4` go out in one message; the fresh-eyes reviewer, the sound-off quiz and the second Set / Reality check start together once the strips exist, with no render, check or snapshot running beside them. Model and effort come from the table in `SKILL.md`.
- A fix check between rounds: a mid-tier, low-effort subagent gets the `changed (targeted)` stills and the finding to confirm gone.
- Too quiet → raise the narration in the mix. Too still → add motion where the script points. `stillness.mjs` counts a drifting still as motion: it catches frozen frames, not slideshows.
- Run `check`, snapshots and renders with no model job running. A render over 3× slower than the last → stop and look for a cause (`--debug`, other Chrome processes, a heavy filter). Log every problem in `PRODUCTION.md`.
- **Strobing check** (24 fps brief with 3D camera moves or fast bodies): snapshot two adjacent frames across the fastest move and body; sharp doubles instead of a smear = P1 "strobing on camera moves". The 10 fps draft cannot show it.

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

Deliver `final.mp4` with `audio/narration.srt` (sidecar subtitles; upload it as the caption track), `CREDITS.md` and `POST.md`, the post description (below; the report links it, an upload pastes it as is). Report plainly, every number from `PRODUCTION.md`: final file, duration, platform and format; time per stage, render time, revision rounds; cost (0 unless the user chose a paid service); licences that limit use (e.g. a non-commercial voice model); **known bugs**; the top improvement. The second-language cut was asked in the Brief (Call 4); do not offer it here.

**Open P1s:** list every P1 still open in `QC-REVIEW.md` with its rubric test and why it stays (cosmetic, or two rounds failed on it).

**Skill feedback:** end `PRODUCTION.md` with a `## Skill feedback` section: each trap any video could hit (a build, render or tool trap, not a taste call), what it cost (minutes, a render, a round) and the rule you suggest, in generic words: nothing that identifies this video (topic, names, assets, numbers). Tell the user in one line that it is there to report upstream (an issue on the skill's repo). Never edit the installed skill or use your own memory for it: another user or project never sees it.

### Post description (POST.md)

A companion to the film, written at the hand-off from `script.md` (plus `numbers.json` / `model.mjs` when there is one), in the narration language: not a second script, no new fact. At most about 1,800 characters (Reels and TikTok 2,200, Shorts 5,000; platform in `BRIEF.md`), no emoji walls. Six parts:

1. The hook as a question, with the short answer, in one line.
2. The model in plain sentences: the example case and its spec, the rule of thumb, the adjustments. A number that changes over time is dated where it is stated ("as of <month year>": a tariff, a price, a standard's edition), and a computed result is labelled "our model, not a measurement".
3. Both failure modes, one line each (too little and too much, or the two ways the thing goes wrong).
4. A self-check the viewer can do with their own numbers: "<your measure> x <rule>, add for <conditions>, compare with the figure on the label, the bill or the gauge".
5. One save or share call to action ("save this for later, or send it to a friend who is deciding"), then one comment question asking for the next topic.
6. One sources line (publishers only, no wall of URLs), then 4-5 hashtags.

A film without a model, failure modes or a checkable number drops those parts: never invent a formula for part 4. Every number is the film's (`script.md` tags, `numbers.json`); the part 4 formula on the example inputs gives the film's number.

Credits: a CC0 or public-domain asset needs no line. A CC BY asset gets one credit line only if the user chose CC BY at Gate 2 and chose the description as its place (`look-build.md` §6 item 7). No meta lines about tools, models or AI unless the user asks; the platform's AI label is an upload toggle, asked at upload. User away: write it anyway and link it in the report.

### Second-language cut: QC and delivery

- **Draft:** `npx hyperframes render --fps 10 --quality draft --quiet --output draft.<lang>.mp4`, then `timing_lint.mjs --audio audio/<lang>` (every cut between the new words), `qc.mjs draft.<lang>.mp4 --audio audio/<lang> --size <WxH>`, `loudness.mjs draft.<lang>.mp4`, and a captions check on the phone sheet (`strips.mjs --audio audio/<lang> --out review/strips-<lang>` when the captions changed length). No fresh-eyes review of the look: the look and storyboard are the approved ones; a caption or label that overflows is fixed in `strings.<lang>.js`.
- `audio_qc.mjs` reads `audio/words.json` (the first take): it does not check the cut; say so in the hand-off.
- **Final:** `npx hyperframes render --fps <fps> --quality high --quiet --output final.<lang>.mp4`, the same re-checks as the first final with `--audio audio/<lang>`; `check_assets.mjs .` again (a new voice model's licence).
- **Deliver** `final.<lang>.mp4` and `narration.<lang>.srt` (a copy of `audio/<lang>/narration.srt`) beside `final.mp4`; `POST.md` gets a `POST.<lang>.md` in that language (same six parts, no new fact). Report the cut's numbers like the first's. Restore `index.html` (`look-build.md` "Second-language cut", last step).
