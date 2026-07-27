# Cloudflare Browser Run (Browser Rendering)

## Overview

Cloudflare Browser Run (formerly Browser Rendering) allows you to programmatically control headless Chrome instances running on Cloudflare's global network. Use it for browser automation, web scraping, testing, and content generation.

## Integration Methods

### Quick Actions (Simple HTTP Endpoints)

Simple, stateless browser tasks without code deployment:

- **/screenshot** - Capture screenshots
- **/pdf** - Generate PDFs
- **/markdown** - Extract clean markdown
- **/snapshot** - Take full page snapshots
- **/links** - Retrieve all links
- **/scrape** - Extract HTML elements
- **/json** - AI-powered structured data extraction
- **/content** - Fetch rendered HTML
- **/crawl** - Crawl multiple pages

### Browser Sessions (Direct Control)

For complex automation:
- **Puppeteer** - Full browser control within Workers
- **Playwright** - Cross-browser automation
- **CDP** - Chrome DevTools Protocol for any environment
- **Stagehand** - AI-driven element finding

## Quick Actions Examples

### Screenshot

\`\`\`bash
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/screenshot' \\
  -H 'Authorization: Bearer <apiToken>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "url": "https://example.com"
  }' \\
  --output "screenshot.png"
\`\`\`

### PDF Generation

\`\`\`bash
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/pdf' \\
  -H 'Authorization: Bearer <apiToken>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "url": "https://example.com",
    "gotoOptions": {
      "waitUntil": "networkidle2"
    }
  }' \\
  --output "page.pdf"
\`\`\`

### AI-Powered JSON Extraction

\`\`\`bash
curl -X POST 'https://api.cloudflare.com/client/v4/accounts/<accountId>/browser-rendering/json' \\
  -H 'Authorization: Bearer <apiToken>' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "url": "https://example.com/jobs/123",
    "prompt": "Extract the job title, company, salary, and requirements"
  }'
\`\`\`

## Puppeteer in Workers

### Setup

\`\`\`bash
npm install @cloudflare/puppeteer
\`\`\`

### wrangler.jsonc

\`\`\`json
{
  "name": "browser-worker",
  "main": "src/index.ts",
  "browser": {
    "binding": "BROWSER"
  }
}
\`\`\`

### Worker Code

\`\`\`typescript
import puppeteer from "@cloudflare/puppeteer";

export default {
  async fetch(request, env) {
    const browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();

    await page.goto("https://example.com");
    const title = await page.title();
    const screenshot = await page.screenshot();

    await browser.close();

    return new Response(screenshot, {
      headers: { "content-type": "image/png" }
    });
  }
};
\`\`\`

## CDP from External Environments

Connect to Browser Run from any Node.js environment:

\`\`\`javascript
const puppeteer = require("puppeteer-core");

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;

const browserWSEndpoint = \`wss://api.cloudflare.com/client/v4/accounts/\${ACCOUNT_ID}/browser-rendering/devtools/browser?keep_alive=600000\`;

async function main() {
  const browser = await puppeteer.connect({
    browserWSEndpoint,
    headers: {
      Authorization: \`Bearer \${API_TOKEN}\`,
    },
  });

  const page = await browser.newPage();
  await page.goto("https://developers.cloudflare.com");

  const title = await page.title();
  console.log(\`Page title: \${title}\`);

  await page.screenshot({ path: "screenshot.png" });
  await browser.close();
}

main().catch(console.error);
\`\`\`

## Advanced Features

### Custom HTML Rendering

\`\`\`typescript
await page.setContent(\`
  <!DOCTYPE html>
  <html>
    <head><style>body { font-family: Arial; }</style></head>
    <body><h1>Generated Document</h1></body>
  </html>
\`);

const pdf = await page.pdf({ printBackground: true });
\`\`\`

### Resource Blocking

\`\`\`bash
curl -X POST '.../pdf' \\
  -d '{
    "url": "https://example.com",
    "rejectResourceTypes": ["image", "stylesheet"],
    "gotoOptions": { "waitUntil": "networkidle2" }
  }'
\`\`\`

### Viewport Configuration

\`\`\`typescript
await page.setViewport({
  width: 1920,
  height: 1080,
  deviceScaleFactor: 2
});
\`\`\`

## Integration with Queues

Web crawling with parallel processing:

\`\`\`typescript
interface Env {
  CRAWLER_QUEUE: Queue<{ url: string }>;
  CRAWLER_BROWSER: BrowserWorker;
}

export default {
  // Producer: Submit URLs
  async fetch(req, env) {
    await env.CRAWLER_QUEUE.send({
      url: await req.text()
    });
    return new Response("Queued!");
  },

  // Consumer: Crawl with Puppeteer
  async queue(batch, env) {
    const browser = await puppeteer.launch(env.CRAWLER_BROWSER);

    for (const message of batch.messages) {
      const page = await browser.newPage();
      await page.goto(message.body.url);

      const screenshot = await page.screenshot();
      await env.CRAWLER_SCREENSHOTS_KV.put(
        message.body.url,
        screenshot
      );

      await page.close();
    }

    await browser.close();
  }
};
\`\`\`

## Local Development

Browser Run supports local development:

\`\`\`bash
npx wrangler dev
\`\`\`

This spins up a browser on your local machine for testing before deployment.

## Best Practices

1. **Reuse Browser Instances**: Launch once per batch, reuse across pages
2. **Set Appropriate Timeouts**: Use \`gotoOptions.waitUntil\` and \`timeout\`
3. **Handle Errors**: Wrap browser operations in try-catch
4. **Close Resources**: Always close pages and browsers
5. **Use Quick Actions**: For simple tasks, Quick Actions are faster than full Puppeteer
6. **Monitor Usage**: Track Browser Run usage in dashboard or via API

## Use Cases

- **Web Scraping**: Extract data from dynamic websites
- **PDF Generation**: Convert HTML to PDFs for reports
- **Screenshot Automation**: Generate previews and thumbnails
- **Testing**: Automated browser testing
- **AI Agents**: Browser control for autonomous agents
- **Content Archival**: Capture full page snapshots

## Resources

- [Browser Run Documentation](https://developers.cloudflare.com/browser-run/)
- [Quick Actions Reference](https://developers.cloudflare.com/browser-run/quick-actions/)
- [Puppeteer Guide](https://developers.cloudflare.com/browser-run/puppeteer/)
- [CDP Integration](https://developers.cloudflare.com/browser-run/cdp/)
- [API Reference](https://developers.cloudflare.com/api/resources/browser_rendering/)
