import { createHash } from "node:crypto";

/**
 * Pseudonymize a raw customer identifier before it enters any log stream,
 * Datadog tag, or Salesforce audit row. Returns a stable 16-char hex prefix
 * of SHA-256 — enough entropy to differentiate tenants at our scale without
 * exposing customer-provided strings (account names, SF org IDs, etc.).
 *
 * Deterministic: same input always yields the same output, so joins across
 * logs work without a shared key lookup.
 */
export function hashCustomerId(raw: string): string {
  if (!raw) throw new Error("hashCustomerId: empty input");
  return "c_" + createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

/**
 * Extract the customer id from an inbound request. Throws if missing or
 * blank — every production code path that touches tenant-scoped data must
 * have one. Header name matches the Ohanafy_Plan_Gateway Named Credential
 * customHeader config.
 */
export function extractCustomerId(req: Request): string {
  const raw = req.headers.get("x-customer-id")?.trim();
  if (!raw) {
    throw new CustomerIdError("x-customer-id header is required");
  }
  return raw;
}

export class CustomerIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerIdError";
  }
}
