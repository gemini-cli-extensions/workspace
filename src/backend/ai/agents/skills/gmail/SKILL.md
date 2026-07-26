# Skill: triage-and-label

Triage an inbox and apply consistent labels so the user can act fast.

## When to use
The user asks to "clean up", "triage", "organize my inbox", or to label/sort
unread mail.

## Procedure
1. `searchMessages` with `is:unread newer_than:7d` (cap `maxResults` at 50).
2. For each message, infer intent from sender + subject:
   - action required → label `Action`
   - newsletters / marketing → label `Newsletters`
   - receipts / orders → label `Receipts`
3. Ensure each target label exists via `listLabels`; `createLabel` if missing.
4. Apply with `modifyMessageLabels(id, add, remove)`. Remove `UNREAD` only when
   the user explicitly asks to mark-as-read.
5. Summarize counts per label and list anything that needs a human decision.

## Guardrails
- Never delete or trash mail during triage unless explicitly told to.
- Prefer additive labeling; do not remove existing user labels.

## References
- Gmail search operators: https://support.google.com/mail/answer/7190
