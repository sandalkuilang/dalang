#!/usr/bin/env bash
# scripts/gate.sh [--fast] — the repo's gate, run from anywhere. --fast: static checks (seconds), for a worker
# before its PR. Without it, the merge gate: the static checks, then the engine built into a temp dir and its
# self-check, then preflight against a mock VoiceStudio. CI runs the merge gate on every push and pull request.
# Ends with a "Gate summary" block, one ✓/✗ line per step; exits non-zero when any step failed.
set -u
cd "$(dirname "$0")/.."
fast=0; [ "${1:-}" = "--fast" ] && fast=1
summary=(); failed=0
step() { # step <name> <command...>: runs it, prints its output only when it fails
  local name=$1; shift
  local out; out=$("$@" 2>&1)
  if [ $? -eq 0 ]; then summary+=("✓ $name"); else summary+=("✗ $name"); failed=1; printf '── %s failed ──\n%s\n' "$name" "$out"; fi
}
syntax() { local f; for f in scripts/*.mjs engine/three/*.js engine/three/*.mjs engine/three/examples/*.js tests/*.mjs; do node --check "$f" || return 1; done; bash -n scripts/measure_reference.sh scripts/gate.sh; }
frontmatter() { head -1 SKILL.md | grep -qx -- '---' && grep -q '^name: dalang$' SKILL.md && grep -q '^description: ' SKILL.md; }
engine() { local d; d=$(mktemp -d) && node engine/three/build.mjs "$d" >/dev/null && node engine/three/selfcheck.mjs "$d"; local r=$?; rm -rf "$d"; return $r; }

step "syntax (scripts, engine, tests)" syntax
step "SKILL.md front-matter" frontmatter
step "README diagrams (light derived from dark)" python3 docs/assets/build.py --check
if [ $fast -eq 0 ]; then
  step "engine build + self-check" engine
  step "preflight vs mock VoiceStudio" node tests/preflight-mock.mjs
fi

echo "Gate summary ($([ $fast -eq 1 ] && echo fast || echo merge))"
printf '%s\n' "${summary[@]}"
exit $failed
