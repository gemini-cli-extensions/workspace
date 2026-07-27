/**
 * @fileoverview Google Workspace ID extraction.
 *
 * Agents frequently pass full Google URLs instead of bare IDs. `extractGoogleId`
 * converts any Docs/Sheets/Slides/Drive/Apps-Script URL into its bare
 * file/folder/project ID, preventing 404s at the API layer. Bare IDs pass
 * through unchanged.
 */

const GOOGLE_ID_REGEX = /\/(?:d|folders|projects)\/([a-zA-Z0-9_-]{25,})(?:\/|\?|$)/;

/**
 * Extract a Google Drive/Docs/Sheets/Slides/Apps-Script ID from a URL or
 * return a bare ID untouched.
 *
 * Supported: `/document/d/{ID}`, `/spreadsheets/d/{ID}`, `/presentation/d/{ID}`,
 * `/file/d/{ID}`, `open?id={ID}`, `/folders/{ID}`, `/drive/folders/{ID}`,
 * `/projects/{ID}`.
 */
export function extractGoogleId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // Bare ID fast-path.
  if (/^[a-zA-Z0-9_-]{25,80}$/.test(trimmed)) {
    return trimmed;
  }

  // `id=` query parameter form.
  if (trimmed.includes("id=")) {
    const parts = trimmed.split(/[?&]id=/);
    if (parts.length > 1) {
      const id = parts[1].split("&")[0];
      if (id.length >= 25) return id;
    }
  }

  // Path-based forms.
  const match = trimmed.match(GOOGLE_ID_REGEX);
  return match ? match[1] : trimmed;
}
