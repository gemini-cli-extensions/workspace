/**
 * @fileoverview ThinkingAgent — streams a visible "thinking" trace, then the
 * answer, as two distinct phases the UI can render separately.
 *
 * Many Workers AI chat models do not natively emit a `reasoning` channel, so we
 * synthesize a genuine two-phase response:
 *
 *  1. **Thinking phase** — a real model call produces a short plan/reasoning
 *     brief, streamed token-by-token as `reasoning-*` UI-message parts. The
 *     assistant-ui Thread renders these as a collapsible "Thinking" block,
 *     distinct from the answer.
 *  2. **Answer phase** — a second real model call, *conditioned on the plan*,
 *     streams the final answer as ordinary `text-*` parts.
 *
 * Both phases are real model output (not canned), so the streamed reasoning is
 * substantive, not theatrical.
 *
 * ## Wire contract
 * - Binding: `THINKING_AGENT`
 * - Kebab name: `thinking-agent`
 * - Chat: `onChatMessage` — emits `reasoning` parts then `text` parts.
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";

const THINKING_PROMPT = `You are the private reasoning channel of an assistant.
Think step by step about how to answer the user's latest message.
Write a brief plan: key considerations, assumptions, and the approach you'll take.
Do NOT write the final answer here — only the reasoning. Keep it under 120 words.`;

const ANSWER_PROMPT = `You are a helpful assistant. You have already privately reasoned about the question.
Using that reasoning, write the final answer for the user. Be concise and direct.
Do not restate your reasoning; just give the answer.`;

export class ThinkingAgent extends AIChatAgent<Env> {
  /** Docs metadata for the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "ThinkingAgent",
      className: "ThinkingAgent",
      description:
        "Streams a genuine two-phase response: a real model-generated reasoning trace (as reasoning UI parts) followed by the final answer (as text parts), so the UI can render a 'Thinking' block distinct from the answer.",
      docsPath: "/docs/agents/thinking",
      methods: [
        {
          name: "onChatMessage",
          description: "Streams reasoning-* parts (thinking phase) then text-* parts (answer phase).",
          params: "onFinish",
          returns: "Response (streamed)",
        },
      ],
    };
  }

  /**
   * Two-phase streamed response: thinking, then answer.
   */
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const modelMessages = await convertToModelMessages(this.messages as UIMessage[]);
    const model = getChatModel(this.env);

    const stream = createUIMessageStream({
      onFinish: ({ messages }) => {
        // Bridge our manual stream into the SDK persistence callback shape so
        // the assistant turn (reasoning + text) is saved to the DO's history.
        void (onFinish as unknown as (arg: { messages: UIMessage[] }) => void)?.({
          messages: messages as UIMessage[],
        });
      },
      execute: async ({ writer }) => {
        // ----- Phase 1: thinking (reasoning-* parts) -----
        const reasoningId = crypto.randomUUID();
        writer.write({ type: "reasoning-start", id: reasoningId });

        let plan = "";
        try {
          const thinking = streamText({
            model,
            system: THINKING_PROMPT,
            messages: modelMessages,
            maxOutputTokens: 256,
            temperature: 0.4,
          });
          for await (const delta of thinking.textStream) {
            plan += delta;
            writer.write({ type: "reasoning-delta", id: reasoningId, delta });
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          const delta = `Unable to reach Workers AI for the thinking phase (${detail}).`;
          plan = delta;
          writer.write({ type: "reasoning-delta", id: reasoningId, delta });
        }
        writer.write({ type: "reasoning-end", id: reasoningId });

        // ----- Phase 2: answer (text-* parts), conditioned on the plan -----
        const textId = crypto.randomUUID();
        writer.write({ type: "text-start", id: textId });
        try {
          const answer = streamText({
            model,
            system: ANSWER_PROMPT,
            messages: [
              ...modelMessages,
              {
                role: "assistant",
                content: `[private reasoning]\n${plan}`,
              },
            ],
            maxOutputTokens: 1024,
            temperature: 0.5,
          });
          for await (const delta of answer.textStream) {
            writer.write({ type: "text-delta", id: textId, delta });
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          writer.write({
            type: "text-delta",
            id: textId,
            delta: `Workers AI is currently unreachable, so I can't complete the answer phase. (${detail})`,
          });
        }
        writer.write({ type: "text-end", id: textId });
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
