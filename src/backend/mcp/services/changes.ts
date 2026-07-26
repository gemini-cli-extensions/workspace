import { googleFetch, googleJson } from "../googleClient";

export type Change = {
  fileId?: string;
  time?: string;
  removed?: boolean;
  file?: { id: string; name?: string; mimeType?: string; modifiedTime?: string };
};

export type Channel = { id: string; resourceId: string; resourceUri: string; expiration?: string };

const BASE = "https://www.googleapis.com/drive/v3";
const LIST_FIELDS = "changes(fileId,time,removed,file(id,name,mimeType,modifiedTime)),newStartPageToken,nextPageToken";

export class ChangesService {
  constructor(private env: Env, private sub: string) {}

  async getStartPageToken(driveId?: string): Promise<{ startPageToken: string }> {
    const params = new URLSearchParams({ supportsAllDrives: "true" });
    if (driveId) params.set("driveId", driveId);
    return googleJson<{ startPageToken: string }>(this.env, this.sub, `${BASE}/changes/startPageToken?${params}`);
  }

  async list(
    pageToken: string,
    opts?: {
      includeRemoved?: boolean;
      includeItemsFromAllDrives?: boolean;
      restrictToMyDrive?: boolean;
      pageSize?: number;
      driveId?: string;
      spaces?: string;
    },
  ): Promise<{ changes: Change[]; newStartPageToken?: string; nextPageToken?: string }> {
    const params = new URLSearchParams({ pageToken, supportsAllDrives: "true", fields: LIST_FIELDS });
    if (opts?.includeRemoved !== undefined) params.set("includeRemoved", String(opts.includeRemoved));
    if (opts?.includeItemsFromAllDrives !== undefined) params.set("includeItemsFromAllDrives", String(opts.includeItemsFromAllDrives));
    if (opts?.restrictToMyDrive !== undefined) params.set("restrictToMyDrive", String(opts.restrictToMyDrive));
    if (opts?.pageSize !== undefined) params.set("pageSize", String(opts.pageSize));
    if (opts?.driveId) params.set("driveId", opts.driveId);
    if (opts?.spaces) params.set("spaces", opts.spaces);
    const out = await googleJson<{ changes?: Change[]; newStartPageToken?: string; nextPageToken?: string }>(
      this.env,
      this.sub,
      `${BASE}/changes?${params}`,
    );
    return { changes: out.changes ?? [], newStartPageToken: out.newStartPageToken, nextPageToken: out.nextPageToken };
  }

  async watch(
    pageToken: string,
    channel: { id: string; address: string; token?: string; expiration?: string },
  ): Promise<Channel> {
    const params = new URLSearchParams({ pageToken, supportsAllDrives: "true" });
    return googleJson<Channel>(this.env, this.sub, `${BASE}/changes/watch?${params}`, {
      method: "POST",
      body: JSON.stringify({
        id: channel.id,
        type: "web_hook",
        address: channel.address,
        token: channel.token,
        expiration: channel.expiration,
      }),
    });
  }

  async stop(channelId: string, resourceId: string): Promise<{ ok: true }> {
    await googleFetch(this.env, this.sub, `${BASE}/channels/stop`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: channelId, resourceId }),
    });
    return { ok: true };
  }
}
