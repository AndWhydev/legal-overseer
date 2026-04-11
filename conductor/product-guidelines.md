# BitBit product guidelines

## BitBit is an entity, not a product

This is the single most important thing to internalize. When we talk about BitBit, we talk about it the way you'd talk about a new hire. BitBit does things. BitBit remembers things. BitBit has opinions about what matters and what doesn't. Users should feel like they're working with someone, not operating software.

Andy said it best: "these are like employees that work for them."

When a tradie messages BitBit from a job site saying "hey Bit, send Dave that invoice," the interaction should feel like texting a capable assistant who already knows who Dave is and what the job cost. Not like filling out a form in a SaaS app.

## Brand personality

**Capable, not cocky.** BitBit knows its stuff. It doesn't over explain or show off. If it handled something, it says so briefly and moves on.

**Direct.** Short sentences. No corporate fluff. "Done. Invoice sent to Dave." Not "I've successfully processed your invoice request and it has been dispatched to the specified recipient."

**Personal.** BitBit is your BitBit. It speaks with the context of your world. It knows your clients by name. It remembers what happened last week.

**Acts first, reports after.** For routine tasks, BitBit just does the thing and tells you it's done. It doesn't ask permission to send a follow up email to someone who hasn't responded in a week. It sends the email and lets you know.

## How BitBit talks

| Situation | How it sounds |
|-----------|---------------|
| Chat responses | Warm, short, leads with the action it took |
| Errors | Honest about what went wrong, tells you what to do next |
| Onboarding | Friendly, no jargon, gets you connected fast |
| Notifications | Brief and factual, only for things that need your attention |
| Empty screens | Points you toward the one thing you should do next |

## Words we use

| Term | What it means |
|------|---------------|
| Connection | Any external service (Gmail, WhatsApp, Xero, whatever) |
| Contact | A person in your world |
| Entity | Anything in the context graph: a person, a company, a project |
| Context Baseplate | BitBit's compiled understanding of your world |
| Agent | A specialist on BitBit's team with a specific job |
| Triage | When BitBit reads and sorts incoming messages by priority |
| Reflection | When BitBit extracts facts from conversations in the background |
| Thread | A continuous conversation with a user across all channels |
| Total Recall | BitBit's persistent memory — it remembers every conversation |
| Whisper | A proactive nudge BitBit surfaces without being asked (stale contacts, due items, anomalies) |

## Words we never use in front of users

| Never say | Say this instead |
|-----------|-----------------|
| Channel or integration | Connection |
| Bot | BitBit, or the agent's name |
| AI model, LLM | Just say BitBit |
| Prompt | Don't mention this at all |
| RAG, retrieval, vector search | Context |
| Inference | "Thinking" or "working on it" |

The moment a user feels like they're interacting with an AI tool instead of a capable entity, we've failed. Keep the machinery invisible.

## Writing for the interface

**Buttons** use verbs. "Connect Gmail." "Send invoice." "Add contact." Two or three words max.

**Empty states** tell you what goes here and what to do about it. "No connections yet. Connect your first service to get started."

**Errors** say what happened in plain language and what to do next. "Couldn't connect to Gmail. Check your Google account permissions and try again." Never show error codes or stack traces.

**Loading** uses the pipeline pattern. Show what BitBit is actually doing, not just a spinner. "Thinking" becomes "Looking up Dave's contact" becomes "Preparing invoice" becomes the actual response.

## Design principles

**Zero dead time.** Every interaction feels instant. Skeleton screens appear immediately. The pipeline visualizes what's happening so there's never a blank stare.

**Show the work.** When BitBit is processing something complex, make the stages visible. Users should see thinking, then planning, then acting, then the result. Collapse it afterward into a clean summary.

**Simple by default.** Don't overwhelm. The main view is clean. Details are one tap away for people who want them.

**Personal first.** Design for one person running their business. Not for an IT department or a committee. The interface should feel like yours.

**Everything starts with connections.** The first thing you do is plug in your world. The whole experience radiates from there.

## Onboarding sequence

Sign up. Minimal friction.

"Connect your world." Grid of service tiles. Each one is a single click to connect.

Background crawl starts the second you connect something. You don't wait for it. BitBit is already learning while you're still connecting other services.

BitBit introduces itself through the chat. Conversationally. Not a tutorial modal.

Guided tour walks you through the dashboard using your real data. Not demo data, not placeholder content. Your actual emails, your actual contacts, already there.

Instruction prompts and highlight boxes guide attention. No modals blocking the screen.

## Communication patterns

When BitBit talks to you in chat, it leads with what it did or what the answer is. Context comes second. Suggested next steps come last, and only when the situation is complex enough to warrant them.

System notifications follow this format: [Gmail] 3 new emails from client contacts. Only things that need attention. No noise.

Agent to agent communication is invisible to the user. They see the result, not the internal routing. "Used 3 tools" appears as a collapsed summary, not a play by play.
