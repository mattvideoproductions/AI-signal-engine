#!/usr/bin/env bash
# ===========================================================
#   AI Signal Engine - Linux browser installer helper
#   Installs a Chromium-family browser for Hermes CDP browsing.
# ===========================================================
set -euo pipefail

echo
echo "  ==========================================="
echo "    AI SIGNAL ENGINE BROWSER INSTALLER"
echo "    Linux / Hostinger VPS"
echo "  ==========================================="
echo

if command -v brave-browser >/dev/null 2>&1 ||
   command -v google-chrome >/dev/null 2>&1 ||
   command -v google-chrome-stable >/dev/null 2>&1 ||
   command -v chromium >/dev/null 2>&1 ||
   command -v chromium-browser >/dev/null 2>&1; then
  echo "  [OK] A Chromium-family browser is already installed."
  echo "       Run: ./launch-browser.sh"
  exit 0
fi

run_as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "  [X] This installer needs root permissions. Re-run as root, or install Chromium manually." >&2
    exit 1
  fi
}

if command -v apt-get >/dev/null 2>&1; then
  echo "  [*] Installing Chromium with apt..."
  run_as_root apt-get update
  if run_as_root apt-get install -y chromium; then
    echo "  [OK] Chromium installed."
    echo "       Run: ./launch-browser.sh"
    exit 0
  fi
  if run_as_root apt-get install -y chromium-browser; then
    echo "  [OK] Chromium installed."
    echo "       Run: ./launch-browser.sh"
    exit 0
  fi
fi

if command -v dnf >/dev/null 2>&1; then
  echo "  [*] Installing Chromium with dnf..."
  run_as_root dnf install -y chromium
  echo "  [OK] Chromium installed."
  echo "       Run: ./launch-browser.sh"
  exit 0
fi

if command -v yum >/dev/null 2>&1; then
  echo "  [*] Installing Chromium with yum..."
  run_as_root yum install -y chromium
  echo "  [OK] Chromium installed."
  echo "       Run: ./launch-browser.sh"
  exit 0
fi

cat >&2 <<'EOF'
  [X] Could not auto-install Chromium.

  Install one Chromium-family browser manually:
    - chromium
    - chromium-browser
    - google-chrome-stable
    - brave-browser

  Then run:
    ./launch-browser.sh
EOF
exit 1
