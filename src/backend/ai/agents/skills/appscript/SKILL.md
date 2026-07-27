# Skill: bound-script-scaffold

Scaffold a container-bound Apps Script for a Doc/Sheet/Slide.

## When to use
The user asks to "add a script", "automate this sheet", or "add a macro/menu".

## Procedure
1. Identify the container file id (the Doc/Sheet/Slides the script binds to).
2. `createBoundScript(parentId, title)` to create the bound project.
3. `updateContent(scriptId, files)` with a `Code.gs` containing the requested
   function plus an `onOpen` trigger that adds a custom menu when relevant.
4. Optionally `run(scriptId, functionName)` to smoke-test (requires deployment).
5. Return the script project URL.

## Guardrails
- Keep `appsscript.json` manifest minimal; request only needed scopes.
- Never embed secrets in script source.

## References
- Apps Script API projects: https://developers.google.com/apps-script/api/reference/rest/v1/projects
