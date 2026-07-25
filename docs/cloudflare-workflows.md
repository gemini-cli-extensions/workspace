# Cloudflare Workflows

## Overview

Cloudflare Workflows provides durable execution capabilities for building reliable, multi-step applications on Cloudflare Workers. Workflows automatically retry failed tasks, persist state for minutes to weeks, and handle long-running background processes without infrastructure management.

## Key Features

- **Durable Multi-Step Execution**: No timeouts, steps persist across failures
- **Pause for External Events**: Wait for approvals, webhooks, or user actions
- **Automatic Retries**: Built-in error handling and retry logic
- **Built-in Observability**: Monitor and debug workflow executions
- **No Infrastructure**: Fully managed on Cloudflare's global network

## Core Concepts

### WorkflowEntrypoint

Base class for defining workflows:

\`\`\`typescript
import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

type Params = { name?: string };

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Workflow logic here
  }
}
\`\`\`

### Step API

The `step` object provides durable execution primitives:

#### step.do()
Executes code and persists the result. If interrupted, resumes from last successful step.

\`\`\`typescript
const data = await step.do("fetch data", async () => {
  const response = await fetch("https://api.example.com/data");
  return await response.json();
});
\`\`\`

#### step.sleep()
Pauses the workflow for a duration.

\`\`\`typescript
await step.sleep("pause", "20 seconds");
await step.sleep("wait for processing", "1 hour");
\`\`\`

#### step.waitForEvent()
Pauses until an external event is received.

\`\`\`typescript
const approval = await step.waitForEvent("wait for approval");
\`\`\`

## Complete Example

\`\`\`typescript
import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";

type Params = { imageUrl: string };

export class ImageProcessingWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    // Step 1: Fetch image from R2
    const image = await step.do("fetch from R2", async () => {
      const obj = await this.env.R2_BUCKET.get(event.payload.imageUrl);
      return await obj?.arrayBuffer();
    });

    // Step 2: Generate AI description
    const description = await step.do("generate description", async () => {
      const response = await this.env.AI.run(
        "@cf/meta/llama-3-8b-instruct",
        {
          messages: [{
            role: "user",
            content: "Describe this image"
          }]
        }
      );
      return response.result;
    });

    // Step 3: Wait for human approval
    await step.sleep("wait for review", "1 day");
    const approval = await step.waitForEvent("approval");

    if (approval.approved) {
      // Step 4: Publish
      await step.do("publish", async () => {
        await this.env.DB.prepare(
          "INSERT INTO images (url, description) VALUES (?, ?)"
        ).bind(event.payload.imageUrl, description).run();
      });
    }

    return { success: true, description };
  }
}
\`\`\`

## Step Retry Configuration

Configure retries for individual steps:

\`\`\`typescript
await step.do(
  "process data",
  {
    retries: {
      limit: 3,
      delay: "5 seconds",
      backoff: "linear" // or "exponential"
    }
  },
  async () => {
    // Processing logic
  }
);
\`\`\`

## Step Context

Access retry attempt number:

\`\`\`typescript
await step.do("my-step", async (ctx) => {
  // ctx.attempt is 1 on first try, 2 on first retry, etc.
  console.log(\`Attempt \${ctx.attempt}\`);
});
\`\`\`

## Workflows vs Agents

| Capability              | Agents                                   | Workflows                      |
|-------------------------|------------------------------------------|--------------------------------|
| Execution model         | Long-lived identity that wakes on events | Run to completion              |
| Real-time communication | WebSockets, HTTP streaming               | Not supported                  |
| State persistence       | Built-in SQL database                    | Step-level persistence         |
| Failure handling        | Application-defined                      | Automatic retries and recovery |
| External events         | Direct handling                          | Pause and wait for events      |
| User interaction        | Direct (chat, UI)                        | Through Agent callbacks        |

## When to Use Workflows

**Use Workflows for:**
- Data pipelines with multiple transformation steps
- Approval workflows with human-in-the-loop
- Scheduled tasks with complex retry logic
- Long-running background jobs (hours to days)
- Multi-step AI processing pipelines

**Use Agents for:**
- Chat and messaging applications
- Real-time collaborative features
- Quick API calls (<30 seconds)
- WebSocket-based interactions

**Use Agents + Workflows for:**
- Agent-initiated background processing
- Long-running AI tasks with progress updates
- Multi-day approval processes with agent notifications
- Complex orchestrations with real-time feedback

## AgentWorkflow Integration

The `AgentWorkflow` class extends Workflows with bidirectional Agent communication:

\`\`\`typescript
import { AgentWorkflow } from "agents/workflows";

export class MyAgentWorkflow extends AgentWorkflow {
  async run(event, step) {
    // Report progress to connected agents
    await this.reportProgress({ stage: "processing", percent: 50 });

    // Call agent RPC methods
    const result = await this.callAgent("myAgent", "processData", [data]);

    // Broadcast to WebSocket clients
    await this.broadcast({ type: "update", data: result });
  }
}
\`\`\`

## Best Practices

1. **Name Steps Clearly**: Use descriptive names for debugging
2. **Keep Steps Idempotent**: Steps may retry on failure
3. **Use Appropriate Timeouts**: Configure retry delays based on expected duration
4. **Monitor Workflow State**: Use built-in observability tools
5. **Handle Errors Gracefully**: Implement proper error handling in steps

## Resources

- [Workflows Documentation](https://developers.cloudflare.com/workflows/)
- [Get Started Guide](https://developers.cloudflare.com/workflows/get-started/guide/)
- [Dynamic Workflows](https://developers.cloudflare.com/dynamic-workers/usage/dynamic-workflows/)
- [Learning Path](https://developers.cloudflare.com/learning-paths/workflows-course/)
