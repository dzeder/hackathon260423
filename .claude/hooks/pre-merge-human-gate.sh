#!/usr/bin/env bash
# Block merges to main unless PR has at least one human approval AND no pending checkpoint gate exists.
set -euo pipefail

# Checkpoint gate — blocks merge when a checkpoint is in flight.
PENDING=$(ls .checkpoint-*-pending 2>/dev/null || true)
if [ -n "$PENDING" ]; then
  echo "❌ Checkpoint in flight: $PENDING"
  echo "   Captain must commit 'ack: {time} checkpoint' before merges resume."
  exit 1
fi

# Human approval gate — requires at least one APPROVED review.
if command -v gh >/dev/null 2>&1; then
  APPROVALS=$(gh pr view --json reviews --jq '.reviews | map(select(.state=="APPROVED")) | length' 2>/dev/null || echo 0)
  if [ "$APPROVALS" -lt 1 ]; then
    echo "❌ PR has no human approval. See §7.6."
    exit 1
  fi
fi
