/**
 * @fileoverview ConfigSpaceManager — Per-agent runtime configuration editor.
 *
 * Reads and writes per-agent runtime configuration (model id, temperature,
 * system prompt) against the `global_config` D1 table via the public
 * `/api/config/{key}` Hono endpoints. Keys follow the convention
 * `agent_config_<snake_case_agent_name>`.
 *
 * Themed with the Monolith profile: dark by default, shadcn Card primitives
 * (which use ring-based separation rather than traditional borders), path
 * alias imports through `@/components/...`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

const AGENTS = [
  { id: "chat_broker", label: "ChatBroker", binding: "CHAT_BROKER" },
  { id: "code_mode", label: "CodeModeAgent", binding: "CODE_MODE_AGENT" },
  { id: "browser_hitl", label: "BrowserHitlAgent", binding: "BROWSER_HITL_AGENT" },
  { id: "workflows", label: "WorkflowsAgent", binding: "WORKFLOWS_AGENT" },
  { id: "artifact", label: "ArtifactAgent", binding: "ARTIFACT_AGENT" },
  { id: "notifications", label: "NotificationsAgent", binding: "NOTIFICATIONS_AGENT" },
] as const;

const DEFAULT_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.1-8b-instruct",
];

type AgentId = (typeof AGENTS)[number]["id"];

type AgentRuntimeConfig = {
  model: string;
  temperature: number;
  systemPrompt: string;
};

const EMPTY: AgentRuntimeConfig = {
  model: DEFAULT_MODELS[0],
  temperature: 0.4,
  systemPrompt: "",
};

function configKey(agent: AgentId) {
  return `agent_config_${agent}`;
}

export function ConfigSpaceManager() {
  const [activeAgent, setActiveAgent] = useState<AgentId>(AGENTS[0].id);
  const [configByAgent, setConfigByAgent] = useState<Record<AgentId, AgentRuntimeConfig>>(
    Object.fromEntries(AGENTS.map((a) => [a.id, EMPTY])) as Record<AgentId, AgentRuntimeConfig>,
  );
  const [savingAgent, setSavingAgent] = useState<AgentId | null>(null);
  const [errorByAgent, setErrorByAgent] = useState<Record<AgentId, string | null>>(
    Object.fromEntries(AGENTS.map((a) => [a.id, null])) as Record<AgentId, string | null>,
  );

  const current = configByAgent[activeAgent];

  const loadAgent = useCallback(async (agent: AgentId) => {
    try {
      const res = await fetch(`/api/config/${configKey(agent)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setConfigByAgent((prev) => ({ ...prev, [agent]: EMPTY }));
        return;
      }
      const row = (await res.json()) as { value?: unknown };
      const value = row?.value;
      if (value && typeof value === "object") {
        const v = value as Partial<AgentRuntimeConfig>;
        setConfigByAgent((prev) => ({
          ...prev,
          [agent]: {
            model: typeof v.model === "string" ? v.model : EMPTY.model,
            temperature:
              typeof v.temperature === "number" ? v.temperature : EMPTY.temperature,
            systemPrompt:
              typeof v.systemPrompt === "string" ? v.systemPrompt : EMPTY.systemPrompt,
          },
        }));
      }
    } catch (error) {
      setErrorByAgent((prev) => ({
        ...prev,
        [agent]: error instanceof Error ? error.message : "Failed to load",
      }));
    }
  }, []);

  useEffect(() => {
    AGENTS.forEach((a) => void loadAgent(a.id));
  }, [loadAgent]);

  const saveActive = useCallback(async () => {
    setSavingAgent(activeAgent);
    setErrorByAgent((prev) => ({ ...prev, [activeAgent]: null }));
    try {
      const res = await fetch(`/api/config/${configKey(activeAgent)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: current }),
      });
      if (!res.ok) {
        throw new Error(`PUT failed: ${res.status}`);
      }
    } catch (error) {
      setErrorByAgent((prev) => ({
        ...prev,
        [activeAgent]: error instanceof Error ? error.message : "Save failed",
      }));
    } finally {
      setSavingAgent(null);
    }
  }, [activeAgent, current]);

  const update = useCallback(
    (patch: Partial<AgentRuntimeConfig>) => {
      setConfigByAgent((prev) => ({
        ...prev,
        [activeAgent]: { ...prev[activeAgent], ...patch },
      }));
    },
    [activeAgent],
  );

  const agentList = useMemo(() => AGENTS, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Config Space</CardTitle>
        <CardDescription>
          Per-agent runtime configuration — model, temperature, system prompt. Persisted
          to the global_config table; agents read these values at request time.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex flex-col gap-1" aria-label="Agents">
          {agentList.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActiveAgent(a.id)}
              data-active={a.id === activeAgent}
              className="flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 data-[active=true]:bg-muted data-[active=true]:text-foreground text-muted-foreground"
            >
              <span>{a.label}</span>
              {errorByAgent[a.id] ? (
                <Badge variant="destructive" className="ml-2 text-xs">
                  err
                </Badge>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className="text-base font-medium">
                {agentList.find((a) => a.id === activeAgent)?.label}
              </p>
              <p className="text-xs text-muted-foreground">
                Binding:{" "}
                <code className="text-xs">
                  {agentList.find((a) => a.id === activeAgent)?.binding}
                </code>
              </p>
            </div>
            <Button
              onClick={saveActive}
              disabled={savingAgent !== null}
              size="sm"
            >
              {savingAgent === activeAgent ? "Saving…" : "Save"}
            </Button>
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              list={`models-${activeAgent}`}
              value={current.model}
              onChange={(e) => update({ model: e.target.value })}
              spellCheck={false}
            />
            <datalist id={`models-${activeAgent}`}>
              {DEFAULT_MODELS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="temperature">
              Temperature ({current.temperature.toFixed(2)})
            </Label>
            <Input
              id="temperature"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={current.temperature}
              onChange={(e) =>
                update({ temperature: Number.parseFloat(e.target.value) })
              }
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemPrompt">System Prompt</Label>
            <Textarea
              id="systemPrompt"
              rows={6}
              value={current.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              placeholder="Leave blank to use the agent's built-in default."
            />
          </div>

          {errorByAgent[activeAgent] ? (
            <p className="text-sm text-destructive">{errorByAgent[activeAgent]}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
