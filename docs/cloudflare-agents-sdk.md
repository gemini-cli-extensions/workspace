# Cloudflare Agents SDK

## Overview

The Agents SDK allows you to build stateful AI agents on Cloudflare using Durable Objects. Each agent runs as a micro-server with its own SQL database, WebSocket connections, and scheduling capabilities.

## Key Concepts

### Agent Architecture
- **Agent**: A TypeScript class extending `Agent<Env>` from the `agents` package
- **Durable Object**: Each agent instance runs on a Durable Object with persistent state
- **RPC Methods**: Methods decorated with `@callable()` are exposed as RPC endpoints
- **WebSockets**: Built-in support for real-time bidirectional communication
- **State Persistence**: Each agent has its own SQLite database via `this.sql`

### Core Features
1. **Callable Methods**: Decorate methods with `@callable()` to expose them as RPC endpoints
2. **State Management**: Access agent state via `this.state` (lazy-loaded from SQLite)
3. **Environment Bindings**: Access Worker bindings via `this.env`
4. **MCP Integration**: Connect to MCP servers via `this.mcp`
5. **WebSocket Support**: Handle real-time connections with `@websocket()` decorator

## Agent Properties

Available on `this` inside any Agent method:

| Property | Type | Description |
|----------|------|-------------|
| `this.name` | string | The instance name of this agent |
| `this.state` | State | Current agent state (lazy-loaded from SQLite) |
| `this.env` | Env | Worker environment bindings |
| `this.ctx` | DurableObjectState | Durable Object context (storage, alarms, etc.) |
| `this.sql` | template tag | SQL template tag for queries |
| `this.mcp` | MCPClientManager | MCP client manager |

## Basic Example

\`\`\`typescript
import { Agent, callable } from "agents";

export class MyAgent extends Agent<Env> {
  @callable()
  async sayHello(name: string): Promise<string> {
    return \`Hello, \${name}!\`;
  }

  @callable()
  async saveData(key: string, value: string): Promise<void> {
    await this.sql\`INSERT INTO data (key, value) VALUES (\${key}, \${value})\`;
  }
}

// In your Worker
export default {
  async fetch(request, env) {
    const stub = env.MY_AGENT.getByName("user-123");
    const greeting = await stub.sayHello("Alice");
    return new Response(greeting);
  },
};
\`\`\`

## RPC vs Fetch Handler

**Use RPC methods** (recommended for compatibility_date >= 2024-04-03):
- More ergonomic API
- Better type safety
- Automatic TypeScript support
- No manual request/response parsing

**Avoid fetch() handler**:
- Legacy approach
- Requires manual parsing
- Less type-safe

## MCP Integration

The Agents SDK supports Model Context Protocol (MCP) for connecting agents to external tools and data sources.

### RPC Transport

Connect agents to MCP servers within the same Worker using RPC (no HTTP overhead):

\`\`\`typescript
import { Agent } from "agents";

export class MyAgent extends Agent<Env> {
  async onStart() {
    // Connect via DO binding - no HTTP, no network overhead
    await this.addMcpServer("counter", this.env.MY_MCP);

    // With props for per-user context
    await this.addMcpServer("counter", this.env.MY_MCP, {
      props: { userId: "user-123", role: "admin" },
    });
  }
}
\`\`\`

### Benefits of RPC Transport
- **Faster**: No network overhead, direct function calls
- **Simpler**: No HTTP endpoints, no connection management
- **Internal only**: Perfect for agents calling MCP servers within the same Worker

## Client SDKs

### Browser Connections
- **Vanilla JS**: `AgentClient` from `agents/client`
- **React**: `useAgent` hook from `agents/react`

### Method Calls

Using `call()`:
\`\`\`typescript
const result = await agent.call("getUser", [userId]);
const result = await agent.call("createPost", [title, content, tags]);
\`\`\`

Using the stub proxy (cleaner syntax):
\`\`\`typescript
const user = await agent.stub.getUser("user-123");
const post = await agent.stub.createPost(title, content, tags);
\`\`\`

## AgentWorkflow Integration

The `AgentWorkflow` class from the Agents SDK extends Cloudflare Workflows with bidirectional Agent communication. Your Workflow can report progress, broadcast to WebSocket clients, and call Agent methods via RPC.

See [Workflows documentation](./cloudflare-workflows.md) for more details on durable execution patterns.

## Best Practices

1. **Use RPC methods instead of fetch()** - Better type safety and ergonomics
2. **Define stable names** - Route requests to named instances (e.g., user IDs)
3. **Leverage Durable Objects** - Each agent is stateful with its own database
4. **Use MCP for extensibility** - Connect agents to external tools and services
5. **Think in terms of identities** - Give each real-world thing a stable name

## Resources

- [Agents SDK Documentation](https://developers.cloudflare.com/agents/)
- [Agents SDK GitHub](https://github.com/cloudflare/agents)
- [Durable Objects Best Practices](https://developers.cloudflare.com/durable-objects/best-practices/)
- [Workers RPC](https://developers.cloudflare.com/workers/runtime-apis/rpc/)
