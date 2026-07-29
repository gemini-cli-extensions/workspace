import { googleFetch, googleJson } from "../googleClient";

export type DriveFile = { id: string; name: string; mimeType: string; webViewLink?: string; modifiedTime?: string };
export type DrivePermission = { id: string; type: string; role: string; emailAddress?: string; displayName?: string };
const BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const FIELDS = "files(id,name,mimeType,webViewLink),nextPageToken";

// Google Docs editor formats can't be downloaded directly; export them to a plain-text-ish equivalent instead.
const EXPORT_MIME: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
  "application/vnd.google-apps.presentation": "text/plain",
};

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

  /** Free Drive bytes for this account (limit − usage; MAX_SAFE for unlimited). */
  async getStorageFree(): Promise<number> {
    const about = await googleJson<{ storageQuota?: { limit?: string; usage?: string } }>(
      this.env,
      this.sub,
      `${BASE}/about?fields=storageQuota`,
    );
    const q = about.storageQuota ?? {};
    if (!q.limit) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, Number(q.limit) - Number(q.usage ?? 0));
  }

  /** Find a top-level folder by name, or create it. Returns its id. */
  async findOrCreateFolder(name: string): Promise<string> {
    const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const { files } = await this.search(q, 1);
    if (files[0]) return files[0].id;
    return (await this.createFolder(name)).id;
  }

  /** Export a Google file to binary bytes (e.g. application/pdf). */
  async exportBinary(fileId: string, mimeType: string): Promise<Uint8Array> {
    const res = await googleFetch(this.env, this.sub, `${BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Convert an Office file (docx/xlsx/pptx) to its Google-native equivalent via copy. */
  async convertToGoogle(fileId: string, name?: string): Promise<DriveFile> {
    const meta = await this.get(fileId);
    const target: Record<string, string> = {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "application/vnd.google-apps.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "application/vnd.google-apps.spreadsheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": "application/vnd.google-apps.presentation",
    };
    const mimeType = target[meta.mimeType ?? ""];
    if (!mimeType) throw new Error(`Not a convertible Office file (mimeType: ${meta.mimeType ?? "unknown"}).`);
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files/${fileId}/copy?fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      body: JSON.stringify({ name: name ?? meta.name, mimeType }),
    });
  }

  /** Upload raw bytes as a Drive file (metadata create + media PATCH). */
  async uploadBinary(name: string, mimeType: string, bytes: Uint8Array, parentId?: string): Promise<DriveFile> {
    const meta = await googleJson<DriveFile>(this.env, this.sub, `${BASE}/files?fields=id,name,webViewLink`, {
      method: "POST",
      body: JSON.stringify({ name, mimeType, parents: parentId ? [parentId] : undefined }),
    });
    await googleFetch(this.env, this.sub, `${UPLOAD_BASE}/files/${meta.id}?uploadType=media`, {
      method: "PATCH",
      headers: { "content-type": mimeType },
      body: bytes as unknown as BodyInit,
    });
    return meta;
  }

  async copy(fileId: string, name: string, parentId?: string): Promise<DriveFile> {
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files/${fileId}/copy?fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      body: JSON.stringify({ name, parents: parentId ? [parentId] : undefined }),
    });
  }

  async createFile(name: string, mimeType: string, content: string, parentId?: string): Promise<DriveFile> {
    const boundary = "-------314159265358979323846";
    const metadata = { name, mimeType, parents: parentId ? [parentId] : undefined };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n` +
      `${content}\r\n` +
      `--${boundary}--`;
    return googleJson<DriveFile>(this.env, this.sub, `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`, {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async downloadContent(fileId: string): Promise<{ content: string }> {
    const res = await googleFetch(this.env, this.sub, `${BASE}/files/${fileId}?alt=media`);
    return { content: await res.text() };
  }

  async readContent(fileId: string): Promise<{ content: string; mimeType: string; exported: boolean }> {
    const meta = await googleJson<{ mimeType: string; name: string }>(this.env, this.sub, `${BASE}/files/${fileId}?fields=mimeType,name`);
    if (meta.mimeType.startsWith("application/vnd.google-apps.")) {
      const exportMime = EXPORT_MIME[meta.mimeType] ?? "text/plain";
      const res = await googleFetch(this.env, this.sub, `${BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`);
      return { content: await res.text(), mimeType: exportMime, exported: true };
    }
    const res = await googleFetch(this.env, this.sub, `${BASE}/files/${fileId}?alt=media`);
    return { content: await res.text(), mimeType: meta.mimeType, exported: false };
  }

  async listRecent(pageSize = 20): Promise<{ files: DriveFile[] }> {
    const fields = "files(id,name,mimeType,modifiedTime,webViewLink)";
    const url = `${BASE}/files?orderBy=${encodeURIComponent("modifiedTime desc")}&pageSize=${encodeURIComponent(String(pageSize))}&fields=${encodeURIComponent(fields)}`;
    return googleJson<{ files: DriveFile[] }>(this.env, this.sub, url);
  }

  async getPermissions(fileId: string): Promise<{ permissions: DrivePermission[] }> {
    const fields = "permissions(id,type,role,emailAddress,displayName)";
    return googleJson<{ permissions: DrivePermission[] }>(this.env, this.sub, `${BASE}/files/${fileId}/permissions?fields=${encodeURIComponent(fields)}`);
  }

  async share(
    fileId: string,
    role: string,
    type: string,
    emailAddress?: string,
    sendNotificationEmail = false,
  ): Promise<DrivePermission> {
    const params = new URLSearchParams({ fields: "id,role,type", sendNotificationEmail: String(sendNotificationEmail) });
    return googleJson<DrivePermission>(this.env, this.sub, `${BASE}/files/${fileId}/permissions?${params}`, {
      method: "POST",
      body: JSON.stringify({ role, type, ...(emailAddress ? { emailAddress } : {}) }),
    });
  }

  async updateFile(
    fileId: string,
    opts: { name?: string; addParents?: string; removeParents?: string },
  ): Promise<DriveFile> {
    const params = new URLSearchParams({ fields: "id,name,parents" });
    if (opts.addParents) params.set("addParents", opts.addParents);
    if (opts.removeParents) params.set("removeParents", opts.removeParents);
    return googleJson<DriveFile>(this.env, this.sub, `${BASE}/files/${fileId}?${params}`, {
      method: "PATCH",
      body: JSON.stringify(opts.name !== undefined ? { name: opts.name } : {}),
    });
  }

  async exportFile(fileId: string, mimeType: string): Promise<{ content: string; mimeType: string }> {
    const res = await googleFetch(this.env, this.sub, `${BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`);
    return { content: await res.text(), mimeType };
  }
}
