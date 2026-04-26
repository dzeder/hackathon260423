/**
 * Live smoke test — connects to the real sandbox via SF_AUTH_URL and runs the rollup.
 * Run with:  cd packages/sf-client && SF_AUTH_URL="$(grep ^SF_AUTH_URL ../../.env.local | cut -d= -f2-)" npx tsx scripts/smoke.ts
 */
import { createConnection, getMonthlyInvoiceRollup, getMonthlyDepletionRollup } from "../src/index.js";

async function main() {
  const conn = await createConnection();
  console.log("connected to:", (conn as unknown as { instanceUrl: string }).instanceUrl);

  const inv = await getMonthlyInvoiceRollup(conn, "2026-05-01", "2026-10-31");
  console.table(inv);

  const dep = await getMonthlyDepletionRollup(conn, "2026-05-01", "2026-10-31");
  console.table(dep);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
