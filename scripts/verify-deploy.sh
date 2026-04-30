#!/usr/bin/env bash
# verify-deploy.sh — pre-bug-bash check that the merged-to-master code is
# actually live in the sandbox + Vercel + Datadog, and that the operational
# steps that don't run automatically (Customer_Id__c population, retention
# schedule, Datadog template apply) have been done.
#
# Usage:
#   BASE_URL=https://web-app-chi-puce.vercel.app \
#   SF_ORG_ALIAS=ohanafy-hack-sandbox \
#   CUSTOMER_ID=yellowhammer \
#   DD_API_KEY=... DD_APP_KEY=... \
#   scripts/verify-deploy.sh
#
# Each section is independent; missing creds for a section print a WARN
# and skip instead of failing the whole run, so a partial check still
# tells you what you do know.
#
# Exit codes:
#   0 — every required check passed (warnings are OK)
#   1 — at least one required check failed
#   2 — script setup error (missing tool, malformed input)

set -uo pipefail

# --- inputs ---------------------------------------------------------------

: "${BASE_URL:=}"
: "${SF_ORG_ALIAS:=ohanafy-hack-sandbox}"
: "${SF_NAMESPACE:=ohfy__}"   # set to "" for unmanaged dev orgs
: "${CUSTOMER_ID:=yellowhammer}"
: "${DD_API_KEY:=}"
: "${DD_APP_KEY:=}"
: "${DD_SITE:=datadoghq.com}"
: "${EXPECTED_BRANCH:=master}"

NS="$SF_NAMESPACE"

# Required tools — fail fast if any is missing.
for cmd in curl jq git; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command '$cmd' not on PATH" >&2
    exit 2
  fi
done

# --- counters + helpers ---------------------------------------------------

passes=0
warns=0
fails=0

section() {
  echo
  echo "==> $1"
}
pass() { echo "  OK   - $1"; passes=$((passes + 1)); }
warn() { echo "  WARN - $1"; warns=$((warns + 1)); }
fail() { echo "  FAIL - $1"; fails=$((fails + 1)); }

# Hash matches packages/web-app/src/lib/customerId.ts:hashCustomerId.
hash_customer_id() {
  local raw="$1"
  local digest
  if command -v shasum >/dev/null 2>&1; then
    digest="$(printf '%s' "$raw" | shasum -a 256 | awk '{print $1}')"
  elif command -v sha256sum >/dev/null 2>&1; then
    digest="$(printf '%s' "$raw" | sha256sum | awk '{print $1}')"
  else
    digest="$(printf '%s' "$raw" | openssl dgst -sha256 -binary | xxd -p -c 256)"
  fi
  printf 'c_%s' "${digest:0:16}"
}

CUSTOMER_ID_HASH="$(hash_customer_id "$CUSTOMER_ID")"
EXPECTED_SHA="$(git rev-parse "origin/${EXPECTED_BRANCH}" 2>/dev/null || git rev-parse "$EXPECTED_BRANCH" 2>/dev/null || echo "")"
EXPECTED_SHORT="${EXPECTED_SHA:0:7}"

echo "verify-deploy.sh"
echo "  customer_id     ${CUSTOMER_ID}"
echo "  customer_hash   ${CUSTOMER_ID_HASH}"
echo "  expected master ${EXPECTED_SHORT:-<unknown>}"
echo "  sf org alias    ${SF_ORG_ALIAS}"
echo "  datadog site    ${DD_SITE}"
echo "  base url        ${BASE_URL:-<unset>}"

# --- section 1: Vercel ----------------------------------------------------

section "Vercel — /api/health and deployed SHA"
if [[ -z "$BASE_URL" ]]; then
  warn "BASE_URL not set; skipping Vercel checks"
