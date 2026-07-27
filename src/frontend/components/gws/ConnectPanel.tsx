/**
 * @fileoverview `/gws/connect` client island — shows the signed-in user how to
 * connect Claude to this MCP server. Three paths:
 *   - claude.ai web: paste the server URL, OAuth does the rest (no token).
 *   - Claude Code / Desktop: use the Bearer token shown here.
 *
 * Built from shadcn/ui primitives (Card, Button, CodeBlock, CopyButton) — no
 * server-stringified HTML.
 */
import * as React from "react";
import { GlobeIcon, TerminalIcon, KeyRoundIcon, ShieldCheckIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/CopyButton";

export type ConnectPanelProps = {
  token: string | null;
  email?: string;
  expiresAt?: string;
  baseUrl: string;
};

export function ConnectPanel({ token, email, expiresAt, baseUrl }: ConnectPanelProps) {
  const mcpUrl = `${baseUrl}/mcp`;

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sign in to connect</CardTitle>
          <CardDescription>
            Authorize with Google to mint your access token and connect Claude to your Workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a href="/auth/google" className={buttonVariants({ variant: "default" })}>
            Sign in with Google
          </a>
        </CardContent>
      </Card>
    );
  }

  const claudeCode = `claude mcp add --transport http google-workspace \\\n  ${mcpUrl} \\\n  --header "Authorization: Bearer ${token}"`;

  const desktopConfig = JSON.stringify(
    { mcpServers: { "google-workspace": { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } },
    null,
    2,
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Signed in{email ? <> as <span className="font-medium text-foreground">{email}</span></> : null}.
        {expiresAt ? <> Token valid until {expiresAt}.</> : null} Pick how you're using Claude below.
      </p>

      {/* claude.ai web — OAuth, no token needed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GlobeIcon className="size-4 text-muted-foreground" /> claude.ai (web)
            <Badge variant="secondary" className="ml-1">OAuth</Badge>
          </CardTitle>
          <CardDescription>
            In claude.ai → Settings → Connectors → Add custom connector, paste this URL. Claude runs
            the OAuth sign-in itself — no token to copy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
            <code className="flex-1 overflow-x-auto font-mono text-sm">{mcpUrl}</code>
            <CopyButton text={mcpUrl} label="Copy" />
          </div>
        </CardContent>
      </Card>

      {/* Claude Code */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-muted-foreground" /> Claude Code
          </CardTitle>
          <CardDescription>Run this once. The token is your Bearer credential.</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock filename="terminal" language="bash" code={claudeCode} />
        </CardContent>
      </Card>

      {/* Claude Desktop / other clients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4 text-muted-foreground" /> Claude Desktop / other MCP clients
          </CardTitle>
          <CardDescription>Add this server block to your client's MCP config.</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock filename="mcp config" language="json" code={desktopConfig} />
        </CardContent>
      </Card>

      {/* Raw token */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="size-4 text-muted-foreground" /> Your Bearer token
          </CardTitle>
          <CardDescription>Treat this like a password. Only needed for Claude Code / Desktop.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-3">
            <code className="flex-1 overflow-x-auto font-mono text-xs break-all">{token}</code>
            <CopyButton text={token} label="Copy" />
          </div>
          <p className="text-xs text-muted-foreground">
            Revoke access any time from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Google account
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
