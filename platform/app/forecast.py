"""Forecast ad time-series (spend / ROAS / CPA / impressions ...).

Upload a dated metrics export from Meta / Google / TikTok and project it forward.

Two backends behind one interface:
  • timesfm  — Google's TimesFM foundation model (zero-shot). Heavy (torch + a
    ~500M checkpoint); used only when installed AND ENABLE_TIMESFM=1.
  • baseline — a pure-Python trend + weekly-seasonality forecaster with an
    uncertainty band. Always available; the default.

The CSV parser is tolerant of how the ad platforms export day-level data.
"""

from __future__ import annotations

import csv
import io
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

DATE_HINTS = ("date", "day", "reporting", "week", "month")
VALUE_HINTS = ("roas", "spend", "cost", "cpa", "cpc", "cpm", "revenue", "value",
               "result", "purchase", "impression", "click", "conversion", "ctr", "amount")
_DATE_FORMATS = ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y",
                 "%d-%m-%Y", "%Y-%m-%d %H:%M:%S", "%b %d, %Y", "%d %b %Y")


def _parse_date(s: str) -> Optional[datetime]:
    s = (s or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _num(s: str) -> Optional[float]:
    try:
        return float((s or "").replace(",", "").replace("$", "").replace("%", "").strip())
    except ValueError:
        return None


def parse_series(text: str, value_col: Optional[str] = None, group_col: Optional[str] = None):
    """Return ({series_name: {"dates":[datetime], "values":[float]}}, detected_info)."""
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return {}, {}
    headers = reader.fieldnames
    low = {h: h.lower().strip() for h in headers}

    date_col = next((h for h in headers if any(k in low[h] for k in DATE_HINTS)), None)
    if value_col and value_col not in headers:
        value_col = next((h for h in headers if value_col.lower() in low[h]), None)
    if not value_col:
        value_col = next((h for h in headers if h != date_col and any(k in low[h] for k in VALUE_HINTS)), None)
    if group_col and group_col not in headers:
        group_col = next((h for h in headers if group_col.lower() in low[h]), None)
    if not date_col or not value_col:
        return {}, {"date_col": date_col, "value_col": value_col}

    # group -> date -> [values]  (average duplicate rows per date)
    grouped: Dict[str, Dict[datetime, List[float]]] = {}
    for r in reader:
        d = _parse_date(r.get(date_col, ""))
        v = _num(r.get(value_col, ""))
        if d is None or v is None:
            continue
        name = (r.get(group_col, "").strip() if group_col else "All") or "All"
        grouped.setdefault(name, {}).setdefault(d, []).append(v)

    series = {}
    for name, by_date in grouped.items():
        dates = sorted(by_date)
        if len(dates) >= 5:
            series[name] = {"dates": dates, "values": [sum(by_date[d]) / len(by_date[d]) for d in dates]}
    return series, {"date_col": date_col, "value_col": value_col, "group_col": group_col}


# --------------------------------------------------------------------------- #
# Baseline forecaster (pure Python)
# --------------------------------------------------------------------------- #
def _linfit(ys: List[float]) -> Tuple[float, float]:
    n = len(ys)
    xs = list(range(n))
    mx, my = sum(xs) / n, sum(ys) / n
    sxx = sum((x - mx) ** 2 for x in xs) or 1.0
    sxy = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    slope = sxy / sxx
    return slope, my - slope * mx


def baseline_forecast(values: List[float], horizon: int, weekdays: Optional[List[int]] = None):
    n = len(values)
    slope, intercept = _linfit(values)
    trend = [intercept + slope * t for t in range(n)]
    resid = [values[i] - trend[i] for i in range(n)]

    use_season = n >= 14
    season: Dict[int, float] = {}
    if use_season:
        keyf = (lambda t: weekdays[t]) if weekdays else (lambda t: t % 7)
        buckets: Dict[int, List[float]] = {}
        for t in range(n):
            buckets.setdefault(keyf(t), []).append(resid[t])
        season = {k: sum(v) / len(v) for k, v in buckets.items()}
        mean_s = sum(season.values()) / len(season)
        season = {k: v - mean_s for k, v in season.items()}

    def seas_key_future(h: int) -> int:
        return (weekdays[-1] + h) % 7 if weekdays else (n - 1 + h) % 7

    fitted = [trend[i] + (season.get(weekdays[i] if weekdays else i % 7, 0.0) if use_season else 0.0) for i in range(n)]
    sres = [values[i] - fitted[i] for i in range(n)]
    sd = (sum(e * e for e in sres) / max(1, n - 2)) ** 0.5
    nonneg = min(values) >= 0

    yhat, lo, hi = [], [], []
    for h in range(1, horizon + 1):
        t = n - 1 + h
        s = season.get(seas_key_future(h), 0.0) if use_season else 0.0
        y = intercept + slope * t + s
        band = 1.28 * sd * (1 + h / n) ** 0.5  # widen with horizon
        if nonneg:
            y = max(0.0, y)
        yhat.append(y)
        lo.append(max(0.0, y - band) if nonneg else y - band)
        hi.append(y + band)
    return yhat, lo, hi


# --------------------------------------------------------------------------- #
# TimesFM backend (optional)
# --------------------------------------------------------------------------- #
_TFM = None


def _load_timesfm():
    global _TFM
    if _TFM is not None:
        return _TFM
    import timesfm  # heavy; only imported when enabled
    repo = os.environ.get("TIMESFM_REPO", "google/timesfm-2.0-500m-pytorch")
    hp = timesfm.TimesFmHparams(backend=os.environ.get("TIMESFM_BACKEND", "cpu"),
                                horizon_len=128, context_len=512)
    _TFM = timesfm.TimesFm(hparams=hp, checkpoint=timesfm.TimesFmCheckpoint(huggingface_repo_id=repo))
    return _TFM


def timesfm_forecast(values: List[float], horizon: int):
    import numpy as np

    tfm = _load_timesfm()
    point, quantiles = tfm.forecast([np.asarray(values, dtype=float)], freq=[0])
    yhat = [float(x) for x in point[0][:horizon]]
    lo = hi = None
    try:  # quantiles: [series, horizon, q]; use ~10th and ~90th
        q = quantiles[0]
        lo = [float(x) for x in q[:horizon, 1]]
        hi = [float(x) for x in q[:horizon, -2]]
    except Exception:
        pass
    return yhat, lo, hi


def forecast_series(values: List[float], horizon: int, weekdays: Optional[List[int]] = None):
    """Pick TimesFM if enabled+installed, else baseline. Never raises — falls back."""
    if os.environ.get("ENABLE_TIMESFM") == "1":
        try:
            yhat, lo, hi = timesfm_forecast(values, horizon)
            if lo is None or hi is None:  # borrow the baseline band if TimesFM gave no quantiles
                _, lo, hi = baseline_forecast(values, horizon, weekdays)
            return yhat, lo, hi, "timesfm"
        except Exception:
            pass
    yhat, lo, hi = baseline_forecast(values, horizon, weekdays)
    return yhat, lo, hi, "baseline"
