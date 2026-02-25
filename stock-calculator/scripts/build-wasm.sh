#!/bin/bash
set -e

# Убедитесь, что Docker запущен; этот скрипт использует официальный образ emscripten
echo "Building Wasm modules using Emscripten in Docker..."

# Пути к исходникам и результатам
SRC_DIR="src/wasm"
OUT_DIR="public/wasm"

mkdir -p $OUT_DIR

# Запуск компиляции через Docker
docker run \
  --rm \
  -v $(pwd):/src \
  -u $(id -u):$(id -g) \
  emscripten/emsdk \
  emcc src/wasm/math_core.cpp src/wasm/bindings.cpp \
  -O3 \
  -s WASM=1 \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","getValue","setValue"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME="createStockMathModule" \
  -s ENVIRONMENT="web" \
  --no-entry \
  -o public/wasm/stock_math.js

echo "Wasm build successfully completed! Files saved to $OUT_DIR"
