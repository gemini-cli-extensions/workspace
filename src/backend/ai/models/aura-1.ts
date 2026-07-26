import { z } from "zod";

import { defineModel } from "@/backend/ai/models/_define";

export const Aura1Input = z.object({
  text: z.string().min(1),
  voice: z.string().optional(),
});

export const Aura1Output = z.custom<ReadableStream<Uint8Array>>(
  (value) => value instanceof ReadableStream,
  "Expected a readable audio stream",
);

export const aura_1 = defineModel({
  id: "@cf/deepgram/aura-1",
  capabilities: ["tts", "streaming"],
  input: Aura1Input,
  output: Aura1Output,
  serialize: (input) => input,
  parseResponse: (raw) => Aura1Output.parse(raw),
});

export type Aura1Input = z.infer<typeof Aura1Input>;
export type Aura1Output = z.infer<typeof Aura1Output>;
