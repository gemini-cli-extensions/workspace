/**
 * @fileoverview Multi-thread assistant-ui runtime wired to the ChatBroker DO.
 *
 * ## Path shipped: persistent thread index + REAL per-thread Cloudflare Agent
 *
 * We use `useRemoteThreadListRuntime({ adapter: threadListAdapter, runtimeHook })`.
 * The thread INDEX (list / create / rename / archive / delete / titles) is
 * PERSISTED in the `chat_threads` D1 table via the {@link threadListAdapter}
 * (backed by `/api/threads`). The MESSAGES for each thread live server-side:
 * `runtimeHook` connects the *currently active* thread to its own `ChatBroker`
 * Durable Object instance. The adapter's `remoteId` IS both the D1 row id and
 * the DO `name`, so metadata and message log stay linked.
 *
 * The key mechanic: `useRemoteThreadListRuntime` renders `runtimeHook` once per
 * active thread, each inside a `ThreadListItemRuntimeProvider`. So inside the
 * hook we read the active thread's stable id via `useThreadListItem((s) => s.id)`
 * and pass it as the `name` to `useAgent({ agent: "chat-broker", name: threadId })`.
 * Because each distinct `name` is a distinct DO instance (keyed by `idFromName`),
 * each thread is a distinct, server-persisted conversation. Switching threads
 * remounts the hook with a different id → reconnects to that DO → its history
 * rehydrates. The thread list itself survives reloads because it lives in D1.
 *
 * Browser-only: consumers mount `client:only="react"`.
 */

"use client";

import { type PropsWithChildren } from "react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";

import {
  AssistantRuntimeProvider,
  useRemoteThreadListRuntime,
  useThreadListItem,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { threadListAdapter } from "./threadListAdapter";

/**
 * Per-thread runtime hook. Called once per active thread by
 * `useRemoteThreadListRuntime`, inside that thread's
 * `ThreadListItemRuntimeProvider`, so `useThreadListItem` resolves the active
 * thread's id here.
 *
 * The id is used as the ChatBroker DO `name`, making each thread a distinct,
 * server-persisted conversation.
 */
function useChatBrokerThreadRuntime(): AssistantRuntime {
  // Stable local thread id from the InMemoryThreadListAdapter. This is the DO
  // routing key. Falls back to a constant before the provider resolves (which
  // only happens on the very first commit of a brand-new thread).
  const threadId = useThreadListItem((s) => s.id) || "chat-broker-default";

  const agent = useAgent({ agent: "chat-broker", name: threadId });
  const chat = useAgentChat({ agent });
  // `useAISDKRuntime` returns an `AssistantRuntime` typed against a slightly
  // older `@assistant-ui/core` than the one `useRemoteThreadListRuntime`
  // consumes (the same benign skew bridged in `AgentChat.tsx`). The cast keeps
  // the structurally-identical runtimes converging.
  return useAISDKRuntime(chat) as unknown as AssistantRuntime;
}

/**
 * Provider mounting the multi-thread runtime. Wrap the workspace
 * (`ThreadList` + `Thread`) with this so both the list and the active thread
 * share one runtime.
 */
export function MultiThreadRuntimeProvider({ children }: PropsWithChildren) {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: useChatBrokerThreadRuntime,
    adapter: threadListAdapter,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
