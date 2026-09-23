/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { google } from 'googleapis';
import { AuthManager } from '../../auth/AuthManager';
import { SCOPES } from '../../auth/scopes';
import { DocsService } from '../../services/DocsService';

const describeIntegration =
  process.env['GOOGLE_DOCS_INTEGRATION'] === '1' ? describe : describe.skip;

describeIntegration('DocsService live integration', () => {
  const authManager = new AuthManager(SCOPES);
  const docsService = new DocsService(authManager);
  let documentId: string;
  let primaryTabId: string;

  beforeAll(async () => {
    const auth = await authManager.getAuthenticatedClient();
    const docs = google.docs({ version: 'v1', auth });
    const created = await docs.documents.create({
      requestBody: {
        title: `Safe Docs MCP integration ${new Date().toISOString()}`,
      },
    });
    documentId = created.data.documentId!;

    const initial = await docs.documents.get({
      documentId,
      includeTabsContent: true,
      fields: 'tabs(tabProperties)',
    });
    primaryTabId = initial.data.tabs?.[0]?.tabProperties?.tabId || '';
    if (!primaryTabId) {
      throw new Error('Fixture document did not expose its primary tab ID.');
    }

    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { tabId: primaryTabId, index: 1 },
              text: 'Fixture\nConcepts\nOld body\nGrowth scenarios\nOutside sentinel\n',
            },
          },
          {
            updateParagraphStyle: {
              range: { tabId: primaryTabId, startIndex: 9, endIndex: 18 },
              paragraphStyle: { namedStyleType: 'HEADING_2' },
              fields: 'namedStyleType',
            },
          },
          {
            updateParagraphStyle: {
              range: { tabId: primaryTabId, startIndex: 27, endIndex: 44 },
              paragraphStyle: { namedStyleType: 'HEADING_2' },
              fields: 'namedStyleType',
            },
          },
          {
            insertRichLink: {
              location: { tabId: primaryTabId, index: 1 },
              richLinkProperties: {
                uri: `https://docs.google.com/document/d/${documentId}/edit`,
              },
            },
          },
          {
            insertTable: {
              rows: 1,
              columns: 1,
              endOfSegmentLocation: { tabId: primaryTabId },
            },
          },
          {
            addDocumentTab: {
              tabProperties: { title: 'Secondary fixture tab' },
            },
          },
        ],
      },
    });

    const withTabs = await docs.documents.get({
      documentId,
      includeTabsContent: true,
      fields: 'tabs(tabProperties)',
    });
    const secondaryTabId = withTabs.data.tabs?.find(
      (tab) => tab.tabProperties?.title === 'Secondary fixture tab',
    )?.tabProperties?.tabId;
    if (!secondaryTabId) {
      throw new Error('Fixture document did not create its secondary tab.');
    }
    await docs.documents.batchUpdate({
      documentId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { tabId: secondaryTabId, index: 1 },
              text: 'Secondary sentinel\n',
            },
          },
        ],
      },
    });
  }, 120_000);

  afterAll(async () => {
    if (!documentId) {
      return;
    }
    const auth = await authManager.getAuthenticatedClient();
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.update({
      fileId: documentId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });
  }, 120_000);

  it('replaces only the selected section in a rich multi-tab document', async () => {
    const preview = await docsService.previewReplaceSection({
      documentId,
      tabId: primaryTabId,
      startHeading: 'Concepts',
      endHeading: 'Growth scenarios',
    });
    const previewBody = JSON.parse(preview.content[0].text);
    expect(previewBody.error).toBeUndefined();

    const replacement = await docsService.replaceSection({
      documentId,
      tabId: primaryTabId,
      startHeading: 'Concepts',
      endHeading: 'Growth scenarios',
      expectedRevisionId: previewBody.revisionId,
      expectedText: previewBody.currentText,
      blocks: [{ text: 'Concepts', style: 'heading2' }, { text: 'New body' }],
    });
    expect(JSON.parse(replacement.content[0].text).replaced).toBe(true);

    const auth = await authManager.getAuthenticatedClient();
    const docs = google.docs({ version: 'v1', auth });
    const current = await docs.documents.get({
      documentId,
      includeTabsContent: true,
      fields: 'tabs(tabProperties,documentTab(body))',
    });
    const primary = current.data.tabs?.find(
      (tab) => tab.tabProperties?.tabId === primaryTabId,
    );
    const primaryText = (
      await docsService.getText({ documentId, tabId: primaryTabId })
    ).content[0].text;

    expect(primaryText).toContain('Concepts\nNew body\n');
    expect(primaryText).toContain('Growth scenarios\nOutside sentinel\n');
    expect(
      primary?.documentTab?.body?.content?.some((element) => element.table),
    ).toBe(true);
    expect(current.data.tabs).toHaveLength(2);
  }, 120_000);
});
