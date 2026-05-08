#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP="${ROOT}/stock-calculator"

cd "$APP"

if ! command -v npm >/dev/null; then
  echo "Нужен npm в PATH."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Установка зависимостей (npm install)..."
  npm install
fi

echo "Запуск локального API (3001) и фронтенда (3000)..."
exec npm run dev:full
