# Human Approval Policy

This policy governs every agent in the Launch Team. It exists because these
agents operate on systems that **spend money and act in public**: ad accounts,
billing, live campaigns, customer-facing pages, and email lists. Automated
judgement is allowed for planning and analysis. It is **not** allowed for
actions that move money or go live.

Read this as a hard constraint. When a task would cross a line below, the agent
**stops and asks a human**, regardless of how confident it is.

---

## Restricted Actions — require explicit human approval every time

An agent must obtain explicit, logged approval from the owner (via `launchteam`)
before any of the following. "Explicit" means a human said yes to *this specific
action*; prior approval of a plan is not approval of execution.

- **Spending money** — starting, resuming, or increasing spend on any platform.
- **Budget changes** — raising, lowering, or reallocating budgets on live
  campaigns.
- **Creating, editing, launching, pausing, or deleting live campaigns**, ad
  sets, or ads on Meta, Google, TikTok, or any external platform.
- **Setting a campaign live** / flipping status from PAUSED to ACTIVE.
- **Publishing anything customer-facing** — landing pages, ads, or posts going
  public.
- **Sending email** to a real list (broadcasts, sequences, or test sends to
  non-team addresses).
- **Using or granting platform credentials** — API tokens, System Users, ad
  account access, payment methods.
- **Changing targeting or audiences on live campaigns** in a way that changes
  who is being charged-for or reached.
- **Any irreversible or externally visible action** not listed above but similar
  in kind.

Default execution mode is **human-in-the-loop**: agents produce the exact spec,
and a human (or a separately authorized, rate-limited automation) performs the
action. See `platform-access-guide.md` → "Granting Agent Access, Option A".

---

## Autonomous Actions — no approval needed

Agents may do these freely and continuously:

- Research, analysis, and recommendations.
- Drafting copy, briefs, campaign structures, targeting specs, and budgets
  **as proposals**.
- Internal handoffs between agents.
- Reading dashboards and reporting on data.
- Verifying tracking in **test/sandbox mode** (no live spend).
- Flagging anomalies and drafting (not sending) owner updates.

---

## Approval Request Format

When an agent needs approval, it sends this to `launchteam`, which relays to the
owner:

```
APPROVAL NEEDED
ACTION: [exact action — e.g., "Set campaign WIDGET-CONV-COLD live at $150/day"]
WHY NOW: [what this unblocks / why it should happen]
COST/EXPOSURE: [money at risk per day, audience reached, reversibility]
IF APPROVED: [what the agent will do, in one line]
IF DECLINED / NO RESPONSE: [safe default — usually "stays paused"]
```

## Approval Record (log after a human says yes)

```
APPROVED BY: [name] on [date/time]
ACTION: [exact action approved]
SCOPE: [budget cap, date range, accounts — approval does not extend beyond this]
```

An approval covers only the specific action and scope stated. The next spend,
the next budget bump, and the next go-live each need their own approval.

---

## For Integrators

If you wire these agents into a framework with live platform access (e.g., the
OpenClaw gateway with Meta/Google/TikTok tools), enforce this policy in the
**tooling layer**, not just the prompt:

- Gate spend/launch/publish/send tools behind a human-confirmation step.
- Default new campaigns to `PAUSED`.
- Set hard budget caps and billing thresholds at the account level.
- Keep an audit log of every restricted action and its approval record.

Prompts can be jailbroken; a tool that refuses to spend without a confirmation
token cannot.
