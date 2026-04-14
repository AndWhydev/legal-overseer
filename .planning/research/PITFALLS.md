# Domain Pitfalls: v3.0 Cognitive Omniscience

**Domain:** Cognitive intelligence features for LLM-based agentic AI assistant
**Researched:** 2026-04-14
**Confidence:** MEDIUM-HIGH

---

## Critical Pitfalls

Mistakes that cause rewrites, cost blowouts, or user trust destruction.

### Pitfall 1: Hallucinated Causal Links

**What goes wrong:** The LLM extracts causal edges that don't exist. "Client churned BECAUSE invoice was late" when the actual cause was a competitor offer. Once stored in the graph, hallucinated causal edges propagate through chain tracing and counterfactual reasoning, producing confidently wrong explanations. The causal graph becomes a misinformation amplifier.

**Why it happens:** LLMs are narrative-completion machines. Given two temporally proximate events, they default to "A caused B" because that makes a good story. Business conversations are full of post-hoc rationalizations that aren't actual causal links. The extraction prompt asks "identify causal relationships" and the LLM obliges -- even when the evidence is weak.

**Consequences:**
- Root cause analysis returns wrong causes, leading to bad business decisions
- Counterfactual reasoning built on false edges produces plausible-sounding nonsense
- User trusts the causal explanation, acts on it, gets burned, loses trust in BitBit permanently

**Prevention:**
1. **Evidence threshold for causal edges:** Require at least 2 independent signals before creating a CAUSES edge. Single-mention causal claims get stored as `CORRELATES_WITH` (weaker edge type) until corroborated.
2. **Confidence scoring on causal edges:** Every causal edge gets a `confidence` field (0-1). Display to user: "Likely cause (62% confidence)" vs "Confirmed cause (94% confidence)". Never present low-confidence causal links as facts.
3. **Causal edge decay:** Uncorroborated causal edges decay faster than corroborated ones. Set decay_rate 2x for single-evidence edges. The neural_decay_batch already handles this -- just configure different rates.
4. **Human-in-the-loop for novel causal claims:** First time a new causal pattern appears (not matching a seeded template), flag it for user confirmation before using in chain tracing. "I noticed the late delivery might have contributed to losing Morrison. Does that seem right?"
5. **Causal templates as priors, not constraints:** The 20-30 seeded causal templates should bias extraction toward known patterns, but not prevent novel extraction. Use templates to boost confidence of matching extractions, not to filter.

**Detection:** Monitor causal edge creation rate. If extraction produces >5 causal edges per conversation, the prompt is too aggressive. Check user correction rate on surfaced causal explanations.

**Phase:** Causal Reasoning (Phase 4). Must be addressed in initial prompt design and edge type schema.

---

### Pitfall 2: LLM Token Cost Explosion from Cognitive Extraction

**What goes wrong:** Each cognitive feature adds LLM calls to the consolidation pipeline. Theory of Mind needs Sonnet to assess belief states. Causal extraction needs Sonnet for each signal batch. Active Learning needs Sonnet for question generation. Metacognition needs Haiku for self-assessment. Stacked across all entities and all signals, costs multiply from $10/month to $200+/month.

**Why it happens:** Each feature is designed in isolation and looks cheap ("just one Sonnet call per entity update"). But BitBit processes hundreds of signals daily across dozens of entities. 50 entities x 5 cognitive extractions x $0.003/call = $0.75/pipeline-run. Run 10x/day = $7.50/day = $225/month. Per org.

**Consequences:**
- Monthly LLM costs exceed infrastructure budget ($70/mo target)
- Forced to disable features or throttle processing, degrading the omniscience promise
- Retroactive cost optimization is harder than building cost-aware from the start

