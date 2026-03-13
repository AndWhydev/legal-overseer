#!/bin/bash
# Scan source for hardcoded model IDs outside model-registry.ts
LEAKS=$(grep -rn "claude-\(opus\|sonnet\|haiku\)" personal-assistant/src/ \
  --include="*.ts" --include="*.tsx" \
  | grep -v "model-registry.ts" \
  | grep -v "node_modules" \
  | grep -v "\.test\.")

if [ -n "$LEAKS" ]; then
  echo "BLOCKED: Hardcoded model ID found outside model-registry.ts:"
  echo "$LEAKS"
  exit 1
fi
echo "CLEAN: No hardcoded model IDs found."
exit 0
