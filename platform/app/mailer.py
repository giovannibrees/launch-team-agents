"""Tiny SMTP mailer (stdlib). Sends verification / password-reset emails.

If SMTP isn't configured, runs in DEV mode: logs the message to stdout and
signals "not sent" so the app can surface the link in-app for local testing.
Configure with SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM.
"""

from __future__ import annotations

import os
import smtplib
import ssl
from email.message import EmailMessage


def configured() -> bool:
    return bool(os.environ.get("SMTP_HOST"))


def send(to: str, subject: str, body: str) -> bool:
    """Return True if actually sent via SMTP, False if dev-logged or failed."""
    if not configured():
        print(f"[DEV EMAIL] to={to} | {subject}\n{body}\n", flush=True)
        return False
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER")
    pw = os.environ.get("SMTP_PASS")
    sender = os.environ.get("SMTP_FROM") or user or "noreply@adstudio.local"

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        ctx = ssl.create_default_context()
        if port == 465:
            with smtplib.SMTP_SSL(host, port, context=ctx, timeout=15) as s:
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls(context=ctx)
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        return True
    except Exception as exc:  # never let email failure break the request
        print(f"[EMAIL ERROR] {type(exc).__name__}: {exc}", flush=True)
        return False
