# Deploy Ad Studio on Hetzner (self-hosted, multi-user)

On a real server there's **no Workers CPU limit**, so the Python app runs as
designed: long-lived process, strong password hashing, a persistent SQLite file.
This is the recommended way to run the multi-user app if you already have a
Hetzner box.

Two setups below — pick based on whether the server already runs a reverse proxy.

---

## A. Standalone (the box has nothing on ports 80/443)

Caddy is bundled and handles HTTPS automatically.

1. **DNS:** point an A record (e.g. `adstudio.yourdomain.com`) at the server's IP.
2. **Install Docker** (if needed):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
3. **Get the code + configure:**
   ```bash
   git clone https://github.com/giovannibrees/launch-team-agents.git
   cd launch-team-agents
   git checkout claude/ad-creation-service-tools-jzl5ye
   cp .env.example .env
   nano .env            # set DOMAIN=adstudio.yourdomain.com (+ optional SIGNUP_CODE / keys)
   ```
4. **Run:**
   ```bash
   docker compose up -d --build
   ```
   Caddy fetches a TLS cert on first request. Open
   `https://adstudio.yourdomain.com`, **create an account**, done.

Update later with `git pull && docker compose up -d --build`. Data persists in
the `app_data` volume.

---

## B. Behind your existing reverse proxy (you already run kenthq)

If the server already serves other sites on 80/443, don't run the bundled Caddy —
run **only the app** and point your existing proxy at it.

1. Run just the app, bound to localhost:
   ```bash
   docker compose run -d --service-ports --name adstudio \
     -p 127.0.0.1:8000:8000 app
   ```
   (or add a small compose override that drops the `caddy` service and publishes
   `127.0.0.1:8000:8000` on `app`).
2. Add a vhost in your existing proxy:
   - **Caddy:** `adstudio.yourdomain.com { reverse_proxy 127.0.0.1:8000 }`
   - **nginx:** a `server` block with `proxy_pass http://127.0.0.1:8000;` plus the
     usual `proxy_set_header Host/X-Forwarded-Proto` lines, behind your TLS.
   - **Traefik:** a router + service to `http://127.0.0.1:8000`.
3. Keep `COOKIE_SECURE=1` (set in the image) since users reach it over HTTPS.

> Without Docker: it's pure stdlib + `pip install -r requirements.txt`. Run
> `ADSTUDIO_DB=/var/lib/adstudio.db COOKIE_SECURE=1 python3 platform/app/server.py`
> under systemd and proxy to it. A `systemd` unit is a 10-line file; ask if you
> want it generated.

---

## Config (env vars)

| Var | Purpose |
|---|---|
| `DOMAIN` | Your hostname (Caddy TLS). Setup A only. |
| `ADSTUDIO_DB` | SQLite path. Image defaults to `/data/adstudio.db` (the volume). |
| `SIGNUP_CODE` | If set, new accounts must enter it. Keeps the URL from being open. |
| `COOKIE_SECURE` | `1` behind HTTPS (set in the image). |
| `PBKDF2_ITERATIONS` | Password hashing cost (default 200000 — fine on a server). |
| `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` / `OPENAI_API_KEY` / `EMBEDDING_PROVIDER` | Optional owner-wide fallback keys, shared by all users. Prefer per-user keys in the Settings tab. |

## Notes

- **Backups:** the whole app state is one SQLite file in `app_data` (or
  `ADSTUDIO_DB`). Back it up with a cron `sqlite3 .backup` or a volume snapshot.
- **Scaling:** one box is plenty to start. If you outgrow SQLite, move to Postgres
  (the `db.py` queries port cleanly) — but not before you need to.
- This is the same app you run locally; Hetzner just gives it a domain, HTTPS, and
  persistence.