else
  BASE_URL="${BASE_URL%/}"
  HEALTH_BODY="$(curl -fsS --max-time 10 "${BASE_URL}/api/health" 2>/dev/null || echo "")"
  if [[ -z "$HEALTH_BODY" ]]; then
    fail "/api/health did not respond at ${BASE_URL}"
  else
    if jq -e '.status == "ok"' >/dev/null 2>&1 <<<"$HEALTH_BODY"; then
      pass "/api/health status=ok"
    else
      fail "/api/health status is not ok — body: $(printf '%s' "$HEALTH_BODY" | head -c 300)"
    fi
    for k in anthropic gatewayAuth salesforce; do
      if jq -e ".checks.${k}.ok == true" >/dev/null 2>&1 <<<"$HEALTH_BODY"; then
        pass "checks.${k}.ok"
      else
        DETAIL="$(jq -r ".checks.${k}.detail // \"missing\"" <<<"$HEALTH_BODY")"
        fail "checks.${k}.ok is false — ${DETAIL}"
      fi
    done

    DEPLOYED_SHA="$(jq -r '.version // ""' <<<"$HEALTH_BODY")"
    if [[ -z "$DEPLOYED_SHA" || "$DEPLOYED_SHA" == "local" ]]; then
      warn "deployed version not reported (VERCEL_GIT_COMMIT_SHA may be unset on the deploy)"
    elif [[ -z "$EXPECTED_SHORT" ]]; then
      warn "could not resolve master HEAD locally to compare"
    elif [[ "$DEPLOYED_SHA" == "$EXPECTED_SHORT"* || "$EXPECTED_SHA" == "$DEPLOYED_SHA"* ]]; then
      pass "Vercel deploy is at master HEAD (${DEPLOYED_SHA})"
    else
      fail "Vercel is at ${DEPLOYED_SHA}, master is ${EXPECTED_SHORT} — redeploy with \`vercel deploy --prod --yes\`"
    fi
  fi
fi

# --- section 2: Salesforce metadata --------------------------------------

# Returns "ok" if the type is in the org, "missing" if not (INVALID_TYPE),
# "error" if the query failed for another reason. Used to give clearer
# failure messages than "field is blank" when the whole object is absent.
sf_type_status() {
  local type="$1"
  local out
  out="$(sf data query -o "$SF_ORG_ALIAS" -q "SELECT COUNT() FROM ${NS}${type}" --json 2>&1 || true)"
  if jq -e '.result.totalSize >= 0' >/dev/null 2>&1 <<<"$out"; then
    echo "ok"
  elif jq -e '.name == "INVALID_TYPE"' >/dev/null 2>&1 <<<"$out"; then
    echo "missing"
  else
    echo "error"
  fi
}

section "Salesforce — bound Customer_Id__c + retention config"
if ! command -v sf >/dev/null 2>&1; then
  warn "sf CLI not on PATH; skipping Salesforce checks"
else
  # Probe that the org alias is authenticated. `sf org display` is read-only.
  if ! sf org display --target-org "$SF_ORG_ALIAS" >/dev/null 2>&1; then
    warn "sf org alias '${SF_ORG_ALIAS}' not authenticated; skipping (run \`sf org login\`)"
  else
    pass "sf org '${SF_ORG_ALIAS}' authenticated"

    # Big-picture check first: if the custom objects don't exist at all, the
    # rest of the metadata checks are moot — and the right action is to
    # deploy, not to populate fields. This catches the case where the CI
    # apex-tests job has been silently skipping (missing SF_AUTH_URL secret).
    COPILOT_STATUS="$(sf_type_status Ohanafy_Copilot_Config__mdt)"
    RETENTION_STATUS="$(sf_type_status Plan_Retention_Config__mdt)"
    CONV_STATUS="$(sf_type_status Plan_Conversation__c)"

    if [[ "$COPILOT_STATUS" == "missing" || "$CONV_STATUS" == "missing" ]]; then
      fail "force-app/ has not been deployed to '${SF_ORG_ALIAS}'. Run:"
      echo "         sf project deploy start --source-dir force-app \\"
      echo "           --target-org ${SF_ORG_ALIAS} --test-level RunLocalTests"
      echo "       The CI apex-tests job skips when the SF_AUTH_URL GitHub secret is unset."
      echo "       Check Settings -> Environments -> hackathon-deploy on the repo."
    else
      pass "core custom objects (Ohanafy_Copilot_Config__mdt, Plan_Conversation__c) are present"

      # Customer_Id__c — the P0-#3 bind is a no-op until this is set.
      QRY="SELECT ${NS}Customer_Id__c FROM ${NS}Ohanafy_Copilot_Config__mdt WHERE DeveloperName = 'Default'"
      OUT="$(sf data query -o "$SF_ORG_ALIAS" -q "$QRY" --json 2>/dev/null || echo "")"
      BOUND_ID="$(jq -r --arg k "${NS}Customer_Id__c" '.result.records[0][$k] // ""' <<<"$OUT" 2>/dev/null)"
      if [[ -n "$BOUND_ID" && "$BOUND_ID" != "null" ]]; then
        if [[ "$BOUND_ID" == "$CUSTOMER_ID" ]]; then
          pass "Ohanafy_Copilot_Config__mdt.Default.Customer_Id__c = '${BOUND_ID}' (matches CUSTOMER_ID)"
        else
          fail "Customer_Id__c is '${BOUND_ID}' but CUSTOMER_ID is '${CUSTOMER_ID}' — Vercel and SF disagree"
        fi
      else
        fail "Customer_Id__c is blank — P0-#3 bind enforcement is a no-op until populated"
      fi
    fi

    if [[ "$RETENTION_STATUS" == "missing" ]]; then
      fail "Plan_Retention_Config__mdt is not in the org — re-deploy force-app/"
    elif [[ "$RETENTION_STATUS" == "ok" ]]; then
      QRY="SELECT ${NS}Days_To_Keep__c, ${NS}Enabled__c FROM ${NS}Plan_Retention_Config__mdt WHERE DeveloperName = 'Default'"
      OUT="$(sf data query -o "$SF_ORG_ALIAS" -q "$QRY" --json 2>/dev/null || echo "")"
      DAYS="$(jq -r --arg k "${NS}Days_To_Keep__c" '.result.records[0][$k] // ""' <<<"$OUT" 2>/dev/null)"
      ENABLED="$(jq -r --arg k "${NS}Enabled__c" '.result.records[0][$k] // ""' <<<"$OUT" 2>/dev/null)"
      if [[ -n "$DAYS" && "$DAYS" != "null" ]]; then
        pass "Plan_Retention_Config__mdt.Default (Days_To_Keep=${DAYS}, Enabled=${ENABLED})"
      else
        fail "Plan_Retention_Config__mdt.Default record missing — re-run the deploy"
      fi
    fi
  fi
