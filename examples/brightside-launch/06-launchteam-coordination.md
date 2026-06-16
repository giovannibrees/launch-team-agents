# launchteam → Coordination: Brightside

*Output from `launchteam`. Shows how it sequences the specialists, holds the
**approval gate**, and rolls up to the owner. Message formats follow
[`agent-communication-protocol.md`](../../shared/agent-communication-protocol.md).*

---

## Brief confirmation → owner (within 24h)

```
✅ Brief received: Brightside, $99, $20K/30 days, target 600 sales (~3.0x ROAS).
📋 Plan: launchmarketing first → then launchcreative + launchads in parallel →
   launchperformance verifies tracking before any go-live.
⚠️ Two known risks up front: Google conversion tracking not set up; TikTok
   account not live. Neither blocks the Meta launch.
Next: strategy back from launchmarketing in 3 days.
```

## Assignment → launchmarketing

```
TO: launchmarketing   TYPE: ASSIGN   TASK: STRATEGY-BRIGHTSIDE-001
Produce: ICP, positioning, top 3 angles, channel split, funnel map.
Constraint: wellness framing only — NO medical claims (compliance).
Escalate budget/scope questions to me.
```

## Review → it sequences creative + ads in parallel

```
✅ launchmarketing strategy approved. Positioning: "mornings without the jolt /
   wake up on the bright side." Channels: Meta primary, Google secondary,
   TikTok held.
→ launchcreative (TASK: CREATIVE-...-001): copy + LP + demo brief off these angles.
→ launchads (TASK: ADS-...-001): campaign structure + audiences + budget.
```

---

## ⚠️ THE APPROVAL GATE — launchads plan → owner

`launchads` returned a plan specced **PAUSED** with an approval request.
`launchteam` does **not** green-light spend itself — it packages the decision
for the owner:

```
ESCALATION: Approve Meta + Google go-live for Brightside.
IMPACT: Without approval, $0 spends and the 30-day window shrinks. Seasonal
        tailwind favors starting now.
DECISION NEEDED: Approve launching Meta now (~$367/day) + YouTube (~$33/day)?
        Google holds until its conversion tracking is live.
OPTIONS:
  A — Approve Meta + YouTube now; fix Google tracking this week.   ← recommend
  B — Wait and launch all channels together (loses ~3–5 days).
RECOMMENDATION: A. Meta is verified and ready; don't let a Google tracking gap
        delay the whole launch. TikTok stays held.
```

**Owner replies: "Approved — Option A."** → logged:

```
APPROVED BY: Founder on 2026-07-05
ACTION: Launch Meta + YouTube at planned budgets, starting 2026-07-06.
SCOPE: ≤ $400/day combined; Google + TikTok remain paused pending separate OK.
```

Only now does `launchteam` tell `launchads` to have a human flip Meta live, after
`launchperformance` confirms tracking. Each later budget increase or go-live
(Google, TikTok) needs its **own** approval.

---

## Weekly rollup → owner (Monday)

```
📊 Week 1 — Brightside
- Spend $1,810 · Revenue $4,050 · Blended MER 2.2x (target 3.0x — climbing as
  the pixel exits learning; CPA $64 → $41).
✅ Working: "opposite of a phone alarm" + broad/lookalike audiences.
⚠️ Decisions for you:
   1. Google: approve tracking fix, or reallocate its $5K to Meta?
   2. TikTok still not live — keep holding?
📋 Next week: scale winners +20%, ship 2 new hooks, refresh before fatigue.
No surprises. Nothing went live or changed budget without your sign-off.
```
