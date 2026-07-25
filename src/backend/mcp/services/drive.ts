import { googleJson } from "../googleClient";

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string };
const BASE = "https://www.googleapis.com/drive/v3";
const FIELDS = "files(id,name,mimeType,webViewLink),nextPageToken";

export class DriveService {
  constructor(private env: Env, private sub: string) {}

  async search(q?: string, pageSize = 20): Promise<{ files: DriveFile[] }> {
    const parts = [
      `pageSize=${encodeURIComponent(String(pageSize))}`,
      `fields=${encodeURIComponent(FIELDS)}`,
      `spaces=${encodeURIComponent("drive")}`
    ];
    if (q) {
      parts.push(`q=${encodeURIComponent(q)}`);
    }
    const url = `${BASE}/files?${parts.join('&')}`;
    return googleJson<{ files: DriveFile[] }>(this.env, this.sub, url);
  }

  async get(fileId: string): Promise<DriveFile> {
    const params = new URLSearchParams({ fields: "id,name,mimeType,webViewLink" });
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files/${fileId}?${params}`);
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFile> {
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files?fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined }),
    });
  }
}
