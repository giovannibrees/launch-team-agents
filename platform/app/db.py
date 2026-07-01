"""SQLite persistence for Ad Studio — multi-user, every row scoped by user_id.

DB path is configurable via ADSTUDIO_DB (point it at a mounted volume in Docker
so data survives container restarts). Defaults to a file next to this module.
"""

from __future__ import annotations

import hashlib
import os
import re
import sqlite3
import time
from typing import Dict, List, Optional

import auth

DB_PATH = os.environ.get("ADSTUDIO_DB") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "adstudio.db")
SECRET_KEYS = {"anthropic_api_key", "voyage_api_key", "openai_api_key"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init() -> None:
    with _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE, pw_hash TEXT, pw_salt TEXT, pw_iter INTEGER,
                verified INTEGER DEFAULT 0, created REAL);
            CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER, expires REAL);
            CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id INTEGER, kind TEXT, expires REAL);
            CREATE TABLE IF NOT EXISTS settings (user_id INTEGER, key TEXT, value TEXT, PRIMARY KEY(user_id, key));
            CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
                hash TEXT, name TEXT, url TEXT, description TEXT, target_customer TEXT, created REAL,
                UNIQUE(user_id, hash));
            CREATE TABLE IF NOT EXISTS ads (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, project_id INTEGER,
                name TEXT, angle TEXT, awareness_stage TEXT, headline TEXT, primary_text TEXT, description TEXT,
                score REAL, image TEXT, source TEXT, created REAL);
            CREATE TABLE IF NOT EXISTS results (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, project_id INTEGER,
                ad_name TEXT, metric REAL, metric_name TEXT, created REAL);
            """
        )
        # Migration: add `verified` to an already-existing users table.
        try:
            c.execute("ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass


# --- users + sessions ------------------------------------------------------ #
def create_user(email: str, password: str, iterations: int = auth.DEFAULT_ITERATIONS) -> Dict:
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("Enter a valid email.")
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    h, salt, it = auth.hash_password(password, iterations)
    with _conn() as c:
        if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
            raise ValueError("That email is already registered.")
        cur = c.execute("INSERT INTO users(email,pw_hash,pw_salt,pw_iter,verified,created) VALUES(?,?,?,?,0,?)",
                        (email, h, salt, it, time.time()))
        return {"id": cur.lastrowid, "email": email, "verified": False}


def authenticate(email: str, password: str) -> Optional[Dict]:
    with _conn() as c:
        u = c.execute("SELECT * FROM users WHERE email=?", ((email or "").strip().lower(),)).fetchone()
    if not u:
        return None
    return {"id": u["id"], "email": u["email"]} if auth.verify_password(
        password, u["pw_salt"], u["pw_hash"], u["pw_iter"]) else None


def create_session(user_id: int) -> str:
    token = auth.new_token()
    with _conn() as c:
        c.execute("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
                  (token, user_id, time.time() + auth.SESSION_DAYS * 86400))
    return token


def user_from_token(token: Optional[str]) -> Optional[Dict]:
    if not token:
        return None
    with _conn() as c:
        s = c.execute("SELECT * FROM sessions WHERE token=?", (token,)).fetchone()
        if not s or s["expires"] < time.time():
            return None
        u = c.execute("SELECT id,email,verified FROM users WHERE id=?", (s["user_id"],)).fetchone()
    return {"id": u["id"], "email": u["email"], "verified": bool(u["verified"])} if u else None


def destroy_session(token: Optional[str]) -> None:
    if token:
        with _conn() as c:
            c.execute("DELETE FROM sessions WHERE token=?", (token,))


def destroy_user_sessions(user_id: int) -> None:
    with _conn() as c:
        c.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))


def get_user_by_email(email: str) -> Optional[Dict]:
    with _conn() as c:
        u = c.execute("SELECT id,email FROM users WHERE email=?", ((email or "").strip().lower(),)).fetchone()
    return {"id": u["id"], "email": u["email"]} if u else None


# --- email verification + password reset tokens ---------------------------- #
def create_token(user_id: int, kind: str, ttl_seconds: int) -> str:
    t = auth.new_token()
    with _conn() as c:
        c.execute("INSERT INTO tokens(token,user_id,kind,expires) VALUES(?,?,?,?)",
                  (t, user_id, kind, time.time() + ttl_seconds))
    return t


def consume_token(token: Optional[str], kind: str) -> Optional[int]:
    """Validate a single-use token; delete it and return its user_id, or None."""
    if not token:
        return None
    with _conn() as c:
        row = c.execute("SELECT * FROM tokens WHERE token=? AND kind=?", (token, kind)).fetchone()
        if row:
            c.execute("DELETE FROM tokens WHERE token=?", (token,))
        if not row or row["expires"] < time.time():
            return None
        return row["user_id"]


def mark_verified(user_id: int) -> None:
    with _conn() as c:
        c.execute("UPDATE users SET verified=1 WHERE id=?", (user_id,))


def set_password(user_id: int, password: str, iterations: int = auth.DEFAULT_ITERATIONS) -> None:
    if not password or len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    h, salt, it = auth.hash_password(password, iterations)
    with _conn() as c:
        c.execute("UPDATE users SET pw_hash=?,pw_salt=?,pw_iter=? WHERE id=?", (h, salt, it, user_id))


# --- per-user settings ----------------------------------------------------- #
def get_settings(user_id: int) -> Dict[str, str]:
    with _conn() as c:
        return {r["key"]: r["value"] for r in c.execute("SELECT key,value FROM settings WHERE user_id=?", (user_id,))}


def masked_settings(user_id: int) -> Dict[str, str]:
    s = dict(get_settings(user_id))
    for k in SECRET_KEYS:
        if s.get(k):
            s[k] = "********"
    return s


def save_settings(user_id: int, updates: Dict[str, str]) -> None:
    with _conn() as c:
        for k, v in updates.items():
            if v == "********":
                continue
            c.execute("INSERT INTO settings(user_id,key,value) VALUES(?,?,?) "
                      "ON CONFLICT(user_id,key) DO UPDATE SET value=excluded.value", (user_id, k, v))


# --- projects + ads + results ---------------------------------------------- #
def upsert_project(user_id: int, brand: Dict) -> int:
    h = hashlib.sha256((brand.get("description", "") or "").encode()).hexdigest()[:16]
    with _conn() as c:
        row = c.execute("SELECT id FROM projects WHERE user_id=? AND hash=?", (user_id, h)).fetchone()
        if row:
            return row["id"]
        cur = c.execute("INSERT INTO projects(user_id,hash,name,url,description,target_customer,created) "
                        "VALUES(?,?,?,?,?,?,?)", (user_id, h, brand.get("name", ""), brand.get("url", ""),
                        brand.get("description", ""), brand.get("target_customer", ""), time.time()))
        return cur.lastrowid


def save_ads(user_id: int, project_id: int, ads: List[Dict], source: str) -> List[int]:
    ids = []
    with _conn() as c:
        for a in ads:
            cur = c.execute("INSERT INTO ads(user_id,project_id,name,angle,awareness_stage,headline,primary_text,"
                            "description,score,image,source,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                            (user_id, project_id, a.get("name", ""), a.get("angle", ""), a.get("awareness_stage", ""),
                             a.get("headline", ""), a.get("primary_text", ""), a.get("description", ""),
                             a.get("score"), None, source, time.time()))
            ids.append(cur.lastrowid)
    return ids


def set_ad_image(user_id: int, ad_id: int, data_url: str) -> None:
    with _conn() as c:
        c.execute("UPDATE ads SET image=? WHERE id=? AND user_id=?", (data_url, ad_id, user_id))


def save_results(user_id: int, project_id: int, rows: List[Dict]) -> None:
    with _conn() as c:
        for r in rows:
            c.execute("INSERT INTO results(user_id,project_id,ad_name,metric,metric_name,created) VALUES(?,?,?,?,?,?)",
                      (user_id, project_id, r["name"], r["metric"], r.get("metric_name", "ROAS"), time.time()))


def calibration(user_id: int, project_id: Optional[int] = None) -> Dict:
    with _conn() as c:
        q = ("SELECT a.name AS name, AVG(a.score) AS ssr, AVG(r.metric) AS real FROM ads a "
             "JOIN results r ON a.name=r.ad_name AND a.user_id=r.user_id "
             "WHERE a.score IS NOT NULL AND a.user_id=?")
        params: tuple = (user_id,)
        if project_id is not None:
            q += " AND a.project_id=? AND r.project_id=?"
            params = (user_id, project_id, project_id)
        q += " GROUP BY a.name"
        rows = [dict(x) for x in c.execute(q, params)]
    pairs = [(r["name"], r["ssr"], r["real"]) for r in rows]
    return {"n": len(pairs), "rho": _spearman([p[1] for p in pairs], [p[2] for p in pairs]), "pairs": pairs}


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
    den = (sum((rx[i] - mx) ** 2 for i in range(n)) ** 0.5 * sum((ry[i] - my) ** 2 for i in range(n)) ** 0.5)
    return round(num / den, 2) if den else None
