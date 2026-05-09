# Per-mode evaluation pipeline

LLM-as-judge harness for the dashboard mode primitive (chat / inbox / work / money).

The pipeline grades a candidate model against a fixed seed dataset, scores each
output against a per-mode rubric, persists results for trend analysis, and runs
on a weekly cron. It does **not** run the candidate model itself — that's the
caller's job (today: a stub; soon: the production agent path).

## Layers

The chain was built foundation-first across six PRs. Each layer is independently
testable and the next layer composes on top.

| PR | File | What it adds |
|---|---|---|
| #100 | `mode-eval-rubric.ts` | `EvalDimension` enum, `MODE_RUBRICS`, `scoreSubmission(rubric, scores)` |
| #100 | `mode-eval-dataset.ts` | 12-case seed dataset, 3 per mode, `getCasesByMode/Dimension/Id` |
| #111 | `eval-driver.ts` | `buildLLMJudgePrompt`, `parseLLMJudgeOutput`, `judgeSubmission(client, rubric, case, submission)` — wires Anthropic SDK |
| #112 | `eval-runner.ts` | `runEvalBatch(client, candidate, options)` — iterates cases, judges each, aggregates `overallMean` + `byMode` |
| #112 | `app/api/cron/eval-run/route.ts` | GET/POST cron-callable wrapper, gated on `CRON_SECRET` |
| #113 | `eval-runner.ts` | `persistEvalRun(supabase, report, options)` — writes `eval_runs` + `eval_results` |
| #113 | migration `20260509000001_eval_runs.sql` | Two tables, indexes for trend queries |
| #114 | `vercel.json` | Weekly cron entry at `0 7 * * 0` (Sunday 07:00 UTC) |

## Running an eval

The pipeline is callable today via the cron endpoint:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://app.bitbit.chat/api/cron/eval-run
```

Optional `?mode=` filter to scope to one of `chat | inbox | work | money`.

The response is `{ report: EvalRunReport, persist: PersistEvalRunOutcome }`.
The report carries the raw judgments + aggregate; `persist` confirms whether
the rows landed in Supabase (or surfaces DB errors as warnings).

## Trend queries

Once a few runs have landed, weekly drift looks like:

```sql
SELECT date_trunc('week', started_at) AS week,
       mode,
       AVG(overall_mean)::int AS mean
FROM eval_runs
WHERE candidate_model = 'production'
GROUP BY week, mode
ORDER BY week DESC, mode;
```

Per-case regression:

```sql
SELECT case_id,
       AVG(normalized_score) FILTER (WHERE created_at > NOW() - INTERVAL '14 days')::int  AS recent,
       AVG(normalized_score) FILTER (WHERE created_at < NOW() - INTERVAL '14 days')::int AS prior
FROM eval_results
WHERE candidate_model = 'production'
GROUP BY case_id
HAVING AVG(normalized_score) FILTER (WHERE created_at > NOW() - INTERVAL '14 days')
     < AVG(normalized_score) FILTER (WHERE created_at < NOW() - INTERVAL '14 days') - 10
ORDER BY case_id;
```

## What's still ahead

- **Real candidate runner** — the cron route uses `stubCandidate` today.
  Replace with a function that calls the production agent path. One file, one
  switch.
- **CI score-floor gate** — fail the build when `overall_mean` drops > N
  points week-over-week. The data is already there; needs a small workflow.
- **Eval dashboard** — read `eval_runs` / `eval_results` and surface trends
  inside the BitBit dashboard. RLS policies land here.
- **Self-consistency sampling** — run the judge prompt N times per case,
  median the score. Tightens noise on borderline cases. Plug in via
  `judgeSubmission` without API breakage.

## Hide the machinery

The user never sees a rubric, a dimension, or a normalized score — eval is an
ops surface, not a product surface. If a case's score drops, the dashboard
might surface a soft "this mode feels off this week" hint, but the underlying
0-100 is for engineers tuning model routing, not for the user.
