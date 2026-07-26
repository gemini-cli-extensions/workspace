import { googleJson } from "../googleClient";

export type Form = { formId: string; info?: unknown; items?: unknown[]; responderUri?: string };

const BASE = "https://forms.googleapis.com/v1";

export class FormsService {
  constructor(private env: Env, private sub: string) {}

  async create(title: string, documentTitle?: string): Promise<{ formId: string; info?: unknown; responderUri?: string }> {
    return googleJson(this.env, this.sub, `${BASE}/forms`, {
      method: "POST",
      body: JSON.stringify({ info: { title, documentTitle: documentTitle ?? title } }),
    });
  }

  async get(formId: string): Promise<Form> {
    return googleJson<Form>(this.env, this.sub, `${BASE}/forms/${formId}`);
  }

  async batchUpdate(formId: string, requests: unknown[]): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/forms/${formId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  async addQuestion(formId: string, title: string, options?: string[], required = false, index = 0): Promise<unknown> {
    const question = options?.length
      ? { required, choiceQuestion: { type: "RADIO", options: options.map((v) => ({ value: v })) } }
      : { required, textQuestion: {} };
    const requests = [
      {
        createItem: {
          item: { title, questionItem: { question } },
          location: { index },
        },
      },
    ];
    return this.batchUpdate(formId, requests);
  }

  async listResponses(formId: string): Promise<{ responses: unknown[] }> {
    const out = await googleJson<{ responses?: unknown[] }>(this.env, this.sub, `${BASE}/forms/${formId}/responses`);
    return { responses: out.responses ?? [] };
  }
}
