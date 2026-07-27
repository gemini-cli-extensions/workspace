/**
 * @fileoverview Shared utilities for Google Workspace API tools.
 *
 * Provides `extractGoogleId` — a safety valve that converts full Google
 * Docs / Drive / Sheets URLs into their bare file/folder IDs. Agents
 * frequently hallucinate full URLs instead of IDs; this regex guard
 * prevents 404s at the API layer.
 */

/**
 * Optimized extractor for Google Workspace IDs.
 * Pre-compiled regex for speed; includes Apps Script and Folder support.
 */
const GOOGLE_ID_REGEX = /\/(?:d|folders|projects)\/([a-zA-Z0-9_-]{25,})(?:\/|\?|$)/;

/**
 * Safely extracts a Google Drive/Docs file or folder ID from a full URL.
 * If the input is already a bare ID, it is returned trimmed.
 *
 * Safely extracts a Google Drive, Docs, Sheets, Slides, or Apps Script ID.
 * Targets the specific /d/ or /folders/ or id= markers and grabs the subsequent
 * valid ID string while ignoring trailing path segments or query params.
 *
 * Supported URL patterns:
 * - `https://docs.google.com/document/d/{ID}/...`
 * - `https://docs.google.com/spreadsheets/d/{ID}/...`
 * - `https://docs.google.com/presentation/d/{ID}/...`
 * - `https://drive.google.com/file/d/{ID}/...`
 * - `https://drive.google.com/open?id={ID}`
 * - `https://drive.google.com/folders/{ID}`
 * - `https://drive.google.com/drive/folders/{ID}`
 */
export function extractGoogleId(input: string): string {
  if (!input) return "";

  const trimmed = input.trim();

  // 1. Performance Guard: If it looks like a bare ID, return immediately
  // Valid IDs are typically 25-60 chars and don't contain slashes
  if (/^[a-zA-Z0-9_-]{25,60}$/.test(trimmed)) {
    return trimmed;
  }

  // 2. Handle 'id=' query parameter links
  if (trimmed.includes("id=")) {
    const parts = trimmed.split(/[?&]id=/);
    if (parts.length > 1) {
      const id = parts[1].split("&")[0];
      if (id.length >= 25) return id;
    }
  }

  // 3. Path-based extraction (/d/, /folders/, /projects/)
  const match = trimmed.match(GOOGLE_ID_REGEX);
  return match ? match[1] : trimmed;
}
