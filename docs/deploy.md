# Run & deploy Ad Studio

Three ways to use the app, fastest first. The app binds `0.0.0.0:$PORT`, so it
runs locally or on any PaaS with no code changes.

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

## 2. Cloudflare Workers — the recommended cloud version

The Python server in options 1 & 3 **cannot run on Cloudflare Workers** (Workers
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

## 3. Render — a public URL in ~5 minutes (Python prototype)

This repo ships a `render.yaml` blueprint.

1. Push this branch to GitHub (already done).
2. Go to **render.com → New + → Blueprint**, connect the repo, pick this branch,
   **Apply**. Render reads `render.yaml` and builds the `ad-studio` web service.
3. In the service's **Environment**, set:
   - **`APP_PASSWORD`** — a password. The app then asks for it (any username) on
     load, so only you get in. **Set this** — see the warning below.
   - For live mode, either set `ANTHROPIC_API_KEY` / `VOYAGE_API_KEY` /
     `OPENAI_API_KEY` here, **or** leave them blank and enter keys in the in-app
     Settings tab after it deploys.
4. Open the `…onrender.com` URL Render gives you.

> ⚠️ **Why the password matters.** A public URL with no lock means anyone with
> the link can open Settings — and if you put your API keys in host env vars,
> anyone who logs in spends *your* credits. Always set `APP_PASSWORD`, and don't
> share the URL. For just trying it yourself, local (option 1) avoids this
> entirely.

> **Note:** on the free plan the service sleeps when idle and the SQLite file
> resets on redeploy/sleep (settings & results don't persist). Fine for trying.
> Add a Render **persistent disk** (paid) to keep data, or move to Supabase
> (the production path).

### Railway / Fly / Heroku-likes
A `Procfile` is included (`web: python3 platform/app/server.py`) and a root
`requirements.txt`. On **Railway**: New Project → Deploy from GitHub → it detects
Python and the Procfile → add the same env vars (`APP_PASSWORD`, optional keys).

---

## 4. The production path (later, not now)

Options 1 & 3 host the **Python prototype** so you can click around today. The
commercial v1 is a different stack — **Next.js on Vercel + Supabase** (Postgres,
auth, encrypted secrets, persistent storage) — see
[`commercial-platform-plan.md`](commercial-platform-plan.md) and
[`mvp-v1-spec.md`](mvp-v1-spec.md). Port the ~50 lines of SSR math from
`platform/phase0/ssr.py` to TypeScript when you make that move. Don't deploy the
stdlib server as your real multi-user product — it has no accounts, no real
secret storage, and ephemeral state by design.
