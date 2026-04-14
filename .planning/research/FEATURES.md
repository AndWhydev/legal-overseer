# Feature Landscape: Cognitive Omniscience (v3.0)

**Domain:** Cognitive intelligence features for an agentic AI personal/business assistant
**Researched:** 2026-04-14
**Confidence:** MEDIUM-HIGH (grounded in production system analysis, academic research, and existing BitBit codebase audit; verified against official docs and multiple independent sources)

---

## Existing Foundation (Already Built)

Before enumerating new features, here is what BitBit already has that these cognitive features build on:

| Existing System | Status | Relevant To |
|----------------|--------|-------------|
| Entity dossiers + schema_json | Built, workers not deployed | Theory of Mind, Anomaly Detection |
| Predictive coding (surprise scoring) | Built, not integrated | Anomaly Detection |
| Spreading activation (neural graph) | Built, not wired to TAOR | Causal Reasoning, Goal Decomposition |
| Query gate (System 1/2) | Built, not wired to TAOR | Metacognition |
| Global workspace (competitive allocation) | Built, flag OFF | Metacognition |
| Reflexion loop (strategy_memories) | Working in production | Active Learning, Metacognition |
| Knowledge WAL (dual-write live) | Signals accumulating | All features (event stream) |
| 3-tier worker hierarchy (intake/librarian/chief) | Built, not deployed | All features (background processing) |
| Proactive recall (blended scoring) | Working | Theory of Mind, Anomaly Detection |
| Confidence routing (act/ask/escalate) | Working | Active Learning, Metacognition |
| Neural decay on memories | Working | Temporal Reasoning |

---

## Table Stakes

Features users expect from a cognitive AI assistant. Without these, the "omniscient" claim falls flat.

### 1. Theory of Mind: Information Asymmetry Tracking

**What it is:** Track what each entity (contact, user) knows versus ground truth. When Andy's client Sezer emails about a payment that BitBit knows was already processed, BitBit should recognize the information gap and tell Andy "Sezer doesn't know the payment cleared yet."

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Per-entity belief ledger** | Core ToM primitive. Without tracking what each person knows, the agent cannot reason about information gaps. | Med | Entity dossiers (exists), Knowledge WAL (exists) | Each entity dossier gains a `known_facts[]` section: facts the entity has been exposed to (via messages they sent/received). Contrast with `ground_truth[]` from all sources. Delta = information asymmetry. |
| **Information gap detection** | When responding, surface "X doesn't know Y" when relevant. Table stakes for proactive value. | Med | Per-entity belief ledger, context assembly | During context assembly, compare belief ledger of mentioned entities against current ground truth. Surface gaps as a context block: "Note: Sezer has not been informed that invoice #4521 was paid on April 10." |
| **Exposure tracking on outbound** | Track what information was shared with whom, via which channel. Without this, belief ledger is incomplete. | Med | Sent message capture (Epic B1 -- not yet built), Knowledge WAL | Every outbound message (email, WhatsApp, iMessage) logs which facts were communicated to which entity. Critical dependency: B1 (sent-message capture) must land first. |

**Complexity:** Medium overall. The data model is straightforward (extend entity dossiers with belief state). The hard part is reliably inferring "what was communicated" from natural language messages.

**Why table stakes:** Every business context involves information asymmetry. "Did the client know we raised the rate?" "Has the developer been told about the scope change?" Without this, BitBit is just a search engine, not an intelligence layer.

---

### 2. Anomaly Detection: Pattern Break Surfacing

