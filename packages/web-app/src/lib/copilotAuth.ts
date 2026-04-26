/*
 * Shared-secret auth for /api/copilot.
 *
 * The Apex gateway passes `X-Ohanafy-Client-Secret` (populated from a Custom
 * Metadata record) on every callout. The Next.js route verifies the secret
 * matches the `COPILOT_CLIENT_SECRET` env var before doing any work.
 *
 * Rotation: add the new secret to both places, redeploy one side, verify, then
 * remove the old from the other. COPILOT_CLIENT_SECRETS supports a
 * comma-separated list to hold both during rotation.
 *
 * In local dev, requests from `localhost` are allowed without a secret so
 * `npm run dev` + browser testing just works. Set
 * COPILOT_REQUIRE_AUTH_IN_DEV=1 to force auth in local testing.
 */

const HEADER_NAME = "x-ohanafy-client-secret";

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "wrong_secret" | "not_configured"; status: 401 | 503 };

export function checkAuth(req: Request): AuthResult {
  const configured = (process.env.COPILOT_CLIENT_SECRETS ?? process.env.COPILOT_CLIENT_SECRET ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const supplied = req.headers.get(HEADER_NAME);

  if (configured.length === 0) {
    // No secret configured — allow only from localhost in dev (convenience
    // for browser testing), otherwise refuse to run.
    if (isLocalhost(req) && process.env.COPILOT_REQUIRE_AUTH_IN_DEV !== "1") {
      return { ok: true };
    }
    return { ok: false, reason: "not_configured", status: 503 };
  }

  if (!supplied) {
    // Also allow localhost without a secret in dev even if secrets are configured,
    // so developers don't have to set the header in DevTools.
    if (isLocalhost(req) && process.env.COPILOT_REQUIRE_AUTH_IN_DEV !== "1") {
      return { ok: true };
    }
    return { ok: false, reason: "missing_secret", status: 401 };
  }

  // Constant-time comparison — avoid timing side-channel.
  for (const secret of configured) {
    if (secret.length === supplied.length && timingSafeEqual(supplied, secret)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "wrong_secret", status: 401 };
}

function isLocalhost(req: Request): boolean {
  try {
    const host = new URL(req.url).hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
