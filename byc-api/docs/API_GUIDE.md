# BoostYourCampaign — API Guide

BoostYourCampaign is a real-time monitoring and automation API for crowdfunding
creators. It watches your campaigns and emits **structured events** the moment
something important happens — funding milestones crossed, your goal reached,
stretch goals unlocked, momentum (velocity) drops, comment spikes, and new
backer-facing updates.

This guide explains how the API works and how to get started. For the exact
request/response shape of every endpoint, see the separate
[**API Reference**](./API_REFERENCE.md).

---

## Base URL

```
https://api.boostyourcampaign.com
```

All API routes are versioned under `/v1`.

---

## Quick start

1. **Create an account & get an API key.** Sign up at
   [boostyourcampaign.com](https://api.boostyourcampaign.com) → **Settings ›
   Developer**, or call [`POST /v1/auth/signup`](./API_REFERENCE.md#post-v1authsignup),
   which returns your first API key.
2. **Make an authenticated request.** Send your key as a Bearer token:

   ```bash
   curl https://api.boostyourcampaign.com/v1/account \
     -H "Authorization: Bearer byc_your_api_key_here"
   ```

   A successful response confirms your key works:

   ```json
   { "account": { "id": "acct_50075c0fa2d48727", "name": "Acme Studio" } }
   ```
3. **Create a campaign** with [`POST /v1/campaigns`](./API_REFERENCE.md#post-v1campaigns).
4. **Poll for events** with [`GET /v1/events?type=...`](./API_REFERENCE.md#get-v1events).

---

## Authentication

Every endpoint except signup/login and the public health check requires an API
key. You can supply it three ways — pick whichever your tooling supports:

| Method | Example |
| --- | --- |
| `Authorization` header (recommended) | `Authorization: Bearer byc_xxx` |
| `X-API-KEY` header | `X-API-KEY: byc_xxx` |
| `apiKey` query parameter | `?apiKey=byc_xxx` |

### Key properties

- Keys are **per-account and account-scoped** — a key only ever sees its own
  account's campaigns and events.
- Keys are stored **hashed (SHA-256)**, never in plaintext. The raw key is shown
  **once**, at creation time. Store it securely.
- You can create multiple keys (e.g. one per integration) and revoke any of them
  individually. Revoking a key immediately stops any Zap or script using it.

### Errors

| Status | Meaning |
| --- | --- |
| `401 Unauthorized` | Missing or invalid API key. Reconnect your account. |
| `403 Forbidden` | The key is valid but not allowed to access that resource. |
| `404 Not Found` | The resource doesn't exist or isn't owned by your account. |
| `429 Too Many Requests` | Rate limit exceeded. Back off and retry. |

---

## Core concepts

### Campaigns

A **campaign** is a crowdfunding project you want to monitor. It has a `name`, a
funding `goal`, and a `currency`. Pledges, stretch goals, updates, and comments
all belong to a campaign.

### Events

The heart of the API. BoostYourCampaign computes events **server-side** from
your campaign data and returns them through
[`GET /v1/events`](./API_REFERENCE.md#get-v1events). Each event has a **stable,
unique `id`** so downstream consumers (like Zapier) can deduplicate reliably —
the same event is never delivered twice.

Supported event types:

| `type` | Fires when… |
| --- | --- |
| `funding_milestone` | Total pledged crosses a round percentage (every 10% of goal) or a round currency amount ($1k/$5k/$25k steps). |
| `goal_reached` | Total pledged meets or exceeds the goal. |
| `stretch_goal_reached` | Total pledged crosses a defined stretch-goal value. |
| `velocity_drop` | Pledge rate in the last 24h drops ≥40% vs. the prior 24h. |
| `campaign_update` | A new campaign update is posted. |
| `comment_spike` | Comment volume in the last 6h exceeds 3× the 7-day baseline. |

Each event includes campaign-level context (`campaign_name`, `currency`,
`amount_pledged`, `goal`, `percent_funded`, `backer_count`, `occurred_at`) plus
a `data` object with fields specific to that event type. See the
[API Reference → Event object](./API_REFERENCE.md#the-event-object) for the full
schema.

### Polling model

Events are designed for **polling**. Call `GET /v1/events?type=<type>` on an
interval; new events appear ordered newest-first. Because every event `id` is
stable, you only act on ids you haven't seen before. This is exactly how the
[Zapier integration](#zapier) consumes the API.

---

## Privacy by design

BoostYourCampaign works with **campaign-level aggregate data only** — never
individual backer personal information. Events report totals, rates, and counts,
not names, emails, or payment details.

---

## Zapier

BoostYourCampaign ships an official Zapier integration so you can route campaign
events to Slack, email, Google Sheets, Notion, and 6,000+ other apps with no
code. Each Zapier polling trigger maps directly to one event `type` above and
uses the event `id` as its dedup key. Connect using any API key from **Settings ›
Developer**.

---

## Supported platforms

- **Kickstarter** campaigns are supported today.
- **Indiegogo** support is coming soon.

---

## Versioning & stability

The API is versioned in the path (`/v1`). Backwards-incompatible changes will be
released under a new version prefix. Additive changes (new fields, new event
types) may appear within `/v1` without notice, so consumers should ignore
unknown fields rather than fail on them.

---

## Support

Questions or integration help: **support@boostyourcampaign.com**
