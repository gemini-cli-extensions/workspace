/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { google, gmail_v1 } from 'googleapis';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { MimeHelper } from '../utils/MimeHelper';
import { GMAIL_SEARCH_MAX_RESULTS } from '../utils/constants';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import { emailArraySchema } from '../utils/validation';

type SendEmailParams = {
    to: string | string[];
    subject: string;
    body: string;
    cc?: string | string[];
    bcc?: string | string[];
    isHtml?: boolean;
};

interface GmailAttachment {
    filename: string | null | undefined;
    mimeType: string | null | undefined;
    attachmentId: string | null | undefined;
    size: number | null | undefined;
}

type LabelVisibility = 'labelShow' | 'labelShowIfUnread' | 'labelHide';
type MessageListVisibility = 'show' | 'hide';

interface CreateLabelParams {
    name: string;
    labelListVisibility?: LabelVisibility;
    messageListVisibility?: MessageListVisibility;
    backgroundColor?: string;
    textColor?: string;
}

interface UpdateLabelParams {
    labelId: string;
    name?: string;
    labelListVisibility?: LabelVisibility;
    messageListVisibility?: MessageListVisibility;
    backgroundColor?: string;
    textColor?: string;
}

export class GmailService {
    constructor(private authManager: AuthManager) {}

    private async getGmailClient(): Promise<gmail_v1.Gmail> {
        const auth = await this.authManager.getAuthenticatedClient();
        const options = { ...gaxiosOptions, auth };
        return google.gmail({ version: 'v1', ...options });
    }

