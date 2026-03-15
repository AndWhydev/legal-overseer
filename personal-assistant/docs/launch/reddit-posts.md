# BitBit -- Reddit Launch Posts

---

## r/SaaS Post

**Title:** We spent 8 months building an AI ops platform inside a real agency before launching. Here is what we learned.

**Body:**

Hey r/SaaS. Long-time lurker, first time posting about something I have built.

**Background**: My co-founder Andy runs a digital marketing agency in Australia (All Webbed Up). I handle the technical side. About 8 months ago we started building BitBit -- an AI operations platform -- but instead of building in isolation, we deployed it inside his agency from day one. Real clients, real money, real consequences.

**The problem we solved**: Andy was spending 25+ hours per week on operations. Email triage across Gmail, Outlook, WhatsApp. Chasing invoices. Following up on leads that came through 5 different channels. Writing proposals that took 2-4 hours each. He hired people to do the work he is good at, but the admin scaled linearly with every new client.

**What BitBit does**: It deploys specialist AI agents that own entire operational domains. Lead qualification, invoicing, client communications, proposals, tender hunting. Not a chatbot that waits for instructions -- these agents operate autonomously within defined policies.

**The key numbers from the AWU deployment:**

| Metric | Before | After |
|--------|--------|-------|
| Lead response time | Hours to days | Under 2 minutes |
| Leads lost per month | "Several" (Andy's word) | Zero |
| Invoice turnaround | Days after project completion | Same day |
| Proposal creation | 2-4 hours | Under 30 minutes |
| Andy's ops time per week | ~25 hours | Under 5 hours |

**Technical decisions that worked:**
- Confidence-based action routing: above 80% confidence the agent acts autonomously. 50-80% it asks for approval via WhatsApp. Below 50% it escalates immediately. This built trust incrementally.
- Per-agent pricing instead of per-seat. An agency might use 10 agents. A plumber might use 2. Pricing scales with value, not headcount.
- Built the memory system (Total Recall) to work across channels. One conversation thread per person, whether they reach you on WhatsApp, email, or SMS. This turned out to be the feature people notice most.
- Pre-compiled context instead of search-and-retrieve. BitBit builds understanding when information arrives, not when you ask a question. Makes responses feel immediate.

**What did not work (at first):**
- We originally tried to build everything as one monolithic agent. Splitting into specialists with clear domain boundaries was a turning point.
- Voice profiles took three iterations. Getting the AI to write in Andy's actual voice (casual, direct, Australian) required real example data, not just descriptions.
- WhatsApp Business API setup was painful. Meta's process is not designed for small developers.

**Stack**: Next.js 16, React 19, Supabase (Postgres), Anthropic Claude (tiered: Haiku for classification, Sonnet for drafting, Opus for strategy), Fly.io workers, Cloudflare edge cron. 67 database migrations. 1,462 tests passing.

Happy to answer questions about the architecture, pricing model, or deployment strategy. We are live at bitbit.chat.

---

## r/artificial Post

**Title:** Building pre-compiled context for AI agents: why retrieval-augmented generation was not enough for our use case

**Body:**

I have been building BitBit, an agentic AI operations platform, for the past 8 months. Want to share a technical approach that made a significant difference: pre-compiled context versus retrieval-at-query-time.

**The standard approach**: User asks a question. System searches a vector database. Retrieved chunks get stuffed into the prompt. LLM generates a response. This works for Q&A but breaks down when agents need to understand relationships between entities across time.

**The problem**: Our platform manages business operations across email, WhatsApp, SMS, invoicing, and CRM data. When an email arrives from "Dave at Henderson Construction", a typical RAG system would need the user to ask a question before it retrieves Dave's contact record, his payment history, the open invoice, and the WhatsApp conversation from last week. That is 4-5 retrieval calls, with no guarantee the chunks connect meaningfully.

**Our approach -- Context Baseplate**: When new information arrives (email, message, webhook), we immediately:

1. Extract entities (people, companies, projects, financial amounts)
2. Resolve identity across channels (dave@henderson.com.au = the Dave who messaged on WhatsApp = the Dave linked to Invoice #847)
3. Build relationship edges in an entity graph (Dave -> works at -> Henderson Construction -> has project -> Kitchen Renovation -> has invoice -> #847)
4. Detect patterns (Dave's average payment timing, preferred communication channel, response latency)
5. Update active thread tracking (what conversations are in-flight, who is waiting on whom)

By the time anyone asks about Dave, the context is already compiled. No retrieval latency. No fragmented chunks. The entity graph gives the LLM structured, connected context instead of a pile of text snippets.

**Memory architecture**: We use a three-tier conversation compression system:
- Last 10 turns: verbatim
- Turns 11-30: compressed summary (Haiku model, cheap)
- Turns 31+: distilled to key facts (commitments, decisions, deadlines, financial amounts)

This keeps the context window manageable while preserving the information that actually matters for business operations.

**Tool orchestration**: With 25+ tools available, we use a fast planner (Haiku) to select only relevant tool groups per request. A query about sending an email loads contact and communication tools. A query about invoicing loads finance tools. This achieves 90-95% KV cache hit rates and keeps the agent focused.

**Model routing**: Not every task needs the same model. We route by complexity:
- Haiku (70% of calls): Classification, routing, triage
- Sonnet (25%): Drafting, CRUD, data extraction
- Opus (5%): Strategy, proposals, complex reasoning
- Gemini Flash: Background monitoring (cheapest tier)

Cost optimization matters when agents are running continuously, not just responding to chat messages.

The system is deployed in production handling real business operations. 67 database migrations, 1,462 tests, running on Supabase + Fly.io + Cloudflare Workers.

Curious what approaches others are taking for persistent agent context. The "compile on arrival" pattern has been the biggest lever for us, but I am sure there are tradeoffs I am not seeing at our current scale.

---

## r/smallbusiness Post

**Title:** I built an AI assistant for my business partner's agency. It cut his admin time from 25 hours to 5 hours per week. Here is what it actually does.

**Body:**

My business partner Andy runs a digital marketing agency in Australia. Like every small business operator I know, he spends most of his time on admin instead of the work clients actually pay for.

Email triage across Gmail and Outlook. Chasing invoices through Xero. Following up on leads that come through WhatsApp, website forms, Facebook, and email. Writing proposals that take half a day each. Sending client updates. Managing tasks across Asana and ClickUp.

He said to me one night: "I hired people to do the creative work. But nobody handles the operations. I need an employee that just does the admin."

So we built one.

**BitBit** is an AI system that deploys specialist agents for different parts of business operations:

**Lead Swarm**: Monitors all incoming channels. When a potential lead emails or messages, BitBit responds with an acknowledgment in under 2 minutes, qualifies them, and books a call. Before BitBit, leads would sit unanswered for hours or days. Andy estimates he was losing several leads per month just from slow response times.

**Invoice Flow**: When a project is done, Andy messages BitBit on WhatsApp: "invoice Dave for the kitchen job." BitBit knows Dave, knows the project, generates a branded PDF invoice with correct payment terms, and sends it. If it is not paid after 7 days, BitBit sends a friendly reminder. After 14 days, a firm one. Andy used to forget to invoice for days after finishing work.

**Channel Triage**: Reads everything coming in across all channels and sorts it by priority. Gives Andy a daily digest: "Here is what needs your attention today." No more missing an important client email because it got buried under newsletters.

**Client Comms**: Drafts replies in Andy's voice. Not generic corporate speak -- his actual communication style. "Hey mate," not "Dear valued client." Clients cannot tell the difference.

**The bit that surprised us most**: BitBit remembers everything across every channel. If a client mentions something on WhatsApp on Monday, then emails about it on Wednesday, BitBit connects both. One conversation, one context, regardless of which app they used. That turned out to be the feature Andy values most.

**What it costs**: We price per agent, not per seat. A full agency setup with all 10 agents costs a fraction of hiring even a part-time admin person. A tradie who just needs invoicing and message triage pays much less.

**The honest bit**: It is not perfect. The first month had rough edges. Andy had to correct a few drafts. The confidence routing (where BitBit decides whether to act alone or ask Andy first) needed tuning. But after 8 months of running in production, it handles 90%+ of routine operations correctly without intervention.

If you run a service business, agency, or trades company, this was built for people like you. We are at bitbit.chat.

Happy to answer questions about what it can and cannot do. Not going to oversell it -- I would rather under-promise and have people be pleasantly surprised.
