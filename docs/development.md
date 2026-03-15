# Development

This document provides instructions for developing the Google Workspace
extension.

## Development Setup and Workflow

This section guides contributors on how to build, modify, and understand the
development setup of this project.

### Setting Up the Development Environment

**Prerequisites:**

1.  **Node.js**:
    - **Development:** Please use Node.js `~20.19.0`. This specific version is
      required due to an upstream development dependency issue. You can use a
      tool like [nvm](https://github.com/nvm-sh/nvm) to manage Node.js versions.
    - **Production:** For running the CLI in a production environment, any
      version of Node.js `>=20` is acceptable.
2.  **Git**

### Build Process

To clone the repository:

```bash
git clone https://github.com/gemini-cli-extensions/workspace.git # Or your fork's URL
cd workspace
```

To install dependencies defined in `package.json` as well as root dependencies:

```bash
npm install
```

To build the entire project (all packages):

```bash
npm run build
```

This command typically compiles TypeScript to JavaScript, bundles assets, and
prepares the packages for execution. Refer to `scripts/build.js` and
`package.json` scripts for more details on what happens during the build.

### Running Tests

This project contains unit tests.

#### Unit Tests

To execute the unit test suite for the project:

```bash
npm run test
```

This will run tests located in the `workspace-server/src/__tests__` directory.
Ensure tests pass before submitting any changes. For a more comprehensive check,
it is recommended to run `npm run test && npm run lint`.

To test a single file, you can pass its path from the project root as an
argument. For example:

````bash
npm run test -- workspace-server/src/__tests__/GmailService.test.ts
```

### Linting and Style Checks

To ensure code quality and formatting consistency, run the linter and tests:

```bash
npm run test && npm run lint
````

This command will run ESLint, Prettier, all tests, and other checks as defined
in the project's `package.json`.

> [!TIP] After cloning create a git pre-commit hook file to ensure your commits
> are always clean.
>
> ```bash
> cat <<'EOF' > .git/hooks/pre-commit
> #!/bin/sh
> # Run tests and linting before commit
> if ! (npm run test && npm run lint); then
>   echo "Pre-commit checks failed. Commit aborted."
>   exit 1
> fi
> EOF
> chmod +x .git/hooks/pre-commit
> ```

#### Formatting

To separately format the code in this project by running the following command
from the root directory:

```bash
npm run format
```

This command uses Prettier to format the code according to the project's style
guidelines.

#### Linting

To separately lint the code in this project, run the following command from the
root directory:

```bash
npm run lint
```

#### Testing with Gemini CLI

To test your code changes with Gemini CLI you can run:

```bash
gemini extensions uninstall google-workspace
npm install && npm run build
gemini extensions link .
gemini extensions list
gemini --debug
# Prompt to test your feature/bug fix
```

### Coding Conventions

- Please adhere to the coding style, patterns, and conventions used throughout
  the existing codebase.
- Consult
  [GEMINI.md](https://github.com/gemini-cli-extensions/workspace/blob/main/GEMINI.md)
  (typically found in the project root) for specific instructions related to
  AI-assisted development, including conventions for comments, and Git usage.
- **Imports:** Pay special attention to import paths. The project uses ESLint to
  enforce restrictions on relative imports between packages.

### Tool Naming

Tool names in source use dot notation (e.g., `docs.create`) for logical
grouping. By default, these are normalized to underscores at runtime (e.g.,
`docs_create`) for compatibility with a broader set of applications that use MCP
including Google Antigravity.

When the server is run as a Gemini CLI extension the `--use-dot-names` flag is
used to maintain dot notation and avoid breaking existing configurations.

### Project Structure

- `workspace-server/`: The main workspace for the MCP server.
  - `src/`: Contains the source code for the server.
    - `__tests__/`: Contains all the tests.
    - `auth/`: Handles authentication.
    - `cli/`: CLI tools (e.g., headless OAuth login).
    - `services/`: Contains the business logic for each service.
    - `utils/`: Contains utility functions.
  - `config/`: Contains configuration files.
- `scripts/`: Utility scripts for building, testing, and development tasks.

## Authentication

The extension uses OAuth 2.0 to authenticate with Google Workspace APIs. The
`scripts/auth-utils.js` script provides a command-line interface to manage
authentication credentials.

### Usage

To use the script, run the following command:

```bash
node scripts/auth-utils.js <command>
```

### Commands

- `login`: Authenticate via headless OAuth flow (for SSH/WSL/Cloud Shell). Reads
  credentials securely from `/dev/tty` so they are not visible to AI models.
- `clear`: Clear all authentication credentials.
- `expire`: Force the access token to expire (for testing refresh).
- `status`: Show current authentication status.
- `help`: Show the help message.

### Headless / Remote Environments

If you are running the server in an environment without a browser (SSH, WSL,
Cloud Shell, VMs), authentication requires manual steps:

1. Run the login tool:
   ```bash
   node scripts/auth-utils.js login
   ```
   Or, from the `workspace-server` directory:
   ```bash
   node dist/headless-login.js
   ```
2. Open the printed OAuth URL in any browser (your local machine, phone, etc.).
3. Complete Google sign-in. The browser will display a credentials JSON block.
4. Copy the JSON and paste it into the CLI when prompted.

The CLI reads input from `/dev/tty` (Unix) or `CON` (Windows) rather than
process stdin, so credentials are never exposed to an AI model that may have
spawned the process.

Use `--force` to re-authenticate if credentials already exist.

### Token Storage

The extension uses a **hybrid storage strategy** for OAuth credentials. It first
attempts to use the OS-level secure storage (via the
[keytar](https://github.com/atom/node-keytar) library). If the keychain is
unavailable, it falls back to AES-256-GCM encrypted file storage.

Credentials are stored under the service name `gemini-cli-workspace-oauth` with
the account name `main-account`.

#### OS Keychain (Primary)

| Platform    | Backend                               | How to find stored credentials                                                                                                |
| ----------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **macOS**   | Keychain Access                       | Open **Keychain Access** → search for `gemini-cli-workspace-oauth`                                                            |
| **Windows** | Windows Credential Manager            | Start Menu → search **Credential Manager** → **Windows Credentials** → **Generic Credentials** → `gemini-cli-workspace-oauth` |
| **Linux**   | GNOME Keyring / KWallet (`libsecret`) | Use `secret-tool search service gemini-cli-workspace-oauth` or your desktop's keyring manager                                 |

#### Encrypted File Fallback

When the OS keychain is not available (e.g., headless servers, containers, or CI
environments), the extension stores credentials in an encrypted file within the
extension's installation directory:

| File                               | Purpose                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `gemini-cli-workspace-token.json`  | AES-256-GCM encrypted token data                     |
| `.gemini-cli-workspace-master-key` | 256-bit master key used to derive the encryption key |

Both files are created with restrictive permissions (`0o600`) and their
containing directory with `0o700`. The encryption key is derived from the master
key using `scrypt` with a machine-specific salt.

#### Forcing File Storage

To bypass the OS keychain and always use encrypted file storage, set the
environment variable:

```bash
export GEMINI_CLI_WORKSPACE_FORCE_FILE_STORAGE=true
```
