/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { GmailService } from '../../services/GmailService';
import { AuthManager } from '../../auth/AuthManager';
import { MimeHelper } from '../../utils/MimeHelper';
import { google } from 'googleapis';

// Mock the modules
jest.mock('googleapis');
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
        },
      },
    };

    // Mock the google.gmail constructor
    (google.gmail as jest.Mock) = jest.fn().mockReturnValue(mockGmailAPI);

    // Create GmailService instance
    gmailService = new GmailService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
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
        })
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
        })
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
        })
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
            headers: [
              { name: 'Subject', value: 'Test' },
            ],
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

  describe('send', () => {
    beforeEach(async () => {
      // Mock MimeHelper
      (MimeHelper.createMimeMessage as jest.Mock) = jest.fn().mockReturnValue('base64encodedmessage');
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
        })
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
      (MimeHelper.createMimeMessage as jest.Mock) = jest.fn().mockReturnValue('base64encodedmessage');
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
});
