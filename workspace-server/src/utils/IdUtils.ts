/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { logToFile } from './logger';

const DOC_ID_REGEX = /\/d\/([a-zA-Z0-9-_]+)/;

/**
 * Extracts a Google Doc/Sheet/etc. ID from a Google Workspace URL.
 *
 * @param url The URL to parse.
 * @returns The extracted document ID, or undefined if no ID could be found.
 */
export function extractDocId(url: string): string | undefined {
  logToFile(`[IdUtils] Attempting to extract doc ID from URL: ${url}`);
  if (!url || typeof url !== 'string') {
    logToFile(`[IdUtils] Invalid input: URL is null or not a string.`);
    return undefined;
  }
  const match = url.match(DOC_ID_REGEX);
  if (match && match[1]) {
    const docId = match[1];
    logToFile(`[IdUtils] Successfully extracted doc ID: ${docId}`);
    return docId;
  }
  logToFile(`[IdUtils] Could not extract doc ID from URL.`);
  return undefined;
}
