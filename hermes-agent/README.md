# Hermes Agent

The research/reasoning layer for **AI Signal Engine**. It fetches live AI-news RSS,
has your LLM (a Nous Hermes model, or any provider you have) structure, score, and
connect the stories into the dashboard schema, then POSTs each one to `/api/events`
so it animates onto the map.

This is the real version of the demo scan — same visual result, live data.

## Setup (2 minutes)

1. **Start the dashboard** first (one folder up: double-click `start.bat`, or `./start.sh`).
2. In this `hermes-agent` folder, copy the config and add your key:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and:
   - keep `DASHBOARD_URL=http://localhost:3000`
   - keep `INGEST_TOKEN` matching the dashboard's `.env` (default `dev-ingest-token-change-me`)
   - paste your key into **one** of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`
     / `OPENROUTER_API_KEY`. The agent auto-detects which one you set.
3. Run it:
   ```bash
   node agent.mjs           # one live scan
   ```
   or double-click `run-hermes.bat` (Windows) / `./run-hermes.sh` (mac/Linux).

Watch the map: cards slide in, threads connect, the agent log fills.

## Modes

| Command | What it does |
| --- | --- |
| `node agent.mjs` | One scan: fetch → analyze with your model → post |
| `node agent.mjs --watch 30` | Scan now, then every 30 minutes (always-on) |
| `node agent.mjs --dry-run` | Analyze and print to the terminal, post nothing |
| `node agent.mjs --mock` | Skip the LLM entirely — post raw feed items as low-confidence drafts (no API key needed; good for testing the pipeline) |
| `node agent.mjs --fresh` | Ignore the seen-cache and re-consider every item |

## Default models per provider

Override with `HERMES_MODEL` in `.env`.

| Provider | Default model |
| --- | --- |
| `anthropic` | `claude-haiku-4-5-20251001` |
| `openai` | `gpt-4o-mini` |
| `gemini` | `gemini-2.0-flash` |
| `openrouter` | `nousresearch/hermes-3-llama-3.1-70b` (literal Nous Hermes) |

Force a provider with `HERMES_PROVIDER=` if you have more than one key set.

## Sources

Edit `feeds.json` to change which feeds are scanned. Prefer RSS/Atom, official blogs,
and arXiv. Feeds that error (rate-limit, bot-block) are skipped automatically.

## Where this runs

Right now: your Windows/Mac/Linux machine, next to the dashboard. To make it always-on,
run the same script on the Hostinger VPS with `--watch` (e.g. under `pm2` or a systemd
service) — point `DASHBOARD_URL` at `http://localhost:3000` since both live on the same box.

## Safety

The agent only does two things: read public RSS, and POST events to your dashboard with
the bearer token. No destructive actions, no publishing, no account access. You stay the
editor-in-chief — every event lands on the board for your review, never straight to a video.
