# Phase 0 — SSR validation harness

**The one experiment the whole company rests on:** does Semantic Similarity
Rating actually predict real ad performance? If it can't rank winners above
losers, nothing downstream matters — so prove it *before* building the platform.

This is a CLI, not a product. Pure Python; **`--dry-run` needs zero installs.**

## Run it right now (no keys, no installs)

```bash
cd platform/phase0
python3 run.py validate --ads sample/ads.json --brand sample/brand.json -n 30 --dry-run
python3 run.py rank     --ads sample/ads.json --brand sample/brand.json -n 30 --dry-run
```

Dry-run uses deterministic fake providers — it proves the plumbing works. The
correlation number is meaningless until you use real providers.

## Run it for real

```bash
pip install -r requirements.txt
cp .env.example .env        # fill in ANTHROPIC + VOYAGE/OPENAI keys
python3 run.py validate --ads your_ads.json --brand your_brand.json -n 50
```

## The three commands

| Command | What it does |
|---|---|
| `personas` | Build a synthetic persona panel from a brand brief (spread across awareness stages). Save it and reuse with `--personas`. |
| `rank` | Score a set of ads, rank by purchase intent. This is the product's *"which of these should I run?"* job (works with ads you already have). |
| `validate` | Score ads that have **known real performance** and report the rank correlation (Spearman) between SSR and reality. **The gate.** |

## The gate (validate)

Provide ads with a real result field (default `known_roas`; override with
`--metric`). The harness prints `rho`, the rank correlation:

- **rho ≥ 0.6** ✅ SSR ranks winners well → green-light the v1 build.
- **0.35–0.6** 🟡 promising → tune anchors / `--temperature` / panel / model, re-run.
- **< 0.35** ❌ not predictive as configured → fix the setup or rethink the thesis
  *before building anything else.*

The cleanest validation set is **your own past ads with known ROAS** (no
generation needed) — that's the purest test of the core thesis.

## Input formats

**brand.json** — `name`, `url`, `description` (what it sells / offer / ICP),
`target_customer`. See [`sample/brand.json`](sample/brand.json).

**ads.json** — list of `{ id, name, headline, primary_text, description }`; add
`known_roas` (or any metric) for `validate`. See [`sample/ads.json`](sample/ads.json).

## Files

| File | Role |
|---|---|
| `ssr.py` | The SSR algorithm — reaction → anchors → cosine → PMF → score. Faithful pure-Python reimplementation of [pymc-labs/semantic-similarity-rating](https://github.com/pymc-labs/semantic-similarity-rating). |
| `personas.py` | Persona-panel generation from a brand brief. |
| `providers.py` | LLM + embedding providers (Anthropic / Voyage / OpenAI / fake). Swap models here. |
| `run.py` | CLI: `personas` · `rank` · `validate`. |
| `sample/` | A runnable DTC example (DriftLight sunrise alarm). |

## Knobs that move the result

- **`--temperature`** — lower = sharper PMF (default 0.1).
- **persona panel** — size (`-n`) and quality; generate once, curate, reuse.
- **anchors** — the 5 reference statements in `ssr.py` (`PURCHASE_INTENT_ANCHORS`).
- **models** — set `LLM_PROVIDER` / `EMBEDDING_PROVIDER` in `.env`.

If `validate` is weak, tune these before concluding SSR doesn't work.
