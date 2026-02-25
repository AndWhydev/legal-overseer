# Client Pack v0 — CheekyGlo

**Purpose:** Policy truth source for BitBit. All recommendation logic, draft responses, and decision guidance must align with these rules.

---

## Company Identity

- **Brand name:** CheekyGlo (AU self-care brand; founded 2020)
- **Founders/key operators:** Xixi Liu and Allen Fu
- **Primary site:** cheekyglo.com (+ US storefront exists)
- **Support email:** hello@cheekyglo.com
- **Social channels:** Facebook, Instagram, TikTok, YouTube, Pinterest

---

## People, Roles, and Approval Rights

### Xixi Liu
**Owns:**
- Customer support email
- Internal/team emails
- Content pipeline approvals (organic + paid)
- Brand voice
- Product education and sensitive skin guidance

### Allen Fu
**Owns:**
- Operations
- Stock/warehouse/logistics issues
- Expo planning
- Fulfillment exceptions
- "Ops severity" decisions

### Delegation Rules

**BitBit can auto-resolve (no approval needed):**
- Standard "where is my order" with valid tracking (just provide status)
- Product usage questions with documented answers
- Routing to correct owner

**Requires one-tap approval:**
- Customer reply drafts
- Content approvals
- Refund/credit decisions within policy
- Stock decisions within normal parameters

**Must escalate immediately:**
- Legal threats
- Chargebacks
- Safety complaints
- Influencer contract disputes
- Policy edge cases

---

## Customer Support Policies

### Shipping Policy

**Processing time:** 1-2 business days (excluding weekends/holidays)

**Shipping zones:** AU tracked/express + international zones (updated 6 Dec 2024)

**Address accuracy:** Not responsible for lost/misdelivered if customer entered address incorrectly

**Delivery claims:**
- If tracking says "delivered" but customer didn't receive: must contact within **10 days**
- Claims can take up to **30 days** to process
- No refunds/credits for packages carrier confirms as delivered

**Free shipping thresholds:**
- AU: Free standard over $80, free express over $180
- NZ: Free over $160 AUD
- USA/CA: Free over $200 AUD

**Non-refundable:** Shipping fees are non-refundable

**Refused shipments:** Shipping + return cost deducted from credit

### Refund/Returns Policy

**Return window:** 30 days from purchase

**Conditions:**
- Must be in original packaging/condition
- Unused/unopened only
- Customer pays return shipping
- Must email hello@cheekyglo.com with order number to start

**Non-returnable:**
- Sale items
- Gift cards
- Used/opened products

**Change of mind (before shipment):** Store credit only

**Subscription cancellation:** No refunds if cancelled before 3-cycle / 24-week cycle

### Shipping Insurance / Stolen Parcel Handling

**Lost/damaged/stolen claims require:**
- Order + shipping details
- Photos (if damaged)
- Carrier documentation
- Resolution within 7 days after investigation

**Delivered then stolen:**
- Without insurance: Not responsible
- With insurance: May require carrier investigation/police report

---

## Product Knowledge

### Exfoliating Glove Usage Instructions

**How to use:**
1. Soak/steam skin at least 5 minutes
2. Don't apply soaps/lotions (relies on friction)
3. Wet glove and squeeze excess water so it's damp
4. Use firm, consistent strokes

**Disclaimers:**
- Visible peeling varies by skin type
- Freshly exfoliated skin is sensitive
- Avoid heavily fragranced products right after
- Sensitive-glove option available for very sensitive skin/conditions

---

## BitBit Workstreams

### A) Xixi Queue (Customer + Team + Content)

#### Customer Email Triage Categories

| Category | BitBit Action | Key Info Needed |
|----------|---------------|-----------------|
| "Where is my order?" | Auto-draft with tracking status | Order #, tracking # |
| "Delivered but not received" | 10-day claim rule; gather details | Order #, delivery date, address |
| Missing item in parcel | Request photo + details | Order #, missing product, photo |
| Damaged/wrong item | Request photo, contact immediately | Order #, photo, description |
| Returns/refunds | 30-day window check, policy validation | Order #, purchase date, reason |
| Wholesale/distributor | Collect business info | Quantity, business name |
| Media/interview requests | Route to owner | Subject, outlet, deadline |
| Product usage questions | Answer from knowledge base | Product, specific question |

#### Content Approval Queue

For each item, BitBit outputs:
- **What it is** (campaign, UGC, post, ad)
- **Target platform**
- **Goal**
- **Key claims**
- **Risk flags** (compliance wording, before/after claims, sensitivity disclaimers)
- **Suggested tweaks**
- **One-click approve/reject + notes**

### B) Allen Queue (Ops + Stock + Expos)

#### Ops Triage Categories

| Category | BitBit Action |
|----------|---------------|
| Stockouts/backorders | Partial-ship decision brief |
| Carrier delays/escalations | Claim tracking (10-day window, 30-day completion) |
| Warehouse/packer issues | Create action ticket |
| Expo planning | Checklist + deadline tracking |
| Replenishment reminders | Alert with lead times |

---

## Data Objects (Schema Reference)

### Customer Support Thread
```
- customer_name
- customer_email
- order_number
- tracking_number
- order_date
- destination_country_zone
- delivery_status: processing | shipped | in_transit | delivered
- issue_category
- photos_attachments[]
- has_shipping_insurance: boolean
```

### Returns/Refunds
```
- return_reason
- unopened_unused_confirmed: boolean
- purchase_date
- delivery_date
- items[]
- desired_outcome: refund | store_credit
```

### Content Approval
```
- asset_link
- platform
- publish_date
- objective
- claims_offer
- required_disclaimers[]
- brand_voice_notes
- stakeholder_approvals_needed: xixi_only | both
- decision: approved | rejected | needs_changes
- rationale
```

### Ops/Expo
```
- inventory_sku
- on_hand_qty
- inbound_etas[]
- stockout_risk_date
- expo_event_name
- expo_date
- expo_location
- booth_requirements
- shipping_to_expo_deadline
- suppliers_packers_contact
```

---

## Seed Data Spec (Demo)

**Customer email threads:** 30-50 total
- Mix across all triage categories
- Some with photos, some missing tracking # (so BitBit asks)
- Include edge cases (10-day claim boundary, insurance vs no insurance)

**Content approval queue:** 10 items
- Mix of "safe approvals" and "needs edits"
- Include compliance edge cases (before/after claims, skin condition claims)

**Ops tickets:** 10 items
- Stockout decisions
- Expo deadlines
- "Delivered but stolen" case (shows policy-aware handling)

---

*Last updated: 2026-01-29*
