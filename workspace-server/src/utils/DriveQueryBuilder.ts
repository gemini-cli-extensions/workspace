/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility for escaping Google Drive API search query strings
 */

/**
 * Escapes special characters in a query string for Drive API
 * @param str The string to escape
 * @returns The escaped string
 */
export function escapeQueryString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
