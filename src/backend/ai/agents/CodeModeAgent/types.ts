/**
 * @fileoverview Type definitions for CodeModeAgent
 *
 * Provides type-safe interfaces and Zod schemas for Code Mode Canvas operations,
 * including dynamic worker execution, sandbox configuration, and execution results.
 */

import { z } from "zod";

/**
 * Configuration for Dynamic Worker sandbox execution
 */
export const executionConfigSchema = z.object({
  code: z.string().describe("TypeScript code to execute in the sandbox"),
  timeout: z.number().optional().default(30000).describe("Execution timeout in milliseconds"),
  allowNetwork: z.boolean().optional().default(false).describe("Allow outbound network access"),
  compatibilityDate: z.string().optional().default("2026-05-25").describe("Workers compatibility date"),
});

export type ExecutionConfig = z.infer<typeof executionConfigSchema>;

/**
 * Result from code execution in Dynamic Worker
 */
export interface ExecutionResult {
  status: "success" | "error" | "timeout";
  output?: string;
  error?: string;
  executionTime: number;
  memoryUsage?: number;
}

/**
 * Agent state tracking execution history
 */
export interface CodeModeAgentState {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  lastExecutionTime?: number;
  averageExecutionTime: number;
}

/**
 * Tool parameters for executePlan
 */
export const executePlanSchema = z.object({
  code: z.string().describe("TypeScript execution plan to run in sandbox"),
  description: z.string().optional().describe("Human-readable description of what the code does"),
});

export type ExecutePlanParams = z.infer<typeof executePlanSchema>;
