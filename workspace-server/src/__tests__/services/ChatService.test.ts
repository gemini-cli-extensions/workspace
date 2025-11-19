/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ChatService } from '../../services/ChatService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('ChatService', () => {
  let chatService: ChatService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockChatAPI: any;
  let mockPeopleAPI: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Create mock AuthManager
    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    // Create mock Chat API
    mockChatAPI = {
      spaces: {
        list: jest.fn(),
        setup: jest.fn(),
        messages: {
          create: jest.fn(),
          list: jest.fn(),
        },
        members: {
          list: jest.fn(),
        },
      },
    };

    // Create mock People API
    mockPeopleAPI = {
      people: {
        get: jest.fn(),
        searchContacts: jest.fn(),
      },
    };

    // Mock the google constructors
    (google.chat as jest.Mock) = jest.fn().mockReturnValue(mockChatAPI);
    (google.people as jest.Mock) = jest.fn().mockReturnValue(mockPeopleAPI);

    // Create ChatService instance
    chatService = new ChatService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(mockAuthClient as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listSpaces', () => {
    it('should list all chat spaces', async () => {
      const mockSpaces = [
        { name: 'spaces/space1', displayName: 'Team Chat' },
        { name: 'spaces/space2', displayName: 'Project Discussion' },
      ];

      mockChatAPI.spaces.list.mockResolvedValue({
        data: {
          spaces: mockSpaces,
        },
      });

      const result = await chatService.listSpaces();

      expect(mockChatAPI.spaces.list).toHaveBeenCalledWith({});
      expect(JSON.parse(result.content[0].text)).toEqual(mockSpaces);
    });

    it('should handle empty spaces list', async () => {
      mockChatAPI.spaces.list.mockResolvedValue({
        data: {
          spaces: [],
        },
      });

      const result = await chatService.listSpaces();

      expect(JSON.parse(result.content[0].text)).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      const apiError = new Error('Chat API failed');
      mockChatAPI.spaces.list.mockRejectedValue(apiError);

      const result = await chatService.listSpaces();

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('An error occurred while listing chat spaces.');
      expect(response.details).toBe('Chat API failed');
    });
  });

  describe('sendMessage', () => {
    it('should send a message to a space', async () => {
      const mockResponse = {
        name: 'spaces/space1/messages/msg1',
        text: 'Hello, team!',
        createTime: '2024-01-01T00:00:00Z',
      };

      mockChatAPI.spaces.messages.create.mockResolvedValue({
        data: mockResponse,
      });

      const result = await chatService.sendMessage({
        spaceName: 'spaces/space1',
        message: 'Hello, team!',
      });

      expect(mockChatAPI.spaces.messages.create).toHaveBeenCalledWith({
        parent: 'spaces/space1',
        requestBody: {
          text: 'Hello, team!',
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should handle message sending errors', async () => {
      const apiError = new Error('Failed to send message');
      mockChatAPI.spaces.messages.create.mockRejectedValue(apiError);

      const result = await chatService.sendMessage({
        spaceName: 'spaces/space1',
        message: 'Test message',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('An error occurred while sending the message.');
      expect(response.details).toBe('Failed to send message');
    });
  });

  describe('findSpaceByName', () => {
    it('should find spaces by display name', async () => {
      const mockSpaces = [
        { name: 'spaces/space1', displayName: 'Team Chat' },
        { name: 'spaces/space2', displayName: 'Project Discussion' },
        { name: 'spaces/space3', displayName: 'Team Chat' },
      ];

      mockChatAPI.spaces.list.mockResolvedValue({
        data: {
          spaces: mockSpaces,
          nextPageToken: null,
        },
      });

      const result = await chatService.findSpaceByName({ displayName: 'Team Chat' });

      expect(mockChatAPI.spaces.list).toHaveBeenCalled();
      const foundSpaces = JSON.parse(result.content[0].text);
      expect(foundSpaces).toHaveLength(2);
      expect(foundSpaces[0].displayName).toBe('Team Chat');
      expect(foundSpaces[1].displayName).toBe('Team Chat');
    });

    it('should handle pagination when searching for spaces', async () => {
      const mockSpacesPage1 = [
        { name: 'spaces/space1', displayName: 'Other Chat' },
        { name: 'spaces/space2', displayName: 'Another Chat' },
      ];
      const mockSpacesPage2 = [
        { name: 'spaces/space3', displayName: 'Team Chat' },
      ];

      mockChatAPI.spaces.list
        .mockResolvedValueOnce({
          data: {
            spaces: mockSpacesPage1,
            nextPageToken: 'page2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            spaces: mockSpacesPage2,
            nextPageToken: null,
          },
        });

      const result = await chatService.findSpaceByName({ displayName: 'Team Chat' });

      expect(mockChatAPI.spaces.list).toHaveBeenCalledTimes(2);
      const foundSpaces = JSON.parse(result.content[0].text);
      expect(foundSpaces).toHaveLength(1);
      expect(foundSpaces[0].displayName).toBe('Team Chat');
    });

    it('should return error when space not found', async () => {
      mockChatAPI.spaces.list.mockResolvedValue({
        data: {
          spaces: [
            { name: 'spaces/space1', displayName: 'Other Chat' },
          ],
        },
      });

      const result = await chatService.findSpaceByName({ displayName: 'Non-existent Chat' });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('No space found with display name: Non-existent Chat');
    });
  });

  describe('getMessages', () => {
    it('should list messages from a space', async () => {
      const mockMessages = [
        { name: 'spaces/space1/messages/msg1', text: 'Hello' },
        { name: 'spaces/space1/messages/msg2', text: 'How are you?' },
      ];

      mockChatAPI.spaces.messages.list.mockResolvedValue({
        data: {
          messages: mockMessages,
          nextPageToken: 'next',
        },
      });

      const result = await chatService.getMessages({
        spaceName: 'spaces/space1',
        pageSize: 10,
      });

      expect(mockChatAPI.spaces.messages.list).toHaveBeenCalledWith({
        parent: 'spaces/space1',
        pageSize: 10,
        pageToken: undefined,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.messages).toEqual(mockMessages);
      expect(response.nextPageToken).toBe('next');
    });

    it('should filter unread messages when unreadOnly is true', async () => {
      const mockPerson = {
        data: {
          metadata: {
            sources: [
              { type: 'PROFILE', id: 'user123' },
            ],
          },
        },
      };

      const mockMembers = [
        {
          member: { name: 'users/user123' },
          lastReadTime: '2024-01-01T00:00:00Z',
        },
      ];

      const mockMessages = [
        { name: 'spaces/space1/messages/msg1', text: 'Unread message' },
      ];

      mockPeopleAPI.people.get.mockResolvedValue(mockPerson);
      mockChatAPI.spaces.members.list.mockResolvedValue({
        data: {
          memberships: mockMembers,
        },
      });
      mockChatAPI.spaces.messages.list.mockResolvedValue({
        data: {
          messages: mockMessages,
        },
      });

      const result = await chatService.getMessages({
        spaceName: 'spaces/space1',
        unreadOnly: true,
      });

      expect(mockPeopleAPI.people.get).toHaveBeenCalledWith({
        resourceName: 'people/me',
        personFields: 'metadata',
      });
      expect(mockChatAPI.spaces.messages.list).toHaveBeenCalledWith({
        parent: 'spaces/space1',
        filter: 'createTime > "2024-01-01T00:00:00Z"',
        pageSize: undefined,
        pageToken: undefined,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.messages).toEqual(mockMessages);
    });

    it('should handle case when user has no last read time', async () => {
      const mockPerson = {
        data: {
          metadata: {
            sources: [
              { type: 'PROFILE', id: 'user123' },
            ],
          },
        },
      };

      const mockMembers = [
        {
          member: { name: 'users/user123' },
          // No lastReadTime property
        },
      ];

      const mockMessages = [
        { name: 'spaces/space1/messages/msg1', text: 'All messages are unread' },
      ];

      mockPeopleAPI.people.get.mockResolvedValue(mockPerson);
      mockChatAPI.spaces.members.list.mockResolvedValue({
        data: {
          memberships: mockMembers,
        },
      });
      mockChatAPI.spaces.messages.list.mockResolvedValue({
        data: {
          messages: mockMessages,
        },
      });

      const result = await chatService.getMessages({
        spaceName: 'spaces/space1',
        unreadOnly: true,
      });

      // Should list all messages when no last read time
      expect(mockChatAPI.spaces.messages.list).toHaveBeenCalledWith({
        parent: 'spaces/space1',
        pageSize: undefined,
        pageToken: undefined,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.messages).toEqual(mockMessages);
    });
  });

  describe('sendDm', () => {
    it('should send a direct message to a user', async () => {
      const mockSpace = {
        name: 'spaces/dm123',
        spaceType: 'DIRECT_MESSAGE',
      };

      const mockMessage = {
        name: 'spaces/dm123/messages/msg1',
        text: 'Hello!',
      };

      mockChatAPI.spaces.setup.mockResolvedValue({
        data: mockSpace,
      });

      mockChatAPI.spaces.messages.create.mockResolvedValue({
        data: mockMessage,
      });

      const result = await chatService.sendDm({
        email: 'user@example.com',
        message: 'Hello!',
      });

      expect(mockChatAPI.spaces.setup).toHaveBeenCalledWith({
        requestBody: {
          space: {
            spaceType: 'DIRECT_MESSAGE',
          },
          memberships: [
            {
              member: {
                name: 'users/user@example.com',
                type: 'HUMAN',
              },
            },
          ],
        },
      });

      expect(mockChatAPI.spaces.messages.create).toHaveBeenCalledWith({
        parent: 'spaces/dm123',
        requestBody: {
          text: 'Hello!',
        },
      });

      const response = JSON.parse(result.content[0].text);
      expect(response).toEqual(mockMessage);
    });

    it('should handle DM sending errors', async () => {
      const apiError = new Error('Failed to setup DM space');
      mockChatAPI.spaces.setup.mockRejectedValue(apiError);

      const result = await chatService.sendDm({
        email: 'user@example.com',
        message: 'Test message',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('An error occurred while sending the DM.');
      expect(response.details).toBe('Failed to setup DM space');
    });
  });

  describe('findDmByEmail', () => {
    it('should find a DM space by user email using spaces.setup', async () => {
      const mockSpace = {
        name: 'spaces/dm123',
        spaceType: 'DIRECT_MESSAGE',
      };

      mockChatAPI.spaces.setup.mockResolvedValue({
        data: mockSpace,
      });

      const result = await chatService.findDmByEmail({ email: 'user@example.com' });

      expect(mockChatAPI.spaces.setup).toHaveBeenCalledWith({
        requestBody: {
          space: {
            spaceType: 'DIRECT_MESSAGE',
          },
          memberships: [
            {
              member: {
                name: 'users/user@example.com',
                type: 'HUMAN',
              },
            },
          ],
        },
      });

      const foundSpace = JSON.parse(result.content[0].text);
      expect(foundSpace).toEqual(mockSpace);
    });

    it('should return an error if spaces.setup fails', async () => {
      const apiError = new Error('Failed to setup DM space');
      mockChatAPI.spaces.setup.mockRejectedValue(apiError);

      const result = await chatService.findDmByEmail({ email: 'user@example.com' });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('An error occurred while finding the DM space.');
      expect(response.details).toBe('Failed to setup DM space');
    });
  });

  describe('createSpace', () => {
    it('should create a space and return the space data', async () => {
      const mockResponse = {
        name: 'spaces/space1',
        displayName: 'Test Space',
      };

      mockChatAPI.spaces.setup.mockResolvedValue({
        data: mockResponse,
      });

      const result = await chatService.setUpSpace({
        displayName: 'Test Space',
        userNames: ['users/123456', 'users/456789'],
      });

      expect(mockChatAPI.spaces.setup).toHaveBeenCalledWith({
        requestBody: {
          space: {
            spaceType: 'SPACE',
            displayName: 'Test Space',
          },
          memberships: [
            {
              member: {
                name: 'users/123456',
                type: 'HUMAN',
              },
            },
            {
              member: {
                name: 'users/456789',
                type: 'HUMAN',
              },
            },
          ],
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should handle space creation errors', async () => {
      const apiError = new Error('Failed to create space');
      mockChatAPI.spaces.setup.mockRejectedValue(apiError);

      const result = await chatService.setUpSpace({
        displayName: 'Test Space',
        userNames: ['users/123456'],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe('An error occurred while creating the space.');
      expect(response.details).toBe('Failed to create space');
    });
  });
});
