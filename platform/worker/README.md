# Ad Studio on Cloudflare Workers

The same app, rebuilt to run **natively on Cloudflare** — a Worker (JavaScript,
no build step) + **D1** (Cloudflare's SQLite) for persistence. This is the
serverless, globally-deployed version; it replaces the Python `http.server`
prototype (which can't run on Workers — Workers aren't a long-running process).

```
platform/worker/
├── wrangler.toml      Cloudflare config (Worker + D1 + HTML-as-text)
├── schema.sql         D1 tables
├── package.json       wrangler
└── src/
    ├── index.js       router, auth gate, API handlers
    ├── providers.js   Anthropic / Voyage / OpenAI via fetch + demo fakes
    ├── ssr.js         SSR scoring (batched: 1 LLM call per ad → all reactions)
    ├── generate.js    concept + persona generation
    ├── db.js          D1 persistence + calibration
    └── index.html     the UI (same as the Python app)
```

## Deploy (about 10 minutes)

```bash
cd platform/worker
npm install                     # gets wrangler locally
npx wrangler login              # opens browser, connect your Cloudflare account

# 1. create the D1 database, then paste the printed database_id into wrangler.toml
npx wrangler d1 create ad-studio

# 2. create the tables (run for both local dev and remote)
npx wrangler d1 execute ad-studio --remote --file=schema.sql

# 3. (optional) require an invite code to sign up, so the URL isn't wide open
npx wrangler secret put SIGNUP_CODE

# 4. (optional) owner-wide live keys — OR each user enters their own in Settings.
#    WARNING: keys set here are shared by every signed-up user, on your dime.
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put VOYAGE_API_KEY      # or set EMBEDDING_PROVIDER=openai + OPENAI_API_KEY
npx wrangler secret put OPENAI_API_KEY      # embeddings and/or image generation

# 5. ship it
npx wrangler deploy
```

You get a `https://ad-studio.<you>.workers.dev` URL. Open it, **create an
account**, and use it from anywhere. Each user gets their own projects, results,
and API keys.

### ⚠️ Free vs Paid plan — read before deploying multi-user

Secure password hashing (PBKDF2, 100k iterations) uses ~45ms CPU, but the Workers
**free plan caps CPU at 10ms/request** — so **signup/login will fail on free**.
Choose one:

- **Workers Paid ($5/mo)** — recommended for real multi-user. Leave
  `PBKDF2_ITERATIONS=100000`. (You also get far higher D1 limits.)
- **Free plan** — set `PBKDF2_ITERATIONS` to ~`12000` in `wrangler.toml` so logins
  fit the CPU budget. Hashing is weaker, but the count is stored per-user, so you
  can raise it after upgrading without breaking existing accounts.

### Local dev
```bash
npx wrangler dev        # runs the Worker + a local D1, on http://localhost:8787
```

## Why Workers fits this app

- **Cost/scale:** generous free tier, deployed to the edge, scales to zero.
- **D1** maps 1:1 from the prototype's SQLite schema (`schema.sql`).
- **Subrequest limits handled:** SSR batches *all* persona reactions for an ad
  into **one** LLM call (then one embed call), so a full run is ~15 subrequests —
  well within limits — and faster than the per-persona Python version.

## Auth model

- **Accounts:** email + password (PBKDF2 via Web Crypto), sessions in D1 via an
  HttpOnly cookie. Sign up / log in / log out in the UI.
- **Per-user everything:** projects, ads, results, and API keys are scoped by
  `user_id` — users never see each other's data. Verified end-to-end.
- **`SIGNUP_CODE`** (optional secret): if set, new accounts must enter it — keeps a
  public URL from being open to the world.
- **Keys:** each user enters their own in the Settings tab (stored per-user in
  D1). Owner-wide keys via `wrangler secret put` are a shared fallback — every
  user spends them, so prefer per-user keys for a real product.

## Next steps

- **Email verification + password reset** — this ships signup/login only; add
  verification (and reset via a token email) before real launch.
- **Billing** — gate usage with Stripe once you have accounts.
- **Image router** — still `gpt-image-1` only. Add Ideogram v3 / Seedream behind
  `generateImage()` in `providers.js` (one `fetch` each) for ad-grade visuals.
