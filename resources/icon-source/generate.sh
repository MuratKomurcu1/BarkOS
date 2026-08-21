#!/bin/bash
# Generate BarkOS app icons from the canonical PNG source.
# Produces: resources/build/icon.icns (macOS/Linux), resources/build/icon.png,
# resources/build/icon.ico (Windows), and resources/icon.png (runtime).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
ICON_SOURCE="$SCRIPT_DIR/barkos-master.png"
BUILD_DIR="$PROJECT_DIR/resources/build"
RESOURCES_DIR="$PROJECT_DIR/resources"
TMP_DIR=$(mktemp -d)
ICONSET_DIR="$TMP_DIR/icon.iconset"

trap 'rm -rf "$TMP_DIR"' EXIT

if [ ! -f "$ICON_SOURCE" ]; then
  echo "Error: BarkOS icon source not found at $ICON_SOURCE" >&2
  exit 1
fi

mkdir -p "$BUILD_DIR" "$ICONSET_DIR"

echo "Compiling BarkOS icon from $ICON_SOURCE..."

render_icon() {
  local size="$1"
  local output="$2"
  sips -s format png -z "$size" "$size" "$ICON_SOURCE" --out "$output" >/dev/null
}

render_icon 16 "$ICONSET_DIR/icon_16x16.png"
render_icon 32 "$ICONSET_DIR/icon_16x16@2x.png"
render_icon 32 "$ICONSET_DIR/icon_32x32.png"
render_icon 64 "$ICONSET_DIR/icon_32x32@2x.png"
render_icon 128 "$ICONSET_DIR/icon_128x128.png"
render_icon 256 "$ICONSET_DIR/icon_128x128@2x.png"
render_icon 256 "$ICONSET_DIR/icon_256x256.png"
render_icon 512 "$ICONSET_DIR/icon_256x256@2x.png"
render_icon 512 "$ICONSET_DIR/icon_512x512.png"
render_icon 1024 "$ICONSET_DIR/icon_512x512@2x.png"

iconutil -c icns "$ICONSET_DIR" -o "$BUILD_DIR/icon.icns"
echo "  -> resources/build/icon.icns"

render_icon 1024 "$BUILD_DIR/icon.png"
echo "  -> resources/build/icon.png (1024x1024)"

render_icon 256 "$RESOURCES_DIR/icon.png"
echo "  -> resources/icon.png (256x256)"

# Generate the Windows multi-size ICO from the same canonical render.
node "$PROJECT_DIR/config/scripts/trim-windows-icon-source.mjs"
echo "  -> resources/build/icon.ico (multi-size ICO)"

echo "Done! Icons generated in resources/build/ and resources/"
