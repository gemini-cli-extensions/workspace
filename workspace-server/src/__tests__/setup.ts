/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test setup file for Jest
// This file runs before all tests
import { jest } from '@jest/globals';

// Mock console methods to reduce noise in test output
global.console = {
  ...console,
  // Keep errors and warnings
  error: jest.fn(console.error),
  warn: jest.fn(console.warn),
  // Silence other logs during tests unless explicitly needed
  log: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests if needed
jest.setTimeout(10000);

// Clean up after all tests
afterAll(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});