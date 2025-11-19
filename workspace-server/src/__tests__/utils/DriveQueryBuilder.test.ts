/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from '@jest/globals';
import { buildDriveSearchQuery, MIME_TYPES } from '../../utils/DriveQueryBuilder';

describe('DriveQueryBuilder', () => {
    describe('buildDriveSearchQuery', () => {
        it('should build fullText query for regular search', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.DOCUMENT, 'test query');
            expect(query).toBe("mimeType='application/vnd.google-apps.document' and fullText contains 'test query'");
        });

        it('should build name query for title-prefixed search', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.PRESENTATION, 'title:My Presentation');
            expect(query).toBe("mimeType='application/vnd.google-apps.presentation' and name contains 'My Presentation'");
        });

        it('should handle quoted title searches', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.SPREADSHEET, 'title:"Budget 2024"');
            expect(query).toBe("mimeType='application/vnd.google-apps.spreadsheet' and name contains 'Budget 2024'");
        });

        it('should handle single-quoted title searches', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.DOCUMENT, "title:'Q4 Report'");
            expect(query).toBe("mimeType='application/vnd.google-apps.document' and name contains 'Q4 Report'");
        });

        it('should escape special characters in query', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.DOCUMENT, "test's query\\path");
            expect(query).toBe("mimeType='application/vnd.google-apps.document' and fullText contains 'test\\'s query\\\\path'");
        });

        it('should escape special characters in title search', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.PRESENTATION, "title:John's Presentation\\2024");
            expect(query).toBe("mimeType='application/vnd.google-apps.presentation' and name contains 'John\\'s Presentation\\\\2024'");
        });

        it('should handle empty strings', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.SPREADSHEET, '');
            expect(query).toBe("mimeType='application/vnd.google-apps.spreadsheet' and fullText contains ''");
        });

        it('should handle whitespace-only queries', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.DOCUMENT, '   ');
            expect(query).toBe("mimeType='application/vnd.google-apps.document' and fullText contains '   '");
        });

        it('should handle title prefix with whitespace', () => {
            const query = buildDriveSearchQuery(MIME_TYPES.PRESENTATION, '  title:  "My Doc"  ');
            expect(query).toBe("mimeType='application/vnd.google-apps.presentation' and name contains 'My Doc'");
        });

        it('should work with all MIME types', () => {
            expect(buildDriveSearchQuery(MIME_TYPES.DOCUMENT, 'test'))
                .toContain('application/vnd.google-apps.document');
            expect(buildDriveSearchQuery(MIME_TYPES.PRESENTATION, 'test'))
                .toContain('application/vnd.google-apps.presentation');
            expect(buildDriveSearchQuery(MIME_TYPES.SPREADSHEET, 'test'))
                .toContain('application/vnd.google-apps.spreadsheet');
            expect(buildDriveSearchQuery(MIME_TYPES.FOLDER, 'test'))
                .toContain('application/vnd.google-apps.folder');
        });
    });

    describe('MIME_TYPES constants', () => {
        it('should have correct MIME type values', () => {
            expect(MIME_TYPES.DOCUMENT).toBe('application/vnd.google-apps.document');
            expect(MIME_TYPES.PRESENTATION).toBe('application/vnd.google-apps.presentation');
            expect(MIME_TYPES.SPREADSHEET).toBe('application/vnd.google-apps.spreadsheet');
            expect(MIME_TYPES.FOLDER).toBe('application/vnd.google-apps.folder');
        });
    });
});
