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

_INSTANCE_URL = ""
_ACCESS_TOKEN = ""


def _org_auth() -> tuple[str, str]:
    res = subprocess.run(
        ["sf", "org", "display", "--target-org", ORG_ALIAS, "--json", "--verbose"],
        capture_output=True, text=True, check=True,
    )
    d = json.loads(res.stdout)["result"]
    return d["instanceUrl"], d["accessToken"]


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
            "allOrNone": True,
            "records": [{"attributes": {"type": sobject}, **r} for r in chunk],
        }
        path = f"/services/data/{API_VERSION}/composite/sobjects/{sobject}/{external_id_field}"
        results = sf_api("PATCH", path, payload)
        if isinstance(results, list):
            for rec, res in zip(chunk, results):
                if not res.get("success"):
                    sys.stderr.write(
                        f"upsert failed for {sobject} {rec.get(external_id_field)}: {res}\n"
                    )
                    raise SystemExit(1)


def build_event_records() -> list[dict]:
    catalog = json.loads((ROOT / "seed" / "events-catalog.json").read_text())
    out = []
    for e in catalog.get("events", []):
        out.append({
            "Event_Id__c": e["id"],
            "Label__c": e.get("label"),
            "Category__c": e.get("category"),
            "Region__c": e.get("region"),
            "Season__c": e.get("season"),
            "Month__c": e.get("month"),
            "Revenue_Delta_Pct__c": e.get("revenue_delta_pct"),
            "COGS_Delta_Pct__c": e.get("cogs_delta_pct"),
            "OpEx_Delta_Abs__c": e.get("opex_delta_abs"),
            "Source__c": e.get("source"),
            "Notes__c": e.get("notes"),
        })
    return out


def build_article_records() -> list[dict]:
    kb = json.loads((ROOT / "seed" / "knowledge.json").read_text())
    out = []
    for a in kb.get("entries", []):
        tags = a.get("tags") or []
        out.append({
            "Article_Id__c": a["id"],
            "Title__c": a.get("title"),
            "Body__c": a.get("body"),
            "Source__c": a.get("source"),
            "Tags__c": ",".join(tags) if isinstance(tags, list) else str(tags),
        })
    return out


def main() -> None:
    global _INSTANCE_URL, _ACCESS_TOKEN
    _INSTANCE_URL, _ACCESS_TOKEN = _org_auth()
    print(f"→ authed against {_INSTANCE_URL}")

    events = build_event_records()
    print(f"→ upserting {len(events)} Plan_Event_Template__c rows by Event_Id__c")
    composite_upsert("Plan_Event_Template__c", "Event_Id__c", events)

    articles = build_article_records()
    print(f"→ upserting {len(articles)} Plan_Knowledge_Article__c rows by Article_Id__c")
    composite_upsert("Plan_Knowledge_Article__c", "Article_Id__c", articles)

    print("\n✓ load complete")
    print('verify events:  sf data query --query "SELECT COUNT() FROM Plan_Event_Template__c" '
          '--target-org ohanafy-hack-sandbox')
    print('verify kb:      sf data query --query "SELECT COUNT() FROM Plan_Knowledge_Article__c" '
          '--target-org ohanafy-hack-sandbox')


if __name__ == "__main__":
    main()
