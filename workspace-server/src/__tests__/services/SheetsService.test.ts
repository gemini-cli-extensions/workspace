/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { SheetsService } from '../../services/SheetsService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('SheetsService', () => {
  let sheetsService: SheetsService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockSheetsAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Sheets API
    mockSheetsAPI = {
      spreadsheets: {
        get: jest.fn(),
        create: jest.fn(),
        batchUpdate: jest.fn(),
        values: {
          get: jest.fn(),
          update: jest.fn(),
          append: jest.fn(),
          clear: jest.fn(),
        },
      },
    };

    // Mock the google constructors
    (google.sheets as jest.Mock) = jest.fn().mockReturnValue(mockSheetsAPI);

    // Create SheetsService instance
    sheetsService = new SheetsService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getText', () => {
    it('should extract text from a spreadsheet in default format', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'Test Spreadsheet',
          },
          sheets: [
            { properties: { title: 'Sheet1' } },
            { properties: { title: 'Sheet2' } },
          ],
        },
      };

      const mockSheet1Data = {
        data: {
          values: [
            ['Header1', 'Header2', 'Header3'],
            ['Row1Col1', 'Row1Col2', 'Row1Col3'],
            ['Row2Col1', 'Row2Col2', 'Row2Col3'],
          ],
        },
      };

      const mockSheet2Data = {
        data: {
          values: [
            ['A', 'B'],
            ['1', '2'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get
        .mockResolvedValueOnce(mockSheet1Data)
        .mockResolvedValueOnce(mockSheet2Data);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
      });

      expect(mockSheetsAPI.spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet-id',
        includeGridData: false,
      });

      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenCalledTimes(2);
      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenNthCalledWith(1, {
        spreadsheetId: 'test-spreadsheet-id',
        range: "'Sheet1'",
      });
      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenNthCalledWith(2, {
        spreadsheetId: 'test-spreadsheet-id',
        range: "'Sheet2'",
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Test Spreadsheet');
      expect(result.content[0].text).toContain('Sheet1');
      expect(result.content[0].text).toContain('Header1 | Header2 | Header3');
      expect(result.content[0].text).toContain('Sheet2');
      expect(result.content[0].text).toContain('A | B');
    });

    it('should extract text in CSV format', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'CSV Test',
          },
          sheets: [{ properties: { title: 'Sheet1' } }],
        },
      };

      const mockSheetData = {
        data: {
          values: [
            ['Name', 'Age', 'City'],
            ['John, Jr.', '25', 'New York'],
            ['Jane', '30', 'San Francisco'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
        format: 'csv',
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Name,Age,City');
      expect(result.content[0].text).toContain('"John, Jr.",25,New York');
    });

    it('should extract text in JSON format', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'JSON Test',
          },
          sheets: [{ properties: { title: 'Sheet1' } }],
        },
      };

      const mockSheetData = {
        data: {
          values: [
            ['A', 'B'],
            ['1', '2'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
        format: 'json',
      });

      expect(result.content[0].type).toBe('text');
      const jsonResult = JSON.parse(result.content[0].text);
      expect(jsonResult.Sheet1).toEqual([
        ['A', 'B'],
        ['1', '2'],
      ]);
    });

    it('should handle empty sheets', async () => {
      const mockSpreadsheet = {
        data: {
          properties: {
            title: 'Empty Test',
          },
          sheets: [{ properties: { title: 'EmptySheet' } }],
        },
      };

      const mockSheetData = {
        data: {
          values: [],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

      const result = await sheetsService.getText({
        spreadsheetId: 'test-spreadsheet-id',
      });

      expect(result.content[0].text).toContain('EmptySheet');
      expect(result.content[0].text).toContain('(Empty sheet)');
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.get.mockRejectedValue(new Error('API Error'));

      const result = await sheetsService.getText({
        spreadsheetId: 'error-spreadsheet-id',
      });

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('API Error');
    });
  });

  describe('getRange', () => {
    it('should get values from a specific range', async () => {
      const mockRangeData = {
        data: {
          range: 'Sheet1!A1:B3',
          values: [
            ['A1', 'B1'],
            ['A2', 'B2'],
            ['A3', 'B3'],
          ],
        },
      };

      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockRangeData);

      const result = await sheetsService.getRange({
        spreadsheetId: 'test-spreadsheet-id',
        range: 'Sheet1!A1:B3',
      });

      expect(mockSheetsAPI.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-spreadsheet-id',
        range: 'Sheet1!A1:B3',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.range).toBe('Sheet1!A1:B3');
      expect(response.values).toHaveLength(3);
      expect(response.values[0]).toEqual(['A1', 'B1']);
    });

    it('should handle empty ranges', async () => {
      const mockRangeData = {
        data: {
          range: 'Sheet1!Z100:Z200',
          values: [],
        },
      };

      mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockRangeData);

      const result = await sheetsService.getRange({
        spreadsheetId: 'test-spreadsheet-id',
        range: 'Sheet1!Z100:Z200',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.values).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.get.mockRejectedValue(
        new Error('Range Error'),
      );

      const result = await sheetsService.getRange({
        spreadsheetId: 'error-id',
        range: 'InvalidRange',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Range Error');
    });
  });

  describe('getMetadata', () => {
    it('should retrieve spreadsheet metadata', async () => {
      const mockSpreadsheet = {
        data: {
          spreadsheetId: 'test-id',
          properties: {
            title: 'Test Spreadsheet',
            locale: 'en_US',
            timeZone: 'America/New_York',
          },
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: 'Sheet1',
                index: 0,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: 26,
                },
              },
            },
            {
              properties: {
                sheetId: 1,
                title: 'Sheet2',
                index: 1,
                gridProperties: {
                  rowCount: 500,
                  columnCount: 10,
                },
              },
            },
          ],
        },
      };

      mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);

      const result = await sheetsService.getMetadata({
        spreadsheetId: 'test-id',
      });
      const metadata = JSON.parse(result.content[0].text);

      expect(mockSheetsAPI.spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        includeGridData: false,
      });

      expect(metadata.spreadsheetId).toBe('test-id');
      expect(metadata.title).toBe('Test Spreadsheet');
      expect(metadata.locale).toBe('en_US');
      expect(metadata.timeZone).toBe('America/New_York');
      expect(metadata.sheets).toHaveLength(2);
      expect(metadata.sheets[0].title).toBe('Sheet1');
      expect(metadata.sheets[0].rowCount).toBe(1000);
      expect(metadata.sheets[0].columnCount).toBe(26);
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.get.mockRejectedValue(
        new Error('Metadata Error'),
      );

      const result = await sheetsService.getMetadata({
        spreadsheetId: 'error-id',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe('Metadata Error');
    });
  });

  describe('updateRange', () => {
    it('should write values to a specific range', async () => {
      const mockResponse = {
        data: {
          updatedRange: 'Sheet1!A1:B2',
          updatedRows: 2,
          updatedColumns: 2,
          updatedCells: 4,
        },
      };

      mockSheetsAPI.spreadsheets.values.update.mockResolvedValue(mockResponse);

      const result = await sheetsService.updateRange({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A1:B2',
        values: [
          ['A1', 'B1'],
          ['A2', 'B2'],
        ],
      });

      expect(mockSheetsAPI.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A1:B2',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [
            ['A1', 'B1'],
            ['A2', 'B2'],
          ],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updatedRange).toBe('Sheet1!A1:B2');
      expect(response.updatedRows).toBe(2);
      expect(response.updatedColumns).toBe(2);
      expect(response.updatedCells).toBe(4);
    });

    it('should use RAW valueInputOption when specified', async () => {
      const mockResponse = {
        data: {
          updatedRange: 'Sheet1!A1:A1',
          updatedRows: 1,
          updatedColumns: 1,
          updatedCells: 1,
        },
      };

      mockSheetsAPI.spreadsheets.values.update.mockResolvedValue(mockResponse);

      await sheetsService.updateRange({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A1',
        values: [['=SUM(B1:B10)']],
        valueInputOption: 'RAW',
      });

      expect(mockSheetsAPI.spreadsheets.values.update).toHaveBeenCalledWith(
        expect.objectContaining({
          valueInputOption: 'RAW',
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.update.mockRejectedValue(
        new Error('Update Error'),
      );

      const result = await sheetsService.updateRange({
        spreadsheetId: 'error-id',
        range: 'Sheet1!A1',
        values: [['test']],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Update Error');
    });
  });

  describe('appendRange', () => {
    it('should append rows to a sheet', async () => {
      const mockResponse = {
        data: {
          updates: {
            updatedRange: 'Sheet1!A4:B5',
            updatedRows: 2,
            updatedColumns: 2,
            updatedCells: 4,
          },
        },
      };

      mockSheetsAPI.spreadsheets.values.append.mockResolvedValue(mockResponse);

      const result = await sheetsService.appendRange({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A:B',
        values: [
          ['NewRow1', 'Data1'],
          ['NewRow2', 'Data2'],
        ],
      });

      expect(mockSheetsAPI.spreadsheets.values.append).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A:B',
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [
            ['NewRow1', 'Data1'],
            ['NewRow2', 'Data2'],
          ],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.updates.updatedRange).toBe('Sheet1!A4:B5');
      expect(response.updates.updatedRows).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.append.mockRejectedValue(
        new Error('Append Error'),
      );

      const result = await sheetsService.appendRange({
        spreadsheetId: 'error-id',
        range: 'Sheet1!A:B',
        values: [['test']],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Append Error');
    });
  });

  describe('clearRange', () => {
    it('should clear values from a range', async () => {
      const mockResponse = {
        data: {
          clearedRange: 'Sheet1!A1:D10',
        },
      };

      mockSheetsAPI.spreadsheets.values.clear.mockResolvedValue(mockResponse);

      const result = await sheetsService.clearRange({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A1:D10',
      });

      expect(mockSheetsAPI.spreadsheets.values.clear).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        range: 'Sheet1!A1:D10',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.clearedRange).toBe('Sheet1!A1:D10');
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.values.clear.mockRejectedValue(
        new Error('Clear Error'),
      );

      const result = await sheetsService.clearRange({
        spreadsheetId: 'error-id',
        range: 'Sheet1!A1:A1',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Clear Error');
    });
  });

  describe('createSpreadsheet', () => {
    it('should create a new spreadsheet', async () => {
      const mockResponse = {
        data: {
          spreadsheetId: 'new-spreadsheet-id',
          spreadsheetUrl:
            'https://docs.google.com/spreadsheets/d/new-spreadsheet-id',
          properties: { title: 'My New Sheet' },
          sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }],
        },
      };

      mockSheetsAPI.spreadsheets.create.mockResolvedValue(mockResponse);

      const result = await sheetsService.createSpreadsheet({
        title: 'My New Sheet',
      });

      expect(mockSheetsAPI.spreadsheets.create).toHaveBeenCalledWith({
        requestBody: {
          properties: { title: 'My New Sheet' },
          sheets: undefined,
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.spreadsheetId).toBe('new-spreadsheet-id');
      expect(response.title).toBe('My New Sheet');
    });

    it('should create a spreadsheet with custom sheet titles', async () => {
      const mockResponse = {
        data: {
          spreadsheetId: 'new-id',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/new-id',
          properties: { title: 'Budget' },
          sheets: [
            { properties: { sheetId: 0, title: 'Summary' } },
            { properties: { sheetId: 1, title: 'Data' } },
          ],
        },
      };

      mockSheetsAPI.spreadsheets.create.mockResolvedValue(mockResponse);

      const result = await sheetsService.createSpreadsheet({
        title: 'Budget',
        sheetTitles: ['Summary', 'Data'],
      });

      expect(mockSheetsAPI.spreadsheets.create).toHaveBeenCalledWith({
        requestBody: {
          properties: { title: 'Budget' },
          sheets: [
            { properties: { title: 'Summary' } },
            { properties: { title: 'Data' } },
          ],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.sheets).toHaveLength(2);
      expect(response.sheets[0].title).toBe('Summary');
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.create.mockRejectedValue(
        new Error('Create Error'),
      );

      const result = await sheetsService.createSpreadsheet({
        title: 'Error Sheet',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Create Error');
    });
  });

  describe('addSheet', () => {
    it('should add a new sheet to a spreadsheet', async () => {
      const mockResponse = {
        data: {
          replies: [
            {
              addSheet: {
                properties: { sheetId: 123, title: 'New Tab' },
              },
            },
          ],
        },
      };

      mockSheetsAPI.spreadsheets.batchUpdate.mockResolvedValue(mockResponse);

      const result = await sheetsService.addSheet({
        spreadsheetId: 'test-id',
        title: 'New Tab',
      });

      expect(mockSheetsAPI.spreadsheets.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'New Tab' } } }],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.sheetId).toBe(123);
      expect(response.title).toBe('New Tab');
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.batchUpdate.mockRejectedValue(
        new Error('AddSheet Error'),
      );

      const result = await sheetsService.addSheet({
        spreadsheetId: 'error-id',
        title: 'Bad Tab',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('AddSheet Error');
    });
  });

  describe('deleteSheet', () => {
    it('should delete a sheet from a spreadsheet', async () => {
      mockSheetsAPI.spreadsheets.batchUpdate.mockResolvedValue({ data: {} });

      const result = await sheetsService.deleteSheet({
        spreadsheetId: 'test-id',
        sheetId: 456,
      });

      expect(mockSheetsAPI.spreadsheets.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: 'test-id',
        requestBody: {
          requests: [{ deleteSheet: { sheetId: 456 } }],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Successfully deleted sheet 456');
    });

    it('should handle errors gracefully', async () => {
      mockSheetsAPI.spreadsheets.batchUpdate.mockRejectedValue(
        new Error('DeleteSheet Error'),
      );

      const result = await sheetsService.deleteSheet({
        spreadsheetId: 'error-id',
        sheetId: 999,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('DeleteSheet Error');
    });
  });
});
