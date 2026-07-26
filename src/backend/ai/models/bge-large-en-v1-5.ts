import { z } from "zod";

import { defineModel, readResultObject } from "@/backend/ai/models/_define";

export const BgeLargeEnInput = z.object({
  text: z.array(z.string()).min(1),
});

export const BgeLargeEnOutput = z.object({
  data: z.array(z.array(z.number())),
});

export const bge_large_en_v1_5 = defineModel({
  id: "@cf/baai/bge-large-en-v1.5",
  capabilities: ["embedding"],
  input: BgeLargeEnInput,
  output: BgeLargeEnOutput,
  serialize: (input) => input,
  parseResponse: (raw) => BgeLargeEnOutput.parse(readResultObject(raw)),
});

export type BgeLargeEnInput = z.infer<typeof BgeLargeEnInput>;
export type BgeLargeEnOutput = z.infer<typeof BgeLargeEnOutput>;
