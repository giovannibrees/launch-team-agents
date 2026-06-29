"""SQLite persistence for Ad Studio (stdlib only).

Stores settings (API keys), projects (brands), ranked ads with their SSR scores
and rendered images, and uploaded real results — which lets us join SSR scores to
real ROAS and surface the calibration flywheel (does SSR predict reality?).

A local single-user dev store. In the production v1 this becomes Supabase
Postgres with per-user **encrypted** secrets (Supabase Vault) — keys are NOT
stored in plaintext there. Here they are, locally, by design.
"""

from __future__ import annotations

import os
import sqlite3
import time
from typing import Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "adstudio.db")

# Settings keys that hold secrets — masked when read back to the UI.
SECRET_KEYS = {"anthropic_api_key", "voyage_api_key", "openai_api_key"}


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init() -> None:
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hash TEXT UNIQUE, name TEXT, url TEXT, description TEXT,
                target_customer TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS ads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER, name TEXT, angle TEXT, awareness_stage TEXT,
                headline TEXT, primary_text TEXT, description TEXT,
                score REAL, image TEXT, source TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER, ad_name TEXT, metric REAL, metric_name TEXT, created REAL);
            """
        )


# -- settings --------------------------------------------------------------- #
def get_settings() -> Dict[str, str]:
    with _conn() as c:
        return {r["key"]: r["value"] for r in c.execute("SELECT key, value FROM settings")}


def save_settings(updates: Dict[str, str]) -> None:
    with _conn() as c:
        for k, v in updates.items():
            # Skip masked placeholders so "leave unchanged" doesn't wipe a key.
            if v == "********":
                continue
            c.execute(
                "INSERT INTO settings(key,value) VALUES(?,?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (k, v),
            )


def masked_settings() -> Dict[str, str]:
    out = dict(get_settings())
    for k in SECRET_KEYS:
        if out.get(k):
            out[k] = "********"
    return out


# -- projects + ads --------------------------------------------------------- #
def upsert_project(brand: Dict) -> int:
    import hashlib

    h = hashlib.sha256((brand.get("description", "") or "").encode()).hexdigest()[:16]
    with _conn() as c:
        row = c.execute("SELECT id FROM projects WHERE hash=?", (h,)).fetchone()
        if row:
            return row["id"]
        cur = c.execute(
            "INSERT INTO projects(hash,name,url,description,target_customer,created) "
            "VALUES(?,?,?,?,?,?)",
            (h, brand.get("name", ""), brand.get("url", ""), brand.get("description", ""),
             brand.get("target_customer", ""), time.time()),
        )
        return cur.lastrowid


def save_ads(project_id: int, ads: List[Dict], source: str) -> List[int]:
    ids = []
    with _conn() as c:
        for a in ads:
            cur = c.execute(
                "INSERT INTO ads(project_id,name,angle,awareness_stage,headline,"
                "primary_text,description,score,image,source,created) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (project_id, a.get("name", ""), a.get("angle", ""), a.get("awareness_stage", ""),
                 a.get("headline", ""), a.get("primary_text", ""), a.get("description", ""),
                 a.get("score"), None, source, time.time()),
            )
            ids.append(cur.lastrowid)
    return ids


def set_ad_image(ad_id: int, data_url: str) -> None:
    with _conn() as c:
        c.execute("UPDATE ads SET image=? WHERE id=?", (data_url, ad_id))


def get_ad(ad_id: int) -> Optional[Dict]:
    with _conn() as c:
        r = c.execute("SELECT * FROM ads WHERE id=?", (ad_id,)).fetchone()
        return dict(r) if r else None


# -- results + calibration -------------------------------------------------- #
def save_results(project_id: int, rows: List[Dict]) -> None:
    with _conn() as c:
        for r in rows:
            c.execute(
                "INSERT INTO results(project_id,ad_name,metric,metric_name,created) "
                "VALUES(?,?,?,?,?)",
                (project_id, r["name"], r["metric"], r.get("metric_name", "ROAS"), time.time()),
            )


def calibration(project_id: Optional[int] = None) -> Dict:
    """Join stored SSR scores to real results by ad name → correlation."""
    with _conn() as c:
        # GROUP BY name → one pair per ad, so duplicate names (e.g. a concept
        # regenerated in a later round) don't inflate the count.
        q = (
            "SELECT a.name AS name, AVG(a.score) AS ssr, AVG(r.metric) AS real "
            "FROM ads a JOIN results r ON a.name = r.ad_name "
            "WHERE a.score IS NOT NULL"
        )
        params: tuple = ()
        if project_id is not None:
            q += " AND a.project_id=? AND r.project_id=?"
            params = (project_id, project_id)
        q += " GROUP BY a.name"
        rows = [dict(x) for x in c.execute(q, params)]
    pairs = [(r["name"], r["ssr"], r["real"]) for r in rows]
    return {"n": len(pairs), "rho": _spearman([p[1] for p in pairs], [p[2] for p in pairs]),
            "pairs": pairs}


def _spearman(xs: List[float], ys: List[float]) -> Optional[float]:
    n = len(xs)
    if n < 3:
        return None

    def ranks(v: List[float]) -> List[float]:
        order = sorted(range(n), key=lambda i: v[i])
        r = [0.0] * n
        i = 0
        while i < n:
            j = i
            while j + 1 < n and v[order[j + 1]] == v[order[i]]:
                j += 1
            avg = (i + j) / 2.0 + 1.0
            for k in range(i, j + 1):
                r[order[k]] = avg
            i = j + 1
        return r

    rx, ry = ranks(xs), ranks(ys)
    mx, my = sum(rx) / n, sum(ry) / n
    num = sum((rx[i] - mx) * (ry[i] - my) for i in range(n))
    den = (sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5
           * sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5)
    return round(num / den, 2) if den else None
