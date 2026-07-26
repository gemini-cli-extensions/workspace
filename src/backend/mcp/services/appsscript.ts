import { googleJson } from "../googleClient";

const BASE = "https://script.googleapis.com/v1";

export class AppsScriptService {
  constructor(private env: Env, private sub: string) {}

  async createProject(title: string, parentId?: string): Promise<{ scriptId: string; title?: string }> {
    return googleJson<{ scriptId: string; title?: string }>(this.env, this.sub, `${BASE}/projects`, {
      method: "POST",
      body: JSON.stringify({ title, parentId }),
    });
  }

  async getContent(scriptId: string): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/projects/${scriptId}/content`);
  }

  async updateContent(scriptId: string, files: unknown[]): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/projects/${scriptId}/content`, {
      method: "PUT",
      body: JSON.stringify({ files }),
    });
  }

  async run(scriptId: string, functionName: string, parameters?: unknown[], devMode = true): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/scripts/${scriptId}:run`, {
      method: "POST",
      body: JSON.stringify({ function: functionName, parameters, devMode }),
    });
  }

  async listProcesses(): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/processes`);
  }
}
