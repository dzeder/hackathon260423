import { scrubPIIDeep } from "./pii";

type Level = "info" | "warn" | "error";

/**
 * Single logging entry-point for server-side web-app code. All messages
 * and extras pass through scrubPIIDeep before reaching the console (or,
 * eventually, Datadog). Prefer this over direct console.* so new call
 * sites can't regress the redaction story.
 */
function emit(level: Level, message: string, extras?: unknown): void {
  const safeMessage = scrubPIIDeep(message);
  const safeExtras = extras === undefined ? undefined : scrubPIIDeep(extras);
  if (level === "info") console.info(safeMessage, safeExtras ?? "");
  else if (level === "warn") console.warn(safeMessage, safeExtras ?? "");
  else console.error(safeMessage, safeExtras ?? "");
}

export const log = {
  info: (message: string, extras?: unknown) => emit("info", message, extras),
  warn: (message: string, extras?: unknown) => emit("warn", message, extras),
  error: (message: string, extras?: unknown) => emit("error", message, extras),
};
