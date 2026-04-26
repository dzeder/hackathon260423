import { log, logError } from "@/lib/copilotLog";

/*
 * Salesforce client — Client Credentials OAuth 2.0 flow.
 *
 * Used by the copilot's `query_salesforce` tool to run the read-only SOQL
 * path on the customer's org. The Client Credentials flow is server-to-server
 * (no user login) which suits our architecture: the web app is acting as
 * itself, not as a named Salesforce user.
 *
 * Activation env vars (all required to enable real SOQL):
 *   SF_LOGIN_URL            https://<my-domain>.my.salesforce.com
 *   SF_CONSUMER_KEY         Consumer Key from the Connected App
 *   SF_CONSUMER_SECRET      Consumer Secret from the Connected App
 *
 * Connected App requirements (documented in runbook):
 *   - Callback URL set (any — unused for client_credentials)
 *   - "Enable Client Credentials Flow" checked
 *   - "Run As" set to an integration user with Read-only profile scoped
 *     to the allowlisted objects on the Apex endpoint
 *   - OAuth Scopes: `api`, `refresh_token`
 *
 * Tokens are cached in-process for their lifetime. A cold Vercel function
 * pays one token-fetch round-trip (~200ms); warm stays cached until expiry.
 */

type TokenCache = { accessToken: string; instanceUrl: string; expiresAtMs: number };

let _tokenCache: TokenCache | null = null;

const TOKEN_TTL_BUFFER_MS = 60_000; // refresh 1 min before actual expiry

export function isSalesforceConfigured(): boolean {
  return Boolean(
    process.env.SF_LOGIN_URL &&
      process.env.SF_CONSUMER_KEY &&
      process.env.SF_CONSUMER_SECRET,
  );
}

