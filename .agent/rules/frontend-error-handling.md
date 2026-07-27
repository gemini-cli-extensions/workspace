# Frontend Error Handling Rules

- Never use browser `alert()`, `confirm()`, or `prompt()` in this template.
- Never rely on `console.log` alone for frontend error reporting.
- Every frontend error path, including `catch (error)` blocks and copy-to-clipboard failures, must go through the centralized error handling utility.
- The centralized utility must:
  - log the full structured payload with `console.error`,
  - show the user a shadcn-based error surface,
  - provide a copy-to-clipboard action with shadcn UI feedback only, and
  - include page URL, source filenames, function metadata, friendly error text, and the full server error payload in the copied fix prompt.