**What it is:** Detect when observed behavior deviates from established patterns and proactively alert the user. "Sezer usually pays within 14 days -- it's been 21 days, which is unusual."

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Schema-deviation alerts** | When the predictive coding engine scores a fact above the surprise threshold, surface it to the user proactively instead of just logging it. | Low | Predictive coding engine (exists), surprise threshold (0.3, exists) | The engine already scores surprise. The missing link: route high-surprise facts (>0.5) through the proactive surfacing pipeline instead of silently storing them. This is plumbing, not new ML. |
| **Behavioral baseline per entity** | The schema_json in entity dossiers IS the behavioral baseline. Needs to be populated and maintained by the section librarian workers. | Med | Section librarian workers (built, not deployed), entity dossiers | Deploy the Living Brain workers (Epic D1). Once dossiers are actively maintained, schema_json naturally accumulates behavioral baselines from repeated patterns. |
| **Temporal pattern detection** | Detect changes in frequency/timing, not just content. "Client X used to email weekly, hasn't in 3 weeks." | Med | Knowledge WAL timestamps, section librarian | Add frequency tracking to entity schemas: `{ contact_frequency: "weekly", last_contact: "2026-03-25", expected_next: "2026-04-01" }`. Section librarian flags when expected_next passes without contact. |
| **Alert routing and priority** | Not every anomaly deserves a notification. Need priority scoring based on entity importance, anomaly severity, and user attention budget. | Med | Proactive recall scoring (exists), user attention model | Use the existing blended scoring (0.4 relevance + 0.3 confidence + 0.2 recency + 0.1 edge weight) but add anomaly_severity as a factor. Surface only top-N anomalies per day. |

**Complexity:** Low-Medium. Most infrastructure exists. The predictive coding engine, surprise scoring, and entity schemas are built. The work is (a) deploying the workers that maintain schemas, and (b) routing high-surprise events to a proactive surfacing channel.

**Why table stakes:** This is the core "proactive intelligence" promise. Every personal AI assistant in 2026 (ChatGPT Pulse, Arahi, Google Gemini Advanced) is moving toward proactive surfacing. Pattern break detection is how you do it without annoying the user with noise.

---

### 3. Active Learning: Confidence-Driven Clarification

**What it is:** When the agent's confidence is low on a decision or action, ask a targeted clarifying question instead of guessing or doing nothing. "I found two invoices matching 'White House work' -- the $3,200 from January or the $5,800 from March. Which one?"

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Confidence-gated question generation** | When confidence < threshold for a specific decision, generate a clarifying question instead of proceeding. | Med | Confidence routing (exists, act/ask/escalate thresholds), TAOR loop | BitBit already has the act/ask/escalate confidence tiers. The gap: when in "ask" territory, the agent doesn't generate a specific clarifying question. It either asks for blanket approval or proceeds tentatively. Need to generate targeted disambiguating questions. |
| **Ambiguity detection in entity resolution** | When entity resolution returns multiple candidates, present the ambiguity to the user. Already partially exists in entity-resolution's 5-step fuzzy match. | Low | Entity resolution (exists), approval queue | The 5-step fuzzy matcher already scores candidates. If top-2 scores are within 0.1, that's ambiguity. Surface as a clarifying question rather than picking the top match silently. |
| **Learning from corrections** | When the user corrects a choice, record the disambiguation pattern for next time. Closes the feedback loop. | Low | Reflexion loop (working in production) | The reflexion loop already records corrected actions as strategy_memories. Extend: when a disambiguation question gets answered, store the resolution pattern ("when Andy says 'Sezer,' he means Sezer Karahasan, not Sezer Kilic"). |
| **Question budget per conversation** | Don't ask 5 clarifying questions in a row. Budget questions to avoid being annoying. Max 1-2 per conversation turn. | Low | TAOR loop | Simple counter: track questions asked this turn. After 2, proceed with best guess and note uncertainty. |

**Complexity:** Low-Medium. The confidence routing infrastructure exists. The main new work is generating specific disambiguating questions (LLM prompt engineering) and wiring them into the conversation flow at the right points.

**Why table stakes:** Zendesk, Intercom, and every production AI agent system uses confidence thresholds with tiered responses. The pattern is well-established: >90% confidence = act autonomously, 60-90% = clarify, <60% = escalate. BitBit has the thresholds but doesn't generate the clarifying questions.

