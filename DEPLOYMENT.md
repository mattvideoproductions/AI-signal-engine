# Deployment Guide — AI Signal Engine

This guide takes you from a fresh clone to a private dashboard on a Hostinger VPS with Hermes
feeding it events.

## The full Hostinger + Hermes flow (as shown in the video)

The complete stack lives on one Hostinger VPS — always-on, private, and separate from your main
computer:

1. **Hermes Agent page** — open Hostinger's Hermes Agent page (via your link) and pick a VPS plan.
   A mid-tier plan comfortably runs Hermes + this dashboard side by side.
2. **Cart / coupon** — apply your coupon code at checkout.
3. **Deploy Hermes** — use the VPS **Docker Manager / one-click application setup** to deploy
   Hermes Agent on the VPS.
4. **Model access** — configure Hermes's model provider (Hostinger-supported AI credits or your
   own external provider API key). These credentials live in Hermes's config on the VPS — the
   dashboard never sees them.
5. **Deploy this dashboard next to it** — same VPS, same Docker Manager, using the
   `docker-compose.yml` in this repo (steps below). This is exactly why VPS beats simpler hosting:
   the agent, the dashboard, the data file, and the webhook receiver all live together.
6. **Connect them** — give Hermes the task prompt from `/settings` plus your `INGEST_TOKEN`.
   Since both run on the same box, Hermes can post to `http://localhost:3000/api/events` directly.
7. **Run a workflow** — tell Hermes: *"Scan today's AI landscape and build me a creator map."*
   Watch the dashboard light up.

## 1. Run locally

```bash
npm install
cp .env.example .env
# edit .env: set APP_PASSWORD and INGEST_TOKEN (long random strings)
npm run dev
```

Open http://localhost:3000, enter your password, click **▶ Start Demo Scan**.

## 2. Build the Docker image

```bash
docker build -t ai-signal-engine .
```

Or build + run in one step with compose:

```bash
docker compose up -d --build
```

The app data file is persisted to `./data` on the host via a volume.

## 3. Deploy on Hostinger VPS (Docker Manager)

1. Order/open a Hostinger VPS and pick the **Docker** template (or install Docker + the Docker
   Manager panel from hPanel → VPS → Docker Manager).
2. Get the code onto the VPS:
   ```bash
   ssh root@YOUR_VPS_IP
   git clone <your-repo-url> /opt/ai-signal-engine   # or scp/rsync the folder
   cd /opt/ai-signal-engine
   ```
3. Create the production env file:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Set strong values (see §4). Generate tokens with `openssl rand -hex 32`.
4. Start it:
   ```bash
   docker compose up -d --build
   ```
   Alternatively, in **hPanel → VPS → Docker Manager → Compose**, point it at this project
   directory (or paste the `docker-compose.yml`) and deploy from the UI.
5. Verify: `curl -I http://localhost:3000` on the VPS should return `307` (redirect to /login).

## 3b. Optional local browser for Hermes

To let Hermes browse without Brave, Exa, Browser Use, or Browserbase API keys:

```bash
chmod +x install-browser-linux.sh launch-browser.sh scripts/launch-cdp-browser.sh
./install-browser-linux.sh   # only needed if the VPS has no Chromium-family browser yet
./launch-browser.sh
```

Then start Hermes from a terminal and run:

```text
/browser connect
/browser status
```

See [docs/BROWSER_CDP.md](docs/BROWSER_CDP.md). The browser and Hermes CLI must be reachable from
the same host/network namespace; the simplest VPS demo is dashboard + browser launcher + Hermes CLI
on the VPS host.

## 4. Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_PASSWORD` | **yes** | Gates every page. Long random string. |
| `INGEST_TOKEN` | **yes** | Bearer token Hermes uses on `/api/events`. |
| `DATA_FILE` | no | Keep `./data/signal.json` (volume-backed in Docker). |
| `NEXT_PUBLIC_APP_NAME` | no | Display name, default "AI Signal Engine". |
| `DEMO_MODE` | no | `true` (default) enables the demo scan button; `false` disables it. |
| `OPENAI_API_KEY` etc. | no | Optional, for future LLM-enriched briefs. Not needed for v1. |

## 5. Domain / subdomain

1. In your DNS (Hostinger hPanel → Domains → DNS), add an **A record**:
   `signals.yourdomain.com → YOUR_VPS_IP`.
2. Put a reverse proxy in front of port 3000. Simplest options:
   - **Caddy** (automatic HTTPS):
     ```bash
     docker run -d --name caddy --network host -v caddy_data:/data caddy:2 \
       caddy reverse-proxy --from signals.yourdomain.com --to localhost:3000
     ```
   - **Nginx + certbot**: proxy_pass `http://127.0.0.1:3000;` and run
     `certbot --nginx -d signals.yourdomain.com`.
     For the SSE stream, disable buffering: `proxy_buffering off;` on `/api/stream`.

## 6. HTTPS

Caddy issues Let's Encrypt certificates automatically. With nginx, certbot handles it. Once HTTPS
is live the session cookie is automatically set with the `Secure` flag. Do not run the dashboard
on plain HTTP outside your own machine.

## 7. Connect Hermes Agent

Hermes runs on the same VPS (or an adjacent Hostinger deployment) and needs exactly two things:
the URL and the token.

- Endpoint: `POST https://signals.yourdomain.com/api/events`
- Header: `Authorization: Bearer <INGEST_TOKEN>`

Open **/settings** in the dashboard and copy the prepared **Hermes Task Prompt** — it contains the
full JSON schema, honesty rules, and a curl example. Hermes can send events with curl, Python
`requests`, or any HTTP tool it has. If Hermes runs on the same VPS it can also post to
`http://localhost:3000/api/events` and skip the public hop.

Smoke test from the VPS:

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Authorization: Bearer $INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Connectivity test","summary":"Hello from Hermes.","source_url":"https://example.com","source_name":"smoke test","category":"other","confidence":"high"}'
```

A node should appear on the open dashboard within a second.

## 8. Demo mode

Click **▶ Start Demo Scan** on the dashboard (requires `DEMO_MODE` not set to `false`). Ten
fictional-but-realistic events stream in over ~25–40 seconds with logs, glowing nodes, and
relationship threads — identical animation path to live ingest, so it is safe footage for video
even if the live agent is offline. Run **✕ Clear Board** first for a clean take.

## 9. Clear / reset data

- **Clear the board** (events + bundles): the ✕ Clear Board button, or
  `curl -X DELETE https://signals.yourdomain.com/api/events -H "Authorization: Bearer $INGEST_TOKEN"`.
- **Full reset** (including briefs, sources, settings): stop the container and delete the volume
  data — `docker compose down && rm -rf ./data && docker compose up -d`.
- **Rotate secrets**: edit `.env`, then `docker compose up -d` (recreates the container).

## Troubleshooting

- **Login loop** → `APP_PASSWORD` changed after you logged in; clear the `ase_session` cookie.
- **401 from /api/events** → header must be exactly `Authorization: Bearer <token>`, and
  `INGEST_TOKEN` must be set in the container env.
- **No live updates behind nginx** → add `proxy_buffering off;` for `/api/stream`.
- **Data missing after redeploy** → make sure the `./data` volume mapping is intact.
