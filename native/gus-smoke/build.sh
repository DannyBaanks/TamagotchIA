#!/usr/bin/env bash
# Builds the desktop smoke against a llama.cpp checkout built as static libraries at the
# commit pinned in vendor/gus-runtime/VENDOR.json (llama_cpp_commit).
#   native/gus-smoke/build.sh <llama.cpp dir> <output binary>
set -euo pipefail
LLAMA="${1:?llama.cpp directory}"
OUT="${2:?output binary}"
HERE="$(cd "$(dirname "$0")" && pwd)"
VENDOR="$HERE/../../vendor/gus-runtime/Sources/Model"
SHIM="$(mktemp -d)"
trap 'rm -rf "$SHIM"' EXIT
# The bridge includes <llama/llama.h> (xcframework layout); mirror it.
mkdir -p "$SHIM/llama" "$(dirname "$OUT")"
ln -s "$LLAMA/include/llama.h" "$SHIM/llama/llama.h"
libs=("$LLAMA/build/src/libllama.a")
for lib in "$LLAMA"/build/ggml/src/libggml.a "$LLAMA"/build/ggml/src/libggml-cpu.a "$LLAMA"/build/ggml/src/libggml-base.a; do
  [ -f "$lib" ] && libs+=("$lib")
done
cc -std=c11 -O2 -Wall -Wextra -Werror -Wno-unused-parameter -D_GNU_SOURCE \
  -I"$SHIM" -I"$LLAMA/include" -I"$LLAMA/ggml/include" -I"$VENDOR" \
  "$HERE/smoke.c" "$VENDOR/GUSLlamaBridge.c" -o "$OUT" \
  -Wl,--start-group "${libs[@]}" -Wl,--end-group -lstdc++ -lm -lpthread -fopenmp
echo "built $OUT"
