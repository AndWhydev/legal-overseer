# BitBit 🤖

> Your AI operations assistant that **acts**, not just recommends.

**Send a voice note. The problem disappears.**

BitBit is an agentic AI assistant for e-commerce operations. It receives messages from any channel (WhatsApp, voice notes, email, SMS), understands what needs to be done, and **acts** — not just recommends. It looks up orders, sends replies, creates tasks, and escalates when uncertain.

## ✨ Key Features

- **Instant Action** — BitBit doesn't just tell you what to do — it does it
- **Policy-Aware** — Every decision follows your business rules
- **Full Transparency** — See every decision, every tool call, every confidence score
- **Multi-Channel** — WhatsApp, Email, Voice Notes, SMS
- **Smart Escalation** — Knows when to act vs when to ask

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Initialize database with seed data
npm run db:init
npm run db:seed

# Start development server
npm run dev
```

Visit:
- `/demo` — Landing page & overview
- `/chat` — Try the chat interface
- `/audit` — View the audit dashboard

## 🎯 Demo Scenarios

| Scenario | Channel | What BitBit Does |
|----------|---------|------------------|
| "Where's my order?" | WhatsApp | Looks up order, sends tracking with ETA |
| "Return my gloves" | Email | Checks policy, drafts return instructions |
| "50 order USPS delay" | Voice | Creates ops task, drafts customer notice |
| "Legal threat" | Any | Immediately escalates, no auto-reply |

## 🏗️ Architecture

```
[Message Input] → [BitBit Agent] → [Mock Services] → [Audit Log]
                       │
                       ├── Claude SDK (intelligence)
                       ├── Policy Engine (CLIENT-PACK.md)
                       ├── Tool Calls (7 tools)
                       └── Confidence Routing (act/ask/escalate)
```

## 🛠️ Tech Stack

- **Framework**: Next.js 15, React 19
- **Database**: SQLite (better-sqlite3)
- **AI**: Claude SDK (@anthropic-ai/sdk)
- **Styling**: Tailwind CSS v4

## 📊 Confidence Routing

| Confidence | Action | Example |
|------------|--------|---------|
| ≥80% | **ACT** — Execute automatically | Simple WISMO with clear tracking |
| 50-80% | **ASK** — Request approval | Return request, need confirmation |
| <50% | **ESCALATE** — Human required | Legal threat, policy edge case |

## 📁 Project Structure

```
├── app/
│   ├── demo/          # Landing page
│   ├── chat/          # Chat interface
│   ├── audit/         # Audit dashboard
│   └── api/agent/     # Agent endpoint
├── lib/
│   ├── agent/         # Agent core logic
│   ├── services/      # Mock service layer
│   └── policies.ts    # Policy loader
├── data/              # SQLite database
├── scripts/           # DB init & seeding
└── .planning/         # Project documentation
```

## 🔧 Configuration

Create `.env.local`:
```env
ANTHROPIC_API_KEY=sk-ant-api03-...
```

## 📜 License

Private — BitBit © 2026

---

Built with ❤️ by BitBit · Powered by Claude AI
