import { z } from "zod";

import { defineModel, readTextResponse } from "@/backend/ai/models/_define";

export const Llama31ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});

export const Llama31_8bInput = z.object({
  messages: z.array(Llama31ChatMessage).min(1),
  max_tokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  response_format: z
    .object({
      type: z.literal("json_schema"),
      json_schema: z.unknown(),
    })
    .optional(),
});

export const Llama31_8bOutput = z.object({ response: z.string() });

export const llama_3_1_8b = defineModel({
  id: "@cf/meta/llama-3.1-8b-instruct",
  capabilities: ["chat", "json-mode", "streaming"],
  input: Llama31_8bInput,
  output: Llama31_8bOutput,
  serialize: (input) => ({
    messages: input.messages,
    max_tokens: input.max_tokens ?? 1024,
    temperature: input.temperature,
    response_format: input.response_format,
  }),
  parseResponse: (raw) => Llama31_8bOutput.parse(readTextResponse(raw)),
});

export type Llama31_8bInput = z.infer<typeof Llama31_8bInput>;
export type Llama31_8bOutput = z.infer<typeof Llama31_8bOutput>;
