# CLAUDE.md — working on the dalang repo

This repo **is** the DALANG skill (topic → animated video with HyperFrames and free local tools). These rules are for
changing the skill: humans, Claude sessions and backlog agents alike. Making a video with the skill follows
`SKILL.md`, not this file.

## Layout

- `SKILL.md`: the pipeline, gates and working rules the agent reads first. `references/*.md`: one file per step,
  read lazily by the agent.
- `scripts/`: the pipeline's tools (`preflight.mjs`, `tts_timestamps.mjs`, `state.mjs`, QC scripts).
  `scripts/gate.sh` is the gate.
- `engine/three/`: the generic three.js engine copied into each video project (`build.mjs`), with
  `selfcheck.mjs`. `engine/iso/`: Express's isometric look (Canvas 2D, objects
  as data, parallax, cinema). `engine/anatomy/`: Anatomy's geometry audit (MIT, vendored unchanged) and `world.mjs`,
  which proves an Express world (`scripts/iso_audit.mjs`). `engine/epic/`: the design languages both modes use (isometric-world first, cutaway, blueprint).
- `engine/blender/`: the precision lane's generic tooling (`parts.py` library, `templates/hero.clip.tpl.html`, checked by
  `tests/blender-parts.mjs`); each hero asset lives in the owner's `<videos>/library/hero/<name>/`, never in this repo. `engine/music/`: the bundled CC0 / public-domain beds.
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

- **Generic, always** (`tests/generic.mjs` enforces it: no samples, worked examples or subject assets in the repo; the owner's
  test-film words, kept outside the repo in `~/.config/dalang/test-topics.txt`, never appear). DALANG serves any topic, any language, any platform. A finding from a real video is written
  as a general rule with examples from varied domains. A test video's topic, voice, people, assets or numbers that
  identify it never appear anywhere: skill files, issues, PRs, commit messages or the CHANGELOG. Grep your text for
  the test topic's words before every commit or GitHub write.
- **Behaviour first, then docs in step.** A change to what the agent does updates every place that says it:
  `SKILL.md`, the step's `references/*.md`, `README.md`, `docs/`, and the CHANGELOG's `Unreleased` section
  (Added / Changed / Fixed / Removed). Semantic versions follow the table at the top of `CHANGELOG.md`.
- **Motion is light, physical and caused.** No local image or video generation models, no physics engine. Things
  that touch, fall or collide are posed from their cause as a pure function of t (fall time from the place's gravity,
  an eased landing with contact squash, stops, tooth ratios); nothing floats, drifts or loops without a visible
  cause. Real scale, real materials, real mass. Express (the default, `references/express.md`) is 2.5D isometric in
  Canvas 2D (`engine/iso`; charts and type in SVG/HTML), 20 minutes of work per film. Studio is the precision lane:
  three.js (`engine/three`) for the iso look, its hero modelled once from 2D pictures as a Blender script
  (`engine/blender`, `references/hero-asset.md`). Both keep the same caused motion and true shapes.
- **Stylized only, two looks.** No hyperreal look, no filmed footage, no photoreal render, no generated image
  or clip. Express and Studio share three languages (`references/looks.md`): `isometric-world` is the
  main language, flat drawing made to read as 3D (2.5D) through layers and colour, `cutaway` on the beats that open a thing
  up, `blueprint` on beats that need engineering-grade detail; always true to how the subject looks and works. The second look,
  `object-studio`, is the real object as clean 3D on a light grey sweep (`engine/three`), in either mode. Any other look
  is answered in one line, never followed. The agent plans the camera (`references/camera-motion.md`).
- **Never read "unknown" as "missing".** A tool that cannot read a state (timeout, error, odd reply) reports WARN
  and says to rerun. It never reports MISSING, never says "none" and never suggests installing.
- **Installs only with consent.** The skill never installs a model, app or key on its own. It states size and
  licence, and asks first.
- **Free and local by default.** Paid services (ElevenLabs, HeyGen credits) only when the user asks.
- **No new dependencies** for what a few lines do. Engine vendors stay pinned in `engine/three/vendor`, **always on their latest releases**, three.js first (the owner's standing
  consent to update them): `node scripts/vendor_latest.mjs` shows what is behind, `--update` bumps and installs it, and the self-check
  runs after; three stays inside the peer range of `postprocessing`, and when that caps it the check says which package to wait for.
  `scripts/release.sh` prints a behind or capped line before it cuts a release.

## Git and GitHub

- Personal repo: commits and GitHub writes use only the owner's personal account (`sandalkuilang`), never a work
  account.
- `main` is protected: every change, a release included, goes in from a branch through a PR (rebase merge, linear
  history), with its gate green. No direct push, no force push, for admins too.
- No AI attribution in commits or PRs (no `Co-Authored-By` trailer, no "Generated with" footer).
- Releases: at most one a week (`--urgent`: a PATCH sooner), the bump read from `Unreleased` by the table at the top of
  `CHANGELOG.md`, never picked, by the size of the change: `### Redesign` MAJOR (a very large design or algorithm overhaul, only
  with `--major`, the owner's call), `### Rework` MINOR (medium to large), everything else PATCH (fixes, improvements, features). `scripts/release.sh`, one command and no waiting: from `origin/main` it opens `release/vx.y.z`,
  moves `Unreleased` into `## [x.y.z] - date`, pins the README's clone example, merges that PR at once and tags the
  merged commit; the `release` workflow publishes the section and its own checks refuse a broken tag. No local gate
  and no CI wait for a release (CI still runs on `main`).
- The installed copy (`~/.claude/skills/dalang`) is a clone of this repo: update it with `git pull`, never edit
  it directly.
