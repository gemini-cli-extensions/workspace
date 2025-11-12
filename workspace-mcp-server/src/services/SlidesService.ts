/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, slides_v1, drive_v3 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { buildDriveSearchQuery, MIME_TYPES } from '../utils/DriveQueryBuilder';

export class SlidesService {
    constructor(private authManager: AuthManager) {
    }

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

    public getText = async ({ presentationId }: { presentationId: string }) => {
        logToFile(`[SlidesService] Starting getText for presentation: ${presentationId}`);
        try {
            const id = extractDocId(presentationId) || presentationId;
            
            const slides = await this.getSlidesClient();
            // Get the presentation with all necessary fields
            const presentation = await slides.presentations.get({
                presentationId: id,
                fields: 'title,slides(pageElements(shape(text,shapeProperties),table(tableRows(tableCells(text)))))',
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
                        slide.pageElements.forEach(element => {
                            // Extract text from shapes
                            if (element.shape && element.shape.text) {
                                const shapeText = this.extractTextFromTextContent(element.shape.text);
                                if (shapeText) {
                                    content += shapeText + '\n';
                                }
                            }
                            
                            // Extract text from tables
                            if (element.table && element.table.tableRows) {
                                content += '\n--- Table Data ---\n';
                                element.table.tableRows.forEach(row => {
                                    const rowText: string[] = [];
                                    if (row.tableCells) {
                                        row.tableCells.forEach(cell => {
                                            const cellText = cell.text ? this.extractTextFromTextContent(cell.text) : '';
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
                content: [{
                    type: "text" as const,
                    text: content.trim()
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[SlidesService] Error during slides.getText: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    private extractTextFromTextContent(textContent: slides_v1.Schema$TextContent): string {
        let text = '';
        if (textContent.textElements) {
            textContent.textElements.forEach(element => {
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

    public find = async ({ query, pageToken, pageSize = 10 }: { query: string, pageToken?: string, pageSize?: number }) => {
        logToFile(`[SlidesService] Searching for presentations with query: ${query}`);
        try {
            const q = buildDriveSearchQuery(MIME_TYPES.PRESENTATION, query);
            logToFile(`[SlidesService] Executing Drive API query: ${q}`);

            const drive = await this.getDriveClient();
            const res = await drive.files.list({
                pageSize: pageSize,
                fields: 'nextPageToken, files(id, name)',
                q: q,
                pageToken: pageToken,
            });

            const files = res.data.files || [];
            const nextPageToken = res.data.nextPageToken;

            logToFile(`[SlidesService] Found ${files.length} presentations.`);
            
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        files: files,
                        nextPageToken: nextPageToken
                    })
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[SlidesService] Error during slides.find: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public getMetadata = async ({ presentationId }: { presentationId: string }) => {
        logToFile(`[SlidesService] Starting getMetadata for presentation: ${presentationId}`);
        try {
            const id = extractDocId(presentationId) || presentationId;
            
            const slides = await this.getSlidesClient();
            const presentation = await slides.presentations.get({
                presentationId: id,
                fields: 'presentationId,title,slides(objectId),pageSize,notesMaster,masters,layouts',
            });

            const metadata = {
                presentationId: presentation.data.presentationId,
                title: presentation.data.title,
                slideCount: presentation.data.slides?.length || 0,
                pageSize: presentation.data.pageSize,
                hasMasters: !!presentation.data.masters?.length,
                hasLayouts: !!presentation.data.layouts?.length,
                hasNotesMaster: !!presentation.data.notesMaster,
            };

            logToFile(`[SlidesService] Finished getMetadata for presentation: ${id}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(metadata)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[SlidesService] Error during slides.getMetadata: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }
}
