/**
 * @fileoverview GPT-OSS-120B model module for Cloudflare Workers AI.
 *
 * Supports both the standard Messages API and the Responses API format.
 * Capabilities: chat, structured output (json_schema), streaming, tool use.
 *
 * Schema sources:
 *   Sync input:  https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/sync-input.json
 *   Sync output: https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/sync-output.json
 */

import { z } from "zod";

import { defineModel, readTextResponse } from "@/backend/ai/models/_define";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export const GptOssMessage = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});

// ---------------------------------------------------------------------------
// Messages API input (multi-turn chat, structured output, tool use)
// ---------------------------------------------------------------------------

export const GptOss120bInput = z.object({
  messages: z.array(GptOssMessage).min(1),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(5).optional(),
  top_p: z.number().min(0.001).max(1).optional(),
  top_k: z.number().int().min(1).max(50).optional(),
  seed: z.number().int().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  repetition_penalty: z.number().min(0).max(2).optional(),
  response_format: z
    .object({
      type: z.enum(["json_object", "json_schema"]),
      json_schema: z.unknown(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Output schema (same for sync and structured output)
// ---------------------------------------------------------------------------

export const GptOss120bOutput = z.object({ response: z.string() });

export const GptOss120bUsage = z
  .object({
    prompt_tokens: z.number().default(0),
    completion_tokens: z.number().default(0),
    total_tokens: z.number().default(0),
  })
  .optional();

// ---------------------------------------------------------------------------
// Model descriptor
// ---------------------------------------------------------------------------

export const gpt_oss_120b = defineModel({
  id: "@cf/openai/gpt-oss-120b",
  capabilities: ["chat", "json-mode", "streaming"],
  input: GptOss120bInput,
  output: GptOss120bOutput,

  serialize: (input) => {
    const body: Record<string, unknown> = {
      messages: input.messages,
      max_tokens: input.max_tokens ?? 4096,
    };

    // Only include optional params if they were explicitly set
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.top_p !== undefined) body.top_p = input.top_p;
    if (input.top_k !== undefined) body.top_k = input.top_k;
    if (input.seed !== undefined) body.seed = input.seed;
    if (input.frequency_penalty !== undefined) body.frequency_penalty = input.frequency_penalty;
    if (input.presence_penalty !== undefined) body.presence_penalty = input.presence_penalty;
    if (input.repetition_penalty !== undefined) body.repetition_penalty = input.repetition_penalty;
    if (input.response_format !== undefined) body.response_format = input.response_format;

    return body;
  },

  parseResponse: (raw) => GptOss120bOutput.parse(readTextResponse(raw)),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type GptOss120bInput = z.infer<typeof GptOss120bInput>;
export type GptOss120bOutput = z.infer<typeof GptOss120bOutput>;
export type GptOssMessage = z.infer<typeof GptOssMessage>;
