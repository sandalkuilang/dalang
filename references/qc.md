# Steps 7–8: quality check, final render, hand-off

## Step 7 — Quality check → GATE 4

Review like someone else's code: find bugs.

```bash
node <skill-dir>/scripts/studio.mjs qc . [--allow a-b] [--targets <shots>]   # run_in_background, never polled: check,
#   the 10 fps draft, qc_all (one PASS / FAIL / WARN line per check), strips --crops, review/cuts.png; from round 2 the
#   last round's verdicts and strips go to review/round-<n>/ first
node <skill-dir>/scripts/studio.mjs fixes .   # after the reviewer: one fixer prompt per review/fixes-<group>.md
```

`qc_all.mjs` runs, side by side, and prints only a failing check's own lines: `stillness.mjs` (≤ 10 %, no still stretch
over 1.5 s; planned pauses `--allow a-b`), `loudness.mjs` (≈ −14 LUFS, true peak ≤ −1 dBTP), `audio_qc.mjs --mix` (bed
8–25 dB under the voice, no click, dropout or off pitch), `qc.mjs` (`--size` from `BRIEF.md`: black frames, clipping,
silences, early end, codec and colour tags), `timing_lint.mjs` (every cut between words, no scene under 1 s),
`lint_scene.mjs` (no code swallowed by a mid-line `//` comment) and `scopes.mjs --png` (exposure and hue per cut). A
WARN (exit 2: a check could not run) is never a pass: fix its cause and rerun. Each script still runs alone, for a
rerun of one check. Reviewer, quiz and Set / Reality check start together once the strips exist, with no render, check
or snapshot beside them (models: `SKILL.md`).

