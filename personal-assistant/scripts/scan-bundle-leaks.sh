#!/bin/bash
# Scan production bundle for leaked provider strings
FORBIDDEN="claude\|anthropic\|openai\|haiku\|sonnet\|opus"
LEAKS=$(grep -rl "$FORBIDDEN" .next/static/ 2>/dev/null)

if [ -n "$LEAKS" ]; then
  echo "LEAK: Forbidden strings found in bundle:"
  echo "$LEAKS"
  exit 1
fi
echo "CLEAN: No provider strings in bundle."
exit 0
