/**
 * Redaction patterns applied to any string that will be written to a log
 * stream (Datadog, Salesforce audit row, console). The goal is belt-and-
 * suspenders — application code should not pass raw customer data into
 * these sinks, but when it does, nothing identifiable leaks.
 *
 * Patterns are intentionally conservative: they match common shapes and
 * redact with a short tag so the redacted artefact is still readable.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
/** Salesforce 15- and 18-character IDs. Matches case-sensitive alphanumeric sequences of exactly those lengths when bounded by non-word chars. */
const SF_ID_RE = /\b[a-zA-Z0-9]{18}\b|\b[a-zA-Z0-9]{15}\b/g;
const ANTHROPIC_KEY_RE = /sk-ant-[A-Za-z0-9_-]{8,}/g;
/** Rough US phone: 10 digits with common separators, optional country code + paren. */
const PHONE_RE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g;
/** 13–19 digit numeric sequence suggestive of a credit card. Trailing separator is not consumed. */
const CC_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
/** NNN-NN-NNNN SSN shape. */
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

export function scrubPII(input: string): string {
  if (!input) return input;
  return input
    .replace(ANTHROPIC_KEY_RE, "[REDACTED_API_KEY]")
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(SSN_RE, "[REDACTED_SSN]")
    .replace(CC_RE, "[REDACTED_CC]")
    .replace(PHONE_RE, "[REDACTED_PHONE]")
    .replace(SF_ID_RE, "[REDACTED_SFID]");
}

/**
 * Deep-scrub any value heading to a log sink. Strings pass through
 * scrubPII; objects/arrays are walked recursively; other primitives pass
 * through unchanged. Circular references are not expected in log payloads
 * and are not defended against.
 */
export function scrubPIIDeep<T>(value: T): T {
  if (typeof value === "string") return scrubPII(value) as unknown as T;
  if (Array.isArray(value)) return value.map(scrubPIIDeep) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubPIIDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}
