/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, drive_v3 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { escapeQueryString } from '../utils/DriveQueryBuilder';

const MIN_DRIVE_ID_LENGTH = 25;

const URL_PATTERNS = [
    { pattern: /\/folders\/([a-zA-Z0-9-_]+)/, type: 'folder' as const },
    { pattern: /\/file\/d\/([a-zA-Z0-9-_]+)/, type: 'file' as const },
    { pattern: /\/document\/d\/([a-zA-Z0-9-_]+)/, type: 'file' as const },
    { pattern: /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/, type: 'file' as const },
    { pattern: /\/presentation\/d\/([a-zA-Z0-9-_]+)/, type: 'file' as const },
    { pattern: /\/forms\/d\/([a-zA-Z0-9-_]+)/, type: 'file' as const },
    { pattern: /[?&]id=([a-zA-Z0-9-_]+)/, type: 'unknown' as const }
];

export class DriveService {
    constructor(private authManager: AuthManager) {
    }

    private async getDriveClient(): Promise<drive_v3.Drive> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.drive({ version: 'v3', ...options });
    }

    public findFolder = async ({ folderName }: { folderName: string }) => {
        logToFile(`Searching for folder with name: ${folderName}`);
        try {
            const drive = await this.getDriveClient();
            const query = `mimeType='application/vnd.google-apps.folder' and name = '${folderName}'`;
            logToFile(`Executing Drive API query: ${query}`);
            const res = await drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive',
            });

            const folders = res.data.files || [];
            logToFile(`Found ${folders.length} folders.`);
            logToFile(`API Response: ${JSON.stringify(folders, null, 2)}`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(folders)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during drive.findFolder: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public search = async ({ query, pageSize = 10, pageToken, corpus, unreadOnly, sharedWithMe }: { query?: string, pageSize?: number, pageToken?: string, corpus?: string, unreadOnly?: boolean, sharedWithMe?: boolean }) => {
        const drive = await this.getDriveClient();
        let q = query;
        let isProcessed = false;

        // Check if query is a Google Drive URL
        if (query && (query.includes('drive.google.com') || query.includes('docs.google.com'))) {
            isProcessed = true;
            logToFile(`Detected Google Drive URL in query: ${query}`);

            let fileId: string | null = null;
            let urlType: 'file' | 'folder' | 'unknown' = 'unknown';

            for (const urlPattern of URL_PATTERNS) {
                const match = query.match(urlPattern.pattern);
                if (match) {
                    fileId = match[1];
                    urlType = urlPattern.type;
                    break;
                }
            }

            if (fileId) {
                let isFolder = urlType === 'folder';

                if (urlType === 'unknown') {
                    try {
                        const file = await drive.files.get({ fileId, fields: 'mimeType' });
                        if (file.data.mimeType === 'application/vnd.google-apps.folder') {
                            isFolder = true;
                        }
                    } catch {
                        logToFile(`Could not determine type of ID from URL, treating as file: ${fileId}`);
                    }
                }

                if (isFolder) {
                    q = `'${fileId}' in parents`;
                    logToFile(`Extracted Folder ID from URL: ${fileId}, using query: ${q}`);
                } else {
                    logToFile(`Extracted File ID from URL: ${fileId}, using files.get`);
                    try {
                        const res = await drive.files.get({
                            fileId: fileId,
                            fields: 'id, name, modifiedTime, viewedByMeTime, mimeType, parents',
                        });
                        return {
                            content: [{
                                type: "text" as const,
                                text: JSON.stringify({
                                    files: [res.data],
                                    nextPageToken: null
                                })
                            }]
                        };
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        logToFile(`Error during drive.files.get: ${errorMessage}`);
                        return {
                            content: [{
                                type: "text" as const,
                                text: JSON.stringify({ error: errorMessage })
                            }]
                        };
                    }
                }
            } else {
                logToFile(`Could not extract file/folder ID from URL: ${query}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            error: "Invalid Drive URL. Please provide a valid Google Drive URL or a search query.",
                            details: "Could not extract file or folder ID from the provided URL."
                        })
                    }]
                };
            }
        }

        if (query && !isProcessed) {
            const titlePrefix = 'title:';
            const trimmedQuery = query.trim();

            if (trimmedQuery.startsWith(titlePrefix)) {
                let searchTerm = trimmedQuery.substring(titlePrefix.length).trim();
                if ((searchTerm.startsWith("'") && searchTerm.endsWith("'")) ||
                    (searchTerm.startsWith('"') && searchTerm.endsWith('"'))) {
                    searchTerm = searchTerm.substring(1, searchTerm.length - 1);
                }
                q = `name contains '${escapeQueryString(searchTerm)}'`;
            } else {
                const driveIdPattern = new RegExp(`^[a-zA-Z0-9-_]{${MIN_DRIVE_ID_LENGTH},}$`);
                if (driveIdPattern.test(trimmedQuery) && !trimmedQuery.includes(" ")) {
                    q = `'${trimmedQuery}' in parents`;
                    logToFile(`Detected Drive ID: ${trimmedQuery}, listing contents`);
                } else {
                    const looksLikeQuery = /( and | or | not | contains | in |=)/.test(trimmedQuery);
                    if (!looksLikeQuery) {
                        const escapedQuery = escapeQueryString(trimmedQuery);
                        q = `fullText contains '${escapedQuery}'`;
                    }
                }
            }
        }

        if (sharedWithMe) {
            logToFile('Searching for files shared with the user.');
            if (q) {
                q += " and sharedWithMe";
            } else {
                q = "sharedWithMe";
            }
        }
        
        logToFile(`Executing Drive search with query: ${q}`);
        if (corpus) {
            logToFile(`Using corpus: ${corpus}`);
        }
        if (unreadOnly) {
            logToFile('Filtering for unread files only.');
        }

        try {
            const res = await drive.files.list({
                q: q,
                pageSize: pageSize,
                pageToken: pageToken,
                corpus: corpus as 'user' | 'domain' | undefined,
                fields: 'nextPageToken, files(id, name, modifiedTime, viewedByMeTime, mimeType, parents)',
            });

            let files = res.data.files || [];
            const nextPageToken = res.data.nextPageToken;

            if (unreadOnly) {
                files = files.filter(file => !file.viewedByMeTime);
            }

            logToFile(`Found ${files.length} files.`);
            if (nextPageToken) {
                logToFile(`Next page token: ${nextPageToken}`);
            }

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
            logToFile(`Error during drive.search: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public readFile = async ({ fileId }: { fileId: string }) => {
        logToFile(`Reading file with ID: ${fileId}`);
        try {
            const drive = await this.getDriveClient();
            
            // First get metadata to check mimeType
            const metadata = await drive.files.get({
                fileId: fileId,
                fields: 'id, name, mimeType',
            });
            
            const mimeType = metadata.data.mimeType || '';
            logToFile(`File mimeType: ${mimeType}`);

            // Handle Google Workspace files
            if (mimeType === 'application/vnd.google-apps.document') {
                return {
                    content: [{
                        type: "text" as const,
                        text: `This is a Google Doc. Please use the 'docs.getText' tool with documentId: ${fileId}`
                    }]
                };
            }
            if (mimeType === 'application/vnd.google-apps.spreadsheet') {
                return {
                    content: [{
                        type: "text" as const,
                        text: `This is a Google Sheet. Please use the 'sheets.getText' tool with spreadsheetId: ${fileId}`
                    }]
                };
            }
            if (mimeType === 'application/vnd.google-apps.presentation') {
                return {
                    content: [{
                        type: "text" as const,
                        text: `This is a Google Slide. Please use the 'slides.getText' tool with presentationId: ${fileId}`
                    }]
                };
            }

            // Download file content
            const response = await drive.files.get({
                fileId: fileId,
                alt: 'media',
            }, { responseType: 'arraybuffer' });

            const buffer = Buffer.from(response.data as unknown as ArrayBuffer);

            // Determine if text or binary
            // Simple heuristic: if mimeType starts with text/ or is json/xml
            const isText = mimeType.startsWith('text/') || 
                           mimeType === 'application/json' || 
                           mimeType.includes('xml') ||
                           mimeType === 'application/javascript' ||
                           mimeType === 'application/x-sh';

            if (isText) {
                return {
                    content: [{
                        type: "text" as const,
                        text: buffer.toString('utf-8')
                    }]
                };
            } else if (mimeType.startsWith('image/')) {
                return {
                    content: [{
                        type: "image" as const,
                        data: buffer.toString('base64'),
                        mimeType: mimeType
                    }]
                };
            } else {
                return {
                    content: [{
                        type: "resource" as const,
                        resource: {
                            uri: `https://drive.google.com/file/d/${fileId}`,
                            mimeType: mimeType,
                            blob: buffer.toString('base64')
                        }
                    }]
                };
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during drive.readFile: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }
}