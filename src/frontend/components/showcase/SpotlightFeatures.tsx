/**
 * @fileoverview Platform features spotlight grid (rebuilt from the Feature166
 * Next.js + Radix reference into our base-ui + Astro stack). Renders a heading
 * block plus a responsive grid of {@link SpotlightCard} items. Each card tracks
 * the mouse and paints two `--primary` radial-gradient overlays that fade in on
 * hover.
 *
 * Populated with the REAL Cloudflare stack this app runs on (Workers, D1,
 * Durable Objects, Agents SDK, Workers AI, Vectorize, R2, Browser Rendering,
 * Queues, KV). Pure presentation — no agents stack — so it can hydrate with
 * `client:visible`.
 */

"use client";

import { useRef, type MouseEvent } from "react";

import {
  Boxes,
  BrainCircuit,
  Bot,
  Cpu,
  Database,
  Globe,
  HardDrive,
  KeyRound,
  ListChecks,
  Search,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** One feature entry rendered as a spotlight card. */
interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Cpu,
    title: "Cloudflare Workers",
    description:
      "The whole app — Astro SSR, the Hono API, and every agent — runs as a single Worker at the edge, milliseconds from the user.",
  },
  {
    icon: Boxes,
    title: "Durable Objects",
    description:
      "Each agent session is a strongly-consistent Durable Object with its own SQLite store, giving every chat its own isolated, persistent home.",
  },
  {
    icon: Bot,
    title: "Agents SDK",
    description:
      "assistant-ui threads stream over a WebSocket straight to the agent DO via the Cloudflare Agents SDK — tools, approvals, and state included.",
  },
  {
    icon: BrainCircuit,
    title: "Workers AI",
    description:
      "Inference runs on Cloudflare's GPU network through the AI binding, so models stay close to the request with no third-party round trips.",
  },
  {
    icon: Database,
    title: "D1 Database",
    description:
      "Relational app data lives in D1, Cloudflare's serverless SQLite — queried directly from the Worker with zero connection management.",
  },
  {
    icon: Search,
    title: "Vectorize",
    description:
      "Semantic search and retrieval are powered by Vectorize, Cloudflare's native vector database, for grounding agents in your own content.",
  },
  {
    icon: HardDrive,
    title: "R2 Storage",
    description:
      "Artifacts, uploads, and generated files are stored in R2 object storage with zero egress fees and S3-compatible access.",
  },
  {
    icon: Globe,
    title: "Browser Rendering",
    description:
      "The browser-HITL agent drives a headless Chromium via Browser Rendering to screenshot pages and fill forms — gated by human approval.",
  },
  {
    icon: ListChecks,
    title: "Queues",
    description:
      "Long-running and fan-out work is decoupled through Cloudflare Queues, letting agents hand off durable, retryable background jobs.",
  },
  {
    icon: KeyRound,
    title: "KV & Secrets",
    description:
      "Low-latency config and auth tokens live in Workers KV and encrypted secrets, available globally with single-digit-ms reads.",
  },
];

/** A single spotlight card with a mouse-follow radial glow. */
function SpotlightCard({ icon: Icon, title, description }: Feature) {
  const ref = useRef<HTMLDivElement>(null);

  /** Track the pointer so the CSS variables drive the gradient origin. */
  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className="group/spot relative overflow-hidden rounded-xl bg-card p-6 ring-1 ring-border/40 transition-shadow hover:ring-border/60"
    >
      {/* Spotlight overlays (fade in on hover). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            "radial-gradient(280px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklch, var(--primary) 16%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/spot:opacity-100"
        style={{
          background:
            "radial-gradient(120px circle at var(--spot-x, 50%) var(--spot-y, 50%), color-mix(in oklch, var(--primary) 28%, transparent), transparent 60%)",
        }}
      />

      <div className="relative">
        <div className="mb-4 inline-flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-5" />
        </div>
        <h3 className="mb-2 text-base font-semibold">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

/** Props for {@link SpotlightFeatures}. */
export interface SpotlightFeaturesProps {
  badge?: string;
  heading?: string;
  description?: string;
}

/** The full features section: header block + spotlight grid + CTAs. */
export function SpotlightFeatures({
  badge = "Built on Cloudflare",
  heading = "One Worker. The entire edge platform.",
  description = "This showcase runs end-to-end on Cloudflare's developer platform — every agent, request, and byte of state lives at the edge.",
}: SpotlightFeaturesProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        {badge && (
          <Badge variant="outline" className="mb-4">
            {badge}
          </Badge>
        )}
        <h1 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h1>
        <p className="mt-4 text-pretty text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button render={<a href="/chat">Try the chat</a>} />
          <Button variant="outline" render={<a href="/showcase/multi-agent">See multi-agent</a>} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <SpotlightCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
}
