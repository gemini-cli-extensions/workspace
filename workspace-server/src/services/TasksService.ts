/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { tasks_v1 } from 'googleapis';
import { AuthManager } from '../auth/AuthManager';

export class TasksService {
  private authManager: AuthManager;

  constructor(authManager: AuthManager) {
    this.authManager = authManager;
  }

  /**
   * Lists the authenticated user's task lists.
   */
  listTaskLists = async (params: { maxResults?: number; pageToken?: string } = {}) => {
    const tasks = await this.authManager.getTasksClient();
    const response = await tasks.tasklists.list({
      maxResults: params.maxResults,
      pageToken: params.pageToken,
    });

    return {
        content: [{
            type: "text" as const,
            text: JSON.stringify(response.data.items || [], null, 2)
        }]
    };
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
    const tasks = await this.authManager.getTasksClient();
    const response = await tasks.tasks.list({
      tasklist: params.taskListId,
      showCompleted: params.showCompleted,
      showDeleted: params.showDeleted,
      showHidden: params.showHidden,
      showAssigned: params.showAssigned,
      maxResults: params.maxResults,
      pageToken: params.pageToken,
      dueMin: params.dueMin,
      dueMax: params.dueMax,
    });

    return {
        content: [{
            type: "text" as const,
            text: JSON.stringify(response.data.items || [], null, 2)
        }]
    };
  };

  /**
   * Creates a new task in the specified task list.
   */
  createTask = async (params: {
    taskListId: string;
    title: string;
    notes?: string;
    due?: string; // RFC 3339 timestamp
  }) => {
    const tasks = await this.authManager.getTasksClient();
    const requestBody: tasks_v1.Schema$Task = {
      title: params.title,
      ...(params.notes !== undefined && { notes: params.notes }),
      ...(params.due !== undefined && { due: params.due }),
    };

    const response = await tasks.tasks.insert({
      tasklist: params.taskListId,
      requestBody,
    });

    return {
        content: [{
            type: "text" as const,
            text: JSON.stringify(response.data, null, 2)
        }]
    };
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
    const tasks = await this.authManager.getTasksClient();
    
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

    return {
        content: [{
            type: "text" as const,
            text: JSON.stringify(response.data, null, 2)
        }]
    };
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
    const tasks = await this.authManager.getTasksClient();
    await tasks.tasks.delete({
      tasklist: params.taskListId,
      task: params.taskId,
    });

    return {
        content: [{
            type: "text" as const,
            text: `Task ${params.taskId} deleted successfully from list ${params.taskListId}.`
        }]
    };
  };
}
