/**
 * @fileoverview Cloudflare Workers AI provider — invokes models via
 * `env.AI.run()` through the AI Gateway.
 */

import type { AIProvider, InvokeOpts, ModelDescriptor } from "@/backend/ai/providers/base";

export class WorkersAIProvider implements AIProvider {
  constructor(private readonly env: Env) {}

  // -----------------------------------------------------------------------
  // Synchronous invocation — returns parsed model output
  // -----------------------------------------------------------------------

  async invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {},
  ): Promise<TOutput> {
    const body = this.buildRequestBody(model, input, false);

    if (!isRecord(body)) {
      throw new Error(`env.AI.run requires an object body for ${model.id}`);
    }

    const raw = await this.env.AI.run(model.id, body, {
      gateway: {
        id: this.env.AI_GATEWAY_ID,
        skipCache: opts.cacheTtl === 0,
        cacheTtl: opts.cacheTtl,
      },
    });

    return model.parseResponse(raw);
  }

  // -----------------------------------------------------------------------
  // Structured output — invokes with json_schema and parses JSON directly
  // -----------------------------------------------------------------------

  async invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {},
  ): Promise<unknown> {
    const body = this.buildRequestBody(model, input, false);

    if (!isRecord(body)) {
      throw new Error(`env.AI.run requires an object body for ${model.id}`);
    }

    const raw = await this.env.AI.run(model.id, body, {
      gateway: {
        id: this.env.AI_GATEWAY_ID,
        skipCache: opts.cacheTtl === 0,
        cacheTtl: opts.cacheTtl,
      },
    });

    // Unwrap nested result object if present (e.g. { result: { ... } })
    const result = isRecord(raw) && isRecord(raw.result) ? raw.result : raw;

    // Strategy 1: Messages API — choices[0].message.content
    if (isRecord(result) && Array.isArray(result.choices)) {
      const choice = result.choices[0] as Record<string, unknown> | undefined;
      if (choice && isRecord(choice.message)) {
        const content = (choice.message as Record<string, unknown>).content;
        if (typeof content === "string") {
          return JSON.parse(stripJsonFences(content));
        }
      }
    }

    // Strategy 2: Standard text-generation — result.response (string)
    if (isRecord(result)) {
      const textValue = result.response ?? result.text ?? result.description;
      if (typeof textValue === "string") {
        return JSON.parse(stripJsonFences(textValue));
      }
    }

    // Strategy 3: Already a parsed object (some models return JSON directly)
    if (isRecord(result) && !("response" in result) && !("choices" in result)) {
      return result;
    }

    // If nothing matched, provide a detailed error
    const keys = isRecord(result) ? Object.keys(result).join(", ") : typeof result;
    const snippet = JSON.stringify(result)?.slice(0, 300);
    throw new Error(
      `Structured output: unable to extract JSON from ${model.id}. ` +
        `Keys: [${keys}]. Raw (truncated): ${snippet}`,
    );
  }

  // -----------------------------------------------------------------------
  // Streaming — returns raw SSE byte stream
  // -----------------------------------------------------------------------

  async streamModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {},
  ): Promise<ReadableStream<Uint8Array>> {
    const body = this.buildRequestBody(model, input, true);

    if (!isRecord(body)) {
      throw new Error(`env.AI.run stream requires an object body for ${model.id}`);
    }

    const result = await this.env.AI.run(model.id, body, {
      gateway: {
        id: this.env.AI_GATEWAY_ID,
        skipCache: opts.cacheTtl === 0,
        cacheTtl: opts.cacheTtl,
      },
    });

    if (result instanceof ReadableStream) {
      return result;
    }

    // If the binding returned a non-stream object, wrap it as a stream
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      },
    });
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private buildRequestBody<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    stream: boolean,
  ): unknown {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed);

    if (!stream || !isRecord(serialized)) {
      return serialized;
    }

    return { ...serialized, stream: true };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strip optional markdown JSON fences from model output.
 * gpt-oss-120b with json_schema should not need this, but it serves as a
 * safety net for models that wrap JSON in ```json ... ``` blocks.
 */
function stripJsonFences(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}
