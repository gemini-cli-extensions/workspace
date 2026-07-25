/**
 * @fileoverview Type definitions for ArtifactAgent
 *
 * Provides type-safe interfaces and Zod schemas for Git-native versioned storage
 * with Cloudflare Artifacts integration.
 */

import { z } from "zod";

/**
 * Parameters for creating/updating a file in Artifacts
 */
export const writeFileSchema = z.object({
  path: z.string().describe("File path within the repository"),
  content: z.string().describe("File content"),
  commitMessage: z.string().describe("Commit message describing the change"),
});

export type WriteFileParams = z.infer<typeof writeFileSchema>;

/**
 * Parameters for reading a file from Artifacts
 */
export const readFileSchema = z.object({
  path: z.string().describe("File path to read"),
  ref: z.string().optional().describe("Git ref (commit hash, branch, tag) to read from"),
});

export type ReadFileParams = z.infer<typeof readFileSchema>;

/**
 * Parameters for getting file history
 */
export const getHistorySchema = z.object({
  path: z.string().describe("File path to get history for"),
  limit: z.number().optional().default(10).describe("Maximum number of commits to return"),
});

export type GetHistoryParams = z.infer<typeof getHistorySchema>;

/**
 * Parameters for reverting to a previous version
 */
export const revertSchema = z.object({
  path: z.string().describe("File path to revert"),
  commitHash: z.string().describe("Commit hash to revert to"),
});

export type RevertParams = z.infer<typeof revertSchema>;

/**
 * Git commit information
 */
export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  parentHash?: string;
}

/**
 * File diff information
 */
export interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  additions: number;
  deletions: number;
  commitHash: string;
}

/**
 * Repository state
 */
export interface RepositoryState {
  currentBranch: string;
  lastCommitHash?: string;
  totalCommits: number;
  files: Map<string, string>; // path -> latest content
}

/**
 * Agent state for Artifacts tracking
 */
export interface ArtifactAgentState {
  repositoryId: string;
  totalCommits: number;
  totalFiles: number;
  lastCommitHash?: string;
  lastCommitMessage?: string;
}
