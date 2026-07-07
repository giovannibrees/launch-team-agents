# Ad Creation Service — Architecture & Tool Stack

A blueprint for turning the Launch Team agents into a **closed-loop ad-creation
service**: mine what already works, generate new creative, *pre-test it against
synthetic buyers before spending a cent*, ship the survivors to Meta, learn from
real results, and loop. This is the system Superscale-style products are built
on — written out so you can assemble it from best-of-breed tools instead of
buying one black box.

> The productized implementation of this architecture lives in
> [`legendary-ad-tool`](https://github.com/giovannibrees/legendary-ad-tool) (proprietary).
>
> Companion to [`ad-creative-playbook.md`](ad-creative-playbook.md) (the *why* of
> good ads) and [`performance-benchmarks.md`](performance-benchmarks.md) (the
> *whether*). This file is the *how* — the pipeline and the tooling.

---

## 1. The loop

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  ① MINE          ② GENERATE        ③ PRE-TEST (SSR)    ④ SHIP        │
│  reference ads → new creative   → synthetic-buyer    → upload to    │
│  (competitors,    (copy +          purchase-intent     Meta as       │
│   own winners)    image + video)   scoring             PAUSED        │
│       ▲                                  │ kill ≥80%       │          │
│       │                                  ▼                 ▼          │
│  ⑥ LEARN  ◄──────────  ⑤ REVIEW  ◄────────────────  real spend +     │
│  (Karpathy loop:        results                       impressions     │
│   feed winners +        (ROAS, hook                                   │
│   losers back in)       rate, CPA)                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

The two non-obvious moves — the ones that make this better than "AI makes a
thousand ads" — are **stage ③ (SSR pre-testing)** and **stage ⑥ (the Karpathy
agent loop)**. They are why the system gets *cheaper and smarter* over time
instead of just *louder*.

| Stage | What happens | Owning agent |
|---|---|---|
| ① Mine | Pull top/long-running ads in the niche + your own historical winners; cluster into angles | `launchmarketing` |
| ② Generate | Produce copy, statics, and video/UGC variants from the winning angles | `launchcreative` |
| ③ Pre-test | Score each variant's purchase intent against synthetic personas (SSR); cut the bottom before spend | `launchmarketing` + `launchperformance` |
| ④ Ship | Push survivors to Meta as **PAUSED** ad sets, structured for clean testing | `launchads` |
| ⑤ Review | Read back real performance (ROAS, hook rate, CPA, frequency) | `launchperformance` |
| ⑥ Learn | Feed winners/losers back into ① and ② as new references and prompt context | `launchteam` orchestrates |

---

## 2. Stage ③ — SSR, the pre-spend filter

