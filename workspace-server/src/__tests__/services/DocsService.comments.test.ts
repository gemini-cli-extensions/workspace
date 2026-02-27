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
import { DocsService } from '../../services/DocsService';
import { DriveService } from '../../services/DriveService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');
jest.mock('dompurify', () => {
  return jest.fn().mockImplementation(() => ({
    sanitize: jest.fn((content) => content),
  }));
});

describe('DocsService Comments and Suggestions', () => {
  let docsService: DocsService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockDriveService: jest.Mocked<DriveService>;
  let mockDocsAPI: any;
  let mockDriveAPI: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    mockDriveService = {
      findFolder: jest.fn(),
    } as any;

    mockDocsAPI = {
      documents: {
        get: jest.fn(),
        create: jest.fn(),
        batchUpdate: jest.fn(),
      },
    };

    mockDriveAPI = {
      files: {
        create: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
        update: jest.fn(),
      },
      comments: {
        list: jest.fn(),
      },
    };

    (google.docs as jest.Mock) = jest.fn().mockReturnValue(mockDocsAPI);
    (google.drive as jest.Mock) = jest.fn().mockReturnValue(mockDriveAPI);

    docsService = new DocsService(mockAuthManager, mockDriveService);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getSuggestions', () => {
    it('should return suggestions as type text with JSON-stringified array', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'Suggested insertion',
                        suggestedInsertionIds: ['ins1'],
                      },
                      startIndex: 1,
                      endIndex: 20,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      expect(result.content[0].type).toBe('text');
      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual({
        type: 'insertion',
        text: 'Suggested insertion',
        suggestionIds: ['ins1'],
        startIndex: 1,
        endIndex: 20,
      });
    });

    it('should extract insertion suggestions correctly', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'new text',
                        suggestedInsertionIds: ['sug-1', 'sug-2'],
                      },
                      startIndex: 5,
                      endIndex: 13,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('insertion');
      expect(suggestions[0].suggestionIds).toEqual(['sug-1', 'sug-2']);
    });

    it('should extract deletion suggestions correctly', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'deleted text',
                        suggestedDeletionIds: ['del-1'],
                      },
                      startIndex: 1,
                      endIndex: 13,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('deletion');
      expect(suggestions[0].text).toBe('deleted text');
    });

    it('should extract style change suggestions correctly', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'styled text',
                        suggestedTextStyleChanges: {
                          'style-1': { textStyle: { bold: true } },
                        },
                        textStyle: { bold: true },
                      },
                      startIndex: 1,
                      endIndex: 12,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('styleChange');
      expect(suggestions[0].suggestionIds).toEqual(['style-1']);
      expect(suggestions[0].textStyle).toEqual({ bold: true });
    });

    it('should extract paragraph style change suggestions', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  paragraphStyle: { namedStyleType: 'HEADING_1' },
                  suggestedParagraphStyleChanges: {
                    'sug-para-1': {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                    },
                  },
                  elements: [
                    {
                      textRun: { content: 'Heading Text' },
                      startIndex: 1,
                      endIndex: 13,
                    },
                  ],
                },
                startIndex: 1,
                endIndex: 13,
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('paragraphStyleChange');
      expect(suggestions[0].suggestionIds).toEqual(['sug-para-1']);
      expect(suggestions[0].namedStyleType).toBe('HEADING_2');
      expect(suggestions[0].text).toBe('Heading Text');
    });

    it('should handle tables with recursive element processing', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                table: {
                  tableRows: [
                    {
                      tableCells: [
                        {
                          content: [
                            {
                              paragraph: {
                                elements: [
                                  {
                                    textRun: {
                                      content: 'cell text',
                                      suggestedInsertionIds: ['cell-ins-1'],
                                    },
                                    startIndex: 5,
                                    endIndex: 14,
                                  },
                                ],
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].type).toBe('insertion');
      expect(suggestions[0].text).toBe('cell text');
    });

    it('should handle empty document body', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: { body: null },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockDocsAPI.documents.get.mockRejectedValue(new Error('Docs API failed'));

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ error: 'Docs API failed' });
    });

    it('should create one suggestion entry per paragraph suggestion ID', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  suggestedParagraphStyleChanges: {
                    'sug-1': {
                      paragraphStyle: { namedStyleType: 'HEADING_1' },
                    },
                    'sug-2': {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                    },
                  },
                  elements: [
                    {
                      textRun: { content: 'Some heading' },
                      startIndex: 1,
                      endIndex: 13,
                    },
                  ],
                },
                startIndex: 1,
                endIndex: 13,
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(2);
      const types = suggestions.map((s: any) => s.type);
      expect(types).toEqual(['paragraphStyleChange', 'paragraphStyleChange']);
      const ids = suggestions.map((s: any) => s.suggestionIds[0]);
      expect(ids).toContain('sug-1');
      expect(ids).toContain('sug-2');
      const named = suggestions.map((s: any) => s.namedStyleType);
      expect(named).toContain('HEADING_1');
      expect(named).toContain('HEADING_2');
    });

    it('should handle undefined textRun.content with empty string fallback', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: undefined,
                        suggestedInsertionIds: ['ins-undef'],
                      },
                      startIndex: 1,
                      endIndex: 5,
                    },
                  ],
                },
              },
            ],
          },
        },
      });

      const result = await docsService.getSuggestions({
        documentId: 'test-doc-id',
      });

      const suggestions = JSON.parse(result.content[0].text);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].text).toBe('');
    });
  });

  describe('getComments', () => {
    it('should return comments as type text with JSON-stringified array', async () => {
      const mockComments = [
        {
          id: 'comment1',
          content: 'This is a comment.',
          author: {
            displayName: 'Test User',
            emailAddress: 'test@example.com',
          },
          createdTime: '2025-01-01T00:00:00Z',
          resolved: false,
          quotedFileContent: { value: 'quoted text' },
          replies: [],
        },
      ];
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: mockComments },
      });

      const result = await docsService.getComments({
        documentId: 'test-doc-id',
      });

      expect(result.content[0].type).toBe('text');
      const comments = JSON.parse(result.content[0].text);
      expect(comments).toEqual(mockComments);
    });

    it('should include replies in comment threads', async () => {
      const mockComments = [
        {
          id: 'comment1',
          content: 'Top-level comment.',
          author: { displayName: 'Alice', emailAddress: 'alice@example.com' },
          createdTime: '2025-01-01T00:00:00Z',
          resolved: false,
          quotedFileContent: { value: 'some text' },
          replies: [
            {
              id: 'reply1',
              content: 'Reply to comment.',
              author: {
                displayName: 'Bob',
                emailAddress: 'bob@example.com',
              },
              createdTime: '2025-01-02T00:00:00Z',
            },
          ],
        },
      ];
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: mockComments },
      });

      const result = await docsService.getComments({
        documentId: 'test-doc-id',
      });

      expect(result.content[0].type).toBe('text');
      const comments = JSON.parse(result.content[0].text);
      expect(comments).toHaveLength(1);
      expect(comments[0].replies).toHaveLength(1);
      expect(comments[0].replies[0].id).toBe('reply1');
      expect(comments[0].replies[0].content).toBe('Reply to comment.');
    });

    it('should request replies fields in the Drive API call', async () => {
      mockDriveAPI.comments.list.mockResolvedValue({ data: { comments: [] } });

      await docsService.getComments({ documentId: 'test-doc-id' });

      expect(mockDriveAPI.comments.list).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: expect.stringContaining('replies('),
        }),
      );
    });

    it('should handle empty comments list', async () => {
      mockDriveAPI.comments.list.mockResolvedValue({
        data: { comments: [] },
      });

      const result = await docsService.getComments({
        documentId: 'test-doc-id',
      });

      const comments = JSON.parse(result.content[0].text);
      expect(comments).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      mockDriveAPI.comments.list.mockRejectedValue(
        new Error('Comments API failed'),
      );

      const result = await docsService.getComments({
        documentId: 'test-doc-id',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual({ error: 'Comments API failed' });
    });
  });
});
