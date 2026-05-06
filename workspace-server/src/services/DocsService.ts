/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, docs_v1 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { extractDocId } from '../utils/IdUtils';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { extractDocumentId as validateAndExtractDocId } from '../utils/validation';

// Field mask for documents.get when reading tab content. Selects only the
// structural fields we use; broader masks like 'tabs' alone trigger
// "comment-specific fields" errors when combined with includeTabsContent.
export const TABS_FIELD_MASK =
  'tabs(tabProperties,documentTab(body,headers,footers,footnotes))';

interface BaseDocsSuggestion {
  text: string;
  startIndex?: number;
  endIndex?: number;
}

interface DocsInsertionSuggestion extends BaseDocsSuggestion {
  type: 'insertion';
  suggestionIds: string[];
}

interface DocsDeletionSuggestion extends BaseDocsSuggestion {
  type: 'deletion';
  suggestionIds: string[];
}

interface DocsStyleChangeSuggestion extends BaseDocsSuggestion {
  type: 'styleChange';
  suggestionIds: string[];
  textStyle?: docs_v1.Schema$TextStyle;
}

interface DocsParagraphStyleChangeSuggestion extends BaseDocsSuggestion {
  type: 'paragraphStyleChange';
  suggestionIds: string[];
  namedStyleType?: string;
}

type DocsSuggestion =
  | DocsInsertionSuggestion
  | DocsDeletionSuggestion
  | DocsStyleChangeSuggestion
  | DocsParagraphStyleChangeSuggestion;

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

  constructor(private authManager: AuthManager) {}

  private async getDocsClient(): Promise<docs_v1.Docs> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.docs({ version: 'v1', ...options });
  }

  public getSuggestions = async ({ documentId }: { documentId: string }) => {
    logToFile(
      `[DocsService] Starting getSuggestions for document: ${documentId}`,
    );
    try {
      const id = extractDocId(documentId) || documentId;
      const docs = await this.getDocsClient();
      const res = await docs.documents.get({
        documentId: id,
        suggestionsViewMode: 'SUGGESTIONS_INLINE',
        fields: 'title,body',
      });

      const suggestions: DocsSuggestion[] = this._extractSuggestions(
        res.data.body,
      );

      logToFile(
        `[DocsService] Found ${suggestions.length} suggestions for document: ${id}`,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { title: res.data.title, suggestions },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(
        `[DocsService] Error during docs.getSuggestions: ${errorMessage}`,
      );
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
  };

  private _extractSuggestions(
    body: docs_v1.Schema$Body | undefined | null,
  ): DocsSuggestion[] {
    const suggestions: DocsSuggestion[] = [];
    if (!body?.content) {
      return suggestions;
    }

    const processElements = (
      elements: docs_v1.Schema$StructuralElement[] | undefined,
    ) => {
      elements?.forEach((element) => {
        if (element.paragraph) {
          // Handle paragraph-level style suggestions
          if (element.paragraph.suggestedParagraphStyleChanges) {
            for (const [suggestionId, suggestion] of Object.entries(
              element.paragraph.suggestedParagraphStyleChanges,
            )) {
              suggestions.push({
                type: 'paragraphStyleChange',
                text: this._getParagraphText(element.paragraph),
                suggestionIds: [suggestionId],
                namedStyleType:
                  suggestion?.paragraphStyle?.namedStyleType ?? undefined,
                startIndex: element.startIndex ?? undefined,
                endIndex: element.endIndex ?? undefined,
              });
            }
          }

          // Handle text-run-level suggestions within the paragraph
          element.paragraph.elements?.forEach((pElement) => {
            if (pElement.textRun) {
              const baseSuggestion = {
                text: pElement.textRun.content || '',
                startIndex: pElement.startIndex ?? undefined,
                endIndex: pElement.endIndex ?? undefined,
              };

              if (pElement.textRun.suggestedInsertionIds) {
                suggestions.push({
                  ...baseSuggestion,
                  type: 'insertion' as const,
                  suggestionIds: pElement.textRun.suggestedInsertionIds,
                });
              }
              if (pElement.textRun.suggestedDeletionIds) {
                suggestions.push({
                  ...baseSuggestion,
                  type: 'deletion' as const,
                  suggestionIds: pElement.textRun.suggestedDeletionIds,
                });
              }
              if (pElement.textRun.suggestedTextStyleChanges) {
                suggestions.push({
                  ...baseSuggestion,
                  type: 'styleChange' as const,
                  suggestionIds: Object.keys(
                    pElement.textRun.suggestedTextStyleChanges,
                  ),
                  textStyle: pElement.textRun.textStyle,
                });
              }
            }
          });
        } else if (element.table) {
          element.table.tableRows?.forEach((row) => {
            row.tableCells?.forEach((cell) => {
              processElements(cell.content);
            });
          });
        }
      });
    };

    processElements(body.content);
    return suggestions;
  }

  private _getParagraphText(
    paragraph: docs_v1.Schema$Paragraph | undefined | null,
  ): string {
    if (!paragraph?.elements) {
      return '';
    }
    return paragraph.elements
      .map((pElement) => pElement.textRun?.content || '')
      .join('');
  }

  public create = async ({
    title,
    content,
  }: {
    title: string;
    content?: string;
  }) => {
    logToFile(
      `[DocsService] Starting create with title: ${title}, content: ${content ? 'true' : 'false'}`,
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
            fields: TABS_FIELD_MASK,
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
        fields: `title,${TABS_FIELD_MASK}`,
        includeTabsContent: true,
        suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS',
      });

      const docTitle = res.data.title;
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
        if (docTitle) {
          text += `Document Title: ${docTitle}\n\n`;
        }
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
        if (docTitle) {
          text += `Document Title: ${docTitle}\n\n`;
        }
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
            text: JSON.stringify({ title: docTitle, tabs: tabsData }, null, 2),
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
        } else if (pElement.person?.personProperties) {
          text += this._renderPersonChip(pElement.person.personProperties);
        } else if (pElement.richLink?.richLinkProperties) {
          text += this._renderRichLinkChip(
            pElement.richLink.richLinkProperties,
          );
        } else if (pElement.dateElement?.dateElementProperties) {
          text += this._renderDateChip(
            pElement.dateElement.dateElementProperties,
          );
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

  private _renderPersonChip(props: docs_v1.Schema$PersonProperties): string {
    const { name, email } = props;
    if (email) {
      return `[${name || email}](mailto:${email})`;
    }
    return name || '';
  }

  private _renderRichLinkChip(
    props: docs_v1.Schema$RichLinkProperties,
  ): string {
    const { title, uri } = props;
    if (uri) {
      return `[${title || uri}](${uri})`;
    }
    return title || '';
  }

  private _renderDateChip(props: docs_v1.Schema$DateElementProperties): string {
    const { displayText, timestamp } = props;
    return displayText || timestamp || '';
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
        fields: TABS_FIELD_MASK,
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
}
