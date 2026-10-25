# Steps 7–8: quality check, final render, hand-off

## Step 7 — Quality check → GATE 4

Review like someone else's code — the goal is to find bugs:

```bash
npx hyperframes check --snapshots
npx hyperframes render --fps 10 --quality draft --quiet --output draft.mp4   # run in the background
node <skill-dir>/scripts/stillness.mjs draft.mp4    # target ≤ 10 %, no still stretch > 1.5 s (planned pauses: --allow a-b)
node <skill-dir>/scripts/loudness.mjs draft.mp4     # target ≈ −14 LUFS, true peak ≤ −1 dBTP
node <skill-dir>/scripts/qc.mjs draft.mp4 --size <WxH from BRIEF.md>   # black frames, clipping, silences, ends before the narration, codec and colour tags
node <skill-dir>/scripts/timing_lint.mjs    # every picture cut between words, no scene under 1 s
npx hyperframes snapshot --review --describe false
```

- `--describe false` on every snapshot: with `GEMINI_API_KEY` set, snapshot otherwise uploads frames to Gemini. Drop it only if the user agreed.
- **Fresh-eyes review** by a new subagent on the sheets (`review.md`); fix every P0 and P1 it writes to `QC-REVIEW.md`.
- The reviewer runs the rubric; you compare the review sheet's beat frames with the approved style frames (the film must look like them, not drift back to defaults) and check Realism and Reality yourself, judged on full-resolution snapshots of every shot with the subject (people judged in motion); any fail is fixed before Gate 4, never shipped as a known weak shot.
- Too quiet → raise the narration in the mix. Too still → add motion where the script points. `stillness.mjs` counts a drifting still as motion: it catches frozen frames, not slideshows — that is the reviewer's Action test.
- Run `check`, snapshots and renders with no model job running: next to mflux one `check` took 121–149 s instead of 13–18 s.
- A render far slower than the last one (over 3×) → stop it and look for a cause (`--debug`, other Chrome processes, a heavy filter) instead of waiting.
- Log every problem in `PRODUCTION.md`.

Then `npx hyperframes preview --background --no-open` (without `--no-open` it launches the user's own Chrome) and show the Studio URL **only in Claude's isolated built-in browser** (the Browser pane: `preview_start` with the URL). Never the system browser, `open <url>`, or Claude in Chrome (the user's real Chrome); no built-in browser → give the URL as text. Then **wait for approval** (changes → Steps 6–7). After approval:

```bash
node <skill-dir>/scripts/state.mjs approve 4 --by <user|agent> && node <skill-dir>/scripts/check_assets.mjs . [--commercial]   # both must pass
npx hyperframes render --quality high --quiet --output final.mp4
node <skill-dir>/scripts/qc.mjs final.mp4 --size <WxH> --fps <fps> && node <skill-dir>/scripts/loudness.mjs final.mp4 && node <skill-dir>/scripts/stillness.mjs final.mp4
```

`--commercial` when the video will be monetised (fails non-commercial licences). Loudness still off on the final → `loudness.mjs final.mp4 --fix final-14lufs.mp4` and deliver that file.

A clean final encode can measure stiller than the draft; over target → add motion and render again.

## Step 8 — Hand-off

Deliver `final.mp4` with `audio/narration.srt` (sidecar subtitles; upload it as the caption track) and `CREDITS.md`. Report in plain language, every number from `PRODUCTION.md`: final file, duration, platform and format; time per stage and render time; revision rounds; cost (0 unless the user chose a paid service); licences that limit use (e.g. a non-commercial voice model); **known bugs**, honestly; the one improvement with the biggest impact.
