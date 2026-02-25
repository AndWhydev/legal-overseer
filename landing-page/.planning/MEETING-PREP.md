# CheekyGlo + BitBit Demo — Meeting Prep

**Meeting:** Teams call with Andy + CheekyGlo  
**When:** Fri Jan 30, 9:00 AM AEST  
**Duration:** ~30-60 min expected  
**Demo URL:** http://localhost:3000/demo (run `npm run dev` in /tmp/bitbit-demo)

---

## 🎯 Meeting Objective

Show Xixi how BitBit can handle her customer support load — with her actual products, policies, and scenarios. Get her excited about the potential, then scope a pilot.

---

## 👤 Who's CheekyGlo?

- **Founded:** 2020, Australian self-care brand
- **Product:** Exfoliating gloves (went viral), body brushes, skincare tools
- **Scale:** 132,000+ customers, DTC ecommerce (Shopify)
- **Founders:** Xixi Liu (brand/support) + Allen Fu (operations)
- **Support volume:** Likely 30-50+ daily customer messages across email/WhatsApp

**Pain points (educated guess):**
- WISMO ("where is my order?") — probably 40%+ of volume
- Returns/refunds — 30-day window, lots of questions
- Product questions — "which glove for sensitive skin?"
- After-hours coverage — customers don't wait for business hours
- Scaling — can't hire fast enough

---

## 🚀 Demo Flow (Suggested)

### 1. Hook (2 min)
> "What if 80% of your customer messages could be handled automatically — correctly, following your policies, 24/7?"

Show the landing page (`/demo`):
- The value prop
- The ROI numbers (time/cost savings)
- The "how it works" flow

### 2. The Magic Moment (5 min)
Jump to `/chat` and show a live scenario:

**Scenario 1: WISMO (their biggest pain)**
```
Customer: "Hey, where's my order? Order number CG-10001"
```
→ Watch BitBit look it up, find tracking, and draft a response
→ Show the audit trail — WHY it made that decision

**Scenario 2: Returns**
```
Customer: "I want to return my exfoliating gloves, I bought them 3 weeks ago"
```
→ Watch BitBit check the 30-day policy, confirm eligibility
→ Note: BitBit knows YOUR policies (show CLIENT-PACK.md reference)

**Scenario 3: Escalation (the trust builder)**
```
Customer: "I'm going to sue you! This is unacceptable!"
```
→ Watch BitBit immediately escalate, NOT auto-reply
→ This is KEY — shows BitBit knows its limits

### 3. The Audit Trail (3 min)
Jump to `/audit`:
- Show session history
- Click into a session — show the decision tree
- Highlight: "This is how you KNOW what it did and why"

### 4. The Policies (2 min)
Briefly mention:
- BitBit is trained on their CLIENT-PACK (returns, shipping, escalation rules)
- They control the rules — BitBit follows them
- New policies? Update the pack, BitBit learns

### 5. ROI Discussion (3 min)
> "You have ~500 customer interactions per week. If BitBit handles 70%..."

- 350 conversations × 3 min avg = ~17 hours/week saved
- At $30/hr support cost = $510/week = **$2,000/month savings**
- Plus: 24/7 coverage, instant responses, consistent quality

### 6. Next Steps (2 min)
- **Option A: Pilot** — 2-week trial with real messages, measured results
- **Option B: Custom build** — Full integration with Shopify, Gorgias, WhatsApp

---

## 💬 Key Talking Points

### For Xixi (brand/support focus):
- "Your brand voice stays YOUR brand voice — BitBit learns from your tone guide"
- "Sensitive topics (legal, angry customers) always escalate to you"
- "You approve responses before they go out — until you trust it"

### For Allen (ops focus):
- "Stock alerts, shipping delays, fulfillment issues — BitBit routes to you automatically"
- "The audit trail means you can always trace what happened"
- "Integration with your existing tools (Shopify, Gorgias, etc.)"

### For Andy (partner/sales focus):
- "This is a productized offering — can deploy to other AWU clients"
- "Recurring revenue model: setup fee + monthly"
- "Built on Claude (same AI as ChatGPT-level)"

---

## ⚠️ Objections & Responses

**"What if it says something wrong?"**
> "Every response requires approval until you're confident. The audit trail shows exactly why it made each decision. And escalation rules mean it asks when unsure."

**"We already have Gorgias/Zendesk"**
> "BitBit integrates with those. Think of it as the brain that sits on top — reads the message, decides what to do, drafts the response. Your existing tools still handle ticketing and workflow."

**"How does it know our policies?"**
> "We train it on your policy document. Returns, shipping, FAQs — it knows your rules. Show them CLIENT-PACK.md."

**"What about weird edge cases?"**
> "That's what escalation is for. BitBit has a confidence score for every decision. Below threshold? It asks you."

**"Is our data safe?"**
> "Messages are processed, not stored long-term. Audit logs for 90 days. Can discuss self-hosted options if needed."

---

## 🔧 Technical Setup

**Before the call:**
```bash
cd /tmp/bitbit-demo
npm run dev
```
Demo runs at `http://localhost:3000`

**Key URLs:**
- `/demo` — Landing page (start here)
- `/chat` — Live demo interface
- `/audit` — Audit dashboard

**If something breaks:**
- Refresh the page
- Check terminal for errors
- Fallback: walk through screenshots

---

## 📝 Post-Meeting Action Items

Depending on outcome:
- [ ] Send follow-up email summarizing discussion
- [ ] Share demo link (if they want to play with it)
- [ ] Draft proposal for pilot program
- [ ] Schedule technical deep-dive if they want integration details

---

## 🎤 Tor's Opener Suggestion

> "Andy's told me about CheekyGlo — incredible growth, viral products. I've been working on something I think could really help with the support side. Let me show you what it does, then you tell me if it fits what you need."

Simple. Confident. Gets straight to the demo.

---

*Prep doc created by Clawd — good luck tomorrow!*
