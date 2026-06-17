# launchperformance → Tracking & Reporting: Brightside

*Output from `launchperformance`. Recommends and reports only — never changes
campaigns. Reports lead with **blended reality**, then platform-claimed numbers
(`measurement-and-attribution.md`).*

---

## Pre-launch tracking verification

```
TO: launchteam   TYPE: DONE / BLOCKED
- Meta Pixel: PageView, ViewContent, AddToCart, Purchase ✅ confirmed in test mode
- Meta CAPI: ✅ set up, deduplication on
- GA4: ✅ UTMs flowing (source/medium/campaign)
- Google Ads conversion: ❌ NOT set up — Google CANNOT go live until fixed
- TikTok: n/a (channel held)
VERDICT: Meta cleared to launch. Google blocked on conversion tracking.
```

---

## Daily Performance Report — Day 3 (Meta only; learning phase)

### Overall
- Spend: $258 · Backend revenue (Shopify): $372 · **Blended MER: 1.4x**
- Meta-reported ROAS: 1.6x (platform-claimed; over-counts — trust the $372)
- Trend: normal for a new pixel in learning. Not yet judged on ROAS.

### Meta
| Metric | Day 3 | Note |
|---|---|---|
| Spend | $258 | on pace |
| CTR | 1.3% | healthy (Version A leading) |
| CPC | $1.10 | good |
| Purchases | 4 | learning phase |
| CPA | $64 | above target, expected early |
| ROAS (platform) | 1.6x | below 3.0x target — too early to act |

Top ad: `OPPOSITE-ALARM-VIDEO-V1` — 1.7% CTR. Worst: interest ad set C.

### Anomalies
- `META-INTEREST-HOME-C`: $112 spent, **0 purchases**, LP CVR 0.3% — flag.

### Recommendation for launchads
```
OBSERVATION: META-INTEREST-HOME-C — $112 spend over 3 days, 0 purchases, CTR 0.9%,
  LP CVR 0.3% (vs 1.8% account avg).
DIAGNOSIS: Home/interior interest is attracting browsers, not buyers. Wrong intent.
RECOMMENDATION: Pause Ad Set C. Shift its budget to Broad (A) and LAL (D), which
  are at 2.1–2.4x. Re-test home interest later with narrower "recently moved".
EXPECTED OUTCOME: ~$37/day redirected from 0x to ~2.2x ROAS audiences.
PRIORITY: High
```
> launchads needs human approval to action budget changes — routed via launchteam.

### Flags for launchteam
- Google still blocked (no conversion tracking) — $5K of plan idle. Decision
  needed: fix this week or reallocate to Meta?

---

## Weekly Rollup — Week 1

### Headline
- Spend: $1,810 · Backend revenue: $4,050 · **Blended MER: 2.2x**
- Meta-reported ROAS: 2.6x (claimed) — gap to MER is normal attribution overlap
- vs target (3.0x): **behind, but improving daily** — exiting learning phase

### What worked
- Version A ("opposite of a phone alarm") + Broad and LAL 1% audiences.
- CPA fell from $64 (day 3) → $41 (day 7) as the pixel learned.

### What didn't
- Home-interest interest stack (paused). YouTube slow to spend.

### Recommendations for next week
1. Scale Broad + LAL +20%/2 days (respect learning phase).
2. Get Google conversion tracking live or formally reallocate the $5K to Meta.
3. Ship 2 new hooks (fatigue watch: Version A frequency at 2.6).

### Budget status
- Spent $1,810 of $20,000. Pacing slightly under (Google/TikTok idle). On track
  to hit target as efficiency climbs into the seasonal window.
