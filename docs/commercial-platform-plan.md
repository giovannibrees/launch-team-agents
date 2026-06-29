# Commercial Platform Plan — SSR-Tested Ad Creation

A phased plan to turn the [ad-creation-service architecture](../shared/ad-creation-service.md)
into a commercial SaaS product, written for a **solo technical founder** going
to market with **subscription pricing**.

It covers both halves in sequence: **Part A — the business** (who, why, pricing,
moat) and **Part B — the build** (architecture, the Meta-API reality, a phased
roadmap with cost and a go/no-go gate at each step).

> The architecture doc says *what the system is*. This says *what to sell, to
> whom, in what order, and what to build first so you don't go broke proving it.*

---

# Part A — The business

## A1. The one thing we sell

> **"Stop paying Meta to find out your ad is bad."**

Every competitor generates ads. The differentiator is the **SSR pre-test**: we
score creative against synthetic buyers *before* it spends, so customers burn
budget only on creative that already cleared a predictive bar. That's the wedge,
the headline, and the moat — not the image model.

## A2. Who Superscale serves, and where we start

Superscale targets **businesses that run their own performance ads without a
dedicated agency** — mobile-app studios, DTC/Shopify brands, and SaaS, from solo
marketing-led founders up to small agencies. Your read ("all businesses without
a marketing agency") is the right *eventual* market.

But "all businesses without an agency" is a **TAM, not a wedge.** A solo founder
who builds for everyone builds for no one. Pick one beachhead, win it, expand.

**Recommended beachhead: DTC / Shopify ecommerce brands doing $10k–$200k/mo on Meta.**

Why this segment first (over the broader SMB/app market):

| Factor | Why DTC wins as the entry point |
|---|---|
| **Structured input** | A Shopify store = product catalog, images, prices, copy — the generator has rich, clean input on day one. No "tell me about your business" cold start. |
| **Clear value math** | ROAS is the whole game. "We saved you $X in dead spend" is directly provable. SSR's value is legible. |
| **Reachable** | One channel (Shopify App Store + DTC Twitter/communities). You can find 100 of them in a week. |
| **Self-serve buying** | They sign up with a card, no procurement. Matches a solo founder's zero-sales-team reality. |
| **Reference data exists** | Meta Ad Library is dense with DTC ads to mine — the "mine winners" stage works out of the box. |

Apps and SaaS are the **Phase 3 expansion** — they need video/UGC and different
reference sources (app-store + TikTok), which is more to build. Win DTC statics
first, then widen to "any business without an agency," which is where Superscale
sits.

> If you disagree and want apps first: it's defensible (higher ACV, Superscale's
> own wedge), but it front-loads the hardest build (video/UGC, avatars,
> ElevenLabs, lip-sync) before you've validated SSR. I'd still start with statics.

## A3. The product the customer experiences

