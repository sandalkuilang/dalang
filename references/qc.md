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
node <skill-dir>/scripts/strips.mjs   # 3 stills per storyboard shot, one row per shot, on numbered sheets + review/strips/index.md
```

- **Scopes on the cuts** (look at the PNGs): a contact sheet of every cut checks palette, ratio and composition consistency; a waveform and a vectorscope on 2–3 beat frames check exposure (no clipped highlights on the hero or faces, blacks crushed only if the look wants it) and hue (skin on the skin-tone line, no accidental orange-and-teal):
  ```bash
  ffmpeg -i draft.mp4 -vf "select='eq(n\,0)+gt(scene\,0.3)',scale=480:-2,tile=4x3" -frames:v 1 -fps_mode vfr review/cuts.png
  ffmpeg -ss <t> -i draft.mp4 -vf "waveform=scale=ire:graticule=green:flags=numbers+dots" -frames:v 1 review/waveform-<t>.png
  ffmpeg -ss <t> -i draft.mp4 -vf "vectorscope=mode=color3:graticule=color" -frames:v 1 review/vectorscope-<t>.png
  ```
- `--describe false` on every snapshot: with `GEMINI_API_KEY` set, snapshot otherwise uploads frames to Gemini. Drop it only if the user agreed.
- **Fresh-eyes review** by a new subagent on the sheets (`review.md`); fix every P0 and P1 it writes to `QC-REVIEW.md`.
- **Numbers keep their provenance** (Gate 1's tags, `script-voice.md` §3): in the review strips, every number on screen shows the form its tag decides (`[src]` evidence card, `[calc]` calculation card with `[assume]` inputs labelled as assumptions, `[illus]` illustration tag, `[unknown]` shown admission). A number with no source, calculation, illustration tag or admission is a Clarity P1, and an invented one a Reality P0; both follow the unattended-run rule below.
- **Review material comes from `strips.mjs`**, every round: it reads the shot table, captures every still in one snapshot call and writes `review/strips/strip-NN.jpg` (one row per shot, left to right 10 %, 50 %, 90 %) and `index.md` (frame → sheet, row, column → time → shot). Never tile by hand: snapshot names large sets `contact-sheet-1.jpg`, `-2.jpg`, so a guessed name misses. Run it again after the round's fixes; `--per-shot 5` for a long shot.
- **User away (autonomous mode):** nobody accepts a known defect. A Realism or Reality fail of the subject or a shot is a P0 and is never shipped, user away or not (next bullet). A smaller defect, a P1 whose rubric test is Realism or Reality (one detail does not look like the real thing) or Clarity (the narrated cause is shown only in part), blocks the final like a P0 until a round fixed it or two rounds failed on it; only then it ships as a known bug, named in the hand-off with why. Other P1s (craft, composition, transition) may ship, listed in the hand-off. With the user present, Gate 4 is theirs to decide.
- The reviewer runs the rubric; you compare the review sheet's beat frames with the approved style frames (the film must look like them, not drift back to defaults) and check Realism and Reality yourself, judged on full-resolution snapshots of every shot with the subject (people judged in motion); any Realism or Reality fail (a P0) is fixed before Gate 4, never shipped as a known weak shot; a detail short of a fail (a P1) follows the user-away rule above.
- Too quiet → raise the narration in the mix. Too still → add motion where the script points. `stillness.mjs` counts a drifting still as motion: it catches frozen frames, not slideshows — that is the reviewer's Action test.
- Run `check`, snapshots and renders with no model job running: next to a model job one `check` took 121–149 s instead of 13–18 s.
- A render far slower than the last one (over 3×) → stop it and look for a cause (`--debug`, other Chrome processes, a heavy filter) instead of waiting.
- Log every problem in `PRODUCTION.md`.

Then `npx hyperframes preview --background --no-open` (without `--no-open` it launches the user's own Chrome) and show the Studio URL **only in Claude's isolated built-in browser** (the Browser pane: `preview_start` with the URL). Never the system browser, `open <url>`, or Claude in Chrome (the user's real Chrome); no built-in browser → give the URL as text. Then **wait for approval** (changes → Steps 6–7). After approval:

```bash
node <skill-dir>/scripts/state.mjs approve 4 --by <user|agent> && node <skill-dir>/scripts/check_assets.mjs . [--commercial]   # both must pass
npx hyperframes render --fps <fps from BRIEF.md> --quality high --quiet --output final.mp4
node <skill-dir>/scripts/qc.mjs final.mp4 --size <WxH> --fps <fps> && node <skill-dir>/scripts/loudness.mjs final.mp4 && node <skill-dir>/scripts/stillness.mjs final.mp4
```

`--commercial` when the video will be monetised (fails non-commercial licences). Loudness still off on the final → `loudness.mjs final.mp4 --fix final-14lufs.mp4` and deliver that file.

A clean final encode can measure stiller than the draft; over target → add motion and render again.

## Step 8 — Hand-off

Deliver `final.mp4` with `audio/narration.srt` (sidecar subtitles; upload it as the caption track) and `CREDITS.md`. Report in plain language, every number from `PRODUCTION.md`: final file, duration, platform and format; time per stage and render time; revision rounds; cost (0 unless the user chose a paid service); licences that limit use (e.g. a non-commercial voice model); **known bugs**, honestly; the one improvement with the biggest impact.

**Open P1s:** list every P1 still open in `QC-REVIEW.md` with its rubric test and why it stays (cosmetic, or two rounds failed on it).

**Skill feedback:** end `PRODUCTION.md` with a `## Skill feedback` section: each trap any video could hit (a build, render or tool trap, not a taste call), what it cost (minutes, a render, a round) and the rule you suggest, in generic words: no topic, names, assets or numbers that identify this video. Tell the user in one line that it is there to report upstream (an issue on the skill's repository). Never edit the installed skill; your own memory is not the place either: another user or project never sees it.
