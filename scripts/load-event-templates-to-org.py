#!/usr/bin/env python3
"""
Upsert Plan_Event_Template__c + Plan_Knowledge_Article__c rows into ohanafy-hack-sandbox
from /seed/events-catalog.json and /seed/knowledge.json.

Idempotent: matches on the Event_Id__c / Article_Id__c external-id fields and re-runs
upsert (PATCH /composite/sobjects/<sobject>/<externalIdField>) so re-running just
overwrites in place.

Auth via the sf CLI keychain (same pattern as load-fixtures-to-org.py).
"""
from __future__ import annotations
import json
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORG_ALIAS = "ohanafy-hack-sandbox"
API_VERSION = "v60.0"

# Detected once at runtime: empty in unmanaged orgs, "ohfy__" inside the
# packaging org where the metadata deploys under the ohfy namespace.
_NS_PREFIX = ""

_INSTANCE_URL = ""
_ACCESS_TOKEN = ""


def _org_auth() -> tuple[str, str]:
    res = subprocess.run(
        ["sf", "org", "display", "--target-org", ORG_ALIAS, "--json", "--verbose"],
        capture_output=True, text=True, check=True,
    )
    d = json.loads(res.stdout)["result"]
    return d["instanceUrl"], d["accessToken"]


def _detect_namespace_prefix() -> str:
    """Returns 'ohfy__' if the target org is the ohfy packaging org, else ''."""
    res = subprocess.run(
        ["sf", "data", "query",
         "--query", "SELECT NamespacePrefix FROM Organization LIMIT 1",
         "--target-org", ORG_ALIAS, "--json"],
        capture_output=True, text=True, check=True,
    )
    rec = json.loads(res.stdout)["result"]["records"][0]
    ns = rec.get("NamespacePrefix") or ""
    return f"{ns}__" if ns else ""


def ns(api_name: str) -> str:
    """Apply the org's namespace prefix to a custom (__c / __mdt) API name."""
    return f"{_NS_PREFIX}{api_name}" if api_name.endswith(("__c", "__mdt")) else api_name


def sf_api(method: str, path: str, body: dict | list | None = None) -> dict | list:
    url = f"{_INSTANCE_URL}{path}"
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, method=method, data=data)
    req.add_header("Authorization", f"Bearer {_ACCESS_TOKEN}")
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        sys.stderr.write(f"{method} {path} failed: {e.code}\n{body_text}\n")
        raise SystemExit(1)


def composite_upsert(sobject: str, external_id_field: str, records: list[dict]) -> None:
    """PATCH /composite/sobjects/<sobject>/<externalIdField> in chunks of 200."""
    for chunk_start in range(0, len(records), 200):
        chunk = records[chunk_start:chunk_start + 200]
        payload = {
            "allOrNone": False,
            "records": [{"attributes": {"type": sobject}, **r} for r in chunk],
        }
        path = f"/services/data/{API_VERSION}/composite/sobjects/{sobject}/{external_id_field}"
        results = sf_api("PATCH", path, payload)
        any_failure = False
        if isinstance(results, list):
            for rec, res in zip(chunk, results):
                if not res.get("success"):
                    real_errors = [
                        e for e in res.get("errors", [])
                        if e.get("statusCode") != "ALL_OR_NONE_OPERATION_ROLLED_BACK"
                    ]
                    if real_errors:
                        any_failure = True
                        sys.stderr.write(
                            f"upsert failed for {sobject} {rec.get(external_id_field)}: {real_errors}\n"
                        )
        if any_failure:
            raise SystemExit(1)


_VALID_SEASONS = {"spring", "summer", "fall", "winter"}


def build_event_records() -> list[dict]:
    catalog = json.loads((ROOT / "seed" / "events-catalog.json").read_text())
    out = []
    for e in catalog.get("events", []):
        season = e.get("season")
        if season not in _VALID_SEASONS:
            season = None  # restricted picklist; "any"/missing -> null
        out.append({
            ns("Event_Id__c"): e["id"],
            ns("Label__c"): e.get("label"),
            ns("Category__c"): e.get("category"),
            ns("Region__c"): e.get("region"),
            ns("Season__c"): season,
            ns("Month__c"): e.get("month"),
            ns("Revenue_Delta_Pct__c"): e.get("revenue_delta_pct"),
            ns("COGS_Delta_Pct__c"): e.get("cogs_delta_pct"),
            ns("OpEx_Delta_Abs__c"): e.get("opex_delta_abs"),
            ns("Source__c"): e.get("source"),
            ns("Notes__c"): e.get("notes"),
        })
    return out


def build_article_records() -> list[dict]:
    kb = json.loads((ROOT / "seed" / "knowledge.json").read_text())
    out = []
    for a in kb.get("entries", []):
        tags = a.get("tags") or []
        out.append({
            ns("Article_Id__c"): a["id"],
            ns("Title__c"): a.get("title"),
            ns("Body__c"): a.get("body"),
            ns("Source__c"): a.get("source"),
            ns("Tags__c"): ",".join(tags) if isinstance(tags, list) else str(tags),
        })
    return out


def main() -> None:
    global _INSTANCE_URL, _ACCESS_TOKEN, _NS_PREFIX
    _INSTANCE_URL, _ACCESS_TOKEN = _org_auth()
    _NS_PREFIX = _detect_namespace_prefix()
    print(f"→ authed against {_INSTANCE_URL}")
    print(f"→ namespace prefix: {_NS_PREFIX!r}")

    events = build_event_records()
    et_obj = ns("Plan_Event_Template__c")
    print(f"→ upserting {len(events)} {et_obj} rows by {ns('Event_Id__c')}")
    composite_upsert(et_obj, ns("Event_Id__c"), events)

    articles = build_article_records()
    ka_obj = ns("Plan_Knowledge_Article__c")
    print(f"→ upserting {len(articles)} {ka_obj} rows by {ns('Article_Id__c')}")
    composite_upsert(ka_obj, ns("Article_Id__c"), articles)

    print("\n✓ load complete")
    print(f'verify events:  sf data query --query "SELECT COUNT() FROM {et_obj}" '
          '--target-org ohanafy-hack-sandbox')
    print(f'verify kb:      sf data query --query "SELECT COUNT() FROM {ka_obj}" '
          '--target-org ohanafy-hack-sandbox')


if __name__ == "__main__":
    main()
