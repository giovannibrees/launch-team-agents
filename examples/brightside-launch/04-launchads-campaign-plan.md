# launchads → Campaign Plan: Brightside

*Output from `launchads`. This is a **spec**. Nothing is built live and nothing
spends until the owner approves (see the approval request at the bottom). All
campaigns are specced `PAUSED`. — per `human-approval-policy.md`.*

**Budget:** $20,000 / 30 days · Target 3.0x ROAS · Floor 2.5x
**Split:** Meta 55% ($11K) · Google 25% ($5K) · TikTok 15% ($3K, **on hold**) ·
YouTube 5% ($1K)

---

## Meta (~$367/day · 70% prospecting / 30% retargeting)

```
Campaign 1: Prospecting — CBO, Conversions/Purchase  [PAUSED]  ~$257/day
├── Ad Set A: Broad (no interest, let Meta optimize)
├── Ad Set B: Interest — sleep/wellness (Sleep, Meditation, Wellness brands)
├── Ad Set C: Interest — home/lifestyle (Interior design, smart home)
└── Ad Set D: Lookalike 1% (from IG engagers + pixel PageViews)

Campaign 2: Retargeting — CBO  [PAUSED]  ~$110/day
├── Ad Set A: Website visitors, 7 days
├── Ad Set B: Visitors 14/30 days + IG engagers 30 days
└── Ad Set C: Add-to-cart, not purchased
```
- Objective: Conversions (Purchase). Attribution 7-day click / 1-day view.
- Placements: Automatic to start. Exclude past purchasers from prospecting.
- Creative: Versions A/B/C from launchcreative; rotate at frequency > 3.0.
- ⚠️ Pre-submission compliance check passed (no medical claims / personal
  attributes) — `ad-policy-compliance.md`.

## Google (~$167/day)

```
Campaign: Brand        [PAUSED]  — "brightside" terms (cheap, high intent)
Campaign: Category     [PAUSED]  — "wake up light", "sunrise alarm clock"
Campaign: Competitor   [PAUSED]  — bid on competitor terms; NO competitor TM in copy
```
- Bid strategy: Maximize Conversions for launch (<50 conv); move to Target CPA
  later. Negatives: "free", "DIY", "how to make".
- Needs Google conversion tracking set up first (currently No — see flag below).

## TikTok — ON HOLD ⏸️
Account + pixel not live. $3K/day-equivalent stays unallocated. If TikTok isn't
live by end of week 1, recommend reallocating to Meta prospecting.

## YouTube (~$33/day)
The 40s demo against sleep/morning-routine content; brand+category audiences.

## Naming convention
```
Campaign: BRIGHTSIDE-CONV-COLD-2026Q3
Ad Set:   META-BROAD-257D   ·   META-LAL1-PROSPECT
Ad:       OPPOSITE-ALARM-VIDEO-V1
```
Shared with launchperformance so reporting maps correctly.

---

## ⚠️ Blockers before go-live
1. **Google conversion tracking is not set up** — launchperformance must verify
   Purchase conversion + GA4 import before Google spends. (Hard blocker.)
2. **TikTok account/pixel** not live — channel held.

## APPROVAL NEEDED → launchteam → owner
```
ACTION: Launch Meta + Google campaigns above, total ~$534/day (~$16K over 30
        days), starting on the go-live date. TikTok held; YouTube starts with Meta.
WHY NOW: Strategy + creative approved; assets ready; pixel live for Meta.
COST/EXPOSURE: Up to ~$534/day. Reversible (pause anytime). Floor 2.5x ROAS;
        any ad set below floor for 3+ days gets cut.
IF APPROVED: I build everything PAUSED, launchperformance verifies tracking,
        then a human flips Meta live. Google waits on its conversion tracking.
IF DECLINED / NO RESPONSE: Everything stays PAUSED. Nothing spends.
```
