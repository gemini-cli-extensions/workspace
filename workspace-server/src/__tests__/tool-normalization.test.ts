/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { jest } from '@jest/globals';
import { applyToolNameNormalization } from '../utils/tool-normalization';

describe('Tool Name Normalization', () => {
  it('should normalize dots to underscores when useDotNames is false', () => {
    const mockRegisterTool = jest.fn();
    const server = { registerTool: mockRegisterTool } as unknown as McpServer;

    applyToolNameNormalization(server, false);
    server.registerTool(
      'test.tool',
      { inputSchema: z.object({}) },
      async () => ({ content: [] }),
    );

    expect(mockRegisterTool).toHaveBeenCalledWith(
      'test_tool',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('should preserve dots when useDotNames is true', () => {
    const mockRegisterTool = jest.fn();
    const server = { registerTool: mockRegisterTool } as unknown as McpServer;

    applyToolNameNormalization(server, true);
    server.registerTool(
      'test.tool',
      { inputSchema: z.object({}) },
      async () => ({ content: [] }),
    );

    expect(mockRegisterTool).toHaveBeenCalledWith(
      'test.tool',
      expect.any(Object),
      expect.any(Function),
    );
  });
});
