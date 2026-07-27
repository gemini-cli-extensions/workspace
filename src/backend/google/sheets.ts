/**
 * @fileoverview Workers-native Google Sheets REST client.
 *
 * `GoogleSheetsClient` extends {@link GoogleApiClient} and wraps the Sheets v4
 * API (`https://sheets.googleapis.com/v4/spreadsheets`). It ports value
 * read/write/append/clear, metadata, sheet creation, spreadsheet creation,
 * basic-filter set/clear, and cell formatting from the legacy
 * `googleSheetsApiHelpers.ts` + `filterHelpers.ts` onto pure `fetch` — no Node
 * `googleapis`. Listing spreadsheets uses the Drive v3 API.
 *
 * Every id/url argument is normalized with {@link extractGoogleId}.
 */

import { extractGoogleId } from "@/backend/google/core/ids";
import { GoogleApiClient } from "@/backend/google/core/client";
import { GoogleScope } from "@/backend/lib/google-auth";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";

/** A range of cell values. */
export interface ValueRange {
  range?: string;
  majorDimension?: string;
  values?: unknown[][];
}

/** Spreadsheet metadata (subset). */
export interface SpreadsheetInfo {
  spreadsheetId: string;
  spreadsheetUrl?: string;
  properties?: { title?: string };
  sheets?: Array<{ properties?: { sheetId?: number; title?: string; index?: number } }>;
}

/** A spreadsheet listing entry from Drive. */
export interface SheetListItem {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

/** Generic Sheets batchUpdate request object (passed through verbatim). */
export type SheetsRequest = Record<string, unknown>;

/**
 * Account-bound client for the Google Sheets API v4.
 *
 * @example
 * ```ts
 * const sheets = new GoogleSheetsClient(env, "workspace");
 * const data = await sheets.read("<id>", "Sheet1!A1:C10");
 * await sheets.append("<id>", "Sheet1!A1", [["a", "b", "c"]]);
 * ```
 */
export class GoogleSheetsClient extends GoogleApiClient {
  /**
   * Read values from a range.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param range - A1 range (e.g. `"Sheet1!A1:C10"`)
   * @returns The {@link ValueRange}
   * @throws If the spreadsheet is missing or access is denied
   */
  async read(idInput: string, range: string): Promise<ValueRange> {
    const id = extractGoogleId(idInput);
    return this.request<ValueRange>(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(range)}`, {
      scopes: [GoogleScope.Sheets],
    });
  }

  /**
   * Write values to a range (overwrites existing cells).
   *
   * @param idInput - Spreadsheet ID or URL
   * @param range - A1 range to write
   * @param values - 2-D array of cell values
   * @param valueInputOption - `"USER_ENTERED"` (default) or `"RAW"`
   * @returns The update response
   * @throws If the spreadsheet is missing or access is denied
   */
  async write(
    idInput: string,
    range: string,
    values: unknown[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
  ): Promise<unknown> {
    const id = extractGoogleId(idInput);
    return this.request(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(range)}`, {
      method: "PUT",
      query: { valueInputOption },
      body: { values },
      scopes: [GoogleScope.Sheets],
    });
  }

