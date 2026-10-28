#!/bin/sh
# One command, no waiting: scripts/release.sh x.y.z
# Cuts the release from origin/main: a release/vx.y.z branch that moves CHANGELOG's Unreleased into ## [x.y.z] - today
# and pins the README's clone example, a PR merged at once (main asks for no status check), then the tag on the merged
# commit. The tag starts the `release` workflow, whose own checks refuse a broken tag; CI runs on main as usual, in the
# background. No local gate and no golden eval here: run `node scripts/golden.mjs --version x.y.z` before this only when
# the release changes how films look (engine look, lights, camera, render).
# GitHub writes go through GH_USER's token only (default: the repo owner's account).
set -e
v=${1#v}
echo "$v" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "usage: scripts/release.sh x.y.z"; exit 1; }
cd "$(dirname "$0")/.."
export GH_TOKEN="$(gh auth token -u "${GH_USER:-sandalkuilang}")"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "the working tree has uncommitted changes: commit or stash them first"; exit 1; }
git fetch -q --tags origin
prev=$(git describe --tags --abbrev=0 origin/main)
git rev-parse -q --verify "refs/tags/v$v" >/dev/null && { echo "v$v already exists"; exit 1; }
git switch -q -c "release/v$v" origin/main
V="$v" PREV="$prev" DAY="$(date +%F)" node -e '
const fs = require("fs"), { V, PREV, DAY } = process.env, url = "https://github.com/sandalkuilang/dalang/compare/";
let c = fs.readFileSync("CHANGELOG.md", "utf8");
const body = c.split("## [Unreleased]\n")[1]?.split(/\n## \[/)[0] ?? "";
if (!/^- /m.test(body)) { console.error("CHANGELOG.md: Unreleased is empty, nothing to release"); process.exit(1); }
c = c.replace("## [Unreleased]\n", `## [Unreleased]\n\n## [${V}] - ${DAY}\n`)
     .replace(`[Unreleased]: ${url}${PREV}...HEAD\n`, `[Unreleased]: ${url}v${V}...HEAD\n[${V}]: ${url}${PREV}...v${V}\n`);
if (!c.includes(`[${V}]: ${url}`)) { console.error("CHANGELOG.md: the [Unreleased] link does not compare from " + PREV); process.exit(1); }
fs.writeFileSync("CHANGELOG.md", c);
const r = fs.readFileSync("README.md", "utf8"), r2 = r.replace(/--branch v\d+\.\d+\.\d+ /, `--branch v${V} `);
if (r2 === r) { console.error("README.md: no clone example to pin"); process.exit(1); }
fs.writeFileSync("README.md", r2);'
git commit -q -am "chore(release): v$v - Unreleased moved into $v, README clone example pinned"
git push -q -u origin "release/v$v"
gh pr create --base main --title "Release v$v" --body "Release v$v: CHANGELOG's Unreleased moved into $v, the README clone example pinned. Cut by scripts/release.sh." >/dev/null
gh pr merge "release/v$v" --rebase --delete-branch >/dev/null
git fetch -q origin main # tag the merged commit on origin/main; never switch to main, which another worktree may hold
git tag -a "v$v" -m "v$v" origin/main && git push -q origin "v$v"
echo "released v$v (the release workflow publishes it; CI runs on main in the background)"
