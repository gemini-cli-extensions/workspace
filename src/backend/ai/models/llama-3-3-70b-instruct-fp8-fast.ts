import { z } from "zod";

import { defineModel, readTextResponse } from "@/backend/ai/models/_define";

export const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});

export const Llama33_70bInput = z.object({
  messages: z.array(ChatMessage).min(1),
  max_tokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  response_format: z
    .object({
      type: z.literal("json_schema"),
      json_schema: z.unknown(),
    })
    .optional(),
});

export const Llama33_70bOutput = z.object({ response: z.string() });

export const llama_3_3_70b = defineModel({
  id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  capabilities: ["chat", "json-mode", "streaming"],
  input: Llama33_70bInput,
  output: Llama33_70bOutput,
  serialize: (input) => ({
    messages: input.messages,
    max_tokens: input.max_tokens ?? 2048,
    temperature: input.temperature,
    response_format: input.response_format,
  }),
  parseResponse: (raw) => Llama33_70bOutput.parse(readTextResponse(raw)),
});

export type Llama33_70bInput = z.infer<typeof Llama33_70bInput>;
export type Llama33_70bOutput = z.infer<typeof Llama33_70bOutput>;
export type ChatMessage = z.infer<typeof ChatMessage>;
