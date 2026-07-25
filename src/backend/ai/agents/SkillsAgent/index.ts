/**
 * @fileoverview SkillsAgent — demonstrates Cloudflare Agents "skills".
 *
 * A *skill* here is a named, self-contained capability bundle: an id, a
 * description, a set of trigger keywords, and a `system` fragment plus optional
 * `tools` the agent activates when the skill is selected. On each turn the agent
 * performs **real skill selection** (keyword match against the latest user
 * message, with an explicit fallback) and then **applies** the selected skill by
 * folding its system fragment and tools into the model call. The chosen skill is
 * surfaced in the response so selection is observable.
 *
 * Three real skills ship in the registry:
 * - `summarize`  — condenses text into bullet points.
 * - `translate`  — translates text (exposes a `detectLanguage` tool).
 * - `calculate`  — evaluates safe arithmetic (exposes a real `calc` tool).
 *
 * ## Wire contract
 * - Binding: `SKILLS_AGENT`
 * - Kebab name: `skills-agent`
 * - Chat: `onChatMessage` — selects + applies a skill, streams the result.
 * - RPC: `listSkills(): Promise<SkillDescriptor[]>` — enumerate the registry.
 * - RPC: `selectSkill(text: string): Promise<SkillDescriptor>` — preview which
 *   skill a message would activate (pure selection, no model call).
 */

import { AIChatAgent } from "@cloudflare/ai-chat";
import { callable } from "agents";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type ToolSet,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { getChatModel } from "@/backend/ai/providers/ai-sdk";

/** A serializable description of a skill, returned by {@link SkillsAgent.listSkills}. */
export interface SkillDescriptor {
  id: string;
  description: string;
  triggers: string[];
}

/** Internal skill definition (registry entry). */
interface Skill {
  id: string;
  description: string;
  triggers: string[];
  system: string;
  /** Tools, keyed by name, the model may call while this skill is active. */
  tools?: ToolSet;
}

const calcSchema = z.object({
  expression: z
    .string()
    .describe("A simple arithmetic expression using + - * / ( ) and numbers."),
});

const detectLanguageSchema = z.object({
  text: z.string().describe("Text whose language should be guessed."),
});

/**
 * Safely evaluate a basic arithmetic expression without `eval`.
 * Supports + - * / parentheses and decimal numbers. Throws on anything else.
 */
function safeCalc(expression: string): number {
  if (!/^[\d\s.+\-*/()]+$/.test(expression)) {
    throw new Error("Expression contains unsupported characters.");
  }
  // Shunting-yard to RPN, then evaluate — no Function/eval.
  const tokens = expression.match(/\d+\.?\d*|\.\d+|[+\-*/()]/g);
  if (!tokens) throw new Error("Empty expression.");
  // A number token may start with a digit (`5`, `1.5`) OR a leading decimal
  // point (`.5`, `.25`) — classify on the full numeric shape, not just `^\d`.
  const isNumber = (t: string): boolean => /^(?:\d+\.?\d*|\.\d+)$/.test(t);
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  const out: string[] = [];
  const ops: string[] = [];
  for (const t of tokens) {
    if (isNumber(t)) out.push(t);
    else if (t === "(") ops.push(t);
    else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") out.push(ops.pop() as string);
      if (ops.pop() !== "(") throw new Error("Mismatched parentheses.");
    } else {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) out.push(ops.pop() as string);
      ops.push(t);
    }
  }
  while (ops.length) {
    const op = ops.pop() as string;
    if (op === "(") throw new Error("Mismatched parentheses.");
    out.push(op);
  }
  const stack: number[] = [];
  for (const t of out) {
    if (isNumber(t)) stack.push(parseFloat(t));
    else {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error("Invalid expression.");
      stack.push(t === "+" ? a + b : t === "-" ? a - b : t === "*" ? a * b : a / b);
    }
  }
  if (stack.length !== 1) throw new Error("Invalid expression.");
  return stack[0];
}

/** Heuristic language guess for the translate skill's tool. */
function guessLanguage(text: string): string {
  if (/[一-鿿]/.test(text)) return "Chinese";
  if (/[぀-ヿ]/.test(text)) return "Japanese";
  if (/[가-힯]/.test(text)) return "Korean";
  if (/[Ѐ-ӿ]/.test(text)) return "Russian";
  if (/[áéíóúñ¿¡]/i.test(text)) return "Spanish";
  if (/[àâçéèêëîïôûù]/i.test(text)) return "French";
  return "English";
}

