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

# 3. lock the public URL behind a password (any username works at the prompt)
npx wrangler secret put APP_PASSWORD

# 4. (optional) live mode — set keys as secrets, OR enter them in the app's Settings tab
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put VOYAGE_API_KEY      # or set EMBEDDING_PROVIDER=openai + OPENAI_API_KEY
npx wrangler secret put OPENAI_API_KEY      # embeddings and/or image generation

# 5. ship it
npx wrangler deploy
```

You get a `https://ad-studio.<you>.workers.dev` URL. Open it, enter your
`APP_PASSWORD`, and use it from anywhere.

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

## Notes / next steps

- **Secrets:** keys entered in the in-app Settings tab live in D1. Owner-wide keys
  set via `wrangler secret put` are Cloudflare-encrypted. Either works; the
  password gate stops strangers from spending them.
- **Auth is a single shared password** — fine for you / a private demo. Real
  multi-user accounts (per-user data + keys) is the next step: add Cloudflare
  Access in front, or per-user auth + scoping in the Worker.
- **Image router:** still `gpt-image-1` only. Add Ideogram v3 / Seedream behind
  `generateImage()` in `providers.js` (one `fetch` each) when you want
  ad-grade visuals.
