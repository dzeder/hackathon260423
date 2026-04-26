import type { ForecastMonth } from "./baseline";

export type DataSource = {
  getBaseline(): Promise<ForecastMonth[]>;
};

export type ForecastAssumptions = {
  gmPct: number;
  opexRatioPct: number;
};
