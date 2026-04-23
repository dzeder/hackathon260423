export type TrendWindow = "4w" | "13w" | "ytd";

export type SegmentTrend = {
  revenueDeltaPct?: number;
  volumeDeltaPct: number;
  gmDeltaPct?: number;
};

export type SegmentSignal = {
  segmentId: string;
  label: string;
  peerCount: number;
  trends: Record<TrendWindow, SegmentTrend>;
};

export type CategorySignal = {
  skuFamily: string;
  label: string;
  peerCount: number;
  trends: Record<TrendWindow, { volumeDeltaPct: number }>;
};

export type PeerSignalsPayload = {
  segments: SegmentSignal[];
  categories: CategorySignal[];
  anonymization: { minPeersPerBucket: number; method: string };
};

export type PeerSignalView = {
  segmentId: string;
  label: string;
  peerCount: number;
  window: TrendWindow;
  trend: SegmentTrend;
  redacted: boolean;
  reason?: string;
};

export type CategorySignalView = {
  skuFamily: string;
  label: string;
  peerCount: number;
  window: TrendWindow;
  volumeDeltaPct: number;
  redacted: boolean;
  reason?: string;
};

export function queryPeerSignals(
  payload: PeerSignalsPayload,
  filter: { segmentId?: string; window: TrendWindow },
): PeerSignalView[] {
  const minPeers = payload.anonymization.minPeersPerBucket;
  const segments = filter.segmentId
    ? payload.segments.filter((s) => s.segmentId === filter.segmentId)
    : payload.segments;

  return segments.map<PeerSignalView>((s) => {
    if (s.peerCount < minPeers) {
      return {
        segmentId: s.segmentId,
        label: s.label,
        peerCount: s.peerCount,
        window: filter.window,
        trend: { volumeDeltaPct: 0 },
        redacted: true,
        reason: `peer count ${s.peerCount} below minimum of ${minPeers}`,
      };
    }
    return {
      segmentId: s.segmentId,
      label: s.label,
      peerCount: s.peerCount,
      window: filter.window,
      trend: s.trends[filter.window],
      redacted: false,
    };
  });
}

export function getCategoryTrend(
  payload: PeerSignalsPayload,
  filter: { skuFamily: string; window: TrendWindow },
): CategorySignalView {
  const match = payload.categories.find((c) => c.skuFamily === filter.skuFamily);
  if (!match) {
    throw new Error(`Unknown sku_family: ${filter.skuFamily}`);
  }
  const minPeers = payload.anonymization.minPeersPerBucket;
  if (match.peerCount < minPeers) {
    return {
      skuFamily: match.skuFamily,
      label: match.label,
      peerCount: match.peerCount,
      window: filter.window,
      volumeDeltaPct: 0,
      redacted: true,
      reason: `peer count ${match.peerCount} below minimum of ${minPeers}`,
    };
  }
  return {
    skuFamily: match.skuFamily,
    label: match.label,
    peerCount: match.peerCount,
    window: filter.window,
    volumeDeltaPct: match.trends[filter.window].volumeDeltaPct,
    redacted: false,
  };
}