fi

# --- section 3: Salesforce schedule --------------------------------------

section "Salesforce — retention cron scheduled"
if ! command -v sf >/dev/null 2>&1; then
  warn "sf CLI missing; skipping"
elif ! sf org display --target-org "$SF_ORG_ALIAS" >/dev/null 2>&1; then
  warn "sf org not authenticated; skipping"
else
  QRY="SELECT Id, CronExpression, NextFireTime, State FROM CronTrigger WHERE CronJobDetail.Name LIKE '%Ohanafy Plan retention%'"
  OUT="$(sf data query -o "$SF_ORG_ALIAS" -q "$QRY" --json 2>/dev/null || echo "")"
  TOTAL="$(jq -r '.result.totalSize // 0' <<<"$OUT" 2>/dev/null)"
  if [[ "$TOTAL" -ge 1 ]]; then
    NEXT="$(jq -r '.result.records[0].NextFireTime // "?"' <<<"$OUT")"
    STATE="$(jq -r '.result.records[0].State // "?"' <<<"$OUT")"
    CRON="$(jq -r '.result.records[0].CronExpression // "?"' <<<"$OUT")"
    pass "OhfyPlanRetentionJob scheduled (state=${STATE}, next=${NEXT}, cron=${CRON})"
  else
    fail "OhfyPlanRetentionJob is NOT scheduled — run the anonymous Apex one-liner from docs/runbook.md \"Conversation retention\""
  fi
fi

# --- section 4: Datadog ---------------------------------------------------

section "Datadog — dashboard, monitors, recent spans"
if [[ -z "$DD_API_KEY" || -z "$DD_APP_KEY" ]]; then
  warn "DD_API_KEY or DD_APP_KEY missing; skipping Datadog checks"
