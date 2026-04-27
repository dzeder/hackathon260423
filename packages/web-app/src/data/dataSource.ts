import type { ForecastMonth } from "./baseline";
import type { EventTemplate } from "@/lib/eventsCatalog";

export type DataSource = {
  getBaseline(): Promise<ForecastMonth[]>;
  /**
   * Active event-template catalog. Reads from `Plan_Event_Template__c` when
   * SF is configured, otherwise returns the seed catalog. Mirrors the MCP
   * `ohanafy-events` server's `loadCatalog` pattern.
   */
  getEventTemplates(): Promise<EventTemplate[]>;
};

export type ForecastAssumptions = {
  gmPct: number;
  opexRatioPct: number;
};
