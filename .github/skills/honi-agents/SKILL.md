---
name: honi
description: Build AI agents with Honi (honidev) on Cloudflare Workers. Use when creating agents with tools, persistent memory, MCP servers, or multi-agent pipelines. Covers createAgent API, tool() helper, all memory tiers (working/episodic/semantic/graph), multi-agent routing, MCP auth, and all supported model providers.
---

# Honi — AI Agents on Cloudflare Workers

`honidev` is a TypeScript framework for building persistent AI agents on Cloudflare Workers using Durable Objects. Zero cold starts. Global edge deployment. Layered memory that survives across sessions.

## Installation

```bash
npm install honidev
# or
bun add honidev
```

## Minimal Agent

```typescript
// src/index.ts
import { createAgent, tool } from 'honidev'
import { z } from 'zod'

export const { Agent, handler } = createAgent({
  name: 'my-agent',
  model: 'claude-sonnet-4-5',
  system: 'You are a helpful assistant.',
  tools: [
    tool('get_weather', 'Get weather for a location', {
      location: z.string()
    }, async ({ location }) => {
      return { temp: 22, condition: 'sunny', location }
    })
  ]
})

export default handler
export class MyAgent extends Agent {}
```

```toml
# wrangler.toml
name = "my-agent"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "AGENT"
class_name = "MyAgent"

[[migrations]]
tag = "v1"
new_classes = ["MyAgent"]
```

## createAgent Config

```typescript
createAgent({
  name: string,                  // Worker name
  model: string,                 // Model ID (see providers below)
  system?: string,               // System prompt
  tools?: ToolDefinition[],      // Array of tool() calls
  binding?: string,              // DO binding name (default: "AGENT")
  maxSteps?: number,             // Tool loop limit (default: 10)
  memory?: MemoryConfig,         // Memory tier config (see Memory section)
  mcp?: McpConfig,               // MCP server config (see MCP section)
  observability?: ObservabilityConfig,
})
```

## tool() Helper

```typescript
import { tool } from 'honidev'
import { z } from 'zod'

const myTool = tool(
  'tool_name',
  'Description of what the tool does',
  {
    param1: z.string().describe('First param'),
    param2: z.number().optional(),
  },
  async ({ param1, param2 }, ctx) => {
    // ctx.env   → raw Worker env (access bindings, secrets)
    // ctx.graph → GraphMemory instance (if graph memory enabled)
    return { result: 'value' }
  }
)
```

The handler receives `(params, ctx?)`. The `ctx` argument is optional — tools without context still work fine.

## HTTP API

Every agent exposes:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/chat` | POST | Send a message, get a response |
| `/history` | GET | Retrieve conversation history |
| `/memory` | GET | Inspect current memory context |
| `/reset` | POST | Clear working memory |
| `/mcp` | POST | MCP JSON-RPC endpoint |

**Thread isolation via header or query param:**
```bash
curl -X POST https://my-agent.workers.dev/chat \
  -H "x-thread-id: user-123" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

## Streaming

```bash
curl -X POST https://my-agent.workers.dev/chat \
  -H "Accept: text/event-stream" \
  -d '{"message": "Tell me a story"}'
```

Returns Server-Sent Events. The client receives `data: {"type":"text","text":"..."}` chunks.

## Memory — Four Tiers

Honi has four memory tiers. Enable only what you need.

```typescript
memory: {
  working: true,        // Tier 1: Durable Object KV (always on)
  episodic: {           // Tier 2: D1 — conversation history
    enabled: true,
    dbBinding: 'DB',    // D1 binding name in wrangler.toml
    maxMessages: 50,
  },
  semantic: {           // Tier 3: Vectorize — semantic search
    enabled: true,
    indexBinding: 'VECTORIZE',
    aiBinding: 'AI',    // Workers AI for embeddings
    topK: 5,
  },
  graph: {              // Tier 4: edgraph — knowledge graph
    enabled: true,
    binding: 'EDGRAPH', // Service binding OR
    urlEnvVar: 'EDGRAPH_URL', // HTTP URL env var
    apiKeyEnvVar: 'EDGRAPH_API_KEY',
    graphId: 'my-graph',
    contextDepth: 1,    // BFS hops
    maxContextEntities: 5,
  }
}
```

**wrangler.toml for full memory stack:**
```toml
[[durable_objects.bindings]]
name = "AGENT"
class_name = "MyAgent"

[[migrations]]
tag = "v1"
new_classes = ["MyAgent"]

[[d1_databases]]
binding = "DB"
database_name = "my-agent-db"
database_id = "<YOUR_D1_ID>"

[[vectorize]]
binding = "VECTORIZE"
index_name = "my-agent-index"

[ai]
binding = "AI"

[[services]]
binding = "EDGRAPH"
service = "edgraph"
```

**Graph memory in tools:**
```typescript
tool('remember_person', 'Store a person in the knowledge graph', {
  name: z.string(),
  role: z.string(),
}, async ({ name, role }, ctx) => {
  await ctx.graph.addNode({ id: name, label: name, type: 'Person', properties: { role } })
  return { stored: true }
})
```

## Multi-Agent Orchestration

Route requests to specialised agents at the Worker level:

```typescript
// src/index.ts
import { createAgent } from 'honidev'

export const { Agent: SupportAgent, handler: supportHandler } = createAgent({
  name: 'support',
  model: 'claude-sonnet-4-5',
  system: 'You handle customer support queries.',
  binding: 'SUPPORT_DO',
  tools: [searchKnowledgeBase],
})

export const { Agent: AnalystAgent, handler: analystHandler } = createAgent({
  name: 'analyst',
  model: 'claude-sonnet-4-5',
  system: 'You analyse data and produce reports.',
  binding: 'ANALYST_DO',
  tools: [runQuery, generateChart],
})

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/support')) return supportHandler.fetch(request, env)
    if (url.pathname.startsWith('/analyst')) return analystHandler.fetch(request, env)
    return new Response('Not found', { status: 404 })
  }
}

export class SupportAgent extends SupportAgent {}
export class AnalystAgent extends AnalystAgent {}
```

