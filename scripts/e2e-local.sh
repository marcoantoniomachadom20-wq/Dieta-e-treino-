#!/usr/bin/env bash
# Sobe o servidor de produção com um banco temporário, roda o teste E2E (celular) e derruba o servidor.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
npm run build >/dev/null
# setsid: o servidor roda em um grupo de processos próprio, derrubado por inteiro no final.
DATA_DIR="$TMP/data" PORT=${PORT:-3099} COOKIE_SECURE=false setsid npm start >"$TMP/server.log" 2>&1 &
PID=$!
trap 'kill -- -$PID 2>/dev/null || true; rm -rf "$TMP"' EXIT
for _ in $(seq 1 30); do curl -sf "http://localhost:${PORT:-3099}/api/health" >/dev/null && break; sleep 0.5; done
E2E_URL="http://localhost:${PORT:-3099}" npx playwright test "$@"
