# PR: Improve Headless/Remote VM Authentication Experience

## Summary

This PR improves the authentication experience for users running the Google Workspace MCP server in headless or remote VM environments where traditional browser-based OAuth flows don't work well.

## Problem

When running the MCP server in a VM/headless environment:
1. **stdout pollution**: Auth messages were printed to `stdout`, breaking MCP clients that expect only JSON-RPC
2. **Stuck terminal**: When browser launch fails, the callback server waits forever for a redirect that never comes
3. **Poor manual flow UX**: The credentials page lacked clear instructions for different operating systems

## Changes

### 1. Redirect Auth Messages to stderr
**Files:** `workspace-server/src/utils/open-wrapper.ts`, `workspace-server/src/auth/AuthManager.ts`

- Changed `console.log` to `console.error` for all auth-related messages
- Auth URL is now always printed to stderr immediately (visible to users)
- Keeps stdout clean for MCP JSON-RPC protocol

### 2. Add `GEMINI_CLI_WORKSPACE_HEADLESS` Environment Variable
**Files:** `workspace-server/src/utils/secure-browser-launcher.ts`, `workspace-server/src/auth/AuthManager.ts`

New environment variable for headless environments with port-forwarding:

```python
env = {
  "GEMINI_CLI_WORKSPACE_HEADLESS": "true",
  "OAUTH_CALLBACK_PORT": "8585"
}
```

**Behavior:**
- Prints auth URL to stderr (no browser launch attempt)
- OAuth callback server still runs for redirect
- Port-forwarding instructions printed to help remote users

### 3. Improved Manual Flow Instructions
**Files:** `cloud_function/index.js`

Enhanced the "Success! Credentials Ready" page with:
- **Linux CLI instructions** (expanded by default) - `secret-tool` command for remote VMs
- **macOS instructions** - Keychain Access step-by-step
- **Windows instructions** - Credential Manager step-by-step
- Collapsible sections for each OS
- Clear "restart your MCP server" instruction

## Usage

### Option A: Headless Mode with Port-Forwarding

```python
from mcp import StdioServerParameters

server_params = StdioServerParameters(
  command = "npx",
  args = ["-y", "github:philschmid/workspace"],
  env = {
    "GEMINI_CLI_WORKSPACE_HEADLESS": "true",
    "OAUTH_CALLBACK_PORT": "8585"
  }
)
```

1. Port-forward 8585 from VM: `ssh -L 8585:localhost:8585 your-vm`
2. Run your MCP client
3. Copy the auth URL from stderr
4. Authenticate in browser
5. Callback completes automatically

### Option B: Manual Flow (No Port-Forwarding)

1. Run MCP client (without `GEMINI_CLI_WORKSPACE_HEADLESS`)
2. Copy the auth URL from stderr
3. Authenticate in browser
4. Copy JSON credentials from the success page
5. Store using `secret-tool` (Linux) or Keychain/Credential Manager
6. Restart MCP server

## Testing

- [x] Build passes (`npm run build`)
- [ ] Test headless mode with port-forwarding
- [ ] Test manual flow credential storage
- [ ] Verify MCP client receives only JSON-RPC on stdout

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `GEMINI_CLI_WORKSPACE_HEADLESS` | Skip browser launch, print URL to stderr, keep callback server |
| `OAUTH_CALLBACK_PORT` | Fixed port for OAuth callback (default: dynamic) |
| `OAUTH_CALLBACK_HOST` | Callback hostname (default: localhost) |
| `GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE` | Force encrypted file storage instead of keychain |
