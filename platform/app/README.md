# Ad Studio — the tool

A browser app for the v1 loop: **describe your business → get ad concepts ranked
by synthetic-buyer purchase intent (SSR) → upload your real Meta results → get
the next round.** No JSON files to hand-edit.

## Run it (one command, no installs)

```bash
python3 platform/app/server.py
# open http://localhost:8000
```

Out of the box it runs in **DEMO mode** (fake data, no keys) so you can click
through the whole flow. The badge top-right shows DEMO or LIVE.

## Make it live

```bash
pip install -r ../phase0/requirements.txt
cp ../phase0/.env.example ../phase0/.env   # add ANTHROPIC + VOYAGE/OPENAI keys
python3 platform/app/server.py             # badge now reads LIVE
```

The app reads `platform/phase0/.env` automatically. Live scoring of 6 concepts ×
10 personas takes ~1–2 min (one LLM call per persona reaction).

## The three tabs

1. **Create & rank** — type what your business is about (+ optional URL, target
   customer, competitor ads). It generates concepts and ranks them by SSR purchase
   intent, with the per-persona *why* under each card.
2. **Rank ads I have** — paste ads you already wrote (`Headline | Primary text`
   per line). SSR tells you which to run. Useful with zero generation.
3. **Results loop** — upload your Meta Ads Manager CSV export. It reads the
   ad-name + ROAS/result columns, flags winners and losers, and proposes the next
   round — leaning into winners, avoiding losers (the Karpathy learn step).

## How it relates to the rest

It wraps the **same engine** as [`../phase0/`](../phase0) (`ssr.py`,
`personas.py`, `generate.py`, `providers.py`) behind a UI. Phase 0 is the
validation CLI; this is the usable tool. Both are the Python reference; the
production v1 ports the SSR math to TypeScript on Vercel + Supabase
([hosting](../README.md#hosting-recommended-solo-founder)).

## What's real vs. next

- **Real now:** business → concepts → SSR ranking → reactions; rank-existing;
  CSV results → learn → next round. Stateless, single-file stdlib server.
- **Next:** render concepts to finished images (the model router — Ideogram v3 /
  Seedream / Nano Banana Pro), accounts + persistence (Supabase), the calibration
  flywheel storing `(SSR score → real ROAS)` pairs across sessions.
