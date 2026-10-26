# Evals: is the skill getting better?

Read this only when changing the skill. Run the golden briefs in autonomous mode (one fresh session each, the skill invoked as a user would), then `node scripts/score_run.mjs video/<slug>` per project and compare with the previous run's scorecards. A change that lowers a score without a reason is a regression.

## Golden briefs

Each brief stresses a different part. Pick fresh topics each time (never reuse a test topic), but keep the shape.

| # | Brief (user's words, in the user's language) | Stresses |
|---|---|---|
| 1 | "A 30–45 s Short on <a physical, real-world subject>, autonomous." | real-footage sourcing, realism ladder, 9:16 safe zones |
| 2 | "A 60–90 s landscape explainer on <a number-led topic>, autonomous." | data look, facts, every number tagged (none untagged at Gate 1), `beats_per_10s` (one beat every 2–4 s ≈ 2.5–5) |
| 3 | "A 45 s dialogue scene between two people about <an everyday situation>, autonomous." | people (hyperreal, no puppets), multi-voice, `LINES` |
| 4 | "Turn this recording into a 60 s video: <user audio file>, autonomous." | `--from-audio`, timing from a real voice |
| 5 | "A 60 s stylized explainer of <a process too small, too large or too slow to film>, autonomous." | a subject outside `engine/three`: its own law, scale changes shown, a self-check, nothing borrowed from earlier sets |

## What to compare

From `score_run.mjs`: `still_pct` (≤ 10), `lufs` (≈ −14 ± 1), `true_peak` (≤ −1), `qc_problems` (0), `timing_problems` (0), `est_words` (0 is best), `assets_ok` (true), `gates_approved` (4 at a finished draft), `review_p0` (0 open), `logged_minutes`, `logged_problems`.

Not measurable by script, judged on the review sheets: Realism and Reality (`visual-direction.md` §11), the people test, whether the voice sounds human (a human listens). Record these by hand next to the scorecard.

Also compare the cost of the run: tool calls and tokens per step (from the session's usage), and whether any reference file was read in full when only a section was needed.
