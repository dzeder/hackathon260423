import { describe, expect, it } from "vitest";
import { eventsCatalog, findEvent } from "@/lib/eventsCatalog";

describe("eventsCatalog", () => {
  it("contains at least the six demo-path events", () => {
    expect(eventsCatalog.length).toBeGreaterThanOrEqual(6);
  });

  it("every event has a month in 2026 YYYY-MM format", () => {
    for (const event of eventsCatalog) {
      expect(event.month).toMatch(/^2026-(0[1-9]|1[0-2])$/);
    }
  });

  it("findEvent returns a template for a known id", () => {
    expect(findEvent("iron-bowl-2026")?.label).toMatch(/Iron Bowl/);
  });

  it("findEvent returns undefined for unknown ids", () => {
    expect(findEvent("does-not-exist")).toBeUndefined();
  });

  it("every event has at least one material delta", () => {
    for (const event of eventsCatalog) {
      const hasDelta =
        (event.revenueDeltaPct ?? 0) !== 0 ||
        (event.cogsDeltaPct ?? 0) !== 0 ||
        (event.opexDeltaAbs ?? 0) !== 0;
      expect(hasDelta).toBe(true);
    }
  });
});
