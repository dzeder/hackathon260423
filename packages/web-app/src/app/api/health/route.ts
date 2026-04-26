import { NextResponse } from "next/server";
import { isSalesforceConfigured } from "@/lib/salesforceClient";

export const runtime = "nodejs";

/*
 * Liveness + readiness probe for Datadog synthetics and Vercel.
 *
 * Checks:
 *   - anthropic     ANTHROPIC_API_KEY present (live Claude responses)
 *   - gatewayAuth   COPILOT_CLIENT_SECRET present (rejects anonymous traffic)
 *   - salesforce    SF_LOGIN_URL/SF_CONSUMER_KEY/SF_CONSUMER_SECRET present
 *                   (live SOQL + conversation memory in the customer org)
 *
 * Status 200 when ALL checks pass — including Salesforce, since memory now
 * lives there. Status 503 if any critical config is missing. Without
 * Salesforce, the copilot still serves stateless Claude responses, but the
 * "feels continuous" promise is broken; we want this surfaced loudly.
 */

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  checks.anthropic = {
    ok: Boolean(process.env.ANTHROPIC_API_KEY),
    detail: process.env.ANTHROPIC_API_KEY ? undefined : "ANTHROPIC_API_KEY not set",
  };

  const hasSecret =
    Boolean(process.env.COPILOT_CLIENT_SECRET) ||
    Boolean(process.env.COPILOT_CLIENT_SECRETS);
  checks.gatewayAuth = {
    ok: hasSecret,
    detail: hasSecret ? undefined : "COPILOT_CLIENT_SECRET not set (dev mode only)",
  };

  checks.salesforce = {
    ok: isSalesforceConfigured(),
    detail: isSalesforceConfigured()
      ? undefined
      : "SF_LOGIN_URL/SF_CONSUMER_KEY/SF_CONSUMER_SECRET not set — copilot will run stateless (no memory, canned SOQL)",
  };

  const allOk = checks.anthropic.ok && checks.gatewayAuth.ok && checks.salesforce.ok;
  const status = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? "ok" : "degraded",
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