  /**
   * Append rows to the end of a range's table.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param range - A1 range identifying the table to append to
   * @param values - 2-D array of cell values
   * @param valueInputOption - `"USER_ENTERED"` (default) or `"RAW"`
   * @returns The append response
   * @throws If the spreadsheet is missing or access is denied
   */
  async append(
    idInput: string,
    range: string,
    values: unknown[][],
    valueInputOption: "RAW" | "USER_ENTERED" = "USER_ENTERED",
  ): Promise<unknown> {
    const id = extractGoogleId(idInput);
    return this.request(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(range)}:append`, {
      method: "POST",
      query: { valueInputOption, insertDataOption: "INSERT_ROWS" },
      body: { values },
      scopes: [GoogleScope.Sheets],
    });
  }

  /**
   * Clear all values in a range.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param range - A1 range to clear
   * @returns The clear response
   * @throws If the spreadsheet is missing or access is denied
   */
  async clear(idInput: string, range: string): Promise<unknown> {
    const id = extractGoogleId(idInput);
    return this.request(`${SHEETS_BASE}/${id}/values/${encodeURIComponent(range)}:clear`, {
      method: "POST",
      body: {},
      scopes: [GoogleScope.Sheets],
    });
  }

  /**
   * Get spreadsheet metadata (titles, sheet IDs) without grid data.
   *
   * @param idInput - Spreadsheet ID or URL
   * @returns The {@link SpreadsheetInfo}
   * @throws If the spreadsheet is missing or access is denied
   */
  async getInfo(idInput: string): Promise<SpreadsheetInfo> {
    const id = extractGoogleId(idInput);
    return this.request<SpreadsheetInfo>(`${SHEETS_BASE}/${id}`, {
      query: { includeGridData: "false" },
      scopes: [GoogleScope.Sheets],
    });
  }

  /**
   * Add a new sheet/tab to a spreadsheet.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param title - New sheet title
   * @returns The batchUpdate response
   * @throws If the spreadsheet is missing or access is denied
   */
  async addSheet(idInput: string, title: string): Promise<unknown> {
    return this.batchUpdate(idInput, [{ addSheet: { properties: { title } } }]);
  }

  /**
   * Create a brand-new spreadsheet.
   *
   * @param title - Spreadsheet title
   * @returns The created {@link SpreadsheetInfo}
   * @throws If the request fails
   */
  async createSpreadsheet(title: string): Promise<SpreadsheetInfo> {
    return this.request<SpreadsheetInfo>(SHEETS_BASE, {
      method: "POST",
      body: { properties: { title } },
      scopes: [GoogleScope.Sheets],
    });
  }

  /**
   * List the user's spreadsheets (via Drive).
   *
   * @returns Spreadsheet listing entries, newest first
   * @throws If the request fails
   */
  async list(): Promise<SheetListItem[]> {
    const res = await this.request<{ files?: SheetListItem[] }>(`${DRIVE_BASE}/files`, {
      query: {
        q: `mimeType='${SHEET_MIME}' and trashed = false`,
        orderBy: "modifiedTime desc",
        fields: "files(id,name,modifiedTime,webViewLink)",
        pageSize: 100,
      },
      scopes: [GoogleScope.Drive],
    });
    return res.files ?? [];
  }

  /**
   * Enable a basic filter (auto-filter dropdowns) on a sheet.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param sheetId - Target sheet ID (defaults to the first sheet)
   * @param range - Optional grid range to scope the filter
   * @returns The batchUpdate response
   * @throws If the spreadsheet is missing or access is denied
   */
  async setBasicFilter(
    idInput: string,
    sheetId?: number,
    range?: {
      startRowIndex?: number;
      endRowIndex?: number;
      startColumnIndex?: number;
      endColumnIndex?: number;
    },
  ): Promise<unknown> {
    const targetSheetId = sheetId ?? (await this.firstSheetId(idInput));
    const filterRange: Record<string, unknown> = { sheetId: targetSheetId, ...(range ?? {}) };
    return this.batchUpdate(idInput, [{ setBasicFilter: { filter: { range: filterRange } } }]);
  }

  /**
   * Remove the basic filter from a sheet.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param sheetId - Target sheet ID (defaults to the first sheet)
   * @returns The batchUpdate response
   * @throws If the spreadsheet is missing or access is denied
   */
  async clearBasicFilter(idInput: string, sheetId?: number): Promise<unknown> {
    const targetSheetId = sheetId ?? (await this.firstSheetId(idInput));
    return this.batchUpdate(idInput, [{ clearBasicFilter: { sheetId: targetSheetId } }]);
  }

  /**
   * Execute an arbitrary array of Sheets batchUpdate requests (e.g. cell
   * formatting via `repeatCell`).
   *
   * @param idInput - Spreadsheet ID or URL
   * @param requests - Sheets API `Request` objects
   * @returns The batchUpdate response
   * @throws If any request is invalid
   */
  async formatCells<T = unknown>(idInput: string, requests: SheetsRequest[]): Promise<T> {
    return this.batchUpdate<T>(idInput, requests);
  }

  /**
   * Execute a raw Sheets `batchUpdate`.
   *
   * @param idInput - Spreadsheet ID or URL
   * @param requests - Sheets API `Request` objects
   * @returns The batchUpdate response
   * @throws If any request is invalid
   */
  async batchUpdate<T = unknown>(idInput: string, requests: SheetsRequest[]): Promise<T> {
    const id = extractGoogleId(idInput);
    return this.request<T>(`${SHEETS_BASE}/${id}:batchUpdate`, {
      method: "POST",
      body: { requests },
      scopes: [GoogleScope.Sheets],
    });
  }

  /** Resolve the first sheet's numeric ID for filter operations. */
  private async firstSheetId(idInput: string): Promise<number> {
    const info = await this.getInfo(idInput);
    const sheetId = info.sheets?.[0]?.properties?.sheetId;
    if (sheetId === undefined) throw new Error("Spreadsheet has no sheets.");
    return sheetId;
  }
}
