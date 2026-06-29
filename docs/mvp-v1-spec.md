# MVP v1 — The Creative Copilot (no Meta API)

The concrete first product. It refines [the commercial plan](commercial-platform-plan.md)
with one decisive simplification: **v1 does not touch the Meta API at all.** The
customer uploads inputs, the system ranks and creates, the customer publishes to
Meta *manually*, then uploads the exported results report back in. The loop
closes through a **CSV, not an integration.**

> Why this is the right call: the Meta Marketing API (App Review, OAuth,
> Business Verification, the "manage ads on behalf of others" review) is the
> biggest build and legal/time risk in the whole plan — and it's *pure plumbing*,
> not the product. Cutting it for v1 keeps the two things that actually
> matter — **SSR** and **the Karpathy loop** — and lets you launch in weeks.
> Auto-publish/auto-import becomes a *convenience upgrade* later (B-future), not a
> launch blocker.

---

## 1. The v1 flow

```
INPUT (any one, or mix)                     ENGINE                       OUTPUT
┌──────────────────────────┐                                       ┌──────────────┐
│ A. Upload competitor ads │──┐                                    │ Ranked board:│
│ B. Upload your past ads  │──┼─▶ brand context + persona panel ──▶│ "your best   │
│ C. Website URL + "what   │──┘        │                           │  bets" + the │
│    the business is about"│           ▼                           │  qualitative │
└──────────────────────────┘     create candidate ads              │  WHY each    │
                                       │   (and/or ingest          │  scored how" │
                                       ▼    uploaded examples)      └──────┬───────┘
                                 ┌───────────────┐                         │
                                 │  SSR scores   │◀────────────────────────┘
                                 │  & ranks ALL  │   (generated + examples)
                                 └───────────────┘
                                       │
        ┌──────────────────────────────┘
        ▼
  YOU download winners ─▶ manually upload to Meta ─▶ run them
        │
        ▼
  YOU export the Meta report (CSV) ─▶ upload it back
        │
        ▼
  ┌──────────────────────────────────────────────┐
  │ KARPATHY LOOP: real results + SSR + kill-list │
  │  → next round of top ads to test              │──▶ back to "create candidate ads"
  └──────────────────────────────────────────────┘
```

