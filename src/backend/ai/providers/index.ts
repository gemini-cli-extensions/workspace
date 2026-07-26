/**
 * @fileoverview AI provider facade — exposes centralized methods for
 * structured output generation, chat, and streaming.
 *
 * All methods resolve the model from the environment-based registry
 * and route through the active provider (currently Workers AI only).
 */

import type { z } from "zod";

import { zodToJsonSchema } from "zod-to-json-schema";

import type { GptOssMessage } from "@/backend/ai/models/gpt-oss-120b";
import type { AIProvider } from "@/backend/ai/providers/base";

import { getModelRegistry } from "@/backend/ai/models";
import { WorkersAIProvider } from "@/backend/ai/providers/workers-ai";

// Re-export the shared message type for consumers
export type { GptOssMessage as ChatMessage } from "@/backend/ai/models/gpt-oss-120b";

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function getProvider(env: Env, name: "workers-ai" = "workers-ai"): AIProvider {
  switch (name) {
    case "workers-ai":
      return new WorkersAIProvider(env);
  }
}

// ---------------------------------------------------------------------------
// generateStructuredOutput — structured JSON output via json_schema
// ---------------------------------------------------------------------------

/**
 * Generate a structured output object that conforms to the given Zod schema.
 *
 * Uses `response_format: { type: "json_schema" }` to instruct the model
 * (gpt-oss-120b) to return valid JSON matching the schema.  The response
 * is parsed and validated against the schema directly — no regex stripping.
 *
 * @param env      Worker environment bindings
 * @param opts     Messages, Zod schema, and optional generation params
 * @returns        Parsed and validated output matching TSchema
 */
export async function generateStructuredOutput<TSchema extends z.ZodTypeAny>(
  env: Env,
  opts: {
    messages: GptOssMessage[];
    schema: TSchema;
    schemaName?: string;
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
  },
): Promise<z.infer<TSchema>> {
  const provider = getProvider(env);
  const model = getModelRegistry(env).extract;

  const raw = await provider.invokeStructured(
    model,
    {
      messages: opts.messages,
      temperature: opts.temperature ?? 0,
      max_tokens: opts.max_tokens,
      response_format: {
        type: "json_schema" as const,
        json_schema: zodToJsonSchema(opts.schema as never, opts.schemaName ?? "Schema"),
      },
    },
    { cacheTtl: opts.cacheTtl },
  );

  return opts.schema.parse(raw);
}

// ---------------------------------------------------------------------------
// streamChat — streaming SSE for frontend chat UI
// ---------------------------------------------------------------------------

/**
 * Stream chat tokens from the model as a ReadableStream<Uint8Array>.
 *
 * Returns raw SSE from Workers AI — callers can pipe this to the frontend
 * or wrap it in an SSE-formatted stream via `toSseStream()`.
 *
 * @param env      Worker environment bindings
 * @param opts     Chat messages and optional generation params
 * @returns        ReadableStream of raw model output chunks
 */
export async function streamChat(
  env: Env,
  opts: {
    messages: GptOssMessage[];
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
  },
): Promise<ReadableStream<Uint8Array>> {
  const provider = getProvider(env);
  const model = getModelRegistry(env).chat;

  return provider.streamModel(
    model,
    {
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.max_tokens,
    },
    { cacheTtl: opts.cacheTtl },
  );
}
