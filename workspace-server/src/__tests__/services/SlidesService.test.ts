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
import { SlidesService } from '../../services/SlidesService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';
import { request } from 'gaxios';
import * as fs from 'node:fs/promises';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');
jest.mock('gaxios');
jest.mock('node:fs/promises');
jest.mock('node:path', () => {
  const actualPath = jest.requireActual('node:path') as any;
  return {
    ...actualPath,
    join: jest.fn((...args: string[]) =>
      args.join('/').replace(/\\/g, '/').replace(/\/+/g, '/'),
    ),
    dirname: jest.fn((p: string) => {
      const normalized = p.replace(/\\/g, '/');
      return normalized.substring(0, normalized.lastIndexOf('/'));
    }),
    isAbsolute: jest.fn(
      (p: string) => p.startsWith('/') || /^[a-zA-Z]:/.test(p),
    ),
  };
});

describe('SlidesService', () => {
  let slidesService: SlidesService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockSlidesAPI: any;

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
        create: jest.fn(),
        batchUpdate: jest.fn(),
      },
    };

    // Mock the google constructors
    (google.slides as jest.Mock) = jest.fn().mockReturnValue(mockSlidesAPI);

    // Create SlidesService instance
    slidesService = new SlidesService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );

    // Default mocks for downloads
    (request as any).mockResolvedValue({
      data: Buffer.from('test-data'),
    });
    (fs.mkdir as any).mockResolvedValue(undefined);
    (fs.writeFile as any).mockResolvedValue(undefined);
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

      const result = await slidesService.getText({
        presentationId: 'test-presentation-id',
      });

      expect(mockSlidesAPI.presentations.get).toHaveBeenCalledWith({
        presentationId: 'test-presentation-id',
        fields:
          'title,slides(pageElements(shape(text,shapeProperties),table(tableRows(tableCells(text)))))',
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

      const result = await slidesService.getText({
        presentationId: 'empty-presentation-id',
      });

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Empty Presentation');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.get.mockRejectedValue(new Error('API Error'));

      const result = await slidesService.getText({
        presentationId: 'error-presentation-id',
      });

      expect(result.content[0].type).toBe('text');
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('API Error');
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

      const result = await slidesService.getMetadata({
        presentationId: 'test-id',
      });
      const metadata = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.get).toHaveBeenCalledWith({
        presentationId: 'test-id',
        fields:
          'presentationId,title,slides(objectId),pageSize,notesMaster,masters,layouts',
      });

      expect(metadata.presentationId).toBe('test-id');
      expect(metadata.title).toBe('Test Presentation');
      expect(metadata.slideCount).toBe(2);
      expect(metadata.slides).toEqual([
        { objectId: 'slide1' },
        { objectId: 'slide2' },
      ]);
      expect(metadata.hasMasters).toBe(true);
      expect(metadata.hasLayouts).toBe(true);
      expect(metadata.hasNotesMaster).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.get.mockRejectedValue(
        new Error('Metadata Error'),
      );

      const result = await slidesService.getMetadata({
        presentationId: 'error-id',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toBe('Metadata Error');
    });
  });

  describe('getImages', () => {
    it('should extract images from a presentation', async () => {
      const mockPresentation = {
        data: {
          slides: [
            {
              objectId: 'slide1',
              pageElements: [
                {
                  objectId: 'image_element_1',
                  title: 'Test Image',
                  description: 'A description of the test image',
                  image: {
                    contentUrl: 'http://example.com/image1.png',
                    sourceUrl: 'http://example.com/original1.png',
                  },
                },
              ],
            },
            {
              objectId: 'slide2',
              pageElements: [
                {
                  objectId: 'image_element_2',
                  image: {
                    contentUrl: 'http://example.com/image2.png',
                  },
                },
              ],
            },
          ],
        },
      };

      mockSlidesAPI.presentations.get.mockResolvedValue(mockPresentation);

      const result = await slidesService.getImages({
        presentationId: 'test-presentation-id',
        localPath: '/tmp/test-images',
      });

      expect(mockSlidesAPI.presentations.get).toHaveBeenCalledWith({
        presentationId: 'test-presentation-id',
        fields:
          'slides(objectId,pageElements(objectId,title,description,image(contentUrl,sourceUrl)))',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.images).toHaveLength(2);
      expect(response.images[0].slideIndex).toBe(1);
      expect(response.images[0].slideObjectId).toBe('slide1');
      expect(response.images[0].elementObjectId).toBe('image_element_1');
      expect(response.images[1].slideIndex).toBe(2);
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.get.mockRejectedValue(new Error('API Error'));

      const result = await slidesService.getImages({
        presentationId: 'error-id',
        localPath: '/tmp/test-images',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('API Error');
    });

    it('should download images when localPath is provided', async () => {
      const mockPresentation = {
        data: {
          slides: [
            {
              objectId: 'slide1',
              pageElements: [
                {
                  objectId: 'image1',
                  image: { contentUrl: 'http://example.com/image1.png' },
                },
              ],
            },
          ],
        },
      };

      mockSlidesAPI.presentations.get.mockResolvedValue(mockPresentation);

      const result = await slidesService.getImages({
        presentationId: 'test-id',
        localPath: '/absolute/path/to/dir',
      });

      expect(fs.mkdir).toHaveBeenCalledWith('/absolute/path/to/dir', {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalled();

      const response = JSON.parse(result.content[0].text);
      expect(response.images[0].localPath).toBe(
        '/absolute/path/to/dir/slide_1_image1.png',
      );
    });
  });

  describe('getSlideThumbnail', () => {
    beforeEach(() => {
      mockSlidesAPI.presentations.pages = {
        getThumbnail: jest.fn(),
      };
    });

    it('should download thumbnail when localPath is provided', async () => {
      const mockThumbnail = {
        data: {
          width: 800,
          height: 600,
          contentUrl: 'http://example.com/thumbnail.png',
        },
      };

      mockSlidesAPI.presentations.pages.getThumbnail.mockResolvedValue(
        mockThumbnail,
      );

      const result = await slidesService.getSlideThumbnail({
        presentationId: 'test-presentation-id',
        slideObjectId: 'slide1',
        localPath: '/absolute/path/to/thumb.png',
      });

      expect(
        mockSlidesAPI.presentations.pages.getThumbnail,
      ).toHaveBeenCalledWith({
        presentationId: 'test-presentation-id',
        pageObjectId: 'slide1',
      });

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/absolute/path/to/thumb.png',
        expect.any(Buffer),
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.contentUrl).toBe('http://example.com/thumbnail.png');
      expect(response.localPath).toBe('/absolute/path/to/thumb.png');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.pages.getThumbnail.mockRejectedValue(
        new Error('API Error'),
      );

      const result = await slidesService.getSlideThumbnail({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
        localPath: '/tmp/thumb.png',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('API Error');
    });
  });

  describe('create', () => {
    it('should create a new presentation', async () => {
      mockSlidesAPI.presentations.create.mockResolvedValue({
        data: {
          presentationId: 'new-pres-id',
          title: 'My New Presentation',
        },
      });

      const result = await slidesService.create({
        title: 'My New Presentation',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.create).toHaveBeenCalledWith({
        requestBody: { title: 'My New Presentation' },
      });
      expect(response.presentationId).toBe('new-pres-id');
      expect(response.title).toBe('My New Presentation');
      expect(response.url).toContain('new-pres-id');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.create.mockRejectedValue(
        new Error('Create Error'),
      );

      const result = await slidesService.create({ title: 'Fail' });
      const response = JSON.parse(result.content[0].text);
      expect(result.isError).toBe(true);
      expect(response.error).toBe('Create Error');
    });
  });

  describe('addSlide', () => {
    it('should add a slide with default settings', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{ createSlide: { objectId: 'new-slide-id' } }] },
      });

      const result = await slidesService.addSlide({
        presentationId: 'test-pres-id',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [{ createSlide: {} }],
        },
      });
      expect(response.slideObjectId).toBe('new-slide-id');
    });

    it('should add a slide with insertion index and predefined layout', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{ createSlide: { objectId: 'slide-at-0' } }] },
      });

      const result = await slidesService.addSlide({
        presentationId: 'test-pres-id',
        insertionIndex: 0,
        predefinedLayout: 'TITLE_AND_BODY',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              createSlide: {
                insertionIndex: 0,
                slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
              },
            },
          ],
        },
      });
      expect(response.slideObjectId).toBe('slide-at-0');
    });

    it('should pick layoutId over predefinedLayout when both are provided', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{ createSlide: { objectId: 's' } }] },
      });

      await slidesService.addSlide({
        presentationId: 'p',
        layoutId: 'custom-layout-id',
        predefinedLayout: 'TITLE_AND_BODY',
        objectId: 'my-id',
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'p',
        requestBody: {
          requests: [
            {
              createSlide: {
                objectId: 'my-id',
                slideLayoutReference: { layoutId: 'custom-layout-id' },
              },
            },
          ],
        },
      });
    });

    it('should reject an invalid predefinedLayout value', async () => {
      const result = await slidesService.addSlide({
        presentationId: 'p',
        predefinedLayout: 'not-a-real-layout' as never,
      });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(response.error).toContain('Invalid predefinedLayout');
    });

    it('should error when batchUpdate returns an empty replies array', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const result = await slidesService.addSlide({ presentationId: 'p' });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('createSlide returned no objectId');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Add Slide Error'),
      );

      const result = await slidesService.addSlide({
        presentationId: 'error-id',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Add Slide Error');
    });
  });

  describe('deleteSlide', () => {
    it('should delete a slide', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const result = await slidesService.deleteSlide({
        presentationId: 'test-pres-id',
        slideObjectId: 'slide-to-delete',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [{ deleteObject: { objectId: 'slide-to-delete' } }],
        },
      });
      expect(response.deletedSlideObjectId).toBe('slide-to-delete');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Delete Error'),
      );

      const result = await slidesService.deleteSlide({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Delete Error');
    });
  });

  describe('duplicateSlide', () => {
    it('should duplicate a slide', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: {
          replies: [{ duplicateObject: { objectId: 'duplicated-slide-id' } }],
        },
      });

      const result = await slidesService.duplicateSlide({
        presentationId: 'test-pres-id',
        slideObjectId: 'original-slide',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [{ duplicateObject: { objectId: 'original-slide' } }],
        },
      });
      expect(response.sourceSlideObjectId).toBe('original-slide');
      expect(response.newSlideObjectId).toBe('duplicated-slide-id');
    });

    it('should error when batchUpdate returns an empty replies array', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const result = await slidesService.duplicateSlide({
        presentationId: 'p',
        slideObjectId: 's',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('duplicateObject returned no objectId');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Duplicate Error'),
      );

      const result = await slidesService.duplicateSlide({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Duplicate Error');
    });
  });

  describe('reorderSlides', () => {
    it('should reorder slides', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const result = await slidesService.reorderSlides({
        presentationId: 'test-pres-id',
        slideObjectIds: ['slide2', 'slide3'],
        insertionIndex: 0,
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              updateSlidesPosition: {
                slideObjectIds: ['slide2', 'slide3'],
                insertionIndex: 0,
              },
            },
          ],
        },
      });
      expect(response.slideObjectIds).toEqual(['slide2', 'slide3']);
      expect(response.insertionIndex).toBe(0);
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Reorder Error'),
      );

      const result = await slidesService.reorderSlides({
        presentationId: 'error-id',
        slideObjectIds: ['s1'],
        insertionIndex: 0,
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Reorder Error');
    });
  });

  describe('getSpeakerNotes', () => {
    it('should retrieve speaker notes for all slides', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: {
          slides: [
            {
              objectId: 'slide1',
              slideProperties: {
                notesPage: {
                  notesProperties: {
                    speakerNotesObjectId: 'notes-shape-1',
                  },
                  pageElements: [
                    {
                      objectId: 'notes-shape-1',
                      shape: {
                        text: {
                          textElements: [
                            {
                              textRun: { content: 'Speaker note for slide 1' },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
            {
              objectId: 'slide2',
              slideProperties: {
                notesPage: {
                  notesProperties: {
                    speakerNotesObjectId: 'notes-shape-2',
                  },
                  pageElements: [
                    {
                      objectId: 'notes-shape-2',
                      shape: {
                        text: {
                          textElements: [],
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      const result = await slidesService.getSpeakerNotes({
        presentationId: 'test-pres-id',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.slides).toHaveLength(2);
      expect(response.slides[0].notes).toBe('Speaker note for slide 1');
      expect(response.slides[0].speakerNotesObjectId).toBe('notes-shape-1');
      expect(response.slides[1].notes).toBe('');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.get.mockRejectedValue(
        new Error('Notes Error'),
      );

      const result = await slidesService.getSpeakerNotes({
        presentationId: 'error-id',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Notes Error');
    });
  });

  describe('updateSpeakerNotes', () => {
    it('should update speaker notes for a slide', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: {
          slides: [
            {
              objectId: 'slide1',
              slideProperties: {
                notesPage: {
                  notesProperties: {
                    speakerNotesObjectId: 'notes-shape-1',
                  },
                  pageElements: [
                    {
                      objectId: 'notes-shape-1',
                      shape: {
                        text: {
                          textElements: [{ textRun: { content: 'Old notes' } }],
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}, {}] },
      });

      const result = await slidesService.updateSpeakerNotes({
        presentationId: 'test-pres-id',
        slideObjectId: 'slide1',
        notes: 'New speaker notes',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId: 'notes-shape-1',
                textRange: { type: 'ALL' },
              },
            },
            {
              insertText: {
                objectId: 'notes-shape-1',
                insertionIndex: 0,
                text: 'New speaker notes',
              },
            },
          ],
        },
      });
      expect(response.notes).toBe('New speaker notes');
    });

    it('should handle slide not found', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: { slides: [{ objectId: 'other-slide' }] },
      });

      const result = await slidesService.updateSpeakerNotes({
        presentationId: 'test-pres-id',
        slideObjectId: 'nonexistent-slide',
        notes: 'Notes',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Slide not found');
    });

    it('should error when the speaker notes object is missing on the slide', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: {
          slides: [
            {
              objectId: 'slide1',
              slideProperties: {
                notesPage: {
                  notesProperties: {},
                  pageElements: [],
                },
              },
            },
          ],
        },
      });

      const result = await slidesService.updateSpeakerNotes({
        presentationId: 'p',
        slideObjectId: 'slide1',
        notes: 'hi',
      });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(response.error).toContain('Speaker notes object not found');
    });

    it('should skip the delete request when there is no existing text', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: {
          slides: [
            {
              objectId: 'slide1',
              slideProperties: {
                notesPage: {
                  notesProperties: { speakerNotesObjectId: 'notes-1' },
                  pageElements: [
                    {
                      objectId: 'notes-1',
                      shape: { text: { textElements: [] } },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      await slidesService.updateSpeakerNotes({
        presentationId: 'p',
        slideObjectId: 'slide1',
        notes: 'new',
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'p',
        requestBody: {
          requests: [
            {
              insertText: {
                objectId: 'notes-1',
                insertionIndex: 0,
                text: 'new',
              },
            },
          ],
        },
      });
    });

    it('should skip the insert request when the new notes are empty', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: {
          slides: [
            {
              objectId: 'slide1',
              slideProperties: {
                notesPage: {
                  notesProperties: { speakerNotesObjectId: 'notes-1' },
                  pageElements: [
                    {
                      objectId: 'notes-1',
                      shape: {
                        text: {
                          textElements: [{ textRun: { content: 'old' } }],
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      });
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      await slidesService.updateSpeakerNotes({
        presentationId: 'p',
        slideObjectId: 'slide1',
        notes: '',
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'p',
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId: 'notes-1',
                textRange: { type: 'ALL' },
              },
            },
          ],
        },
      });
    });

    it('should not call batchUpdate and should return noOp: true when there is nothing to do', async () => {
      mockSlidesAPI.presentations.get.mockResolvedValue({
        data: {
          slides: [
            {
              objectId: 'slide1',
              slideProperties: {
                notesPage: {
                  notesProperties: { speakerNotesObjectId: 'notes-1' },
                  pageElements: [
                    {
                      objectId: 'notes-1',
                      shape: { text: { textElements: [] } },
                    },
                  ],
                },
              },
            },
          ],
        },
      });

      const result = await slidesService.updateSpeakerNotes({
        presentationId: 'p',
        slideObjectId: 'slide1',
        notes: '',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).not.toHaveBeenCalled();
      expect(response.noOp).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.get.mockRejectedValue(
        new Error('Update Notes Error'),
      );

      const result = await slidesService.updateSpeakerNotes({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
        notes: 'Notes',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Update Notes Error');
    });
  });

  describe('replaceAllText', () => {
    it('should replace all text in a presentation', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: {
          replies: [{ replaceAllText: { occurrencesChanged: 5 } }],
        },
      });

      const result = await slidesService.replaceAllText({
        presentationId: 'test-pres-id',
        findText: '{{name}}',
        replaceText: 'John Doe',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              replaceAllText: {
                containsText: { text: '{{name}}', matchCase: true },
                replaceText: 'John Doe',
              },
            },
          ],
        },
      });
      expect(response.occurrencesChanged).toBe(5);
      expect(response.findText).toBe('{{name}}');
      expect(response.replaceText).toBe('John Doe');
    });

    it('should support case-insensitive matching', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: {
          replies: [{ replaceAllText: { occurrencesChanged: 3 } }],
        },
      });

      await slidesService.replaceAllText({
        presentationId: 'test-pres-id',
        findText: 'hello',
        replaceText: 'world',
        matchCase: false,
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              replaceAllText: {
                containsText: { text: 'hello', matchCase: false },
                replaceText: 'world',
              },
            },
          ],
        },
      });
    });

    it('should error when batchUpdate returns an empty replies array', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const result = await slidesService.replaceAllText({
        presentationId: 'p',
        findText: 'a',
        replaceText: 'b',
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('replaceAllText returned no reply');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Replace Error'),
      );

      const result = await slidesService.replaceAllText({
        presentationId: 'error-id',
        findText: 'a',
        replaceText: 'b',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Replace Error');
    });
  });

  describe('insertText', () => {
    it('should insert text into an object', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const result = await slidesService.insertText({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        text: 'Hello World',
        insertionIndex: 5,
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              insertText: {
                objectId: 'shape-1',
                insertionIndex: 5,
                text: 'Hello World',
              },
            },
          ],
        },
      });
      expect(response.objectId).toBe('shape-1');
      expect(response.textLength).toBe(11);
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Insert Error'),
      );

      const result = await slidesService.insertText({
        presentationId: 'error-id',
        objectId: 'shape-1',
        text: 'Test',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Insert Error');
    });
  });

  describe('deleteText', () => {
    it('should delete text from an object with fixed range', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const result = await slidesService.deleteText({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        range: { type: 'FIXED_RANGE', startIndex: 0, endIndex: 5 },
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId: 'shape-1',
                textRange: { type: 'FIXED_RANGE', startIndex: 0, endIndex: 5 },
              },
            },
          ],
        },
      });
      expect(response.objectId).toBe('shape-1');
    });

    it('should delete all text when type is ALL', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      await slidesService.deleteText({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        range: { type: 'ALL' },
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId: 'shape-1',
                textRange: { type: 'ALL' },
              },
            },
          ],
        },
      });
    });

    it('should send only startIndex with type FROM_START_INDEX', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      await slidesService.deleteText({
        presentationId: 'p',
        objectId: 'shape-1',
        range: { type: 'FROM_START_INDEX', startIndex: 7 },
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'p',
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId: 'shape-1',
                textRange: { type: 'FROM_START_INDEX', startIndex: 7 },
              },
            },
          ],
        },
      });
    });

    it('should default to ALL when range is omitted', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      await slidesService.deleteText({
        presentationId: 'p',
        objectId: 'shape-1',
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'p',
        requestBody: {
          requests: [
            {
              deleteText: {
                objectId: 'shape-1',
                textRange: { type: 'ALL' },
              },
            },
          ],
        },
      });
    });

    // The discriminated union at the Zod boundary makes FIXED_RANGE without
    // indices unrepresentable to MCP callers (a TypeScript error). These
    // tests cover the defensive runtime checks for non-Zod callers — hence
    // the `as never` casts.
    it('should error when FIXED_RANGE is constructed without indices', async () => {
      const result = await slidesService.deleteText({
        presentationId: 'p',
        objectId: 'shape-1',
        range: { type: 'FIXED_RANGE' } as never,
      });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(response.error).toContain(
        'FIXED_RANGE requires both startIndex and endIndex',
      );
      expect(mockSlidesAPI.presentations.batchUpdate).not.toHaveBeenCalled();
    });

    it('should error when FROM_START_INDEX is constructed without startIndex', async () => {
      const result = await slidesService.deleteText({
        presentationId: 'p',
        objectId: 'shape-1',
        range: { type: 'FROM_START_INDEX' } as never,
      });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(response.error).toContain('FROM_START_INDEX requires startIndex');
    });

    it('should reject an unknown range type at the service boundary', async () => {
      const result = await slidesService.deleteText({
        presentationId: 'p',
        objectId: 'shape-1',
        range: { type: 'all', startIndex: 0, endIndex: 5 } as never,
      });
      const response = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(response.error).toContain('Invalid range type "all"');
      expect(mockSlidesAPI.presentations.batchUpdate).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Delete Text Error'),
      );

      const result = await slidesService.deleteText({
        presentationId: 'error-id',
        objectId: 'shape-1',
        range: { type: 'FIXED_RANGE', startIndex: 0, endIndex: 5 },
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Delete Text Error');
    });
  });

  describe('addShape', () => {
    it('should add a shape to a slide', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: {
          replies: [{ createShape: { objectId: 'new-shape-id' } }],
        },
      });

      const result = await slidesService.addShape({
        presentationId: 'test-pres-id',
        slideObjectId: 'slide1',
        shapeType: 'TEXT_BOX',
        x: 100,
        y: 100,
        width: 300,
        height: 50,
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              createShape: {
                shapeType: 'TEXT_BOX',
                elementProperties: {
                  pageObjectId: 'slide1',
                  size: {
                    width: { magnitude: 300, unit: 'PT' },
                    height: { magnitude: 50, unit: 'PT' },
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: 100,
                    translateY: 100,
                    unit: 'PT',
                  },
                },
              },
            },
          ],
        },
      });
      expect(response.shapeObjectId).toBe('new-shape-id');
      expect(response.shapeType).toBe('TEXT_BOX');
    });

    it('should error when batchUpdate returns an empty replies array', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const result = await slidesService.addShape({
        presentationId: 'p',
        slideObjectId: 's',
        shapeType: 'RECTANGLE',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('createShape returned no objectId');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Shape Error'),
      );

      const result = await slidesService.addShape({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
        shapeType: 'RECTANGLE',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Shape Error');
    });
  });

  describe('addImage', () => {
    it('should add an image to a slide', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: {
          replies: [{ createImage: { objectId: 'new-image-id' } }],
        },
      });

      const result = await slidesService.addImage({
        presentationId: 'test-pres-id',
        slideObjectId: 'slide1',
        imageUrl: 'https://example.com/photo.png',
        x: 50,
        y: 50,
        width: 200,
        height: 150,
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              createImage: {
                url: 'https://example.com/photo.png',
                elementProperties: {
                  pageObjectId: 'slide1',
                  size: {
                    width: { magnitude: 200, unit: 'PT' },
                    height: { magnitude: 150, unit: 'PT' },
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: 50,
                    translateY: 50,
                    unit: 'PT',
                  },
                },
              },
            },
          ],
        },
      });
      expect(response.imageObjectId).toBe('new-image-id');
      expect(response.imageUrl).toBe('https://example.com/photo.png');
    });

    it('should error when batchUpdate returns an empty replies array', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const result = await slidesService.addImage({
        presentationId: 'p',
        slideObjectId: 's',
        imageUrl: 'https://example.com/x.png',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('createImage returned no objectId');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Image Error'),
      );

      const result = await slidesService.addImage({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
        imageUrl: 'https://example.com/fail.png',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Image Error');
    });
  });

  describe('addTable', () => {
    it('should add a table to a slide', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: {
          replies: [{ createTable: { objectId: 'new-table-id' } }],
        },
      });

      const result = await slidesService.addTable({
        presentationId: 'test-pres-id',
        slideObjectId: 'slide1',
        rows: 3,
        columns: 4,
        x: 50,
        y: 200,
        width: 400,
        height: 200,
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              createTable: {
                rows: 3,
                columns: 4,
                elementProperties: {
                  pageObjectId: 'slide1',
                  size: {
                    width: { magnitude: 400, unit: 'PT' },
                    height: { magnitude: 200, unit: 'PT' },
                  },
                  transform: {
                    scaleX: 1,
                    scaleY: 1,
                    translateX: 50,
                    translateY: 200,
                    unit: 'PT',
                  },
                },
              },
            },
          ],
        },
      });
      expect(response.tableObjectId).toBe('new-table-id');
      expect(response.rows).toBe(3);
      expect(response.columns).toBe(4);
    });

    it('should error when batchUpdate returns an empty replies array', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [] },
      });

      const result = await slidesService.addTable({
        presentationId: 'p',
        slideObjectId: 's',
        rows: 2,
        columns: 2,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      });
      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('createTable returned no objectId');
    });

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Table Error'),
      );

      const result = await slidesService.addTable({
        presentationId: 'error-id',
        slideObjectId: 'slide1',
        rows: 2,
        columns: 2,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Table Error');
    });
  });

  describe('updateTextStyle', () => {
    it('should update text style for all text', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const result = await slidesService.updateTextStyle({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        style: '{"bold": true, "fontSize": {"magnitude": 18, "unit": "PT"}}',
        fields: 'bold,fontSize',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                objectId: 'shape-1',
                textRange: { type: 'ALL' },
                style: {
                  bold: true,
                  fontSize: { magnitude: 18, unit: 'PT' },
                },
                fields: 'bold,fontSize',
              },
            },
          ],
        },
      });
      expect(response.objectId).toBe('shape-1');
      expect(response.fields).toBe('bold,fontSize');
    });

    it('should update text style for a fixed range', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      await slidesService.updateTextStyle({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        style: '{"italic": true}',
        fields: 'italic',
        range: { type: 'FIXED_RANGE', startIndex: 0, endIndex: 10 },
      });

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              updateTextStyle: {
                objectId: 'shape-1',
                textRange: {
                  type: 'FIXED_RANGE',
                  startIndex: 0,
                  endIndex: 10,
                },
                style: { italic: true },
                fields: 'italic',
              },
            },
          ],
        },
      });
    });

    it('should surface the underlying JSON.parse message for invalid JSON', async () => {
      const result = await slidesService.updateTextStyle({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        style: '{bold: true}',
        fields: 'bold',
      });
      const response = JSON.parse(result.content[0].text);
      expect(result.isError).toBe(true);
      expect(response.error).toContain('Invalid JSON for style parameter:');
      expect(response.error.length).toBeGreaterThan(
        'Invalid JSON for style parameter: . Expected a JSON string like'
          .length,
      );
    });

    it.each([
      { label: 'string literal', payload: '"hello"', expectedGot: 'string' },
      { label: 'null', payload: 'null', expectedGot: 'null' },
      { label: 'array', payload: '[1,2]', expectedGot: 'array' },
      { label: 'number', payload: '42', expectedGot: 'number' },
    ])(
      'should reject non-object style payloads ($label)',
      async ({ payload, expectedGot }) => {
        const result = await slidesService.updateTextStyle({
          presentationId: 'p',
          objectId: 'shape-1',
          style: payload,
          fields: 'bold',
        });
        const response = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(response.error).toContain('Invalid style parameter');
        expect(response.error).toContain(expectedGot);
        expect(mockSlidesAPI.presentations.batchUpdate).not.toHaveBeenCalled();
      },
    );

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Style Error'),
      );

      const result = await slidesService.updateTextStyle({
        presentationId: 'error-id',
        objectId: 'shape-1',
        style: '{"bold": true}',
        fields: 'bold',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Style Error');
    });
  });

  describe('updateShapeProperties', () => {
    it('should update shape properties', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockResolvedValue({
        data: { replies: [{}] },
      });

      const shapePropertiesJson =
        '{"shapeBackgroundFill":{"solidFill":{"color":{"rgbColor":{"red":0,"green":0,"blue":1}}}}}';

      const result = await slidesService.updateShapeProperties({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        shapeProperties: shapePropertiesJson,
        fields: 'shapeBackgroundFill',
      });
      const response = JSON.parse(result.content[0].text);

      expect(mockSlidesAPI.presentations.batchUpdate).toHaveBeenCalledWith({
        presentationId: 'test-pres-id',
        requestBody: {
          requests: [
            {
              updateShapeProperties: {
                objectId: 'shape-1',
                shapeProperties: JSON.parse(shapePropertiesJson),
                fields: 'shapeBackgroundFill',
              },
            },
          ],
        },
      });
      expect(response.objectId).toBe('shape-1');
      expect(response.fields).toBe('shapeBackgroundFill');
    });

    it('should surface the underlying JSON.parse message for invalid JSON', async () => {
      const result = await slidesService.updateShapeProperties({
        presentationId: 'test-pres-id',
        objectId: 'shape-1',
        shapeProperties: '{outline: {}}',
        fields: 'outline',
      });
      const response = JSON.parse(result.content[0].text);
      expect(result.isError).toBe(true);
      expect(response.error).toContain(
        'Invalid JSON for shapeProperties parameter:',
      );
    });

    it.each([
      { label: 'string literal', payload: '"hello"', expectedGot: 'string' },
      { label: 'null', payload: 'null', expectedGot: 'null' },
      { label: 'array', payload: '[1,2]', expectedGot: 'array' },
      { label: 'number', payload: '42', expectedGot: 'number' },
    ])(
      'should reject non-object shapeProperties payloads ($label)',
      async ({ payload, expectedGot }) => {
        const result = await slidesService.updateShapeProperties({
          presentationId: 'p',
          objectId: 'shape-1',
          shapeProperties: payload,
          fields: 'outline',
        });
        const response = JSON.parse(result.content[0].text);

        expect(result.isError).toBe(true);
        expect(response.error).toContain('Invalid shapeProperties parameter');
        expect(response.error).toContain(expectedGot);
        expect(mockSlidesAPI.presentations.batchUpdate).not.toHaveBeenCalled();
      },
    );

    it('should handle errors gracefully', async () => {
      mockSlidesAPI.presentations.batchUpdate.mockRejectedValue(
        new Error('Shape Props Error'),
      );

      const result = await slidesService.updateShapeProperties({
        presentationId: 'error-id',
        objectId: 'shape-1',
        shapeProperties: '{}',
        fields: 'outline',
      });
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Shape Props Error');
    });
  });
});