    private handleError(error: unknown, context: string) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logToFile(`Error during ${context}: ${errorMessage}`);
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }] };
    }

    public search = async ({ query, maxResults = GMAIL_SEARCH_MAX_RESULTS, pageToken, labelIds, includeSpamTrash = false }: { query?: string, maxResults?: number, pageToken?: string, labelIds?: string[], includeSpamTrash?: boolean }) => {
        try {
            logToFile(`Gmail search - query: ${query}, maxResults: ${maxResults}`);
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.list({ userId: 'me', q: query, maxResults, pageToken, labelIds, includeSpamTrash });
            const messages = response.data.messages || [];
            return { content: [{ type: "text" as const, text: JSON.stringify({ messages: messages.map(msg => ({ id: msg.id, threadId: msg.threadId })), nextPageToken: response.data.nextPageToken, resultSizeEstimate: response.data.resultSizeEstimate }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.search'); }
    }

    public get = async ({ messageId, format = 'full' }: { messageId: string, format?: 'minimal' | 'full' | 'raw' | 'metadata' }) => {
        try {
            logToFile(`Getting message ${messageId} with format: ${format}`);
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.get({ userId: 'me', id: messageId, format });
            const message = response.data;
            if (format === 'metadata' || format === 'full') {
                const headers = message.payload?.headers || [];
                const getHeader = (name: string) => headers.find(h => h.name === name)?.value;
                let body = ''; let attachments: GmailAttachment[] = [];
                if (format === 'full' && message.payload) { const result = this.extractAttachmentsAndBody(message.payload); body = result.body; attachments = result.attachments; }
                return { content: [{ type: "text" as const, text: JSON.stringify({ id: message.id, threadId: message.threadId, labelIds: message.labelIds, snippet: message.snippet, subject: getHeader('Subject'), from: getHeader('From'), to: getHeader('To'), date: getHeader('Date'), body: body || message.snippet, attachments }, null, 2) }] };
            }
            return { content: [{ type: "text" as const, text: JSON.stringify(message, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.get'); }
    }

    public downloadAttachment = async ({ messageId, attachmentId, localPath }: { messageId: string, attachmentId: string, localPath: string }) => {
        try {
            logToFile(`Downloading attachment ${attachmentId} from message ${messageId} to ${localPath}`);
            if (!path.isAbsolute(localPath)) throw new Error('localPath must be an absolute path.');
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attachmentId });
            if (!response.data.data) throw new Error('Attachment data is empty');
            await fs.mkdir(path.dirname(localPath), { recursive: true });
            await fs.writeFile(localPath, Buffer.from(response.data.data, 'base64url'));
            return { content: [{ type: "text" as const, text: JSON.stringify({ message: `Attachment downloaded successfully to ${localPath}`, path: localPath }) }] };
        } catch (error) { return this.handleError(error, 'gmail.downloadAttachment'); }
    }

    public modify = async ({ messageId, addLabelIds = [], removeLabelIds = [] }: { messageId: string, addLabelIds?: string[], removeLabelIds?: string[] }) => {
        try {
            logToFile(`Modifying message ${messageId}`);
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.modify({ userId: 'me', id: messageId, requestBody: { addLabelIds, removeLabelIds } });
            return { content: [{ type: "text" as const, text: JSON.stringify(response.data, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.modify'); }
    }

    public send = async ({ to, subject, body, cc, bcc, isHtml = false }: SendEmailParams) => {
        try {
            try { emailArraySchema.parse(to); if (cc) emailArraySchema.parse(cc); if (bcc) emailArraySchema.parse(bcc); }
            catch (error) { return { content: [{ type: "text" as const, text: JSON.stringify({ error: 'Invalid email address format', details: error instanceof Error ? error.message : 'Validation failed' }) }] }; }
            logToFile(`Sending email to: ${to}, subject: ${subject}`);
            const mimeMessage = MimeHelper.createMimeMessage({ to: Array.isArray(to) ? to.join(', ') : to, subject, body, cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined, bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined, isHtml });
            const gmail = await this.getGmailClient();
            const response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw: mimeMessage } });
            return { content: [{ type: "text" as const, text: JSON.stringify({ id: response.data.id, threadId: response.data.threadId, labelIds: response.data.labelIds, status: 'sent' }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.send'); }
    }

    public createDraft = async ({ to, subject, body, cc, bcc, isHtml = false }: SendEmailParams) => {
        try {
            logToFile(`Creating draft to: ${to}, subject: ${subject}`);
            const mimeMessage = MimeHelper.createMimeMessage({ to: Array.isArray(to) ? to.join(', ') : to, subject, body, cc: cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined, bcc: bcc ? (Array.isArray(bcc) ? bcc.join(', ') : bcc) : undefined, isHtml });
            const gmail = await this.getGmailClient();
            const response = await gmail.users.drafts.create({ userId: 'me', requestBody: { message: { raw: mimeMessage } } });
            return { content: [{ type: "text" as const, text: JSON.stringify({ id: response.data.id, message: { id: response.data.message?.id, threadId: response.data.message?.threadId, labelIds: response.data.message?.labelIds }, status: 'draft_created' }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.createDraft'); }
    }

    public sendDraft = async ({ draftId }: { draftId: string }) => {
        try {
            logToFile(`Sending draft: ${draftId}`);
            const gmail = await this.getGmailClient();
            const response = await gmail.users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
            return { content: [{ type: "text" as const, text: JSON.stringify({ id: response.data.id, threadId: response.data.threadId, labelIds: response.data.labelIds, status: 'sent' }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.sendDraft'); }
    }

    public listLabels = async () => {
        try {
            logToFile(`Listing Gmail labels`);
            const gmail = await this.getGmailClient();
            const response = await gmail.users.labels.list({ userId: 'me' });
            const labels = response.data.labels || [];
            return { content: [{ type: "text" as const, text: JSON.stringify({ labels: labels.map(label => ({ id: label.id, name: label.name, type: label.type, messageListVisibility: label.messageListVisibility, labelListVisibility: label.labelListVisibility })) }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.listLabels'); }
    }

    public getLabel = async ({ labelId }: { labelId: string }) => {
        try {
            logToFile(`Getting Gmail label: ${labelId}`);
            const gmail = await this.getGmailClient();
            const response = await gmail.users.labels.get({ userId: 'me', id: labelId });
            const label = response.data;
            return { content: [{ type: "text" as const, text: JSON.stringify({ id: label.id, name: label.name, type: label.type, messageListVisibility: label.messageListVisibility, labelListVisibility: label.labelListVisibility, messagesTotal: label.messagesTotal, messagesUnread: label.messagesUnread, threadsTotal: label.threadsTotal, threadsUnread: label.threadsUnread, color: label.color }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.getLabel'); }
    }

    public createLabel = async ({ name, labelListVisibility = 'labelShow', messageListVisibility = 'show', backgroundColor, textColor }: CreateLabelParams) => {
        try {
            logToFile(`Creating Gmail label: ${name}`);
            const gmail = await this.getGmailClient();
            const requestBody: gmail_v1.Schema$Label = { name, labelListVisibility, messageListVisibility };
            if (backgroundColor && textColor) { requestBody.color = { backgroundColor, textColor }; }
            else if (backgroundColor || textColor) { throw new Error('To set a label color, both backgroundColor and textColor must be provided.'); }
            const response = await gmail.users.labels.create({ userId: 'me', requestBody });
            const label = response.data;
            return { content: [{ type: "text" as const, text: JSON.stringify({ id: label.id, name: label.name, type: label.type, messageListVisibility: label.messageListVisibility, labelListVisibility: label.labelListVisibility, color: label.color, status: 'created' }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.createLabel'); }
    }

    public updateLabel = async ({ labelId, name, labelListVisibility, messageListVisibility, backgroundColor, textColor }: UpdateLabelParams) => {
        try {
            logToFile(`Updating Gmail label: ${labelId}`);
            const gmail = await this.getGmailClient();
            const requestBody: gmail_v1.Schema$Label = {};
            if (name !== undefined) requestBody.name = name;
            if (labelListVisibility !== undefined) requestBody.labelListVisibility = labelListVisibility;
            if (messageListVisibility !== undefined) requestBody.messageListVisibility = messageListVisibility;
            if (backgroundColor !== undefined || textColor !== undefined) {
                if (backgroundColor === undefined || textColor === undefined) { throw new Error('To update a label color, both backgroundColor and textColor must be provided.'); }
                requestBody.color = { backgroundColor, textColor };
            }
            const response = await gmail.users.labels.patch({ userId: 'me', id: labelId, requestBody });
            const label = response.data;
            return { content: [{ type: "text" as const, text: JSON.stringify({ id: label.id, name: label.name, type: label.type, messageListVisibility: label.messageListVisibility, labelListVisibility: label.labelListVisibility, color: label.color, status: 'updated' }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.updateLabel'); }
    }

    public deleteLabel = async ({ labelId }: { labelId: string }) => {
        try {
            logToFile(`Deleting Gmail label: ${labelId}`);
            const gmail = await this.getGmailClient();
            await gmail.users.labels.delete({ userId: 'me', id: labelId });
            return { content: [{ type: "text" as const, text: JSON.stringify({ labelId, status: 'deleted', message: `Label ${labelId} has been successfully deleted.` }, null, 2) }] };
        } catch (error) { return this.handleError(error, 'gmail.deleteLabel'); }
    }

    private extractAttachmentsAndBody(payload: gmail_v1.Schema$MessagePart, result: { body: string, attachments: GmailAttachment[] } = { body: '', attachments: [] }) {
        if (!payload) return result;
        if (payload.body?.data && (!payload.filename || !payload.body.attachmentId) && payload.mimeType?.startsWith('text/')) {
            if (!result.body || payload.mimeType === 'text/plain') result.body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        }
        if (payload.filename && payload.body?.attachmentId) result.attachments.push({ filename: payload.filename, mimeType: payload.mimeType, attachmentId: payload.body.attachmentId, size: payload.body.size });
        if (payload.parts) for (const part of payload.parts) this.extractAttachmentsAndBody(part, result);
        return result;
    }
}
