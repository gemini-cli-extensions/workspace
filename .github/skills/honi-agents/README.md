# honi-skill

A Claude skill for building AI agents with [Honi](https://honi.dev) (`honidev`) on Cloudflare Workers.

Install this skill to give Claude deep knowledge of the Honi API — tools, memory tiers, MCP servers, multi-agent routing, and all supported providers.

## Install with OpenClaw

```bash
mkdir -p ~/clawd/skills/honi
curl -o ~/clawd/skills/honi/SKILL.md \
  https://raw.githubusercontent.com/stukennedy/honi/main/claude-skill/SKILL.md
```

OpenClaw will auto-discover the skill. Claude will use it whenever you ask it to build Honi agents.

## Install with Claude Code

```bash
# Copy into your project root as CLAUDE.md
curl -o CLAUDE.md \
  https://raw.githubusercontent.com/stukennedy/honi/main/claude-skill/SKILL.md
```

Or reference it from an existing `CLAUDE.md`:

```markdown
# My Project

@https://raw.githubusercontent.com/stukennedy/honi/main/claude-skill/SKILL.md
```

## What's Covered

- `createAgent` config — all options
- `tool()` helper — params, ToolContext, accessing env bindings
- HTTP API — `/chat`, `/history`, `/memory`, `/reset`, `/mcp`
- Streaming responses
- Memory tiers — working (DO), episodic (D1), semantic (Vectorize), graph (edgraph)
- Multi-agent routing — multiple agents in one Worker
- MCP server — local + remote auth via Bearer token
- All supported model providers and their env var names
- `wrangler.toml` bindings for each memory tier
- Common patterns — external API calls, D1 writes, graph memory

## Links

- **Docs:** [honi.dev](https://honi.dev)
- **npm:** [honidev](https://npmjs.com/package/honidev)
- **GitHub:** [stukennedy/honi](https://github.com/stukennedy/honi)
- **This skill:** [claude-skill/SKILL.md](https://github.com/stukennedy/honi/blob/main/claude-skill/SKILL.md)
