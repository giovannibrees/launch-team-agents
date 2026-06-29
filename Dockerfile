# Ad Studio (multi-user Python app) — for self-hosting on a server (e.g. Hetzner).
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY platform/ ./platform/

# DB lives on a mounted volume so accounts/data survive restarts.
# COOKIE_SECURE=1 because we run behind an HTTPS reverse proxy (Caddy).
ENV PORT=8000 ADSTUDIO_DB=/data/adstudio.db COOKIE_SECURE=1
EXPOSE 8000
CMD ["python3", "platform/app/server.py"]
