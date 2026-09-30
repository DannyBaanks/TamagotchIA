#!/usr/bin/env bash
# Builds llama.xcframework at the commit pinned in vendor/gus-runtime/VENDOR.json (with the
# vendored build script) and places it where Package.swift expects it. macOS + Xcode only.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$HERE/../../../vendor/gus-runtime"
bash "$VENDOR/scripts/build-llama-xcframework.sh"
rm -rf "$HERE/llama.xcframework"
cp -R "$VENDOR/.build/llama/llama.xcframework" "$HERE/llama.xcframework"
echo "llama.xcframework ready ($(cat "$VENDOR/.build/llama/SOURCE_COMMIT"))"
