# Agent Meta-Maintenance Rules

## Keep Documentation Current

As an agent working on this codebase, you are responsible for maintaining the accuracy of `AGENTS.md` and all files in `.agent/rules/`.

### When to Update Documentation

Update agent documentation when you:

- Add new features, APIs, or architectural patterns
- Modify existing features in ways that change how agents should interact with them
- Discover that existing rules are outdated, incorrect, or incomplete
- Introduce new conventions, utilities, or best practices
- Find conflicting or duplicate guidance

### What to Update

**AGENTS.md**

- High-level mandatory directives (numbered list)
- Quick reference for critical rules
- Pointers to detailed `.agent/rules` files

**.agent/rules/ files**

- Detailed implementation guidelines
- Examples and anti-patterns
- Technical specifications
- Scripts and commands

## File Size Limits

The `.agent/rules/` directory is consumed by Antigravity. Each file has a **maximum limit of 12,000 characters**.

### Keep Rules Concise

- Remove redundant explanations
- Use bullet points instead of paragraphs
- Link between files rather than duplicating content
- Archive obsolete rules instead of accumulating them

### Check File Size

```bash
wc -c .agent/rules/*.md
```

If a file exceeds 11,000 characters, consider splitting it or condensing content.

## Avoid Duplication and Conflicts

### Before Adding a Rule

1. Search existing `.agent/rules/` files for similar guidance
2. If the topic exists, update the existing file instead of creating a new one
3. If you create a new file, reference it from related files

### Resolve Conflicts

If you find contradictory guidance:

1. Determine which rule is correct based on current codebase state
2. Update or remove the incorrect rule
3. Consolidate related rules if they're scattered

### Cross-Reference

Use clear pointers between files:

```markdown
For database schema organization, see `.agent/rules/architecture.md`.
```

## Update Frequency

Update documentation:

- **During your turn** if you modify behavior covered by existing rules
- **After implementing** new features that future agents will interact with
- **When reviewing** code and discovering outdated guidance

Do NOT wait for a separate "documentation pass" — keep docs in sync with code.

## Example Workflow

1. Agent implements a new `/api/webhooks` route
2. Agent adds docstrings to the webhook handler files
3. Agent updates `.agent/rules/architecture.md` to mention webhook patterns
4. Agent adds item 17 to `AGENTS.md` if webhooks require special handling
5. Agent checks file sizes and consolidates if needed

## Rationale

Accurate, concise, and non-duplicated documentation:

- Reduces token consumption for future agents
- Prevents conflicting instructions that cause errors
- Ensures agents operate with correct, up-to-date context
- Makes the template easier to use for both AI and human developers
