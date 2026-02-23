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
});