async function getAccessToken(): Promise<TokenCache> {
  if (_tokenCache && _tokenCache.expiresAtMs > Date.now() + TOKEN_TTL_BUFFER_MS) {
    return _tokenCache;
  }

  const loginUrl = process.env.SF_LOGIN_URL;
  const consumerKey = process.env.SF_CONSUMER_KEY;
  const consumerSecret = process.env.SF_CONSUMER_SECRET;
  if (!loginUrl || !consumerKey || !consumerSecret) {
    throw new Error("Salesforce not configured — SF_LOGIN_URL/SF_CONSUMER_KEY/SF_CONSUMER_SECRET missing");
  }

  const tokenUrl = `${loginUrl.replace(/\/$/, "")}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: consumerKey,
    client_secret: consumerSecret,
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(
      `Salesforce token fetch failed: ${resp.status} ${errBody.slice(0, 200)}`,
    );
  }

  const payload = (await resp.json()) as {
    access_token: string;
    instance_url: string;
    // expires_in is omitted in client_credentials response; tokens default to 2h.
    // We set a conservative 90-minute ttl so we refresh well before the server
    // would have rotated it.
  };

  _tokenCache = {
    accessToken: payload.access_token,
    instanceUrl: payload.instance_url,
    expiresAtMs: Date.now() + 90 * 60_000,
  };
  return _tokenCache;
}

/**
 * Generic POST to a custom Apex REST endpoint at /services/apexrest/<path>.
 * Auto-attaches the Connected App access token, refreshes on 401, and
 * surfaces typed errors. Used by both the SOQL tool and the memory store
 * client so the OAuth token cache is shared.
 */
export async function callApexRest<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  if (!isSalesforceConfigured()) {
    throw new Error(
      "Salesforce not configured — SF_LOGIN_URL/SF_CONSUMER_KEY/SF_CONSUMER_SECRET missing",
    );
  }
  const token = await getAccessToken();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${token.instanceUrl}/services/apexrest${cleanPath}`;
  let resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (resp.status === 401) {
    // Token may have been server-rotated mid-flight. Drop cache, re-auth, retry once.
    _tokenCache = null;
    const fresh = await getAccessToken();
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${fresh.accessToken}`,
      },
      body: JSON.stringify(body),
    });
  }

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(
      `Apex REST ${cleanPath} ${resp.status}: ${errBody.slice(0, 300)}`,
    );
  }
  return (await resp.json()) as T;
}

export type SoqlResult = {
  records: Array<Record<string, unknown>>;
  totalSize: number;
  done: boolean;
  nextRecordsUrl?: string;
};

export type SalesforceSoqlGuardrail = {
  allowedObjects?: string[]; // case-insensitive object name allowlist
  maxRows?: number;
};

const DEFAULT_ALLOWED_OBJECTS = [
  "account",
  "contact",
  "opportunity",
  "user",
  "order",
];
const DEFAULT_MAX_ROWS = 200;
const BANNED_OBJECTS = new Set([
  // Always off-limits regardless of allowlist
  "userrecordaccess",
  "permissionset",
  "permissionsetassignment",
  "loginhistory",
  "apexclass",
  "apextestresult",
  "authsession",
]);

export function validateSoqlOrThrow(
  soql: string,
  guardrail: SalesforceSoqlGuardrail = {},
): void {
  const trimmed = soql.trim();
  if (!/^select\b/i.test(trimmed)) {
    throw new Error("Only SELECT queries are permitted from the copilot.");
  }
  if (/\b(update|insert|delete|upsert|merge|undelete)\b/i.test(trimmed)) {
    throw new Error("DML keywords are not permitted in SOQL from the copilot.");
  }
  // Very lightweight object extraction — `FROM <Object>` (first match).
  // This is not a full parser; it is defense-in-depth layered on top of the
  // Apex endpoint's own allowlist enforcement.
  const match = /\bfrom\s+([a-z0-9_]+)/i.exec(trimmed);
  if (!match) throw new Error("Could not identify target object in SOQL.");
  const object = match[1].toLowerCase();
  if (BANNED_OBJECTS.has(object)) {
    throw new Error(`Object '${match[1]}' is not queryable from the copilot.`);
  }
  const allowed = (guardrail.allowedObjects ?? DEFAULT_ALLOWED_OBJECTS).map((o) =>
    o.toLowerCase(),
  );
  // Allow ohfy__* objects wildcard-style (managed-package read-only namespace).
  const isAllowed = allowed.includes(object) || /^ohfy__/.test(object);
  if (!isAllowed) {
    throw new Error(
      `Object '${match[1]}' is not in the copilot's allowlist. Allowed: ${allowed.join(", ")} (or any ohfy__*).`,
    );
  }
}

export async function querySoql(
  soql: string,
  guardrail: SalesforceSoqlGuardrail = {},
): Promise<SoqlResult> {
  validateSoqlOrThrow(soql, guardrail);

  const maxRows = guardrail.maxRows ?? DEFAULT_MAX_ROWS;

  const token = await getAccessToken();
  // Call the custom Apex REST endpoint rather than /services/data/.../query
  // so the SF side enforces `with sharing` + the allowlist independently.
  const url = `${token.instanceUrl}/services/apexrest/plan/soql?maxRows=${maxRows}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.accessToken}`,
    },
    body: JSON.stringify({ soql }),
  });

  if (resp.status === 401) {
    // Token may be server-rotated mid-flight. Clear cache and bubble up.
    _tokenCache = null;
    const errBody = await resp.text();
    logError("salesforce_token_invalidated", { body: errBody.slice(0, 200) });
    throw new Error("Salesforce rejected the access token. Retry will re-auth.");
  }

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(
      `Salesforce query failed: ${resp.status} ${errBody.slice(0, 200)}`,
    );
  }

  const payload = (await resp.json()) as SoqlResult;
  log.debug({ rows: payload.records.length, object: firstObjectOf(soql) }, "soql ok");
  return payload;
}

function firstObjectOf(soql: string): string | null {
  const match = /\bfrom\s+([a-z0-9_]+)/i.exec(soql);
  return match ? match[1] : null;
}
