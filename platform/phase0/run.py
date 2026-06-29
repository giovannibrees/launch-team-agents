#!/usr/bin/env python3
"""Phase 0 harness — validate that SSR predicts real ad performance.

This is the single most important experiment in the whole plan. If SSR cannot
rank real winners above real losers, nothing downstream matters.

Commands
--------
  personas   Build a synthetic persona panel from a brand brief.
  rank       Score a set of ads and rank them by purchase intent (the product's
             "which of these should I run?" job).
  validate   Score ads that already have KNOWN real performance, then report the
             rank correlation between SSR and reality. THE GATE.

Run with no API keys to test the plumbing:
  python run.py validate --ads sample/ads.json --brand sample/brand.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List

import personas as personas_mod
import providers
from ssr import SSRScorer


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _load_json(path: str):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _load_dotenv() -> None:
    """Minimal .env loader (no dependency). Silently does nothing if absent."""
    path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def _spearman(xs: List[float], ys: List[float]) -> float:
    """Spearman rank correlation (no scipy). Returns 0.0 if undefined."""
    n = len(xs)
    if n < 2:
        return 0.0

    def ranks(vals: List[float]) -> List[float]:
        order = sorted(range(n), key=lambda i: vals[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0  # average rank for ties
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    den = (
        sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
        * sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5
    )
    return num / den if den else 0.0


def _scorer(args) -> SSRScorer:
    llm = providers.get_llm(dry_run=args.dry_run)
    emb = providers.get_embeddings(dry_run=args.dry_run)
    return SSRScorer(llm, emb, temperature=args.temperature)


def _panel(args) -> List[Dict]:
    """Load a saved panel, or generate one from the brand brief."""
    if args.personas:
        return _load_json(args.personas)
    brand = _load_json(args.brand)
    llm = providers.get_llm(dry_run=args.dry_run)
    return personas_mod.generate_personas(llm, brand, n=args.n)


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #
def cmd_personas(args) -> None:
    brand = _load_json(args.brand)
    llm = providers.get_llm(dry_run=args.dry_run)
    panel = personas_mod.generate_personas(llm, brand, n=args.n)
    out = args.out or "personas.json"
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(panel, fh, indent=2)
    print(f"Wrote {len(panel)} personas → {out}")


def cmd_rank(args) -> None:
    ads = _load_json(args.ads)
    panel = _panel(args)
    scores = _scorer(args).score_ads(ads, panel)
    scores.sort(key=lambda s: s.intent_mean, reverse=True)

    print(f"\nSSR ranking — {len(ads)} ads × {len(panel)} personas\n" + "=" * 52)
    for rank, s in enumerate(scores, 1):
        bar = "█" * round(s.intent_mean * 4)
        print(f"{rank:>2}. {s.name[:34]:<34} {s.intent_mean:0.2f} {bar}")
    print("\nTop pick reactions (sample):")
    for r in scores[0].sample_reactions:
        print(f"  • {r}")


def cmd_validate(args) -> None:
    ads = _load_json(args.ads)
    metric = args.metric
    have = [a for a in ads if a.get(metric) is not None]
    if len(have) < 3:
        sys.exit(f"Need ≥3 ads with a known '{metric}' to validate. Found {len(have)}.")

    panel = _panel(args)
    scores = _scorer(args).score_ads(have, panel)
    by_id = {s.ad_id: s for s in scores}

    rows = []
    for a in have:
        s = by_id[str(a.get("id", a.get("name")))]
        rows.append((s.name, s.intent_mean, float(a[metric])))

    rho = _spearman([r[1] for r in rows], [r[2] for r in rows])

    rows.sort(key=lambda r: r[1], reverse=True)
    print(f"\nValidate SSR vs real '{metric}' — {len(rows)} ads × {len(panel)} personas")
    print("=" * 60)
    print(f"{'ad':<34}{'SSR':>8}{'  '}{metric:>10}")
    for name, ssr, real in rows:
        print(f"{name[:33]:<34}{ssr:>8.2f}  {real:>10.2f}")

    print("\n" + "-" * 60)
    print(f"Spearman rank correlation (SSR vs {metric}):  rho = {rho:+.2f}")
    print(_verdict(rho, args.dry_run))


def _verdict(rho: float, dry_run: bool) -> str:
    if dry_run:
        return (
            "  ⚠️  DRY RUN — fake providers carry no real signal; this number is "
            "meaningless.\n      Plumbing works. Now set real keys and rerun with "
            "your own ads + results."
        )
    if rho >= 0.6:
        return "  ✅ STRONG. SSR ranks winners well. Green-light the v1 build."
    if rho >= 0.35:
        return (
            "  🟡 PROMISING but tune it (anchors, temperature, persona panel, model) "
            "and re-run before building."
        )
    return (
        "  ❌ WEAK. SSR is not predictive as configured. Fix the setup or rethink "
        "the thesis BEFORE building anything else. This is the gate doing its job."
    )


# --------------------------------------------------------------------------- #
# entrypoint
# --------------------------------------------------------------------------- #
def main() -> None:
    _load_dotenv()
    p = argparse.ArgumentParser(description="Phase 0 — SSR validation harness")
    sub = p.add_subparsers(dest="cmd", required=True)

    def common(sp):
        sp.add_argument("--brand", help="brand brief JSON (for persona generation)")
        sp.add_argument("--personas", help="pre-built persona panel JSON")
        sp.add_argument("-n", type=int, default=50, help="persona count to generate")
        sp.add_argument("--temperature", type=float, default=0.1, help="SSR PMF temperature")
        sp.add_argument("--dry-run", action="store_true", help="use fake providers, no keys")

    sp = sub.add_parser("personas", help="generate a persona panel")
    sp.add_argument("--brand", required=True)
    sp.add_argument("-n", type=int, default=50)
    sp.add_argument("--out")
    sp.add_argument("--dry-run", action="store_true")
    sp.set_defaults(func=cmd_personas)

    sp = sub.add_parser("rank", help="rank a set of ads by SSR purchase intent")
    sp.add_argument("--ads", required=True)
    common(sp)
    sp.set_defaults(func=cmd_rank)

    sp = sub.add_parser("validate", help="correlate SSR with known real performance")
    sp.add_argument("--ads", required=True)
    sp.add_argument("--metric", default="known_roas", help="result field to correlate against")
    common(sp)
    sp.set_defaults(func=cmd_validate)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
