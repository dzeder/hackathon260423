/**
 * Yellowhammer Beverage baseline — demo kernel.
 * Real numbers come from seed/baseline-forecast.json; this is the in-memory stub.
 * Dollar amounts in thousands unless otherwise noted.
 */

export type ForecastMonth = {
  month: string;
  revenue: number;
  cogs: number;
  opex: number;
  gm: number;
  ebitda: number;
};

export const baselineForecast: ForecastMonth[] = [
  { month: "2026-05", revenue: 4_820, cogs: 3_180, opex: 920, gm: 1_640, ebitda: 720 },
  { month: "2026-06", revenue: 5_210, cogs: 3_420, opex: 940, gm: 1_790, ebitda: 850 },
  { month: "2026-07", revenue: 5_480, cogs: 3_590, opex: 960, gm: 1_890, ebitda: 930 },
  { month: "2026-08", revenue: 5_310, cogs: 3_480, opex: 945, gm: 1_830, ebitda: 885 },
  { month: "2026-09", revenue: 5_050, cogs: 3_310, opex: 935, gm: 1_740, ebitda: 805 },
  { month: "2026-10", revenue: 4_780, cogs: 3_130, opex: 920, gm: 1_650, ebitda: 730 },
];

export const yellowhammerProfile = {
  name: "Yellowhammer Beverage",
  hq: "Birmingham, AL",
  channels: ["on-premise", "off-premise-chain", "off-premise-indep"],
  suppliers: ["Anheuser-Busch", "Constellation", "Boston Beer", "Red Bull", "Yuengling"],
} as const;
