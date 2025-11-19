/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Utility for building Google Drive API search queries
 */

/**
 * Builds a Drive API search query for a specific MIME type with optional title filtering
 * @param mimeType The MIME type to search for (e.g., 'application/vnd.google-apps.document')
 * @param query The search query, may include 'title:' prefix for title-only searches
 * @returns The formatted Drive API query string
 */
export function buildDriveSearchQuery(mimeType: string, query: string): string {
    let searchTerm = query;
    const titlePrefix = 'title:';
    let q: string;
    
    if (searchTerm.trim().startsWith(titlePrefix)) {
        // Extract search term after 'title:' prefix
        searchTerm = searchTerm.trim().substring(titlePrefix.length).trim();
        
        // Remove surrounding quotes if present
        if ((searchTerm.startsWith("'") && searchTerm.endsWith("'")) || 
            (searchTerm.startsWith('"') && searchTerm.endsWith('"'))) {
            searchTerm = searchTerm.substring(1, searchTerm.length - 1);
        }
        
        // Search by name (title) only
        q = `mimeType='${mimeType}' and name contains '${escapeQueryString(searchTerm)}'`;
    } else {
        // Search full text content
        q = `mimeType='${mimeType}' and fullText contains '${escapeQueryString(searchTerm)}'`;
    }
    
    return q;
}

/**
 * Escapes special characters in a query string for Drive API
 * @param str The string to escape
 * @returns The escaped string
 */
export function escapeQueryString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Export MIME type constants for convenience
export const MIME_TYPES = {
    DOCUMENT: 'application/vnd.google-apps.document',
    PRESENTATION: 'application/vnd.google-apps.presentation',
    SPREADSHEET: 'application/vnd.google-apps.spreadsheet',
    FOLDER: 'application/vnd.google-apps.folder',
} as const;
