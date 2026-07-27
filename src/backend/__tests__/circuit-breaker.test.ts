/**
 * @fileoverview Unit tests for the billing circuit breaker DO
 * (`../circuit-breaker.ts`): auto-trip on threshold overflow, manual
 * trip/reset, and the KV flag it keeps in sync for the hot-path guard.
 *
 * `cloudflare:workers` only resolves inside the workerd runtime, so it's
 * mocked here with a minimal `DurableObject` base (just stores `ctx`/`env`,
 * same as the real one) — plain node/vitest, no Miniflare pool needed.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => {
  class DurableObject<E = unknown> {
    ctx: any;
    env: E;
    constructor(ctx: any, env: E) {
      this.ctx = ctx;
      this.env = env;
    }
  }
  return { DurableObject };
});

const { CircuitBreaker } = await import("../circuit-breaker");

/** In-memory stand-in for `DurableObjectState.storage`. */
function makeStorage() {
  const map = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => map.get(key)),
    put: vi.fn(async (key: string, value: unknown) => {
      map.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      map.delete(key);
    }),
    setAlarm: vi.fn(async () => {}),
  };
}

function makeBreaker(envOverrides: Record<string, string> = {}) {
  const storage = makeStorage();
  const sessionsPut = vi.fn(async () => {});
  const env: any = { SESSIONS: { put: sessionsPut }, ...envOverrides };
  const breaker = new CircuitBreaker({ storage } as any, env);
  return { breaker, storage, sessionsPut, env };
}

describe("CircuitBreaker", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("starts closed", async () => {
    const { breaker } = makeBreaker();
    const status = await breaker.status();
    expect(status).toEqual({ open: false, reason: undefined, trippedAt: undefined, counts: {} });
  });

  it("auto-trips once a kind's per-minute count exceeds its threshold", async () => {
    const { breaker, sessionsPut } = makeBreaker({ CIRCUIT_MAX_TOOL_PER_MIN: "3" });

    // 1..3 stay under/at the threshold — still closed.
    await breaker.record("tool");
    await breaker.record("tool");
    await breaker.record("tool");
    expect((await breaker.status()).open).toBe(false);

    // 4th record pushes the count to 4 > 3 — trips.
    await breaker.record("tool");
    const status = await breaker.status();
    expect(status.open).toBe(true);
    expect(status.reason).toBe("auto: tool exceeded 3/min");
    expect(status.counts.tool).toBe(4);

    // KV flag written on the open transition.
    expect(sessionsPut).toHaveBeenCalledWith(
      "circuit:open",
      expect.stringContaining('"open":true'),
    );
  });

  it("falls back to the built-in threshold when the env var is unset/NaN", async () => {
    const { breaker } = makeBreaker({ CIRCUIT_MAX_AGENT_PER_MIN: "not-a-number" });
    for (let i = 0; i < 300; i++) await breaker.record("agent");
    expect((await breaker.status()).open).toBe(false);
    await breaker.record("agent");
    expect((await breaker.status()).open).toBe(true);
  });

  it("manual trip() opens with the given reason", async () => {
    const { breaker } = makeBreaker();
    const result = await breaker.trip("manual: incident #123");
    expect(result).toEqual({ open: true });
    const status = await breaker.status();
    expect(status.open).toBe(true);
    expect(status.reason).toBe("manual: incident #123");
    expect(status.trippedAt).toBeTypeOf("number");
  });

  it("reset() clears open, reason, trippedAt, and counters, and writes the KV flag closed", async () => {
    const { breaker, sessionsPut } = makeBreaker({ CIRCUIT_MAX_TOOL_PER_MIN: "1" });
    await breaker.record("tool");
    await breaker.record("tool");
    expect((await breaker.status()).open).toBe(true);

    const result = await breaker.reset();
    expect(result).toEqual({ open: false });

    const status = await breaker.status();
    expect(status).toEqual({ open: false, reason: undefined, trippedAt: undefined, counts: {} });
    expect(sessionsPut).toHaveBeenLastCalledWith(
      "circuit:open",
      JSON.stringify({ open: false, reason: undefined, trippedAt: undefined }),
    );
  });
});
