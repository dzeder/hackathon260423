import { describe, it, expect, beforeEach } from "vitest";
import { checkAuth } from "@/lib/copilotAuth";

function req(init: { url?: string; headers?: Record<string, string> } = {}): Request {
  return new Request(init.url ?? "https://prod.example.com/api/copilot", {
    headers: init.headers ?? {},
  });
}

describe("copilotAuth.checkAuth", () => {
  beforeEach(() => {
    delete process.env.COPILOT_CLIENT_SECRET;
    delete process.env.COPILOT_CLIENT_SECRETS;
    delete process.env.COPILOT_REQUIRE_AUTH_IN_DEV;
  });

  it("localhost bypass when no secret configured and dev-auth-flag unset", () => {
    const r = req({ url: "http://localhost:3000/api/copilot" });
    const res = checkAuth(r);
    expect(res.ok).toBe(true);
  });

  it("refuses to run on production host when no secret is configured", () => {
    const res = checkAuth(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("not_configured");
      expect(res.status).toBe(503);
    }
  });

  it("missing secret from non-localhost returns 401", () => {
    process.env.COPILOT_CLIENT_SECRET = "sek-prod";
    const res = checkAuth(req());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("missing_secret");
      expect(res.status).toBe(401);
    }
  });

  it("correct secret succeeds", () => {
    process.env.COPILOT_CLIENT_SECRET = "sek-prod";
    const res = checkAuth(
      req({ headers: { "x-ohanafy-client-secret": "sek-prod" } }),
    );
    expect(res.ok).toBe(true);
  });

  it("wrong secret fails with wrong_secret", () => {
    process.env.COPILOT_CLIENT_SECRET = "sek-prod";
    const res = checkAuth(req({ headers: { "x-ohanafy-client-secret": "nope" } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("wrong_secret");
  });

  it("comma-separated list lets rotation overlap succeed on either value", () => {
    process.env.COPILOT_CLIENT_SECRETS = "old-sek, new-sek";
    const oldOk = checkAuth(req({ headers: { "x-ohanafy-client-secret": "old-sek" } }));
    const newOk = checkAuth(req({ headers: { "x-ohanafy-client-secret": "new-sek" } }));
    expect(oldOk.ok).toBe(true);
    expect(newOk.ok).toBe(true);
  });

  it("localhost bypass disabled when COPILOT_REQUIRE_AUTH_IN_DEV=1", () => {
    process.env.COPILOT_REQUIRE_AUTH_IN_DEV = "1";
    process.env.COPILOT_CLIENT_SECRET = "sek";
    const res = checkAuth(req({ url: "http://localhost:3000/api/copilot" }));
    expect(res.ok).toBe(false);
  });
});
