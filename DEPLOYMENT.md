# Deployment Guide — AI Signal Engine

Plain-English walkthrough to get the dashboard live on a Hostinger VPS and have Hermes feed it.
**You do not need a domain name.** You do not need to install Node. You access everything by your
server's IP address.

## The mental model (read this first — it makes everything click)

Three things live on your one VPS:

1. **The dashboard** (this project) — the map you screen-record. You'll run it with Docker.
2. **Hermes** — the AI agent that does the research. On Hostinger it's already running as a Docker
   container (`hermes-agent-eblr` in your Docker Manager).
3. **You** — the human who connects the two by handing Hermes a token and a URL.

They all sit on the same machine. The only "wiring" between them is: Hermes sends its findings to the
dashboard's web address with a secret token. That's it.

## What you need

- A Hostinger VPS (you have one). **Docker is already installed** — it's what powers Docker Manager.
- Your server's IP address. Get it any time by running `hostname -I` and taking the first value, or
  read it off hPanel → VPS → Overview. **Everywhere below that says `YOUR_VPS_IP`, paste that number.**
- That's it. No domain, no Node, no extra accounts.

---

## Step 1 — Put the code on the server

**Why:** the VPS starts empty. Nothing in this guide works until the project files are actually on it.
(If a command ever says *"No such file"* or *"command not found"*, it's because you're not inside the
project folder yet.)

```bash
apt-get update && apt-get install -y git     # installs git if it's missing
cd /opt                                       # a normal place to keep server apps
git clone https://github.com/mattvideoproductions/AI-signal-engine.git
cd AI-signal-engine                           # <-- you must be in here for every later command
```

Run `pwd` to confirm — it should end in `/AI-signal-engine`.

## Step 2 — Set your two secrets

**Why:** the dashboard needs a login password, and Hermes needs a shared token to prove it's allowed
to send data. These live in a file called `.env`.

```bash
cp .env.example .env     # makes your own copy of the template
nano .env                # opens a basic text editor
```

Set these two lines (leave everything else as-is):

```bash
APP_PASSWORD=pick-something-only-you-know     # the dashboard login. Blank = no login at all.
INGEST_TOKEN=pick-a-long-random-string        # the secret Hermes will send. Treat it like a password.
```

Save and close nano: **`Ctrl+O`**, then **`Enter`**, then **`Ctrl+X`**.

> The optional `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / etc. lines at the bottom do **nothing** for
> the dashboard — leave them blank. The AI model key belongs to *Hermes*, configured separately in the
> Hermes container, not here.

## Step 3 — Start the dashboard

**Why:** this builds the app and runs it in the background. Docker handles everything inside a
container, so you don't install Node or anything else on the server.

```bash
docker compose up -d --build     # first build takes ~2-3 minutes; later restarts are instant
```

Check it's alive (still on the VPS):

```bash
docker compose ps                  # should show the container as "running"
curl -I http://localhost:3000      # "HTTP/1.1 307" (or 200) means it's working
```

## Step 4 — Open the map in your browser

**Why:** the dashboard is now serving on port 3000. You view it from your own computer using the
server's IP.

1. Allow port 3000 through the firewall: hPanel → VPS → **Security → Firewall**, add a rule allowing
   **TCP 3000**. (You've done this.)
2. In your normal browser, go to:
   ```
   http://YOUR_VPS_IP:3000
   ```
   (e.g. if `hostname -I` shows `2.25.208.117`, you visit `http://2.25.208.117:3000`.)
3. Log in with the `APP_PASSWORD` you set. You'll see the empty map. Click **▶ Demo Scan** to confirm
   it animates — that proves the dashboard works before Hermes is even involved.

## Step 5 — Point Hermes at the dashboard

**Why:** now you connect the agent to the map. Hermes needs the dashboard's address and the token.

### 5a. Get to the Hermes CLI

In Docker Manager, on the **`hermes-agent-eblr`** project, you'll see two links:

- **"Open"** → Hermes's web chat. It asks for a login. If your Nous account is Google-only and this
  blocks you, **skip it — you don't need it.**
- **"Terminal"** → a command line **inside the Hermes container**. This is the one you want.

Click **Terminal**, and at the prompt type:

```bash
hermes
```

That launches the Hermes CLI chat. (If `hermes` says "command not found", you're in the *host*
terminal by mistake — make sure you clicked Terminal on the `hermes-agent-eblr` project specifically.)

### 5b. Give Hermes the address + token

