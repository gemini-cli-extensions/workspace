/**
 * @fileoverview Base types for AI providers and model descriptors.
 */

import type { z } from "zod";

// ---------------------------------------------------------------------------
// Model capabilities
// ---------------------------------------------------------------------------

export type ModelCapability =
  | "chat"
  | "json-mode"
  | "streaming"
  | "embedding"
  | "stt"
  | "tts"
  | "vision";

// ---------------------------------------------------------------------------
// Invocation options
// ---------------------------------------------------------------------------

export type InvokeOpts = {
  cacheTtl?: number;
  signal?: AbortSignal;
};

// ---------------------------------------------------------------------------
// Model descriptor — defines I/O schema and serialization for a Workers AI model
// ---------------------------------------------------------------------------

export type ModelDescriptor<TInput, TOutput> = {
  id: string;
  capabilities: ModelCapability[];
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  serialize: (input: TInput) => unknown;
  parseResponse: (raw: unknown) => TOutput;
};

// ---------------------------------------------------------------------------
// Provider interface — implemented by WorkersAIProvider (and future providers)
// ---------------------------------------------------------------------------

export interface AIProvider {
  /** Invoke a model synchronously and return parsed output. */
  invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts?: InvokeOpts,
  ): Promise<TOutput>;

  /** Stream model output as raw bytes (SSE from Workers AI). */
  streamModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts?: InvokeOpts,
  ): Promise<ReadableStream<Uint8Array>>;

  /**
   * Invoke a model with `response_format: { type: "json_schema" }` and
   * parse the response directly as JSON.  Returns the raw parsed object.
   *
   * This eliminates the need for regex-based JSON fence stripping —
   * gpt-oss-120b returns valid JSON when using json_schema mode.
   */
  invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts?: InvokeOpts,
  ): Promise<unknown>;
}
