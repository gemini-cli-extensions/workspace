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
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { buildDriveSearchQuery, MIME_TYPES } from '../utils/DriveQueryBuilder';
import { extractDocumentId as validateAndExtractDocId } from '../utils/validation';

export class DocsService {
  /**
   * Recursively flattens a tab tree into a single array,
   * so that nested (child) tabs are included alongside top-level ones.
   */
  private _flattenTabs(tabs: docs_v1.Schema$Tab[]): docs_v1.Schema$Tab[] {
    return tabs.flatMap((tab) => {
      const children = tab.childTabs ? this._flattenTabs(tab.childTabs) : [];
      return [tab, ...children];
    });
  }

  constructor(
    private authManager: AuthManager,
    private driveService: DriveService,
  ) {}

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

  public create = async ({
    title,
    folderName,
    content,
  }: {
    title: string;
    folderName?: string;
    content?: string;
  }) => {
    logToFile(
      `[DocsService] Starting create with title: ${title}, folderName: ${folderName}, content: ${content ? 'true' : 'false'}`,
    );
    try {
      logToFile('[DocsService] Calling docs.documents.create');
      const docs = await this.getDocsClient();
      const doc = await docs.documents.create({
        requestBody: { title },
      });
      logToFile('[DocsService] docs.documents.create finished');
      const documentId = doc.data.documentId!;
      const docTitle = doc.data.title!;

      // Insert content if provided
      if (content) {
        logToFile('[DocsService] Inserting content into new doc');
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              },
            ],
          },
        });
        logToFile('[DocsService] Content insertion finished');
      }

      if (folderName) {
        logToFile(`[DocsService] Moving doc to folder: ${folderName}`);
        await this._moveFileToFolder(documentId, folderName);
        logToFile(`[DocsService] Finished moving doc to folder: ${folderName}`);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              documentId,
              title: docTitle,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during docs.create: ${errorMessage}`);
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

  public writeText = async ({
    documentId,
    text,
    position = 'end',
    tabId,
  }: {
    documentId: string;
    text: string;
    position?: string;
    tabId?: string;
  }) => {
    logToFile(
      `[DocsService] Starting writeText for document: ${documentId}, position: ${position}, tabId: ${tabId}`,
    );
    try {
      const id = extractDocId(documentId) || documentId;
      const docs = await this.getDocsClient();

      // Optimize: when appending to the main body, omit location to skip
      // an extra documents.get API call — the Docs API auto-appends.
      if (position === 'end' && !tabId) {
        await docs.documents.batchUpdate({
          documentId: id,
          requestBody: {
            requests: [{ insertText: { text } }],
          },
        });
      } else {
        let index: number;

        if (position === 'beginning') {
          index = 1;
        } else if (position === 'end') {
          // Discover the end index by reading the document (required for tabs)
          const res = await docs.documents.get({
            documentId: id,
            fields: 'tabs',
            includeTabsContent: true,
          });

          const tabs = this._flattenTabs(res.data.tabs || []);
          let content: docs_v1.Schema$StructuralElement[] | undefined;

          if (tabId) {
            const tab = tabs.find((t) => t.tabProperties?.tabId === tabId);
            if (!tab) {
              throw new Error(`Tab with ID ${tabId} not found.`);
            }
            content = tab.documentTab?.body?.content;
          } else if (tabs.length > 0) {
            content = tabs[0].documentTab?.body?.content;
          }

          const lastElement = content?.[content.length - 1];
          const endIndex = lastElement?.endIndex || 1;
          index = Math.max(1, endIndex - 1);
        } else {
          // Treat as a numeric index
          index = parseInt(position, 10);
          if (isNaN(index) || index < 1) {
            throw new Error(
              `Invalid position: "${position}". Use "beginning", "end", or a positive integer index.`,
            );
          }
        }

        await docs.documents.batchUpdate({
          documentId: id,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: {
                    index,
                    tabId: tabId,
                  },
                  text,
                },
              },
            ],
          },
        });
      }

      logToFile(`[DocsService] Finished writeText for document: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully wrote text to document ${id} at position ${position}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[DocsService] Error during docs.writeText: ${errorMessage}`);
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

  private static readonly HEADING_STYLES: Record<string, string> = {
    heading1: 'HEADING_1',
    heading2: 'HEADING_2',
    heading3: 'HEADING_3',
    heading4: 'HEADING_4',
    heading5: 'HEADING_5',
    heading6: 'HEADING_6',
    normalText: 'NORMAL_TEXT',
  };

  private static readonly TEXT_STYLES: Record<string, object> = {
    bold: { bold: true },
    italic: { italic: true },
    underline: { underline: true },
    strikethrough: { strikethrough: true },
  };

  public formatText = async ({
    documentId,
    formats,
    tabId,
  }: {
    documentId: string;
    formats: {
      startIndex: number;
      endIndex: number;
      style: string;
      url?: string;
    }[];
    tabId?: string;
  }) => {
    logToFile(
      `[DocsService] Starting formatText for document: ${documentId}, ${formats.length} format(s)`,
    );
    try {
      const id = extractDocId(documentId) || documentId;
      const requests: docs_v1.Schema$Request[] = [];

      for (const format of formats) {
        const range = {
          startIndex: format.startIndex,
          endIndex: format.endIndex,
          tabId: tabId,
        };

        const headingStyle =
          DocsService.HEADING_STYLES[format.style.toLowerCase()];
        if (headingStyle) {
          requests.push({
            updateParagraphStyle: {
              range,
              paragraphStyle: {
                namedStyleType: headingStyle,
              },
              fields: 'namedStyleType',
            },
          });
          continue;
        }

        const textStyle = DocsService.TEXT_STYLES[format.style.toLowerCase()];
        if (textStyle) {
          requests.push({
            updateTextStyle: {
              range,
              textStyle,
              fields: Object.keys(textStyle).join(','),
            },
          });
          continue;
        }

        if (format.style.toLowerCase() === 'code') {
          requests.push({
            updateTextStyle: {
              range,
              textStyle: {
                weightedFontFamily: {
                  fontFamily: 'Courier New',
                },
              },
              fields: 'weightedFontFamily',
            },
          });
          continue;
        }

        if (format.style.toLowerCase() === 'link' && format.url) {
          requests.push({
            updateTextStyle: {
              range,
              textStyle: {
                link: {
                  url: format.url,
                },
              },
              fields: 'link',
            },
          });
          continue;
        }

        logToFile(`[DocsService] Unknown format style: ${format.style}`);
      }

      if (requests.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No valid formatting requests to apply.',
            },
          ],
        };
      }

      const docs = await this.getDocsClient();
      await docs.documents.batchUpdate({
        documentId: id,
        requestBody: { requests },
      });

      logToFile(
        `[DocsService] Finished formatText for document: ${id}, applied ${requests.length} format(s)`,
      );
      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully applied ${requests.length} formatting change(s) to document ${id}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[DocsService] Error during docs.formatText: ${errorMessage}`);
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

  public find = async ({
    query,
    pageToken,
    pageSize = 10,
  }: {
    query: string;
    pageToken?: string;
    pageSize?: number;
  }) => {
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
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const files = res.data.files || [];
      const nextPageToken = res.data.nextPageToken;

      logToFile(`Found ${files.length} files.`);
      if (nextPageToken) {
        logToFile(`Next page token: ${nextPageToken}`);
      }
      logToFile(`API Response: ${JSON.stringify(res.data, null, 2)}`);

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
      logToFile(`Error during docs.find: ${errorMessage}`);
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

  public move = async ({
    documentId,
    folderName,
  }: {
    documentId: string;
    folderName: string;
  }) => {
    logToFile(`[DocsService] Starting move for document: ${documentId}`);
    try {
      const id = extractDocId(documentId) || documentId;
      await this._moveFileToFolder(id, folderName);
      logToFile(`[DocsService] Finished move for document: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Moved document ${id} to folder ${folderName}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[DocsService] Error during docs.move: ${errorMessage}`);
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

  public getText = async ({
    documentId,
    tabId,
  }: {
    documentId: string;
    tabId?: string;
  }) => {
    logToFile(
      `[DocsService] Starting getText for document: ${documentId}, tabId: ${tabId}`,
    );
    try {
      // Validate and extract document ID
      const id = validateAndExtractDocId(documentId);
      const docs = await this.getDocsClient();
      const res = await docs.documents.get({
        documentId: id,
        fields: 'tabs', // Request tabs only (body is legacy and mutually exclusive with tabs in mask)
        includeTabsContent: true,
      });

      const tabs = this._flattenTabs(res.data.tabs || []);

      // If tabId is provided, try to find it
      if (tabId) {
        const tab = tabs.find((t) => t.tabProperties?.tabId === tabId);
        if (!tab) {
          throw new Error(`Tab with ID ${tabId} not found.`);
        }

        const content = tab.documentTab?.body?.content;
        if (!content) {
          return {
            content: [
              {
                type: 'text' as const,
                text: '',
              },
            ],
          };
        }

        let text = '';
        content.forEach((element) => {
          text += this._readStructuralElement(element);
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: text,
            },
          ],
        };
      }

      // If no tabId provided
      if (tabs.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: '',
            },
          ],
        };
      }

      // If only 1 tab, return plain text (backward compatibility)
      if (tabs.length === 1) {
        const tab = tabs[0];
        let text = '';
        if (tab.documentTab?.body?.content) {
          tab.documentTab.body.content.forEach((element) => {
            text += this._readStructuralElement(element);
          });
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: text,
            },
          ],
        };
      }

      // If multiple tabs, return JSON
      const tabsData = tabs.map((tab, index) => {
        let tabText = '';
        if (tab.documentTab?.body?.content) {
          tab.documentTab.body.content.forEach((element) => {
            tabText += this._readStructuralElement(element);
          });
        }
        return {
          tabId: tab.tabProperties?.tabId,
          title: tab.tabProperties?.title,
          content: tabText,
          index: index,
        };
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(tabsData, null, 2),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[DocsService] Error during docs.getText: ${errorMessage}`);
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

  private _readStructuralElement(
    element: docs_v1.Schema$StructuralElement,
  ): string {
    let text = '';
    if (element.paragraph) {
      element.paragraph.elements?.forEach((pElement) => {
        if (pElement.textRun && pElement.textRun.content) {
          text += pElement.textRun.content;
        }
      });
    } else if (element.table) {
      element.table.tableRows?.forEach((row) => {
        row.tableCells?.forEach((cell) => {
          cell.content?.forEach((cellContent) => {
            text += this._readStructuralElement(cellContent);
          });
        });
      });
    }
    return text;
  }

  public replaceText = async ({
    documentId,
    findText,
    replaceText,
    tabId,
  }: {
    documentId: string;
    findText: string;
    replaceText: string;
    tabId?: string;
  }) => {
    logToFile(
      `[DocsService] Starting replaceText for document: ${documentId}, tabId: ${tabId}`,
    );
    try {
      const id = extractDocId(documentId) || documentId;
      const docs = await this.getDocsClient();

      // Get the document to find where the text will be replaced
      const docBefore = await docs.documents.get({
        documentId: id,
        fields: 'tabs',
        includeTabsContent: true,
      });

      const tabs = this._flattenTabs(docBefore.data.tabs || []);

      const requests: docs_v1.Schema$Request[] = [];

      if (tabId) {
        const tab = tabs.find((t) => t.tabProperties?.tabId === tabId);
        if (!tab) {
          throw new Error(`Tab with ID ${tabId} not found.`);
        }
        const content = tab.documentTab?.body?.content;

        const tabRequests = this._generateReplacementRequests(
          content,
          tabId,
          findText,
          replaceText,
        );
        requests.push(...tabRequests);
      } else {
        for (const tab of tabs) {
          const currentTabId = tab.tabProperties?.tabId;
          const content = tab.documentTab?.body?.content;

          const tabRequests = this._generateReplacementRequests(
            content,
            currentTabId,
            findText,
            replaceText,
          );
          requests.push(...tabRequests);
        }
      }

      if (requests.length > 0) {
        await docs.documents.batchUpdate({
          documentId: id,
          requestBody: {
            requests,
          },
        });
      }

      logToFile(`[DocsService] Finished replaceText for document: ${id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Successfully replaced text in document ${id}`,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`[DocsService] Error during docs.replaceText: ${errorMessage}`);
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

  private _generateReplacementRequests(
    content: docs_v1.Schema$StructuralElement[] | undefined,
    tabId: string | undefined | null,
    findText: string,
    newText: string,
  ): docs_v1.Schema$Request[] {
    const requests: docs_v1.Schema$Request[] = [];
    const documentText = this._getFullDocumentText(content);
    const occurrences: number[] = [];
    let searchIndex = 0;
    while ((searchIndex = documentText.indexOf(findText, searchIndex)) !== -1) {
      occurrences.push(searchIndex + 1);
      searchIndex += findText.length;
    }

    const lengthDiff = newText.length - findText.length;
    let cumulativeOffset = 0;

    for (let i = 0; i < occurrences.length; i++) {
      const occurrence = occurrences[i];
      const adjustedPosition = occurrence + cumulativeOffset;

      // Delete old text
      requests.push({
        deleteContentRange: {
          range: {
            tabId: tabId,
            startIndex: adjustedPosition,
            endIndex: adjustedPosition + findText.length,
          },
        },
      });

      // Insert new text
      requests.push({
        insertText: {
          location: {
            tabId: tabId,
            index: adjustedPosition,
          },
          text: newText,
        },
      });

      cumulativeOffset += lengthDiff;
    }
    return requests;
  }

  private _getFullDocumentText(
    content: docs_v1.Schema$StructuralElement[] | undefined,
  ): string {
    let text = '';
    if (content) {
      content.forEach((element) => {
        text += this._readStructuralElement(element);
      });
    }
    return text;
  }

  private async _moveFileToFolder(
    documentId: string,
    folderName: string,
  ): Promise<void> {
    try {
      const findFolderResponse = await this.driveService.findFolder({
        folderName,
      });
      const parsedResponse = JSON.parse(findFolderResponse.content[0].text);

      if (parsedResponse.error) {
        throw new Error(parsedResponse.error);
      }

      const folders = parsedResponse as { id: string; name: string }[];

      if (folders.length === 0) {
        throw new Error(`Folder not found: ${folderName}`);
      }

      if (folders.length > 1) {
        logToFile(
          `Warning: Found multiple folders with name "${folderName}". Using the first one found.`,
        );
      }

      const folderId = folders[0].id;
      const drive = await this.getDriveClient();
      const file = await drive.files.get({
        fileId: documentId,
        fields: 'parents',
        supportsAllDrives: true,
      });

      const previousParents = file.data.parents?.join(',');

      await drive.files.update({
        fileId: documentId,
        addParents: folderId,
        removeParents: previousParents,
        fields: 'id, parents',
        supportsAllDrives: true,
      });
    } catch (error) {
      if (error instanceof Error) {
        logToFile(`Error during _moveFileToFolder: ${error.message}`);
      } else {
        logToFile(
          `An unknown error occurred during _moveFileToFolder: ${JSON.stringify(error)}`,
        );
      }
      throw error;
    }
  }
}
