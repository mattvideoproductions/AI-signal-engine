#!/usr/bin/env bash
# ===========================================================
#   AI Signal Engine - one-click launcher (Linux / macOS)
#   Run:  chmod +x start.sh  &&  ./start.sh
#   Installs, builds, runs, and opens the dashboard.
#   No Docker required.
# ===========================================================
set -e
cd "$(dirname "$0")"

echo
echo "  ==========================================="
echo "    AI SIGNAL ENGINE"
echo "    Private Hermes-powered creator map"
echo "  ==========================================="
echo

# --- 1. Node.js present? ---
if ! command -v node >/dev/null 2>&1; then
  echo "  [X] Node.js is not installed."
  echo "      Install the LTS build from https://nodejs.org then re-run this script."
  exit 1
fi

# --- 2. Dependencies installed? ---
if [ ! -d node_modules ]; then
  echo "  [*] First run: installing dependencies. This can take a minute..."
  npm install --no-audit --no-fund
fi

# --- 3. Environment file present? ---
if [ ! -f .env ]; then
  echo "  [*] No .env found. Creating one from .env.example (open demo mode)."
  cp .env.example .env
fi

# --- 4. Production build present? ---
if [ ! -f .next/BUILD_ID ]; then
  echo "  [*] Building the app. This can take about 30 seconds..."
  npm run build
fi

URL="http://localhost:3000"

# --- 5. Open the browser a few seconds after the server boots ---
echo "  [*] Launching the map at $URL"
(
  sleep 6
  if command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  elif command -v open    >/dev/null 2>&1; then open "$URL"   >/dev/null 2>&1
  fi
) &

# --- 6. Start the server (foreground; Ctrl+C to stop) ---
echo "  [*] Server starting. Press Ctrl+C to stop."
echo
npm run start
