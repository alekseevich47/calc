#!/bin/bash
# Проверка no-cache для SW на calc.loomixx.ru (после деплоя nginx).
set -euo pipefail

echo "--- verify sw.js Cache-Control ---"
curl -sI https://calc.loomixx.ru/sw.js | tr -d '\r' | grep -iE 'HTTP/|cache-control|expires' || true

echo "--- verify index.html ---"
curl -sI https://calc.loomixx.ru/index.html | tr -d '\r' | grep -iE 'HTTP/|cache-control|expires' || true
