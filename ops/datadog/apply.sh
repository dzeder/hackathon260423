#!/usr/bin/env bash
# apply.sh — render the Datadog dashboard + monitor templates for one customer
# and create-or-update them via the Datadog API. Idempotent.
#
# Usage:
#   DD_API_KEY=... DD_APP_KEY=... \
#   CUSTOMER_ID=acme-wines \
#   CUSTOMER_LABEL="Acme Wines" \
#   ops/datadog/apply.sh
#
# Optional env:
#   DD_SITE             default datadoghq.com (use datadoghq.eu for EU orgs)
#   VERCEL_URL          required for the health-check monitor; e.g. acme-plan.vercel.app
#   HEALTH_CHECK_ID     Datadog synthetic test id; if unset, health-check monitor is skipped
#
# Required tools: curl, jq, openssl (or shasum), envsubst
#
# This script is the only supported way to apply these templates. Do not edit
# dashboards / monitors in the Datadog UI — your changes will be wiped on the
# next apply. Re-run apply.sh after editing JSON files in ops/datadog/.

set -euo pipefail

# --- inputs ---------------------------------------------------------------

: "${DD_API_KEY:?DD_API_KEY env var is required}"
: "${DD_APP_KEY:?DD_APP_KEY env var is required}"
: "${CUSTOMER_ID:?CUSTOMER_ID env var is required (plain string, same as Vercel SF_CUSTOMER_ID)}"
CUSTOMER_LABEL="${CUSTOMER_LABEL:-$CUSTOMER_ID}"
DD_SITE="${DD_SITE:-datadoghq.com}"
VERCEL_URL="${VERCEL_URL:-}"
HEALTH_CHECK_ID="${HEALTH_CHECK_ID:-}"

# Sanity: required CLI tools
for cmd in curl jq envsubst; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: required command '$cmd' not on PATH" >&2
    exit 64
  fi
done

# Hash matches packages/web-app/src/lib/customerId.ts: SHA-256 hex, first 16
# chars, prefixed with "c_". Must match exactly so the dashboard filters
# pick up real spans / logs.
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
export CUSTOMER_ID CUSTOMER_LABEL CUSTOMER_ID_HASH VERCEL_URL HEALTH_CHECK_ID

DD_API_BASE="https://api.${DD_SITE}/api/v1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Applying Datadog templates for ${CUSTOMER_LABEL} (hash ${CUSTOMER_ID_HASH})"
echo "    site:    ${DD_SITE}"
echo "    api:     ${DD_API_BASE}"
echo

# --- helpers --------------------------------------------------------------

dd_curl() {
  curl -sS -H "DD-API-KEY: $DD_API_KEY" \
          -H "DD-APPLICATION-KEY: $DD_APP_KEY" \
          -H "Content-Type: application/json" \
          "$@"
}

# Render one of our JSON files with envsubst, validating that the output is
# still valid JSON (catches missing required env, malformed templates, etc.)
render_template() {
  local path="$1"
  local out
  out="$(envsubst < "$path")"
  if ! printf '%s' "$out" | jq empty >/dev/null 2>&1; then
    echo "error: rendered $path is not valid JSON" >&2
    printf '%s\n' "$out" | head -c 800 >&2
    echo >&2
    exit 1
  fi
  printf '%s' "$out"
}

# --- dashboards -----------------------------------------------------------

upsert_dashboard() {
  local file="$1"
  local body
  body="$(render_template "$file")"
  local title
  title="$(jq -r '.title' <<<"$body")"

  echo "-- dashboard: $title"
  # Datadog has no "find by title" endpoint, so we list and grep.
  local existing_id
  existing_id="$(dd_curl "$DD_API_BASE/dashboard" \
    | jq -r --arg t "$title" '.dashboards[]? | select(.title == $t) | .id' \
    | head -n1)"

  local resp http
  if [[ -n "$existing_id" && "$existing_id" != "null" ]]; then
    resp="$(dd_curl -X PUT "$DD_API_BASE/dashboard/${existing_id}" -d "$body" -w '\n%{http_code}')"
    http="$(printf '%s' "$resp" | tail -n1)"
    echo "   PUT  ${existing_id} -> HTTP ${http}"
  else
    resp="$(dd_curl -X POST "$DD_API_BASE/dashboard" -d "$body" -w '\n%{http_code}')"
    http="$(printf '%s' "$resp" | tail -n1)"
    local new_id
    new_id="$(printf '%s' "$resp" | sed '$d' | jq -r '.id // empty')"
    echo "   POST new -> HTTP ${http} (id=${new_id})"
  fi
  if [[ "$http" != "200" ]]; then
    printf '%s' "$resp" | sed '$d' | head -c 600 >&2
    echo >&2
    exit 1
  fi
}

# --- monitors -------------------------------------------------------------

upsert_monitor() {
  local file="$1"
  local body
  body="$(render_template "$file")"
  local name
  name="$(jq -r '.name' <<<"$body")"

  echo "-- monitor: $name"
  local existing_id
  existing_id="$(dd_curl --get --data-urlencode "name=$name" "$DD_API_BASE/monitor/search" \
    | jq -r --arg n "$name" '.monitors[]? | select(.name == $n) | .id' \
    | head -n1)"

  local resp http
  if [[ -n "$existing_id" && "$existing_id" != "null" ]]; then
    resp="$(dd_curl -X PUT "$DD_API_BASE/monitor/${existing_id}" -d "$body" -w '\n%{http_code}')"
    http="$(printf '%s' "$resp" | tail -n1)"
    echo "   PUT  ${existing_id} -> HTTP ${http}"
  else
    resp="$(dd_curl -X POST "$DD_API_BASE/monitor" -d "$body" -w '\n%{http_code}')"
    http="$(printf '%s' "$resp" | tail -n1)"
    local new_id
    new_id="$(printf '%s' "$resp" | sed '$d' | jq -r '.id // empty')"
    echo "   POST new -> HTTP ${http} (id=${new_id})"
  fi
  if [[ "$http" != "200" ]]; then
    printf '%s' "$resp" | sed '$d' | head -c 600 >&2
    echo >&2
    exit 1
  fi
}

# --- run ------------------------------------------------------------------

upsert_dashboard "$SCRIPT_DIR/dashboards/copilot-overview.json"

upsert_monitor "$SCRIPT_DIR/monitors/p99-latency-webapp.json"
upsert_monitor "$SCRIPT_DIR/monitors/cost-cap-burn.json"
upsert_monitor "$SCRIPT_DIR/monitors/error-rate-copilot.json"
upsert_monitor "$SCRIPT_DIR/monitors/cross-tenant-rejection.json"

if [[ -n "$HEALTH_CHECK_ID" ]]; then
  upsert_monitor "$SCRIPT_DIR/monitors/health-check-synthetic.json"
else
  echo "-- health-check-synthetic.json: SKIPPED (HEALTH_CHECK_ID env not set)"
  echo "   create the synthetic in Datadog UI first; see the message body of"
  echo "   monitors/health-check-synthetic.json for instructions."
fi

echo
echo "==> Done. Dashboard URL filter:"
echo "    https://app.${DD_SITE}/dashboard/lists?q=Ohanafy+Plan+${CUSTOMER_LABEL}"
echo "    Monitors:"
echo "    https://app.${DD_SITE}/monitors/manage?q=tag%3A%22customer_id_hash%3A${CUSTOMER_ID_HASH}%22"
