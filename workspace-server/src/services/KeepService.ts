/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, keep_v1 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export class KeepService {
    constructor(private authManager: AuthManager) {
    }

    private async getKeepClient(): Promise<keep_v1.Keep> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.keep({ version: 'v1', ...options });
    }

    /**
     * Lists notes from Google Keep.
     * Note: Google Keep API is primarily for enterprise environments.
     */
    public listNotes = async ({ filter, pageSize, pageToken }: { filter?: string, pageSize?: number, pageToken?: string }) => {
        logToFile(`[KeepService] Listing notes with filter: ${filter}, pageSize: ${pageSize}, pageToken: ${pageToken}`);
        try {
            const keep = await this.getKeepClient();
            const res = await keep.notes.list({
                filter,
                pageSize,
                pageToken,
            });

            const notes = res.data.notes || [];
            logToFile(`[KeepService] Found ${notes.length} notes.`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        notes: notes,
                        nextPageToken: res.data.nextPageToken
                    })
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[KeepService] Error during keep.listNotes: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    /**
     * Gets a specific Google Keep note by name (ID).
     */
    public getNote = async ({ name }: { name: string }) => {
        logToFile(`[KeepService] Getting note: ${name}`);
        try {
            const keep = await this.getKeepClient();
            const res = await keep.notes.get({
                name,
            });

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(res.data)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[KeepService] Error during keep.getNote: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }
}