```toml
[[durable_objects.bindings]]
name = "SUPPORT_DO"
class_name = "SupportAgent"

[[durable_objects.bindings]]
name = "ANALYST_DO"
class_name = "AnalystAgent"

[[migrations]]
tag = "v1"
new_classes = ["SupportAgent", "AnalystAgent"]
```

## MCP Server

Every agent exposes `/mcp` as an MCP JSON-RPC endpoint. Tools are automatically registered.

**Connect from Claude Desktop:**
```json
{
  "mcpServers": {
    "my-honi-agent": {
      "url": "https://my-agent.workers.dev/mcp"
    }
  }
}
```

**Add authentication for remote connections (recommended):**
```typescript
createAgent({
  // ...
  mcp: { secretEnvVar: 'MCP_SECRET' }
})
```

```bash
wrangler secret put MCP_SECRET
```

**Claude Desktop with auth:**
```json
{
  "mcpServers": {
    "my-honi-agent": {
      "url": "https://my-agent.workers.dev/mcp",
      "headers": { "Authorization": "Bearer your-secret" }
    }
  }
}
```

## Supported Models

| Prefix | Provider | Example |
|--------|----------|---------|
| `claude-*` | Anthropic | `claude-sonnet-4-5` |
| `gpt-*`, `o1`, `o3` | OpenAI | `gpt-4o` |
| `gemini-*` | Google | `gemini-2.5-flash-preview` |
| `groq/*` | Groq | `groq/llama-3.3-70b-versatile` |
| `deepseek-*` | DeepSeek | `deepseek-chat` |
| `mistral-*` | Mistral | `mistral-large-latest` |
| `grok-*` | xAI | `grok-2-latest` |
| `sonar*` | Perplexity | `sonar-pro` |
| `together/*` | Together AI | `together/meta-llama/Llama-3-70b` |
| `command-*` | Cohere | `command-r-plus` |
| `@cf/*` | Workers AI | `@cf/meta/llama-3.1-8b-instruct` |

Workers AI models require an `[ai]` binding in `wrangler.toml`. All other providers use their respective API key set via `wrangler secret`.

**Environment variable names:**
- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Google: `GOOGLE_AI_API_KEY`
- Groq: `GROQ_API_KEY`
- DeepSeek: `DEEPSEEK_API_KEY`
- Mistral: `MISTRAL_API_KEY`
- xAI: `XAI_API_KEY`
- Perplexity: `PERPLEXITY_API_KEY`
- Together: `TOGETHER_API_KEY`
- Cohere: `COHERE_API_KEY`

## Observability

```typescript
createAgent({
  // ...
  observability: {
    enabled: true,
    aiGatewaySlug: 'my-gateway',  // Cloudflare AI Gateway slug
    collectEvents: true,           // Log tool calls + responses
  }
})
```

## Common Patterns

### Tool that calls an external API

```typescript
tool('search_docs', 'Search documentation', {
  query: z.string(),
}, async ({ query }, ctx) => {
  const apiKey = (ctx.env as any).DOCS_API_KEY
  const res = await fetch(`https://api.example.com/search?q=${query}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  return res.json()
})
```

### Tool that writes to D1

```typescript
tool('save_note', 'Save a note to the database', {
  title: z.string(),
  content: z.string(),
}, async ({ title, content }, ctx) => {
  const db = (ctx.env as any).DB as D1Database
  await db.prepare('INSERT INTO notes (title, content) VALUES (?, ?)')
    .bind(title, content).run()
  return { saved: true }
})
```

### Tool that writes to graph memory

```typescript
tool('link_entities', 'Create a relationship between two entities', {
  fromId: z.string(),
  toId: z.string(),
  relation: z.string(),
}, async ({ fromId, toId, relation }, ctx) => {
  await ctx.graph.addEdge({ source: fromId, target: toId, label: relation })
  return { linked: true }
})
```

### Conditional memory based on content

The memory stack is write-through by default. To promote selectively, skip memory config and write to tiers manually in a tool or post-processing step. An evaluator / significance filter is on the roadmap.

## Project Layout

```
src/
  index.ts          # createAgent + export DO class + default handler
  agents/
    support.ts      # Specialist agent definitions
    analyst.ts
  tools/
    search.ts       # Tool definitions
    database.ts
wrangler.toml
package.json
```

## Quick Reference

| Task | Code |
|------|------|
| Create agent | `createAgent({ name, model, system, tools })` |
| Define tool | `tool(name, desc, schema, handler)` |
| Access env in tool | `(params, ctx) => ctx.env.MY_BINDING` |
| Access graph in tool | `(params, ctx) => ctx.graph.addNode(...)` |
| Thread isolation | `x-thread-id` header or `?threadId=` query param |
| View history | `GET /history?threadId=xyz` |
| Reset session | `POST /reset` |
| Enable episodic | `memory: { episodic: { enabled: true, dbBinding: 'DB' } }` |
| Enable semantic | `memory: { semantic: { enabled: true, indexBinding: 'VECTORIZE', aiBinding: 'AI' } }` |
| Enable graph | `memory: { graph: { enabled: true, binding: 'EDGRAPH', graphId: 'x' } }` |
| MCP auth | `mcp: { secretEnvVar: 'MCP_SECRET' }` |
| Stream response | `Accept: text/event-stream` on POST /chat |
