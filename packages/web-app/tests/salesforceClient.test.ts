import { describe, it, expect } from "vitest";
import { validateSoqlOrThrow } from "@/lib/salesforceClient";

describe("validateSoqlOrThrow", () => {
  it("accepts SELECT on allowlisted objects", () => {
    expect(() => validateSoqlOrThrow("SELECT Id, Name FROM Account")).not.toThrow();
    expect(() => validateSoqlOrThrow("SELECT Id FROM Opportunity LIMIT 5")).not.toThrow();
  });

  it("accepts ohfy__ namespace objects via wildcard", () => {
    expect(() => validateSoqlOrThrow("SELECT Id FROM ohfy__Forecast__c")).not.toThrow();
  });

  it("rejects non-SELECT queries", () => {
    expect(() => validateSoqlOrThrow("DELETE FROM Account")).toThrow(/SELECT/);
    expect(() => validateSoqlOrThrow("UPDATE Account SET Name='x'")).toThrow(/SELECT/);
  });

  it("rejects DML keywords inside SELECT body", () => {
    expect(() =>
      validateSoqlOrThrow("SELECT Id FROM Account WHERE Name = 'insert me'"),
    ).toThrow(/DML/);
  });

  it("rejects banned objects regardless of allowlist", () => {
    expect(() => validateSoqlOrThrow("SELECT Id FROM PermissionSet")).toThrow(
      /not queryable/,
    );
    expect(() => validateSoqlOrThrow("SELECT Id FROM LoginHistory")).toThrow(
      /not queryable/,
    );
  });

  it("rejects objects not in the allowlist", () => {
    expect(() => validateSoqlOrThrow("SELECT Id FROM Lead")).toThrow(/allowlist/);
  });

  it("custom allowlist can add + exclude objects", () => {
    expect(() =>
      validateSoqlOrThrow("SELECT Id FROM Lead", { allowedObjects: ["lead"] }),
    ).not.toThrow();
    expect(() =>
      validateSoqlOrThrow("SELECT Id FROM Account", { allowedObjects: ["lead"] }),
    ).toThrow();
  });
});
