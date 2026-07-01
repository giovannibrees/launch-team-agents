#!/usr/bin/env python3
"""Ad Studio — multi-user Python app (built to run on a real server, e.g. Hetzner).

Accounts (email + password, PBKDF2), sessions via cookie, per-user data. Wraps
the SSR engine in phase0/. Runs with no keys (demo mode); each user adds their
own keys in the Settings tab.

    python3 platform/app/server.py        # → http://localhost:8000

Env:
  PORT                 listen port (default 8000)
  ADSTUDIO_DB          SQLite path (point at a volume in Docker)
  SIGNUP_CODE          if set, required to register
  PBKDF2_ITERATIONS    password hashing cost (default 200000 — fine on a server)
  COOKIE_SECURE        "1" to force Secure cookies when behind HTTPS proxy
  ANTHROPIC_API_KEY / VOYAGE_API_KEY / OPENAI_API_KEY / EMBEDDING_PROVIDER
                       optional owner-wide fallback keys (shared by all users)
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "phase0"))

import auth                       # noqa: E402
import db                         # noqa: E402
import forecast as fc             # noqa: E402
import generate as gen            # noqa: E402
import mailer                     # noqa: E402
import personas as personas_mod   # noqa: E402
import providers                  # noqa: E402
from ssr import SSRScorer         # noqa: E402

db.init()


def _cfg(user_id: int) -> dict:
    """Per-user settings; providers fall back to env for owner-wide keys."""
    return db.get_settings(user_id)


def caps(c: dict) -> dict:
    llm = bool(providers._val(c, "anthropic_api_key", "ANTHROPIC_API_KEY"))
    prov = (providers._val(c, "embedding_provider", "EMBEDDING_PROVIDER") or "voyage").lower()
    emb = bool((prov == "voyage" and providers._val(c, "voyage_api_key", "VOYAGE_API_KEY"))
               or (prov == "openai" and providers._val(c, "openai_api_key", "OPENAI_API_KEY")))
    img = providers.image_models_available(c)
    return {"llm": llm, "embeddings": emb, "images": img["any"], "image_models": img, "ssr_live": llm and emb}


def _brand(p):
    return {k: p.get(k, "") for k in ("name", "url", "description", "target_customer")}


def _mode(c):
    return "live" if caps(c)["ssr_live"] else "demo"


_PANEL_CACHE: dict = {}


def _panel(brand, n, c, dry):
    import hashlib
    key = hashlib.sha256(f"{brand['description']}|{n}|{dry}".encode()).hexdigest()[:16]
    if key not in _PANEL_CACHE:
        _PANEL_CACHE[key] = personas_mod.generate_personas(providers.get_llm(dry, c), brand, n=n)
    return _PANEL_CACHE[key]


def _score(ads, brand, n_personas, c):
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


def _persist(user_id, brand, ranked, source):
    pid = db.upsert_project(user_id, brand)
    ids = db.save_ads(user_id, pid, ranked, source)
    for ad, db_id in zip(ranked, ids):
        ad["db_id"] = db_id
        ad["project_id"] = pid
    return ranked


# --- per-user API handlers ------------------------------------------------- #
def api_generate(user_id, c, p):
    brand = _brand(p)
    if not brand["description"]:
        return {"error": "Tell me what your business is about."}
    concepts = gen.generate_concepts(providers.get_llm(not caps(c)["llm"], c), brand,
                                     n=int(p.get("n_concepts", 6)), references=p.get("references") or None)
    ranked = _persist(user_id, brand, _score(concepts, brand, int(p.get("n_personas", 10)), c), "generated")
    return {"mode": _mode(c), "ads": ranked}


def api_rank(user_id, c, p):
    brand = _brand(p)
    ads = p.get("ads") or []
    if not ads:
        return {"error": "Add at least one ad to rank."}
    for i, a in enumerate(ads):
        a.setdefault("id", f"a{i+1}")
        a.setdefault("name", (a.get("headline") or f"Ad {i+1}")[:40])
    ranked = _persist(user_id, brand, _score(ads, brand, int(p.get("n_personas", 10)), c), "ranked")
    return {"mode": _mode(c), "ads": ranked}


def api_render(user_id, c, p):
    headline = p.get("headline", "")
    requested = p.get("model") or c.get("image_model") or "auto"
    img, model_used = providers.get_image(not caps(c)["images"], c,
                                          model=requested, text_on_image=bool(headline.strip()))
    prompt = (f"High-converting {p.get('angle','')} social ad image. "
              f"Headline on image: \"{headline}\". Visual: {p.get('description','')}. "
              f"Clean, native, scroll-stopping.")
    try:
        url = img.generate(prompt)
    except Exception as exc:
        return {"error": f"Image generation failed: {type(exc).__name__}: {exc}"}
    if p.get("db_id"):
        db.set_ad_image(user_id, int(p["db_id"]), url)
    return {"image": url, "live": caps(c)["images"], "model": model_used}


def api_results(user_id, c, p):
    rows = _parse_results_csv(p.get("csv", ""))
    if not rows:
        return {"error": "Couldn't find ad rows with a name and a ROAS/result column."}
    brand = _brand(p)
    pid = db.upsert_project(user_id, brand) if brand["description"] else None
    if pid:
        db.save_results(user_id, pid, rows)
    rows.sort(key=lambda r: r["metric"], reverse=True)
    k = max(1, len(rows) // 3)
    winners, losers = rows[:k], rows[-k:]
    next_round = []
    if brand["description"]:
        concepts = gen.generate_concepts(providers.get_llm(not caps(c)["llm"], c), brand,
                                         n=int(p.get("n_concepts", 6)),
                                         winners="\n".join(f"- {w['name']} (ROAS {w['metric']})" for w in winners),
                                         kill_list=[l["name"] for l in losers])
        next_round = _persist(user_id, brand, _score(concepts, brand, int(p.get("n_personas", 10)), c), "generated")
    calib = db.calibration(user_id, pid) if pid else {"n": 0, "rho": None, "pairs": []}
    return {"mode": _mode(c), "parsed": rows, "winners": [w["name"] for w in winners],
            "losers": [l["name"] for l in losers], "next_round": next_round, "calibration": calib}


def _parse_results_csv(text):
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
    metric_col = roas_col or find("result", "purchase", "conversion")
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


def api_forecast(user_id, c, p):
    horizon = max(1, min(60, int(p.get("horizon", 14))))
    series, info = fc.parse_series(p.get("csv", ""), p.get("metric") or None, p.get("group") or None)
    if not series:
        return {"error": "Couldn't find a date column and a numeric metric column in that CSV.", "detected": info}
    out = []
    for name, s in list(series.items())[:12]:
        dates, vals = s["dates"], s["values"]
        weekdays = [d.weekday() for d in dates]
        yhat, lo, hi, backend = fc.forecast_series(vals, horizon, weekdays)
        future = [dates[-1] + timedelta(days=i + 1) for i in range(horizon)]
        out.append({
            "name": name, "backend": backend,
            "history": [{"t": d.strftime("%Y-%m-%d"), "v": round(v, 4)} for d, v in zip(dates, vals)][-90:],
            "forecast": [{"t": future[i].strftime("%Y-%m-%d"), "yhat": round(yhat[i], 4),
                          "lo": round(lo[i], 4), "hi": round(hi[i], 4)} for i in range(horizon)],
        })
    return {"series": out, "detected": info, "metric": info.get("value_col")}


AUTHED_POST = {"/api/generate": api_generate, "/api/rank": api_rank, "/api/render": api_render,
               "/api/results": api_results, "/api/forecast": api_forecast}


# --- HTTP ------------------------------------------------------------------ #
def _secure():
    return os.environ.get("COOKIE_SECURE") == "1"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200, extra=None):
        self._send(code, json.dumps(obj).encode(), "application/json", extra)

    def _user(self):
        return db.user_from_token(auth.parse_cookie(self.headers.get("Cookie"), "session"))

    def _body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def _base_url(self):
        if os.environ.get("APP_BASE_URL"):
            return os.environ["APP_BASE_URL"].rstrip("/")
        proto = self.headers.get("X-Forwarded-Proto") or ("https" if _secure() else "http")
        return f"{proto}://{self.headers.get('Host', 'localhost')}"

    def _email_link(self, user, kind, subject, blurb, ttl):
        """Create a token, email the link. Returns dev_link (only when no SMTP)."""
        token = db.create_token(user["id"], kind, ttl)
        link = f"{self._base_url()}/{'verify' if kind == 'verify' else 'reset'}?token={token}"
        mailer.send(user["email"], subject, f"{blurb}\n\n{link}\n")
        return None if mailer.configured() else link

    def _redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        query = parse_qs(urlparse(self.path).query)
        if path in ("/", "/index.html", "/reset"):
            with open(os.path.join(HERE, "index.html"), "rb") as fh:
                self._send(200, fh.read(), "text/html; charset=utf-8")
            return
        if path == "/verify":
            uid = db.consume_token(query.get("token", [None])[0], "verify")
            if uid:
                db.mark_verified(uid)
            return self._redirect("/?verified=1" if uid else "/?verified=0")
        user = self._user()
        if path == "/api/me":
            return self._json({"email": user["email"], "verified": user["verified"]}) if user \
                else self._json({"error": "not signed in"}, 401)
        if not user:
            return self._json({"error": "Sign in required."}, 401)
        c = _cfg(user["id"])
        if path == "/api/status":
            return self._json({"caps": caps(c)})
        if path == "/api/settings":
            return self._json({"settings": db.masked_settings(user["id"]), "caps": caps(c)})
        self._send(404, b"not found", "text/plain")

    def do_POST(self):
        try:
            body = self._body()
        except Exception:
            return self._json({"error": "bad request"}, 400)

        # --- public auth routes --- #
        if self.path == "/api/signup":
            try:
                if os.environ.get("SIGNUP_CODE") and body.get("code") != os.environ["SIGNUP_CODE"]:
                    raise ValueError("Invalid signup code.")
                iters = int(os.environ.get("PBKDF2_ITERATIONS", auth.DEFAULT_ITERATIONS))
                user = db.create_user(body.get("email"), body.get("password"), iters)
                dev_link = self._email_link(user, "verify", "Verify your Ad Studio email",
                                            "Confirm your email to finish signing up (expires in 24h):", 86400)
                token = db.create_session(user["id"])
                return self._json({"email": user["email"], "verified": False, "dev_link": dev_link},
                                  200, {"Set-Cookie": auth.session_cookie(token, _secure())})
            except ValueError as e:
                return self._json({"error": str(e)}, 400)
        if self.path == "/api/login":
            user = db.authenticate(body.get("email"), body.get("password"))
            if not user:
                return self._json({"error": "Wrong email or password."}, 401)
            token = db.create_session(user["id"])
            return self._json({"email": user["email"]}, 200, {"Set-Cookie": auth.session_cookie(token, _secure())})
        if self.path == "/api/forgot":
            user = db.get_user_by_email(body.get("email", ""))
            dev_link = None
            if user:
                dev_link = self._email_link(user, "reset", "Reset your Ad Studio password",
                                            "Reset your password (expires in 1h). Ignore if this wasn't you:", 3600)
            # Always generic (don't reveal which emails exist).
            return self._json({"ok": True, "dev_link": dev_link})
        if self.path == "/api/reset":
            uid = db.consume_token(body.get("token"), "reset")
            if not uid:
                return self._json({"error": "This reset link is invalid or expired."}, 400)
            try:
                db.set_password(uid, body.get("password"), int(os.environ.get("PBKDF2_ITERATIONS", auth.DEFAULT_ITERATIONS)))
            except ValueError as e:
                return self._json({"error": str(e)}, 400)
            db.destroy_user_sessions(uid)  # log out everywhere
            token = db.create_session(uid)
            u = db.user_from_token(token)
            return self._json({"email": u["email"]}, 200, {"Set-Cookie": auth.session_cookie(token, _secure())})

        # --- session-gated routes --- #
        user = self._user()
        if self.path == "/api/logout":
            db.destroy_session(auth.parse_cookie(self.headers.get("Cookie"), "session"))
            return self._json({"ok": True}, 200, {"Set-Cookie": auth.clear_cookie(_secure())})
        if not user:
            return self._json({"error": "Sign in required."}, 401)
        if self.path == "/api/resend-verification":
            dev_link = self._email_link(user, "verify", "Verify your Ad Studio email",
                                        "Confirm your email (expires in 24h):", 86400)
            return self._json({"ok": True, "dev_link": dev_link})

        if os.environ.get("REQUIRE_VERIFICATION") == "1" and not user["verified"]:
            return self._json({"error": "Please verify your email first."}, 403)

        c = _cfg(user["id"])
        try:
            if self.path == "/api/settings":
                db.save_settings(user["id"], body.get("settings") or {})
                return self._json({"ok": True, "caps": caps(_cfg(user["id"]))})
            handler = AUTHED_POST.get(self.path)
            if not handler:
                return self._send(404, b"not found", "text/plain")
            return self._json(handler(user["id"], c, body))
        except Exception as exc:
            return self._json({"error": f"{type(exc).__name__}: {exc}"})

    def log_message(self, *args):
        pass


def main():
    port = int(os.environ.get("PORT", "8000"))
    print(f"\n  Ad Studio (multi-user) → http://localhost:{port}\n")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
