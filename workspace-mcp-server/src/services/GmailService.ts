/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, gmail_v1 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { MimeHelper } from '../utils/MimeHelper';
import { GMAIL_SEARCH_MAX_RESULTS } from '../utils/constants';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { emailArraySchema } from '../utils/validation';

// Type definitions for email parameters
type SendEmailParams = {
    to: string | string[];
    subject: string;
    body: string;
    cc?: string | string[];
    bcc?: string | string[];
    isHtml?: boolean;
};

export class GmailService {
    constructor(private authManager: AuthManager) {
    }

    private async getGmailClient(): Promise<gmail_v1.Gmail> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.gmail({ version: 'v1', ...options });
    }

    /**
     * Helper method to handle errors consistently across all methods
     */
    private handleError(error: unknown, context: string) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logToFile(`Error during ${context}: ${errorMessage}`);
        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify({ error: errorMessage })
            }]
        };
    }

    public search = async ({ 
        query, 
        maxResults = GMAIL_SEARCH_MAX_RESULTS, 
        pageToken,
        labelIds,
        includeSpamTrash = false 
    }: { 
        query?: string, 
        maxResults?: number, 
        pageToken?: string,
        labelIds?: string[],
        includeSpamTrash?: boolean 
    }) => {
        try {
            logToFile(`Gmail search - query: ${query}, maxResults: ${maxResults}`);
            
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.list({
                userId: 'me',
                q: query,
                maxResults,
                pageToken,
                labelIds,
                includeSpamTrash
            });

            const messages = response.data.messages || [];
            const nextPageToken = response.data.nextPageToken;
            const resultSizeEstimate = response.data.resultSizeEstimate;

            logToFile(`Found ${messages.length} messages, estimated total: ${resultSizeEstimate}`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        messages: messages.map(msg => ({
                            id: msg.id,
                            threadId: msg.threadId
                        })),
                        nextPageToken,
                        resultSizeEstimate
                    }, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.search');
        }
    }

    public get = async ({ 
        messageId, 
        format = 'full' 
    }: { 
        messageId: string, 
        format?: 'minimal' | 'full' | 'raw' | 'metadata' 
    }) => {
        try {
            logToFile(`Getting message ${messageId} with format: ${format}`);
            
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format
            });

            const message = response.data;
            
            // Extract useful information based on format
            if (format === 'metadata' || format === 'full') {
                const headers = message.payload?.headers || [];
                const getHeader = (name: string) => headers.find(h => h.name === name)?.value;
                
                const subject = getHeader('Subject');
                const from = getHeader('From');
                const to = getHeader('To');
                const date = getHeader('Date');
                
                // Extract body for full format
                let body = '';
                if (format === 'full' && message.payload) {
                    body = this.extractBody(message.payload);
                }

                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            id: message.id,
                            threadId: message.threadId,
                            labelIds: message.labelIds,
                            snippet: message.snippet,
                            subject,
                            from,
                            to,
                            date,
                            body: body || message.snippet
                        }, null, 2)
                    }]
                };
            }

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(message, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.get');
        }
    }

    public modify = async ({
        messageId,
        addLabelIds = [],
        removeLabelIds = []
    }: {
        messageId: string,
        addLabelIds?: string[],
        removeLabelIds?: string[]
    }) => {
        try {
            logToFile(`Modifying message ${messageId} with addLabelIds: ${addLabelIds}, removeLabelIds: ${removeLabelIds}`);

            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    addLabelIds,
                    removeLabelIds,
                },
            });

            const message = response.data;
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(message, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.modify');
        }
    }

    public send = async ({ 
        to, 
        subject, 
        body, 
        cc, 
        bcc,
        isHtml = false 
    }: SendEmailParams) => {
        try {
            // Validate email addresses
            try {
                emailArraySchema.parse(to);
                if (cc) emailArraySchema.parse(cc);
                if (bcc) emailArraySchema.parse(bcc);
            } catch (error) {
                return {
                    content: [{
                        type: "text" as const,
                        text: JSON.stringify({
                            error: 'Invalid email address format',
                            details: error instanceof Error ? error.message : 'Validation failed'
                        })
                    }]
                };
            }
            
            logToFile(`Sending email to: ${to}, subject: ${subject}`);
            
            // Create MIME message
            const mimeMessage = MimeHelper.createMimeMessage({
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                body,
                cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
                bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
                isHtml
            });

            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: mimeMessage
                }
            });

            logToFile(`Email sent successfully: ${response.data.id}`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        id: response.data.id,
                        threadId: response.data.threadId,
                        labelIds: response.data.labelIds,
                        status: 'sent'
                    }, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.send');
        }
    }

    public createDraft = async ({ 
        to, 
        subject, 
        body, 
        cc, 
        bcc,
        isHtml = false 
    }: SendEmailParams) => {
        try {
            logToFile(`Creating draft - to: ${to}, subject: ${subject}`);
            
            // Create MIME message
            const mimeMessage = MimeHelper.createMimeMessage({
                to: Array.isArray(to) ? to.join(', ') : to,
                subject,
                body,
                cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined,
                bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined,
                isHtml
            });

            const gmail = await this.getGmailClient();
            const response = await gmail.users.drafts.create({
                userId: 'me',
                requestBody: {
                    message: {
                        raw: mimeMessage
                    }
                }
            });

            logToFile(`Draft created successfully: ${response.data.id}`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        id: response.data.id,
                        message: {
                            id: response.data.message?.id,
                            threadId: response.data.message?.threadId,
                            labelIds: response.data.message?.labelIds
                        },
                        status: 'draft_created'
                    }, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.createDraft');
        }
    }

    public sendDraft = async ({ draftId }: { draftId: string }) => {
        try {
            logToFile(`Sending draft: ${draftId}`);
            
            const gmail = await this.getGmailClient();
            const response = await gmail.users.drafts.send({
                userId: 'me',
                requestBody: {
                    id: draftId
                }
            });

            logToFile(`Draft sent successfully: ${response.data.id}`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        id: response.data.id,
                        threadId: response.data.threadId,
                        labelIds: response.data.labelIds,
                        status: 'sent'
                    }, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.sendDraft');
        }
    }

    public listLabels = async () => {
        try {
            logToFile(`Listing Gmail labels`);
            
            const gmail = await this.getGmailClient();
            const response = await gmail.users.labels.list({
                userId: 'me'
            });

            const labels = response.data.labels || [];
            
            logToFile(`Found ${labels.length} labels`);

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify({
                        labels: labels.map(label => ({
                            id: label.id,
                            name: label.name,
                            type: label.type,
                            messageListVisibility: label.messageListVisibility,
                            labelListVisibility: label.labelListVisibility
                        }))
                    }, null, 2)
                }]
            };
        } catch (error) {
            return this.handleError(error, 'gmail.listLabels');
        }
    }

    private extractBody(payload: gmail_v1.Schema$MessagePart): string {
        let body = '';
        
        // Check for plain text or HTML in the main part
        if (payload.body?.data) {
            body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
        
        // Check parts for multipart messages
        if (payload.parts) {
            for (const part of payload.parts) {
                if (part.mimeType === 'text/plain' && part.body?.data) {
                    body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                    break; // Prefer plain text
                } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
                    body = Buffer.from(part.body.data, 'base64').toString('utf-8');
                } else if (part.parts) {
                    // Recursive for nested parts
                    const nestedBody = this.extractBody(part);
                    if (nestedBody) {
                        body = nestedBody;
                        break;
                    }
                }
            }
        }
        
        return body;
    }
}
