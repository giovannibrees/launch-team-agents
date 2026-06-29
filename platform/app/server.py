#!/usr/bin/env python3
"""Ad Studio — the tool.

Browser app: Settings (add API keys in-app) → describe business → generate ad
concepts ranked by synthetic-buyer purchase intent (SSR) → render images →
upload real results CSV → see the calibration flywheel + next round.

    python3 platform/app/server.py      # → http://localhost:8000

Runs with NO keys (demo mode) and NO pip installs. Add keys in the Settings tab
for live generation, embeddings, and images.
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phase0"))

import db                         # noqa: E402
import generate as gen            # noqa: E402
import personas as personas_mod   # noqa: E402
import providers                  # noqa: E402
from ssr import SSRScorer         # noqa: E402

db.init()

_PANEL_CACHE: dict[str, list] = {}


# --------------------------------------------------------------------------- #
# config / capabilities (driven by Settings, env as fallback)
# --------------------------------------------------------------------------- #
def cfg() -> dict:
    return db.get_settings()


def caps(c: dict) -> dict:
    llm = bool(providers._val(c, "anthropic_api_key", "ANTHROPIC_API_KEY"))
    prov = (providers._val(c, "embedding_provider", "EMBEDDING_PROVIDER") or "voyage").lower()
    emb = bool(
        (prov == "voyage" and providers._val(c, "voyage_api_key", "VOYAGE_API_KEY"))
        or (prov == "openai" and providers._val(c, "openai_api_key", "OPENAI_API_KEY"))
    )
    img = bool(providers._val(c, "openai_api_key", "OPENAI_API_KEY"))
    return {"llm": llm, "embeddings": emb, "images": img, "ssr_live": llm and emb}


def _brand(p: dict) -> dict:
    return {k: p.get(k, "") for k in ("name", "url", "description", "target_customer")}


def _panel(brand: dict, n: int, c: dict, dry: bool) -> list:
    import hashlib

    key = hashlib.sha256(f"{brand['description']}|{n}|{dry}".encode()).hexdigest()[:16]
    if key not in _PANEL_CACHE:
        _PANEL_CACHE[key] = personas_mod.generate_personas(providers.get_llm(dry, c), brand, n=n)
    return _PANEL_CACHE[key]


def _score(ads: list, brand: dict, n_personas: int, c: dict) -> list:
    dry = not caps(c)["ssr_live"]
    scorer = SSRScorer(providers.get_llm(dry, c), providers.get_embeddings(dry, c))
    panel = _panel(brand, n_personas, c, dry)
    by_id = {s.ad_id: s for s in scorer.score_ads(ads, panel)}
    out = []
    for ad in ads:
        s = by_id[str(ad.get("id", ad.get("name")))]
        out.append({**ad, "score": round(s.intent_mean, 2),
                    "pmf": [round(p, 3) for p in s.pmf], "reactions": s.sample_reactions})
    out.sort(key=lambda a: a["score"], reverse=True)
    return out


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
def api_status(_p: dict) -> dict:
    return {"caps": caps(cfg())}


def api_get_settings(_p: dict) -> dict:
    return {"settings": db.masked_settings(), "caps": caps(cfg())}


def api_save_settings(p: dict) -> dict:
    db.save_settings({k: v for k, v in (p.get("settings") or {}).items()})
    return {"ok": True, "caps": caps(cfg())}


def _persist_and_tag(brand: dict, ranked: list, source: str) -> list:
    """Save project + ranked ads so they can be rendered and calibrated later."""
    pid = db.upsert_project(brand)
    ids = db.save_ads(pid, ranked, source)
    for ad, db_id in zip(ranked, ids):
        ad["db_id"] = db_id
        ad["project_id"] = pid
    return ranked


def api_generate(p: dict) -> dict:
    c = cfg()
    brand = _brand(p)
    if not brand["description"]:
        return {"error": "Tell me what your business is about."}
    concepts = gen.generate_concepts(
        providers.get_llm(not caps(c)["llm"], c), brand,
        n=int(p.get("n_concepts", 6)), references=p.get("references") or None,
    )
    ranked = _persist_and_tag(brand, _score(concepts, brand, int(p.get("n_personas", 10)), c), "generated")
    return {"mode": _mode(c), "ads": ranked}


def api_rank(p: dict) -> dict:
    c = cfg()
    brand = _brand(p)
    ads = p.get("ads") or []
    if not ads:
        return {"error": "Add at least one ad to rank."}
    for i, a in enumerate(ads):
        a.setdefault("id", f"a{i+1}")
        a.setdefault("name", (a.get("headline") or f"Ad {i+1}")[:40])
    ranked = _persist_and_tag(brand, _score(ads, brand, int(p.get("n_personas", 10)), c), "ranked")
    return {"mode": _mode(c), "ads": ranked}


def api_render(p: dict) -> dict:
    c = cfg()
    img = providers.get_image(not caps(c)["images"], c)
    prompt = (
        f"High-converting {p.get('angle','')} social ad image. "
        f"Headline on image: \"{p.get('headline','')}\". "
        f"Visual: {p.get('description','')}. Clean, native, scroll-stopping."
    )
    try:
        url = img.generate(prompt)
    except Exception as exc:
        return {"error": f"Image generation failed: {type(exc).__name__}: {exc}"}
    if p.get("db_id"):
        db.set_ad_image(int(p["db_id"]), url)
    return {"image": url, "live": caps(c)["images"]}


def api_results(p: dict) -> dict:
    c = cfg()
    rows = _parse_results_csv(p.get("csv", ""))
    if not rows:
        return {"error": "Couldn't find ad rows with a name and a ROAS/result column."}
    brand = _brand(p)
    pid = db.upsert_project(brand) if brand["description"] else None
    if pid:
        db.save_results(pid, rows)

    rows.sort(key=lambda r: r["metric"], reverse=True)
    winners = rows[: max(1, len(rows) // 3)]
    losers = rows[-max(1, len(rows) // 3):]

    next_round = []
    if brand["description"]:
        concepts = gen.generate_concepts(
            providers.get_llm(not caps(c)["llm"], c), brand, n=int(p.get("n_concepts", 6)),
            winners="\n".join(f"- {w['name']} (ROAS {w['metric']})" for w in winners),
            kill_list=[l["name"] for l in losers],
        )
        next_round = _persist_and_tag(brand, _score(concepts, brand, int(p.get("n_personas", 10)), c), "generated")

    calib = db.calibration(pid) if pid else {"n": 0, "rho": None, "pairs": []}
    return {"mode": _mode(c), "parsed": rows, "winners": [w["name"] for w in winners],
            "losers": [l["name"] for l in losers], "next_round": next_round, "calibration": calib}


def _mode(c: dict) -> str:
    return "live" if caps(c)["ssr_live"] else "demo"


def _parse_results_csv(text: str) -> list:
    if not text.strip():
        return []
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    headers = {h.lower().strip(): h for h in reader.fieldnames}

    def find(*cands):
        for cand in cands:
            for low, orig in headers.items():
                if cand in low:
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


ROUTES = {
    "/api/generate": api_generate, "/api/rank": api_rank, "/api/render": api_render,
    "/api/results": api_results, "/api/settings": api_save_settings,
}
GET_ROUTES = {"/api/status": api_status, "/api/settings": api_get_settings}


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _gated(self) -> bool:
        """If APP_PASSWORD is set (i.e. hosted), require HTTP basic auth.
        Unset (local) → wide open. Stops a public URL from spending your keys."""
        import base64

        pw = os.environ.get("APP_PASSWORD")
        if not pw:
            return False
        hdr = self.headers.get("Authorization", "")
        if hdr.startswith("Basic "):
            try:
                if base64.b64decode(hdr[6:]).decode().split(":", 1)[-1] == pw:
                    return False
            except Exception:
                pass
        self.send_response(401)
        self.send_header("WWW-Authenticate", 'Basic realm="Ad Studio"')
        self.end_headers()
        return True

    def do_GET(self):
        if self._gated():
            return
        if self.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as fh:
                self._send(200, fh.read(), "text/html; charset=utf-8")
        elif self.path in GET_ROUTES:
            self._send(200, json.dumps(GET_ROUTES[self.path]({})).encode(), "application/json")
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self):
        if self._gated():
            return
        handler = ROUTES.get(self.path)
        if not handler:
            self._send(404, b"not found", "text/plain")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            result = handler(json.loads(self.rfile.read(length) or b"{}"))
        except Exception as exc:
            result = {"error": f"{type(exc).__name__}: {exc}"}
        self._send(200, json.dumps(result).encode(), "application/json")

    def log_message(self, *args):
        pass


def main():
    port = int(os.environ.get("PORT", "8000"))
    live = caps(cfg())["ssr_live"]
    print(f"\n  Ad Studio — {'LIVE' if live else 'DEMO (add API keys in Settings)'}")
    print(f"  → open http://localhost:{port}\n")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
