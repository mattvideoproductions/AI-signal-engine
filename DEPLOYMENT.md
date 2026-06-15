# Deployment Guide — AI Signal Engine

This guide takes you from a bare Hostinger VPS to a private dashboard with Hermes feeding it events.

> **The #1 gotcha:** the VPS starts empty. Commands like `./launch-browser.sh`, `cp .env.example .env`,
> or `docker build .` only work **after** you have pulled the repo onto the VPS and `cd`'d into it.
> If you see *"No such file or directory"* or *"command not found"*, you are not inside the project
> folder yet — do Step 1 first.

---

## TL;DR — paste this into the VPS terminal

You only need **Docker** (already installed on the Hostinger VPS — that's what runs Docker Manager).
You do **not** need `node` or `npm` on the host; the Dockerfile builds everything inside a container.

```bash
# 0. install git if it's missing (Ubuntu)
apt-get update && apt-get install -y git

# 1. get the code (creates /opt/AI-signal-engine)
cd /opt
git clone https://github.com/mattvideoproductions/AI-signal-engine.git
cd AI-signal-engine

# 2. create your env file and set the two secrets
cp .env.example .env
nano .env          # set APP_PASSWORD and INGEST_TOKEN, then Ctrl+O, Enter, Ctrl+X

# 3. build + run (first build ~2-3 min)
docker compose up -d --build

# 4. confirm it's alive on the VPS
docker compose ps
curl -I http://localhost:3000          # expect HTTP 307 (redirect to /login), or 200 in open mode
```

That's the whole deploy. Everything below is detail, the domain/HTTPS step, and wiring up Hermes.

---

## Step 1 — get the code onto the VPS

SSH in (you're already here if you're reading the VPS terminal), then clone:

```bash
cd /opt
git clone https://github.com/mattvideoproductions/AI-signal-engine.git
cd AI-signal-engine
```

- **No `git`?** `apt-get update && apt-get install -y git` first.
- **Repo is private?** Either make it public, or clone with a GitHub token:
  `git clone https://<TOKEN>@github.com/mattvideoproductions/AI-signal-engine.git`
- **No git at all?** Grab a tarball instead (needs only curl + tar):
  ```bash
  cd /opt
  curl -L https://github.com/mattvideoproductions/AI-signal-engine/archive/refs/heads/main.tar.gz | tar xz
  cd AI-signal-engine-main
  ```

Every later command assumes you are **inside this folder**. Run `pwd` to check — it should end in
`/AI-signal-engine`.

## Step 2 — configure secrets

```bash
cp .env.example .env
nano .env
```

Set at least these two (generate strong values with `openssl rand -hex 32`):

```bash
APP_PASSWORD=your-long-random-password    # leave BLANK for open mode (no login) — fine for a quick demo
INGEST_TOKEN=your-long-random-token       # the bearer token Hermes must send
```

Save in nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

## Step 3 — build and run with Docker

```bash
docker compose up -d --build
```

This builds the image and starts the container in the background, publishing port **3000** on the
host and persisting data to `./data` (a mounted volume, so it survives restarts).

Check it:

```bash
docker compose ps                 # container should be "running"
docker compose logs -f            # watch startup logs (Ctrl+C to stop watching)
curl -I http://localhost:3000     # 307 = up (password gate) · 200 = up (open mode)
```

> Prefer the Docker Manager UI? Our `docker-compose.yml` uses `build: .`, so it needs the source
> present — the SSH `git clone` + `docker compose up` path above is the one that works. The Compose
> button in Docker Manager is for image-based stacks, not local-build ones.

## Step 4 — see the map in your browser

Pick one:

**A. Quick demo (HTTP, by IP).** Open port 3000 in the Hostinger firewall
(hPanel → VPS → Security → Firewall, allow TCP 3000), then visit:

```
http://YOUR_VPS_IP:3000
```

Your VPS IP is in the SSH login banner ("IPv4 address for eth0"), or run `hostname -I`.

**B. Production (HTTPS, by domain) — recommended.** You already have **traefik** running on this VPS
(it's in your Docker Manager projects), so route a subdomain to the dashboard:

1. DNS (hPanel → Domains → DNS): add an **A record** `signals.yourdomain.com → YOUR_VPS_IP`.
2. Put the dashboard on traefik's network and add routing labels. Create
   `docker-compose.override.yml` next to the compose file:
   ```yaml
   services:
     signal-engine:
       networks: [traefik]
       labels:
         - traefik.enable=true
         - traefik.http.routers.signal.rule=Host(`signals.yourdomain.com`)
         - traefik.http.routers.signal.entrypoints=websecure
         - traefik.http.routers.signal.tls.certresolver=le
         - traefik.http.services.signal.loadbalancer.server.port=3000
   networks:
     traefik:
       external: true
   ```
   Then `docker compose up -d`. (Confirm the network name and certresolver match your traefik —
   `docker network ls` and your traefik static config. Names like `traefik`/`web`/`le` vary by setup.)
3. Visit `https://signals.yourdomain.com`. HTTPS also makes the session cookie `Secure` automatically.

## Step 5 — connect Hermes (already running on this VPS)

Hermes (`hermes-agent-eblr` in your Docker Manager) only needs two things: the dashboard **URL** and
the **INGEST_TOKEN**.

**Important networking note:** Hermes runs in its *own* container, so `http://localhost:3000` from
inside Hermes points at Hermes, **not** the dashboard. Use one of these reachable URLs instead:

- **Domain (cleanest):** `https://signals.yourdomain.com` — works from anywhere once Step 4B is done.
- **Same-host by IP:** `http://YOUR_VPS_IP:3000` — works because the port is published on the host
  (needs the firewall open as in Step 4A).

Then:

1. Open the dashboard → **Settings** → paste your `INGEST_TOKEN` into the token field → **⧉ Copy prompt**.
2. In Hermes, set its task / `DASHBOARD_URL` to the URL above and paste the prompt.
3. Tell Hermes: *"Scan today's AI landscape and build me a creator map."*

**Smoke test the exact path Hermes will use** — open a Terminal *into the Hermes container*
(Docker Manager → hermes-agent-eblr → Terminal) and run:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer YOUR_INGEST_TOKEN" \
  http://YOUR_VPS_IP:3000/api/ingest/check        # 200 = good, 401 = wrong token
```

If that returns `200`, Hermes can post. A node should appear on the open dashboard within a second
of its first `POST /api/events`.

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_PASSWORD` | recommended | Gates every page. Blank = open mode (no login). Set it before exposing publicly. |
| `INGEST_TOKEN` | **yes** | Bearer token Hermes sends on `/api/events`. |
| `DATA_FILE` | no | Defaults to `./data/signal.json` (volume-backed in Docker). |
| `NEXT_PUBLIC_APP_NAME` | no | Display name, default "AI Signal Engine". |
| `DEMO_MODE` | no | `true` (default) shows the demo-scan button; `false` hides it. |
| `OPENAI_API_KEY` etc. | no | Optional, for future LLM-enriched briefs. Not needed. |

## Demo mode

Click **▶ Demo Scan** on the dashboard (unless `DEMO_MODE=false`). Realistic seeded events stream in
with logs, glowing nodes, and relationship threads — the identical animation path to live ingest, so
it's safe footage even if the live agent is offline. Hit **✕ Clear** first for a clean take.

## Updating & resetting

```bash
# pull the latest code and rebuild
cd /opt/AI-signal-engine && git pull && docker compose up -d --build

# clear the board (events + bundles) without touching the container
curl -X DELETE http://localhost:3000/api/events -H "Authorization: Bearer YOUR_INGEST_TOKEN"

# full wipe (events, briefs, sources, settings)
docker compose down && rm -rf ./data && docker compose up -d --build

# rotate secrets: edit .env, then recreate the container
nano .env && docker compose up -d
```

## Local development (your laptop — NOT the VPS)

On the VPS, use Docker (above). On your own machine for development you can run it directly with Node:

```bash
npm install
cp .env.example .env     # optional; blank APP_PASSWORD = open mode
npm run dev              # http://localhost:3000
```

Or just double-click `start.bat` (Windows) / run `./start.sh` (macOS/Linux) — they install, build,
and launch for you.

## Optional — local browser (CDP) for Hermes

Lets Hermes browse without Brave/Exa/Browser Use/Browserbase keys. On the VPS:

```bash
cd /opt/AI-signal-engine
chmod +x install-browser-linux.sh launch-browser.sh scripts/launch-cdp-browser.sh
./install-browser-linux.sh   # installs Chromium if none present
./launch-browser.sh          # opens a headless CDP browser on 127.0.0.1:9222
```

Then, in the **Hermes CLI** (not the web/desktop chat — `/browser connect` is CLI-only):

```text
/browser connect
/browser status
```

Reality check for a Dockerized Hermes: the CDP browser must be reachable from *inside* the Hermes
container — same Docker network, or pass an explicit `ws://…:9222` URL to `/browser connect`. If
that's fiddly, skip it: the task prompt automatically falls back to fetching the source list
directly, which posts real signals just fine. See [docs/BROWSER_CDP.md](docs/BROWSER_CDP.md).

## Troubleshooting

- **`No such file` / `command not found` for repo scripts** → you haven't cloned yet, or you're not
  inside the project folder. Do Step 1, then `cd /opt/AI-signal-engine`.
- **`npm: command not found`** → expected on the VPS. Use Docker (Step 3); npm is only for local dev.
- **`docker build` says "Dockerfile not found"** → you're not in the project folder. `cd /opt/AI-signal-engine`.
- **401 from `/api/events` or `/api/ingest/check`** → token mismatch. The `Authorization: Bearer …`
  value must equal `INGEST_TOKEN` in `.env`. After editing `.env`, run `docker compose up -d` to reload it.
- **Hermes can't reach the dashboard** → it's using `localhost`. Switch it to `http://YOUR_VPS_IP:3000`
  or the HTTPS domain (Step 5).
- **Login loop** → `APP_PASSWORD` changed after you logged in; clear the `ase_session` cookie.
- **No live updates behind a proxy** → ensure SSE isn't buffered (`proxy_buffering off;` for `/api/stream`
  on nginx; traefik passes it through by default).
- **Data missing after redeploy** → keep the `./data` volume mapping intact (don't `rm -rf ./data`).
