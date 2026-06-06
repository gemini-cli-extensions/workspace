/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, sheets_v4 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export class SheetsService {
  constructor(private authManager: AuthManager) {}

  private handleError(
    context: string,
    error: unknown,
  ): {
    isError: true;
    content: { type: 'text'; text: string }[];
  } {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logToFile(`[SheetsService] Error during ${context}: ${errorMessage}`);
    return {
      isError: true,
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
    };
  }

  private async getSheetsClient(): Promise<sheets_v4.Sheets> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.sheets({ version: 'v4', ...options });
  }

  public getText = async ({
    spreadsheetId,
    format = 'text',
  }: {
    spreadsheetId: string;
    format?: 'text' | 'csv' | 'json';
  }) => {
    logToFile(
      `[SheetsService] Starting getText for spreadsheet: ${spreadsheetId} with format: ${format}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      // Get spreadsheet metadata
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: id,
        includeGridData: false,
      });

      let content = '';
      const jsonData: Record<string, any[][]> = {};

      // Add spreadsheet title (except for JSON format)
      if (spreadsheet.data.properties?.title && format !== 'json') {
        content += `Spreadsheet Title: ${spreadsheet.data.properties.title}\n\n`;
      }

      // Get all sheet names
      const sheetNames =
        spreadsheet.data.sheets?.map((sheet) => sheet.properties?.title) || [];

      // Get data from all sheets
      for (const sheetName of sheetNames) {
        if (!sheetName) continue;

        try {
          const response = await sheets.spreadsheets.values.get({
            spreadsheetId: id,
            range: `'${sheetName}'`,
          });

          const values = response.data.values || [];

          if (format === 'json') {
            // Collect data for JSON structure
            jsonData[sheetName] = values;
          } else {
            // Add sheet name as context
            content += `Sheet Name: ${sheetName}\n`;

            if (values.length === 0) {
              content += '(Empty sheet)\n';
            } else {
              // Process each row
              values.forEach((row) => {
                if (format === 'csv') {
                  // Convert to CSV format
                  const csvRow = row
                    .map((cell) => {
                      // Escape quotes and wrap in quotes if contains comma or quotes
                      const cellStr = String(cell || '');
                      if (
                        cellStr.includes(',') ||
                        cellStr.includes('"') ||
                        cellStr.includes('\n')
                      ) {
                        return `"${cellStr.replace(/"/g, '""')}"`;
                      }
                      return cellStr;
                    })
                    .join(',');
                  content += csvRow + '\n';
                } else {
                  // Plain text format with pipe separators for readability
                  content += row.map((cell) => cell || '').join(' | ') + '\n';
                }
              });
            }
            content += '\n';
          }
        } catch (sheetError) {
          logToFile(
            `[SheetsService] Error reading sheet ${sheetName}: ${sheetError}`,
          );
          if (format === 'json') {
            // For JSON format, we'll skip sheets with errors
            logToFile(
              `[SheetsService] Skipping sheet ${sheetName} in JSON output due to error`,
            );
          } else {
            content += `Sheet Name: ${sheetName}\n(Error reading sheet)\n\n`;
          }
        }
      }

      if (format === 'json') {
        // Generate clean JSON output from collected data
        content = JSON.stringify(jsonData, null, 2);
      }

      logToFile(`[SheetsService] Finished getText for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: content.trim(),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SheetsService] Error during sheets.getText: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public getRange = async ({
    spreadsheetId,
    range,
  }: {
    spreadsheetId: string;
    range: string;
  }) => {
    logToFile(
      `[SheetsService] Starting getRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: id,
        range: range,
      });

      const values = response.data.values || [];

      logToFile(`[SheetsService] Finished getRange for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              range: response.data.range,
              values: values,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SheetsService] Error during sheets.getRange: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  public updateRange = async ({
    spreadsheetId,
    range,
    values,
    valueInputOption = 'USER_ENTERED',
  }: {
    spreadsheetId: string;
    range: string;
    values: (string | number | boolean | null)[][];
    valueInputOption?: 'RAW' | 'USER_ENTERED';
  }) => {
    logToFile(
      `[SheetsService] Starting updateRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId: id,
        range,
        valueInputOption,
        requestBody: { values },
      });

      logToFile(`[SheetsService] Finished updateRange for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              updatedRange: response.data.updatedRange,
              updatedRows: response.data.updatedRows,
              updatedColumns: response.data.updatedColumns,
              updatedCells: response.data.updatedCells,
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError('sheets.updateRange', error);
    }
  };

  public appendRange = async ({
    spreadsheetId,
    range,
    values,
    valueInputOption = 'USER_ENTERED',
  }: {
    spreadsheetId: string;
    range: string;
    values: (string | number | boolean | null)[][];
    valueInputOption?: 'RAW' | 'USER_ENTERED';
  }) => {
    logToFile(
      `[SheetsService] Starting appendRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range,
        valueInputOption,
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values },
      });

      logToFile(`[SheetsService] Finished appendRange for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              updates: {
                updatedRange: response.data.updates?.updatedRange,
                updatedRows: response.data.updates?.updatedRows,
                updatedColumns: response.data.updates?.updatedColumns,
                updatedCells: response.data.updates?.updatedCells,
              },
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError('sheets.appendRange', error);
    }
  };

  public clearRange = async ({
    spreadsheetId,
    range,
  }: {
    spreadsheetId: string;
    range: string;
  }) => {
    logToFile(
      `[SheetsService] Starting clearRange for spreadsheet: ${spreadsheetId}, range: ${range}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.values.clear({
        spreadsheetId: id,
        range,
      });

      logToFile(`[SheetsService] Finished clearRange for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              clearedRange: response.data.clearedRange,
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError('sheets.clearRange', error);
    }
  };

  public createSpreadsheet = async ({
    title,
    sheetTitles,
  }: {
    title: string;
    sheetTitles?: string[];
  }) => {
    logToFile(
      `[SheetsService] Starting createSpreadsheet with title: ${title}`,
    );
    try {
      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: sheetTitles?.map((t) => ({ properties: { title: t } })),
        },
      });

      logToFile(
        `[SheetsService] Created spreadsheet: ${response.data.spreadsheetId}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              spreadsheetId: response.data.spreadsheetId,
              spreadsheetUrl: response.data.spreadsheetUrl,
              title: response.data.properties?.title,
              sheets: response.data.sheets?.map((s) => ({
                sheetId: s.properties?.sheetId,
                title: s.properties?.title,
              })),
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError('sheets.createSpreadsheet', error);
    }
  };

  public addSheet = async ({
    spreadsheetId,
    title,
  }: {
    spreadsheetId: string;
    title: string;
  }) => {
    logToFile(
      `[SheetsService] Starting addSheet for spreadsheet: ${spreadsheetId}, title: ${title}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const response = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [{ addSheet: { properties: { title } } }],
        },
      });

      const addedSheet = response.data.replies?.[0]?.addSheet;
      logToFile(`[SheetsService] Added sheet to spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              sheetId: addedSheet?.properties?.sheetId,
              title: addedSheet?.properties?.title,
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError('sheets.addSheet', error);
    }
  };

  public deleteSheet = async ({
    spreadsheetId,
    sheetId,
  }: {
    spreadsheetId: string;
    sheetId: number;
  }) => {
    logToFile(
      `[SheetsService] Starting deleteSheet for spreadsheet: ${spreadsheetId}, sheetId: ${sheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [{ deleteSheet: { sheetId } }],
        },
      });

      logToFile(
        `[SheetsService] Deleted sheet ${sheetId} from spreadsheet: ${id}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: `Delete sheet request completed for sheet ${sheetId}`,
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError('sheets.deleteSheet', error);
    }
  };

  public getMetadata = async ({ spreadsheetId }: { spreadsheetId: string }) => {
    logToFile(
      `[SheetsService] Starting getMetadata for spreadsheet: ${spreadsheetId}`,
    );
    try {
      const id = extractDocId(spreadsheetId) || spreadsheetId;

      const sheets = await this.getSheetsClient();
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: id,
        includeGridData: false,
      });

      const metadata = {
        spreadsheetId: spreadsheet.data.spreadsheetId,
        title: spreadsheet.data.properties?.title,
        sheets: spreadsheet.data.sheets?.map((sheet) => ({
          sheetId: sheet.properties?.sheetId,
          title: sheet.properties?.title,
          index: sheet.properties?.index,
          rowCount: sheet.properties?.gridProperties?.rowCount,
          columnCount: sheet.properties?.gridProperties?.columnCount,
        })),
        locale: spreadsheet.data.properties?.locale,
        timeZone: spreadsheet.data.properties?.timeZone,
      };

      logToFile(`[SheetsService] Finished getMetadata for spreadsheet: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(metadata),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SheetsService] Error during sheets.getMetadata: ${errorMessage}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };
}
