import { describe, it, expect } from "vitest";
import { parseSfdxAuthUrl, MissingSfAuthError, createConnection } from "./auth";

describe("parseSfdxAuthUrl", () => {
  it("parses a normal SFDX auth URL", () => {
    const r = parseSfdxAuthUrl(
      "force://3MVG9.client:secret123:reftok456@my.salesforce.com",
    );
    expect(r).toEqual({
      clientId: "3MVG9.client",
      clientSecret: "secret123",
      refreshToken: "reftok456",
      instanceUrl: "https://my.salesforce.com",
    });
  });

  it("handles PlatformCLI form with empty client secret", () => {
    const r = parseSfdxAuthUrl("force://PlatformCLI::reftok@scratch.my.salesforce.com");
    expect(r.clientSecret).toBe("");
    expect(r.clientId).toBe("PlatformCLI");
    expect(r.refreshToken).toBe("reftok");
    expect(r.instanceUrl).toBe("https://scratch.my.salesforce.com");
  });

  it("preserves https:// when already present in host", () => {
    const r = parseSfdxAuthUrl(
      "force://id:sec:tok@https://example.salesforce.com",
    );
    expect(r.instanceUrl).toBe("https://example.salesforce.com");
  });

  it("rejects malformed URLs", () => {
    expect(() => parseSfdxAuthUrl("not-an-auth-url")).toThrow(/Invalid SFDX auth URL/);
  });
});

describe("createConnection", () => {
  it("throws MissingSfAuthError when SF_AUTH_URL is unset", async () => {
    await expect(createConnection({})).rejects.toBeInstanceOf(MissingSfAuthError);
  });
});