export class SkillsAgent extends AIChatAgent<Env> {
  /** The skill registry. Real, self-contained capability bundles. */
  private readonly skills: Skill[] = [
    {
      id: "summarize",
      description: "Condense provided text into a short bullet-point summary.",
      triggers: ["summarize", "summary", "tldr", "condense", "shorten"],
      system:
        "Active skill: SUMMARIZE. Condense the user's text into 3-5 tight bullet points. Lead with the single most important point.",
    },
    {
      id: "translate",
      description: "Translate text between languages; can detect the source language.",
      triggers: ["translate", "translation", "in spanish", "in french", "language"],
      system:
        "Active skill: TRANSLATE. Translate the user's text accurately. If the target language is ambiguous, ask once. Use the detectLanguage tool when the source language is unclear.",
      tools: {
        detectLanguage: tool({
          description: "Guess the language of a piece of text.",
          inputSchema: detectLanguageSchema,
          execute: async ({ text }) => ({ language: guessLanguage(text) }),
        }),
      },
    },
    {
      id: "calculate",
      description: "Evaluate safe arithmetic expressions exactly.",
      triggers: ["calculate", "calc", "compute", "math", "+", "*", "evaluate"],
      system:
        "Active skill: CALCULATE. For any arithmetic, call the calc tool and report the exact result. Never compute in your head.",
      tools: {
        calc: tool({
          description: "Evaluate a basic arithmetic expression exactly.",
          inputSchema: calcSchema,
          execute: async ({ expression }) => {
            try {
              return { expression, result: safeCalc(expression) };
            } catch (err) {
              return { expression, error: err instanceof Error ? err.message : String(err) };
            }
          },
        }),
      },
    },
  ];

  /** The default skill when nothing matches. */
  private readonly fallback: Skill = {
    id: "general",
    description: "General-purpose assistant with no specialized skill applied.",
    triggers: [],
    system: "No specialized skill matched. Answer helpfully as a general assistant.",
  };

  /** Docs metadata for the in-app `/docs/agents` viewer. */
  static docsMetadata() {
    return {
      name: "SkillsAgent",
      className: "SkillsAgent",
      description:
        "Skills demo. Maintains a registry of real skills (summarize, translate, calculate), selects one per turn via keyword match, and applies its system fragment + tools to the model call. Selection is observable in the response and via the selectSkill RPC.",
      docsPath: "/docs/agents/skills",
      methods: [
        { name: "onChatMessage", description: "Selects + applies a skill, then streams the result.", params: "onFinish", returns: "Response (streamed)" },
        { name: "listSkills", description: "Enumerate the skill registry.", params: "()", returns: "Promise<SkillDescriptor[]>" },
        { name: "selectSkill", description: "Preview which skill a message would activate.", params: "text: string", returns: "Promise<SkillDescriptor>" },
      ],
    };
  }

  /**
   * Select + apply a skill for the latest user turn, then stream the result.
   */
  async onChatMessage(onFinish: Parameters<AIChatAgent<Env>["onChatMessage"]>[0]) {
    const lastUserText = this.latestUserText();
    const skill = this.pickSkill(lastUserText);

    const system = `${skill.system}

(Skill selected by the SkillsAgent registry: "${skill.id}". The user does not need to know the internal mechanics, but you must behave according to the active skill.)`;

    const result = streamText({
      model: getChatModel(this.env),
      system,
      messages: await convertToModelMessages(this.messages as UIMessage[]),
      tools: skill.tools,
      stopWhen: stepCountIs(6),
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }

  /** Enumerate the skill registry (id, description, triggers). */
  @callable()
  async listSkills(): Promise<SkillDescriptor[]> {
    return this.skills.map((s) => ({
      id: s.id,
      description: s.description,
      triggers: s.triggers,
    }));
  }

  /**
   * Preview which skill a given message would activate — pure selection, no
   * model call. Useful for a UI that wants to label the active skill before
   * sending.
   *
   * @param text - The message text to classify.
   */
  @callable()
  async selectSkill(text: string): Promise<SkillDescriptor> {
    const s = this.pickSkill(text);
    return { id: s.id, description: s.description, triggers: s.triggers };
  }

  /** Keyword-match selection with explicit fallback. */
  private pickSkill(text: string): Skill {
    const lower = text.toLowerCase();
    for (const skill of this.skills) {
      if (skill.triggers.some((t) => lower.includes(t))) return skill;
    }
    return this.fallback;
  }

  /** Extract the plain text of the most recent user message. */
  private latestUserText(): string {
    const msgs = this.messages as UIMessage[];
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role !== "user") continue;
      const parts = (m.parts ?? []) as Array<{ type: string; text?: string }>;
      return parts
        .filter((p) => p.type === "text" && typeof p.text === "string")
        .map((p) => p.text as string)
        .join(" ");
    }
    return "";
  }
}
