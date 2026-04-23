#!/usr/bin/env bash
# After merge to main, post a summary to #axe-a-thon. Silent no-op if SLACK_WEBHOOK_URL not set.
set -euo pipefail

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  exit 0
fi

SUMMARY=$(git log -1 --pretty=%s)
SHA=$(git rev-parse --short HEAD)
curl -X POST -H 'Content-type: application/json' \
  --data "{\"text\":\"🟢 Merged to main: \`$SHA\` — $SUMMARY\"}" \
  "$SLACK_WEBHOOK_URL" >/dev/null 2>&1 || true