The dashboard's address *from Hermes's point of view* is your server IP and port:

```
http://YOUR_VPS_IP:3000
```

> Why not `localhost`? Because Hermes is in its own container — to Hermes, "localhost" means *itself*,
> not the dashboard. The server IP always works.

Then:

1. On the dashboard, go to **Settings**, paste your `INGEST_TOKEN` into the token box, and click
   **⧉ Copy prompt**. That copies a ready-made instruction block (with your token already in it).
2. Paste that whole block into the Hermes CLI and send it.
3. Hermes will research and post signals — each one pops onto your map within a second.

### 5c. Quick sanity check (optional)

Before the full run, you can confirm Hermes can reach the dashboard. In the Hermes Terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer YOUR_INGEST_TOKEN" \
  http://YOUR_VPS_IP:3000/api/ingest/check
```

`200` = connected and the token is right. `401` = token doesn't match your `.env`.

---

## Optional — use your own domain with HTTPS

**Skip this entire section if you don't own a domain. The IP address works perfectly fine.**

If you *do* own a domain and want a clean `https://signals.example.com` instead of an IP:

1. In your DNS settings, add an **A record** pointing your chosen subdomain at `YOUR_VPS_IP`.
2. You already have **traefik** running (it's in Docker Manager) — it can hand out HTTPS certificates.
   Create a file `docker-compose.override.yml` next to the compose file:
   ```yaml
   services:
     signal-engine:
       networks: [traefik]
       labels:
         - traefik.enable=true
         - traefik.http.routers.signal.rule=Host(`signals.example.com`)   # your real subdomain
         - traefik.http.routers.signal.entrypoints=websecure
         - traefik.http.routers.signal.tls.certresolver=le
         - traefik.http.services.signal.loadbalancer.server.port=3000
   networks:
     traefik:
       external: true
   ```
   Replace `signals.example.com` with your subdomain. Then `docker compose up -d`.
3. Confirm the network name (`traefik`) and cert-resolver (`le`) match your traefik setup — check with
   `docker network ls`; these names vary. Then visit `https://signals.example.com`.

## Common questions & fixes

- **"I don't have a domain."** You don't need one. Use `http://YOUR_VPS_IP:3000` everywhere.
- **`hermes: command not found`** → you're in the host SSH terminal. Hermes only exists inside its
  container: Docker Manager → `hermes-agent-eblr` → **Terminal** → `hermes`.
- **`npm: command not found`** → expected and fine. The server doesn't use npm; Docker builds the app.
- **`No such file` running `./launch-browser.sh` etc.** → you're not inside `/opt/AI-signal-engine`.
  `cd /opt/AI-signal-engine` first.
- **The Hermes "Open" web UI won't let me log in** → skip it; use the container **Terminal** + `hermes`.
- **`401` when Hermes posts** → the token in the prompt doesn't match `INGEST_TOKEN` in `.env`. Fix
  `.env`, then `docker compose up -d` to reload it.
- **Map loads but Hermes can't reach it** → Hermes is using `localhost`. Switch it to
  `http://YOUR_VPS_IP:3000`.
- **Page won't load from my browser** → the firewall isn't allowing TCP 3000 yet (hPanel → VPS →
  Security → Firewall).

## Environment variables

| Variable | Required | What it does |
| --- | --- | --- |
| `APP_PASSWORD` | recommended | Dashboard login. Blank = no login (open mode). |
| `INGEST_TOKEN` | **yes** | The secret Hermes sends to prove it's allowed to post. |
| `DATA_FILE` | no | Where data is stored. Default `./data/signal.json` (kept across restarts). |
| `NEXT_PUBLIC_APP_NAME` | no | Display name in the UI. |
| `DEMO_MODE` | no | `true` (default) shows the Demo Scan button. |

## Updating & resetting

```bash
cd /opt/AI-signal-engine

# get the latest version and restart
git pull && docker compose up -d --build

# clear the board (events + bundles) but keep running
curl -X DELETE http://localhost:3000/api/events -H "Authorization: Bearer YOUR_INGEST_TOKEN"

# wipe everything and start fresh
docker compose down && rm -rf ./data && docker compose up -d --build
```

## Running it on your own computer instead (no server)

For local testing on Windows/Mac/Linux, you don't need any of the above — just double-click
**`start.bat`** (Windows) or run **`./start.sh`** (Mac/Linux). They install, build, and open the map
for you at `http://localhost:3000`.
