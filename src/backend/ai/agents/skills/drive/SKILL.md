# Skill: organize-folders

Organize Drive files into a sensible folder structure.

## When to use
The user asks to "organize my Drive", "file these", or "make folders for X".

## Procedure
1. `listFiles` / `search` to enumerate the candidate files.
2. Propose a folder taxonomy (by project, type, or date) and confirm if unclear.
3. `createFolder(name, parentId?)` for each missing bucket.
4. `moveFile(fileId, folderId)` to relocate; `renameFile` to normalize names.
5. Report a tree of what moved where.

## Guardrails
- Never `deleteFile` during organization unless explicitly instructed.
- Verify a destination folder exists before moving into it.

## References
- Drive files.update (move): https://developers.google.com/drive/api/reference/rest/v3/files/update
