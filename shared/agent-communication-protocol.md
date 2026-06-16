# Agent Communication Protocol

How the launch team agents communicate with each other and with the owner. Adapt this to your agent framework.

---

## Message Format

Every inter-agent message uses this structure:

```
TO: [agent name]
FROM: [agent name]
TASK: [task name — unique identifier]
TYPE: [ASSIGN | REVIEW | APPROVED | BLOCKED | DONE | FLAG]
DEADLINE: [date/time]
BODY:
[Content of the message]
```

---

## Message Types

### ASSIGN
Launchteam assigns work to a specialist agent.

```
TO: launchmarketing
FROM: launchteam
TASK: ICP-LAUNCH-001
TYPE: ASSIGN
DEADLINE: 2024-01-05

Brief attached. Produce:
1. ICP definition (use the ICP framework in your AGENTS.md)
2. Top 3 positioning angles with rationale
3. Channel recommendation with budget split
4. Funnel map (brief description, not a full design)

Context: This is a [product type] targeting [rough ICP]. Budget is $[X]/month.
Full brief in attachment / shared folder / [link].

Escalate to me if you hit any blockers or need decisions.
```

### REVIEW
Agent sends output back to launchteam (or to another agent) for review.

```
TO: launchteam
FROM: launchmarketing
TASK: ICP-LAUNCH-001
TYPE: REVIEW
DEADLINE: 2024-01-05

ICP, positioning, and channel plan are complete. See below.

[Output content]

Decision needed from you:
- The positioning I recommend leads with [angle]. Alternative is [angle]. I prefer the first because [reason]. Confirm or redirect.
- Budget split assumes TikTok. If TikTok account isn't set up yet, we default to Meta-only. Confirm.

Quality: 8/10
```

### APPROVED
Launchteam (or owner) approves output and signals next step.

```
TO: launchcreative
FROM: launchteam
TASK: ICP-LAUNCH-001
TYPE: APPROVED

Marketing strategy is approved. Starting launchcreative now.

Positioning approved: [angle]
ICP confirmed: [brief summary]
Channel focus: Meta primary, Google secondary

Your assignment (TASK: CREATIVE-LAUNCH-001, see separate message).
```

### BLOCKED
Agent is stuck and cannot proceed without input.

```
TO: launchteam
FROM: launchads
TASK: ADS-LAUNCH-001
TYPE: BLOCKED

Blocked on: Meta Ads account does not have billing set up. Cannot create campaigns.

Need: Owner needs to add a payment method to the Meta Ad Account [account ID].

Impact: Campaign build is paused. Will resume within 2 hours of billing being confirmed.

No other blockers at this time.
```

### DONE
Agent signals task completion.

```
TO: launchteam
FROM: launchperformance
TASK: TRACKING-LAUNCH-001
TYPE: DONE

Tracking verified:
- Meta Pixel firing: PageView, AddToCart, Purchase (confirmed in Events Manager)
- Google Ads conversion: Purchase event confirmed, value passing correctly
- GA4: UTM parameters flowing correctly for all paid channels
- TikTok Pixel: CompletePayment event confirmed

All green. Campaigns can go live.
```

### FLAG
Urgent issue requiring immediate attention. Skip the queue.

```
TO: launchteam
FROM: launchperformance
TASK: PERF-MONITOR-001
TYPE: FLAG
PRIORITY: HIGH

ROAS dropped from 3.2x to 1.1x overnight. This is not a normal fluctuation.

Spend: $280 yesterday. Revenue attributed: $308. ROAS: 1.1x.
Previous 7-day average: 3.2x.

Possible causes:
1. Ad account billing issue causing partial delivery
2. Landing page down or loading slowly (check immediately)
3. iOS update causing attribution drop (check raw order count vs. attributed conversions)

Immediate action needed: Check if the LP is loading correctly right now.
Awaiting your direction on budget pause.
```

---

## Handoff Map

```
Owner → launchteam (brief)
launchteam → launchmarketing (strategy)
launchmarketing → launchteam (strategy review)
launchteam → launchcreative (creative brief, based on strategy)
launchteam → launchads (campaign brief, based on strategy)
launchcreative → launchteam (copy + creative brief review)
launchads → launchteam (campaign structure review)
launchteam → owner (pre-launch review and approval)
[owner approves]
launchads → platforms (campaigns go live)
launchperformance → launchteam (daily reports)
launchperformance → launchads (optimization recommendations)
launchads → launchteam (confirms actions taken)
launchteam → owner (weekly rollup)
```

---

## Escalation Rules

### Escalate to owner immediately:
- Platform account banned or restricted
- ROAS below floor for 3+ consecutive days with no clear fix
- Critical asset (LP, video) is broken or missing
- Budget overrun risk (on track to spend 20%+ over budget)
- Any legal/compliance flag from a platform

### Handle within the team (no need to escalate):
- Normal daily optimization (which ads to scale/kill)
- Creative fatigue — just rotate creative
- Minor audience adjustments
- Reporting questions

### launchteam escalation to owner format:
```
ESCALATION: [one-line summary]
IMPACT: [what happens if this is not resolved, and in what timeframe]
DECISION NEEDED: [exactly what you need from the owner — be specific]
OPTIONS: [if applicable — A: ... B: ...]
RECOMMENDATION: [what you recommend if owner wants to delegate the decision]
```

---

## Response Time SLAs

| Message Type | Expected Response |
|---|---|
| ASSIGN | ACK within 2 hours, output by deadline |
| REVIEW | launchteam reviews within 4 hours |
| BLOCKED | launchteam responds within 1 hour |
| FLAG (HIGH) | Immediate — within 30 minutes |
| FLAG (MEDIUM) | Within 4 hours |
| Daily report | Delivered by 9am owner timezone |
| Weekly rollup | Delivered Monday by 9am owner timezone |
