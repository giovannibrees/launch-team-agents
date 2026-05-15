# Platform Access Guide

How to connect each agent to the ad platforms they need. This covers account setup, access granting, API connections, and what each agent actually needs.

---

## Meta (Facebook + Instagram Ads)

### What You Need
- Facebook Business Manager account (business.facebook.com)
- Ad Account inside Business Manager
- Meta Pixel installed on your website
- Conversions API (CAPI) set up — optional but strongly recommended post-iOS 14

### Account Setup
1. Create a Business Manager at business.facebook.com
2. Inside BM: Add your Ad Account (or create a new one under Business Settings > Accounts > Ad Accounts)
3. Create your Meta Pixel: Business Settings > Data Sources > Pixels > Add
4. Install pixel on your site: copy the base code and paste in `<head>` of every page, OR use a tag manager

### Granting Agent Access
For an AI agent to manage Meta Ads, it needs one of:

**Option A — Human-in-the-loop (recommended for first launch):**
- The agent produces campaign structure, copy, and targeting specs in a document
- A human builds it in Meta Ads Manager manually
- Agent reviews screenshots or reports

**Option B — API access (for automated agents):**
- Create a System User in Business Manager (Business Settings > Users > System Users)
- Generate a System User token with `ads_management` and `ads_read` permissions
- Store the token securely (environment variable, not hardcoded)
- Use the [Meta Marketing API](https://developers.facebook.com/docs/marketing-apis) to create and manage campaigns
- Required scopes: `ads_management`, `ads_read`, `business_management`

**Meta API quick reference:**
```
Base URL: https://graph.facebook.com/v18.0/

Create campaign:
POST /{ad_account_id}/campaigns
{
  "name": "Campaign Name",
  "objective": "OUTCOME_SALES",
  "status": "PAUSED",
  "special_ad_categories": []
}

Create ad set:
POST /{ad_account_id}/adsets
{
  "name": "Ad Set Name",
  "campaign_id": "{campaign_id}",
  "daily_budget": 5000,  // in cents
  "billing_event": "IMPRESSIONS",
  "optimization_goal": "OFFSITE_CONVERSIONS",
  "targeting": { ... },
  "status": "PAUSED"
}
```

### Useful Tools
- Meta Ads Manager: ads.facebook.com
- Meta Ads Library (competitor research): facebook.com/ads/library
- Meta Business Suite: business.facebook.com
- Pixel Helper Chrome extension: for debugging pixel events
- Events Manager: business.facebook.com/events_manager

---

## Google Ads

### What You Need
- Google Ads account (ads.google.com)
- Google Tag Manager (or direct Google Ads tag)
- Google Analytics 4 property linked to Google Ads
- For Shopping/PMax: Google Merchant Center account + product feed

### Account Setup
1. Create Google Ads account at ads.google.com
2. Set billing and payment method
3. Link to Google Analytics 4: Tools & Settings > Linked Accounts > Google Analytics
4. Install conversion tracking: either via GTM or by adding the Google Ads tag to your site
5. Create conversion actions: Tools & Settings > Measurement > Conversions > New Conversion Action

### Granting Agent Access
**Option A — Human-in-the-loop:**
- Agent produces keyword lists, ad copy, and campaign structure in a document
- Human builds in Google Ads Manager

**Option B — API access:**
- Google Ads API requires: Google Cloud project, OAuth 2.0 credentials, developer token (apply via Google Ads account)
- Developer token approval takes 1-5 business days
- Use [Google Ads API](https://developers.google.com/google-ads/api/docs/start) for automated campaign management
- Recommended client libraries: Python (`google-ads`), Node.js (`google-ads-api`)

**OAuth setup for Google Ads API:**
```
1. Go to console.cloud.google.com
2. Create a project, enable Google Ads API
3. Create OAuth 2.0 credentials (Desktop or Web app)
4. Run OAuth flow to get refresh_token
5. Store: client_id, client_secret, refresh_token, developer_token, customer_id
```

### Useful Tools
- Google Ads Manager: ads.google.com
- Google Keyword Planner: Inside Google Ads > Tools > Keyword Planner
- Google Trends: trends.google.com
- Auction Insights: shows how you stack up against competitors in Search
- Google Ads Transparency Center: adstransparency.google.com (competitor research)

---

## TikTok Ads

### What You Need
- TikTok for Business account (ads.tiktok.com)
- TikTok Business Center (business.tiktok.com)
- TikTok Pixel installed on your website
- TikTok Business account (for Spark Ads — boosting organic posts)

### Account Setup
1. Create TikTok for Business account at ads.tiktok.com
2. Set up TikTok Business Center (for agency/multi-account management)
3. Create your TikTok Pixel: Assets > Events > Web Events > Set up TikTok Pixel
4. Install pixel: copy code to `<head>` or via GTM

### Granting Agent Access
**Option A — Human-in-the-loop:**
- Agent produces scripts, copy, targeting specs
- Human builds in TikTok Ads Manager

**Option B — API access:**
- [TikTok Marketing API](https://business-api.tiktok.com/portal/docs)
- Requires app creation in TikTok for Business Developer Portal
- Auth via OAuth 2.0 — get `access_token` for each advertiser
- Required permissions: `Ad Account Management`, `Campaign Management`

### Spark Ads (Boosting Organic Posts)
- Connect your TikTok Business account to your Ads account
- In Ads Manager: Create Ad > Select "Use TikTok Post" > Choose which organic video to boost
- Spark Ads retain comments, likes, and shares from the organic post — builds social proof faster than dark post ads

---

## Analytics and Tracking

### Google Analytics 4 (GA4)

All agents should assume GA4 is the analytics source of truth.

**Setup:**
1. Create GA4 property at analytics.google.com
2. Install GA4 tag via GTM (Google Tag Manager) — recommended
3. Set up key events: `purchase`, `generate_lead`, `add_to_cart`, `begin_checkout`
4. Link to Google Ads (for conversion import)
5. Link to BigQuery (optional, for advanced analysis)

**UTM Parameters (mandatory for all paid traffic):**

Every ad URL must have UTM parameters so GA4 can attribute correctly:

```
utm_source     = facebook | google | tiktok
utm_medium     = paid | cpc | paid_social
utm_campaign   = [campaign name — use naming convention]
utm_content    = [ad name or creative variant]
utm_term       = [keyword — for Search only]
```

Example:
```
https://yoursite.com/product?utm_source=facebook&utm_medium=paid_social&utm_campaign=WIDGET-CONV-COLD-Q1&utm_content=PROBLEMSOL-VIDEO-V1
```

### Tracking Verification

Before any campaign goes live, confirm:

1. Open browser in incognito mode
2. Visit the ad destination URL
3. Complete a test conversion (or use a test mode/sandbox if available)
4. Check: does the event appear in Meta Events Manager? Google Ads conversions? GA4 DebugView?
5. Check: does the UTM source/medium appear in GA4 under Acquisition?

If any of these fail — do not launch. Fix tracking first. Data from a campaign without tracking is unrecoverable.

---

## Reporting Integrations

For automated reporting, the launchperformance agent can pull data from:

**Meta Reporting API:**
```
GET /{ad_account_id}/insights
?fields=spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type,roas
&date_preset=yesterday
&level=adset
```

**Google Ads API Reporting:**
```python
# Using google-ads Python client
query = """
    SELECT
        campaign.name,
        ad_group.name,
        metrics.cost_micros,
        metrics.clicks,
        metrics.impressions,
        metrics.conversions,
        metrics.conversions_value,
        metrics.roas
    FROM ad_group
    WHERE segments.date DURING YESTERDAY
"""
```

**TikTok Reporting API:**
```
GET /open_api/v1.3/report/integrated/get/
{
  "advertiser_id": "...",
  "report_type": "BASIC",
  "data_level": "AUCTION_AD",
  "dimensions": ["ad_id"],
  "metrics": ["spend", "impressions", "clicks", "ctr", "cost_per_result", "result_rate"],
  "start_date": "2024-01-01",
  "end_date": "2024-01-01"
}
```
