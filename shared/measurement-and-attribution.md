# Measurement & Attribution

Platform-reported ROAS lies — not maliciously, but structurally. Every platform
claims credit for the same sale, attribution windows overlap, and iOS privacy
changes broke deterministic tracking. `launchperformance` must report numbers
that reflect **real business outcomes**, not the sum of three dashboards each
taking full credit.

This is the measurement backbone for `launchperformance` (reporting) and
`launchads` (decisions). Use it alongside `performance-benchmarks.md`.

---

## The trust hierarchy

When numbers disagree, trust them in this order:

1. **Backend truth** — actual orders/revenue from Shopify/Stripe/your database.
   This is what hit the bank. Everything else is an estimate.
2. **Blended efficiency (MER)** — total revenue ÷ total ad spend, across all
   channels. Hard to game, reflects reality.
3. **Platform-reported ROAS/conversions** — useful for *relative* optimization
   within a platform, not for truth. Always over-counts.

If Meta says 4.0x, Google says 3.0x, TikTok says 2.5x, but blended MER is 1.8x —
**believe 1.8x.** The platforms are triple-counting.

---

## Key metrics beyond platform ROAS

| Metric | Definition | Why it matters |
|---|---|---|
| **MER** (blended ROAS) | Total revenue ÷ total ad spend | The honest top-line efficiency number |
| **aMER** (marketing efficiency) | Total revenue ÷ *all* marketing cost | Includes agency/tools/creative |
| **nCAC** | Ad spend ÷ **new** customers | Are you acquiring, or paying for repeat buyers? |
| **CAC : LTV** | Acquisition cost vs lifetime value | The only ratio that says if growth is sustainable |
| **Payback period** | Days/orders to recover CAC | Cash-flow reality, esp. for subscription |
| **Contribution margin after ad spend** | Revenue − COGS − ad spend | What's actually left to keep the lights on |

**Break-even ROAS** = 1 ÷ gross margin. (65% margin → 1.54x break-even.) Every
ROAS floor in `performance-benchmarks.md` should sit above this, not below.

---

## Attribution: triangulate, don't trust one source

- **Platform attribution over-claims.** A 7-day-click + 1-day-view window means
  a user who saw a Meta ad, searched on Google, and bought gets counted by both.
- **Triangulate** with three lenses:
  1. Platform dashboards (directional, for in-platform optimization).
  2. **Blended MER** (the reality check).
  3. **Post-purchase survey** ("How did you hear about us?") — cheap, surprisingly
     useful for channels that under-report (TikTok, YouTube, podcasts).
- Watch the **blended trend**, not the daily platform wiggle. Day-to-day platform
  numbers are noisy; weekly blended MER is signal.

---

## Incrementality: did the ad *cause* the sale?

The hardest, most important question. A retargeting ad that "converts" people who
would have bought anyway has low incrementality even at high reported ROAS.

Ways to actually measure it (in rough order of rigor vs effort):

- **Geo holdout / matched-market test** — turn a channel off in some regions,
  on in others; compare. The gold standard for big spend.
- **Conversion lift / ghost-ads tests** — platform-run randomized holdout (Meta
  Lift, Google). Ask your rep; needs scale.
- **On/off (blackout) test** — pause a channel for 1–2 weeks; watch blended
  revenue. Crude but cheap and revealing for branded search and retargeting.
- **Public-holdout for retargeting** — hold out a slice of the retargeting
  audience and compare conversion rates.

Rule of thumb: if pausing a channel doesn't dent blended revenue, its reported
ROAS is mostly **claimed**, not **created**.

---

## Server-side tracking (recover the data iOS broke)

Browser pixels miss 20–40%+ of conversions post-ATT. Set up server-side:

- **Meta Conversions API (CAPI)** — with event deduplication against the pixel.
- **Google Enhanced Conversions** — hashed first-party data to recover matches.
- **TikTok Events API** — server-side equivalent.

This isn't optional for a serious launch — it directly improves both *reporting
accuracy* and *the algorithm's ability to optimize*. See
`platform-access-guide.md` for setup.

---

## Data hygiene (so the numbers mean anything)

- **UTM governance** — every ad URL tagged consistently
  (`utm_source/medium/campaign/content`), matching the naming convention. One
  sloppy UTM and a channel disappears from GA4.
- **One source of truth for revenue** — reconcile dashboards to the backend
  weekly. If GA4 and Shopify disagree by >10%, fix tracking before trusting
  reports.
- **Define "conversion" once** — same event, same value, same window across
  platforms, or comparisons are meaningless.

---

## What `launchperformance` should actually report

Lead with reality, then the detail:

- **Blended MER** and **backend revenue** first — the headline.
- Platform-reported numbers **second**, labelled as platform-claimed and used for
  in-platform optimization only.
- A **new-customer** view (nCAC), not just blended, when the goal is acquisition.
- Flag when platform-claimed ROAS and blended MER **diverge** — that gap is a
  measurement problem to investigate, not a number to celebrate.
