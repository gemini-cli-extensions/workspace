/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import * as fs from 'node:fs/promises';
import { GmailService } from '../../services/GmailService';
import { AuthManager } from '../../auth/AuthManager';
import { MimeHelper } from '../../utils/MimeHelper';
import { google } from 'googleapis';

// Mock the modules
jest.mock('googleapis');
jest.mock('node:fs/promises');
jest.mock('../../utils/logger');
jest.mock('../../utils/MimeHelper');

describe('GmailService', () => {
  let gmailService: GmailService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockGmailAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Gmail API
    mockGmailAPI = {
      users: {
        messages: {
          list: jest.fn(),
          get: jest.fn(),
          send: jest.fn(),
          trash: jest.fn(),
          untrash: jest.fn(),
          delete: jest.fn(),
          modify: jest.fn(),
          batchModify: jest.fn(),
          attachments: {
            get: jest.fn(),
          },
        },
        drafts: {
          create: jest.fn(),
          send: jest.fn(),
          list: jest.fn(),
          get: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        labels: {
          list: jest.fn(),
          get: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        threads: {
          list: jest.fn(),
          get: jest.fn(),
          modify: jest.fn(),
        },
      },
    };

    // Mock the google.gmail constructor
    (google.gmail as jest.Mock) = jest.fn().mockReturnValue(mockGmailAPI);

    // Create GmailService instance
    gmailService = new GmailService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('search', () => {
    it('should search for emails with query', async () => {
      const mockMessages = [
        { id: 'msg1', threadId: 'thread1' },
        { id: 'msg2', threadId: 'thread2' },
      ];

      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: mockMessages,
          nextPageToken: 'next-token',
          resultSizeEstimate: 100,
        },
      });

      const result = await gmailService.search({
        query: 'from:example@gmail.com',
        maxResults: 10,
      });

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'from:example@gmail.com',
        maxResults: 10,
        pageToken: undefined,
        labelIds: undefined,
        includeSpamTrash: false,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.messages).toEqual(mockMessages);
      expect(response.nextPageToken).toBe('next-token');
      expect(response.resultSizeEstimate).toBe(100);
    });

    it('should handle pagination with pageToken', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [],
          nextPageToken: null,
        },
      });

      await gmailService.search({
        query: 'subject:Test',
        pageToken: 'page-2',
      });

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          pageToken: 'page-2',
        }),
      );
    });

    it('should filter by labels', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [],
        },
      });

      await gmailService.search({
        labelIds: ['INBOX', 'UNREAD'],
      });

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          labelIds: ['INBOX', 'UNREAD'],
        }),
      );
    });

    it('should include spam and trash when specified', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: [],
        },
      });

      await gmailService.search({
        includeSpamTrash: true,
      });

      expect(mockGmailAPI.users.messages.list).toHaveBeenCalledWith(
        expect.objectContaining({
          includeSpamTrash: true,
        }),
      );
    });

    it('should handle empty search results', async () => {
      mockGmailAPI.users.messages.list.mockResolvedValue({
        data: {
          messages: null,
          resultSizeEstimate: 0,
        },
      });

      const result = await gmailService.search({});

      const response = JSON.parse(result.content[0].text);
      expect(response.messages).toEqual([]);
      expect(response.resultSizeEstimate).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Gmail API error');
      mockGmailAPI.users.messages.list.mockRejectedValue(apiError);

      const result = await gmailService.search({ query: 'test' });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Gmail API error');
    });
  });

  describe('get', () => {
    it('should get a message by ID with full format', async () => {
      const mockMessage = {
        id: 'msg1',
        threadId: 'thread1',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'recipient@example.com' },
            { name: 'Subject', value: 'Test Email' },
          ],
          body: {
            data: 'SGVsbG8gV29ybGQh', // Base64 for "Hello World!"
          },
        },
      };

      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: mockMessage,
      });

      const result = await gmailService.get({
        messageId: 'msg1',
        format: 'full',
      });

      expect(mockGmailAPI.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        format: 'full',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.id).toBe('msg1');
      expect(response.subject).toBe('Test Email');
      expect(response.from).toBe('sender@example.com');
      expect(response.to).toBe('recipient@example.com');
      expect(response.attachments).toEqual([]);
    });

    it('should extract attachments in full format', async () => {
      const mockMessage = {
        id: 'msg_with_attach',
        threadId: 'thread1',
        payload: {
          headers: [],
          filename: '',
          body: { size: 0 },
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: 'SGVsbG8=' }, // Hello
              filename: '',
            },
            {
              mimeType: 'application/pdf',
              filename: 'test.pdf',
              body: { attachmentId: 'attach1', size: 1000 },
            },
          ],
        },
      };

      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: mockMessage,
      });

      const result = await gmailService.get({
        messageId: 'msg_with_attach',
        format: 'full',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.attachments).toHaveLength(1);
      expect(response.attachments[0]).toEqual({
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        attachmentId: 'attach1',
        size: 1000,
      });
      expect(response.body).toBe('Hello');
    });

    it('should handle minimal format', async () => {
      const mockMessage = {
        id: 'msg1',
        threadId: 'thread1',
        snippet: 'This is a preview of the email...',
      };

      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: mockMessage,
      });

      await gmailService.get({
        messageId: 'msg1',
        format: 'minimal',
      });

      expect(mockGmailAPI.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        format: 'minimal',
      });
    });

    it('should handle metadata format', async () => {
      mockGmailAPI.users.messages.get.mockResolvedValue({
        data: {
          id: 'msg1',
          payload: {
            headers: [{ name: 'Subject', value: 'Test' }],
          },
        },
      });

      await gmailService.get({
        messageId: 'msg1',
        format: 'metadata',
      });

      expect(mockGmailAPI.users.messages.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        format: 'metadata',
      });
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Message not found');
      mockGmailAPI.users.messages.get.mockRejectedValue(apiError);

      const result = await gmailService.get({ messageId: 'invalid-id' });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Message not found');
    });
  });

  describe('downloadAttachment', () => {
    it('should download an attachment successfully', async () => {
      // Setup mocks
      const mockAttachmentData = {
        data: 'SGVsbG8gV29ybGQ=', // Base64 for "Hello World"
      };
      mockGmailAPI.users.messages.attachments.get.mockResolvedValue({
        data: mockAttachmentData,
      });

      (fs.mkdir as any).mockResolvedValue('/tmp');
      (fs.writeFile as any).mockResolvedValue(undefined);

      // Execute
      const result = await gmailService.downloadAttachment({
        messageId: 'msg1',
        attachmentId: 'attach1',
        localPath: '/tmp/test.txt',
      });

      // Verify
      expect(mockGmailAPI.users.messages.attachments.get).toHaveBeenCalledWith({
        userId: 'me',
        messageId: 'msg1',
        id: 'attach1',
      });

      expect(fs.mkdir).toHaveBeenCalledWith('/tmp', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/test.txt',
        expect.any(Buffer), // We check if it's a buffer, content verification is implicit via Buffer.from logic
      );

      const response = JSON.parse(result.content[0].text);
      expect(response.message).toContain('Attachment downloaded successfully');
      expect(response.path).toBe('/tmp/test.txt');
    });

    it('should reject relative paths', async () => {
      const result = await gmailService.downloadAttachment({
        messageId: 'msg1',
        attachmentId: 'attach1',
        localPath: 'relative/path.txt',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('localPath must be an absolute path.');
    });

    it('should handle empty attachment data', async () => {
      mockGmailAPI.users.messages.attachments.get.mockResolvedValue({
        data: {}, // No data
      });

      const result = await gmailService.downloadAttachment({
        messageId: 'msg1',
        attachmentId: 'attach1',
        localPath: '/tmp/test.txt',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Attachment data is empty');
    });

    it('should handle download errors', async () => {
      const error = new Error('Download failed');
      mockGmailAPI.users.messages.attachments.get.mockRejectedValue(error);

      const result = await gmailService.downloadAttachment({
        messageId: 'msg1',
        attachmentId: 'attach1',
        localPath: '/tmp/test.txt',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Download failed');
    });
  });

  describe('modify', () => {
    it('should add a label to a message', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'msg1',
          labelIds: ['Label_1'],
        },
      });

      const result = await gmailService.modify({
        messageId: 'msg1',
        addLabelIds: ['Label_1'],
      });

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        requestBody: {
          addLabelIds: ['Label_1'],
          removeLabelIds: [],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toStrictEqual({
        id: 'msg1',
        labelIds: ['Label_1'],
      });
    });

    it('should add multiple labels to a message', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'msg1',
          labelIds: ['Label_1', 'Label_2'],
        },
      });

      const result = await gmailService.modify({
        messageId: 'msg1',
        addLabelIds: ['Label_1', 'Label_2'],
      });

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        requestBody: {
          addLabelIds: ['Label_1', 'Label_2'],
          removeLabelIds: [],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toStrictEqual({
        id: 'msg1',
        labelIds: ['Label_1', 'Label_2'],
      });
    });

    it('should remove a label from a message', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'msg1',
          labelIds: ['Label_2'],
        },
      });

      const result = await gmailService.modify({
        messageId: 'msg1',
        removeLabelIds: ['Label_1'],
      });

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        requestBody: {
          addLabelIds: [],
          removeLabelIds: ['Label_1'],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toStrictEqual({
        id: 'msg1',
        labelIds: ['Label_2'],
      });
    });

    it('should remove multiple labels from a message', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'msg1',
          labelIds: [],
        },
      });

      const result = await gmailService.modify({
        messageId: 'msg1',
        removeLabelIds: ['Label_1', 'Label_2'],
      });

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        requestBody: {
          addLabelIds: [],
          removeLabelIds: ['Label_1', 'Label_2'],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toStrictEqual({
        id: 'msg1',
        labelIds: [],
      });
    });

    it('should add and remove labels on a message', async () => {
      mockGmailAPI.users.messages.modify.mockResolvedValue({
        data: {
          id: 'msg1',
          labelIds: ['Label_1'],
        },
      });

      const result = await gmailService.modify({
        messageId: 'msg1',
        addLabelIds: ['Label_1'],
        removeLabelIds: ['Label_2'],
      });

      expect(mockGmailAPI.users.messages.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'msg1',
        requestBody: {
          addLabelIds: ['Label_1'],
          removeLabelIds: ['Label_2'],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toStrictEqual({
        id: 'msg1',
        labelIds: ['Label_1'],
      });
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Message not found');
      mockGmailAPI.users.messages.modify.mockRejectedValue(apiError);

      const result = await gmailService.modify({ messageId: 'invalid-id' });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Message not found');
    });
  });

  describe('batchModify', () => {
    it('should batch modify messages with label changes', async () => {
      mockGmailAPI.users.messages.batchModify.mockResolvedValue({
        data: undefined,
      });

      const result = await gmailService.batchModify({
        messageIds: ['msg1', 'msg2', 'msg3'],
        addLabelIds: ['Label_1'],
        removeLabelIds: ['UNREAD'],
      });

      expect(mockGmailAPI.users.messages.batchModify).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          ids: ['msg1', 'msg2', 'msg3'],
          addLabelIds: ['Label_1'],
          removeLabelIds: ['UNREAD'],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toStrictEqual({
        modifiedCount: 3,
        addLabelIds: ['Label_1'],
        removeLabelIds: ['UNREAD'],
        status: 'success',
      });
    });

    it('should return noop when no label changes are provided', async () => {
      const result = await gmailService.batchModify({
        messageIds: ['msg1', 'msg2'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('noop');
      expect(response.message).toContain('No labels to add or remove');
      expect(mockGmailAPI.users.messages.batchModify).not.toHaveBeenCalled();
    });

    it('should reject when exceeding max message ID limit', async () => {
      const tooManyIds = Array.from({ length: 1001 }, (_, i) => `msg${i}`);

      const result = await gmailService.batchModify({
        messageIds: tooManyIds,
        removeLabelIds: ['UNREAD'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('Too many message IDs');
      expect(response.error).toContain('1000');
      expect(mockGmailAPI.users.messages.batchModify).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Batch modify failed');
      mockGmailAPI.users.messages.batchModify.mockRejectedValue(apiError);

      const result = await gmailService.batchModify({
        messageIds: ['msg1'],
        removeLabelIds: ['UNREAD'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Batch modify failed');
    });
  });

  describe('modifyThread', () => {
    it('should modify a thread with label changes', async () => {
      mockGmailAPI.users.threads.modify.mockResolvedValue({
        data: {
          id: 'thread1',
          messages: [
            { id: 'msg1', labelIds: ['Label_1'] },
            { id: 'msg2', labelIds: ['Label_1'] },
          ],
        },
      });

      const result = await gmailService.modifyThread({
        threadId: 'thread1',
        addLabelIds: ['Label_1'],
        removeLabelIds: ['UNREAD'],
      });

      expect(mockGmailAPI.users.threads.modify).toHaveBeenCalledWith({
        userId: 'me',
        id: 'thread1',
        requestBody: {
          addLabelIds: ['Label_1'],
          removeLabelIds: ['UNREAD'],
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.id).toBe('thread1');
      expect(response.messages).toHaveLength(2);
    });

    it('should return noop when no label changes are provided', async () => {
      const result = await gmailService.modifyThread({
        threadId: 'thread1',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('noop');
      expect(response.message).toContain('No labels to add or remove');
      expect(mockGmailAPI.users.threads.modify).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      const apiError = new Error('Thread not found');
      mockGmailAPI.users.threads.modify.mockRejectedValue(apiError);

      const result = await gmailService.modifyThread({
        threadId: 'invalid-thread',
        removeLabelIds: ['UNREAD'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Thread not found');
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      // Mock MimeHelper
      (MimeHelper.createMimeMessage as jest.Mock) = jest
        .fn()
        .mockReturnValue('base64encodedmessage');
    });

    it('should send an email with basic parameters', async () => {
      const mockSentMessage = {
        id: 'sent-msg-1',
        threadId: 'thread1',
        labelIds: ['SENT'],
      };

      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: mockSentMessage,
      });

      const result = await gmailService.send({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
        cc: undefined,
        bcc: undefined,
        isHtml: false,
      });

      expect(mockGmailAPI.users.messages.send).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          raw: 'base64encodedmessage',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('sent');
      expect(response.id).toBe('sent-msg-1');
      expect(response.threadId).toBe('thread1');
      expect(response.labelIds).toEqual(['SENT']);
    });

    it('should support replyTo in email', async () => {
      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: { id: 'sent-msg-reply' },
      });

      await gmailService.send({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        body: 'Test Body',
        replyTo: 'support@example.com',
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support@example.com',
        }),
      );
    });

    it('should send email with multiple recipients', async () => {
      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: { id: 'sent-msg-2' },
      });

      await gmailService.send({
        to: ['recipient1@example.com', 'recipient2@example.com'],
        subject: 'Test',
        body: 'Body',
        cc: ['cc1@example.com', 'cc2@example.com'],
        bcc: 'bcc@example.com',
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith({
        to: 'recipient1@example.com, recipient2@example.com',
        subject: 'Test',
        body: 'Body',
        cc: 'cc1@example.com, cc2@example.com',
        bcc: 'bcc@example.com',
        isHtml: false,
      });
    });

    it('should send HTML email', async () => {
      mockGmailAPI.users.messages.send.mockResolvedValue({
        data: { id: 'sent-msg-3' },
      });

      await gmailService.send({
        to: 'recipient@example.com',
        subject: 'HTML Test',
        body: '<h1>Hello</h1>',
        isHtml: true,
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          isHtml: true,
        }),
      );
    });

    it('should handle send errors', async () => {
      const apiError = new Error('Failed to send message');
      mockGmailAPI.users.messages.send.mockRejectedValue(apiError);

      const result = await gmailService.send({
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Body',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Failed to send message');
    });
  });

  describe('createDraft', () => {
    beforeEach(async () => {
      (MimeHelper.createMimeMessage as jest.Mock) = jest
        .fn()
        .mockReturnValue('base64encodedmessage');
      (MimeHelper.createMimeMessageWithAttachments as jest.Mock) = jest
        .fn()
        .mockReturnValue('base64encodedmessage-with-attachments');
      (fs.stat as any).mockResolvedValue({
        isFile: () => true,
        size: 1024,
      });
    });

    it('should create a draft email', async () => {
      const mockDraft = {
        id: 'draft1',
        message: {
          id: 'msg1',
          threadId: 'thread1',
        },
      };

      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: mockDraft,
      });

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Draft Subject',
        body: 'Draft Body',
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        subject: 'Draft Subject',
        body: 'Draft Body',
        cc: undefined,
        bcc: undefined,
        replyTo: undefined,
        isHtml: false,
        inReplyTo: undefined,
        references: undefined,
      });

      expect(mockGmailAPI.users.drafts.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: {
            raw: 'base64encodedmessage',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('draft_created');
      expect(response.id).toBe('draft1');
      expect(response.message.id).toBe('msg1');
      expect(response.message.threadId).toBe('thread1');
    });

    it('should support replyTo in draft email', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: { id: 'd-reply', message: { id: 'm-reply' } },
      });

      await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Draft Subject',
        body: 'Draft Body',
        replyTo: 'support@example.com',
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          replyTo: 'support@example.com',
        }),
      );
    });

    it('should reject invalid recipient email addresses', async () => {
      const result = await gmailService.createDraft({
        to: 'not-an-email',
        subject: 'Draft Subject',
        body: 'Draft Body',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Invalid email address format');
      expect(MimeHelper.createMimeMessage).not.toHaveBeenCalled();
    });

    it('should enforce maximum total attachment size', async () => {
      (fs.stat as any).mockResolvedValue({
        isFile: () => true,
        size: 30 * 1024 * 1024, // 30MB
      });

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Too Large',
        body: 'Body',
        attachments: [{ filePath: '/tmp/huge.zip' }],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('exceeds the maximum allowed limit');
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it('should validate attachment path is a file', async () => {
      (fs.stat as any).mockResolvedValue({
        isFile: () => false,
        size: 0,
      });

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Not a file',
        body: 'Body',
        attachments: [{ filePath: '/tmp/directory' }],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('path is not a file');
    });

    it('should handle draft creation errors', async () => {
      const apiError = new Error('Failed to create draft');
      mockGmailAPI.users.drafts.create.mockRejectedValue(apiError);

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Test',
        body: 'Body',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Failed to create draft');
    });

    it('should create a reply draft with threadId', async () => {
      const mockDraft = {
        id: 'draft1',
        message: {
          id: 'msg1',
          threadId: 'thread1',
        },
      };

      mockGmailAPI.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              id: 'original-msg',
              payload: {
                headers: [
                  {
                    name: 'Message-ID',
                    value: '<original-msg-id@mail.gmail.com>',
                  },
                  {
                    name: 'References',
                    value: '<earlier-msg-id@mail.gmail.com>',
                  },
                ],
              },
            },
          ],
        },
      });

      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: mockDraft,
      });

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Re: Original Subject',
        body: 'Reply body',
        threadId: 'thread1',
      });

      // Verify thread was fetched with both Message-ID and References headers
      expect(mockGmailAPI.users.threads.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'thread1',
        format: 'metadata',
        metadataHeaders: ['Message-ID', 'References'],
      });

      // Verify References is built by appending Message-ID to existing References
      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<original-msg-id@mail.gmail.com>',
          references:
            '<earlier-msg-id@mail.gmail.com> <original-msg-id@mail.gmail.com>',
        }),
      );

      // Verify threadId was set on the API request
      expect(mockGmailAPI.users.drafts.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: {
            raw: 'base64encodedmessage',
            threadId: 'thread1',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('draft_created');
      expect(response.id).toBe('draft1');
    });

    it('should handle thread fetch failure gracefully and still create the draft', async () => {
      const mockDraft = {
        id: 'draft2',
        message: {
          id: 'msg2',
          threadId: 'thread1',
        },
      };

      mockGmailAPI.users.threads.get.mockRejectedValue(
        new Error('Thread not found'),
      );

      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: mockDraft,
      });

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Re: Original Subject',
        body: 'Reply body',
        threadId: 'thread1',
      });

      // Verify MIME message was created without reply headers
      expect(MimeHelper.createMimeMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: undefined,
          references: undefined,
        }),
      );

      // Verify threadId was still set on the API request
      expect(mockGmailAPI.users.drafts.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: {
            raw: 'base64encodedmessage',
            threadId: 'thread1',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('draft_created');
    });

    it('should create a draft with attachments using createMimeMessageWithAttachments', async () => {
      const mockDraft = {
        id: 'draft-attach-1',
        message: { id: 'msg-attach-1', threadId: null, labelIds: ['DRAFT'] },
      };
      mockGmailAPI.users.drafts.create.mockResolvedValue({ data: mockDraft });

      const mockFileBuffer = Buffer.from('PDF content');
      (fs.readFile as any).mockResolvedValue(mockFileBuffer);

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Draft with Attachment',
        body: 'See attached.',
        attachments: [
          { filePath: '/tmp/report.pdf', mimeType: 'application/pdf' },
        ],
      });

      expect((fs.readFile as any).mock.calls[0][0]).toBe('/tmp/report.pdf');
      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'report.pdf',
              content: mockFileBuffer,
              contentType: 'application/pdf',
            },
          ],
          inReplyTo: undefined,
          references: undefined,
        }),
      );
      expect(MimeHelper.createMimeMessage).not.toHaveBeenCalled();

      expect(mockGmailAPI.users.drafts.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: { raw: 'base64encodedmessage-with-attachments' },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('draft_created');
      expect(response.id).toBe('draft-attach-1');
    });

    it('should use filename override when provided', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: {
          id: 'draft2',
          message: { id: 'msg2', threadId: null, labelIds: [] },
        },
      });
      (fs.readFile as any).mockResolvedValue(Buffer.from('data'));

      await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [
          { filePath: '/tmp/123abc.tmp', filename: 'custom-name.pdf' },
        ],
      });

      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({ filename: 'custom-name.pdf' }),
          ]),
        }),
      );
    });

    it('should fall back to defaults when filename or mimeType are empty strings', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: {
          id: 'draft-empty',
          message: { id: 'msg-empty', threadId: null, labelIds: [] },
        },
      });
      (fs.readFile as any).mockResolvedValue(Buffer.from('data'));

      await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [
          { filePath: '/tmp/report.pdf', filename: '', mimeType: '' },
        ],
      });

      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              filename: 'report.pdf',
              contentType: 'application/pdf',
            }),
          ]),
        }),
      );
    });

    it('should infer MIME type from extension when mimeType not provided', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: { id: 'd3', message: { id: 'm3', threadId: null, labelIds: [] } },
      });
      (fs.readFile as any).mockResolvedValue(Buffer.from('data'));

      await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: '/tmp/report.xlsx' }],
      });

      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
          ]),
        }),
      );
    });

    it('should fall back to application/octet-stream for unknown extension', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: { id: 'd4', message: { id: 'm4', threadId: null, labelIds: [] } },
      });
      (fs.readFile as any).mockResolvedValue(Buffer.from('data'));

      await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: '/tmp/mystery.xyz' }],
      });

      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: expect.arrayContaining([
            expect.objectContaining({
              contentType: 'application/octet-stream',
            }),
          ]),
        }),
      );
    });

    it('should pass inReplyTo and references to createMimeMessageWithAttachments for threaded draft with attachments', async () => {
      const mockDraft = {
        id: 'draft-thread-attach',
        message: { id: 'msg-ta', threadId: 'thread1', labelIds: ['DRAFT'] },
      };
      mockGmailAPI.users.threads.get.mockResolvedValue({
        data: {
          messages: [
            {
              payload: {
                headers: [
                  { name: 'Message-ID', value: '<orig@mail.example.com>' },
                  { name: 'References', value: '<prev@mail.example.com>' },
                ],
              },
            },
          ],
        },
      });
      mockGmailAPI.users.drafts.create.mockResolvedValue({ data: mockDraft });
      (fs.readFile as any).mockResolvedValue(Buffer.from('data'));

      const result = await gmailService.createDraft({
        to: 'b@example.com',
        subject: 'Re: Attached Reply',
        body: 'See file.',
        threadId: 'thread1',
        attachments: [{ filePath: '/tmp/file.pdf' }],
      });

      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<orig@mail.example.com>',
          references: '<prev@mail.example.com> <orig@mail.example.com>',
        }),
      );
      expect(mockGmailAPI.users.drafts.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: {
            raw: 'base64encodedmessage-with-attachments',
            threadId: 'thread1',
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('draft_created');
    });

    it('should reject a relative filePath and return error without calling Gmail API', async () => {
      const result = await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: 'relative/path/file.pdf' }],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('must be an absolute path');
      expect(mockGmailAPI.users.drafts.create).not.toHaveBeenCalled();
      expect((fs.readFile as any).mock.calls).toHaveLength(0);
    });

    it('should handle readFile failure (file not found) gracefully', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('ENOENT: no such file'));

      const result = await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: '/tmp/missing.pdf' }],
      });

      const response = JSON.parse(result.content[0].text);
      // Bare errno is wrapped with the failing path so the error identifies
      // which attachment could not be read
      expect(response.error).toContain(
        'Could not read attachment file /tmp/missing.pdf',
      );
      expect(response.error).toContain('ENOENT');
      expect(mockGmailAPI.users.drafts.create).not.toHaveBeenCalled();
    });

    it('should surface fs.stat failures with a descriptive error and not call the Gmail API', async () => {
      (fs.stat as any).mockRejectedValue(
        new Error('EACCES: permission denied'),
      );

      const result = await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: '/tmp/locked.pdf' }],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain(
        'Could not access attachment file /tmp/locked.pdf',
      );
      expect(response.error).toContain('EACCES');
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(mockGmailAPI.users.drafts.create).not.toHaveBeenCalled();
    });

    it('should reject when the combined size of multiple attachments exceeds the limit', async () => {
      // Each file is well under the 18MB cap; only their sum exceeds it.
      (fs.stat as any).mockResolvedValue({
        isFile: () => true,
        size: 10 * 1024 * 1024, // 10MB each
      });

      const result = await gmailService.createDraft({
        to: 'recipient@example.com',
        subject: 'Combined Too Large',
        body: 'Body',
        attachments: [{ filePath: '/tmp/a.zip' }, { filePath: '/tmp/b.zip' }],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('20.00MB');
      expect(response.error).toContain('exceeds the maximum allowed limit');
      expect(fs.readFile).not.toHaveBeenCalled();
      expect(mockGmailAPI.users.drafts.create).not.toHaveBeenCalled();
    });

    it('should attach multiple files and pass each to the MIME builder', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: {
          id: 'd-multi',
          message: { id: 'm-multi', threadId: null, labelIds: [] },
        },
      });
      const bufA = Buffer.from('first file');
      const bufB = Buffer.from('second file');
      (fs.readFile as any).mockImplementation(async (p: string) =>
        p === '/tmp/a.pdf' ? bufA : bufB,
      );

      await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: '/tmp/a.pdf' }, { filePath: '/tmp/b.txt' }],
      });

      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          attachments: [
            {
              filename: 'a.pdf',
              content: bufA,
              contentType: 'application/pdf',
            },
            { filename: 'b.txt', content: bufB, contentType: 'text/plain' },
          ],
        }),
      );
    });

    it('should enforce the size cap against bytes actually read (stat/read TOCTOU)', async () => {
      // stat reports a small size, but the file grew before readFile ran
      (fs.stat as any).mockResolvedValue({ isFile: () => true, size: 1024 });
      (fs.readFile as any).mockResolvedValue(
        Buffer.alloc(18 * 1024 * 1024 + 1),
      );

      const result = await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [{ filePath: '/tmp/grew.bin' }],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toContain('exceeds the maximum allowed limit');
      expect(mockGmailAPI.users.drafts.create).not.toHaveBeenCalled();
    });

    it('should reject an invalid replyTo address', async () => {
      const result = await gmailService.createDraft({
        to: 'valid@example.com',
        subject: 'S',
        body: 'B',
        replyTo: 'not-an-email',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Invalid email address format');
      expect(MimeHelper.createMimeMessage).not.toHaveBeenCalled();
    });

    it('should reject invalid cc and bcc addresses', async () => {
      const result = await gmailService.createDraft({
        to: 'valid@example.com',
        subject: 'S',
        body: 'B',
        cc: ['ok@example.com', 'bad-cc'],
        bcc: 'bad-bcc',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Invalid email address format');
      expect(MimeHelper.createMimeMessage).not.toHaveBeenCalled();
    });

    it('should use createMimeMessage (not WithAttachments) when attachments array is empty', async () => {
      mockGmailAPI.users.drafts.create.mockResolvedValue({
        data: { id: 'd5', message: { id: 'm5', threadId: null, labelIds: [] } },
      });

      await gmailService.createDraft({
        to: 'a@example.com',
        subject: 'S',
        body: 'B',
        attachments: [],
      });

      expect(MimeHelper.createMimeMessage).toHaveBeenCalled();
      expect(
        MimeHelper.createMimeMessageWithAttachments as jest.Mock,
      ).not.toHaveBeenCalled();
      expect((fs.readFile as any).mock.calls).toHaveLength(0);
    });
  });

  describe('sendDraft', () => {
    it('should send a draft', async () => {
      const mockSentMessage = {
        id: 'sent-msg-1',
        threadId: 'thread1',
        labelIds: ['SENT'],
      };

      mockGmailAPI.users.drafts.send.mockResolvedValue({
        data: mockSentMessage,
      });

      const result = await gmailService.sendDraft({ draftId: 'draft1' });

      expect(mockGmailAPI.users.drafts.send).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          id: 'draft1',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe('sent');
      expect(response.id).toBe('sent-msg-1');
    });

    it('should handle send draft errors', async () => {
      const apiError = new Error('Draft not found');
      mockGmailAPI.users.drafts.send.mockRejectedValue(apiError);

      const result = await gmailService.sendDraft({ draftId: 'invalid-draft' });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Draft not found');
    });
  });

  describe('listLabels', () => {
    it('should list all labels', async () => {
      const mockLabels = [
        { id: 'INBOX', name: 'INBOX', type: 'system' },
        { id: 'Label_1', name: 'Work', type: 'user' },
        { id: 'Label_2', name: 'Personal', type: 'user' },
      ];

      mockGmailAPI.users.labels.list.mockResolvedValue({
        data: {
          labels: mockLabels,
        },
      });

      const result = await gmailService.listLabels();

      expect(mockGmailAPI.users.labels.list).toHaveBeenCalledWith({
        userId: 'me',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.labels).toEqual(mockLabels);
    });

    it('should handle empty labels list', async () => {
      mockGmailAPI.users.labels.list.mockResolvedValue({
        data: {
          labels: null,
        },
      });

      const result = await gmailService.listLabels();

      const response = JSON.parse(result.content[0].text);
      expect(response.labels).toEqual([]);
    });

    it('should handle list labels errors', async () => {
      const apiError = new Error('Failed to list labels');
      mockGmailAPI.users.labels.list.mockRejectedValue(apiError);

      const result = await gmailService.listLabels();

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Failed to list labels');
    });
  });

  describe('createLabel', () => {
    it('should create a label with default visibility', async () => {
      const mockLabel = {
        id: 'Label_1',
        name: 'Test Label',
        type: 'user',
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      };

      mockGmailAPI.users.labels.create.mockResolvedValue({
        data: mockLabel,
      });

      const result = await gmailService.createLabel({
        name: 'Test Label',
      });

      expect(mockGmailAPI.users.labels.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          name: 'Test Label',
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toEqual({
        ...mockLabel,
        status: 'created',
      });
    });

    it('should create a label with custom visibility settings', async () => {
      const mockLabel = {
        id: 'Label_2',
        name: 'Hidden Label',
        type: 'user',
        labelListVisibility: 'labelHide',
        messageListVisibility: 'hide',
      };

      mockGmailAPI.users.labels.create.mockResolvedValue({
        data: mockLabel,
      });

      const result = await gmailService.createLabel({
        name: 'Hidden Label',
        labelListVisibility: 'labelHide',
        messageListVisibility: 'hide',
      });

      expect(mockGmailAPI.users.labels.create).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          name: 'Hidden Label',
          labelListVisibility: 'labelHide',
          messageListVisibility: 'hide',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toEqual({
        ...mockLabel,
        status: 'created',
      });
    });

    it('should handle create label errors', async () => {
      const apiError = new Error('Label already exists');
      mockGmailAPI.users.labels.create.mockRejectedValue(apiError);

      const result = await gmailService.createLabel({
        name: 'Duplicate Label',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('Label already exists');
    });
  });
});
