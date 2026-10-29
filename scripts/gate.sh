#!/usr/bin/env bash
# scripts/gate.sh [--fast] — the repo's gate, run from inside the checkout it checks. --fast: static checks (seconds): syntax,
# SKILL.md front-matter, README diagrams, the reading list (state.mjs reading: headings exist, sections within budget), for a worker
# before its PR. Without it, the merge gate: the static checks, then the engine built into a temp dir and its
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the palette measurement. CI runs the merge gate on every push and pull request.
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the voice retake / busy / chunk-limit checks against a mock VoiceStudio, the scene lint, the numbers lint, the SFX-from-impacts check. CI runs the merge gate on every push and pull request.
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the voice retake / busy / chunk-limit checks against a mock VoiceStudio, the scene lint, the numbers lint, the storyboard lint, the series kit. CI runs the merge gate on every push and pull request.
# self-check, then preflight against a mock VoiceStudio, the voice-model licence cross-check, the asset licence gate with the engine manifest, the media search against a mock Openverse / Commons, the review-strips check, and the voice retake / busy / chunk-limit checks against a mock VoiceStudio, the scene lint, the numbers lint, the beats lint, fill_times --lang, the SFX-from-impacts check, the quiz score, the Kokoro take check. CI runs the merge gate on every push and pull request.
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
syntax() { local f; for f in scripts/*.mjs engine/three/*.js engine/three/*.mjs engine/three/examples/*.js examples/golden/*.js tests/*.mjs; do node --check "$f" || return 1; done; bash -n scripts/measure_reference.sh scripts/gate.sh scripts/release.sh; }
frontmatter() { head -1 SKILL.md | grep -qx -- '---' && grep -q '^name: dalang$' SKILL.md && grep -q '^description: ' SKILL.md; }
engine() { local d; d=$(mktemp -d) && node engine/three/build.mjs "$d" >/dev/null && node engine/three/selfcheck.mjs "$d"; local r=$?; rm -rf "$d"; return $r; }

step "syntax (scripts, engine, tests)" syntax
step "SKILL.md front-matter" frontmatter
step "README diagrams (light derived from dark)" python3 docs/assets/build.py --check
step "reading list (headings exist, sections <= 8 KB, Steps 0–8 <= 60 KB)" node scripts/state.mjs reading
step "state.mjs next vs fixture projects and fixture skills" node tests/reading.mjs
step "build docs (Step 5 / Step 6 item 4 agree with the parallel build)" node tests/build-docs.mjs
step "cue table (words per beat as the engine counts them)" node tests/cues.mjs
step "express steps (no take, a take with a WARNING)" node tests/express.mjs
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
  step "retake, busy retry, resume, chunk limit vs mock VoiceStudio" node tests/retake.mjs
  step "Kokoro take, alignment, retake vs a mock Python" node tests/kokoro.mjs
  step "Kokoro helper vs fake packages (no unasked fetch, broken install is not missing)" node tests/kokoro-helper.mjs
  step "iso.js (vendored) loads, three tones per face, back-to-front paint" node tests/iso.mjs
  step "iso forms, build() specs and the glTF reader (ratio, cutaway, paint order, axes, refusals)" node tests/iso-build.mjs
  step "iso audit (floating, sunk, pipe through, loose pipe end caught; the CLI exits 0/3/2)" node tests/iso-audit.mjs
  step "film gate (seams, floats in motion, rushed labels, still stretches; unread is a WARN)" node tests/film-gate.mjs
  step "trace (a photo into vtracer layers where vtracer is installed; the plate turns, blurs, tints, flows, pins)" node tests/trace.mjs
  step "parallax (layer cameras by depth, far to near, SVG and HTML transforms)" node tests/iso-parallax.mjs
  step "cinema (camera keys one way, no handheld, ramp, whip, motion blur, focus, haze, finish order, grain)" node tests/iso-cinema.mjs
  step "scene lint (code swallowed by a mid-line // comment)" node tests/lint-scene.mjs
  step "numbers lint (spoken model numbers = numbers.json)" node tests/numbers-lint.mjs
  step "narration lint (no ; : ( ) /, sentences <= 22 words, Promise + Takeaway)" node tests/narration-lint.mjs
  step "beats lint (two narrations: same named beats, same order)" node tests/beats-lint.mjs
  step "fill_times --lang (times from audio/<lang>, language variants, plain run unchanged)" node tests/fill-times.mjs
  step "storyboard lint (empty cells, repeated size+angle, text-only share, average shot)" node tests/storyboard-lint.mjs
  step "token report (dedupe, builder budget WARN, shared session, not checked, recorded at approve)" node tests/tokens.mjs
  step "scaffold (engine, host and group templates from narration beats; first from 0, last to END; music bed; refusals write nothing)" node tests/scaffold.mjs
  step "pad_voice (1.45 s before, 1.35 s after; every time moved; never twice; the raw take refused once padded)" node tests/pad-voice.mjs
  step "Gate 3 benchmark (approve 3 vs stub verdicts; reference board where ffmpeg runs)" node tests/benchmark.mjs
  step "layout lint (canvas text: safe area, hero overlap, min size, caption over label)" node tests/layout-lint.mjs
  step "series kit (save, list, apply; never a scene module)" node tests/series.mjs
  step "golden (metrics, diff, flags vs fixture frames; no Chrome)" node tests/golden.mjs
  step "golden scene (stations, texel size, pure camera; no render)" node tests/golden-scene.mjs
  step "score_run (sound-off quiz result -> score, timing_problems inside groups)" node tests/score-run.mjs
  step "timing lint (cuts and flash clips inside shot groups, unreadable group = exit 1)" node tests/timing-lint.mjs
  step "audio QC (bed level, clicks, dropouts, voice drift)" node tests/audio-qc.mjs
  step "workspace (init writes only the project file, keeps unknown keys, undo byte for byte, no --yes = no write)" node tests/workspace.mjs
  step "blender parts (library and assembly compile; built and read where Blender is installed)" node tests/blender-parts.mjs
fi

echo "Gate summary ($([ $fast -eq 1 ] && echo fast || echo merge))"
printf '%s\n' "${summary[@]}"
exit $failed
