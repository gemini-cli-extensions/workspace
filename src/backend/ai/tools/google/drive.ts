/**
 * @fileoverview Google Drive API client using Domain-Wide Delegation via
 * service account. Provides folder management, file listing/deletion, and
 * HTML-to-native-Google-Doc conversion via multipart upload.
 *
 * Auth: Uses `getServiceAccountAccessToken` from `lib/google-auth.ts`
 * (KV-cached, production-tested). All public methods apply `extractGoogleId`
 * for agent-safe ID handling.
 */

import { extractGoogleId } from "@/backend/ai/tools/google/utils";
import { getServiceAccountAccessToken } from "@/backend/lib/google-auth";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export class GoogleDriveClient {
  constructor(private readonly env: Env) {}

  /**
   * Create a folder inside a parent folder.
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
          parents: parentFolderId ? [parentFolderId] : undefined,
        }),
      },
    );
  }

  /**
   * List all non-trashed files inside a folder.
   */
  async listFilesInFolder(folderIdInput: string): Promise<{ id: string; name: string }[]> {
    const folderId = extractGoogleId(folderIdInput);
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await this.driveFetch<{
      files: { id: string; name: string }[];
    }>(`/files?q=${query}&fields=files(id,name)`);
    return res.files || [];
  }

  /**
   * List files in a folder, sorted by a given field.
   * Defaults to `modifiedTime desc` to show most recently modified first.
   */
  async listFilesInFolderSorted(
    folderIdInput: string,
    orderBy = "modifiedTime desc",
  ): Promise<{ id: string; name: string; modifiedTime?: string }[]> {
    const folderId = extractGoogleId(folderIdInput);
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await this.driveFetch<{
      files: { id: string; name: string; modifiedTime?: string }[];
    }>(
      `/files?q=${query}&orderBy=${encodeURIComponent(orderBy)}&fields=files(id,name,modifiedTime)`,
    );
    return res.files || [];
  }

  /**
   * Copy an existing file to create a new document.
   * Used by the template-copy workflow to duplicate resume/cover letter templates.
   */
  async copyFile(
    fileIdInput: string,
    name?: string,
    parentFolderIdInput?: string,
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const fileId = extractGoogleId(fileIdInput);
    const body: Record<string, unknown> = {};
    if (name) body.name = name;
    if (parentFolderIdInput) {
      body.parents = [extractGoogleId(parentFolderIdInput)];
    }
    return this.driveFetch<{ id: string; name: string; webViewLink?: string }>(
      `/files/${fileId}/copy?fields=id,name,webViewLink`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  }

  /**
   * Permanently delete a file by ID.
   */
  async deleteFile(fileIdInput: string): Promise<void> {
    const fileId = extractGoogleId(fileIdInput);
    await this.driveFetch(`/files/${fileId}`, { method: "DELETE" });
  }

  /**
   * Convert an HTML string directly into a native Google Doc via multipart upload.
   *
   * This uses the Drive v3 `uploadType=multipart` endpoint with a
   * `multipart/related` request to upload HTML content as a native
   * `application/vnd.google-apps.document` Google Doc.
   */
  async createDocFromHtml(
    name: string,
    htmlContent: string,
    parentFolderIdInput?: string,
  ): Promise<{ id: string; name: string; webViewLink?: string }> {
    const parentFolderId = parentFolderIdInput ? extractGoogleId(parentFolderIdInput) : undefined;

    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.document",
      parents: parentFolderId ? [parentFolderId] : undefined,
    };

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
      htmlContent +
      closeDelimiter;

    const token = await getServiceAccountAccessToken(this.env, [DRIVE_SCOPE]);

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      },
    );

    if (!response.ok) {
      throw new Error(
        `Google Drive multipart upload failed: ${response.status} ${await response.text()}`,
      );
    }

    return response.json() as Promise<{
      id: string;
      name: string;
      webViewLink?: string;
    }>;
  }

  /**
   * Internal fetch wrapper for Drive v3 API calls.
   * Handles auth injection, content-type defaults, and 204 (No Content) responses.
   */
  private async driveFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getServiceAccountAccessToken(this.env, [DRIVE_SCOPE]);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);

    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
      throw new Error(`Google Drive API failed: ${response.status} ${await response.text()}`);
    }

    // DELETE returns 204 No Content
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }
}
