import { z } from "zod";

import { defineModel, readResultObject } from "@/backend/ai/models/_define";

export const WhisperInput = z.object({
  audio: z.union([z.array(z.number()), z.instanceof(ArrayBuffer)]),
});

export const WhisperOutput = z.object({
  text: z.string(),
  words: z
    .array(
      z.object({
        word: z.string().optional(),
        start: z.number().optional(),
        end: z.number().optional(),
      }),
    )
    .optional(),
});

export const whisper = defineModel({
  id: "@cf/openai/whisper",
  capabilities: ["stt"],
  input: WhisperInput,
  output: WhisperOutput,
  serialize: (input) => ({
    audio: Array.isArray(input.audio) ? input.audio : [...new Uint8Array(input.audio)],
  }),
  parseResponse: (raw) => WhisperOutput.parse(readResultObject(raw)),
});

export type WhisperInput = z.infer<typeof WhisperInput>;
export type WhisperOutput = z.infer<typeof WhisperOutput>;
