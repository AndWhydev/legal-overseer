#!/bin/bash
# Evaluator for BitBit market analysis autoresearch
# Checks rubric completeness — exit 0 = pass, exit 1 = fail

RESEARCH_DIR=".omc/research"
PATTERN="bitbit-market*"
FAILS=0
TOTAL=6

# Find the latest research output
FILE=$(find "$RESEARCH_DIR" -name "$PATTERN" -type f 2>/dev/null | sort -r | head -1)

if [ -z "$FILE" ]; then
  echo "FAIL: No research output found matching $RESEARCH_DIR/$PATTERN"
  exit 1
fi

echo "Evaluating: $FILE"
echo "---"

# 1. Word count > 1000
WC=$(wc -w < "$FILE")
if [ "$WC" -ge 1000 ]; then
  echo "PASS [1/6]: Word count ($WC >= 1000)"
else
  echo "FAIL [1/6]: Word count ($WC < 1000)"
  FAILS=$((FAILS + 1))
fi

# 2. Deep profiles for 3+ competitors (OpenClaw, Claude Managed Agents, +1)
DEEP_COUNT=0
grep -qi "openclaw" "$FILE" && DEEP_COUNT=$((DEEP_COUNT + 1))
grep -qi "claude managed\|managed agent" "$FILE" && DEEP_COUNT=$((DEEP_COUNT + 1))
# Check for any third competitor with substantive mention (50+ words in context)
for comp in "lindy" "relevance" "dust.tt" "multion" "rabbit" "adept" "cognition" "sierra" "11x" "bardeen"; do
  if grep -ci "$comp" "$FILE" 2>/dev/null | awk '{exit ($1 < 3)}'; then
    DEEP_COUNT=$((DEEP_COUNT + 1))
    break
  fi
done
if [ "$DEEP_COUNT" -ge 3 ]; then
  echo "PASS [2/6]: Deep competitor profiles ($DEEP_COUNT found)"
else
  echo "FAIL [2/6]: Deep competitor profiles ($DEEP_COUNT < 3)"
  FAILS=$((FAILS + 1))
fi

# 3. Quick scan of 5+ adjacent players
SCAN_COUNT=0
for comp in "lindy" "relevance" "dust" "multion" "rabbit" "adept" "cognition" "sierra" "11x" "bardeen" "zapier" "make.com" "n8n" "flowise" "langchain"; do
  grep -qi "$comp" "$FILE" && SCAN_COUNT=$((SCAN_COUNT + 1))
done
if [ "$SCAN_COUNT" -ge 5 ]; then
  echo "PASS [3/6]: Quick scan breadth ($SCAN_COUNT adjacent players)"
else
  echo "FAIL [3/6]: Quick scan breadth ($SCAN_COUNT < 5)"
  FAILS=$((FAILS + 1))
fi

# 4. Operations, tech, and market dimensions covered
DIM_COUNT=0
grep -qi "messaging\|invoice\|triage\|autonomy" "$FILE" && DIM_COUNT=$((DIM_COUNT + 1))
grep -qi "pricing\|deployment\|api\|ai model" "$FILE" && DIM_COUNT=$((DIM_COUNT + 1))
grep -qi "target customer\|icp\|go.to.market\|gtm\|funding" "$FILE" && DIM_COUNT=$((DIM_COUNT + 1))
if [ "$DIM_COUNT" -ge 3 ]; then
  echo "PASS [4/6]: All 3 dimension categories covered"
else
  echo "FAIL [4/6]: Only $DIM_COUNT/3 dimension categories covered"
  FAILS=$((FAILS + 1))
fi

# 5. Positioning recommendation with evidence
if grep -qi "positioning\|recommendation\|differentiat" "$FILE"; then
  echo "PASS [5/6]: Positioning recommendation present"
else
  echo "FAIL [5/6]: No positioning recommendation found"
  FAILS=$((FAILS + 1))
fi

# 6. AI COO hypothesis explicitly addressed
if grep -qi "ai coo\|chief operating\|coo positioning" "$FILE"; then
  echo "PASS [6/6]: AI COO hypothesis addressed"
else
  echo "FAIL [6/6]: AI COO hypothesis not addressed"
  FAILS=$((FAILS + 1))
fi

echo "---"
PASSED=$((TOTAL - FAILS))
echo "Result: $PASSED/$TOTAL checks passed"

if [ "$FAILS" -eq 0 ]; then
  echo "VERDICT: PASS"
  exit 0
else
  echo "VERDICT: FAIL ($FAILS items need improvement)"
  exit 1
fi
