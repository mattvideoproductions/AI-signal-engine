#!/usr/bin/env bash
# ===========================================================
#   Hermes Agent - run a live scan (Linux / macOS)
#   Make sure the dashboard is running first (./start.sh).
# ===========================================================
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "  [X] Node.js is not installed. Get it from https://nodejs.org"
  exit 1
fi

if [ ! -f .env ]; then
  echo "  [*] No .env here yet. Creating one from .env.example."
  cp .env.example .env
  echo "  [!] Edit hermes-agent/.env, paste in your model API key, then re-run."
  exit 0
fi

# Pass args straight through, e.g.:  ./run-hermes.sh --watch 30
node agent.mjs "$@"
