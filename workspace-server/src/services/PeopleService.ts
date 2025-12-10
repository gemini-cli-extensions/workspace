/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, people_v1 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export class PeopleService {
    constructor(private authManager: AuthManager) {
    }

    private async getPeopleClient(): Promise<people_v1.People> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.people({ version: 'v1', ...options });
    }

    public getUserProfile = async ({ userId, email, name }: { userId?: string, email?: string, name?: string }) => {
        logToFile(`[PeopleService] Starting getUserProfile with: userId=${userId}, email=${email}, name=${name}`);
        try {
            if (!userId && !email && !name) {
                throw new Error('Either userId, email, or name must be provided.');
            }
            const people = await this.getPeopleClient();
            if (userId) {
                const resourceName = userId.startsWith('people/') ? userId : `people/${userId}`;
                const res = await people.people.get({
                    resourceName,
                    personFields: 'names,emailAddresses',
                });
                logToFile(`[PeopleService] Finished getUserProfile for user: ${userId}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ results: [{ person: res.data }] })
                    }]
                };
            } else if (email || name) {
                const query = email || name;
                const res = await people.people.searchDirectoryPeople({
                    query,
                    readMask: 'names,emailAddresses',
                    sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT', 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'],
                });
                logToFile(`[PeopleService] Finished getUserProfile search for: ${query}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify(res.data)
                    }]
                };
            } else {
                throw new Error('Either userId, email, or name must be provided.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[PeopleService] Error during people.getUserProfile: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    public getMe = async () => {
        logToFile(`[PeopleService] Starting getMe`);
        try {
            const people = await this.getPeopleClient();
            const res = await people.people.get({
                resourceName: 'people/me',
                personFields: 'names,emailAddresses',
            });
            logToFile(`[PeopleService] Finished getMe`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(res.data)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[PeopleService] Error during people.getMe: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }

    /**
     * Gets the authenticated user's relations (e.g., manager, spouse, assistant).
     * Optionally filters by a specific relation type.
     */
    public getUserRelations = async ({ relationType }: { relationType?: string }) => {
        logToFile(`[PeopleService] Starting getUserRelations with relationType=${relationType}`);
        try {
            const people = await this.getPeopleClient();
            const res = await people.people.get({
                resourceName: 'people/me',
                personFields: 'relations',
            });
            logToFile(`[PeopleService] Finished getUserRelations API call`);

            const relations = res.data.relations || [];

            // If a specific relation type is requested, filter the results
            if (relationType) {
                const filteredRelations = relations.filter(
                    (relation) => relation.type?.toLowerCase() === relationType.toLowerCase()
                );
                logToFile(`[PeopleService] Filtered to ${filteredRelations.length} relations of type: ${relationType}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            relationType,
                            relations: filteredRelations
                        })
                    }]
                };
            }

            // Return all relations if no specific type is requested
            logToFile(`[PeopleService] Returning all ${relations.length} relations`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        relations
                    })
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`[PeopleService] Error during people.getUserRelations: ${errorMessage}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ error: errorMessage })
                }]
            };
        }
    }
}