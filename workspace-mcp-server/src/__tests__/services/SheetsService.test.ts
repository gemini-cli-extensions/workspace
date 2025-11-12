/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
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
    let mockDriveAPI: any;

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
                values: {
                    get: jest.fn(),
                },
            },
        };

        mockDriveAPI = {
            files: {
                list: jest.fn(),
            },
        };

        // Mock the google constructors
        (google.sheets as jest.Mock) = jest.fn().mockReturnValue(mockSheetsAPI);
        (google.drive as jest.Mock) = jest.fn().mockReturnValue(mockDriveAPI);

        // Create SheetsService instance
        sheetsService = new SheetsService(mockAuthManager);

        const mockAuthClient = { access_token: 'test-token' };
        mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
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

            const result = await sheetsService.getText({ spreadsheetId: 'test-spreadsheet-id' });

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
                    sheets: [
                        { properties: { title: 'Sheet1' } },
                    ],
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
                format: 'csv'
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
                    sheets: [
                        { properties: { title: 'Sheet1' } },
                    ],
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
                format: 'json'
            });

            expect(result.content[0].type).toBe('text');
            const jsonResult = JSON.parse(result.content[0].text);
            expect(jsonResult.Sheet1).toEqual([['A', 'B'], ['1', '2']]);
        });

        it('should handle empty sheets', async () => {
            const mockSpreadsheet = {
                data: {
                    properties: {
                        title: 'Empty Test',
                    },
                    sheets: [
                        { properties: { title: 'EmptySheet' } },
                    ],
                },
            };

            const mockSheetData = {
                data: {
                    values: [],
                },
            };

            mockSheetsAPI.spreadsheets.get.mockResolvedValue(mockSpreadsheet);
            mockSheetsAPI.spreadsheets.values.get.mockResolvedValue(mockSheetData);

            const result = await sheetsService.getText({ spreadsheetId: 'test-spreadsheet-id' });

            expect(result.content[0].text).toContain('EmptySheet');
            expect(result.content[0].text).toContain('(Empty sheet)');
        });

        it('should handle errors gracefully', async () => {
            mockSheetsAPI.spreadsheets.get.mockRejectedValue(new Error('API Error'));

            const result = await sheetsService.getText({ spreadsheetId: 'error-spreadsheet-id' });

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
                range: 'Sheet1!A1:B3'
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
                range: 'Sheet1!Z100:Z200'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.values).toEqual([]);
        });

        it('should handle errors gracefully', async () => {
            mockSheetsAPI.spreadsheets.values.get.mockRejectedValue(new Error('Range Error'));

            const result = await sheetsService.getRange({ 
                spreadsheetId: 'error-id',
                range: 'InvalidRange'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe('Range Error');
        });
    });

    describe('find', () => {
        it('should find spreadsheets by query', async () => {
            const mockResponse = {
                data: {
                    files: [
                        { id: 'sheet1', name: 'Spreadsheet 1' },
                        { id: 'sheet2', name: 'Spreadsheet 2' },
                    ],
                    nextPageToken: 'next-token',
                },
            };

            mockDriveAPI.files.list.mockResolvedValue(mockResponse);

            const result = await sheetsService.find({ query: 'budget' });
            const response = JSON.parse(result.content[0].text);

            expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
                pageSize: 10,
                fields: 'nextPageToken, files(id, name)',
                q: "mimeType='application/vnd.google-apps.spreadsheet' and fullText contains 'budget'",
                pageToken: undefined,
            });

            expect(response.files).toHaveLength(2);
            expect(response.files[0].name).toBe('Spreadsheet 1');
            expect(response.nextPageToken).toBe('next-token');
        });

        it('should handle title-specific searches', async () => {
            const mockResponse = {
                data: {
                    files: [{ id: 'sheet1', name: 'Q4 Budget' }],
                },
            };

            mockDriveAPI.files.list.mockResolvedValue(mockResponse);

            const result = await sheetsService.find({ query: 'title:"Q4 Budget"' });
            const response = JSON.parse(result.content[0].text);

            expect(mockDriveAPI.files.list).toHaveBeenCalledWith(
                expect.objectContaining({
                    q: "mimeType='application/vnd.google-apps.spreadsheet' and name contains 'Q4 Budget'",
                })
            );

            expect(response.files).toHaveLength(1);
            expect(response.files[0].name).toBe('Q4 Budget');
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

            const result = await sheetsService.getMetadata({ spreadsheetId: 'test-id' });
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
            mockSheetsAPI.spreadsheets.get.mockRejectedValue(new Error('Metadata Error'));

            const result = await sheetsService.getMetadata({ spreadsheetId: 'error-id' });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Metadata Error');
        });
    });
});
