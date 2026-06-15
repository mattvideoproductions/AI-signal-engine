# Local Browser For Hermes

Use this when you want Hermes to browse the live web without Brave, Exa, Browser Use, or Browserbase API keys.

## Windows

1. Double-click `launch-browser.bat`.
2. Start Hermes from a terminal, not a web gateway.
3. In Hermes CLI, run:

```text
/browser connect
/browser status
```

Keep the launched browser window open while Hermes researches.

## Linux / macOS / Hostinger VPS

Run:

```bash
chmod +x install-browser-linux.sh launch-browser.sh scripts/launch-cdp-browser.sh
./install-browser-linux.sh   # only needed if no Chromium-family browser is installed
./launch-browser.sh
```

Then start Hermes from a terminal and run:

```text
/browser connect
/browser status
```

On a headless VPS, the launcher automatically uses headless Chromium mode when no `DISPLAY` is present.

If the installer cannot use your package manager, install one Chromium-family browser manually:

```bash
sudo apt-get update
sudo apt-get install -y chromium
```

## Important

`/browser connect` is an interactive Hermes CLI slash command. It will not work if pasted into a WebUI, Telegram, Discord, or other gateway chat.

The browser listens on `127.0.0.1:9222`, so Hermes must run on the same machine. If Hermes is inside Docker, either run Hermes with host networking or expose a reachable CDP endpoint and connect with:

```text
/browser connect ws://HOST:PORT/devtools/browser/...
```

For the simplest Hostinger demo, run the dashboard, browser launcher, and Hermes CLI on the VPS host.
