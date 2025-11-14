# Development

This document provides instructions for developing the Google Workspace extension.

## Development Setup and Workflow

This section guides contributors on how to build, modify, and understand the development setup of this project.

### Setting Up the Development Environment

**Prerequisites:**

1.  **Node.js**:
    - **Development:** Please use Node.js `~20.19.0`. This specific version is required due to an upstream development dependency issue. You can use a tool like [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
    - **Production:** For running the CLI in a production environment, any version of Node.js `>=20` is acceptable.
2.  **Git**

### Build Process

To clone the repository:

```bash
git clone https://github.com/gemini-cli-extensions/workspace.git # Or your fork's URL
cd gemini-cli-workspace
```

To install dependencies defined in `package.json` as well as root dependencies:

```bash
npm install
```

To build the entire project (all packages):

```bash
npm run build
```

This command typically compiles TypeScript to JavaScript, bundles assets, and prepares the packages for execution. Refer to `scripts/build.js` and `package.json` scripts for more details on what happens during the build.

### Running Tests

This project contains unit tests.

#### Unit Tests

To execute the unit test suite for the project:

```bash
npm run test
```

This will run tests located in the `workspace-mcp-server/src/__tests__` directory. Ensure tests pass before submitting any changes. For a more comprehensive check, it is recommended to run `npm run test && npm run lint`.

### Linting and Style Checks

To ensure code quality and formatting consistency, run the linter and tests:

```bash
npm run test && npm run lint
```

This command will run ESLint, Prettier, all tests, and other checks as defined in the project's `package.json`.

_ProTip_

after cloning create a git precommit hook file to ensure your commits are always clean.

```bash
echo "
# Run npm build and check for errors
#!/bin/sh
# Run tests and linting before commit
if ! (npm run test && npm run lint); then
  echo "Pre-commit checks failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatting

To separately format the code in this project by running the following command from the root directory:

```bash
npm run format
```

This command uses Prettier to format the code according to the project's style guidelines.

#### Linting

To separately lint the code in this project, run the following command from the root directory:

```bash
npm run lint
```

### Coding Conventions

- Please adhere to the coding style, patterns, and conventions used throughout the existing codebase.
- Consult [GEMINI.md](https://github.com/gemini-cli-extensions/workspace/blob/main/GEMINI.md) (typically found in the project root) for specific instructions related to AI-assisted development, including conventions for comments, and Git usage.
- **Imports:** Pay special attention to import paths. The project uses ESLint to enforce restrictions on relative imports between packages.

### Project Structure

- `workspace-mcp-server/`: The main workspace for the MCP server.
  - `src/`: Contains the source code for the server.
    - `__tests__/`: Contains all the tests.
    - `auth/`: Handles authentication.
    - `services/`: Contains the business logic for each service.
    - `utils/`: Contains utility functions.
  - `config/`: Contains configuration files.
- `scripts/`: Utility scripts for building, testing, and development tasks.

## Authentication

The extension uses OAuth 2.0 to authenticate with Google Workspace APIs. The `scripts/auth-utils.js` script provides a command-line interface to manage authentication credentials.

### Usage

To use the script, run the following command:

```bash
node scripts/auth-utils.js <command>
```

### Commands

- `clear`: Clear all authentication credentials.
- `expire`: Force the access token to expire (for testing refresh).
- `status`: Show current authentication status.
- `help`: Show the help message.