The closed loop ([architecture §1](../shared/ad-creation-service.md#1-the-loop))
becomes a self-serve flow:

1. **Connect** — paste your Shopify URL / connect the store; connect your Meta ad
   account (you, the customer, authorize *your own* account — this matters for
   the API access path, see B3).
2. **Mine** — we pull your niche's long-running ads from the Meta Ad Library and
   your own past winners; cluster into angles.
3. **Generate** — N static variants per angle (copy + image via the model router).
4. **SSR pre-test** — every variant scored against a persona panel built from
   your store's ICP; ranked, with the *qualitative* "why" per persona.
5. **Review & approve** — customer sees a ranked board, picks winners (the
   human-on-the-loop gate; [Karpathy framing](../shared/ad-creation-service.md#3--stage--the-karpathy-agent-loop)).
6. **Ship** — push approved ads to Meta as **PAUSED**, structured for a clean test.
7. **Learn** — read results back; SSR recalibrates; winners join the reference set.

The product *is* steps 4 and 7. Steps 2–3 and 6 are table stakes competitors
already have.

## A4. Pricing — SaaS subscription tiers

Market context (mid-2026): AdCreative.ai ~$39 entry, Creatify ~$19–39, Arcads
~$110 entry, Superscale $49→$99 (integrations) →$199→$399→$799+. Range $14–$300+.

**Design rule: subscription price, credit-metered usage underneath.** Generation
and SSR cost you real API money per run. A flat "unlimited" plan is a bankruptcy
machine. Sell a monthly subscription that *includes* a credit allotment; sell
top-up credits above it. This keeps gross margin positive on every action.

| Tier | Price/mo | Included | Meta integration | SSR | Target |
|---|---|---|---|---|---|
| **Free** | $0 | Small credit grant, watermark, no publish | — | Limited | Trial / acquisition |
| **Starter** | $39 | ~1 brand, base credits | Connect 1 ad account | ✓ | Solo DTC founder |
| **Growth** | $99 | More credits, more variants/run | 1 account, auto-publish | ✓ + recalibration | Scaling brand |
| **Pro** | $249 | High credits, priority models, video add-on | Multi-account | ✓ + autonomy slider | Power user / small agency |
| **Agency** | $499+ | Multi-brand workspaces, seats, API | Many accounts | Full | Agencies (Phase 3) |

Gate the **ad-platform integration at the paid tiers** (Superscale gates it at
$99) — connecting Meta and auto-publishing is the moment of clear value and the
natural paywall. Free/Starter prove the SSR magic; publishing is what they pay
to unlock.

## A5. Unit economics — the discipline that keeps you alive

Per customer action, your variable cost is roughly:

- **Image generation:** ~$0.026 (Seedream) to ~$0.08 (Imagen 4 Ultra) per image.
  Generate cheap, filter hard. Most variants should come from the cheap model and
  die in SSR before a dollar more is spent.
- **SSR run:** `(personas × LLM tokens for a reaction) + (embeddings)`. With 50–100
  personas and a cheap-but-capable model, a full pre-test is cents to low-dollars
  per concept — *far* cheaper than the ad spend it saves. This asymmetry is the
  business.
- **Video/UGC (Phase 3):** dollars-to-tens-of-dollars per clip (avatars + voice +
  render). Price these as a separate add-on or premium credits — never bundle
  into a flat tier.

**The rule:** every plan's included credits must cost you less than ~25–30% of
the plan price at the *cheap* model mix, leaving room for support, infra, and
the customers who max out. Track gross margin per tier weekly from day one.

## A6. The moat — why this compounds

Anyone can wire up GPT + an image model in a weekend. Three things get harder to
copy the longer you run:

1. **SSR calibration data.** Every shipped ad gives you `(SSR score → real ROAS)`
   pairs. Over thousands of ads you learn how predictive SSR is *per niche*, and
   tune it. A competitor starting today has zero calibration. This is the flywheel.
2. **Per-customer reference & kill lists.** Their own winners and proven-losers
   accumulate in your system. Switching cost grows with every cycle.
3. **The verified-creative dataset.** A growing corpus of `(ad, persona reactions,
   real performance)` is a genuinely defensible asset — for better generation,
   better SSR, and eventually a "predict performance" API others would pay for.

Lead with SSR in all positioning. "AI generates ads" is commodity; "AI tells you
which ads will work *before you spend*, and gets more accurate the more you run"
is the durable story.

## A7. Competitive map

| Player | What they do | Where you differ |
|---|---|---|
| **Superscale** | Full agentic loop, mine→generate→launch, strong video/UGC, $5M funded | They optimize *post-spend*; you filter *pre-spend* with validated SSR. Narrower, sharper claim. |
| **AdCreative.ai** | High-volume static generation + a "performance score" | Their score is a heuristic; SSR is paper-validated synthetic purchase intent with qualitative why. |
| **Creatify / Arcads** | UGC video generation | You start with statics + the SSR filter; video is a later add-on, not the pitch. |
| **Agencies** | Human-made creative | You're the tool for the businesses *without* one — your whole market. |

Don't out-feature Superscale as a solo founder. Out-*focus* them: one segment,
one killer mechanism, provably cheaper dead spend.

---

# Part B — The build

## B1. Architecture (services view)

Build behind clean interfaces so every model slot is swappable
([architecture §4](../shared/ad-creation-service.md#4-the-tool-stack-by-stage)).

```
┌────────────────────────────────────────────────────────────┐
│  Web app (Next.js)  — onboarding, ad board, review/approve  │
└───────────────┬────────────────────────────────────────────┘
                │  (API / jobs)
┌───────────────▼────────────────────────────────────────────┐
│  Orchestrator (the Launch Team agents on a job queue)       │
├──────────┬───────────┬───────────┬───────────┬─────────────┤
│ Ad-mining│ Model     │ SSR       │ Meta API  │ Performance │
│ service  │ router    │ scorer    │ client    │ reader      │
│ (Ad Lib) │ (img/vid/ │ (pymc SSR │ (publish  │ (Insights)  │
│          │  copy)    │ + personas)│  PAUSED)  │             │
└──────────┴───────────┴───────────┴───────────┴─────────────┘
        │           │           │           │           │
   Postgres (state) · Object storage (assets) · Vector store (embeds/refs)
```

The **three things to actually build** (everything else is glue or an existing
agent): the **model router**, the **SSR scorer**, the **Meta API client**.

## B2. Stack — buy, don't build (solo founder bias)

| Concern | Pick | Why |
|---|---|---|
| Web/app | **Next.js + Vercel** | One language end-to-end; ship fast solo. |
| Auth & DB | **Supabase** (Postgres + auth + storage) | Auth, DB, object storage, vectors in one managed box. |
| Background jobs | **Inngest / Trigger.dev** or a queue | The loop is async (generation, SSR, Meta calls). Don't hand-roll. |
| Billing | **Stripe** (+ a metering layer for credits) | Subscriptions + usage credits out of the box. |
| LLM | **Claude / GPT** via one routing lib | Copy, persona reactions, angle clustering. |
| Images | **router**: Seedream (volume) · Ideogram v3 (text) · Nano Banana Pro (edit/consistency) · Imagen 4 Ultra (hero) | One job → one model; see architecture §4. |
| Embeddings | any strong embedding model | The similarity step in SSR. |
| SSR math | **[`pymc-labs/semantic-similarity-rating`](https://github.com/pymc-labs/semantic-similarity-rating)** | Don't reinvent the validated algorithm. |
| Ad mining | **Meta Ad Library API** (official, free) | Compliant source; avoid scraping where an API exists. |

Spin nothing up on raw VMs you have to babysit. Solo founder time is the scarce
resource; spend it on the router, SSR, and the Meta integration — the parts that
*are* the product.

## B3. The Meta API reality — plan around this, it's the real gate

> **v1 sidesteps this entirely.** The shipped first product
> ([mvp-v1-spec.md](mvp-v1-spec.md)) uses **no Meta API at all** — manual publish,
> manual CSV report upload. The section below is the *v-next* path for when you
> add one-click publish/import after traction. Read it as "later," not "first."

This is the part that ambushes people. Meta Marketing API has three tiers:

- **Development Access** — default for a new app, heavily restricted; fine for
  building against *your own* test account.
- **Standard Access** (renamed "Marketing API Access Tier" as of May 2026) —
  ~150× more quota; approval required but attainable.
- **Advanced/Full Access** — enterprise quota, but requires **App Review** with
  detailed use-case docs, and apps that **manage ads on behalf of third parties**
  go through the heavier review. It takes **weeks** and historically needs ~500
  Marketing API calls in the prior 15 days to even qualify.

Rate limits are **spend-based** (quota scales with the connected account's ad
spend), so a single real customer account carries decent headroom.

**The solo-founder path that avoids the early-stage trap:**

1. Build and demo entirely on **your own** ad account (Development Access). No
   review needed to prove the loop.
2. Launch with **"connect your own ad account"** — each customer OAuths *their
   own* Meta account and you act with their token. This is the lightest-review
   path and lets you onboard real users on Standard Access while you accrue the
   call volume and track record.
3. **Then** submit for Advanced Access / Business Verification once you have the
   usage to qualify and a few paying customers to justify the review effort.

Do **not** architect for "we hold a master token and manage everyone's ads"
before you've cleared review — that's the path that gets projects stuck for weeks.
Sequence the access tier to the phase.

## B4. Data model (the core tables)

```
brand            (customer's store: catalog ref, ICP, Meta account link)
persona          (synthetic buyer; belongs to a brand's panel)
reference_ad     (mined competitor/own winner; angle cluster; source)
concept          (an angle → brief)
variant          (concept → copy + asset(s); which models produced it)
ssr_run          (variant → persona reactions, PMF, aggregate score, qual:why)
ad_ship          (variant → Meta ids, PAUSED→live, test design)
result           (ad_ship → ROAS/CPA/hook-rate/freq over time)
calibration      (ssr_score ↔ result pairs, per niche — the flywheel asset)
```

`ssr_run.score → result` pairs feeding `calibration` is the table that becomes
the moat (A6). Design it in from day one even if you don't use it until Phase 2.

## B5. Phased roadmap — with a go/no-go gate at each step

Each phase ends in a **gate**: a measurable result that must hold before you
spend on the next phase. This is how a solo founder avoids building the whole
thing on faith.

### Phase 0 — Validate SSR predictivity (weeks, ~no infra)
- **Build:** a script, not a product. Mine one niche, generate ~20 statics with
  *one* image model, run the open-source SSR package against a 50-persona panel.
- **Do:** ship the top 3 + bottom 3 to Meta *manually* on your own account, small
  budget, clean test.
- **Gate:** **does SSR's ranking correlate with real ROAS?** If SSR can't tell
  winners from losers better than chance, *nothing downstream matters* — fix the
  SSR setup (personas, anchors, model) before building any platform. This is the
  single most important experiment in the whole plan.

### Phase 1 — Self-serve MVP, statics only (DTC beachhead)
- **Build:** Next.js + Supabase + Stripe; Shopify connect; ad-mining service;
  model router (start with **one or two** image models — Ideogram v3 for
  text-on-image + Seedream for volume); SSR scorer as a service; the ranked
  review board. **Meta = connect-your-own-account, publish PAUSED.**
- **Pricing:** Free + Starter ($39) + Growth ($99, integration unlocked).
- **Gate:** **do 10–20 paying DTC customers renew month 2**, and does their *real*
  spend on SSR-approved ads beat their baseline? Retention + provable ROAS lift.

### Phase 2 — Close the loop + autonomy slider
- **Build:** performance reader (Insights API); the **learn** stage — winners →
  reference set, losers → kill list, **SSR recalibration** per niche; begin the
  `calibration` flywheel; first rung of the autonomy slider (auto-pause clear
  losers, suggest auto-promote above a confidence bar — human still approves).
- **Submit for Meta Advanced Access** now that you have call volume + customers.
- **Gate:** **does recalibrated SSR get measurably more predictive** over cycles,
  and does the loop reduce a customer's cost-per-winning-ad vs. Phase 1?

### Phase 3 — Expand: video/UGC + new segments + agency tier
- **Build:** video/UGC slot (avatars + ElevenLabs + lip-sync + assembly); the
  full image router (add Nano Banana Pro for editing winners, Imagen 4 Ultra for
  hero); multi-brand workspaces + seats (Agency tier); expand reference mining to
  TikTok/app-store for app & SaaS customers.
- **Gate:** video unit economics positive as an add-on; agency multi-account
  retention. Only now are you competing with Superscale on surface area — from a
  validated, differentiated base.

## B6. Cost & runway (rough, solo founder)

- **Pre-revenue infra:** Vercel + Supabase + Stripe + queue ≈ low tens of $/mo.
  Trivial. Your cost is *time*, not infra.
- **Variable API cost:** dominated by generation + SSR per active user (A5). Keep
  it under control with the cheap-model-then-filter discipline and credit caps.
- **The real spend:** your own **Phase 0 ad budget** to validate SSR (a few
  hundred to low thousands of $ of real Meta spend to get a clean signal). Budget
  this deliberately — it's R&D, and it's the cheapest possible way to de-risk the
  entire company.
- **Don't** pre-buy GPUs, reserved capacity, or video infra before Phase 3.

## B7. Risks & how to de-risk

| Risk | De-risk |
|---|---|
| **SSR doesn't actually predict ROAS** | Phase 0 gate kills the company cheaply if so — before you've built a platform. Highest-priority experiment. |
| **Meta API review blocks launch** | Connect-your-own-account path (B3) launches on Standard Access; defer Advanced review to Phase 2. |
| **Variable costs eat margin** | Credit-metered subscriptions (A4/A5); cheap-model-then-filter; weekly gross-margin tracking per tier. |
| **Commoditized generation** | Don't compete on generation; compete on SSR + the calibration flywheel (A6). |
| **Big player ships SSR** | Speed + niche calibration data. Own DTC deeply before widening. |
| **Platform/data terms** | Use official Meta Ad Library + Marketing APIs; honor platform terms; mind ad-account data privacy & retention. Get this right early — it's existential for an ads tool. |

## B8. The first two weeks

1. Run **Phase 0**. Nothing else. One script, one niche, one image model, the SSR
   package, your own ad account, a few hundred dollars of test spend.
2. If SSR ranks your real winners correctly → build Phase 1.
3. If it doesn't → fix personas/anchors/model and re-run until it does, *or* walk
   away having spent days and hundreds of dollars instead of months and your
   savings.

Everything in Part A is real only if the Phase 0 gate passes. Start there.

---

## Sources

- Superscale pricing & ICP — [superscale.ai/pricing](https://superscale.ai/pricing) ·
  [TFN: Superscale raises $5M](https://techfundingnews.com/superscale-raises-5m-for-ai-marketing-platform/)
- Competitor pricing — [AdCreative.ai](https://www.capterra.com/p/253052/AdCreativeai/pricing/),
  [Creatify](https://www.trylapis.com/resources/ai-ad-generator-pricing-comparison),
  [Arcads](https://www.eesel.ai/blog/arcads-ai-pricing)
- Meta Marketing API access — [Meta: Ads Management Standard Access update](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/) ·
  [rate limiting](https://developers.facebook.com/docs/marketing-api/overview/rate-limiting/)
- SSR & model stack — see [`ad-creation-service.md`](../shared/ad-creation-service.md) for primary sources.

> Prices, tiers, competitor positioning, and Meta API thresholds are accurate to
> **mid-2026** and will drift. The sequence — *validate SSR → self-serve statics →
> close the loop → expand* — is the durable part.
