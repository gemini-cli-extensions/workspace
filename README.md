# Google Workspace Extension for Gemini CLI

[![Build Status](https://github.com/gemini-cli-extensions/workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/gemini-cli-extensions/workspace/actions/workflows/ci.yml)

The Google Workspace extension for Gemini CLI brings the power of your Google Workspace apps to your command line. Manage your documents, spreadsheets, presentations, emails, chat, and calendar events without leaving your terminal.

## Prerequisites

Before using the Google Workspace extension, you need to be logged into your Google account.

## Installation

Install the Google Workspace extension by running the following command from your terminal:

```bash
gemini extensions install https://github.com/gemini-cli-extensions/workspace
```

## Usage

Once the extension is installed, you can use it to interact with your Google Workspace apps. Here are a few examples:

**Create a new Google Doc:**

> "Create a new Google Doc with the title 'My New Doc' and the content '# My New Document\n\nThis is a new document created from the command line.'"

**List your upcoming calendar events:**

> "What's on my calendar for today?"

**Search for a file in Google Drive:**

> "Find the file named 'my-file.txt' in my Google Drive."

## Commands

This extension provides a variety of commands. Here are a few examples:

### Get Schedule

**Command:** `/calendar:get-schedule [date]`

Shows your schedule for today or a specified date.

### Search Drive

**Command:** `/drive:search <query>`

Searches your Google Drive for files matching the given query.

## Resources

- [Documentation](docs/index.md): Detailed documentation on all the available tools.
- [GitHub Issues](https://github.com/gemini-cli-extensions/workspace/issues): Report bugs or request features.

## Important security consideration: Indirect Prompt Injection Risk

When exposing any language model to untrusted data, there's a risk of an [indirect prompt injection attack](https://en.wikipedia.org/wiki/Prompt_injection). Agentic tools like Gemini CLI, connected to MCP servers, have access to a wide array of tools and APIs.

This MCP server grants the agent the ability to read, modify, and delete your Google Account data, as well as other data shared with you.

* Never use this with untrusted tools
* Never include untrusted inputs into the model context. This includes asking Gemini CLI to process mail, documents, or other resources from unverified sources.
* Untrusted inputs may contain hidden instructions that could hijack your CLI session. Attackers can then leverage this to modify, steal, or destroy your data.
* Always carefully review actions taken by Gemini CLI on your behalf to ensure they are correct and align with your intentions.

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for details on how to contribute to this project.

## 📄 Legal

- **License**: [Apache License 2.0](LICENSE)
- **Terms of Service**: [Terms of Service](https://policies.google.com/terms)
- **Privacy Policy**: [Privacy Policy](https://policies.google.com/privacy)
- **Security**: [Security Policy](SECURITY.md)

