/**
 * @fileoverview Billing circuit breaker — a global kill switch that shuts the
 * worker down (503s everything except a short diagnose/reset allowlist) when
 * usage spikes, so a runaway loop or attack bleeds money for seconds instead
 * of hours.
 *
 * `CircuitBreaker` is a single global Durable Object (always addressed by
 * `idFromName("global")` via `getBreaker()`) backed by DO SQLite storage. It
 * tracks a rolling per-minute request counter per `kind` and auto-trips when
 * any counter exceeds its configured threshold. The cheap hot-path guard in
 * `src/_worker.ts` does NOT call this DO on every request — it reads a KV
 * flag (`SESSIONS["circuit:open"]`) that this DO keeps in sync on every
 * open/close transition. The DO itself is only hit for the (fire-and-forget)
 * usage recording on expensive routes and for admin control
 * (`/api/admin/circuit`).
 */

import { DurableObject } from "cloudflare:workers";

/** Billable request categories tracked per rolling minute. */
export type CircuitKind = "request" | "agent" | "ai" | "tool";

/** KV key the hot-path guard reads. Value is `JSON.stringify(CircuitStatus)`. */
const KV_FLAG_KEY = "circuit:open";

/** `env` var name + built-in fallback threshold for each tracked kind. */
const THRESHOLDS: Record<CircuitKind, { envVar: keyof Env; fallback: number }> = {
  request: { envVar: "CIRCUIT_MAX_REQ_PER_MIN", fallback: 3000 },
  agent: { envVar: "CIRCUIT_MAX_AGENT_PER_MIN", fallback: 300 },
  ai: { envVar: "CIRCUIT_MAX_AI_PER_MIN", fallback: 500 },
  tool: { envVar: "CIRCUIT_MAX_TOOL_PER_MIN", fallback: 1000 },
};

export type CircuitStatus = {
  open: boolean;
  reason?: string;
  trippedAt?: number;
  counts: Record<string, number>;
};

export class CircuitBreaker extends DurableObject<Env> {
  /** Increment `kind`'s counter for the current minute; auto-trip on overflow. */
  async record(kind: CircuitKind): Promise<void> {
    const bucket = currentMinuteBucket();
    const windowStart = (await this.ctx.storage.get<number>("windowStart")) ?? 0;
    let counts = (await this.ctx.storage.get<Record<string, number>>("counts")) ?? {};

    if (windowStart !== bucket) {
      // Fresh minute — reset and (re)arm the alarm as a backstop in case no
      // further record() call lands exactly on the boundary.
      counts = {};
      await this.ctx.storage.put("windowStart", bucket);
      await this.ctx.storage.setAlarm(bucket + 60_000);
    }

    counts[kind] = (counts[kind] ?? 0) + 1;
    await this.ctx.storage.put("counts", counts);

    const threshold = this.threshold(kind);
    if (counts[kind] > threshold) {
      const alreadyOpen = (await this.ctx.storage.get<boolean>("open")) ?? false;
      if (!alreadyOpen) {
        await this.setOpen(true, `auto: ${kind} exceeded ${threshold}/min`);
      }
    }
  }

  /** Manual kill switch. */
  async trip(reason: string): Promise<{ open: boolean }> {
    return this.setOpen(true, reason);
  }

  /** Stand back up: clear open + counters. */
  async reset(): Promise<{ open: boolean }> {
    await this.ctx.storage.put("counts", {});
    return this.setOpen(false, undefined);
  }

  async status(): Promise<CircuitStatus> {
    const open = (await this.ctx.storage.get<boolean>("open")) ?? false;
    const reason = await this.ctx.storage.get<string>("reason");
    const trippedAt = await this.ctx.storage.get<number>("trippedAt");
    const counts = (await this.ctx.storage.get<Record<string, number>>("counts")) ?? {};
    return { open, reason, trippedAt, counts };
  }

  /** Rolling-window reset, fired once per minute (see `record()`). */
  async alarm(): Promise<void> {
    await this.ctx.storage.put("counts", {});
    await this.ctx.storage.put("windowStart", currentMinuteBucket());
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }

  private threshold(kind: CircuitKind): number {
    const { envVar, fallback } = THRESHOLDS[kind];
    const n = Number(this.env[envVar]);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private async setOpen(open: boolean, reason?: string): Promise<{ open: boolean }> {
    const trippedAt = open ? Date.now() : undefined;
    await this.ctx.storage.put("open", open);
    if (reason !== undefined) await this.ctx.storage.put("reason", reason);
    else await this.ctx.storage.delete("reason");
    if (trippedAt !== undefined) await this.ctx.storage.put("trippedAt", trippedAt);
    else await this.ctx.storage.delete("trippedAt");

    await this.env.SESSIONS.put(KV_FLAG_KEY, JSON.stringify({ open, reason, trippedAt }));
    return { open };
  }
}

function currentMinuteBucket(): number {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

/**
 * Stub for the single global `CircuitBreaker` instance.
 *
 * ponytail: `env.CIRCUIT_BREAKER`'s generic is only inferred from the built
 * `dist/_worker.js/index.js` (see the other DO bindings in
 * `worker-configuration.d.ts`), so until the next `pnpm build` + `wrangler
 * types` it's untyped. Cast here rather than hand-editing the generated file;
 * a real build makes this cast a no-op.
 */
export function getBreaker(env: Env): DurableObjectStub<CircuitBreaker> {
  const ns = env.CIRCUIT_BREAKER as unknown as DurableObjectNamespace<CircuitBreaker>;
  return ns.get(ns.idFromName("global"));
}
