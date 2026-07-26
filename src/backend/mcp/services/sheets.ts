import { googleJson } from "../googleClient";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsService {
  constructor(private env: Env, private sub: string) {}

  async create(title: string): Promise<{ spreadsheetId: string }> {
    return googleJson<{ spreadsheetId: string }>(this.env, this.sub, BASE, {
      method: "POST",
      body: JSON.stringify({ properties: { title } }),
    });
  }

  async getValues(
    spreadsheetId: string,
    range: string
  ): Promise<{ values: string[][] }> {
    const out = await googleJson<{ values?: string[][] }>(
      this.env,
      this.sub,
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`
    );
    return { values: out.values ?? [] };
  }

  async updateValues(
    spreadsheetId: string,
    range: string,
    values: string[][]
  ): Promise<void> {
    await googleJson(
      this.env,
      this.sub,
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        body: JSON.stringify({ values }),
      }
    );
  }

  async appendValues(
    spreadsheetId: string,
    range: string,
    values: string[][]
  ): Promise<void> {
    await googleJson(
      this.env,
      this.sub,
      `${BASE}/${spreadsheetId}/values/${encodeURIComponent(
        range
      )}:append?valueInputOption=USER_ENTERED`,
      {
        method: "POST",
        body: JSON.stringify({ values }),
      }
    );
  }

  async getMetadata(
    spreadsheetId: string
  ): Promise<{ spreadsheetId: string; properties: { title: string }; sheets: { properties: { sheetId: number; title: string; index: number } }[] }> {
    const fields = "spreadsheetId,properties.title,sheets(properties(sheetId,title,index))";
    return googleJson(this.env, this.sub, `${BASE}/${spreadsheetId}?fields=${encodeURIComponent(fields)}`);
  }

  async batchUpdate(spreadsheetId: string, requests: unknown[]): Promise<void> {
    await googleJson(this.env, this.sub, `${BASE}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  async addSheet(spreadsheetId: string, title: string): Promise<void> {
    await this.batchUpdate(spreadsheetId, [{ addSheet: { properties: { title } } }]);
  }
}
