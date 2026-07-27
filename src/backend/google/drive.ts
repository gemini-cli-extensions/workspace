/**
 * @fileoverview Workers-native Google Drive REST client.
 *
 * `GoogleDriveClient` extends {@link GoogleApiClient} and wraps the Drive v3 API
 * (`https://www.googleapis.com/drive/v3`) plus the resumable/multipart upload
 * host (`https://www.googleapis.com/upload/drive/v3`) for HTML-to-native-Doc
 * conversion. It ports folder management, file listing/search/move/copy/rename,
 * deletion, permissions, and binary download from the legacy MCP server onto
 * pure `fetch` — no Node `googleapis`.
 *
 * Every id/url argument is normalized with {@link extractGoogleId}.
 */

import { extractGoogleId } from "@/backend/google/core/ids";
import { GoogleApiClient } from "@/backend/google/core/client";
import { GoogleScope } from "@/backend/lib/google-auth";

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DOC_MIME = "application/vnd.google-apps.document";

const FILE_FIELDS = "id,name,mimeType,modifiedTime,createdTime,webViewLink,parents,size";

/** A Drive file as returned with {@link FILE_FIELDS}. */
export interface DriveFile {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  createdTime?: string;
  webViewLink?: string;
  parents?: string[];
  size?: string;
}

/** A Drive permission entry. */
export interface DrivePermission {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
  displayName?: string;
  domain?: string;
}

/**
 * Account-bound client for the Google Drive API v3.
 *
 * @example
 * ```ts
 * const drive = new GoogleDriveClient(env, "workspace");
 * const recent = await drive.recent(10);
 * const folder = await drive.createFolder("Reports");
 * ```
 */
export class GoogleDriveClient extends GoogleApiClient {
  /**
   * List non-trashed files, optionally filtered by a Drive query string.
   *
   * @param query - Optional Drive `q` query (e.g. `"name contains 'foo'"`)
   * @returns Matching files
   * @throws If the request fails
   */
  async listFiles(query?: string): Promise<DriveFile[]> {
    const q = query ? `(${query}) and trashed = false` : "trashed = false";
    const res = await this.request<{ files?: DriveFile[] }>(`${DRIVE_BASE}/files`, {
      query: { q, fields: `files(${FILE_FIELDS})`, pageSize: 100 },
      scopes: [GoogleScope.Drive],
    });
    return res.files ?? [];
  }

