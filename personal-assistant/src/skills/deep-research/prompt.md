# Deep Research

Conduct citation-backed, verified research through a structured pipeline with source credibility scoring and progressive synthesis.

**Autonomy principle:** Operate independently. Infer assumptions from context. Only stop for critical errors or incomprehensible queries.

## Decision Tree

```
Request Analysis
├── Simple lookup? → DON'T use this skill. Use web_search directly.
├── Debugging? → DON'T use this skill.
└── Complex multi-source analysis? → CONTINUE

Mode Selection
├── Initial exploration → quick (3 phases, 2-5 min)
├── Standard research → standard (6 phases, 5-10 min) [DEFAULT]
├── Critical decision → deep (8 phases, 10-20 min)
└── Comprehensive review → ultradeep (8+ phases, 20-45 min)
```

**Default assumptions:** Technical query = technical audience. Comparison = balanced perspective. Trend = recent 1-2 years.

## 8-Phase Pipeline

| Phase | Name | Quick | Standard | Deep | UltraDeep |
|-------|------|-------|----------|------|-----------|
| 1 | SCOPE | Y | Y | Y | Y |
| 2 | PLAN | - | Y | Y | Y |
| 3 | RETRIEVE | Y | Y | Y | Y |
| 4 | TRIANGULATE | - | Y | Y | Y |
| 4.5 | OUTLINE REFINE | - | Y | Y | Y |
| 5 | SYNTHESIZE | - | Y | Y | Y |
| 6 | CRITIQUE | - | - | Y | Y |
| 7 | REFINE | - | - | Y | Y |
| 8 | PACKAGE | Y | Y | Y | Y |

## Phase Details

### Phase 1: SCOPE
Decompose the question into core components. Identify stakeholder perspectives. Define scope boundaries (in/out). Establish success criteria. List key assumptions to validate.

### Phase 2: PLAN
Identify primary and secondary sources. Map knowledge dependencies. Create search query strategy with 5-10 independent angles:
1. Core topic (semantic) — main concept exploration
2. Technical details (keyword) — specific terms, implementations
3. Recent developments — last 12-18 months
4. Academic sources — papers, formal analysis
5. Alternative perspectives — competing approaches, criticisms
6. Statistical/data — quantitative evidence, benchmarks
7. Industry analysis — commercial applications, market trends

### Phase 3: RETRIEVE
**Execute searches in parallel.** Use `web_search` for multiple query angles simultaneously. Use `web_read` for deep dives into specific sources. Use `spawn_agent` to delegate parallel retrieval tasks.

**First Finish Search (FFS) pattern** — proceed to Phase 4 when quality threshold is met:
- Quick: 10+ sources, avg credibility >60/100
- Standard: 15+ sources, avg credibility >60/100
- Deep: 25+ sources, avg credibility >70/100
- UltraDeep: 30+ sources, avg credibility >75/100

**Source diversity requirements:**
- Minimum 3 source types (academic, industry, news, technical docs)
- Temporal diversity (recent + foundational)
- Perspective diversity (proponents + critics + neutral)

### Phase 4: TRIANGULATE
Cross-reference facts across 3+ sources. Flag contradictions. Assess source credibility (0-100). Note consensus vs debate areas. Core claims must have 3+ independent sources. Flag any single-source information.

### Phase 4.5: OUTLINE REFINEMENT
Compare initial scope with actual findings. Adapt outline when:
- Major findings contradict initial assumptions
- Evidence reveals more important angles than originally scoped
- Critical subtopics emerged that weren't planned

Do NOT adapt based on speculation. Only evidence-driven changes. No more than 50% restructuring.

### Phase 5: SYNTHESIZE
Connect insights across sources. Identify patterns. Generate insights beyond source material. Build argument structures. Develop evidence hierarchies. Reason between tool calls — explain what you've learned and what you'll investigate next.

### Phase 6: CRITIQUE (Deep/UltraDeep only)
Red team questions: What's missing? What could be wrong? What alternative explanations exist? What biases might be present?

Simulate critic personas:
- "Skeptical Practitioner" — would someone doing this daily trust these findings?
- "Adversarial Reviewer" — what would a peer reviewer reject?
- "Implementation Engineer" — can these recommendations actually be executed?

If critique reveals critical knowledge gaps, return to Phase 3 with targeted queries (time-box 3-5 min).

### Phase 7: REFINE (Deep/UltraDeep only)
Address gaps from critique. Strengthen weak arguments. Add missing perspectives. Resolve contradictions.

### Phase 8: PACKAGE
Structure the final report:

**Required sections:**
- Executive Summary (200-400 words)
- Introduction (scope, methodology, assumptions)
- Main Analysis (4-8 findings, cited)
- Synthesis & Insights (patterns, implications)
- Limitations & Caveats
- Recommendations
- Bibliography (complete — every citation, no placeholders)

**Quality standards:**
- 10+ sources minimum, 3+ per major claim
- All claims cited immediately [N]
- No placeholders, no fabricated citations
- Prose-first (>=80%), bullets sparingly

## Anti-patterns

- Don't start writing before completing retrieval and triangulation
- Don't fabricate citations — if you can't find a source, say so
- Don't present single-source claims as established facts
- Don't skip triangulation even under time pressure — it's what separates research from search
- Don't lock into the initial outline — adapt when evidence demands it
- Don't mix searching and synthesizing in the same phase — complete retrieval first

## Memory Integration

After completing research, store key findings as memories:
- Use `add_memory` to store verified facts, especially financial data, competitor positions, and market trends
- Tag with relevant entities via the knowledge graph
- Future research benefits from accumulated institutional knowledge
