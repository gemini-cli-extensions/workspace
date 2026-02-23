/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, slides_v1 } from 'googleapis';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { request } from 'gaxios';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export const PREDEFINED_LAYOUTS = [
  'BLANK',
  'TITLE',
  'TITLE_AND_BODY',
  'TITLE_AND_TWO_COLUMNS',
  'TITLE_ONLY',
  'SECTION_HEADER',
  'SECTION_TITLE_AND_DESCRIPTION',
  'ONE_COLUMN_TEXT',
  'MAIN_POINT',
  'BIG_NUMBER',
] as const;
export type PredefinedLayout = (typeof PREDEFINED_LAYOUTS)[number];

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: 'text'; text: string }>;
};

export class SlidesService {
  constructor(private authManager: AuthManager) {}

  private async getSlidesClient(): Promise<slides_v1.Slides> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.slides({ version: 'v1', ...options });
  }

  public getText = async ({ presentationId }: { presentationId: string }) => {
    logToFile(
      `[SlidesService] Starting getText for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;

      const slides = await this.getSlidesClient();
      // Get the presentation with all necessary fields
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'title,slides(pageElements(shape(text,shapeProperties),table(tableRows(tableCells(text)))))',
      });

      let content = '';

      // Add presentation title
      if (presentation.data.title) {
        content += `Presentation Title: ${presentation.data.title}\n\n`;
      }

      // Process each slide
      if (presentation.data.slides) {
        presentation.data.slides.forEach((slide, slideIndex) => {
          content += `\n--- Slide ${slideIndex + 1} ---\n`;

          if (slide.pageElements) {
            slide.pageElements.forEach((element) => {
              // Extract text from shapes
              if (element.shape && element.shape.text) {
                const shapeText = this.extractTextFromTextContent(
                  element.shape.text,
                );
                if (shapeText) {
                  content += shapeText + '\n';
                }
              }

              // Extract text from tables
              if (element.table && element.table.tableRows) {
                content += '\n--- Table Data ---\n';
                element.table.tableRows.forEach((row) => {
                  const rowText: string[] = [];
                  if (row.tableCells) {
                    row.tableCells.forEach((cell) => {
                      const cellText = cell.text
                        ? this.extractTextFromTextContent(cell.text)
                        : '';
                      rowText.push(cellText.trim());
                    });
                  }
                  content += rowText.join(' | ') + '\n';
                });
                content += '--- End Table Data ---\n';
              }
            });
          }
          content += '\n';
        });
      }

      logToFile(`[SlidesService] Finished getText for presentation: ${id}`);
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
      logToFile(`[SlidesService] Error during slides.getText: ${errorMessage}`);
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

  private extractTextFromTextContent(
    textContent: slides_v1.Schema$TextContent,
  ): string {
    let text = '';
    if (textContent.textElements) {
      textContent.textElements.forEach((element) => {
        if (element.textRun && element.textRun.content) {
          text += element.textRun.content;
        } else if (element.paragraphMarker) {
          // Add newline for paragraph markers
          text += '\n';
        }
      });
    }
    return text;
  }

  public getMetadata = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getMetadata for presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;

      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'presentationId,title,slides(objectId),pageSize,notesMaster,masters,layouts',
      });

      const metadata = {
        presentationId: presentation.data.presentationId,
        title: presentation.data.title,
        slideCount: presentation.data.slides?.length || 0,
        slides:
          presentation.data.slides?.map(({ objectId }) => ({ objectId })) ?? [],
        pageSize: presentation.data.pageSize,
        hasMasters: !!presentation.data.masters?.length,
        hasLayouts: !!presentation.data.layouts?.length,
        hasNotesMaster: !!presentation.data.notesMaster,
      };

      logToFile(`[SlidesService] Finished getMetadata for presentation: ${id}`);
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
        `[SlidesService] Error during slides.getMetadata: ${errorMessage}`,
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

  private async downloadToLocal(url: string, localPath: string) {
    logToFile(`[SlidesService] Downloading from ${url} to ${localPath}`);
    if (!path.isAbsolute(localPath)) {
      throw new Error('localPath must be an absolute path.');
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(localPath), { recursive: true });

    const response = await request({
      url,
      responseType: 'arraybuffer',
      ...gaxiosOptions,
    });

    await fs.writeFile(localPath, Buffer.from(response.data as ArrayBuffer));
    logToFile(`[SlidesService] Downloaded successfully to ${localPath}`);
    return localPath;
  }

  public getImages = async ({
    presentationId,
    localPath,
  }: {
    presentationId: string;
    localPath: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getImages for presentation: ${presentationId} (localPath: ${localPath})`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.get({
        presentationId: id,
        fields:
          'slides(objectId,pageElements(objectId,title,description,image(contentUrl,sourceUrl)))',
      });

      const images = await Promise.all(
        (presentation.data.slides ?? []).flatMap((slide, index) =>
          (slide.pageElements ?? [])
            .filter((element) => element.image)
            .map(async (element) => {
              const imageData: any = {
                slideIndex: index + 1,
                slideObjectId: slide.objectId,
                elementObjectId: element.objectId,
                title: element.title,
                description: element.description,
                contentUrl: element.image?.contentUrl,
                sourceUrl: element.image?.sourceUrl,
              };

              if (imageData.contentUrl) {
                const filename = `slide_${imageData.slideIndex}_${element.objectId}.png`;
                const fullPath = path.join(localPath, filename);
                try {
                  await this.downloadToLocal(imageData.contentUrl, fullPath);
                  imageData.localPath = fullPath;
                } catch (downloadError) {
                  logToFile(
                    `[SlidesService] Failed to download image ${element.objectId}: ${downloadError}`,
                  );
                  imageData.downloadError = String(downloadError);
                }
              }

              return imageData;
            }),
        ),
      );

      logToFile(`[SlidesService] Finished getImages for presentation: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ images }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getImages: ${errorMessage}`,
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

  private formatError(method: string, error: unknown): ToolResult {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    logToFile(`[SlidesService] Error during ${method}: ${errorMessage}`);
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

  private formatResult(data: unknown): ToolResult {
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(data),
        },
      ],
    };
  }

  public create = async ({ title }: { title: string }) => {
    logToFile(`[SlidesService] Creating presentation: ${title}`);
    try {
      const slides = await this.getSlidesClient();
      const presentation = await slides.presentations.create({
        requestBody: { title },
      });

      const result = {
        presentationId: presentation.data.presentationId,
        title: presentation.data.title,
        url: `https://docs.google.com/presentation/d/${presentation.data.presentationId}/edit`,
      };

      logToFile(
        `[SlidesService] Created presentation: ${result.presentationId}`,
      );
      return this.formatResult(result);
    } catch (error) {
      return this.formatError('slides.create', error);
    }
  };

  public addSlide = async ({
    presentationId,
    insertionIndex,
    layoutId,
    predefinedLayout,
    objectId,
  }: {
    presentationId: string;
    insertionIndex?: number;
    layoutId?: string;
    predefinedLayout?: PredefinedLayout;
    objectId?: string;
  }) => {
    logToFile(
      `[SlidesService] Adding slide to presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      const createSlideRequest: slides_v1.Schema$CreateSlideRequest = {};
      if (insertionIndex !== undefined) {
        createSlideRequest.insertionIndex = insertionIndex;
      }
      if (objectId) {
        createSlideRequest.objectId = objectId;
      }
      if (layoutId) {
        createSlideRequest.slideLayoutReference = { layoutId };
      } else if (predefinedLayout) {
        if (!PREDEFINED_LAYOUTS.includes(predefinedLayout)) {
          throw new Error(
            `Invalid predefinedLayout "${predefinedLayout}". Expected one of: ${PREDEFINED_LAYOUTS.join(', ')}.`,
          );
        }
        createSlideRequest.slideLayoutReference = { predefinedLayout };
      }

      const response = await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ createSlide: createSlideRequest }],
        },
      });

      const slideObjectId = response.data.replies?.[0]?.createSlide?.objectId;
      if (!slideObjectId) {
        throw new Error(
          'createSlide returned no objectId; batchUpdate reply was empty or malformed.',
        );
      }

      logToFile(`[SlidesService] Added slide: ${slideObjectId}`);
      return this.formatResult({
        presentationId: id,
        slideObjectId,
      });
    } catch (error) {
      return this.formatError('slides.addSlide', error);
    }
  };

  public deleteSlide = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId: string;
  }) => {
    logToFile(
      `[SlidesService] Deleting slide ${slideObjectId} from presentation: ${presentationId}`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();

      await slides.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [{ deleteObject: { objectId: slideObjectId } }],
        },
      });

      logToFile(`[SlidesService] Deleted slide: ${slideObjectId}`);
      return this.formatResult({
        presentationId: id,
        deletedSlideObjectId: slideObjectId,
      });
    } catch (error) {
      return this.formatError('slides.deleteSlide', error);
    }
  };

  public getSlideThumbnail = async ({
    presentationId,
    slideObjectId,
    localPath,
  }: {
    presentationId: string;
    slideObjectId: string;
    localPath: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getSlideThumbnail for presentation: ${presentationId}, slide: ${slideObjectId} (localPath: ${localPath})`,
    );
    try {
      const id = extractDocId(presentationId) || presentationId;
      const slides = await this.getSlidesClient();
      const thumbnail = await slides.presentations.pages.getThumbnail({
        presentationId: id,
        pageObjectId: slideObjectId,
      });

      const result: any = { ...thumbnail.data };

      if (result.contentUrl) {
        try {
          await this.downloadToLocal(result.contentUrl, localPath);
          result.localPath = localPath;
        } catch (downloadError) {
          logToFile(
            `[SlidesService] Failed to download thumbnail for slide ${slideObjectId}: ${downloadError}`,
          );
          result.downloadError = String(downloadError);
        }
      }

      logToFile(
        `[SlidesService] Finished getSlideThumbnail for slide: ${slideObjectId}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[SlidesService] Error during slides.getSlideThumbnail: ${errorMessage}`,
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
