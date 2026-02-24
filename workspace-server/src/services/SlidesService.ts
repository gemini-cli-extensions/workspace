/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, slides_v1, drive_v3 } from 'googleapis';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { request } from 'gaxios';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { buildDriveSearchQuery, MIME_TYPES } from '../utils/DriveQueryBuilder';

const PT_UNIT = 'PT';
const DEFAULT_LAYOUT = 'TITLE_AND_BODY';

type SlideLayout = 'TITLE' | 'TITLE_AND_BODY' | 'BLANK';
type ShapeType = 'TEXT_BOX' | 'TITLE' | 'SUBTITLE';
type CreateShapeType = 'TEXT_BOX';

interface SlideSeedInput {
  title?: string;
  body?: string[];
  layout?: SlideLayout;
}

interface ShapeGeometry {
  xPt: number;
  yPt: number;
  widthPt: number;
  heightPt: number;
}

interface BuildAddSlideResult {
  slideObjectId: string;
  requests: slides_v1.Schema$Request[];
}

interface WriteErrorPayload {
  error: string;
  code: string;
  retryable: boolean;
  rolledBack?: boolean;
}

export class SlidesService {
  constructor(private authManager: AuthManager) {}

  private async getSlidesClient(): Promise<slides_v1.Slides> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.slides({ version: 'v1', ...options });
  }

  private async getDriveClient(): Promise<drive_v3.Drive> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.drive({ version: 'v3', ...options });
  }

  private toPresentationId(presentationId: string): string {
    return extractDocId(presentationId) || presentationId;
  }

  private createObjectId(prefix: string): string {
    const entropy = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    return `${prefix}_${entropy}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private getShapeGeometry(shapeType: ShapeType): ShapeGeometry {
    if (shapeType === 'TITLE') {
      return {
        xPt: 40,
        yPt: 36,
        widthPt: 640,
        heightPt: 64,
      };
    }

    if (shapeType === 'SUBTITLE') {
      return {
        xPt: 40,
        yPt: 112,
        widthPt: 640,
        heightPt: 72,
      };
    }

    return {
      xPt: 40,
      yPt: 120,
      widthPt: 640,
      heightPt: 300,
    };
  }

  private toLayout(layout?: SlideLayout): SlideLayout {
    return layout || DEFAULT_LAYOUT;
  }

  private buildCreateShapeRequest(
    slideObjectId: string,
    shapeObjectId: string,
    shapeType: ShapeType,
    geometry: ShapeGeometry,
  ): slides_v1.Schema$Request {
    const normalizedShapeType: CreateShapeType = this.toCreateShapeType(shapeType);
    return {
      createShape: {
        objectId: shapeObjectId,
        shapeType: normalizedShapeType,
        elementProperties: {
          pageObjectId: slideObjectId,
          size: {
            width: { magnitude: geometry.widthPt, unit: PT_UNIT },
            height: { magnitude: geometry.heightPt, unit: PT_UNIT },
          },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: geometry.xPt,
            translateY: geometry.yPt,
            unit: PT_UNIT,
          },
        },
      },
    };
  }

  private toCreateShapeType(_shapeType: ShapeType): CreateShapeType {
    // TITLE and SUBTITLE are not valid createShape enums in Google Slides API.
    // Keep API compatibility by mapping all of our text-like aliases to TEXT_BOX.
    return 'TEXT_BOX';
  }

  private buildWriteError(
    error: unknown,
    code: string,
    retryable: boolean,
    extras?: { rolledBack?: boolean },
  ): WriteErrorPayload {
    return {
      error: error instanceof Error ? error.message : String(error),
      code,
      retryable,
      ...(extras ?? {}),
    };
  }

  private buildAddSlideRequests(
    slide: SlideSeedInput,
    insertionIndex?: number,
  ): BuildAddSlideResult {
    const slideObjectId = this.createObjectId('slide');
    const requests: slides_v1.Schema$Request[] = [
      {
        createSlide: {
          objectId: slideObjectId,
          insertionIndex,
          slideLayoutReference: {
            predefinedLayout: this.toLayout(slide.layout),
          },
        },
      },
    ];

    if (slide.title) {
      const titleShapeId = this.createObjectId('title');
      requests.push(
        this.buildCreateShapeRequest(
          slideObjectId,
          titleShapeId,
          'TITLE',
          this.getShapeGeometry('TITLE'),
        ),
        {
          insertText: {
            objectId: titleShapeId,
            insertionIndex: 0,
            text: slide.title,
          },
        },
      );
    }

    if (slide.body?.length) {
      const bodyShapeId = this.createObjectId('body');
      requests.push(
        this.buildCreateShapeRequest(
          slideObjectId,
          bodyShapeId,
          'TEXT_BOX',
          this.getShapeGeometry('TEXT_BOX'),
        ),
        {
          insertText: {
            objectId: bodyShapeId,
            insertionIndex: 0,
            text: slide.body.join('\n'),
          },
        },
      );
    }

    return { slideObjectId, requests };
  }

  private async movePresentationToFolder(
    presentationId: string,
    folderName: string,
  ): Promise<string> {
    const drive = await this.getDriveClient();
    const escapedFolderName = folderName.replace(/'/g, "\\'");
    const folderQuery =
      `mimeType='application/vnd.google-apps.folder' and ` +
      `name='${escapedFolderName}' and trashed=false`;

    const folderSearchResponse = await drive.files.list({
      q: folderQuery,
      pageSize: 2,
      fields: 'files(id,name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const folders = folderSearchResponse.data.files ?? [];
    if (folders.length === 0 || !folders[0].id) {
      throw new Error(`Folder not found: ${folderName}`);
    }

    if (folders.length > 1) {
      logToFile(
        `[SlidesService] Multiple folders found for "${folderName}". Using first match (${folders[0].id}).`,
      );
    }

    const folderId = folders[0].id;
    const file = await drive.files.get({
      fileId: presentationId,
      fields: 'parents',
      supportsAllDrives: true,
    });

    await drive.files.update({
      fileId: presentationId,
      addParents: folderId,
      removeParents: file.data.parents?.join(','),
      fields: 'id,parents',
      supportsAllDrives: true,
    });

    return folderId;
  }

  public create = async ({
    title,
    folderName,
    slides,
  }: {
    title: string;
    folderName?: string;
    slides?: SlideSeedInput[];
  }) => {
    logToFile(
      `[SlidesService] Starting create with title: ${title}, folderName: ${folderName}, slideCount: ${slides?.length ?? 0}`,
    );
    let presentationId: string | undefined;
    try {
      const slidesClient = await this.getSlidesClient();
      const createdPresentation = await slidesClient.presentations.create({
        requestBody: { title },
      });

      presentationId = createdPresentation.data.presentationId;
      if (!presentationId) {
        throw new Error('Slides API did not return a presentationId.');
      }

      const defaultSlideObjectId = createdPresentation.data.slides?.[0]?.objectId;
      const createdSlideObjectIds: string[] = [];

      if (slides?.length) {
        const requests: slides_v1.Schema$Request[] = [];

        if (defaultSlideObjectId) {
          requests.push({
            deleteObject: {
              objectId: defaultSlideObjectId,
            },
          });
        }

        slides.forEach((slideSeed) => {
          const built = this.buildAddSlideRequests(slideSeed);
          createdSlideObjectIds.push(built.slideObjectId);
          requests.push(...built.requests);
        });

        await slidesClient.presentations.batchUpdate({
          presentationId,
          requestBody: { requests },
        });
      } else if (defaultSlideObjectId) {
        createdSlideObjectIds.push(defaultSlideObjectId);
      }

      let folderId: string | undefined;
      if (folderName) {
        folderId = await this.movePresentationToFolder(presentationId, folderName);
      }

      logToFile(
        `[SlidesService] Finished create for presentation: ${presentationId}`,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId,
              title: createdPresentation.data.title || title,
              url: `https://docs.google.com/presentation/d/${presentationId}/edit`,
              slideObjectIds: createdSlideObjectIds,
              folderId,
            }),
          },
        ],
      };
    } catch (error) {
      let rolledBack = false;

      // If seeded creation fails after shell creation, delete the shell to avoid orphan decks.
      if (presentationId && slides?.length) {
        try {
          const drive = await this.getDriveClient();
          await drive.files.delete({
            fileId: presentationId,
            supportsAllDrives: true,
          });
          rolledBack = true;
          logToFile(
            `[SlidesService] Rolled back failed seeded create by deleting presentation: ${presentationId}`,
          );
        } catch (rollbackError) {
          const rollbackMessage =
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError);
          logToFile(
            `[SlidesService] Failed to roll back presentation ${presentationId}: ${rollbackMessage}`,
          );
        }
      }

      const payload =
        rolledBack && slides?.length
          ? this.buildWriteError(error, 'SLIDES_CREATE_ROLLED_BACK', false, {
              rolledBack: true,
            })
          : this.buildWriteError(error, 'SLIDES_INVALID_REQUEST', false);

      logToFile(
        `[SlidesService] Error during slides.create [${payload.code}]: ${payload.error}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload),
          },
        ],
      };
    }
  };

  public addSlide = async ({
    presentationId,
    layout,
    insertionIndex,
    title,
    body,
  }: {
    presentationId: string;
    layout?: SlideLayout;
    insertionIndex?: number;
    title?: string;
    body?: string[];
  }) => {
    logToFile(
      `[SlidesService] Starting addSlide for presentation: ${presentationId}`,
    );
    try {
      const id = this.toPresentationId(presentationId);
      const slidesClient = await this.getSlidesClient();

      const built = this.buildAddSlideRequests(
        {
          layout,
          title,
          body,
        },
        insertionIndex,
      );

      const response = await slidesClient.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: built.requests,
        },
      });

      logToFile(`[SlidesService] Finished addSlide for presentation: ${id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: id,
              slideObjectId: built.slideObjectId,
              replies: response.data.replies,
              writeControl: response.data.writeControl,
            }),
          },
        ],
      };
    } catch (error) {
      const payload = this.buildWriteError(
        error,
        'SLIDES_INVALID_REQUEST',
        false,
      );
      logToFile(
        `[SlidesService] Error during slides.addSlide [${payload.code}]: ${payload.error}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload),
          },
        ],
      };
    }
  };

  public insertText = async ({
    presentationId,
    slideObjectId,
    text,
    shapeType = 'TEXT_BOX',
    xPt,
    yPt,
    widthPt,
    heightPt,
  }: {
    presentationId: string;
    slideObjectId: string;
    text: string;
    shapeType?: ShapeType;
    xPt?: number;
    yPt?: number;
    widthPt?: number;
    heightPt?: number;
  }) => {
    logToFile(
      `[SlidesService] Starting insertText for presentation: ${presentationId}, slide: ${slideObjectId}`,
    );
    try {
      const id = this.toPresentationId(presentationId);
      const slidesClient = await this.getSlidesClient();

      const defaultGeometry = this.getShapeGeometry(shapeType);
      const geometry: ShapeGeometry = {
        xPt: xPt ?? defaultGeometry.xPt,
        yPt: yPt ?? defaultGeometry.yPt,
        widthPt: widthPt ?? defaultGeometry.widthPt,
        heightPt: heightPt ?? defaultGeometry.heightPt,
      };

      const shapeObjectId = this.createObjectId('shape');
      const requests: slides_v1.Schema$Request[] = [
        this.buildCreateShapeRequest(
          slideObjectId,
          shapeObjectId,
          shapeType,
          geometry,
        ),
        {
          insertText: {
            objectId: shapeObjectId,
            insertionIndex: 0,
            text,
          },
        },
      ];

      await slidesClient.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });

      logToFile(`[SlidesService] Finished insertText for presentation: ${id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: id,
              slideObjectId,
              shapeObjectId,
            }),
          },
        ],
      };
    } catch (error) {
      const payload = this.buildWriteError(
        error,
        'SLIDES_INVALID_REQUEST',
        false,
      );
      logToFile(
        `[SlidesService] Error during slides.insertText [${payload.code}]: ${payload.error}`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(payload),
          },
        ],
      };
    }
  };

  public replaceText = async ({
    presentationId,
    findText,
    replaceText,
    matchCase = false,
  }: {
    presentationId: string;
    findText: string;
    replaceText: string;
    matchCase?: boolean;
  }) => {
    logToFile(
      `[SlidesService] Starting replaceText for presentation: ${presentationId}`,
    );
    try {
      const id = this.toPresentationId(presentationId);
      const slidesClient = await this.getSlidesClient();
      const result = await slidesClient.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              replaceAllText: {
                containsText: {
                  text: findText,
                  matchCase,
                },
                replaceText,
              },
            },
          ],
        },
      });

      logToFile(`[SlidesService] Finished replaceText for presentation: ${id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: id,
              replies: result.data.replies,
              writeControl: result.data.writeControl,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SlidesService] Error during slides.replaceText: ${errorMessage}`);
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

  public deleteSlide = async ({
    presentationId,
    slideObjectId,
  }: {
    presentationId: string;
    slideObjectId: string;
  }) => {
    logToFile(
      `[SlidesService] Starting deleteSlide for presentation: ${presentationId}, slide: ${slideObjectId}`,
    );
    try {
      const id = this.toPresentationId(presentationId);
      const slidesClient = await this.getSlidesClient();

      await slidesClient.presentations.batchUpdate({
        presentationId: id,
        requestBody: {
          requests: [
            {
              deleteObject: {
                objectId: slideObjectId,
              },
            },
          ],
        },
      });

      logToFile(`[SlidesService] Finished deleteSlide for presentation: ${id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: id,
              deletedSlideObjectId: slideObjectId,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SlidesService] Error during slides.deleteSlide: ${errorMessage}`);
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

  public batchUpdate = async ({
    presentationId,
    requests,
  }: {
    presentationId: string;
    requests: slides_v1.Schema$Request[];
  }) => {
    logToFile(
      `[SlidesService] Starting batchUpdate for presentation: ${presentationId} with ${requests.length} requests`,
    );
    try {
      const id = this.toPresentationId(presentationId);
      const slidesClient = await this.getSlidesClient();

      const response = await slidesClient.presentations.batchUpdate({
        presentationId: id,
        requestBody: { requests },
      });

      logToFile(`[SlidesService] Finished batchUpdate for presentation: ${id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              presentationId: id,
              replies: response.data.replies,
              writeControl: response.data.writeControl,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SlidesService] Error during slides.batchUpdate: ${errorMessage}`);
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

  public getText = async ({ presentationId }: { presentationId: string }) => {
    logToFile(
      `[SlidesService] Starting getText for presentation: ${presentationId}`,
    );
    try {
      const id = this.toPresentationId(presentationId);

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

  public find = async ({
    query,
    pageToken,
    pageSize = 10,
  }: {
    query: string;
    pageToken?: string;
    pageSize?: number;
  }) => {
    logToFile(
      `[SlidesService] Searching for presentations with query: ${query}`,
    );
    try {
      const q = buildDriveSearchQuery(MIME_TYPES.PRESENTATION, query);
      logToFile(`[SlidesService] Executing Drive API query: ${q}`);

      const drive = await this.getDriveClient();
      const res = await drive.files.list({
        pageSize: pageSize,
        fields: 'nextPageToken, files(id, name)',
        q: q,
        pageToken: pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const files = res.data.files || [];
      const nextPageToken = res.data.nextPageToken;

      logToFile(`[SlidesService] Found ${files.length} presentations.`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              files: files,
              nextPageToken: nextPageToken,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[SlidesService] Error during slides.find: ${errorMessage}`);
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

  public getMetadata = async ({
    presentationId,
  }: {
    presentationId: string;
  }) => {
    logToFile(
      `[SlidesService] Starting getMetadata for presentation: ${presentationId}`,
    );
    try {
      const id = this.toPresentationId(presentationId);

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
      const id = this.toPresentationId(presentationId);
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
      const id = this.toPresentationId(presentationId);
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
