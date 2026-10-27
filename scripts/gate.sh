#!/usr/bin/env bash
# scripts/gate.sh [--fast] — the repo's gate, run from inside the checkout it checks. --fast: static checks (seconds): syntax,
# SKILL.md front-matter, README diagrams, the reading list (state.mjs reading: headings exist, sections within budget), for a worker
# before its PR. Without it, the merge gate: the static checks, then the engine built into a temp dir and its
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the palette measurement. CI runs the merge gate on every push and pull request.
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the voice retake / busy / chunk-limit checks against a mock VoiceStudio, the scene lint, the numbers lint, the SFX-from-impacts check. CI runs the merge gate on every push and pull request.
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the voice retake / busy / chunk-limit checks against a mock VoiceStudio, the scene lint, the numbers lint, the storyboard lint, the series kit. CI runs the merge gate on every push and pull request.
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the voice retake / busy / chunk-limit checks against a mock VoiceStudio, the scene lint, the numbers lint, the SFX-from-impacts check, the quiz score. CI runs the merge gate on every push and pull request.
# Ends with a "Gate summary" block, one ✓/✗ line per step; exits non-zero when any step failed.
set -u
root=$(git rev-parse --show-toplevel) && cd "$root" || exit 2 # the tree the gate is run in (a PR worktree), never this file's own location
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
step "reading list (headings exist, sections <= 8 KB, Steps 0–8 <= 60 KB)" node scripts/state.mjs reading
step "state.mjs next vs fixture projects and fixture skills" node tests/reading.mjs
if [ $fast -eq 0 ]; then
  step "engine build + self-check" engine
  step "preflight vs mock VoiceStudio" node tests/preflight-mock.mjs
  step "voice model + licence cross-check" node tests/voice-licence.mjs
  step "asset licence gate (unknown file, wrong licence, engine manifest)" node tests/assets.mjs
  step "find_media vs mock Openverse / Commons" node tests/find-media.mjs
  step "review strips (storyboard -> sheets + index)" node tests/strips.mjs
  step "save-profile cut vs mock VoiceStudio" node tests/save-profile.mjs
  step "scopes (signalstats per cut: bands, flagged cuts, PNGs only when flagged)" node tests/scopes.mjs
  step "palette (dominant colours, OKLCH L, figure-ground compare)" node tests/palette.mjs
  step "retake, busy retry, chunk limit vs mock VoiceStudio" node tests/retake.mjs
  step "scene lint (code swallowed by a mid-line // comment)" node tests/lint-scene.mjs
  step "numbers lint (spoken model numbers = numbers.json)" node tests/numbers-lint.mjs
  step "SFX from impacts (tags, gains, merge, licence rows vs check_assets)" node tests/sfx.mjs
  step "storyboard lint (empty cells, repeated size+angle, text-only share, average shot)" node tests/storyboard-lint.mjs
  step "series kit (save, list, apply; never a scene module)" node tests/series.mjs
  step "golden (metrics, diff, flags vs fixture frames; no Chrome)" node tests/golden.mjs
  step "score_run (sound-off quiz result -> score)" node tests/score-run.mjs
fi

echo "Gate summary ($([ $fast -eq 1 ] && echo fast || echo merge))"
printf '%s\n' "${summary[@]}"
exit $failed
