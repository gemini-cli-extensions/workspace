/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, chat_v1, people_v1, Auth } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export class ChatService {
    constructor(private authManager: AuthManager) {
    }

    private async getChatClient(): Promise<chat_v1.Chat> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.chat({ version: 'v1', ...options });
    }

    private async getPeopleClient(): Promise<people_v1.People> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.people({ version: 'v1', ...options });
    }

    private async _setupDmSpace(email: string): Promise<chat_v1.Schema$Space> {
        const person = {
            name: `users/${email}`,
            type: 'HUMAN',
        };

        const chat = await this.getChatClient();
        const setupResponse = await chat.spaces.setup({
            requestBody: {
                space: {
                    spaceType: 'DIRECT_MESSAGE',
                },
                memberships: [
                    {
                        member: person,
                    },
                ],
            },
        });

        const space = setupResponse.data;
        if (!space) {
            throw new Error('Could not find or create a DM space.');
        }
        return space;
    }

    public listSpaces = async () => {
        logToFile('Listing chat spaces');
        try {
            const chat = await this.getChatClient();
            const res = await chat.spaces.list({});
            const spaces = res.data.spaces || [];
            logToFile(`Successfully listed ${spaces.length} chat spaces.`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(spaces)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.listSpaces: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while listing chat spaces.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public sendMessage = async ({ spaceName, message }: { spaceName: string, message: string }) => {
        logToFile(`Sending message to space: ${spaceName}`);
        try {
            const chat = await this.getChatClient();
            const response = await chat.spaces.messages.create({
                parent: spaceName,
                requestBody: {
                    text: message,
                },
            });
            logToFile(`Successfully sent message to space: ${spaceName}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(response.data)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.sendMessage: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while sending the message.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public findSpaceByName = async ({ displayName }: { displayName: string }) => {
        logToFile(`Finding space with display name: ${displayName}`);
        try {
            const chat = await this.getChatClient();
            // The Chat API's spaces.list method does not support filtering by
            // displayName on the server. We must fetch all spaces and filter locally.
            let pageToken: string | undefined = undefined;
            let allSpaces: chat_v1.Schema$Space[] = [];

            do {
                const res: any = await chat.spaces.list({ pageToken });
                const spaces = res.data.spaces || [];
                allSpaces = allSpaces.concat(spaces);
                pageToken = res.data.nextPageToken || undefined;
            } while (pageToken);

            const foundSpaces = allSpaces.filter(space => space.displayName === displayName);

            if (foundSpaces.length > 0) {
                logToFile(`Found ${foundSpaces.length} space(s) with display name: ${displayName}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify(foundSpaces)
                    }]
                };
            } else {
                logToFile(`No space found with display name: ${displayName}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            error: `No space found with display name: ${displayName}`
                        })
                    }]
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.findSpaceByName: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while finding the space.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public getMessages = async ({ spaceName, unreadOnly, pageSize, pageToken }: { spaceName: string, unreadOnly?: boolean, pageSize?: number, pageToken?: string }) => {
        logToFile(`Listing messages for space: ${spaceName}`);
        try {
            const chat = await this.getChatClient();
            if (unreadOnly) {
                const people = await this.getPeopleClient();
                const person = await people.people.get({
                    resourceName: 'people/me',
                    personFields: 'metadata',
                });

                const userId = person.data.metadata?.sources?.find(s => s.type === 'PROFILE')?.id;

                if (!userId) {
                    throw new Error('Could not determine user ID.');
                }
                const userMemberName = `users/${userId}`;

                const membersRes = await chat.spaces.members.list({
                    parent: spaceName,
                });
                // Type assertion needed due to incomplete type definitions
                const memberships = (membersRes.data as any).memberships || [];
                const currentUserMember = memberships.find((m: any) => m.member?.name === userMemberName);

                const lastReadTime = currentUserMember?.lastReadTime;

                if (!lastReadTime) {
                    logToFile(`No last read time found for user in space: ${spaceName}`);
                    // This can happen if the user has never read messages in the space.
                    // In this case, all messages are unread.
                    const res = await chat.spaces.messages.list({ parent: spaceName, pageSize, pageToken });
                    const messages = res.data.messages || [];
                    logToFile(`Successfully listed ${messages.length} unread messages for space: ${spaceName}`);
                    return { content: [{ type: "text" as const, text: JSON.stringify({ messages, nextPageToken: res.data.nextPageToken }) }] };
                }

                const res = await chat.spaces.messages.list({
                    parent: spaceName,
                    filter: `createTime > "${lastReadTime}"`,
                    pageSize,
                    pageToken,
                });

                const messages = res.data.messages || [];
                logToFile(`Successfully listed ${messages.length} unread messages for space: ${spaceName}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ messages, nextPageToken: res.data.nextPageToken })
                    }]
                };

            } else {
                const res = await chat.spaces.messages.list({
                    parent: spaceName,
                    pageSize,
                    pageToken,
                });
                const messages = res.data.messages || [];
                logToFile(`Successfully listed ${messages.length} messages for space: ${spaceName}`);
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({ messages, nextPageToken: res.data.nextPageToken })
                    }]
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.getMessages: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while listing messages.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public sendDm = async ({ email, message }: { email: string, message: string }) => {
        logToFile(`chat.sendDm called with: email=${email}, message=${message}`);
        try {
            const space = await this._setupDmSpace(email);
            const spaceName = space.name;

            if (!spaceName) {
                throw new Error('Could not determine the space name for the DM.');
            }

            const chat = await this.getChatClient();
            // Send the message to the DM space.
            const messageResponse = await chat.spaces.messages.create({
                parent: spaceName,
                requestBody: {
                    text: message,
                },
            });

            logToFile(`Successfully sent DM to: ${email}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(messageResponse.data)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.sendDm: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while sending the DM.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public findDmByEmail = async ({ email }: { email: string }) => {
        logToFile(`Finding DM space with user: ${email}`);
        try {
            const space = await this._setupDmSpace(email);
            logToFile(`Found or created DM space: ${space.name}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(space)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.findDmByEmail: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while finding the DM space.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public listThreads = async ({ spaceName, pageSize, pageToken }: { spaceName: string, pageSize?: number, pageToken?: string }) => {
        logToFile(`Listing threads for space: ${spaceName}`);
        try {
            const chat = await this.getChatClient();
            const res = await chat.spaces.messages.list({
                parent: spaceName,
                pageSize,
                pageToken,
                orderBy: 'createTime desc',
            });

            const messages = res.data.messages || [];
            const threads: chat_v1.Schema$Message[] = [];
            const threadIds = new Set<string>();

            for (const message of messages) {
                if (message.thread?.name && !threadIds.has(message.thread.name)) {
                    threads.push(message);
                    threadIds.add(message.thread.name);
                }
            }

            logToFile(`Successfully listed ${threads.length} threads for space: ${spaceName}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({ threads, nextPageToken: res.data.nextPageToken })
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.listThreads: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while listing threads.',
                        details: errorMessage
                    })
                }]
            };
        }
    }

    public setUpSpace = async ({ displayName, userNames }: { displayName: string, userNames: string[] }) => {
        logToFile(`Creating space with display name: ${displayName}`);
        try {
            const memberships = userNames.map(userName => ({
                member: {
                    name: userName,
                    type: 'HUMAN',
                },
            }));

            const chat = await this.getChatClient();
            const response = await chat.spaces.setup({
                requestBody: {
                    space: {
                        spaceType: 'SPACE',
                        displayName,
                    },
                    memberships: memberships,
                },
            });
            logToFile(`Successfully created space: ${response.data.name}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(response.data)
                }]
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logToFile(`Error during chat.createSpace: ${errorMessage}`);
            if (error instanceof Error && error.stack) {
                logToFile(`Stack trace: ${error.stack}`);
            }
            logToFile(`Full error object: ${JSON.stringify(error, null, 2)}`);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        error: 'An error occurred while creating the space.',
                        details: errorMessage
                    })
                }]
            };
        }
    }
}
