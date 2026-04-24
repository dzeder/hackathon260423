import { createClient, type Client } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/*
 * libSQL client for the copilot. One instance per server process.
 *
 * Supports two URL modes:
 *   - local  — `file:./data/copilot.db` for `npm run dev`
 *   - remote — `libsql://<db>.turso.io` for Vercel / production
 *
 * Migrations live in /migrations/*.sql and are applied in filename order on
 * first use. A tiny `_migrations(filename, applied_at)` ledger prevents
 * re-running. Keep migrations additive and idempotent — never rewrite a
 * shipped migration.
 */

let _client: Client | null = null;
let _migrationsAppliedPromise: Promise<void> | null = null;

function resolveUrl(): string {
  const url = process.env.TURSO_DATABASE_URL;
  if (url && url.length > 0) return url;
  // Dev fallback: local file beside the web-app so nothing configures poorly
  // when someone just runs `npm run dev` for the first time.
  return "file:./data/copilot.db";
}

export function getDb(): Client {
  if (_client) return _client;
  _client = createClient({
    url: resolveUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

export async function ensureMigrations(): Promise<void> {
  if (_migrationsAppliedPromise) return _migrationsAppliedPromise;
  _migrationsAppliedPromise = applyPendingMigrations().catch((err) => {
    // Clear the cached promise on failure so a subsequent request retries.
    _migrationsAppliedPromise = null;
    throw err;
  });
  return _migrationsAppliedPromise;
}

async function applyPendingMigrations(): Promise<void> {
  const db = getDb();
  await db.execute(
    "CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );

  const dir = resolve(process.cwd(), "migrations");
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  } catch {
    // No migrations dir — fine for greenfield test envs.
    return;
  }

  const applied = new Set<string>();
  const appliedRows = await db.execute("SELECT filename FROM _migrations");
  for (const row of appliedRows.rows) {
    const name = row.filename;
    if (typeof name === "string") applied.add(name);
  }

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(dir, file), "utf8");
    // libSQL rejects multi-statement SQL through `execute`; split on `;` at
    // the start of a line to keep each statement separate while allowing
    // statements themselves to contain inline semicolons inside string
    // literals. For our migrations this simple split is sufficient.
    const statements = splitSqlStatements(sql);
    for (const stmt of statements) {
      if (!stmt.trim()) continue;
      await db.execute(stmt);
    }
    await db.execute({
      sql: "INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)",
      args: [file, Date.now()],
    });
  }
}

function splitSqlStatements(sql: string): string[] {
  // Strip `-- ...` line comments to avoid edge cases where a `;` appears in
  // a comment. Keep everything else intact, including string literals.
  const withoutLineComments = sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
  return withoutLineComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
