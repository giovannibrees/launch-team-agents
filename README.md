# Launch Team — AI Agent System for Product Launches

A multi-agent system for running product launches end-to-end: from strategy through paid ads, creative, and performance tracking. The agent definitions are platform-agnostic — adapt them to Claude, GPT-4, or any agent framework.

---

## The Team

Five agents. Each owns a distinct function. They hand off to each other, not to you.

```
launchteam (Coordinator)
├── launchmarketing   → Strategy and channel planning
├── launchads         → Paid ads execution (Meta, Google, TikTok)
├── launchcreative    → Ad copy, visuals, landing page copy
└── launchperformance → Analytics, ROAS tracking, optimization
```

### Roles at a Glance

| Agent | Function | Primary Output |
|---|---|---|
| `launchteam` | Coordinates the other four. Owns timelines, handoffs, blockers | Launch brief, task assignments, status rollups |
| `launchmarketing` | Market research, positioning, channel strategy, funnel design | Strategy doc, channel plan, ICP definition |
| `launchads` | Campaign setup, targeting, budget allocation, bid strategy | Campaign structure, ad sets, audience specs |
| `launchcreative` | Ad copy, creatives, landing page copy, email sequences | Ad copy variants, LP wireframe, creative briefs |
| `launchperformance` | Tracking setup, daily reporting, ROAS monitoring, optimization | Performance reports, anomaly flags, optimization recommendations |

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
8. Ads go live. launchperformance activates tracking.
9. launchperformance sends daily reports. Flags anomalies.
10. launchads optimizes based on launchperformance signals.
11. launchteam runs weekly rollup to owner.
```

---

## Repository Structure

```
/launchteam/          → Coordinator agent definition
/launchmarketing/     → Marketing strategist agent definition
/launchads/           → Paid ads manager agent definition
/launchcreative/      → Creative and copy agent definition
/launchperformance/   → Performance analyst agent definition
/shared/              → Shared knowledge: benchmarks, platform guides, ad frameworks
```

Each agent folder contains:
- `AGENT.md` — Identity, responsibilities, decision rules, communication protocol
- `knowledge/` — Domain knowledge the agent should have loaded

---

## Setup

1. Choose your agent framework (Claude API, OpenAI Assistants, CrewAI, AutoGen, etc.)
2. Load each `AGENT.md` as the system prompt for that agent
3. Load the matching `knowledge/` files into the agent's context or RAG store
4. Wire up agent-to-agent messaging (the agents reference each other by role name — map these to your billing proxy)
5. Give `launchteam` a product brief and let it run

---

## What This Is Not

- This is not a finished SaaS product
- It does not include API credentials, ad account access, or live integrations
- The agents reference platforms (Meta Ads Manager, Google Ads, etc.) but you need to connect those yourself
- Performance tracking assumes you have a pixel and analytics setup — the agents tell you what to track, not how to install it

---

## Contributing

PRs welcome. If you improve an agent definition, add a knowledge file, or build an integration — share it back.
