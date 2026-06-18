# BoostYourCampaign – Zapier Integration

Automate your crowdfunding campaign workflows with BoostYourCampaign. Get instant notifications when milestones are hit, velocity drops, or backers engage – and trigger actions in 6,000+ apps via Zapier.

## Triggers

| Trigger | Description |
|---|---|
| **Funding Milestone Hit** | Fires at each 10% of goal and configurable round-dollar thresholds |
| **Goal Reached** | Fires once when pledges first reach or exceed the campaign goal |
| **Stretch Goal Reached** | Fires each time a defined stretch goal threshold is crossed |
| **Funding Velocity Drop Detected** | Fires when pledge rate falls ≥40% vs the prior equal-length window |
| **New Campaign Update Posted** | Fires when a creator publishes a campaign update |
| **Comment Spike Detected** | Fires when comment volume in a window exceeds the baseline |

All triggers are polling-based with stable, deterministic event IDs so each real-world event fires exactly once regardless of poll frequency.

## Authentication

[Sign up at boostyourcampaign.com](https://boostyourcampaign.com) → **Settings › Developer** to generate an API key.  
Public API documentation: **https://docs.boostyourcampaign.com/api**

## Privacy & Data Policy

These triggers return campaign-level aggregate data only. No backer PII (names, emails, addresses) is ever included in event payloads.

---

## Development Setup

### Prerequisites

- Node.js 18+
- Zapier Platform CLI: `npm install -g zapier-platform-cli`

### Install

```bash
git clone https://github.com/giovannibrees/launch-team-agents.git
cd launch-team-agents/zapier-boostyourcampaign
npm install
cp .env.example .env
# Add your BYC_API_KEY to .env
```

### Push to Zapier

```bash
zapier login
zapier register "BoostYourCampaign"   # first time only
zapier push
```

### Test

```bash
zapier test
```

---

## Deduplication

Zapier deduplicates polling triggers on the top-level `id` field. Event IDs are permanently stable:

| Event Type | ID Format |
|---|---|
| `funding_milestone` | `evt_{campaign_id}_pct_{value}` or `evt_{campaign_id}_amt_{value}` |
| `goal_reached` | `evt_{campaign_id}_goal` |
| `stretch_goal_reached` | `evt_{campaign_id}_stretch_{stretch_id}` |
| `velocity_drop` | `evt_{campaign_id}_veldrop_{episode_id}` |
| `campaign_update` | `evt_{campaign_id}_update_{update_id}` |
| `comment_spike` | `evt_{campaign_id}_commentspike_{episode_id}` |

A milestone crossing, goal reach, or drop episode emits one permanent ID and will never re-fire.

---

## Error Handling

All non-2xx API responses are caught by `afterResponse` middleware and surfaced as clean, human-readable messages. Raw stack traces never reach Zapier users. Specific handling:

- **401** – Prompts user to reconnect with a valid API key
- **403** – Informs user their key lacks permission for the action
- **429** – Tells user the rate limit was hit and to retry shortly

---

## Submission Checklist

- [x] App is a distinct, independently-marketed product (BoostYourCampaign) – not a duplicate of an existing directory app
- [x] BYC product is publicly launched and self-serve (no invite/beta gate)
- [x] Public API docs at a stable URL: https://docs.boostyourcampaign.com/api
- [x] Owning Zapier account uses a @boostyourcampaign.com email (verify by domain)
- [x] Every trigger has `sample` data and `outputFields` defined
- [x] All triggers tested with live, on, successfully-run Zaps (see Platform Monitoring)
- [x] No backer PII in any payload – campaign-level aggregates only
- [x] No third-party trademarks or branded endpoints in app or copy
- [x] `connectionLabel` resolves to `{{json.account.name}}`
- [x] `afterResponse` middleware catches all non-2xx responses with clean messages
