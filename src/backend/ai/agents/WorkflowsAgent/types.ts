/**
 * @fileoverview Type definitions for WorkflowsAgent
 *
 * Provides type-safe interfaces and Zod schemas for durable workflow execution
 * with progress tracking and step-based orchestration.
 */

import { z } from "zod";

/**
 * Workflow step status
 */
export type StepStatus = "pending" | "running" | "completed" | "failed";

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  id: string;
  name: string;
  status: StepStatus;
  progress: number; // 0-100
  startTime?: number;
  endTime?: number;
  error?: string;
}

/**
 * Workflow execution state
 */
export interface WorkflowState {
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  overallProgress: number; // 0-100
  steps: WorkflowStep[];
  startTime: number;
  endTime?: number;
  error?: string;
}

/**
 * Parameters for starting an audio transcription workflow
 */
export const transcribeAudioSchema = z.object({
  audioUrl: z.string().url().describe("URL or R2 key for the audio file"),
  language: z.string().optional().default("en").describe("Audio language code"),
  includeVectorization: z
    .boolean()
    .optional()
    .default(true)
    .describe("Vectorize transcription for semantic search"),
});

export type TranscribeAudioParams = z.infer<typeof transcribeAudioSchema>;

/**
 * Parameters for data processing workflow
 */
export const processDataSchema = z.object({
  dataUrl: z.string().url().describe("URL or R2 key for the data file"),
  format: z.enum(["csv", "json", "xml"]).describe("Data format"),
  transformations: z.array(z.string()).optional().describe("Transformation steps to apply"),
});

export type ProcessDataParams = z.infer<typeof processDataSchema>;

/**
 * Progress update from workflow
 */
export interface ProgressUpdate {
  step: string;
  percent: number;
  message?: string;
}

/**
 * Server-authoritative state synced to every connected WebSocket client via
 * `setState`. A subscribed UI watches `activeWorkflow` advance step-by-step in
 * real time, plus the latest discrete progress event.
 */
export interface WorkflowsSyncState {
  /** The workflow currently executing (or last executed), or null on cold start. */
  activeWorkflow: WorkflowState | null;
  /** The most recent progress event emitted by the running workflow. */
  lastProgress: ProgressUpdate | null;
}

/**
 * Workflow result
 */
export interface WorkflowResult {
  workflowId: string;
  status: "completed" | "failed";
  result?: any;
  error?: string;
  totalDuration: number;
}
