# BoostYourCampaign — API Reference

Complete endpoint reference. For concepts and a getting-started walkthrough, see
the [**API Guide**](./API_GUIDE.md).

- **Base URL:** `https://api.boostyourcampaign.com`
- **Versioning:** all routes are prefixed with `/v1`
- **Content type:** `application/json` for all request and response bodies
- **Auth:** Bearer token, `X-API-KEY` header, or `?apiKey=` query param (see
  [Authentication](#authentication))

---

## Authentication

Send your API key with every request (except `signup`, `login`, and `health`):

```
Authorization: Bearer byc_xxxxxxxxxxxxxxxxxxxxxxxx
```

Alternatives: `X-API-KEY: byc_xxx` header, or `?apiKey=byc_xxx` query parameter.

### Error responses

All errors return a JSON body of the form:

```json
{ "message": "Human-readable description of what went wrong." }
```

| Status | Meaning |
| --- | --- |
| `400` | Bad request — missing or invalid parameters. |
| `401` | Missing or invalid API key. |
| `403` | Authenticated but not permitted. |
| `404` | Resource not found / not owned by your account. |
| `429` | Rate limit exceeded. |
| `500` | Internal server error. |

---

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | Liveness check. |
| `POST` | `/v1/auth/signup` | No | Create an account; returns first API key. |
| `POST` | `/v1/auth/login` | No | Verify credentials. |
| `GET` | `/v1/account` | Yes | Verify a key / return account info. |
| `GET` | `/v1/developer/keys` | Yes | List API keys (metadata only). |
| `POST` | `/v1/developer/keys` | Yes | Generate a new API key. |
| `DELETE` | `/v1/developer/keys/:keyId` | Yes | Revoke an API key. |
| `GET` | `/v1/campaigns` | Yes | List campaigns with funding aggregates. |
| `POST` | `/v1/campaigns` | Yes | Create a campaign. |
| `GET` | `/v1/dashboard` | Yes | Account-wide totals + recent events. |
| `GET` | `/v1/events` | Yes | List computed events of a given type. |
| `POST` | `/v1/demo/seed` | Yes | Seed demo data for testing triggers. |

---

### `GET /health`

Public liveness probe. No authentication.

**Response `200`**
```json
{ "ok": true }
```

---

### `POST /v1/auth/signup`

Create a new account. Returns the account and its **first API key** (the only
time the raw key is shown).

**Request body**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | yes | Account / organization name. |
| `email` | string | yes | Login email (must be unique). |
| `password` | string | yes | Account password. |

**Response `201`**
```json
{
  "account": { "id": "acct_50075c0fa2d48727", "name": "Acme Studio", "email": "you@example.com" },
  "key": { "id": "key_8f2c...", "prefix": "byc_8f2c1a3b...", "label": "Default", "raw_key": "byc_8f2c1a3b9d..." }
}
```

**Errors:** `400` missing fields · `409` email already registered.

---

### `POST /v1/auth/login`

Verify credentials. Does **not** return an API key — use an existing key, or
generate one via `POST /v1/developer/keys`.

**Request body**

| Field | Type | Required |
| --- | --- | --- |
| `email` | string | yes |
| `password` | string | yes |

**Response `200`**
```json
{ "account": { "id": "acct_50075c0fa2d48727", "name": "Acme Studio", "email": "you@example.com" } }
```

**Errors:** `400` missing fields · `401` invalid email or password.

---

### `GET /v1/account`

Returns the authenticated account. Used by Zapier as the connection test.

**Response `200`**
```json
{ "account": { "id": "acct_50075c0fa2d48727", "name": "Acme Studio" } }
```

---

### `GET /v1/developer/keys`

List API keys for the account. Returns **metadata only** — never the raw key.

**Response `200`**
```json
{
  "keys": [
    { "id": "key_8f2c...", "key_prefix": "byc_8f2c1a3b...", "label": "Zapier Production",
      "created_at": "2026-06-18 10:22:04", "last_used_at": "2026-06-18 14:05:11" }
  ]
}
```

---

### `POST /v1/developer/keys`

Generate a new API key. The `raw_key` is returned **once**.

**Request body**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `label` | string | no | `"Default"` |

**Response `201`**
```json
{ "key": { "id": "key_a1b2...", "prefix": "byc_a1b2c3d4...", "label": "Default", "raw_key": "byc_a1b2c3d4..." } }
```

---

### `DELETE /v1/developer/keys/:keyId`

Revoke an API key. Any integration using it stops working immediately.

**Response `200`**
```json
{ "deleted": true }
```

**Errors:** `404` key not found / not owned by your account.

---

### `GET /v1/campaigns`

List the account's campaigns with live funding aggregates.

**Query parameters**

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `limit` | integer | `100` | Max campaigns to return (capped at 100). |

**Response `200`**
```json
{
  "campaigns": [
    {
      "id": "camp_9a8b7c6d",
      "name": "My Cool Gadget",
      "goal": 50000,
      "currency": "USD",
      "created_at": "2026-06-18 09:00:00",
      "amount_pledged": 52000,
      "backer_count": 52,
      "percent_funded": 104
    }
  ]
}
```

---

### `POST /v1/campaigns`

Create a campaign.

**Request body**

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `name` | string | yes | — |
| `goal` | number | yes | — |
| `currency` | string | no | `"USD"` |

**Response `201`**
```json
{ "campaign": { "id": "camp_9a8b7c6d", "name": "My Cool Gadget", "goal": 50000, "currency": "USD" } }
```

**Errors:** `400` missing `name` or `goal`.

---

### `GET /v1/dashboard`

Account-wide totals plus the most recent events across all campaigns. Powers the
web dashboard.

**Response `200`**
```json
{
  "totals": {
    "campaign_count": 3,
    "total_pledged": 184000,
    "total_backers": 196,
    "total_events": 41
  },
  "recent_events": [
    { "id": "evt_camp_9a8b7c6d_goal", "type": "goal_reached",
      "occurred_at": "2026-06-18 13:40:00", "campaign_name": "My Cool Gadget", "currency": "USD" }
  ]
}
```

---

### `GET /v1/events`

Compute and return events of a single `type`, newest-first. This is the primary
endpoint for automation and is what each Zapier trigger polls.

**Query parameters**

| Param | Type | Required | Description |
| --- | --- | --- | --- |
| `type` | string | yes | One of the [event types](#event-types). |
| `campaign_id` | string | no | Restrict to a single campaign. |
| `limit` | integer | no | Max events (default `100`, capped at `100`). |

**Response `200`** — see [The event object](#the-event-object).
```json
{
  "events": [
    {
      "id": "evt_camp_9a8b7c6d_pct_100",
      "type": "funding_milestone",
      "campaign_id": "camp_9a8b7c6d",
      "campaign_name": "My Cool Gadget",
      "currency": "USD",
      "amount_pledged": 52000,
      "goal": 50000,
      "percent_funded": 104,
      "backer_count": 52,
      "occurred_at": "2026-06-18 13:40:00",
      "data": { "milestone_basis": "percent", "milestone_value": 100 }
    }
  ]
}
```

**Errors:** `400` missing/invalid `type` · `404` `campaign_id` not found.

> **Note for Zapier:** Zapier polling triggers expect a bare array. In the
> trigger's code, return `response.json.events` to hand Zapier the array.

---

### `POST /v1/demo/seed`

Create a demo campaign pre-populated with pledges, a stretch goal, an update, and
a comment spike — enough data for every event type to fire. Useful for testing
triggers without real campaign activity. Also available as `GET` for convenience
(`GET /v1/demo/seed?apiKey=...`).

**Response `201`**
```json
{ "seeded": true, "campaign_id": "camp_9a8b7c6d" }
```

---

## The event object

Every object returned by `GET /v1/events` has this shape:

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | **Stable, unique** event id. Use as the dedup key. |
| `type` | string | The event type (see below). |
| `campaign_id` | string | Owning campaign id. |
| `campaign_name` | string | Owning campaign name. |
| `currency` | string | ISO currency code of the campaign. |
| `amount_pledged` | number | Total pledged to the campaign at event time. |
| `goal` | number | Campaign funding goal. |
| `percent_funded` | integer | `round(amount_pledged / goal * 100)`. |
| `backer_count` | integer | Number of pledges (backers). |
| `occurred_at` | string | Timestamp the event was recorded. |
| `data` | object | Type-specific fields (see below). |

### Event types

| `type` | `data` fields |
| --- | --- |
| `funding_milestone` | `milestone_basis` (`"percent"` \| `"amount"`), `milestone_value` (number) |
| `goal_reached` | _(empty object)_ |
| `stretch_goal_reached` | `stretch_id`, `stretch_label`, `stretch_value` |
| `velocity_drop` | `window_hours`, `current_rate`, `prior_rate`, `drop_pct` |
| `campaign_update` | `update_id`, `update_title` |
| `comment_spike` | `window_hours`, `comment_count`, `baseline_count` |

#### Detection rules

- **funding_milestone** — emitted for each crossed round percentage (10%, 20%, …
  100% of goal) and each crossed round currency amount ($1k steps to $10k, $5k
  steps to $100k, $25k steps above).
- **goal_reached** — emitted once when `amount_pledged ≥ goal`.
- **stretch_goal_reached** — emitted once per stretch goal when its `value` is
  crossed.
- **velocity_drop** — compares pledge rate over the last 24h to the prior 24h;
  emits when the rate falls by ≥40%. One event per drop episode (no duplicates
  until the rate recovers).
- **campaign_update** — emitted once per posted campaign update.
- **comment_spike** — emits when comments in the last 6h exceed 3× the 7-day
  baseline average. One event per spike episode.

---

## Rate limits

Polling integrations should call each `type` no more than once per minute.
Exceeding limits returns `429`; back off and retry with exponential delay.

---

## Changelog

- **v1** — Initial public release: accounts, API keys, campaigns, dashboard, and
  six event types.
