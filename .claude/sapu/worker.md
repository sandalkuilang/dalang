# worker — repo profile: the DALANG skill

The worker brief in the sapu plugin reads this file. The rules for any change are `CLAUDE.md`.

## Setup

None: there is no `package.json`. The engine's self-check (`scripts/gate.sh`) builds the engine into a temp
directory; the first run in a worktree installs its pinned vendors into `engine/three/vendor/node_modules` (npm,
network). Never link `<MAIN>`'s copy.

## Red areas

The contract sets no `redAreas`. Treat as red, and say so in the PR:
- the consent and state logic of `scripts/preflight.mjs` (a state read wrong sends the agent to install, restart
  or pay)
- the licence gate `scripts/check_assets.mjs`
- the gate approvals in `scripts/state.mjs`
- `SKILL.md`'s principles and gates
- the bake cache in `engine/three/physics.js` (a stale replay ships wrong motion)
- the gate itself: `scripts/gate.sh`, `tests/`, `.github/workflows/`

## Test DB

None: no database. Tests write only under the system temp directory and remove it.

## Protected targets

Nothing outside the worktree. In particular:
- the installed skill `~/.claude/skills/dalang` (updated only by the owner's `git pull`)
- VoiceStudio and anything on `localhost:3900`
- any video project in the owner's folders
- the owner's shell profile and environment keys

## Test

Run the checks that cover the diff:
- `scripts/preflight.mjs` → `node tests/preflight-mock.mjs 2>&1 | tail -30`. A new state or note gets a case there.
- `engine/three/*` → `d=$(mktemp -d) && node engine/three/build.mjs "$d" >/dev/null && node engine/three/selfcheck.mjs "$d" | tail -3`. A new trap gets an assertion in `selfcheck.mjs`.
- `docs/assets/*.svg` → `python3 docs/assets/build.py --check`.
- Other scripts have no test file yet: `node --check`, plus the smallest runnable check of the behaviour you changed (a new case in `tests/`) when it has logic.
- Prose (`SKILL.md`, `references/`, `README.md`, `docs/`) → `scripts/gate.sh --fast`, and grep your diff for any test-video detail.

## Verification

`scripts/gate.sh --fast` before the PR, then `scripts/gate.sh 2>&1 | tail -30` when the diff touches a script, the
engine or `tests/`.

## Teardown

Nothing to tear down: no server, container or database outlives a test; the mock servers and temp directories are
closed and removed by the tests themselves.

## Code search

`graft ask "<the issue's key terms>" --source`: the repo's graft index returns `file:line` with the code inlined;
`graft callers <symbol>` before changing a function. When graft reports no index in the worktree, batch the `rg`
lookups into one call instead.
