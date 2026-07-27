/**
 * @fileoverview Human-in-the-loop approval gate for the browser-hitl showcase.
 *
 * Scans the live `useAgentChat` message list for tool-call parts that are
 * awaiting approval (`state === "approval-requested"`, exposed by
 * `getToolPartState`), and renders an Approve / Reject control for each.
 * Responding calls `chat.addToolApprovalResponse({ id, approved })`, which the
 * SDK forwards to the Durable Object so the paused tool resumes (or is denied).
 *
 * This is the load-bearing feature of the browser-hitl page: dangerous tools
 * (`fillSecureForm`, `clickElement`) cannot run until a human approves them.
 */

"use client";

import { isToolUIPart } from "ai";
import { getToolApproval, getToolInput, getToolPartState } from "@cloudflare/ai-chat/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { EmptyState } from "./shared";

/** A message part as exposed by `useAgentChat().messages`. */
type MessagePart = Parameters<typeof getToolApproval>[0];

/** Minimal message shape we read from `useAgentChat().messages`. */
interface ChatMessageLike {
  parts: MessagePart[];
}

/** A single pending approval surfaced to the user. */
interface PendingApproval {
  approvalId: string;
  toolName: string;
  input: unknown;
}

/** Extract every tool part currently awaiting human approval. */
function collectPending(messages: ChatMessageLike[]): PendingApproval[] {
  const out: PendingApproval[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolPartState(part) !== "waiting-approval") continue;
      const approval = getToolApproval(part);
      if (!approval?.id) continue;
      out.push({
        approvalId: approval.id,
        // Tool UI part type is `tool-${name}`.
        toolName: typeof part.type === "string" ? part.type.replace(/^tool-/, "") : "tool",
        input: getToolInput(part),
      });
    }
  }
  return out;
}

/** Props for {@link ApprovalGate}. */
export interface ApprovalGateProps {
  messages: ChatMessageLike[];
  /** `chat.addToolApprovalResponse` from `useAgentChat`. */
  respond: (args: { id: string; approved: boolean }) => void;
}

/**
 * Renders the queue of pending tool approvals with Approve / Reject actions.
 */
export function ApprovalGate({ messages, respond }: ApprovalGateProps) {
  const pending = collectPending(messages);

  if (pending.length === 0) {
    return <EmptyState label="No actions awaiting approval. Ask the agent to fill a form or click an element." />;
  }

  return (
    <div className="space-y-3">
      {pending.map((p) => (
        <div
          key={p.approvalId}
          className="rounded-md bg-amber-500/5 p-3 ring-1 ring-amber-500/30"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <code className="text-xs font-semibold text-amber-400">{p.toolName}()</code>
            <Badge variant="outline">needs approval</Badge>
          </div>
          <pre className="mb-3 overflow-x-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
            <code>{JSON.stringify(p.input, null, 2)}</code>
          </pre>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => respond({ id: p.approvalId, approved: true })}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => respond({ id: p.approvalId, approved: false })}
            >
              Reject
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
