# Cloudflare Queues

## Overview

Cloudflare Queues is a flexible messaging queue that allows you to queue messages for asynchronous processing. Queues are great at decoupling components of applications, enabling batch processing, and buffering calls to downstream services.

## Core Concepts

### 1. **Queue**
A buffer or list that automatically scales as messages are written to it.

### 2. **Producers**
Workers or services that write messages to a queue using `queue.send()`.

### 3. **Consumers**
Workers that process messages from queues via a `queue()` handler.

### 4. **Messages**
Data payloads sent through queues (serializable JavaScript objects).

## Producer Example

\`\`\`typescript
interface Env {
  REQUEST_QUEUE: Queue;
}

export default {
  async fetch(request: Request, env: Env) {
    const log = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
    };

    await env.REQUEST_QUEUE.send(log);
    return new Response("Success!");
  },
};
\`\`\`

## Consumer Example

\`\`\`typescript
export default {
  async queue(batch: MessageBatch<any>, env: Env) {
    for (const message of batch.messages) {
      console.log("consumed:", JSON.stringify(message.body));
    }

    // Batch process to external API
    const response = await fetch(env.UPSTREAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': \`Bearer \${env.UPSTREAM_API_KEY}\`
      },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        batchSize: batch.messages.length,
        messages: batch.messages.map(m => m.body)
      })
    });

    if (!response.ok) {
      throw new Error(\`API error: \${response.status}\`);
    }
  },
};
\`\`\`

## Configuration

### wrangler.jsonc

\`\`\`json
{
  "queues": {
    "producers": [{
      "name": "request-queue",
      "binding": "REQUEST_QUEUE"
    }],
    "consumers": [{
      "name": "request-queue",
      "dead_letter_queue": "request-queue-dlq",
      "retry_delay": 300,
      "max_batch_size": 10,
      "max_batch_timeout": 5
    }]
  }
}
\`\`\`

## Consumer Concurrency

Consumer concurrency allows a consumer Worker to automatically scale out horizontally to keep up with the rate that messages are being written to a queue. This enables parallel processing of messages across multiple Worker instances.

## Pull-Based Consumers

Queues also supports pull-based consumers, which allow any HTTP-based client to consume messages from a queue over HTTP REST API. Useful for:
- Consuming from environments outside Cloudflare Workers
- Fine-grained control over consumption rate
- Integration with external systems

Pull consumers can now handle up to **5,000 messages/second per queue**.

\`\`\`bash
# Create queue with pull consumer
npx wrangler queues create my-queue
npx wrangler queues consumer http add my-queue

# Pull messages via API
curl "https://api.cloudflare.com/client/v4/accounts/\${CF_ACCOUNT_ID}/queues/\${QUEUE_ID}/messages/pull" \\
  -H "Authorization: Bearer \${API_TOKEN}" \\
  -H "Content-Type: application/json" \\
  -d '{ "visibility_timeout": 10000, "batch_size": 10 }'
\`\`\`

## Best Practices

1. **Use Dead Letter Queues**: Configure DLQs for failed messages
2. **Batch Processing**: Process messages in batches for efficiency
3. **Idempotent Consumers**: Design consumers to handle duplicate messages
4. **Retry Logic**: Configure appropriate retry delays and limits
5. **Monitor Queue Depth**: Use analytics to track queue backlog

## Use Cases

- **Decoupling Services**: Separate checkout from order fulfillment
- **Batch Processing**: Buffer and batch calls to downstream APIs
- **Rate Limiting**: Control the rate of requests to external services
- **Event Processing**: Asynchronous event handling and notifications
- **Web Crawling**: Queue URLs for parallel crawling (see Browser Run integration)

## Resources

- [Queues Documentation](https://developers.cloudflare.com/queues/)
- [Get Started Guide](https://developers.cloudflare.com/queues/get-started/)
- [Pull Consumers](https://developers.cloudflare.com/queues/configuration/pull-consumers/)
