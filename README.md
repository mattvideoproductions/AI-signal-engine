# AI Signal Engine

**A private, agent-powered signal intelligence map.**

AI Signal Engine is a self-hosted dashboard for anyone tracking a fast-moving landscape — built
creator-first for AI news, useful for any research workflow. An autonomous agent (built around
[Nous Hermes Agent](https://nousresearch.com/), but any agent that can browse and POST works)
does the research — scanning sources, reasoning about what matters, scoring risk — and streams
structured events into this dashboard, which visualizes them as a living relationship map and
turns them into an actionable **brief**: angles, story bundles, talking points, and (critically)
a verification checklist and a "do not overstate this" list.

It is built to be screen-recorded: animated node arrivals, glowing relationship threads, a live
agent log, and a dark observatory aesthetic that reads well on video.

> *"AI agents are moving from chatbot tabs into always-on infrastructure."* This project is the
> proof: one agent (Hermes), one home (a Hostinger VPS), one job — turn the chaos of the AI race
> into creator-ready signal, with a human as editor-in-chief.

## How the pieces fit

One clear division of labor:

- **Hermes runs the agent workflow.** Nous Hermes Agent is deployed on the Hostinger VPS via
  Docker Manager. It runs persistently, scans the AI landscape, reasons about what matters, and
  POSTs structured JSON events to this dashboard. It never controls the dashboard — it only
  sends signals.
- **Hostinger hosts the infrastructure.** The VPS keeps everything always-on, private, and
  separate from your main computer — Hermes, this dashboard, its data file, and the
  webhook receiver all live on the same box. That co-location is the reason a VPS beats simpler
  hosting for agent setups.
- **Codex helped build the dashboard.** This repository — the schema, the deterministic brief
  engine, the React Flow visualization, the deployment scaffolding — was generated agentically
  and verified end-to-end (build, ingest, demo scan, brief export).
- **AI model APIs provide the intelligence.** Hermes's model access is configured on the VPS
  (Hostinger AI credits or external provider keys); the dashboard itself needs no LLM key.
- **The creator stays editor-in-chief.** Verification checklists, "do not overstate" warnings,
  and human review are first-class. Nothing publishes automatically.

## Architecture

```
┌─────────────────────┐  POST /api/events   ┌──────────────────────────────┐
│  Nous Hermes Agent  │ ──────────────────▶ │       AI Signal Engine        │
│  (research/reason)  │  Bearer token       │  Next.js 16 (TypeScript)      │
└─────────────────────┘                     │                              │
                                            │  ┌────────────┐              │
        you, in a browser ◀──── SSE ─────── │  │ JSON store │              │
        (password gate)   /api/stream       │  │ ./data     │              │
                                            │  └────────────┘              │
   ┌──────────────┐                         │  React Flow graph · brief    │
   │ RSS sources  │ ──── /api/scan ───────▶ │  generator · demo simulator  │
   └──────────────┘  (draft events)         └──────────────────────────────┘
```

## Features

- **Live relationship map** (React Flow): story nodes sized by viewer interest, colored by
  category, glowing on arrival; glowing threads with traveling data-packet particles, typed by
  relationship (competes with, supports, same trend, requires verification, risk connection,
  infrastructure layer); entity nodes; drag, zoom, pan, multi-select, search, filter chips,
  reset layout; radar sweep while Hermes scans.
- **Sector territories**: events are grouped into macro buckets (Intelligence, Agents & Products,
  Open Ecosystem, Compute & Capital, Trust & Safety, Uncharted) rendered as labeled glowing zones
  that follow their nodes. Hermes can assign a `bucket` per event; a clickable legend flies the
  camera to each sector.
- **Day Rail time travel**: a vertical timeline of retrieval days (Hermes can backfill via
  `retrieved_at`), each tile showing the sectors most hit that day. Click a day to scope the
  entire board to it.
- **Connection insights**: click any thread to get a synthesized creator take on the pair —
  rivalry/trend/risk framing, a concrete "creator move", a pre-film caution, and a one-click
  bundle of the two stories.
- **Ignore topics**: kill a node outright, or "🚫 Ignore topic" — which removes it, injects the
  topic into the Hermes prompt, and makes the ingest endpoint reject matching signals (202).
- **Signal feed** side panel with animated story cards, confidence/risk/verification badges.
- **Live agent log** + status indicator (idle / scanning / bundling / ready).
- **Story bundles**: select nodes → "Bundle Selected" → story arc, segment outline, recommended
  title, thumbnail idea, verification checklist, sources.
- **Creator brief** (`/brief`): executive summary, strongest angle, 5 title ideas, 5 thumbnail
  concepts, top bundles, talking points, verification checklist, risky-claims list, all sources,
  markdown export. Deterministic v1 — swap an LLM into `src/lib/brief.ts` later.
- **Demo mode**: one click simulates Hermes streaming 10 realistic (fictional) events over
  ~25–40 s, animating exactly like a live scan. Reliable footage even if the live agent is down.
- **Real source mode**: add RSS feeds / pages in `/settings`, scan them politely, get draft events
  for Hermes to enrich.
- **Private by default**: password gate on every page, bearer token on ingest, secrets server-side
  only.

## Run it (no Docker needed)

You only need **Node.js** (LTS, from [nodejs.org](https://nodejs.org)). Docker and a VPS are
**only** for running Hermes always-on later — the dashboard itself runs anywhere Node runs,
including your own laptop.

**One-click launcher** — installs dependencies, creates `.env`, builds once, starts the server,
and opens the map in your browser:

- **Windows**: double-click **`start.bat`**
- **macOS / Linux**: `chmod +x start.sh && ./start.sh`

Then click **▶ Start Demo Scan** and watch it come alive. (First launch builds the app — ~30 s.
To force a rebuild after pulling updates, delete the `.next` folder.)

**Optional local browser for Hermes**: run `launch-browser.bat` on Windows. On Linux/macOS/VPS,
run `chmod +x install-browser-linux.sh launch-browser.sh scripts/launch-cdp-browser.sh`; if no
Chromium-family browser is installed, run `./install-browser-linux.sh`, then `./launch-browser.sh`.
Finally run `/browser connect` in Hermes CLI. See [docs/BROWSER_CDP.md](docs/BROWSER_CDP.md).

**Manual setup** (for development, with hot reload):

```bash
npm install
cp .env.example .env        # optional: set APP_PASSWORD + INGEST_TOKEN
npm run dev                 # http://localhost:3000
```

With a blank `APP_PASSWORD` the app runs in **open mode** (no login) — convenient for local demos.
Set `APP_PASSWORD` and `INGEST_TOKEN` before exposing it anywhere. A `.env` with dev credentials
is gitignored, so cloning the repo never leaks secrets.

## Docker setup

```bash
docker compose up -d --build
# app on http://localhost:3000, data persisted in ./data
```

## Deployment on Hostinger VPS

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full walkthrough (Docker Manager, domain, HTTPS,
connecting Hermes, demo mode, resetting data).

## API

All write endpoints require either the dashboard session cookie or
`Authorization: Bearer $INGEST_TOKEN`.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/events` | POST | Ingest one event (Hermes); supports `bucket` + `retrieved_at`; ignored topics get 202 |
| `/api/events` | GET | List all events |
| `/api/events` | DELETE | Clear the board; `?id=X` removes one event; `&ignore=1` also ignores the topic |
| `/api/stream` | GET | SSE live feed (session) |
| `/api/bundle` | POST | Build a story bundle from event ids |
| `/api/brief` | POST / GET | Generate / fetch the creator brief |
| `/api/demo` | POST | Start the demo scan (session) |
| `/api/scan` | POST | Scan configured RSS sources (session) |
| `/api/sources` | GET/POST/DELETE | Manage sources (session) |
| `/api/settings` | GET/PUT | App config + env *status* (session) |

### Example: post an event

```bash
curl -X POST https://YOUR_DOMAIN/api/events \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Example Lab ships new model",
    "summary": "Example Lab released a new frontier model today.",
    "source_url": "https://example.com/blog/new-model",
    "source_name": "Example Lab Blog",
    "category": "model_release",
    "confidence": "high",
    "novelty_score": 8,
    "viewer_interest_score": 7,
    "risk_score": 2,
    "verification_needed": [],
    "claims_to_verify": ["benchmark numbers are vendor-reported"],
    "do_not_overstate": [],
    "related_entities": ["Example Lab"],
    "connections": [{ "target_title_or_id": "an earlier event title", "relationship": "competes with", "strength": 7 }],
    "thumbnail_angle": "Model logo splitting a benchmark chart",
    "title_angle": "A new frontier model just dropped",
    "notes": ""
  }'
```

### Hermes prompt

The full copyable Hermes task prompt lives on the **/settings** page (it injects your real domain).
In short: Hermes scans the AI landscape and POSTs one JSON event per signal to `/api/events` with
the bearer token, honestly scoring confidence/risk, flagging claims to verify, and connecting new
events to earlier ones by title.

## Security notes — the safety reality check

Hosting the agent on a separate VPS creates a cleaner boundary than running it on your main
machine, but safety still depends on permissions and human review. This project is built around
that: **dedicated low-risk credentials, limited permissions, manual approvals, visible logs, no
destructive actions, no automatic publishing, and verification before any claim reaches a video.**

- **Set `APP_PASSWORD` and `INGEST_TOKEN` before exposing the app.** Without `APP_PASSWORD` the
  middleware runs in open mode (intended for local dev only). Without `INGEST_TOKEN` the ingest
  endpoint rejects all bearer traffic.
- No secrets are hardcoded, sent to the browser, or written to logs — `/settings` only shows
  whether each variable *exists*.
- The session cookie stores a SHA-256-derived token, never the password. Cookies are `HttpOnly`,
  `SameSite=Lax`, and `Secure` over HTTPS.
- The agent surface is deliberately narrow: Hermes can only POST events. There are no destructive
  agent actions, no social posting, no email, no file deletion, no financial actions.
- The brief engine is built around **human approval**: verification checklists and
  "do not overstate" warnings are first-class, and nothing publishes anywhere automatically.
- The source scanner prefers RSS/changelogs, sends a descriptive User-Agent, fetches each source
  once per manual scan, and caps items per feed.
- Run behind HTTPS in production (see DEPLOYMENT.md).

## Roadmap

- LLM-enriched briefs (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` /
  `OPENROUTER_API_KEY` are already plumbed as optional env vars)
- Scheduled source scans + Hermes enrichment loop for draft events
- Multi-board support (one board per video)
- Timeline scrubber to replay how a story developed
- Notion/Obsidian export targets alongside markdown

## License

Private project — all rights reserved by the owner.
