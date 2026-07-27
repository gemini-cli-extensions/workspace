import { googleJson } from "../googleClient";

export type GoogleDoc = { documentId: string; title: string };

const BASE = "https://docs.googleapis.com/v1/documents";

export class DocsService {
  constructor(private env: Env, private sub: string) {}

  async get(documentId: string): Promise<GoogleDoc> {
    return googleJson<GoogleDoc>(this.env, this.sub, `${BASE}/${documentId}`);
  }

  /**
   * Fetch the full raw Docs JSON ("braille"), tab-aware. Hardcodes
   * `includeTabsContent=true` so every tab is visible — otherwise the API
   * returns only the first tab in the legacy root `body`.
   */
  async getRaw<T = unknown>(documentId: string): Promise<T> {
    return googleJson<T>(this.env, this.sub, `${BASE}/${documentId}?includeTabsContent=true`);
  }

  async create(title: string): Promise<GoogleDoc> {
    return googleJson<GoogleDoc>(this.env, this.sub, BASE, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async insertText(documentId: string, text: string, index = 1): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ insertText: { location: { index }, text } }],
      }),
    });
  }

  async replaceText(documentId: string, find: string, replace: string, matchCase = false): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ replaceAllText: { containsText: { text: find, matchCase }, replaceText: replace } }],
      }),
    });
  }

  async insertImage(documentId: string, uri: string, index = 1): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${documentId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{ insertInlineImage: { uri, location: { index } } }],
      }),
    });
  }
}
