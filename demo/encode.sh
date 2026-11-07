#!/usr/bin/env bash
# Encodes the composed frames into the demo MP4: 1920×1080, 30 fps, H.264 High, yuv420p, faststart, no audio,
# 0.6 s crossfades, each frame shown for the time in _durations.json.
#   bash demo/encode.sh <outDir> <video.mp4>
set -euo pipefail
out="$1"
video="$2"
fade=0.6
mapfile -t frames < <(ls "$out/frames"/*.png | sort)
mapfile -t durs < <(node -e 'for (const d of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))) console.log(d)' "$out/_durations.json")
[[ ${#frames[@]} -eq ${#durs[@]} ]] || { echo "frames (${#frames[@]}) and durations (${#durs[@]}) differ" >&2; exit 1; }

inputs=()
for i in "${!frames[@]}"; do inputs+=(-loop 1 -framerate 30 -t "${durs[$i]}" -i "${frames[$i]}"); done

filter=""
prev="[0:v]"
offset=0
for ((i = 1; i < ${#frames[@]}; i++)); do
  offset=$(node -e "console.log((${offset} + ${durs[$((i - 1))]} - ${fade}).toFixed(2))")
  label="[v$i]"
  filter+="${prev}[$i:v]xfade=transition=fade:duration=${fade}:offset=${offset}${label};"
  prev="$label"
done
filter+="${prev}format=yuv420p[out]"

ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$filter" -map "[out]" -r 30 \
  -c:v libx264 -profile:v high -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart -an "$video"
echo "encoded $video"
