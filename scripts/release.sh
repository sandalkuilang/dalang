#!/bin/sh
# One command, no waiting: scripts/release.sh [--major] [x.y.z]
# The version comes from CHANGELOG's Unreleased (scripts/next_version.mjs), by the size of the change: ### Redesign is a
# MAJOR (only with --major), ### Rework a MINOR, everything else (fixes, improvements, features) a PATCH; a given x.y.z
# must be that one.
# Cuts the release from origin/main: a release/vx.y.z branch that moves CHANGELOG's Unreleased into ## [x.y.z] - today
# and sets .claude-plugin/plugin.json's version, a PR merged at once (main asks for no status check), then the tag on the merged
# commit. The tag starts the `release` workflow, whose own checks refuse a broken tag; CI runs on main as usual, in the
# background. No local gate.
# GitHub writes go through GH_USER's token only (default: the repo owner's account).
set -e
major=
while :; do case "$1" in --major) major=--major; shift;; *) break;; esac; done
want=${1#v}
[ -z "$want" ] || echo "$want" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || { echo "usage: scripts/release.sh [--major] [x.y.z]"; exit 1; }
cd "$(dirname "$0")/.."
export GH_TOKEN="$(gh auth token -u "${GH_USER:-sandalkuilang}")"
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "the working tree has uncommitted changes: commit or stash them first"; exit 1; }
# three.js and its add-ons stay on their latest releases: a release that is behind says so (it never blocks; `node scripts/vendor_latest.mjs --update` fixes it)
node scripts/vendor_latest.mjs 2>/dev/null | grep -E "^(behind|capped)" || true
git fetch -q --tags origin
prev=$(git describe --tags --abbrev=0 origin/main)
v=$(git show origin/main:CHANGELOG.md | node scripts/next_version.mjs "$prev" $major) || exit 1
[ -z "$want" ] || [ "$want" = "$v" ] || { echo "Unreleased makes this v$v, not v$want: MAJOR needs ### Redesign and --major, MINOR ### Rework (CHANGELOG.md, the table at the top)"; exit 1; }
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
const pf = ".claude-plugin/plugin.json", p = JSON.parse(fs.readFileSync(pf, "utf8"));
p.version = V;
fs.writeFileSync(pf, JSON.stringify(p, null, 2) + "\n");'
git commit -q -am "chore(release): v$v - Unreleased moved into $v, plugin.json version set"
git push -q -u origin "release/v$v"
gh pr create --base main --title "Release v$v" --body "Release v$v: CHANGELOG's Unreleased moved into $v, plugin.json version set. Cut by scripts/release.sh." >/dev/null
gh pr merge "release/v$v" --rebase --delete-branch >/dev/null
git fetch -q origin main # tag the merged commit on origin/main; never switch to main, which another worktree may hold
git tag -a "v$v" -m "v$v" origin/main && git push -q origin "v$v"
echo "released v$v (the release workflow publishes it; CI runs on main in the background)"
