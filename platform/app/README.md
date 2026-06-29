# Ad Studio — the tool

A browser app for the v1 loop: **describe your business → get ad concepts ranked
by synthetic-buyer purchase intent (SSR) → upload your real Meta results → get
the next round.** No JSON files to hand-edit.

**Multi-user:** email + password accounts, per-user projects/results/keys. To
deploy it for real (Hetzner / any VPS), see [`../../docs/deploy-hetzner.md`](../../docs/deploy-hetzner.md).

## Run it (one command, no installs)

```bash
python3 platform/app/server.py
# open http://localhost:8000  → create an account
```

Out of the box it runs in **DEMO mode** (fake data, no keys) so you can click
through the whole flow. The badge top-right shows DEMO or LIVE. The first thing
you'll see is a sign-up screen; accounts + data persist in `adstudio.db`.

## Make it live — add keys in the app

```bash
pip install -r ../phase0/requirements.txt   # anthropic + requests, for real calls
python3 platform/app/server.py
```

Open the **⚙ Settings** tab and paste your keys — no files to edit:

- **Anthropic API key** → persona reactions + ad generation
- **Embeddings**: Voyage (recommended) or OpenAI key → the SSR similarity step
- **OpenAI API key** → image generation (`gpt-image-1`) and/or OpenAI embeddings

The badge flips to **LIVE** once an LLM + an embeddings provider are set. The
Settings tab shows per-capability pills (LLM / Embeddings / Images). Keys persist
in a local SQLite file (`adstudio.db`); secrets are masked when read back. Live
scoring of 6 concepts × 10 personas takes ~1–2 min (one LLM call per reaction).

> Local dev stores keys in plaintext SQLite by design. The production v1 puts them
> in per-user **encrypted** secrets (Supabase Vault) — never plaintext.

## The three tabs

1. **Create & rank** — type what your business is about (+ optional URL, target
   customer, competitor ads). It generates concepts and ranks them by SSR purchase
   intent, with the per-persona *why* under each card.
2. **Rank ads I have** — paste ads you already wrote (`Headline | Primary text`
   per line). SSR tells you which to run. Useful with zero generation.
3. **Results loop** — upload your Meta Ads Manager CSV export. It reads the
   ad-name + ROAS/result columns, **stores them**, flags winners and losers,
   proposes the next round (leaning into winners, avoiding losers — the Karpathy
   learn step), and shows the **calibration** figure: the rank correlation between
   SSR scores and real ROAS, across every matched ad. That number sharpening over
   time is the moat. (Matching is by ad name — generate ads here, then use those
   names in Meta so the results join back.)

Every concept has a **Render image** button (`gpt-image-1` live, placeholder in
demo). Images, ranked ads, projects, and results all persist in `adstudio.db`.

## How it relates to the rest

It wraps the **same engine** as [`../phase0/`](../phase0) (`ssr.py`,
`personas.py`, `generate.py`, `providers.py`) behind a UI. Phase 0 is the
validation CLI; this is the usable tool. Both are the Python reference; the
production v1 ports the SSR math to TypeScript on Vercel + Supabase
([hosting](../README.md#hosting-recommended-solo-founder)).

## What's real vs. next

- **Real now:** accounts + per-user data; business → concepts → SSR ranking →
  reactions; rank-existing; render images; CSV results → learn → next round +
  calibration; **forecast** (upload a dated Meta/Google/TikTok export → project
  the next N days, baseline built-in or TimesFM when enabled). Stdlib + SQLite.
- **Next:** broaden the image router (Ideogram v3 / Seedream / Nano Banana Pro),
  email verification + password reset, Stripe billing, the calibration
  flywheel storing `(SSR score → real ROAS)` pairs across sessions.
