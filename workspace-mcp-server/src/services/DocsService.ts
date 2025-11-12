/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, docs_v1, drive_v3 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { DriveService } from './DriveService';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { marked } from 'marked';
import { Readable } from 'node:stream';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { gaxiosOptions, mediaUploadOptions } from '../utils/GaxiosConfig';
import { buildDriveSearchQuery, MIME_TYPES } from '../utils/DriveQueryBuilder';
import { extractDocumentId as validateAndExtractDocId } from '../utils/validation';
import { parseMarkdownToDocsRequests, processMarkdownLineBreaks } from '../utils/markdownToDocsRequests';

export class DocsService {
    private purify: ReturnType<typeof createDOMPurify>;

    constructor(private authManager: AuthManager, private driveService: DriveService) {
        const window = new JSDOM('').window;
        this.purify = createDOMPurify(window as any);
    }

    private async getDocsClient(): Promise<docs_v1.Docs> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.docs({ version: 'v1', ...options });
    }

    private async getDriveClient(): Promise<drive_v3.Drive> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.drive({ version: 'v3', ...options });
    }

    public create = async ({ title, folderName, markdown }: { title: string, folderName?: string, markdown?: string }) => {
        logToFile(`[DocsService] Starting create with title: ${title}, folderName: ${folderName}, markdown: ${markdown ? 'true' : 'false'}`);
        try {
            const docInfo = await (async (): Promise<{ documentId: string; title: string; }> => {
                if (markdown) {
                    logToFile('[DocsService] Creating doc with markdown');
                    const unsafeHtml = await marked.parse(markdown);
                    const html = this.purify.sanitize(unsafeHtml);

                    const fileMetadata = {
                        name: title,
                        mimeType: 'application/vnd.google-apps.document',
                    };

                    const media = {
                        mimeType: 'text/html',
                        body: Readable.from(html),
                    };

                    logToFile('[DocsService] Calling drive.files.create');
                    const drive = await this.getDriveClient();
                    const file = await drive.files.create({
                        requestBody: fileMetadata,
                        media: media,
                        fields: 'id, name',
                    }, mediaUploadOptions);
                    logToFile('[DocsService] drive.files.create finished');
                    return { documentId: file.data.id!, title: file.data.name! };
                } else {
                    logToFile('[DocsService] Creating blank doc');
                    logToFile('[DocsService] Calling docs.documents.create');
                    const docs = await this.getDocsClient();
                    const doc = await docs.documents.create({
                        requestBody: { title },
                    });
                    logToFile('[DocsService] docs.documents.create finished');
                    return { documentId: doc.data.documentId!, title: doc.data.title! };
                }
            })();

            if (folderName) {
                logToFile(`[DocsService] Moving doc to folder: ${folderName}`);
                await this._moveFileToFolder(docInfo.documentId, folderName);
                logToFile(`[DocsService] Finished moving doc to folder: ${folderName}`);
            }

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        documentId: docInfo.documentId,
                        title: docInfo.title,
                    })
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during docs.create: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public insertText = async ({ documentId, text }: { documentId: string, text: string }) => {
        logToFile(`[DocsService] Starting insertText for document: ${documentId}`);
        try {
            const id = extractDocId(documentId) || documentId;

            // Parse markdown and generate formatting requests
            const { plainText, formattingRequests } = parseMarkdownToDocsRequests(text, 1);
            const processedText = processMarkdownLineBreaks(plainText);

            // Build batch update requests
            const requests: docs_v1.Schema$Request[] = [
                {
                    insertText: {
                        location: { index: 1 },
                        text: processedText,
                    },
                }
            ];

            // Add formatting requests if any
            if (formattingRequests.length > 0) {
                requests.push(...formattingRequests);
            }

            const docs = await this.getDocsClient();
            const res = await docs.documents.batchUpdate({
                documentId: id,
                requestBody: {
                    requests,
                },
            });

            logToFile(`[DocsService] Finished insertText for document: ${id}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        documentId: res.data.documentId!,
                        writeControl: res.data.writeControl!,
                    })
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[DocsService] Error during docs.insertText: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public find = async ({ query, pageToken, pageSize = 10 }: { query: string, pageToken?: string, pageSize?: number }) => {
        logToFile(`Searching for documents with query: ${query}`);
        if (pageToken) {
            logToFile(`Using pageToken: ${pageToken}`);
        }
        if (pageSize) {
            logToFile(`Using pageSize: ${pageSize}`);
        }
        try {
            const q = buildDriveSearchQuery(MIME_TYPES.DOCUMENT, query);
            logToFile(`Executing Drive API query: ${q}`);

            const drive = await this.getDriveClient();
            const res = await drive.files.list({
                pageSize: pageSize,
                fields: 'nextPageToken, files(id, name)',
                q: q,
                pageToken: pageToken,
            });

            const files = res.data.files || [];
            const nextPageToken = res.data.nextPageToken;

            logToFile(`Found ${files.length} files.`);
            if (nextPageToken) {
                logToFile(`Next page token: ${nextPageToken}`);
            }
            logToFile(`API Response: ${JSON.stringify(res.data, null, 2)}`);

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
            logToFile(`Error during docs.find: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public move = async ({ documentId, folderName }: { documentId: string, folderName: string }) => {
        logToFile(`[DocsService] Starting move for document: ${documentId}`);
        try {
            const id = extractDocId(documentId) || documentId;
            await this._moveFileToFolder(id, folderName);
            logToFile(`[DocsService] Finished move for document: ${id}`);
            return {
                content: [{
                    type: "text" as const,
                    text: `Moved document ${id} to folder ${folderName}`
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[DocsService] Error during docs.move: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public getText = async ({ documentId }: { documentId: string }) => {
        logToFile(`[DocsService] Starting getText for document: ${documentId}`);
        try {
            // Validate and extract document ID
            const id = validateAndExtractDocId(documentId);
            const docs = await this.getDocsClient();
            const res = await docs.documents.get({
                documentId: id,
                fields: 'body',
            });

            const body = res.data.body;
            let text = '';
            if (body && body.content) {
                body.content.forEach(element => {
                    text += this._readStructuralElement(element);
                });
            }

            logToFile(`[DocsService] Finished getText for document: ${id}`);
            return {
                content: [{
                    type: "text" as const,
                    text: text
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[DocsService] Error during docs.getText: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    private _readStructuralElement(element: docs_v1.Schema$StructuralElement): string {
        let text = '';
        if (element.paragraph) {
            element.paragraph.elements?.forEach(pElement => {
                if (pElement.textRun && pElement.textRun.content) {
                    text += pElement.textRun.content;
                }
            });
        } else if (element.table) {
            element.table.tableRows?.forEach(row => {
                row.tableCells?.forEach(cell => {
                    cell.content?.forEach(cellContent => {
                        text += this._readStructuralElement(cellContent);
                    });
                });
            });
        }
        return text;
    }

    public appendText = async ({ documentId, text }: { documentId: string, text: string }) => {
        logToFile(`[DocsService] Starting appendText for document: ${documentId}`);
        try {
            const id = extractDocId(documentId) || documentId;
            const docs = await this.getDocsClient();
            const res = await docs.documents.get({
                documentId: id,
                fields: 'body',
            });

            const body = res.data.body;
            const lastElement = body?.content?.[body.content.length - 1];
            const endIndex = lastElement?.endIndex || 1;

            const locationIndex = Math.max(1, endIndex - 1);

            // Parse markdown and generate formatting requests
            const { plainText, formattingRequests } = parseMarkdownToDocsRequests(text, locationIndex);
            const processedText = processMarkdownLineBreaks(plainText);

            // Build batch update requests
            const requests: docs_v1.Schema$Request[] = [
                {
                    insertText: {
                        location: { index: locationIndex },
                        text: processedText,
                    },
                }
            ];

            // Add formatting requests if any
            if (formattingRequests.length > 0) {
                requests.push(...formattingRequests);
            }

            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: {
                    requests,
                },
            });

            logToFile(`[DocsService] Finished appendText for document: ${id}`);
            return {
                content: [{
                    type: "text" as const,
                    text: `Successfully appended text to document ${id}`
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[DocsService] Error during docs.appendText: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public replaceText = async ({ documentId, findText, replaceText }: { documentId: string, findText: string, replaceText: string }) => {
        logToFile(`[DocsService] Starting replaceText for document: ${documentId}`);
        try {
            const id = extractDocId(documentId) || documentId;
            const docs = await this.getDocsClient();

            // Parse markdown to get plain text and formatting info
            const { plainText, formattingRequests: originalFormattingRequests } = parseMarkdownToDocsRequests(replaceText, 0);
            const processedText = processMarkdownLineBreaks(plainText);

            // First, get the document to find where the text will be replaced
            const docBefore = await docs.documents.get({
                documentId: id,
                fields: 'body',
            });

            // Find all occurrences of the text to be replaced
            const documentText = this._getFullDocumentText(docBefore.data.body);
            const occurrences: number[] = [];
            let searchIndex = 0;
            while ((searchIndex = documentText.indexOf(findText, searchIndex)) !== -1) {
                occurrences.push(searchIndex + 1); // Google Docs uses 1-based indexing
                searchIndex += findText.length;
            }

            // Build batch update requests
            const requests: docs_v1.Schema$Request[] = [
                {
                    replaceAllText: {
                        replaceText: processedText,
                        containsText: {
                            text: findText,
                            matchCase: true,
                        },
                    },
                }
            ];

            // Calculate formatting positions for each replacement
            // After replacement, we need to adjust indices based on text length difference
            const lengthDiff = processedText.length - findText.length;
            let cumulativeOffset = 0;

            for (let i = 0; i < occurrences.length; i++) {
                const occurrence = occurrences[i];
                const adjustedPosition = occurrence + cumulativeOffset - 1; // Subtract 1 because parseMarkdownToDocsRequests expects 0-based

                // Adjust formatting requests for this occurrence
                for (const formatRequest of originalFormattingRequests) {
                    if (formatRequest.updateTextStyle) {
                        const adjustedRequest: docs_v1.Schema$Request = {
                            updateTextStyle: {
                                ...formatRequest.updateTextStyle,
                                range: {
                                    startIndex: (formatRequest.updateTextStyle.range?.startIndex || 0) + adjustedPosition,
                                    endIndex: (formatRequest.updateTextStyle.range?.endIndex || 0) + adjustedPosition
                                }
                            }
                        };
                        requests.push(adjustedRequest);
                    }
                }

                cumulativeOffset += lengthDiff;
            }

            await docs.documents.batchUpdate({
                documentId: id,
                requestBody: {
                    requests,
                },
            });

            logToFile(`[DocsService] Finished replaceText for document: ${id}`);
            return {
                content: [{
                    type: "text" as const,
                    text: `Successfully replaced text in document ${id}`
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[DocsService] Error during docs.replaceText: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    private _getFullDocumentText(body: docs_v1.Schema$Body | undefined): string {
        let text = '';
        if (body && body.content) {
            body.content.forEach(element => {
                text += this._readStructuralElement(element);
            });
        }
        return text;
    }

    

    private async _moveFileToFolder(documentId: string, folderName: string): Promise<void> {
        try {
            const findFolderResponse = await this.driveService.findFolder({ folderName });
            const parsedResponse = JSON.parse(findFolderResponse.content[0].text);

            if (parsedResponse.error) {
                throw new Error(parsedResponse.error);
            }

            const folders = parsedResponse as { id: string, name: string }[];

            if (folders.length === 0) {
                throw new Error(`Folder not found: ${folderName}`);
            }

            if (folders.length > 1) {
                logToFile(`Warning: Found multiple folders with name "${folderName}". Using the first one found.`);
            }

            const folderId = folders[0].id;
            const drive = await this.getDriveClient();
            const file = await drive.files.get({
                fileId: documentId,
                fields: 'parents',
            });
            
            const previousParents = file.data.parents?.join(',');

            await drive.files.update({
                fileId: documentId,
                addParents: folderId,
                removeParents: previousParents,
                fields: 'id, parents',
            });
        } catch (error) {
            if (error instanceof Error) {
                logToFile(`Error during _moveFileToFolder: ${error.message}`);
            } else {
                logToFile(`An unknown error occurred during _moveFileToFolder: ${JSON.stringify(error)}`);
            }
            throw error;
        }
    }
}
