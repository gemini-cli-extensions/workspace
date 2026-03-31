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
import { TasksService } from '../../services/TasksService';
import { AuthManager } from '../../auth/AuthManager';
import { google } from 'googleapis';

// Mock the googleapis module
jest.mock('googleapis');
jest.mock('../../utils/logger');

describe('TasksService', () => {
  let tasksService: TasksService;
  let mockAuthManager: jest.Mocked<AuthManager>;
  let mockTasksAPI: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAuthManager = {
      getAuthenticatedClient: jest.fn(),
    } as any;

    mockTasksAPI = {
      tasklists: {
        list: jest.fn(),
      },
      tasks: {
        list: jest.fn(),
        insert: jest.fn(),
        patch: jest.fn(),
        delete: jest.fn(),
      },
    };

    (google.tasks as jest.Mock) = jest.fn().mockReturnValue(mockTasksAPI);

    tasksService = new TasksService(mockAuthManager);

    const mockAuthClient = { access_token: 'test-token' };
    mockAuthManager.getAuthenticatedClient.mockResolvedValue(
      mockAuthClient as any,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('listTaskLists', () => {
    it('should list task lists', async () => {
      const mockItems = [{ id: 'list1', title: 'My Tasks' }];
      mockTasksAPI.tasklists.list.mockResolvedValue({
        data: { items: mockItems },
      });

      const result = await tasksService.listTaskLists();

      expect(mockTasksAPI.tasklists.list).toHaveBeenCalledWith({
        maxResults: undefined,
        pageToken: undefined,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({ items: mockItems });
    });

    it('should pass pagination parameters', async () => {
      mockTasksAPI.tasklists.list.mockResolvedValue({
        data: { items: [] },
      });

      await tasksService.listTaskLists({ maxResults: 10, pageToken: 'token' });

      expect(mockTasksAPI.tasklists.list).toHaveBeenCalledWith({
        maxResults: 10,
        pageToken: 'token',
      });
    });

    it('should return empty array when no items', async () => {
      mockTasksAPI.tasklists.list.mockResolvedValue({
        data: {},
      });

      const result = await tasksService.listTaskLists();

      expect(JSON.parse(result.content[0].text)).toEqual({});
    });

    it('should handle API errors gracefully', async () => {
      mockTasksAPI.tasklists.list.mockRejectedValue(
        new Error('Tasks API failed'),
      );

      const result = await tasksService.listTaskLists();

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Tasks API failed',
      });
    });
  });

  describe('listTasks', () => {
    it('should list tasks in a task list', async () => {
      const mockItems = [{ id: 'task1', title: 'Buy milk' }];
      mockTasksAPI.tasks.list.mockResolvedValue({
        data: { items: mockItems },
      });

      const result = await tasksService.listTasks({
        taskListId: 'list1',
        showAssigned: true,
      });

      expect(mockTasksAPI.tasks.list).toHaveBeenCalledWith({
        tasklist: 'list1',
        showCompleted: undefined,
        showDeleted: undefined,
        showHidden: undefined,
        showAssigned: true,
        maxResults: undefined,
        pageToken: undefined,
        dueMin: undefined,
        dueMax: undefined,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({ items: mockItems });
    });

    it('should handle API errors gracefully', async () => {
      mockTasksAPI.tasks.list.mockRejectedValue(new Error('Tasks API failed'));

      const result = await tasksService.listTasks({ taskListId: 'list1' });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Tasks API failed',
      });
    });
  });

  describe('createTask', () => {
    it('should create a task with title only', async () => {
      const mockResponse = { id: 'task1', title: 'New Task' };
      mockTasksAPI.tasks.insert.mockResolvedValue({
        data: mockResponse,
      });

      const result = await tasksService.createTask({
        taskListId: 'list1',
        title: 'New Task',
      });

      expect(mockTasksAPI.tasks.insert).toHaveBeenCalledWith({
        tasklist: 'list1',
        requestBody: {
          title: 'New Task',
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should create a task with notes and due date', async () => {
      const mockResponse = {
        id: 'task1',
        title: 'New Task',
        notes: 'Some notes',
        due: '2024-01-15T12:00:00Z',
      };
      mockTasksAPI.tasks.insert.mockResolvedValue({
        data: mockResponse,
      });

      const result = await tasksService.createTask({
        taskListId: 'list1',
        title: 'New Task',
        notes: 'Some notes',
        due: '2024-01-15T12:00:00Z',
      });

      expect(mockTasksAPI.tasks.insert).toHaveBeenCalledWith({
        tasklist: 'list1',
        requestBody: {
          title: 'New Task',
          notes: 'Some notes',
          due: '2024-01-15T12:00:00Z',
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should handle API errors gracefully', async () => {
      mockTasksAPI.tasks.insert.mockRejectedValue(
        new Error('Tasks API failed'),
      );

      const result = await tasksService.createTask({
        taskListId: 'list1',
        title: 'New Task',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Tasks API failed',
      });
    });
  });

  describe('updateTask', () => {
    it('should update a task', async () => {
      const mockResponse = { id: 'task1', title: 'Updated Task' };
      mockTasksAPI.tasks.patch.mockResolvedValue({
        data: mockResponse,
      });

      const result = await tasksService.updateTask({
        taskListId: 'list1',
        taskId: 'task1',
        title: 'Updated Task',
      });

      expect(mockTasksAPI.tasks.patch).toHaveBeenCalledWith({
        tasklist: 'list1',
        task: 'task1',
        requestBody: {
          title: 'Updated Task',
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });

    it('should handle API errors gracefully', async () => {
      mockTasksAPI.tasks.patch.mockRejectedValue(new Error('Tasks API failed'));

      const result = await tasksService.updateTask({
        taskListId: 'list1',
        taskId: 'task1',
        title: 'Updated Task',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Tasks API failed',
      });
    });
  });

  describe('completeTask', () => {
    it('should mark a task as completed', async () => {
      const mockResponse = {
        id: 'task1',
        title: 'Task 1',
        status: 'completed',
      };
      mockTasksAPI.tasks.patch.mockResolvedValue({
        data: mockResponse,
      });

      const result = await tasksService.completeTask({
        taskListId: 'list1',
        taskId: 'task1',
      });

      expect(mockTasksAPI.tasks.patch).toHaveBeenCalledWith({
        tasklist: 'list1',
        task: 'task1',
        requestBody: {
          status: 'completed',
        },
      });
      expect(JSON.parse(result.content[0].text)).toEqual(mockResponse);
    });
  });

  describe('deleteTask', () => {
    it('should delete a task', async () => {
      mockTasksAPI.tasks.delete.mockResolvedValue({});

      const result = await tasksService.deleteTask({
        taskListId: 'list1',
        taskId: 'task1',
      });

      expect(mockTasksAPI.tasks.delete).toHaveBeenCalledWith({
        tasklist: 'list1',
        task: 'task1',
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        message: 'Task task1 deleted successfully from list list1.',
      });
    });

    it('should handle API errors gracefully', async () => {
      mockTasksAPI.tasks.delete.mockRejectedValue(
        new Error('Tasks API failed'),
      );

      const result = await tasksService.deleteTask({
        taskListId: 'list1',
        taskId: 'task1',
      });

      expect(JSON.parse(result.content[0].text)).toEqual({
        error: 'Tasks API failed',
      });
    });
  });
});
