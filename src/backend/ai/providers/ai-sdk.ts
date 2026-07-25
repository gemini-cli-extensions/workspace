/**
 * @fileoverview AI SDK model factory for `AIChatAgent` Durable Objects.
 *
 * The `AIChatAgent` chat loop (`streamText`/`generateText` from the `ai`
 * package) needs a real AI SDK `LanguageModel`, not the project's internal
 * `WorkersAIProvider` facade (which exposes `streamModel`/`generateStructured`
 * helpers but is NOT AI-SDK-compatible). This module bridges that gap using
 * the official `workers-ai-provider` package, wiring Cloudflare Workers AI
 * (`env.AI`) into the AI SDK exactly as the Cloudflare Agents docs prescribe:
 *
 *   const result = streamText({ model: getChatModel(this.env), ... })
 *
 * Keeping this in one place means every showcase agent resolves the same model
 * from the same `MODEL_CHAT` env var, and swapping providers later (OpenAI,
 * Anthropic, AI Gateway) is a one-file change.
 *
 * @see https://developers.cloudflare.com/agents/api-reference/chat-agents/
 */

import { createWorkersAI } from "workers-ai-provider";
import type { LanguageModel } from "ai";

import { asChatModelId, DEFAULT_CHAT_MODEL_ID } from "@/backend/ai/models/chat-models";

/**
 * Resolve the AI SDK `LanguageModel` used by the chat showcase agents.
 *
 * Model resolution order (first match wins):
 *   1. An explicit `modelId` argument — but ONLY if it is a known chat model id
 *      (validated against `CHAT_MODEL_OPTIONS`). Untrusted values (e.g. a
 *      per-thread `chat_threads.model`) are filtered, so a bad value can never
 *      reach the provider.
 *   2. The `MODEL_CHAT` Worker var (declared in `wrangler.jsonc`).
 *   3. The built-in default (`DEFAULT_CHAT_MODEL_ID`).
 *
 * @param env - Worker bindings (needs the `AI` Workers AI binding).
 * @param modelId - Optional per-thread model id selected via the model picker.
 * @returns An AI SDK `LanguageModel` ready to pass to `streamText`/`generateText`.
 */
export function getChatModel(env: Env, modelId?: string | null): LanguageModel {
  const workersai = createWorkersAI({ binding: env.AI });
  const resolved = asChatModelId(modelId) ?? env.MODEL_CHAT ?? DEFAULT_CHAT_MODEL_ID;
  return workersai(resolved as Parameters<typeof workersai>[0]);
}