**Prevention:**
1. **Batch extraction:** Don't run one LLM call per cognitive feature per entity. Design a SINGLE extraction prompt per consolidation tier that extracts beliefs, causal links, anomalies, and goals in one call. "Given these signals for entity X, extract: (a) belief state updates, (b) causal relationships, (c) anomaly indicators, (d) goal mentions." One Sonnet call instead of four.
2. **Tiered model routing (enforce it):** Haiku for temporal extraction, anomaly explanation, metacognitive scoring. Sonnet ONLY for Theory of Mind, causal reasoning, and goal decomposition. Never Opus for background extraction.
3. **Delta processing:** Only run cognitive extraction on NEW signals since last consolidation, not the full entity history. The Knowledge WAL already supports cursor-based consumption -- use it.
4. **Entity importance gating:** Run full cognitive extraction only for entities with activity in the last 7 days. Dormant entities get cognitive updates only when directly queried. Track `last_activity_at` on entity_nodes.
5. **Token budget per consolidation run:** Hard cap at X tokens per pipeline execution. If budget exhausted, queue remaining entities for next cycle.

**Detection:** Track LLM cost per consolidation run from day 1. Alert if cost/run exceeds $0.50. Dashboard widget showing daily cognitive extraction cost.

**Phase:** Foundation (Phase 1). Cost architecture must be established before any cognitive features ship.

---

### Pitfall 3: Belief Ledger Staleness (Theory of Mind Drift)

