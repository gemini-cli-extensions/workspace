/**
 * @fileoverview AssistantModal — a floating "Ask AI" button that opens the
 * enhanced single-thread {@link Thread} in a base-ui Dialog.
 *
 * Used on the homepage. A single ChatBroker DO conversation is keyed by a
 * per-browser-session id (persisted in `sessionStorage`), so re-opening the
 * modal resumes the same conversation. Showcases markdown, suggestions, and the
 * generative-UI tool cards in a compact surface.
 *
 * The runtime is only created while the dialog has been opened at least once
 * (we keep it mounted thereafter so history survives close/re-open within the
 * page session). Mount `client:only="react"`.
 */

"use client";

import * as React from "react";

import { SparklesIcon } from "lucide-react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ThreadProvider, type ThreadStatus } from "./Thread";

/** Resolve (and persist) a stable per-session ChatBroker id for the modal. */
function useModalSessionId(): string {
  return React.useState(() => {
    if (typeof window === "undefined") return "assistant-modal-ssr";
    const stored = window.sessionStorage.getItem("assistant-modal-session");
    if (stored) return stored;
    const fresh = `assistant-modal-${crypto.randomUUID()}`;
    window.sessionStorage.setItem("assistant-modal-session", fresh);
    return fresh;
  })[0];
}

/** Map PartySocket `readyState` to a {@link ThreadStatus}. */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

/**
 * The live chat surface. Split out so the `useAgent` WebSocket only opens once
 * the modal has been activated (kept mounted afterwards).
 */
function ModalChat() {
  const sessionId = useModalSessionId();
  const agent = useAgent({ agent: "chat-broker", name: sessionId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  return (
    <ThreadProvider
      runtime={runtime}
      status={status}
      welcomeTitle="Ask AI"
      welcomeSubtitle="I can answer questions, render a metric card, or draft a task."
      placeholder="Ask anything about this app…"
    />
  );
}

/**
 * Floating assistant button + dialog. Drop once near the end of a page.
 */
export function AssistantModal() {
  const [open, setOpen] = React.useState(false);
  const [activated, setActivated] = React.useState(false);

  React.useEffect(() => {
    if (open) setActivated(true);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        size="lg"
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-5 z-40 gap-2 rounded-full bg-orange-600 px-5 shadow-lg shadow-orange-950/40 hover:bg-orange-700"
        aria-label="Ask AI"
      >
        <SparklesIcon className="size-4" />
        Ask AI
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex h-[min(80vh,640px)] max-w-xl flex-col gap-0 overflow-hidden p-0"
          showClose
        >
          <DialogHeader className="border-b border-border/30 px-5 py-4">
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-4 text-orange-500" />
              Assistant
            </DialogTitle>
            <DialogDescription>
              Powered by the ChatBroker Durable Object over a WebSocket channel.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1">
            {/* Only mount the live chat (and its WebSocket) once activated.
                Before that, a static placeholder — `<Thread />` requires a
                runtime provider, so we never render it bare. */}
            {activated ? (
              <ModalChat />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Connecting…
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
