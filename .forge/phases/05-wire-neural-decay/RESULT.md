# Phase 05: Wire Neural Decay — RESULT

## Summary

Neural decay signals (confidence and time-decay) are now factored into recall scoring. Previously, `scoreEdge` in `proactive-recall.ts` used `edge.confidence` only as one component of a weighted blend (30% weight). Now it also applies confidence and temporal decay as **multipliers** on the final blended score, so stale/low-confidence synapses are actively dampened in recall.

## Changes

### Production Code
- **`personal-assistant/src/lib/memory-palace/proactive-recall.ts`** — `scoreEdge()` modified:
  - `blendedScore *= (edge.confidence ?? 1)` — confidence as a multiplier (0-1 range)
  - `blendedScore *= Math.exp(-(edge.decay_rate ?? 0.01) * daysSinceLastFired)` — exponential time-decay based on synapse `decay_rate` and `last_fired_at`
  - `last_fired_at === null` → no penalty (multiplier defaults to 1.0)

### Tests
- **`personal-assistant/src/lib/memory-palace/__tests__/neural-decay.test.ts`** (new, 203 lines):
  - `high-confidence recent edges score higher than low-confidence old edges` — validates combined effect
  - `two identical entities with different decay rates produce different scores` — isolates decay_rate impact
  - `null last_fired_at defaults to no penalty` — verifies null safety

## Quality Gates

| Gate | Status |
|------|--------|
| `tsc --noEmit` | PASS (only pre-existing sendblue-media.ts error) |
| `vitest run neural-decay` | PASS (3/3) |
| TDD (tests written first) | YES — tests failed before production code |

## Decisions

- **Confidence applied twice**: Once as a blend component (0.3 weight) and once as a multiplier. This is intentional — the blend gives baseline weight, the multiplier provides sharper discrimination between high and low confidence edges.
- **Default decay_rate**: Falls back to 0.01 if null, matching the existing `RECENCY_DECAY` constant.
- **Null last_fired_at = no penalty**: Conservative default — unfired synapses aren't penalized, only synapses that fired long ago.

## Commits

1. `84d16dd1` — test(neural-decay): add tests for decay-weighted recall scoring
2. `e5ba2454` — feat(neural-decay): wire confidence + time-decay into recall scoring