- **Scopes**: `scopes.mjs` prints YMIN/YMAX, YLOW/YHIGH, SATAVG, HUEAVG per cut. Out of band: crushed blacks = YLOW at the floor (16; 0 full range); clipped whites = YHIGH at the ceiling (235 / 255); hue jump = > 40° between adjacent cuts both with SATAVG ≥ 20. All inside: no PNG, no subagent. Outside: a subagent opens only the `--png` PNGs and gives a text verdict (no clipped hero or face highlights; crushed blacks only if the look wants them; skin on the skin-tone line; no accidental orange-and-teal).
- **Contact sheet of every cut**: `ffmpeg -i draft.mp4 -vf "select='eq(n\,0)+gt(scene\,0.3)',scale=480:-2,tile=4x3" -frames:v 1 -fps_mode vfr review/cuts.png`
- **Review material** is `strips.mjs`, every round: `review/strips/strip-NN.jpg` (a row per shot: 10 %, 50 %, 90 %) and `index.md` (frame → sheet, row, column → time → shot; `## Layout`: canvas text boxes + lint). Rerun after fixes with `--against` (`review.md` step 4); `--per-shot 5` on a long shot.
- **Fresh-eyes review** (defects only) by a new subagent on the sheets (`review.md`); a builder subagent fixes every P0 and P1 it writes to `QC-REVIEW.md`. Lean review only when the user calls the run a test or draft (log `lean review: user said test` atop `PRODUCTION.md`): reviewer and quiz run once, open P0/P1 go in the hand-off. Never lean when unattended; "just finish it" ends it.
- **Sound-off quiz** (`review.md`): a fresh subagent answers `quiz.md` from the strips; wrong = Clarity P1.
- **Set / Reality check**: a second subagent checks full-resolution snapshots of every shot with the subject (people judged in motion), a text verdict per shot; it also compares the beat frames with the approved style frames. You never open the stills.
- **Numbers keep their provenance form** (`script-voice.md` §3): a number in none of those forms is a Clarity P1, an invented one a Reality P0.
- **User away (every run after the Brief), the ship rules:** a Set or Reality fail of the subject or a shot is a P0, never shipped. A Set, Reality or Clarity P1 (a detail off the real thing, the narrated cause shown only in part) blocks the final until a round fixes it or two rounds fail on it; then it ships named in the hand-off. So does an `audio_qc.mjs` flag (exit 3); its exit 2 (a page script beyond the engine library, GSAP's CDN too) is never a pass: fix what you can, else the hand-off's known bugs name "music bed level not checked". Other P1s may ship, listed in the hand-off.
- **Fix check** between rounds: a subagent gets the `changed (targeted)` stills and the findings, returns pass/fail and one line per fix.
- Too quiet → raise the narration in the mix. Too still → add motion where the script points (`stillness.mjs` catches frozen frames, not slideshows).
- Run `check`, snapshots and renders with no model job beside them. A render over 3× slower than the last → find the cause (`--debug`, other Chrome processes, a heavy filter). Log every problem in `PRODUCTION.md`.
- **Strobing** (24 fps brief with 3D camera moves or fast bodies): snapshot two adjacent frames across the fastest move; sharp doubles instead of a smear = P1. The 10 fps draft cannot show it.

Then `npx hyperframes preview --background --no-open` and show the Studio URL **only in Claude's built-in browser** (`preview_start`); never `open <url>`, the system browser or Claude in Chrome; no built-in browser → give the URL as text. Step 8's first command records Gate 4.

## Step 8 — Final render

```bash
node <skill-dir>/scripts/studio.mjs final .   # run_in_background: check, check_assets, the high render, the poster,
#   gate 4, the metrics table, then qc_all on final.mp4; POST.md while it runs
```

Monetised: also `check_assets.mjs . --commercial`. Loudness off on the final → `loudness.mjs final.mp4 --fix final-14lufs.mp4`, deliver that. Stillness over target on the final → add motion, render again.

## Step 8 — Hand-off

**Run metrics, last:** `node <skill-dir>/scripts/state.mjs metrics` writes `review/metrics.md`; paste the whole table (every agent with model, effort, tokens, and the Total tokens line) into the final message to the user, never only a path to the file. Tokens that read "not checked" are reported so, never as 0.

Deliver `final.mp4` with `audio/narration.srt` (the caption track), `CREDITS.md` and `POST.md`. Report plainly, every number from `PRODUCTION.md`: final file, duration, platform and format; time per stage, render time, revision rounds; cost (0 unless paid); licences that limit use; **known bugs**; the top improvement. Never offer a second-language cut here.

**Open P1s:** every P1 still open in `QC-REVIEW.md`, with its rubric test and why it stays (cosmetic, or two rounds failed).

**Skill feedback:** end `PRODUCTION.md` with `## Skill feedback`: each trap any video could hit (build, render or tool, not taste), what it cost and the rule you suggest, in generic words with nothing that identifies this video. Tell the user in one line it is there to report upstream. Never edit the installed skill or put it in memory.

### Post description (POST.md)

Written at the hand-off from `script.md` (and `numbers.json` / `model.mjs`), in the narration language; no new fact. ≤ ~1,800 characters (Reels and TikTok 2,200, Shorts 5,000), no emoji walls. Six parts:

1. The hook as a question, with the short answer, in one line.
2. The model in plain sentences: the example case, the rule of thumb, the adjustments. A number that changes over time is dated ("as of <month year>"); a computed result is labelled "our model, not a measurement".
3. Both failure modes, one line each; an anatomy explainer lists its parts table instead, "<#> <part>: what it does", one line each.
4. A self-check with the viewer's own numbers: "<your measure> x <rule>, add for <conditions>, compare with the label, the bill or the gauge".
5. One save or share call to action, then one comment question asking for the next topic.
6. One sources line (publishers only), then 4–5 hashtags.

A film without a model, failure modes or a checkable number drops those parts; never invent a formula for part 4. Every number is the film's; part 4 on the example inputs gives the film's number. A CC BY asset gets one credit line (`look-build.md` "Sound effects and music"); CC0 needs none. No lines about tools, models or AI unless the user asks.

### Second-language cut: QC and delivery

- **Draft:** `npx hyperframes render --fps 10 --quality draft --quiet --output draft.<lang>.mp4`, then `timing_lint.mjs --audio audio/<lang>`, `qc.mjs draft.<lang>.mp4 --audio audio/<lang> --size <WxH>`, `loudness.mjs draft.<lang>.mp4`, and a captions check (`strips.mjs --audio audio/<lang> --out review/strips-<lang>` when captions changed length). No look review; an overflowing caption or label is fixed in `strings.<lang>.js`.
- `audio_qc.mjs` checks only the first take: say so in the hand-off.
- **Final:** `npx hyperframes render --fps <fps> --quality high --quiet --output final.<lang>.mp4`, the first final's re-checks with `--audio audio/<lang>`, and `check_assets.mjs .` again.
- **Deliver** `final.<lang>.mp4`, `narration.<lang>.srt` (copy of `audio/<lang>/narration.srt`) and `POST.<lang>.md` (same six parts) beside the first; report the cut's numbers. Restore `index.html` (`look-build.md` "Second-language cut", last step).
