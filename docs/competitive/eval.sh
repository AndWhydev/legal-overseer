#!/bin/bash
# Competitive Intelligence Research Evaluator
# Autoresearch uses this to determine pass/fail for each iteration.

set -e

REPORT="docs/competitive/landscape-report.md"
POSITION="docs/competitive/positioning.md"
ERRORS=()

check() {
  if ! eval "$1"; then
    ERRORS+=("FAIL: $2")
  fi
}

# Phase 1: Landscape Report
check "[ -f '$REPORT' ]" "Landscape report does not exist at $REPORT"
if [ -f "$REPORT" ]; then
  check "[ \$(grep -c '^## Competitor:' '$REPORT') -ge 6 ]" "Fewer than 6 competitor profiles (need >= 6 '## Competitor:' sections)"
  check "grep -q '## Feature Comparison' '$REPORT'" "Missing '## Feature Comparison' matrix section"
  check "grep -q \"## Porter's Five Forces\" '$REPORT'" "Missing Porter's Five Forces analysis"
  check "grep -q '## Market Sizing' '$REPORT'" "Missing market sizing (TAM/SAM/SOM) section"
  check "grep -q '## Positioning Map' '$REPORT'" "Missing competitive positioning map"
  check "grep -q '## Threat Assessment' '$REPORT'" "Missing threat assessment section"
  check "[ \$(wc -w < '$REPORT') -ge 3000 ]" "Landscape report under 3000 words (too shallow)"
fi

# Phase 2: Positioning Document
check "[ -f '$POSITION' ]" "Positioning doc does not exist at $POSITION"
if [ -f "$POSITION" ]; then
  check "grep -q '## Positioning Statement' '$POSITION'" "Missing positioning statement"
  check "grep -q '## Tagline' '$POSITION'" "Missing tagline options"
  check "grep -q '## Blue Ocean' '$POSITION'" "Missing Blue Ocean ERRC grid"
  check "[ \$(grep -c '^## Comparison:' '$POSITION') -ge 3 ]" "Fewer than 3 comparison sections (need >= 3 '## Comparison:' sections)"
  check "grep -q '## GTM Strategy' '$POSITION'" "Missing GTM strategy recommendations"
  check "grep -q '## Moat Analysis' '$POSITION'" "Missing moat/defensibility analysis"
  check "[ \$(wc -w < '$POSITION') -ge 2000 ]" "Positioning doc under 2000 words (too shallow)"
fi

if [ ${#ERRORS[@]} -gt 0 ]; then
  echo "EVALUATOR FAILED (${#ERRORS[@]} issues):"
  printf '  %s\n' "${ERRORS[@]}"
  exit 1
fi

echo "EVALUATOR PASSED: All competitive intelligence checks satisfied"
exit 0
