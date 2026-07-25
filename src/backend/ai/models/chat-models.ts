/**
 * @fileoverview Workers AI chat-model picker registry.
 *
 * The only LLM provider available in this template is Cloudflare Workers AI —
 * there are no OpenAI/Anthropic keys. The assistant's "provider/model dropdown"
 * is therefore a picker over the chat-capable Workers AI models below.
 *
 * This list is the single source of truth shared by:
 *  - the backend (`getChatModel(env, modelId)` validates against it), and
 *  - the frontend model `<Select>` in the Thread header (imported as a plain
 *    data array — no server code is pulled into the bundle).
 *
 * Each entry's `id` is the exact Workers AI model id passed to the AI SDK
 * provider. Keep ids in sync with `src/backend/ai/models/index.ts` (MODEL_MAP).
 */

/** A single selectable Workers AI chat model. */
export interface ChatModelOption {
  /** Exact Workers AI model id (e.g. "@cf/openai/gpt-oss-120b"). */
  id: string;
  /** Short human label for the dropdown. */
  label: string;
  /** One-line capability hint shown under the label. */
  hint: string;
}

/**
 * The chat-capable Workers AI models offered in the model picker.
 *
 * The FIRST entry is the default when a thread has no explicit `model` set and
 * `MODEL_CHAT` is unset.
 */
export const CHAT_MODEL_OPTIONS: readonly ChatModelOption[] = [
  {
    id: "@cf/openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    hint: "Most capable · tools + structured output",
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B",
    hint: "Fast, strong general reasoning",
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct",
    label: "Llama 3.1 8B",
    hint: "Lightweight · lowest latency",
  },
] as const;

/** Default chat model id (first option). */
export const DEFAULT_CHAT_MODEL_ID = CHAT_MODEL_OPTIONS[0]!.id;

/** Set of valid model ids for O(1) validation. */
const VALID_MODEL_IDS = new Set(CHAT_MODEL_OPTIONS.map((m) => m.id));

/**
 * Narrow an arbitrary string to a known chat model id, or `undefined` if it is
 * not one of the offered models.
 *
 * @param id - Candidate model id (e.g. from a thread row or query param).
 */
export function asChatModelId(id: string | null | undefined): string | undefined {
  return id && VALID_MODEL_IDS.has(id) ? id : undefined;
}
