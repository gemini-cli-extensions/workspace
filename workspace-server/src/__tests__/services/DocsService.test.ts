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
import {
  DocsService,
  SAFE_DOCS_FIELD_MASK,
  TABS_FIELD_MASK,
} from '../../services/DocsService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('DocsService', () => {
  let docsService: DocsService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockDocsAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Docs API
    mockDocsAPI = {
      documents: {
        get: jest.fn(),
        create: jest.fn(),
        batchUpdate: jest.fn(),
      },
    };

    // Mock the google constructors
    (google.docs as jest.Mock) = jest.fn().mockReturnValue(mockDocsAPI);

    // Create DocsService instance
    docsService = new DocsService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a blank document', async () => {
      const mockDoc = {
        data: {
          documentId: 'test-doc-id',
          title: 'Test Title',
        },
      };
      mockDocsAPI.documents.create.mockResolvedValue(mockDoc);

      const result = await docsService.create({ title: 'Test Title' });

      expect(mockDocsAPI.documents.create).toHaveBeenCalledWith({
        requestBody: { title: 'Test Title' },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        documentId: 'test-doc-id',
        title: 'Test Title',
      });
    });

    it('should create a document with initial content', async () => {
      const mockDoc = {
        data: {
          documentId: 'test-doc-id',
          title: 'Test Title',
        },
      };
      mockDocsAPI.documents.create.mockResolvedValue(mockDoc);
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.create({
        title: 'Test Title',
        content: 'Hello World',
      });

      expect(mockDocsAPI.documents.create).toHaveBeenCalledWith({
        requestBody: { title: 'Test Title' },
      });
      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: 'Hello World',
              },
            },
          ],
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        documentId: 'test-doc-id',
        title: 'Test Title',
      });
    });

    it('should handle errors during document creation', async () => {
      const apiError = new Error('API Error');
      mockDocsAPI.documents.create.mockRejectedValue(apiError);

      const result = await docsService.create({ title: 'Test Title' });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API Error',
      });
    });
  });

  describe('writeText', () => {
    it('should write text to beginning of document', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.writeText({
        documentId: 'test-doc-id',
        text: 'Hello',
        position: 'beginning',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1, tabId: undefined },
                text: 'Hello',
              },
            },
          ],
        },
      });
      expect(result.content[0].text).toContain(
        'Successfully wrote text to document test-doc-id',
      );
    });

    it('should write text to end of document (default)', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.writeText({
        documentId: 'test-doc-id',
        text: ' Appended',
      });

      // Optimized path: no documents.get call needed
      expect(mockDocsAPI.documents.get).not.toHaveBeenCalled();
      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [{ insertText: { text: ' Appended' } }],
        },
      });
      expect(result.content[0].text).toContain(
        'Successfully wrote text to document test-doc-id',
      );
    });

    it('should write text at a specific numeric index', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.writeText({
        documentId: 'test-doc-id',
        text: 'Inserted',
        position: '5',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 5, tabId: undefined },
                text: 'Inserted',
              },
            },
          ],
        },
      });
    });

    it('should reject invalid position values', async () => {
      const result = await docsService.writeText({
        documentId: 'test-doc-id',
        text: 'Hello',
        position: 'invalid',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error:
          'Invalid position: "invalid". Use "beginning", "end", or a positive integer index.',
      });
    });

    it('should write text to a specific tab', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.writeText({
        documentId: 'test-doc-id',
        text: 'Hello',
        position: 'beginning',
        tabId: 'tab-1',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              insertText: {
                location: {
                  index: 1,
                  tabId: 'tab-1',
                },
                text: 'Hello',
              },
            },
          ],
        },
      });
    });

    it('should handle errors during writeText', async () => {
      const apiError = new Error('API Error');
      mockDocsAPI.documents.batchUpdate.mockRejectedValue(apiError);

      const result = await docsService.writeText({
        documentId: 'test-doc-id',
        text: 'Hello',
        position: 'beginning',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API Error',
      });
    });
  });

  describe('formatText', () => {
    it('should apply bold and italic text styles', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [
          { startIndex: 1, endIndex: 10, style: 'bold' },
          { startIndex: 12, endIndex: 20, style: 'italic' },
        ],
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                range: { startIndex: 1, endIndex: 10, tabId: undefined },
                textStyle: { bold: true },
                fields: 'bold',
              },
            },
            {
              updateTextStyle: {
                range: { startIndex: 12, endIndex: 20, tabId: undefined },
                textStyle: { italic: true },
                fields: 'italic',
              },
            },
          ],
        },
      });
      expect(result.content[0].text).toContain(
        'Successfully applied 2 formatting change(s)',
      );
    });

    it('should apply heading paragraph styles', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [{ startIndex: 1, endIndex: 15, style: 'heading1' }],
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              updateParagraphStyle: {
                range: { startIndex: 1, endIndex: 15, tabId: undefined },
                paragraphStyle: { namedStyleType: 'HEADING_1' },
                fields: 'namedStyleType',
              },
            },
          ],
        },
      });
      expect(result.content[0].text).toContain(
        'Successfully applied 1 formatting change(s)',
      );
    });

    it('should apply code (monospace) formatting', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [{ startIndex: 5, endIndex: 15, style: 'code' }],
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                range: { startIndex: 5, endIndex: 15, tabId: undefined },
                textStyle: {
                  weightedFontFamily: { fontFamily: 'Courier New' },
                },
                fields: 'weightedFontFamily',
              },
            },
          ],
        },
      });
    });

    it('should apply link formatting with URL', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [
          {
            startIndex: 1,
            endIndex: 10,
            style: 'link',
            url: 'https://example.com',
          },
        ],
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                range: { startIndex: 1, endIndex: 10, tabId: undefined },
                textStyle: { link: { url: 'https://example.com' } },
                fields: 'link',
              },
            },
          ],
        },
      });
    });

    it('should pass tabId to formatting requests', async () => {
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [{ startIndex: 1, endIndex: 5, style: 'bold' }],
        tabId: 'tab-123',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                range: { startIndex: 1, endIndex: 5, tabId: 'tab-123' },
                textStyle: { bold: true },
                fields: 'bold',
              },
            },
          ],
        },
      });
    });

    it('should return message for unknown format styles', async () => {
      const result = await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [{ startIndex: 1, endIndex: 5, style: 'unknownStyle' }],
      });

      expect(result.content[0].text).toBe(
        'No valid formatting requests to apply.',
      );
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it('should handle API errors gracefully', async () => {
      mockDocsAPI.documents.batchUpdate.mockRejectedValue(
        new Error('Permission denied'),
      );

      const result = await docsService.formatText({
        documentId: 'test-doc-id',
        formats: [{ startIndex: 1, endIndex: 5, style: 'bold' }],
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Permission denied',
      });
    });
  });

  describe('getText', () => {
    it('should extract text from a document', async () => {
      const mockDoc = {
        data: {
          tabs: [
            {
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            textRun: {
                              content: 'Hello World\n',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      };
      mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

      const result = await docsService.getText({ documentId: 'test-doc-id' });

      expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        fields: `title,${TABS_FIELD_MASK}`,
        includeTabsContent: true,
        suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS',
      });
      expect(result.content[0].text).toBe('Hello World\n');
    });

    it('should handle errors during getText', async () => {
      const apiError = new Error('API Error');
      mockDocsAPI.documents.get.mockRejectedValue(apiError);

      const result = await docsService.getText({ documentId: 'test-doc-id' });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API Error',
      });
    });

    it('should extract text from a specific tab', async () => {
      const mockDoc = {
        data: {
          tabs: [
            {
              tabProperties: { tabId: 'tab-1', title: 'Tab 1' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Tab 1 Content' } }],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      };
      mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

      const result = await docsService.getText({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
      });

      expect(result.content[0].text).toBe('Tab 1 Content');
    });

    it('should return all tabs if no tabId provided and tabs exist', async () => {
      const mockDoc = {
        data: {
          title: 'Multi-Tab Document',
          tabs: [
            {
              tabProperties: { tabId: 'tab-1', title: 'Tab 1' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Tab 1 Content' } }],
                      },
                    },
                  ],
                },
              },
            },
            {
              tabProperties: { tabId: 'tab-2', title: 'Tab 2' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Tab 2 Content' } }],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      };
      mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

      const result = await docsService.getText({ documentId: 'test-doc-id' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.title).toBe('Multi-Tab Document');
      expect(parsed.tabs).toHaveLength(2);
      expect(parsed.tabs[0]).toEqual({
        tabId: 'tab-1',
        title: 'Tab 1',
        content: 'Tab 1 Content',
        index: 0,
      });
      expect(parsed.tabs[1]).toEqual({
        tabId: 'tab-2',
        title: 'Tab 2',
        content: 'Tab 2 Content',
        index: 1,
      });
    });

    /** Helper to wrap paragraph elements in the standard mock doc structure. */
    const mockDocWithElements = (...elements: Record<string, unknown>[]) => ({
      data: {
        tabs: [
          {
            documentTab: {
              body: {
                content: [{ paragraph: { elements } }],
              },
            },
          },
        ],
      },
    });

    it('should extract text from smart chips (date, person, rich link)', async () => {
      const mockDoc = mockDocWithElements(
        { textRun: { content: 'Meeting on ' } },
        {
          dateElement: {
            dateElementProperties: {
              displayText: 'Jan 15, 2025',
              timestamp: '1736899200',
            },
          },
        },
        { textRun: { content: ' with ' } },
        {
          person: {
            personProperties: {
              name: 'John Doe',
              email: 'john@example.com',
            },
          },
        },
        { textRun: { content: ' - see ' } },
        {
          richLink: {
            richLinkProperties: {
              title: 'Project Plan',
              uri: 'https://docs.google.com/document/d/abc123',
            },
          },
        },
        { textRun: { content: '\n' } },
      );
      mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

      const result = await docsService.getText({ documentId: 'test-doc-id' });

      expect(result.content[0].text).toBe(
        'Meeting on Jan 15, 2025 with [John Doe](mailto:john@example.com) - see [Project Plan](https://docs.google.com/document/d/abc123)\n',
      );
    });

    it.each([
      {
        name: 'person without name falls back to email',
        element: {
          person: {
            personProperties: {
              email: 'jane@example.com',
            },
          },
        },
        expected: '[jane@example.com](mailto:jane@example.com)',
      },
      {
        name: 'person without email falls back to name only',
        element: {
          person: {
            personProperties: {
              name: 'John Doe',
            },
          },
        },
        expected: 'John Doe',
      },
      {
        name: 'rich link without title falls back to uri',
        element: {
          richLink: {
            richLinkProperties: {
              uri: 'https://docs.google.com/spreadsheets/d/xyz',
            },
          },
        },
        expected:
          '[https://docs.google.com/spreadsheets/d/xyz](https://docs.google.com/spreadsheets/d/xyz)',
      },
      {
        name: 'rich link without uri falls back to title only',
        element: {
          richLink: {
            richLinkProperties: {
              title: 'Some Document',
            },
          },
        },
        expected: 'Some Document',
      },
      {
        name: 'date without displayText falls back to timestamp',
        element: {
          dateElement: {
            dateElementProperties: {
              timestamp: '1736899200',
            },
          },
        },
        expected: '1736899200',
      },
    ])(
      'should fall back correctly when $name',
      async ({ element, expected }) => {
        mockDocsAPI.documents.get.mockResolvedValue(
          mockDocWithElements(element),
        );

        const result = await docsService.getText({
          documentId: 'test-doc-id',
        });

        expect(result.content[0].text).toBe(expected);
      },
    );

    it('should include text from nested child tabs', async () => {
      const mockDoc = {
        data: {
          title: 'Nested Tabs Doc',
          tabs: [
            {
              tabProperties: { tabId: 'parent-tab', title: 'Parent' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Parent Content' } }],
                      },
                    },
                  ],
                },
              },
              childTabs: [
                {
                  tabProperties: { tabId: 'child-tab', title: 'Child' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              { textRun: { content: 'Child Content' } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      };
      mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

      const result = await docsService.getText({ documentId: 'test-doc-id' });
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.title).toBe('Nested Tabs Doc');
      expect(parsed.tabs).toHaveLength(2);
      expect(parsed.tabs[0]).toEqual({
        tabId: 'parent-tab',
        title: 'Parent',
        content: 'Parent Content',
        index: 0,
      });
      expect(parsed.tabs[1]).toEqual({
        tabId: 'child-tab',
        title: 'Child',
        content: 'Child Content',
        index: 1,
      });
    });

    it('should find a child tab by tabId', async () => {
      const mockDoc = {
        data: {
          tabs: [
            {
              tabProperties: { tabId: 'parent-tab', title: 'Parent' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Parent Content' } }],
                      },
                    },
                  ],
                },
              },
              childTabs: [
                {
                  tabProperties: { tabId: 'child-tab', title: 'Child' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              { textRun: { content: 'Child Content' } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      };
      mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

      const result = await docsService.getText({
        documentId: 'test-doc-id',
        tabId: 'child-tab',
      });

      expect(result.content[0].text).toBe('Child Content');
    });
  });

  describe('replaceText', () => {
    it('should replace text in a document', async () => {
      // Mock the document get call that finds occurrences
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          { textRun: { content: 'Hello world! Hello again!' } },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          documentId: 'test-doc-id',
          replies: [],
        },
      });

      const result = await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'Hello',
        replaceText: 'Hi',
      });

      expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        fields: SAFE_DOCS_FIELD_MASK,
        includeTabsContent: true,
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: expect.arrayContaining([
            expect.objectContaining({
              deleteContentRange: {
                range: {
                  tabId: undefined,
                  startIndex: 1,
                  endIndex: 6,
                },
              },
            }),
            expect.objectContaining({
              insertText: {
                location: {
                  tabId: undefined,
                  index: 1,
                },
                text: 'Hi',
              },
            }),
          ]),
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        documentId: 'test-doc-id',
        revisionId: 'rev-1',
        matchCount: 2,
      });
    });

    it('should replace text with literal content (no markdown parsing)', async () => {
      // Mock the document get call that finds occurrences
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [
                          {
                            textRun: {
                              content: 'Replace this text and this text too.',
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: {
          documentId: 'test-doc-id',
          replies: [],
        },
      });

      const result = await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'this text',
        replaceText: '**bold text**',
      });

      expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        fields: SAFE_DOCS_FIELD_MASK,
        includeTabsContent: true,
      });

      // Text is inserted literally — no markdown parsing
      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            // Highest index first, so earlier ranges do not move.
            {
              deleteContentRange: {
                range: {
                  tabId: undefined,
                  startIndex: 23,
                  endIndex: 32,
                },
              },
            },
            {
              insertText: {
                location: {
                  tabId: undefined,
                  index: 23,
                },
                text: '**bold text**',
              },
            },
            {
              deleteContentRange: {
                range: {
                  tabId: undefined,
                  startIndex: 9,
                  endIndex: 18,
                },
              },
            },
            {
              insertText: {
                location: {
                  tabId: undefined,
                  index: 9,
                },
                text: '**bold text**',
              },
            },
          ],
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
      expect(JSON.parse(result.content[0].text).matchCount).toBe(2);
    });

    it('should handle errors during replaceText', async () => {
      // Mock the document get call
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Hello world!' } }],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      const apiError = new Error('API Error');
      mockDocsAPI.documents.batchUpdate.mockRejectedValue(apiError);

      const result = await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'Hello',
        replaceText: 'Hi',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'API Error',
      });
    });

    it('should replace text in a specific tab using delete/insert', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              tabProperties: { tabId: 'tab-1' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Hello world!' } }],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: { documentId: 'test-doc-id' },
      });

      await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'Hello',
        replaceText: 'Hi',
        tabId: 'tab-1',
      });

      // Should use deleteContentRange and insertText instead of replaceAllText
      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: expect.arrayContaining([
            expect.objectContaining({
              deleteContentRange: {
                range: {
                  tabId: 'tab-1',
                  startIndex: 1,
                  endIndex: 6,
                },
              },
            }),
            expect.objectContaining({
              insertText: {
                location: {
                  tabId: 'tab-1',
                  index: 1,
                },
                text: 'Hi',
              },
            }),
          ]),
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
    });

    it('should replace text in a nested child tab by tabId', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              tabProperties: { tabId: 'parent-tab' },
              documentTab: {
                body: {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: 'Parent text' } }],
                      },
                    },
                  ],
                },
              },
              childTabs: [
                {
                  tabProperties: { tabId: 'child-tab' },
                  documentTab: {
                    body: {
                      content: [
                        {
                          paragraph: {
                            elements: [
                              { textRun: { content: 'Hello child!' } },
                            ],
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      });

      mockDocsAPI.documents.batchUpdate.mockResolvedValue({
        data: { documentId: 'test-doc-id' },
      });

      await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'Hello',
        replaceText: 'Hi',
        tabId: 'child-tab',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: expect.arrayContaining([
            expect.objectContaining({
              deleteContentRange: {
                range: {
                  tabId: 'child-tab',
                  startIndex: 1,
                  endIndex: 6,
                },
              },
            }),
            expect.objectContaining({
              insertText: {
                location: {
                  tabId: 'child-tab',
                  index: 1,
                },
                text: 'Hi',
              },
            }),
          ]),
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
    });

    it('uses API indexes after a rich link and locks the document revision', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              tabProperties: { tabId: 'tab-1' },
              documentTab: {
                body: {
                  content: [
                    {
                      startIndex: 1,
                      endIndex: 25,
                      paragraph: {
                        elements: [
                          {
                            startIndex: 1,
                            endIndex: 2,
                            richLink: {
                              richLinkProperties: {
                                title: 'Link',
                                uri: 'https://example.com',
                              },
                            },
                          },
                          {
                            startIndex: 10,
                            endIndex: 25,
                            textRun: { content: 'Replace target\n' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'target',
        replaceText: 'value',
        tabId: 'tab-1',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              deleteContentRange: {
                range: {
                  tabId: 'tab-1',
                  startIndex: 18,
                  endIndex: 24,
                },
              },
            },
            {
              insertText: {
                location: { tabId: 'tab-1', index: 18 },
                text: 'value',
              },
            },
          ],
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        matchCount: 1,
        revisionId: 'rev-1',
      });
    });

    it('matches text split across contiguous text runs', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              tabProperties: { tabId: 'tab-1' },
              documentTab: {
                body: {
                  content: [
                    {
                      startIndex: 100,
                      endIndex: 107,
                      paragraph: {
                        elements: [
                          {
                            startIndex: 100,
                            endIndex: 103,
                            textRun: { content: 'tar' },
                          },
                          {
                            startIndex: 103,
                            endIndex: 107,
                            textRun: { content: 'get\n' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'target',
        replaceText: 'value',
        tabId: 'tab-1',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              deleteContentRange: {
                range: {
                  tabId: 'tab-1',
                  startIndex: 100,
                  endIndex: 106,
                },
              },
            },
            {
              insertText: {
                location: { tabId: 'tab-1', index: 100 },
                text: 'value',
              },
            },
          ],
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
      expect(JSON.parse(result.content[0].text).matchCount).toBe(1);
    });

    it('uses actual indexes for text inside a table', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              tabProperties: { tabId: 'tab-1' },
              documentTab: {
                body: {
                  content: [
                    {
                      startIndex: 1,
                      endIndex: 80,
                      table: {
                        tableRows: [
                          {
                            tableCells: [
                              {
                                content: [
                                  {
                                    startIndex: 50,
                                    endIndex: 57,
                                    paragraph: {
                                      elements: [
                                        {
                                          startIndex: 50,
                                          endIndex: 57,
                                          textRun: { content: 'target\n' },
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
            },
          ],
        },
      });
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'target',
        replaceText: 'value',
        tabId: 'tab-1',
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            requests: expect.arrayContaining([
              {
                deleteContentRange: {
                  range: {
                    tabId: 'tab-1',
                    startIndex: 50,
                    endIndex: 56,
                  },
                },
              },
            ]),
          }),
        }),
      );
    });

    it('returns an explicit no-op when text is absent', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          revisionId: 'rev-1',
          tabs: [
            {
              tabProperties: { tabId: 'tab-1' },
              documentTab: {
                body: {
                  content: [
                    {
                      startIndex: 1,
                      endIndex: 6,
                      paragraph: {
                        elements: [
                          {
                            startIndex: 1,
                            endIndex: 6,
                            textRun: { content: 'other' },
                          },
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      const result = await docsService.replaceText({
        documentId: 'test-doc-id',
        findText: 'target',
        replaceText: 'value',
        tabId: 'tab-1',
      });

      expect(JSON.parse(result.content[0].text)).toMatchObject({
        revisionId: 'rev-1',
        matchCount: 0,
      });
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });
  });

  describe('safe structural editing', () => {
    const structuredDocument = {
      data: {
        title: 'Quota RFC',
        revisionId: 'rev-1',
        tabs: [
          {
            tabProperties: { tabId: 'tab-1', title: 'Quota spec' },
            documentTab: {
              body: {
                content: [
                  {
                    startIndex: 20,
                    endIndex: 29,
                    paragraph: {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                      elements: [
                        {
                          startIndex: 20,
                          endIndex: 29,
                          textRun: { content: 'Concepts\n' },
                        },
                      ],
                    },
                  },
                  {
                    startIndex: 29,
                    endIndex: 33,
                    paragraph: {
                      paragraphStyle: { namedStyleType: 'NORMAL_TEXT' },
                      elements: [
                        {
                          startIndex: 29,
                          endIndex: 33,
                          textRun: { content: 'Old\n' },
                        },
                      ],
                    },
                  },
                  {
                    startIndex: 33,
                    endIndex: 50,
                    paragraph: {
                      paragraphStyle: { namedStyleType: 'HEADING_2' },
                      elements: [
                        {
                          startIndex: 33,
                          endIndex: 50,
                          textRun: { content: 'Growth scenarios\n' },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    };

    it('returns tab-aware paragraph ranges and revision ID', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDocument);

      const result = await docsService.getStructure({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        documentId: 'test-doc-id',
        title: 'Quota RFC',
        revisionId: 'rev-1',
        tabs: [
          {
            tabId: 'tab-1',
            title: 'Quota spec',
            paragraphs: [
              {
                startIndex: 20,
                endIndex: 29,
                style: 'HEADING_2',
                text: 'Concepts\n',
              },
              {
                startIndex: 29,
                endIndex: 33,
                style: 'NORMAL_TEXT',
                text: 'Old\n',
              },
              {
                startIndex: 33,
                endIndex: 50,
                style: 'HEADING_2',
                text: 'Growth scenarios\n',
              },
            ],
          },
        ],
      });
    });

    it('previews a uniquely anchored section without writing', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDocument);

      const result = await docsService.previewReplaceSection({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
        startHeading: 'Concepts',
        endHeading: 'Growth scenarios',
      });

      expect(JSON.parse(result.content[0].text)).toMatchObject({
        revisionId: 'rev-1',
        range: { tabId: 'tab-1', startIndex: 20, endIndex: 33 },
        currentText: 'Concepts\nOld\n',
      });
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it('replaces a previewed section atomically with revision locking', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDocument);
      mockDocsAPI.documents.batchUpdate.mockResolvedValue({ data: {} });

      const result = await docsService.replaceSection({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
        startHeading: 'Concepts',
        endHeading: 'Growth scenarios',
        expectedRevisionId: 'rev-1',
        expectedText: 'Concepts\nOld\n',
        blocks: [
          { text: 'Concepts', style: 'HEADING_2' },
          { text: 'New body' },
        ],
      });

      expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'test-doc-id',
        requestBody: {
          requests: [
            {
              deleteContentRange: {
                range: {
                  tabId: 'tab-1',
                  startIndex: 20,
                  endIndex: 33,
                },
              },
            },
            {
              insertText: {
                location: { tabId: 'tab-1', index: 20 },
                text: 'Concepts\nNew body\n',
              },
            },
            {
              updateParagraphStyle: {
                range: {
                  tabId: 'tab-1',
                  startIndex: 20,
                  endIndex: 29,
                },
                paragraphStyle: { namedStyleType: 'HEADING_2' },
                fields: 'namedStyleType',
              },
            },
          ],
          writeControl: { requiredRevisionId: 'rev-1' },
        },
      });
      expect(JSON.parse(result.content[0].text)).toMatchObject({
        replaced: true,
        revisionId: 'rev-1',
        range: { tabId: 'tab-1', startIndex: 20, endIndex: 33 },
      });
    });

    it('refuses replacement when the preview revision is stale', async () => {
      mockDocsAPI.documents.get.mockResolvedValue({
        ...structuredDocument,
        data: { ...structuredDocument.data, revisionId: 'rev-2' },
      });

      const result = await docsService.replaceSection({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
        startHeading: 'Concepts',
        endHeading: 'Growth scenarios',
        expectedRevisionId: 'rev-1',
        expectedText: 'Concepts\nOld\n',
        blocks: [{ text: 'Concepts', style: 'HEADING_2' }],
      });

      expect(JSON.parse(result.content[0].text).error).toContain(
        'revision changed',
      );
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it('refuses replacement when the section text differs from the preview', async () => {
      mockDocsAPI.documents.get.mockResolvedValue(structuredDocument);

      const result = await docsService.replaceSection({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
        startHeading: 'Concepts',
        endHeading: 'Growth scenarios',
        expectedRevisionId: 'rev-1',
        expectedText: 'Concepts\nDifferent body\n',
        blocks: [{ text: 'Concepts', style: 'HEADING_2' }],
      });

      expect(JSON.parse(result.content[0].text).error).toContain(
        'section text changed',
      );
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });

    it('refuses ambiguous section headings', async () => {
      const duplicateHeading =
        structuredDocument.data.tabs[0].documentTab.body.content[0];
      mockDocsAPI.documents.get.mockResolvedValue({
        data: {
          ...structuredDocument.data,
          tabs: [
            {
              ...structuredDocument.data.tabs[0],
              documentTab: {
                body: {
                  content: [
                    ...structuredDocument.data.tabs[0].documentTab.body.content,
                    {
                      ...duplicateHeading,
                      startIndex: 60,
                      endIndex: 69,
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      const result = await docsService.previewReplaceSection({
        documentId: 'test-doc-id',
        tabId: 'tab-1',
        startHeading: 'Concepts',
        endHeading: 'Growth scenarios',
      });

      expect(JSON.parse(result.content[0].text).error).toContain('found 2');
      expect(mockDocsAPI.documents.batchUpdate).not.toHaveBeenCalled();
    });
  });
});
