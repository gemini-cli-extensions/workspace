/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { DriveService } from '../../services/DriveService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');
jest.mock('node:fs');
jest.mock('node:path', () => {
  const actualPath = jest.requireActual('node:path') as any;
  return {
    ...actualPath,
    resolve: jest.fn((...args: string[]) => args.join('/')),
    dirname: jest.fn((p: string) => p.substring(0, p.lastIndexOf('/'))),
    isAbsolute: jest.fn((p: string) => p.startsWith('/')),
  };
});
jest.mock('../../utils/paths', () => ({
  PROJECT_ROOT: '/mock/project/root',
  ENCRYPTED_TOKEN_PATH: '/mock/project/root/token.json',
  ENCRYPTION_MASTER_KEY_PATH: '/mock/project/root/key',
}));

import * as fs from 'node:fs';

describe('DriveService', () => {
  let driveService: DriveService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockDriveAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Drive API
    mockDriveAPI = {
      files: {
        list: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    // Mock the google.drive constructor
    (google.drive as jest.Mock) = jest.fn().mockReturnValue(mockDriveAPI);

    // Create DriveService instance
    driveService = new DriveService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('findFolder', () => {
    it('should find folders by name', async () => {
      const mockFolders = [
        { id: 'folder1', name: 'TestFolder' },
        { id: 'folder2', name: 'TestFolder' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFolders,
        },
      });

      const result = await driveService.findFolder({ folderName: 'TestFolder' });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "mimeType='application/vnd.google-apps.folder' and name = 'TestFolder'",
        fields: 'files(id, name)',
        spaces: 'drive',
      });

      expect(JSON.parse(result.content[0].text)).toEqual(mockFolders);
    });

    it('should return empty array when no folders found', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [],
        },
      });

      const result = await driveService.findFolder({ folderName: 'NonExistentFolder' });

      expect(mockDriveAPI.files.list).toHaveBeenCalledTimes(1);
      expect(JSON.parse(result.content[0].text)).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('API request failed');
      mockDriveAPI.files.list.mockRejectedValue(apiError);

      const result = await driveService.findFolder({ folderName: 'TestFolder' });

      expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API request failed' });
    });
  });

  describe('search', () => {
    it('should search files with custom query', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', modifiedTime: '2024-01-01T00:00:00Z' },
        { id: 'file2', name: 'Spreadsheet.xlsx', modifiedTime: '2024-01-02T00:00:00Z' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
          nextPageToken: 'next-token',
        },
      });

      const result = await driveService.search({
        query: "name contains 'Document'",
        pageSize: 20,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "name contains 'Document'",
        pageSize: 20,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
      expect(responseData.nextPageToken).toBe('next-token');
    });

    it('should construct query if no field specifier is present', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', modifiedTime: '2024-01-01T00:00:00Z' },
        { id: 'file2', name: 'Spreadsheet.xlsx', modifiedTime: '2024-01-02T00:00:00Z' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
          nextPageToken: 'next-token',
        },
      });

      const result = await driveService.search({
        query: "My Document",
        pageSize: 20,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "fullText contains 'My Document'",
        pageSize: 20,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
      expect(responseData.nextPageToken).toBe('next-token');
    });

    it('should escape special characters in search query', async () => {
      const mockFiles = [
        { id: 'file1', name: "John's Report.pdf", modifiedTime: '2024-01-01T00:00:00Z' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: "John's \\Report",
        pageSize: 10,
      });

      // Verify that single quotes and backslashes are properly escaped
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "fullText contains 'John\\'s \\\\Report'",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should search by title when query starts with title:', async () => {
      const mockFiles = [
        { id: 'file1', name: 'My Document.pdf', modifiedTime: '2024-01-01T00:00:00Z' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'title:My Document',
        pageSize: 10,
      });

      // Should only search in name field when title: prefix is used
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "name contains 'My Document'",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle quoted title searches', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Test Document', modifiedTime: '2024-01-01T00:00:00Z' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'title:"Test Document"',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "name contains 'Test Document'",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle sharedWithMe filter', async () => {
      const mockFiles = [
        { id: 'shared1', name: 'SharedDoc.pdf', modifiedTime: '2024-01-01T00:00:00Z' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        sharedWithMe: true,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: 'sharedWithMe',
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should filter unread files when unreadOnly is true', async () => {
      const mockFiles = [
        { id: 'file1', name: 'ReadDoc.pdf', viewedByMeTime: '2024-01-01T00:00:00Z' },
        { id: 'file2', name: 'UnreadDoc.pdf', viewedByMeTime: null },
        { id: 'file3', name: 'UnreadSpreadsheet.xlsx' }, // No viewedByMeTime property
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'type = "document"',
        unreadOnly: true,
      });

      const responseData = JSON.parse(result.content[0].text);
      // Should only include files without viewedByMeTime
      expect(responseData.files).toHaveLength(2);
      expect(responseData.files[0].id).toBe('file2');
      expect(responseData.files[1].id).toBe('file3');
    });

    it('should use pagination token', async () => {
      const mockFiles = [
        { id: 'file3', name: 'Page2Doc.pdf' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      await driveService.search({
        query: 'type = "document"',
        pageToken: 'previous-token',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: 'type = "document"',
        pageSize: 10,
        pageToken: 'previous-token',
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });
    });

    it('should handle corpus parameter', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [],
        },
      });

      await driveService.search({
        query: 'type = "document"',
        corpus: 'domain',
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: 'type = "document"',
        pageSize: 10,
        pageToken: undefined,
        corpus: 'domain',
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Search API failed');
      mockDriveAPI.files.list.mockRejectedValue(apiError);

      const result = await driveService.search({
        query: 'type = "document"',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({ error: 'Search API failed' });
    });

    it('should use default values when parameters are not provided', async () => {
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: [],
        },
      });

      await driveService.search({});

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: undefined,
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });
    });

    it('should handle Google Drive folder URLs', async () => {
      const mockFiles = [
        { id: 'folder123', name: 'My Folder', mimeType: 'application/vnd.google-apps.folder' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/drive/folders/folder123',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'folder123' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle corporate Google Drive folder URLs', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', mimeType: 'application/pdf' },
        { id: 'file2', name: 'Image.png', mimeType: 'image/png' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/corp/drive/u/0/folders/1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle Google Drive file URLs', async () => {
      const mockFile = { id: 'file456', name: 'My Document.pdf', mimeType: 'application/pdf' };

      mockDriveAPI.files.get.mockResolvedValue({
        data: mockFile,
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/file/d/file456/view',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'file456',
        fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
      });
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual([mockFile]);
      expect(responseData.nextPageToken).toBeNull();
    });

    it('should handle Google Docs URLs', async () => {
      const mockFile = { id: 'doc789', name: 'My Document', mimeType: 'application/vnd.google-apps.document' };

      mockDriveAPI.files.get.mockResolvedValue({
        data: mockFile,
      });

      const result = await driveService.search({
        query: 'https://docs.google.com/document/d/doc789/edit',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'doc789',
        fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
      });
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual([mockFile]);
      expect(responseData.nextPageToken).toBeNull();
    });

    it('should handle invalid Google Drive URLs', async () => {
      const result = await driveService.search({
        query: 'https://drive.google.com/invalid/url',
        pageSize: 10,
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBe('Invalid Drive URL. Please provide a valid Google Drive URL or a search query.');
      expect(responseData.details).toBe('Could not extract file or folder ID from the provided URL.');

      // Should not call the API for invalid URLs
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();
    });

    it('should handle folder URLs with id parameter', async () => {
      const mockFolder = { id: 'folder789', name: 'My Folder', mimeType: 'application/vnd.google-apps.folder' };
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', mimeType: 'application/pdf' },
      ];

      mockDriveAPI.files.get.mockResolvedValue({
        data: mockFolder,
      });
      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/drive?id=folder789',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'folder789',
        fields: 'mimeType',
      });
      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'folder789' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

    it('should handle file URLs with id parameter', async () => {
      const mockFile = { id: 'file123', name: 'My File.pdf', mimeType: 'application/pdf' };

      mockDriveAPI.files.get.mockResolvedValueOnce({
        data: { mimeType: 'application/pdf' },
      }).mockResolvedValueOnce({
        data: mockFile,
      });

      const result = await driveService.search({
        query: 'https://drive.google.com/drive?id=file123',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'file123',
        fields: 'mimeType',
      });
      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: 'file123',
        fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
      });
      expect(mockDriveAPI.files.list).not.toHaveBeenCalled();

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual([mockFile]);
    });

    it('should handle raw Drive IDs as folder queries', async () => {
      const mockFiles = [
        { id: 'file1', name: 'Document.pdf', mimeType: 'application/pdf' },
        { id: 'file2', name: 'Spreadsheet.xlsx', mimeType: 'application/vnd.google-apps.spreadsheet' },
      ];

      mockDriveAPI.files.list.mockResolvedValue({
        data: {
          files: mockFiles,
        },
      });

      const result = await driveService.search({
        query: '1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u',
        pageSize: 10,
      });

      expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
        q: "'1Ahs8C3GFWBZnrzQ44z0OR07hNQTWlE7u' in parents",
        pageSize: 10,
        pageToken: undefined,
        corpus: undefined,
        fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
      });

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.files).toEqual(mockFiles);
    });

        it('should not wrap a valid query in full-text search', async () => {

          const mockFiles = [

            { id: 'file1', name: 'My File.pdf', mimeType: 'application/pdf' },

          ];

    

          mockDriveAPI.files.list.mockResolvedValue({

            data: {

              files: mockFiles,

            },

          });

    

          const result = await driveService.search({

            query: "'me' in owners",

            pageSize: 10,

          });

    

          expect(mockDriveAPI.files.list).toHaveBeenCalledWith({

            q: "'me' in owners",

            pageSize: 10,

            pageToken: undefined,

            corpus: undefined,

            fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',

          });

    

          const responseData = JSON.parse(result.content[0].text);

          expect(responseData.files).toEqual(mockFiles);

        });

  });

  describe('downloadFile', () => {
    it('should download files and save locally', async () => {
      const mockFileId = 'text-file-id';
      const mockContent = 'Hello, World!';
      const mockBuffer = Buffer.from(mockContent);
      const mockLocalPath = 'downloads/test.txt';

      mockDriveAPI.files.get.mockImplementation((params: any) => {
        if (params.alt === 'media') {
            return Promise.resolve({
                data: mockBuffer,
            });
        }
        return Promise.resolve({
            data: { id: mockFileId, name: 'test.txt', mimeType: 'text/plain' },
        });
      });

      (fs.existsSync as jest.Mock).mockReturnValue(true);

      const result = await driveService.downloadFile({ fileId: mockFileId, localPath: mockLocalPath });

      expect(mockDriveAPI.files.get).toHaveBeenCalledWith({
        fileId: mockFileId,
        fields: 'id, name, mimeType',
      });

      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result.content[0].text).toContain(`Successfully downloaded file test.txt`);
    });

    it('should suggest specialized tools for workspace types', async () => {
      const mockFileId = 'doc-id';
      mockDriveAPI.files.get.mockResolvedValue({
        data: { mimeType: 'application/vnd.google-apps.document' },
      });

      const result = await driveService.downloadFile({ fileId: mockFileId, localPath: 'any' });

      expect(result.content[0].text).toContain("Direct direct media download is not supported");
      expect(mockDriveAPI.files.get).toHaveBeenCalledTimes(1);
    });

    it('should handle API errors', async () => {
      const mockFileId = 'error-file-id';
      mockDriveAPI.files.get.mockRejectedValue(new Error('API Error'));

      const result = await driveService.downloadFile({ fileId: mockFileId, localPath: 'any' });

      expect(result.content[0].text).toContain('API Error');
    });
  });
});