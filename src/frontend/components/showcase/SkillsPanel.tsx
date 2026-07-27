/**
 * @fileoverview Live interactive panel for the `skills-agent`.
 *
 * Shows the agent's skill registry from `@callable listSkills()`
 * (`[{ id, description, triggers }]`), a "match a skill" box that calls
 * `@callable selectSkill(text)` and highlights which skill was chosen, and a
 * chat thread where the agent applies the matched skill.
 *
 * Mounted with `client:only="react"` — browser-only agents stack.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ThreadProvider, type ThreadStatus } from "@/components/assistant/Thread";

import { ConnectionBadge, EmptyState, ErrorBanner, LoadingRow, useSessionId } from "./shared";
import { ShowcaseErrorBoundary } from "./ShowcaseErrorBoundary";

/** A registered skill from the agent's `listSkills()` RPC. */
interface Skill {
  id: string;
  description: string;
  triggers: string[];
}

/** Map a PartySocket `readyState` to the Thread's status vocabulary. */
function statusFromReadyState(readyState: number): ThreadStatus {
  if (readyState === 1) return "connected";
  if (readyState === 0) return "connecting";
  return "disconnected";
}

/** Suggested prompts that each activate a distinct skill. */
const WELCOME_SUGGESTIONS = [
  "Summarize: Durable Objects give you strongly consistent, single-instance state.",
  "Translate to French: Where is the nearest station?",
  "Calculate: (18 * 3) + 7 / 2",
];

/** Skills showcase: registry + matcher + chat. */
export function SkillsPanel() {
  const sessionId = useSessionId("skills");
  const agent = useAgent({ agent: "skills-agent", name: sessionId });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat);
  const status = statusFromReadyState(agent.readyState);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [probe, setProbe] = useState("");
  const [matching, setMatching] = useState(false);
  const [matched, setMatched] = useState<Skill | null>(null);

  /** Load the skill registry. */
  const loadSkills = useCallback(async () => {
    if (agent.readyState !== 1) return;
    setLoading(true);
    setError(null);
    try {
      const res = await agent.call<Skill[]>("listSkills");
      setSkills(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skills.");
    } finally {
      setLoading(false);
    }
  }, [agent]);

  useEffect(() => {
    if (status === "connected") void loadSkills();
  }, [status, loadSkills]);

  /** Ask the agent which skill matches a free-text prompt. */
  async function matchSkill() {
    if (!probe.trim()) return;
    setMatching(true);
    setError(null);
    try {
      const res = await agent.call<Skill>("selectSkill", [probe]);
      setMatched(res ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to match a skill.");
    } finally {
      setMatching(false);
    }
  }

  return (
    <ShowcaseErrorBoundary label="The skills panel hit an error.">
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Registry + matcher */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <CardTitle>Skill registry</CardTitle>
              <CardDescription>Live from <code className="text-primary">listSkills()</code></CardDescription>
            </div>
            <ConnectionBadge status={status} sessionId={sessionId} />
          </CardHeader>
          <CardContent className="space-y-3">
            <ErrorBanner message={error} />
            {loading && skills.length === 0 ? (
              <LoadingRow label="Loading skills…" />
            ) : skills.length === 0 ? (
              <EmptyState label="No skills registered." />
            ) : (
              <ul className="divide-y divide-border/40">
                {skills.map((skill) => (
                  <li
                    key={skill.id}
                    className={cn(
                      "flex flex-col gap-1.5 py-2.5",
                      matched?.id === skill.id && "rounded-md bg-primary/5 px-2 ring-1 ring-primary/30",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <code className="text-xs font-semibold text-primary">{skill.id}</code>
                      {matched?.id === skill.id && <Badge variant="default">matched</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">{skill.description}</p>
                    <div className="flex flex-wrap gap-1">
                      {skill.triggers.map((t) => (
                        <Badge key={t} variant="outline">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Match a skill</CardTitle>
            <CardDescription>
              Calls <code className="text-primary">selectSkill(text)</code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={probe}
                onChange={(e) => setProbe(e.target.value)}
                placeholder="e.g. translate this to French"
                onKeyDown={(e) => e.key === "Enter" && matchSkill()}
              />
              <Button size="sm" onClick={matchSkill} disabled={matching || status !== "connected"}>
                {matching ? "…" : "Match"}
              </Button>
            </div>
            {matched && (
              <div className="rounded-md bg-primary/5 px-3 py-2 text-xs ring-1 ring-primary/30">
                Selected <code className="font-semibold text-primary">{matched.id}</code> —{" "}
                {matched.description}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chat */}
      <Card className="flex h-[36rem] flex-col">
        <CardHeader className="pb-3">
          <CardTitle>Chat with skills</CardTitle>
          <CardDescription>
            The agent selects and applies a skill per message; replies render as markdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <ThreadProvider
            runtime={runtime}
            status={status}
            welcomeTitle="Pick a skill"
            welcomeSubtitle="Each message activates one skill — summarize, translate, or calculate. Try one:"
            welcomeSuggestions={WELCOME_SUGGESTIONS}
            placeholder="Ask anything — the agent picks a skill…"
          />
        </CardContent>
      </Card>
    </div>
    </ShowcaseErrorBoundary>
  );
}
