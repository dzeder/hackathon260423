import { NextResponse } from "next/server";
import { ensureMigrations, getDb } from "@/lib/copilotDb";

export const runtime = "nodejs";

/*
 * Liveness + readiness probe for Datadog synthetic checks and Vercel.
 *
 * Checks:
 *   - Turso ping (is the DB reachable)
 *   - ANTHROPIC_API_KEY presence (is Claude configured)
 *   - COPILOT_CLIENT_SECRET presence (is gateway auth configured)
 *
 * Returns 200 if all critical checks pass, 503 otherwise. The JSON body
 * lists each check's status so the check can alert on "degraded" state
 * (e.g. DB up but Anthropic key missing) without flapping.
 */

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await ensureMigrations();
    await getDb().execute("SELECT 1");
    checks.database = { ok: true };
  } catch (err) {
    checks.database = {
      ok: false,
      detail: err instanceof Error ? err.message : "db unreachable",
    };
  }

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

  const dbOk = checks.database?.ok === true;
  const anthropicOk = checks.anthropic.ok;
  const status = dbOk && anthropicOk ? 200 : 503;

  return NextResponse.json(
    {
      status: status === 200 ? "ok" : "degraded",
      checks,
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
