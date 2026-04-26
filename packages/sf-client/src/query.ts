import type { Connection } from "@jsforce/jsforce-node";
import tracer from "dd-trace";
import pino from "pino";
import { z, type ZodTypeAny } from "zod";

const log = pino({ name: "sf-client" });

/**
 * Run a SOQL query, validate every row against `schema`, and emit a dd-trace span.
 * Retries once on session-expiry by refreshing the OAuth token.
 *
 * Uses `ZodTypeAny` + `z.infer` so transformed output types (e.g. nullable→default) flow through.
 */
export async function query<S extends ZodTypeAny>(
  conn: Connection,
  soql: string,
  schema: S,
  spanName = "sf.query",
): Promise<z.infer<S>[]> {
  return tracer.trace(spanName, { tags: { soql_preview: soql.slice(0, 120) } }, async (span) => {
    try {
      const result = await runOnce(conn, soql);
      span?.setTag("rows", result.records.length);
      return z.array(schema).parse(result.records);
    } catch (err) {
      if (isSessionExpired(err)) {
        log.info({ msg: "session expired, refreshing once" });
        const refresh = (conn as unknown as { refreshToken?: string }).refreshToken;
        if (refresh) await conn.oauth2.refreshToken(refresh);
        const result = await runOnce(conn, soql);
        return z.array(schema).parse(result.records);
      }
      throw err;
    }
  });
}

function runOnce(conn: Connection, soql: string) {
  return conn.query(soql);
}

function isSessionExpired(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "errorCode" in err &&
    (err as { errorCode: string }).errorCode === "INVALID_SESSION_ID"
  );
}
