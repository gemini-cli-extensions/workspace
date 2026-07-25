import { z } from "zod";

import { defineModel, readResultObject } from "@/backend/ai/models/_define";

export const LlavaInput = z.object({
  image: z.array(z.number()).min(1),
  prompt: z.string().min(1),
  max_tokens: z.number().int().positive().max(2048).optional(),
});

export const LlavaOutput = z.object({
  description: z.string(),
});

export const llava_1_5_7b_hf = defineModel({
  id: "@cf/llava-hf/llava-1.5-7b-hf",
  capabilities: ["vision"],
  input: LlavaInput,
  output: LlavaOutput,
  serialize: (input) => ({
    image: input.image,
    prompt: input.prompt,
    max_tokens: input.max_tokens,
  }),
  parseResponse: (raw) => {
    const result = readResultObject(raw);
    const description = result.description ?? result.response ?? result.text;

    return LlavaOutput.parse({ description });
  },
});

export type LlavaInput = z.infer<typeof LlavaInput>;
export type LlavaOutput = z.infer<typeof LlavaOutput>;
