/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { KeepService } from '../../services/KeepService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('KeepService', () => {
    let keepService: KeepService;
    let mockAuthManager: jest.Mocked<AuthManager>;
    let mockKeepAPI: any;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Create mock AuthManager
        mockAuthManager = {
            getAuthenticatedClient: jest.fn(),
        } as any;

        // Create mock Keep API
        mockKeepAPI = {
            notes: {
                list: jest.fn(),
                get: jest.fn(),
            },
        };

        // Mock the google constructor
        (google.keep as jest.Mock) = jest.fn().mockReturnValue(mockKeepAPI);

        // Create KeepService instance
        keepService = new KeepService(mockAuthManager);

        const mockAuthClient = { access_token: 'test-token' };
        mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('listNotes', () => {
        it('should list notes with provided parameters', async () => {
            const mockNotesResponse = {
                data: {
                    notes: [
                        { name: 'notes/1', title: 'Note 1' },
                        { name: 'notes/2', title: 'Note 2' }
                    ],
                    nextPageToken: 'next-token'
                }
            };

            mockKeepAPI.notes.list.mockResolvedValue(mockNotesResponse);

            const result = await keepService.listNotes({
                filter: 'trashed=false',
                pageSize: 10,
                pageToken: 'prev-token'
            });

            expect(mockKeepAPI.notes.list).toHaveBeenCalledWith({
                filter: 'trashed=false',
                pageSize: 10,
                pageToken: 'prev-token'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.notes).toHaveLength(2);
            expect(response.notes[0].name).toBe('notes/1');
            expect(response.nextPageToken).toBe('next-token');
        });

        it('should handle empty notes list', async () => {
            const mockNotesResponse = {
                data: {}
            };

            mockKeepAPI.notes.list.mockResolvedValue(mockNotesResponse);

            const result = await keepService.listNotes({});
            const response = JSON.parse(result.content[0].text);

            expect(response.notes).toEqual([]);
        });

        it('should handle errors gracefully', async () => {
            mockKeepAPI.notes.list.mockRejectedValue(new Error('API Error'));

            const result = await keepService.listNotes({});
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('API Error');
        });
    });

    describe('getNote', () => {
        it('should get a specific note by name', async () => {
            const mockNote = {
                data: {
                    name: 'notes/123',
                    title: 'Test Note',
                    body: {
                        text: {
                            text: 'Note content'
                        }
                    }
                }
            };

            mockKeepAPI.notes.get.mockResolvedValue(mockNote);

            const result = await keepService.getNote({ name: 'notes/123' });

            expect(mockKeepAPI.notes.get).toHaveBeenCalledWith({
                name: 'notes/123'
            });

            const response = JSON.parse(result.content[0].text);
            expect(response.name).toBe('notes/123');
            expect(response.title).toBe('Test Note');
        });

        it('should handle errors gracefully', async () => {
            mockKeepAPI.notes.get.mockRejectedValue(new Error('Note Not Found'));

            const result = await keepService.getNote({ name: 'notes/invalid' });
            const response = JSON.parse(result.content[0].text);

            expect(response.error).toBe('Note Not Found');
        });
    });
});
