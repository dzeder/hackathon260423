import type { DataSource } from "./dataSource";
import { SalesforceDataSource } from "./salesforceDataSource";
import { FixtureDataSource } from "./fixtureDataSource";

let cached: DataSource | null = null;

/**
 * Returns the runtime data source. Always SalesforceDataSource when SF_AUTH_URL is set
 * (production, preview, dev). FixtureDataSource only when explicitly absent — vitest
 * tests use FixtureDataSource directly via import to avoid global state.
 */
export function getDataSource(): DataSource {
  if (cached) return cached;
  cached = process.env.SF_AUTH_URL ? new SalesforceDataSource() : new FixtureDataSource();
  return cached;
}

/** Test helper — drops the cached data source so subsequent calls re-instantiate. */
export function resetDataSourceForTesting(): void {
  cached = null;
}

export type { DataSource } from "./dataSource";