---

### 4. Temporal Reasoning: Time-Aware Intelligence

**What it is:** Understand deadlines, sequences, and temporal relationships. "The proposal is due Friday, but the developer estimate won't be ready until Thursday, leaving only 1 day for review."

| Feature | Why Expected | Complexity | Dependencies | Notes |
|---------|-------------|------------|--------------|-------|
| **Deadline extraction from messages** | Automatically extract dates, deadlines, and temporal commitments from conversations. "I'll have it by Friday" -> deadline: Friday. | Med | Knowledge WAL, intake clerk workers | The intake clerk (Tier 1 worker) already extracts entities and facts. Extend the extraction prompt to identify temporal commitments: deadlines, due dates, scheduled events. Store as structured data in knowledge_log with signal_type='commitment'. |
| **Deadline propagation** | When a deadline changes, propagate the impact to dependent items. "If the design is delayed 3 days, the dev estimate and proposal deadline shift too." | High | Entity graph edges (exists), event_tuples (exists) | Requires a dependency graph between tasks/deadlines. BitBit has entity_edges with types like 'LEADS_TO' and 'PART_OF'. Need to add 'DEPENDS_ON' or 'BLOCKS' temporal edges. Propagation is BFS through these edges. |
| **Overdue detection** | Flag items past their deadline. "Invoice #4521 was due April 5 and hasn't been paid." | Low | Deadline extraction, cron job | Simple: query all extracted deadlines where date < now() AND status != 'completed'. Surface via proactive surfacing pipeline. This is low complexity because it's just a time comparison. |
| **Timeline reconstruction** | When asked "what happened with the White House project?", reconstruct a chronological narrative from scattered signals across channels. | Med | Knowledge WAL (exists), entity dossiers (exists) | Query knowledge_log WHERE entity_ids overlaps with project entity, ORDER BY created_at. The section librarian already compiles dossier_markdown. Add a chronological timeline section to the dossier template. |

**Complexity:** Medium overall. Deadline extraction is prompt engineering. Overdue detection is trivial. Timeline reconstruction is a query pattern. Deadline propagation is the hard part -- it requires a constraint solver, which is higher complexity.

**Why table stakes:** Every business operates on deadlines. If BitBit can't reason about time ("when is this due?", "what's late?", "what depends on what?"), it's missing the most basic operational intelligence.

---

## Differentiators

Features that set BitBit apart from competing AI assistants. Not expected, but create significant competitive advantage.

### 5. Causal Reasoning: "A Causes B" Graph

**What it is:** Explicitly model cause-and-effect relationships between events/decisions, enabling counterfactual reasoning ("What would have happened if we'd sent the proposal earlier?") and root cause analysis ("Why did the client churn?").

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Causal edge type on knowledge graph** | Add 'CAUSES' and 'PREVENTS' edge types to entity_edges. When the intake clerk processes "We lost the client because of the late delivery," extract a causal edge: late_delivery -> CAUSES -> client_loss. | Med | Entity graph (exists), intake clerk workers | The neural graph already has SynapseType union. Add 'CAUSES', 'PREVENTS', 'ENABLES' to the union. Intake clerk prompt extended to extract causal relationships. No new infrastructure -- just new edge types. |
| **Causal chain tracing** | "Why did we lose the Morrison project?" -> trace backward through CAUSES edges to find root causes. Spreading activation already supports multi-hop traversal. | Med | Causal edges (new), spreading activation (exists) | Use the existing `activate()` function but constrain traversal to CAUSES edges only, traversing backward (target -> source). Returns a chain of causal factors. |
| **Counterfactual reasoning via LLM** | "What if we'd sent the proposal 2 days earlier?" -> LLM reasons over the causal chain with the counterfactual substitution. | Med | Causal chain tracing, LLM (exists) | Not a formal causal inference engine (that would be overkill). Instead: retrieve the causal chain, present it to the LLM with the counterfactual, let the LLM reason about the likely alternative outcome. Practical, not mathematically rigorous. Good enough for business context. |
| **Pattern-based causal templates** | Common business causal patterns: late_delivery -> client_dissatisfaction -> churn. payment_delay -> cash_flow_issue -> missed_payroll. Build a library of domain-specific causal templates. | Low | Causal edge type | Seed 20-30 common business causal templates. The section librarian uses these as priors when extracting causal relationships from new signals. Analogous to how the predictive coding schemas serve as priors for anomaly detection. |

