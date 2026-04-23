import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CategorySignal,
  PeerSignalsPayload,
  SegmentSignal,
  TrendWindow,
} from "./logic.js";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, "../../../../seed/peer-signals.json");

type RawSegment = {
  segment_id: string;
  label: string;
  peer_count: number;
  trends: Record<
    TrendWindow,
    { revenue_delta_pct?: number; volume_delta_pct: number; gm_delta_pct?: number }
  >;
};

type RawCategory = {
  sku_family: string;
  label: string;
  peer_count: number;
  trends: Record<TrendWindow, { volume_delta_pct: number }>;
};

type RawSeed = {
  anonymization: { min_peers_per_bucket: number; method: string };
  segments: RawSegment[];
  categories: RawCategory[];
};

export function loadPeerSignals(): PeerSignalsPayload {
  const raw = JSON.parse(readFileSync(seedPath, "utf-8")) as RawSeed;
  const segments: SegmentSignal[] = raw.segments.map((s) => ({
    segmentId: s.segment_id,
    label: s.label,
    peerCount: s.peer_count,
    trends: {
      "4w": {
        revenueDeltaPct: s.trends["4w"].revenue_delta_pct,
        volumeDeltaPct: s.trends["4w"].volume_delta_pct,
        gmDeltaPct: s.trends["4w"].gm_delta_pct,
      },
      "13w": {
        revenueDeltaPct: s.trends["13w"].revenue_delta_pct,
        volumeDeltaPct: s.trends["13w"].volume_delta_pct,
        gmDeltaPct: s.trends["13w"].gm_delta_pct,
      },
      ytd: {
        revenueDeltaPct: s.trends.ytd.revenue_delta_pct,
        volumeDeltaPct: s.trends.ytd.volume_delta_pct,
        gmDeltaPct: s.trends.ytd.gm_delta_pct,
      },
    },
  }));
  const categories: CategorySignal[] = raw.categories.map((c) => ({
    skuFamily: c.sku_family,
    label: c.label,
    peerCount: c.peer_count,
    trends: {
      "4w": { volumeDeltaPct: c.trends["4w"].volume_delta_pct },
      "13w": { volumeDeltaPct: c.trends["13w"].volume_delta_pct },
      ytd: { volumeDeltaPct: c.trends.ytd.volume_delta_pct },
    },
  }));
  return {
    segments,
    categories,
    anonymization: {
      minPeersPerBucket: raw.anonymization.min_peers_per_bucket,
      method: raw.anonymization.method,
    },
  };
}
