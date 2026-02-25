# BitBit Demo Cheat Sheet 🎯

**Quick ref during the call — keep this open!**

---

## 🚀 Start Demo
```bash
cd /tmp/bitbit-demo
export PATH="/opt/homebrew/bin:$PATH"
npm run dev
```
Open: **http://localhost:3000**

---

## 📍 Demo URLs

| Page | URL | What It Shows |
|------|-----|---------------|
| Landing | `/demo` | Value prop, ROI, scenarios |
| Chat | `/chat` | Live demo interface |
| Audit | `/audit` | Decision history |

---

## 🎭 Demo Scenarios (Copy-Paste Ready)

### 1. WISMO (Where Is My Order)
```
Where is my order? My order number is CG-10003
```
*BitBit will: Look up order → Find tracking → Send delivery status*

### 2. Return Request (Eligible)
```
I want to return the exfoliating gloves I bought 2 weeks ago, they're still sealed
```
*BitBit will: Check 30-day policy → Confirm eligibility → Draft return instructions*

### 3. Return Request (Ineligible - Used)
```
Can I return my gloves? I've used them a few times but I don't like them
```
*BitBit will: Check policy → See "used" = ineligible → Explain policy politely*

### 4. Product Question
```
Which glove is best for sensitive skin? I have eczema
```
*BitBit will: Reference product knowledge → Recommend Sensitive Skin Glove*

### 5. Shipping Question
```
How much is shipping to New Zealand?
```
*BitBit will: Check shipping policy → Free over $160 AUD to NZ*

### 6. Escalation Trigger ⚠️
```
This is absolutely unacceptable! I'm contacting my lawyer and posting everywhere about this!
```
*BitBit will: Detect threat → Immediately escalate → NO auto-reply*

---

## 📊 Key Stats to Mention

- **Response time:** <15 seconds vs 4-24 hour human average
- **WISMO volume:** Usually 40%+ of support tickets
- **Cost per ticket:** ~$5-10 human vs ~$0.10 BitBit
- **Coverage:** 24/7/365

---

## 💬 Objection Handlers

**"What if it makes mistakes?"**
> Every response needs approval. The audit trail shows exactly why each decision was made. And it knows when to escalate.

**"We already have Gorgias"**
> BitBit integrates on top. It's the brain that reads, decides, drafts. Gorgias handles ticketing.

**"How long to set up?"**
> Pilot in 1-2 weeks. Full integration depends on your stack. Usually 2-4 weeks.

**"What about our brand voice?"**
> We train it on your tone guide. Show them the CLIENT-PACK.md concept.

---

## 🔑 Key Order IDs for Demo

| Order | Status | Good For |
|-------|--------|----------|
| CG-10003 | In Transit | WISMO demo |
| CG-10005 | Delivered | Delivery confirm |
| CG-10008 | Delayed | Delay handling |
| CG-10010 | Processing | Return eligible |
| CG-10012 | Returned | Return complete |

---

## 🎤 Opening Line Suggestion

> "I've built something I think could save you 20+ hours a week on customer support. Let me show you — it'll take 5 minutes."

---

*Good luck! 🍀*
