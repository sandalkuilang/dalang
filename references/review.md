# Fresh-eyes review (Step 7)

The builder sees what it meant, not what is on screen, so before Gate 4 one reviewer with no build history looks at the film. It only finds problems; the human gate still decides.

## How

1. Produce the sheets, plus an action strip per shot (`node <skill-dir>/scripts/strips.mjs`: 10 %, 50 % and 90 % of each storyboard row, one row per shot on `review/strips/strip-NN.jpg`, frame → time → shot in `index.md`; from round 2 on, `--against`, step 4) so the Action test can see whether the subject changed or only the frame moved: `npx hyperframes snapshot --review --describe false` (scene sheet, a strip at every cut, a 360 px phone sheet). For a person or a generated clip, add `snapshot --at` stills sampled across the clip (about 8 per clip).
2. Spawn **one new subagent** (the Agent tool, a fresh agent — never a fork or a follow-up of the builder, which defends its own work), on the strongest model (no `model` override: the review is the quality bar). Give it only:
   - the sheet paths, the strip sheets with `review/strips/index.md`, and the full-resolution stills of every shot with the subject,
   - `SPEC.md` (LOOK, MOTION, OBJECTS with their real reference, BANNED), `storyboard.md` (each row's job, camera reason and axis — check one still at every shot's action beat against its row) and the approved style frames,
   - `visual-direction.md` §11 (the rubric), §12 (information layers) and, for people, §1 "People are the hardest subject",
   - the beat list (`audio/beats.json`: name, start, words),
   - this instruction: "Find defects. For each: the beat or time, what is wrong, the rubric test it fails (its name on the line: Reality, Clarity, Action, Figure-ground…), severity P0 (must fix: Realism/Reality fail of the subject or the shot, slideshow (Action test), a hero merged into its ground (Figure-ground), wrong claim, unreadable text, broken render), P1 (should fix: craft, composition, transition, weak figure-ground separation, strobing on camera moves (Strobing), a section that fails Sound off, a fact repeated across layers (No repeat), captions too high on 9:16 (Reels, TikTok: block top above ~70 % of the height; Shorts: block bottom above ~65 %, never the 70 % line, since its band ends at 69 %; Composition), and a Realism, Reality or Clarity defect smaller than a fail: one detail off, the narrated cause shown only in part), P2 (nice to have). Write them to QC-REVIEW.md. Do not praise; do not fix."
3. Fix every P0 and P1 in the builder session — all of the round's fixes first, then one re-snapshot of only what changed (a physics set re-baked once with `bake.mjs` before it). A fix-check subagent (`model: "sonnet"`, the mid tier) checks the new stills against the findings and returns pass/fail per item, so the stills stay out of the builder's context. Log each fix in `PRODUCTION.md`, and mark the item `FIXED` in `QC-REVIEW.md` (open P0s are what `score_run.mjs` counts).
4. After the fixes, review again only if P0s were open, or, with the user away, Realism, Reality or Clarity P1s (`qc.md` Step 7); stop after three rounds in total and list what is still open at Gate 4. Repeat rounds diff the strips: keep the last round under its own number (`mv review/strips review/strips-<n>`, n = rounds done, never an existing name), then run `node <skill-dir>/scripts/strips.mjs --against review/strips-<n> --targets <the fix list's shot numbers or beat names>` (`--threshold <pct>`, default 1, if the render is noisy). Give the new reviewer `index.md` and only the `changed` frames: `changed (targeted)` is re-reviewed against its finding; `changed (not targeted)` is a possible regression, a new finding until shown intended. `unchanged` frames keep their verdict in `QC-REVIEW.md`; a targeted shot with no changed frame (`WARN` in the output) means the fix did not show. The compare is a heuristic on a 64x36 gray copy: a very small change can pass as `unchanged`.

## Sound-off quiz (Step 7, a second fresh subagent beside the reviewer)

Clarity as a number, comparable across skill versions. The reviewer's Sound off row stays free-form.

- **`review/quiz.md`**, written at Gate 1: `| # | Beat | Question | Key |`, 5 rows: the mechanism; the key number with its comparison; the decision rule; a common misconception and its correction (phrase it so the naive answer is the wrong one); one more claim (a kind the script lacks is replaced by another claim). Each question is answerable from a headline, card or label alone and does not contain the answer's words. `Beat` is the name from `audio/beats.json`; keep beat names neutral, the answerer sees them in `index.md`. A claim changed after Gate 1: update `quiz.md` before the quiz runs.
- **Run** after `strips.mjs`, in every review round that runs: a NEW subagent (never the builder, never the fresh-eyes reviewer, which has SPEC and storyboard). Give it ONLY the strip sheet paths, `review/strips/index.md` and the questions pasted from `quiz.md` WITHOUT the Key column; never narration, script, captions, beats, SPEC or storyboard. Instruction: "Sound off, pictures only. Answer each question in one short sentence from what is on screen (headline, card, label, figure). If the frames do not show it, write 'not shown'. Do not use general knowledge; if you know the answer from elsewhere, still answer only what the frames show."
- **Score** (the builder compares each answer with the Key; a doubt is `partly correct`): `correct` = the claim, with its number and comparison or correction where the Key has them; `partly correct` = the right idea missing the number, comparison or correction; `wrong` = a different claim, a contradiction, or `not shown`. Write `review/quiz-result.md`: `# Quiz result`, a line `Round <n>`, then `| # | Beat | Question | Answer given | Key | Verdict |`, one row per question, the verdict last. Each round overwrites it; `score_run.mjs` reads the last (correct = 1, partly correct = 0.5).
- Each `wrong` becomes a line in `QC-REVIEW.md`: `P1 | <beat> t=<time> | Clarity | quiz Q<n> wrong: <what the frames fail to carry>` (time from `index.md`), fixed like any Clarity P1 (a headline, card or label, `visual-direction.md` §12) and marked `FIXED`. `partly correct` is only recorded. Same with the user away.
- Three stills per shot can miss a card shown between them: run `strips.mjs --per-shot 5` before calling a wrong answer a real defect on a long shot.

## Asset pass (before Gate 3, and again before the Step 6 blocking pass)

Most P0s in a real run were asset defects (a machine part in the wrong place, garbled signs and page text, a product that changed shape between shots) found only after the whole film was built and rendered. Catch them while a fix is one regeneration:

1. One pair per generated or 3D OBJECTS still, beside its downloaded reference: `ffmpeg -loglevel error -y -i assets/gen/<x>.png -i review/ref-<x>.jpg -filter_complex "[0]scale=-1:960[a];[1]scale=-1:960[b];[a][b]hstack" review/pair-<x>.jpg`.
2. The same fresh subagent rules as above, on the mid tier (`model: "sonnet"`: a pair comparison against a real reference), given only the pair paths, SPEC OBJECTS and `visual-direction.md` §1 "Reality check", with: "For each pair: is the left the same kind of thing as the right — parts, where the action happens, proportions, materials; any garbled text or logo; does the same object match across pairs? P0 = Reality fail. List only defects."
3. Regenerate or re-source every P0 before building on it. The builder doesn't open full-size stills for this; the reviewer does.

## Model per job

Which model each subagent job uses: `SKILL.md` "Work fast". The review and the second Realism / Reality check keep the session's (strongest) model; fix checks and asset pairs run on the mid tier.

## Autonomous mode

Same review; the reviewer's P0 list and its Realism, Reality and Clarity P1s replace the human's eye at Gate 4 (`qc.md` Step 7). Anything still open goes into the hand-off as a known bug; each open P1 with why it stays.
