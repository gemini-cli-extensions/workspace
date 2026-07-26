import { googleJson } from "../googleClient";

export type Comment = {
  id: string;
  content?: string;
  htmlContent?: string;
  author?: unknown;
  resolved?: boolean;
  anchor?: string;
  replies?: unknown[];
  createdTime?: string;
  modifiedTime?: string;
};

const BASE = "https://www.googleapis.com/drive/v3";
const LIST_FIELDS = "comments(id,content,htmlContent,author,resolved,anchor,createdTime,modifiedTime,replies),nextPageToken";
const GET_FIELDS = "id,content,htmlContent,author,resolved,anchor,replies";
const CREATE_FIELDS = "id,content,author,anchor,createdTime";
const REPLY_FIELDS = "id,content,author,createdTime";
const RESOLVE_FIELDS = "id,action,content";

export class CommentsService {
  constructor(private env: Env, private sub: string) {}

  async list(
    fileId: string,
    opts?: { includeDeleted?: boolean; pageSize?: number; startModifiedTime?: string },
  ): Promise<{ comments: Comment[]; nextPageToken?: string }> {
    const params = new URLSearchParams({ fields: LIST_FIELDS });
    if (opts?.includeDeleted !== undefined) params.set("includeDeleted", String(opts.includeDeleted));
    if (opts?.pageSize !== undefined) params.set("pageSize", String(opts.pageSize));
    if (opts?.startModifiedTime) params.set("startModifiedTime", opts.startModifiedTime);
    const out = await googleJson<{ comments?: Comment[]; nextPageToken?: string }>(
      this.env,
      this.sub,
      `${BASE}/files/${fileId}/comments?${params}`,
    );
    return { comments: out.comments ?? [], nextPageToken: out.nextPageToken };
  }

  async get(fileId: string, commentId: string): Promise<Comment> {
    const params = new URLSearchParams({ fields: GET_FIELDS });
    return googleJson<Comment>(this.env, this.sub, `${BASE}/files/${fileId}/comments/${commentId}?${params}`);
  }

  async create(fileId: string, content: string, anchor?: string): Promise<Comment> {
    return googleJson<Comment>(this.env, this.sub, `${BASE}/files/${fileId}/comments?fields=${encodeURIComponent(CREATE_FIELDS)}`, {
      method: "POST",
      body: JSON.stringify(anchor === undefined ? { content } : { content, anchor }),
    });
  }

  async reply(fileId: string, commentId: string, content: string): Promise<Comment> {
    return googleJson<Comment>(
      this.env,
      this.sub,
      `${BASE}/files/${fileId}/comments/${commentId}/replies?fields=${encodeURIComponent(REPLY_FIELDS)}`,
      { method: "POST", body: JSON.stringify({ content }) },
    );
  }

  async resolve(fileId: string, commentId: string, content?: string): Promise<{ id: string; action?: string; content?: string }> {
    return googleJson(
      this.env,
      this.sub,
      `${BASE}/files/${fileId}/comments/${commentId}/replies?fields=${encodeURIComponent(RESOLVE_FIELDS)}`,
      { method: "POST", body: JSON.stringify({ action: "resolve", content: content ?? "Resolved." }) },
    );
  }

  async findMentions(fileId: string, tag: string): Promise<{ tag: string; matches: Comment[] }> {
    const { comments } = await this.list(fileId, { pageSize: 100 });
    const needle = tag.toLowerCase();
    const matches = comments.filter((c) => {
      if (c.content?.toLowerCase().includes(needle)) return true;
      return (c.replies ?? []).some((r) => (r as { content?: string }).content?.toLowerCase().includes(needle));
    });
    return { tag, matches };
  }
}
