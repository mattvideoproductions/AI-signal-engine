#!/usr/bin/env bash
# ===========================================================
#   AI Signal Engine - Hermes local browser launcher
#   Run this before /browser connect in Hermes CLI.
# ===========================================================
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "  ==========================================="
echo "    AI SIGNAL ENGINE BROWSER"
echo "    Local CDP browser for Hermes"
echo "  ==========================================="
echo

bash ./scripts/launch-cdp-browser.sh

echo
echo "  Keep this browser process running while Hermes researches."
echo
