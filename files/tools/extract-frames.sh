#!/usr/bin/env bash
set -euo pipefail

# Optional utility: create a fresh 4K-sized frame sequence from the included source MP4.
# It writes to a new folder so the current working frames are not overwritten.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$PROJECT_DIR/source/hero-scrub-original.mp4"
OUTPUT="$(cd "$PROJECT_DIR/.." && pwd)/frames-regenerated"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "FFmpeg is required. Install it first (for example: brew install ffmpeg)." >&2
  exit 1
fi
if [[ ! -f "$SOURCE" ]]; then
  echo "Source video not found: $SOURCE" >&2
  exit 1
fi
if [[ -e "$OUTPUT" ]]; then
  echo "Refusing to overwrite existing output folder: $OUTPUT" >&2
  exit 1
fi
mkdir -p "$OUTPUT"
ffmpeg -hide_banner -i "$SOURCE" \
  -vf "scale=3840:2160:flags=lanczos+accurate_rnd+full_chroma_int" \
  -vsync 0 -frames:v 300 -q:v 2 \
  "$OUTPUT/ezgif-frame-%03d.jpg"

echo "Created frames in: $OUTPUT"
echo "These are high-quality resized frames, not AI detail reconstruction."
