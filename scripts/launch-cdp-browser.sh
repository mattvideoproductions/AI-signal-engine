#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-9222}"
USER_DATA_DIR="${USER_DATA_DIR:-$HOME/.hermes/chrome-debug}"
HEADLESS="${HEADLESS:-auto}"

find_browser() {
  for bin in \
    brave-browser brave brave-browser-stable \
    google-chrome google-chrome-stable chromium chromium-browser \
    microsoft-edge microsoft-edge-stable; do
    if command -v "$bin" >/dev/null 2>&1; then
      command -v "$bin"
      return 0
    fi
  done
  return 1
}

BROWSER="$(find_browser || true)"
if [ -z "$BROWSER" ]; then
  cat >&2 <<'EOF'
[X] No Chromium-family browser found.

Install one on Ubuntu/Debian, for example:
  ./install-browser-linux.sh

Then rerun:
  ./launch-browser.sh
EOF
  exit 1
fi

mkdir -p "$USER_DATA_DIR"

ARGS=(
  "--remote-debugging-address=127.0.0.1"
  "--remote-debugging-port=$PORT"
  "--user-data-dir=$USER_DATA_DIR"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-dev-shm-usage"
)

if [ "$HEADLESS" = "1" ] || { [ "$HEADLESS" = "auto" ] && [ -z "${DISPLAY:-}" ]; }; then
  ARGS+=("--headless=new" "--disable-gpu" "--no-sandbox")
fi

"$BROWSER" "${ARGS[@]}" >/tmp/ai-signal-browser.log 2>&1 &
sleep 2

if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/json/version" >/dev/null; then
  echo "[OK] CDP browser ready at http://127.0.0.1:$PORT"
  echo "In Hermes CLI, run:"
  echo
  echo "  /browser connect"
  echo "  /browser status"
else
  echo "[X] Browser launched, but CDP did not answer on 127.0.0.1:$PORT." >&2
  echo "Last browser log lines:" >&2
  tail -40 /tmp/ai-signal-browser.log >&2 || true
  exit 1
fi
