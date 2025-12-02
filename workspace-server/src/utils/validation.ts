/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';

/**
 * Email validation schema
 * Validates email format according to RFC 5322
 */
export const emailSchema = z.string().email('Invalid email format');

/**
 * Validates multiple email addresses (for CC/BCC fields)
 */
export const emailArraySchema = z.union([
    emailSchema,
    z.array(emailSchema)
]);

/**
 * ISO 8601 datetime validation schema
 * Accepts formats like:
 * - 2024-01-15T10:30:00Z
 * - 2024-01-15T10:30:00-05:00
 * - 2024-01-15T10:30:00.000Z
 */
export const iso8601DateTimeSchema = z.string().refine(
    (val) => {
        const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
        if (!iso8601Regex.test(val)) return false;
        
        // Additional check: ensure it's a valid date
        const date = new Date(val);
        return !isNaN(date.getTime());
    },
    {
        message: 'Invalid ISO 8601 datetime format. Expected format: YYYY-MM-DDTHH:mm:ss[.sss][Z|±HH:mm]'
    }
);

/**
 * Google Drive document/file ID validation
 * Google IDs are typically alphanumeric strings with hyphens and underscores
 */
export const googleDocumentIdSchema = z.string().regex(
    /^[a-zA-Z0-9_-]+$/,
    'Invalid document ID format. Document IDs should only contain letters, numbers, hyphens, and underscores'
);

/**
 * Google Drive URL validation
 * Accepts various Google Workspace URLs and extracts the document ID
 */
export const googleWorkspaceUrlSchema = z.string().regex(
    /^https:\/\/(docs|drive|sheets|slides)\.google\.com\/.+\/d\/([a-zA-Z0-9_-]+)/,
    'Invalid Google Workspace URL format'
);

/**
 * Folder name validation
 * Prevents problematic characters in folder names
 */
export const folderNameSchema = z.string()
    .min(1, 'Folder name cannot be empty')
    .max(255, 'Folder name too long (max 255 characters)')
    .refine(
        (val) => !(/[<>:"/\\|?*\x00-\x1F]/.test(val)),
        'Folder name contains invalid characters'
    );

/**
 * Calendar ID validation
 * Can be 'primary' or an email address
 */
export const calendarIdSchema = z.union([
    z.literal('primary'),
    emailSchema
]);

/**
 * Search query sanitization
 * Escapes potentially dangerous characters from search queries
 * Preserves quotes for exact phrase searching
 */
export const searchQuerySchema = z.string()
    .transform((val) => {
        // Escape backslashes first, then escape quotes
        // This preserves the ability to search for exact phrases
        return val
            .replace(/\\/g, '\\\\')  // Escape backslashes
            .replace(/'/g, "\\'")    // Escape single quotes
            .replace(/"/g, '\\"');   // Escape double quotes
    });

/**
 * Page size validation for pagination
 */
export const pageSizeSchema = z.number()
    .int('Page size must be an integer')
    .min(1, 'Page size must be at least 1')
    .max(100, 'Page size cannot exceed 100');


/**
 * Helper function to validate email
 */
export function validateEmail(email: string): { success: boolean; error?: string } {
    try {
        emailSchema.parse(email);
        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: error.issues[0].message };
        }
        return { success: false, error: 'Invalid email format' };
    }
}

/**
 * Helper function to validate ISO 8601 datetime
 */
export function validateDateTime(datetime: string): { success: boolean; error?: string } {
    try {
        iso8601DateTimeSchema.parse(datetime);
        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: error.issues[0].message };
        }
        return { success: false, error: 'Invalid datetime format' };
    }
}

/**
 * Helper function to validate Google document ID
 */
export function validateDocumentId(id: string): { success: boolean; error?: string } {
    try {
        googleDocumentIdSchema.parse(id);
        return { success: true };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return { success: false, error: error.issues[0].message };
        }
        return { success: false, error: 'Invalid document ID' };
    }
}

/**
 * Helper function to extract document ID from URL or return the ID if already valid
 */
export function extractDocumentId(urlOrId: string): string {
    // First check if it's already a valid ID
    if (googleDocumentIdSchema.safeParse(urlOrId).success) {
        return urlOrId;
    }
    
    // Try to extract from URL
    const urlMatch = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
    }
    
    throw new Error('Invalid document ID or URL');
}

/**
 * Validation error class for consistent error handling
 */
export class ValidationError extends Error {
    constructor(
        message: string,
        public field: string,
        public value: unknown
    ) {
        super(message);
        this.name = 'ValidationError';
    }
}