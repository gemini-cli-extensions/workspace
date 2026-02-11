# Google Workspace Extension for Gemini CLI

[![Build Status](https://github.com/gemini-cli-extensions/workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/gemini-cli-extensions/workspace/actions/workflows/ci.yml)

The Google Workspace extension for Gemini CLI brings the power of your Google
Workspace apps to your command line. Manage your documents, spreadsheets,
presentations, emails, chat, and calendar events without leaving your terminal.

## Prerequisites

Before using the Google Workspace extension, you need to be logged into your
Google account.

## Installation

Install the Google Workspace extension by running the following command from
your terminal:

```bash
gemini extensions install https://github.com/gemini-cli-extensions/workspace
```

### Headless / Docker Authentication

In environments without a browser (Docker, SSH, CI), you can provide OAuth
credentials via a JSON file using the `GEMINI_CLI_WORKSPACE_OAUTH_CREDENTIALS`
environment variable (similar to `GOOGLE_APPLICATION_CREDENTIALS`):

```bash
GEMINI_CLI_WORKSPACE_OAUTH_CREDENTIALS=/path/to/credentials.json gemini
```

The simplest way to generate this file is with `gcloud`:

#### 1. Create an OAuth Client ID

Create a **Desktop** OAuth client in the
[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials):

1. Click **Create Credentials** → **OAuth client ID**
2. Application type: **Desktop app**
3. Download the client secret JSON file (e.g. `client_secret.json`)

#### 2. Enable Required APIs

Enable the following APIs in your Google Cloud Project
([APIs & Services → Library](https://console.cloud.google.com/apis/library)):

- [Google Calendar API](https://console.cloud.google.com/apis/api/calendar-json.googleapis.com)
- [Google Drive API](https://console.cloud.google.com/apis/api/drive.googleapis.com)
- [Google Docs API](https://console.cloud.google.com/apis/api/docs.googleapis.com)
- [Google Sheets API](https://console.cloud.google.com/apis/api/sheets.googleapis.com)
- [Google Slides API](https://console.cloud.google.com/apis/api/slides.googleapis.com)
- [Gmail API](https://console.cloud.google.com/apis/api/gmail.googleapis.com)
- [Google Chat API](https://console.cloud.google.com/apis/api/chat.googleapis.com)
- [People API](https://console.cloud.google.com/apis/api/people.googleapis.com)
- [Admin SDK API](https://console.cloud.google.com/apis/api/admin.googleapis.com)

#### 3. Generate Credentials

```bash
gcloud auth application-default login \
  --client-id-file=client_secret.json \
  --project=YOUR_PROJECT_ID \
  --scopes="\
https://www.googleapis.com/auth/cloud-platform,\
https://www.googleapis.com/auth/documents,\
https://www.googleapis.com/auth/drive,\
https://www.googleapis.com/auth/calendar,\
https://www.googleapis.com/auth/chat.spaces,\
https://www.googleapis.com/auth/chat.messages,\
https://www.googleapis.com/auth/chat.memberships,\
https://www.googleapis.com/auth/userinfo.profile,\
https://www.googleapis.com/auth/gmail.modify,\
https://www.googleapis.com/auth/directory.readonly,\
https://www.googleapis.com/auth/presentations.readonly,\
https://www.googleapis.com/auth/spreadsheets.readonly"
```

You can customize the list of scopes used above to fit your needs. See the
[Google OAuth 2.0 Scopes](https://developers.google.com/identity/protocols/oauth2/scopes)
page for a list of available scopes.

#### 4. Use the Credentials

```bash
GEMINI_CLI_WORKSPACE_OAUTH_CREDENTIALS=~/.config/gcloud/application_default_credentials.json gemini
```

> **Note:** Both gcloud ADC format (`type: "authorized_user"`) and raw OAuth
> token JSON are supported.

## Usage

Once the extension is installed, you can use it to interact with your Google
Workspace apps. Here are a few examples:

**Create a new Google Doc:**

> "Create a new Google Doc with the title 'My New Doc' and the content '# My New
> Document\n\nThis is a new document created from the command line.'"

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

## Deployment

If you want to host your own version of this extension's infrastructure, see the
[GCP Recreation Guide](docs/GCP-RECREATION.md).

## Resources

- [Documentation](docs/index.md): Detailed documentation on all the available
  tools.
- [GitHub Issues](https://github.com/gemini-cli-extensions/workspace/issues):
  Report bugs or request features.

## Important security consideration: Indirect Prompt Injection Risk

When exposing any language model to untrusted data, there's a risk of an
[indirect prompt injection attack](https://en.wikipedia.org/wiki/Prompt_injection).
Agentic tools like Gemini CLI, connected to MCP servers, have access to a wide
array of tools and APIs.

This MCP server grants the agent the ability to read, modify, and delete your
Google Account data, as well as other data shared with you.

- Never use this with untrusted tools
- Never include untrusted inputs into the model context. This includes asking
  Gemini CLI to process mail, documents, or other resources from unverified
  sources.
- Untrusted inputs may contain hidden instructions that could hijack your CLI
  session. Attackers can then leverage this to modify, steal, or destroy your
  data.
- Always carefully review actions taken by Gemini CLI on your behalf to ensure
  they are correct and align with your intentions.

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md)
file for details on how to contribute to this project.

## 📄 Legal

- **License**: [Apache License 2.0](LICENSE)
- **Terms of Service**: [Terms of Service](https://policies.google.com/terms)
- **Privacy Policy**: [Privacy Policy](https://policies.google.com/privacy)
- **Security**: [Security Policy](SECURITY.md)
