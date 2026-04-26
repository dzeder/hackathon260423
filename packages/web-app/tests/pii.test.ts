import { describe, expect, it } from "vitest";
import { scrubPII, scrubPIIDeep } from "@/lib/pii";

describe("scrubPII", () => {
  it("redacts email addresses", () => {
    expect(scrubPII("ping dan@ohanafy.com please")).toBe(
      "ping [REDACTED_EMAIL] please",
    );
  });

  it("redacts Anthropic API keys", () => {
    const key = "sk-ant-api03-aBcDeFgHiJkLmNoPqRsT_uVwXyZ1234567890";
    expect(scrubPII(`key=${key} ok`)).toBe("key=[REDACTED_API_KEY] ok");
  });

  it("redacts 18-char and 15-char Salesforce IDs", () => {
    expect(scrubPII("acct 00DO500000kXn17MAC rec 0018b00000ABCDE")).toBe(
      "acct [REDACTED_SFID] rec [REDACTED_SFID]",
    );
  });

  it("redacts US phone numbers in several common shapes", () => {
    expect(scrubPII("call (205) 555-1234 now")).toBe("call [REDACTED_PHONE] now");
    expect(scrubPII("call 205-555-1234 now")).toBe("call [REDACTED_PHONE] now");
    expect(scrubPII("call +1 205.555.1234 now")).toBe("call [REDACTED_PHONE] now");
  });

  it("redacts SSN-shaped sequences", () => {
    expect(scrubPII("ssn 123-45-6789 leaked")).toBe("ssn [REDACTED_SSN] leaked");
  });

  it("redacts credit-card-shaped digit runs", () => {
    expect(scrubPII("cc 4111 1111 1111 1111 used")).toBe(
      "cc [REDACTED_CC] used",
    );
  });

  it("leaves unrelated text untouched", () => {
    const safe = "Revenue grew 9.5% in October 2026 for the Iron Bowl weekend.";
    expect(scrubPII(safe)).toBe(safe);
  });

  it("handles empty input", () => {
    expect(scrubPII("")).toBe("");
  });
});

describe("scrubPIIDeep", () => {
  it("walks objects, arrays, and primitives", () => {
    const input = {
      prompt: "contact cfo@yellowhammer.com re hurricane",
      events: [{ id: "storm-1", source: "sk-ant-api03-xxxxxxxxxxxxxxxx" }],
      count: 3,
      active: true,
      note: null,
    };
    const out = scrubPIIDeep(input);
    expect(out.prompt).toBe("contact [REDACTED_EMAIL] re hurricane");
    expect(out.events[0].source).toBe("[REDACTED_API_KEY]");
    expect(out.count).toBe(3);
    expect(out.active).toBe(true);
    expect(out.note).toBeNull();
  });
});