else
  DD_API="https://api.${DD_SITE}/api/v1"
  DD_API_V2="https://api.${DD_SITE}/api/v2"

  # Dashboard — apply.sh creates one per CUSTOMER_LABEL; we don't know the
  # exact label so we look for the common prefix.
  DASH="$(curl -fsS -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    "${DD_API}/dashboard" 2>/dev/null || echo "")"
  DASH_HIT="$(jq -r '[.dashboards[]? | select(.title | startswith("Ohanafy Plan — Copilot Overview"))] | length' <<<"$DASH" 2>/dev/null || echo 0)"
  if [[ "$DASH_HIT" -ge 1 ]]; then
    pass "found ${DASH_HIT} 'Ohanafy Plan — Copilot Overview' dashboard(s)"
  else
    fail "no 'Ohanafy Plan — Copilot Overview' dashboard — run \`ops/datadog/apply.sh\`"
  fi

  # Monitors — search by tag the apply script always sets.
  MON="$(curl -fsS --get \
    -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    --data-urlencode "monitor_tags=customer_id_hash:${CUSTOMER_ID_HASH}" \
    "${DD_API}/monitor/search" 2>/dev/null || echo "")"
  MON_COUNT="$(jq -r '.counts.status[]?.count // 0' <<<"$MON" 2>/dev/null | awk '{s+=$1} END {print s+0}')"
  # Fallback to the top-level "counts.muted" + "counts.unmuted" sum if needed.
  if [[ -z "$MON_COUNT" || "$MON_COUNT" == "0" ]]; then
    MON_COUNT="$(jq -r '.monitors // [] | length' <<<"$MON" 2>/dev/null || echo 0)"
  fi
  if [[ "$MON_COUNT" -ge 4 ]]; then
    pass "found ${MON_COUNT} monitors tagged customer_id_hash:${CUSTOMER_ID_HASH}"
  elif [[ "$MON_COUNT" -ge 1 ]]; then
    warn "found only ${MON_COUNT} monitors (expect 4-5); re-run \`ops/datadog/apply.sh\`"
  else
    fail "no monitors tagged customer_id_hash:${CUSTOMER_ID_HASH} — run \`ops/datadog/apply.sh\`"
  fi

  # Recent log traffic — proves the deploy is actually emitting and the
  # hash on this side matches what's on the wire.
  NOW_MS="$(($(date +%s) * 1000))"
  HOUR_AGO_MS="$((NOW_MS - 3600000))"
  LOG_QUERY="$(jq -nc \
    --arg q "service:ohanafy-plan-webapp @customer_id_hash:${CUSTOMER_ID_HASH}" \
    --arg from "$HOUR_AGO_MS" --arg to "$NOW_MS" \
    '{filter:{query:$q, from:$from, to:$to}, page:{limit:1}}')"
  LOGS="$(curl -fsS -X POST \
    -H "DD-API-KEY: $DD_API_KEY" -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
    -H "Content-Type: application/json" \
    -d "$LOG_QUERY" \
    "${DD_API_V2}/logs/events/search" 2>/dev/null || echo "")"
  LOG_COUNT="$(jq -r '.data | length' <<<"$LOGS" 2>/dev/null || echo 0)"
  if [[ "$LOG_COUNT" -ge 1 ]]; then
    pass "Datadog has logs for ${CUSTOMER_ID_HASH} in the last hour"
  else
    warn "no Datadog logs for ${CUSTOMER_ID_HASH} in the last hour — generate traffic by hitting /api/copilot once and re-run"
  fi
fi

# --- section 5: end-to-end bind probe ------------------------------------

section "End-to-end — wrong-customer probe (proves the bind rejects)"
if [[ -z "$BASE_URL" ]]; then
  warn "BASE_URL not set; skipping probe"
else
  WRONG_ID="probe-not-${CUSTOMER_ID}"
  PROBE_OUT="$(curl -fsS --max-time 15 \
    -H "Content-Type: application/json" \
    -H "x-customer-id: ${WRONG_ID}" \
    -X POST "${BASE_URL}/api/copilot" \
    -d '{"prompt":"verify-deploy probe","scenarioId":"probe","appliedEventIds":[]}' \
    -w "\nHTTP_STATUS:%{http_code}" 2>/dev/null || echo "HTTP_STATUS:000")"
  PROBE_BODY="$(printf '%s' "$PROBE_OUT" | sed -e '$d')"
  PROBE_CODE="$(printf '%s' "$PROBE_OUT" | grep -o 'HTTP_STATUS:[0-9]*' | tail -1 | cut -d: -f2)"
  if [[ "$PROBE_CODE" == "000" ]]; then
    fail "probe request failed (no HTTP response)"
  elif [[ "$PROBE_CODE" == "503" ]]; then
    pass "/api/copilot rejected wrong customer with 503 (no SF_CUSTOMER_ID match)"
  elif [[ "$PROBE_CODE" == "200" ]] && grep -qiE '(does not match|persist failed)' <<<"$PROBE_BODY"; then
    pass "/api/copilot served canned but logs show downstream bind rejection"
  elif [[ "$PROBE_CODE" == "200" ]]; then
    fail "/api/copilot returned 200 with NO bind-rejection signal — Customer_Id__c may be unset on the SF side"
  else
    warn "/api/copilot returned HTTP ${PROBE_CODE} (unexpected; review body): $(head -c 200 <<<"$PROBE_BODY")"
  fi
fi

# --- summary --------------------------------------------------------------

echo
echo "==> Summary"
echo "    passed: ${passes}"
echo "    warned: ${warns}"
echo "    failed: ${fails}"

if [[ "$fails" -gt 0 ]]; then
  echo
  echo "Some required checks failed. Fix the FAIL lines above and re-run."
  exit 1
fi

echo
if [[ "$warns" -gt 0 ]]; then
  echo "All required checks passed. ${warns} warnings (usually missing creds for an optional section)."
else
  echo "All required checks passed. The sandbox is green for the bug bash."
fi
exit 0
