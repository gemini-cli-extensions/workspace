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

  /** Snapshot the current code as an immutable version (required before deploying). */
  async createVersion(scriptId: string, description?: string): Promise<{ versionNumber: number }> {
    return googleJson<{ versionNumber: number }>(this.env, this.sub, `${BASE}/projects/${scriptId}/versions`, {
      method: "POST",
      body: JSON.stringify({ description: description ?? "Automated version" }),
    });
  }

  /** Deploy a version (API-executable and/or web app, per the manifest). */
  async createDeployment(
    scriptId: string,
    versionNumber: number,
    description?: string,
    manifestFileName = "appsscript",
  ): Promise<{ deploymentId: string; entryPoints?: unknown[] }> {
    return googleJson<{ deploymentId: string; entryPoints?: unknown[] }>(this.env, this.sub, `${BASE}/projects/${scriptId}/deployments`, {
      method: "POST",
      body: JSON.stringify({ versionNumber, manifestFileName, description: description ?? "Automated deployment" }),
    });
  }

  async listDeployments(scriptId: string): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/projects/${scriptId}/deployments`);
  }
}
