/**
 * @fileoverview Model registry — maps task roles (chat, extract, draft, etc.)
 * to Workers AI model descriptors.
 *
 * The `getModelRegistry(env)` function resolves each role's model ID from env
 * vars and returns the matching model descriptor with full schema/serialization
 * support.  When the env model ID matches a known descriptor, that descriptor
 * is used directly.  Otherwise the default descriptor is cloned with the
 * new model ID (backward-compatible).
 */

import type { ModelDescriptor } from "@/backend/ai/providers/base";

import { aura_1 } from "@/backend/ai/models/aura-1";
import { bge_large_en_v1_5 } from "@/backend/ai/models/bge-large-en-v1-5";
import { gpt_oss_120b } from "@/backend/ai/models/gpt-oss-120b";
import { llama_3_1_8b } from "@/backend/ai/models/llama-3-1-8b-instruct";
import { llama_3_3_70b } from "@/backend/ai/models/llama-3-3-70b-instruct-fp8-fast";
import { llava_1_5_7b_hf } from "@/backend/ai/models/llava-1-5-7b-hf";
import { whisper } from "@/backend/ai/models/whisper";

// ---------------------------------------------------------------------------
// Known model descriptors — keyed by Workers AI model ID
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MODEL_MAP: Record<string, ModelDescriptor<any, any>> = {
  "@cf/openai/gpt-oss-120b": gpt_oss_120b,
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": llama_3_3_70b,
  "@cf/meta/llama-3.1-8b-instruct": llama_3_1_8b,
};

// ---------------------------------------------------------------------------
// Default static registry (used when env vars are not needed)
// ---------------------------------------------------------------------------

export const modelRegistry = {
  chat: gpt_oss_120b,
  extract: gpt_oss_120b,
  draft: gpt_oss_120b,
  embed: bge_large_en_v1_5,
  stt: whisper,
  tts: aura_1,
  vision: llava_1_5_7b_hf,
} as const;

// ---------------------------------------------------------------------------
// Dynamic registry — resolves model IDs from env vars
// ---------------------------------------------------------------------------

export function getModelRegistry(env: Env) {
  return {
    ...modelRegistry,
    chat: resolveModel(env.MODEL_CHAT, gpt_oss_120b),
    extract: resolveModel(env.MODEL_EXTRACT, gpt_oss_120b),
    draft: resolveModel(env.MODEL_DRAFT, gpt_oss_120b),
    embed: withModelId(modelRegistry.embed, env.DEFAULT_MODEL_EMBEDDING),
  } as const;
}

/**
 * Resolve a model descriptor from an env var model ID.
 *
 * If the model ID matches a known descriptor, returns that descriptor
 * directly (so it uses the correct input schema, serializer, and parser).
 * Otherwise falls back to cloning the default descriptor with the new ID.
 */
function resolveModel<TInput, TOutput>(
  envModelId: string,
  fallback: ModelDescriptor<TInput, TOutput>,
): ModelDescriptor<TInput, TOutput> {
  const known = MODEL_MAP[envModelId];

  if (known) {
    return known as ModelDescriptor<TInput, TOutput>;
  }

  return withModelId(fallback, envModelId);
}

function withModelId<TInput, TOutput>(
  model: ModelDescriptor<TInput, TOutput>,
  id: string,
): ModelDescriptor<TInput, TOutput> {
  return { ...model, id };
}

export type ModelRegistry = ReturnType<typeof getModelRegistry>;
