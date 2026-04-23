import { describe, expect, it } from "vitest";
import {
  getCategoryTrend,
  queryPeerSignals,
  type PeerSignalsPayload,
} from "../src/logic.js";

const fixture: PeerSignalsPayload = {
  anonymization: { minPeersPerBucket: 3, method: "k-anon" },
  segments: [
    {
      segmentId: "on_premise",
      label: "On-premise",
      peerCount: 18,
      trends: {
        "4w": { volumeDeltaPct: 1.8, revenueDeltaPct: 2.4 },
        "13w": { volumeDeltaPct: 2.2, revenueDeltaPct: 3.1 },
        ytd: { volumeDeltaPct: 3.0, revenueDeltaPct: 4.0 },
      },
    },
    {
      segmentId: "tiny_segment",
      label: "Tiny (below min)",
      peerCount: 2,
      trends: {
        "4w": { volumeDeltaPct: 99 },
        "13w": { volumeDeltaPct: 99 },
        ytd: { volumeDeltaPct: 99 },
      },
    },
  ],
  categories: [
    {
      skuFamily: "energy-drink",
      label: "Energy drinks",
      peerCount: 19,
      trends: {
        "4w": { volumeDeltaPct: 4.8 },
        "13w": { volumeDeltaPct: 5.5 },
        ytd: { volumeDeltaPct: 6.2 },
      },
    },
    {
      skuFamily: "rare-category",
      label: "Rare (below min)",
      peerCount: 1,
      trends: {
        "4w": { volumeDeltaPct: 77 },
        "13w": { volumeDeltaPct: 77 },
        ytd: { volumeDeltaPct: 77 },
      },
    },
  ],
};

describe("queryPeerSignals", () => {
  it("returns the selected window for a specific segment", () => {
    const out = queryPeerSignals(fixture, { segmentId: "on_premise", window: "13w" });
    expect(out).toHaveLength(1);
    expect(out[0].trend.volumeDeltaPct).toBe(2.2);
    expect(out[0].redacted).toBe(false);
  });

  it("redacts segments below the min peer count", () => {
    const out = queryPeerSignals(fixture, { segmentId: "tiny_segment", window: "13w" });
    expect(out[0].redacted).toBe(true);
    expect(out[0].trend.volumeDeltaPct).toBe(0);
    expect(out[0].reason).toMatch(/below minimum/);
  });

  it("returns all segments when no segmentId filter is given", () => {
    const out = queryPeerSignals(fixture, { window: "4w" });
    expect(out).toHaveLength(2);
  });
});

describe("getCategoryTrend", () => {
  it("returns the requested window's volume delta", () => {
    const out = getCategoryTrend(fixture, { skuFamily: "energy-drink", window: "ytd" });
    expect(out.volumeDeltaPct).toBe(6.2);
    expect(out.redacted).toBe(false);
  });

  it("redacts sku families below the peer min", () => {
    const out = getCategoryTrend(fixture, { skuFamily: "rare-category", window: "ytd" });
    expect(out.redacted).toBe(true);
    expect(out.volumeDeltaPct).toBe(0);
  });

  it("throws on an unknown sku family", () => {
    expect(() => getCategoryTrend(fixture, { skuFamily: "nope", window: "13w" })).toThrow(
      /Unknown sku_family/,
    );
  });
});
