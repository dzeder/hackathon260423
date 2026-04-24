import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, TOOL_SCHEMA_VERSION } from "@/lib/versions";

describe("version constants", () => {
  it("PROMPT_VERSION matches the expected semver shape", () => {
    expect(PROMPT_VERSION).toMatch(/^prompt@\d+\.\d+\.\d+$/);
  });

  it("TOOL_SCHEMA_VERSION matches the expected semver shape", () => {
    expect(TOOL_SCHEMA_VERSION).toMatch(/^tools@\d+\.\d+\.\d+$/);
  });

  it("both fit the 32-char Salesforce text field", () => {
    expect(PROMPT_VERSION.length).toBeLessThanOrEqual(32);
    expect(TOOL_SCHEMA_VERSION.length).toBeLessThanOrEqual(32);
  });
});
