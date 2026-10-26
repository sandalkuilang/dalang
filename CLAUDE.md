# CLAUDE.md — working on the dalang repo

This repo **is** the DALANG skill (topic → animated video with HyperFrames and free local tools). These rules are for
changing the skill: humans, Claude sessions and backlog agents alike. Making a video with the skill follows
`SKILL.md`, not this file.

## Layout

- `SKILL.md`: the pipeline, gates and working rules the agent reads first. `references/*.md`: one file per step,
  read lazily by the agent.
- `scripts/`: the pipeline's tools (`preflight.mjs`, `tts_timestamps.mjs`, `state.mjs`, QC scripts).
  `scripts/gate.sh` is the gate.
- `engine/three/`: the generic three.js + Rapier engine copied into each video project (`build.mjs`), with
  `selfcheck.mjs` and `bake.mjs`. `examples/` holds ready pieces built on it.
- `tests/`: checks the gate runs (`preflight-mock.mjs`: preflight against a mock VoiceStudio).
- `docs/`: workflow and architecture, with diagrams (`docs/assets/build.py` derives the light SVGs from the dark ones).

## Gate

```bash
scripts/gate.sh --fast   # static: syntax, SKILL.md front-matter, diagrams (seconds)
scripts/gate.sh          # merge gate: + engine build and self-check, + preflight mock (~30 s)
```

CI runs the merge gate on every push and pull request. A change to a script's behaviour comes with its check:
a new preflight state → a case in `tests/preflight-mock.mjs`; an engine trap → an assertion in
`engine/three/selfcheck.mjs`.

## Rules

- **Generic, always.** DALANG serves any topic, any language, any platform. A finding from a real video is written
  as a general rule with examples from varied domains. A test video's topic, voice, people, assets or numbers that
  identify it never appear anywhere: skill files, issues, PRs, commit messages or the CHANGELOG. Grep your text for
  the test topic's words before every commit or GitHub write.
- **Behaviour first, then docs in step.** A change to what the agent does updates every place that says it:
  `SKILL.md`, the step's `references/*.md`, `README.md`, `docs/`, and the CHANGELOG's `Unreleased` section
  (Added / Changed / Fixed / Removed). Semantic versions follow the table at the top of `CHANGELOG.md`.
- **Motion is three.js, physical and caused.** No local image or video generation models. Things that touch, fall
  or collide are simulated (Rapier, baked once and replayed: `bakeCached` + `bake.mjs`), never keyframed; nothing
  floats, drifts or loops without a visible cause. Real scale, real materials, real mass.
- **Realism is the user's choice** (hyperreal or stylized, Brief Step 1). Stylized is first-class and still true
  to how the subject looks and works.
- **Never read "unknown" as "missing".** A tool that cannot read a state (timeout, error, odd reply) reports WARN
  and says to rerun. It never reports MISSING, never says "none" and never suggests installing.
- **Installs only with consent.** The skill never installs a model, app or key on its own. It states size and
  licence, and asks first.
- **Free and local by default.** Paid services (ElevenLabs, HeyGen credits) only when the user asks.
- **No new dependencies** for what a few lines do. Engine vendors stay pinned in `engine/three/vendor`.

## Git and GitHub

- Personal repo: commits and GitHub writes use only the owner's personal account (`sandalkuilang`), never a work
  account.
- `main` is protected: every change, a release included, goes in from a branch through a PR (rebase merge, linear
  history), with its gate green. No direct push, no force push, for admins too.
- No AI attribution in commits or PRs (no `Co-Authored-By` trailer, no "Generated with" footer).
- Releases: on a `release/vx.y.z` branch, move `Unreleased` into `## [x.y.z] - date` and pin the README's clone
  example; merge its PR, then tag `vx.y.z` on the merged commit in `main`. The `release` workflow publishes the
  section.
- The installed copy (`~/.claude/skills/dalang`) is a clone of this repo: update it with `git pull`, never edit
  it directly.
