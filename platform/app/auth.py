"""Auth crypto + cookie helpers for the multi-user Python app.

On a real server (Hetzner) there is no per-request CPU limit, so we use strong
PBKDF2 (200k iterations). Pure stdlib — hashlib / hmac / secrets.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

DEFAULT_ITERATIONS = 200000
SESSION_DAYS = 30


def hash_password(password: str, iterations: int = DEFAULT_ITERATIONS):
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return dk.hex(), salt.hex(), iterations


def verify_password(password: str, salt_hex: str, hash_hex: str, iterations: int) -> bool:
    try:
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(iterations))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(24)


def parse_cookie(cookie_header: str | None, name: str) -> str | None:
    if not cookie_header:
        return None
    for part in cookie_header.split(";"):
        k, _, v = part.strip().partition("=")
        if k == name:
            return v
    return None


def session_cookie(token: str, secure: bool) -> str:
    flags = f"HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_DAYS * 86400}"
    if secure:
        flags += "; Secure"
    return f"session={token}; {flags}"


def clear_cookie(secure: bool) -> str:
    flags = "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    if secure:
        flags += "; Secure"
    return flags