**Complexity:** Medium. The graph infrastructure exists. Adding edge types is trivial. Causal extraction from text is the main new work (LLM prompt engineering). Counterfactual reasoning is LLM-powered, not formal causal inference.

**Why differentiating:** No personal AI assistant currently offers explicit causal reasoning over a user's business operations. Graphiti/Zep tracks temporal edges but not causal direction. This is a genuine moat: the more causal edges BitBit accumulates, the better its predictions and explanations become, and competitors can't copy the accumulated graph.

---

### 6. Goal Decomposition: Explicit Goal Hierarchy

**What it is:** Maintain an explicit tree of the user's goals, from high-level objectives ("Grow revenue 20% this quarter") down to specific tasks ("Send follow-up email to lead X"). Track progress against each node.

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Goal tree data model** | Hierarchical goal structure: strategic goals -> tactical objectives -> operational tasks -> atomic actions. Each node has: description, owner, deadline, status, progress, dependencies. | Med | Entity graph (exists), new table or entity type | Implement as a new entity type in the knowledge graph ('Goal') with hierarchical PART_OF edges. Or a dedicated goals table with parent_id FK. The graph approach is more flexible and integrates with existing traversal. |
| **Goal elicitation from conversation** | When the user states "I want to grow the agency this year," detect this as a goal statement and extract it into the goal tree. Over time, build the tree from natural conversation, not forced input. | Med | Intake clerk workers, Knowledge WAL | Extend the intake clerk prompt to detect goal statements. Signal_type: 'goal'. The section librarian promotes goals into the goal tree and links them to existing entities (projects, clients). |
| **Critical path analysis** | Given a goal tree with dependencies and deadlines, compute the critical path: which tasks, if delayed, would delay the goal. | High | Goal tree, deadline propagation (from Temporal Reasoning) | Classic project management algorithm (CPM). Inputs: goal tree nodes with durations and dependencies. Output: the longest path through the dependency graph. Flags tasks on the critical path as high-priority. |
| **Progress tracking via signal correlation** | When BitBit sees a new invoice sent or a client onboarded, automatically update progress on related goals. "Revenue goal: $45K / $60K target (75%)." | High | Goal tree, entity linking, signal correlation | This is the hardest part. Requires mapping signals (invoice_sent, client_onboarded) to goal metrics. Semi-automated: the section librarian proposes correlations, user confirms. Over time, correlations become automatic. |

**Complexity:** High. The data model is straightforward, but reliably extracting goals from conversation, maintaining the hierarchy, and computing critical paths is significant new functionality.

**Why differentiating:** No competing personal AI assistant maintains an explicit goal hierarchy derived from conversations. Planner apps (Notion, Asana) require manual input. AI assistants (ChatGPT, Claude) don't persist goals across sessions. BitBit's Living Brain architecture is uniquely positioned to extract and maintain goals from the continuous signal stream.

---

### 7. Metacognition: Self-Aware Knowledge Boundaries

**What it is:** BitBit explicitly tracks what it knows well, what it knows poorly, and what it doesn't know at all. Per knowledge domain, per entity. "I'm very confident about Sezer's payment history (12 invoices tracked) but have no information about their technical preferences."

