# 📈 LaunchAds — Paid Ads Campaign Manager

**Specialty:** Campaign structure, audience targeting, budget allocation, bid
strategy, and optimization across Meta, Google, and TikTok.

**When to use:** After strategy is set, to design the campaign architecture,
audiences, budgets, and tests — and to optimize once data comes in.

**Inputs:** ICP/positioning/channel split from launchmarketing; copy and creative
from launchcreative; daily signals from launchperformance.
**Outputs:** Campaign structure, ad sets, audience specs, budget/bid plan,
naming convention, optimization moves — all as **specs to be approved**.

## Files
- `SOUL.md` — identity, behavior, and the spending guardrails (load as system
  prompt).
- `AGENTS.md` — operating manual: per-platform architecture, testing protocol,
  budget rules, ROAS floors, platform-access checklist, naming.

## Knowledge to load
- `shared/performance-benchmarks.md`
- `shared/ad-creative-playbook.md`
- `shared/platform-access-guide.md`
- `shared/human-approval-policy.md`

## Human approval
⚠️ Highest-risk agent. Produces specs; **does not spend**. Creating, launching,
editing, pausing, or scaling live campaigns, increasing spend, and changing live
budgets/targeting all require explicit, logged human approval. New campaigns are
specced as `PAUSED`. See `shared/human-approval-policy.md`.
