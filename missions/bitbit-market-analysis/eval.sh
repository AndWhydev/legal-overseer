#!/bin/bash
# Evaluator for BitBit market analysis autoresearch
# Outputs JSON: {"pass": bool, "score": float, "details": [...]}

RESEARCH_DIR=".omc/research"
PATTERN="bitbit-market*"
FAILS=0
TOTAL=6
DETAILS=()

# Find the latest research output — check multiple likely paths
FILE=""
for search_dir in "." "$RESEARCH_DIR" "missions/bitbit-market-analysis"; do
  found=$(find "$search_dir" -maxdepth 2 -name "*.md" -not -name "mission.md" -not -name "sandbox.md" -not -name "eval.sh" -type f 2>/dev/null | head -1)
  if [ -n "$found" ] && [ "$(wc -w < "$found" 2>/dev/null)" -gt 100 ]; then
    FILE="$found"
    break
  fi
done

if [ -z "$FILE" ]; then
  echo '{"pass": false, "score": 0.0, "details": ["No research output file found"]}'
  exit 0
fi

check() {
  if eval "$1"; then
    DETAILS+=("\"PASS: $2\"")
  else
    DETAILS+=("\"FAIL: $2\"")
    FAILS=$((FAILS + 1))
  fi
}

# 1. Word count > 1000
WC=$(wc -w < "$FILE")
check "[ $WC -ge 1000 ]" "Word count ($WC, need >= 1000)"

# 2. Deep profiles for 3+ competitors
DEEP_COUNT=0
grep -qi "openclaw" "$FILE" && DEEP_COUNT=$((DEEP_COUNT + 1))
grep -qi "claude managed\|managed agent" "$FILE" && DEEP_COUNT=$((DEEP_COUNT + 1))
for comp in "lindy" "relevance" "dust" "multion" "rabbit" "adept" "cognition" "sierra" "11x" "bardeen"; do
  if [ "$(grep -ci "$comp" "$FILE" 2>/dev/null)" -ge 3 ]; then
    DEEP_COUNT=$((DEEP_COUNT + 1))
    break
  fi
done
check "[ $DEEP_COUNT -ge 3 ]" "Deep competitor profiles ($DEEP_COUNT found, need >= 3)"

# 3. Quick scan of 5+ adjacent players
SCAN_COUNT=0
for comp in "lindy" "relevance" "dust" "multion" "rabbit" "adept" "cognition" "sierra" "11x" "bardeen" "zapier" "make.com" "n8n" "flowise" "langchain"; do
  grep -qi "$comp" "$FILE" && SCAN_COUNT=$((SCAN_COUNT + 1))
done
check "[ $SCAN_COUNT -ge 5 ]" "Quick scan breadth ($SCAN_COUNT adjacent players, need >= 5)"

# 4. All 3 dimension categories covered
DIM_COUNT=0
grep -qi "messaging\|invoice\|triage\|autonomy" "$FILE" && DIM_COUNT=$((DIM_COUNT + 1))
grep -qi "pricing\|deployment\|api\|ai model" "$FILE" && DIM_COUNT=$((DIM_COUNT + 1))
grep -qi "target customer\|icp\|go.to.market\|gtm\|funding" "$FILE" && DIM_COUNT=$((DIM_COUNT + 1))
check "[ $DIM_COUNT -ge 3 ]" "Dimension coverage ($DIM_COUNT/3 categories)"

# 5. Positioning recommendation
check "grep -qi 'positioning\|recommendation\|differentiat' '$FILE'" "Positioning recommendation present"

# 6. AI COO hypothesis addressed
check "grep -qi 'ai coo\|chief operating\|coo positioning' '$FILE'" "AI COO hypothesis addressed"

PASSED=$((TOTAL - FAILS))
SCORE=$(echo "scale=2; $PASSED / $TOTAL" | bc)
PASS=$([ "$FAILS" -eq 0 ] && echo "true" || echo "false")

# Build JSON array of details
DETAIL_JSON=$(IFS=,; echo "${DETAILS[*]}")

echo "{\"pass\": $PASS, \"score\": $SCORE, \"details\": [$DETAIL_JSON]}"
exit 0
