/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PeopleService } from '../../services/PeopleService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('PeopleService', () => {
    let peopleService: PeopleService;
    let mockAuthManager: jest.Mocked<AuthManager>;
    let mockPeopleAPI: any;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Create mock AuthManager
        mockAuthManager = {
            getAuthenticatedClient: jest.fn(),
        } as any;

        // Create mock People API
        mockPeopleAPI = {
            people: {
                get: jest.fn(),
                searchDirectoryPeople: jest.fn(),
            },
        };

        // Mock the google constructors
        (google.people as jest.Mock) = jest.fn().mockReturnValue(mockPeopleAPI);

        // Create PeopleService instance
        peopleService = new PeopleService(mockAuthManager);

        const mockAuthClient = { access_token: 'test-token' };
        mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getUserProfile', () => {
        it('should return a user profile by userId', async () => {
            const mockUser = {
                data: {
                    resourceName: 'people/110001608645105799644',
                    names: [{
                        displayName: 'Test User',
                    }],
                    emailAddresses: [{
                        value: 'test@example.com',
                    }],
                },
            };
            mockPeopleAPI.people.get.mockResolvedValue(mockUser);

            const result = await peopleService.getUserProfile({ userId: '110001608645105799644' });

            expect(mockPeopleAPI.people.get).toHaveBeenCalledWith({
                resourceName: 'people/110001608645105799644',
                personFields: 'names,emailAddresses,relations',
            });
            expect(JSON.parse(result.content[0].text)).toEqual({ results: [{ person: mockUser.data }] });
        });

        it('should return a user profile by email', async () => {
            const mockUser = {
                data: {
                    results: [
                        {
                            person: {
                                resourceName: 'people/110001608645105799644',
                                names: [{
                                    displayName: 'Test User',
                                }],
                                emailAddresses: [{
                                    value: 'test@example.com',
                                }],
                            }
                        }
                    ]
                },
            };
            mockPeopleAPI.people.searchDirectoryPeople.mockResolvedValue(mockUser);

            const result = await peopleService.getUserProfile({ email: 'test@example.com' });

            expect(mockPeopleAPI.people.searchDirectoryPeople).toHaveBeenCalledWith({
                query: 'test@example.com',
                readMask: 'names,emailAddresses',
                sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT', 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
            });
            expect(JSON.parse(result.content[0].text)).toEqual(mockUser.data);
        });

        it('should handle errors during getUserProfile', async () => {
            const apiError = new Error('API Error');
            mockPeopleAPI.people.get.mockRejectedValue(apiError);

            const result = await peopleService.getUserProfile({ userId: '110001608645105799644' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });
    });

    describe('getMe', () => {
        it('should return the authenticated user\'s profile', async () => {
            const mockMe = {
                data: {
                    resourceName: 'people/me',
                    names: [{
                        displayName: 'Me',
                    }],
                    emailAddresses: [{
                        value: 'me@example.com',
                    }],
                },
            };
            mockPeopleAPI.people.get.mockResolvedValue(mockMe);

            const result = await peopleService.getMe();

            expect(mockPeopleAPI.people.get).toHaveBeenCalledWith({
                resourceName: 'people/me',
                personFields: 'names,emailAddresses',
            });
            expect(JSON.parse(result.content[0].text)).toEqual(mockMe.data);
        });

        it('should handle errors during getMe', async () => {
            const apiError = new Error('API Error');
            mockPeopleAPI.people.get.mockRejectedValue(apiError);

            const result = await peopleService.getMe();

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });
    });

    describe('getUserManager', () => {
        it('should return the manager of a user', async () => {
            const mockManager = {
                data: {
                    relations: [{
                        type: 'manager',
                        person: 'people/110001608645105799645',
                    }],
                },
            };
            mockPeopleAPI.people.get.mockResolvedValue(mockManager);

            const result = await peopleService.getUserManager({ userId: '110001608645105799644' });

            expect(mockPeopleAPI.people.get).toHaveBeenCalledWith({
                resourceName: 'people/110001608645105799644',
                personFields: 'relations',
            });
            expect(JSON.parse(result.content[0].text)).toEqual({ manager: 'people/110001608645105799645' });
        });

        it('should handle errors during getUserManager', async () => {
            const apiError = new Error('API Error');
            mockPeopleAPI.people.get.mockRejectedValue(apiError);

            const result = await peopleService.getUserManager({ userId: '110001608645105799644' });

            expect(JSON.parse(result.content[0].text)).toEqual({ error: 'API Error' });
        });
    });
});
