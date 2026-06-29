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
import {
  GMAIL_SEARCH_MAX_RESULTS,
  GMAIL_BATCH_MODIFY_MAX_IDS,
  GMAIL_NO_LABEL_CHANGES_MESSAGE,
} from '../utils/constants';
import { gaxiosOptions } from '../utils/GaxiosConfig';
import {
  emailArraySchema,
  gmailAttachmentSchema,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
} from '../utils/validation';
import { assertWithinAllowedRoots } from '../utils/allowed-roots';
import { z, ZodError } from 'zod';

// Extension to MIME type map for common file types
const EXTENSION_MIME_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
};

// MAX_TOTAL_ATTACHMENT_SIZE_BYTES is the single shared cap exported from
// validation.ts so gmail.send and gmail.createDraft cannot drift apart.

function assertWithinAttachmentSizeLimit(totalSize: number): void {
  if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE_BYTES) {
    throw new Error(
      `Total attachment size (${(totalSize / 1024 / 1024).toFixed(2)}MB) exceeds the maximum allowed limit of ${MAX_TOTAL_ATTACHMENT_SIZE_BYTES / 1024 / 1024}MB.`,
    );
  }
}

function getMimeTypeFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_MIME_MAP[ext] ?? 'application/octet-stream';
}

// Derived from the shared zod schema (also used for the MCP tool input in
// index.ts) so the runtime validation and this type cannot drift apart.
type AttachmentInput = z.infer<typeof gmailAttachmentSchema>;

// Type definitions for email parameters
type SendEmailParams = {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  isHtml?: boolean;
  attachments?: AttachmentInput[];
};

type CreateDraftParams = SendEmailParams & {
  threadId?: string;
};

interface GmailAttachment {
  filename: string | null | undefined;
  mimeType: string | null | undefined;
  attachmentId: string | null | undefined;
  size: number | null | undefined;
}