**What goes wrong:** The belief ledger says "Sezer doesn't know the invoice was paid" but Sezer was told via phone (a channel BitBit doesn't monitor). BitBit confidently surfaces wrong information gaps, eroding user trust. The belief model becomes stale or incomplete because it can only track what flows through monitored channels.

**Why it happens:** Theory of Mind requires knowing ALL information that reached an entity. BitBit monitors email, WhatsApp, iMessage -- but people also talk face-to-face, on phone calls, in meetings, via channels BitBit doesn't have. The belief ledger is inherently incomplete, but the system presents it with false certainty.

**Consequences:**
- BitBit says "Sezer doesn't know X" when Sezer was told in person -- user thinks BitBit is stupid
- User stops trusting information gap alerts entirely, making the feature worthless
- Worse than not having the feature: actively wrong is worse than absent

**Prevention:**
1. **Epistemic humility in presentation:** NEVER say "Sezer doesn't know X." Say "Based on tracked communications, Sezer may not be aware of X." The qualifier is mandatory in every information gap surface.
2. **Channel coverage indicator:** Show which channels are monitored for each entity. "Coverage: Email (yes), WhatsApp (yes), Phone (no), In-person (no)." When coverage is <50% of known channels, downgrade belief confidence.
3. **User correction loop:** When user says "Actually, I told Sezer on the phone," update the belief ledger AND record that phone is an active channel for this entity. Over time, learn which entities have significant off-platform communication.
4. **Decay belief divergence:** If a belief divergence (information gap) has been flagged for >14 days with no user action, decay its priority. It's likely stale or already resolved off-platform.
5. **Outbound tracking dependency:** Don't ship information gap detection before Epic B1 (sent message capture). Without tracking what BitBit itself sends, the belief ledger is missing its most reliable data source.

**Detection:** Track user dismissal rate on information gap alerts. If >40% are dismissed, the feature is generating more noise than signal.

**Phase:** Theory of Mind (Phase 3). The presentation layer and epistemic qualifiers must be designed with the feature, not added later.

---

### Pitfall 4: Anomaly Alert Fatigue

**What goes wrong:** Anomaly detection works great technically (z-score >2 fires alert) but produces 15 anomaly alerts per day. "Sezer responded 2 hours later than usual." "Invoice #4522 is $50 more than average." "Email volume is 12% above weekly baseline." User ignores all of them, including the one actually important alert buried in noise.

**Why it happens:** Statistical anomaly detection has no concept of business importance. A z-score of 2.5 on response time is mathematically significant but operationally irrelevant. Without business-context filtering, every deviation triggers an alert.

**Consequences:**
- User disables anomaly alerts entirely
- Critical anomalies (client about to churn, payment 3 weeks overdue) lost in noise
- Feature becomes a liability instead of an asset

**Prevention:**
1. **Minimum importance threshold:** Anomalies must exceed BOTH statistical significance (z > 2) AND business importance. Business importance = entity_importance (exists on entity_nodes) x domain_relevance. A z=3 anomaly on an unimportant entity is filtered. A z=2.1 anomaly on a top client surfaces.
2. **Daily anomaly budget:** Maximum 2-3 anomaly surfaces per day per user. Rank by combined score (z-score x entity_importance x recency). Show the top 2-3 only.
3. **Anomaly categories with user-configurable thresholds:** Financial anomalies (payment delays) are high priority by default. Communication frequency anomalies are medium. Response time anomalies are low. Let users adjust.
4. **Cooldown per entity-metric pair:** Once an anomaly is surfaced for "Sezer payment timing," don't surface again for 7 days unless the z-score increases.
5. **Start with a HIGH threshold and lower gradually:** Launch with z > 3 (99.7th percentile). Only lower to z > 2 after validating user engagement with initial alerts.

**Detection:** Track anomaly-surfaced vs anomaly-acted-on ratio. If <10% of surfaced anomalies get any user interaction, threshold is too low.

**Phase:** Anomaly Detection (Phase 2). Budget and filtering must ship WITH the detection, not after.

---

### Pitfall 5: Goal Tree Becomes a Graveyard

**What goes wrong:** BitBit extracts goals from conversation ("I want to grow the agency this year") and builds a goal tree. But goals change, get abandoned, or evolve through conversation without explicit deletion. The goal tree accumulates stale goals, showing "Grow revenue 20%" when the user pivoted to "stabilize existing clients" three months ago. Critical path analysis runs on an outdated tree and produces irrelevant recommendations.

**Why it happens:** Goal elicitation from conversation is one-directional: easy to add, hard to remove. Users rarely say "I no longer want to grow revenue" -- they just stop talking about it. Without explicit lifecycle management, the tree only grows.

**Consequences:**
- Goal hierarchy becomes noise, user stops looking at it
- Critical path analysis based on stale goals produces wrong priorities
- Progress tracking reports on goals nobody cares about anymore

**Prevention:**
1. **Goal decay based on mention frequency:** If a goal hasn't been referenced in conversation for 30 days, decay its priority. After 60 days with no mention, mark as "possibly abandoned" and surface a check-in: "You mentioned growing revenue 20% in January -- is this still a priority?"
2. **Goal lifecycle states:** not_started -> in_progress -> blocked -> completed -> abandoned -> archived. Default new goals to "not_started" and require at least one follow-up mention before promoting to "in_progress."
3. **Goal confirmation for high-level objectives:** Strategic goals (top of hierarchy) extracted from conversation should be confirmed: "It sounds like growing the agency is a key goal for you. Should I track progress on this?" Don't auto-add top-level goals.
4. **Quarterly goal review prompt:** Proactively surface all active goals quarterly and ask the user to confirm, update, or archive. Prevents accumulation.
5. **Don't build goal decomposition before the tree has data:** Critical path analysis on a sparse or stale goal tree is worse than no analysis. Gate advanced features behind minimum goal tree size (>10 nodes, >3 active goals).

**Detection:** Count active goals per user. If >20 and growing, the tree isn't being pruned. Monitor goal completion rate -- if <5% of goals ever reach "completed," extraction or lifecycle is broken.

**Phase:** Goal Decomposition (Phase 5). Lifecycle management must be designed with the data model, not retrofitted.

---

## Moderate Pitfalls

### Pitfall 6: Metacognition Confidence Scores Become Meaningless

**What goes wrong:** Domain confidence scores (e.g., financial: 0.92, technical: 0.1) are computed from signal density and recency, but don't actually correlate with knowledge quality. Having 50 signals about a topic doesn't mean the knowledge is correct -- it might be 50 instances of the same wrong assumption. High confidence score + low actual accuracy = dangerous.

**Prevention:**
1. Confidence should factor in source diversity (5 sources > 50 messages from one source) and contradiction rate (signals that contradict each other lower confidence even if count is high).
2. Validate confidence calibration: when BitBit says 90% confident, it should be right ~90% of the time. Track prediction accuracy per confidence band.
3. Use Brier score or similar calibration metric during development to tune the confidence formula.

**Phase:** Metacognition (Phase 4). Calibration testing must happen before exposing confidence scores to users.

---

### Pitfall 7: Temporal Extraction Date Ambiguity

**What goes wrong:** "I'll have it by Friday" -- which Friday? "Next week" -- starting Monday or Sunday? "End of month" -- business days or calendar? Temporal extraction from natural language is riddled with ambiguity. Wrong deadline extraction cascades through the temporal constraint system.

**Prevention:**
1. Always resolve relative dates to absolute dates at extraction time, using message timestamp as anchor.
2. When ambiguous (e.g., "Friday" could be this week or next), extract with a confidence score and flag for confirmation if the deadline is <3 days away.
3. Store both the raw text ("by Friday") and resolved date (2026-04-17) so users can verify.
4. Use Haiku for extraction (fast, cheap) but include the current date/time in the prompt context.

**Phase:** Temporal Reasoning (Phase 3). Extraction prompt design is critical.

---

### Pitfall 8: Spreading Activation Runaway on Dense Graphs

**What goes wrong:** Causal chain tracing uses spreading activation constrained to CAUSES edges. But in a dense business graph with many causal edges, activation spreads to hundreds of nodes, consuming memory and tokens when the resulting chain is fed to the LLM for explanation.

**Prevention:**
1. Hard cap on activation depth (max 4 hops for causal chains). Business causal chains rarely exceed 4 steps.
2. Activation threshold: stop propagating when activation_level drops below 0.1.
3. Max nodes in result set: 20. If spreading activation returns more, take top-20 by activation level.
4. These limits already exist conceptually in the spreading_activation RPC -- ensure they're enforced for causal traversals.

**Phase:** Causal Reasoning (Phase 4). Configure limits during implementation.

---

### Pitfall 9: Clarifying Questions That Annoy Instead of Help

**What goes wrong:** Active Learning generates clarifying questions that are too obvious ("What's the client's name?"), too vague ("Can you tell me more?"), or too frequent. Users feel interrogated instead of helped.

**Prevention:**
1. Question budget: max 1-2 per conversation turn, enforced in TAOR loop.
2. Never ask what BitBit could look up. Before generating a question, check if the answer is available via tools (Xero, email search, CRM). Only ask humans for subjective or genuinely unavailable information.
3. Questions must be specific and binary/multiple-choice when possible: "Did you mean the $3,200 January invoice or the $5,800 March invoice?" not "Which invoice?"
4. Track question-to-resolution ratio. If users ignore >50% of clarifying questions, reduce frequency.

**Phase:** Active Learning (Phase 2). Question generation prompt engineering is the key investment.

---

### Pitfall 10: Single-Tenant Cognitive State Leaking in Multi-Org

**What goes wrong:** Cognitive features (belief states, causal edges, goal trees) stored in shared tables without strict org-scoping. Entity from Org A's causal graph leaks into Org B's chain tracing. Belief states for one user's contacts visible to another user.

**Prevention:**
1. Every new table (belief_states, anomaly_events, goal_nodes, clarification_queue, metacognitive_scores) MUST have `org_id` column with RLS policies. Non-negotiable.
2. All Graphology in-memory operations must filter by org_id when hydrating from entity_edges. Never load cross-org edges into the same graph instance.
3. Test with 2+ orgs from day 1 of cognitive feature development. The existing E2E test user (8dd45be2) and Andy (4d78dda1) are in different orgs -- use both.

**Phase:** Foundation (Phase 1). RLS policies must be created with the migration, not after.

---

## Minor Pitfalls

### Pitfall 11: Over-Engineering the Causal Graph

**What goes wrong:** Building a formal causal inference engine (Pearl's do-calculus, structural causal models) when LLM reasoning over extracted edges is sufficient for business use cases.

**Prevention:** Stick to the anti-feature guidance in FEATURES.md. LLM + structured causal edges is the right abstraction. The graph provides structure; Claude provides reasoning. No formal causal inference needed.

---

### Pitfall 12: Testing Cognitive Features Without Realistic Data

**What goes wrong:** Unit tests with 3 entities and 5 signals pass, but the feature breaks at production scale (500 entities, 10K signals, sparse data for most entities).

**Prevention:** Create a realistic test fixture with production-scale data density. Seed test scenarios with actual BitBit signal patterns from Andy's org (anonymized). Test edge cases: entities with zero signals, entities with contradictory signals, entities with only very old signals.

---

### Pitfall 13: Deploying Workers Before They're Needed

**What goes wrong:** Phase 1 deploys BullMQ + Redis workers on Fly.io, adding $15/mo infrastructure cost. But cognitive features in Phase 2-5 don't launch for months. Workers sit idle burning money.

**Prevention:** Use Vercel cron (already deployed) for initial cognitive extraction. Only deploy dedicated workers when processing volume exceeds what cron can handle (~100 signals/5min batch). The STACK.md already notes Redis/BullMQ are "already installed but unused" -- keep it that way until volume demands it.

---

## Phase-Specific Warnings

| Phase | Likely Pitfall | Mitigation |
|-------|---------------|------------|
| Phase 1: Foundation | Cost architecture not established early | Implement token tracking and per-run budgets before any cognitive calls |
| Phase 1: Foundation | Missing RLS on new tables | Create RLS policies IN the migration file, not as a follow-up |
| Phase 2: Anomaly Detection | Alert fatigue from day 1 | Launch with z > 3 threshold, daily budget of 2 alerts, entity-importance gating |
| Phase 2: Active Learning | Annoying question generation | Strict question budget, tool-check-first policy, specific questions only |
| Phase 3: Theory of Mind | False certainty on belief gaps | Mandatory epistemic qualifiers ("may not be aware"), channel coverage indicator |
| Phase 3: Temporal Reasoning | Date ambiguity in extraction | Resolve to absolute dates, store raw text, flag ambiguous near-term deadlines |
| Phase 4: Causal Reasoning | Hallucinated causal links | 2-signal minimum for CAUSES edges, confidence scoring, user confirmation for novel patterns |
| Phase 4: Metacognition | Uncalibrated confidence scores | Factor source diversity and contradiction rate, validate with Brier scoring |
| Phase 5: Goal Decomposition | Goal tree becomes stale graveyard | Decay by mention frequency, lifecycle states, quarterly review, confirmation for top-level goals |

---

## Sources

### Production System Analysis (HIGH confidence)
- BitBit codebase: existing confidence routing, predictive coding engine, entity_edges schema, spreading_activation RPC
- Existing anomaly detection patterns in `memory-palace/pattern-detector.ts`
- Existing neural decay configuration in brain infrastructure

### Research (MEDIUM confidence)
- [Confidence Paradox: Can LLMs Know When They're Wrong?](https://arxiv.org/html/2506.23464) -- Epistemic uncertainty challenges
- [Metacognitive Sensitivity in AI Decision Making](https://pmc.ncbi.nlm.nih.gov/articles/PMC12103939/) -- Confidence calibration pitfalls
- [Counterfactual Causal Inference in NL](https://arxiv.org/html/2410.06392) -- Challenges in extracting causal graphs from text
- [Theory of Mind in LLMs](https://aclanthology.org/2025.acl-long.1522.pdf) -- ToM limitations and false belief tracking
- [Proactive AI Agents](https://slack.com/blog/productivity/proactive-ai-agents-definition-core-components-and-business-value) -- Alert fatigue patterns in enterprise agents
- [Zendesk Confidence Thresholds](https://support.zendesk.com/hc/en-us/articles/8357749625498) -- Production confidence tier patterns

### Industry Patterns (MEDIUM confidence)
- Alert fatigue well-documented in monitoring systems (PagerDuty, Datadog literature)
- Goal tracking decay is a known pattern in OKR tools (Lattice, 15Five post-mortems)
- Causal hallucination in LLMs documented across multiple evaluation benchmarks
