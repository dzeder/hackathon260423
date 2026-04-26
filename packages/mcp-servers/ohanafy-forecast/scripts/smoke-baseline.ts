/**
 * Verifies that loadBaseline() returns the org's `ohfy__Invoice__c` rollup when SF_AUTH_URL is set.
 * Run with:
 *   SF_AUTH_URL="$(grep ^SF_AUTH_URL ../../../.env.local | cut -d= -f2-)" \
 *     npx tsx scripts/smoke-baseline.ts
 */
import { loadBaseline, _resetBaselineCacheForTesting } from "../src/baseline.js";

async function main() {
  console.log("SF_AUTH_URL set?", Boolean(process.env.SF_AUTH_URL));
  _resetBaselineCacheForTesting();
  const rows = await loadBaseline();
  console.table(rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
