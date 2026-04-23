#!/usr/bin/env bash
# Block pushes to main; enforce 4 PM freeze on demo day.
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ]; then
  echo "❌ Cannot push to main directly. Open a PR from your track branch."
  exit 1
fi

# 4 PM hard freeze on demo day — only .md files allowed.
# Enable by setting FREEZE_AFTER_1600=1 in the shell on demo day.
if [ "${FREEZE_AFTER_1600:-0}" = "1" ]; then
  HOUR=$(date +%H)
  if [ "$HOUR" -ge 16 ]; then
    NON_MD=$(git diff --cached --name-only HEAD~1 HEAD 2>/dev/null | grep -v '\.md$' || true)
    if [ -n "$NON_MD" ]; then
      echo "❌ 4 PM freeze: only .md files allowed. Offending files:"
      echo "$NON_MD"
      exit 1
    fi
  fi
fi