  /**
   * Full-text search across the user's Drive (`fullText contains`).
   *
   * @param q - Free-text search term
   * @returns Matching files
   * @throws If the request fails
   */
  async search(q: string): Promise<DriveFile[]> {
    const escaped = q.replace(/'/g, "\\'");
    return this.listFiles(`fullText contains '${escaped}'`);
  }

  /**
   * List the most recently modified files.
   *
   * @param n - Max number of files (default 20)
   * @returns Files sorted by `modifiedTime desc`
   * @throws If the request fails
   */
  async recent(n = 20): Promise<DriveFile[]> {
    const res = await this.request<{ files?: DriveFile[] }>(`${DRIVE_BASE}/files`, {
      query: {
        q: "trashed = false",
        orderBy: "modifiedTime desc",
        pageSize: n,
        fields: `files(${FILE_FIELDS})`,
      },
      scopes: [GoogleScope.Drive],
    });
    return res.files ?? [];
  }

  /**
   * Get metadata for a single file.
   *
   * @param idInput - File ID or full Drive/Docs URL
   * @returns The file metadata
   * @throws If the file is missing or access is denied
   */
  async getFileMetadata(idInput: string): Promise<DriveFile> {
    const id = extractGoogleId(idInput);
    return this.request<DriveFile>(`${DRIVE_BASE}/files/${id}`, {
      query: { fields: FILE_FIELDS },
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Create a folder, optionally inside a parent folder.
   *
   * @param name - Folder name
   * @param parentIdInput - Optional parent folder ID or URL
   * @returns The created folder metadata
   * @throws If the request fails
   */
  async createFolder(name: string, parentIdInput?: string): Promise<DriveFile> {
    const parentId = parentIdInput ? extractGoogleId(parentIdInput) : undefined;
    return this.request<DriveFile>(`${DRIVE_BASE}/files`, {
      method: "POST",
      query: { fields: FILE_FIELDS },
      body: {
        name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
      },
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * List the contents of a folder.
   *
   * @param folderIdInput - Folder ID or URL
   * @param orderBy - Drive order clause (default `"modifiedTime desc"`)
   * @returns Files in the folder
   * @throws If the folder is missing or access is denied
   */
  async listFolderContents(
    folderIdInput: string,
    orderBy = "modifiedTime desc",
  ): Promise<DriveFile[]> {
    const folderId = extractGoogleId(folderIdInput);
    const res = await this.request<{ files?: DriveFile[] }>(`${DRIVE_BASE}/files`, {
      query: {
        q: `'${folderId}' in parents and trashed = false`,
        orderBy,
        fields: `files(${FILE_FIELDS})`,
        pageSize: 200,
      },
      scopes: [GoogleScope.Drive],
    });
    return res.files ?? [];
  }

  /**
   * Move a file to a new parent folder (re-parents, removing old parents).
   *
   * @param fileIdInput - File ID or URL
   * @param newParentIdInput - Destination folder ID or URL
   * @returns The updated file metadata
   * @throws If the file/folder is missing or access is denied
   */
  async moveFile(fileIdInput: string, newParentIdInput: string): Promise<DriveFile> {
    const fileId = extractGoogleId(fileIdInput);
    const newParent = extractGoogleId(newParentIdInput);
    const current = await this.request<{ parents?: string[] }>(`${DRIVE_BASE}/files/${fileId}`, {
      query: { fields: "parents" },
      scopes: [GoogleScope.Drive],
    });
    const removeParents = (current.parents ?? []).join(",");
    return this.request<DriveFile>(`${DRIVE_BASE}/files/${fileId}`, {
      method: "PATCH",
      query: {
        addParents: newParent,
        removeParents: removeParents || undefined,
        fields: FILE_FIELDS,
      },
      body: {},
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Copy a file, optionally renaming it and/or placing it in a folder.
   *
   * @param idInput - Source file ID or URL
   * @param name - Optional name for the copy
   * @param parentIdInput - Optional destination folder ID or URL
   * @returns The copied file metadata
   * @throws If the source is missing or access is denied
   */
  async copyFile(idInput: string, name?: string, parentIdInput?: string): Promise<DriveFile> {
    const id = extractGoogleId(idInput);
    const body: Record<string, unknown> = {};
    if (name) body.name = name;
    if (parentIdInput) body.parents = [extractGoogleId(parentIdInput)];
    return this.request<DriveFile>(`${DRIVE_BASE}/files/${id}/copy`, {
      method: "POST",
      query: { fields: FILE_FIELDS },
      body,
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Rename a file.
   *
   * @param fileIdInput - File ID or URL
   * @param newName - New file name
   * @returns The updated file metadata
   * @throws If the file is missing or access is denied
   */
  async renameFile(fileIdInput: string, newName: string): Promise<DriveFile> {
    const fileId = extractGoogleId(fileIdInput);
    return this.request<DriveFile>(`${DRIVE_BASE}/files/${fileId}`, {
      method: "PATCH",
      query: { fields: FILE_FIELDS },
      body: { name: newName },
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Permanently delete a file.
   *
   * @param idInput - File ID or URL
   * @throws If the file is missing or access is denied
   */
  async deleteFile(idInput: string): Promise<void> {
    const id = extractGoogleId(idInput);
    await this.request<void>(`${DRIVE_BASE}/files/${id}`, {
      method: "DELETE",
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Convert an HTML string into a native Google Doc via multipart upload.
   *
   * @param name - Document name
   * @param html - HTML content to import
   * @param parentIdInput - Optional destination folder ID or URL
   * @returns The created document metadata
   * @throws If the upload fails
   * @example
   * ```ts
   * await drive.createDocFromHtml("Report", "<h1>Hi</h1>", "<folderId>");
   * ```
   */
  async createDocFromHtml(
    name: string,
    html: string,
    parentIdInput?: string,
  ): Promise<DriveFile> {
    const parentId = parentIdInput ? extractGoogleId(parentIdInput) : undefined;
    const boundary = "-------314159265358979323846";
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;
    const metadata = {
      name,
      mimeType: DOC_MIME,
      parents: parentId ? [parentId] : undefined,
    };
    const body =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: text/html; charset=UTF-8\r\n\r\n" +
      html +
      closeDelimiter;

    return this.request<DriveFile>(`${UPLOAD_BASE}/files`, {
      method: "POST",
      query: { uploadType: "multipart", fields: FILE_FIELDS },
      raw: body,
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      scopes: [GoogleScope.Drive],
    });
  }

  /**
   * Download a file's raw bytes.
   *
   * @param idInput - File ID or URL
   * @returns The file contents as an `ArrayBuffer`
   * @throws If the file is missing or access is denied
   */
  async downloadFile(idInput: string): Promise<ArrayBuffer> {
    const id = extractGoogleId(idInput);
    const res = await this.request<Response>(`${DRIVE_BASE}/files/${id}`, {
      query: { alt: "media" },
      scopes: [GoogleScope.Drive],
      rawResponse: true,
    });
    return res.arrayBuffer();
  }

  /**
   * List the sharing permissions on a file.
   *
   * @param idInput - File ID or URL
   * @returns Array of {@link DrivePermission}
   * @throws If the file is missing or access is denied
   */
  async getPermissions(idInput: string): Promise<DrivePermission[]> {
    const id = extractGoogleId(idInput);
    const res = await this.request<{ permissions?: DrivePermission[] }>(
      `${DRIVE_BASE}/files/${id}/permissions`,
      {
        query: { fields: "permissions(id,type,role,emailAddress,displayName,domain)" },
        scopes: [GoogleScope.Drive],
      },
    );
    return res.permissions ?? [];
  }
}
