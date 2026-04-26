import type { DataSource } from "./dataSource";
import type { ForecastMonth } from "./baseline";

/**
 * Test-only data source. Used by Vitest and as a graceful fallback when SF_AUTH_URL
 * is unset (e.g. preview deployments without org credentials).
 *
 * Numbers mirror /seed/baseline-forecast.json (USD thousands).
 */
export class FixtureDataSource implements DataSource {
  async getBaseline(): Promise<ForecastMonth[]> {
    return [
      { month: "2026-05", revenue: 4_820, cogs: 3_180, opex: 920, gm: 1_640, ebitda: 720 },
      { month: "2026-06", revenue: 5_210, cogs: 3_420, opex: 940, gm: 1_790, ebitda: 850 },
      { month: "2026-07", revenue: 5_480, cogs: 3_590, opex: 960, gm: 1_890, ebitda: 930 },
      { month: "2026-08", revenue: 5_310, cogs: 3_480, opex: 945, gm: 1_830, ebitda: 885 },
      { month: "2026-09", revenue: 5_050, cogs: 3_310, opex: 935, gm: 1_740, ebitda: 805 },
      { month: "2026-10", revenue: 4_780, cogs: 3_130, opex: 920, gm: 1_650, ebitda: 730 },
    ];
  }
}