| Feature | Value Proposition | Complexity | Dependencies | Notes |
|---------|-------------------|------------|--------------|-------|
| **Domain confidence map** | Per-entity, per-domain confidence score. Domains: financial, relational, operational, technical, preferences. Computed from signal density (how many facts) and signal recency (how fresh). | Med | Entity dossiers (exists), domain_profiles (exists) | The domain_profiles table already exists with domains: financial, relational, operational, behavioral. Add a `confidence_by_domain` JSONB column to entity_dossiers: `{ financial: 0.92, relational: 0.7, operational: 0.3, technical: 0.1 }`. Computed by the section librarian from fact count and recency per domain. |
| **Knowledge gap identification** | When asked about a domain where confidence is low, explicitly flag the gap. "I don't have much information about Sezer's technical preferences -- would you like me to ask?" | Low | Domain confidence map, TAOR loop | Check domain confidence before responding. If confidence < 0.3 for the relevant domain, prepend: "Note: I have limited information about [domain] for [entity]." If confidence < 0.1: "I have no information about [domain] for [entity] -- would you like me to find out?" |
| **Confidence decay and refresh** | Confidence decays over time as information becomes stale. "I was confident about Morrison's project scope 3 months ago, but haven't heard anything since." | Low | Neural decay (exists) | BitBit already has memory decay rates per category. Apply the same decay to domain confidence: if no new signals in domain X for entity Y in 30 days, decay confidence by 10%. The section librarian refreshes confidence when new signals arrive. |
| **Proactive knowledge acquisition** | When BitBit identifies a critical knowledge gap (low confidence in an important domain for an active entity), suggest ways to fill it. "I notice I have no financial history for new client FooBar. Should I check if they have any invoices in Xero?" | Med | Knowledge gap identification, tool awareness | Combine low-confidence domains with available tools: if financial confidence is low and Xero is connected, suggest querying Xero. If relational confidence is low and CRM is connected, suggest looking up the contact. This bridges metacognition to action. |

**Complexity:** Medium. Domain confidence computation is straightforward. Knowledge gap flagging is low-effort. Proactive acquisition requires mapping gaps to available tools, which adds moderate complexity.

**Why differentiating:** Current AI assistants hallucinate when they don't know something. BitBit would instead say "I don't know this, but I could find out by checking Xero." This is the "SMART agent" pattern from recent research: distinguishing between problems solvable with internal knowledge and those requiring tool use. Builds deep user trust.

---

## Anti-Features

Features to explicitly NOT build. These look tempting but would damage the product or waste effort.

