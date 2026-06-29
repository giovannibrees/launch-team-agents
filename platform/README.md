# platform/ — the product code

The commercial build of the SSR-tested ad-creation service. Plan lives in
[`docs/commercial-platform-plan.md`](../docs/commercial-platform-plan.md); the
v1 product shape in [`docs/mvp-v1-spec.md`](../docs/mvp-v1-spec.md). Build in
**phase order** — each phase has a go/no-go gate; don't start the next until the
current one passes.

```
platform/
├── phase0/        validate SSR predicts ROAS (CLI gate)
├── app/           THE TOOL (Python): browser app, run locally in one command
└── worker/        ← THE TOOL (Cloudflare Workers): edge-deployed, D1-backed
```

## Run it now (local, Python)

```bash
python3 platform/app/server.py     # → http://localhost:8000  (DEMO mode, no keys)
```

See [`app/README.md`](app/). Add keys in the in-app ⚙ Settings tab for live mode.

## Deploy to the cloud (Cloudflare Workers)

The Workers rebuild in [`worker/`](worker/) is the recommended hosted version —
same UI, ported to a Worker + D1. `cd platform/worker && npx wrangler deploy`.
See [`worker/README.md`](worker/) and [`../docs/deploy.md`](../docs/deploy.md).

## Build order

1. **Phase 0 — [`phase0/`](phase0/)** — prove SSR ranks real winners above losers.
   Pure-Python CLI, runs in `--dry-run` with no keys. **Start here.**
2. **v1 app** — only after the Phase 0 gate passes. The
   [no-Meta-API copilot](../docs/mvp-v1-spec.md): 3 input modes → generate + SSR
   → manual publish → CSV results loop.

## Hosting (recommended, solo founder)

| Layer | Host |
|---|---|
| Web app + API (Next.js) | **Vercel** |
| Postgres · auth · storage · `pgvector` | **Supabase** |
| Async jobs (generation, SSR runs) | **Inngest** or **Trigger.dev** |
| Billing (subscriptions + credits) | **Stripe** |

Pre-revenue cost ≈ $0–45/mo on hobby tiers.

**Language note:** Phase 0 is Python (faithful to the SSR paper). For the v1 app,
port the ~50 lines of SSR math in [`phase0/ssr.py`](phase0/ssr.py) to TypeScript
so the whole product runs as one language on Vercel + Supabase with **no separate
Python service to host**. Embeddings + LLM are just API calls from either stack.
