# Fresh-eyes review (Step 7)

The builder sees what it meant, not what is on screen, so before Gate 4 one reviewer with no build history looks at the film. It only finds problems; the human gate still decides.

## How

1. Produce the sheets, plus an action strip per shot (`node <skill-dir>/scripts/strips.mjs`: 10 %, 50 % and 90 % of each storyboard row, one row per shot on `review/strips/strip-NN.jpg`, frame → time → shot in `index.md`) so the Action test can see whether the subject changed or only the frame moved: `npx hyperframes snapshot --review --describe false` (scene sheet, a strip at every cut, a 360 px phone sheet). For a person or a generated clip, add `snapshot --at` stills sampled across the clip (about 8 per clip).
2. Spawn **one new subagent** (the Agent tool, a fresh agent — never a fork or a follow-up of the builder, which defends its own work). Give it only:
   - the sheet paths, the strip sheets with `review/strips/index.md`, and the full-resolution stills of every shot with the subject,
   - `SPEC.md` (LOOK, MOTION, OBJECTS with their real reference, BANNED), `storyboard.md` (each row's job, camera reason and axis — check one still at every shot's action beat against its row) and the approved style frames,
   - `visual-direction.md` §11 (the rubric), §12 (information layers) and, for people, §1 "People are the hardest subject",
   - the beat list (`audio/beats.json`: name, start, words),
   - this instruction: "Find defects. For each: the beat or time, what is wrong, the rubric test it fails (its name on the line: Reality, Clarity, Action, Figure-ground…), severity P0 (must fix: Realism/Reality fail of the subject or the shot, slideshow (Action test), a hero merged into its ground (Figure-ground), wrong claim, unreadable text, broken render), P1 (should fix: craft, composition, transition, weak figure-ground separation, a section that fails Sound off, a fact repeated across layers (No repeat), captions too high on 9:16 (Reels, TikTok: block top above ~70 % of the height; Shorts: block bottom above ~65 %, never the 70 % line, since its band ends at 69 %; Composition), and a Realism, Reality or Clarity defect smaller than a fail: one detail off, the narrated cause shown only in part), P2 (nice to have). Write them to QC-REVIEW.md. Do not praise; do not fix."
3. Fix every P0 and P1 in the builder session — all of the round's fixes first, then one re-snapshot of only what changed (a physics set re-baked once with `bake.mjs` before it). A subagent checks the new stills against the findings and returns pass/fail per item, so the stills stay out of the builder's context. Log each fix in `PRODUCTION.md`, and mark the item `FIXED` in `QC-REVIEW.md` (open P0s are what `score_run.mjs` counts).
4. After the fixes, review again only if P0s were open, or, with the user away, Realism, Reality or Clarity P1s (`qc.md` Step 7); stop after three rounds in total and list what is still open at Gate 4.

## Asset pass (before Gate 3, and again before the Step 6 blocking pass)

Most P0s in a real run were asset defects (a machine part in the wrong place, garbled signs and page text, a product that changed shape between shots) found only after the whole film was built and rendered. Catch them while a fix is one regeneration:

1. One pair per generated or 3D OBJECTS still, beside its downloaded reference: `ffmpeg -loglevel error -y -i assets/gen/<x>.png -i review/ref-<x>.jpg -filter_complex "[0]scale=-1:960[a];[1]scale=-1:960[b];[a][b]hstack" review/pair-<x>.jpg`.
2. The same fresh subagent rules as above, given only the pair paths, SPEC OBJECTS and `visual-direction.md` §1 "Reality check", with: "For each pair: is the left the same kind of thing as the right — parts, where the action happens, proportions, materials; any garbled text or logo; does the same object match across pairs? P0 = Reality fail. List only defects."
3. Regenerate or re-source every P0 before building on it. The builder doesn't open full-size stills for this; the reviewer does.

## Autonomous mode

Same review; the reviewer's P0 list and its Realism, Reality and Clarity P1s replace the human's eye at Gate 4 (`qc.md` Step 7). Anything still open goes into the hand-off as a known bug; each open P1 with why it stays.
