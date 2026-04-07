/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveFeatures } from '../features/index';

/**
 * OAuth scopes required by the Google Workspace MCP server.
 *
 * Dynamically computed from the feature configuration registry,
 * respecting WORKSPACE_FEATURE_OVERRIDES and default states.
 *
 * Shared between the MCP server and the headless login CLI.
 */
export const SCOPES: string[] = resolveFeatures(
  undefined,
  process.env['WORKSPACE_FEATURE_OVERRIDES'],
).requiredScopes;
