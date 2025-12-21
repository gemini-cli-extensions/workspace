/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { jest } from '@jest/globals';
import { AuthManager } from '../../auth/AuthManager';
import { TasksService } from '../../services/TasksService';

// Mock the AuthManager
const mockGetTasksClient = jest.fn<() => Promise<any>>();
const mockAuthManager = {
  getTasksClient: mockGetTasksClient,
} as unknown as AuthManager;

describe('TasksService', () => {
  let tasksService: TasksService;
  let mockTasksClient: any;

  beforeEach(() => {
    mockTasksClient = {
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
    mockGetTasksClient.mockResolvedValue(mockTasksClient);
    tasksService = new TasksService(mockAuthManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTaskLists', () => {
    it('should list task lists', async () => {
      const mockResponse = {
        data: {
          items: [{ id: 'list1', title: 'My Tasks' }],
        },
      };
      mockTasksClient.tasklists.list.mockResolvedValue(mockResponse);

      const result = await tasksService.listTaskLists();

      expect(mockTasksClient.tasklists.list).toHaveBeenCalledWith({
        maxResults: undefined,
        pageToken: undefined,
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(mockResponse.data.items, null, 2) }],
      });
    });

    it('should pass pagination parameters', async () => {
      const mockResponse = { data: { items: [] } };
      mockTasksClient.tasklists.list.mockResolvedValue(mockResponse);

      await tasksService.listTaskLists({ maxResults: 10, pageToken: 'token' });

      expect(mockTasksClient.tasklists.list).toHaveBeenCalledWith({
        maxResults: 10,
        pageToken: 'token',
      });
    });
  });

  describe('listTasks', () => {
    it('should list tasks in a task list', async () => {
      const mockResponse = {
        data: {
          items: [{ id: 'task1', title: 'Buy milk' }],
        },
      };
      mockTasksClient.tasks.list.mockResolvedValue(mockResponse);

      const result = await tasksService.listTasks({ taskListId: 'list1', showAssigned: true });

      expect(mockTasksClient.tasks.list).toHaveBeenCalledWith({
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
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(mockResponse.data.items, null, 2) }],
      });
    });
  });

  describe('createTask', () => {
    it('should create a task', async () => {
      const mockResponse = {
        data: { id: 'task1', title: 'New Task' },
      };
      mockTasksClient.tasks.insert.mockResolvedValue(mockResponse);

      const result = await tasksService.createTask({
        taskListId: 'list1',
        title: 'New Task',
        notes: 'Some notes',
      });

      expect(mockTasksClient.tasks.insert).toHaveBeenCalledWith({
        tasklist: 'list1',
        requestBody: {
          title: 'New Task',
          notes: 'Some notes',
          due: undefined,
        },
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(mockResponse.data, null, 2) }],
      });
    });
  });

  describe('updateTask', () => {
    it('should update a task', async () => {
      const mockResponse = {
        data: { id: 'task1', title: 'Updated Task' },
      };
      mockTasksClient.tasks.patch.mockResolvedValue(mockResponse);

      const result = await tasksService.updateTask({
        taskListId: 'list1',
        taskId: 'task1',
        title: 'Updated Task',
      });

      expect(mockTasksClient.tasks.patch).toHaveBeenCalledWith({
        tasklist: 'list1',
        task: 'task1',
        requestBody: {
          title: 'Updated Task',
        },
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: JSON.stringify(mockResponse.data, null, 2) }],
      });
    });
  });

  describe('completeTask', () => {
    it('should mark a task as completed', async () => {
        const mockResponse = {
            data: { id: 'task1', title: 'Task 1', status: 'completed' }
        };
        mockTasksClient.tasks.patch.mockResolvedValue(mockResponse);

        await tasksService.completeTask({ taskListId: 'list1', taskId: 'task1' });

        expect(mockTasksClient.tasks.patch).toHaveBeenCalledWith({
            tasklist: 'list1',
            task: 'task1',
            requestBody: {
                status: 'completed',
            }
        });
    });
  });

  describe('deleteTask', () => {
    it('should delete a task', async () => {
      mockTasksClient.tasks.delete.mockResolvedValue({});

      const result = await tasksService.deleteTask({ taskListId: 'list1', taskId: 'task1' });

      expect(mockTasksClient.tasks.delete).toHaveBeenCalledWith({
        tasklist: 'list1',
        task: 'task1',
      });
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Task task1 deleted successfully from list list1.' }],
      });
    });
  });
});
