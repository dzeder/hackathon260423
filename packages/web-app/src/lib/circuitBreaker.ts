/**
 * Minimal circuit breaker for wrapping flaky external calls.
 *
 * States:
 *   CLOSED     — normal operation; failures counted.
 *   OPEN       — short-circuit fast with CircuitOpenError; stays open for
 *                cooldownMs before attempting one half-open probe.
 *   HALF_OPEN  — a single in-flight probe call; success → CLOSED and reset,
 *                failure → OPEN again (cooldown restarts).
 *
 * Failure window is "recent rolling" — we count failures in the last
 * windowMs. That gives a natural decay without a background timer.
 *
 * Intentionally not using `opossum` or similar — a 70-line handroll
 * avoids a runtime dep for a pattern this small, and the API we need is
 * narrow (wrap one async function, read state into a log row).
 */

export type BreakerState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface BreakerOptions {
  /** Distinct name used in errors and log rows. */
  name: string;
  /** Failures in the rolling window before tripping. */
  failureThreshold: number;
  /** How long the breaker stays OPEN before a probe is allowed. */
  cooldownMs: number;
  /** Rolling window for the failure count. */
  windowMs: number;
}

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`circuit breaker is open: ${name}`);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private readonly opts: BreakerOptions;
  private state: BreakerState = "CLOSED";
  private failures: number[] = [];
  private openedAt = 0;
  private halfOpenInFlight = false;

  constructor(opts: BreakerOptions) {
    this.opts = opts;
  }

  getState(nowMs: number = Date.now()): BreakerState {
    if (this.state === "OPEN" && nowMs - this.openedAt >= this.opts.cooldownMs) {
      this.state = "HALF_OPEN";
    }
    return this.state;
  }

  async exec<T>(fn: () => Promise<T>, nowMs: () => number = Date.now): Promise<T> {
    const s = this.getState(nowMs());
    if (s === "OPEN") throw new CircuitOpenError(this.opts.name);
    if (s === "HALF_OPEN") {
      if (this.halfOpenInFlight) throw new CircuitOpenError(this.opts.name);
      this.halfOpenInFlight = true;
    }
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(nowMs());
      throw err;
    } finally {
      this.halfOpenInFlight = false;
    }
  }

  private onSuccess(): void {
    this.failures = [];
    this.state = "CLOSED";
  }

  private onFailure(nowMs: number): void {
    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.openedAt = nowMs;
      return;
    }
    this.failures.push(nowMs);
    const cutoff = nowMs - this.opts.windowMs;
    this.failures = this.failures.filter((t) => t >= cutoff);
    if (this.failures.length >= this.opts.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = nowMs;
    }
  }
}
