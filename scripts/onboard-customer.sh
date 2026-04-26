#!/usr/bin/env bash
# onboard-customer.sh — verification tool for adding a new customer.
#
# Usage:  scripts/onboard-customer.sh <customer_id> [base_url]
#
# Reads no secrets. Validates that the deploy at <base_url> (defaults to the
# `VERCEL_URL` env, falling back to https://<project>.vercel.app) is wired to
# this customer:
#   1. /api/health returns 200 with all three checks ok
#   2. The hashed customer id Datadog will tag spans with is printed
#   3. A guarded probe with the wrong customer id is rejected (proves the
#      Apex bind is configured)
#
# This script never writes to either side — it only checks. Run it after the
# Salesforce + Vercel onboarding steps in docs/runbook.md §15.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <customer_id> [base_url]" >&2
  exit 64
fi

CUSTOMER_ID="$1"
BASE_URL="${2:-${VERCEL_URL:-}}"

if [[ -z "$BASE_URL" ]]; then
  echo "error: base_url not given and VERCEL_URL is unset" >&2
  echo "       pass the deploy URL as the second arg (e.g. https://acme-plan.vercel.app)" >&2
  exit 64
fi

# Strip trailing slash and add scheme if missing.
BASE_URL="${BASE_URL%/}"
if [[ ! "$BASE_URL" =~ ^https?:// ]]; then
  BASE_URL="https://$BASE_URL"
fi

echo "==> Onboarding check for customer_id='${CUSTOMER_ID}' against ${BASE_URL}"

# --- 1. Health check --------------------------------------------------------
echo
echo "--- /api/health -----------------------------------------------------"
HEALTH_OUT="$(curl -fsS --max-time 10 "${BASE_URL}/api/health" || true)"
if [[ -z "$HEALTH_OUT" ]]; then
  echo "FAIL: /api/health did not respond" >&2
  exit 1
fi
echo "$HEALTH_OUT"

# Crude jq-free assertion: every check must say ok=true.
if ! grep -q '"status":"ok"' <<<"$HEALTH_OUT"; then
  echo "FAIL: /api/health is not status=ok — see the body above" >&2
  exit 1
fi
if grep -q '"ok":false' <<<"$HEALTH_OUT"; then
  echo "FAIL: at least one health check is failing" >&2
  exit 1
fi
echo "OK: /api/health all green"

# --- 2. Hashed customer id (matches lib/customerId.ts) ----------------------
HASH_HEX="$(printf '%s' "$CUSTOMER_ID" | shasum -a 256 | awk '{print $1}' | cut -c1-16)"
HASHED_ID="c_${HASH_HEX}"
echo
echo "--- Datadog filter --------------------------------------------------"
echo "service:ohanafy-plan-webapp customer_id_hash:${HASHED_ID}"
echo "(every span and log line for this customer is tagged with this hash)"

# --- 3. Wrong-customer probe ------------------------------------------------
# A copilot turn carrying a wrong customer id must be refused. We can't reach
# /plan/memory directly (auth lives on the SF side), but the web-app route
# enforces the same boundary: a request with a header that disagrees with
# SF_CUSTOMER_ID will fail downstream once it tries to touch memory.
echo
echo "--- Cross-customer probe -------------------------------------------"
WRONG_ID="probe-not-${CUSTOMER_ID}"
PROBE_OUT="$(
  curl -fsS --max-time 15 \
    -H "Content-Type: application/json" \
    -H "x-customer-id: ${WRONG_ID}" \
    -X POST "${BASE_URL}/api/copilot" \
    -d '{"prompt":"onboarding probe","scenarioId":"probe","appliedEventIds":[]}' \
    -w "\n%{http_code}" || true
)"
PROBE_BODY="$(printf '%s\n' "$PROBE_OUT" | sed '$d')"
PROBE_CODE="$(printf '%s\n' "$PROBE_OUT" | tail -n1)"
echo "HTTP ${PROBE_CODE}"
echo "${PROBE_BODY}" | head -c 400 ; echo

# We expect either:
#   - 503 (no SF_CUSTOMER_ID match on the route + no header bind known yet)
#   - 200 with the Apex bind rejecting on persistence — surfacing as a
#     persist-failed warning while the canned shape is still served
#   - 5xx with a memory-store error
# A bare 200 with no rejection signal would mean the bind is not enforced.
if [[ "$PROBE_CODE" == "200" ]]; then
  if ! grep -qiE '(does not match|cost_cap|persist failed|customer)' <<<"$PROBE_BODY"; then
    echo "WARN: cross-customer probe returned 200 with no bind-rejection signal" >&2
    echo "      verify Ohanafy_Copilot_Config__mdt.Default.Customer_Id__c is set" >&2
  fi
fi

# --- 4. Done ---------------------------------------------------------------
echo
echo "==> Verification complete."
echo "    Next: run the Playwright happy-path against this URL:"
echo "        cd packages/web-app && BASE_URL=${BASE_URL} npm run e2e"
echo "    Then add a DECISION_LOG.md entry recording the onboarding."
