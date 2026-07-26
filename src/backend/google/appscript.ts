/**
 * @fileoverview Workers-native Google Apps Script REST client.
 *
 * `AppsScriptClient` extends {@link GoogleApiClient} and wraps the Apps Script
 * API v1 (`https://script.googleapis.com/v1`). It ports bound/standalone
 * project creation, content get/update, project listing (via Drive), and script
 * execution (`scripts.run`) from the legacy `scriptTools.ts` onto pure `fetch` —
 * no Node `googleapis`.
 *
 * Project/parent IDs are normalized with {@link extractGoogleId}.
 */

import { extractGoogleId } from "@/backend/google/core/ids";
import { GoogleApiClient } from "@/backend/google/core/client";
import { GoogleScope } from "@/backend/lib/google-auth";

const SCRIPT_BASE = "https://script.googleapis.com/v1";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const SCRIPT_MIME = "application/vnd.google-apps.script";

/** A created Apps Script project. */
export interface ScriptProject {
  scriptId: string;
  title?: string;
  parentId?: string;
  createTime?: string;
  updateTime?: string;
}

/** A single file in an Apps Script project. */
export interface ScriptFile {
  name: string;
  type: "SERVER_JS" | "JSON" | "HTML";
  source: string;
}

/** A standalone Apps Script project listing entry (from Drive). */
export interface ScriptListItem {
  id: string;
  name: string;
  modifiedTime?: string;
}

/**
 * Account-bound client for the Google Apps Script API v1.
 *
 * @example
 * ```ts
 * const apps = new AppsScriptClient(env, "workspace");
 * const proj = await apps.createStandalone("My Tools");
 * await apps.updateContent(proj.scriptId, [
 *   { name: "Code", type: "SERVER_JS", source: "function go() {}" },
 *   { name: "appsscript", type: "JSON", source: "{\"timeZone\":\"UTC\"}" },
 * ]);
 * ```
 */
export class AppsScriptClient extends GoogleApiClient {
  /**
   * Create a script project bound to a parent Doc/Sheet/Form.
   *
   * @param parentIdInput - Parent file ID or URL to bind to
   * @param title - Project title
   * @returns The created {@link ScriptProject}
   * @throws If the parent is missing or access is denied
   */
  async createBoundScript(parentIdInput: string, title: string): Promise<ScriptProject> {
    const parentId = extractGoogleId(parentIdInput);
    return this.request<ScriptProject>(`${SCRIPT_BASE}/projects`, {
      method: "POST",
      body: { title, parentId },
      scopes: [GoogleScope.ScriptProjects],
    });
  }

  /**
   * Create a standalone script project (no parent file).
   *
   * @param title - Project title
   * @returns The created {@link ScriptProject}
   * @throws If the request fails
   */
  async createStandalone(title: string): Promise<ScriptProject> {
    return this.request<ScriptProject>(`${SCRIPT_BASE}/projects`, {
      method: "POST",
      body: { title },
      scopes: [GoogleScope.ScriptProjects],
    });
  }

  /**
   * Get a project's files/content.
   *
   * @param scriptIdInput - Script ID or URL
   * @returns `{ scriptId, files }`
   * @throws If the project is missing or access is denied
   */
  async getContent(
    scriptIdInput: string,
  ): Promise<{ scriptId: string; files: ScriptFile[] }> {
    const scriptId = extractGoogleId(scriptIdInput);
    const res = await this.request<{ scriptId?: string; files?: ScriptFile[] }>(
      `${SCRIPT_BASE}/projects/${scriptId}/content`,
      { scopes: [GoogleScope.ScriptProjects] },
    );
    return { scriptId: res.scriptId ?? scriptId, files: res.files ?? [] };
  }

  /**
   * Overwrite a project's files.
   *
   * @param scriptIdInput - Script ID or URL
   * @param files - The full set of files to write (`SERVER_JS`/`JSON`/`HTML`)
   * @returns The updated content response
   * @throws If the project is missing or access is denied
   */
  async updateContent(scriptIdInput: string, files: ScriptFile[]): Promise<unknown> {
    const scriptId = extractGoogleId(scriptIdInput);
    return this.request(`${SCRIPT_BASE}/projects/${scriptId}/content`, {
      method: "PUT",
      body: { files },
      scopes: [GoogleScope.ScriptProjects],
    });
  }

  /**
   * List standalone Apps Script projects (via Drive).
   *
   * @param pageSize - Max projects to return (default 10)
   * @returns Standalone project listing entries, newest first
   * @throws If the request fails
   */
  async listProjects(pageSize = 10): Promise<ScriptListItem[]> {
    const res = await this.request<{ files?: ScriptListItem[] }>(`${DRIVE_BASE}/files`, {
      query: {
        q: `mimeType='${SCRIPT_MIME}' and trashed = false`,
        pageSize,
        orderBy: "modifiedTime desc",
        fields: "files(id,name,modifiedTime)",
      },
      scopes: [GoogleScope.Drive],
    });
    return res.files ?? [];
  }

  /**
   * Execute a function in a deployed script project.
   *
   * Requires the project to have an API Executable deployment and matching
   * OAuth scopes.
   *
   * @param scriptIdInput - Script ID or URL (deployment id)
   * @param functionName - Name of the function to run
   * @param params - Positional parameters passed to the function
   * @returns The `scripts.run` response (contains `response.result` or `error`)
   * @throws If the run request fails at the transport level
   */
  async run(
    scriptIdInput: string,
    functionName: string,
    params: unknown[] = [],
  ): Promise<unknown> {
    const scriptId = extractGoogleId(scriptIdInput);
    return this.request(`${SCRIPT_BASE}/scripts/${scriptId}:run`, {
      method: "POST",
      body: { function: functionName, parameters: params, devMode: false },
      scopes: [GoogleScope.ScriptProjects, GoogleScope.ScriptDeployments],
    });
  }
}
