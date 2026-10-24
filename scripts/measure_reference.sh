#!/usr/bin/env bash
# Measure a reference video mechanically: info, one frame per second, contact sheets,
# estimated hard cuts, estimated "boil" rate, stillness, and loudness.
# The output is numbers to borrow the rhythm from — not material to copy.
#
# Usage: bash measure_reference.sh <video> <output-folder> [cut-threshold=0.35]

set -euo pipefail

VIDEO="${1:-}"
OUT="${2:-}"
SCENE="${3:-0.35}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -z "$VIDEO" || -z "$OUT" ]]; then
  echo "Usage: bash measure_reference.sh <video> <output-folder> [cut-threshold]" >&2
  exit 1
fi
[[ -f "$VIDEO" ]] || { echo "FAILED: file not found: $VIDEO" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "FAILED: ffmpeg not found" >&2; exit 1; }

mkdir -p "$OUT/frames" "$OUT/contact"

# 1) Basic info
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VIDEO")
FPS_RAW=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$VIDEO")
FPS=$(awk -F/ '{ if ($2>0) printf "%.3f", $1/$2; else print $1 }' <<<"$FPS_RAW")
RES=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "$VIDEO")
AUD=$(ffprobe -v error -select_streams a -show_entries stream=codec_name,channels -of csv=p=0 "$VIDEO" | head -1)
{
  echo "File       : $VIDEO"
  echo "Duration   : $(printf '%.1f' "$DUR") s"
  echo "Resolution : $RES"
  echo "FPS        : $FPS"
  echo "Audio      : ${AUD:-none}"
} | tee "$OUT/info.txt"

# 2) One frame per second (480 px wide)
echo "Extracting 1 frame per second..."
ffmpeg -hide_banner -loglevel error -y -i "$VIDEO" -vf "fps=1,scale=480:-2" "$OUT/frames/%04d.jpg"
NFRAMES=$(ls "$OUT/frames" | wc -l | tr -d ' ')

# 3) 4x4 contact sheets (16 seconds per sheet)
echo "Building contact sheets..."
ffmpeg -hide_banner -loglevel error -y -framerate 1 -i "$OUT/frames/%04d.jpg" \
  -vf "tile=4x4:padding=4:margin=4:color=white" "$OUT/contact/sheet_%03d.jpg"
: > "$OUT/contact/index.txt"
n=1
for f in "$OUT"/contact/sheet_*.jpg; do
  s=$(( (n - 1) * 16 )); e=$(( n * 16 - 1 ))
  (( e > NFRAMES - 1 )) && e=$(( NFRAMES - 1 ))
  echo "$(basename "$f"): seconds $s–$e (read left→right, top→bottom)" >> "$OUT/contact/index.txt"
  n=$(( n + 1 ))
done

# 4) Estimated hard cuts
echo "Detecting hard cuts (threshold $SCENE)..."
ffmpeg -hide_banner -nostats -i "$VIDEO" -map 0:v:0 -vf "select='gt(scene,$SCENE)',showinfo" -f null - 2>&1 \
  | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 \
  | awk '{ printf "%.2f\n", $1 }' > "$OUT/cuts.txt" || true
NCUTS=$(wc -l < "$OUT/cuts.txt" | tr -d ' ')

# 5) Estimated boil rate: unique frames per second at 3 points
echo "Estimating boil rate..."
: > "$OUT/boil.txt"
for frac in 0.25 0.50 0.75; do
  T=$(awk -v d="$DUR" -v f="$frac" 'BEGIN { printf "%.2f", d*f }')
  U=$(ffmpeg -hide_banner -nostats -ss "$T" -t 2 -i "$VIDEO" -map 0:v:0 -vf "mpdecimate,showinfo" -f null - 2>&1 | grep -c 'pts_time:' || true)
  awk -v t="$T" -v u="$U" 'BEGIN { printf "second %s: %.1f unique frames per second\n", t, u/2 }' >> "$OUT/boil.txt"
done
cat "$OUT/boil.txt"
echo "(Note: most meaningful in shots with a still camera. About 5 = lines redrawn 5x per second.)" >> "$OUT/boil.txt"

# 6) Stillness & loudness (Node scripts, if Node is available)
if command -v node >/dev/null; then
  node "$HERE/stillness.mjs" "$VIDEO" > "$OUT/stillness.txt" 2>&1 || true
  node "$HERE/loudness.mjs" "$VIDEO" > "$OUT/loudness.txt" 2>&1 || true
fi

# Summary
{
  echo "# Mechanical measurement summary"
  cat "$OUT/info.txt"
  echo "Frames           : $NFRAMES files in frames/"
  echo "Contact sheets   : $(ls "$OUT"/contact/sheet_*.jpg | wc -l | tr -d ' ') sheets (see contact/index.txt)"
  echo "Hard cuts        : $NCUTS (estimate, threshold $SCENE; see cuts.txt)"
  [[ -f "$OUT/stillness.txt" ]] && grep -E 'Total still|Longest still' "$OUT/stillness.txt" || true
  [[ -f "$OUT/loudness.txt" ]] && grep -E 'integrated' "$OUT/loudness.txt" || true
} | tee "$OUT/summary.txt"

echo
echo "Done. Next: read the contact sheets + the full transcript, then write reference-measurements.md."
