#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSET_DIR="$ROOT_DIR/assets"
SRC_PNG="$ASSET_DIR/app-icon.png"
ICONSET_DIR="$ASSET_DIR/app-icon.iconset"
ICNS_FILE="$ASSET_DIR/app-icon.icns"

if [[ ! -f "$SRC_PNG" ]]; then
  echo "Arquivo $SRC_PNG nao encontrado."
  exit 1
fi

rm -rf "$ICONSET_DIR"
mkdir -p "$ICONSET_DIR"

for size in 16 32 64 128 256 512 1024; do
  sips -z "$size" "$size" "$SRC_PNG" --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
  if [[ "$size" -lt 1024 ]]; then
    double=$((size * 2))
    sips -z "$double" "$double" "$SRC_PNG" --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
  fi
done

iconutil -c icns "$ICONSET_DIR" -o "$ICNS_FILE"
rm -rf "$ICONSET_DIR"

echo "Icone gerado em $ICNS_FILE"
