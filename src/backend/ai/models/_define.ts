import type { z } from "zod";

import type { ModelDescriptor, ModelCapability } from "@/backend/ai/providers/base";

export function defineModel<TInput, TOutput>(spec: {
  id: string;
  capabilities: ModelCapability[];
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  serialize: (input: TInput) => unknown;
  parseResponse: (raw: unknown) => TOutput;
}): ModelDescriptor<TInput, TOutput> {
  return spec;
}

export function readResultObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw) && isRecord(raw.result)) {
    return raw.result;
  }

  if (isRecord(raw)) {
    return raw;
  }

  return {};
}

export function readTextResponse(raw: unknown): { response: string } {
  const result = readResultObject(raw);
  // Standard text-generation: result.response / result.text / result.description
  let value: unknown = result.response ?? result.text ?? result.description;

  // Messages API: result.choices[0].message.content
  if (value === undefined && Array.isArray(result.choices)) {
    const choice = result.choices[0] as Record<string, unknown> | undefined;
    if (choice && isRecord(choice.message)) {
      value = (choice.message as Record<string, unknown>).content;
    }
  }

  if (typeof value === "string") {
    return { response: value };
  }

  throw new Error(
    `Workers AI response did not include text output. Keys: ${Object.keys(result).join(", ")}`,
  );
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
