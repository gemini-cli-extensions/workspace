This is a Gemini extension that provides tools for interacting with Google Workspace services like Google Docs.

### Building and Running

*   **Install dependencies:** `npm install`
*   **Build the project:** `npm run build --prefix workspace-server`

### Development Conventions

This project uses TypeScript and the Model Context Protocol (MCP) SDK to create a Gemini extension. The main entry point is `src/index.ts`, which initializes the MCP server and registers the available tools.

The business logic for each service is separated into its own file in the `src/services` directory. For example, `src/services/DocsService.ts` contains the logic for interacting with the Google Docs API.

Authentication is handled by the `src/auth/AuthManager.ts` file, which uses the `@google-cloud/local-auth` library to obtain and refresh OAuth 2.0 credentials.

### Adding New Tools

To add a new tool, you need to:

1.  Add a new method to the appropriate service file in `src/services`.
2.  In `src/index.ts`, register the new tool with the MCP server by calling `server.registerTool()`. You will need to provide a name for the tool, a description, and the input schema using the `zod` library.
