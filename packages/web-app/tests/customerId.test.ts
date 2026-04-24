import { describe, expect, it } from "vitest";
import {
  CustomerIdError,
  extractCustomerId,
  hashCustomerId,
} from "@/lib/customerId";

describe("hashCustomerId", () => {
  it("returns a c_-prefixed 18-char string", () => {
    const h = hashCustomerId("00DO500000kXn17MAC");
    expect(h).toMatch(/^c_[0-9a-f]{16}$/);
  });

  it("is deterministic", () => {
    expect(hashCustomerId("org-abc")).toBe(hashCustomerId("org-abc"));
  });

  it("differs across inputs", () => {
    expect(hashCustomerId("org-a")).not.toBe(hashCustomerId("org-b"));
  });

  it("throws on empty input", () => {
    expect(() => hashCustomerId("")).toThrow();
  });
});

describe("extractCustomerId", () => {
  it("returns the trimmed x-customer-id header", () => {
    const req = new Request("https://example.com", {
      headers: { "x-customer-id": "  00DO500000kXn17MAC  " },
    });
    expect(extractCustomerId(req)).toBe("00DO500000kXn17MAC");
  });

  it("throws CustomerIdError when header is missing", () => {
    const req = new Request("https://example.com");
    expect(() => extractCustomerId(req)).toThrow(CustomerIdError);
  });

  it("throws CustomerIdError when header is blank", () => {
    const req = new Request("https://example.com", {
      headers: { "x-customer-id": "   " },
    });
    expect(() => extractCustomerId(req)).toThrow(CustomerIdError);
  });
});
