import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitOpenError } from "@/lib/circuitBreaker";

function newBreaker() {
  return new CircuitBreaker({
    name: "test",
    failureThreshold: 3,
    windowMs: 10_000,
    cooldownMs: 5_000,
  });
}

describe("CircuitBreaker", () => {
  it("stays CLOSED and passes through on success", async () => {
    const b = newBreaker();
    const out = await b.exec(async () => "ok");
    expect(out).toBe("ok");
    expect(b.getState()).toBe("CLOSED");
  });

  it("OPENs after failureThreshold failures in the window", async () => {
    const b = newBreaker();
    const boom = async () => {
      throw new Error("upstream");
    };
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(boom)).rejects.toThrow("upstream");
    }
    expect(b.getState()).toBe("OPEN");
  });

  it("short-circuits with CircuitOpenError while OPEN", async () => {
    const b = newBreaker();
    const boom = async () => {
      throw new Error("upstream");
    };
    for (let i = 0; i < 3; i++) {
      await expect(b.exec(boom)).rejects.toThrow();
    }
    await expect(b.exec(async () => "never runs")).rejects.toBeInstanceOf(
      CircuitOpenError,
    );
  });

  it("transitions OPEN → HALF_OPEN after cooldown", async () => {
    let t = 0;
    const now = () => t;
    const b = new CircuitBreaker({
      name: "test",
      failureThreshold: 2,
      windowMs: 10_000,
      cooldownMs: 1000,
    });
    const boom = async () => {
      throw new Error("x");
    };
    t = 0;
    await expect(b.exec(boom, now)).rejects.toThrow();
    t = 100;
    await expect(b.exec(boom, now)).rejects.toThrow();
    expect(b.getState(t)).toBe("OPEN");
    // advance past cooldown
    t = 2000;
    expect(b.getState(t)).toBe("HALF_OPEN");
  });

  it("HALF_OPEN success closes the breaker", async () => {
    let t = 0;
    const now = () => t;
    const b = new CircuitBreaker({
      name: "test",
      failureThreshold: 2,
      windowMs: 10_000,
      cooldownMs: 500,
    });
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    t = 100;
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    t = 1000; // past cooldown
    const out = await b.exec(async () => "recovered", now);
    expect(out).toBe("recovered");
    expect(b.getState(t)).toBe("CLOSED");
  });

  it("HALF_OPEN failure re-opens and restarts cooldown", async () => {
    let t = 0;
    const now = () => t;
    const b = new CircuitBreaker({
      name: "test",
      failureThreshold: 2,
      windowMs: 10_000,
      cooldownMs: 500,
    });
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    t = 100;
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    t = 1000; // past cooldown → HALF_OPEN
    await expect(b.exec(async () => { throw new Error("still broken"); }, now)).rejects.toThrow(
      "still broken",
    );
    expect(b.getState(t + 1)).toBe("OPEN");
    // Must wait for another full cooldown
    expect(b.getState(t + 200)).toBe("OPEN");
  });

  it("failures outside the rolling window do not count", async () => {
    let t = 0;
    const now = () => t;
    const b = new CircuitBreaker({
      name: "test",
      failureThreshold: 3,
      windowMs: 1000,
      cooldownMs: 5_000,
    });
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    t = 500;
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    t = 2000; // > windowMs after the first two failures
    // This is the first failure in the current window — should NOT open.
    await expect(b.exec(async () => { throw new Error("x"); }, now)).rejects.toThrow();
    expect(b.getState(t)).toBe("CLOSED");
  });
});