export class GmailService {
  constructor(private authManager: AuthManager) {}

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
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ error: errorMessage }),
        },
      ],
    };
  }

  public search = async ({
    query,
    maxResults = GMAIL_SEARCH_MAX_RESULTS,
    pageToken,
    labelIds,
    includeSpamTrash = false,
  }: {
    query?: string;
    maxResults?: number;
    pageToken?: string;
    labelIds?: string[];
    includeSpamTrash?: boolean;
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
        includeSpamTrash,
      });

      const messages = response.data.messages || [];
      const nextPageToken = response.data.nextPageToken;
      const resultSizeEstimate = response.data.resultSizeEstimate;

      logToFile(
        `Found ${messages.length} messages, estimated total: ${resultSizeEstimate}`,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                messages: messages.map((msg) => ({
                  id: msg.id,
                  threadId: msg.threadId,
                })),
                nextPageToken,
                resultSizeEstimate,
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.search');
    }
  };

  public get = async ({
    messageId,
    format = 'full',
  }: {
    messageId: string;
    format?: 'minimal' | 'full' | 'raw' | 'metadata';
  }) => {
    try {
      logToFile(`Getting message ${messageId} with format: ${format}`);

      const gmail = await this.getGmailClient();
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format,
      });

      const message = response.data;

      // Extract useful information based on format
      if (format === 'metadata' || format === 'full') {
        const headers = message.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name === name)?.value;

        const subject = getHeader('Subject');
        const from = getHeader('From');
        const to = getHeader('To');
        const date = getHeader('Date');

        // Extract body and attachments for full format
        let body = '';
        let attachments: GmailAttachment[] = [];
        if (format === 'full' && message.payload) {
          const result = this.extractAttachmentsAndBody(message.payload);
          body = result.body;
          attachments = result.attachments;
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  id: message.id,
                  threadId: message.threadId,
                  labelIds: message.labelIds,
                  snippet: message.snippet,
                  subject,
                  from,
                  to,
                  date,
                  body: body || message.snippet,
                  attachments: attachments,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(message, null, 2),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.get');
    }
  };

  public downloadAttachment = async ({
    messageId,
    attachmentId,
    localPath,
  }: {
    messageId: string;
    attachmentId: string;
    localPath: string;
  }) => {
    try {
      logToFile(
        `Downloading attachment ${attachmentId} from message ${messageId} to ${localPath}`,
      );

      if (!path.isAbsolute(localPath)) {
        throw new Error('localPath must be an absolute path.');
      }

      const gmail = await this.getGmailClient();
      const response = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: messageId,
        id: attachmentId,
      });

      const data = response.data.data;
      if (!data) {
        throw new Error('Attachment data is empty');
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(localPath), { recursive: true });

      // Write file
      const buffer = Buffer.from(data, 'base64url');
      await fs.writeFile(localPath, buffer);

      logToFile(`Attachment downloaded successfully to ${localPath}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: `Attachment downloaded successfully to ${localPath}`,
              path: localPath,
            }),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.downloadAttachment');
    }
  };

  public modify = async ({
    messageId,
    addLabelIds = [],
    removeLabelIds = [],
  }: {
    messageId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) => {
    try {
      logToFile(
        `Modifying message ${messageId} with addLabelIds: ${addLabelIds}, removeLabelIds: ${removeLabelIds}`,
      );

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
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(message, null, 2),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.modify');
    }
  };

  public batchModify = async ({
    messageIds,
    addLabelIds = [],
    removeLabelIds = [],
  }: {
    messageIds: string[];
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) => {
    try {
      if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'noop',
                message: GMAIL_NO_LABEL_CHANGES_MESSAGE,
              }),
            },
          ],
        };
      }

      if (messageIds.length > GMAIL_BATCH_MODIFY_MAX_IDS) {
        throw new Error(
          `Too many message IDs. Maximum is ${GMAIL_BATCH_MODIFY_MAX_IDS}, got ${messageIds.length}.`,
        );
      }

      logToFile(
        `Batch modifying ${messageIds.length} messages with addLabelIds: ${addLabelIds}, removeLabelIds: ${removeLabelIds}`,
      );

      const gmail = await this.getGmailClient();
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: {
          ids: messageIds,
          addLabelIds,
          removeLabelIds,
        },
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                modifiedCount: messageIds.length,
                addLabelIds,
                removeLabelIds,
                status: 'success',
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.batchModify');
    }
  };

  public modifyThread = async ({
    threadId,
    addLabelIds = [],
    removeLabelIds = [],
  }: {
    threadId: string;
    addLabelIds?: string[];
    removeLabelIds?: string[];
  }) => {
    try {
      if (addLabelIds.length === 0 && removeLabelIds.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'noop',
                message: GMAIL_NO_LABEL_CHANGES_MESSAGE,
              }),
            },
          ],
        };
      }

      logToFile(
        `Modifying thread ${threadId} with addLabelIds: ${addLabelIds}, removeLabelIds: ${removeLabelIds}`,
      );

      const gmail = await this.getGmailClient();
      const response = await gmail.users.threads.modify({
        userId: 'me',
        id: threadId,
        requestBody: {
          addLabelIds,
          removeLabelIds,
        },
      });

      const thread = response.data;
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(thread, null, 2),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.modifyThread');
    }
  };

  /**
   * Validates recipient email addresses shared by send and createDraft.
   * Returns a structured error response when validation fails, or null when
   * all provided addresses are valid.
   */
  private validateEmailAddresses({
    to,
    cc,
    bcc,
    replyTo,
  }: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
  }) {
    try {
      emailArraySchema.parse(to);
      if (cc) emailArraySchema.parse(cc);
      if (bcc) emailArraySchema.parse(bcc);
      if (replyTo) emailArraySchema.parse(replyTo);
      return null;
    } catch (error) {
      // Only Zod validation failures mean the addresses were malformed;
      // anything else is an internal fault and must not be mislabeled as an
      // invalid-email error, so rethrow it for the caller's generic handler.
      if (!(error instanceof ZodError)) {
        throw error;
      }
      logToFile(`Rejected invalid email address input: ${error.message}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: 'Invalid email address format',
              details: error.message,
            }),
          },
        ],
      };
    }
  }

  /**
   * Builds the raw base64url MIME message shared by gmail.send and
   * gmail.createDraft. When attachments are present each file path is validated
   * (absolute path, optional ATTACHMENT_ALLOWED_ROOTS allowlist, must be a file,
   * total size cap) and read from disk before a multipart/mixed message is
   * produced; otherwise a plain message is produced (no behaviour change for the
   * no-attachment path). Keeping this in one place guarantees both compose paths
   * enforce the same security and size invariants.
   */
  private async buildComposeMimeMessage({
    to,
    subject,
    body,
    cc,
    bcc,
    replyTo,
    isHtml = false,
    attachments,
    inReplyTo,
    references,
  }: SendEmailParams & {
    inReplyTo?: string;
    references?: string;
  }): Promise<string> {
    const toField = Array.isArray(to) ? to.join(', ') : to;
    const ccField = cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : undefined;
    const bccField = bcc
      ? Array.isArray(bcc)
        ? bcc.join(', ')
        : bcc
      : undefined;

    if (attachments && attachments.length > 0) {
      // Validate all paths are absolute, within the allowlist (when one is
      // configured), and check file sizes before reading anything.
      const attachmentSizes = await Promise.all(
        attachments.map(async (att) => {
          if (!path.isAbsolute(att.filePath)) {
            throw new Error(
              `Attachment filePath must be an absolute path: ${att.filePath}`,
            );
          }

          // Optional allowlist gate (no-op when ATTACHMENT_ALLOWED_ROOTS is
          // unset). Runs before fs.stat so out-of-root paths are never touched.
          assertWithinAllowedRoots(att.filePath);

          let stats;
          try {
            stats = await fs.stat(att.filePath);
          } catch (statError) {
            throw new Error(
              `Could not access attachment file ${att.filePath}: ${statError instanceof Error ? statError.message : String(statError)}`,
            );
          }

          if (!stats.isFile()) {
            throw new Error(`Attachment path is not a file: ${att.filePath}`);
          }

          return stats.size;
        }),
      );
      const totalSize = attachmentSizes.reduce((sum, size) => sum + size, 0);
      assertWithinAttachmentSizeLimit(totalSize);

      // Read each file from disk.
      const resolvedAttachments = await Promise.all(
        attachments.map(async (att) => {
          let content: Buffer;
          try {
            content = await fs.readFile(att.filePath);
          } catch (readError) {
            throw new Error(
              `Could not read attachment file ${att.filePath}: ${readError instanceof Error ? readError.message : String(readError)}`,
            );
          }
          return {
            // `||` (not `??`) so empty strings also fall back to defaults —
            // an empty filename or MIME type is invalid in MIME headers.
            filename: att.filename || path.basename(att.filePath),
            content,
            contentType: att.mimeType || getMimeTypeFromExtension(att.filePath),
          };
        }),
      );

      // The stat-based check above is a pre-flight guard so oversized files
      // are rejected before being read into memory, but a file can change
      // between stat and read (TOCTOU). Re-check against the bytes actually
      // read so the size cap is authoritative.
      assertWithinAttachmentSizeLimit(
        resolvedAttachments.reduce((sum, att) => sum + att.content.length, 0),
      );

      return MimeHelper.createMimeMessageWithAttachments({
        to: toField,
        subject,
        body,
        cc: ccField,
        bcc: bccField,
        replyTo,
        inReplyTo,
        references,
        isHtml,
        attachments: resolvedAttachments,
      });
    }

    return MimeHelper.createMimeMessage({
      to: toField,
      subject,
      body,
      cc: ccField,
      bcc: bccField,
      replyTo,
      isHtml,
      inReplyTo,
      references,
    });
  }

  public send = async ({
    to,
    subject,
    body,
    cc,
    bcc,
    replyTo,
    isHtml = false,
    attachments,
  }: SendEmailParams) => {
    try {
      // Validate email addresses
      const validationError = this.validateEmailAddresses({
        to,
        cc,
        bcc,
        replyTo,
      });
      if (validationError) {
        return validationError;
      }

      logToFile(`Sending email to: ${to}, subject: ${subject}`);

      // Create MIME message
      const mimeMessage = await this.buildComposeMimeMessage({
        to,
        subject,
        body,
        cc,
        bcc,
        replyTo,
        isHtml,
        attachments,
      });

      const gmail = await this.getGmailClient();
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: mimeMessage,
        },
      });

      logToFile(`Email sent successfully: ${response.data.id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: response.data.id,
                threadId: response.data.threadId,
                labelIds: response.data.labelIds,
                status: 'sent',
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.send');
    }
  };

  public createDraft = async ({
    to,
    subject,
    body,
    cc,
    bcc,
    replyTo,
    isHtml = false,
    threadId,
    attachments,
  }: CreateDraftParams) => {
    try {
      // Validate email addresses
      const validationError = this.validateEmailAddresses({
        to,
        cc,
        bcc,
        replyTo,
      });
      if (validationError) {
        return validationError;
      }

      logToFile(`Creating draft - to: ${to}, subject: ${subject}`);

      const gmail = await this.getGmailClient();

      // If threadId is provided, fetch the last message to get reply headers
      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (threadId) {
        try {
          const threadResponse = await gmail.users.threads.get({
            userId: 'me',
            id: threadId,
            format: 'metadata',
            metadataHeaders: ['Message-ID', 'References'],
          });
          const messages = threadResponse.data.messages || [];
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const headers = lastMessage.payload?.headers || [];
            const messageIdHeader = headers.find(
              (h) => h.name?.toLowerCase() === 'message-id',
            );
            const referencesHeader = headers.find(
              (h) => h.name?.toLowerCase() === 'references',
            );
            if (messageIdHeader?.value) {
              inReplyTo = messageIdHeader.value;
              const previousReferences = referencesHeader?.value || '';
              references = previousReferences
                ? `${previousReferences} ${messageIdHeader.value}`
                : messageIdHeader.value;
            }
          }
        } catch (threadError) {
          logToFile(
            `Warning: Could not fetch thread ${threadId} for reply headers: ${threadError}`,
          );
        }
      }

      // Create MIME message (shared compose path with gmail.send).
      const mimeMessage = await this.buildComposeMimeMessage({
        to,
        subject,
        body,
        cc,
        bcc,
        replyTo,
        isHtml,
        attachments,
        inReplyTo,
        references,
      });

      const response = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: {
            raw: mimeMessage,
            ...(threadId && { threadId }),
          },
        },
      });

      logToFile(`Draft created successfully: ${response.data.id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: response.data.id,
                message: {
                  id: response.data.message?.id,
                  threadId: response.data.message?.threadId,
                  labelIds: response.data.message?.labelIds,
                },
                status: 'draft_created',
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.createDraft');
    }
  };

  public sendDraft = async ({ draftId }: { draftId: string }) => {
    try {
      logToFile(`Sending draft: ${draftId}`);

      const gmail = await this.getGmailClient();
      const response = await gmail.users.drafts.send({
        userId: 'me',
        requestBody: {
          id: draftId,
        },
      });

      logToFile(`Draft sent successfully: ${response.data.id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: response.data.id,
                threadId: response.data.threadId,
                labelIds: response.data.labelIds,
                status: 'sent',
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.sendDraft');
    }
  };

  public listLabels = async () => {
    try {
      logToFile(`Listing Gmail labels`);

      const gmail = await this.getGmailClient();
      const response = await gmail.users.labels.list({
        userId: 'me',
      });

      const labels = response.data.labels || [];

      logToFile(`Found ${labels.length} labels`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                labels: labels.map((label) => ({
                  id: label.id,
                  name: label.name,
                  type: label.type,
                  messageListVisibility: label.messageListVisibility,
                  labelListVisibility: label.labelListVisibility,
                })),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.listLabels');
    }
  };

  public createLabel = async ({
    name,
    labelListVisibility = 'labelShow',
    messageListVisibility = 'show',
  }: {
    name: string;
    labelListVisibility?: 'labelShow' | 'labelHide' | 'labelShowIfUnread';
    messageListVisibility?: 'show' | 'hide';
  }) => {
    try {
      logToFile(`Creating Gmail label: ${name}`);

      const gmail = await this.getGmailClient();

      const response = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility,
          messageListVisibility,
        },
      });

      const label = response.data;

      logToFile(`Created label: ${label.name} with id: ${label.id}`);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                id: label.id,
                name: label.name,
                type: label.type,
                messageListVisibility: label.messageListVisibility,
                labelListVisibility: label.labelListVisibility,
                status: 'created',
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return this.handleError(error, 'gmail.createLabel');
    }
  };

  private extractAttachmentsAndBody(
    payload: gmail_v1.Schema$MessagePart,
    result: { body: string; attachments: GmailAttachment[] } = {
      body: '',
      attachments: [],
    },
  ) {
    if (!payload) return result;

    // Handle body parts
    if (payload.body?.data) {
      // If it's the main body (and not an attachment)
      if (!payload.filename || !payload.body.attachmentId) {
        if (payload.mimeType?.startsWith('text/')) {
          // Prioritize plain text over HTML for direct body extraction
          if (!result.body || payload.mimeType === 'text/plain') {
            result.body = Buffer.from(payload.body.data, 'base64').toString(
              'utf-8',
            );
          }
        }
      }
    }

    // Handle attachments and recursive parts
    if (payload.filename && payload.body?.attachmentId) {
      result.attachments.push({
        filename: payload.filename,
        mimeType: payload.mimeType,
        attachmentId: payload.body.attachmentId,
        size: payload.body.size, // Size in bytes
      });
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        this.extractAttachmentsAndBody(part, result);
      }
    }
    return result;
  }
}