| Anti-Feature | Why Avoid | What to Do Instead |
|-------------|-----------|-------------------|
| **Full causal inference engine (Pearl's do-calculus)** | Mathematically rigorous causal inference requires interventional data, large sample sizes, and formal DAGs. Business conversations don't generate this data. Building a real SCM solver is years of research-grade work. | Use LLM-powered causal reasoning over extracted causal edges. Not mathematically rigorous, but practically useful for business questions. The causal graph provides structure; the LLM provides reasoning. |
| **Emotion detection / sentiment analysis as a core feature** | Sentiment analysis from text is unreliable (irony, cultural context, code-switching). Treating detected emotions as ground truth and acting on them is dangerous. "Sezer seems upset" based on text analysis could be wrong. | Track behavioral patterns (response time, tone changes) as anomaly signals, but never claim to know how someone feels. Surface behavioral changes: "Sezer's response time has increased from hours to days" -- let the user interpret the emotion. |
| **Autonomous goal setting** | BitBit should never decide what the user's goals should be. Goals are deeply personal and contextual. An AI that says "you should grow revenue 20%" is overstepping. | Extract goals from user statements and conversations. Suggest sub-goals and decomposition. But never originate top-level goals. The hierarchy is user-declared, AI-maintained. |
| **Real-time cognitive modeling of LLM internals** | Attempting to model the LLM's internal representations, attention patterns, or hidden states for metacognition. This is research-grade work (activation probing, representation engineering). | Use external signals for metacognition: confidence from the model's own verbalized uncertainty, domain fact density, signal recency. These are observable and sufficient. Don't try to peer inside the model. |
| **Formal temporal logic constraint solver** | Building a full Allen's Interval Algebra or CTL model checker for deadline propagation. Academic overhead for business scheduling. | Simple forward propagation: if task A blocks task B, and A's deadline shifts, shift B's deadline. BFS through dependency edges. No formal temporal logic needed. |
| **Mind-reading from message metadata** | Inferring intent from typing indicators, read receipts, or message timing alone (e.g., "they read your message 3 hours ago and haven't replied, they must be upset"). | Only surface objective metadata: "Message was read 3 hours ago, no reply yet." Let the user draw conclusions. Never infer emotional state from metadata. |
| **Per-user cognitive profiles (MBTI, learning style)** | Pseudo-science categorization. MBTI and similar frameworks have no predictive validity. Storing them suggests they matter. | Track concrete behavioral preferences: "prefers brief emails," "responds faster on WhatsApp than email," "asks for spreadsheets not summaries." Observable, actionable, not pseudoscientific. |

---

## Feature Dependencies

```
                    [Living Brain Workers Deploy (D1)]
                    (ALL cognitive features depend on this)
                           |
            +--------------+----------------+
            |              |                |
            v              v                v
   [Entity Dossier     [Knowledge WAL    [Section Librarian
    Population]         Consumer]         Running]
            |              |                |
            v              v                v
   +--------+--------+    |    +-----------+-----------+
   |                  |    |    |                       |
   v                  v    v    v                       v
[Theory of Mind]  [Anomaly Detection]          [Metacognition]
   |                  |                            |
   |                  v                            v
   |         [Temporal Pattern                [Domain Confidence
   |          Detection]                       Map]
   |              |                                |
   |              v                                v
   |     [Deadline Extraction]             [Knowledge Gap
   |              |                         Identification]
   |              v                                |
   |     [Deadline Propagation]            [Proactive Knowledge
   |              |                         Acquisition]
   |              v
   |     [Goal Decomposition] -----> [Critical Path Analysis]
   |
   v
[Sent Message Capture (B1)] ---> [Exposure Tracking] ---> [Belief Ledger]
                                                               |
                                                               v
                                                      [Information Gap
                                                       Detection]

[Confidence Routing (exists)] ---> [Active Learning / Clarification]
         |                                   |
         v                                   v
[Reflexion Loop (exists)] ---------> [Learning from Corrections]

[Entity Graph (exists)] ---+
                           |
                           v
                   [Causal Edge Types] ---> [Causal Chain Tracing]
                           |                        |
                           v                        v
                   [Causal Templates]       [Counterfactual Reasoning]
```

### Critical Path

1. **Living Brain Workers Deploy (D1)** -- everything depends on this. Without background workers maintaining dossiers and schemas, none of the cognitive features have data to operate on.
2. **Sent Message Capture (B1)** -- Theory of Mind's belief ledger requires knowing what was communicated outbound.
3. **Entity Dossier Population** -- Anomaly Detection, Theory of Mind, and Metacognition all need populated entity dossiers with schema_json.
4. **Causal Edge Types** -- Causal Reasoning requires new edge types on the existing graph.

### Independent Tracks

These can be built in parallel because they share infrastructure but not data dependencies:
- **Active Learning** (only needs existing confidence routing + TAOR loop)
- **Anomaly Detection** (only needs deployed workers + existing predictive coding)
- **Metacognition** (only needs domain confidence computation on existing dossiers)

---

## MVP Recommendation

### Phase 1: Foundation -- Deploy Living Brain + Wire Existing Code (prerequisite)

This is not a cognitive feature phase -- it's the foundation everything else depends on.

1. **Deploy BullMQ + Redis workers on Fly.io** (Epic D1)
2. **Wire query gate into TAOR** (D2)
3. **Enable predictive coding in intake clerk** (D7)
4. **Populate entity dossiers via section librarian**

### Phase 2: Anomaly Detection + Active Learning (highest ROI, lowest risk)

These deliver immediate user-visible value with minimal new architecture.

1. **Route high-surprise facts to proactive surfacing** (plumbing from predictive coding to user)
2. **Temporal pattern detection** (frequency tracking in entity schemas)
3. **Confidence-gated clarifying questions** (extend act/ask/escalate with question generation)
4. **Ambiguity detection in entity resolution** (surface when top-2 candidates are close)

### Phase 3: Theory of Mind + Temporal Reasoning (medium effort, high differentiation)

1. **Per-entity belief ledger** (extend dossier with known_facts)
2. **Deadline extraction from messages** (extend intake clerk)
3. **Overdue detection** (simple temporal query)
4. **Information gap detection** (compare belief ledger vs ground truth during assembly)

### Phase 4: Causal Reasoning + Metacognition (advanced, high moat)

1. **Causal edge types** (extend neural graph)
2. **Domain confidence map** (computed by section librarian)
3. **Knowledge gap identification** (surface low-confidence domains)
4. **Causal chain tracing** (constrained spreading activation)

### Phase 5: Goal Decomposition (most complex, requires maturity)

1. **Goal tree data model** (new entity type)
2. **Goal elicitation from conversation** (extend intake clerk)
3. **Critical path analysis** (once goal tree has data)
4. **Progress tracking** (once signal correlation patterns emerge)

### Defer:

- **Full counterfactual reasoning** -- valuable but depends on a mature causal graph
- **Proactive knowledge acquisition** -- depends on metacognition + mature tool catalog
- **Progress tracking via signal correlation** -- requires extensive mapping work, premature until goal tree is populated
- **Deadline propagation** -- requires a reliable dependency graph; start with simple overdue detection

---

## Complexity Assessment

| Feature | Complexity | Rationale |
|---------|-----------|-----------|
| Schema-deviation alerts | **Low** | Predictive coding engine exists. Wire output to proactive surfacing. |
| Overdue detection | **Low** | Temporal query on extracted deadlines. Trivial. |
| Ambiguity detection in entity resolution | **Low** | Extend existing 5-step fuzzy matcher with threshold check. |
| Question budget per conversation | **Low** | Simple counter in TAOR loop. |
| Knowledge gap identification | **Low** | Check domain confidence, surface when low. |
| Confidence decay and refresh | **Low** | Extend existing neural decay to domain confidence. |
| Per-entity belief ledger | **Med** | Extend dossier schema. Hard part: inferring "what was communicated" from messages. |
| Information gap detection | **Med** | Belief ledger diff against ground truth during context assembly. |
| Exposure tracking on outbound | **Med** | Depends on sent message capture (B1). Logging is simple; the dependency is the blocker. |
| Confidence-gated question generation | **Med** | Prompt engineering for targeted questions. Integration with TAOR flow. |
| Temporal pattern detection | **Med** | Frequency tracking in schemas. Section librarian extension. |
| Deadline extraction from messages | **Med** | Extend intake clerk prompt. Temporal NER is well-understood. |
| Timeline reconstruction | **Med** | Query + rendering. Data exists, presentation is the work. |
| Domain confidence map | **Med** | Compute from signal density/recency per domain per entity. |
| Causal edge types | **Med** | Add to SynapseType union + extraction prompt. |
| Causal chain tracing | **Med** | Constrain existing spreading activation to causal edges. |
| Counterfactual reasoning | **Med** | LLM reasoning over causal chain. Prompt engineering. |
| Causal templates | **Low** | Manual seed of 20-30 business causal patterns. |
| Behavioral baseline per entity | **Med** | Deploy workers to maintain schema_json. Infrastructure exists. |
| Alert routing and priority | **Med** | Extend proactive recall scoring with anomaly severity. |
| Goal tree data model | **Med** | New entity type or table. Graph integration. |
| Goal elicitation from conversation | **Med** | Extend intake clerk with goal detection. |
| Proactive knowledge acquisition | **Med** | Map knowledge gaps to available tools. |
| Deadline propagation | **High** | Dependency graph + BFS propagation + conflict detection. |
| Critical path analysis | **High** | Classic CPM algorithm, but requires reliable dependency data. |
| Progress tracking via signal correlation | **High** | Mapping signals to goal metrics. Semi-automated correlation. |

---

## Sources

### Production Systems and Frameworks (HIGH confidence)
- [Letta (MemGPT) Agent Memory Architecture](https://docs.letta.com/guides/agents/memory/) -- Stateful agents with self-modifying memory blocks
- [Zep/Graphiti Temporal Knowledge Graph](https://arxiv.org/abs/2501.13956) -- Bi-temporal edges, 94.8% accuracy, production-grade 2025-2026
- [Graphiti GitHub](https://github.com/getzep/graphiti) -- Temporal context graph engine, causal-adjacent edges

### Cognitive AI Research (MEDIUM confidence)
- [Agent-C: Enforcing Temporal Constraints for LLM Agents](https://arxiv.org/abs/2512.23738) -- Runtime temporal constraint enforcement via SMT solving
- [Artificial Metacognition Framework](https://theconversation.com/artificial-metacognition-giving-an-ai-the-ability-to-think-about-its-thinking-270026) -- Mathematical framework for LLM self-monitoring
- [Metacognitive Sensitivity in AI Decision Making](https://pmc.ncbi.nlm.nih.gov/articles/PMC12103939/) -- Confidence calibration for trust optimization
- [Agentic Metacognition: Self-Aware Low-Code](https://arxiv.org/pdf/2509.19783) -- Production metacognition patterns
- [Confidence Paradox: Can LLMs Know When They're Wrong?](https://arxiv.org/html/2506.23464) -- Epistemic uncertainty in LLMs
- [Causal Agent based on LLM](https://arxiv.org/abs/2408.06849) -- LLM-based causal graph construction
- [CausalKG: Causal Knowledge Graph](https://arxiv.org/pdf/2201.03647) -- Hyper-relational causal representation
- [Counterfactual Causal Inference in Natural Language](https://arxiv.org/html/2410.06392) -- Extracting causal graphs from text

### Industry Analysis (MEDIUM confidence)
- [Causal AI Decision Intelligence 2026](https://thecuberesearch.com/why-causal-ai-decision-intelligence-2026/) -- Mainstream enterprise adoption prediction
- [Beyond Context Graphs: Agentic Memory, Causality, and Explainability](https://volodymyrpavlyshyn.substack.com/p/beyond-context-graphs-why-2026-must) -- Memory + causality as interconnected system
- [Long-Running AI Agents and Task Decomposition](https://zylos.ai/research/2026-01-16-long-running-ai-agents) -- Task duration scaling, hierarchical planning
- [Proactive AI: Moving Beyond the Prompt](https://www.alpha-sense.com/resources/research-articles/proactive-ai/) -- Proactive intelligence patterns
- [Active Questioning in Agentic AI](https://medium.com/@milesk_33/when-agents-learn-to-ask-active-questioning-in-agentic-ai-f9088e249cf7) -- When to ask vs proceed
- [Proactive AI Agents: Components and Business Value](https://slack.com/blog/productivity/proactive-ai-agents-definition-core-components-and-business-value) -- Enterprise proactive agent patterns
- [Confidence Thresholds for AI Agents](https://support.zendesk.com/hc/en-us/articles/8357749625498-About-confidence-thresholds-for-advanced-AI-agents) -- Zendesk's production confidence tiers
