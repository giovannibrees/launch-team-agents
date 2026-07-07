# Launch Team — AI Agent System for Product Launches

A multi-agent system for running product launches end-to-end: from strategy
through paid ads, creative, and performance tracking. Packaged for the
[OpenClaw](https://docs.openclaw.ai/) gateway, but the agent definitions are
platform-agnostic — the same `SOUL.md` / `AGENTS.md` files work with Claude,
GPT, or any agent framework.

> © 2026 Giovanni Brees · Licensed under **CC BY 4.0** — free to use and adapt
> **with attribution**. See [License & Attribution](#license--attribution).

---

## The Team

Five agents. Each owns a distinct function. They hand off to each other, not to you.

```
launchteam (Coordinator / Orchestrator)
├── launchmarketing   → Strategy and channel planning
├── launchcreative    → Ad copy, visuals, landing page copy
├── launchads         → Paid ads execution (Meta, Google, TikTok)
└── launchperformance → Analytics, ROAS tracking, optimization
```

### Roles at a Glance

| Agent | Function | Primary Output |
|---|---|---|
| `launchteam` | Coordinates the other four. Owns timelines, handoffs, blockers. Enforces approvals | Launch brief, task assignments, status rollups |
| `launchmarketing` | Market research, positioning, channel strategy, funnel design | Strategy doc, channel plan, ICP definition |
| `launchcreative` | Ad copy, creatives, landing page copy, email sequences | Ad copy variants, LP wireframe, creative briefs |
| `launchads` | Campaign setup, targeting, budget allocation, bid strategy | Campaign structure, ad sets, audience specs |
| `launchperformance` | Tracking setup, daily reporting, ROAS monitoring, optimization | Performance reports, anomaly flags, recommendations |

---

## How a Launch Works (The Sequence)

```
1. Owner briefs launchteam → product, goal, budget, timeline
2. launchteam assigns work to launchmarketing first
3. launchmarketing returns: ICP, positioning, channel plan, funnel map
4. launchteam assigns launchcreative + launchads in parallel
5. launchcreative produces: ad copy variants, LP copy, creative briefs
6. launchads produces: campaign structure, targeting, budget allocation
7. launchteam reviews both. Approves or sends back.
8. Owner approves go-live. launchads sets campaigns live. launchperformance activates tracking.
9. launchperformance sends daily reports. Flags anomalies.
10. launchads optimizes based on launchperformance signals (with approval to act).
11. launchteam runs weekly rollup to owner.
```

Step 8 is a **human decision**, not an automated one — see
[Human approval](#human-approval-required).

---

## Repository Structure

```
launch-team-agents/
├── agents/
│   ├── launchteam/          # Coordinator / orchestrator
│   │   ├── SOUL.md          #   identity, behavior, comms (system prompt)
│   │   ├── AGENTS.md        #   operating manual (procedures, frameworks)
│   │   └── README.md        #   specialty + when to use
│   ├── launchmarketing/     # (same three files)
│   ├── launchcreative/
│   ├── launchads/
│   └── launchperformance/
├── shared/                  # Shared knowledge loaded by the agents
│   ├── agent-communication-protocol.md
│   ├── launch-brief-template.md
│   ├── performance-benchmarks.md
│   ├── ad-creative-playbook.md
│   ├── ad-creation-service.md
│   ├── platform-access-guide.md
│   └── human-approval-policy.md
├── agents.json              # Machine-readable index of the agent group
├── openclaw.config.example.json  # Example gateway config (models, limits, approvals)
├── install.sh               # One-command group install for OpenClaw
├── LICENSE                  # CC BY 4.0
└── NOTICE                   # Copyright + required attribution
```

Each agent is a self-contained **workspace**: a folder with a `SOUL.md`
(identity, required by OpenClaw) and an `AGENTS.md` (operating rules). Shared
domain knowledge lives once in `shared/`; each agent's `README.md` lists the
files it should load.

---

## Quick Start (OpenClaw)

Install the whole group into an OpenClaw gateway in one command:

```bash
git clone https://github.com/giovannibrees/launch-team-agents.git
cd launch-team-agents
./install.sh
```

`install.sh` registers all five agents (`openclaw agents add <name> --workspace
agents/<name>`). Preview the commands first with `DRY_RUN=1 ./install.sh`.

Then:

1. Bind **only** `launchteam` to a channel — it delegates to the specialists as
   sub-agents.
2. Merge `openclaw.config.example.json` into your gateway config (model choice,
   sub-agent spawn limits, approval gating). Enable sub-agents with
   `maxSpawnDepth >= 2`.
3. Start the gateway and hand `launchteam` a filled-out
   `shared/launch-brief-template.md`.

See OpenClaw's [agents](https://docs.openclaw.ai/cli/agents) and
[sub-agents](https://docs.openclaw.ai/tools/subagents) docs.

### Using a different framework

The agents are plain Markdown and port anywhere:

1. Load each `SOUL.md` as the agent's system prompt.
2. Load the matching `AGENTS.md` and the `shared/` files listed in that agent's
   `README.md` into context (or a RAG store).
3. Wire agent-to-agent messaging using
   `shared/agent-communication-protocol.md` (agents reference each other by role
   name).
4. Give `launchteam` a product brief and let it run.

---

## Human Approval Required

These agents reason about **ad spend, budgets, platform access, and campaigns
going live**. None of those actions happen autonomously. Spending, budget
changes, launching/editing live campaigns, publishing pages, and sending email
**all require explicit human approval** — see
[`shared/human-approval-policy.md`](shared/human-approval-policy.md).

- `launchads` produces campaign **specs**; a human (or a separately authorized
  automation) executes them. New campaigns are specced as `PAUSED`.
- `launchteam` is the approval gate and never green-lights spend on its own.
- `launchperformance` recommends; it never changes campaigns.

If you connect these agents to live ad accounts, **enforce approvals in the
tooling layer**, not just the prompts. The example config exposes an
`approvals` block as a starting point.

---

## What This Is Not

- This is not a finished SaaS product.
- It does not include API credentials, ad account access, or live integrations.
- The agents reference platforms (Meta Ads Manager, Google Ads, etc.) but you
  connect those yourself.
- Performance tracking assumes you have a pixel and analytics setup — the agents
  tell you what to track, not how to install it.

---

## License & Attribution

This work is licensed under the **Creative Commons Attribution 4.0
International License (CC BY 4.0)**.

You are free to **share and adapt** these materials for any purpose, including
commercially — **as long as you credit the original creator, Giovanni Brees**,
link back to this repository, and indicate if you made changes.

Suggested credit line:

> "Launch Team AI Agent System" by Giovanni Brees, used under
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
> Source: https://github.com/giovannibrees/launch-team-agents

See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for the full terms.

---

## Contributing

PRs welcome. If you improve an agent definition, add a knowledge file, or build
an integration, share it back. Contributions are accepted under the same
CC BY 4.0 license.
