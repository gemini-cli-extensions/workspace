/**
 * @fileoverview Google Docs API client using Domain-Wide Delegation via
 * service account. Provides document creation from templates, reading,
 * appending, commenting, and replying.
 *
 * Auth: Uses `getServiceAccountAccessToken` from `lib/google-auth.ts`
 * (KV-cached, production-tested). All public methods apply `extractGoogleId`
 * for agent-safe ID handling.
 *
 * NOTE: Folder management (createFolder, listFiles, deleteFile) has been
 * moved to `GoogleDriveClient` in `./google/drive.ts`. The `createFolder`
 * method here is a deprecated shim that delegates to the Drive client.
 */

import { extractGoogleId } from "@/backend/ai/tools/google/utils";
import { getServiceAccountAccessToken } from "@/backend/lib/google-auth";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DOCS_SCOPE = "https://www.googleapis.com/auth/documents";

export type CreatedGoogleDoc = {
  docId: string;
  name: string;
  webViewLink?: string;
};

export class GoogleDocsClient {
  constructor(private readonly env: Env) {}

  /**
   * @deprecated Use `GoogleDriveClient.createFolder()` from `./google/drive.ts` instead.
   * This shim exists for backward compatibility with existing call sites.
   */
  async createFolder(
    name: string,
    parentFolderIdInput: string,
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const parentFolderId = extractGoogleId(parentFolderIdInput);
    return this.driveFetch<{ id: string; name: string; webViewLink?: string }>(
      "/files?fields=id,name,webViewLink",
      {
        method: "POST",
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        }),
      },
    );
  }

  async createFromTemplate(
    templateIdInput: string,
    replacements: Record<string, string>,
    parentFolderIdInput: string,
    name = `Career draft ${new Date().toISOString()}`,
  ): Promise<CreatedGoogleDoc> {
    const templateId = extractGoogleId(templateIdInput);
    const parentFolderId = extractGoogleId(parentFolderIdInput);

    const copied = await this.driveFetch<{ id: string; name: string; webViewLink?: string }>(
      `/files/${templateId}/copy?fields=id,name,webViewLink`,
      {
        method: "POST",
        body: JSON.stringify({ name, parents: [parentFolderId] }),
      },
    );

    const requests = Object.entries(replacements).map(([replace, replaceWith]) => ({
      replaceAllText: {
        containsText: { text: replace, matchCase: true },
        replaceText: replaceWith,
      },
    }));

    if (requests.length > 0) {
      await this.docsFetch(`/documents/${copied.id}:batchUpdate`, {
        method: "POST",
        body: JSON.stringify({ requests }),
      });
    }

    return { docId: copied.id, name: copied.name, webViewLink: copied.webViewLink };
  }

  async read(docIdInput: string): Promise<string> {
    const docId = extractGoogleId(docIdInput);
    const document = await this.docsFetch<GoogleDocument>(`/documents/${docId}`);

    return extractDocumentText(document);
  }

  async appendText(docIdInput: string, text: string): Promise<void> {
    const docId = extractGoogleId(docIdInput);
    const document = await this.docsFetch<GoogleDocument>(
      `/documents/${docId}?fields=body/content/endIndex`,
    );
    const endIndex = Math.max(1, (document.body.content.at(-1)?.endIndex ?? 1) - 1);

    await this.docsFetch(`/documents/${docId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ insertText: { location: { index: endIndex }, text } }],
      }),
    });
  }

  async addComment(docIdInput: string, anchor: string, text: string): Promise<DriveComment> {
    const docId = extractGoogleId(docIdInput);
    return this.driveFetch<DriveComment>(
      `/files/${docId}/comments?fields=id,content,anchor,createdTime`,
      {
        method: "POST",
        body: JSON.stringify({ anchor, content: text }),
      },
    );
  }

  async replyToComment(docIdInput: string, commentId: string, text: string): Promise<DriveReply> {
    const docId = extractGoogleId(docIdInput);
    return this.driveFetch<DriveReply>(
      `/files/${docId}/comments/${commentId}/replies?fields=id,content,createdTime`,
      {
        method: "POST",
        body: JSON.stringify({ content: text }),
      },
    );
  }

  async listComments(docIdInput: string, filter?: string): Promise<DriveComment[]> {
    const docId = extractGoogleId(docIdInput);
    const query = new URLSearchParams({
      fields: "comments(id,content,anchor,createdTime,resolved,replies(id,content,createdTime))",
    });

    if (filter) {
      query.set("includeDeleted", "false");
    }

    const payload = await this.driveFetch<{ comments?: DriveComment[] }>(
      `/files/${docId}/comments?${query}`,
    );
    const comments = payload.comments ?? [];

    return filter ? comments.filter((comment) => comment.content.includes(filter)) : comments;
  }

  private async docsFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.googleFetch<T>(
      "https://docs.googleapis.com/v1",
      path,
      [DOCS_SCOPE, DRIVE_SCOPE],
      init,
    );
  }

  private async driveFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.googleFetch<T>("https://www.googleapis.com/drive/v3", path, [DRIVE_SCOPE], init);
  }

  private async googleFetch<T>(
    baseUrl: string,
    path: string,
    scopes: string[],
    init: RequestInit,
  ): Promise<T> {
    const token = await getServiceAccountAccessToken(this.env, scopes);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });

    if (!response.ok) {
      throw new Error(`Google API request failed: ${response.status} ${await response.text()}`);
    }

    return response.json() as Promise<T>;
  }
}

type GoogleDocument = {
  body: {
    content: Array<{
      endIndex?: number;
      paragraph?: {
        elements?: Array<{
          textRun?: { content?: string };
        }>;
      };
    }>;
  };
};

type DriveComment = {
  id: string;
  content: string;
  anchor?: string;
  createdTime?: string;
  resolved?: boolean;
  replies?: DriveReply[];
};

type DriveReply = {
  id: string;
  content: string;
  createdTime?: string;
};

function extractDocumentText(document: GoogleDocument): string {
  return document.body.content
    .flatMap((block) => block.paragraph?.elements ?? [])
    .map((element) => element.textRun?.content ?? "")
    .join("");
}
