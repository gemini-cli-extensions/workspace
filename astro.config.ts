// @ts-check
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

const site = process.env.SITE ?? "http://localhost:4321";
const base = process.env.BASE || "/";

// https://astro.build/config
export default defineConfig({
  site,
  srcDir: "./src/frontend",
  base,
  output: "server",
  // Use the project's existing `SESSIONS` KV binding for Astro's session
  // store. By default the adapter looks for a `SESSION` binding; pointing
  // the driver at the explicit binding name avoids the "Invalid binding
  // `SESSION`" warning on build and lets the auth middleware and Astro
  // share one namespace.
  session: {
    driver: "cloudflare-kv-binding",
    options: { binding: "SESSIONS" },
  },
  adapter: cloudflare({
    imageService: "cloudflare",
    platformProxy: {
      enabled: true,
    },
    routes: {
      // Extend Cloudflare routes to include backend API routes
      extend: {
        include: ["/api/*"],
        exclude: [],
      },
    },
    // Configure worker entry point with Durable Object exports.
    // These names must match the DO classes re-exported from `src/_worker.ts`
    // and the `durable_objects.bindings` class names in `wrangler.jsonc`.
    workerEntryPoint: {
      path: "src/_worker.ts",
      namedExports: [
        "ChatBroker",
        "CodeModeAgent",
        "BrowserHitlAgent",
        "WorkflowsAgent",
        "ArtifactAgent",
        "NotificationsAgent",
        "OrchestratorAgent",
        "ResearcherAgent",
        "CoderAgent",
        "McpAgent",
        "ThinkingAgent",
        "SkillsAgent",
      ],
    },
  }),
  integrations: [react()],
  vite: {
    plugins: [
      // Cast through the Vite plugin type to work around the current
      // Vite/@tailwindcss-vite HotUpdateOptions mismatch without dropping
      // type information entirely.
      tailwindcss() as unknown as import("vite").Plugin,
    ],
    // Explicitly externalize node built-in modules and Cloudflare-specific packages for SSR
    ssr: {
      external: [
        "node:fs/promises",
        "node:path",
        "node:url",
        "node:crypto",
        "node:buffer",
        "node:stream",
        "node:util",
        "agents",
        "cloudflare:workers",
      ],
    },
  },
});
