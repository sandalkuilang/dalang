# forge — repo profile: the DALANG skill

The forge engine in the sapu plugin reads this file. It adds facts, never loosens a gate; `CLAUDE.md` is the law.

## Token discipline

Search before reading: `graft ask "<terms>" --source` or `rg`, then read by range. `references/*.md`,
`scripts/preflight.mjs`, `scripts/tts_timestamps.mjs` and `engine/three/physics.js` are long. Gate and test output:
`2>&1 | tail -30`.

## Labels

From the contract:
- tiers `risk:green`, `risk:yellow`, `risk:red` (prefix `risk:`)
- work labels `agent:in-progress` and `agent:done`
- acceptance `sapu:accepted`; agent-filed `sapu:agent-filed`

Issue types are plain words in the title. Existing labels `bug`, `enhancement` and `documentation` stay as filed.

## Worktree

`.claude/worktrees/<name>` from `origin/main`. No dependency install except the engine's pinned vendors, which
the gate installs into the worktree on its first run.

## Tests

- `tests/preflight-mock.mjs` pins preflight's VoiceStudio states against a mock backend.
- `engine/three/selfcheck.mjs` pins the engine's traps: physics in real units, the bake cache, holds, cloth, fur,
  wind, water.
- Test-driven where there is logic: a preflight change adds a mock case first, an engine change an assertion first.
- Prose has no test beyond the gate's static checks. Its reviewer checks it against `CLAUDE.md` §Rules.

## Merge gate

`scripts/gate.sh`, run by `sapu-merge.sh` only. CI runs the same script on every push and PR.

## After merge

None in the repo (`mergeAfter` is null). Two steps are the owner's, never forge's: a release (CHANGELOG section,
README pin, tag) and `git pull` in `~/.claude/skills/dalang`.

## Team

Every role keeps its senior-dev-team default. Scripts and the engine: `qa` reviews. A red change (worker.md
§Red areas) gets the `architect` as the domain half of the red pair. `SKILL.md`, `references/`, `README.md` and
`docs/`: `writer`.

## Invariant domains

The contract's `invariantDomains`:
- the skill stays generic
- the user's consent gates
- preflight never reads an unknown state as missing
- the asset licence gate
- the account and attribution rules

## Invariants

- No tracked file, issue, PR, commit or CHANGELOG line names a test video's topic, voice, people or assets.
- The video agent asks before every install, payment, recorded or cloned voice, and at each of the 4 gates.
- A state preflight cannot read is `WARN` with "rerun", never `MISSING`, "none" or an install offer.
- Motion is three.js, physical and caused; no local image or video generation model is added.
- A cached bake replays exactly what a live bake gives; any input that changes the result changes its hash.
- A behaviour change updates every doc that states it and adds its `CHANGELOG.md` `Unreleased` entry.

## Security bar

There is no server and there are no secrets in the repo. The bar is the user's consent and data:
- keys stay in the environment, never read or printed
- nothing is downloaded or installed without a yes
- a voice is cloned only with the speaker's permission
- no frame leaves the machine unless the user agreed (`snapshot --describe false`)

## Bypass classes

A second route to the same effect: a script flag, an autonomous-mode default or a reference file that skips a
consent step or a gate the main path keeps. Every consent rule is checked in `SKILL.md`, the step's reference
and autonomous mode alike.

## Research dossier

Cite official docs, with their URL, in the PR comment:
- HyperFrames CLI and its skills
- VoiceStudio's API: the app's own routes
- three.js and Rapier
- model cards on Hugging Face, for licences

## Inline review

Check that:
- a new rule is stated once, in the file the step table names, and every other doc that states it agrees
- examples come from varied domains, never a test video
- a preflight note tells the agent what to do, not only what is wrong

## Decisions

The multi-agent `code-review` skill is not used: the tiered QA reviewers are the review.

## Incidents

None recorded in this profile.
