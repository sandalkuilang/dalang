# Fresh-eyes review (Step 7)

The builder sees what it meant, not what is on screen, so before Gate 4 one reviewer with no build history looks at the film. It only finds problems; the human gate still decides.

## How

1. Produce the sheets: `npx hyperframes snapshot --review --describe false` (scene sheet, a strip at every cut, a 360 px phone sheet). For a person or a generated clip, add `snapshot --at` stills sampled across the clip (about 8 per clip).
2. Spawn **one new subagent** (the Agent tool, a fresh agent — never a fork or a follow-up of the builder, which defends its own work). Give it only:
   - the sheet paths and the full-resolution stills of every shot with the subject,
   - `SPEC.md` (LOOK, MOTION, OBJECTS with their real reference, BANNED), `storyboard.md` (each row's job, camera reason and axis — check one still at every shot's action beat against its row) and the approved style frames,
   - `visual-direction.md` §11 (the rubric) and, for people, §1 "People are the hardest subject",
   - the beat list (`audio/beats.json`: name, start, words),
   - this instruction: "Find defects. For each: the beat or time, what is wrong, the rubric test it fails, severity P0 (must fix: Realism/Reality fail, wrong claim, unreadable text, broken render), P1 (should fix: craft, composition, transition), P2 (nice to have). Write them to QC-REVIEW.md. Do not praise; do not fix."
3. Fix every P0 and P1 in the builder session, re-snapshot only what changed, log each fix in `PRODUCTION.md`, and mark the item `FIXED` in `QC-REVIEW.md` (open P0s are what `score_run.mjs` counts).
4. After the fixes, review again only if P0s were open; stop after three rounds in total and list what is still open at Gate 4.

## Autonomous mode

Same review; the reviewer's P0 list replaces the human's eye at Gate 4. Anything still open goes into the hand-off as a known bug.
