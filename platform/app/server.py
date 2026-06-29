#!/usr/bin/env python3
"""Ad Studio — the actual tool.

A browser app that wraps the SSR engine: describe your business → get ad
concepts ranked by synthetic-buyer purchase intent → upload your real results
CSV → get the next round. Runs with ONE command and no API keys (demo mode);
add keys in platform/phase0/.env for live generation.

    python3 platform/app/server.py
    # open http://localhost:8000

No third-party packages needed for demo mode (Python stdlib only).
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Reuse the engine that lives in phase0/.
HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.join(HERE, "..", "phase0")
sys.path.insert(0, ENGINE)

import generate as gen          # noqa: E402
import personas as personas_mod  # noqa: E402
import providers                 # noqa: E402
from ssr import SSRScorer        # noqa: E402

# Load phase0/.env so live keys are picked up automatically.
def _load_dotenv() -> None:
    path = os.path.join(ENGINE, ".env")
    if not os.path.exists(path):
        return
    for line in open(path, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

# In-memory persona-panel cache so we don't regenerate the panel every request.
_PANEL_CACHE: dict[str, list] = {}


def is_demo() -> bool:
    """Demo mode unless a real Anthropic key + provider is configured."""
    return os.environ.get("LLM_PROVIDER") != "anthropic" or not os.environ.get("ANTHROPIC_API_KEY")


def _brand_from(payload: dict) -> dict:
    return {
        "name": payload.get("name", ""),
        "url": payload.get("url", ""),
        "description": payload.get("description", ""),
        "target_customer": payload.get("target_customer", ""),
    }


def _panel(brand: dict, n: int) -> list:
    key = hashlib.sha256(f"{brand['description']}|{n}".encode()).hexdigest()[:16]
    if key not in _PANEL_CACHE:
        llm = providers.get_llm(dry_run=is_demo())
        _PANEL_CACHE[key] = personas_mod.generate_personas(llm, brand, n=n)
    return _PANEL_CACHE[key]


def _score(ads: list, brand: dict, n_personas: int) -> list:
    dry = is_demo()
    scorer = SSRScorer(providers.get_llm(dry_run=dry), providers.get_embeddings(dry_run=dry))
    panel = _panel(brand, n_personas)
    scored = scorer.score_ads(ads, panel)
    by_id = {s.ad_id: s for s in scored}
    out = []
    for ad in ads:
        s = by_id[str(ad.get("id", ad.get("name")))]
        out.append(
            {
                **ad,
                "score": round(s.intent_mean, 2),
                "pmf": [round(p, 3) for p in s.pmf],
                "reactions": s.sample_reactions,
            }
        )
    out.sort(key=lambda a: a["score"], reverse=True)
    return out


# --------------------------------------------------------------------------- #
# API handlers
# --------------------------------------------------------------------------- #
def api_generate(payload: dict) -> dict:
    brand = _brand_from(payload)
    if not brand["description"]:
        return {"error": "Tell me what your business is about."}
    llm = providers.get_llm(dry_run=is_demo())
    concepts = gen.generate_concepts(
        llm, brand,
        n=int(payload.get("n_concepts", 6)),
        references=payload.get("references") or None,
    )
    ranked = _score(concepts, brand, int(payload.get("n_personas", 10)))
    return {"mode": "demo" if is_demo() else "live", "ads": ranked, "panel": len(_panel(brand, int(payload.get("n_personas", 10))))}


def api_rank(payload: dict) -> dict:
    brand = _brand_from(payload)
    ads = payload.get("ads") or []
    if not ads:
        return {"error": "Add at least one ad to rank."}
    for i, a in enumerate(ads):
        a.setdefault("id", f"a{i+1}")
        a.setdefault("name", a.get("headline", f"Ad {i+1}")[:40])
    ranked = _score(ads, brand, int(payload.get("n_personas", 10)))
    return {"mode": "demo" if is_demo() else "live", "ads": ranked}


def api_results(payload: dict) -> dict:
    """Parse a Meta results CSV → learn winners/losers → propose the next round."""
    rows = _parse_results_csv(payload.get("csv", ""))
    if not rows:
        return {"error": "Couldn't find ad rows with a name and a ROAS/result column in that CSV."}
    rows.sort(key=lambda r: r["metric"], reverse=True)
    winners = rows[: max(1, len(rows) // 3)]
    losers = rows[-max(1, len(rows) // 3):]

    brand = _brand_from(payload)
    llm = providers.get_llm(dry_run=is_demo())
    concepts = gen.generate_concepts(
        llm, brand,
        n=int(payload.get("n_concepts", 6)),
        winners="\n".join(f"- {w['name']} (ROAS {w['metric']})" for w in winners),
        kill_list=[l["name"] for l in losers],
    )
    ranked = _score(concepts, brand, int(payload.get("n_personas", 10))) if brand["description"] else []
    return {
        "mode": "demo" if is_demo() else "live",
        "parsed": rows,
        "winners": [w["name"] for w in winners],
        "losers": [l["name"] for l in losers],
        "next_round": ranked,
    }


def _parse_results_csv(text: str) -> list:
    if not text.strip():
        return []
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    headers = {h.lower().strip(): h for h in reader.fieldnames}

    def find(*cands):
        for c in cands:
            for low, orig in headers.items():
                if c in low:
                    return orig
        return None

    name_col = find("ad name", "ad set name", "campaign name", "name")
    roas_col = find("roas", "return on ad spend", "purchase value")
    res_col = find("result", "purchase", "conversion")
    metric_col = roas_col or res_col
    if not name_col or not metric_col:
        return []

    out = []
    for r in reader:
        name = (r.get(name_col) or "").strip()
        raw = (r.get(metric_col) or "").replace(",", "").replace("$", "").strip()
        try:
            metric = float(raw)
        except ValueError:
            continue
        if name:
            out.append({"name": name, "metric": metric, "metric_name": "ROAS" if roas_col else "results"})
    return out


ROUTES = {"/api/generate": api_generate, "/api/rank": api_rank, "/api/results": api_results}


# --------------------------------------------------------------------------- #
# HTTP server
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as fh:
                self._send(200, fh.read(), "text/html; charset=utf-8")
        elif self.path == "/api/status":
            self._send(200, json.dumps({"mode": "demo" if is_demo() else "live"}).encode(), "application/json")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        handler = ROUTES.get(self.path)
        if not handler:
            self._send(404, b"not found", "text/plain")
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            result = handler(payload)
        except Exception as exc:  # surface engine errors to the UI
            result = {"error": f"{type(exc).__name__}: {exc}"}
        self._send(200, json.dumps(result).encode(), "application/json")

    def log_message(self, *args):  # quiet console
        pass


def main():
    port = int(os.environ.get("PORT", "8000"))
    mode = "DEMO (no API keys — fake data)" if is_demo() else "LIVE (real models)"
    print(f"\n  Ad Studio running in {mode}")
    print(f"  → open http://localhost:{port}\n")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
