#!/usr/bin/env bash
# Every commit auto-appends a line to DECISION_LOG.md if the commit message contains a decision keyword.
set -euo pipefail

MSG=$(git log -1 --pretty=%B)
if echo "$MSG" | grep -qiE "(scope.cut|pivot|decision|chose|rejected|stack)"; then
  HHMM=$(date +%H:%M)
  SHA=$(git rev-parse --short HEAD)
  echo "$HHMM — commit $SHA — $MSG" >> DECISION_LOG.md
fi
