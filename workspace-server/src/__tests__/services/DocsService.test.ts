/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
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

describe('DocsService', () => {
    let docsService: DocsService;
    let mockAuthManager: jest.Mocked<AuthManager>;
    let mockDriveService: jest.Mocked<DriveService>;
    let mockDocsAPI: any;
    let mockDriveAPI: any;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Create mock AuthManager
        mockAuthManager = {
            getAuthenticatedClient: jest.fn(),
        } as any;

        // Create mock DriveService
        mockDriveService = {
            findFolder: jest.fn(),
        } as any;

        // Create mock Docs API
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
        };

        // Mock the google constructors
        (google.docs as jest.Mock) = jest.fn().mockReturnValue(mockDocsAPI);
        (google.drive as jest.Mock) = jest.fn().mockReturnValue(mockDriveAPI);

        // Create DocsService instance
        docsService = new DocsService(mockAuthManager, mockDriveService);

        const mockAuthClient = { access_token: 'test-token' };
        mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
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

        it('should create a document with markdown content', async () => {
            const mockFile = {
                data: {
                    id: 'test-doc-id',
                    name: 'Test Title',
                },
            };
            mockDriveAPI.files.create.mockResolvedValue(mockFile);

            const result = await docsService.create({ title: 'Test Title', markdown: '# Hello' });

            expect(mockDriveAPI.files.create).toHaveBeenCalled();
            expect(JSON.parse(result.content[0].text)).toEqual({
                documentId: 'test-doc-id',
                title: 'Test Title',
            });
        });

        it('should move the document to a folder if folderName is provided', async () => {
            const mockDoc = {
                data: {
                    documentId: 'test-doc-id',
                    title: 'Test Title',
                },
            };
            mockDocsAPI.documents.create.mockResolvedValue(mockDoc);
            mockDriveService.findFolder.mockResolvedValue({
                content: [{ type: 'text', text: JSON.stringify([{ id: 'test-folder-id', name: 'Test Folder' }]) }],
            });
            mockDriveAPI.files.get.mockResolvedValue({ data: { parents: ['root'] } });

            await docsService.create({ title: 'Test Title', folderName: 'Test Folder' });

            expect(mockDriveService.findFolder).toHaveBeenCalledWith({ folderName: 'Test Folder' });
            expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
                fileId: 'test-doc-id',
                addParents: 'test-folder-id',
                removeParents: 'root',
                fields: 'id, parents',
            });
        });

        it('should handle errors during document creation', async () => {
            const apiError = new Error('API Error');
            mockDocsAPI.documents.create.mockRejectedValue(apiError);

            const result = await docsService.create({ title: 'Test Title' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });
    });

    describe('insertText', () => {
        it('should insert text into a document', async () => {
            const mockResponse = {
                data: {
                    documentId: 'test-doc-id',
                    writeControl: {},
                },
            };
            mockDocsAPI.documents.batchUpdate.mockResolvedValue(mockResponse);

            const result = await docsService.insertText({ documentId: 'test-doc-id', text: 'Hello' });

            expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                requestBody: {
                    requests: [{
                        insertText: {
                            location: { index: 1 },
                            text: 'Hello',
                        },
                    }],
                },
            });
            expect(JSON.parse(result.content[0].text)).toEqual({
                documentId: 'test-doc-id',
                writeControl: {},
            });
        });

        it('should handle errors during text insertion', async () => {
            const apiError = new Error('API Error');
            mockDocsAPI.documents.batchUpdate.mockRejectedValue(apiError);

            const result = await docsService.insertText({ documentId: 'test-doc-id', text: 'Hello' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });

        it('should insert text into a specific tab', async () => {
            const mockResponse = {
                data: {
                    documentId: 'test-doc-id',
                    writeControl: {},
                },
            };
            mockDocsAPI.documents.batchUpdate.mockResolvedValue(mockResponse);

            const result = await docsService.insertText({ documentId: 'test-doc-id', text: 'Hello', tabId: 'tab-1' });

            expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                requestBody: {
                    requests: [{
                        insertText: {
                            location: { 
                                index: 1,
                                tabId: 'tab-1'
                            },
                            text: 'Hello',
                        },
                    }],
                },
            });
        });
    });

    describe('find', () => {
        it('should find documents with a given query', async () => {
            const mockResponse = {
                data: {
                    files: [{ id: 'test-doc-id', name: 'Test Document' }],
                    nextPageToken: 'next-page-token',
                },
            };
            mockDriveAPI.files.list.mockResolvedValue(mockResponse);

            const result = await docsService.find({ query: 'Test' });

            expect(mockDriveAPI.files.list).toHaveBeenCalledWith(expect.objectContaining({
                q: expect.stringContaining("fullText contains 'Test'"),
            }));
            expect(JSON.parse(result.content[0].text)).toEqual({
                files: [{ id: 'test-doc-id', name: 'Test Document' }],
                nextPageToken: 'next-page-token',
            });
        });

        it('should search by title when query starts with title:', async () => {
            const mockResponse = {
                data: {
                    files: [{ id: 'test-doc-id', name: 'Test Document' }],
                },
            };
            mockDriveAPI.files.list.mockResolvedValue(mockResponse);

            const result = await docsService.find({ query: 'title:Test Document' });

            expect(mockDriveAPI.files.list).toHaveBeenCalledWith(expect.objectContaining({
                q: expect.stringContaining("name contains 'Test Document'"),
            }));
            expect(mockDriveAPI.files.list).toHaveBeenCalledWith(expect.objectContaining({
                q: expect.not.stringContaining("fullText contains"),
            }));
            expect(JSON.parse(result.content[0].text)).toEqual({
                files: [{ id: 'test-doc-id', name: 'Test Document' }],
            });
        });

        it('should handle errors during find', async () => {
            const apiError = new Error('API Error');
            mockDriveAPI.files.list.mockRejectedValue(apiError);

            const result = await docsService.find({ query: 'Test' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });
    });

    describe('move', () => {
        it('should move a document to a folder', async () => {
            mockDriveService.findFolder.mockResolvedValue({
                content: [{ type: 'text', text: JSON.stringify([{ id: 'test-folder-id', name: 'Test Folder' }]) }],
            });
            mockDriveAPI.files.get.mockResolvedValue({ data: { parents: ['root'] } });

            const result = await docsService.move({ documentId: 'test-doc-id', folderName: 'Test Folder' });

            expect(mockDriveService.findFolder).toHaveBeenCalledWith({ folderName: 'Test Folder' });
            expect(mockDriveAPI.files.update).toHaveBeenCalledWith({
                fileId: 'test-doc-id',
                addParents: 'test-folder-id',
                removeParents: 'root',
                fields: 'id, parents',
            });
            expect(result.content[0].text).toBe('Moved document test-doc-id to folder Test Folder');
        });

        it('should handle errors during move', async () => {
            const apiError = new Error('API Error');
            mockDriveService.findFolder.mockRejectedValue(apiError);

            const result = await docsService.move({ documentId: 'test-doc-id', folderName: 'Test Folder' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
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

            expect(result.content[0].text).toBe('Hello World\n');
        });

        it('should handle errors during getText', async () => {
            const apiError = new Error('API Error');
            mockDocsAPI.documents.get.mockRejectedValue(apiError);

            const result = await docsService.getText({ documentId: 'test-doc-id' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
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
                                                elements: [
                                                    { textRun: { content: 'Tab 1 Content' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                },
            };
            mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

            const result = await docsService.getText({ documentId: 'test-doc-id', tabId: 'tab-1' });

            expect(result.content[0].text).toBe('Tab 1 Content');
        });

        it('should return all tabs if no tabId provided and tabs exist', async () => {
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
                                                elements: [
                                                    { textRun: { content: 'Tab 1 Content' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            tabProperties: { tabId: 'tab-2', title: 'Tab 2' },
                            documentTab: {
                                body: {
                                    content: [
                                        {
                                            paragraph: {
                                                elements: [
                                                    { textRun: { content: 'Tab 2 Content' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                },
            };
            mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

            const result = await docsService.getText({ documentId: 'test-doc-id' });
            const parsed = JSON.parse(result.content[0].text);
            
            expect(parsed).toHaveLength(2);
            expect(parsed[0]).toEqual({
                tabId: 'tab-1',
                title: 'Tab 1',
                content: 'Tab 1 Content',
                index: 0
            });
            expect(parsed[1]).toEqual({
                tabId: 'tab-2',
                title: 'Tab 2',
                content: 'Tab 2 Content',
                index: 1
            });
        });
    });

    describe('appendText', () => {
        it('should append text to a document', async () => {
            const mockDoc = {
                data: {
                    tabs: [
                        {
                            documentTab: {
                                body: {
                                    content: [
                                        { endIndex: 10 }
                                    ]
                                }
                            }
                        }
                    ]
                },
            };
            mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

            const result = await docsService.appendText({ documentId: 'test-doc-id', text: ' Appended' });

            expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                fields: 'tabs',
                includeTabsContent: true,
            });
            expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                requestBody: {
                    requests: [{
                        insertText: {
                            location: { index: 9 },
                            text: ' Appended',
                        },
                    }],
                },
            });
            expect(result.content[0].text).toBe('Successfully appended text to document test-doc-id');
        });

        it('should handle errors during appendText', async () => {
            const apiError = new Error('API Error');
            mockDocsAPI.documents.get.mockRejectedValue(apiError);

            const result = await docsService.appendText({ documentId: 'test-doc-id', text: ' Appended' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });

        it('should append text to a specific tab', async () => {
            const mockDoc = {
                data: {
                    tabs: [
                        {
                            tabProperties: { tabId: 'tab-1' },
                            documentTab: {
                                body: {
                                    content: [
                                        { endIndex: 10 }
                                    ]
                                }
                            }
                        }
                    ]
                },
            };
            mockDocsAPI.documents.get.mockResolvedValue(mockDoc);

            await docsService.appendText({ documentId: 'test-doc-id', text: ' Appended', tabId: 'tab-1' });

            expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                fields: 'tabs',
                includeTabsContent: true,
            });
            expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                requestBody: {
                    requests: [{
                        insertText: {
                            location: {
                                index: 9,
                                tabId: 'tab-1'
                            },
                            text: ' Appended',
                        },
                    }],
                },
            });
        });
    });

    describe('replaceText', () => {
        it('should replace text in a document', async () => {
            // Mock the document get call that finds occurrences
            mockDocsAPI.documents.get.mockResolvedValue({
                data: {
                    tabs: [
                        {
                            documentTab: {
                                body: {
                                    content: [
                                        {
                                            paragraph: {
                                                elements: [
                                                    { textRun: { content: 'Hello world! Hello again!' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            });

            mockDocsAPI.documents.batchUpdate.mockResolvedValue({
                data: {
                    documentId: 'test-doc-id',
                    replies: []
                }
            });

            const result = await docsService.replaceText({ documentId: 'test-doc-id', findText: 'Hello', replaceText: 'Hi' });

            expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                fields: 'tabs',
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
                                    startIndex: 0,
                                    endIndex: 5
                                }
                            }
                        }),
                        expect.objectContaining({
                            insertText: {
                                location: {
                                    tabId: undefined,
                                    index: 1
                                },
                                text: 'Hi'
                            }
                        })
                    ]),
                },
            });
            expect(result.content[0].text).toBe('Successfully replaced text in document test-doc-id');
        });

        it('should replace text with markdown formatting', async () => {
            // Mock the document get call that finds occurrences
            mockDocsAPI.documents.get.mockResolvedValue({
                data: {
                    tabs: [
                        {
                            documentTab: {
                                body: {
                                    content: [
                                        {
                                            paragraph: {
                                                elements: [
                                                    { textRun: { content: 'Replace this text and this text too.' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            });

            mockDocsAPI.documents.batchUpdate.mockResolvedValue({
                data: {
                    documentId: 'test-doc-id',
                    replies: []
                }
            });

            const result = await docsService.replaceText({
                documentId: 'test-doc-id',
                findText: 'this text',
                replaceText: '**bold text**'
            });

            expect(mockDocsAPI.documents.get).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                fields: 'tabs',
                includeTabsContent: true,
            });

            expect(mockDocsAPI.documents.batchUpdate).toHaveBeenCalledWith({
                documentId: 'test-doc-id',
                requestBody: {
                    requests: expect.arrayContaining([
                        // First occurrence
                        expect.objectContaining({
                            deleteContentRange: {
                                range: {
                                    tabId: undefined,
                                    startIndex: 8,
                                    endIndex: 17
                                }
                            }
                        }),
                        expect.objectContaining({
                            insertText: {
                                location: {
                                    tabId: undefined,
                                    index: 9
                                },
                                text: 'bold text'
                            }
                        }),
                        expect.objectContaining({
                            updateTextStyle: expect.objectContaining({
                                range: {
                                    tabId: undefined,
                                    startIndex: 8,
                                    endIndex: 17
                                },
                                textStyle: { bold: true }
                            })
                        }),
                        // Second occurrence
                        expect.objectContaining({
                            deleteContentRange: {
                                range: {
                                    tabId: undefined,
                                    startIndex: 22,
                                    endIndex: 31
                                }
                            }
                        }),
                        expect.objectContaining({
                            insertText: {
                                location: {
                                    tabId: undefined,
                                    index: 23
                                },
                                text: 'bold text'
                            }
                        }),
                        expect.objectContaining({
                            updateTextStyle: expect.objectContaining({
                                range: {
                                    tabId: undefined,
                                    startIndex: 22,
                                    endIndex: 31
                                },
                                textStyle: { bold: true }
                            })
                        })
                    ]),
                },
            });
            expect(result.content[0].text).toBe('Successfully replaced text in document test-doc-id');
        });

        it('should handle errors during replaceText', async () => {
            // Mock the document get call
            mockDocsAPI.documents.get.mockResolvedValue({
                data: {
                    tabs: [
                        {
                            documentTab: {
                                body: {
                                    content: [
                                        {
                                            paragraph: {
                                                elements: [
                                                    { textRun: { content: 'Hello world!' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            });

            const apiError = new Error('API Error');
            mockDocsAPI.documents.batchUpdate.mockRejectedValue(apiError);

            const result = await docsService.replaceText({ documentId: 'test-doc-id', findText: 'Hello', replaceText: 'Hi' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });

        it('should replace text in a specific tab using delete/insert', async () => {
            mockDocsAPI.documents.get.mockResolvedValue({
                data: {
                    tabs: [
                        {
                            tabProperties: { tabId: 'tab-1' },
                            documentTab: {
                                body: {
                                    content: [
                                        {
                                            paragraph: {
                                                elements: [
                                                    { textRun: { content: 'Hello world!' } }
                                                ]
                                            }
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            });

            mockDocsAPI.documents.batchUpdate.mockResolvedValue({
                data: { documentId: 'test-doc-id' }
            });

            await docsService.replaceText({ 
                documentId: 'test-doc-id', 
                findText: 'Hello', 
                replaceText: 'Hi',
                tabId: 'tab-1'
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
                                    startIndex: 0,
                                    endIndex: 5
                                }
                            }
                        }),
                        expect.objectContaining({
                            insertText: {
                                location: {
                                    tabId: 'tab-1',
                                    index: 1
                                },
                                text: 'Hi'
                            }
                        })
                    ]),
                },
            });
        });
    });
});
