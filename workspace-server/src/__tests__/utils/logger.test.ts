/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import * as path from 'node:path';

// Mock fs/promises module BEFORE any imports that use it
jest.mock('fs/promises');

describe('logger', () => {
  let consoleErrorSpy: any;
  let logToFile: (message: string) => void;
  let setLoggingEnabled: (enabled: boolean) => void;
  let fs: any;

  async function setupLogger(appendFileMock?: any) {
    jest.resetModules();
    jest.doMock('fs/promises', () => ({
      mkdir: jest.fn(() => Promise.resolve()),
      appendFile: appendFileMock || jest.fn(() => Promise.resolve()),
    }));

    fs = await import('node:fs/promises');
    const loggerModule = await import('../../utils/logger');
    logToFile = loggerModule.logToFile;
    setLoggingEnabled = loggerModule.setLoggingEnabled;
    setLoggingEnabled(true);
    jest.clearAllMocks();
  }

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Clear module cache to ensure fresh imports
    jest.resetModules();
    
    // Spy on console.error
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('module initialization', () => {
    it('should create log directory on module load', async () => {
      // Set up mocks
      jest.doMock('fs/promises', () => ({
        mkdir: jest.fn(() => Promise.resolve()),
        appendFile: jest.fn(() => Promise.resolve()),
      }));
      
      // Import the module (this triggers initialization)
      await import('../../utils/logger');
      
      // Get the mocked fs module
      fs = await import('node:fs/promises');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        { recursive: true }
      );
    });

    it('should handle directory creation errors gracefully', async () => {
      const mkdirError = new Error('Permission denied');
      
      // Set up mocks
      jest.doMock('fs/promises', () => ({
        mkdir: jest.fn(() => Promise.reject(mkdirError)),
        appendFile: jest.fn(() => Promise.resolve()),
      }));
      
      // Import the module
      await import('../../utils/logger');
      
      // Wait for async initialization
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Could not create log directory:',
        mkdirError
      );
    });
  });

  describe('logToFile', () => {
    beforeEach(async () => {
      await setupLogger();
    });

    it('should append message with timestamp to log file', async () => {
      const testMessage = 'Test log message';
      const mockDate = new Date('2024-01-01T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      logToFile(testMessage);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('server.log'),
        '2024-01-01T12:00:00.000Z - Test log message\n'
      );
    });

    it('should handle multiple log messages', async () => {
      logToFile('First message');
      logToFile('Second message');
      logToFile('Third message');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fs.appendFile).toHaveBeenCalledTimes(3);
      expect(fs.appendFile).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('server.log'),
        expect.stringContaining('First message')
      );
      expect(fs.appendFile).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('server.log'),
        expect.stringContaining('Second message')
      );
      expect(fs.appendFile).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('server.log'),
        expect.stringContaining('Third message')
      );
    });

    it('should log to console.error when file write fails', async () => {
      const writeError = new Error('Disk full');
      await setupLogger(jest.fn(() => Promise.reject(writeError)));
      
      logToFile('Failed write test');
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to write to log file:',
        writeError
      );
    });

    it('should format log message correctly', async () => {
      const mockDate = new Date('2024-12-25T18:30:45.123Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      
      logToFile('Holiday log entry');
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const expectedMessage = '2024-12-25T18:30:45.123Z - Holiday log entry\n';
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.any(String),
        expectedMessage
      );
    });

    it('should handle empty messages', async () => {
      const mockDate = new Date('2024-01-01T12:00:00.000Z');
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      logToFile('');
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('server.log'),
        '2024-01-01T12:00:00.000Z - \n'
      );
    });

    it('should handle special characters in messages', async () => {
      const specialMessage = 'Message with \n newline, \t tab, and "quotes"';
      
      logToFile(specialMessage);
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(fs.appendFile).toHaveBeenCalledWith(
        expect.stringContaining('server.log'),
        expect.stringContaining(specialMessage)
      );
    });

    it('should use correct log file path', async () => {
      logToFile('Path test');
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const callArgs = (fs.appendFile as jest.Mock).mock.calls[0];
      const logPath = callArgs[0] as string;
      
      expect(logPath).toContain('logs');
      expect(logPath).toContain('server.log');
      expect(path.isAbsolute(logPath)).toBe(true);
    });

    it('should not throw when appendFile fails', async () => {
      await setupLogger(jest.fn(() => Promise.reject(new Error('Write failed'))));
      
      // Should not throw
      expect(() => logToFile('Test message')).not.toThrow();
      
      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should not log when logging is disabled', () => {
      setLoggingEnabled(false);
      const testMessage = 'Test log message';
      
      logToFile(testMessage);
      
      expect(fs.appendFile).not.toHaveBeenCalled();
    });
  });
});