**Semantic Similarity Rating (SSR)** is the method from PyMC Labs'
2025 paper *"LLMs Reproduce Human Purchase Intent via Semantic Similarity
Elicitation of Likert Ratings"* ([arXiv:2510.08338](https://arxiv.org/abs/2510.08338),
[code](https://github.com/pymc-labs/semantic-similarity-rating)). It lets you
ask an AI focus group *"would you buy this?"* and get answers that track real
humans — validated to **~90% of human test–retest reliability** across 57
product surveys (9,300 real responses).

### Why not just ask the model for a 1–5 score?

Because LLMs give garbage rating *distributions* when you ask for a number
directly — everything clusters on 4, no realistic spread. SSR fixes this:

1. **Elicit text, not a number.** Give the model a persona + the ad, ask for a
   free-text reaction ("Honestly the price feels steep but the 3-day battery
   claim is the one thing I've wanted…").
2. **Embed the reaction** and embed a set of **reference statements**, one per
   Likert point ("I would definitely buy this" … "I would never buy this").
3. **Cosine-similarity → probability distribution.** The response's similarity
   to each anchor becomes a probability mass over the 1–5 scale (subtract the
   min, normalize, optional temperature). You get a *distribution*, not a point
   — preserving uncertainty.
4. **Aggregate** across many personas into a survey-level purchase-intent score
   per ad.

### How we use it

- Build a **panel of synthetic personas** from the real ICP (`launchmarketing`
  owns the ICP definition). 50–200 personas spanning the awareness stages from
  the [playbook](ad-creative-playbook.md#2-know-exactly-who-youre-talking-to).
- Run every generated variant through the panel **before** it touches ad spend.
- **Kill the bottom tier locally** (cheap tokens) so only the top ~20% of
  concepts ever cost real money. You also get the *qualitative* text back —
  *why* personas disliked a hook — which feeds stage ②'s next iteration.

> SSR **ranks and filters; it does not replace the auction.** Treat its score as
> a strong prior that decides *what gets the chance to spend*, then let real Meta
> results overrule it. Calibrate the SSR score against actual ROAS over time —
> that calibration is itself part of stage ⑥.

**Tooling:** the open-source [`semantic-similarity-rating`](https://github.com/pymc-labs/semantic-similarity-rating)
package for the scoring math; any strong LLM for persona reactions (Claude /
GPT); any embedding model for the similarity step. Existing skills like
[`synthetic-market-research`](https://github.com/bayramannakov/synthetic-market-research)
wrap the same idea.

---

## 3. Stage ⑥ — the Karpathy agent loop

Andrej Karpathy's framing of practical agents — **keep humans on the loop, not
out of it; build the "Iron Man suit," not the autonomous robot.** Two design
rules drive the whole service:

1. **Autonomy slider, not a switch.** Early on the human approves every concept
   and every go-live (stage ④ ships as `PAUSED` for exactly this reason). As SSR
   scores prove themselves against real ROAS, you slide autonomy up — let the
   system auto-promote variants above a confidence bar, auto-pause clear losers
   — but the slider stays in human hands. This is already the repo's posture;
   see [`human-approval-policy.md`](human-approval-policy.md).
2. **Tight generation–verification loops.** The bottleneck is *verification
   speed*, not generation speed. SSR is the fast verifier that lets the loop run
   many times cheaply; real Meta results are the slow, authoritative verifier.
   Keep the fast loop spinning and let the slow loop correct it.

Concretely, stage ⑥ does three things each cycle:
- **Promote winners into the reference set** — your own best ads become stage ①
  inputs, so the system imitates *what worked for you*, not just competitors.
- **Log losers to a kill list** — record reliably-failing hooks/formats so
  generation stops re-proposing them (the playbook's
  [swipe file & kill list](ad-creative-playbook.md#8-test-like-a-scientist--a-creative-system-not-random-swings)).
- **Recalibrate SSR** against observed ROAS so the pre-test gets more predictive
  every round.

---

## 4. The tool stack, by stage

No single product does all of this well. Assemble it. "Best" below is as of
**mid-2026** — model rankings move fast, so wire each slot behind an interface
you can swap.

### ① Mine — reference ads & angle clustering
| Need | Tools |
|---|---|
| Competitor ad sourcing | **Meta Ad Library API** (free, official), Foreplay, AdSpy, TikTok Creative Center |
| "What's been running longest" signal | Meta Ad Library (first-seen / still-active dates) — long-runners are proven winners |
| Clustering into testable angles | LLM (Claude/GPT) over the scraped corpus → angle list |

### ② Generate — the hard part (and your question)

**Copy & scripts:** a frontier LLM (Claude, GPT) prompted with the winning
angle + the [playbook](ad-creative-playbook.md) principles. This is the cheap,
solved part.

**Static images — the actual hard part.** There is no single best model; route
by job. Mid-2026 landscape:

| Model | Best at | Use for | Rough cost |
|---|---|---|---|
| **Nano Banana Pro / 2** (Google) | character/product consistency, *editing existing images*, prompt adherence | UGC-style scenes, product-in-context, iterating on a winning visual | $$ |
| **Ideogram v3** | **legible in-image text** (headlines, labels, packaging, price) | any ad where copy lives *on* the image — most statics | $$ |
| **Imagen 4 Ultra** (Google) | top-end photorealism (skin, fabric, light) | hero/brand shots that must look shot-on-camera | $$$ (~$0.08/img, ~8s) |
| **Seedream v5 Lite** (ByteDance) | cheapest high-volume, 2K res | generating the *many* variants SSR will filter | $ (~$0.026/img) |
| **Flux 2 Pro** | safe generalist default | starting point before you specialize | $$ |
| **GPT Image** (OpenAI, "chatgpt image 2") | strong instruction-following & compositing, conversational edits | fine as a default; **not** the ad-specific leader below | $$ |

**Direct answer to "chatgpt image 2 or something else?"** GPT Image is good —
especially at following fiddly multi-element instructions — but for *ads
specifically* it is not the one to standardize on as of mid-2026. The two
ad-critical capabilities are **(a) readable text baked into the image** and
**(b) consistent editing of a winning creative**, and those go to **Ideogram v3**
and **Nano Banana Pro** respectively. The right architecture is a **model
router**, not a single vendor:

- High-volume variant generation (feeding SSR) → **Seedream v5 Lite** (cost).
- Anything with a headline/price/label on it → **Ideogram v3** (text).
- Product-in-scene, UGC, and *editing a winner* → **Nano Banana Pro** (consistency/edit).
- Hero photoreal → **Imagen 4 Ultra**.
- Unsure / generalist fallback → **Flux 2 Pro** or **GPT Image**.

This is exactly how Superscale-class quality is reached: not a magic model, but
the right model per shot plus the SSR filter killing the 80% that miss.

**Video & UGC** (the format that wins on Meta/TikTok):
| Need | Tools |
|---|---|
| AI avatars / talking-head UGC | HeyGen, Arcads, Captions — avatar + lip-sync |
| Voice | **ElevenLabs** (multilingual, the Superscale stack uses it) |
| Image→video / B-roll | Veo (Google), Kling, Runway, Sora |
| Assembly: timeline, captions, music, resize-per-placement | Creatomate / Shotstack (programmatic), or an editor agent |

### ③ Pre-test — SSR
[`semantic-similarity-rating`](https://github.com/pymc-labs/semantic-similarity-rating)
+ an LLM for persona reactions + an embedding model. See §2.

### ④ Ship — Meta
**Meta Marketing API** (Graph API) — programmatic campaign/ad-set/ad creation,
custom audiences, creative upload. Always create **PAUSED** (repo policy). For
the actual test design (budgets, learning phase, one-variable isolation) see
`launchads`.

### ⑤ Review — performance
**Meta Insights API** for ROAS/CPA/CTR/frequency; **hook rate** (3-sec views ÷
impressions) and thumb-stop ratio as first-class creative metrics
([playbook §4](ad-creative-playbook.md#4-the-hook-is-80-of-the-battle)). Pixel/CAPI
for conversions. `launchperformance` owns this.

### ⑥ Orchestration & glue
| Need | Tools |
|---|---|
| Agent orchestration | the **Launch Team agents** in this repo (OpenClaw or any framework) |
| State / asset store | a DB + object storage for refs, variants, SSR scores, results |
| Workflow runner | a queue/cron driving the loop on a cadence |
| Model routing | thin interface in front of each image/video/LLM slot so models are swappable |

---

## 5. How it maps onto the five agents

The service is **not new agents** — it's a pipeline the existing five already
cover:

```
launchteam        ── orchestrates the loop, owns the autonomy slider (Karpathy)
├── launchmarketing   → ① mine + cluster angles, ② own the ICP → SSR persona panel
├── launchcreative    → ② generate copy + statics + video (the model router)
├── launchads         → ④ ship to Meta as PAUSED, design the tests
└── launchperformance → ③ run SSR scoring, ⑤ read results, ⑥ recalibrate
```

The only genuinely new capabilities to *add as tools* (not as prompts) are: the
**image/video model router**, the **SSR scorer**, and the **Meta API client**.
Everything else is the agents doing what they already do, on a loop.

---

## 6. MVP cut — what to build first

Don't build the whole loop on day one. Prove the two differentiators cheaply:

1. **Mine → Generate → SSR, no Meta yet.** Scrape a niche from the Meta Ad
   Library, generate 20 statics with **one** image model (start with Ideogram v3
   or Nano Banana Pro), score them with the open-source SSR package against a
   small persona panel. If SSR's ranking feels sane to a human expert, the core
   thesis holds.
2. **Add Meta, closed loop, single account.** Ship the top 3 as PAUSED, launch
   manually, read results back, check whether SSR *predicted* the real winner.
   That correlation is the whole product — measure it before scaling.
3. **Then** add the model router, video/UGC, multi-account, and slide the
   autonomy up.

Resist scaling generation volume before step 2's correlation is real — a
thousand ads the SSR can't rank is just a thousand ways to waste spend.

---

## Sources

- SSR paper — *LLMs Reproduce Human Purchase Intent via Semantic Similarity
  Elicitation of Likert Ratings*, PyMC Labs, 2025 —
  [arXiv:2510.08338](https://arxiv.org/abs/2510.08338) ·
  [code](https://github.com/pymc-labs/semantic-similarity-rating)
- Image-model landscape (mid-2026) —
  [Atlas Cloud](https://www.atlascloud.ai/blog/guides/best-ai-image-generation-models-2026),
  [LLM-Stats image leaderboard](https://llm-stats.com/leaderboards/best-ai-for-image-generation)
- Superscale workflow reference —
  [superscale.ai/learn/ad-creative-automation](https://superscale.ai/learn/ad-creative-automation/)
- Andrej Karpathy on practical agents — autonomy slider / human-on-the-loop /
  "Iron Man suit" framing (public talks & writing, 2024–2025).

> Model names, prices, and rankings above are accurate to **mid-2026** and will
> drift. The architecture — *mine → generate → SSR-filter → ship → learn*, with a
> swappable model router — is the durable part.