Everything inside **ENGINE** is software you build. Everything in the
**YOU** lane is the human doing manual Meta work — which is fine, and even
on-brand: it keeps a human on the loop ([Karpathy](../shared/ad-creation-service.md#3--stage--the-karpathy-agent-loop)).

---

## 2. Three input modes, one convergence

The customer can start from any of these — the engine normalizes them into the
same two things: **brand context** (for generation) and a **persona panel** (for
SSR).

| Mode | Customer provides | Engine derives |
|---|---|---|
| **A. Competitor ads** | Upload images/links of ads in their niche | Winning angles, hooks, formats to imitate → generation references |
| **B. Own past ads** | Upload their previous ads (optionally with results) | Their proven angles → reference set + kill list; results seed calibration |
| **C. Website + description** | Store URL + "what we sell, to whom" | Product, offer, ICP → brand context + persona panel from scratch |

Most customers will mix them (their site + a few competitor ads). Mode C alone
must work, because it's the lowest-friction entry — paste a URL, get ads.

---

## 3. SSR does two jobs — and either one is sellable alone

1. **Rank what we generate.** Score every candidate the engine creates; surface
   the top bets. (The full pipeline.)
2. **Rank what you already have.** If the customer uploads examples (Mode B),
   SSR tells them *which of their existing ads is best* — with zero generation.

Job 2 is a standalone hook worth highlighting: **"Which of my 5 ads should I
actually run?"** is a real question every DTC marketer has, and SSR answers it in
minutes for cents. Lead the free tier with it — it demonstrates the magic before
asking anyone to trust AI-generated creative.

---

## 4. Closing the loop without an API — the CSV bridge

This is the one genuinely new mechanic v1 must get right.

### The matching problem
When the customer exports their Meta report, each row is an ad with metrics
(spend, impressions, CTR, CPM, purchases, ROAS, etc.). To learn from it, you must
match each row back to the **SSR score you stored** for that creative.

### The solution: a naming convention you hand the customer
- When the customer downloads a winning creative, the engine assigns it a
  **stable handle** (e.g. `ssr_<conceptid>_<variant>`).
- Instruct the customer to **use that handle as the Meta ad name** (and/or as a
  UTM `utm_content`) when they upload. One sentence in the export step.
- On report re-upload, the parser keys on that handle → joins
  `result → ssr_run` → writes a **calibration pair**. Unmatched rows are flagged
  for manual mapping, not dropped.

### The report parser
- Accept Meta Ads Manager **CSV/XLSX export** (ad-level breakdown).
- Map the canonical columns — *Ad name, Amount spent, Impressions, Reach, CTR,
  CPM, Results/Purchases, Cost per result, ROAS/Purchase value* — tolerant of the
  customer's column choices (Meta exports are user-configured, so map by header
  name with sensible fallbacks; let the user confirm the mapping once and
  remember it).
- Derive **hook rate** if 3-second-video views are present; it's a top creative
  signal ([playbook §4](../shared/ad-creative-playbook.md#4-the-hook-is-80-of-the-battle)).

### The Karpathy step
With real results joined to SSR scores, each cycle:
- **Promote** real winners into the reference set (generation imitates them next).
- **Kill-list** real losers so generation stops re-proposing them.
- **Recalibrate** SSR against observed ROAS → the [calibration flywheel](commercial-platform-plan.md#a6-the-moat--why-this-compounds),
  which works *identically* whether the results arrive by CSV or by API.
- **Generate** the next round of top candidates to test.

> The flywheel doesn't care that the data arrived as a manual upload. You get the
> same `(SSR score → real ROAS)` pairs — just with a human pressing "export" and
> "upload" instead of an API call. For v1, that's a feature, not a compromise.

---

## 5. What you build (smaller than the full plan)

**Dropped from v1** (vs. [commercial plan B3](commercial-platform-plan.md#b3-the-meta-api-reality--plan-around-this-its-the-real-gate)):
Meta OAuth, the Marketing API client, App Review, Business Verification,
auto-publish, auto-import. All deferred.

**Kept / built for v1:**

| Service | v1 scope |
|---|---|
| Web app | Onboarding (3 input modes), candidate board, review/approve, report upload |
| Brand + persona builder | Normalize Mode A/B/C inputs → brand context + 50–100-persona panel |
| Ad-mining (optional) | v1 = **manual upload** of competitor ads. *Easy upgrade:* the **Meta Ad Library API** is free, read-only, and needs **no account connection or review** — bolt it on to auto-suggest references without touching the Marketing API. |
| Model router | Start with **1–2 image models** — Ideogram v3 (text-on-image) + Seedream (volume). Add others later. |
| SSR scorer | [`pymc-labs/semantic-similarity-rating`](https://github.com/pymc-labs/semantic-similarity-rating) + persona reactions + embeddings. Does both jobs (§3). |
| Report ingester | The CSV bridge (§4): parser + handle-matching + calibration writer |
| Learn step | Promote / kill-list / recalibrate / regenerate (§4) |

So v1 is roughly the full architecture **minus the entire Meta API column**. That
column was the hard part; you've removed it.

---

## 6. Data model delta

Same core tables as [commercial plan B4](commercial-platform-plan.md#b4-data-model-the-core-tables),
with two changes:

- `ad_ship` becomes lighter: no Meta IDs, just the **handle** the customer uses
  when publishing manually + status (`exported / reported`).
- Add `result_import` (uploaded CSV → parsed rows → match status) feeding the same
  `result` and `calibration` tables. The flywheel tables are unchanged — design
  them now so the future API path drops straight in.

---

## 7. Phasing, revised

- **Phase 0 — validate SSR.** *Unchanged and even more central now.* One script,
  one niche, ~20 statics, SSR package, your own ad account, a few hundred dollars
  of real test spend. Gate: **does SSR rank real winners correctly?** Build
  nothing else until this passes. (See [commercial plan B5](commercial-platform-plan.md#b5-phased-roadmapwith-a-gono-go-gate-at-each-step).)
- **v1 — this copilot.** Modes A/B/C → generate + SSR → manual publish → CSV
  loop. Gate: **paying DTC customers renew, and their SSR-approved ads beat their
  baseline.**
- **v-next — convenience integration.** Once you have traction, add the Meta APIs
  to turn manual publish + manual export into **one-click** (Ad Library for
  references, Marketing API for publish, Insights for auto-import). Now the App
  Review effort is justified by real revenue, and you submit it from a position of
  usage and strength — exactly the sequencing [B3](commercial-platform-plan.md#b3-the-meta-api-reality--plan-around-this-its-the-real-gate)
  recommends.

---

## 8. The friction to watch

The cost of dropping the API is that **the loop depends on the customer manually
running ads and uploading the report.** If they don't come back with results, the
flywheel never spins for them. De-risk it:

- Make **Job 2** (rank-my-existing-ads, §3) deliver value on day one, *before*
  any results round-trip — so the product is useful even if they never upload a
  report.
- Make export dead simple: a copy-paste naming convention, a one-screen "how to
  export from Meta" guide, drag-and-drop the CSV, auto-mapped columns.
- Nudge the return trip (email reminder a week after they export winners:
  "upload your results, get your next round").

> Self-reported results also carry attribution noise — treat calibration as a
> trend across many ads, not a verdict on any single one.

---

## 9. Bottom line

Cutting Meta from v1 doesn't shrink the vision — it sharpens the launch. You keep
the SSR magic and the learning loop, you drop the one component that needed weeks
of review and a pile of OAuth/compliance code, and you can ship the **"which ads
should I run, and here are better ones"** copilot to DTC brands far sooner. The
API comes back as a one-click upgrade once customers are paying.

Still start with **Phase 0**. The CSV-vs-API decision changes the plumbing; it
doesn't change the fact that the entire company rests on SSR actually predicting
ROAS. Prove that first.
