/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { tasks_v1, google } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';
import { logToFile } from '../utils/logger';
import { gaxiosOptions } from '../utils/GaxiosConfig';

export class TasksService {
  constructor(private authManager: AuthManager) {}

  private async getTasksClient(): Promise<tasks_v1.Tasks> {
    const auth = await this.authManager.getAuthenticatedClient();
    const options = { ...gaxiosOptions, auth };
    return google.tasks({ version: 'v1', ...options });
  }

  /**
   * Lists the authenticated user's task lists.
   */
  listTaskLists = async (
    params: { maxResults?: number; pageToken?: string } = {},
  ) => {
    logToFile('Listing task lists');
    try {
      const tasks = await this.getTasksClient();
      const response = await tasks.tasklists.list({
        ...(params.maxResults !== undefined && {
          maxResults: params.maxResults,
        }),
        ...(params.pageToken !== undefined && {
          pageToken: params.pageToken,
        }),
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during tasks.listLists: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  /**
   * Lists tasks in a specific task list.
   */
  listTasks = async (params: {
    taskListId: string;
    showCompleted?: boolean;
    showDeleted?: boolean;
    showHidden?: boolean;
    showAssigned?: boolean;
    maxResults?: number;
    pageToken?: string;
    dueMin?: string;
    dueMax?: string;
  }) => {
    logToFile(`Listing tasks in list: ${params.taskListId}`);
    try {
      const tasks = await this.getTasksClient();
      const response = await tasks.tasks.list({
        tasklist: params.taskListId,
        ...(params.showCompleted !== undefined && {
          showCompleted: params.showCompleted,
        }),
        ...(params.showDeleted !== undefined && {
          showDeleted: params.showDeleted,
        }),
        ...(params.showHidden !== undefined && {
          showHidden: params.showHidden,
        }),
        ...(params.showAssigned !== undefined && {
          showAssigned: params.showAssigned,
        }),
        ...(params.maxResults !== undefined && {
          maxResults: params.maxResults,
        }),
        ...(params.pageToken !== undefined && {
          pageToken: params.pageToken,
        }),
        ...(params.dueMin !== undefined && { dueMin: params.dueMin }),
        ...(params.dueMax !== undefined && { dueMax: params.dueMax }),
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during tasks.list: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  /**
   * Creates a new task in the specified task list.
   */
  createTask = async (params: {
    taskListId: string;
    title: string;
    notes?: string;
    due?: string;
  }) => {
    logToFile(`Creating task in list: ${params.taskListId}`);
    try {
      const tasks = await this.getTasksClient();
      const requestBody: tasks_v1.Schema$Task = {
        title: params.title,
        ...(params.notes !== undefined && { notes: params.notes }),
        ...(params.due !== undefined && { due: params.due }),
      };

      const response = await tasks.tasks.insert({
        tasklist: params.taskListId,
        requestBody,
      });

      logToFile(`Successfully created task: ${response.data.id}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during tasks.create: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  /**
   * Updates an existing task.
   */
  updateTask = async (params: {
    taskListId: string;
    taskId: string;
    title?: string;
    notes?: string;
    status?: 'needsAction' | 'completed';
    due?: string;
  }) => {
    logToFile(`Updating task ${params.taskId} in list: ${params.taskListId}`);
    try {
      const tasks = await this.getTasksClient();
      const requestBody: tasks_v1.Schema$Task = {
        ...(params.title !== undefined && { title: params.title }),
        ...(params.notes !== undefined && { notes: params.notes }),
        ...(params.status !== undefined && { status: params.status }),
        ...(params.due !== undefined && { due: params.due }),
      };

      const response = await tasks.tasks.patch({
        tasklist: params.taskListId,
        task: params.taskId,
        requestBody,
      });

      logToFile(`Successfully updated task: ${params.taskId}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(response.data),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during tasks.update: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };

  /**
   * Completes a task (convenience wrapper around update).
   */
  completeTask = async (params: { taskListId: string; taskId: string }) => {
    return this.updateTask({
      taskListId: params.taskListId,
      taskId: params.taskId,
      status: 'completed',
    });
  };

  /**
   * Deletes a task.
   */
  deleteTask = async (params: { taskListId: string; taskId: string }) => {
    logToFile(`Deleting task ${params.taskId} from list: ${params.taskListId}`);
    try {
      const tasks = await this.getTasksClient();
      await tasks.tasks.delete({
        tasklist: params.taskListId,
        task: params.taskId,
      });

      logToFile(`Successfully deleted task: ${params.taskId}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              message: `Task ${params.taskId} deleted successfully from list ${params.taskListId}.`,
            }),
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logToFile(`Error during tasks.delete: ${errorMessage}`);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: errorMessage }),
          },
        ],
      };
    }
  };
}
