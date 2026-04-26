#!/usr/bin/env python3
"""
Load Yellowhammer Beverage demo fixtures into ohanafy-hack-sandbox.

Generates retailer Accounts + ohfy__Invoice__c + ohfy__Depletion__c records whose
SUM(ohfy__Total_Invoice_Value__c) per month matches /seed/baseline-forecast.json.
Uses `sf api request` (composite REST) so we don't need jsforce installed yet.

One-time bootstrap. Idempotent via External_ID match (deletes existing 'YH-' records first).
"""
from __future__ import annotations
import json
import subprocess
import sys
import urllib.request
import urllib.error
from pathlib import Path
from datetime import date
from calendar import monthrange

ROOT = Path(__file__).resolve().parent.parent
ORG_ALIAS = "ohanafy-hack-sandbox"
API_VERSION = "v60.0"


def _org_auth() -> tuple[str, str]:
    """Returns (instanceUrl, accessToken) from sf CLI keychain."""
    res = subprocess.run(
        ["sf", "org", "display", "--target-org", ORG_ALIAS, "--json", "--verbose"],
        capture_output=True, text=True, check=True,
    )
    d = json.loads(res.stdout)["result"]
    return d["instanceUrl"], d["accessToken"]


_INSTANCE_URL, _ACCESS_TOKEN = "", ""

# Channel split from seed/baseline-forecast.json assumptions.channel_mix_pct
CHANNEL_MIX = {"on_premise": 0.28, "off_chain": 0.46, "off_indep": 0.26}

# Two retailer accounts per channel so rollup queries can split.
# Names are prefixed YH-FIXTURE so we can filter via SOQL LIKE (Description is long-text, unfilterable).
RETAILERS = {
    "on_premise": ["YH-FIXTURE Birmingham Pub Co", "YH-FIXTURE Tuscaloosa Tap House"],
    "off_chain": ["YH-FIXTURE Publix #4123 Birmingham", "YH-FIXTURE Walmart Vestavia"],
    "off_indep": ["YH-FIXTURE Vestavia Wine & Spirits", "YH-FIXTURE Hoover Bottle Shop"],
}


def sf_api(method: str, path: str, body: dict | list | None = None) -> dict | list:
    """Direct REST call using sf CLI keychain auth. Returns parsed JSON or {}."""
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


def composite_delete(ids: list[str]) -> None:
    """Batch delete up to 200 records via DELETE /composite/sobjects?ids=…&allOrNone=false."""
    for chunk_start in range(0, len(ids), 200):
        chunk = ids[chunk_start:chunk_start + 200]
        path = f"/services/data/{API_VERSION}/composite/sobjects?ids={','.join(chunk)}&allOrNone=false"
        sf_api("DELETE", path)


def soql(query: str) -> list[dict]:
    res = subprocess.run(
        ["sf", "data", "query", "--query", query, "--target-org", ORG_ALIAS, "--json"],
        capture_output=True, text=True,
    )
    if res.returncode != 0:
        sys.stderr.write(res.stderr)
        raise SystemExit(1)
    return json.loads(res.stdout)["result"]["records"]


def composite_insert(sobject: str, records: list[dict]) -> list[dict]:
    """Insert up to 200 records in one call via /composite/sobjects."""
    payload = {
        "allOrNone": True,
        "records": [{"attributes": {"type": sobject}, **r} for r in records],
    }
    return sf_api("POST", f"/services/data/{API_VERSION}/composite/sobjects", payload)


def cleanup_existing() -> None:
    """Delete prior fixture records: invoices/depletions by Customer__c IN fixture-accounts; then accounts."""
    accs = soql("SELECT Id FROM Account WHERE Name LIKE 'YH-FIXTURE %'")
    if not accs:
        return
    acc_ids = "(" + ",".join(f"'{a['Id']}'" for a in accs) + ")"
    for sobj in ("ohfy__Depletion__c", "ohfy__Invoice__c"):
        rows = soql(f"SELECT Id FROM {sobj} WHERE ohfy__Customer__c IN {acc_ids}")
        if rows:
            print(f"  deleting {len(rows)} {sobj}")
            composite_delete([r["Id"] for r in rows])
    print(f"  deleting {len(accs)} Account")
    composite_delete([a["Id"] for a in accs])


