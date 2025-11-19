/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { SlidesService } from '../../services/SlidesService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('SlidesService', () => {
    let slidesService: SlidesService;
    let mockAuthManager: jest.Mocked<AuthManager>;
    let mockSlidesAPI: any;
    let mockDriveAPI: any;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Create mock AuthManager
        mockAuthManager = {
            getAuthenticatedClient: jest.fn(),
        } as any;


        // Create mock Slides API
        mockSlidesAPI = {
            presentations: {
                get: jest.fn(),
            },
        };

        mockDriveAPI = {
            files: {
                list: jest.fn(),
            },
        };

        // Mock the google constructors
        (google.slides as jest.Mock) = jest.fn().mockReturnValue(mockSlidesAPI);
        (google.drive as jest.Mock) = jest.fn().mockReturnValue(mockDriveAPI);

        // Create SlidesService instance
        slidesService = new SlidesService(mockAuthManager);

        const mockAuthClient = { access_token: 'test-token' };
        mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getText', () => {
        it('should extract text from a presentation', async () => {
            const mockPresentation = {
                data: {
                    title: 'Test Presentation',
                    slides: [
                        {
                            pageElements: [
                                {
                                    shape: {
                                        text: {
                                            textElements: [
                                                { textRun: { content: 'Slide 1 Title' } },
                                                { paragraphMarker: {} },
                                                { textRun: { content: 'Slide 1 Content' } },
                                            ],
                                        },
                                    },
                                },
                            ],
                        },
                        {
                            pageElements: [
                                {
                                    table: {
                                        tableRows: [
                                            {
                                                tableCells: [
                                                    {
                                                        text: {
                                                            textElements: [
                                                                { textRun: { content: 'Cell 1' } },
                                                            ],
                                                        },
                                                    },
                                                    {
                                                        text: {
                                                            textElements: [
                                                                { textRun: { content: 'Cell 2' } },
                                                            ],
                                                        },
                                                    },
                                                ],
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    ],
                },
            };

            mockSlidesAPI.presentations.get.mockResolvedValue(mockPresentation);

            const result = await slidesService.getText({ presentationId: 'test-presentation-id' });

            expect(mockSlidesAPI.presentations.get).toHaveBeenCalledWith({
                presentationId: 'test-presentation-id',
                fields: 'title,slides(pageElements(shape(text,shapeProperties),table(tableRows(tableCells(text)))))',
            });

            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('Test Presentation');
            expect(result.content[0].text).toContain('Slide 1 Title');
            expect(result.content[0].text).toContain('Slide 1 Content');
            expect(result.content[0].text).toContain('Cell 1 | Cell 2');
        });

        it('should handle presentations with no slides', async () => {
            const mockPresentation = {
                data: {
                    title: 'Empty Presentation',
                    slides: [],
                },
            };

            mockSlidesAPI.presentations.get.mockResolvedValue(mockPresentation);

            const result = await slidesService.getText({ presentationId: 'empty-presentation-id' });

            expect(result.content[0].type).toBe('text');
            expect(result.content[0].text).toContain('Empty Presentation');
        });

        it('should handle errors gracefully', async () => {
            mockSlidesAPI.presentations.get.mockRejectedValue(new Error('API Error'));

            const result = await slidesService.getText({ presentationId: 'error-presentation-id' });

            expect(result.content[0].type).toBe('text');
            const response = JSON.parse(result.content[0].text);
            expect(response.error).toBe('API Error');
        });
    });

    describe('find', () => {
        it('should find presentations by query', async () => {
            const mockResponse = {
                data: {
                    files: [
                        { id: 'pres1', name: 'Presentation 1' },
                        { id: 'pres2', name: 'Presentation 2' },
                    ],
                    nextPageToken: 'next-token',
                },
            };

            mockDriveAPI.files.list.mockResolvedValue(mockResponse);

            const result = await slidesService.find({ query: 'test query' });
            const response = JSON.parse(result.content[0].text);

            expect(mockDriveAPI.files.list).toHaveBeenCalledWith({
                pageSize: 10,
                fields: 'nextPageToken, files(id, name)',
                q: "mimeType='application/vnd.google-apps.presentation' and fullText contains 'test query'",
                pageToken: undefined,
            });

            expect(response.files).toHaveLength(2);
            expect(response.files[0].name).toBe('Presentation 1');
            expect(response.nextPageToken).toBe('next-token');
        });

        it('should handle title-specific searches', async () => {
            const mockResponse = {
                data: {
                    files: [{ id: 'pres1', name: 'Specific Title' }],
                },
            };

            mockDriveAPI.files.list.mockResolvedValue(mockResponse);

            const result = await slidesService.find({ query: 'title:"Specific Title"' });
            const response = JSON.parse(result.content[0].text);

            expect(mockDriveAPI.files.list).toHaveBeenCalledWith(
                expect.objectContaining({
                    q: "mimeType='application/vnd.google-apps.presentation' and name contains 'Specific Title'",
                })
            );

            expect(response.files).toHaveLength(1);
            expect(response.files[0].name).toBe('Specific Title');
        });
    });

    describe('getMetadata', () => {
        it('should retrieve presentation metadata', async () => {
            const mockPresentation = {
                data: {
                    presentationId: 'test-id',
                    title: 'Test Presentation',
                    slides: [{ objectId: 'slide1' }, { objectId: 'slide2' }],
                    pageSize: { width: { magnitude: 10 }, height: { magnitude: 7.5 } },
                    masters: [{ objectId: 'master1' }],
                    layouts: [{ objectId: 'layout1' }],
                    notesMaster: { objectId: 'notesMaster1' },
                },
            };

            mockSlidesAPI.presentations.get.mockResolvedValue(mockPresentation);

            const result = await slidesService.getMetadata({ presentationId: 'test-id' });
            const metadata = JSON.parse(result.content[0].text);

            expect(mockSlidesAPI.presentations.get).toHaveBeenCalledWith({
                presentationId: 'test-id',
                fields: 'presentationId,title,slides(objectId),pageSize,notesMaster,masters,layouts',
            });

            expect(metadata.presentationId).toBe('test-id');
            expect(metadata.title).toBe('Test Presentation');
            expect(metadata.slideCount).toBe(2);
            expect(metadata.hasMasters).toBe(true);
            expect(metadata.hasLayouts).toBe(true);
            expect(metadata.hasNotesMaster).toBe(true);
        });

        it('should handle errors gracefully', async () => {
            mockSlidesAPI.presentations.get.mockRejectedValue(new Error('Metadata Error'));

            const result = await slidesService.getMetadata({ presentationId: 'error-id' });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Metadata Error');
        });
    });
});
