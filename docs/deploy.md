# Run & deploy Ad Studio

Ways to run the app, fastest first. The Python app is **multi-user** (accounts,
sessions, per-user data) and runs as a normal process, so it's happiest on a real
server — but it also runs locally in one command.

- **Trying it:** option 1 (local).
- **Hosting it for real:** **option 2 — Hetzner / any VPS** (recommended; no
  serverless CPU limits, persistent data).
- **Edge/serverless alternative:** option 3 (Cloudflare Workers) — note the
  free-plan password-hashing caveat there, which a server doesn't have.

---

## 1. Local — instant, free, keys stay on your machine (recommended for trying)

```bash
git pull
python3 platform/app/server.py      # → http://localhost:8000
```

No installs, no keys → **demo mode**. For **live** mode:

```bash
pip install -r requirements.txt     # anthropic + requests
python3 platform/app/server.py
# then add your API keys in the ⚙ Settings tab
```

To see my updates: `git pull` and restart. This is the tightest loop and your
keys never leave your laptop.

---

## 2. Hetzner / any VPS — recommended for hosting it for real

A real server has no per-request CPU limit, so the multi-user Python app runs
exactly as designed (strong password hashing, persistent SQLite). Ships with a
Docker + Caddy (automatic HTTPS) stack:

```bash
git clone https://github.com/giovannibrees/launch-team-agents.git && cd launch-team-agents
git checkout claude/ad-creation-service-tools-jzl5ye
cp .env.example .env        # set DOMAIN (+ optional SIGNUP_CODE / API keys)
docker compose up -d --build
```

Open `https://<DOMAIN>`, create an account, done. If the box already runs a
reverse proxy (kenthq), run the app alone and point your proxy at it — both paths
are in [`deploy-hetzner.md`](deploy-hetzner.md).

## 3. Cloudflare Workers — the edge/serverless alternative

The Python server (options 1, 2, 4) **cannot run on Cloudflare Workers** (Workers
run short-lived JS per request, not a long-lived process). So there's a
Workers-native rebuild in [`platform/worker/`](../platform/worker/) — a Worker +
D1 (Cloudflare SQLite) with the same UI. Deploy it with `wrangler`:

```bash
cd platform/worker
npm install && npx wrangler login
npx wrangler d1 create ad-studio          # paste the id into wrangler.toml
npx wrangler d1 execute ad-studio --remote --file=schema.sql
npx wrangler secret put SIGNUP_CODE        # optional: gate who can sign up
npx wrangler deploy                        # → ad-studio.<you>.workers.dev
```

It's **multi-user**: open the URL, create an account, and each user gets their own
projects, results, and API keys. Full steps + the **free-vs-paid plan caveat**
(password hashing needs Workers Paid, or a lower `PBKDF2_ITERATIONS` on free) in
[`platform/worker/README.md`](../platform/worker/README.md). This is the better
cloud path — edge-deployed, scales to zero, and the direction the production v1
was always heading (SSR ported to JS).

## 4. Render / Railway — PaaS alternative to a VPS

Same multi-user Python app, on a managed host instead of your own box. A
`render.yaml` blueprint and a `Procfile` are included.

1. **render.com → New + → Blueprint**, connect the repo, pick this branch, Apply.
2. In the service's **Environment**, optionally set `SIGNUP_CODE` (gate signups)
   and owner-wide keys; users can also add their own keys in Settings.
3. **Attach a persistent disk** mounted where `ADSTUDIO_DB` points — otherwise the
   free plan resets the SQLite file (and all accounts) on redeploy/sleep.

Railway works the same (Deploy from GitHub → it detects the `Procfile`). For most
cases option 2 (your Hetzner box) is simpler and cheaper since you already have it.

---

## 5. The production path (later, not now)

The app is now genuinely multi-user (accounts, sessions, per-user data) — good
enough to onboard real users on one Hetzner box. The remaining gaps before a
public launch are **email verification + password reset** and **billing**
(Stripe), plus moving SQLite → managed **Postgres** when you outgrow a single box
(the `db.py` queries port cleanly). The fuller commercial plan
([`commercial-platform-plan.md`](commercial-platform-plan.md),
[`mvp-v1-spec.md`](mvp-v1-spec.md)) still applies; Hetzner just lets you run the
real thing now instead of waiting on a rewrite.