def ensure_accounts() -> dict[str, str]:
    """Returns {retailer_name: account_id}."""
    existing = {a["Name"]: a["Id"]
                for a in soql("SELECT Id, Name FROM Account WHERE Name LIKE 'YH-FIXTURE %'")}
    missing = []
    for channel, names in RETAILERS.items():
        for name in names:
            if name not in existing:
                missing.append({"Name": name, "Description": f"channel={channel}",
                                "Type": "Customer", "Industry": channel})
    if missing:
        results = composite_insert("Account", missing)
        for rec, res in zip(missing, results):
            if not res.get("success"):
                sys.stderr.write(f"Account insert failed: {rec['Name']} -> {res}\n")
                raise SystemExit(1)
            existing[rec["Name"]] = res["id"]
    return existing


def build_invoices(account_ids: dict[str, str]) -> list[dict]:
    baseline = json.loads((ROOT / "seed" / "baseline-forecast.json").read_text())["baseline"]
    rows = []
    for month_idx, month in enumerate(baseline):
        ym = month["month"]  # e.g. 2026-05
        y, m = int(ym[:4]), int(ym[5:7])
        invoice_date = date(y, m, monthrange(y, m)[1]).isoformat()
        # Convert from $thousands to USD
        revenue_usd = month["revenue"] * 1000
        for channel, pct in CHANNEL_MIX.items():
            channel_rev = revenue_usd * pct
            retailers = RETAILERS[channel]
            per_retailer = channel_rev / len(retailers)
            for r_idx, name in enumerate(retailers):
                # Synthetic per-account, per-channel cases (rough proxy: $/72 = cases at $72/case avg)
                cases = round(per_retailer / 72.0, 2)
                rows.append({
                    "Name": f"YH-FIXTURE-{ym}-{channel}-{r_idx}",
                    "ohfy__Customer__c": account_ids[name],
                    "ohfy__Invoice_Date__c": invoice_date,
                    "ohfy__Total_Invoice_Value__c": round(per_retailer, 2),
                    "ohfy__Total_Case_Equivalents__c": cases,
                    "ohfy__Status__c": "Complete",
                })
    return rows


def build_depletions(account_ids: dict[str, str]) -> list[dict]:
    """Sellout shadow of invoices: ~95% of cases delivered shows up as depletions next month."""
    invoices = build_invoices(account_ids)
    rows = []
    for inv in invoices:
        if inv["ohfy__Total_Case_Equivalents__c"] <= 0:
            continue
        cases = round(inv["ohfy__Total_Case_Equivalents__c"] * 0.95, 2)
        # Note: ohfy__Depletion__c.Name is auto-numbered (read-only on insert).
        rows.append({
            "ohfy__Customer__c": inv["ohfy__Customer__c"],
            "ohfy__Date__c": inv["ohfy__Invoice_Date__c"],
            "ohfy__Case_Quantity__c": cases,
            "ohfy__Type__c": "Shelf",
        })
    return rows


def main() -> None:
    global _INSTANCE_URL, _ACCESS_TOKEN
    _INSTANCE_URL, _ACCESS_TOKEN = _org_auth()
    print(f"→ authed against {_INSTANCE_URL}")
    print("→ cleaning existing fixture rows…")
    cleanup_existing()

    print("→ ensuring retailer accounts…")
    account_ids = ensure_accounts()
    print(f"  {len(account_ids)} retailer accounts ready")

    print("→ generating invoices…")
    invoices = build_invoices(account_ids)
    print(f"  inserting {len(invoices)} invoice rows in chunks of 200")
    for chunk_start in range(0, len(invoices), 200):
        chunk = invoices[chunk_start:chunk_start + 200]
        results = composite_insert("ohfy__Invoice__c", chunk)
        for rec, res in zip(chunk, results):
            if not res.get("success"):
                sys.stderr.write(f"Invoice insert failed: {rec['Name']} -> {res}\n")
                raise SystemExit(1)

    print("→ generating depletions…")
    depletions = build_depletions(account_ids)
    print(f"  inserting {len(depletions)} depletion rows in chunks of 200")
    for chunk_start in range(0, len(depletions), 200):
        chunk = depletions[chunk_start:chunk_start + 200]
        results = composite_insert("ohfy__Depletion__c", chunk)
        for rec, res in zip(chunk, results):
            if not res.get("success"):
                sys.stderr.write(f"Depletion insert failed: {rec['Name']} -> {res}\n")
                raise SystemExit(1)

    print("\n✓ load complete")
    print("verify:  sf data query --query \\\n  \"SELECT CALENDAR_MONTH(ohfy__Invoice_Date__c) m, "
          "SUM(ohfy__Total_Invoice_Value__c) rev FROM ohfy__Invoice__c "
          "WHERE Name LIKE 'YH-FIXTURE-%' GROUP BY CALENDAR_MONTH(ohfy__Invoice_Date__c)\" "
          "--target-org ohanafy-hack-sandbox")


if __name__ == "__main__":
    main()
