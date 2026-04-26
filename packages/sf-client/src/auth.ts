import jsforce from "@jsforce/jsforce-node";

export class MissingSfAuthError extends Error {
  constructor() {
    super(
      "SF_AUTH_URL is not set. Run `sf org login web -a ohanafy-hack-sandbox`, " +
        "then `sf org display --target-org ohanafy-hack-sandbox --json --verbose` " +
        "to extract the sfdxAuthUrl into .env.local.",
    );
    this.name = "MissingSfAuthError";
  }
}

export type SfAuthBundle = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  instanceUrl: string;
};

/**
 * Parse an SFDX auth URL of the form `force://<clientId>:<clientSecret>:<refreshToken>@<instance>`.
 * `clientSecret` may be empty for the platform CLI client (`force://PlatformCLI::<refreshToken>@…`).
 */
export function parseSfdxAuthUrl(url: string): SfAuthBundle {
  const match = url.match(/^force:\/\/([^:]+):([^:]*):([^@]+)@(.+)$/);
  if (!match) {
    throw new Error(
      "Invalid SFDX auth URL — expected `force://<clientId>:<clientSecret>:<refreshToken>@<instanceUrl>`",
    );
  }
  const [, clientId, clientSecret, refreshToken, host] = match;
  const instanceUrl = host.startsWith("http") ? host : `https://${host}`;
  return { clientId, clientSecret, refreshToken, instanceUrl };
}

/** Build a jsforce Connection from the SF_AUTH_URL env var. */
export async function createConnection(env: NodeJS.ProcessEnv = process.env) {
  const url = env.SF_AUTH_URL;
  if (!url) throw new MissingSfAuthError();
  const auth = parseSfdxAuthUrl(url);
  const conn = new jsforce.Connection({
    instanceUrl: auth.instanceUrl,
    oauth2: {
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      loginUrl: auth.instanceUrl,
      redirectUri: "http://localhost:1717/OauthRedirect",
    },
    refreshToken: auth.refreshToken,
  });
  await conn.oauth2.refreshToken(auth.refreshToken);
  return conn;
}
